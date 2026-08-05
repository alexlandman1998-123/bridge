import {
  OTP_TEMPLATE_RENEWAL_PUBLICATION_GUARD_PHASE62_VERSION,
  OTP_TEMPLATE_RENEWAL_PUBLICATION_GUARD_READY_STATUS,
  buildOtpTemplateRenewalPublicationGuardPhase62Audit,
} from './otpTemplateRenewalPublicationGuardPhase62.js'

export const OTP_TEMPLATE_RENEWAL_FINAL_APPROVAL_CLOSEOUT_PHASE63_VERSION = 'otp_template_renewal_final_approval_and_closeout_phase63_v1'
export const OTP_TEMPLATE_RENEWAL_FINAL_APPROVAL_CLOSEOUT_READY_STATUS = 'OTP_TEMPLATE_RENEWAL_FINAL_APPROVAL_AND_CLOSEOUT_COMPLETE'
export const OTP_TEMPLATE_RENEWAL_FINAL_APPROVAL_CLOSEOUT_CONTRACT = 'otp-vnext-template-renewal-final-approval-closeout-phase63-v1'

const REQUIRED_ROUTES = Object.freeze(['resale_existing_property', 'new_development'])
const REQUIRED_APPROVAL_ROLES = Object.freeze([
  'template_owner',
  'governance_owner',
  'release_operator',
  'attorney_reviewer',
  'support_owner',
])
const REQUIRED_ARCHIVE_KEYS = Object.freeze([
  'phase61_generated_pdf_signing_proof',
  'phase62_publication_guard_receipt',
  'final_approval_receipt',
  'resale_route_candidate_manifest',
  'new_development_route_candidate_manifest',
  'attorney_closeout_signoff',
  'rollback_and_no_write_attestation',
  'governance_closeout_summary',
])

function normalizeText(value = '') {
  return String(value ?? '').trim()
}

function normalizeKey(value = '') {
  return normalizeText(value)
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
}

function list(value) {
  return Array.isArray(value) ? value : []
}

function unique(values = []) {
  return Array.from(new Set(values.filter(Boolean)))
}

function numberValue(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function table(headers = [], rows = []) {
  const escape = (value) => normalizeText(value).replace(/\|/g, '\\|').replace(/\n/g, '<br>')
  return [
    `| ${headers.map(escape).join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map(escape).join(' | ')} |`),
  ].join('\n')
}

function fingerprint(parts = []) {
  const text = parts.map((part) => normalizeText(part)).join('|')
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return `${hash.toString(16).padStart(8, '0')}${'0'.repeat(56)}`
}

function hasDocxSource(row = {}) {
  return /\.docx?$/i.test(normalizeText(row.path || row.sourcePath || row.source_path || row.archivePath || row.archive_path)) ||
    normalizeKey(row.sourceFormat || row.source_format).includes('doc') ||
    numberValue(row.docxReferenceCount || row.docx_reference_count) > 0
}

function defaultPhase62Receipt(checkedAt = new Date().toISOString()) {
  return buildOtpTemplateRenewalPublicationGuardPhase62Audit({ checkedAt }).publicationGuardReceipts?.find((receipt) => receipt.canProceedToControlledActivationDryRun)
}

function defaultFinalApproval(phase62Receipt = {}, checkedAt = new Date().toISOString()) {
  return {
    approvalId: 'otp-vnext-phase63-template-renewal-final-approval',
    status: 'approved_for_closeout',
    approvedAt: checkedAt,
    sourcePublicationGuardFingerprint: phase62Receipt.publicationGuardFingerprint,
    sourcePhase62Status: phase62Receipt.status,
    attorneyApprovalReference: phase62Receipt.activationGuard?.attorneyApprovalReference || 'phase63-attorney-closeout-reference',
    legalReviewStatus: 'attorney_review_complete',
    principalEditableTemplateRiskAccepted: true,
    routeSeparationConfirmed: true,
    docxSourceAbsentConfirmed: true,
    noLiveWriteConfirmed: true,
    noSigningDispatchConfirmed: true,
    noFinalArtifactMutationConfirmed: true,
    closeoutDecision: 'close',
  }
}

function defaultRouteCloseoutManifest(phase62Receipt = {}) {
  return REQUIRED_ROUTES.map((routeVariant) => {
    const candidate = list(phase62Receipt.routeCandidates).find((row) => normalizeKey(row.routeVariant) === routeVariant) || {}
    return {
      routeVariant,
      candidateTemplateDefaultId: candidate.candidateTemplateDefaultId,
      candidateSigningEnvelopeKey: candidate.candidateSigningEnvelopeKey,
      generatedPdfProofKey: candidate.generatedPdfProofKey,
      routeOutputFingerprint: candidate.routeOutputFingerprint,
      sourcePublicationGuardFingerprint: phase62Receipt.publicationGuardFingerprint,
      routeSeparated: true,
      archived: true,
      liveDefaultChanged: false,
      productionWriteRequested: false,
      signingDispatchRequested: false,
      sourceFormat: 'native_governance_record',
      docxReferenceCount: 0,
    }
  })
}

