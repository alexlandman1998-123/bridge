import { createHash } from 'node:crypto'
import { createPrivatePropertyClient, extractPrivatePropertyXmlBlocks, extractPrivatePropertyXmlTag, PRIVATE_PROPERTY_SANDBOX_BASE_URL } from './privatePropertyClient.js'
import { resolvePrivatePropertyCredentials } from './privatePropertyAgencyConfigService.js'
import { listingStatisticsWindow, statisticsDate, statisticsDays } from './listingStatisticsDates.js'

const METRICS = { Views: 'view_count', Alerts: 'alert_count', Messages: 'message_count', TelLeads: 'tel_leads' }

function problem(code, status = 409) {
  return Object.assign(new Error(code.replaceAll('_', ' ')), { code, status })
}

export function parsePrivatePropertyStatistics(xml, { propertyRefs, date }) {
  if (!extractPrivatePropertyXmlTag(xml, 'ListingPerformanceStatsResult')) throw problem('private_property_statistics_response_invalid', 502)
  const seen = new Set()
  return extractPrivatePropertyXmlBlocks(xml, 'ListingPerformanceStatsOnDate').map((block) => {
    const ref = extractPrivatePropertyXmlTag(block, 'PropertyRef')
    const sourceDate = extractPrivatePropertyXmlTag(block, 'Date')
    if (!/^\d{4}-\d{2}-\d{2}T00:00:00(?:Z|[+-]\d{2}:\d{2})?$/.test(sourceDate)) throw problem('private_property_statistics_date_invalid', 502)
    const day = statisticsDate(sourceDate.slice(0, 10))
    if (day !== date || !propertyRefs.includes(ref) || seen.has(ref)) throw problem('private_property_statistics_scope_mismatch', 502)
    seen.add(ref)
    const values = Object.fromEntries(Object.entries(METRICS).map(([field, column]) => {
      const value = extractPrivatePropertyXmlTag(block, field)
      if (value === '') return [column, null]
      if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) > 2_147_483_647) throw problem('private_property_statistics_metric_invalid', 502)
      return [column, Number(value)]
    }))
    return { private_property_ref: ref, statistic_date: day, ...values }
  })
}

export function isPrivatePropertyStatisticsPending(error) {
  return /\bPP50\s*-/.test(String(error?.faultString || ''))
}

async function checked(query) {
  const result = await query
  if (result.error) throw result.error
  return result.data
}

async function paged(buildQuery, limit = 10_000) {
  const rows = []
  for (let offset = 0; offset < limit; offset += 500) {
    const page = await checked(buildQuery().range(offset, offset + 499)) || []
    rows.push(...page)
    if (page.length < 500) return rows
  }
  throw problem('private_property_statistics_inventory_limit', 422)
}

export async function privatePropertyStatisticsContext({ client, config, secrets = process.env, createPortal = createPrivatePropertyClient }) {
  const environment = config.environment
  if (!['production', 'sandbox'].includes(environment) || !config.organisation_id || !config.branch_guid) throw problem('private_property_statistics_config_invalid')
  const expectedHost = environment === 'production' ? 'services.privateproperty.co.za' : 'services.sandbox.pp.co.za'
  const baseUrl = config.base_url || (environment === 'sandbox' ? PRIVATE_PROPERTY_SANDBOX_BASE_URL : '')
  let url
  try { url = new URL(baseUrl) } catch { throw problem('private_property_statistics_host_invalid') }
  if (url.protocol !== 'https:' || url.hostname !== expectedHost || url.port || url.pathname !== '/AgentImport/AgentImport.asmx' || url.search || url.hash || url.username || url.password) throw problem('private_property_statistics_host_invalid')
  const credentials = await resolvePrivatePropertyCredentials({ client, config, secrets })
  if (credentials.source === 'runtime_fallback' && secrets[config.password_secret_name] !== undefined) credentials.password = String(secrets[config.password_secret_name])
  if (credentials.missingSecrets.length) throw problem('private_property_statistics_credentials_missing', 503)
  const scopeDigest = createHash('sha256').update(JSON.stringify([config.organisation_id, environment, config.branch_guid, baseUrl, credentials.username, credentials.password])).digest('hex')
  const mappings = await paged(() => client.from('private_property_listing_syncs')
    .select('private_listing_id, private_property_ref, listing_type, private_listings!inner(id, organisation_id)')
    .eq('environment', environment).eq('branch_guid', config.branch_guid)
    .eq('private_listings.organisation_id', config.organisation_id).order('private_listing_id'))
  const refs = new Map()
  for (const row of mappings) {
    const owner = Array.isArray(row.private_listings) ? row.private_listings[0] : row.private_listings
    if (owner?.organisation_id !== config.organisation_id || owner?.id !== row.private_listing_id) throw problem('private_property_statistics_mapping_owner_mismatch')
    if (!row.private_property_ref) continue
    if (!['Sale', 'Rental', 'Both'].includes(row.listing_type) || refs.has(row.private_property_ref)) throw problem('private_property_statistics_mapping_conflict')
    refs.set(row.private_property_ref, row)
  }
  return { refs, scopeDigest, portal: createPortal({ baseUrl, username: credentials.username, password: credentials.password }) }
}

export async function probePrivatePropertyStatistics({ context, now = new Date() }) {
  const ref = context.refs.keys().next().value
  if (!ref) throw problem('private_property_statistics_listing_reference_missing')
  const window = listingStatisticsWindow({ days: 7, now })
  for (const date of statisticsDays(window).reverse()) {
    try {
      const response = await context.portal.getListingPerformanceStats({ propertyRefs: [ref], date })
      const rows = parsePrivatePropertyStatistics(response.data, { propertyRefs: [ref], date })
      if (rows.some((row) => row.view_count !== null)) return { verified: true, statisticDate: date }
    } catch (error) {
      if (!isPrivatePropertyStatisticsPending(error)) throw error
    }
  }
  throw problem('private_property_statistics_probe_pending')
}

