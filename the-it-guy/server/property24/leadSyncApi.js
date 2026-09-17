import process from 'node:process'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { normalizeProperty24Text } from './client.js'
import { createProperty24ApiResponse } from './api.js'

const DEFAULT_LOOKBACK_MS = 24 * 60 * 60 * 1000
const CURSOR_OVERLAP_MS = 10 * 60 * 1000

function buildJsonResponse(status, body, headers = {}) {
  return {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...headers,
    },
    body,
  }
}

function normalizeMethod(value = '') {
  return normalizeProperty24Text(value || 'GET').toUpperCase()
}

function getHeader(headers = {}, name = '') {
  const target = name.toLowerCase()
  const entry = Object.entries(headers || {}).find(([key]) => key.toLowerCase() === target)
  const value = entry?.[1]
  return Array.isArray(value) ? normalizeProperty24Text(value[0]) : normalizeProperty24Text(value)
}

function getBearerToken(headers = {}) {
  const authorization = getHeader(headers, 'authorization')
  return authorization.startsWith('Bearer ') ? authorization.slice('Bearer '.length).trim() : ''
}

function normalizeBoolean(value, fallback = false) {
  if (typeof value === 'boolean') return value
  const normalized = normalizeProperty24Text(value).toLowerCase()
  if (['true', '1', 'yes', 'y'].includes(normalized)) return true
  if (['false', '0', 'no', 'n'].includes(normalized)) return false
  return fallback
}

function firstValue(...values) {
  return values.find((value) => normalizeProperty24Text(value))
}

function positiveInteger(value, fallback, maximum) {
  const numeric = Number(value)
  return Number.isInteger(numeric) && numeric > 0 && numeric <= maximum ? numeric : fallback
}

function scheduledEnvironment(env = {}) {
  const explicit = normalizeProperty24Text(env.PROPERTY24_ENVIRONMENT).toLowerCase()
  if (explicit === 'production') return 'production'
  if (explicit === 'exdev') return 'exdev'
  const baseUrl = normalizeProperty24Text(env.PROPERTY24_PRODUCTION_BASE_URL || env.PROPERTY24_BASE_URL).toLowerCase()
  return baseUrl && !baseUrl.includes('property24-test.com') ? 'production' : 'exdev'
}

function asValidIso(value) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toISOString()
}

export function resolveScheduledProperty24After({ cursorAfter = '', now = new Date() } = {}) {
  const cursor = asValidIso(cursorAfter)
  if (cursor) return new Date(new Date(cursor).getTime() - CURSOR_OVERLAP_MS).toISOString()
  return new Date(now.getTime() - DEFAULT_LOOKBACK_MS).toISOString()
}

function leadCounts(body = {}) {
  const summary = body?.leads?.import?.summary || body?.leads?.summary || {}
  return {
    received: Number(summary.receivedCount || 0) || 0,
    imported: Number(summary.importedCount || 0) || 0,
    nextAfter: asValidIso(body?.leads?.nextAfter || body?.leads?.summary?.nextAfter || ''),
  }
}

