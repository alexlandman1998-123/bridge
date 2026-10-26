import { simpleParser } from 'mailparser'
export const BODY_LIMIT = 524288, FILE_LIMIT = 10485760, MESSAGE_FILE_LIMIT = 20971520
export class ReceiveError extends Error {
  constructor(code, retrySeconds = 60) { super(code); this.code = code; this.retrySeconds = retrySeconds }
}
export const fail = code => { throw new ReceiveError(code) }
export function limited(value) {
  const bytes = Buffer.from(String(value || ''))
  return { value: bytes.subarray(0, BODY_LIMIT).toString('utf8').replace(/\uFFFD$/, ''), limited: bytes.length > BODY_LIMIT }
}
export async function headers(entries = []) {
  const safe = entries.map(h => `${String(h.name).replace(/[\r\n:]/g, '')}: ${String(h.value).replace(/[\r\n]+/g, ' ')}`).join('\r\n')
  const parsed = await simpleParser(Buffer.from(safe.slice(0, 131072) + '\r\n\r\n'), { skipHtmlToText: true, skipTextToHtml: true })
  return { senderAddress: parsed.from?.value?.[0]?.address || '', senderName: parsed.from?.value?.[0]?.name || '',
    to: [parsed.to, parsed.cc].flatMap(field => field?.value?.map(v => v.address).filter(Boolean) || []),
    replyTo: parsed.replyTo?.value?.map(v=>v.address).filter(Boolean) || [], subject: parsed.subject || '', internetMessageId: parsed.messageId || null, inReplyTo: parsed.inReplyTo || null,
    references: (Array.isArray(parsed.references) ? parsed.references : parsed.references ? [parsed.references] : []).slice(-100) }
}
export function bodyMessage(message, plain, html) {
  const text = limited(plain), rich = limited(html)
  return { ...message, bodyText: text.value, bodyHtml: rich.value, contentStatus: text.limited || rich.limited ? 'body_limited' : 'complete' }
}
export async function readBytes(response, max = 32 * 1024 * 1024) {
  if (Number(response.headers.get('content-length')) > max) { await response.body?.cancel(); fail('provider_payload_too_large') }
  const reader = response.body?.getReader(); if (!reader) return Buffer.alloc(0)
  const chunks = []; let size = 0
  try { while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > max) fail('provider_payload_too_large'); chunks.push(value) } }
  finally { await reader.cancel().catch(() => {}) }
  return Buffer.concat(chunks)
}
export function api(token, origin, fetcher = fetch, pathPrefix = '/') {
  return async (url, options = {}) => {
    const parsed = new URL(url, origin)
    if (parsed.origin !== origin || !parsed.pathname.startsWith(pathPrefix) || parsed.username || parsed.password) fail('provider_continuation_invalid')
    let response
    try { response = await fetcher(parsed, { ...options, redirect: 'error', signal: AbortSignal.timeout(45000), headers: { ...options.headers, authorization: `Bearer ${token}` } }) }
    catch { fail('provider_unavailable') }
    if (!response.ok) {
      await response.body?.cancel()
      if ((response.status === 404 && options.allowMissing) || (response.status === 410 && options.allowExpired)) return null
      if (response.status === 401 || response.status === 403) fail('oauth_access_revoked')
      throw new ReceiveError(response.status === 429 ? 'provider_rate_limited' : 'provider_unavailable', Math.min(3600, Math.max(30, Number(response.headers.get('retry-after')) || 60)))
    }
    if (options.bytes) return readBytes(response, options.max)
    try { return JSON.parse((await readBytes(response, options.max)).toString('utf8')) } catch (e) { if (e instanceof ReceiveError) throw e; fail('provider_response_invalid') }
  }
}
