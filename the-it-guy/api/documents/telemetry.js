import { createDocumentTelemetryResponse, readDocumentTelemetryBody, telemetryResponse } from '../../server/services/documentUploadTelemetryApi.js'
import { writeNodeJsonResponse } from '../../server/services/hqMissionControlApi.js'
export default async function handler(request, response) {
  try {
    const body = request.method === 'POST' ? await readDocumentTelemetryBody(request) : null
    writeNodeJsonResponse(response, await createDocumentTelemetryResponse({ method: request.method, headers: request.headers, body }))
  } catch { writeNodeJsonResponse(response, telemetryResponse(400, { accepted: false })) }
}