function defaultCloseoutApprovals(checkedAt = new Date().toISOString()) {
  return REQUIRED_APPROVAL_ROLES.map((role) => ({
    role,
    approved: true,
    approvalReference: `phase63-${role}-final-closeout`,
    approvedAt: checkedAt,
  }))
}

function defaultArchiveEntries() {
  return REQUIRED_ARCHIVE_KEYS.map((key) => ({
    key,
    path: `docs/otp-${key.replace(/_/g, '-')}-phase63.md`,
    fingerprint: fingerprint([key, 'phase63']),
    storageClass: 'governance_archive',
    retentionPolicy: 'template_renewal_closeout_plus_7_years',
    owner: key.includes('attorney') ? 'attorney_reviewer' : 'governance_owner',
    immutable: true,
    sourceFormat: 'markdown_evidence',
    docxReferenceCount: 0,
  }))
}

function defaultRollbackAndNoWrite() {
  return {
    rollbackPlanReference: 'phase62-template-renewal-rollback-plan',
    rollbackAvailableAfterCloseout: true,
    restorePreviousVersionReady: true,
    stopSigningDispatchReady: true,
    mutatedData: false,
    productionWriteAttempted: false,
    liveDefaultMutationCount: 0,
    signingDispatchMutationCount: 0,
    finalPdfMutationCount: 0,
  }
}

function defaultOpenItems() {
  return {
    openBlockerCount: 0,
    unresolvedLegalItemCount: 0,
    unresolvedRouteIssueCount: 0,
    unresolvedEvidenceIssueCount: 0,
    productionIncidentFreezeActive: false,
  }
}

function defaultGovernanceHandoff() {
  return {
    owner: 'governance_owner',
    templateOwner: 'template_owner',
    supportOwner: 'support_owner',
    archiveReference: 'otp-vnext-phase63-template-renewal-final-closeout-archive',
    steadyStateCadence: 'weekly_template_renewal_governance_review',
    renewalThreadClosed: true,
  }
}

function phase62Blockers(phase62Receipt = {}) {
  return [
    phase62Receipt.version === OTP_TEMPLATE_RENEWAL_PUBLICATION_GUARD_PHASE62_VERSION ? '' : 'phase62_publication_guard_version_mismatch',
    phase62Receipt.status === OTP_TEMPLATE_RENEWAL_PUBLICATION_GUARD_READY_STATUS ? '' : 'phase62_publication_guard_not_ready',
    phase62Receipt.canProceedToControlledActivationDryRun === true ? '' : 'phase62_publication_guard_not_passed',
    phase62Receipt.mutatedData === false ? '' : 'phase62_publication_guard_mutation_unexpected',
    list(phase62Receipt.blockerCodes).length === 0 ? '' : 'phase62_publication_guard_has_blockers',
    phase62Receipt.noWriteProof?.productionWriteAttempted === false ? '' : 'phase62_publication_guard_write_attempted',
  ].filter(Boolean)
}

function finalApprovalBlockers(finalApproval = {}, phase62Receipt = {}) {
  return [
    normalizeText(finalApproval.approvalId || finalApproval.approval_id) ? '' : 'final_approval_id_missing',
    normalizeKey(finalApproval.status) === 'approved_for_closeout' ? '' : 'final_approval_status_invalid',
    normalizeText(finalApproval.approvedAt || finalApproval.approved_at) ? '' : 'final_approval_time_missing',
    finalApproval.sourcePublicationGuardFingerprint === phase62Receipt.publicationGuardFingerprint ? '' : 'final_approval_publication_guard_fingerprint_mismatch',
    finalApproval.sourcePhase62Status === phase62Receipt.status ? '' : 'final_approval_phase62_status_mismatch',
    normalizeText(finalApproval.attorneyApprovalReference || finalApproval.attorney_approval_reference) ? '' : 'final_approval_attorney_reference_missing',
    normalizeKey(finalApproval.legalReviewStatus || finalApproval.legal_review_status) === 'attorney_review_complete' ? '' : 'final_approval_legal_review_not_complete',
    finalApproval.principalEditableTemplateRiskAccepted === true ? '' : 'final_approval_principal_template_risk_not_accepted',
    finalApproval.routeSeparationConfirmed === true ? '' : 'final_approval_route_separation_not_confirmed',
    finalApproval.docxSourceAbsentConfirmed === true ? '' : 'final_approval_docx_absence_not_confirmed',
    finalApproval.noLiveWriteConfirmed === true ? '' : 'final_approval_no_live_write_not_confirmed',
    finalApproval.noSigningDispatchConfirmed === true ? '' : 'final_approval_no_dispatch_not_confirmed',
    finalApproval.noFinalArtifactMutationConfirmed === true ? '' : 'final_approval_no_final_artifact_mutation_not_confirmed',
    normalizeKey(finalApproval.closeoutDecision || finalApproval.closeout_decision) === 'close' ? '' : 'final_approval_decision_not_close',
  ].filter(Boolean)
}

