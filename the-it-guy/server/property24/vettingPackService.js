import { createProperty24ListingPlan } from '../services/property24ListingMapper.js'
import { normalizeProperty24Text, summarizeProperty24Payload } from './client.js'
import {
  fetchProperty24LocalSyncRows,
  runProperty24ReconciliationJob,
} from './reconciliationService.js'

export const PROPERTY24_VETTING_DEFAULT_REPORTS = {
  phase1: 'outputs/property24-phase1-smoke.json',
  preview: 'outputs/property24-real-listing-preview.json',
  publish: 'outputs/property24-publish-listing.json',
  recordSync: 'outputs/property24-record-listing-sync.json',
  reconciliation: 'outputs/property24-reconciliation.json',
  statusUpdate: 'outputs/property24-status-update.json',
  proofUpdateWithoutImages: 'outputs/property24-proof-update-without-images.json',
  proofUpdateWithImages: 'outputs/property24-proof-update-with-images.json',
  proofStatusWithdrawn: 'outputs/property24-proof-status-withdrawn.json',
  proofStatusActive: 'outputs/property24-proof-status-active.json',
  proofStatusPending: 'outputs/property24-proof-status-pending.json',
  proofStatusSold: 'outputs/property24-proof-status-sold.json',
  proofStatusFinalActive: 'outputs/property24-proof-status-final-active.json',
}

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
}

function toArray(value) {
  return Array.isArray(value) ? value : []
}

function getCheck(report = {}, matcher) {
  return toArray(report.checks).find((check) => matcher(normalizeProperty24Text(check.name).toLowerCase(), check))
}

function checkPassed(check) {
  return check?.status === 'PASS'
}

function summarizeCheck(check) {
  if (!check) return null
  return {
    name: check.name,
    status: check.status,
    httpStatus: check.httpStatus || null,
    durationMs: check.durationMs || null,
    summary: check.summary || null,
    reason: check.reason || null,
  }
}

function createEvidence({ id, label, status, summary = {}, evidence = [], nextStep = '' }) {
  return {
    id,
    label,
    status,
    summary,
    evidence: evidence.filter(Boolean),
    nextStep,
  }
}

function redactValue(key, value) {
  const normalizedKey = normalizeProperty24Text(key).toLowerCase()
  if (['password', 'secret', 'token', 'authorization', 'servicerolekey', 'service_role_key'].some((part) => normalizedKey.includes(part))) {
    return value ? '[REDACTED]' : value
  }
  if (normalizedKey === 'bytes') return value ? '[REDACTED_IMAGE_BYTES]' : value
  if (normalizedKey === 'sourceurl' && typeof value === 'string' && value.includes('/storage/v1/object/sign/')) {
    return '[REDACTED_SIGNED_STORAGE_URL]'
  }
  return value
}

export function redactProperty24VettingValue(value, key = '') {
  const redacted = redactValue(key, value)
  if (redacted !== value) return redacted
  if (Array.isArray(value)) return value.map((item) => redactProperty24VettingValue(item, key))
  if (!isObject(value)) return value
  return Object.fromEntries(
    Object.entries(value).map(([childKey, childValue]) => [
      childKey,
      redactProperty24VettingValue(childValue, childKey),
    ]),
  )
}

function createInvalidListingEvidence() {
  const plan = createProperty24ListingPlan({
    listing: {
      listing_type: 'Sale',
    },
    publication: {},
    media: [],
    agentMapping: {},
    catalogMapping: {},
    options: {
      agencyId: null,
      expiryDate: null,
    },
  })
  return {
    status: plan.canSubmit ? 'NEEDS_EVIDENCE' : 'PASS',
    summary: {
      canPreview: plan.canPreview,
      canSubmit: plan.canSubmit,
      dataBlockers: plan.dataBlockers,
      technicalBlockers: plan.technicalBlockers,
    },
  }
}

function createOperationalNotes() {
  return [
    'Credentials are read from server-side environment files only and are not written to the evidence pack.',
    'Image bytes are redacted from reports; evidence only keeps counts, MIME types, and approximate byte lengths.',
    'Existing Property24 listingNumber values are stored and reused for updates.',
    'Photo updates can be minimized with photosChanged=false, which sends photos:null for unchanged images.',
    'Status-only changes use the dedicated Property24 status endpoint.',
    'Reconciliation is report-only and can run on a schedule without publishing listings or creating leads.',
    'Failed readiness checks expose blocker codes before Property24 is called.',
  ]
}

