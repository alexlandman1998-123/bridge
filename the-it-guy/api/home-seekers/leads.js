import { createHomeSeekersLeadCaptureResponse } from '../../server/services/homeSeekersLeadCaptureApi.js'
import { writeHomeSeekersJsonResponse as writeNodeJsonResponse } from '../../server/services/homeSeekersApiResponse.js'

const MAX_BODY_BYTES = 16 * 1024

async function readBody(request) {
  const tooLarge = () => Object.assign(new Error('Request is too large.'), { status: 413 })
  if (Number(request.headers?.['content-length'] || 0) > MAX_BODY_BYTES) throw tooLarge()
  if (request.body && typeof request.body === 'object' && !Buffer.isBuffer(request.body)) {
    if (Buffer.byteLength(JSON.stringify(request.body), 'utf8') > MAX_BODY_BYTES) throw tooLarge()
    return request.body
  }
  if (typeof request.body === 'string' || Buffer.isBuffer(request.body)) {
    if (Buffer.byteLength(request.body, 'utf8') > MAX_BODY_BYTES) throw tooLarge()
    return JSON.parse(request.body.toString() || '{}')
  }
  const chunks = []
  let size = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size <= MAX_BODY_BYTES) chunks.push(buffer)
    else chunks.length = 0
  }
  if (size > MAX_BODY_BYTES) throw tooLarge()
  const raw = Buffer.concat(chunks).toString('utf8')
  return raw ? JSON.parse(raw) : {}
}

export default async function handler(request, response) {
  if (process.env.VERCEL_ENV === 'preview') return writeNodeJsonResponse(response, { status: 503, body: { error: 'This preview does not send enquiries. Your details have not been sent.' } })
  let body = {}
  try {
    if (request.method === 'POST') body = await readBody(request)
  } catch (error) {
    writeNodeJsonResponse(response, { status: error.status === 413 ? 413 : 400, body: { error: error.status === 413 ? 'Request is too large.' : 'Invalid request body.' } })
    return
  }
  const payload = await createHomeSeekersLeadCaptureResponse({ method: request.method, headers: request.headers, body })
  writeNodeJsonResponse(response, payload)
}
