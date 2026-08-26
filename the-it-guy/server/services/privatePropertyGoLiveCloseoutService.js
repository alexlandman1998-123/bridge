import { normalizePrivatePropertyText } from './privatePropertyClient.js'
import {
  buildPrivatePropertyPublishConfirmation,
} from './privatePropertyControlledPublishService.js'
import {
  buildPrivatePropertyGoLiveReadinessReport,
} from './privatePropertyGoLiveReadinessService.js'

export const PRIVATE_PROPERTY_GO_LIVE_CLOSEOUT_SERVICE_VERSION = 'arch9_private_property_go_live_closeout_v1'

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

function normalizeReport(value = null) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value
}

function isSandboxPublishSubmitted(report = null) {
  const item = normalizeReport(report)
  return Boolean(
    item &&
    normalizeKey(item.status) === 'submitted' &&
    item.apply === true &&
    item.safety?.privatePropertyApiCalled === true &&
    item.safety?.listingPublished === true,
  )
}

function isSandboxMonitorActivated(report = null) {
  const item = normalizeReport(report)
  return Boolean(
    item &&
    normalizeKey(item.status) === 'activated' &&
    normalizeKey(item.externalStatus) === 'active' &&
    item.safety?.privatePropertyApiCalled === true,
  )
}

function isSandboxSyncActive(sync = null) {
  if (!sync) return false
  return normalizeKey(sync.external_status || sync.externalStatus) === 'active' && sync.is_on_portal === true
}

function summarizeSandboxPublishReport(report = null) {
  const item = normalizeReport(report)
  if (!item) return null
  return {
    phase: normalizePrivatePropertyText(item.phase),
    status: normalizePrivatePropertyText(item.status),
    apply: item.apply === true,
    recordSync: item.recordSync === true,
    privatePropertyApiCalled: item.safety?.privatePropertyApiCalled === true,
    listingPublished: item.safety?.listingPublished === true,
    databaseWritten: item.safety?.databaseWritten === true,
    privatePropertyReference: normalizePrivatePropertyText(item.apiResponse?.privatePropertyReference) || null,
    propertyId: normalizePrivatePropertyText(item.submitCandidate?.propertyId) || null,
    payloadDigest: normalizePrivatePropertyText(item.submitCandidate?.payloadDigest) || null,
    listingXmlDigest: normalizePrivatePropertyText(item.submitCandidate?.listingXmlDigest) || null,
  }
}

function summarizeSandboxMonitorReport(report = null) {
  const item = normalizeReport(report)
  if (!item) return null
  return {
    phase: normalizePrivatePropertyText(item.phase),
    status: normalizePrivatePropertyText(item.status),
    externalStatus: normalizePrivatePropertyText(item.externalStatus),
    privatePropertyApiCalled: item.safety?.privatePropertyApiCalled === true,
    databaseWritten: item.safety?.databaseWritten === true,
    propertyId: normalizePrivatePropertyText(item.propertyId) || null,
    privatePropertyReference: normalizePrivatePropertyText(item.statusProbe?.privatePropertyRef) || null,
    continuationKey: normalizePrivatePropertyText(item.eventFeed?.continuationKey) || null,
    eventMatchCount: Number(item.eventFeed?.matchCount) || 0,
    latestEvent: item.eventFeed?.latestEvent || null,
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
    lastCheckedAt: normalizePrivatePropertyText(sync.last_checked_at || sync.lastCheckedAt) || null,
    activatedAt: normalizePrivatePropertyText(sync.activated_at || sync.activatedAt) || null,
  }
}

