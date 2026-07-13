import { generateSellerDocumentRequirements } from '../lib/privateListingRequirementEngine.js'

function normalizeText(value) {
  return String(value ?? '').trim()
}

function normalizeKey(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function firstPresent(...values) {
  for (const value of values) {
    if (value === null || value === undefined) continue
    if (typeof value === 'string' && !value.trim()) continue
    return value
  }
  return ''
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function unwrapSellerOnboardingFormCandidate(candidate = null) {
  if (!isPlainObject(candidate)) return null
  if (isPlainObject(candidate?.formData)) return candidate.formData
  if (isPlainObject(candidate?.form_data)) return candidate.form_data
  return candidate
}

export function normalizeSellerDocumentRequirementStatus(status = '') {
  const normalized = normalizeKey(status)
  if (['required', 'requested', 'uploaded', 'under_review', 'rejected', 'approved', 'completed', 'not_applicable', 'cancelled'].includes(normalized)) {
    return normalized
  }
  if (normalized === 'reviewed') return 'under_review'
  if (normalized === 'accepted' || normalized === 'verified') return 'approved'
  if (normalized === 'submitted' || normalized === 'received' || normalized === 'pending_review' || normalized === 'pending') return 'uploaded'
  if (normalized === 'missing' || normalized === 'not_uploaded' || normalized === 'outstanding') return 'required'
  return normalized || 'required'
}

export function getSellerDocumentStatusLabel(status = '') {
  const normalized = normalizeSellerDocumentRequirementStatus(status)
  const labels = {
    required: 'Outstanding',
    requested: 'Requested',
    uploaded: 'Uploaded',
    under_review: 'Under Review',
    rejected: 'Rejected',
    approved: 'Approved',
    completed: 'Completed',
    not_applicable: 'Not Applicable',
    cancelled: 'Cancelled',
  }
  return labels[normalized] || normalizeText(status).replace(/_/g, ' ') || 'Outstanding'
}

export function getSellerOnboardingFormData(listing = {}) {
  const onboarding = listing?.sellerOnboarding || listing?.seller_onboarding || {}
  return unwrapSellerOnboardingFormCandidate(onboarding) ||
    unwrapSellerOnboardingFormCandidate(listing?.onboardingDataSnapshot) ||
    unwrapSellerOnboardingFormCandidate(listing?.sellerOnboardingFormData) ||
    unwrapSellerOnboardingFormCandidate(listing?.seller_onboarding_form_data) ||
    {}
}

function requirementIdentity(requirement = {}) {
  return normalizeKey(
    requirement?.key ||
      requirement?.requirement_key ||
      requirement?.document_key ||
      requirement?.canonicalRequirementInstanceId ||
      requirement?.canonical_requirement_instance_id ||
      requirement?.label ||
      requirement?.requirement_name ||
      requirement?.name,
  )
}

function requirementIsActive(requirement = {}) {
  const status = normalizeSellerDocumentRequirementStatus(
    requirement?.status || requirement?.requiredDocumentStatus || requirement?.required_document_status,
  )
  return requirement?.isRequired !== false &&
    requirement?.is_required !== false &&
    !['not_required', 'waived', 'cancelled', 'archived', 'not_applicable'].includes(status)
}

export function mergeSellerRequiredDocuments(...requirementLists) {
  const merged = []
  const seen = new Set()
  for (const requirement of requirementLists.flat()) {
    if (!requirement || typeof requirement !== 'object') continue
    if (!requirementIsActive(requirement)) continue
    const identity = requirementIdentity(requirement)
    if (identity && seen.has(identity)) continue
    if (identity) seen.add(identity)
    merged.push(requirement)
  }
  return merged
}

const STALE_PRE_ONBOARDING_REQUIREMENT_KEYS = new Set([
  'seller_contact_confirmation',
  'seller_onboarding_submission',
])

function hasSubmittedSellerOnboarding(status = '') {
  return ['completed', 'complete', 'submitted', 'under_review', 'onboarding_completed', 'seller_onboarding_completed'].includes(normalizeKey(status))
}

function coerceSellerDocumentLifecycle(listing = {}, formData = {}) {
  const onboardingStatus = firstPresent(
    listing?.sellerOnboardingStatus,
    listing?.seller_onboarding_status,
    listing?.sellerOnboarding?.status,
    listing?.seller_onboarding?.status,
  )
  const lifecycleStatus = normalizeKey(firstPresent(
    listing?.lifecycleStatus,
    listing?.lifecycle_status,
    listing?.listingStatus,
    listing?.listing_status,
    listing?.status,
    listing?.stage,
  ))
  const hasOnboardingFacts = isPlainObject(formData) && Object.keys(formData).length > 0
  const shouldPromote = hasOnboardingFacts || hasSubmittedSellerOnboarding(onboardingStatus)

  if (!shouldPromote || !['', 'seller_lead', 'onboarding_sent'].includes(lifecycleStatus)) {
    return listing
  }

  return {
    ...listing,
    lifecycleStatus: 'onboarding_completed',
    lifecycle_status: 'onboarding_completed',
    listingStatus: 'onboarding_completed',
    listing_status: 'onboarding_completed',
    status: 'onboarding_completed',
  }
}

function filterStalePersistedRequirements(requirements = [], listing = {}, formData = {}) {
  const onboardingStatus = firstPresent(
    listing?.sellerOnboardingStatus,
    listing?.seller_onboarding_status,
    listing?.sellerOnboarding?.status,
    listing?.seller_onboarding?.status,
  )
  const hasOnboardingFacts = isPlainObject(formData) && Object.keys(formData).length > 0
  if (!hasOnboardingFacts && !hasSubmittedSellerOnboarding(onboardingStatus)) return Array.isArray(requirements) ? requirements : []

  return (Array.isArray(requirements) ? requirements : []).filter((requirement) => {
    const key = requirementIdentity(requirement)
    return !STALE_PRE_ONBOARDING_REQUIREMENT_KEYS.has(key)
  })
}

export function getSellerRequiredDocuments(listing = {}, formData = {}) {
  const resolvedFormData = isPlainObject(formData) && Object.keys(formData).length
    ? formData
    : getSellerOnboardingFormData(listing)
  const persisted = filterStalePersistedRequirements(listing?.documentRequirements, listing, resolvedFormData)
  const hasOnboardingFacts = resolvedFormData && typeof resolvedFormData === 'object' && Object.keys(resolvedFormData).length > 0
  try {
    const requirementListing = coerceSellerDocumentLifecycle(listing, resolvedFormData)
    const derived = (!persisted.length || hasOnboardingFacts)
      ? generateSellerDocumentRequirements({
          ...requirementListing,
          sellerOnboarding: {
            ...(requirementListing?.sellerOnboarding && typeof requirementListing.sellerOnboarding === 'object' ? requirementListing.sellerOnboarding : {}),
            status: firstPresent(
              requirementListing?.sellerOnboardingStatus,
              requirementListing?.seller_onboarding_status,
              requirementListing?.sellerOnboarding?.status,
              requirementListing?.seller_onboarding?.status,
              'completed',
            ),
            formData: resolvedFormData,
          },
        })
      : []
    return mergeSellerRequiredDocuments(persisted, derived)
  } catch (error) {
    console.warn('[seller-document-requirements] Failed to derive seller document requirements', {
      listingId: listing?.id || null,
      error,
    })
    return mergeSellerRequiredDocuments(persisted)
  }
}

export function getExpectedSellerDocumentRequirements(listing = {}, formData = {}) {
  const resolvedFormData = isPlainObject(formData) && Object.keys(formData).length
    ? formData
    : getSellerOnboardingFormData(listing)
  const requirementListing = coerceSellerDocumentLifecycle(listing, resolvedFormData)
  try {
    return mergeSellerRequiredDocuments(generateSellerDocumentRequirements({
      ...requirementListing,
      sellerOnboarding: {
        ...(requirementListing?.sellerOnboarding && typeof requirementListing.sellerOnboarding === 'object' ? requirementListing.sellerOnboarding : {}),
        status: firstPresent(
          requirementListing?.sellerOnboardingStatus,
          requirementListing?.seller_onboarding_status,
          requirementListing?.sellerOnboarding?.status,
          requirementListing?.seller_onboarding?.status,
          'completed',
        ),
        formData: resolvedFormData,
      },
    }))
  } catch (error) {
    console.warn('[seller-document-requirements] Failed to derive expected seller document requirements', {
      listingId: listing?.id || null,
      error,
    })
    return []
  }
}

function getRequirementKey(requirement = {}) {
  return normalizeKey(
    requirement?.key ||
      requirement?.requirementKey ||
      requirement?.requirement_key ||
      requirement?.document_key ||
      requirement?.label ||
      requirement?.requirement_name ||
      requirement?.name,
  )
}

function getUniqueRequirementKeys(requirements = []) {
  return [...new Set((Array.isArray(requirements) ? requirements : [])
    .map((requirement) => getRequirementKey(requirement))
    .filter(Boolean))]
}

function getPersistedActiveRequirementKeys(requirements = []) {
  return getUniqueRequirementKeys((Array.isArray(requirements) ? requirements : []).filter(requirementIsActive))
}

export function buildSellerDocumentRequirementReconciliationRecord(listing = {}, options = {}) {
  const formData = isPlainObject(options.formData) && Object.keys(options.formData).length
    ? options.formData
    : getSellerOnboardingFormData(listing)
  const expectedRequirements = getExpectedSellerDocumentRequirements(listing, formData)
  const expectedKeys = getUniqueRequirementKeys(expectedRequirements)
  const persistedRequirements = Array.isArray(listing?.documentRequirements)
    ? listing.documentRequirements
    : Array.isArray(listing?.document_requirements)
      ? listing.document_requirements
      : []
  const persistedActiveKeys = getPersistedActiveRequirementKeys(persistedRequirements)
  const persistedAllKeys = getUniqueRequirementKeys(persistedRequirements)
  const missingRequirementKeys = expectedKeys.filter((key) => !persistedActiveKeys.includes(key))
  const staleRequirementKeys = persistedActiveKeys.filter((key) => !expectedKeys.includes(key))
  const hasOnboardingFacts = isPlainObject(formData) && Object.keys(formData).length > 0
  const hasPersistedRequirements = persistedAllKeys.length > 0
  const needsSync = Boolean(missingRequirementKeys.length || staleRequirementKeys.length || !hasPersistedRequirements)
  const listingId = normalizeText(listing?.id || listing?.private_listing_id)

  return {
    listingId,
    sellerLeadId: normalizeText(listing?.sellerLeadId || listing?.seller_lead_id || listing?.originatingCrmLeadId || listing?.originating_crm_lead_id),
    organisationId: normalizeText(listing?.organisationId || listing?.organisation_id),
    title: normalizeText(listing?.title || listing?.listingTitle || listing?.listing_reference || listing?.listingReference || listingId),
    listingStatus: normalizeText(listing?.listingStatus || listing?.listing_status || listing?.status),
    sellerOnboardingStatus: normalizeText(listing?.sellerOnboardingStatus || listing?.seller_onboarding_status || listing?.sellerOnboarding?.status || listing?.seller_onboarding?.status),
    expectedRequirementKeys: expectedKeys,
    persistedRequirementKeys: persistedActiveKeys,
    persistedAllRequirementKeys: persistedAllKeys,
    missingRequirementKeys,
    staleRequirementKeys,
    hasOnboardingFacts,
    hasPersistedRequirements,
    canSync: Boolean(listingId && needsSync),
    status: needsSync ? 'needs_sync' : 'ready',
    recommendedAction: needsSync
      ? 'sync_private_listing_document_requirements'
      : 'none',
  }
}

export function buildSellerDocumentRequirementReconciliationReport(listings = [], options = {}) {
  const rows = (Array.isArray(listings) ? listings : [])
    .map((listing) => buildSellerDocumentRequirementReconciliationRecord(listing))
  const summary = rows.reduce((accumulator, row) => {
    accumulator.total += 1
    accumulator.ready += row.status === 'ready' ? 1 : 0
    accumulator.needsSync += row.status === 'needs_sync' ? 1 : 0
    accumulator.syncable += row.canSync ? 1 : 0
    accumulator.missingRequirementRows += row.missingRequirementKeys.length
    accumulator.staleRequirementRows += row.staleRequirementKeys.length
    accumulator.withoutPersistedRequirements += row.hasPersistedRequirements ? 0 : 1
    return accumulator
  }, {
    total: 0,
    ready: 0,
    needsSync: 0,
    syncable: 0,
    missingRequirementRows: 0,
    staleRequirementRows: 0,
    withoutPersistedRequirements: 0,
  })

  return {
    contractVersion: 'seller_document_reconciliation_v1',
    dryRun: options.dryRun !== false,
    generatedAt: options.generatedAt || new Date().toISOString(),
    sourceOfTruth: SELLER_DOCUMENT_SOURCE_OF_TRUTH,
    touchpoints: SELLER_DOCUMENT_TOUCHPOINTS,
    summary,
    rows,
    actionQueues: {
      syncable: rows.filter((row) => row.canSync),
      ready: rows.filter((row) => row.status === 'ready'),
      manualReview: rows.filter((row) => row.status !== 'ready' && !row.canSync),
    },
  }
}

export function summarizeSellerDocumentRequirementReconciliationReport(report = {}) {
  const summary = report.summary || {}
  return [
    `${summary.total || 0} listings checked`,
    `${summary.ready || 0} ready`,
    `${summary.needsSync || 0} need requirement sync`,
    `${summary.syncable || 0} syncable`,
    `${summary.missingRequirementRows || 0} missing requirement rows`,
    `${summary.staleRequirementRows || 0} stale active requirement rows`,
  ].join(' • ')
}

export function buildSellerDocumentRequirementReconciliationGate(report = {}, options = {}) {
  const summary = report.summary || {}
  const actionQueues = report.actionQueues || {}
  const manualReviewCount = Array.isArray(actionQueues.manualReview) ? actionQueues.manualReview.length : Number(summary.manualReview || 0)
  const syncableCount = Number(summary.syncable || 0)
  const loadFailedCount = Number(summary.loadFailed || 0)
  const totalChecked = Number(summary.total || 0)
  const failOnSyncNeeded = options.failOnSyncNeeded !== false
  const failOnManualReview = options.failOnManualReview !== false
  const failOnLoadFailed = options.failOnLoadFailed !== false
  const blockers = []
  const warnings = []

  if (loadFailedCount > 0) {
    const message = `${loadFailedCount} listing${loadFailedCount === 1 ? '' : 's'} could not be loaded for seller document reconciliation.`
    if (failOnLoadFailed) blockers.push(message)
    else warnings.push(message)
  }
  if (manualReviewCount > 0) {
    const message = `${manualReviewCount} listing${manualReviewCount === 1 ? '' : 's'} need manual review before seller document requirement sync.`
    if (failOnManualReview) blockers.push(message)
    else warnings.push(message)
  }
  if (syncableCount > 0) {
    const message = `${syncableCount} listing${syncableCount === 1 ? '' : 's'} have missing or stale seller document requirement rows.`
    if (failOnSyncNeeded) blockers.push(message)
    else warnings.push(message)
  }
  if (!totalChecked) {
    warnings.push('No listings were checked by seller document reconciliation.')
  }

  const status = blockers.length ? 'fail' : warnings.length ? 'warning' : 'pass'
  return {
    contractVersion: 'seller_document_reconciliation_gate_v1',
    phase: '6',
    status,
    exitCode: status === 'fail' ? 1 : 0,
    releaseReady: status !== 'fail',
    generatedAt: report.generatedAt || new Date().toISOString(),
    dryRun: report.dryRun !== false,
    summary: {
      total: totalChecked,
      ready: Number(summary.ready || 0),
      needsSync: Number(summary.needsSync || 0),
      syncable: syncableCount,
      manualReview: manualReviewCount,
      loadFailed: loadFailedCount,
      missingRequirementRows: Number(summary.missingRequirementRows || 0),
      staleRequirementRows: Number(summary.staleRequirementRows || 0),
    },
    blockers,
    warnings,
    reason: blockers[0] || warnings[0] || 'Seller document requirement reconciliation is clean.',
  }
}

export const SELLER_DOCUMENT_RECONCILIATION_REVIEW_PACKET_VERSION = 'seller_document_reconciliation_review_packet_v1'

function getReviewPacketStatus(gate = {}) {
  if (gate.status === 'fail') return 'blocked'
  if (gate.status === 'warning') return 'needs_review'
  return 'ready'
}

function buildSellerDocumentReconciliationChecklist(report = {}, gate = {}) {
  const summary = report.summary || {}
  const manualReviewCount = Number(gate.summary?.manualReview || 0)
  const syncableCount = Number(gate.summary?.syncable || summary.syncable || 0)
  return [
    {
      key: 'review_gate_result',
      done: gate.status === 'pass',
      label: 'Review the seller document reconciliation gate result.',
      detail: gate.reason || 'No gate reason recorded.',
    },
    {
      key: 'resolve_manual_review',
      done: manualReviewCount === 0,
      label: 'Resolve manual-review rows before applying requirement sync.',
      detail: `${manualReviewCount} manual-review row${manualReviewCount === 1 ? '' : 's'}.`,
    },
    {
      key: 'apply_reviewed_requirement_sync',
      done: syncableCount === 0,
      label: 'Apply requirement sync only for reviewed syncable listings.',
      detail: `${syncableCount} syncable listing${syncableCount === 1 ? '' : 's'}.`,
    },
    {
      key: 'rerun_release_gate',
      done: gate.status === 'pass',
      label: 'Rerun the seller document release gate after repair.',
      detail: `Current gate status: ${gate.status || 'unknown'}.`,
    },
  ]
}

function buildSellerDocumentReconciliationOperatorCommands(options = {}, syncableListingIds = []) {
  const organisationId = normalizeText(options.organisationId)
  const listingIds = Array.isArray(options.listingIds) ? options.listingIds.map(normalizeText).filter(Boolean) : []
  const scopeArgs = organisationId
    ? `--organisation-id=${organisationId}`
    : listingIds.length
      ? `--listing-ids=${listingIds.join(',')}`
      : '--organisation-id=<uuid>'
  const outputDir = normalizeText(options.outputDir) || '<output-dir>'
  const reviewedSyncArgs = syncableListingIds.length
    ? `--listing-ids=${syncableListingIds.slice(0, 50).join(',')}`
    : '--listing-ids=<reviewed-syncable-listing-ids>'

  return [
    `npm run verify:seller-documents -- ${scopeArgs}`,
    `npm run reconcile:seller-documents -- ${scopeArgs} --markdown`,
    `npm run prepare:seller-documents -- ${scopeArgs} --output-dir=${outputDir}`,
    `npm run reconcile:seller-documents -- ${reviewedSyncArgs} --markdown`,
  ]
}

export function buildSellerDocumentRequirementReconciliationReviewPacket(report = {}, options = {}) {
  const generatedAt = options.generatedAt || report.generatedAt || new Date().toISOString()
  const gate = options.gate || report.gate || buildSellerDocumentRequirementReconciliationGate(report, options)
  const syncable = Array.isArray(report.actionQueues?.syncable) ? report.actionQueues.syncable : []
  const manualReview = Array.isArray(report.actionQueues?.manualReview) ? report.actionQueues.manualReview : []
  const syncableListingIds = syncable.map((row) => normalizeText(row?.listingId)).filter(Boolean)
  const checklist = buildSellerDocumentReconciliationChecklist(report, gate)

  return {
    version: SELLER_DOCUMENT_RECONCILIATION_REVIEW_PACKET_VERSION,
    phase: '7',
    generatedAt,
    source: normalizeText(options.source || report.source) || 'seller_document_reconciliation_report',
    status: getReviewPacketStatus(gate),
    dryRun: true,
    mutatedData: false,
    gate,
    sourceOfTruth: report.sourceOfTruth || SELLER_DOCUMENT_SOURCE_OF_TRUTH,
    touchpoints: report.touchpoints || SELLER_DOCUMENT_TOUCHPOINTS,
    summary: {
      ...(report.summary || {}),
      manualReview: Number(gate.summary?.manualReview || manualReview.length || 0),
      loadFailed: Number(gate.summary?.loadFailed || report.summary?.loadFailed || 0),
    },
    repairPlan: {
      syncableCount: syncable.length,
      syncableListingIds,
      rows: syncable.map((row) => ({
        listingId: normalizeText(row?.listingId),
        title: normalizeText(row?.title),
        listingStatus: normalizeText(row?.listingStatus),
        sellerOnboardingStatus: normalizeText(row?.sellerOnboardingStatus),
        missingRequirementKeys: Array.isArray(row?.missingRequirementKeys) ? row.missingRequirementKeys : [],
        staleRequirementKeys: Array.isArray(row?.staleRequirementKeys) ? row.staleRequirementKeys : [],
        recommendedAction: row?.recommendedAction || 'sync_private_listing_document_requirements',
      })),
    },
    manualReview: {
      count: manualReview.length,
      rows: manualReview,
    },
    checklist,
    operatorCommands: buildSellerDocumentReconciliationOperatorCommands(options, syncableListingIds),
    artifacts: [
      'seller-document-reconciliation-packet.json',
      'seller-document-reconciliation-report.json',
      'seller-document-reconciliation-syncable.json',
      'seller-document-reconciliation-manual-review.json',
      'seller-document-reconciliation-runbook.md',
    ],
    reconciliationReport: report,
  }
}

export function renderSellerDocumentRequirementReconciliationRunbook(packet = {}) {
  const summary = packet.summary || {}
  const gate = packet.gate || {}
  const checklist = Array.isArray(packet.checklist) ? packet.checklist : []
  const commands = Array.isArray(packet.operatorCommands) ? packet.operatorCommands : []
  const syncableRows = Array.isArray(packet.repairPlan?.rows) ? packet.repairPlan.rows : []
  const manualReviewRows = Array.isArray(packet.manualReview?.rows) ? packet.manualReview.rows : []
  const lines = [
    '# Seller Document Reconciliation Review Packet',
    '',
    `Generated: ${packet.generatedAt || ''}`,
    `Status: ${packet.status || 'unknown'}`,
    `Gate: ${gate.status || 'unknown'} - ${gate.reason || ''}`,
    `Mutated data: ${packet.mutatedData ? 'yes' : 'no'}`,
    '',
    '## Summary',
    '',
    `- Listings checked: ${Number(summary.total || 0)}`,
    `- Ready: ${Number(summary.ready || 0)}`,
    `- Need sync: ${Number(summary.needsSync || 0)}`,
    `- Syncable: ${Number(summary.syncable || 0)}`,
    `- Manual review: ${Number(summary.manualReview || 0)}`,
    `- Load failed: ${Number(summary.loadFailed || 0)}`,
    `- Missing requirement rows: ${Number(summary.missingRequirementRows || 0)}`,
    `- Stale active requirement rows: ${Number(summary.staleRequirementRows || 0)}`,
    '',
    '## Checklist',
    '',
    ...checklist.map((item) => `- [${item.done ? 'x' : ' '}] ${item.label} ${item.detail || ''}`),
    '',
    '## Operator Commands',
    '',
    ...commands.map((command) => `- \`${command}\``),
    '',
    '## Syncable Queue',
    '',
  ]

  if (!syncableRows.length) {
    lines.push('No syncable listings in this packet.', '')
  } else {
    lines.push('| Listing | Status | Missing | Stale |')
    lines.push('| --- | --- | --- | --- |')
    for (const row of syncableRows.slice(0, 50)) {
      lines.push(`| ${row.title || row.listingId || '-'} | ${row.listingStatus || '-'} | ${(row.missingRequirementKeys || []).join(', ') || '-'} | ${(row.staleRequirementKeys || []).join(', ') || '-'} |`)
    }
    lines.push('')
  }

  lines.push('## Manual Review', '')
  if (!manualReviewRows.length) {
    lines.push('No manual-review listings in this packet.', '')
  } else {
    for (const row of manualReviewRows.slice(0, 50)) {
      lines.push(`- ${row.title || row.listingId || 'Unknown listing'}: ${row.status || row.errorMessage || 'review required'}`)
    }
    lines.push('')
  }

  lines.push(
    '## Guardrails',
    '',
    '- This packet is dry-run evidence only and does not mutate listing, lead, seller portal, or document rows.',
    '- Do not use the packet generator to apply repairs.',
    '- Apply requirement sync only from a reviewed syncable listing-id list.',
    '- Rerun `npm run verify:seller-documents` after every repair batch.',
    '',
    '## Versions',
    '',
    `- Packet: ${packet.version || SELLER_DOCUMENT_RECONCILIATION_REVIEW_PACKET_VERSION}`,
    `- Reconciliation: ${packet.reconciliationReport?.contractVersion || 'seller_document_reconciliation_v1'}`,
    `- Gate: ${gate.contractVersion || 'seller_document_reconciliation_gate_v1'}`,
    '',
  )

  return lines.join('\n')
}

function normalizeDocumentMatchKey(value = '') {
  return normalizeText(value)
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

const SELLER_DOCUMENT_MATCH_ALIASES = {
  signed_mandate: ['mandate', 'mandate_signature', 'signed_mandate'],
  id_document: ['id_document', 'identity', 'identity_document', 'identity_documents', 'passport', 'seller_id'],
  proof_of_address: ['proof_of_address', 'residential_address', 'residence', 'address'],
  title_deed_reference: ['title_deed_reference', 'title_deed_copy', 'title_deed', 'deed'],
  title_deed_copy: ['title_deed_reference', 'title_deed_copy', 'title_deed', 'deed'],
  rates_account: ['rates_account', 'rates'],
  property_condition_disclosure: ['property_condition_disclosure', 'condition_disclosure', 'disclosure', 'defects'],
  gas_compliance_certificate: ['gas_compliance_certificate', 'gas_compliance', 'gas_certificate', 'gas_coc', 'gas'],
  solar_compliance_documents: ['solar_compliance_documents', 'solar_compliance', 'solar'],
}

function getSellerDocumentMatchAliases(key = '') {
  const normalized = normalizeDocumentMatchKey(key)
  if (!normalized) return []
  return SELLER_DOCUMENT_MATCH_ALIASES[normalized] || [normalized]
}

function sellerDocumentKeysOverlap(left = '', right = '') {
  const leftAliases = getSellerDocumentMatchAliases(left)
  const rightAliases = getSellerDocumentMatchAliases(right)
  if (!leftAliases.length || !rightAliases.length) return false
  return leftAliases.some((leftAlias) =>
    rightAliases.some((rightAlias) =>
      leftAlias === rightAlias ||
      leftAlias.includes(rightAlias) ||
      rightAlias.includes(leftAlias),
    ),
  )
}

function isSignedMandateRequirement(requirement = {}) {
  const source = normalizeDocumentMatchKey([
    requirement?.key,
    requirement?.requirement_key,
    requirement?.label,
    requirement?.requirement_name,
    requirement?.name,
  ].filter(Boolean).join(' '))
  return source.includes('signed_mandate') || source.includes('mandate_signature') || (source.includes('mandate') && source.includes('signed'))
}

function isSignedMandateDocument(document = {}) {
  const source = normalizeDocumentMatchKey([
    document?.requirementKey,
    document?.requirement_key,
    document?.document_type,
    document?.documentType,
    document?.category,
    document?.document_category,
    document?.name,
    document?.document_name,
  ].filter(Boolean).join(' '))
  return source.includes('mandate_signature') || source.includes('signed_mandate') || (source.includes('mandate') && source.includes('signed'))
}

export function documentMatchesSellerRequirement(document = {}, requirement = {}) {
  const requirementId = normalizeText(requirement?.id || requirement?.requirement_id)
  const documentRequirementId = normalizeText(document?.requirementId || document?.requirement_id)
  if (requirementId && documentRequirementId && requirementId === documentRequirementId) return true

  if (isSignedMandateRequirement(requirement) && isSignedMandateDocument(document)) return true

  const requirementKey = normalizeDocumentMatchKey(requirement?.key || requirement?.requirement_key)
  const documentRequirementKey = normalizeDocumentMatchKey(document?.requirementKey || document?.requirement_key)
  const documentType = normalizeDocumentMatchKey(document?.document_type || document?.documentType)
  const documentCategory = normalizeDocumentMatchKey(document?.category || document?.document_category)
  const documentName = normalizeDocumentMatchKey(document?.document_name || document?.name || document?.file_name)
  return Boolean(
    requirementKey &&
      [documentRequirementKey, documentType, documentCategory, documentName].some((candidate) =>
        candidate === requirementKey || sellerDocumentKeysOverlap(candidate, requirementKey),
      ),
  )
}

function resolveDocumentUrl(document = {}) {
  return normalizeText(
    document?.url ||
      document?.fileUrl ||
      document?.file_url ||
      document?.publicUrl ||
      document?.public_url ||
      document?.signedUrl ||
      document?.signed_url,
  )
}

function documentHasFile(document = {}) {
  return Boolean(
    resolveDocumentUrl(document) ||
      normalizeText(document?.storagePath || document?.storage_path || document?.filePath || document?.file_path),
  )
}

function normalizeRequirementTitle(requirement = {}, document = {}) {
  const raw = firstPresent(
    requirement?.label,
    requirement?.requirement_name,
    requirement?.requirementName,
    requirement?.name,
    requirement?.key,
    requirement?.requirement_key,
    document?.document_name,
    document?.name,
    document?.title,
    document?.document_type,
    document?.documentType,
  )
  return normalizeText(raw).replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()) || 'Seller document'
}

function normalizeRequirementDescription(requirement = {}, document = {}) {
  return normalizeText(
    requirement?.description ||
      requirement?.requirement_description ||
      requirement?.notes ||
      document?.description ||
      document?.notes,
  )
}

function normalizeRequirementWhyNeeded(requirement = {}, document = {}) {
  return normalizeText(
    requirement?.whyNeeded ||
      requirement?.why_needed ||
      requirement?.reason ||
      document?.whyNeeded ||
      document?.why_needed,
  )
}

function getSellerDocumentCategoryKey({ requirement = {}, document = {} } = {}) {
  const group = normalizeKey(requirement?.requirement_group || requirement?.group)
  const category = normalizeKey(document?.category || document?.document_category || requirement?.category)
  const signal = normalizeKey([
    group,
    category,
    requirement?.key,
    requirement?.requirement_key,
    requirement?.label,
    requirement?.requirement_name,
    document?.document_type,
    document?.document_name,
  ].filter(Boolean).join(' '))

  if (group === 'additional' || category === 'additional_requests' || signal.includes('additional_request')) return 'additional'
  if (['seller_identity', 'marital', 'company', 'trust', 'deceased_estate', 'power_of_attorney', 'fica'].includes(group)) return 'fica'
  return 'property'
}

function resolveRequirementStatus(requirement = {}, document = null) {
  const requirementStatus = normalizeSellerDocumentRequirementStatus(
    requirement?.status || requirement?.requiredDocumentStatus || requirement?.required_document_status,
  )
  const documentStatus = normalizeSellerDocumentRequirementStatus(
    document?.status || document?.documentStatus || document?.document_status,
  )

  if (document && documentStatus && !['required', 'requested'].includes(documentStatus)) return documentStatus

  if (document && documentHasFile(document)) {
    if (documentStatus && !['required', 'requested'].includes(documentStatus)) return documentStatus
    if (requirementStatus && !['required', 'requested'].includes(requirementStatus)) return requirementStatus
    return documentStatus || 'uploaded'
  }

  return requirementStatus || documentStatus || 'required'
}

function normalizeUploadedBy(document = {}) {
  return normalizeText(document?.uploadedBy || document?.uploaded_by || document?.createdBy || document?.created_by)
}

function normalizeRequestedBy(requirement = {}, document = {}) {
  return normalizeText(
    requirement?.requestedBy ||
      requirement?.requested_by ||
      requirement?.requestedByName ||
      requirement?.requested_by_name ||
      document?.requestedBy ||
      document?.requested_by,
  )
}

function normalizeFileName(document = {}, title = '') {
  return normalizeText(
    document?.fileName ||
      document?.file_name ||
      document?.document_name ||
      document?.name ||
      title,
  )
}

function normalizeDateValue(...values) {
  for (const value of values) {
    const normalized = normalizeText(value)
    if (normalized) return normalized
  }
  return ''
}

function buildRequirementRow(requirement = {}, document = null, index = 0) {
  const title = normalizeRequirementTitle(requirement, document || {})
  const status = resolveRequirementStatus(requirement, document)
  const url = resolveDocumentUrl(document || {})
  return {
    id: normalizeText(firstPresent(requirement?.id, requirement?.requirementId, requirement?.requirement_id, document?.id)) || `seller-requirement-${index}`,
    requirementId: normalizeText(firstPresent(requirement?.id, requirement?.requirementId, requirement?.requirement_id, '')),
    key: normalizeText(firstPresent(requirement?.key, requirement?.requirementKey, requirement?.requirement_key, title)) || `seller-requirement-${index}`,
    category: getSellerDocumentCategoryKey({ requirement, document: document || {} }),
    title,
    label: title,
    description: normalizeRequirementDescription(requirement, document || {}),
    whyNeeded: normalizeRequirementWhyNeeded(requirement, document || {}),
    required: requirement?.is_required !== false && requirement?.required !== false,
    applicable: status !== 'not_applicable' && requirement?.applicable !== false,
    status,
    statusLabel: getSellerDocumentStatusLabel(status),
    url,
    documentUrl: url,
    uploadedFileName: document ? normalizeFileName(document, title) : '',
    uploadedAt: normalizeDateValue(document?.uploadedAt, document?.uploaded_at, document?.createdAt, document?.created_at),
    reviewedAt: normalizeDateValue(document?.reviewedAt, document?.reviewed_at, document?.updatedAt, document?.updated_at),
    rejectionReason: normalizeText(document?.rejectionReason || document?.rejected_reason || document?.reason),
    requestedBy: normalizeRequestedBy(requirement, document || {}),
    uploadedBy: normalizeUploadedBy(document || {}),
    original: {
      requirement,
      document: document || null,
    },
  }
}

function buildExtraDocumentRow(document = {}, index = 0) {
  const title = normalizeRequirementTitle({}, document)
  const status = normalizeSellerDocumentRequirementStatus(
    document?.status || document?.documentStatus || document?.document_status || (documentHasFile(document) ? 'uploaded' : 'required'),
  )
  const url = resolveDocumentUrl(document)
  return {
    id: normalizeText(document?.id || document?.documentId || document?.document_id) || `seller-upload-${index}`,
    requirementId: '',
    key: normalizeText(document?.requirementKey || document?.requirement_key || document?.document_type || title) || `seller-upload-${index}`,
    category: getSellerDocumentCategoryKey({ document }),
    title,
    label: title,
    description: normalizeRequirementDescription({}, document),
    whyNeeded: normalizeRequirementWhyNeeded({}, document),
    required: false,
    applicable: true,
    status,
    statusLabel: getSellerDocumentStatusLabel(status),
    url,
    documentUrl: url,
    uploadedFileName: normalizeFileName(document, title),
    uploadedAt: normalizeDateValue(document?.uploadedAt, document?.uploaded_at, document?.createdAt, document?.created_at),
    reviewedAt: normalizeDateValue(document?.reviewedAt, document?.reviewed_at, document?.updatedAt, document?.updated_at),
    rejectionReason: normalizeText(document?.rejectionReason || document?.rejected_reason || document?.reason),
    requestedBy: normalizeRequestedBy({}, document),
    uploadedBy: normalizeUploadedBy(document),
    original: {
      requirement: null,
      document,
    },
  }
}

export function buildSellerDocumentRequirementRows({ listing = {}, documents = [], formData = {} } = {}) {
  const uploadedDocuments = [
    ...(Array.isArray(documents) ? documents : []),
    ...(Array.isArray(listing?.documents) ? listing.documents : []),
  ]
  const resolvedFormData = isPlainObject(formData) && Object.keys(formData).length
    ? formData
    : getSellerOnboardingFormData(listing)
  const requiredDocuments = getSellerRequiredDocuments(listing, resolvedFormData)
  if (!requiredDocuments.length) {
    return uploadedDocuments.map((document, index) => buildExtraDocumentRow(document, index))
  }

  const matchedIndexes = new Set()
  const rows = requiredDocuments.map((requirement, index) => {
    const matchIndex = uploadedDocuments.findIndex((document) => documentMatchesSellerRequirement(document, requirement))
    const document = matchIndex >= 0 ? uploadedDocuments[matchIndex] : null
    if (matchIndex >= 0) matchedIndexes.add(matchIndex)
    return buildRequirementRow(requirement, document, index)
  })

  const extraRows = uploadedDocuments
    .filter((_, index) => !matchedIndexes.has(index))
    .map((document, index) => buildExtraDocumentRow(document, index + rows.length))

  return [...rows, ...extraRows]
}

export const SELLER_DOCUMENT_SOURCE_OF_TRUTH = Object.freeze({
  contextType: 'private_listing',
  requirementsTable: 'private_listing_document_requirements',
  documentsTable: 'private_listing_documents',
  signedMandateSource: 'document_packets.final_signed_artifact',
  owner: 'listing',
})

export const SELLER_DOCUMENT_TOUCHPOINTS = Object.freeze([
  'listing_documents',
  'seller_lead_documents',
  'seller_portal_documents',
])

export const SELLER_DOCUMENT_STATUS_BUCKETS = Object.freeze({
  required: 'outstanding',
  requested: 'outstanding',
  rejected: 'rejected',
  uploaded: 'uploaded',
  under_review: 'under_review',
  approved: 'approved',
  completed: 'approved',
  not_applicable: 'not_applicable',
  cancelled: 'cancelled',
})

function getMandatePacketFinalSignedFilePath(mandatePacket = null) {
  return normalizeText(
    mandatePacket?.finalSignedFilePath ||
      mandatePacket?.final_signed_file_path ||
      mandatePacket?.version?.final_signed_file_path ||
      mandatePacket?.version?.finalSignedFilePath,
  )
}

function getMandatePacketFinalSignedUrl(mandatePacket = null) {
  return normalizeText(
    mandatePacket?.finalSignedDownloadUrl ||
      mandatePacket?.finalSignedFileAccessUrl ||
      mandatePacket?.final_signed_file_url ||
      mandatePacket?.version?.final_signed_file_access_url ||
      mandatePacket?.version?.final_signed_file_url ||
      mandatePacket?.version?.url,
  )
}

function isMandatePacketFinalSigned(mandatePacket = null) {
  if (!mandatePacket || typeof mandatePacket !== 'object') return false
  const state = normalizeKey(mandatePacket?.state || mandatePacket?.status || mandatePacket?.packet?.status)
  const hasFinalArtifact = Boolean(getMandatePacketFinalSignedFilePath(mandatePacket) || getMandatePacketFinalSignedUrl(mandatePacket))
  return hasFinalArtifact && [
    'fully_signed',
    'signed',
    'completed',
    'complete',
    'finalised',
    'finalized',
    'archived',
  ].includes(state)
}

export function buildSellerSignedMandateDocumentFromPacket(mandatePacket = null) {
  if (!isMandatePacketFinalSigned(mandatePacket)) return null
  const packetId = normalizeText(mandatePacket?.packet?.id || mandatePacket?.id)
  const versionId = normalizeText(mandatePacket?.version?.id)
  const filePath = getMandatePacketFinalSignedFilePath(mandatePacket)
  const fileUrl = getMandatePacketFinalSignedUrl(mandatePacket)
  const fileName = normalizeText(
    mandatePacket?.finalSignedFileName ||
      mandatePacket?.final_signed_file_name ||
      mandatePacket?.version?.final_signed_file_name ||
      mandatePacket?.version?.finalSignedFileName,
  ) || 'Signed Mandate'

  return {
    id: `mandate-final-signed-${versionId || packetId || filePath || fileUrl}`,
    requirementKey: 'signed_mandate',
    requirement_key: 'signed_mandate',
    document_type: 'mandate_signature',
    documentType: 'mandate_signature',
    category: 'mandate_signature',
    document_category: 'mandate_signature',
    document_name: fileName,
    name: fileName,
    file_path: filePath,
    storage_path: filePath,
    file_bucket: normalizeText(mandatePacket?.finalSignedFileBucket || mandatePacket?.version?.final_signed_file_bucket),
    url: fileUrl,
    status: 'completed',
    visibility: 'seller_visible',
    source: SELLER_DOCUMENT_SOURCE_OF_TRUTH.signedMandateSource,
    packetId,
    packetVersionId: versionId,
    created_at:
      mandatePacket?.version?.finalised_at ||
      mandatePacket?.version?.finalized_at ||
      mandatePacket?.version?.generated_at ||
      mandatePacket?.packet?.updated_at ||
      null,
  }
}

function getDocumentIdentity(document = {}, fallback = '') {
  return normalizeText(
    document?.id ||
      document?.documentId ||
      document?.document_id ||
      document?.storage_path ||
      document?.file_path ||
      document?.url ||
      document?.file_url ||
      document?.document_name ||
      fallback,
  )
}

function dedupeSellerDocuments(documents = []) {
  const seen = new Set()
  const rows = []
  for (const document of Array.isArray(documents) ? documents : []) {
    if (!document || typeof document !== 'object') continue
    const identity = getDocumentIdentity(document, `${rows.length}`)
    const key = normalizeKey(identity)
    if (key && seen.has(key)) continue
    if (key) seen.add(key)
    rows.push(document)
  }
  return rows
}

function getSellerDocumentSourceType(row = {}) {
  const requirement = row?.original?.requirement || null
  const document = row?.original?.document || null
  const hasPersistedRequirement = Boolean(
    requirement?.private_listing_id ||
      requirement?.requirement_id ||
      requirement?.id,
  )
  const hasDocument = Boolean(document)
  const documentSource = normalizeText(document?.source)

  if (documentSource === SELLER_DOCUMENT_SOURCE_OF_TRUTH.signedMandateSource || document?.packetId || document?.packetVersionId) {
    return {
      requirement: hasPersistedRequirement ? SELLER_DOCUMENT_SOURCE_OF_TRUTH.requirementsTable : 'generated_seller_requirement',
      document: SELLER_DOCUMENT_SOURCE_OF_TRUTH.signedMandateSource,
    }
  }

  return {
    requirement: requirement
      ? hasPersistedRequirement
        ? SELLER_DOCUMENT_SOURCE_OF_TRUTH.requirementsTable
        : 'generated_seller_requirement'
      : 'standalone_upload',
    document: hasDocument ? SELLER_DOCUMENT_SOURCE_OF_TRUTH.documentsTable : 'none',
  }
}

function getStatusBucket(status = '') {
  const normalized = normalizeSellerDocumentRequirementStatus(status)
  return SELLER_DOCUMENT_STATUS_BUCKETS[normalized] || 'outstanding'
}

function buildSellerDocumentContractRow(row = {}, index = 0, listing = {}) {
  const requirement = row?.original?.requirement || null
  const document = row?.original?.document || null
  const status = normalizeSellerDocumentRequirementStatus(row?.status)
  const statusBucket = getStatusBucket(status)
  const required = row?.required !== false
  const applicable = row?.applicable !== false && !['not_applicable', 'cancelled'].includes(status)
  const complete = applicable && ['uploaded', 'under_review', 'approved', 'completed'].includes(status)
  const contextId = normalizeText(listing?.id || listing?.private_listing_id || requirement?.private_listing_id || document?.private_listing_id)
  const key = normalizeText(row?.key || row?.requirementKey || row?.requirement_key || row?.id || row?.title || row?.label) || `seller-document-${index}`
  const uploadUrl = row?.documentUrl || row?.url || resolveDocumentUrl(document || {})
  const uploadPath = normalizeText(document?.storagePath || document?.storage_path || document?.filePath || document?.file_path || row?.filePath)
  const source = getSellerDocumentSourceType(row)

  return {
    id: normalizeText(row?.id) || `${contextId || 'seller'}:${key}`,
    contextType: SELLER_DOCUMENT_SOURCE_OF_TRUTH.contextType,
    contextId,
    requirementId: normalizeText(row?.requirementId || requirement?.id || requirement?.requirement_id),
    key,
    title: row?.title || row?.label || 'Seller document',
    label: row?.label || row?.title || 'Seller document',
    description: row?.description || '',
    whyNeeded: row?.whyNeeded || '',
    category: row?.category || 'property',
    group: normalizeText(requirement?.requirement_group || requirement?.group || document?.category || document?.document_category || row?.category),
    status,
    statusLabel: row?.statusLabel || getSellerDocumentStatusLabel(status),
    statusBucket,
    required,
    applicable,
    complete,
    blocking: required && applicable && ['outstanding', 'rejected'].includes(statusBucket),
    hasUpload: Boolean(document && (uploadUrl || uploadPath || documentHasFile(document) || complete)),
    requestedBy: row?.requestedBy || normalizeRequestedBy(requirement || {}, document || {}),
    uploadedBy: row?.uploadedBy || normalizeUploadedBy(document || {}),
    uploadedAt: row?.uploadedAt || normalizeDateValue(document?.uploadedAt, document?.uploaded_at, document?.createdAt, document?.created_at),
    reviewedAt: row?.reviewedAt || normalizeDateValue(document?.reviewedAt, document?.reviewed_at, document?.updatedAt, document?.updated_at),
    rejectionReason: row?.rejectionReason || normalizeText(document?.rejectionReason || document?.rejected_reason || document?.reason),
    visibility: normalizeText(requirement?.visibility || requirement?.document_visibility || document?.visibility || document?.visibility_scope || 'seller_visible'),
    source,
    upload: document
      ? {
          id: getDocumentIdentity(document),
          fileName: row?.uploadedFileName || normalizeFileName(document, row?.title || row?.label),
          filePath: uploadPath,
          url: uploadUrl,
          bucket: normalizeText(document?.file_bucket || document?.bucket || document?.storage_bucket),
          uploadedAt: row?.uploadedAt || normalizeDateValue(document?.uploadedAt, document?.uploaded_at, document?.createdAt, document?.created_at),
          uploadedBy: row?.uploadedBy || normalizeUploadedBy(document),
          source: source.document,
        }
      : null,
    original: row?.original || { requirement: null, document: null },
  }
}

export function buildSellerDocumentSourceSummary(rows = []) {
  return (Array.isArray(rows) ? rows : []).reduce((summary, row) => {
    if (!row?.applicable) return summary
    summary.total += 1
    if (row.required) summary.totalRequired += 1
    if (row.complete) summary.complete += 1
    if (row.required && row.complete) summary.completeRequired += 1
    if (row.blocking) summary.blocking += 1
    if (row.hasUpload) summary.uploaded += 1
    if (row.statusBucket === 'outstanding') summary.outstanding += 1
    else if (row.statusBucket === 'under_review') summary.underReview += 1
    else if (row.statusBucket === 'approved') summary.approved += 1
    else if (row.statusBucket === 'rejected') summary.rejected += 1
    summary.byCategory[row.category] = (summary.byCategory[row.category] || 0) + 1
    return summary
  }, {
    total: 0,
    totalRequired: 0,
    complete: 0,
    completeRequired: 0,
    blocking: 0,
    uploaded: 0,
    outstanding: 0,
    underReview: 0,
    approved: 0,
    rejected: 0,
    byCategory: {},
  })
}

export function buildSellerDocumentSourceOfTruth({
  listing = {},
  documents = null,
  formData = {},
  mandatePacket = null,
} = {}) {
  const resolvedFormData = isPlainObject(formData) && Object.keys(formData).length
    ? formData
    : getSellerOnboardingFormData(listing)
  const baseDocuments = Array.isArray(documents)
    ? documents
    : Array.isArray(listing?.documents)
      ? listing.documents
      : []
  const signedMandateDocument = buildSellerSignedMandateDocumentFromPacket(
    mandatePacket || listing?.mandatePacket || listing?.mandate_packet || null,
  )
  const mergedDocuments = dedupeSellerDocuments([
    ...baseDocuments,
    ...(signedMandateDocument ? [signedMandateDocument] : []),
  ])
  const sourceListing = {
    ...listing,
    documents: mergedDocuments,
  }
  const rows = buildSellerDocumentRequirementRows({
    listing: sourceListing,
    documents: [],
    formData: resolvedFormData,
  }).map((row, index) => buildSellerDocumentContractRow(row, index, sourceListing))

  return {
    contractVersion: 'seller_document_source_v1',
    sourceOfTruth: SELLER_DOCUMENT_SOURCE_OF_TRUTH,
    touchpoints: SELLER_DOCUMENT_TOUCHPOINTS,
    context: {
      type: SELLER_DOCUMENT_SOURCE_OF_TRUTH.contextType,
      id: normalizeText(sourceListing?.id || sourceListing?.private_listing_id),
      sellerLeadId: normalizeText(sourceListing?.sellerLeadId || sourceListing?.seller_lead_id || sourceListing?.originatingCrmLeadId || sourceListing?.originating_crm_lead_id),
    },
    rows,
    summary: buildSellerDocumentSourceSummary(rows),
  }
}
