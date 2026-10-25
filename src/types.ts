export type GameMode = 'endless' | 'timeTrial' | 'zigzag' | 'collector'
export type Difficulty = 'easy' | 'medium' | 'hard'
export type CharacterId = 'egg' | 'mouse' | 'chicken' | 'dog' | 'frog'
export type MonsterState = 'lurking' | 'chasing' | 'escaped' | 'captured'
export type NetTrapState = 'idle' | 'armed' | 'snapped' | 'spent'
export type Screen = 'home' | 'game'
export type GameEvent = 'collect' | 'heart' | 'boost' | 'hit' | 'capture'

export interface CharacterDefinition {
  id: CharacterId
  name: string
  title: string
  ability: string
  tradeoff: string
  price: number
  accent: string
  image: string
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
  monsterPressure: number
  reward: number
  startLives: number
  maxLives: number
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
  reducedSpeed?: boolean
}

export interface GameSnapshot {
  mode: GameMode
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
  streak: number
  bestStreak: number
  paused: boolean
  capturedMonsters: number
  invulnerable: boolean
  secretEventActive: boolean
}

export interface RunResult {
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
  boostEnergy: number
  boosting: boolean
  score: number
  coins: number
  earnedMilk: number
  streak: number
  bestStreak: number
  objects: WorldObject[]
  monster: MonsterEncounter
  net: NetTrap
  capturedMonsters: number
  paused: boolean
  ended: boolean
  result?: RunResult
  nextEntityId: number
  spawnAccumulator: number
  nextGateAt: number
  nextMonsterPeriod: number
  secretEventActive: boolean
  secretEventTimer: number
  secretTriggered: boolean
  events: GameEvent[]
  shake: number
  flash: number
  rng: () => number
}
