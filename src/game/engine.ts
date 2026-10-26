import { getDifficulty } from '../data'
import type {
  GameConfig,
  GameInput,
  GameSnapshot,
  GameState,
  MotionState,
  RunResult,
  WalletTransaction,
  WorldObject
} from '../types'

export const VIEW_DISTANCE = 120
export const TIME_TRIAL_DISTANCE = 1200
export const PLAYER_ZONE = 2.2
export const INITIAL_LIVES = 5
export const PLAYER_COLLIDER_HALF_WIDTH = 0.085
export const MONSTER_HIT_HALF_WIDTH = 0.12
export const MONSTER_WAKE_DISTANCE = 0.62
export const NET_CAPTURE_DISTANCE = 0.52
export const NET_CAPTURE_GAP = 24
export const SAFE_CORRIDOR_WIDTH = 0.44
export const SAFE_CORRIDOR_HALF = SAFE_CORRIDOR_WIDTH / 2
export const MIN_HAZARD_REACTION_SECONDS = 1.35
export const MAX_REVIVES = 3
export const REVIVE_BASE_COST = 100

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
        : state.distance

  const recordLabel =
    config.mode === 'timeTrial'
      ? `${recordValue.toFixed(2)} 秒`
      : config.mode === 'zigzag'
        ? `${recordValue} 连门`
        : `${Math.round(recordValue)} 米`

  const difficulty = getDifficulty(config.difficulty)
  const captureMilk = state.capturedMonsters * 10
  const settlementMilk =
    state.distance > 0
      ? Math.max(
          1,
          Math.round(Math.floor(state.distance / 22) * difficulty.reward)
        )
      : 0
  const instantMilk = state.instantMilkEarned
  const earnedMilk = instantMilk + settlementMilk

  return {
    runId: config.runId,
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
    instantMilk,
    settlementMilk,
    captureMilk,
    recordValue,
    recordLabel,
    shouldCountRecord: !state.secretTriggered
  }
}

function finish(state: GameState, reason: RunResult['reason']): void {
  if (state.ended) return
  state.ended = true
  state.phase = 'ended'
  state.downed = false
  state.paused = true
  state.result = createRunResult(state, reason)
  state.flash = 1
}

