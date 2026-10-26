import { handleAiCampaign } from '../../server/services/aiCampaignApi.js'
import { writeNodeJsonResponse } from '../../server/services/hqMissionControlApi.js'
export const config = { maxDuration: 60 }
export default async function handler(request, response) {
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Cache-Control', 'no-store')
  try {
    let body = request.body
    if (!body) {
      const chunks = []; let size = 0
      for await (const chunk of request) { size += Buffer.byteLength(chunk); if (size > 18000) throw new Error('Too large'); chunks.push(Buffer.from(chunk)) }
      body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
    } else if (typeof body === 'string') body = JSON.parse(body)
    writeNodeJsonResponse(response, await handleAiCampaign({ method: request.method, headers: request.headers, body }))
  } catch { writeNodeJsonResponse(response, { status: 400, body: { error: 'Invalid campaign request.' } }) }
}
