import { normalizePrivatePropertyText } from './privatePropertyClient.js'

export const PRIVATE_PROPERTY_PRODUCTION_PROOF_SERVICE_VERSION = 'arch9_private_property_production_proof_v1'

function normalizeKey(value = '') {
  return normalizePrivatePropertyText(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function unique(values = []) {
  return [...new Set(values.map(normalizePrivatePropertyText).filter(Boolean))]
}

function buildCheck(name, passed, blockers = [], details = {}) {
  const normalizedBlockers = unique(blockers)
  return {
    name,
    status: passed && normalizedBlockers.length === 0 ? 'PASS' : 'BLOCKED',
    blockers: normalizedBlockers,
    details,
  }
}

function isProductionLaunchSubmitted(report = null, listingId = '') {
  return Boolean(
    report &&
    normalizeKey(report.status) === 'production_submitted' &&
    normalizePrivatePropertyText(report.listingId) === normalizePrivatePropertyText(listingId) &&
    report.environment === 'production' &&
    report.apply === true &&
    report.safety?.privatePropertyApiCalled === true &&
    report.safety?.listingPublished === true &&
    report.safety?.databaseWritten === true,
  )
}

function isProductionMonitorActivated(report = null, listingId = '') {
  return Boolean(
    report &&
    normalizeKey(report.status) === 'activated' &&
    normalizeKey(report.externalStatus) === 'active' &&
    normalizePrivatePropertyText(report.listingId) === normalizePrivatePropertyText(listingId) &&
    report.environment === 'production' &&
    report.safety?.privatePropertyApiCalled === true &&
    report.safety?.databaseWritten === true,
  )
}

function isProductionSyncActive(sync = null) {
  return Boolean(
    sync &&
    normalizeKey(sync.environment) === 'production' &&
    normalizeKey(sync.external_status || sync.externalStatus) === 'active' &&
    sync.is_on_portal === true,
  )
}

function isListingPublished(listing = null) {
  return Boolean(
    listing &&
    normalizeKey(listing.private_property_status || listing.privatePropertyStatus) === 'published' &&
    normalizePrivatePropertyText(listing.private_property_reference || listing.privatePropertyReference),
  )
}

function summarizeLaunch(report = null) {
  if (!report) return null
  return {
    phase: normalizePrivatePropertyText(report.phase),
    status: normalizePrivatePropertyText(report.status),
    listingId: normalizePrivatePropertyText(report.listingId),
    environment: normalizePrivatePropertyText(report.environment),
    apply: report.apply === true,
    privatePropertyApiCalled: report.safety?.privatePropertyApiCalled === true,
    databaseWritten: report.safety?.databaseWritten === true,
    listingPublished: report.safety?.listingPublished === true,
    privatePropertyReference: normalizePrivatePropertyText(report.productionSubmit?.privatePropertyReference) || null,
    propertyId: normalizePrivatePropertyText(report.productionSubmit?.propertyId) || null,
    branchGuid: normalizePrivatePropertyText(report.productionSubmit?.branchGuid) || null,
  }
}

function summarizeMonitor(report = null) {
  if (!report) return null
  return {
    phase: normalizePrivatePropertyText(report.phase),
    status: normalizePrivatePropertyText(report.status),
    externalStatus: normalizePrivatePropertyText(report.externalStatus),
    listingId: normalizePrivatePropertyText(report.listingId),
    environment: normalizePrivatePropertyText(report.environment),
    propertyId: normalizePrivatePropertyText(report.propertyId) || null,
    branchGuid: normalizePrivatePropertyText(report.branchGuid) || null,
    privatePropertyReference: normalizePrivatePropertyText(report.statusProbe?.privatePropertyRef) || null,
    continuationKey: normalizePrivatePropertyText(report.eventFeed?.continuationKey) || null,
    eventMatchCount: Number(report.eventFeed?.matchCount) || 0,
    latestEvent: report.eventFeed?.latestEvent || null,
  }
}

function summarizeSync(sync = null) {
  if (!sync) return null
  return {
    id: normalizePrivatePropertyText(sync.id),
    environment: normalizePrivatePropertyText(sync.environment),
    propertyId: normalizePrivatePropertyText(sync.property_id || sync.propertyId),
    branchGuid: normalizePrivatePropertyText(sync.branch_guid || sync.branchGuid),
    privatePropertyReference: normalizePrivatePropertyText(sync.private_property_ref || sync.privatePropertyRef) || null,
    externalStatus: normalizePrivatePropertyText(sync.external_status || sync.externalStatus),
    isOnPortal: sync.is_on_portal === true,
    lastEventType: normalizePrivatePropertyText(sync.last_event_type || sync.lastEventType) || null,
    lastEventStatus: normalizePrivatePropertyText(sync.last_event_status || sync.lastEventStatus) || null,
    continuationKey: normalizePrivatePropertyText(sync.continuation_key || sync.continuationKey) || null,
    lastCheckedAt: normalizePrivatePropertyText(sync.last_checked_at || sync.lastCheckedAt) || null,
    activatedAt: normalizePrivatePropertyText(sync.activated_at || sync.activatedAt) || null,
  }
}

function summarizeListing(listing = null) {
  if (!listing) return null
  return {
    id: normalizePrivatePropertyText(listing.id),
    privatePropertyStatus: normalizePrivatePropertyText(listing.private_property_status || listing.privatePropertyStatus),
    privatePropertyReference: normalizePrivatePropertyText(listing.private_property_reference || listing.privatePropertyReference) || null,
    privatePropertyListingUrl: normalizePrivatePropertyText(listing.private_property_listing_url || listing.privatePropertyListingUrl) || null,
    updatedAt: normalizePrivatePropertyText(listing.updated_at || listing.updatedAt) || null,
  }
}

function buildHandoffCheck(evidence = {}) {
  const acceptedBy = normalizePrivatePropertyText(evidence.acceptedBy || evidence.accepted_by)
  const supportContact = normalizePrivatePropertyText(evidence.supportContact || evidence.support_contact)
  const rollbackOwner = normalizePrivatePropertyText(evidence.rollbackOwner || evidence.rollback_owner)
  const escalationContact = normalizePrivatePropertyText(evidence.escalationContact || evidence.escalation_contact)
  const blockers = []
  if (!acceptedBy) blockers.push('missing_production_acceptance_by')
  if (!supportContact) blockers.push('missing_support_contact')
  if (!rollbackOwner) blockers.push('missing_rollback_owner')
  if (!escalationContact) blockers.push('missing_escalation_contact')
  return buildCheck('operational_handoff', blockers.length === 0, blockers, {
    acceptedBy,
    supportContact,
    rollbackOwner,
    escalationContact,
  })
}

async function fetchProductionSync({ client, listingId } = {}) {
  const { data, error } = await client
    .from('private_property_listing_syncs')
    .select('*')
    .eq('private_listing_id', listingId)
    .eq('environment', 'production')
    .order('last_checked_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return { data: data || null, error }
}

async function fetchPrivateListing({ client, listingId } = {}) {
  const { data, error } = await client
    .from('private_listings')
    .select('id, private_property_status, private_property_reference, private_property_listing_url, updated_at')
    .eq('id', listingId)
    .maybeSingle()
  return { data: data || null, error }
}

export async function runPrivatePropertyProductionProof({
  client,
  listingId = '',
  launchReport = null,
  productionMonitorReport = null,
  evidence = {},
} = {}) {
  if (!client) throw new Error('Supabase client is required.')
  const normalizedListingId = normalizePrivatePropertyText(listingId)
  if (!normalizedListingId) throw new Error('--listing-id is required.')

  const [{ data: productionSync, error: syncError }, { data: listing, error: listingError }] = await Promise.all([
    fetchProductionSync({ client, listingId: normalizedListingId }),
    fetchPrivateListing({ client, listingId: normalizedListingId }),
  ])

  const launchBlockers = isProductionLaunchSubmitted(launchReport, normalizedListingId)
    ? []
    : ['missing_successful_production_launch_evidence']
  const monitorBlockers = isProductionMonitorActivated(productionMonitorReport, normalizedListingId)
    ? []
    : ['missing_production_activation_evidence']
  const syncBlockers = syncError
    ? ['private_property_production_sync_lookup_failed']
    : isProductionSyncActive(productionSync)
      ? []
      : ['missing_active_production_sync_record']
  const listingBlockers = listingError
    ? ['private_property_listing_lookup_failed']
    : isListingPublished(listing)
      ? []
      : ['private_listing_not_marked_published_on_private_property']
  const handoffCheck = buildHandoffCheck(evidence)

  const checks = [
    buildCheck('production_launch_evidence', launchBlockers.length === 0, launchBlockers, summarizeLaunch(launchReport)),
    buildCheck('production_activation_evidence', monitorBlockers.length === 0, monitorBlockers, summarizeMonitor(productionMonitorReport)),
    buildCheck('production_sync_state', syncBlockers.length === 0, syncBlockers, {
      sync: summarizeSync(productionSync),
      error: syncError ? {
        message: syncError.message,
        code: syncError.code || null,
        details: syncError.details || null,
      } : null,
    }),
    buildCheck('arch9_listing_state', listingBlockers.length === 0, listingBlockers, {
      listing: summarizeListing(listing),
      error: listingError ? {
        message: listingError.message,
        code: listingError.code || null,
        details: listingError.details || null,
      } : null,
    }),
    handoffCheck,
    buildCheck('safety', true, [], {
      privatePropertyApiCalled: false,
      databaseWritten: false,
      rawCredentialsStored: false,
      listingPublished: false,
    }),
  ]

  const blockers = unique(checks.flatMap((check) => check.blockers))
  const live = blockers.length === 0
  const attentionRequired = normalizeKey(productionMonitorReport?.status) === 'attention_required'

  return {
    version: PRIVATE_PROPERTY_PRODUCTION_PROOF_SERVICE_VERSION,
    phase: 'private-property-go-live-phase8-production-proof',
    generatedAt: new Date().toISOString(),
    listingId: normalizedListingId,
    environment: 'production',
    status: live ? 'LIVE_CONFIRMED' : attentionRequired ? 'ATTENTION_REQUIRED' : 'BLOCKED',
    live,
    safety: {
      privatePropertyApiCalled: false,
      databaseWritten: false,
      rawCredentialsStored: false,
      listingPublished: false,
    },
    blockers,
    warnings: [],
    checks,
    production: {
      launchEvidence: summarizeLaunch(launchReport),
      activationEvidence: summarizeMonitor(productionMonitorReport),
      latestSync: summarizeSync(productionSync),
      listing: summarizeListing(listing),
    },
    handoff: handoffCheck.details,
    nextStep: live
      ? 'Private Property production go-live is confirmed. Continue normal monitoring and use the production monitor for any follow-up checks.'
      : attentionRequired
        ? 'Investigate the production Private Property activation error before publishing more listings.'
        : 'Resolve production proof blockers before treating Private Property as live.',
  }
}
