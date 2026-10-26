const BRIDGE_URL = (
  import.meta.env.VITE_FEEDBACK_BRIDGE_URL ?? 'http://127.0.0.1:4317'
).replace(/\/$/, '')

async function bridgeRequest(path: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 1200)
  try {
    return await fetch(`${BRIDGE_URL}${path}`, {
      ...init,
      signal: controller.signal,
      cache: 'no-store'
    })
  } finally {
    window.clearTimeout(timeout)
  }
}

export async function checkFeedbackBridge(): Promise<boolean> {
  if (!navigator.onLine) return false
  try {
    const response = await bridgeRequest('/health')
    return response.ok
  } catch {
    return false
  }
}

export async function submitFeedback(content: string): Promise<void> {
  const response = await bridgeRequest('/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content })
  })
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(body.message ?? '反馈保存失败')
  }
}