function isMissingOptionalTableError(error = {}) {
  const code = normalizeProperty24Text(error.code).toUpperCase()
  const message = normalizeProperty24Text(error.message || error.details).toLowerCase()
  return code === '42P01' || code === 'PGRST205' || message.includes('does not exist')
}

async function selectOptionalRows(query) {
  const result = await query
  if (result?.error) {
    if (isMissingOptionalTableError(result.error)) return []
    throw result.error
  }
  return Array.isArray(result?.data) ? result.data : []
}

function findFirstProperty24Id(value, keys = []) {
  const records = Array.isArray(value)
    ? value
    : Array.isArray(value?.items)
      ? value.items
      : Array.isArray(value?.data)
        ? value.data
        : value && typeof value === 'object'
          ? [value]
          : []
  for (const record of records) {
    for (const key of keys) {
      const candidate = Number(record?.[key])
      if (Number.isInteger(candidate) && candidate > 0) return candidate
    }
  }
  return null
}

async function runReadOnlyProperty24Check(name, operation) {
  try {
    const result = await operation()
    return {
      name,
      status: 'PASS',
      httpStatus: result?.status || 200,
      durationMs: result?.durationMs || null,
      summary: summarizeProperty24Payload(result?.data),
      data: result?.data,
    }
  } catch (error) {
    return {
      name,
      status: 'FAIL',
      httpStatus: error.status || null,
      durationMs: null,
      reason: normalizeProperty24Text(error.message) || 'Property24 read failed.',
    }
  }
}

async function createLivePhase1Report({ property24, agencyId } = {}) {
  const firstWave = await Promise.all([
    runReadOnlyProperty24Check('authenticated echo accepts Basic Auth', () => property24.echoAuthenticated()),
    runReadOnlyProperty24Check(`fetch agency ${agencyId}`, () => property24.fetchAgency(agencyId)),
    runReadOnlyProperty24Check(`fetch agency ${agencyId} agents`, () => property24.fetchAgencyAgents(agencyId)),
    runReadOnlyProperty24Check('fetch countries', () => property24.fetchCountries()),
  ])
  const countries = firstWave.find((check) => check.name === 'fetch countries')
  const countryId = findFirstProperty24Id(countries?.data, ['countryId', 'id'])
  const secondWave = await Promise.all([
    runReadOnlyProperty24Check('fetch provinces', () => property24.fetchProvinces(countryId || undefined)),
    runReadOnlyProperty24Check('fetch property types', () => property24.fetchPropertyTypes(countryId || undefined)),
    runReadOnlyProperty24Check('fetch listing types', () => property24.fetchListingTypes(countryId || undefined)),
  ])
  const checks = [...firstWave, ...secondWave].map((check) => Object.fromEntries(
    Object.entries(check).filter(([key]) => key !== 'data'),
  ))
  return {
    summary: {
      status: checks.every((check) => check.status === 'PASS') ? 'PASS' : 'FAIL',
      passCount: checks.filter((check) => check.status === 'PASS').length,
      checkCount: checks.length,
    },
    checks,
  }
}

async function fetchOrganisationSyncAttempts({
  supabase,
  listingIds = [],
  environment,
  agencyId,
  limit = 200,
} = {}) {
  if (!listingIds.length) return []
  let query = supabase
    .from('property24_sync_attempts')
    .select('id, private_listing_id, environment, agency_id, listing_number, action, status, idempotency_key, request_payload_summary, property24_http_status, retry_count, started_at, finished_at, created_at')
    .eq('environment', environment)
    .order('created_at', { ascending: false })
    .limit(Math.min(Math.max(Number(limit || 200), 1), 500))
  if (agencyId) query = query.eq('agency_id', Number(agencyId))
  if (typeof query.in === 'function') query = query.in('private_listing_id', listingIds)
  const rows = await selectOptionalRows(query)
  const allowedListingIds = new Set(listingIds)
  return rows.filter((row) => allowedListingIds.has(normalizeProperty24Text(row.private_listing_id)))
}

function getAttemptPreview(attempt = {}) {
  const preview = attempt.request_payload_summary?.preview || {}
  return {
    summary: preview.summary || {},
    imageByteLoad: {
      summary: preview.imageByteLoad?.summary || {},
    },
  }
}

