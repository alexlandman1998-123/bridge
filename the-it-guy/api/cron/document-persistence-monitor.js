import { createDocumentPersistenceMonitorResponse } from '../../server/services/documentPersistenceMonitoringService.js'
import { writeNodeJsonResponse } from '../../server/services/hqMissionControlApi.js'
export const config = { maxDuration: 120 }
export default async function handler(request, response) {
  writeNodeJsonResponse(response, await createDocumentPersistenceMonitorResponse({ method: request.method, headers: request.headers }))
}
