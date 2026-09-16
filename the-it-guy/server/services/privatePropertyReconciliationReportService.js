import { createPrivatePropertyClient, normalizePrivatePropertyText, extractPrivatePropertyXmlTag } from './privatePropertyClient.js'
import { resolvePrivatePropertyRuntimeCredentials } from './privatePropertyAgencyConfigService.js'
import { parsePrivatePropertyActiveListings } from './privatePropertyPostSubmitMonitorService.js'
import { resolvePrivatePropertyExternalStatus } from './privatePropertyListingSyncService.js'

export const PRIVATE_PROPERTY_RECONCILIATION_REPORT_SERVICE_VERSION = 'arch9_private_property_reconciliation_report_v1'

const key = (value = '') => normalizePrivatePropertyText(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
const activeConfig = (row = {}) => Boolean(row.enabled) && ['approved', 'active'].includes(key(row.status)) && Boolean(row.go_live_approved_at)
const liveListing = (listing = {}) => ['published', 'active', 'live'].includes(key(listing.private_property_status))

function expectedStatus(sync = {}, listing = {}) {
  if (['removed', 'inactive', 'paused'].includes(key(sync.external_status))) return key(sync.external_status)
  return liveListing(listing) || sync.is_on_portal ? 'active' : 'submitted'
}

export async function createPrivatePropertyReconciliationReport({ client, organisationId = '', secrets = process.env, createPrivateProperty = createPrivatePropertyClient, limit = 100 } = {}) {
  if (!client) throw new Error('Supabase client is required.')
  const orgId = normalizePrivatePropertyText(organisationId)
  if (!orgId) throw new Error('organisationId is required.')
  const [configsResult, listingsResult, leadsResult, showdaysResult] = await Promise.all([
    client.from('private_property_agency_configs').select('*').eq('organisation_id', orgId).eq('environment', 'production'),
    client.from('private_listings').select('id,title,listing_reference,private_property_status,private_property_reference,updated_at').eq('organisation_id', orgId).limit(limit),
    client.from('private_property_webhook_events').select('status,received_at').eq('organisation_id', orgId).limit(1000),
    client.from('private_property_showday_syncs').select('private_listing_id,active,last_error,last_synced_at').eq('environment', 'production').limit(1000),
  ])
  for (const result of [configsResult, listingsResult, leadsResult, showdaysResult]) if (result.error && result.error.code !== '42P01') throw result.error
  const listings = listingsResult.data || []
  const ids = listings.map((row) => row.id).filter(Boolean)
  const syncResult = ids.length ? await client.from('private_property_listing_syncs').select('*').eq('environment', 'production').in('private_listing_id', ids) : { data: [], error: null }
  if (syncResult.error) throw syncResult.error
  const listingById = new Map(listings.map((row) => [row.id, row]))
  const syncs = syncResult.data || []
  const configurations = (configsResult.data || []).filter(activeConfig)
  const checks = []; const discrepancies = []
  for (const config of configurations) {
    const credentials = resolvePrivatePropertyRuntimeCredentials(config, secrets)
    if (credentials.missingSecrets.length) { checks.push({ configId: config.id, status: 'BLOCKED', blockers: credentials.missingSecrets.map((name) => `missing_runtime_secret:${name}`) }); continue }
    const portal = createPrivateProperty({ baseUrl: config.base_url, username: credentials.username, password: credentials.password })
    const scoped = syncs.filter((sync) => sync.branch_guid === config.branch_guid)
    let active = []
    try { active = parsePrivatePropertyActiveListings((await portal.getActiveListings({ branchGuid: config.branch_guid })).data) } catch (error) { checks.push({ configId: config.id, status: 'FAILED', error: error.message || 'Unable to read active PP listings.' }); continue }
    const activeIds = new Set(active.map((item) => normalizePrivatePropertyText(item.uniqueId)).filter(Boolean))
    for (const sync of scoped) {
      const listing = listingById.get(sync.private_listing_id) || {}
      let remoteStatus = activeIds.has(normalizePrivatePropertyText(sync.property_id)) ? 'active' : 'submitted'
      try {
        const response = await portal.getListingStatus({ branchGuid: config.branch_guid, propertyId: sync.property_id })
        remoteStatus = resolvePrivatePropertyExternalStatus({ privatePropertyStatus: extractPrivatePropertyXmlTag(response.data, 'GetListingStatusResult'), fallback: remoteStatus })
      } catch (error) {
        discrepancies.push({ type: 'status_probe_failed', listingId: sync.private_listing_id, propertyId: sync.property_id, message: error.message || 'PP status probe failed.' }); continue
      }
      const expected = expectedStatus(sync, listing)
      if (remoteStatus !== expected || (remoteStatus === 'active') !== Boolean(sync.is_on_portal)) discrepancies.push({ type: 'listing_state_drift', listingId: sync.private_listing_id, listingTitle: listing.title || null, propertyId: sync.property_id, expectedStatus: expected, localStatus: sync.external_status, remoteStatus, localIsOnPortal: Boolean(sync.is_on_portal), remoteIsOnPortal: remoteStatus === 'active' })
    }
    checks.push({ configId: config.id, branchGuid: config.branch_guid, status: 'COMPLETE', checkedListings: scoped.length, activeRemoteListings: active.length })
  }
  const leadEvents = leadsResult.data || []; const showdays = (showdaysResult.data || []).filter((row) => ids.includes(row.private_listing_id))
  const leadSummary = { received: leadEvents.length, processed: leadEvents.filter((row) => row.status === 'processed').length, failed: leadEvents.filter((row) => row.status === 'failed').length, duplicates: leadEvents.filter((row) => row.status === 'duplicate').length }
  const showdaySummary = { synced: showdays.filter((row) => row.last_synced_at).length, failed: showdays.filter((row) => row.last_error).length, active: showdays.filter((row) => row.active).length }
  return { version: PRIVATE_PROPERTY_RECONCILIATION_REPORT_SERVICE_VERSION, phase: 'private-property-phase5-reconciliation-analytics', generatedAt: new Date().toISOString(), organisationId: orgId, mode: 'READ_ONLY', safety: { privatePropertyApiCalled: checks.some((item) => item.status === 'COMPLETE'), databaseWritten: false, listingsCreated: false, listingsEdited: false }, status: discrepancies.length || checks.some((item) => item.status !== 'COMPLETE') || leadSummary.failed || showdaySummary.failed ? 'ATTENTION_REQUIRED' : 'COMPLETE', summary: { configuredProductionBranches: configurations.length, localSyncCount: syncs.length, discrepancyCount: discrepancies.length, leadIntake: leadSummary, showdays: showdaySummary }, checks, discrepancies }
}
