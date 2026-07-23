import { createSellerOnboardingBrandingResponse } from '../../server/services/sellerOnboardingBrandingApi.js'
import { writeNodeJsonResponse } from '../../server/services/hqMissionControlApi.js'

export default async function handler(request, response) {
  const payload = await createSellerOnboardingBrandingResponse({
    method: request.method,
    url: request.url,
    headers: request.headers,
  })
  writeNodeJsonResponse(response, payload)
}

