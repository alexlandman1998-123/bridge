import { createMissionControlResponse, writeNodeJsonResponse } from '../../server/services/hqMissionControlApi.js'

export default async function handler(request, response) {
  const payload = await createMissionControlResponse({
    method: request.method,
    headers: request.headers,
  })
  writeNodeJsonResponse(response, payload)
}
