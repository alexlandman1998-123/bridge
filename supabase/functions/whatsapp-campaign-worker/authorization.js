// Same legacy-JWT / opaque-key contract as the existing marketing worker.
async function sameCredential(left, right) {
  const encoder = new TextEncoder()
  const [a, b] = await Promise.all([left, right].map(async (value) => new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)))))
  let difference = 0
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i]
  return difference === 0
}
/** @param {Request} request @param {{ legacy: string, secrets?: string[] }} credentials */
export async function authorizeCampaignWorker(request, credentials) {
  const { legacy, secrets = [] } = credentials
  const apiKey = (request.headers.get('apikey') || '').trim()
  const authorization = (request.headers.get('authorization') || '').trim()
  const bearer = authorization.match(/^Bearer\s+(.+)$/i)?.[1] || ''
  if (authorization && !bearer) return false
  if ((!apiKey && !bearer) || apiKey.length > 8192 || bearer.length > 8192) return false
  if (apiKey && bearer && !await sameCredential(apiKey, bearer)) return false
  if (!apiKey && bearer.startsWith('sb_secret_')) return false
  const matches = await Promise.all([legacy, ...secrets].filter(Boolean).map((value) => sameCredential(apiKey || bearer, value)))
  return matches.some(Boolean)
}
