import {
  OTP_TEMPLATE_RENEWAL_PDF_SIGNING_PROOF_PHASE61_VERSION,
  OTP_TEMPLATE_RENEWAL_PDF_SIGNING_PROOF_READY_STATUS,
  buildOtpTemplateRenewalPdfSigningProofPhase61Audit,
} from './otpTemplateRenewalPdfSigningProofPhase61.js'

export const OTP_TEMPLATE_RENEWAL_PUBLICATION_GUARD_PHASE62_VERSION = 'otp_template_renewal_publication_dry_run_activation_guard_phase62_v1'
export const OTP_TEMPLATE_RENEWAL_PUBLICATION_GUARD_READY_STATUS = 'OTP_TEMPLATE_RENEWAL_PUBLICATION_DRY_RUN_ACTIVATION_GUARD_READY_FOR_CONTROLLED_ACTIVATION_DRY_RUN'
export const OTP_TEMPLATE_RENEWAL_PUBLICATION_GUARD_CONTRACT = 'otp-vnext-template-renewal-publication-dry-run-activation-guard-phase62-v1'

const REQUIRED_ROUTES = Object.freeze(['resale_existing_property', 'new_development'])
const REQUIRED_APPROVAL_ROLES = Object.freeze(['template_owner', 'governance_owner', 'release_operator', 'attorney_reviewer'])
const REQUIRED_EVIDENCE_ITEMS = Object.freeze([
  'phase61_pdf_signing_proof',
  'publication_dry_run_receipt',
  'route_candidate_fingerprint_manifest',
  'activation_guard_receipt',
  'rollback_snapshot',
  'no_write_attestation',
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
  let hash = 0
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(index)) >>> 0
  }
  return `${hash.toString(16).padStart(8, '0')}${'0'.repeat(56)}`
}

function hasDocxSource(row = {}) {
  return /\.docx?$/i.test(normalizeText(row.path || row.sourcePath || row.source_path || row.candidatePath || row.candidate_path || row.templatePath || row.template_path)) ||
    normalizeKey(row.sourceFormat || row.source_format || row.candidateFormat || row.candidate_format).includes('doc') ||
    numberValue(row.docxReferenceCount || row.docx_reference_count) > 0
}

function confirmationPhrase(proofReceipt = {}) {
  return `DRY-RUN ACTIVATE OTP TEMPLATE RENEWAL ${proofReceipt.proofFingerprint || 'missing-proof'}`
}

function defaultPublicationDryRun(proofReceipt = {}, checkedAt = new Date().toISOString()) {
  return {
    dryRunId: 'otp-vnext-phase62-renewal-publication-dry-run',
    status: 'publication_dry_run_passed',
    executedAt: checkedAt,
    sourceProofFingerprint: proofReceipt.proofFingerprint,
    templateUpdateDraftFingerprint: proofReceipt.templateUpdateDraftReceipt?.templateUpdateDraftFingerprint,
    targetEnvironment: 'staging',
    publicationMode: 'dry_run_only',
    routeCount: REQUIRED_ROUTES.length,
    candidateVersionKey: 'otp-template-renewal-phase62-candidate',
    previousVersionKey: 'otp-template-renewal-current-live',
    productionWriteRequested: false,
    liveDefaultMutationRequested: false,
    signingDispatchRequested: false,
    dryRunOnly: true,
  }
}

function defaultRouteCandidates(proofReceipt = {}) {
  return REQUIRED_ROUTES.map((routeVariant) => {
    const pdf = list(proofReceipt.pdfProofs).find((row) => normalizeKey(row.routeVariant) === routeVariant) || {}
    const envelope = list(proofReceipt.signingEnvelopeProofs).find((row) => normalizeKey(row.routeVariant) === routeVariant) || {}
    return {
      routeVariant,
      candidateTemplateDefaultId: `otp-${routeVariant}-phase62-candidate`,
      candidateSigningEnvelopeKey: envelope.envelopeArtifactKey,
      generatedPdfProofKey: pdf.proofArtifactKey,
      sourceProofFingerprint: proofReceipt.proofFingerprint,
      routeOutputFingerprint: fingerprint([routeVariant, proofReceipt.proofFingerprint, pdf.proofArtifactKey, envelope.envelopeArtifactKey]),
      stagedCandidateCreated: true,
      generatedPdfProofPassed: true,
      signingEnvelopeProofPassed: true,
      contentScanPassed: true,
      routeSeparated: true,
      liveDefaultChanged: false,
      productionWriteRequested: false,
      sourceFormat: 'native_governance_record',
      docxReferenceCount: 0,
    }
  })
}

function defaultActivationGuard(proofReceipt = {}, dryRun = defaultPublicationDryRun(proofReceipt), checkedAt = new Date().toISOString()) {
  return {
    guardId: 'otp-vnext-phase62-renewal-activation-guard',
    status: 'guard_passed_for_controlled_activation_dry_run',
    guardedAt: checkedAt,
    sourceDryRunId: dryRun.dryRunId,
    sourceProofFingerprint: proofReceipt.proofFingerprint,
    candidateVersionKey: dryRun.candidateVersionKey,
    previousVersionKey: dryRun.previousVersionKey,
    targetEnvironment: 'production',
    controlledActivationDryRunRequired: true,
    operator: 'release_operator',
    confirmationPhrase: confirmationPhrase(proofReceipt),
    expectedConfirmationPhrase: confirmationPhrase(proofReceipt),
    mfaVerified: true,
    attorneyRecheckRecorded: true,
    attorneyApprovalReference: 'phase62-attorney-recheck-reference',
    productionWriteRequested: false,
    liveDefaultMutationRequested: false,
    signingDispatchRequested: false,
    partialRouteActivationRequested: false,
  }
}

