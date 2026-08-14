import { createHash } from 'node:crypto'
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { writeNodeJsonResponse } from './hqMissionControlApi.js'

let cachedRuntimeEnv = null

const ALLOWED_EVENT_TYPES = new Set([
  'card_view',
  'call_click',
  'whatsapp_click',
  'email_click',
  'buyer_cta_click',
  'seller_cta_click',
  'listing_click',
  'vcf_download',
  'share_click',
  'copy_link',
  'website_click',
])

const ALLOWED_SOURCE_CHANNELS = new Set([
  'card',
  'instagram',
  'facebook',
  'linkedin',
  'website',
  'whatsapp',
  'email',
  'qr',
  'referral',
  'manual',
  'other',
])

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeLower(value = '') {
  return normalizeText(value).toLowerCase()
}

function normalizeSlug(value = '') {
  return normalizeLower(value)
}

function safeObject(value = {}) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {}
  return Object.fromEntries(
    fs
      .readFileSync(filePath, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const separatorIndex = line.indexOf('=')
        if (separatorIndex === -1) return [line, '']
        return [line.slice(0, separatorIndex), line.slice(separatorIndex + 1).replace(/^['"]|['"]$/g, '')]
      }),
  )
}

function getRuntimeEnv() {
  if (cachedRuntimeEnv) return cachedRuntimeEnv
  const rootEnvPath = new URL('../../.env', import.meta.url)
  const productionEnvPath = new URL('../../.env.production.local', import.meta.url)
  const stagingEnvPath = new URL('../../.env.staging.local', import.meta.url)
  const processEnvSource = globalThis?.process?.env || {}
  const processEnv = Object.fromEntries(Object.entries(processEnvSource).map(([key, value]) => [key, normalizeText(value)]))
  const merged = {
    ...parseEnvFile(rootEnvPath),
    ...parseEnvFile(productionEnvPath),
    ...parseEnvFile(stagingEnvPath),
    ...processEnv,
  }
  if (!merged.SUPABASE_URL && merged.VITE_SUPABASE_URL) merged.SUPABASE_URL = merged.VITE_SUPABASE_URL
  cachedRuntimeEnv = merged
  return cachedRuntimeEnv
}

function createServiceClient() {
  const env = getRuntimeEnv()
  const supabaseUrl = normalizeText(env.SUPABASE_URL || env.VITE_SUPABASE_URL)
  const serviceRoleKey = normalizeText(env.SUPABASE_SERVICE_ROLE_KEY)

  if (!supabaseUrl || !serviceRoleKey) {
    const error = new Error('Agent digital card event backend is not configured.')
    error.code = 'agent_card_events_backend_unconfigured'
    error.status = 503
    throw error
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  })
}

function buildJsonResponse(status, body, headers = {}) {
  return {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Accept',
      ...headers,
    },
    body,
  }
}

function normalizeMethod(value = '') {
  return normalizeText(value || 'POST').toUpperCase()
}

function getRequestUrl(url = '', headers = {}) {
  const host = normalizeText(headers.host || headers.Host) || 'app.arch9.co.za'
  const protocol = normalizeText(headers['x-forwarded-proto'] || headers['X-Forwarded-Proto']) || 'https'
  return new URL(url || '/api/public/agent-card-events', `${protocol}://${host}`)
}

async function readJsonBody(body = null) {
  if (!body) return {}
  if (typeof body === 'object' && !Buffer.isBuffer(body)) return body
  const text = Buffer.isBuffer(body) ? body.toString('utf8') : String(body || '')
  if (!text.trim()) return {}
  try {
    return JSON.parse(text)
  } catch {
    const error = new Error('Request body must be valid JSON.')
    error.code = 'invalid_json'
    error.status = 400
    throw error
  }
}

function isUuidLike(value = '') {
  return UUID_PATTERN.test(normalizeText(value))
}

function nullableUuid(value = '') {
  const normalized = normalizeText(value)
  return isUuidLike(normalized) ? normalized : null
}

function normalizeSourceChannel(value = '') {
  const channel = normalizeLower(value || 'card')
  return ALLOWED_SOURCE_CHANNELS.has(channel) ? channel : 'card'
}

function safeJsonObject(value = {}, maxBytes = 8192) {
  const object = safeObject(value)
  try {
    if (Buffer.byteLength(JSON.stringify(object), 'utf8') <= maxBytes) return object
  } catch {
    return {}
  }
  return { truncated: true }
}

function getRequestIp(headers = {}) {
  const forwarded = normalizeText(headers['x-forwarded-for'] || headers['X-Forwarded-For'])
  if (forwarded) return normalizeText(forwarded.split(',')[0])
  return normalizeText(headers['x-real-ip'] || headers['X-Real-IP'] || headers['cf-connecting-ip'] || headers['CF-Connecting-IP'])
}

function hashIpAddress(value = '') {
  const ip = normalizeText(value)
  if (!ip) return ''
  return createHash('sha256').update(ip).digest('hex').slice(0, 48)
}

