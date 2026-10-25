import { getDifficulty } from '../data'
import type {
  GameConfig,
  GameInput,
  GameSnapshot,
  GameState,
  MonsterState,
  RunResult,
  WorldObject
} from '../types'

export const VIEW_DISTANCE = 120
export const TIME_TRIAL_DISTANCE = 1200
export const PLAYER_ZONE = 2.2

export function mulberry32(seed: number): () => number {
  let value = seed >>> 0
  return () => {
    value += 0x6d2b79f5
    let next = value
    next = Math.imul(next ^ (next >>> 15), next | 1)
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61)
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296
  }
}

function randomBetween(rng: () => number, min: number, max: number): number {
  return min + rng() * (max - min)
}

function createRunResult(
  state: GameState,
  reason: RunResult['reason']
): RunResult {
  const config = state.config
  const recordValue =
    config.mode === 'timeTrial'
      ? Math.max(5, state.elapsed - state.coins * 0.35)
      : config.mode === 'zigzag'
        ? state.bestStreak
        : config.mode === 'collector'
          ? state.coins
          : state.distance

  const recordLabel =
    config.mode === 'timeTrial'
      ? `${recordValue.toFixed(2)} 秒`
      : config.mode === 'zigzag'
        ? `${recordValue} 连门`
        : config.mode === 'collector'
          ? `${recordValue} 滴`
          : `${Math.round(recordValue)} 米`

  const difficulty = getDifficulty(config.difficulty)
  const earnedMilk = Math.max(
    1,
    Math.round(
      (state.coins + Math.floor(state.distance / 22) + state.capturedMonsters * 10) *
        difficulty.reward
    )
  )

  return {
    mode: config.mode,
    difficulty: config.difficulty,
    character: config.character,
    score: recordValue,
    distance: state.distance,
    coins: state.coins,
    captures: state.capturedMonsters,
    elapsed: state.elapsed,
    streak: state.bestStreak,
    reason,
    newRecord: false,
    earnedMilk,
    recordValue,
    recordLabel,
    shouldCountRecord: !state.secretTriggered
  }
}

function finish(state: GameState, reason: RunResult['reason']): void {
  if (state.ended) return
  state.ended = true
  state.result = createRunResult(state, reason)
  state.flash = 1
}

function emptyMonster(): GameState['monster'] {
  return {
    state: 'escaped',
    x: 0,
    z: VIEW_DISTANCE,
    gap: 90,
    nextSpawnDistance: Number.POSITIVE_INFINITY,
    nextSpawnTime: Number.POSITIVE_INFINITY,
    age: 0
  }
}

function emptyNet(): GameState['net'] {
  return {
    state: 'idle',
    x: 0,
    z: VIEW_DISTANCE,
    side: 1,
    timer: 0,
    nextSpawnDistance: Number.POSITIVE_INFINITY,
    nextSpawnTime: Number.POSITIVE_INFINITY
  }
}

export function createGame(config: GameConfig): GameState {
  const rng = mulberry32(config.mode === 'timeTrial' ? 1337 : config.seed)
  const difficulty = getDifficulty(config.difficulty)
  const baseSpeed =
    26 * difficulty.speed * (config.reducedSpeed ? 0.85 : 1)
  const monster = emptyMonster()

  if (config.mode === 'endless') {
    monster.nextSpawnDistance = randomBetween(rng, 240, 320)
  } else if (config.mode === 'collector') {
    monster.nextSpawnTime = randomBetween(rng, 25, 35)
  }

  return {
    config,
    distance: 0,
    elapsed: 0,
    playerX: 0,
    playerVelocity: 0,
    speed: baseSpeed,
    baseSpeedForRun: baseSpeed,
    lives: difficulty.startLives,
    maxLives: difficulty.maxLives,
    shield: 0,
    invulnerability: 0,
    boostEnergy: config.character === 'dog' ? 10 : config.character === 'chicken' ? 22 : 25,
    boosting: false,
    score: 0,
    coins: 0,
    earnedMilk: 0,
    streak: 0,
    bestStreak: 0,
    objects: [],
    monster,
    net: emptyNet(),
    capturedMonsters: 0,
    paused: false,
    ended: false,
    nextEntityId: 1,
    spawnAccumulator: 0,
    nextGateAt: 58,
    nextMonsterPeriod: 0,
    secretEventActive: false,
    secretEventTimer: 0,
    secretTriggered: false,
    events: [],
    shake: 0,
    flash: 0,
    rng
  }
}

