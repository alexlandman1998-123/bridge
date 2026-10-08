import { createClient } from '@supabase/supabase-js'
import { authenticatePrivatePropertySettingsRequest, privatePropertySettingsResponse as response } from './settingsApi.js'
import { privatePropertyStatisticsContext, probePrivatePropertyStatistics, syncPrivatePropertyStatistics, setPrivatePropertyStatisticsAccess, hasPrivatePropertyStatisticsAccess } from '../services/privatePropertyStatisticsService.js'
import { listingStatisticsWindow } from '../services/listingStatisticsDates.js'

function clientFor(env, dependencies) {
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL
  if (!url || !env.SUPABASE_SERVICE_ROLE_KEY) throw Object.assign(new Error('Statistics server is not configured.'), { status: 503 })
  return (dependencies.createClient || createClient)(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
}

function errorResponse(error) {
  // Supplier exceptions can contain request bodies and tokens. Return only our
  // stable error code, never raw SOAP faults or decrypted credential errors.
  const code = String(error.code || '').startsWith('private_property_statistics_') ? error.code : 'private_property_statistics_failed'
  return response(Number(error.status) || 502, { error: code, message: code.replaceAll('_', ' ') })
}

export async function privatePropertyStatisticsSettingsResponse({ method, headers, body = {}, env = process.env, dependencies = {}, now = new Date() }) {
  if (method !== 'POST') return response(405, { error: 'method_not_allowed' })
  const actions = ['probe', 'verify', 'enable', 'disable', 'sync']
  if (!actions.includes(body.action) || !body.organisationId || !body.configId) return response(400, { error: 'invalid_statistics_request' })
  try {
    const client = clientFor(env, dependencies)
    const auth = await authenticatePrivatePropertySettingsRequest({ request: { headers }, supabase: client, organisationId: body.organisationId })
    if (!auth.ok) return auth.response
    const result = await client.from('private_property_agency_configs').select('*').eq('id', body.configId).eq('organisation_id', body.organisationId).maybeSingle()
    if (result.error) throw result.error
    const config = result.data
    if (!config) return response(404, { error: 'private_property_statistics_config_not_found' })
    if (body.action === 'sync') {
      try { listingStatisticsWindow({ days: body.days ?? 90, startDate: body.startDate, endDate: body.endDate, now }) }
      catch { return response(400, { error: 'private_property_statistics_window_invalid' }) }
    }
    if (body.action === 'disable') {
      const disabled = await client.from('private_property_statistics_access').update({ enabled: false }).eq('config_id', config.id)
      if (disabled.error) throw disabled.error
      return response(200, { enabled: false })
    }
    const context = await privatePropertyStatisticsContext({ client, config, secrets: env, createPortal: dependencies.createPortal })
    if (body.action === 'probe') return response(200, await probePrivatePropertyStatistics({ context, now }))
    if (['verify', 'enable'].includes(body.action)) return response(200, await setPrivatePropertyStatisticsAccess({ client, config, context, enabled: body.action === 'enable', now }))
    if (config.environment === 'production' && !await hasPrivatePropertyStatisticsAccess({ client, config, context })) return response(409, { error: 'private_property_statistics_access_verification_required' })
    return response(200, { report: await syncPrivatePropertyStatistics({ client, config, context, now, days: body.days ?? 90, startDate: body.startDate, endDate: body.endDate }) })
  } catch (error) { return errorResponse(error) }
}

export async function privatePropertyStatisticsCronResponse({ method, headers, env = process.env, dependencies = {}, now = new Date() }) {
  if (method !== 'GET') return response(405, { error: 'method_not_allowed' })
  if (!env.CRON_SECRET || headers?.authorization !== `Bearer ${env.CRON_SECRET}`) return response(401, { error: 'unauthorized' })
  if (env.PRIVATE_PROPERTY_STATISTICS_SYNC_ENABLED !== 'true') return response(200, { status: 'disabled', reports: [] })
  try {
    const client = clientFor(env, dependencies)
    const result = await client.from('private_property_statistics_access').select('config_id, private_property_agency_configs!inner(*)')
      .eq('enabled', true).eq('private_property_agency_configs.environment', 'production').eq('private_property_agency_configs.enabled', true)
      .order('last_scheduled_at', { ascending: true, nullsFirst: true }).limit(4)
    if (result.error) throw result.error
    const reports = []
    // At most eight sequential supplier calls per invocation, including pending
    // days. Fair ordering lets other verified agencies take the next turn.
    for (const access of result.data || []) {
      const config = Array.isArray(access.private_property_agency_configs) ? access.private_property_agency_configs[0] : access.private_property_agency_configs
      if (!config || config.environment !== 'production' || !config.enabled) continue
      try {
        const context = await privatePropertyStatisticsContext({ client, config, secrets: env, createPortal: dependencies.createPortal })
        if (!await hasPrivatePropertyStatisticsAccess({ client, config, context, requireEnabled: true })) {
          reports.push({ configId: config.id, status: 'verification_required' })
        } else {
          reports.push({ configId: config.id, ...await syncPrivatePropertyStatistics({ client, config, context, now, maxRequests: 2 }) })
        }
      } catch (error) {
        reports.push({ configId: config.id, status: 'failed', error: errorResponse(error).body.error })
      }
      const updated = await client.from('private_property_statistics_access').update({ last_scheduled_at: now.toISOString() }).eq('config_id', config.id)
      if (updated.error) throw updated.error
    }
    return response(200, { status: reports.some((item) => item.status !== 'completed') ? 'partial' : 'completed', reports })
  } catch (error) { return errorResponse(error) }
}
