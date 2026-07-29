import { createPublicAgencyIntakeResponse, writeNodeJsonResponse } from '../../server/services/publicAgencyIntakeApi.js'

export default async function handler(request, response) {
  const payload = await createPublicAgencyIntakeResponse({
    method: request.method,
    url: request.url,
    headers: request.headers,
    body: request.body,
  })
  writeNodeJsonResponse(response, payload)
}