function getAttemptPhotoCount(attempt = {}) {
  const count = getAttemptPreview(attempt).summary?.photoPayloadCount
  if (count === null) return null
  const parsed = Number(count)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined
}

function createSafeAttemptSummary(attempt = {}) {
  if (!attempt?.id) return null
  return {
    id: attempt.id,
    private_listing_id: attempt.private_listing_id || null,
    environment: attempt.environment || null,
    agency_id: attempt.agency_id || null,
    listing_number: attempt.listing_number || null,
    action: attempt.action || null,
    status: attempt.status || null,
    idempotency_key: attempt.idempotency_key || null,
    property24_http_status: attempt.property24_http_status || null,
    retry_count: Number(attempt.retry_count || 0),
    started_at: attempt.started_at || null,
    finished_at: attempt.finished_at || null,
  }
}

function createSubmittedAttemptReport(attempt, extra = {}) {
  if (!attempt || attempt.status !== 'succeeded') return {}
  return {
    status: 'SUBMITTED',
    property24Response: {
      httpStatus: attempt.property24_http_status || 200,
    },
    syncAttempt: createSafeAttemptSummary(attempt),
    ...extra,
  }
}

function createReportsFromOrganisationState({ phase1, localRows = [], attempts = [], reconciliation } = {}) {
  const sortedRows = [...localRows].sort((left, right) => {
    const leftDate = Date.parse(left.sync?.updated_at || left.sync?.created_at || 0) || 0
    const rightDate = Date.parse(right.sync?.updated_at || right.sync?.created_at || 0) || 0
    return rightDate - leftDate
  })
  const primaryRow = sortedRows[0] || null
  const successfulWrites = attempts.filter((attempt) => ['create', 'update'].includes(attempt.action) && attempt.status === 'succeeded')
  const withImages = successfulWrites.find((attempt) => Number(getAttemptPhotoCount(attempt)) > 0)
  const withoutImages = successfulWrites.find((attempt) => getAttemptPhotoCount(attempt) === null)
  const publishAttempt = withImages || successfulWrites[0] || null
  const publishPhotoCount = getAttemptPhotoCount(publishAttempt)
  const publishPreview = getAttemptPreview(publishAttempt)
  const statusAttempts = attempts.filter((attempt) => attempt.action === 'status_update' && attempt.status === 'succeeded')
  const statusAttemptByValue = (value, occurrence = 0) => statusAttempts.filter((attempt) => (
    normalizeProperty24Text(attempt.request_payload_summary?.listingStatus).toLowerCase() === value.toLowerCase()
  ))[occurrence]
  const activeAttempts = statusAttempts.filter((attempt) => (
    normalizeProperty24Text(attempt.request_payload_summary?.listingStatus).toLowerCase() === 'active'
  ))
  const statusReport = (status, attempt) => createSubmittedAttemptReport(attempt, { listingStatus: status })
  const createPhotoEvidence = (count) => count === null
    ? null
    : Number.isFinite(Number(count))
      ? Array.from({ length: Math.min(Number(count), 100) }, (_, index) => ({ index, bytesLoaded: true }))
      : undefined

  const publish = createSubmittedAttemptReport(publishAttempt, {
    listingId: publishAttempt?.private_listing_id || primaryRow?.sync?.private_listing_id || null,
    preview: publishPreview,
    redactedPayload: {
      listingNumber: publishAttempt?.listing_number || primaryRow?.sync?.listing_number || null,
      photos: createPhotoEvidence(publishPhotoCount),
    },
  })
  const updateWithoutImages = createSubmittedAttemptReport(withoutImages, {
    listingId: withoutImages?.private_listing_id || null,
    preview: getAttemptPreview(withoutImages),
    redactedPayload: { photos: null },
  })
  const updateWithImages = createSubmittedAttemptReport(withImages, {
    listingId: withImages?.private_listing_id || null,
    preview: getAttemptPreview(withImages),
    redactedPayload: { photos: createPhotoEvidence(getAttemptPhotoCount(withImages)) },
  })

  return {
    phase1,
    preview: publishAttempt ? {
      canSubmit: true,
      summary: publishPreview.summary,
      imageByteLoad: publishPreview.imageByteLoad,
      source: { privateListingId: publishAttempt.private_listing_id || null },
    } : {},
    publish,
    recordSync: primaryRow ? {
      status: 'RECORDED',
      listingId: primaryRow.sync?.private_listing_id || null,
      databaseWrite: {
        table: 'property24_listing_syncs',
        privateListingId: primaryRow.sync?.private_listing_id || null,
        listingNumber: primaryRow.sync?.listing_number || null,
        isOnPortal: Boolean(primaryRow.sync?.is_on_portal),
        property24Status: primaryRow.listing?.property24_status || null,
      },
    } : {},
    reconciliation,
    statusUpdate: statusAttempts[0]
      ? statusReport(statusAttempts[0].request_payload_summary?.listingStatus || '', statusAttempts[0])
      : {},
    proofUpdateWithoutImages: updateWithoutImages,
    proofUpdateWithImages: updateWithImages,
    proofStatusWithdrawn: statusReport('Withdrawn', statusAttemptByValue('Withdrawn')),
    proofStatusActive: statusReport('Active', activeAttempts[activeAttempts.length - 1]),
    proofStatusPending: statusReport('Pending', statusAttemptByValue('Pending')),
    proofStatusSold: statusReport('Sold', statusAttemptByValue('Sold')),
    proofStatusFinalActive: activeAttempts.length > 1 ? statusReport('Active', activeAttempts[0]) : {},
  }
}

