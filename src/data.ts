import type {
  CharacterDefinition,
  CharacterId,
  Difficulty,
  DifficultyDefinition,
  GameMode,
  ModeDefinition,
  SaveData
} from './types'

export const CHARACTERS: CharacterDefinition[] = [
  {
    id: 'egg',
    name: '奶蛋',
    title: '圆乎乎，也挺能扛',
    ability: '蛋壳缓冲：撞完以后多一点保护',
    tradeoff: '冲刺能量攒得慢 8%',
    price: 0,
    unlockRequirement: { runs: 0, captures: 0 },
    accent: '#ffd84f',
    surfImage: 'assets/characters/egg-surf.png',
    surfWebp: 'assets/characters/egg-surf.game.webp',
    showcaseImage: 'assets/showcase/egg.png',
    showcaseWebp: 'assets/showcase/egg.webp'
  },
  {
    id: 'mouse',
    name: '奶鼠',
    title: '大耳朵先听见浪',
    ability: '顺风耳：附近道具更容易吸过来',
    tradeoff: '起步加速慢 5%',
    price: 180,
    unlockRequirement: { runs: 3, captures: 0 },
    accent: '#f4bd62',
    surfImage: 'assets/characters/mouse-surf.png',
    surfWebp: 'assets/characters/mouse-surf.game.webp',
    showcaseImage: 'assets/showcase/mouse.png',
    showcaseWebp: 'assets/showcase/mouse.webp'
  },
  {
    id: 'chicken',
    name: '奶鸡',
    title: '拍着翅膀往前冲',
    ability: '扑翅冲刺：一次能冲得更久',
    tradeoff: '转向稍慢 5%',
    price: 400,
    unlockRequirement: { runs: 8, captures: 4 },
    accent: '#f57955',
    surfImage: 'assets/characters/chicken-surf.png',
    surfWebp: 'assets/characters/chicken-surf.game.webp',
    showcaseImage: 'assets/showcase/chicken.png',
    showcaseWebp: 'assets/showcase/chicken.webp'
  },
  {
    id: 'dog',
    name: '奶狗',
    title: '笑呵呵的救生员',
    ability: '咧嘴护航：泡泡盾更耐用',
    tradeoff: '开局冲刺能量少 10%',
    price: 750,
    unlockRequirement: { runs: 15, captures: 8 },
    accent: '#f4c172',
    surfImage: 'assets/characters/dog-surf.png',
    surfWebp: 'assets/characters/dog-surf.game.webp',
    showcaseImage: 'assets/showcase/dog.png',
    showcaseWebp: 'assets/showcase/dog.webp'
  },
  {
    id: 'frog',
    name: '奶蛙',
    title: '拐弯最快的浪友',
    ability: '蛙泳急转：转向更灵活',
    tradeoff: '平路速度慢 6%',
    price: 1200,
    unlockRequirement: { runs: 24, captures: 16 },
    accent: '#ffcf45',
    surfImage: 'assets/characters/frog-surf.png',
    surfWebp: 'assets/characters/frog-surf.game.webp',
    showcaseImage: 'assets/showcase/frog.png',
    showcaseWebp: 'assets/showcase/frog.webp'
  }
]

export const UNLOCK_ORDER: CharacterId[] = ['egg', 'mouse', 'chicken', 'dog', 'frog']
export const CURRENT_GUIDE_VERSION = 5

export const MODES: ModeDefinition[] = [
  {
    id: 'endless',
    name: '无尽浪潮',
    kicker: '浪不停，你也别停',
    description: '躲开障碍，顺手捞点奶滴。奶鲨会从浪边追上来，找准时机把它送进渔网。',
    scoreLabel: '最高距离',
    icon: '∞'
  },
  {
    id: 'timeTrial',
    name: '计时试炼',
    kicker: '看清倒计时，再冲出去',
    description: '冲完固定 1200 米。每捡一枚奶滴都能缩短用时，稳一点反而更快。',
    scoreLabel: '最快用时',
    icon: '⏱'
  },
  {
    id: 'zigzag',
    name: '发夹弯',
    kicker: '左右穿门，连住这一浪',
    description: '瞄准漂浮浪门连续穿过。漏掉一道，本轮连门挑战立即结束。',
    scoreLabel: '最高连门',
    icon: '≋'
  },
  {
    id: 'extreme',
    name: '极限模式',
    kicker: '五条命，冲到底',
    description: '障碍和事件来得更急，奶鲨也更活跃。生命耗尽就结束，不能复活。',
    scoreLabel: '最高距离',
    icon: '!'
  }
]

