import { privatePropertyStatisticsSettingsResponse } from '../../../server/private-property/statisticsApi.js'
import { readPrivatePropertySettingsBody } from '../../../server/private-property/settingsApi.js'

export const config = { maxDuration: 300 }

export default async function handler(request, response) {
  let result
  try {
    const body = request.method === 'POST' ? request.body || await readPrivatePropertySettingsBody(request) : {}
    result = await privatePropertyStatisticsSettingsResponse({ method: request.method, headers: request.headers, body: typeof body === 'string' ? JSON.parse(body) : body })
  } catch { result = { status: 400, headers: { 'Content-Type': 'application/json' }, body: { error: 'invalid_statistics_request' } } }
  response.statusCode = result.status
  for (const [key, value] of Object.entries(result.headers)) response.setHeader(key, value)
  response.end(JSON.stringify(result.body))
}