function createObject(
  state: GameState,
  kind: WorldObject['kind'],
  x: number,
  z = VIEW_DISTANCE,
  extra: Partial<WorldObject> = {}
): WorldObject {
  return {
    id: state.nextEntityId++,
    kind,
    x,
    z,
    width: kind === 'gate' ? 0.5 : kind === 'rock' ? 0.35 : 0.18,
    height: kind === 'gate' ? 0.8 : 0.25,
    active: true,
    wobble: state.rng() * Math.PI * 2,
    scored: false,
    ...extra
  }
}

function scheduleNextMonster(state: GameState, resetFromDistance = true): void {
  const mode = state.config.mode
  if (mode === 'endless') {
    state.monster.nextSpawnDistance =
      (resetFromDistance ? state.distance : 0) + randomBetween(state.rng, 380, 480)
    state.monster.nextSpawnTime = Number.POSITIVE_INFINITY
  } else if (mode === 'collector') {
    state.monster.nextSpawnTime = state.elapsed + randomBetween(state.rng, 40, 55)
    state.monster.nextSpawnDistance = Number.POSITIVE_INFINITY
  } else {
    state.monster.nextSpawnDistance = Number.POSITIVE_INFINITY
    state.monster.nextSpawnTime = Number.POSITIVE_INFINITY
  }
}

function startMonster(state: GameState): void {
  if (state.config.mode !== 'endless' && state.config.mode !== 'collector') return
  state.monster = {
    state: 'lurking',
    x: state.rng() > 0.5 ? randomBetween(state.rng, 0.58, 0.82) : -randomBetween(state.rng, 0.58, 0.82),
    z: VIEW_DISTANCE,
    gap: 46,
    nextSpawnDistance: Number.POSITIVE_INFINITY,
    nextSpawnTime: Number.POSITIVE_INFINITY,
    age: 0
  }
}

function triggerChase(state: GameState): void {
  state.monster.state = 'chasing'
  state.monster.gap = 38
  state.monster.age = 0
  state.net = {
    ...emptyNet(),
    nextSpawnDistance:
      state.config.mode === 'endless'
        ? state.distance + randomBetween(state.rng, 100, 160)
        : Number.POSITIVE_INFINITY,
    nextSpawnTime:
      state.config.mode === 'collector'
        ? state.elapsed + randomBetween(state.rng, 12, 18)
        : Number.POSITIVE_INFINITY
  }
  state.flash = 0.45
}

function missMonster(state: GameState): void {
  state.monster.state = 'escaped'
  scheduleNextMonster(state)
}

function scheduleNetAfterMiss(state: GameState, resetDistance: boolean): void {
  if (state.config.mode === 'endless') {
    state.net.nextSpawnDistance =
      (resetDistance ? state.distance : 0) + randomBetween(state.rng, 300, 420)
    state.net.nextSpawnTime = Number.POSITIVE_INFINITY
  } else if (state.config.mode === 'collector') {
    state.net.nextSpawnTime = state.elapsed + randomBetween(state.rng, 30, 40)
    state.net.nextSpawnDistance = Number.POSITIVE_INFINITY
  }
}

function captureMonster(state: GameState): void {
  state.monster.state = 'captured'
  state.monster.gap = 90
  state.net.state = 'spent'
  state.net.timer = 1.2
  state.capturedMonsters += 1
  state.earnedMilk += 10
  state.flash = 0.8
  state.events.push('capture')
  state.shake = state.secretEventActive ? 0 : 0.35
  scheduleNextMonster(state)
  scheduleNetAfterMiss(state, true)
}

