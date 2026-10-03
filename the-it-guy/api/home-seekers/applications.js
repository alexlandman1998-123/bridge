import { createHomeSeekersRecruitmentResponse } from '../../server/services/homeSeekersRecruitmentApi.js'
import { writeNodeJsonResponse } from '../../server/services/hqMissionControlApi.js'

export default async function handler(request, response) {
  if (request.method !== 'POST') return writeNodeJsonResponse(response, await createHomeSeekersRecruitmentResponse({ method: request.method }))
  try {
    let body = request.body
    if (!body) {
      const chunks = []
      let size = 0
      for await (const chunk of request) {
        size += Buffer.byteLength(chunk)
        if (size > 16384) return writeNodeJsonResponse(response, { status: 413, body: { error: 'Application is too large.' } })
        chunks.push(Buffer.from(chunk))
      }
      body = Buffer.concat(chunks).toString('utf8')
    }
    if (Buffer.byteLength(typeof body === 'string' ? body : JSON.stringify(body)) > 16384) return writeNodeJsonResponse(response, { status: 413, body: { error: 'Application is too large.' } })
    if (typeof body === 'string') body = JSON.parse(body)
    writeNodeJsonResponse(response, await createHomeSeekersRecruitmentResponse({ method: request.method, headers: request.headers, body }))
  } catch {
    writeNodeJsonResponse(response, { status: 400, body: { error: 'Invalid application request.' } })
  }
}