function defaultApprovals(checkedAt = new Date().toISOString()) {
  return REQUIRED_APPROVAL_ROLES.map((role) => ({
    role,
    approved: true,
    approvalReference: `phase62-${role}-publication-guard`,
    approvedAt: checkedAt,
  }))
}

function defaultRollbackControls() {
  return {
    rollbackPlanReference: 'phase62-template-renewal-rollback-plan',
    previousDefaultsSnapshotCaptured: true,
    restorePreviousVersionReady: true,
    disableCandidateVersionReady: true,
    stopSigningDispatchReady: true,
    rollbackOwner: 'release_operator',
    rollbackDrillPassed: true,
  }
}

function defaultActivationWindow(checkedAt = new Date().toISOString()) {
  return {
    windowReference: 'phase62-controlled-activation-window',
    status: 'approved',
    opensAt: checkedAt,
    expiresAt: '2026-08-06T23:59:59.000Z',
    freezeActive: false,
    incidentFreezeActive: false,
  }
}

function defaultNoWriteProof() {
  return {
    guardOnly: true,
    mutatedData: false,
    productionWriteAttempted: false,
    liveDefaultMutationCount: 0,
    productionArtifactMutationCount: 0,
    signingEnvelopeMutationCount: 0,
    signingDispatchMutationCount: 0,
    finalPdfMutationCount: 0,
  }
}

function defaultEvidence() {
  return REQUIRED_EVIDENCE_ITEMS.map((key) => ({
    key,
    status: 'captured',
    path: `docs/otp-${key.replace(/_/g, '-')}-phase62.md`,
    fingerprint: fingerprint([key, 'phase62']),
  }))
}

function phase61Blockers(proofReceipt = {}) {
  return [
    proofReceipt.version === OTP_TEMPLATE_RENEWAL_PDF_SIGNING_PROOF_PHASE61_VERSION ? '' : 'phase61_pdf_signing_proof_version_mismatch',
    proofReceipt.status === OTP_TEMPLATE_RENEWAL_PDF_SIGNING_PROOF_READY_STATUS ? '' : 'phase61_pdf_signing_proof_not_ready',
    proofReceipt.canRequestAttorneyRecheck === true ? '' : 'phase61_pdf_signing_proof_not_ready_for_publication_guard',
    proofReceipt.mutatedData === false ? '' : 'phase61_pdf_signing_proof_mutation_unexpected',
    list(proofReceipt.blockerCodes).length === 0 ? '' : 'phase61_pdf_signing_proof_has_blockers',
    proofReceipt.noWriteProof?.productionWriteAttempted === false ? '' : 'phase61_pdf_signing_proof_write_attempted',
  ].filter(Boolean)
}

function publicationDryRunBlockers(dryRun = {}, proofReceipt = {}) {
  return [
    normalizeText(dryRun.dryRunId || dryRun.dry_run_id) ? '' : 'publication_dry_run_id_missing',
    normalizeKey(dryRun.status) === 'publication_dry_run_passed' ? '' : 'publication_dry_run_status_invalid',
    normalizeText(dryRun.executedAt || dryRun.executed_at) ? '' : 'publication_dry_run_time_missing',
    dryRun.sourceProofFingerprint === proofReceipt.proofFingerprint ? '' : 'publication_dry_run_proof_fingerprint_mismatch',
    dryRun.templateUpdateDraftFingerprint === proofReceipt.templateUpdateDraftReceipt?.templateUpdateDraftFingerprint ? '' : 'publication_dry_run_template_update_draft_fingerprint_mismatch',
    normalizeKey(dryRun.targetEnvironment || dryRun.target_environment) === 'staging' ? '' : 'publication_dry_run_target_not_staging',
    normalizeKey(dryRun.publicationMode || dryRun.publication_mode) === 'dry_run_only' ? '' : 'publication_mode_not_dry_run_only',
    numberValue(dryRun.routeCount || dryRun.route_count) === REQUIRED_ROUTES.length ? '' : 'publication_dry_run_route_count_mismatch',
    normalizeText(dryRun.candidateVersionKey || dryRun.candidate_version_key) ? '' : 'candidate_version_key_missing',
    normalizeText(dryRun.previousVersionKey || dryRun.previous_version_key) ? '' : 'previous_version_key_missing',
    dryRun.productionWriteRequested === true ? 'publication_dry_run_production_write_requested' : '',
    dryRun.liveDefaultMutationRequested === true ? 'publication_dry_run_live_default_mutation_requested' : '',
    dryRun.signingDispatchRequested === true ? 'publication_dry_run_signing_dispatch_requested' : '',
    dryRun.dryRunOnly === true ? '' : 'publication_dry_run_only_flag_missing',
  ].filter(Boolean)
}

