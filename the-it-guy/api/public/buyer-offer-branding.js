import { createBuyerOfferBrandingResponse } from '../../server/services/buyerOfferBrandingApi.js'
import { writeNodeJsonResponse } from '../../server/services/hqMissionControlApi.js'

export default async function handler(request, response) {
  const payload = await createBuyerOfferBrandingResponse({
    method: request.method,
    url: request.url,
    headers: request.headers,
  })
  writeNodeJsonResponse(response, payload)
}
