import { createPrivatePropertyClient, normalizePrivatePropertyText, summarizePrivatePropertySoapResponse } from './privatePropertyClient.js'
import { resolvePrivatePropertyAgencyConfig, resolvePrivatePropertyCredentials } from './privatePropertyAgencyConfigService.js'
import { recordPrivatePropertyListingSync } from './privatePropertyListingSyncService.js'

function key(value = '') {
  return normalizePrivatePropertyText(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function environment(value = '') {
  return key(value) === 'production' ? 'production' : 'sandbox'
}

export async function updatePrivatePropertyListingStatus({
  client,
  listingId = '',
  propertyStatus = 'Inactive',
  environment: requestedEnvironment = 'sandbox',
  secrets = process.env,
  privateProperty = null,
} = {}) {
  if (!client) throw new Error('Supabase client is required.')
  const normalizedListingId = normalizePrivatePropertyText(listingId)
  if (!normalizedListingId) throw new Error('Listing ID is required.')
  const syncEnvironment = environment(requestedEnvironment)
  const syncResult = await client
    .from('private_property_listing_syncs')
    .select('property_id, branch_guid, listing_type, private_property_ref, suburb_id, agent_ids, last_payload_summary')
    .eq('private_listing_id', normalizedListingId)
    .eq('environment', syncEnvironment)
    .maybeSingle()
  if (syncResult.error) throw syncResult.error
  const sync = syncResult.data
  if (!sync?.property_id) throw new Error('Private Property has no synced property ID for this listing. Refresh its Private Property status before trying again.')

  const agency = await resolvePrivatePropertyAgencyConfig({ client, listingId: normalizedListingId, environment: syncEnvironment })
  if (!agency.ready) throw new Error(`Private Property is not ready for a status update: ${(agency.blockers || []).join(', ')}.`)
  const credentials = await resolvePrivatePropertyCredentials({ client, config: agency.config, secrets })
  if (credentials.missingSecrets.length) throw new Error(`Private Property credentials are unavailable: ${credentials.missingSecrets.join(', ')}.`)

  const portal = privateProperty || createPrivatePropertyClient({ baseUrl: agency.config.baseUrl, username: credentials.username, password: credentials.password })
  const response = await portal.listingStatusUpdate({
    branchGuid: sync.branch_guid || agency.config.branchGuid,
    propertyId: sync.property_id,
    listingType: sync.listing_type || 'Sale',
    propertyStatus,
  })
  const responseSummary = response.summary || summarizePrivatePropertySoapResponse('ListingStatusUpdate', response.data || '')
  const inactive = ['inactive', 'withdrawn', 'removed', 'expired'].includes(key(propertyStatus))
  const recorded = await recordPrivatePropertyListingSync({
    client,
    listingId: normalizedListingId,
    propertyId: sync.property_id,
    branchGuid: sync.branch_guid || agency.config.branchGuid,
    environment: syncEnvironment,
    listingType: sync.listing_type || 'Sale',
    privatePropertyRef: sync.private_property_ref,
    externalStatus: inactive ? 'inactive' : 'active',
    isOnPortal: !inactive,
    eventType: inactive ? 'deactivated' : 'activated',
    eventStatus: propertyStatus,
    responseSummary,
    payloadSummary: sync.last_payload_summary || {},
    agentIds: sync.agent_ids || [],
    suburbId: sync.suburb_id,
  })
  return { status: 'UPDATED', propertyStatus, response: { status: response.status, durationMs: response.durationMs, summary: responseSummary }, syncResult: recorded }
}