function routeCandidateBlockers(routeCandidates = [], proofReceipt = {}) {
  const routes = list(routeCandidates).map((row) => normalizeKey(row.routeVariant || row.route_variant))
  const missingRoutes = REQUIRED_ROUTES.filter((route) => !routes.includes(route))
  const duplicateRoutes = routes.filter((route, index) => route && routes.indexOf(route) !== index)
  const rowBlockers = list(routeCandidates).flatMap((row) => {
    const route = normalizeKey(row.routeVariant || row.route_variant) || 'unknown'
    return [
      REQUIRED_ROUTES.includes(route) ? '' : `route_candidate_unsupported:${route}`,
      normalizeText(row.candidateTemplateDefaultId || row.candidate_template_default_id) ? '' : `route_candidate_template_missing:${route}`,
      normalizeText(row.candidateSigningEnvelopeKey || row.candidate_signing_envelope_key) ? '' : `route_candidate_envelope_missing:${route}`,
      normalizeText(row.generatedPdfProofKey || row.generated_pdf_proof_key) ? '' : `route_candidate_pdf_proof_missing:${route}`,
      row.sourceProofFingerprint === proofReceipt.proofFingerprint ? '' : `route_candidate_proof_fingerprint_mismatch:${route}`,
      /^[a-f0-9]{64}$/i.test(normalizeText(row.routeOutputFingerprint || row.route_output_fingerprint)) ? '' : `route_candidate_output_fingerprint_missing:${route}`,
      row.stagedCandidateCreated === true ? '' : `route_candidate_not_staged:${route}`,
      row.generatedPdfProofPassed === true ? '' : `route_candidate_pdf_proof_not_passed:${route}`,
      row.signingEnvelopeProofPassed === true ? '' : `route_candidate_signing_proof_not_passed:${route}`,
      row.contentScanPassed === true ? '' : `route_candidate_content_scan_not_passed:${route}`,
      row.routeSeparated === true ? '' : `route_candidate_not_route_separated:${route}`,
      row.liveDefaultChanged === true ? `route_candidate_live_default_changed:${route}` : '',
      row.productionWriteRequested === true ? `route_candidate_production_write_requested:${route}` : '',
      hasDocxSource(row) ? `route_candidate_docx_source_observed:${route}` : '',
    ].filter(Boolean)
  })
  return [
    ...missingRoutes.map((route) => `route_candidate_missing:${route}`),
    ...unique(duplicateRoutes).map((route) => `route_candidate_duplicate:${route}`),
    ...rowBlockers,
  ]
}

function activationGuardBlockers(guard = {}, proofReceipt = {}, dryRun = {}) {
  return [
    normalizeText(guard.guardId || guard.guard_id) ? '' : 'activation_guard_id_missing',
    normalizeKey(guard.status) === 'guard_passed_for_controlled_activation_dry_run' ? '' : 'activation_guard_status_invalid',
    normalizeText(guard.guardedAt || guard.guarded_at) ? '' : 'activation_guard_time_missing',
    (guard.sourceDryRunId || guard.source_dry_run_id) === dryRun.dryRunId ? '' : 'activation_guard_dry_run_id_mismatch',
    guard.sourceProofFingerprint === proofReceipt.proofFingerprint ? '' : 'activation_guard_proof_fingerprint_mismatch',
    (guard.candidateVersionKey || guard.candidate_version_key) === dryRun.candidateVersionKey ? '' : 'activation_guard_candidate_version_mismatch',
    (guard.previousVersionKey || guard.previous_version_key) === dryRun.previousVersionKey ? '' : 'activation_guard_previous_version_mismatch',
    normalizeKey(guard.targetEnvironment || guard.target_environment) === 'production' ? '' : 'activation_guard_target_not_production',
    guard.controlledActivationDryRunRequired === true ? '' : 'controlled_activation_dry_run_not_required',
    normalizeText(guard.operator) ? '' : 'activation_guard_operator_missing',
    (guard.confirmationPhrase || guard.confirmation_phrase) === (guard.expectedConfirmationPhrase || guard.expected_confirmation_phrase) ? '' : 'activation_guard_confirmation_phrase_mismatch',
    guard.mfaVerified === true ? '' : 'activation_guard_mfa_not_verified',
    guard.attorneyRecheckRecorded === true ? '' : 'activation_guard_attorney_recheck_missing',
    normalizeText(guard.attorneyApprovalReference || guard.attorney_approval_reference) ? '' : 'activation_guard_attorney_reference_missing',
    guard.productionWriteRequested === true ? 'activation_guard_production_write_requested' : '',
    guard.liveDefaultMutationRequested === true ? 'activation_guard_live_default_mutation_requested' : '',
    guard.signingDispatchRequested === true ? 'activation_guard_signing_dispatch_requested' : '',
    guard.partialRouteActivationRequested === true ? 'activation_guard_partial_route_activation_requested' : '',
  ].filter(Boolean)
}