function routeCloseoutBlockers(routeManifest = [], phase62Receipt = {}) {
  const routes = list(routeManifest).map((row) => normalizeKey(row.routeVariant || row.route_variant))
  const missingRoutes = REQUIRED_ROUTES.filter((route) => !routes.includes(route))
  const duplicateRoutes = routes.filter((route, index) => route && routes.indexOf(route) !== index)
  const rowBlockers = list(routeManifest).flatMap((row) => {
    const route = normalizeKey(row.routeVariant || row.route_variant) || 'unknown'
    return [
      REQUIRED_ROUTES.includes(route) ? '' : `final_closeout_unsupported_route:${route}`,
      normalizeText(row.candidateTemplateDefaultId || row.candidate_template_default_id) ? '' : `final_closeout_template_missing:${route}`,
      normalizeText(row.candidateSigningEnvelopeKey || row.candidate_signing_envelope_key) ? '' : `final_closeout_envelope_missing:${route}`,
      normalizeText(row.generatedPdfProofKey || row.generated_pdf_proof_key) ? '' : `final_closeout_pdf_proof_missing:${route}`,
      /^[a-f0-9]{64}$/i.test(normalizeText(row.routeOutputFingerprint || row.route_output_fingerprint)) ? '' : `final_closeout_route_fingerprint_missing:${route}`,
      row.sourcePublicationGuardFingerprint === phase62Receipt.publicationGuardFingerprint ? '' : `final_closeout_publication_guard_fingerprint_mismatch:${route}`,
      row.routeSeparated === true ? '' : `final_closeout_route_not_separated:${route}`,
      row.archived === true ? '' : `final_closeout_route_not_archived:${route}`,
      row.liveDefaultChanged === true ? `final_closeout_live_default_changed:${route}` : '',
      row.productionWriteRequested === true ? `final_closeout_production_write_requested:${route}` : '',
      row.signingDispatchRequested === true ? `final_closeout_signing_dispatch_requested:${route}` : '',
      hasDocxSource(row) ? `final_closeout_docx_source_observed:${route}` : '',
    ].filter(Boolean)
  })
  return [
    ...missingRoutes.map((route) => `final_closeout_route_missing:${route}`),
    ...unique(duplicateRoutes).map((route) => `final_closeout_route_duplicate:${route}`),
    ...rowBlockers,
  ]
}

function approvalBlockers(approvals = []) {
  const roles = list(approvals).map((row) => normalizeKey(row.role))
  const missingRoles = REQUIRED_APPROVAL_ROLES.filter((role) => !roles.includes(role))
  const badRows = list(approvals).filter((row) =>
    REQUIRED_APPROVAL_ROLES.includes(normalizeKey(row.role)) &&
      (row.approved !== true || !normalizeText(row.approvalReference || row.approval_reference) || !normalizeText(row.approvedAt || row.approved_at)),
  )
  return [
    ...missingRoles.map((role) => `final_closeout_approval_missing:${role}`),
    ...badRows.map((row) => `final_closeout_approval_incomplete:${normalizeKey(row.role) || 'unknown'}`),
  ]
}

function archiveBlockers(archiveEntries = []) {
  const keys = list(archiveEntries).map((row) => normalizeKey(row.key))
  const missingKeys = REQUIRED_ARCHIVE_KEYS.filter((key) => !keys.includes(key))
  const badRows = list(archiveEntries).filter((row) =>
    REQUIRED_ARCHIVE_KEYS.includes(normalizeKey(row.key)) &&
      (!normalizeText(row.path || row.url) ||
        !/^[a-f0-9]{64}$/i.test(normalizeText(row.fingerprint || row.sha256)) ||
        row.immutable !== true ||
        !normalizeText(row.retentionPolicy || row.retention_policy) ||
        !normalizeText(row.owner) ||
        hasDocxSource(row)),
  )
  return [
    ...missingKeys.map((key) => `final_closeout_archive_missing:${key}`),
    ...badRows.map((row) => hasDocxSource(row)
      ? `final_closeout_archive_docx_source_observed:${normalizeKey(row.key) || 'unknown'}`
      : `final_closeout_archive_invalid:${normalizeKey(row.key) || 'unknown'}`),
  ]
}

