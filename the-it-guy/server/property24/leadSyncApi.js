import process from 'node:process'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createProperty24Client, normalizeProperty24Text } from './client.js'
import { resolveProperty24EnvironmentCredentials } from './environmentService.js'
import { fetchOrganisationProperty24Credentials } from './organisationCredentialService.js'
import { pullAndImportProperty24Leads } from './leadImportService.js'

const DEFAULT_LOOKBACK_MS = 24 * 60 * 60 * 1000
const CURSOR_OVERLAP_MS = 10 * 60 * 1000
const INITIAL_LOOKBACK_MS = 30 * DEFAULT_LOOKBACK_MS

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
  if (env.VERCEL_ENV === 'production') return 'production'
  const explicit = normalizeProperty24Text(env.PROPERTY24_ENVIRONMENT).toLowerCase()
  if (explicit === 'production') return 'production'
  if (explicit === 'exdev') return 'exdev'
  const baseUrl = normalizeProperty24Text(env.PROPERTY24_PRODUCTION_BASE_URL || env.PROPERTY24_BASE_URL).toLowerCase()
  return baseUrl && !baseUrl.includes('property24-test.com') ? 'production' : 'exdev'
}

function asValidIso(value) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toISOString()
}

export function resolveScheduledProperty24After({ cursorAfter = '', now = new Date() } = {}) {
  const cursor = asValidIso(cursorAfter)
  const lookbackStart = now.getTime() - DEFAULT_LOOKBACK_MS
  // A checkpoint can be ahead of leads that Property24 publishes late. Always
  // replay the latest day and rely on ingestion references to deduplicate it.
  return new Date(cursor
    ? Math.min(new Date(cursor).getTime() - CURSOR_OVERLAP_MS, lookbackStart)
    : lookbackStart).toISOString()
}

function latestCursor(...values) {
  return values.map(asValidIso).filter(Boolean).sort().at(-1) || null
}

