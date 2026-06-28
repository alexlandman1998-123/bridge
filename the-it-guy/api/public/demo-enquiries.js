import { createPublicDemoEnquiriesResponse, writeNodeJsonResponse } from '../../server/services/publicDemoEnquiriesApi.js'

async function readRequestBody(request) {
  if (Buffer.isBuffer(request.body)) return JSON.parse(request.body.toString('utf8') || '{}')
  if (request.body && typeof request.body === 'object') return request.body
  if (typeof request.body === 'string') return JSON.parse(request.body || '{}')
  const chunks = []
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  const raw = Buffer.concat(chunks).toString('utf8')
  return raw ? JSON.parse(raw) : {}
}

export default async function handler(request, response) {
  const body = request.method === 'POST' ? await readRequestBody(request).catch(() => ({})) : null
  const payload = await createPublicDemoEnquiriesResponse({
    method: request.method,
    headers: request.headers,
    body,
  })
  writeNodeJsonResponse(response, payload)
}
