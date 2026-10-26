import { CHARACTERS, UNLOCK_ORDER, createDefaultSave, getCharacter } from './data'
import type { CharacterId, RunResult, SaveData } from './types'

const SAVE_KEY = 'naisurf:save:v1'

export function loadSave(): SaveData {
  const fallback = createDefaultSave()
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as Partial<SaveData>
    if (parsed.version !== 1) return fallback
    const unlocked: CharacterId[] = Array.isArray(parsed.unlocked)
      ? parsed.unlocked.filter((id): id is CharacterId =>
          CHARACTERS.some((character) => character.id === id)
        )
      : ['egg']
    if (!unlocked.includes('egg')) unlocked.unshift('egg')

    const records = Object.fromEntries(
      Object.entries(parsed.records ?? {}).filter(([key]) => !key.startsWith('collector:'))
    )

    return {
      ...fallback,
      ...parsed,
      version: 1,
      guideVersion: parsed.guideVersion ?? 0,
      unlocked,
      records,
      settings: { ...fallback.settings, ...(parsed.settings ?? {}) }
    }
  } catch {
    return fallback
  }
}

export function persistSave(save: SaveData): void {
  localStorage.setItem(SAVE_KEY, JSON.stringify(save))
}

export function resetRecords(save: SaveData): SaveData {
  return { ...save, records: {} }
}

export function resetAll(): SaveData {
  localStorage.removeItem(SAVE_KEY)
  return createDefaultSave()
}

export function tryUnlockNext(save: SaveData): { save: SaveData; unlocked?: CharacterId } {
  const nextId = UNLOCK_ORDER.find((id) => !save.unlocked.includes(id))
  if (!nextId) return { save }
  const character = getCharacter(nextId)
  if (save.milkCoins < character.price) return { save }
  return {
    save: {
      ...save,
      milkCoins: save.milkCoins - character.price,
      unlocked: [...save.unlocked, nextId],
      character: nextId
    },
    unlocked: nextId
  }
}

export function applyRunResult(save: SaveData, result: RunResult): {
  save: SaveData
  newRecord: boolean
} {
  const key = `${result.mode}:${result.difficulty}`
  const oldValue = save.records[key] ?? 0
  const isBetter =
    result.shouldCountRecord &&
    (!oldValue ||
      (result.mode === 'timeTrial'
        ? result.recordValue < oldValue
        : result.recordValue > oldValue))

  return {
    save: {
      ...save,
      milkCoins:
        save.milkCoins +
        Math.max(0, result.earnedMilk - (result.captureMilk ?? 0)),
      totalRuns: save.totalRuns + 1,
      totalCaptures: save.totalCaptures + result.captures,
      records: isBetter ? { ...save.records, [key]: result.recordValue } : save.records
    },
    newRecord: isBetter
  }
}

export function creditCaptureReward(save: SaveData, amount = 10): SaveData {
  return { ...save, milkCoins: save.milkCoins + amount }
}