function enterDowned(state: GameState): void {
  if (state.downed || state.ended) return
  if (state.config.mode === 'extreme') {
    finish(state, state.lastDamage === 'monster' ? 'caught' : 'wrecked')
    return
  }
  state.downed = true
  state.phase = 'downed'
  state.paused = true
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
    monster.nextSpawnDistance =
      randomBetween(rng, 240, 320) / (difficulty.monsterPressure * 1.15)
  } else if (config.mode === 'extreme') {
    monster.nextSpawnTime =
      randomBetween(rng, 16, 24) / (difficulty.monsterPressure * 1.25)
  }

  return {
    config,
    phase: 'loading',
    countdown: config.mode === 'timeTrial' ? 3 : 0,
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
    reviveInvulnerability: 0,
    boostEnergy: config.character === 'dog' ? 10 : config.character === 'chicken' ? 22 : 25,
    boosting: false,
    debuffTimer: 0,
    paceMultiplier: 1,
    motionState: 'cruise',
    score: 0,
    coins: 0,
    instantMilkEarned: 0,
    streak: 0,
    bestStreak: 0,
    objects: [],
    monster,
    net: emptyNet(),
    capturedMonsters: 0,
    revivesUsed: 0,
    downed: false,
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
    damageRevision: 0,
    nextHazardRowAt: 2.1,
    safeCenter: 0,
    shake: 0,
    flash: 0,
    rng,
    walletTransactions: []
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

function queueWalletTransaction(
  state: GameState,
  transaction: WalletTransaction
): void {
  if (state.walletTransactions.some((item) => item.id === transaction.id)) return
  state.walletTransactions.push(transaction)
  state.events.push('wallet')
}

function scheduleNextMonster(state: GameState, resetFromDistance = true): void {
  const mode = state.config.mode
  const pressure = getDifficulty(state.config.difficulty).monsterPressure
  const cadence = 1.15 * (mode === 'extreme' ? 1.1 : 1)
  if (mode === 'endless') {
    state.monster.nextSpawnDistance =
      (resetFromDistance ? state.distance : 0) +
      randomBetween(state.rng, 380, 480) / (pressure * cadence)
    state.monster.nextSpawnTime = Number.POSITIVE_INFINITY
  } else if (mode === 'extreme') {
    state.monster.nextSpawnTime =
      state.elapsed + randomBetween(state.rng, 24, 34) / (pressure * cadence)
    state.monster.nextSpawnDistance = Number.POSITIVE_INFINITY
  } else {
    state.monster.nextSpawnDistance = Number.POSITIVE_INFINITY
    state.monster.nextSpawnTime = Number.POSITIVE_INFINITY
  }
}

function startMonster(state: GameState): void {
  if (state.config.mode !== 'endless' && state.config.mode !== 'extreme') return
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
  const pressure = getDifficulty(state.config.difficulty).monsterPressure
  const cadence = 1.15 * (state.config.mode === 'extreme' ? 1.1 : 1)
  state.monster.state = 'chasing'
  state.monster.gap = 38
  state.monster.age = 0
  state.net = {
    ...emptyNet(),
    nextSpawnDistance:
      state.config.mode === 'endless'
        ? state.distance + randomBetween(state.rng, 100, 160) / (pressure * cadence)
        : Number.POSITIVE_INFINITY,
    nextSpawnTime:
      state.config.mode === 'extreme'
        ? state.elapsed + randomBetween(state.rng, 8, 12) / (pressure * cadence)
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
  const pressure = getDifficulty(state.config.difficulty).monsterPressure
  const cadence = 1.15 * (state.config.mode === 'extreme' ? 1.1 : 1)
  if (state.config.mode === 'endless') {
    state.net.nextSpawnDistance =
      (resetDistance ? state.distance : 0) +
      randomBetween(state.rng, 300, 420) / (pressure * cadence)
    state.net.nextSpawnTime = Number.POSITIVE_INFINITY
  } else if (state.config.mode === 'extreme') {
    state.net.nextSpawnTime =
      state.elapsed + randomBetween(state.rng, 18, 26) / (pressure * cadence)
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
  state.instantMilkEarned += 10
  queueWalletTransaction(state, {
    id: `capture:${state.config.runId}:${state.capturedMonsters}`,
    kind: 'capture',
    amount: 10
  })
  state.flash = 0.8
  state.events.push('capture')
  state.events.push('netSnap')
  state.shake = state.secretEventActive ? 0 : 0.35
  scheduleNextMonster(state)
  scheduleNetAfterMiss(state, true)
}

function applyDamage(
  state: GameState,
  kind: Exclude<GameState['lastDamage'], null>,
  amount: number
): 'ignored' | 'shielded' | 'damaged' {
  if (state.phase !== 'playing' || state.downed || state.ended) return 'ignored'
  if (state.reviveInvulnerability > 0) return 'ignored'
  if (kind === 'obstacle' && (state.invulnerability > 0 || state.secretEventActive)) {
    return 'ignored'
  }

  state.lastDamage = kind
  state.damageRevision += 1

  if (kind === 'obstacle' && state.shield > 0) {
    state.shield = 0
    state.invulnerability = 1.2
    state.shake = 0.25
    state.damageNoticeTimer = 0.9
    state.events.push('hit')
    return 'shielded'
  }

  state.lives = Math.max(0, state.lives - amount)
  state.damageNoticeTimer = kind === 'monster' ? 1.5 : 1.1
  state.events.push(kind === 'monster' ? 'monsterHit' : 'hit')
  if (state.lives <= 0) enterDowned(state)
  return 'damaged'
}

function contactMonster(state: GameState): void {
  if (state.phase !== 'playing') return
  if (state.monster.state === 'recoiling' || state.monster.state === 'captured') return
  if (state.reviveInvulnerability > 0) {
    state.monster.gap = Math.max(12, state.monster.gap)
    return
  }
  state.monster.state = 'recoiling'
  state.monster.age = 0
  state.monster.animationFrame = 0
  state.monster.gap = 90
  state.shake = 0.9
  state.flash = 0.8
  state.events.push('monsterStop')
  applyDamage(state, 'monster', 2)
  scheduleNextMonster(state)
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
  const hazardRoll = rng()
  const tripleChance = Math.min(0.44, Math.max(0, (1 - spacing) * 0.72))
  const doubleChance = Math.min(0.58, 0.48 / Math.max(0.58, spacing))
  const hazardCount =
    hazardRoll < tripleChance ? 3 : hazardRoll < tripleChance + doubleChance ? 2 : 1
  const leftEdge = -0.94
  const rightEdge = 0.94
  const firstSide = rng() > 0.5 ? 1 : -1

  for (let index = 0; index < hazardCount; index += 1) {
    let placed = false
    for (let attempt = 0; attempt < 24 && !placed; attempt += 1) {
      const side = (index + (rng() > 0.76 ? 1 : 0)) % 2 === 0 ? firstSide : -firstSide
      const kind = pickObstacleKind(rng)
      const dimensions = obstacleDimensions(kind)
      const minX =
        side < 0
          ? leftEdge + dimensions.width / 2
          : safeCenter + safeHalfWidth + dimensions.width / 2 + 0.03
      const maxX =
        side < 0
          ? safeCenter - safeHalfWidth - dimensions.width / 2 - 0.03
          : rightEdge - dimensions.width / 2
      if (minX > maxX) continue

      const x = randomBetween(rng, minX, maxX)
      const overlaps = hazards.some(
        (hazard) =>
          Math.abs(hazard.x - x) <
          hazard.width / 2 + dimensions.width / 2 + 0.035
      )
      if (overlaps) continue
      hazards.push({ kind, x, ...dimensions })
      placed = true
    }
  }

  const itemWidth = 0.15
  const itemLimit = Math.max(0, safeHalfWidth - itemWidth / 2 - PLAYER_COLLIDER_HALF_WIDTH)
  const itemCount = 1 + (rng() < 0.52 ? 1 : 0)

  for (let index = 0; index < itemCount; index += 1) {
    const itemRoll = rng()
    const itemKind: WorldObject['kind'] =
      itemRoll < 0.08
        ? 'heart'
        : itemRoll < 0.18
          ? 'boost'
          : itemRoll < 0.23
            ? 'shield'
            : itemRoll < 0.31
              ? 'slime'
              : 'coin'

    for (let attempt = 0; attempt < 20; attempt += 1) {
      const useSafeLane = rng() < 0.65 || attempt > 8
      let minX = safeCenter - itemLimit
      let maxX = safeCenter + itemLimit
      if (!useSafeLane) {
        const side = rng() > 0.5 ? 1 : -1
        minX =
          side < 0
            ? leftEdge + itemWidth / 2
            : safeCenter + safeHalfWidth + itemWidth / 2 + 0.03
        maxX =
          side < 0
            ? safeCenter - safeHalfWidth - itemWidth / 2 - 0.03
            : rightEdge - itemWidth / 2
      }
      if (minX > maxX) continue
      const x = randomBetween(rng, minX, maxX)
      const overlapsHazard = hazards.some(
        (hazard) =>
          Math.abs(hazard.x - x) <
          hazard.width / 2 + itemWidth / 2 + 0.035
      )
      const overlapsItem = items.some(
        (item) => Math.abs(item.x - x) < itemWidth + 0.035
      )
      if (overlapsHazard || overlapsItem) continue
      items.push({
        kind: itemKind,
        x,
        width: itemWidth,
        height: itemKind === 'slime' ? 0.24 : 0.2
      })
      break
    }
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
    Math.max(MIN_HAZARD_REACTION_SECONDS, difficulty.rowWindow),
    1.9 *
      difficulty.spacing *
      (1 - Math.min(0.18, (state.elapsed / 120) * 0.18))
  )
  state.nextHazardRowAt = state.elapsed + interval
}

function currentRecordScore(state: GameState): number {
  if (state.config.mode === 'timeTrial') {
    return Math.max(5, state.elapsed - state.coins * 0.35)
  }
  if (state.config.mode === 'zigzag') return state.bestStreak
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
    state.instantMilkEarned += 1
    queueWalletTransaction(state, {
      id: `pickup:${state.config.runId}:${object.id}`,
      kind: 'pickup',
      amount: 1
    })
    state.events.push('collect')
    if (state.config.mode === 'zigzag') state.streak += 0
    return
  }

  if (object.kind === 'heart') {
    object.active = false
    if (state.lives >= state.maxLives) {
      state.instantMilkEarned += 3
      queueWalletTransaction(state, {
        id: `heart:${state.config.runId}:${object.id}`,
        kind: 'heartBonus',
        amount: 3
      })
    } else {
      state.lives = Math.min(state.maxLives, state.lives + 1)
      state.damageRevision += 1
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
    state.damageRevision += 1
    state.events.push('heart')
    return
  }

  if (object.kind === 'slime') {
    object.active = false
    state.debuffTimer = 3
    state.events.push('debuff')
    return
  }

  if (applyDamage(state, 'obstacle', 1) !== 'damaged') return
  state.invulnerability = state.config.character === 'egg' ? 1.4 : 1
  state.monster.gap = Math.max(0, state.monster.gap - 7)
  state.shake = 0.55
  state.flash = 0.3
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
      if (
        state.reviveInvulnerability > 0 &&
        distance <= MONSTER_HIT_HALF_WIDTH + PLAYER_COLLIDER_HALF_WIDTH
      ) {
        missMonster(state)
      } else if (distance <= MONSTER_HIT_HALF_WIDTH + PLAYER_COLLIDER_HALF_WIDTH) {
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
  monster.animationFrame = Math.floor(monster.age * 8) % 2
  const boostPush = state.boosting ? 19 : 0
  const acceleratePush = state.motionState === 'accelerating' ? 1.5 : 0
  const pressure =
    difficulty.monsterPressure *
    (1.05 + monster.age * 0.005) *
    (state.debuffTimer > 0 ? 1.25 : 1)
  monster.gap += (boostPush + acceleratePush - pressure) * dt
  if (monster.gap > 78) {
    missMonster(state)
    state.events.push('monsterStop')
    return
  }
  if (monster.gap <= 0) {
    if (state.reviveInvulnerability > 0) {
      monster.gap = 12
    } else {
      monster.gap = 0
      contactMonster(state)
    }
  }
}

function updateNet(state: GameState, dt: number, forward: number): void {
  if (
    state.config.mode !== 'endless' &&
    state.config.mode !== 'extreme'
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
  dt = Math.min(Math.max(dt, 0), 0.05)
  if (state.phase === 'countdown') {
    state.countdown = Math.max(0, state.countdown - dt)
    if (state.countdown <= 0.001) {
      state.countdown = 0
      state.phase = 'playing'
      state.paused = false
    }
    return
  }
  if (
    state.paused ||
    state.ended ||
    state.downed ||
    state.phase === 'loading' ||
    state.phase === 'ready'
  ) {
    return
  }
  const character = state.config.character
  const difficulty = getDifficulty(state.config.difficulty)

  state.elapsed += dt
  state.invulnerability = Math.max(0, state.invulnerability - dt)
  state.reviveInvulnerability = Math.max(0, state.reviveInvulnerability - dt)
  state.shield = Math.max(0, state.shield - dt)
  state.debuffTimer = Math.max(0, state.debuffTimer - dt)
  state.damageNoticeTimer = Math.max(0, state.damageNoticeTimer - dt)
  state.shake = Math.max(0, state.shake - dt * 2.8)
  state.flash = Math.max(0, state.flash - dt * 2.4)
  state.paceMultiplier =
    1 + difficulty.rampGain * (state.elapsed / 120) ** 0.75

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
      if (state.downed || state.ended) break
    }
    if (object.z < -10) object.active = false
  }
  state.objects = state.objects.filter((object) => object.active)
  if (state.downed || state.ended) {
    state.score = currentRecordScore(state)
    return
  }

  const canSpawnMonster =
    (state.config.mode === 'endless' &&
      Number.isFinite(state.monster.nextSpawnDistance) &&
      state.distance >= state.monster.nextSpawnDistance) ||
    (state.config.mode === 'extreme' &&
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

  state.score = currentRecordScore(state)
}

export function beginGamePlay(state: GameState): void {
  if (state.ended || state.downed) return
  if (state.config.mode === 'timeTrial') {
    state.phase = 'countdown'
    state.countdown = 3
    state.paused = false
  } else {
    state.phase = 'playing'
    state.countdown = 0
    state.paused = false
  }
}

export function reviveGame(state: GameState): boolean {
  if (
    !state.downed ||
    state.ended ||
    state.config.mode === 'extreme' ||
    state.revivesUsed >= MAX_REVIVES
  ) {
    return false
  }
  state.downed = false
  state.paused = false
  state.phase = 'playing'
  state.lives = 3
  state.revivesUsed += 1
  state.invulnerability = 1
  state.reviveInvulnerability = 1
  state.damageNoticeTimer = 0
  state.damageRevision += 1
  state.flash = 0.45
  state.events.push('revive')
  return true
}

export function endDownedRun(state: GameState): void {
  if (!state.downed) return
  finish(state, state.lastDamage === 'monster' ? 'caught' : 'wrecked')
}

export function createRunGame(config: GameConfig): GameState {
  return createGame(config)
}

export function snapshotGame(state: GameState, walletCoins = 0): GameSnapshot {
  const reviveCost = (state.revivesUsed + 1) * REVIVE_BASE_COST
  const reviveUnavailableReason: GameSnapshot['reviveUnavailableReason'] =
    !state.downed
      ? 'not-downed'
      : state.config.mode === 'extreme'
        ? 'extreme'
        : state.revivesUsed >= MAX_REVIVES
          ? 'limit'
          : walletCoins < reviveCost
            ? 'insufficient'
            : null
  return {
    mode: state.config.mode,
    phase: state.phase,
    countdown: state.countdown,
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
    walletCoins,
    instantMilk: state.instantMilkEarned,
    damageRevision: state.damageRevision,
    invulnerable: state.invulnerability > 0,
    reviveInvulnerable: state.reviveInvulnerability > 0,
    revivesUsed: state.revivesUsed,
    reviveCost,
    canRevive: reviveUnavailableReason === null,
    reviveUnavailableReason,
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
