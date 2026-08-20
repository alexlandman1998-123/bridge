import {
  createProperty24LeadSyncResponse,
  readNodeRequestBody,
  writeNodeJsonResponse,
} from '../../../server/property24/index.js'

export default async function handler(request, response) {
  const body = await readNodeRequestBody(request)
  const payload = await createProperty24LeadSyncResponse({
    method: request.method,
    url: request.url,
    headers: request.headers,
    body,
  })
  writeNodeJsonResponse(response, payload)
}
