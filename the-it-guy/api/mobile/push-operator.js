import { createMobileWebPushOperatorResponse, readMobileWebPushBody } from '../../server/services/mobileWebPushApi.js'
import { writeNodeJsonResponse } from '../../server/services/hqMissionControlApi.js'

export default async function handler(request, response) {
  try {
    const body = request.method === 'POST' ? await readMobileWebPushBody(request) : {}
    writeNodeJsonResponse(response, await createMobileWebPushOperatorResponse({ method: request.method, headers: request.headers, body }))
  } catch (error) {
    writeNodeJsonResponse(response, { status: error.status || 400, body: { message: 'Invalid notification request.' } })
  }
}