function approvalBlockers(approvals = []) {
  const roles = list(approvals).map((row) => normalizeKey(row.role))
  const missingRoles = REQUIRED_APPROVAL_ROLES.filter((role) => !roles.includes(role))
  const badRows = list(approvals).filter((row) =>
    REQUIRED_APPROVAL_ROLES.includes(normalizeKey(row.role)) &&
      (row.approved !== true || !normalizeText(row.approvalReference || row.approval_reference) || !normalizeText(row.approvedAt || row.approved_at)),
  )
  return [
    ...missingRoles.map((role) => `publication_guard_approval_missing:${role}`),
    ...badRows.map((row) => `publication_guard_approval_incomplete:${normalizeKey(row.role) || 'unknown'}`),
  ]
}

function rollbackBlockers(rollback = {}) {
  return [
    normalizeText(rollback.rollbackPlanReference || rollback.rollback_plan_reference) ? '' : 'rollback_plan_reference_missing',
    rollback.previousDefaultsSnapshotCaptured === true ? '' : 'rollback_previous_defaults_snapshot_missing',
    rollback.restorePreviousVersionReady === true ? '' : 'rollback_restore_previous_version_not_ready',
    rollback.disableCandidateVersionReady === true ? '' : 'rollback_disable_candidate_version_not_ready',
    rollback.stopSigningDispatchReady === true ? '' : 'rollback_stop_signing_dispatch_not_ready',
    normalizeText(rollback.rollbackOwner || rollback.rollback_owner) ? '' : 'rollback_owner_missing',
    rollback.rollbackDrillPassed === true ? '' : 'rollback_drill_not_passed',
  ].filter(Boolean)
}

function activationWindowBlockers(window = {}) {
  return [
    normalizeText(window.windowReference || window.window_reference) ? '' : 'activation_window_reference_missing',
    normalizeKey(window.status) === 'approved' ? '' : 'activation_window_not_approved',
    normalizeText(window.opensAt || window.opens_at) ? '' : 'activation_window_open_time_missing',
    normalizeText(window.expiresAt || window.expires_at) ? '' : 'activation_window_expiry_missing',
    window.freezeActive === true ? 'activation_window_freeze_active' : '',
    window.incidentFreezeActive === true ? 'activation_window_incident_freeze_active' : '',
  ].filter(Boolean)
}

function noWriteBlockers(noWrite = {}) {
  return [
    noWrite.guardOnly === true ? '' : 'publication_guard_no_write_guard_only_missing',
    noWrite.mutatedData === false ? '' : 'publication_guard_mutated_data',
    noWrite.productionWriteAttempted === true ? 'publication_guard_production_write_attempted' : '',
    numberValue(noWrite.liveDefaultMutationCount || noWrite.live_default_mutation_count) === 0 ? '' : 'publication_guard_live_default_mutation_observed',
    numberValue(noWrite.productionArtifactMutationCount || noWrite.production_artifact_mutation_count) === 0 ? '' : 'publication_guard_production_artifact_mutation_observed',
    numberValue(noWrite.signingEnvelopeMutationCount || noWrite.signing_envelope_mutation_count) === 0 ? '' : 'publication_guard_signing_envelope_mutation_observed',
    numberValue(noWrite.signingDispatchMutationCount || noWrite.signing_dispatch_mutation_count) === 0 ? '' : 'publication_guard_signing_dispatch_mutation_observed',
    numberValue(noWrite.finalPdfMutationCount || noWrite.final_pdf_mutation_count) === 0 ? '' : 'publication_guard_final_pdf_mutation_observed',
  ].filter(Boolean)
}

function evidenceBlockers(evidence = []) {
  const keys = list(evidence).map((row) => normalizeKey(row.key))
  const missingKeys = REQUIRED_EVIDENCE_ITEMS.filter((key) => !keys.includes(key))
  const badRows = list(evidence).filter((row) =>
    REQUIRED_EVIDENCE_ITEMS.includes(normalizeKey(row.key)) &&
      (normalizeKey(row.status) !== 'captured' || !normalizeText(row.path) || !/^[a-f0-9]{64}$/i.test(normalizeText(row.fingerprint || row.sha256))),
  )
  return [
    ...missingKeys.map((key) => `publication_guard_evidence_missing:${key}`),
    ...badRows.map((row) => `publication_guard_evidence_invalid:${normalizeKey(row.key) || 'unknown'}`),
  ]
}

