import { createDealSetupRecoveryResponse } from '../../server/services/dealSetupRecovery.js'
import { writeNodeJsonResponse } from '../../server/services/hqMissionControlApi.js'

export const config = { maxDuration: 240 }
export default async function handler(request, response) {
  writeNodeJsonResponse(response, await createDealSetupRecoveryResponse({ method: request.method, headers: request.headers }))
}
