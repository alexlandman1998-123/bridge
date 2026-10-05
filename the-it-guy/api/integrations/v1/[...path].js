import { createExternalWebsiteResponse, readExternalWebsiteBody } from '../../../server/services/externalWebsiteApi.js'
import { writeNodeJsonResponse } from '../../../server/services/hqMissionControlApi.js'

export default async function handler(request, response) {
  let body = {}
  try { if (request.method === 'POST') body = await readExternalWebsiteBody(request) }
  catch (error) { return writeNodeJsonResponse(response, { status: error.status === 413 ? 413 : 400, headers: { 'Cache-Control': 'no-store' }, body: { error: error.status === 413 ? 'payload_too_large' : 'invalid_json' } }) }
  return writeNodeJsonResponse(response, await createExternalWebsiteResponse({ method: request.method, url: request.url, headers: request.headers, body }))
}
