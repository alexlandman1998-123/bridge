import { createHash } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

export const EXTERNAL_WEBSITE_BODY_LIMIT = 16 * 1024
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TOKEN = /^a9w_([0-9a-f-]{36})_[0-9a-f]{64}$/i
const text = (value, limit) => typeof value === 'string' && value.length <= limit ? value.trim() : ''
export const tokenHash = (value) => createHash('sha256').update(value).digest('hex')
export function externalWebsiteClient(env = process.env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('backend_unavailable')
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
}
const invalid = (message) => { throw Object.assign(new Error(message), { code: '22023' }) }
const json = (status, body) => ({ status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store', ...(status === 429 ? { 'Retry-After': '60' } : {}) }, body })

export async function readExternalWebsiteBody(request) {
  const tooLarge = () => Object.assign(new Error('Request exceeds 16 KiB.'), { status: 413 })
  if (Number(request.headers?.['content-length']) > EXTERNAL_WEBSITE_BODY_LIMIT) throw tooLarge()
  if (request.body != null) {
    const raw = typeof request.body === 'string' || Buffer.isBuffer(request.body) ? request.body.toString() : JSON.stringify(request.body)
    if (Buffer.byteLength(raw) > EXTERNAL_WEBSITE_BODY_LIMIT) throw tooLarge()
    return JSON.parse(raw)
  }
  let size = 0
  const chunks = []
  for await (const chunk of request) {
    size += Buffer.byteLength(chunk)
    if (size > EXTERNAL_WEBSITE_BODY_LIMIT) throw tooLarge()
    chunks.push(Buffer.from(chunk))
  }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}
}

function listingParams(search) {
  const result = {}
  const allowed = new Set(['limit', 'offset', 'sort', 'transactionType', 'listingType', 'propertyType', 'location', 'minPrice', 'maxPrice', 'bedrooms', 'branchId', 'developmentId', 'updatedSince', 'cursor'])
  for (const [key, value] of search) {
    if (!allowed.has(key) || value.length > 160 || Object.hasOwn(result, key)) invalid(`Invalid query parameter: ${key}.`)
    result[key] = value
  }
  if (result.listingType) { result.transactionType = result.listingType; delete result.listingType }
  for (const key of ['limit', 'offset', 'bedrooms']) if (result[key] != null && (!/^\d+$/.test(result[key]) || Number(result[key]) > (key === 'offset' ? 100000 : key === 'limit' ? 100 : 100))) invalid(`Invalid ${key}.`)
  if (result.limit === '0') invalid('Limit must be at least 1.')
  if (result.cursor != null && (!/^\d{1,18}$/.test(result.cursor) || BigInt(result.cursor) > 9223372036854775807n)) invalid('Invalid change cursor.')
  for (const key of ['minPrice', 'maxPrice']) if (result[key] != null && (!/^\d{1,12}(\.\d{1,2})?$/.test(result[key]))) invalid(`Invalid ${key}.`)
  if (result.minPrice && result.maxPrice && Number(result.minPrice) > Number(result.maxPrice)) invalid('Minimum price exceeds maximum price.')
  for (const key of ['branchId', 'developmentId']) if (result[key] != null && !UUID.test(result[key])) invalid(`Invalid ${key}.`)
  if (result.updatedSince && (!/^\d{4}-\d{2}-\d{2}T/.test(result.updatedSince) || !Number.isFinite(Date.parse(result.updatedSince)))) invalid('Use an ISO date for updatedSince.')
  if (result.transactionType && !['sale', 'rental'].includes(result.transactionType)) invalid('Choose sale or rental.')
  if (result.sort && !['updated_desc', 'price_asc', 'price_desc'].includes(result.sort)) invalid('Invalid sort order.')
  return result
}

function enquiryParams(body, headers) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) invalid('Expected an enquiry object.')
  const allowed = new Set(['name', 'email', 'phone', 'message', 'listingId', 'developmentId', 'sourcePageUrl', 'utm', 'consent', 'idempotencyKey', 'externalSubmissionId'])
  for (const key of Object.keys(body)) if (!allowed.has(key)) invalid(`Unsupported enquiry field: ${key}.`)
  const consent = body.consent
  if (!consent || typeof consent !== 'object' || Array.isArray(consent) || consent.privacyAccepted !== true || !text(consent.wordingVersion, 160) || !text(consent.wording, 2000)
    || (consent.marketingConsent != null && typeof consent.marketingConsent !== 'boolean')) invalid('Record privacy acceptance, consent wording and its version. Marketing consent is optional and separate.')
  let page
  try { page = new URL(text(body.sourcePageUrl, 2048)) } catch { invalid('Provide the source page URL.') }
  if (page.protocol !== 'https:' || page.username || page.password) invalid('Use an HTTPS source page URL.')
  const payload = {
    name: text(body.name, 160), email: text(body.email, 254).toLowerCase(), phone: text(body.phone, 64), message: text(body.message || '', 4000),
    sourcePageUrl: page.href, consent: { privacyAccepted: true, marketingConsent: consent.marketingConsent === true, wording: consent.wording.trim(), wordingVersion: consent.wordingVersion.trim() },
    idempotencyKey: text(headers['idempotency-key'] || body.idempotencyKey || body.externalSubmissionId, 128), utm: {},
  }
  if (payload.name.length < 2 || (!payload.email && !payload.phone) || (payload.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) || (payload.phone && !/^\+?[0-9 ()-]{7,64}$/.test(payload.phone))
    || !/^[A-Za-z0-9._:-]{16,128}$/.test(payload.idempotencyKey)) invalid('Provide a name, valid email or telephone, and a submission ID of 16–128 characters.')
  for (const [key, limit] of [['email',254], ['phone',64], ['message',4000]]) if (body[key] != null && (typeof body[key] !== 'string' || body[key].length > limit)) invalid(`Invalid ${key}.`)
  for (const key of ['listingId', 'developmentId']) if (body[key] != null) { if (!UUID.test(body[key])) invalid(`Invalid ${key}.`); payload[key] = body[key] }
  if (body.utm != null && (typeof body.utm !== 'object' || Array.isArray(body.utm))) invalid('Invalid campaign values.')
  for (const key of ['utmSource','utmMedium','utmCampaign','utmTerm','utmContent']) if (body.utm?.[key] != null) { if (typeof body.utm[key] !== 'string' || body.utm[key].length > 160) invalid(`Invalid ${key}.`); payload.utm[key] = body.utm[key].trim() }
  payload.requestHash = tokenHash(JSON.stringify(payload))
  return payload
}

