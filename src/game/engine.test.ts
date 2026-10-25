import { describe, expect, it } from 'vitest'
import {
  createRunGame,
  forceMonsterChase,
  forceSpawnNet,
  forceTriggerNet,
  updateGame
} from './engine'
import { applyRunResult, tryUnlockNext } from '../storage'
import { createDefaultSave } from '../data'
import type { GameConfig, GameInput, RunResult } from '../types'

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

describe('naisurf game engine', () => {
  it('creates the same fixed time-trial route for the same seed', () => {
    const first = createRunGame({ ...config, mode: 'timeTrial', seed: 2 })
    const second = createRunGame({ ...config, mode: 'timeTrial', seed: 999 })
    for (let index = 0; index < 100; index++) {
      updateGame(first, idleInput, 1 / 60)
      updateGame(second, idleInput, 1 / 60)
    }
    expect(first.objects.map((item) => [item.kind, item.x])).toEqual(
      second.objects.map((item) => [item.kind, item.x])
    )
  })

  it('captures only the current chasing monster and awards ten milk coins', () => {
    const game = createRunGame(config)
    forceMonsterChase(game)
    expect(game.monster.state).toBe('chasing')
    forceTriggerNet(game)
    updateGame(game, idleInput, 1 / 60)

    expect(game.monster.state).toBe('captured')
    expect(game.capturedMonsters).toBe(1)
    expect(game.earnedMilk).toBeGreaterThanOrEqual(10)
    expect(game.net.state).toBe('spent')
  })

  it('wakes a lurking monster only when the player passes close by', () => {
    const game = createRunGame(config)
    game.monster = {
      ...game.monster,
      state: 'lurking',
      x: 0.7,
      z: 5,
      nextSpawnDistance: Number.POSITIVE_INFINITY,
      nextSpawnTime: Number.POSITIVE_INFINITY
    }
    game.playerX = 0.68
    for (let index = 0; index < 30; index++) updateGame(game, idleInput, 1 / 60)
    expect(game.monster.state).toBe('chasing')
    expect(game.net.nextSpawnDistance).toBeGreaterThan(game.distance)
  })

  it('does not wake a lurking monster when the player stays far away', () => {
    const game = createRunGame(config)
    game.monster = {
      ...game.monster,
      state: 'lurking',
      x: 0.8,
      z: 5,
      nextSpawnDistance: Number.POSITIVE_INFINITY,
      nextSpawnTime: Number.POSITIVE_INFINITY
    }
    game.playerX = -0.9
    for (let index = 0; index < 30; index++) updateGame(game, idleInput, 1 / 60)
    expect(game.monster.state).toBe('escaped')
    expect(game.monster.nextSpawnDistance).toBeGreaterThan(300)
  })

  it('lets the monster keep chasing when the player misses the net', () => {
    const game = createRunGame(config)
    forceMonsterChase(game)
    game.playerX = -0.9
    game.monster.gap = 12
    stateSetNet(game, 0.8)
    updateGame(game, idleInput, 1 / 60)

    expect(game.monster.state).toBe('chasing')
    expect(game.capturedMonsters).toBe(0)
    expect(game.net.state).toBe('spent')
  })

  it('allows a new monster only after the prior captured monster is gone', () => {
    const game = createRunGame(config)
    forceMonsterChase(game)
    forceTriggerNet(game)
    updateGame(game, idleInput, 1 / 60)
    expect(game.monster.state).toBe('captured')

    game.monster.nextSpawnDistance = 0
    updateGame(game, idleInput, 1 / 60)
    expect(game.monster.state).toBe('lurking')
    expect(game.capturedMonsters).toBe(1)
  })

  it('shows no monster or net in non-chase modes during normal spawning', () => {
    const game = createRunGame({ ...config, mode: 'zigzag' })
    for (let index = 0; index < 600; index++) {
      updateGame(game, idleInput, 1 / 60)
    }
    expect(game.monster.state).toBe('escaped')
    expect(game.net.state).toBe('idle')
  })
})

describe('local progression', () => {
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
      recordValue: 900,
      recordLabel: '900 米',
      shouldCountRecord: false
    }
    const applied = applyRunResult(save, result)
    expect(applied.newRecord).toBe(false)
    expect(applied.save.records['endless:medium']).toBeUndefined()
  })
})

function stateSetNet(game: ReturnType<typeof createRunGame>, x: number): void {
  forceSpawnNet(game)
  game.net.x = x
  game.net.z = 0.01
  game.monster.gap = 12
}
