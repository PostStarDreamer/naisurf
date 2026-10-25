import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDefaultSave, DIFFICULTIES, getDifficulty } from '../data'
import {
  applyRunResult,
  creditCaptureReward,
  loadSave,
  tryUnlockNext
} from '../storage'
import type {
  Difficulty,
  GameConfig,
  GameInput,
  GameMode,
  RunResult,
  WorldObject
} from '../types'
import {
  INITIAL_LIVES,
  MIN_HAZARD_REACTION_SECONDS,
  MONSTER_WAKE_DISTANCE,
  PLAYER_ZONE,
  SAFE_CORRIDOR_WIDTH,
  createRunGame,
  forceMonsterChase,
  forceSpawnNet,
  forceTriggerNet,
  planHazardRow,
  updateGame
} from './engine'

const config: GameConfig = {
  mode: 'endless',
  difficulty: 'medium',
  character: 'egg',
  seed: 42
}

const idleInput: GameInput = {
  steer: 0,
  accelerate: false,
  brake: false,
  boost: false,
  pause: false
}

function quietRun(overrides: Partial<GameConfig> = {}) {
  const game = createRunGame({ ...config, ...overrides })
  game.nextHazardRowAt = Number.POSITIVE_INFINITY
  game.monster.nextSpawnDistance = Number.POSITIVE_INFINITY
  game.monster.nextSpawnTime = Number.POSITIVE_INFINITY
  return game
}

function addObject(
  game: ReturnType<typeof createRunGame>,
  kind: WorldObject['kind'],
  x: number,
  width = 0.16
): void {
  game.objects.push({
    id: game.nextEntityId++,
    kind,
    x,
    z: PLAYER_ZONE + 0.2,
    width,
    height: 0.25,
    active: true,
    wobble: 0,
    scored: false
  })
}

describe('naisurf game rules', () => {
  it('starts every mode and difficulty with exactly five lives', () => {
    const modes: GameMode[] = ['endless', 'timeTrial', 'zigzag', 'collector']
    for (const mode of modes) {
      for (const difficulty of ['easy', 'medium', 'hard'] as Difficulty[]) {
        const game = createRunGame({ ...config, mode, difficulty })
        expect(game.lives).toBe(INITIAL_LIVES)
        expect(game.maxLives).toBe(INITIAL_LIVES)
      }
    }
  })

  it('never damages an idle player without a collision', () => {
    const game = quietRun()
    for (let index = 0; index < 600; index++) updateGame(game, idleInput, 1 / 60)
    expect(game.lives).toBe(5)
    expect(game.lastDamage).toBeNull()
  })

  it('deducts one life only when the obstacle hitbox actually overlaps', () => {
    const hit = quietRun()
    addObject(hit, 'rock', 0, 0.2)
    updateGame(hit, idleInput, 0.05)
    expect(hit.lives).toBe(4)
    expect(hit.lastDamage).toBe('obstacle')

    const miss = quietRun()
    addObject(miss, 'rock', 0.5, 0.16)
    updateGame(miss, idleInput, 0.05)
    expect(miss.lives).toBe(5)
  })

  it('restores at most five lives and converts a full-health heart to three milk coins', () => {
    const wounded = quietRun()
    wounded.lives = 4
    addObject(wounded, 'heart', 0)
    updateGame(wounded, idleInput, 0.05)
    expect(wounded.lives).toBe(5)

    const full = quietRun()
    addObject(full, 'heart', 0)
    updateGame(full, idleInput, 0.05)
    expect(full.lives).toBe(5)
    expect(full.earnedMilk).toBe(3)
  })

  it('uses a shield for one obstacle but never for monster contact', () => {
    const shielded = quietRun()
    shielded.shield = 8
    addObject(shielded, 'buoy', 0, 0.16)
    updateGame(shielded, idleInput, 0.05)
    expect(shielded.lives).toBe(5)
    expect(shielded.shield).toBe(0)

    const monster = quietRun()
    monster.shield = 8
    monster.monster = {
      ...monster.monster,
      state: 'lurking',
      x: 0,
      z: PLAYER_ZONE + 0.1
    }
    updateGame(monster, idleInput, 0.05)
    expect(monster.lives).toBe(3)
    expect(monster.monster.state).toBe('recoiling')
    expect(monster.shield).toBeGreaterThan(7)
  })

  it('applies one non-stacking three-second slime debuff without damage', () => {
    const game = quietRun()
    addObject(game, 'slime', 0)
    updateGame(game, idleInput, 0.05)
    expect(game.debuffTimer).toBeGreaterThan(2.9)

    const normal = quietRun()
    game.playerX = 0
    normal.playerX = 0
    for (let index = 0; index < 45; index++) {
      updateGame(game, { ...idleInput, steer: 1 }, 1 / 60)
      updateGame(normal, { ...idleInput, steer: 1 }, 1 / 60)
    }
    expect(Math.abs(game.playerX)).toBeLessThan(Math.abs(normal.playerX))
    expect(game.lives).toBe(5)

    game.debuffTimer = 0.5
    game.playerX = 0
    game.playerVelocity = 0
    addObject(game, 'slime', 0)
    updateGame(game, idleInput, 0.05)
    expect(game.debuffTimer).toBeGreaterThan(2.9)
  })

  it('makes braking and acceleration clearly different', () => {
    const cruise = quietRun()
    const braking = quietRun()
    const accelerating = quietRun()
    for (let index = 0; index < 60; index++) {
      updateGame(cruise, idleInput, 1 / 60)
      updateGame(braking, { ...idleInput, brake: true }, 1 / 60)
      updateGame(accelerating, { ...idleInput, accelerate: true }, 1 / 60)
    }
    expect(braking.speed).toBeLessThan(cruise.speed * 0.78)
    expect(accelerating.speed).toBeGreaterThan(cruise.speed * 1.08)
  })

  it('raises speed over time according to the selected difficulty and then caps', () => {
    const gains: Record<Difficulty, number> = { easy: 0.1, medium: 0.18, hard: 0.26 }
    for (const difficulty of ['easy', 'medium', 'hard'] as Difficulty[]) {
      const game = quietRun({ difficulty })
      game.invulnerability = 999
      for (let index = 0; index < 60 * 150; index++) {
        updateGame(game, idleInput, 1 / 60)
      }
      expect(game.paceMultiplier).toBeCloseTo(1 + gains[difficulty], 5)
    }
  })
})