export async function createExternalWebsiteResponse({ method = 'GET', url = '', headers = {}, body = {}, client, getClient = externalWebsiteClient } = {}) {
  const credential = String(headers.authorization || '').replace(/^Bearer\s+/i, '')
  const match = credential.match(TOKEN)
  if (!match || !UUID.test(match[1])) return json(401, { error: 'invalid_credentials', message: 'Use a website backend credential in the Authorization header.' })
  let action
  let admin
  try {
    if (Buffer.byteLength(JSON.stringify(body)) > EXTERNAL_WEBSITE_BODY_LIMIT) return json(413, { error: 'payload_too_large', message: 'Request exceeds 16 KiB.' })
    const parsed = new URL(url, 'https://app.arch9.co.za')
    const path = parsed.pathname.replace(/\/$/, '')
    const id = path.match(/^\/api\/integrations\/v1\/listings\/([^/]+)$/)?.[1]
    action = path === '/api/integrations/v1/leads' ? 'lead' : path === '/api/integrations/v1/listings' ? 'listings' : path === '/api/integrations/v1/changes' ? 'changes' : id ? 'listing' : null
    if (!action) return json(404, { error: 'route_not_found' })
    if (method !== (action === 'lead' ? 'POST' : 'GET')) return json(405, { error: 'method_not_allowed' })
    if (id && !UUID.test(id)) invalid('Invalid listing ID.')
    admin = client || getClient()
    const params = action === 'lead' ? enquiryParams(body, headers) : { ...listingParams(parsed.searchParams), ...(id ? { id } : {}) }
    const result = await admin.rpc('external_website_request', { p_connection_id: match[1], p_token_hash: tokenHash(credential), p_action: action, p_params: params })
    if (result.error) throw result.error
    return json(result.data.status, result.data.body)
  } catch (error) {
    const status = error.code === '42501' ? 403 : error.code === 'P0002' ? 404 : error.code === '23505' ? 409 : ['22023','22P02','22007','22008'].includes(error.code) ? 400 : 503
    if (admin && status < 500) {
      try { await admin.rpc('external_website_record_failure', { p_connection_id: match[1], p_token_hash: tokenHash(credential), p_action: action || 'request', p_outcome: `rejected_${status}` }) } catch { /* Failure logging must not replace the useful validation response. */ }
    }
    return json(status, { error: status === 409 ? 'idempotency_conflict' : status === 404 ? 'target_not_found' : status === 400 ? 'validation_failed' : 'integration_unavailable', message: status >= 500 ? 'Website integration is temporarily unavailable.' : error.message })
  }
}
