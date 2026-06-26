import { createPublicListingsResponse, writeNodeJsonResponse } from '../../server/services/publicListingsApi.js'

export default async function handler(request, response) {
  const payload = await createPublicListingsResponse({
    method: request.method,
    url: request.url,
    headers: request.headers,
  })
  writeNodeJsonResponse(response, payload)
}
