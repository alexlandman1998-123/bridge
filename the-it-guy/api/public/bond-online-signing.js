import { createBondOnlineSigningResponse } from '../../server/services/bond/bondOnlineSigningApi.js'
export default async function handler(request, response) {
  const payload = await createBondOnlineSigningResponse({ method: request.method, body: request.body, headers: request.headers })
  response.statusCode = payload.status
  for (const [name, value] of Object.entries(payload.headers)) response.setHeader(name, value)
  response.end(payload.body instanceof Uint8Array ? payload.body : JSON.stringify(payload.body))
}