function spawnObject(state: GameState): void {
  const mode = state.config.mode
  const difficulty = getDifficulty(state.config.difficulty)
  const roll = state.rng()
  let kind: WorldObject['kind']

  if (mode === 'collector') {
    kind =
      roll < 0.63
        ? 'coin'
        : roll < 0.78
          ? 'rock'
          : roll < 0.86
            ? 'buoy'
            : roll < 0.92
              ? 'heart'
              : roll < 0.97
                ? 'boost'
                : 'shield'
  } else {
    kind =
      roll < 0.31
        ? 'coin'
        : roll < 0.7
          ? state.rng() > 0.45
            ? 'rock'
            : 'buoy'
          : roll < 0.78
            ? 'surfer'
            : roll < 0.88
              ? 'coin'
              : roll < 0.94
                ? 'boost'
                : roll < 0.975
                  ? 'heart'
                  : 'shield'
  }

  const lane = randomBetween(state.rng, -0.88, 0.88)
  const item = kind === 'coin' || kind === 'heart' || kind === 'boost' || kind === 'shield'
  state.objects.push(
    createObject(state, kind, lane, VIEW_DISTANCE, {
      width: kind === 'rock' ? randomBetween(state.rng, 0.28, 0.42) : item ? 0.15 : 0.22,
      height: kind === 'rock' ? 0.4 : item ? 0.2 : 0.28
    })
  )

  if (!item && state.rng() < 0.3) {
    const secondX = lane > 0 ? randomBetween(state.rng, -0.9, -0.15) : randomBetween(state.rng, 0.15, 0.9)
    state.objects.push(
      createObject(state, state.rng() > 0.5 ? 'rock' : 'buoy', secondX, VIEW_DISTANCE, {
        width: 0.24,
        height: 0.32
      })
    )
  }

  state.spawnAccumulator = 0
  if (state.rng() < 0.32) state.spawnAccumulator = -randomBetween(state.rng, 2, 5) / difficulty.spacing
}

function currentRecordScore(state: GameState): number {
  if (state.config.mode === 'timeTrial') {
    return Math.max(5, state.elapsed - state.coins * 0.35)
  }
  if (state.config.mode === 'zigzag') return state.bestStreak
  if (state.config.mode === 'collector') return state.coins
  return state.distance
}

function handleObjectCrossing(state: GameState, object: WorldObject, input: GameInput): void {
  if (object.scored) return
  object.scored = true

  if (object.kind === 'gate') {
    const passed = Math.abs(state.playerX - object.x) <= object.width * 0.72
    if (passed) {
      state.streak += 1
      state.bestStreak = Math.max(state.bestStreak, state.streak)
    } else {
      state.streak = 0
    }
    return
  }

  const isItem =
    object.kind === 'coin' ||
    object.kind === 'heart' ||
    object.kind === 'boost' ||
    object.kind === 'shield'
  const magnet =
    state.config.character === 'mouse' ? (isItem ? 0.24 : 0.09) : isItem ? 0.18 : 0.08
  const playerHalfWidth = 0.12
  const overlapping = Math.abs(state.playerX - object.x) < object.width / 2 + playerHalfWidth + magnet

  if (!overlapping) return

  if (object.kind === 'coin') {
    object.active = false
    state.coins += 1
    state.earnedMilk += 1
    state.events.push('collect')
    if (state.config.mode === 'zigzag') state.streak += 0
    return
  }

  if (object.kind === 'heart') {
    object.active = false
    state.lives = Math.min(state.maxLives, state.lives + 1)
    state.events.push('heart')
    return
  }

  if (object.kind === 'boost') {
    object.active = false
    const gain = state.config.character === 'egg' ? 0.92 : 1
    state.boostEnergy = Math.min(100, state.boostEnergy + 30 * gain)
    state.events.push('boost')
    return
  }

  if (object.kind === 'shield') {
    object.active = false
    const gain = state.config.character === 'dog' ? 1.3 : 1
    state.shield = Math.max(state.shield, 8 * gain)
    state.events.push('heart')
    return
  }

  if (state.invulnerability > 0 || state.secretEventActive) return

  if (state.shield > 0) {
    state.shield = 0
    state.invulnerability = 1.2
    state.shake = 0.25
    state.events.push('hit')
    return
  }

  state.lives -= 1
  state.invulnerability = state.config.character === 'egg' ? 1.4 : 1
  state.monster.gap = Math.max(0, state.monster.gap - 7)
  state.shake = 0.55
  state.flash = 0.3
  state.events.push('hit')
}

