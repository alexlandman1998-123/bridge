import { whatsappAccessToken } from './metaCredentials.ts'

export async function campaignMeta(connection: { meta_access_token: string; token_ciphertext?: string }, path: string, payload?: unknown) {
  const version = Deno.env.get('WHATSAPP_GRAPH_VERSION') || 'v23.0'
  if (!/^v\d+\.\d+$/.test(version)) throw new Error('Invalid Meta Graph API version configuration.')
  const token = await whatsappAccessToken(connection)
  const response = await fetch(`https://graph.facebook.com/${version}/${path}`, { method: payload ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(payload ? { body: JSON.stringify(payload) } : {}), signal: AbortSignal.timeout(15000) })
  const body = await response.json()
  if (!response.ok || body.error) {
    throw Object.assign(new Error(`Meta: ${body.error?.message || 'Request failed'}${body.error?.code ? ` (${body.error.code})` : ''}`), { definitive: response.status >= 400 && response.status < 500 })
  }
  return body
}
