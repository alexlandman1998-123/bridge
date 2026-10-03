import { handleRentalLandlordOnboarding } from '../../server/services/rentalLandlordOnboardingApi.js'
import { writeNodeJsonResponse } from '../../server/services/publicRentalApplicationApi.js'
export default async function handler(request, response) {
  writeNodeJsonResponse(
    response,
    await handleRentalLandlordOnboarding({
      method: request.method,
      headers: request.headers,
      body: request.method === 'GET' ? request.query : request.body,
    }),
  )
}
