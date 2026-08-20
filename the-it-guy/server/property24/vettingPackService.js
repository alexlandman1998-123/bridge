import { createProperty24ListingPlan } from '../services/property24ListingMapper.js'
import { normalizeProperty24Text } from './client.js'

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
