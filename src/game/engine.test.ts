import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createDefaultSave,
  DIFFICULTIES,
  getCharacter,
  getDifficulty,
  getUnlockProgress
} from '../data'
import {
  applyWalletTransactions,
  applyRunResult,
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
  MAX_REVIVES,
  MIN_HAZARD_REACTION_SECONDS,
  MONSTER_WAKE_DISTANCE,
  PLAYER_ZONE,
  REVIVE_BASE_COST,
  SAFE_CORRIDOR_WIDTH,
  beginGamePlay,
  createRunGame,
  endDownedRun,
  forceMonsterChase,
  forceSpawnNet,
  forceTriggerNet,
  planHazardRow,
  reviveGame,
  snapshotGame,
  updateGame
} from './engine'

const config: GameConfig = {
  mode: 'endless',
  difficulty: 'medium',
  character: 'egg',
  seed: 42,
  runId: 'test-run'
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
  game.phase = 'playing'
  game.paused = false
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
    const modes: GameMode[] = ['endless', 'timeTrial', 'zigzag', 'extreme']
    for (const mode of modes) {
      for (const difficulty of ['easy', 'medium', 'hard', 'hell'] as Difficulty[]) {
        const game = createRunGame({ ...config, mode, difficulty })
        expect(game.lives).toBe(INITIAL_LIVES)
        expect(game.maxLives).toBe(INITIAL_LIVES)
      }
    }
  })

  it('uses the same immediate health rules in every mode and difficulty', () => {
    const modes: GameMode[] = ['endless', 'timeTrial', 'zigzag', 'extreme']
    for (const mode of modes) {
      for (const difficulty of ['easy', 'medium', 'hard', 'hell'] as Difficulty[]) {
        const obstacleHit = quietRun({ mode, difficulty })
        addObject(obstacleHit, 'rock', 0)
        updateGame(obstacleHit, idleInput, 0.05)
        expect(obstacleHit.lives).toBe(4)
        expect(obstacleHit.damageRevision).toBe(1)

        const monsterHit = quietRun({ mode, difficulty })
        monsterHit.monster = {
          ...monsterHit.monster,
          state: 'lurking',
          x: 0,
          z: PLAYER_ZONE + 0.1
        }
        updateGame(monsterHit, idleInput, 0.05)
        expect(monsterHit.lives).toBe(3)
        expect(monsterHit.damageRevision).toBe(1)
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
    expect(full.instantMilkEarned).toBe(3)
    expect(full.walletTransactions).toEqual([
      expect.objectContaining({ kind: 'heartBonus', amount: 3 })
    ])
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

  it('applies only one health change per collision window and exposes a revision', () => {
    const game = quietRun()
    addObject(game, 'rock', 0)
    addObject(game, 'rock', 0)
    updateGame(game, idleInput, 0.05)
    expect(game.lives).toBe(4)
    expect(game.damageRevision).toBe(1)
  })

  it('credits collected milk instantly through one wallet transaction', () => {
    const game = quietRun()
    addObject(game, 'coin', 0)
    updateGame(game, idleInput, 0.05)
    expect(game.coins).toBe(1)
    expect(game.instantMilkEarned).toBe(1)
    expect(game.walletTransactions).toEqual([
      expect.objectContaining({ kind: 'pickup', amount: 1 })
    ])
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

  it('keeps raising speed without a hard cap', () => {
    const gains: Record<Difficulty, number> = {
      easy: getDifficulty('easy').rampGain,
      medium: getDifficulty('medium').rampGain,
      hard: getDifficulty('hard').rampGain,
      hell: getDifficulty('hell').rampGain
    }
    for (const difficulty of ['easy', 'medium', 'hard', 'hell'] as Difficulty[]) {
      const game = quietRun({ difficulty })
      game.invulnerability = 999
      game.elapsed = 120
      for (let index = 0; index < 60 * 2; index++) {
        updateGame(game, idleInput, 1 / 60)
      }
      const atTwoMinutes = game.paceMultiplier
      expect(atTwoMinutes).toBeGreaterThan(1 + gains[difficulty] * 0.98)
      game.elapsed = 600
      updateGame(game, idleInput, 1 / 60)
      expect(game.paceMultiplier).toBeGreaterThan(atTwoMinutes)
      expect(game.paceMultiplier).toBeCloseTo(
        1 + gains[difficulty] * (600 / 120) ** 0.75,
        4
      )
    }
  })

  it('moves the world faster as the unbounded pace multiplier rises', () => {
    const early = quietRun()
    const late = quietRun()
    early.speed = early.baseSpeedForRun
    late.elapsed = 600
    late.speed = late.baseSpeedForRun * (1 + getDifficulty('medium').rampGain * (600 / 120) ** 0.75)
    const earlyStart = early.distance
    const lateStart = late.distance
    updateGame(early, idleInput, 0.05)
    updateGame(late, idleInput, 0.05)
    expect(late.distance - lateStart).toBeGreaterThan(early.distance - earlyStart)
  })

  it('freezes the game while loading and starts the trial clock only after countdown', () => {
    const trial = createRunGame({ ...config, mode: 'timeTrial' })
    updateGame(trial, idleInput, 1 / 60)
    expect(trial.phase).toBe('loading')
    expect(trial.elapsed).toBe(0)

    beginGamePlay(trial)
    expect(trial.phase).toBe('countdown')
    for (let index = 0; index < 120; index++) updateGame(trial, idleInput, 1 / 60)
    expect(trial.elapsed).toBe(0)
    expect(trial.countdown).toBeGreaterThan(0)

    for (let index = 0; index < 60; index++) updateGame(trial, idleInput, 1 / 60)
    expect(trial.phase).toBe('playing')
    updateGame(trial, idleInput, 1 / 60)
    expect(trial.elapsed).toBeGreaterThan(0)
  })

  it('allows three paid revives with three lives and one second of full protection', () => {
    const game = quietRun()
    for (let attempt = 1; attempt <= MAX_REVIVES; attempt++) {
      game.lives = 1
      game.invulnerability = 0
      const object = {
        id: game.nextEntityId++,
        kind: 'rock' as const,
        x: 0,
        z: PLAYER_ZONE + 0.2,
        width: 0.16,
        height: 0.25,
        active: true,
        wobble: 0,
        scored: false
      }
      game.objects.push(object)
      updateGame(game, idleInput, 0.05)
      expect(game.downed).toBe(true)
      expect(snapshotGame(game).reviveCost).toBe(REVIVE_BASE_COST * attempt)
      const frozenElapsed = game.elapsed
      updateGame(game, idleInput, 0.05)
      expect(game.elapsed).toBe(frozenElapsed)
      expect(reviveGame(game)).toBe(true)
      expect(game.lives).toBe(3)
      expect(game.revivesUsed).toBe(attempt)
      expect(game.reviveInvulnerability).toBe(1)
      game.reviveInvulnerability = 0
    }

    game.lives = 1
    game.invulnerability = 0
    game.objects.push({
      id: game.nextEntityId++,
      kind: 'rock',
      x: 0,
      z: PLAYER_ZONE + 0.2,
      width: 0.16,
      height: 0.25,
      active: true,
      wobble: 0,
      scored: false
    })
    updateGame(game, idleInput, 0.05)
    expect(game.downed).toBe(true)
    expect(snapshotGame(game).canRevive).toBe(false)
    expect(reviveGame(game)).toBe(false)
    endDownedRun(game)
    expect(game.ended).toBe(true)
    expect(game.result?.reason).toBe('wrecked')
  })

  it('blocks all damage during revive protection', () => {
    const game = quietRun()
    game.reviveInvulnerability = 1
    addObject(game, 'rock', 0)
    updateGame(game, idleInput, 0.05)
    expect(game.lives).toBe(5)

    game.monster = {
      ...game.monster,
      state: 'lurking',
      x: 0,
      z: PLAYER_ZONE + 0.1
    }
    updateGame(game, idleInput, 0.05)
    expect(game.lives).toBe(5)
    expect(game.monster.state).toBe('escaped')
  })

  it('exposes revive availability from mode, attempts and current wallet balance', () => {
    const game = quietRun()
    game.downed = true
    game.phase = 'downed'
    expect(snapshotGame(game, 99).reviveUnavailableReason).toBe('insufficient')
    expect(snapshotGame(game, 100).canRevive).toBe(true)
    game.revivesUsed = MAX_REVIVES
    expect(snapshotGame(game, 9999).reviveUnavailableReason).toBe('limit')
  })

  it('ends an extreme run immediately without offering revival', () => {
    const game = quietRun({ mode: 'extreme' })
    game.lives = 1
    addObject(game, 'rock', 0)
    updateGame(game, idleInput, 0.05)
    expect(game.lives).toBe(0)
    expect(game.downed).toBe(false)
    expect(game.ended).toBe(true)
    expect(game.phase).toBe('ended')
    expect(game.result?.reason).toBe('wrecked')
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

  it('wakes within the 0.62 range but does not wake outside it', () => {
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

  it('makes a slowed player easier to catch during a chase', () => {
    const normal = quietRun()
    const slowed = quietRun()
    for (const game of [normal, slowed]) {
      forceMonsterChase(game)
      game.monster.gap = 30
    }
    slowed.debuffTimer = 3
    for (let index = 0; index < 60; index++) {
      updateGame(normal, idleInput, 1 / 60)
      updateGame(slowed, idleInput, 1 / 60)
    }
    expect(slowed.monster.gap).toBeLessThan(normal.monster.gap)
  })

  it('cycles closed and open front frames while chasing', () => {
    const game = quietRun()
    forceMonsterChase(game)
    game.monster.gap = 50
    const frames = new Set<number>()
    for (let index = 0; index < 36; index++) {
      updateGame(game, idleInput, 1 / 60)
      frames.add(game.monster.animationFrame)
    }
    expect([...frames].sort()).toEqual([0, 1])
  })

  it('captures only the current chasing monster and awards ten milk coins once', () => {
    const game = quietRun()
    forceMonsterChase(game)
    forceTriggerNet(game)
    updateGame(game, idleInput, 1 / 60)
    expect(game.monster.state).toBe('captured')
    expect(game.capturedMonsters).toBe(1)
    expect(game.instantMilkEarned).toBe(10)
    expect(game.walletTransactions).toEqual([
      expect.objectContaining({ kind: 'capture', amount: 10 })
    ])
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
  it('keeps a 0.44-wide corridor reachable even with the worst base handling', () => {
    for (const profile of DIFFICULTIES) {
      let sawThreeOrMore = false
      for (let seed = 1; seed <= 64; seed++) {
        let value = seed
        const rng = () => {
          value = (value * 1664525 + 1013904223) >>> 0
          return value / 4294967296
        }
        let previous = 0
        for (let row = 0; row < 500; row++) {
          const difficulty = getDifficulty(profile.id)
          const plan = planHazardRow(rng, previous, difficulty)
          const requiredShift = Math.abs(plan.safeCenter - previous)
          const worstTurnSpeed = 1.52 * 0.95 * 0.8
          const reachTime = requiredShift / worstTurnSpeed + 1 / 8
          expect(plan.safeHalfWidth * 2).toBeGreaterThanOrEqual(SAFE_CORRIDOR_WIDTH)
          expect(Math.abs(plan.safeCenter - previous)).toBeLessThanOrEqual(0.700001)
          expect(reachTime).toBeLessThan(
            Math.max(MIN_HAZARD_REACTION_SECONDS, difficulty.rowWindow) * 0.9
          )
          expect(plan.hazards.length).toBeGreaterThanOrEqual(1)
          expect(plan.hazards.length).toBeLessThanOrEqual(4)
          sawThreeOrMore ||= plan.hazards.length >= 3
          expect(plan.items.length).toBeGreaterThanOrEqual(1)
          expect(plan.items.length).toBeLessThanOrEqual(2)
          for (const hazard of plan.hazards) {
            const nearestEdge =
              Math.abs(hazard.x - plan.safeCenter) - hazard.width / 2
            expect(nearestEdge).toBeGreaterThanOrEqual(plan.safeHalfWidth)
          }
          for (let left = 0; left < plan.hazards.length; left += 1) {
            for (let right = left + 1; right < plan.hazards.length; right += 1) {
              const first = plan.hazards[left]
              const second = plan.hazards[right]
              expect(Math.abs(first.x - second.x)).toBeGreaterThanOrEqual(
                first.width / 2 + second.width / 2 + 0.03
              )
            }
          }
          for (const item of plan.items) {
            for (const hazard of plan.hazards) {
              expect(Math.abs(item.x - hazard.x)).toBeGreaterThanOrEqual(
                item.width / 2 + hazard.width / 2 + 0.03
              )
            }
          }
          previous = plan.safeCenter
        }
      }
      if (profile.id === 'hard' || profile.id === 'hell') {
        expect(sawThreeOrMore).toBe(true)
      }
    }
  }, 30000)

  it('never schedules hazard rows closer than the minimum reaction window', () => {
    for (const difficulty of ['easy', 'medium', 'hard', 'hell'] as Difficulty[]) {
      const game = quietRun({ difficulty })
      game.nextHazardRowAt = 0
      updateGame(game, idleInput, 1 / 60)
      expect(game.nextHazardRowAt - game.elapsed).toBeGreaterThanOrEqual(
        Math.max(MIN_HAZARD_REACTION_SECONDS, getDifficulty(difficulty).rowWindow)
      )
    }
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
      unlocked: ['egg', 'mouse'],
      records: {
        'collector:medium': 999,
        'endless:medium': 321
      }
    }
    vi.stubGlobal('localStorage', {
      getItem: () => JSON.stringify(oldSave)
    })
    const loaded = loadSave()
    expect(loaded.milkCoins).toBe(88)
    expect(loaded.unlocked).toEqual(['egg', 'mouse'])
    expect(loaded.guideVersion).toBe(0)
    expect(loaded.recentTransactions).toEqual([])
    expect(loaded.records['collector:medium']).toBeUndefined()
    expect(loaded.records['endless:medium']).toBe(321)
  })

  it('unlocks characters in the required order and only with enough coins', () => {
    let save = {
      ...createDefaultSave(),
      milkCoins: 10000,
      totalRuns: 3,
      totalCaptures: 0
    }
    const mouse = tryUnlockNext(save)
    save = mouse.save
    expect(mouse.unlocked).toBe('mouse')
    expect(save.milkCoins).toBe(9820)

    expect(tryUnlockNext(save).reason).toBe('runs')
    save = { ...save, totalRuns: 8, totalCaptures: 4 }
    const chicken = tryUnlockNext(save)
    save = chicken.save
    expect(chicken.unlocked).toBe('chicken')

    save = { ...save, totalRuns: 15, totalCaptures: 8 }
    const dog = tryUnlockNext(save)
    save = dog.save
    expect(dog.unlocked).toBe('dog')

    save = { ...save, totalRuns: 24, totalCaptures: 16 }
    const frog = tryUnlockNext(save)
    expect(frog.unlocked).toBe('frog')
    expect(frog.save.milkCoins).toBe(7470)
  })

  it('requires both milestones and coins for locked characters', () => {
    const save = {
      ...createDefaultSave(),
      milkCoins: 1000,
      totalRuns: 8,
      totalCaptures: 3
    }
    const mouse = tryUnlockNext({
      ...save,
      totalRuns: 2
    })
    expect(mouse.reason).toBe('runs')

    const chicken = tryUnlockNext({
      ...save,
      unlocked: ['egg', 'mouse'],
      character: 'mouse'
    })
    expect(chicken.reason).toBe('captures')

    const noCoins = tryUnlockNext({
      ...save,
      milkCoins: 0,
      totalRuns: 3
    })
    expect(noCoins.reason).toBe('coins')
    expect(getUnlockProgress(save, getCharacter('chicken')).canUnlock).toBe(false)
  })

  it('applies wallet transactions once and rejects unaffordable deductions', () => {
    const initial = { ...createDefaultSave(), milkCoins: 100 }
    const first = applyWalletTransactions(initial, [
      { id: 'pickup-1', kind: 'pickup', amount: 1 },
      { id: 'heart-1', kind: 'heartBonus', amount: 3 },
      { id: 'capture-1', kind: 'capture', amount: 10 },
      { id: 'revive-1', kind: 'revive', amount: -100 }
    ])
    expect(first.balance).toBe(14)
    expect(first.save.totalCaptures).toBe(1)
    expect(first.appliedIds).toHaveLength(4)

    const duplicate = applyWalletTransactions(first.save, [
      { id: 'capture-1', kind: 'capture', amount: 10 }
    ])
    expect(duplicate.balance).toBe(14)
    expect(duplicate.save.totalCaptures).toBe(1)
    expect(duplicate.rejected[0].reason).toBe('duplicate')

    const insufficient = applyWalletTransactions(duplicate.save, [
      { id: 'revive-2', kind: 'revive', amount: -200 }
    ])
    expect(insufficient.balance).toBe(14)
    expect(insufficient.rejected[0].reason).toBe('insufficient')
  })

  it('records higher distance scores and lower time-trial times', () => {
    const base = createDefaultSave()
    const endless: RunResult = {
      runId: 'record-run-1',
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
      instantMilk: 10,
      settlementMilk: 5,
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
      runId: 'record-run-2',
      mode: 'timeTrial',
      reason: 'finished',
      recordValue: 51.2,
      recordLabel: '51.20 秒'
    }
    const timed = applyRunResult(first.save, time)
    const faster = applyRunResult(timed.save, {
      ...time,
      runId: 'record-run-3',
      recordValue: 49.8
    })
    expect(faster.newRecord).toBe(true)
    expect(faster.save.records['timeTrial:medium']).toBe(49.8)
  })

  it('credits capture milk immediately without adding it again at settlement', () => {
    let save = createDefaultSave()
    save = applyWalletTransactions(save, [
      { id: 'capture-immediate', kind: 'capture', amount: 10 }
    ]).save
    expect(save.milkCoins).toBe(10)
    expect(save.totalCaptures).toBe(1)

    const result: RunResult = {
      runId: 'capture-settle-run',
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
      instantMilk: 10,
      settlementMilk: 5,
      captureMilk: 10,
      recordValue: 200,
      recordLabel: '200 米',
      shouldCountRecord: true
    }
    const applied = applyRunResult(save, result)
    expect(applied.save.milkCoins).toBe(15)
    expect(applied.save.totalCaptures).toBe(1)
    const duplicateSettlement = applyRunResult(applied.save, result)
    expect(duplicateSettlement.save.milkCoins).toBe(15)
    expect(duplicateSettlement.save.totalRuns).toBe(applied.save.totalRuns)
  })

  it('does not store a record after the secret event', () => {
    const save = createDefaultSave()
    const result: RunResult = {
      runId: 'secret-run',
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
      instantMilk: 20,
      settlementMilk: 20,
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
