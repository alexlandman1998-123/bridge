import {
  createProperty24StatisticsSyncResponse,
  readNodeRequestBody,
  writeNodeJsonResponse,
} from '../../../server/property24/index.js'

export default async function handler(request, response) {
  const body = await readNodeRequestBody(request)
  const payload = await createProperty24StatisticsSyncResponse({
    method: request.method,
    headers: request.headers,
    body,
  })
  writeNodeJsonResponse(response, payload)
}