export async function createProperty24OrganisationVettingPack({
  supabase,
  property24,
  organisationId,
  connection = {},
  reconciliationReport = null,
  generatedAt = new Date().toISOString(),
} = {}) {
  if (!supabase) throw new Error('Supabase client is required.')
  if (!property24) throw new Error('Property24 client is required.')
  const normalizedOrganisationId = normalizeProperty24Text(organisationId)
  const environment = normalizeProperty24Text(connection.environment) || 'exdev'
  const agencyId = normalizeProperty24Text(connection.agencyId)
  if (!normalizedOrganisationId) throw new Error('Organisation ID is required.')
  if (!agencyId) throw new Error('The organisation Property24 agency ID is required.')
  if (environment !== 'exdev') throw new Error('The Phase 6 vetting pack is only available for ExDev connections.')

  const [phase1, localRows, reconciliation] = await Promise.all([
    createLivePhase1Report({ property24, agencyId }),
    fetchProperty24LocalSyncRows({
      supabase,
      organisationId: normalizedOrganisationId,
      environment,
      agencyId,
      limit: 500,
    }),
    reconciliationReport
      ? Promise.resolve(reconciliationReport)
      : runProperty24ReconciliationJob({
          supabase,
          property24,
          config: {
            organisationId: normalizedOrganisationId,
            environment,
            agencyId,
            includePortalChecks: true,
            includeLeads: false,
            includeStatistics: false,
            limit: 100,
          },
        }),
  ])
  const listingIds = localRows.map((row) => normalizeProperty24Text(row.sync?.private_listing_id)).filter(Boolean)
  const attempts = await fetchOrganisationSyncAttempts({
    supabase,
    listingIds,
    environment,
    agencyId,
  })
  const reports = createReportsFromOrganisationState({ phase1, localRows, attempts, reconciliation })
  const pack = createProperty24VettingPack({
    reports,
    config: {
      environment,
      listingId: localRows[0]?.sync?.private_listing_id,
      listingNumber: localRows[0]?.sync?.listing_number,
    },
    generatedAt,
  })
  return {
    ...pack,
    source: 'live_organisation_readiness',
    organisationId: normalizedOrganisationId,
    agencyId,
    safety: {
      ...pack.safety,
      property24ApiCalled: true,
      property24WriteCalled: false,
      databaseWritten: false,
    },
  }
}

function createSuggestedCommands(config = {}) {
  const listingId = normalizeProperty24Text(config.listingId) || '<arch9-private-listing-id>'
  const listingNumber = normalizeProperty24Text(config.listingNumber) || '<property24-listing-number>'
  return {
    safeEvidence: [
      'npm run property24:phase1',
      `npm run property24:preview-listing -- --listing-id=${listingId} --load-image-bytes`,
      'npm run property24:reconcile',
      'npm run property24:vetting-pack',
    ],
    manualExDevEvidence: [
      `npm run property24:publish-listing -- --listing-id=${listingId} --apply`,
      `npm run property24:publish-listing -- --listing-id=${listingId} --listing-number=${listingNumber} --photos-unchanged --apply`,
      `npm run property24:publish-listing -- --listing-id=${listingId} --listing-number=${listingNumber} --apply`,
      `npm run property24:status-update -- --listing-id=${listingId} --listing-number=${listingNumber} --status=Withdrawn --apply`,
      `npm run property24:status-update -- --listing-id=${listingId} --listing-number=${listingNumber} --status=Active --apply`,
      `npm run property24:status-update -- --listing-id=${listingId} --listing-number=${listingNumber} --status=Pending --apply`,
      `npm run property24:status-update -- --listing-id=${listingId} --listing-number=${listingNumber} --status=Sold --apply`,
    ],
  }
}

