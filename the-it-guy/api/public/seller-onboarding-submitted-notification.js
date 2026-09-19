import { createSellerOnboardingSubmissionNotificationResponse } from '../../server/services/sellerOnboardingSubmissionNotificationApi.js'
import { writeNodeJsonResponse } from '../../server/services/hqMissionControlApi.js'

export default async function handler(request, response) {
  const payload = await createSellerOnboardingSubmissionNotificationResponse({ method: request.method, body: request.body })
  writeNodeJsonResponse(response, payload)
}