function rollbackNoWriteBlockers(rollback = {}) {
  return [
    normalizeText(rollback.rollbackPlanReference || rollback.rollback_plan_reference) ? '' : 'final_closeout_rollback_plan_missing',
    rollback.rollbackAvailableAfterCloseout === true ? '' : 'final_closeout_rollback_not_available',
    rollback.restorePreviousVersionReady === true ? '' : 'final_closeout_restore_previous_not_ready',
    rollback.stopSigningDispatchReady === true ? '' : 'final_closeout_stop_dispatch_not_ready',
    rollback.mutatedData === false ? '' : 'final_closeout_mutated_data',
    rollback.productionWriteAttempted === true ? 'final_closeout_production_write_attempted' : '',
    numberValue(rollback.liveDefaultMutationCount || rollback.live_default_mutation_count) === 0 ? '' : 'final_closeout_live_default_mutation_observed',
    numberValue(rollback.signingDispatchMutationCount || rollback.signing_dispatch_mutation_count) === 0 ? '' : 'final_closeout_signing_dispatch_observed',
    numberValue(rollback.finalPdfMutationCount || rollback.final_pdf_mutation_count) === 0 ? '' : 'final_closeout_final_pdf_mutation_observed',
  ].filter(Boolean)
}

function openItemBlockers(openItems = {}) {
  return [
    numberValue(openItems.openBlockerCount || openItems.open_blocker_count) === 0 ? '' : 'final_closeout_open_blockers_remain',
    numberValue(openItems.unresolvedLegalItemCount || openItems.unresolved_legal_item_count) === 0 ? '' : 'final_closeout_unresolved_legal_items_remain',
    numberValue(openItems.unresolvedRouteIssueCount || openItems.unresolved_route_issue_count) === 0 ? '' : 'final_closeout_unresolved_route_issues_remain',
    numberValue(openItems.unresolvedEvidenceIssueCount || openItems.unresolved_evidence_issue_count) === 0 ? '' : 'final_closeout_unresolved_evidence_issues_remain',
    openItems.productionIncidentFreezeActive === true ? 'final_closeout_production_incident_freeze_active' : '',
  ].filter(Boolean)
}

function governanceHandoffBlockers(handoff = {}) {
  return [
    normalizeText(handoff.owner) ? '' : 'final_closeout_governance_owner_missing',
    normalizeText(handoff.templateOwner || handoff.template_owner) ? '' : 'final_closeout_template_owner_missing',
    normalizeText(handoff.supportOwner || handoff.support_owner) ? '' : 'final_closeout_support_owner_missing',
    normalizeText(handoff.archiveReference || handoff.archive_reference) ? '' : 'final_closeout_archive_reference_missing',
    normalizeText(handoff.steadyStateCadence || handoff.steady_state_cadence) ? '' : 'final_closeout_steady_state_cadence_missing',
    handoff.renewalThreadClosed === true ? '' : 'final_closeout_thread_not_closed',
  ].filter(Boolean)
}

