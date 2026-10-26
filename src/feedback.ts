const ISSUE_BASE_URL =
  'https://github.com/PostStarDreamer/naisurf/issues/new'

export function buildFeedbackIssueUrl(content: string): string {
  const normalized = content.replace(/\r\n?/g, '\n').trim()
  if (normalized.length < 2 || normalized.length > 500) {
    throw new Error('反馈内容需为 2–500 字')
  }
  const summary = normalized.split('\n')[0].slice(0, 36)
  const body = `${normalized}\n\n---\n来自 naisurf 玩家反馈\n页面版本：1.6`
  const params = new URLSearchParams({
    labels: 'feedback',
    title: `[奶浪反馈] ${summary}`,
    body
  })
  return `${ISSUE_BASE_URL}?${params.toString()}`
}

export function openFeedbackIssue(content: string): string {
  const url = buildFeedbackIssueUrl(content)
  window.open(url, '_blank', 'noopener,noreferrer')
  return url
}