async function fetchLatestSandboxSync({ client, listingId } = {}) {
  const normalizedListingId = normalizePrivatePropertyText(listingId)
  if (!client || !normalizedListingId) return { sync: null, error: null }

  const { data, error } = await client
    .from('private_property_listing_syncs')
    .select('*')
    .eq('private_listing_id', normalizedListingId)
    .eq('environment', 'sandbox')
    .order('last_checked_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) return { sync: null, error }
  return { sync: data || null, error: null }
}

function buildOperationalApprovalCheck(evidence = {}) {
  const approvedBy = normalizePrivatePropertyText(evidence.approvedBy || evidence.approved_by)
  const approvalReference = normalizePrivatePropertyText(evidence.approvalReference || evidence.approval_reference || evidence.approvalRef)
  const supportContact = normalizePrivatePropertyText(evidence.supportContact || evidence.support_contact)
  const rollbackOwner = normalizePrivatePropertyText(evidence.rollbackOwner || evidence.rollback_owner)
  const blockers = []
  if (!approvedBy) blockers.push('missing_go_live_approved_by')
  if (!approvalReference) blockers.push('missing_go_live_approval_reference')
  if (!supportContact) blockers.push('missing_support_contact')
  if (!rollbackOwner) blockers.push('missing_rollback_owner')
  return buildCheck('operational_approval', blockers.length === 0, blockers, {
    approvedBy,
    approvalReference,
    supportContact,
    rollbackOwner,
  })
}

export async function runPrivatePropertyGoLiveCloseout({
  client,
  listingId = '',
  secrets = process.env,
  overrides = {},
  sandboxPublishReport = null,
  sandboxMonitorReport = null,
  productionReadinessReport = null,
  evidence = {},
} = {}) {
  if (!client) throw new Error('Supabase client is required.')
  const normalizedListingId = normalizePrivatePropertyText(listingId)
  if (!normalizedListingId) throw new Error('--listing-id is required.')

  const readiness = productionReadinessReport || await buildPrivatePropertyGoLiveReadinessReport({
    client,
    listingId: normalizedListingId,
    environment: 'production',
    secrets,
    overrides,
  })
  const { sync, error: syncError } = await fetchLatestSandboxSync({ client, listingId: normalizedListingId })
  const productionConfirmation = buildPrivatePropertyPublishConfirmation({
    listingId: normalizedListingId,
    environment: 'production',
  })

  const productionReadinessBlockers = readiness?.ready === true ? [] : readiness?.blockers || ['missing_production_readiness_report']
  const publishBlockers = isSandboxPublishSubmitted(sandboxPublishReport) ? [] : ['missing_successful_sandbox_publish_evidence']
  const monitorBlockers = isSandboxMonitorActivated(sandboxMonitorReport) ? [] : ['missing_sandbox_activation_evidence']
  const syncBlockers = syncError
    ? ['private_property_sandbox_sync_lookup_failed']
    : isSandboxSyncActive(sync)
      ? []
      : ['missing_active_sandbox_sync_record']
  const approvalCheck = buildOperationalApprovalCheck(evidence)

  const checks = [
    buildCheck('production_readiness', productionReadinessBlockers.length === 0, productionReadinessBlockers, {
      status: normalizePrivatePropertyText(readiness?.status),
      ready: readiness?.ready === true,
      warnings: readiness?.warnings || [],
      productionApproval: readiness?.checks?.find((check) => check.name === 'production_approval') || null,
    }),
    buildCheck('sandbox_publish_evidence', publishBlockers.length === 0, publishBlockers, summarizeSandboxPublishReport(sandboxPublishReport)),
    buildCheck('sandbox_activation_evidence', monitorBlockers.length === 0, monitorBlockers, summarizeSandboxMonitorReport(sandboxMonitorReport)),
    buildCheck('internal_sync_state', syncBlockers.length === 0, syncBlockers, {
      sync: summarizeSync(sync),
      error: syncError ? {
        message: syncError.message,
        code: syncError.code || null,
        details: syncError.details || null,
      } : null,
    }),
    approvalCheck,
    buildCheck('safety', true, [], {
      privatePropertyApiCalled: false,
      databaseWritten: false,
      rawCredentialsStored: false,
      listingPublished: false,
    }),
  ]
  const blockers = unique(checks.flatMap((check) => check.blockers))
  const ready = blockers.length === 0

  return {
    version: PRIVATE_PROPERTY_GO_LIVE_CLOSEOUT_SERVICE_VERSION,
    phase: 'private-property-go-live-phase6-closeout',
    generatedAt: new Date().toISOString(),
    listingId: normalizedListingId,
    status: ready ? 'GO_LIVE_READY' : 'BLOCKED',
    ready,
    safety: {
      privatePropertyApiCalled: false,
      databaseWritten: false,
      rawCredentialsStored: false,
      listingPublished: false,
    },
    blockers,
    warnings: unique(readiness?.warnings || []),
    checks,
    production: {
      readiness: {
        status: normalizePrivatePropertyText(readiness?.status),
        ready: readiness?.ready === true,
        blockers: readiness?.blockers || [],
        warnings: readiness?.warnings || [],
      },
      expectedConfirmation: productionConfirmation,
      publishCommand: `npm run private-property:controlled-publish-rehearsal -- --listing-id=${normalizedListingId} --environment=production --apply --record-sync --confirm=${productionConfirmation}`,
      monitorCommand: `npm run private-property:post-submit-monitor -- --listing-id=${normalizedListingId} --environment=production --continuation-key=0 --record-sync`,
    },
    sandbox: {
      publishEvidence: summarizeSandboxPublishReport(sandboxPublishReport),
      activationEvidence: summarizeSandboxMonitorReport(sandboxMonitorReport),
      latestSync: summarizeSync(sync),
    },
    approval: approvalCheck.details,
    nextStep: ready
      ? 'Run the production controlled publish command, then run the production post-submit monitor until activated or attention is required.'
      : 'Resolve closeout blockers before submitting a production Private Property listing.',
  }
}
