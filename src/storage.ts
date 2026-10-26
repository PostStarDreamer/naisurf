import {
  CHARACTERS,
  UNLOCK_ORDER,
  createDefaultSave,
  getCharacter,
  getUnlockProgress
} from './data'
import type {
  CharacterId,
  RunResult,
  SaveData,
  WalletTransaction
} from './types'

const SAVE_KEY = 'naisurf:save:v1'
const MAX_RECENT_TRANSACTIONS = 128

export interface WalletCommitResult {
  save: SaveData
  balance: number
  appliedIds: string[]
  rejected: Array<{ id: string; reason: 'duplicate' | 'invalid' | 'insufficient' }>
}

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
      recentTransactions: Array.isArray(parsed.recentTransactions)
        ? parsed.recentTransactions.filter((id): id is string => typeof id === 'string')
        : [],
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

export function applyWalletTransactions(
  save: SaveData,
  transactions: WalletTransaction[]
): WalletCommitResult {
  let milkCoins = save.milkCoins
  let totalCaptures = save.totalCaptures
  let unlocked = [...save.unlocked]
  let character = save.character
  const recent = [...save.recentTransactions]
  const recentSet = new Set(recent)
  const appliedIds: string[] = []
  const rejected: WalletCommitResult['rejected'] = []
  const batchIds = new Set<string>()

  for (const transaction of transactions) {
    if (
      !transaction.id ||
      !Number.isFinite(transaction.amount) ||
      !Number.isInteger(transaction.amount) ||
      (transaction.amount === 0 && transaction.kind !== 'distanceSettlement') ||
      recentSet.has(transaction.id) ||
      batchIds.has(transaction.id)
    ) {
      rejected.push({
        id: transaction.id,
        reason:
          recentSet.has(transaction.id) || batchIds.has(transaction.id)
            ? 'duplicate'
            : 'invalid'
      })
      continue
    }

    if (transaction.kind === 'unlock') {
      const unlockCharacter = transaction.characterId
        ? getCharacter(transaction.characterId)
        : undefined
      if (
        !unlockCharacter ||
        unlocked.includes(unlockCharacter.id) ||
        transaction.amount !== -unlockCharacter.price
      ) {
        rejected.push({ id: transaction.id, reason: 'invalid' })
        continue
      }
      const progress = getUnlockProgress(
        { ...save, milkCoins, totalRuns: save.totalRuns, totalCaptures, unlocked },
        unlockCharacter
      )
      if (!progress.canUnlock) {
        rejected.push({ id: transaction.id, reason: 'insufficient' })
        continue
      }
      milkCoins += transaction.amount
      unlocked = [...unlocked, unlockCharacter.id]
      character = unlockCharacter.id
    } else {
      if (milkCoins + transaction.amount < 0) {
        rejected.push({ id: transaction.id, reason: 'insufficient' })
        continue
      }
      milkCoins += transaction.amount
      if (transaction.kind === 'capture') {
        totalCaptures += 1
      }
    }

    batchIds.add(transaction.id)
    recentSet.add(transaction.id)
    recent.push(transaction.id)
    appliedIds.push(transaction.id)
  }

  return {
    save: {
      ...save,
      milkCoins,
      totalCaptures,
      unlocked,
      character,
      recentTransactions: recent.slice(-MAX_RECENT_TRANSACTIONS)
    },
    balance: milkCoins,
    appliedIds,
    rejected
  }
}

export function tryUnlockNext(save: SaveData): {
  save: SaveData
  unlocked?: CharacterId
  reason?: 'order' | 'coins' | 'runs' | 'captures'
} {
  const nextId = UNLOCK_ORDER.find((id) => !save.unlocked.includes(id))
  if (!nextId) return { save, reason: 'order' }
  const character = getCharacter(nextId)
  const progress = getUnlockProgress(save, character)
  if (!progress.coinsMet) return { save, reason: 'coins' }
  if (!progress.runsMet) return { save, reason: 'runs' }
  if (!progress.capturesMet) return { save, reason: 'captures' }
  const committed = applyWalletTransactions(save, [
    {
      id: `unlock:${character.id}`,
      kind: 'unlock',
      amount: -character.price,
      characterId: character.id
    }
  ])
  return {
    save: committed.save,
    unlocked: committed.appliedIds.length ? nextId : undefined,
    reason: committed.appliedIds.length ? undefined : 'coins'
  }
}

export function applyRunResult(save: SaveData, result: RunResult): {
  save: SaveData
  newRecord: boolean
} {
  const settlementId = `settlement:${result.runId}`
  const committed = applyWalletTransactions(save, [
    {
      id: settlementId,
      kind: 'distanceSettlement',
      amount: result.settlementMilk
    }
  ])
  if (!committed.appliedIds.includes(settlementId)) {
    return { save: committed.save, newRecord: false }
  }
  const key = `${result.mode}:${result.difficulty}`
  const oldValue = committed.save.records[key] ?? 0
  const isBetter =
    result.shouldCountRecord &&
    (!oldValue ||
      (result.mode === 'timeTrial'
        ? result.recordValue < oldValue
        : result.recordValue > oldValue))

  return {
    save: {
      ...committed.save,
      totalRuns: committed.save.totalRuns + 1,
      records: isBetter
        ? { ...committed.save.records, [key]: result.recordValue }
        : committed.save.records
    },
    newRecord: isBetter
  }
}
