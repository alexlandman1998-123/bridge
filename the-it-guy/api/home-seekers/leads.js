import { createHomeSeekersLeadCaptureResponse } from '../../server/services/homeSeekersLeadCaptureApi.js'
import { writeNodeJsonResponse } from '../../server/services/hqMissionControlApi.js'

async function readBody(request) {
  if (request.body && typeof request.body === 'object') return request.body
  if (typeof request.body === 'string') return JSON.parse(request.body || '{}')
  const chunks = []
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  const raw = Buffer.concat(chunks).toString('utf8')
  return raw ? JSON.parse(raw) : {}
}

export default async function handler(request, response) {
  const body = request.method === 'POST' ? await readBody(request).catch(() => ({})) : {}
  const payload = await createHomeSeekersLeadCaptureResponse({ method: request.method, headers: request.headers, body })
  writeNodeJsonResponse(response, payload)
}