function createLeadSyncStateClient(env = {}) {
  const url = normalizeProperty24Text(env.SUPABASE_URL || env.VITE_SUPABASE_URL)
  const key = normalizeProperty24Text(env.SUPABASE_SERVICE_ROLE_KEY)
  if (!url || !key) return null
  return createSupabaseClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

async function acquireLeadSync({ client, environment, agencyId, ttlSeconds }) {
  const result = await client.rpc('property24_acquire_lead_sync_lock', {
    p_environment: environment,
    p_agency_id: agencyId,
    p_lock_ttl_seconds: ttlSeconds,
  })
  if (result.error) throw result.error
  return Array.isArray(result.data) ? result.data[0] || null : result.data || null
}

async function completeLeadSync({ client, environment, agencyId, lockToken, status, cursorAfter = null, received = 0, imported = 0, error = null }) {
  const result = await client.rpc('property24_complete_lead_sync_lock', {
    p_environment: environment,
    p_agency_id: agencyId,
    p_lock_token: lockToken,
    p_status: status,
    p_cursor_after: cursorAfter,
    p_received_count: received,
    p_imported_count: imported,
    p_error: error,
  })
  if (result.error) throw result.error
  return result.data === true
}

function parseUrl(url = '', headers = {}) {
  const host = getHeader(headers, 'host') || 'app.arch9.co.za'
  const protocol = getHeader(headers, 'x-forwarded-proto') || 'https'
  return new URL(url || '/api/property24/leads/sync', `${protocol}://${host}`)
}

function parseBody(body = null) {
  if (!body) return {}
  if (typeof body === 'object' && !Buffer.isBuffer(body)) return body
  const text = Buffer.isBuffer(body) ? body.toString('utf8') : String(body || '')
  if (!text.trim()) return {}
  try {
    return JSON.parse(text)
  } catch {
    const error = new Error('Scheduled Property24 lead sync body must be valid JSON.')
    error.code = 'invalid_json'
    error.status = 400
    throw error
  }
}

function isAuthorized({ headers = {}, env = process.env } = {}) {
  const bearerToken = getBearerToken(headers)
  const cronSecret = normalizeProperty24Text(env.PROPERTY24_LEAD_SYNC_CRON_SECRET || env.CRON_SECRET)
  const internalToken = normalizeProperty24Text(env.PROPERTY24_API_INTERNAL_TOKEN)
  const headerToken = getHeader(headers, 'x-property24-api-token')

  return Boolean(
    (cronSecret && bearerToken === cronSecret) ||
      (internalToken && (bearerToken === internalToken || headerToken === internalToken)),
  )
}

export async function createProperty24LeadSyncResponse({
  method = 'GET',
  url = '/api/property24/leads/sync',
  headers = {},
  body = null,
  env = process.env,
  dependencies = {},
} = {}) {
  const normalizedMethod = normalizeMethod(method)
  if (normalizedMethod === 'OPTIONS') {
    return buildJsonResponse(204, null, {
      'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Property24-Api-Token',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    })
  }

  if (!['GET', 'POST'].includes(normalizedMethod)) {
    return buildJsonResponse(405, {
      error: 'method_not_allowed',
      message: 'Property24 lead sync only supports GET or POST.',
    })
  }

  const internalToken = normalizeProperty24Text(env.PROPERTY24_API_INTERNAL_TOKEN)
  const cronSecret = normalizeProperty24Text(env.PROPERTY24_LEAD_SYNC_CRON_SECRET || env.CRON_SECRET)
  if (!internalToken) {
    return buildJsonResponse(503, {
      error: 'property24_api_token_not_configured',
      message: 'Set PROPERTY24_API_INTERNAL_TOKEN before scheduled Property24 lead sync can run.',
    })
  }
  if (!cronSecret && !getHeader(headers, 'x-property24-api-token')) {
    return buildJsonResponse(503, {
      error: 'property24_lead_sync_secret_not_configured',
      message: 'Set PROPERTY24_LEAD_SYNC_CRON_SECRET or CRON_SECRET before enabling the scheduled sync.',
    })
  }
  if (!isAuthorized({ headers, env })) {
    return buildJsonResponse(401, {
      error: 'unauthorized',
      message: 'Scheduled Property24 lead sync token is missing or invalid.',
    })
  }

  let requestUrl
  let payload
  try {
    requestUrl = parseUrl(url, headers)
    payload = parseBody(body)
  } catch (error) {
    return buildJsonResponse(Number(error?.status || 400), {
      error: error?.code || 'property24_lead_sync_invalid_request',
      message: error?.message || 'Scheduled Property24 lead sync request is invalid.',
    })
  }
  const query = requestUrl.searchParams
  const dryRun = normalizeBoolean(firstValue(payload.dryRun, query.get('dryRun')), false)
  const environment = scheduledEnvironment(env)
  const agencyId = normalizeProperty24Text(firstValue(payload.agencyId, query.get('agencyId'), env.PROPERTY24_DEFAULT_AGENCY_ID, '31382'))
  const stateClient = dependencies.createLeadSyncStateClient
    ? dependencies.createLeadSyncStateClient(env)
    : createLeadSyncStateClient(env)
  if (!stateClient) {
    return buildJsonResponse(503, {
      error: 'property24_lead_sync_state_not_configured',
      message: 'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required before scheduled Property24 lead sync can run.',
    })
  }

  let lock = null
  try {
    lock = await acquireLeadSync({
      client: stateClient,
      environment,
      agencyId,
      ttlSeconds: positiveInteger(env.PROPERTY24_LEAD_SYNC_LOCK_TTL_SECONDS, 240, 900),
    })
    if (!lock?.acquired) {
      return buildJsonResponse(202, {
        route: 'syncLeads',
        mode: 'SKIPPED_OVERLAP',
        scheduled: true,
        message: 'A Property24 lead sync is already running.',
      })
    }
    const apiPayload = {
      applyLeads: !dryRun,
      agencyId: firstValue(payload.agencyId, query.get('agencyId'), agencyId),
      after: firstValue(
        payload.after,
        query.get('after'),
        lock.cursor_after ? resolveScheduledProperty24After({ cursorAfter: lock.cursor_after }) : env.PROPERTY24_LEAD_SYNC_AFTER,
        resolveScheduledProperty24After(),
      ),
      limit: firstValue(payload.limit, query.get('limit'), env.PROPERTY24_LEAD_SYNC_LIMIT),
      source: 'property24-lead-sync',
    }

    const createApiResponse = dependencies.createProperty24ApiResponse || createProperty24ApiResponse
    const leadPullResponse = await createApiResponse({
      method: 'POST',
      url: '/api/property24/leads/pull',
      headers: {
        host: getHeader(headers, 'host'),
        'x-property24-api-token': internalToken,
      },
      body: JSON.stringify(apiPayload),
      env,
    })

    const counts = leadCounts(leadPullResponse.body)
    const succeeded = leadPullResponse.status >= 200 && leadPullResponse.status < 300
    await completeLeadSync({
      client: stateClient,
      environment,
      agencyId,
      lockToken: lock.lock_token,
      status: succeeded ? 'complete' : 'failed',
      cursorAfter: succeeded ? counts.nextAfter || new Date().toISOString() : null,
      received: counts.received,
      imported: counts.imported,
      error: succeeded ? null : leadPullResponse.body?.message || `Property24 returned HTTP ${leadPullResponse.status}.`,
    })
    return buildJsonResponse(leadPullResponse.status, {
      route: 'syncLeads',
      mode: dryRun ? 'DRY_RUN' : 'APPLY',
      scheduled: true,
      after: apiPayload.after,
      leadPull: leadPullResponse.body || null,
    })
  } catch (error) {
    if (lock?.lock_token) {
      try {
        await completeLeadSync({ client: stateClient, environment, agencyId, lockToken: lock.lock_token, status: 'failed', error: error?.message || 'Scheduled Property24 lead sync failed.' })
      } catch (completionError) {
        console.error('[Property24] Unable to record scheduled lead sync failure.', completionError)
      }
    }
    const status = Number(error?.status || 500)
    return buildJsonResponse(status, {
      error: error?.code || 'property24_lead_sync_error',
      message: error?.message || 'Scheduled Property24 lead sync failed.',
    })
  }
}
