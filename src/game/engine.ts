import { getDifficulty } from '../data'
import type {
  GameConfig,
  GameInput,
  GameSnapshot,
  GameState,
  MotionState,
  RunResult,
  WorldObject
} from '../types'

export const VIEW_DISTANCE = 120
export const TIME_TRIAL_DISTANCE = 1200
export const PLAYER_ZONE = 2.2
export const INITIAL_LIVES = 5
export const PLAYER_COLLIDER_HALF_WIDTH = 0.085
export const MONSTER_HIT_HALF_WIDTH = 0.12
export const MONSTER_WAKE_DISTANCE = 0.5
export const NET_CAPTURE_DISTANCE = 0.52
export const NET_CAPTURE_GAP = 24
export const SAFE_CORRIDOR_WIDTH = 0.44
export const SAFE_CORRIDOR_HALF = SAFE_CORRIDOR_WIDTH / 2
export const MIN_HAZARD_REACTION_SECONDS = 1.6

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
  const captureMilk = state.capturedMonsters * 10
  const earnedMilk = Math.max(
    1,
    Math.round(
      (state.earnedMilk - captureMilk + Math.floor(state.distance / 22)) *
        difficulty.reward
    ) + captureMilk
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
    captureMilk,
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
    age: 0,
    animationFrame: 0
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
  const baseSpeed = 26 * difficulty.speed * (config.reducedSpeed ? 0.85 : 1)
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
    lives: INITIAL_LIVES,
    maxLives: INITIAL_LIVES,
    shield: 0,
    invulnerability: 0,
    boostEnergy: config.character === 'dog' ? 10 : config.character === 'chicken' ? 22 : 25,
    boosting: false,
    debuffTimer: 0,
    paceMultiplier: 1,
    motionState: 'cruise',
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
    nextGateAt: 58,
    secretEventActive: false,
    secretEventTimer: 0,
    secretTriggered: false,
    events: [],
    lastDamage: null,
    damageNoticeTimer: 0,
    nextHazardRowAt: 2.1,
    safeCenter: 0,
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
    age: 0,
    animationFrame: 0
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
  state.events.push('monsterWake')
}

function missMonster(state: GameState): void {
  state.monster.state = 'escaped'
  if (state.net.state === 'armed') {
    state.net.state = 'spent'
    state.net.timer = 1
  }
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
  if (state.net.state === 'armed') {
    state.net.state = 'spent'
    state.net.timer = 1
  }
  state.monster.age = 0
  state.net.state = 'snapped'
  state.net.timer = 0.5
  state.capturedMonsters += 1
  state.earnedMilk += 10
  state.flash = 0.8
  state.events.push('capture')
  state.events.push('netSnap')
  state.shake = state.secretEventActive ? 0 : 0.35
  scheduleNextMonster(state)
  scheduleNetAfterMiss(state, true)
}

function contactMonster(state: GameState): void {
  if (state.monster.state === 'recoiling' || state.monster.state === 'captured') return
  state.lives = Math.max(0, state.lives - 2)
  state.lastDamage = 'monster'
  state.damageNoticeTimer = 1.5
  state.monster.state = 'recoiling'
  state.monster.age = 0
  state.monster.animationFrame = 0
  state.monster.gap = 90
  state.shake = 0.9
  state.flash = 0.8
  state.events.push('monsterHit')
  state.events.push('monsterStop')
  scheduleNextMonster(state)
  if (state.lives <= 0) finish(state, 'caught')
}

interface RowEntityPlan {
  kind: WorldObject['kind']
  x: number
  width: number
  height: number
}

export interface HazardRowPlan {
  safeCenter: number
  safeHalfWidth: number
  hazards: RowEntityPlan[]
  items: RowEntityPlan[]
}

function pickObstacleKind(rng: () => number): WorldObject['kind'] {
  const roll = rng()
  return roll < 0.42 ? 'rock' : roll < 0.7 ? 'buoy' : 'surfer'
}

function obstacleDimensions(kind: WorldObject['kind']): { width: number; height: number } {
  if (kind === 'rock') return { width: 0.32, height: 0.38 }
  if (kind === 'surfer') return { width: 0.2, height: 0.34 }
  return { width: 0.16, height: 0.32 }
}

