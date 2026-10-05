import { createExternalWebsiteWorkerResponse } from '../../server/services/externalWebsiteDelivery.js'
import { writeNodeJsonResponse } from '../../server/services/hqMissionControlApi.js'

export default async function handler(request, response) {
  const result = await createExternalWebsiteWorkerResponse({ method: request.method, headers: request.headers })
  writeNodeJsonResponse(response, { ...result, headers: { 'Cache-Control': 'private, no-store' } })
}