describe('monster and net state machine', () => {
  it('collides first, deducts two lives, and stops the current monster', () => {
    const game = quietRun()
    game.monster = {
      ...game.monster,
      state: 'lurking',
      x: 0,
      z: PLAYER_ZONE + 0.1
    }
    updateGame(game, idleInput, 0.05)
    expect(game.lives).toBe(3)
    expect(game.lastDamage).toBe('monster')
    expect(game.monster.state).toBe('recoiling')
  })

  it('wakes within the 0.5 range but does not wake outside it', () => {
    const near = quietRun()
    near.monster = {
      ...near.monster,
      state: 'lurking',
      x: MONSTER_WAKE_DISTANCE,
      z: PLAYER_ZONE + 0.1
    }
    updateGame(near, idleInput, 0.05)
    expect(near.monster.state).toBe('chasing')
    expect(near.lives).toBe(5)

    const far = quietRun()
    far.monster = {
      ...far.monster,
      state: 'lurking',
      x: MONSTER_WAKE_DISTANCE + 0.2,
      z: PLAYER_ZONE + 0.1
    }
    updateGame(far, idleInput, 0.05)
    expect(far.monster.state).toBe('escaped')
    expect(far.lives).toBe(5)
  })

  it('treats a zero chase distance as monster contact instead of instant game over', () => {
    const game = quietRun()
    forceMonsterChase(game)
    game.monster.gap = 0.001
    updateGame(game, idleInput, 1 / 60)
    expect(game.lives).toBe(3)
    expect(game.monster.state).toBe('recoiling')
    expect(game.ended).toBe(false)
  })

  it('cycles all four mouth animation frames while chasing', () => {
    const game = quietRun()
    forceMonsterChase(game)
    game.monster.gap = 50
    const frames = new Set<number>()
    for (let index = 0; index < 36; index++) {
      updateGame(game, idleInput, 1 / 60)
      frames.add(game.monster.animationFrame)
    }
    expect([...frames].sort()).toEqual([0, 1, 2, 3])
  })

  it('captures only the current chasing monster and awards ten milk coins once', () => {
    const game = quietRun()
    forceMonsterChase(game)
    forceTriggerNet(game)
    updateGame(game, idleInput, 1 / 60)
    expect(game.monster.state).toBe('captured')
    expect(game.capturedMonsters).toBe(1)
    expect(game.earnedMilk).toBe(10)
    expect(game.net.state).toBe('snapped')

    game.monster.nextSpawnDistance = 0
    for (let index = 0; index < 60; index++) updateGame(game, idleInput, 1 / 60)
    expect(game.monster.state).toBe('lurking')
    expect(game.capturedMonsters).toBe(1)
  })

  it('does not capture when the monster is 24 metres or farther from the player', () => {
    const game = quietRun()
    forceMonsterChase(game)
    forceSpawnNet(game)
    game.monster.gap = 25
    game.net.x = game.playerX
    game.net.z = 0.01
    updateGame(game, idleInput, 1 / 60)
    expect(game.monster.state).toBe('chasing')
    expect(game.capturedMonsters).toBe(0)
    expect(game.net.state).toBe('spent')
  })
})

