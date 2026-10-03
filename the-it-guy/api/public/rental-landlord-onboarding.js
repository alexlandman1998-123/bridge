import { handlePublicRentalLandlordOnboarding } from '../../server/services/rentalLandlordOnboardingApi.js'
import { writeNodeJsonResponse } from '../../server/services/publicRentalApplicationApi.js'
export default async function handler(request, response) {
  writeNodeJsonResponse(
    response,
    await handlePublicRentalLandlordOnboarding({
      method: request.method,
      headers: request.headers,
      body: request.body,
    }),
  )
}
