import { createHomeSeekersSignupResponse } from '../../server/services/homeSeekersRecruitmentSignupApi.js'
import { writeHomeSeekersJsonResponse } from '../../server/services/homeSeekersApiResponse.js'

export default async function handler(request, response) {
  if (request.method !== 'POST') return writeHomeSeekersJsonResponse(response, await createHomeSeekersSignupResponse({ method: request.method }))
  try {
    let body = request.body
    if (!body) {
      const chunks = []; let size = 0
      for await (const chunk of request) {
        size += Buffer.byteLength(chunk)
        if (size > 16000) return writeHomeSeekersJsonResponse(response, { status: 413, body: { error: 'Recruitment request is too large.' } })
        chunks.push(Buffer.from(chunk))
      }
      body = Buffer.concat(chunks).toString('utf8')
    }
    if (Buffer.byteLength(typeof body === 'string' ? body : JSON.stringify(body)) > 16000) return writeHomeSeekersJsonResponse(response, { status: 413, body: { error: 'Recruitment request is too large.' } })
    if (typeof body === 'string') body = JSON.parse(body)
    return writeHomeSeekersJsonResponse(response, await createHomeSeekersSignupResponse({ method: request.method, headers: request.headers, body }))
  } catch { return writeHomeSeekersJsonResponse(response, { status: 400, body: { error: 'Invalid recruitment request.' } }) }
}