function leadCounts(leads = {}) {
  const summary = leads?.import?.summary || leads?.summary || {}
  const importResults = leads?.import?.results || []
  const listingChecks = Array.isArray(leads?.property24?.listingChecks)
    ? leads.property24.listingChecks
    : []
  return {
    received: Number(summary.receivedCount || 0) || 0,
    imported: Number(summary.importedCount || 0) || 0,
    unresolved: importResults.length
      ? importResults.filter((result) => ['needs_review', 'failed'].includes(result.status)).length
      : Array.isArray(leads.leads)
        ? leads.leads.filter((lead) => !lead.readyForCrmIngestion).length
        : Number(summary.failedCount || 0) + Number(summary.needsReviewCount || 0),
    lookaheadFallbacks: listingChecks.filter((check) => check.lookaheadFallback).length,
    nextAfter: asValidIso(leads?.nextAfter || leads?.summary?.nextAfter || ''),
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

  if (!isAuthorized({ headers, env })) {
    return buildJsonResponse(401, { error: 'unauthorized', message: 'Scheduled Property24 lead sync token is missing or invalid.' })
  }

  let requestUrl
  let payload
  try {
    requestUrl = parseUrl(url, headers)
    payload = parseBody(body)
  } catch (error) {
    return buildJsonResponse(Number(error?.status || 400), { error: error?.code || 'invalid_request', message: error.message })
  }
  const query = requestUrl.searchParams
  const dryRun = normalizeBoolean(firstValue(payload.dryRun, query.get('dryRun')), false)
  const environment = scheduledEnvironment(env)
  const agencyId = normalizeProperty24Text(firstValue(payload.agencyId, query.get('agencyId')))
  const organisationId = normalizeProperty24Text(firstValue(payload.organisationId, query.get('organisationId')))
  const stateClient = (dependencies.createLeadSyncStateClient || createLeadSyncStateClient)(env)
  if (!stateClient) {
    return buildJsonResponse(503, {
      error: 'property24_lead_sync_state_not_configured',
      message: 'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required before scheduled Property24 lead sync can run.',
    })
  }

  try {
    // Discover connections on every invocation, including newly onboarded agencies.
    // The platform's legacy default agency and credentials cannot select a tenant.
    const connections = []
    for (let offset = 0; ; offset += 100) {
      let accountQuery = stateClient.from('property24_accounts')
        .select('organisation_id, environment, agency_id')
        .eq('enabled', true).eq('environment', environment)
        .order('organisation_id').range(offset, offset + 99)
      if (agencyId) accountQuery = accountQuery.eq('agency_id', Number(agencyId))
      if (organisationId) accountQuery = accountQuery.eq('organisation_id', organisationId)
      const page = await accountQuery
      if (page.error) throw page.error
      connections.push(...(page.data || []))
      if ((page.data || []).length < 100) break
    }
    if ((agencyId || organisationId) && !connections.length) {
      return buildJsonResponse(404, { error: 'property24_account_not_configured', message: 'No enabled Property24 account matches this agency.' })
    }

    const reports = []
    for (const connection of connections) {
      const accountAgencyId = String(connection.agency_id)
      let lock = null
      try {
        const endpoint = resolveProperty24EnvironmentCredentials({ env, environment })
        if (!endpoint.environmentMatches) throw new Error('The Property24 endpoint does not match the account environment.')
        const credentials = await (dependencies.fetchOrganisationCredentials || fetchOrganisationProperty24Credentials)({
          supabase: stateClient, organisationId: connection.organisation_id, environment,
        })
        if (!credentials) throw new Error('This agency has no saved Property24 credentials. Configure its account in the Admin Console.')
        if (dryRun) {
          const checkpoint = await stateClient.from('property24_lead_sync_checkpoints')
            .select('cursor_after').eq('environment', environment).eq('agency_id', accountAgencyId).maybeSingle()
          if (checkpoint.error) throw checkpoint.error
          lock = checkpoint.data || {}
        } else {
          lock = await acquireLeadSync({ client: stateClient, environment, agencyId: accountAgencyId,
            ttlSeconds: positiveInteger(env.PROPERTY24_LEAD_SYNC_LOCK_TTL_SECONDS, 360, 900) })
          if (!lock?.acquired) {
            reports.push({ organisationId: connection.organisation_id, agencyId: accountAgencyId, status: 'skipped_overlap' })
            continue
          }
        }
        const after = asValidIso(firstValue(payload.after, query.get('after'))) || (lock.cursor_after
          ? resolveScheduledProperty24After({ cursorAfter: lock.cursor_after })
          : new Date(Date.now() - INITIAL_LOOKBACK_MS).toISOString())
        const property24 = (dependencies.createProperty24 || createProperty24Client)({
          baseUrl: endpoint.baseUrl, apiVersion: endpoint.apiVersion,
          username: credentials.username, password: credentials.password, userGroupId: credentials.userGroupId,
        })
        const leads = await (dependencies.pullAndImportLeads || pullAndImportProperty24Leads)({
          supabase: stateClient, property24,
          config: { organisationId: connection.organisation_id, environment, agencyId: accountAgencyId,
            after, applyLeads: !dryRun, sendNotifications: Boolean(lock.cursor_after),
            limit: positiveInteger(firstValue(payload.limit, query.get('limit'), env.PROPERTY24_LEAD_SYNC_LIMIT), 1000, 5000) },
        })
        const counts = leadCounts(leads)
        const succeeded = dryRun || (counts.unresolved === 0 && counts.lookaheadFallbacks === 0)
        const failureReason = counts.unresolved
          ? `${counts.unresolved} Property24 lead(s) could not be imported.`
          : `${counts.lookaheadFallbacks} Property24 listing lead window(s) rejected the two-hour lookahead and fell back to the original window.`
        const cursorAfter = succeeded && !dryRun && counts.received > 0
          ? latestCursor(counts.nextAfter, lock.cursor_after) || after : lock.cursor_after || null
        if (!dryRun) await completeLeadSync({ client: stateClient, environment, agencyId: accountAgencyId,
          lockToken: lock.lock_token, status: succeeded ? 'complete' : 'failed', cursorAfter: succeeded ? cursorAfter : null,
          received: counts.received, imported: counts.imported, error: succeeded ? null : failureReason })
        const report = { organisationId: connection.organisation_id, agencyId: accountAgencyId,
          status: succeeded ? 'complete' : 'failed', after, received: counts.received, imported: counts.imported,
          unresolved: counts.unresolved, lookaheadFallbacks: counts.lookaheadFallbacks,
          cursorAdvanced: !dryRun && Boolean(cursorAfter && cursorAfter !== lock.cursor_after),
          ...(succeeded ? {} : { error: failureReason }) }
        reports.push(report)
        console.info('[Property24] lead sync result', report)
      } catch (error) {
        if (!dryRun && lock?.lock_token) {
          try {
            await completeLeadSync({ client: stateClient, environment, agencyId: accountAgencyId,
              lockToken: lock.lock_token, status: 'failed', error: error.message })
          } catch {
            console.error('[Property24] Unable to record scheduled lead sync failure.', { agencyId: accountAgencyId })
          }
        }
        // One agency's configuration or portal outage must not block other agencies.
        reports.push({ organisationId: connection.organisation_id, agencyId: accountAgencyId, status: 'failed',
          error: error.message || 'Scheduled Property24 lead sync failed.' })
      }
    }
    const failed = reports.some((report) => report.status === 'failed')
    return buildJsonResponse(failed ? 502 : 200, {
      route: 'syncLeads', mode: dryRun ? 'DRY_RUN' : 'APPLY', scheduled: true,
      status: failed ? 'partial' : 'complete', connectionCount: connections.length,
      received: reports.reduce((sum, report) => sum + (report.received || 0), 0),
      imported: reports.reduce((sum, report) => sum + (report.imported || 0), 0), reports,
    })
  } catch (error) {
    return buildJsonResponse(500, { error: 'property24_lead_sync_error', message: error.message || 'Unable to load Property24 accounts.' })
  }
}