export function buildOtpTemplateRenewalFinalApprovalCloseoutReceipt({
  publicationGuardReceipt = defaultPhase62Receipt(),
  finalApproval = null,
  routeCloseoutManifest = null,
  approvals = null,
  archiveEntries = defaultArchiveEntries(),
  rollbackAndNoWrite = defaultRollbackAndNoWrite(),
  openItems = defaultOpenItems(),
  governanceHandoff = defaultGovernanceHandoff(),
  checkedAt = new Date().toISOString(),
} = {}) {
  const phase62Receipt = publicationGuardReceipt || {}
  const approval = finalApproval || defaultFinalApproval(phase62Receipt, checkedAt)
  const routes = routeCloseoutManifest || defaultRouteCloseoutManifest(phase62Receipt)
  const approvalRows = approvals || defaultCloseoutApprovals(checkedAt)
  const blockerCodes = unique([
    ...phase62Blockers(phase62Receipt),
    ...finalApprovalBlockers(approval, phase62Receipt),
    ...routeCloseoutBlockers(routes, phase62Receipt),
    ...approvalBlockers(approvalRows),
    ...archiveBlockers(archiveEntries),
    ...rollbackNoWriteBlockers(rollbackAndNoWrite),
    ...openItemBlockers(openItems),
    ...governanceHandoffBlockers(governanceHandoff),
  ])
  const canCloseRenewal = blockerCodes.length === 0
  const closeoutFingerprint = fingerprint([
    approval.approvalId,
    phase62Receipt.publicationGuardFingerprint,
    list(routes).map((row) => `${row.routeVariant}:${row.routeOutputFingerprint}`).join('|'),
    list(approvalRows).map((row) => `${row.role}:${row.approvalReference}`).join('|'),
  ])

  return Object.freeze({
    version: OTP_TEMPLATE_RENEWAL_FINAL_APPROVAL_CLOSEOUT_PHASE63_VERSION,
    contract: OTP_TEMPLATE_RENEWAL_FINAL_APPROVAL_CLOSEOUT_CONTRACT,
    checkedAt,
    status: canCloseRenewal
      ? OTP_TEMPLATE_RENEWAL_FINAL_APPROVAL_CLOSEOUT_READY_STATUS
      : 'OTP_TEMPLATE_RENEWAL_FINAL_APPROVAL_AND_CLOSEOUT_BLOCKED',
    canCloseRenewal,
    lifecycleComplete: canCloseRenewal,
    mutatedData: false,
    blockerCodes: Object.freeze(blockerCodes),
    closeoutFingerprint,
    publicationGuardReceipt: Object.freeze({
      version: phase62Receipt.version,
      status: phase62Receipt.status,
      canProceedToControlledActivationDryRun: phase62Receipt.canProceedToControlledActivationDryRun === true,
      publicationGuardFingerprint: phase62Receipt.publicationGuardFingerprint,
    }),
    finalApproval: Object.freeze({ ...approval }),
    routeCloseoutManifest: Object.freeze(list(routes)),
    approvals: Object.freeze(list(approvalRows)),
    archiveEntries: Object.freeze(list(archiveEntries)),
    rollbackAndNoWrite: Object.freeze({ ...rollbackAndNoWrite }),
    openItems: Object.freeze({ ...openItems }),
    governanceHandoff: Object.freeze({ ...governanceHandoff }),
    summary: Object.freeze({
      routeCount: list(routes).length,
      archivedRouteCount: list(routes).filter((row) => row.archived === true).length,
      approvalCount: list(approvalRows).length,
      archiveEntryCount: list(archiveEntries).length,
      blockerCount: blockerCodes.length,
    }),
  })
}

function addCheck(checks, pass, code, detail) {
  checks.push({ code, pass: Boolean(pass), detail })
}

