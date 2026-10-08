import { privatePropertyStatisticsCronResponse } from '../../server/private-property/statisticsApi.js'

export const config = { maxDuration: 300 }

export default async function handler(request, response) {
  const result = await privatePropertyStatisticsCronResponse({ method: request.method, headers: request.headers })
  response.statusCode = result.status
  for (const [key, value] of Object.entries(result.headers)) response.setHeader(key, value)
  response.end(JSON.stringify(result.body))
}
