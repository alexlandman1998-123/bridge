export function writeHomeSeekersJsonResponse(response, payload) {
  response.statusCode = payload.status || 200
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...payload.headers,
  }
  for (const [name, value] of Object.entries(headers)) response.setHeader(name, value)
  response.end(payload.body == null ? undefined : JSON.stringify(payload.body))
}
