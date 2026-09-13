import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import process from 'node:process'
import { createProperty24Client, normalizeProperty24Text } from './client.js'
import { resolveProperty24EnvironmentCredentials } from './environmentService.js'
import { isProperty24StatisticsApiVersionSupported, syncProperty24ListingStatistics } from './statisticsSyncService.js'

function response(status, body) {
  return { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, body }
}

function header(headers = {}, name = '') {
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === name.toLowerCase())
  return normalizeProperty24Text(Array.isArray(entry?.[1]) ? entry[1][0] : entry?.[1])
}

function bearer(headers = {}) {
  const authorization = header(headers, 'authorization')
  return authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
}

function parseBody(body = null) {
  if (!body) return {}
  if (typeof body === 'object' && !Buffer.isBuffer(body)) return body
  try {
    return JSON.parse(Buffer.isBuffer(body) ? body.toString('utf8') : String(body))
  } catch {
    const error = new Error('Scheduled Property24 statistics sync body must be valid JSON.')
    error.status = 400
    throw error
  }
}

function authorised(headers, env) {
  const token = bearer(headers)
  const cronSecret = normalizeProperty24Text(env.PROPERTY24_STATISTICS_SYNC_CRON_SECRET || env.CRON_SECRET)
  const internalToken = normalizeProperty24Text(env.PROPERTY24_API_INTERNAL_TOKEN)
  return Boolean((cronSecret && token === cronSecret) || (internalToken && (token === internalToken || header(headers, 'x-property24-api-token') === internalToken)))
}

export async function createProperty24StatisticsSyncResponse({
  method = 'GET',
  headers = {},
  body = null,
  env = process.env,
  dependencies = {},
} = {}) {
  if (method.toUpperCase() === 'OPTIONS') return response(204, null)
  if (!['GET', 'POST'].includes(method.toUpperCase())) return response(405, { error: 'method_not_allowed', message: 'Property24 statistics sync only supports GET or POST.' })
  if (!authorised(headers, env)) return response(401, { error: 'unauthorized', message: 'Scheduled Property24 statistics sync token is missing or invalid.' })

  const supabaseUrl = normalizeProperty24Text(env.SUPABASE_URL || env.VITE_SUPABASE_URL)
  const serviceRoleKey = normalizeProperty24Text(env.SUPABASE_SERVICE_ROLE_KEY)
  if (!supabaseUrl || !serviceRoleKey) return response(503, { error: 'missing_configuration', missingConfiguration: ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'] })
  try {
    const payload = parseBody(body)
    const createSupabase = dependencies.createSupabase || ((url, key) => createSupabaseClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }))
    const createProperty24 = dependencies.createProperty24 || ((credentials) => createProperty24Client({
      baseUrl: credentials.baseUrl,
      username: credentials.username,
      password: credentials.password,
      userGroupId: credentials.sendUserGroupHeader ? credentials.userGroupId : '',
      apiVersion: credentials.apiVersion,
    }))
    const syncStatistics = dependencies.syncStatistics || syncProperty24ListingStatistics
    const supabase = createSupabase(supabaseUrl, serviceRoleKey)
    const connections = await supabase
      .from('property24_accounts')
      .select('organisation_id, environment, agency_id')
      .eq('enabled', true)
      .limit(100)
    if (connections.error) throw connections.error
    const reports = []
    for (const connection of connections.data || []) {
      const credentials = resolveProperty24EnvironmentCredentials({ env, environment: connection.environment })
      if (!credentials.configured) {
        reports.push({ organisationId: connection.organisation_id, agencyId: connection.agency_id, status: 'skipped', reason: 'property24_environment_credentials_missing' })
        continue
      }
      if (!isProperty24StatisticsApiVersionSupported(credentials.apiVersion)) {
        reports.push({ organisationId: connection.organisation_id, agencyId: connection.agency_id, status: 'skipped', reason: 'property24_listing_service_v55_required' })
        continue
      }
      try {
        const report = await syncStatistics({
          supabase,
          property24: createProperty24(credentials),
          config: {
            organisationId: connection.organisation_id,
            agencyId: connection.agency_id,
            environment: connection.environment,
            sourceApiVersion: credentials.apiVersion,
            startDate: normalizeProperty24Text(payload.startDate),
            endDate: normalizeProperty24Text(payload.endDate),
          },
        })
        reports.push({ organisationId: connection.organisation_id, agencyId: connection.agency_id, status: report.status, storedCount: report.storedCount })
      } catch (error) {
        reports.push({ organisationId: connection.organisation_id, agencyId: connection.agency_id, status: 'failed', reason: normalizeProperty24Text(error.message) || 'statistics_sync_failed' })
      }
    }
    return response(200, {
      route: 'syncStatistics',
      scheduled: true,
      status: reports.some((item) => item.status === 'failed') ? 'partial' : 'completed',
      connectionCount: reports.length,
      reports,
    })
  } catch (error) {
    return response(Number(error.status || 500), { error: error.code || 'property24_statistics_sync_error', message: error.message || 'Scheduled Property24 statistics sync failed.' })
  }
}
