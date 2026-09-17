import { createPrivatePropertyClient, normalizePrivatePropertyText } from './privatePropertyClient.js'
import { resolvePrivatePropertyCredentials } from './privatePropertyAgencyConfigService.js'

export const PRIVATE_PROPERTY_SHOWDAY_PROJECTION_SERVICE_VERSION = 'arch9_private_property_showday_projection_v1'

const activeConfig = (config = {}) => Boolean(config.enabled) && ['approved', 'active'].includes(normalizePrivatePropertyText(config.status).toLowerCase()) && Boolean(config.go_live_approved_at)
const activeEvent = (event = {}) => normalizePrivatePropertyText(event.status).toLowerCase() === 'upcoming'

async function record({ client, event, sync, listingSync, active, error = '' } = {}) {
  const payload = { marketing_event_id: event.id, private_listing_id: listingSync.private_listing_id, environment: 'production', branch_guid: listingSync.branch_guid, property_id: listingSync.property_id, active, source_updated_at: event.updated_at || new Date().toISOString(), last_synced_at: error ? null : new Date().toISOString(), last_error: error || null, updated_at: new Date().toISOString() }
  const previous = sync ? client.from('private_property_showday_syncs').update(payload).eq('id', sync.id) : client.from('private_property_showday_syncs').insert(payload)
  const { error: writeError } = await previous
  if (writeError) throw writeError
}

export async function runPrivatePropertyShowdayProjection({ client, secrets = process.env, createPrivateProperty = createPrivatePropertyClient } = {}) {
  if (!client) throw new Error('Supabase client is required.')
  const [eventsResult, existingResult, listingSyncResult, configResult] = await Promise.all([
    client.from('marketing_events').select('id,organisation_id,subject_id,status,starts_at,ends_at,description,updated_at').eq('event_type', 'show_day').eq('subject_type', 'listing').in('status', ['upcoming', 'cancelled', 'completed']),
    client.from('private_property_showday_syncs').select('*').eq('environment', 'production'),
    client.from('private_property_listing_syncs').select('*').eq('environment', 'production').eq('is_on_portal', true),
    client.from('private_property_agency_configs').select('*').eq('environment', 'production').eq('enabled', true).in('status', ['approved', 'active']),
  ])
  for (const result of [eventsResult, existingResult, listingSyncResult, configResult]) if (result.error) throw result.error
  const existingByEvent = new Map((existingResult.data || []).map((row) => [row.marketing_event_id, row]))
  const listingById = new Map((listingSyncResult.data || []).map((row) => [row.private_listing_id, row]))
  const configs = (configResult.data || []).filter(activeConfig)
  const reports = []
  for (const event of eventsResult.data || []) {
    const listingSync = listingById.get(event.subject_id); const previous = existingByEvent.get(event.id)
    if (!listingSync) { if (previous) reports.push({ eventId: event.id, status: 'BLOCKED', reason: 'listing_not_active_on_private_property' }); continue }
    const config = configs.find((row) => row.organisation_id === event.organisation_id && row.branch_guid === listingSync.branch_guid)
    if (!config) { reports.push({ eventId: event.id, status: 'BLOCKED', reason: 'production_connection_not_active' }); continue }
    const shouldBeActive = activeEvent(event)
    if (previous && previous.active === shouldBeActive && previous.source_updated_at === event.updated_at && !previous.last_error) { reports.push({ eventId: event.id, status: 'UNCHANGED' }); continue }
    try {
      const credentials = await resolvePrivatePropertyCredentials({ client, config, secrets })
      if (credentials.missingSecrets.length) throw new Error(`Missing runtime secret: ${credentials.missingSecrets.join(', ')}`)
      const portal = createPrivateProperty({ baseUrl: config.base_url, username: credentials.username, password: credentials.password })
      await portal.listingShowdayUpdate({ branchGuid: listingSync.branch_guid, propertyId: listingSync.property_id, startDate: event.starts_at, endDate: event.ends_at || event.starts_at, description: event.description || '', active: shouldBeActive })
      await record({ client, event, sync: previous, listingSync, active: shouldBeActive })
      reports.push({ eventId: event.id, status: 'SYNCED', active: shouldBeActive })
    } catch (error) {
      await record({ client, event, sync: previous, listingSync, active: shouldBeActive, error: error.message || 'Show day update failed.' })
      reports.push({ eventId: event.id, status: 'FAILED', error: error.message || 'Show day update failed.' })
    }
  }
  const failed = reports.filter((report) => ['FAILED', 'BLOCKED'].includes(report.status))
  return { version: PRIVATE_PROPERTY_SHOWDAY_PROJECTION_SERVICE_VERSION, phase: 'private-property-phase4-showday-projection', generatedAt: new Date().toISOString(), status: failed.length ? 'ATTENTION_REQUIRED' : 'COMPLETE', processed: reports.filter((report) => report.status === 'SYNCED').length, reports }
}
