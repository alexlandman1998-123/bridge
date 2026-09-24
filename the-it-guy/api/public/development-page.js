import { createDevelopmentPageResponse } from '../../server/services/publicDevelopmentShareApi.js'

export default async function handler(request, response) {
  const result = await createDevelopmentPageResponse({ method: request.method, url: request.url, headers: request.headers })
  response.statusCode = result.status
  for (const [key, value] of Object.entries(result.headers || {})) response.setHeader(key, value)
  response.end(result.body || '')
}
