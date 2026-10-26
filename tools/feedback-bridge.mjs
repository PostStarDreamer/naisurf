import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import { addFeedback, getDefaultStorePath } from './feedback-store.mjs'

export const DEFAULT_PORT = 4317
const ALLOWED_ORIGINS = new Set([
  'https://poststardreamer.github.io',
  'http://127.0.0.1:5173',
  'http://localhost:5173',
  'http://127.0.0.1:4173',
  'http://localhost:4173'
])
const MAX_BODY_BYTES = 8 * 1024

function setCorsHeaders(request, response) {
  const origin = request.headers.origin
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    response.setHeader('Access-Control-Allow-Origin', origin)
    response.setHeader('Vary', 'Origin')
  }
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  response.setHeader('Access-Control-Allow-Private-Network', 'true')
}

function sendJson(response, status, body) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  })
  response.end(JSON.stringify(body))
}

async function readJsonBody(request) {
  const chunks = []
  let bytes = 0
  for await (const chunk of request) {
    bytes += chunk.length
    if (bytes > MAX_BODY_BYTES) throw new Error('请求内容过大')
    chunks.push(chunk)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new Error('请求不是有效 JSON')
  }
}

export function createFeedbackBridgeServer({
  storePath = getDefaultStorePath()
} = {}) {
  return createServer(async (request, response) => {
    setCorsHeaders(request, response)
    const origin = request.headers.origin
    if (!origin || !ALLOWED_ORIGINS.has(origin)) {
      sendJson(response, 403, { ok: false, message: '不允许的请求来源' })
      return
    }
    if (request.method === 'OPTIONS') {
      response.writeHead(204)
      response.end()
      return
    }
    if (request.method === 'GET' && request.url === '/health') {
      sendJson(response, 200, { ok: true })
      return
    }
    if (request.method !== 'POST' || request.url !== '/feedback') {
      sendJson(response, 404, { ok: false, message: '接口不存在' })
      return
    }
    if (!request.headers['content-type']?.startsWith('application/json')) {
      sendJson(response, 415, { ok: false, message: '只接受 JSON 请求' })
      return
    }
    try {
      const body = await readJsonBody(request)
      const record = await addFeedback(body.content, { storePath })
      sendJson(response, 201, { ok: true, id: record.id })
    } catch (error) {
      sendJson(response, 400, {
        ok: false,
        message: error instanceof Error ? error.message : '反馈保存失败'
      })
    }
  })
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const server = createFeedbackBridgeServer()
  const port = Number(process.env.NAISURF_FEEDBACK_PORT ?? DEFAULT_PORT)
  server.listen(port, '127.0.0.1', () => {
    console.log(`naisurf feedback bridge listening on 127.0.0.1:${port}`)
  })
}