export function planHazardRow(
  rng: () => number,
  previousCenter: number,
  spacing: number
): HazardRowPlan {
  const shiftLimit = 0.7
  const desiredCenter = previousCenter + randomBetween(rng, -shiftLimit, shiftLimit)
  const safeCenter = Math.max(-0.52, Math.min(0.52, desiredCenter))
  const safeHalfWidth = SAFE_CORRIDOR_HALF + Math.max(0, spacing - 1) * 0.04
  const hazards: RowEntityPlan[] = []
  const items: RowEntityPlan[] = []

  if (rng() > 0.16) {
    const sides = rng() > 0.5 ? (['left', 'right'] as const) : (['right', 'left'] as const)
    const doubleHazardChance = Math.min(0.68, 0.5 / Math.max(0.7, spacing))
    const hazardCount = rng() < doubleHazardChance ? 2 : 1
    for (const side of sides.slice(0, hazardCount)) {
      const kind = pickObstacleKind(rng)
      const dimensions = obstacleDimensions(kind)
      const minX =
        side === 'left'
          ? -0.94 + dimensions.width / 2
          : safeCenter + safeHalfWidth + dimensions.width / 2 + 0.03
      const maxX =
        side === 'left'
          ? safeCenter - safeHalfWidth - dimensions.width / 2 - 0.03
          : 0.94 - dimensions.width / 2
      if (minX <= maxX) {
        hazards.push({
          kind,
          x: randomBetween(rng, minX, maxX),
          ...dimensions
        })
      }
    }
  }

  const itemRoll = rng()
  const itemKind: WorldObject['kind'] =
    itemRoll < 0.08
      ? 'heart'
      : itemRoll < 0.18
        ? 'boost'
        : itemRoll < 0.23
          ? 'shield'
          : itemRoll < 0.29
            ? 'slime'
            : 'coin'
  const itemWidth = 0.15
  const itemLimit = Math.max(0, safeHalfWidth - itemWidth / 2 - PLAYER_COLLIDER_HALF_WIDTH)
  items.push({
    kind: itemKind,
    x: safeCenter + randomBetween(rng, -itemLimit, itemLimit),
    width: itemWidth,
    height: itemKind === 'slime' ? 0.24 : 0.2
  })

  if (rng() < 0.45) {
    items.push({
      kind: 'coin',
      x: safeCenter + randomBetween(rng, -itemLimit, itemLimit),
      width: itemWidth,
      height: 0.2
    })
  }

  return {
    safeCenter,
    safeHalfWidth,
    hazards,
    items
  }
}

function spawnHazardRow(state: GameState): void {
  const difficulty = getDifficulty(state.config.difficulty)
  const plan = planHazardRow(state.rng, state.safeCenter, difficulty.spacing)
  state.safeCenter = plan.safeCenter

  for (const hazard of plan.hazards) {
    state.objects.push(
      createObject(state, hazard.kind, hazard.x, VIEW_DISTANCE, {
        width: hazard.width,
        height: hazard.height
      })
    )
  }

  for (const item of plan.items) {
    state.objects.push(
      createObject(state, item.kind, item.x, VIEW_DISTANCE, {
        width: item.width,
        height: item.height
      })
    )
  }

  const interval = Math.max(
    MIN_HAZARD_REACTION_SECONDS,
    2.1 *
      difficulty.spacing *
      (1 - Math.min(0.12, (state.elapsed / 120) * 0.12))
  )
  state.nextHazardRowAt = state.elapsed + interval
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
    object.kind === 'shield' ||
    object.kind === 'slime'
  const isPositiveItem =
    object.kind === 'coin' ||
    object.kind === 'heart' ||
    object.kind === 'boost' ||
    object.kind === 'shield'
  const magnet = isPositiveItem
    ? state.config.character === 'mouse'
      ? 0.24
      : 0.18
    : object.kind === 'slime'
      ? 0.03
      : 0
  const overlapping =
    Math.abs(state.playerX - object.x) <
    object.width / 2 + PLAYER_COLLIDER_HALF_WIDTH + magnet

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
    if (state.lives >= state.maxLives) {
      state.earnedMilk += 3
    } else {
      state.lives = Math.min(state.maxLives, state.lives + 1)
    }
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

  if (object.kind === 'slime') {
    object.active = false
    state.debuffTimer = 3
    state.events.push('debuff')
    return
  }

  if (state.invulnerability > 0 || state.secretEventActive) return

  if (state.shield > 0) {
    state.shield = 0
    state.invulnerability = 1.2
    state.shake = 0.25
    state.events.push('hit')
    state.damageNoticeTimer = 0.9
    return
  }

  state.lives -= 1
  state.invulnerability = state.config.character === 'egg' ? 1.4 : 1
  state.monster.gap = Math.max(0, state.monster.gap - 7)
  state.shake = 0.55
  state.flash = 0.3
  state.lastDamage = 'obstacle'
  state.damageNoticeTimer = 1.1
  state.events.push('hit')
}

