import {
  createPrivatePropertyClient,
  normalizePrivatePropertyText,
} from './privatePropertyClient.js'
import { resolvePrivatePropertyCredentials } from './privatePropertyAgencyConfigService.js'
import { parsePrivatePropertyPostSubmitEvents } from './privatePropertyPostSubmitMonitorService.js'
import { recordPrivatePropertyListingSync, resolvePrivatePropertyExternalStatus } from './privatePropertyListingSyncService.js'

export const PRIVATE_PROPERTY_EVENT_RECONCILIATION_SERVICE_VERSION = 'arch9_private_property_event_reconciliation_v1'

function key(value = '') {
  return normalizePrivatePropertyText(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function branchGuid(config = {}) {
  return normalizePrivatePropertyText(config.branch_guid || config.branchGuid)
}

function eventCheckpoint(config = {}) {
  const metadata = config.metadata_json || config.metadataJson || {}
  return normalizePrivatePropertyText(metadata.private_property_event_feed_continuation_key || metadata.privatePropertyEventFeedContinuationKey || '0') || '0'
}

function startDateTime() {
  return new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
}

function referenceForEvent(event = {}) {
  const direct = normalizePrivatePropertyText(event.privatePropertyRef)
  if (direct) return direct
  const description = normalizePrivatePropertyText(event.eventDescription)
  return /^T\d+/i.test(description) ? description : ''
}

function eventPropertyId(event = {}) {
  return normalizePrivatePropertyText(event.propertyId)
}

function activeConfig(config = {}) {
  return Boolean(config.enabled) && ['approved', 'active'].includes(key(config.status)) && Boolean(config.go_live_approved_at || config.goLiveApprovedAt)
}

async function updateCheckpoint({ client, config, continuationKey } = {}) {
  const metadata = config.metadata_json && typeof config.metadata_json === 'object' ? config.metadata_json : {}
  const checkpoint = continuationKey || eventCheckpoint(config)
  const { error } = await client.from('private_property_agency_configs').update({
    metadata_json: { ...metadata, private_property_event_feed_continuation_key: checkpoint },
    last_event_feed_check_at: new Date().toISOString(),
  }).eq('id', config.id)
  if (error) throw error
}

async function reconcileConfig({ client, config, secrets, createPrivateProperty = createPrivatePropertyClient } = {}) {
  const credentials = await resolvePrivatePropertyCredentials({ client, config, secrets })
  const guid = branchGuid(config)
  if (!guid || credentials.missingSecrets.length) {
    return { configId: config.id, branchGuid: guid || null, status: 'BLOCKED', blockers: [!guid && 'missing_private_property_branch_guid', ...credentials.missingSecrets.map((name) => `missing_runtime_secret:${name}`)].filter(Boolean), processed: 0 }
  }
  const checkpoint = eventCheckpoint(config)
  const portal = createPrivateProperty({ baseUrl: config.base_url || config.baseUrl, username: credentials.username, password: credentials.password })
  const response = await portal.getListingEventFeedByBranch({ branchGuid: guid, continuationKey: checkpoint, startDateTime: checkpoint === '0' ? startDateTime() : '' })
  const events = parsePrivatePropertyPostSubmitEvents(response.data)
  const continuationKey = normalizePrivatePropertyText(response.summary?.continuationKey)
  const propertyIds = [...new Set(events.map(eventPropertyId).filter(Boolean))]
  let syncRows = []
  if (propertyIds.length) {
    const { data, error } = await client.from('private_property_listing_syncs').select('*').eq('environment', 'production').eq('branch_guid', guid).in('property_id', propertyIds)
    if (error) throw error
    syncRows = data || []
  }
  const byPropertyId = new Map(syncRows.map((row) => [normalizePrivatePropertyText(row.property_id), row]))
  const results = []
  for (const event of events) {
    const propertyId = eventPropertyId(event)
    const sync = byPropertyId.get(propertyId)
    if (!sync) continue
    const externalStatus = resolvePrivatePropertyExternalStatus({ eventType: event.listingFeedEventType || event.eventType, eventStatus: event.eventStatus, fallback: sync.external_status || 'submitted' })
    const recorded = await recordPrivatePropertyListingSync({
      client,
      listingId: sync.private_listing_id,
      propertyId,
      branchGuid: guid,
      environment: 'production',
      listingType: sync.listing_type,
      privatePropertyRef: referenceForEvent(event) || sync.private_property_ref || '',
      externalStatus,
      isOnPortal: externalStatus === 'active',
      eventType: event.listingFeedEventType || event.eventType || '',
      eventStatus: event.eventStatus || '',
      eventDescription: event.eventDescription || '',
      eventAt: event.eventDate || '',
      continuationKey,
      suburbId: sync.suburb_id,
      agentIds: sync.agent_ids || [],
      payloadSummary: sync.last_payload_summary || {},
      responseSummary: { eventFeed: response.summary || {} },
      eventSummary: event,
      activatedAt: externalStatus === 'active' ? event.eventDate || new Date().toISOString() : '',
    })
    results.push({ listingId: sync.private_listing_id, propertyId, externalStatus, syncId: recorded.sync?.id || null })
  }
  await updateCheckpoint({ client, config, continuationKey })
  return { configId: config.id, branchGuid: guid, status: 'COMPLETE', checkpoint, continuationKey: continuationKey || checkpoint, eventCount: events.length, processed: results.length, unmatchedEventCount: events.length - results.length, results }
}

export async function runPrivatePropertyEventReconciliation({ client, secrets = process.env, createPrivateProperty = createPrivatePropertyClient } = {}) {
  if (!client) throw new Error('Supabase client is required.')
  const { data, error } = await client.from('private_property_agency_configs').select('*').eq('environment', 'production').eq('enabled', true).in('status', ['approved', 'active'])
  if (error) throw error
  const configs = (data || []).filter(activeConfig)
  const reports = []
  for (const config of configs) {
    try {
      reports.push(await reconcileConfig({ client, config, secrets, createPrivateProperty }))
    } catch (error) {
      reports.push({ configId: config.id, branchGuid: branchGuid(config) || null, status: 'FAILED', processed: 0, error: error.message || 'Private Property event reconciliation failed.' })
    }
  }
  const failed = reports.filter((report) => ['FAILED', 'BLOCKED'].includes(report.status))
  return {
    version: PRIVATE_PROPERTY_EVENT_RECONCILIATION_SERVICE_VERSION,
    phase: 'private-property-phase3-event-reconciliation',
    generatedAt: new Date().toISOString(),
    safety: { listingsCreated: false, listingsEdited: false, portalCalls: reports.length, databaseWrites: reports.reduce((sum, report) => sum + Number(report.processed || 0), 0) },
    status: failed.length ? 'ATTENTION_REQUIRED' : 'COMPLETE',
    configuredBranchCount: configs.length,
    processedEventCount: reports.reduce((sum, report) => sum + Number(report.processed || 0), 0),
    reports,
  }
}
