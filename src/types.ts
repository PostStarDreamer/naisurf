export type GameMode = 'endless' | 'timeTrial' | 'zigzag' | 'extreme'
export type Difficulty = 'easy' | 'medium' | 'hard' | 'hell'
export type CharacterId = 'egg' | 'mouse' | 'chicken' | 'dog' | 'frog'
export type MonsterState = 'lurking' | 'chasing' | 'recoiling' | 'escaped' | 'captured'
export type NetTrapState = 'idle' | 'armed' | 'snapped' | 'spent'
export type Screen = 'home' | 'game'
export type MotionState = 'cruise' | 'accelerating' | 'braking' | 'boosting'
export type DamageKind = 'obstacle' | 'monster' | null
export type RunPhase = 'loading' | 'ready' | 'countdown' | 'playing' | 'downed' | 'ended'
export type WalletTransactionKind =
  | 'pickup'
  | 'heartBonus'
  | 'capture'
  | 'revive'
  | 'unlock'
  | 'distanceSettlement'
  | 'refund'
export type GameEvent =
  | 'collect'
  | 'heart'
  | 'boost'
  | 'hit'
  | 'capture'
  | 'monsterWake'
  | 'monsterHit'
  | 'monsterStop'
  | 'netSnap'
  | 'debuff'
  | 'accelerate'
  | 'brake'
  | 'revive'
  | 'wallet'

export interface WalletTransaction {
  id: string
  kind: WalletTransactionKind
  amount: number
  characterId?: CharacterId
}

export interface UnlockRequirement {
  runs: number
  captures: number
}

export interface CharacterDefinition {
  id: CharacterId
  name: string
  title: string
  ability: string
  tradeoff: string
  price: number
  accent: string
  surfImage: string
  showcaseImage: string
  unlockRequirement: UnlockRequirement
}

export interface ModeDefinition {
  id: GameMode
  name: string
  kicker: string
  description: string
  scoreLabel: string
  icon: string
}

export interface DifficultyDefinition {
  id: Difficulty
  name: string
  description: string
  speed: number
  spacing: number
  rampGain: number
  monsterPressure: number
  reward: number
  rowWindow: number
  hazardWeights: [number, number, number, number]
}

export interface GameSettings {
  musicVolume: number
  sfxVolume: number
  highVisibility: boolean
  reducedSpeed: boolean
  reducedMotion: boolean
}

export type ScoreRecords = Record<string, number>

export interface SaveData {
  version: 1
  milkCoins: number
  unlocked: CharacterId[]
  character: CharacterId
  records: ScoreRecords
  totalRuns: number
  totalCaptures: number
  tutorialSeen: boolean
  guideVersion?: number
  recentTransactions: string[]
  settings: GameSettings
}

export interface GameInput {
  steer: number
  accelerate: boolean
  brake: boolean
  boost: boolean
  pause: boolean
}

export interface GameConfig {
  mode: GameMode
  difficulty: Difficulty
  character: CharacterId
  seed: number
  runId: string
  reducedSpeed?: boolean
}

export interface GameSnapshot {
  mode: GameMode
  phase: RunPhase
  countdown: number
  distance: number
  targetDistance: number
  elapsed: number
  coins: number
  score: number
  lives: number
  maxLives: number
  shield: number
  boostEnergy: number
  monsterState: MonsterState
  monsterGap: number
  monsterActive: boolean
  netState: NetTrapState
  netCaptureReady: boolean
  streak: number
  bestStreak: number
  paused: boolean
  capturedMonsters: number
  walletCoins: number
  instantMilk: number
  damageRevision: number
  invulnerable: boolean
  reviveInvulnerable: boolean
  revivesUsed: number
  reviveCost: number
  canRevive: boolean
  reviveUnavailableReason: 'extreme' | 'limit' | 'insufficient' | 'not-downed' | null
  secretEventActive: boolean
  debuffRemaining: number
  paceMultiplier: number
  speedRatio: number
  motionState: MotionState
  monsterAnimationFrame: number
  lastDamage: DamageKind
}

export interface RunResult {
  runId: string
  mode: GameMode
  difficulty: Difficulty
  character: CharacterId
  score: number
  distance: number
  coins: number
  captures: number
  elapsed: number
  streak: number
  reason: 'finished' | 'wrecked' | 'caught'
  newRecord: boolean
  earnedMilk: number
  instantMilk: number
  settlementMilk: number
  captureMilk: number
  recordValue: number
  recordLabel: string
  shouldCountRecord: boolean
}

export interface WorldObject {
  id: number
  kind:
    | 'rock'
    | 'buoy'
    | 'surfer'
    | 'coin'
    | 'heart'
    | 'boost'
    | 'shield'
    | 'slime'
    | 'gate'
  x: number
  z: number
  width: number
  height: number
  active: boolean
  wobble: number
  scored: boolean
}

export interface MonsterEncounter {
  state: MonsterState
  x: number
  z: number
  gap: number
  nextSpawnDistance: number
  nextSpawnTime: number
  age: number
  animationFrame: number
}

export interface NetTrap {
  state: NetTrapState
  x: number
  z: number
  side: -1 | 1
  timer: number
  nextSpawnDistance: number
  nextSpawnTime: number
}

export interface GameState {
  config: GameConfig
  phase: RunPhase
  countdown: number
  distance: number
  elapsed: number
  playerX: number
  playerVelocity: number
  speed: number
  baseSpeedForRun: number
  lives: number
  maxLives: number
  shield: number
  invulnerability: number
  reviveInvulnerability: number
  boostEnergy: number
  boosting: boolean
  debuffTimer: number
  paceMultiplier: number
  motionState: MotionState
  score: number
  coins: number
  instantMilkEarned: number
  streak: number
  bestStreak: number
  objects: WorldObject[]
  monster: MonsterEncounter
  net: NetTrap
  capturedMonsters: number
  revivesUsed: number
  downed: boolean
  paused: boolean
  ended: boolean
  result?: RunResult
  nextEntityId: number
  nextGateAt: number
  secretEventActive: boolean
  secretEventTimer: number
  secretTriggered: boolean
  events: GameEvent[]
  lastDamage: DamageKind
  damageNoticeTimer: number
  damageRevision: number
  nextHazardRowAt: number
  safeCenter: number
  shake: number
  flash: number
  rng: () => number
  walletTransactions: WalletTransaction[]
}
