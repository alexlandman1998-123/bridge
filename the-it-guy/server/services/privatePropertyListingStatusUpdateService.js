import { beginRentalPublicationAttempt, updateRentalPublicationAttempt, retainUncertainRentalPublication, isDefinitePortalRejection } from './rentalPublicationAttemptService.js'
import { createPrivatePropertyClient, extractPrivatePropertyXmlTag, normalizePrivatePropertyText, validatePrivatePropertySoapResult } from './privatePropertyClient.js'
import { resolvePrivatePropertyAgencyConfig, resolvePrivatePropertyCredentials } from './privatePropertyAgencyConfigService.js'
import { recordPrivatePropertyListingSync, resolvePrivatePropertyExternalStatus } from './privatePropertyListingSyncService.js'
import { buildPrivatePropertyGoLiveReadinessReport } from './privatePropertyGoLiveReadinessService.js'

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
  confirmation = '',
  buildReadiness = buildPrivatePropertyGoLiveReadinessReport,
} = {}) {
  if (!client) throw new Error('Supabase client is required.')
  const normalizedListingId = normalizePrivatePropertyText(listingId)
  if (!normalizedListingId) throw new Error('Listing ID is required.')
  const syncEnvironment = environment(requestedEnvironment)
  const reactivation = ['forsale', 'tolet'].includes(key(propertyStatus))
  if (!['inactive', 'forsale', 'tolet', 'pendingoffer', 'sold'].includes(key(propertyStatus))) throw new Error('Unsupported Private Property status change.')
  if (reactivation && syncEnvironment === 'production' && confirmation !== `PRIVATE_PROPERTY_REACTIVATE:${normalizedListingId}:production`) {
    throw new Error('Confirm reactivation of this exact Private Property production listing before changing its status.')
  }
  const syncResult = await client
    .from('private_property_listing_syncs')
    .select('property_id, branch_guid, listing_type, private_property_ref, suburb_id, agent_ids, last_payload_summary')
    .eq('private_listing_id', normalizedListingId)
    .eq('environment', syncEnvironment)
    .maybeSingle()
  if (syncResult.error) throw syncResult.error
  const sync = syncResult.data
  if (!sync?.property_id) throw new Error('Private Property has no synced property ID for this listing. Refresh its Private Property status before trying again.')
  if (reactivation && key(propertyStatus) !== ((sync.listing_type || 'Sale') === 'Rental' ? 'tolet' : 'forsale')) throw new Error('The reactivation status does not match this listing type.')

  const agency = await resolvePrivatePropertyAgencyConfig({ client, listingId: normalizedListingId, environment: syncEnvironment })
  if (!agency.ready) throw new Error(`Private Property is not ready for a status update: ${(agency.blockers || []).join(', ')}.`)
  const credentials = await resolvePrivatePropertyCredentials({ client, config: agency.config, secrets })
  if (credentials.missingSecrets.length) throw new Error(`Private Property credentials are unavailable: ${credentials.missingSecrets.join(', ')}.`)

  const portal = privateProperty || createPrivatePropertyClient({ baseUrl: agency.config.baseUrl, username: credentials.username, password: credentials.password })
  if (reactivation) {
    const readiness = await buildReadiness({ client, listingId: normalizedListingId, environment: syncEnvironment, secrets, verifyLocation: true, privateProperty: portal })
    // An inactive record with the matching retained address is eligible for the
    // separate status operation, even though a normal content publish is blocked.
    const eligible = readiness.recovery?.canReactivate && readiness.blockers.every((blocker) => blocker === 'private_property_reactivation_required')
    if (!eligible) throw new Error(readiness.recovery?.message || readiness.nextStep || 'Check this existing Private Property record before reactivation.')
    if (readiness.recovery.propertyId !== sync.property_id || readiness.recovery.branchGuid !== sync.branch_guid) throw new Error('The Private Property record changed during review. Refresh before reactivation.')
  }
  const attempt = await beginRentalPublicationAttempt({ client,listingId:normalizedListingId,channel:'private_property',environment:syncEnvironment,
    operation:'status_update',identity:{ propertyId:sync.property_id,branchGuid:sync.branch_guid || agency.config.branchGuid,listingType:sync.listing_type || 'Sale',existed:true,status:propertyStatus },payload:{ propertyStatus } })
  let receipt = {}
  try {
  const response = await portal.listingStatusUpdate({
    branchGuid: sync.branch_guid || agency.config.branchGuid,
    propertyId: sync.property_id,
    listingType: sync.listing_type || 'Sale',
    propertyStatus,
  })
  const responseSummary = validatePrivatePropertySoapResult(response, 'ListingStatusUpdate')
  receipt = { accepted:true,reference:sync.private_property_ref || '' }
  if (attempt) await updateRentalPublicationAttempt(client,attempt,{ state:'uncertain',receipt })
  let observed
  try {
    observed = await portal.getListingStatus({ branchGuid: sync.branch_guid || agency.config.branchGuid, propertyId: sync.property_id })
  } catch {
    // Keep the accepted request's evidence even if the subsequent observation
    // fails. A failed probe cannot confirm that an advert is active.
    observed = { data: '' }
  }
  const externalStatus = resolvePrivatePropertyExternalStatus({ privatePropertyStatus: extractPrivatePropertyXmlTag(observed.data, 'GetListingStatusResult'), fallback: 'unknown' })
  const recorded = await recordPrivatePropertyListingSync({
    client,
    listingId: normalizedListingId,
    propertyId: sync.property_id,
    branchGuid: sync.branch_guid || agency.config.branchGuid,
    environment: syncEnvironment,
    listingType: sync.listing_type || 'Sale',
    privatePropertyRef: sync.private_property_ref,
    externalStatus,
    isOnPortal: externalStatus === 'active',
    responseSummary,
  })
  if (key(propertyStatus) === 'inactive' && !['inactive', 'removed'].includes(externalStatus)) throw new Error('Private Property acknowledged the withdrawal but still reports the listing as active or processing. Refresh its status before treating it as withdrawn.')
  const confirmed = reactivation ? externalStatus === 'active' : true
  if (attempt) {
    if (!confirmed || externalStatus === 'unknown' || !recorded.sync?.id || recorded.externalLinkWarning) throw new Error('Private Property accepted this status request but its final result is unconfirmed. Reconcile before sending again.')
    await updateRentalPublicationAttempt(client,attempt,{ state:'accepted',receipt })
  }
  return {
    status: confirmed ? 'UPDATED' : 'NOT_CONFIRMED', confirmed, externalStatus, propertyStatus,
    message: reactivation
      ? confirmed ? 'Private Property confirms this listing is active.' : `Private Property accepted the reactivation request but still reports ${externalStatus}. The listing is not confirmed live. Refresh status before trying again.`
      : '',
    response: { status: response.status, durationMs: response.durationMs, summary: responseSummary }, syncResult: recorded,
  }
  } catch (error) {
    if (attempt) {
      if (!receipt.accepted && isDefinitePortalRejection(error)) await updateRentalPublicationAttempt(client,attempt,{ state:'rejected',last_error:error.message })
      else {
        await retainUncertainRentalPublication(client,attempt,error,receipt)
        error.code = 'RENTAL_PUBLICATION_PENDING'
        error.message = 'The Private Property status outcome is unconfirmed. Reconcile the saved request before sending again.'
      }
    }
    throw error
  }
}