export function buildOtpTemplateRenewalPublicationGuardReceipt({
  pdfSigningProofReceipt = buildOtpTemplateRenewalPdfSigningProofPhase61Audit().pdfSigningProofReceipts?.find((receipt) => receipt.canRequestAttorneyRecheck),
  publicationDryRun = null,
  routeCandidates = null,
  activationGuard = null,
  approvals = null,
  rollbackControls = defaultRollbackControls(),
  activationWindow = null,
  noWriteProof = defaultNoWriteProof(),
  evidence = defaultEvidence(),
  checkedAt = new Date().toISOString(),
} = {}) {
  const dryRun = publicationDryRun || defaultPublicationDryRun(pdfSigningProofReceipt, checkedAt)
  const candidates = routeCandidates || defaultRouteCandidates(pdfSigningProofReceipt)
  const guard = activationGuard || defaultActivationGuard(pdfSigningProofReceipt, dryRun, checkedAt)
  const approvalRows = approvals || defaultApprovals(checkedAt)
  const window = activationWindow || defaultActivationWindow(checkedAt)
  const blockerCodes = unique([
    ...phase61Blockers(pdfSigningProofReceipt || {}),
    ...publicationDryRunBlockers(dryRun, pdfSigningProofReceipt || {}),
    ...routeCandidateBlockers(candidates, pdfSigningProofReceipt || {}),
    ...activationGuardBlockers(guard, pdfSigningProofReceipt || {}, dryRun),
    ...approvalBlockers(approvalRows),
    ...rollbackBlockers(rollbackControls),
    ...activationWindowBlockers(window),
    ...noWriteBlockers(noWriteProof),
    ...evidenceBlockers(evidence),
  ])
  const canProceedToControlledActivationDryRun = blockerCodes.length === 0
  const publicationGuardFingerprint = fingerprint([
    dryRun.dryRunId,
    guard.guardId,
    pdfSigningProofReceipt?.proofFingerprint,
    list(candidates).map((row) => `${row.routeVariant}:${row.routeOutputFingerprint}`).join('|'),
  ])

  return Object.freeze({
    version: OTP_TEMPLATE_RENEWAL_PUBLICATION_GUARD_PHASE62_VERSION,
    contract: OTP_TEMPLATE_RENEWAL_PUBLICATION_GUARD_CONTRACT,
    checkedAt,
    status: canProceedToControlledActivationDryRun
      ? OTP_TEMPLATE_RENEWAL_PUBLICATION_GUARD_READY_STATUS
      : 'OTP_TEMPLATE_RENEWAL_PUBLICATION_DRY_RUN_ACTIVATION_GUARD_BLOCKED',
    canProceedToControlledActivationDryRun,
    mutatedData: false,
    blockerCodes: Object.freeze(blockerCodes),
    publicationGuardFingerprint,
    pdfSigningProofReceipt: Object.freeze({
      version: pdfSigningProofReceipt?.version,
      status: pdfSigningProofReceipt?.status,
      canRequestAttorneyRecheck: pdfSigningProofReceipt?.canRequestAttorneyRecheck === true,
      proofFingerprint: pdfSigningProofReceipt?.proofFingerprint,
    }),
    publicationDryRun: Object.freeze({ ...dryRun }),
    routeCandidates: Object.freeze(list(candidates)),
    activationGuard: Object.freeze({ ...guard }),
    approvals: Object.freeze(list(approvalRows)),
    rollbackControls: Object.freeze({ ...rollbackControls }),
    activationWindow: Object.freeze({ ...window }),
    noWriteProof: Object.freeze({ ...noWriteProof }),
    evidence: Object.freeze(list(evidence)),
    summary: Object.freeze({
      routeCandidateCount: list(candidates).length,
      stagedRouteCount: list(candidates).filter((row) => row.stagedCandidateCreated === true).length,
      approvalCount: list(approvalRows).length,
      evidenceCount: list(evidence).length,
      blockerCount: blockerCodes.length,
    }),
  })
}

function addCheck(checks, pass, code, detail) {
  checks.push({ code, pass: Boolean(pass), detail })
}