function updateMonster(state: GameState, dt: number, forward: number): void {
  const monster = state.monster
  const difficulty = getDifficulty(state.config.difficulty)

  if (monster.state === 'lurking') {
    monster.z -= forward * dt
    monster.age += dt
    if (monster.z <= 0) {
      if (Math.abs(state.playerX - monster.x) < 0.46) {
        triggerChase(state)
      } else {
        missMonster(state)
      }
    }
    return
  }

  if (monster.state !== 'chasing') return

  monster.age += dt
  const boostPush = state.boosting ? 19 : 0
  const acceleratePush = state.speed > state.baseSpeedForRun ? 1.5 : 0
  const pressure = difficulty.monsterPressure * (1.05 + monster.age * 0.005)
  monster.gap += (boostPush + acceleratePush - pressure) * dt
  if (monster.gap > 78) {
    missMonster(state)
    return
  }
  if (monster.gap <= 0) {
    monster.gap = 0
    finish(state, 'caught')
  }
}

function updateNet(state: GameState, dt: number, forward: number): void {
  if (
    state.config.mode !== 'endless' &&
    state.config.mode !== 'collector'
  ) {
    return
  }

  if (state.net.state === 'idle' && state.monster.state === 'chasing') {
    const dueDistance =
      Number.isFinite(state.net.nextSpawnDistance) && state.distance >= state.net.nextSpawnDistance
    const dueTime =
      Number.isFinite(state.net.nextSpawnTime) && state.elapsed >= state.net.nextSpawnTime
    if (dueDistance || dueTime) {
      const side: -1 | 1 = state.rng() > 0.5 ? 1 : -1
      state.net = {
        ...state.net,
        state: 'armed',
        x: side * randomBetween(state.rng, 0.64, 0.78),
        z: VIEW_DISTANCE,
        side
      }
    }
  }

  if (state.net.state === 'armed') {
    state.net.z -= forward * dt
    if (state.net.z <= 0) {
      if (
        state.monster.state === 'chasing' &&
        state.monster.gap < 24 &&
        Math.abs(state.playerX - state.net.x) < 0.52
      ) {
        captureMonster(state)
      } else {
        state.net.state = 'spent'
        state.net.timer = 1
        scheduleNetAfterMiss(state, true)
      }
    }
  } else if (state.net.state === 'spent') {
    state.net.timer -= dt
    if (state.net.timer <= 0) {
      state.net.state = 'idle'
    }
  }
}