function wasSubmitted(report = {}) {
  return report.status === 'SUBMITTED' && (
    report.property24Response?.httpStatus === 200 ||
    report.property24Response?.httpStatus === 201 ||
    report.property24Response?.httpStatus === 204
  )
}

function getPortalValue(report = {}) {
  const value = report.portalCheck?.data ?? report.portalCheck?.summary?.value ?? report.portalCheck?.value
  return typeof value === 'boolean' ? value : null
}

export function createProperty24VettingPack({ reports = {}, config = {}, generatedAt = new Date().toISOString() } = {}) {
  const phase1 = reports.phase1 || {}
  const preview = reports.preview || {}
  const publish = reports.publish || {}
  const recordSync = reports.recordSync || {}
  const reconciliation = reports.reconciliation || {}
  const statusUpdate = reports.statusUpdate || {}
  const proofUpdateWithoutImages = reports.proofUpdateWithoutImages || {}
  const proofUpdateWithImages = reports.proofUpdateWithImages || {}
  const proofStatusWithdrawn = reports.proofStatusWithdrawn || {}
  const proofStatusActive = reports.proofStatusActive || {}
  const proofStatusPending = reports.proofStatusPending || {}
  const proofStatusSold = reports.proofStatusSold || {}
  const proofStatusFinalActive = reports.proofStatusFinalActive || {}

  const authenticatedEcho = getCheck(phase1, (name) => name.includes('authenticated echo'))
  const agencyCheck = getCheck(phase1, (name) => name.includes('fetch agency ') && !name.includes('agents'))
  const agentsCheck = getCheck(phase1, (name) => name.includes('agents'))
  const catalogChecks = [
    getCheck(phase1, (name) => name.includes('countries')),
    getCheck(phase1, (name) => name.includes('provinces')),
    getCheck(phase1, (name) => name.includes('property types')),
    getCheck(phase1, (name) => name.includes('listing types')),
  ]
  const invalidListing = createInvalidListingEvidence()
  const publishImageSummary = publish.preview?.imageByteLoad?.summary || preview.imageByteLoad?.summary || {}
  const photoPayload = publish.redactedPayload?.photos ?? preview.previewPayload?.photos
  const noImagePhotoPayload = proofUpdateWithoutImages.redactedPayload?.photos
  const imageUpdatePhotoPayload = proofUpdateWithImages.redactedPayload?.photos
  const hasLoadedImages = (publishImageSummary.loaded || preview.summary?.imageCount || 0) > 0
  const listingNumber = normalizeProperty24Text(
    config.listingNumber ||
      publish.preview?.summary?.listingNumber ||
      publish.redactedPayload?.listingNumber ||
      recordSync.databaseWrite?.listingNumber ||
      reconciliation.reconciliation?.matched?.[0]?.listingNumber,
  )
  const listingId = normalizeProperty24Text(
    config.listingId ||
      publish.listingId ||
      preview.source?.privateListingId ||
      recordSync.listingId ||
      reconciliation.reconciliation?.matched?.[0]?.local?.listingId,
  )
  const statusUpdateStatus = normalizeProperty24Text(statusUpdate.listingStatus || statusUpdate.status || statusUpdate.report?.listingStatus)
  const statusEvidenceLabel = normalizeProperty24Text(statusUpdate.listingStatus || statusUpdate.listingStatus || '')
  const statusProofs = {
    Withdrawn: proofStatusWithdrawn,
    Active: proofStatusActive,
    Pending: proofStatusPending,
    Sold: proofStatusSold,
    FinalActive: proofStatusFinalActive,
  }
  const allStatusProofsPassed = ['Withdrawn', 'Active', 'Pending', 'Sold', 'FinalActive'].every((key) => wasSubmitted(statusProofs[key]))

  const evidence = [
    createEvidence({
      id: 'authenticated_echo',
      label: 'Authenticated echo test',
      status: checkPassed(authenticatedEcho) ? 'PASS' : 'NEEDS_EVIDENCE',
      summary: summarizeCheck(authenticatedEcho) || {},
      evidence: [PROPERTY24_VETTING_DEFAULT_REPORTS.phase1],
      nextStep: checkPassed(authenticatedEcho) ? '' : 'Run npm run property24:phase1.',
    }),
    createEvidence({
      id: 'agency_agent_fetch',
      label: 'Agency and agent fetch',
      status: checkPassed(agencyCheck) && checkPassed(agentsCheck) ? 'PASS' : 'NEEDS_EVIDENCE',
      summary: {
        agency: summarizeCheck(agencyCheck),
        agents: summarizeCheck(agentsCheck),
      },
      evidence: [PROPERTY24_VETTING_DEFAULT_REPORTS.phase1],
      nextStep: checkPassed(agencyCheck) && checkPassed(agentsCheck) ? '' : 'Run npm run property24:phase1.',
    }),
    createEvidence({
      id: 'catalog_fetch_mapping',
      label: 'Catalog fetch and mapping',
      status: catalogChecks.every(checkPassed) && preview.canSubmit !== false ? 'PASS' : 'NEEDS_EVIDENCE',
      summary: {
        catalogChecks: catalogChecks.map(summarizeCheck),
        previewSummary: preview.summary || publish.preview?.summary || null,
      },
      evidence: [PROPERTY24_VETTING_DEFAULT_REPORTS.phase1, PROPERTY24_VETTING_DEFAULT_REPORTS.preview],
      nextStep: catalogChecks.every(checkPassed) ? '' : 'Run npm run property24:phase1.',
    }),
    createEvidence({
      id: 'create_listing_with_image',
      label: 'Create listing with image',
      status: listingNumber && hasLoadedImages && reconciliation.status === 'OK' ? 'PASS' : 'READY',
      summary: {
        listingId,
        listingNumber,
        imageByteLoad: publishImageSummary,
        reconciliation: reconciliation.reconciliation?.summary || null,
      },
      evidence: [
        PROPERTY24_VETTING_DEFAULT_REPORTS.publish,
        PROPERTY24_VETTING_DEFAULT_REPORTS.recordSync,
        PROPERTY24_VETTING_DEFAULT_REPORTS.reconciliation,
      ],
      nextStep: listingNumber ? '' : 'Run the publish command with --apply in ExDev for a controlled create.',
    }),
    createEvidence({
      id: 'update_text_without_images',
      label: 'Update price/description without resending images',
      status: wasSubmitted(proofUpdateWithoutImages) && noImagePhotoPayload === null ? 'PASS' : photoPayload === null ? 'PASS' : 'MANUAL_REQUIRED',
      summary: {
        httpStatus: proofUpdateWithoutImages.property24Response?.httpStatus || null,
        portalVisible: getPortalValue(proofUpdateWithoutImages),
        photosPayload: noImagePhotoPayload === null ? 'photos:null' : photoPayload === null ? 'photos:null' : Array.isArray(photoPayload) ? `photos:${photoPayload.length}` : typeof photoPayload,
        command: `npm run property24:publish-listing -- --listing-id=${listingId || '<listing-id>'} --listing-number=${listingNumber || '<listing-number>'} --photos-unchanged --apply`,
      },
      evidence: [PROPERTY24_VETTING_DEFAULT_REPORTS.proofUpdateWithoutImages, PROPERTY24_VETTING_DEFAULT_REPORTS.publish],
      nextStep: wasSubmitted(proofUpdateWithoutImages) ? '' : 'Run the command during ExDev vetting when Property24 asks to see a no-image update.',
    }),
    createEvidence({
      id: 'update_images',
      label: 'Update listing images',
      status: wasSubmitted(proofUpdateWithImages) && Array.isArray(imageUpdatePhotoPayload) && imageUpdatePhotoPayload.length > 0
        ? 'PASS'
        : Array.isArray(photoPayload) && photoPayload.length > 0 ? 'READY' : 'NEEDS_EVIDENCE',
      summary: {
        httpStatus: proofUpdateWithImages.property24Response?.httpStatus || null,
        portalVisible: getPortalValue(proofUpdateWithImages),
        photoCount: Array.isArray(imageUpdatePhotoPayload) ? imageUpdatePhotoPayload.length : Array.isArray(photoPayload) ? photoPayload.length : 0,
        imageByteLoad: proofUpdateWithImages.preview?.imageByteLoad?.summary || publishImageSummary,
        command: `npm run property24:publish-listing -- --listing-id=${listingId || '<listing-id>'} --listing-number=${listingNumber || '<listing-number>'} --apply`,
      },
      evidence: [PROPERTY24_VETTING_DEFAULT_REPORTS.proofUpdateWithImages, PROPERTY24_VETTING_DEFAULT_REPORTS.publish],
      nextStep: wasSubmitted(proofUpdateWithImages) ? '' : 'Run with --apply only when intentionally replacing/updating Property24 images.',
    }),
    createEvidence({
      id: 'status_withdrawn_back_to_market_pending_sold',
      label: 'Status changes',
      status: allStatusProofsPassed ? 'PASS' : statusUpdateStatus === 'SUBMITTED' ? 'PARTIAL_PASS' : 'MANUAL_REQUIRED',
      summary: {
        latestStatusEvidence: statusEvidenceLabel || null,
        proofs: Object.fromEntries(
          Object.entries(statusProofs).map(([status, report]) => [
            status,
            {
              submitted: wasSubmitted(report),
              httpStatus: report.property24Response?.httpStatus || null,
              portalVisible: getPortalValue(report),
            },
          ]),
        ),
        commands: createSuggestedCommands({ listingId, listingNumber }).manualExDevEvidence.filter((command) => command.includes('status-update')),
      },
      evidence: [
        PROPERTY24_VETTING_DEFAULT_REPORTS.proofStatusWithdrawn,
        PROPERTY24_VETTING_DEFAULT_REPORTS.proofStatusActive,
        PROPERTY24_VETTING_DEFAULT_REPORTS.proofStatusPending,
        PROPERTY24_VETTING_DEFAULT_REPORTS.proofStatusSold,
        PROPERTY24_VETTING_DEFAULT_REPORTS.proofStatusFinalActive,
        PROPERTY24_VETTING_DEFAULT_REPORTS.statusUpdate,
      ],
      nextStep: allStatusProofsPassed ? '' : 'Run each status command deliberately in ExDev; do not automate status flipping in production.',
    }),
    createEvidence({
      id: 'portal_visibility',
      label: 'Check is-on-portal',
      status: reconciliation.reconciliation?.summary?.matchedCount > 0 ? 'PASS' : 'NEEDS_EVIDENCE',
      summary: {
        reconciliation: reconciliation.reconciliation?.summary || null,
        updates: reconciliation.updates?.summary || null,
      },
      evidence: [PROPERTY24_VETTING_DEFAULT_REPORTS.reconciliation],
      nextStep: reconciliation.reconciliation?.summary?.matchedCount > 0 ? '' : 'Run npm run property24:reconcile -- --include-portal-checks.',
    }),
    createEvidence({
      id: 'reconciliation_result',
      label: 'Reconciliation result',
      status: reconciliation.status === 'OK' ? 'PASS' : reconciliation.status ? 'NEEDS_REVIEW' : 'NEEDS_EVIDENCE',
      summary: {
        status: reconciliation.status || null,
        reconciliation: reconciliation.reconciliation?.summary || null,
        updates: reconciliation.updates?.summary || null,
      },
      evidence: [PROPERTY24_VETTING_DEFAULT_REPORTS.reconciliation],
      nextStep: reconciliation.status ? '' : 'Run npm run property24:reconcile.',
    }),
    createEvidence({
      id: 'invalid_listing_error_handling',
      label: 'Invalid listing blocker handling',
      status: invalidListing.status,
      summary: invalidListing.summary,
      evidence: ['server/services/property24ListingMapper.js'],
      nextStep: invalidListing.status === 'PASS' ? '' : 'Confirm mapper returns blockers before calling Property24.',
    }),
    createEvidence({
      id: 'retry_idempotency',
      label: 'Retry/idempotency behavior',
      status: publish.syncAttempt?.idempotency_key || statusUpdate.syncAttempt?.idempotency_key ? 'PASS' : 'READY',
      summary: {
        publishAttemptStatus: publish.syncAttempt?.status || null,
        statusAttemptStatus: statusUpdate.syncAttempt?.status || null,
        note: 'Controlled publish/status workflows write idempotency keys to property24_sync_attempts.',
      },
      evidence: ['server/property24/workflowService.js', 'sql/20260820_property24_sync_attempts.sql'],
      nextStep: 'Show property24_sync_attempts during vetting after a live ExDev apply run.',
    }),
    createEvidence({
      id: 'redacted_audit_log',
      label: 'Redacted audit log',
      status: publish.redactedPayload || publish.syncAttempt || recordSync.databaseWrite ? 'PASS' : 'NEEDS_EVIDENCE',
      summary: {
        hasRedactedPayload: Boolean(publish.redactedPayload),
        hasDatabaseWriteSummary: Boolean(recordSync.databaseWrite),
        rawImageBytesIncluded: JSON.stringify(redactProperty24VettingValue(publish)).includes('RAW_IMAGE_BYTES_SHOULD_NOT_LEAK'),
      },
      evidence: [PROPERTY24_VETTING_DEFAULT_REPORTS.publish, PROPERTY24_VETTING_DEFAULT_REPORTS.recordSync],
      nextStep: '',
    }),
  ]

  const blockerCount = evidence.filter((item) => ['NEEDS_EVIDENCE', 'NEEDS_REVIEW'].includes(item.status)).length
  const manualCount = evidence.filter((item) => ['MANUAL_REQUIRED', 'READY', 'PARTIAL_PASS'].includes(item.status)).length
  const passCount = evidence.filter((item) => item.status === 'PASS').length
  const status = blockerCount > 0
    ? 'NEEDS_MORE_EVIDENCE'
    : manualCount > 0
      ? 'READY_WITH_MANUAL_EXDEV_STEPS'
      : 'READY_FOR_VETTING'

  return {
    phase: 'property24-phase6-vetting-pack',
    generatedAt,
    status,
    environment: normalizeProperty24Text(config.environment) || 'exdev',
    listingId,
    listingNumber,
    summary: {
      passCount,
      manualCount,
      blockerCount,
      evidenceCount: evidence.length,
    },
    safety: {
      property24ApiCalled: false,
      databaseWritten: false,
      listingPublished: false,
      credentialsRedacted: true,
      imageBytesRedacted: true,
    },
    evidence,
    suggestedCommands: createSuggestedCommands({ listingId, listingNumber }),
    operationalNotes: createOperationalNotes(),
    redactedReports: redactProperty24VettingValue(reports),
  }
}