function updateMonster(state: GameState, dt: number, forward: number): void {
  const monster = state.monster
  const difficulty = getDifficulty(state.config.difficulty)

  if (monster.state === 'lurking') {
    monster.z -= forward * dt
    monster.age += dt
    monster.animationFrame = Math.floor(monster.age * 5) % 2
    if (monster.z <= PLAYER_ZONE) {
      const distance = Math.abs(state.playerX - monster.x)
      if (distance <= MONSTER_HIT_HALF_WIDTH + PLAYER_COLLIDER_HALF_WIDTH) {
        contactMonster(state)
      } else if (distance <= MONSTER_WAKE_DISTANCE) {
        triggerChase(state)
      } else {
        missMonster(state)
      }
    }
    return
  }

  if (monster.state === 'recoiling') {
    monster.age += dt
    if (monster.age >= 1.2) monster.state = 'escaped'
    return
  }

  if (monster.state === 'captured') {
    monster.age += dt
    if (monster.age >= 0.9) monster.state = 'escaped'
    return
  }

  if (monster.state !== 'chasing') return

  monster.age += dt
  monster.animationFrame = Math.floor(monster.age * 8) % 4
  const boostPush = state.boosting ? 19 : 0
  const acceleratePush = state.motionState === 'accelerating' ? 1.5 : 0
  const pressure = difficulty.monsterPressure * (1.05 + monster.age * 0.005)
  monster.gap += (boostPush + acceleratePush - pressure) * dt
  if (monster.gap > 78) {
    missMonster(state)
    state.events.push('monsterStop')
    return
  }
  if (monster.gap <= 0) {
    monster.gap = 0
    contactMonster(state)
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
        state.monster.gap < NET_CAPTURE_GAP &&
        Math.abs(state.playerX - state.net.x) < NET_CAPTURE_DISTANCE
      ) {
        captureMonster(state)
      } else {
        state.net.state = 'spent'
        state.net.timer = 1
        scheduleNetAfterMiss(state, true)
      }
    }
  } else if (state.net.state === 'snapped') {
    state.net.timer -= dt
    if (state.net.timer <= 0) {
      state.net.state = 'spent'
      state.net.timer = 1
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
  state.debuffTimer = Math.max(0, state.debuffTimer - dt)
  state.damageNoticeTimer = Math.max(0, state.damageNoticeTimer - dt)
  state.shake = Math.max(0, state.shake - dt * 2.8)
  state.flash = Math.max(0, state.flash - dt * 2.4)
  state.paceMultiplier = 1 + Math.min(1, state.elapsed / 120) * difficulty.rampGain

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
  const previousMotion = state.motionState
  const wasBoosting = state.boosting
  const motionState: MotionState = input.brake
    ? 'braking'
    : input.boost && state.boostEnergy > 0
      ? 'boosting'
      : input.accelerate
        ? 'accelerating'
        : 'cruise'
  const boosted = motionState === 'boosting'
  state.boosting = boosted
  state.motionState = motionState
  if (boosted && !wasBoosting) state.events.push('boost')
  if (motionState === 'braking' && previousMotion !== 'braking') state.events.push('brake')
  if (motionState === 'accelerating' && previousMotion !== 'accelerating') {
    state.events.push('accelerate')
  }
  if (boosted) {
    const drain = character === 'chicken' ? 22 : character === 'egg' ? 31 : 28
    state.boostEnergy = Math.max(0, state.boostEnergy - drain * dt)
  }

  const inputSpeedFactor =
    motionState === 'braking'
      ? 0.62
      : motionState === 'boosting'
        ? character === 'chicken'
          ? 1.68
          : 1.56
        : motionState === 'accelerating'
          ? 1.18 * accelerationModifier
          : 1
  const debuffSpeedFactor = state.debuffTimer > 0 ? 0.75 : 1
  const targetSpeed =
    state.baseSpeedForRun *
    state.paceMultiplier *
    inputSpeedFactor *
    speedModifier *
    debuffSpeedFactor *
    (state.secretEventActive ? 1.24 : 1)
  const responseRate =
    motionState === 'braking'
      ? 9
      : motionState === 'accelerating'
        ? 3.4
        : motionState === 'boosting'
          ? 4
          : 2.4
  state.speed += (targetSpeed - state.speed) * Math.min(1, dt * responseRate)

  const debuffTurnFactor = state.debuffTimer > 0 ? 0.8 : 1
  const targetXVelocity = input.steer * 1.52 * turnModifier * debuffTurnFactor
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
  if (state.elapsed >= state.nextHazardRowAt) spawnHazardRow(state)

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
      state.monster.state === 'lurking' ||
      state.monster.state === 'chasing' ||
      state.monster.state === 'recoiling',
    netState: state.net.state,
    netCaptureReady:
      state.net.state === 'armed' &&
      state.monster.state === 'chasing' &&
      state.monster.gap < NET_CAPTURE_GAP,
    streak: state.streak,
    bestStreak: state.bestStreak,
    paused: state.paused,
    capturedMonsters: state.capturedMonsters,
    invulnerable: state.invulnerability > 0,
    secretEventActive: state.secretEventActive,
    debuffRemaining: state.debuffTimer,
    paceMultiplier: state.paceMultiplier,
    speedRatio: state.speed / state.baseSpeedForRun,
    motionState: state.motionState,
    monsterAnimationFrame: state.monster.animationFrame,
    lastDamage: state.lastDamage
  }
}

export function forceMonsterChase(state: GameState): void {
  if (state.monster.state !== 'captured') {
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
