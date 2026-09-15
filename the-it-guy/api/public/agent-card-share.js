import { createPublicAgentCardShareResponse, writeNodeTextResponse } from '../../server/services/publicAgentCardShareApi.js'

export default async function handler(request, response) {
  writeNodeTextResponse(response, await createPublicAgentCardShareResponse({ method: request.method, url: request.url, headers: request.headers }))
}