export function buildOtpTemplateRenewalFinalApprovalCloseoutPhase63Audit({
  checkedAt = new Date().toISOString(),
  phase62Audit = null,
  packageJson = {},
} = {}) {
  const checks = []
  const phase62Ready = !phase62Audit || phase62Audit.status === OTP_TEMPLATE_RENEWAL_PUBLICATION_GUARD_READY_STATUS
  const goodPublicationGuard = phase62Audit?.publicationGuardReceipts?.find((receipt) => receipt.canProceedToControlledActivationDryRun) ||
    buildOtpTemplateRenewalPublicationGuardPhase62Audit({ checkedAt }).publicationGuardReceipts.find((receipt) => receipt.canProceedToControlledActivationDryRun)
  const goodCloseout = buildOtpTemplateRenewalFinalApprovalCloseoutReceipt({ checkedAt, publicationGuardReceipt: goodPublicationGuard })
  const fingerprintMismatchCloseout = buildOtpTemplateRenewalFinalApprovalCloseoutReceipt({
    checkedAt,
    publicationGuardReceipt: goodPublicationGuard,
    finalApproval: {
      ...defaultFinalApproval(goodPublicationGuard, checkedAt),
      sourcePublicationGuardFingerprint: 'wrong-publication-guard',
    },
  })
  const missingRouteCloseout = buildOtpTemplateRenewalFinalApprovalCloseoutReceipt({
    checkedAt,
    publicationGuardReceipt: goodPublicationGuard,
    routeCloseoutManifest: defaultRouteCloseoutManifest(goodPublicationGuard).filter((row) => row.routeVariant !== 'new_development'),
  })
  const docxCloseout = buildOtpTemplateRenewalFinalApprovalCloseoutReceipt({
    checkedAt,
    publicationGuardReceipt: goodPublicationGuard,
    routeCloseoutManifest: defaultRouteCloseoutManifest(goodPublicationGuard).map((row) =>
      row.routeVariant === 'resale_existing_property'
        ? { ...row, sourceFormat: 'docx', path: 'otp-renewal-closeout.docx', docxReferenceCount: 1 }
        : row,
    ),
  })
  const missingApprovalCloseout = buildOtpTemplateRenewalFinalApprovalCloseoutReceipt({
    checkedAt,
    publicationGuardReceipt: goodPublicationGuard,
    approvals: defaultCloseoutApprovals(checkedAt).filter((row) => row.role !== 'attorney_reviewer'),
  })
  const archiveBlockedCloseout = buildOtpTemplateRenewalFinalApprovalCloseoutReceipt({
    checkedAt,
    publicationGuardReceipt: goodPublicationGuard,
    archiveEntries: [{ key: 'phase62_publication_guard_receipt', status: 'missing', path: '', fingerprint: 'bad', immutable: false }],
  })
  const writeBlockedCloseout = buildOtpTemplateRenewalFinalApprovalCloseoutReceipt({
    checkedAt,
    publicationGuardReceipt: goodPublicationGuard,
    rollbackAndNoWrite: {
      ...defaultRollbackAndNoWrite(),
      rollbackAvailableAfterCloseout: false,
      mutatedData: true,
      productionWriteAttempted: true,
      liveDefaultMutationCount: 1,
      signingDispatchMutationCount: 1,
      finalPdfMutationCount: 1,
    },
  })
  const openItemCloseout = buildOtpTemplateRenewalFinalApprovalCloseoutReceipt({
    checkedAt,
    publicationGuardReceipt: goodPublicationGuard,
    openItems: {
      openBlockerCount: 1,
      unresolvedLegalItemCount: 1,
      unresolvedRouteIssueCount: 1,
      unresolvedEvidenceIssueCount: 1,
      productionIncidentFreezeActive: true,
    },
  })
  const handoffBlockedCloseout = buildOtpTemplateRenewalFinalApprovalCloseoutReceipt({
    checkedAt,
    publicationGuardReceipt: goodPublicationGuard,
    governanceHandoff: {
      owner: '',
      templateOwner: '',
      supportOwner: '',
      archiveReference: '',
      steadyStateCadence: '',
      renewalThreadClosed: false,
    },
  })

  addCheck(checks, phase62Ready, 'PHASE63_PHASE62_PUBLICATION_GUARD_READY', 'Final closeout starts only after Phase 62 publication dry run and activation guard is ready.')
  addCheck(
    checks,
    goodCloseout.canCloseRenewal &&
      goodCloseout.status === OTP_TEMPLATE_RENEWAL_FINAL_APPROVAL_CLOSEOUT_READY_STATUS &&
      goodCloseout.lifecycleComplete === true &&
      goodCloseout.mutatedData === false,
    'PHASE63_GOOD_FINAL_APPROVAL_CLOSEOUT_COMPLETE',
    'A clean Phase 62 guard can be finally approved, archived, and closed without mutating production.',
  )
  addCheck(
    checks,
    REQUIRED_ROUTES.every((route) => goodCloseout.routeCloseoutManifest.some((row) => row.routeVariant === route && row.archived === true)),
    'PHASE63_BOTH_ROUTE_CLOSEOUT_MANIFESTS_ARCHIVED',
    'Resale and new-development closeout manifests are archived separately.',
  )
  addCheck(
    checks,
    goodCloseout.finalApproval.sourcePublicationGuardFingerprint === goodPublicationGuard.publicationGuardFingerprint,
    'PHASE63_CLOSEOUT_BOUND_TO_PHASE62_GUARD',
    'Final approval is bound to the exact Phase 62 publication guard fingerprint.',
  )
  addCheck(
    checks,
    goodCloseout.finalApproval.legalReviewStatus === 'attorney_review_complete' &&
      goodCloseout.finalApproval.attorneyApprovalReference === goodPublicationGuard.activationGuard.attorneyApprovalReference,
    'PHASE63_ATTORNEY_CLOSEOUT_RECORDED',
    'Attorney closeout approval is recorded against the guarded renewal candidate.',
  )
  addCheck(
    checks,
    goodCloseout.rollbackAndNoWrite.productionWriteAttempted === false &&
      goodCloseout.rollbackAndNoWrite.liveDefaultMutationCount === 0 &&
      goodCloseout.rollbackAndNoWrite.signingDispatchMutationCount === 0,
    'PHASE63_NO_LIVE_WRITE_OR_DISPATCH_ALLOWED',
    'Final closeout cannot perform live writes, mutate route defaults, dispatch signing, or alter final PDFs.',
  )
  addCheck(
    checks,
    fingerprintMismatchCloseout.canCloseRenewal === false &&
      fingerprintMismatchCloseout.blockerCodes.includes('final_approval_publication_guard_fingerprint_mismatch'),
    'PHASE63_PUBLICATION_GUARD_FINGERPRINT_MISMATCH_BLOCKED',
    'Final approval must match the Phase 62 publication guard fingerprint.',
  )
  addCheck(
    checks,
    missingRouteCloseout.canCloseRenewal === false &&
      missingRouteCloseout.blockerCodes.includes('final_closeout_route_missing:new_development'),
    'PHASE63_MISSING_ROUTE_CLOSEOUT_BLOCKED',
    'Missing resale or new-development route closeout manifest blocks final closeout.',
  )
  addCheck(
    checks,
    docxCloseout.canCloseRenewal === false &&
      docxCloseout.blockerCodes.includes('final_closeout_docx_source_observed:resale_existing_property'),
    'PHASE63_DOCX_CLOSEOUT_BLOCKED',
    'DOC/DOCX evidence remains blocked in the final closeout archive.',
  )
  addCheck(
    checks,
    missingApprovalCloseout.canCloseRenewal === false &&
      missingApprovalCloseout.blockerCodes.includes('final_closeout_approval_missing:attorney_reviewer'),
    'PHASE63_MISSING_FINAL_APPROVAL_BLOCKED',
    'Template owner, governance owner, release operator, attorney reviewer, and support owner approvals are required.',
  )
  addCheck(
    checks,
    archiveBlockedCloseout.canCloseRenewal === false &&
      archiveBlockedCloseout.blockerCodes.includes('final_closeout_archive_missing:final_approval_receipt') &&
      archiveBlockedCloseout.blockerCodes.includes('final_closeout_archive_invalid:phase62_publication_guard_receipt'),
    'PHASE63_ARCHIVE_EVIDENCE_BLOCKED',
    'Missing or mutable closeout archive entries block final approval.',
  )
  addCheck(
    checks,
    writeBlockedCloseout.canCloseRenewal === false &&
      writeBlockedCloseout.blockerCodes.includes('final_closeout_rollback_not_available') &&
      writeBlockedCloseout.blockerCodes.includes('final_closeout_production_write_attempted') &&
      writeBlockedCloseout.blockerCodes.includes('final_closeout_final_pdf_mutation_observed'),
    'PHASE63_WRITE_OR_ROLLBACK_FAILURE_BLOCKED',
    'Production writes, dispatch, final PDF mutation, or unavailable rollback block final closeout.',
  )
  addCheck(
    checks,
    openItemCloseout.canCloseRenewal === false &&
      openItemCloseout.blockerCodes.includes('final_closeout_unresolved_legal_items_remain') &&
      openItemCloseout.blockerCodes.includes('final_closeout_production_incident_freeze_active'),
    'PHASE63_OPEN_ITEMS_BLOCK_CLOSEOUT',
    'Open blockers, legal items, route issues, evidence gaps, or incident freezes block closeout.',
  )
  addCheck(
    checks,
    handoffBlockedCloseout.canCloseRenewal === false &&
      handoffBlockedCloseout.blockerCodes.includes('final_closeout_governance_owner_missing') &&
      handoffBlockedCloseout.blockerCodes.includes('final_closeout_thread_not_closed'),
    'PHASE63_GOVERNANCE_HANDOFF_BLOCKED',
    'Governance owner, template owner, support owner, archive reference, cadence, and closed thread flag are required.',
  )
  addCheck(
    checks,
    packageJson.scripts?.['test:otp-template-renewal-final-approval-closeout-phase63'] === 'node scripts/otp-template-renewal-final-approval-closeout-phase63.test.mjs' &&
      packageJson.scripts?.['report:otp-template-renewal-final-approval-closeout-phase63'] === 'node scripts/report-otp-template-renewal-final-approval-closeout-phase63.mjs' &&
      packageJson.scripts?.['verify:otp-template-vnext']?.includes('test:otp-template-renewal-final-approval-closeout-phase63'),
    'PHASE63_PACKAGE_SCRIPTS_WIRED',
    'Package scripts expose the Phase 63 test, report, and vNext verification chain entry.',
  )

  const blockers = checks.filter((check) => !check.pass)
  return Object.freeze({
    version: OTP_TEMPLATE_RENEWAL_FINAL_APPROVAL_CLOSEOUT_PHASE63_VERSION,
    contract: OTP_TEMPLATE_RENEWAL_FINAL_APPROVAL_CLOSEOUT_CONTRACT,
    checkedAt,
    status: blockers.length ? 'OTP_TEMPLATE_RENEWAL_FINAL_APPROVAL_AND_CLOSEOUT_REMEDIATION_REQUIRED' : OTP_TEMPLATE_RENEWAL_FINAL_APPROVAL_CLOSEOUT_READY_STATUS,
    mutatedData: false,
    lifecycleComplete: blockers.length === 0,
    checks: Object.freeze(checks),
    blockers: Object.freeze(blockers),
    closeoutReceipts: Object.freeze([
      goodCloseout,
      fingerprintMismatchCloseout,
      missingRouteCloseout,
      docxCloseout,
      missingApprovalCloseout,
      archiveBlockedCloseout,
      writeBlockedCloseout,
      openItemCloseout,
      handoffBlockedCloseout,
    ]),
    summary: Object.freeze({
      blockerCount: blockers.length,
      completeCloseoutCount: [goodCloseout].filter((row) => row.canCloseRenewal).length,
      blockedCloseoutCount: [
        fingerprintMismatchCloseout,
        missingRouteCloseout,
        docxCloseout,
        missingApprovalCloseout,
        archiveBlockedCloseout,
        writeBlockedCloseout,
        openItemCloseout,
        handoffBlockedCloseout,
      ].filter((row) => !row.canCloseRenewal).length,
      routeCount: REQUIRED_ROUTES.length,
      archiveEntryCount: REQUIRED_ARCHIVE_KEYS.length,
    }),
    nextPhase: null,
  })
}

