import { randomInt, randomUUID } from 'node:crypto'
import { dirname, join } from 'node:path'
import {
  mkdir,
  readFile,
  rename,
  unlink,
  writeFile
} from 'node:fs/promises'

export const DEFAULT_OUTPUT_PATH =
  'D:\\FILES\\AI generated\\奶浪冲浪祭反馈信箱.txt'

export function getDefaultStorePath() {
  const localAppData =
    process.env.LOCALAPPDATA ?? join(process.cwd(), '.localappdata')
  return join(localAppData, 'naisurf-feedback', 'feedback.json')
}

export function normalizeFeedbackContent(value) {
  if (typeof value !== 'string') return undefined
  const content = value.replace(/\r\n?/g, '\n').replace(/\0/g, '').trim()
  return content.length >= 2 && content.length <= 500 ? content : undefined
}

function emptyStore() {
  return { version: 1, records: [] }
}

export async function loadFeedbackStore(storePath = getDefaultStorePath()) {
  try {
    const raw = await readFile(storePath, 'utf8')
    const parsed = JSON.parse(raw)
    if (parsed?.version !== 1 || !Array.isArray(parsed.records)) {
      throw new Error('反馈数据文件格式无效')
    }
    return {
      version: 1,
      records: parsed.records.filter(
        (record) =>
          typeof record?.id === 'string' &&
          typeof record?.content === 'string' &&
          typeof record?.createdAt === 'string' &&
          (record.exportedAt === null || typeof record.exportedAt === 'string')
      )
    }
  } catch (error) {
    if (error?.code === 'ENOENT') return emptyStore()
    throw error
  }
}

async function atomicWrite(filePath, content) {
  await mkdir(dirname(filePath), { recursive: true })
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`
  await writeFile(tempPath, content, 'utf8')
  try {
    await rename(tempPath, filePath)
  } catch (error) {
    await unlink(tempPath).catch(() => undefined)
    throw error
  }
}

export async function saveFeedbackStore(store, storePath = getDefaultStorePath()) {
  await atomicWrite(storePath, `${JSON.stringify(store, null, 2)}\n`)
}

export async function addFeedback(
  content,
  {
    storePath = getDefaultStorePath(),
    now = new Date(),
    idFactory = randomUUID
  } = {}
) {
  const normalized = normalizeFeedbackContent(content)
  if (!normalized) throw new Error('反馈内容需为 2–500 字')
  const store = await loadFeedbackStore(storePath)
  const record = {
    id: idFactory(),
    content: normalized,
    createdAt: now.toISOString(),
    exportedAt: null
  }
  store.records.push(record)
  await saveFeedbackStore(store, storePath)
  return record
}

export function selectUnexported(records, count = 5, random = Math.random) {
  const pool = records.filter((record) => !record.exportedAt)
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1))
    ;[pool[index], pool[target]] = [pool[target], pool[index]]
  }
  return pool.slice(0, Math.max(0, count))
}

function localDateParts(now) {
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return { year, month, day, date: `${year}-${month}-${day}` }
}

function formatRecord(record) {
  const time = new Date(record.createdAt)
  const hours = String(time.getHours()).padStart(2, '0')
  const minutes = String(time.getMinutes()).padStart(2, '0')
  const content = record.content.replace(/\n/g, '\n  ')
  return `- [${hours}:${minutes}] ${content}`
}

export function mergeFeedbackFile(existing, selected, now = new Date()) {
  const today = localDateParts(now).date
  const sections = new Map()
  const pattern =
    /^=== (\d{4}-\d{2}-\d{2}) ===\r?\n([\s\S]*?)(?=\r?\n=== \d{4}-\d{2}-\d{2} ===|$)/gm
  for (const match of existing.matchAll(pattern)) {
    sections.set(match[1], match[2].trim())
  }
  const additions = selected.map(formatRecord).join('\n')
  const previous = sections.get(today)
  sections.set(today, [previous, additions].filter(Boolean).join('\n'))

  const recent = [...sections.entries()]
    .sort(([left], [right]) => right.localeCompare(left))
    .slice(0, 30)
    .sort(([left], [right]) => left.localeCompare(right))
  return `${recent
    .map(([date, content]) => `=== ${date} ===\n${content}`)
    .join('\n\n')}\n`
}

export async function exportFeedback({
  storePath = getDefaultStorePath(),
  outputPath = process.env.NAISURF_FEEDBACK_OUTPUT ?? DEFAULT_OUTPUT_PATH,
  now = new Date(),
  random = () => randomInt(1_000_000_000) / 1_000_000_000
} = {}) {
  const store = await loadFeedbackStore(storePath)
  const selected = selectUnexported(store.records, 5, random)
  if (!selected.length) {
    return { written: false, count: 0, ids: [] }
  }

  let existing = ''
  try {
    existing = await readFile(outputPath, 'utf8')
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
  const next = mergeFeedbackFile(existing, selected, now)
  await atomicWrite(outputPath, next)

  const exportedAt = now.toISOString()
  store.records = store.records.map((record) =>
    selected.some((item) => item.id === record.id)
      ? { ...record, exportedAt }
      : record
  )
  await saveFeedbackStore(store, storePath)
  return {
    written: true,
    count: selected.length,
    ids: selected.map((record) => record.id)
  }
}