describe('safe obstacle generation', () => {
  it('always keeps a 0.44-wide corridor with a reachable next centre', () => {
    for (const profile of DIFFICULTIES) {
      for (let seed = 1; seed <= 12; seed++) {
        let value = seed
        const rng = () => {
          value = (value * 1664525 + 1013904223) >>> 0
          return value / 4294967296
        }
        let previous = 0
        for (let row = 0; row < 300; row++) {
          const plan = planHazardRow(rng, previous, getDifficulty(profile.id).spacing)
          expect(plan.safeHalfWidth * 2).toBeGreaterThanOrEqual(SAFE_CORRIDOR_WIDTH)
          expect(Math.abs(plan.safeCenter - previous)).toBeLessThanOrEqual(0.700001)
          for (const hazard of plan.hazards) {
            const nearestEdge =
              Math.abs(hazard.x - plan.safeCenter) - hazard.width / 2
            expect(nearestEdge).toBeGreaterThanOrEqual(plan.safeHalfWidth)
          }
          previous = plan.safeCenter
        }
      }
    }
  })

  it('never schedules hazard rows closer than the minimum reaction window', () => {
    const game = quietRun()
    game.nextHazardRowAt = 0
    updateGame(game, idleInput, 1 / 60)
    expect(game.nextHazardRowAt - game.elapsed).toBeGreaterThanOrEqual(
      MIN_HAZARD_REACTION_SECONDS
    )
  })

  it('builds the same fixed time-trial route regardless of non-time-trial seed', () => {
    const first = createRunGame({ ...config, mode: 'timeTrial', seed: 2 })
    const second = createRunGame({ ...config, mode: 'timeTrial', seed: 999 })
    for (let index = 0; index < 180; index++) {
      updateGame(first, idleInput, 1 / 60)
      updateGame(second, idleInput, 1 / 60)
    }
    expect(first.objects.map((item) => [item.kind, item.x, item.z])).toEqual(
      second.objects.map((item) => [item.kind, item.x, item.z])
    )
  })
})

describe('local progression and scoring', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('preserves old local saves and adds the new guide version lazily', () => {
    const oldSave = {
      ...createDefaultSave(),
      guideVersion: undefined,
      milkCoins: 88,
      tutorialSeen: true,
      unlocked: ['egg', 'mouse']
    }
    vi.stubGlobal('localStorage', {
      getItem: () => JSON.stringify(oldSave)
    })
    const loaded = loadSave()
    expect(loaded.milkCoins).toBe(88)
    expect(loaded.unlocked).toEqual(['egg', 'mouse'])
    expect(loaded.guideVersion).toBe(0)
  })

  it('unlocks characters in the required order and only with enough coins', () => {
    let save = { ...createDefaultSave(), milkCoins: 800 }
    const mouse = tryUnlockNext(save)
    save = mouse.save
    expect(mouse.unlocked).toBe('mouse')
    expect(save.milkCoins).toBe(740)

    const chicken = tryUnlockNext(save)
    save = chicken.save
    expect(chicken.unlocked).toBe('chicken')

    const dog = tryUnlockNext(save)
    save = dog.save
    expect(dog.unlocked).toBe('dog')

    const frog = tryUnlockNext(save)
    expect(frog.unlocked).toBe('frog')
  })

  it('records higher distance scores and lower time-trial times', () => {
    const base = createDefaultSave()
    const endless: RunResult = {
      mode: 'endless',
      difficulty: 'medium',
      character: 'egg',
      score: 150,
      distance: 150,
      coins: 4,
      captures: 1,
      elapsed: 3,
      streak: 0,
      reason: 'caught',
      newRecord: false,
      earnedMilk: 15,
      captureMilk: 10,
      recordValue: 150,
      recordLabel: '150 米',
      shouldCountRecord: true
    }
    const first = applyRunResult(base, endless)
    expect(first.newRecord).toBe(true)
    expect(first.save.records['endless:medium']).toBe(150)

    const time: RunResult = {
      ...endless,
      mode: 'timeTrial',
      reason: 'finished',
      recordValue: 51.2,
      recordLabel: '51.20 秒'
    }
    const timed = applyRunResult(first.save, time)
    const faster = applyRunResult(timed.save, { ...time, recordValue: 49.8 })
    expect(faster.newRecord).toBe(true)
    expect(faster.save.records['timeTrial:medium']).toBe(49.8)
  })

  it('credits capture milk immediately without adding it again at settlement', () => {
    let save = createDefaultSave()
    save = creditCaptureReward(save, 10)
    expect(save.milkCoins).toBe(10)

    const result: RunResult = {
      mode: 'endless',
      difficulty: 'medium',
      character: 'egg',
      score: 200,
      distance: 200,
      coins: 2,
      captures: 1,
      elapsed: 8,
      streak: 0,
      reason: 'wrecked',
      newRecord: false,
      earnedMilk: 15,
      captureMilk: 10,
      recordValue: 200,
      recordLabel: '200 米',
      shouldCountRecord: true
    }
    const applied = applyRunResult(save, result)
    expect(applied.save.milkCoins).toBe(15)
  })

  it('does not store a record after the secret event', () => {
    const save = createDefaultSave()
    const result: RunResult = {
      mode: 'endless',
      difficulty: 'medium',
      character: 'frog',
      score: 900,
      distance: 900,
      coins: 20,
      captures: 0,
      elapsed: 40,
      streak: 0,
      reason: 'wrecked',
      newRecord: false,
      earnedMilk: 40,
      captureMilk: 0,
      recordValue: 900,
      recordLabel: '900 米',
      shouldCountRecord: false
    }
    const applied = applyRunResult(save, result)
    expect(applied.newRecord).toBe(false)
    expect(applied.save.records['endless:medium']).toBeUndefined()
  })
})
