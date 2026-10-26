import { randomInt } from 'node:crypto'
import { dirname, join } from 'node:path'
import {
  mkdir,
  readFile,
  rename,
  unlink,
  writeFile
} from 'node:fs/promises'

export const GITHUB_REPOSITORY = 'PostStarDreamer/naisurf'
export const FEEDBACK_LABEL = 'feedback'
export const DEFAULT_OUTPUT_PATH =
  'D:\\FILES\\AI generated\\奶浪冲浪祭反馈信箱.txt'

export function getExportedStatePath() {
  const localAppData =
    process.env.LOCALAPPDATA ?? join(process.cwd(), '.localappdata')
  return join(localAppData, 'naisurf-feedback', 'exported-issues.json')
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

export async function fetchFeedbackIssues(
  fetchImpl = fetch,
  perPage = 100
) {
  const issues = []
  for (let page = 1; page <= 20; page += 1) {
    const params = new URLSearchParams({
      state: 'all',
      labels: FEEDBACK_LABEL,
      per_page: String(perPage),
      page: String(page)
    })
    const response = await fetchImpl(
      `https://api.github.com/repos/${GITHUB_REPOSITORY}/issues?${params}`,
      {
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': 'naisurf-feedback-export'
        }
      }
    )
    if (!response.ok) {
      throw new Error(`GitHub feedback request failed: ${response.status}`)
    }
    const rows = await response.json()
    if (!Array.isArray(rows)) throw new Error('GitHub feedback response is invalid')
    issues.push(
      ...rows
        .filter(
          (issue) =>
            !issue.pull_request &&
            issue.labels?.some((label) => label.name === FEEDBACK_LABEL)
        )
        .map((issue) => ({
          number: issue.number,
          title: String(issue.title ?? ''),
          body: String(issue.body ?? ''),
          createdAt: String(issue.created_at ?? ''),
          state: String(issue.state ?? '')
        }))
    )
    if (rows.length < perPage) break
  }
  return issues
}

async function loadExportedIssues(statePath) {
  try {
    const parsed = JSON.parse(await readFile(statePath, 'utf8'))
    if (parsed?.version !== 1 || !Array.isArray(parsed.exportedIssueNumbers)) {
      throw new Error('反馈导出状态格式无效')
    }
    return parsed.exportedIssueNumbers.filter(Number.isInteger)
  } catch (error) {
    if (error?.code === 'ENOENT') return []
    throw error
  }
}

async function saveExportedIssues(statePath, issueNumbers) {
  await atomicWrite(
    statePath,
    `${JSON.stringify(
      {
        version: 1,
        exportedIssueNumbers: [...new Set(issueNumbers)].sort((left, right) => left - right),
        updatedAt: new Date().toISOString()
      },
      null,
      2
    )}\n`
  )
}

export function selectUnexportedIssues(
  issues,
  exportedNumbers,
  count = 5,
  random = Math.random
) {
  const exported = new Set(exportedNumbers)
  const pool = issues.filter((issue) => !exported.has(issue.number))
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1))
    ;[pool[index], pool[target]] = [pool[target], pool[index]]
  }
  return pool.slice(0, Math.max(0, count))
}

function formatIssue(issue) {
  const body = (issue.body || '（无正文）')
    .trim()
    .replace(/\r\n?/g, '\n')
    .replace(/\n/g, '\n  ')
  return `- [#${issue.number}] ${issue.title.trim() || '（无标题）'}\n  ${body}`
}

export function mergeFeedbackFile(existing, selected, now = new Date()) {
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const today = `${year}-${month}-${day}`
  const sections = new Map()
  const pattern =
    /^=== (\d{4}-\d{2}-\d{2}) ===\r?\n([\s\S]*?)(?=\r?\n=== \d{4}-\d{2}-\d{2} ===|$)/gm
  for (const match of existing.matchAll(pattern)) {
    sections.set(match[1], match[2].trim())
  }
  const additions = selected.map(formatIssue).join('\n\n')
  const previous = sections.get(today)
  sections.set(today, [previous, additions].filter(Boolean).join('\n\n'))

  const recent = [...sections.entries()]
    .sort(([left], [right]) => right.localeCompare(left))
    .slice(0, 30)
    .sort(([left], [right]) => left.localeCompare(right))
  return `${recent
    .map(([date, content]) => `=== ${date} ===\n${content}`)
    .join('\n\n')}\n`
}

export async function exportGithubFeedback({
  statePath = getExportedStatePath(),
  outputPath = process.env.NAISURF_FEEDBACK_OUTPUT ?? DEFAULT_OUTPUT_PATH,
  now = new Date(),
  random = () => randomInt(1_000_000_000) / 1_000_000_000,
  fetchIssues = fetchFeedbackIssues
} = {}) {
  const issues = await fetchIssues()
  const exportedNumbers = await loadExportedIssues(statePath)
  const selected = selectUnexportedIssues(
    issues,
    exportedNumbers,
    5,
    random
  )
  if (!selected.length) {
    return { written: false, count: 0, issueNumbers: [] }
  }

  let existing = ''
  try {
    existing = await readFile(outputPath, 'utf8')
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
  await atomicWrite(outputPath, mergeFeedbackFile(existing, selected, now))
  await saveExportedIssues(statePath, [
    ...exportedNumbers,
    ...selected.map((issue) => issue.number)
  ])
  return {
    written: true,
    count: selected.length,
    issueNumbers: selected.map((issue) => issue.number)
  }
}