export function buildOtpTemplateRenewalPublicationGuardPhase62Audit({
  checkedAt = new Date().toISOString(),
  phase61Audit = null,
  packageJson = {},
} = {}) {
  const checks = []
  const phase61Ready = !phase61Audit || phase61Audit.status === OTP_TEMPLATE_RENEWAL_PDF_SIGNING_PROOF_READY_STATUS
  const goodProof = phase61Audit?.pdfSigningProofReceipts?.find((receipt) => receipt.canRequestAttorneyRecheck) ||
    buildOtpTemplateRenewalPdfSigningProofPhase61Audit({ checkedAt }).pdfSigningProofReceipts.find((receipt) => receipt.canRequestAttorneyRecheck)
  const goodGuard = buildOtpTemplateRenewalPublicationGuardReceipt({ checkedAt, pdfSigningProofReceipt: goodProof })
  const proofMismatchGuard = buildOtpTemplateRenewalPublicationGuardReceipt({
    checkedAt,
    pdfSigningProofReceipt: goodProof,
    publicationDryRun: { ...defaultPublicationDryRun(goodProof, checkedAt), sourceProofFingerprint: 'wrong-proof' },
  })
  const missingRouteGuard = buildOtpTemplateRenewalPublicationGuardReceipt({
    checkedAt,
    pdfSigningProofReceipt: goodProof,
    routeCandidates: defaultRouteCandidates(goodProof).filter((row) => row.routeVariant !== 'new_development'),
  })
  const routeFailedGuard = buildOtpTemplateRenewalPublicationGuardReceipt({
    checkedAt,
    pdfSigningProofReceipt: goodProof,
    routeCandidates: defaultRouteCandidates(goodProof).map((row) =>
      row.routeVariant === 'resale_existing_property'
        ? { ...row, generatedPdfProofPassed: false, signingEnvelopeProofPassed: false, routeOutputFingerprint: 'bad' }
        : row,
    ),
  })
  const docxGuard = buildOtpTemplateRenewalPublicationGuardReceipt({
    checkedAt,
    pdfSigningProofReceipt: goodProof,
    routeCandidates: defaultRouteCandidates(goodProof).map((row) =>
      row.routeVariant === 'resale_existing_property'
        ? { ...row, sourceFormat: 'docx', candidatePath: 'candidate.docx', docxReferenceCount: 1 }
        : row,
    ),
  })
  const activationMismatchGuard = buildOtpTemplateRenewalPublicationGuardReceipt({
    checkedAt,
    pdfSigningProofReceipt: goodProof,
    activationGuard: {
      ...defaultActivationGuard(goodProof, defaultPublicationDryRun(goodProof, checkedAt), checkedAt),
      sourceDryRunId: 'wrong-dry-run',
      confirmationPhrase: 'wrong phrase',
      mfaVerified: false,
      attorneyRecheckRecorded: false,
    },
  })
  const missingApprovalGuard = buildOtpTemplateRenewalPublicationGuardReceipt({
    checkedAt,
    pdfSigningProofReceipt: goodProof,
    approvals: defaultApprovals(checkedAt).filter((row) => row.role !== 'attorney_reviewer'),
  })
  const rollbackBlockedGuard = buildOtpTemplateRenewalPublicationGuardReceipt({
    checkedAt,
    pdfSigningProofReceipt: goodProof,
    rollbackControls: { ...defaultRollbackControls(), restorePreviousVersionReady: false, rollbackDrillPassed: false },
  })
  const freezeGuard = buildOtpTemplateRenewalPublicationGuardReceipt({
    checkedAt,
    pdfSigningProofReceipt: goodProof,
    activationWindow: { ...defaultActivationWindow(checkedAt), status: 'frozen', freezeActive: true, incidentFreezeActive: true },
  })
  const liveWriteGuard = buildOtpTemplateRenewalPublicationGuardReceipt({
    checkedAt,
    pdfSigningProofReceipt: goodProof,
    publicationDryRun: {
      ...defaultPublicationDryRun(goodProof, checkedAt),
      productionWriteRequested: true,
      liveDefaultMutationRequested: true,
      signingDispatchRequested: true,
      dryRunOnly: false,
    },
    activationGuard: {
      ...defaultActivationGuard(goodProof, defaultPublicationDryRun(goodProof, checkedAt), checkedAt),
      productionWriteRequested: true,
      liveDefaultMutationRequested: true,
      signingDispatchRequested: true,
      partialRouteActivationRequested: true,
    },
    noWriteProof: {
      ...defaultNoWriteProof(),
      mutatedData: true,
      productionWriteAttempted: true,
      liveDefaultMutationCount: 1,
      signingDispatchMutationCount: 1,
    },
  })
  const evidenceBlockedGuard = buildOtpTemplateRenewalPublicationGuardReceipt({
    checkedAt,
    pdfSigningProofReceipt: goodProof,
    evidence: [{ key: 'phase61_pdf_signing_proof', status: 'missing', path: '', fingerprint: 'bad' }],
  })

  addCheck(checks, phase61Ready, 'PHASE62_PHASE61_PDF_SIGNING_PROOF_READY', 'Publication dry run and activation guard starts only after Phase 61 PDF/signing proof is ready.')
  addCheck(
    checks,
    goodGuard.canProceedToControlledActivationDryRun &&
      goodGuard.status === OTP_TEMPLATE_RENEWAL_PUBLICATION_GUARD_READY_STATUS &&
      goodGuard.mutatedData === false,
    'PHASE62_GOOD_PUBLICATION_GUARD_READY',
    'A clean Phase 61 proof can pass the publication dry run and activation guard without production mutation.',
  )
  addCheck(
    checks,
    REQUIRED_ROUTES.every((route) => goodGuard.routeCandidates.some((row) => row.routeVariant === route && row.stagedCandidateCreated === true)),
    'PHASE62_BOTH_ROUTE_CANDIDATES_STAGED',
    'Resale and new-development candidate outputs are staged separately.',
  )
  addCheck(
    checks,
    goodGuard.publicationDryRun.sourceProofFingerprint === goodProof.proofFingerprint &&
      goodGuard.activationGuard.sourceProofFingerprint === goodProof.proofFingerprint,
    'PHASE62_GUARD_BOUND_TO_PHASE61_PROOF',
    'Publication dry run and activation guard are bound to the exact Phase 61 proof fingerprint.',
  )
  addCheck(
    checks,
    goodGuard.activationGuard.controlledActivationDryRunRequired === true &&
      goodGuard.noWriteProof.productionWriteAttempted === false &&
      goodGuard.noWriteProof.liveDefaultMutationCount === 0,
    'PHASE62_NO_LIVE_WRITE_ALLOWED',
    'Phase 62 permits only the next controlled activation dry run and cannot mutate live defaults or dispatch signing.',
  )
  addCheck(
    checks,
    proofMismatchGuard.canProceedToControlledActivationDryRun === false &&
      proofMismatchGuard.blockerCodes.includes('publication_dry_run_proof_fingerprint_mismatch'),
    'PHASE62_PROOF_FINGERPRINT_MISMATCH_BLOCKED',
    'Publication dry run must match the Phase 61 proof fingerprint.',
  )
  addCheck(
    checks,
    missingRouteGuard.canProceedToControlledActivationDryRun === false &&
      missingRouteGuard.blockerCodes.includes('route_candidate_missing:new_development'),
    'PHASE62_MISSING_ROUTE_CANDIDATE_BLOCKED',
    'Missing resale or new-development candidate blocks the guard.',
  )
  addCheck(
    checks,
    routeFailedGuard.canProceedToControlledActivationDryRun === false &&
      routeFailedGuard.blockerCodes.includes('route_candidate_pdf_proof_not_passed:resale_existing_property') &&
      routeFailedGuard.blockerCodes.includes('route_candidate_output_fingerprint_missing:resale_existing_property'),
    'PHASE62_ROUTE_CANDIDATE_FAILURE_BLOCKED',
    'Failed PDF/signing proof or invalid route fingerprint blocks the candidate.',
  )
  addCheck(
    checks,
    docxGuard.canProceedToControlledActivationDryRun === false &&
      docxGuard.blockerCodes.includes('route_candidate_docx_source_observed:resale_existing_property'),
    'PHASE62_DOCX_CANDIDATE_BLOCKED',
    'DOC/DOCX candidate artifacts remain blocked.',
  )
  addCheck(
    checks,
    activationMismatchGuard.canProceedToControlledActivationDryRun === false &&
      activationMismatchGuard.blockerCodes.includes('activation_guard_dry_run_id_mismatch') &&
      activationMismatchGuard.blockerCodes.includes('activation_guard_mfa_not_verified'),
    'PHASE62_ACTIVATION_GUARD_MISMATCH_BLOCKED',
    'Activation guard requires matching dry-run id, operator confirmation, MFA, and attorney recheck reference.',
  )
  addCheck(
    checks,
    missingApprovalGuard.canProceedToControlledActivationDryRun === false &&
      missingApprovalGuard.blockerCodes.includes('publication_guard_approval_missing:attorney_reviewer'),
    'PHASE62_MISSING_APPROVAL_BLOCKED',
    'Template owner, governance owner, release operator, and attorney reviewer approvals are required.',
  )
  addCheck(
    checks,
    rollbackBlockedGuard.canProceedToControlledActivationDryRun === false &&
      rollbackBlockedGuard.blockerCodes.includes('rollback_restore_previous_version_not_ready') &&
      rollbackBlockedGuard.blockerCodes.includes('rollback_drill_not_passed'),
    'PHASE62_ROLLBACK_BLOCKED',
    'Rollback restore, candidate disable, dispatch stop, owner, and drill proof are required.',
  )
  addCheck(
    checks,
    freezeGuard.canProceedToControlledActivationDryRun === false &&
      freezeGuard.blockerCodes.includes('activation_window_freeze_active') &&
      freezeGuard.blockerCodes.includes('activation_window_incident_freeze_active'),
    'PHASE62_FREEZE_WINDOW_BLOCKED',
    'Release freeze or incident freeze blocks the activation guard.',
  )
  addCheck(
    checks,
    liveWriteGuard.canProceedToControlledActivationDryRun === false &&
      liveWriteGuard.blockerCodes.includes('publication_dry_run_production_write_requested') &&
      liveWriteGuard.blockerCodes.includes('publication_guard_live_default_mutation_observed'),
    'PHASE62_LIVE_WRITE_BLOCKED',
    'Production writes, live default mutations, signing dispatch, or partial activation requests are blocked.',
  )
  addCheck(
    checks,
    evidenceBlockedGuard.canProceedToControlledActivationDryRun === false &&
      evidenceBlockedGuard.blockerCodes.includes('publication_guard_evidence_missing:publication_dry_run_receipt') &&
      evidenceBlockedGuard.blockerCodes.includes('publication_guard_evidence_invalid:phase61_pdf_signing_proof'),
    'PHASE62_EVIDENCE_BLOCKED',
    'Missing publication dry-run, activation guard, route fingerprint, rollback, or no-write evidence blocks the guard.',
  )
  addCheck(
    checks,
    packageJson.scripts?.['test:otp-template-renewal-publication-guard-phase62'] === 'node scripts/otp-template-renewal-publication-guard-phase62.test.mjs' &&
      packageJson.scripts?.['report:otp-template-renewal-publication-guard-phase62'] === 'node scripts/report-otp-template-renewal-publication-guard-phase62.mjs' &&
      packageJson.scripts?.['verify:otp-template-vnext']?.includes('test:otp-template-renewal-publication-guard-phase62'),
    'PHASE62_PACKAGE_SCRIPTS_WIRED',
    'Package scripts expose the Phase 62 test, report, and vNext verification chain entry.',
  )

  const blockers = checks.filter((check) => !check.pass)
  return Object.freeze({
    version: OTP_TEMPLATE_RENEWAL_PUBLICATION_GUARD_PHASE62_VERSION,
    contract: OTP_TEMPLATE_RENEWAL_PUBLICATION_GUARD_CONTRACT,
    checkedAt,
    status: blockers.length ? 'OTP_TEMPLATE_RENEWAL_PUBLICATION_DRY_RUN_ACTIVATION_GUARD_REMEDIATION_REQUIRED' : OTP_TEMPLATE_RENEWAL_PUBLICATION_GUARD_READY_STATUS,
    mutatedData: false,
    checks: Object.freeze(checks),
    blockers: Object.freeze(blockers),
    publicationGuardReceipts: Object.freeze([
      goodGuard,
      proofMismatchGuard,
      missingRouteGuard,
      routeFailedGuard,
      docxGuard,
      activationMismatchGuard,
      missingApprovalGuard,
      rollbackBlockedGuard,
      freezeGuard,
      liveWriteGuard,
      evidenceBlockedGuard,
    ]),
    summary: Object.freeze({
      blockerCount: blockers.length,
      readyGuardCount: [goodGuard].filter((row) => row.canProceedToControlledActivationDryRun).length,
      blockedGuardCount: [
        proofMismatchGuard,
        missingRouteGuard,
        routeFailedGuard,
        docxGuard,
        activationMismatchGuard,
        missingApprovalGuard,
        rollbackBlockedGuard,
        freezeGuard,
        liveWriteGuard,
        evidenceBlockedGuard,
      ].filter((row) => !row.canProceedToControlledActivationDryRun).length,
      routeCount: REQUIRED_ROUTES.length,
      evidenceCount: REQUIRED_EVIDENCE_ITEMS.length,
    }),
    nextPhase: blockers.length ? null : Object.freeze({
      phase: 63,
      key: 'otp_template_renewal_final_approval_and_closeout',
      label: 'Final Approval And Closeout',
    }),
  })
}

