import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  exportFeedback,
  loadFeedbackStore,
  mergeFeedbackFile,
  normalizeFeedbackContent,
  saveFeedbackStore,
  selectUnexported
} from './feedback-store.mjs'

const tempDirs = []

async function tempPaths() {
  const dir = await mkdtemp(join(tmpdir(), 'naisurf-feedback-'))
  tempDirs.push(dir)
  return {
    dir,
    storePath: join(dir, 'feedback.json'),
    outputPath: join(dir, 'inbox.txt')
  }
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('local feedback store', () => {
  it('validates and normalizes plain-text feedback', () => {
    expect(normalizeFeedbackContent('  好')).toBeUndefined()
    expect(normalizeFeedbackContent(' 很好玩\r\n下次还来 ')).toBe('很好玩\n下次还来')
    expect(normalizeFeedbackContent('a'.repeat(501))).toBeUndefined()
  })

  it('does nothing when there is no unexported feedback', async () => {
    const paths = await tempPaths()
    await saveFeedbackStore(
      {
        version: 1,
        records: [
          {
            id: 'old',
            content: '已经导出',
            createdAt: '2026-10-20T10:00:00.000Z',
            exportedAt: '2026-10-21T00:05:00.000Z'
          }
        ]
      },
      paths.storePath
    )
    const result = await exportFeedback(paths)
    expect(result.written).toBe(false)
    await expect(stat(paths.outputPath)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('exports all records when fewer than five are waiting', async () => {
    const paths = await tempPaths()
    await saveFeedbackStore(
      {
        version: 1,
        records: Array.from({ length: 3 }, (_, index) => ({
          id: `record-${index}`,
          content: `反馈 ${index}`,
          createdAt: `2026-10-26T10:0${index}:00.000Z`,
          exportedAt: null
        }))
      },
      paths.storePath
    )
    const result = await exportFeedback({
      ...paths,
      now: new Date('2026-10-26T20:10:00+08:00'),
      random: () => 0.5
    })
    expect(result.count).toBe(3)
    expect(await readFile(paths.outputPath, 'utf8')).toContain('=== 2026-10-26 ===')
    const store = await loadFeedbackStore(paths.storePath)
    expect(store.records.every((record) => record.exportedAt)).toBe(true)
  })

  it('randomly exports exactly five of eight and keeps the rest unexported', async () => {
    const paths = await tempPaths()
    const records = Array.from({ length: 8 }, (_, index) => ({
      id: `record-${index}`,
      content: `反馈内容 ${index}`,
      createdAt: `2026-10-26T10:0${index}:00.000Z`,
      exportedAt: null
    }))
    await saveFeedbackStore({ version: 1, records }, paths.storePath)
    const result = await exportFeedback({
      ...paths,
      now: new Date('2026-10-26T20:10:00+08:00'),
      random: () => 0.42
    })
    expect(result.count).toBe(5)
    const store = await loadFeedbackStore(paths.storePath)
    expect(store.records.filter((record) => !record.exportedAt)).toHaveLength(3)
    expect(new Set(result.ids).size).toBe(5)
  })

  it('keeps only the latest thirty dated sections when appending', () => {
    const sections = Array.from({ length: 32 }, (_, index) => {
      const date = new Date(Date.UTC(2026, 8, 1 + index))
        .toISOString()
        .slice(0, 10)
      return `=== ${date} ===\n- [10:00] 历史 ${index}`
    }).join('\n\n')
    const merged = mergeFeedbackFile(
      sections,
      [
        {
          id: 'new',
          content: '今天的新反馈',
          createdAt: '2026-10-26T12:00:00.000Z',
          exportedAt: null
        }
      ],
      new Date('2026-10-26T20:05:00+08:00')
    )
    expect(merged.match(/^=== /gm)).toHaveLength(30)
    expect(merged).toContain('今天的新反馈')
    expect(merged).not.toContain('历史 0')
  })

  it('keeps records unexported when the target cannot be written', async () => {
    const paths = await tempPaths()
    await saveFeedbackStore(
      {
        version: 1,
        records: [
          {
            id: 'pending',
            content: '写入失败也不能丢',
            createdAt: '2026-10-26T10:00:00.000Z',
            exportedAt: null
          }
        ]
      },
      paths.storePath
    )
    await expect(
      exportFeedback({
        ...paths,
        outputPath: paths.dir,
        now: new Date('2026-10-26T20:10:00+08:00')
      })
    ).rejects.toBeTruthy()
    const store = await loadFeedbackStore(paths.storePath)
    expect(store.records[0].exportedAt).toBeNull()
  })
})