export async function syncPrivatePropertyStatistics({ client, config, context, now = new Date(), days = 90, startDate, endDate, maxRequests = 8 }) {
  if (!Number.isInteger(maxRequests) || maxRequests < 1 || maxRequests > 8) throw problem('private_property_statistics_request_limit_invalid', 400)
  const window = listingStatisticsWindow({ days, startDate, endDate, now })
  const existing = await paged(() => client.from('private_property_listing_statistics_daily').select('private_property_ref, statistic_date')
    .eq('organisation_id', config.organisation_id).eq('environment', config.environment).eq('branch_guid', config.branch_guid)
    .gte('statistic_date', window.startDate).lte('statistic_date', window.endDate).order('private_property_ref').order('statistic_date'), 100_000)
  const present = new Set(existing.map((row) => `${row.private_property_ref}:${row.statistic_date}`))
  const attempts = await paged(() => client.from('private_property_statistics_attempts').select('private_property_ref, statistic_date, retry_after_at')
    .eq('config_id', config.id).gte('statistic_date', window.startDate).lte('statistic_date', window.endDate).order('private_property_ref').order('statistic_date'), 100_000)
  const cooling = new Set(attempts.filter((row) => Date.parse(row.retry_after_at) > now.getTime()).map((row) => `${row.private_property_ref}:${row.statistic_date}`))
  const dates = statisticsDays(window).reverse()
  const requests = []
  // One reference per call until supplier batch/rate limits have been agreed.
  // Repair holes first; refresh the latest three days after historical coverage.
  for (const date of dates) for (const ref of context.refs.keys()) if (!present.has(`${ref}:${date}`)) requests.push({ ref, date })
  for (const date of dates.slice(0, 3)) for (const ref of context.refs.keys()) if (present.has(`${ref}:${date}`)) requests.push({ ref, date })
  const run = await checked(client.from('private_property_statistics_sync_runs').insert({
    config_id: config.id, organisation_id: config.organisation_id, environment: config.environment, branch_guid: config.branch_guid,
    requested_from_date: window.startDate, requested_to_date: window.endDate, status: 'running',
  }).select('id').single())
  let storedCount = 0, pendingCount = 0, requestCount = 0
  const retryAfter = new Date(now.getTime() + 60 * 60 * 1000).toISOString()
  const pendingDates = new Set()
  const noteAttempt = (ref, date) => checked(client.from('private_property_statistics_attempts').upsert({ config_id: config.id, private_property_ref: ref, statistic_date: date, retry_after_at: retryAfter }, { onConflict: 'config_id,private_property_ref,statistic_date' }))
  try {
    for (const { ref, date } of requests) {
      if (requestCount >= maxRequests) break
      if (cooling.has(`${ref}:${date}`) || cooling.has(`*:${date}`) || pendingDates.has(date)) continue
      requestCount += 1
      try {
        const response = await context.portal.getListingPerformanceStats({ propertyRefs: [ref], date })
        const parsed = parsePrivatePropertyStatistics(response.data, { propertyRefs: [ref], date })
        if (!parsed.length) { pendingCount += 1; await noteAttempt(ref, date); continue }
        const mapping = context.refs.get(ref)
        await checked(client.from('private_property_listing_statistics_daily').upsert(parsed.map((row) => ({
          ...row, organisation_id: config.organisation_id, private_listing_id: mapping.private_listing_id,
          environment: config.environment, branch_guid: config.branch_guid, listing_type: mapping.listing_type, synced_at: now.toISOString(),
        })), { onConflict: 'organisation_id,environment,branch_guid,private_property_ref,statistic_date' }))
        storedCount += parsed.length
        await noteAttempt(ref, date)
      } catch (error) {
        if (!isPrivatePropertyStatisticsPending(error)) throw error
        pendingCount += 1
        pendingDates.add(date)
        await noteAttempt('*', date)
      }
    }
    const deferredCount = Math.max(0, requests.length - requestCount)
    const status = pendingCount || deferredCount ? 'partial' : 'completed'
    await checked(client.from('private_property_statistics_sync_runs').update({ status, stored_count: storedCount, request_count: requestCount, pending_count: pendingCount, deferred_count: deferredCount, completed_at: now.toISOString() }).eq('id', run.id))
    return { status, storedCount, requestCount, pendingCount, deferredCount, window }
  } catch (error) {
    await checked(client.from('private_property_statistics_sync_runs').update({ status: 'failed', stored_count: storedCount, request_count: requestCount, pending_count: pendingCount, error_code: error.code || 'private_property_statistics_pull_failed', completed_at: now.toISOString() }).eq('id', run.id)).catch(() => {})
    throw error
  }
}

export async function setPrivatePropertyStatisticsAccess({ client, config, context, enabled, now = new Date() }) {
  const result = await probePrivatePropertyStatistics({ context, now })
  await checked(client.from('private_property_statistics_access').upsert({ config_id: config.id, scope_digest: context.scopeDigest, enabled, verified_at: now.toISOString() }, { onConflict: 'config_id' }))
  return { ...result, enabled }
}

export async function hasPrivatePropertyStatisticsAccess({ client, config, context, requireEnabled = false }) {
  const access = await checked(client.from('private_property_statistics_access').select('scope_digest, enabled').eq('config_id', config.id).maybeSingle())
  return Boolean(access?.scope_digest === context.scopeDigest && (!requireEnabled || access.enabled))
}