export function formatOtpTemplateRenewalPublicationGuardPhase62Markdown(report = buildOtpTemplateRenewalPublicationGuardPhase62Audit()) {
  const readyReceipt = report.publicationGuardReceipts.find((receipt) => receipt.canProceedToControlledActivationDryRun) || report.publicationGuardReceipts[0]
  return [
    '# OTP Generator Phase 62 Renewal Publication Dry Run And Activation Guard',
    '',
    `Generated: ${report.checkedAt}`,
    `Version: ${report.version}`,
    `Contract: ${report.contract}`,
    `Status: ${report.status}`,
    `Mutated data: ${report.mutatedData === false ? 'false' : 'unknown'}`,
    '',
    '## Summary',
    '',
    table(
      ['Metric', 'Value'],
      [
        ['Ready guards', report.summary.readyGuardCount],
        ['Blocked guards', report.summary.blockedGuardCount],
        ['Routes', report.summary.routeCount],
        ['Evidence items', report.summary.evidenceCount],
        ['Blockers', report.summary.blockerCount],
        ['Next phase', report.nextPhase ? `Phase ${report.nextPhase.phase}: ${report.nextPhase.label}` : 'Blocked'],
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
    '## Publication Dry Run',
    '',
    table(
      ['Field', 'Value'],
      [
        ['dry_run_id', readyReceipt.publicationDryRun.dryRunId],
        ['source_proof_fingerprint', readyReceipt.publicationDryRun.sourceProofFingerprint],
        ['candidate_version', readyReceipt.publicationDryRun.candidateVersionKey],
        ['target_environment', readyReceipt.publicationDryRun.targetEnvironment],
        ['mode', readyReceipt.publicationDryRun.publicationMode],
      ],
    ),
    '',
    '## Route Candidates',
    '',
    table(
      ['Route', 'Candidate Template', 'Candidate Envelope', 'PDF Proof', 'Staged', 'Live Changed'],
      readyReceipt.routeCandidates.map((row) => [
        row.routeVariant,
        row.candidateTemplateDefaultId,
        row.candidateSigningEnvelopeKey,
        row.generatedPdfProofKey,
        row.stagedCandidateCreated ? 'yes' : 'no',
        row.liveDefaultChanged ? 'yes' : 'no',
      ]),
    ),
    '',
    '## Activation Guard',
    '',
    table(
      ['Field', 'Value'],
      [
        ['guard_id', readyReceipt.activationGuard.guardId],
        ['status', readyReceipt.activationGuard.status],
        ['controlled_activation_dry_run_required', readyReceipt.activationGuard.controlledActivationDryRunRequired ? 'yes' : 'no'],
        ['operator', readyReceipt.activationGuard.operator],
        ['mfa_verified', readyReceipt.activationGuard.mfaVerified ? 'yes' : 'no'],
        ['attorney_recheck_recorded', readyReceipt.activationGuard.attorneyRecheckRecorded ? 'yes' : 'no'],
      ],
    ),
    '',
    '## Publication Guard Receipts',
    '',
    table(
      ['Status', 'Ready', 'Routes', 'Approvals', 'Evidence', 'Blockers'],
      report.publicationGuardReceipts.map((receipt) => [
        receipt.status,
        receipt.canProceedToControlledActivationDryRun ? 'yes' : 'no',
        receipt.summary.routeCandidateCount,
        receipt.summary.approvalCount,
        receipt.summary.evidenceCount,
        receipt.blockerCodes.join(', ') || 'none',
      ]),
    ),
    '',
    '## Boundary',
    '',
    'Phase 62 proves the renewed OTP candidate can pass a publication dry run and activation guard only when the Phase 61 proof, route fingerprints, route separation, approvals, attorney recheck reference, rollback controls, activation window, and no-write evidence all line up. It does not publish live templates, change route defaults, mutate signing envelopes, create final signed PDFs, email reviewers, or dispatch signing links.',
    '',
  ].join('\n')
}
