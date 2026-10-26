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
    showcaseImage: 'assets/showcase/egg.png'
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
    showcaseImage: 'assets/showcase/mouse.png'
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
    showcaseImage: 'assets/showcase/chicken.png'
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
    showcaseImage: 'assets/showcase/dog.png'
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
    showcaseImage: 'assets/showcase/frog.png'
  }
]

export const UNLOCK_ORDER: CharacterId[] = ['egg', 'mouse', 'chicken', 'dog', 'frog']
export const CURRENT_GUIDE_VERSION = 3

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
    description: '瞄准漂浮浪门连续穿过。漏掉一道，连门数就会重新开始。',
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
    description: '先熟悉转向和冲刺。浪面更宽，留给你反应的时间也更多。',
    speed: 1,
    spacing: 1,
    rampGain: 0.12,
    monsterPressure: 1,
    reward: 1,
    rowWindow: 1.55
  },
  {
    id: 'medium',
    name: '中等',
    description: '标准节奏。障碍、奶鲨和道具都会认真招呼你。',
    speed: 1.18,
    spacing: 0.8,
    rampGain: 0.22,
    monsterPressure: 1.25,
    reward: 1.12,
    rowWindow: 1.45
  },
  {
    id: 'hard',
    name: '困难',
    description: '浪面更挤，奶鲨追得更紧。适合已经摸熟手感的浪友。',
    speed: 1.46,
    spacing: 0.62,
    rampGain: 0.3,
    monsterPressure: 1.6,
    reward: 1.28,
    rowWindow: 1.35
  },
  {
    id: 'hell',
    name: '地狱',
    description: '开局就很凶，后面还会一路加速。留好冲刺，别眨眼。',
    speed: 2.05,
    spacing: 0.48,
    rampGain: 0.4,
    monsterPressure: 1.95,
    reward: 1.48,
    rowWindow: 1.35
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
