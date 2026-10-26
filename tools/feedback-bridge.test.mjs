import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createFeedbackBridgeServer } from './feedback-bridge.mjs'
import { loadFeedbackStore } from './feedback-store.mjs'

const dirs = []

async function startServer() {
  const dir = await mkdtemp(join(tmpdir(), 'naisurf-bridge-'))
  dirs.push(dir)
  const storePath = join(dir, 'feedback.json')
  const server = createFeedbackBridgeServer({ storePath })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  return {
    server,
    storePath,
    url: `http://127.0.0.1:${address.port}`,
    origin: 'https://poststardreamer.github.io'
  }
}

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('feedback bridge API', () => {
  it('answers health checks and saves validated plain text', async () => {
    const bridge = await startServer()
    try {
      const health = await fetch(`${bridge.url}/health`, {
        headers: { Origin: bridge.origin }
      })
      expect(health.status).toBe(200)
      const response = await fetch(`${bridge.url}/feedback`, {
        method: 'POST',
        headers: {
          Origin: bridge.origin,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ content: '手机端很好玩' })
      })
      expect(response.status).toBe(201)
      const store = await loadFeedbackStore(bridge.storePath)
      expect(store.records).toHaveLength(1)
      expect(store.records[0].content).toBe('手机端很好玩')
    } finally {
      await new Promise((resolve) => bridge.server.close(resolve))
    }
  })

  it('rejects unknown origins, wrong content types and oversized bodies', async () => {
    const bridge = await startServer()
    try {
      const forbidden = await fetch(`${bridge.url}/feedback`, {
        method: 'POST',
        headers: {
          Origin: 'https://example.com',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ content: '不应保存' })
      })
      expect(forbidden.status).toBe(403)

      const wrongType = await fetch(`${bridge.url}/feedback`, {
        method: 'POST',
        headers: { Origin: bridge.origin, 'Content-Type': 'text/plain' },
        body: '不应保存'
      })
      expect(wrongType.status).toBe(415)

      const oversized = await fetch(`${bridge.url}/feedback`, {
        method: 'POST',
        headers: {
          Origin: bridge.origin,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ content: 'a'.repeat(9000) })
      })
      expect(oversized.status).toBe(400)
    } finally {
      await new Promise((resolve) => bridge.server.close(resolve))
    }
  })

  it('supports the browser private-network preflight', async () => {
    const bridge = await startServer()
    try {
      const response = await fetch(`${bridge.url}/feedback`, {
        method: 'OPTIONS',
        headers: {
          Origin: bridge.origin,
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Private-Network': 'true'
        }
      })
      expect(response.status).toBe(204)
      expect(response.headers.get('access-control-allow-origin')).toBe(bridge.origin)
      expect(response.headers.get('access-control-allow-private-network')).toBe('true')
    } finally {
      await new Promise((resolve) => bridge.server.close(resolve))
    }
  })
})