export function normalizeAgentCardEventPayload(payload = {}, fallbackSlug = '') {
  const metadata = safeObject(payload.metadata || payload.metadata_json)
  const eventType = normalizeLower(payload.eventType || payload.event_type || payload.type)
  const slug = normalizeSlug(payload.slug || fallbackSlug)

  return {
    slug,
    eventType,
    sourceChannel: normalizeSourceChannel(payload.sourceChannel || payload.source_channel || metadata.sourceChannel || metadata.source_channel),
    listingId: nullableUuid(payload.listingId || payload.listing_id || metadata.listingId || metadata.listing_id),
    listingSlug: normalizeSlug(payload.listingSlug || payload.listing_slug || metadata.listingSlug || metadata.listing_slug).slice(0, 160) || null,
    metadata: safeJsonObject(metadata),
  }
}

export function validateAgentCardEventPayload(normalized = {}) {
  const errors = {}
  if (!normalized.slug) errors.slug = 'Agent card slug is required.'
  if (!ALLOWED_EVENT_TYPES.has(normalized.eventType)) errors.eventType = 'Agent card event type is not supported.'
  return errors
}

export function buildAgentCardEventRow({ link = {}, normalized = {}, headers = {} } = {}) {
  const metadata = safeObject(link.metadata_json)
  const card = safeObject(metadata.agentDigitalCard)
  const agent = safeObject(card.agent)

  return {
    intake_link_id: normalizeText(link.id),
    organisation_id: normalizeText(link.organisation_id),
    agent_user_id: nullableUuid(link.default_assigned_agent_id || agent.userId),
    slug: normalizeSlug(link.slug || normalized.slug),
    event_type: normalized.eventType,
    source_channel: normalized.sourceChannel,
    listing_id: normalized.listingId,
    listing_slug: normalized.listingSlug,
    metadata_json: normalized.metadata,
    request_metadata_json: safeJsonObject({
      userAgent: normalizeText(headers['user-agent'] || headers['User-Agent']),
      origin: normalizeText(headers.origin || headers.Origin),
      referer: normalizeText(headers.referer || headers.Referer),
      ipHash: hashIpAddress(getRequestIp(headers)),
    }),
  }
}

async function resolveAgentCardLink(client, slug = '') {
  const normalizedSlug = normalizeSlug(slug)
  if (!normalizedSlug) return null
  const result = await client
    .from('agency_public_intake_links')
    .select('id, organisation_id, slug, status, default_assigned_agent_id, metadata_json')
    .eq('slug', normalizedSlug)
    .eq('status', 'active')
    .is('disabled_at', null)
    .maybeSingle()

  if (result.error) throw result.error
  const link = result.data || null
  if (safeObject(link?.metadata_json).surface !== 'agent_digital_card') return null
  return link
}

export async function recordAgentCardEvent(client, { payload = {}, headers = {}, slug = '' } = {}) {
  const normalized = normalizeAgentCardEventPayload(payload, slug)
  const errors = validateAgentCardEventPayload(normalized)
  if (Object.keys(errors).length) {
    const error = new Error('Agent card event is invalid.')
    error.code = 'agent_card_event_invalid'
    error.status = 400
    error.errors = errors
    throw error
  }

  const link = await resolveAgentCardLink(client, normalized.slug)
  if (!link) {
    const error = new Error('This agent digital card is not available.')
    error.code = 'agent_card_not_found'
    error.status = 404
    throw error
  }

  const row = buildAgentCardEventRow({ link, normalized, headers })
  const result = await client
    .from('agency_agent_card_events')
    .insert(row)
    .select('id, created_at')
    .single()

  if (result.error) throw result.error
  return {
    accepted: true,
    event: {
      id: normalizeText(result.data?.id),
      type: normalized.eventType,
      createdAt: normalizeText(result.data?.created_at),
    },
  }
}

export async function createPublicAgentCardEventsResponse({ method = 'POST', url = '', headers = {}, body = null } = {}) {
  const normalizedMethod = normalizeMethod(method)

  if (normalizedMethod === 'OPTIONS') {
    return {
      status: 204,
      headers: {
        'Access-Control-Allow-Headers': 'Content-Type, Accept',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
      },
      body: null,
    }
  }

  if (normalizedMethod !== 'POST') {
    return buildJsonResponse(405, {
      error: 'method_not_allowed',
      message: 'Agent digital card events only support POST.',
    })
  }

  try {
    const requestUrl = getRequestUrl(url, headers)
    const payload = await readJsonBody(body)
    const client = createServiceClient()
    const result = await recordAgentCardEvent(client, {
      payload,
      headers,
      slug: requestUrl.searchParams.get('slug') || payload.slug,
    })
    return buildJsonResponse(202, result)
  } catch (error) {
    const status = Number(error?.status || error?.statusCode || 500)
    return buildJsonResponse(status, {
      error: error?.code || 'agent_card_event_error',
      message: status >= 500 ? 'Agent digital card event could not be recorded.' : error?.message || 'Agent card event request failed.',
      ...(error?.errors ? { errors: error.errors } : {}),
    })
  }
}

export { writeNodeJsonResponse }