export const DIFFICULTIES: DifficultyDefinition[] = [
  {
    id: 'easy',
    name: '简单',
    description: '先熟悉转向和冲刺。浪面更宽，但仍会随着时间逐渐加压。',
    speed: 1.16,
    spacing: 0.88,
    rampGain: 0.26,
    monsterPressure: 1.25,
    reward: 1,
    rowWindow: 1.32,
    hazardWeights: [0.58, 0.42, 0, 0]
  },
  {
    id: 'medium',
    name: '中等',
    description: '标准节奏。越到后面浪越快，障碍与奶鲨都会持续加压。',
    speed: 1.44,
    spacing: 0.64,
    rampGain: 0.53,
    monsterPressure: 1.78,
    reward: 1.12,
    rowWindow: 1.16,
    hazardWeights: [0.28, 0.52, 0.2, 0]
  },
  {
    id: 'hard',
    name: '困难',
    description: '浪面拥挤，奶鲨贴着浪尾追。留给失误的空间已经很少。',
    speed: 1.87,
    spacing: 0.44,
    rampGain: 0.78,
    monsterPressure: 2.45,
    reward: 1.28,
    rowWindow: 1.05,
    hazardWeights: [0, 0.2, 0.5, 0.3]
  },
  {
    id: 'hell',
    name: '地狱',
    description: '高速起浪，障碍成排压来。只留给熟练浪友一条窄路。',
    speed: 2.56,
    spacing: 0.33,
    rampGain: 1.04,
    monsterPressure: 3.28,
    reward: 1.48,
    rowWindow: 1.05,
    hazardWeights: [0, 0.1, 0.48, 0.42]
  }
]

export const DEFAULT_SETTINGS = {
  musicVolume: 0.24,
  sfxVolume: 0.55,
  highVisibility: false,
  reducedSpeed: false,
  reducedMotion: false
}

export function createDefaultSave(): SaveData {
  return {
    version: 1,
    milkCoins: 0,
    unlocked: ['egg'],
    character: 'egg',
    records: {},
    totalRuns: 0,
    totalCaptures: 0,
    tutorialSeen: false,
    guideVersion: 0,
    recentTransactions: [],
    settings: { ...DEFAULT_SETTINGS }
  }
}

export function getMode(mode: GameMode): ModeDefinition {
  return MODES.find((item) => item.id === mode) ?? MODES[0]
}

export function getDifficulty(difficulty: Difficulty): DifficultyDefinition {
  return DIFFICULTIES.find((item) => item.id === difficulty) ?? DIFFICULTIES[1]
}

export function getCharacter(character: CharacterId): CharacterDefinition {
  return CHARACTERS.find((item) => item.id === character) ?? CHARACTERS[0]
}

export function recordKey(mode: GameMode, difficulty: Difficulty): string {
  return `${mode}:${difficulty}`
}

export function formatScore(mode: GameMode, value: number): string {
  if (!value) return '—'
  if (mode === 'timeTrial') return `${value.toFixed(2)} 秒`
  if (mode === 'zigzag') return `${Math.round(value)} 连`
  if (mode === 'extreme') return `${Math.round(value)} 米`
  return `${Math.round(value)} 米`
}

export function getNextUnlock(save: SaveData): CharacterDefinition | undefined {
  const nextId = UNLOCK_ORDER.find((id) => !save.unlocked.includes(id))
  return nextId ? getCharacter(nextId) : undefined
}

export function getUnlockProgress(
  save: SaveData,
  character: CharacterDefinition
): {
  runsMet: boolean
  capturesMet: boolean
  requirementsMet: boolean
  coinsMet: boolean
  canUnlock: boolean
} {
  const runsMet = save.totalRuns >= character.unlockRequirement.runs
  const capturesMet = save.totalCaptures >= character.unlockRequirement.captures
  const requirementsMet = runsMet && capturesMet
  const coinsMet = save.milkCoins >= character.price
  return {
    runsMet,
    capturesMet,
    requirementsMet,
    coinsMet,
    canUnlock: requirementsMet && coinsMet
  }
}