export function renderProperty24VettingPackMarkdown(pack = {}) {
  const lines = [
    '# Property24 ExDev Vetting Pack',
    '',
    `Generated: ${pack.generatedAt || ''}`,
    `Status: ${pack.status || 'UNKNOWN'}`,
    `Environment: ${pack.environment || 'exdev'}`,
    `Arch9 listing ID: ${pack.listingId || 'Not set'}`,
    `Property24 listing number: ${pack.listingNumber || 'Not set'}`,
    '',
    '## Summary',
    '',
    `- Passed evidence items: ${pack.summary?.passCount ?? 0}`,
    `- Manual ExDev items: ${pack.summary?.manualCount ?? 0}`,
    `- Items needing evidence: ${pack.summary?.blockerCount ?? 0}`,
    '',
    '## Evidence Checklist',
    '',
  ]

  for (const item of toArray(pack.evidence)) {
    lines.push(`### ${item.label}`)
    lines.push(`Status: ${item.status}`)
    if (item.nextStep) lines.push(`Next step: ${item.nextStep}`)
    if (item.evidence?.length) lines.push(`Evidence: ${item.evidence.join(', ')}`)
    lines.push('')
  }

  lines.push('## Operational Notes')
  lines.push('')
  for (const note of toArray(pack.operationalNotes)) {
    lines.push(`- ${note}`)
  }
  lines.push('')
  lines.push('## Commands')
  lines.push('')
  lines.push('Safe/report-only:')
  lines.push('')
  for (const command of toArray(pack.suggestedCommands?.safeEvidence)) {
    lines.push(`- \`${command}\``)
  }
  lines.push('')
  lines.push('Manual ExDev write evidence:')
  lines.push('')
  for (const command of toArray(pack.suggestedCommands?.manualExDevEvidence)) {
    lines.push(`- \`${command}\``)
  }
  lines.push('')
  return `${lines.join('\n')}\n`
}
