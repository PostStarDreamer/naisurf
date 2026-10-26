import { describe, expect, it } from 'vitest'
import { buildFeedbackIssueUrl } from './feedback'

describe('GitHub feedback link', () => {
  it('builds a public prefilled Issue URL without embedding credentials', () => {
    const url = new URL(buildFeedbackIssueUrl('手机端很好玩\n希望继续更新'))
    expect(url.origin).toBe('https://github.com')
    expect(url.pathname).toBe('/PostStarDreamer/naisurf/issues/new')
    expect(url.searchParams.get('labels')).toBe('feedback')
    expect(url.searchParams.get('title')).toBe('[奶浪反馈] 手机端很好玩')
    expect(url.searchParams.get('body')).toContain('希望继续更新')
    expect(url.searchParams.get('body')).toContain('页面版本：1.6')
    expect(url.toString()).not.toMatch(/token|secret|authorization/i)
  })

  it('rejects empty and oversized feedback', () => {
    expect(() => buildFeedbackIssueUrl(' ')).toThrow()
    expect(() => buildFeedbackIssueUrl('a'.repeat(501))).toThrow()
  })
})
