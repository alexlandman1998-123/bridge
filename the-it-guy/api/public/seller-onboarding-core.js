import { createSellerOnboardingCoreResponse } from '../../server/services/sellerOnboardingCoreApi.js'
import { writeNodeJsonResponse } from '../../server/services/hqMissionControlApi.js'

export default async function handler(request, response) {
  const payload = await createSellerOnboardingCoreResponse({
    method: request.method,
    url: request.url,
    headers: request.headers,
  })
  writeNodeJsonResponse(response, payload)
}