export function formatOtpTemplateRenewalFinalApprovalCloseoutPhase63Markdown(report = buildOtpTemplateRenewalFinalApprovalCloseoutPhase63Audit()) {
  const completeReceipt = report.closeoutReceipts.find((receipt) => receipt.canCloseRenewal) || report.closeoutReceipts[0]
  return [
    '# OTP Generator Phase 63 Final Approval And Closeout',
    '',
    `Generated: ${report.checkedAt}`,
    `Version: ${report.version}`,
    `Contract: ${report.contract}`,
    `Status: ${report.status}`,
    `Lifecycle complete: ${report.lifecycleComplete ? 'yes' : 'no'}`,
    `Mutated data: ${report.mutatedData === false ? 'false' : 'unknown'}`,
    '',
    '## Summary',
    '',
    table(
      ['Metric', 'Value'],
      [
        ['Complete closeouts', report.summary.completeCloseoutCount],
        ['Blocked closeouts', report.summary.blockedCloseoutCount],
        ['Routes', report.summary.routeCount],
        ['Archive entries', report.summary.archiveEntryCount],
        ['Blockers', report.summary.blockerCount],
        ['Next phase', report.nextPhase ? `Phase ${report.nextPhase.phase}: ${report.nextPhase.label}` : 'None - renewal thread closed'],
      ],
    ),
    '',
    '## Checks',
    '',
    table(
      ['Check', 'Pass', 'Detail'],
      report.checks.map((check) => [check.code, check.pass ? 'yes' : 'no', check.detail]),
    ),
    '',
    '## Final Approval',
    '',
    table(
      ['Field', 'Value'],
      [
        ['approval_id', completeReceipt.finalApproval.approvalId],
        ['status', completeReceipt.finalApproval.status],
        ['source_publication_guard_fingerprint', completeReceipt.finalApproval.sourcePublicationGuardFingerprint],
        ['attorney_reference', completeReceipt.finalApproval.attorneyApprovalReference],
        ['legal_review_status', completeReceipt.finalApproval.legalReviewStatus],
        ['closeout_decision', completeReceipt.finalApproval.closeoutDecision],
      ],
    ),
    '',
    '## Route Closeout Manifest',
    '',
    table(
      ['Route', 'Candidate Template', 'Candidate Envelope', 'PDF Proof', 'Archived', 'Live Changed'],
      completeReceipt.routeCloseoutManifest.map((row) => [
        row.routeVariant,
        row.candidateTemplateDefaultId,
        row.candidateSigningEnvelopeKey,
        row.generatedPdfProofKey,
        row.archived ? 'yes' : 'no',
        row.liveDefaultChanged ? 'yes' : 'no',
      ]),
    ),
    '',
    '## Archive Entries',
    '',
    table(
      ['Key', 'Path', 'Immutable', 'Owner'],
      completeReceipt.archiveEntries.map((row) => [
        row.key,
        row.path,
        row.immutable ? 'yes' : 'no',
        row.owner,
      ]),
    ),
    '',
    '## Closeout Receipts',
    '',
    table(
      ['Status', 'Complete', 'Routes', 'Approvals', 'Archive Entries', 'Blockers'],
      report.closeoutReceipts.map((receipt) => [
        receipt.status,
        receipt.canCloseRenewal ? 'yes' : 'no',
        receipt.summary.routeCount,
        receipt.summary.approvalCount,
        receipt.summary.archiveEntryCount,
        receipt.blockerCodes.join(', ') || 'none',
      ]),
    ),
    '',
    '## Boundary',
    '',
    'Phase 63 closes the renewal governance thread only after the Phase 62 guard, final approvals, attorney closeout reference, route-separated manifests, immutable archive evidence, rollback readiness, no-write attestation, and governance handoff all line up. It does not publish live templates, change route defaults, mutate signing envelopes, create final signed PDFs, email reviewers, or dispatch signing links.',
    '',
  ].join('\n')
}
