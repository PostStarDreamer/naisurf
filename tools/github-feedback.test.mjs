import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  exportGithubFeedback,
  fetchFeedbackIssues,
  mergeFeedbackFile,
  selectUnexportedIssues
} from './github-feedback.mjs'

const dirs = []

async function tempPaths() {
  const dir = await mkdtemp(join(tmpdir(), 'naisurf-github-feedback-'))
  dirs.push(dir)
  return {
    dir,
    statePath: join(dir, 'exported.json'),
    outputPath: join(dir, 'inbox.txt')
  }
}

function issue(number, state = 'open') {
  return {
    number,
    title: `反馈 ${number}`,
    body: `Issue 正文 ${number}`,
    createdAt: `2026-10-26T10:0${number % 10}:00Z`,
    state
  }
}

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('GitHub feedback export', () => {
  it('reads paginated public issues and excludes pull requests', async () => {
    const pages = [
      [
        {
          number: 1,
          title: '反馈一',
          body: '正文',
          created_at: '2026-10-26T10:00:00Z',
          state: 'open',
          labels: [{ name: 'feedback' }]
        },
        {
          number: 2,
          title: 'PR',
          body: '',
          created_at: '2026-10-26T10:01:00Z',
          state: 'open',
          labels: [{ name: 'feedback' }],
          pull_request: {}
        }
      ],
      [
        {
          number: 3,
          title: '反馈三',
          body: '正文三',
          created_at: '2026-10-26T10:02:00Z',
          state: 'closed',
          labels: [{ name: 'feedback' }]
        }
      ]
    ]
    const fetchImpl = async (_url, options) => {
      expect(options.headers['User-Agent']).toBe('naisurf-feedback-export')
      const page = new URL(_url).searchParams.get('page')
      return {
        ok: true,
        json: async () => pages[Number(page) - 1] ?? []
      }
    }
    const result = await fetchFeedbackIssues(fetchImpl, 2)
    expect(result.map((item) => item.number)).toEqual([1, 3])
    expect(result[1].state).toBe('closed')
  })

  it('does nothing without unexported issues', async () => {
    const paths = await tempPaths()
    const result = await exportGithubFeedback({
      ...paths,
      fetchIssues: async () => [issue(1)]
    })
    expect(result.written).toBe(true)
    const empty = await exportGithubFeedback({
      ...paths,
      fetchIssues: async () => [issue(1)]
    })
    expect(empty.written).toBe(false)
    await expect(
      exportGithubFeedback({
        ...paths,
        outputPath: join(paths.dir, 'empty.txt'),
        fetchIssues: async () => []
      })
    ).resolves.toMatchObject({ written: false, count: 0 })
  })

  it('exports all of three, then exactly five of eight', async () => {
    const paths = await tempPaths()
    const three = await exportGithubFeedback({
      ...paths,
      fetchIssues: async () => [1, 2, 3].map((number) => issue(number)),
      now: new Date('2026-10-26T20:05:00+08:00'),
      random: () => 0.4
    })
    expect(three.count).toBe(3)

    const eight = await exportGithubFeedback({
      ...paths,
      statePath: join(paths.dir, 'exported-eight.json'),
      outputPath: join(paths.dir, 'inbox-eight.txt'),
      fetchIssues: async () =>
        [4, 5, 6, 7, 8, 9, 10, 11].map((number) => issue(number)),
      now: new Date('2026-10-26T20:05:00+08:00'),
      random: () => 0.42
    })
    expect(eight.count).toBe(5)
    expect(new Set(eight.issueNumbers).size).toBe(5)
  })

  it('keeps the latest thirty date sections', () => {
    const sections = Array.from({ length: 32 }, (_, index) => {
      const date = new Date(Date.UTC(2026, 8, 1 + index))
        .toISOString()
        .slice(0, 10)
      return `=== ${date} ===\n- [#${index + 1}] 历史`
    }).join('\n\n')
    const merged = mergeFeedbackFile(
      sections,
      [issue(99)],
      new Date('2026-10-26T20:05:00+08:00')
    )
    expect(merged.match(/^=== /gm)).toHaveLength(30)
    expect(merged).toContain('[#99] 反馈 99')
    expect(merged).not.toContain('[#1] 历史')
  })

  it('does not mark issues when GitHub or the target file fails', async () => {
    const paths = await tempPaths()
    await expect(
      exportGithubFeedback({
        ...paths,
        fetchIssues: async () => {
          throw new Error('network down')
        }
      })
    ).rejects.toThrow('network down')

    await expect(
      exportGithubFeedback({
        ...paths,
        outputPath: paths.dir,
        fetchIssues: async () => [issue(9)]
      })
    ).rejects.toBeTruthy()
    const stateExists = await stat(paths.statePath).then(
      () => true,
      () => false
    )
    expect(stateExists).toBe(false)
  })

  it('selects only unexported issue numbers', () => {
    const selected = selectUnexportedIssues(
      [issue(1), issue(2), issue(3)],
      [1],
      5,
      () => 0.5
    )
    expect(selected.map((item) => item.number).sort()).toEqual([2, 3])
  })
})