export function updateGame(state: GameState, input: GameInput, dt: number): void {
  if (state.paused || state.ended) return
  dt = Math.min(Math.max(dt, 0), 0.05)
  const character = state.config.character
  const difficulty = getDifficulty(state.config.difficulty)

  state.elapsed += dt
  state.invulnerability = Math.max(0, state.invulnerability - dt)
  state.shield = Math.max(0, state.shield - dt)
  state.shake = Math.max(0, state.shake - dt * 2.8)
  state.flash = Math.max(0, state.flash - dt * 2.4)

  if (state.secretEventActive) {
    state.secretEventTimer -= dt
    if (state.secretEventTimer <= 0) state.secretEventActive = false
  }

  if (
    state.config.mode === 'endless' &&
    !state.secretTriggered &&
    state.distance >= 800
  ) {
    state.secretTriggered = true
    state.secretEventActive = true
    state.secretEventTimer = 5
    state.flash = 0.9
  }

  const turnModifier =
    character === 'frog' ? 1.2 : character === 'chicken' ? 0.95 : 1
  const accelerationModifier = character === 'mouse' ? 0.95 : 1
  const speedModifier = character === 'frog' ? 0.94 : 1
  const wasBoosting = state.boosting
  const boosted = input.boost && state.boostEnergy > 0
  state.boosting = boosted
  if (boosted && !wasBoosting) state.events.push('boost')
  if (boosted) {
    const drain = character === 'chicken' ? 22 : character === 'egg' ? 31 : 28
    state.boostEnergy = Math.max(0, state.boostEnergy - drain * dt)
  }

  const targetSpeed =
    state.baseSpeedForRun *
    speedModifier *
    (input.accelerate ? 1.1 * accelerationModifier : 1) *
    (input.brake ? 0.6 : 1) *
    (boosted ? (character === 'chicken' ? 1.62 : 1.52) : 1) *
    (state.secretEventActive ? 1.24 : 1)
  state.speed += (targetSpeed - state.speed) * Math.min(1, dt * 2.8)

  const targetXVelocity = input.steer * 1.52 * turnModifier
  state.playerVelocity += (targetXVelocity - state.playerVelocity) * Math.min(1, dt * 8)
  state.playerX += state.playerVelocity * dt
  if (state.playerX < -1) {
    state.playerX = -1
    state.playerVelocity *= -0.22
  } else if (state.playerX > 1) {
    state.playerX = 1
    state.playerVelocity *= -0.22
  }

  const forward = state.speed
  state.distance += forward * dt
  state.spawnAccumulator += forward * dt
  const spawnSpacing = 17 / difficulty.spacing
  if (state.spawnAccumulator >= spawnSpacing) spawnObject(state)

  if (state.config.mode === 'zigzag' && state.distance >= state.nextGateAt) {
    const gateX = randomBetween(state.rng, -0.72, 0.72)
    state.objects.push(
      createObject(state, 'gate', gateX, VIEW_DISTANCE, {
        width: randomBetween(state.rng, 0.46, 0.56),
        height: 0.75
      })
    )
    state.nextGateAt += Math.max(35, 54 / difficulty.spacing)
  }

  for (const object of state.objects) {
    if (!object.active) continue
    const previousZ = object.z
    object.z -= forward * dt
    if (previousZ > PLAYER_ZONE && object.z <= PLAYER_ZONE) {
      handleObjectCrossing(state, object, input)
    }
    if (object.z < -10) object.active = false
  }
  state.objects = state.objects.filter((object) => object.active)

  const canSpawnMonster =
    (state.config.mode === 'endless' &&
      Number.isFinite(state.monster.nextSpawnDistance) &&
      state.distance >= state.monster.nextSpawnDistance) ||
    (state.config.mode === 'collector' &&
      Number.isFinite(state.monster.nextSpawnTime) &&
      state.elapsed >= state.monster.nextSpawnTime)
  if (
    canSpawnMonster &&
    state.monster.state !== 'lurking' &&
    state.monster.state !== 'chasing'
  ) {
    startMonster(state)
  }

  updateMonster(state, dt, forward)
  updateNet(state, dt, forward)

  if (state.config.mode === 'timeTrial' && state.distance >= TIME_TRIAL_DISTANCE) {
    state.distance = TIME_TRIAL_DISTANCE
    finish(state, 'finished')
  }
  if (state.lives <= 0) finish(state, 'wrecked')

  state.score = currentRecordScore(state)
}

export function createRunGame(config: GameConfig): GameState {
  return createGame(config)
}

export function snapshotGame(state: GameState): GameSnapshot {
  return {
    mode: state.config.mode,
    distance: state.distance,
    targetDistance: state.config.mode === 'timeTrial' ? TIME_TRIAL_DISTANCE : 0,
    elapsed: state.elapsed,
    coins: state.coins,
    score: state.score,
    lives: state.lives,
    maxLives: state.maxLives,
    shield: state.shield,
    boostEnergy: state.boostEnergy,
    monsterState: state.monster.state,
    monsterGap: state.monster.gap,
    monsterActive:
      state.monster.state === 'lurking' || state.monster.state === 'chasing',
    netState: state.net.state,
    streak: state.streak,
    bestStreak: state.bestStreak,
    paused: state.paused,
    capturedMonsters: state.capturedMonsters,
    invulnerable: state.invulnerability > 0,
    secretEventActive: state.secretEventActive
  }
}

export function forceMonsterChase(state: GameState): void {
  if (state.monster.state === 'escaped') {
    state.monster = {
      ...state.monster,
      state: 'lurking',
      x: 0,
      z: 0.1
    }
  }
  if (state.monster.state === 'lurking') triggerChase(state)
}

export function forceSpawnNet(state: GameState): void {
  if (state.monster.state !== 'chasing') forceMonsterChase(state)
  const side: -1 | 1 = state.rng() > 0.5 ? 1 : -1
  state.net.state = 'armed'
  state.net.x = side * 0.68
  state.net.z = 8
  state.net.side = side
}

export function forceTriggerNet(state: GameState): void {
  if (state.monster.state !== 'chasing') forceMonsterChase(state)
  state.monster.gap = 12
  state.net.state = 'armed'
  state.net.x = state.playerX
  state.net.z = 0.01
}
