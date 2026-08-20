import process from 'node:process'
import { normalizeProperty24Text } from './client.js'
import { createProperty24ApiResponse } from './api.js'

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

  try {
    const requestUrl = parseUrl(url, headers)
    const payload = parseBody(body)
    const query = requestUrl.searchParams
    const dryRun = normalizeBoolean(firstValue(payload.dryRun, query.get('dryRun')), false)
    const apiPayload = {
      applyLeads: !dryRun,
      agencyId: firstValue(payload.agencyId, query.get('agencyId')),
      after: firstValue(payload.after, query.get('after'), env.PROPERTY24_LEAD_SYNC_AFTER),
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

    return buildJsonResponse(leadPullResponse.status, {
      route: 'syncLeads',
      mode: dryRun ? 'DRY_RUN' : 'APPLY',
      scheduled: true,
      leadPull: leadPullResponse.body || null,
    })
  } catch (error) {
    const status = Number(error?.status || 500)
    return buildJsonResponse(status, {
      error: error?.code || 'property24_lead_sync_error',
      message: error?.message || 'Scheduled Property24 lead sync failed.',
    })
  }
}
