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
    title: '圆滚滚的冲浪新星',
    ability: '蛋壳缓冲：受击无敌时间 +40%',
    tradeoff: '冲刺能量收益 -8%',
    price: 0,
    accent: '#ffd84f',
    image: 'assets/portraits/egg.svg',
    surfImage: 'assets/characters/egg-surf.svg'
  },
  {
    id: 'mouse',
    name: '奶鼠',
    title: '大耳听浪的拾贝手',
    ability: '大耳兜风：道具吸附范围 +30%',
    tradeoff: '加速响应 -5%',
    price: 60,
    accent: '#f4bd62',
    image: 'assets/portraits/mouse.svg',
    surfImage: 'assets/characters/mouse-surf.svg'
  },
  {
    id: 'chicken',
    name: '奶鸡',
    title: '扑翅冲刺的小太阳',
    ability: '扑翅冲刺：冲刺持续 +20%',
    tradeoff: '转向响应 -5%',
    price: 120,
    accent: '#f57955',
    image: 'assets/portraits/chicken.svg',
    surfImage: 'assets/characters/chicken-surf.svg'
  },
  {
    id: 'dog',
    name: '奶狗',
    title: '咧嘴护航的救生员',
    ability: '咧嘴护航：护盾持续 +30%',
    tradeoff: '初始冲刺能量 -10%',
    price: 180,
    accent: '#f4c172',
    image: 'assets/portraits/dog.svg',
    surfImage: 'assets/characters/dog-surf.svg'
  },
  {
    id: 'frog',
    name: '奶蛙',
    title: '长腿换向的浪尖舞者',
    ability: '蛙泳急转：转向响应 +20%',
    tradeoff: '常规最高速度 -6%',
    price: 240,
    accent: '#ffcf45',
    image: 'assets/portraits/frog.svg',
    surfImage: 'assets/characters/frog-surf.svg'
  }
]

export const UNLOCK_ORDER: CharacterId[] = ['egg', 'mouse', 'chicken', 'dog', 'frog']
export const CURRENT_GUIDE_VERSION = 1

export const MODES: ModeDefinition[] = [
  {
    id: 'endless',
    name: '无尽浪潮',
    kicker: '一直冲，别回头',
    description: '躲避障碍、收集奶滴，把猎奇奶怪甩在身后。',
    scoreLabel: '最高距离',
    icon: '∞'
  },
  {
    id: 'timeTrial',
    name: '计时试炼',
    kicker: '最短时间抵达终点',
    description: '固定 1200 米赛道，每枚奶滴都会替你抢回一点时间。',
    scoreLabel: '最快用时',
    icon: '⏱'
  },
  {
    id: 'zigzag',
    name: '发夹弯',
    kicker: '左右穿门，连住别断',
    description: '连续穿过漂浮浪门，漏掉一个就会重置连击。',
    scoreLabel: '最高连门',
    icon: '≋'
  },
  {
    id: 'collector',
    name: '奶滴收集',
    kicker: '贪心一点，再贪一点',
    description: '在生命耗尽前尽可能多捞奶滴，后期还要提防奶怪。',
    scoreLabel: '最高奶滴',
    icon: '●'
  }
]

export const DIFFICULTIES: DifficultyDefinition[] = [
  {
    id: 'easy',
    name: '简单',
    description: '浪面宽、障碍疏，适合先熟悉手感。',
    speed: 0.85,
    spacing: 1.25,
    rampGain: 0.1,
    monsterPressure: 0.84,
    reward: 1
  },
  {
    id: 'medium',
    name: '中等',
    description: '标准速度与奶怪压迫，原汁原味。',
    speed: 1,
    spacing: 1,
    rampGain: 0.18,
    monsterPressure: 1,
    reward: 1.12
  },
  {
    id: 'hard',
    name: '困难',
    description: '速度更快、海面更挤，奖励也更丰厚。',
    speed: 1.2,
    spacing: 0.82,
    rampGain: 0.26,
    monsterPressure: 1.28,
    reward: 1.28
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
  if (mode === 'collector') return `${Math.round(value)} 滴`
  return `${Math.round(value)} 米`
}

export function getNextUnlock(save: SaveData): CharacterDefinition | undefined {
  const nextId = UNLOCK_ORDER.find((id) => !save.unlocked.includes(id))
  return nextId ? getCharacter(nextId) : undefined
}
