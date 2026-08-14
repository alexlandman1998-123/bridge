import { createPublicAgentCardEventsResponse, writeNodeJsonResponse } from '../../server/services/publicAgentCardEventsApi.js'

export default async function handler(request, response) {
  const payload = await createPublicAgentCardEventsResponse({
    method: request.method,
    url: request.url,
    headers: request.headers,
    body: request.body,
  })
  writeNodeJsonResponse(response, payload)
}
