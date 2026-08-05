import {
  OTP_VERSION_RENEWAL_PUBLICATION_PHASE46_VERSION,
  OTP_VERSION_RENEWAL_PUBLICATION_READY_STATUS,
  buildOtpVersionRenewalPublicationReceipt,
} from './otpVersionRenewalPublicationPhase46.js'

export const OTP_VERSION_RENEWAL_ACTIVATION_GUARD_PHASE47_VERSION = 'otp_version_renewal_activation_guard_phase47_v1'
export const OTP_VERSION_RENEWAL_ACTIVATION_GUARD_READY_STATUS = 'OTP_VERSION_RENEWAL_ACTIVATION_GUARD_READY_FOR_CONTROLLED_ACTIVATION_DRY_RUN'
export const OTP_VERSION_RENEWAL_ACTIVATION_GUARD_CONTRACT = 'otp-vnext-version-renewal-activation-guard-phase47-v1'

const REQUIRED_ROUTES = Object.freeze(['resale_existing_property', 'new_development'])
const REQUIRED_APPROVAL_ROLES = Object.freeze(['document_owner', 'governance_owner', 'release_operator'])
const REQUIRED_GUARD_EVIDENCE = Object.freeze([
  'phase46_publication_dry_run_receipt',
  'route_candidate_fingerprint_manifest',
  'operator_confirmation',
  'rollback_snapshot',
  'activation_window',
  'no_write_guard',
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

function fingerprint(seed = 'phase47') {
  return `${normalizeKey(seed).replace(/[^a-f0-9]/gi, 'a')}${'0'.repeat(64)}`.slice(0, 64).replace(/[^a-f0-9]/gi, 'a')
}

function hasDocxSource(row = {}) {
  return /\.docx?$/i.test(normalizeText(row.path || row.sourcePath || row.source_path || row.targetLiveTemplateDefaultId || row.target_live_template_default_id || row.candidateTemplateDefaultId || row.candidate_template_default_id)) ||
    normalizeKey(row.sourceFormat || row.source_format).includes('doc') ||
    numberValue(row.docxReferenceCount || row.docx_reference_count) > 0
}

function confirmationPhrase(dryRunReceipt = buildOtpVersionRenewalPublicationReceipt()) {
  return `ACTIVATE ${dryRunReceipt.versionRegistry?.versionKey || 'otp-template-vnext-2026-08-renewal'} FROM ${dryRunReceipt.publicationDryRunPlan?.dryRunId || 'otp-vnext-phase46-version-renewal-dry-run'}`
}

function defaultActivationIntent(dryRunReceipt = buildOtpVersionRenewalPublicationReceipt()) {
  return {
    operationId: 'otp-vnext-phase47-version-renewal-activation-guard',
    operationType: 'activate_staged_template_version',
    sourceDryRunId: dryRunReceipt.publicationDryRunPlan?.dryRunId || 'otp-vnext-phase46-version-renewal-dry-run',
    versionKey: dryRunReceipt.versionRegistry?.versionKey || 'otp-template-vnext-2026-08-renewal',
    previousVersionKey: dryRunReceipt.versionRegistry?.previousVersionKey || 'otp-template-vnext-phase39',
    targetEnvironment: 'production',
    dryRunFirst: true,
    requestedBy: 'release_operator',
    productionWriteRequested: false,
    liveDefaultMutationRequested: false,
    signingDispatchRequested: false,
    allowPartialRouteActivation: false,
  }
}

function defaultRouteActivationTargets(dryRunReceipt = buildOtpVersionRenewalPublicationReceipt()) {
  return REQUIRED_ROUTES.map((routeVariant) => {
    const route = list(dryRunReceipt.routePublications).find((row) => normalizeKey(row.routeVariant || row.route_variant) === routeVariant) || {}
    return {
      routeVariant,
      currentLiveTemplateDefaultId: route.previousTemplateDefaultId || route.previous_template_default_id || `otp-${routeVariant}-previous`,
      targetLiveTemplateDefaultId: route.candidateTemplateDefaultId || route.candidate_template_default_id || `otp-${routeVariant}-candidate`,
      currentSigningEnvelopeKey: route.previousSigningEnvelopeKey || route.previous_signing_envelope_key || `otp-${routeVariant}-envelope`,
      targetSigningEnvelopeKey: route.candidateSigningEnvelopeKey || route.candidate_signing_envelope_key || `otp-${routeVariant}-envelope-candidate`,
      expectedOutputFingerprint: route.outputFingerprint || route.output_fingerprint || fingerprint(`phase46-${routeVariant}`),
      observedOutputFingerprint: route.outputFingerprint || route.output_fingerprint || fingerprint(`phase46-${routeVariant}`),
      routeActivationAllowed: true,
      routeIsolationConfirmed: true,
      sourceFormat: 'native_pdf_template',
    }
  })
}

function defaultOperatorConfirmation(dryRunReceipt = buildOtpVersionRenewalPublicationReceipt(), checkedAt = new Date().toISOString()) {
  return {
    operator: 'release_operator',
    confirmed: true,
    confirmationPhrase: confirmationPhrase(dryRunReceipt),
    expectedConfirmationPhrase: confirmationPhrase(dryRunReceipt),
    confirmedAt: checkedAt,
    approvalReference: 'phase47-release-operator-activation-guard',
    mfaVerified: true,
  }
}

function defaultApprovals(checkedAt = new Date().toISOString()) {
  return REQUIRED_APPROVAL_ROLES.map((role) => ({
    role,
    approved: true,
    approvalReference: `phase47-${role}-activation-guard`,
    approvedAt: checkedAt,
  }))
}

function defaultActivationWindow(checkedAt = new Date().toISOString()) {
  return {
    windowReference: 'phase47-controlled-activation-window',
    status: 'approved',
    opensAt: checkedAt,
    expiresAt: '2026-08-06T23:59:59.000Z',
    freezeActive: false,
    incidentFreezeActive: false,
  }
}

function defaultRollbackControls(dryRunReceipt = buildOtpVersionRenewalPublicationReceipt()) {
  return {
    rollbackPlanReference: dryRunReceipt.rollbackSnapshot?.rollbackPlanReference || 'phase45-template-renewal-rollback-plan',
    previousDefaultsSnapshotReference: dryRunReceipt.rollbackSnapshot?.rehearsalReference || 'phase46-version-renewal-dry-run-rollback-snapshot',
    restorePreviousVersionReady: true,
    disableCandidateVersionReady: true,
    stopSigningDispatchReady: true,
    rollbackOwner: 'release_operator',
    rollbackDrillPassed: true,
  }
}

function defaultNoWriteGuard() {
  return {
    guardMode: 'activation_guard_only',
    auditOnly: true,
    mutatedData: false,
    productionWriteAttempted: false,
    liveDefaultMutationCount: 0,
    productionArtifactMutationCount: 0,
    signingDispatchMutationCount: 0,
    controlledActivationDryRunRequired: true,
  }
}

function defaultEvidence() {
  return REQUIRED_GUARD_EVIDENCE.map((key) => ({
    key,
    status: 'passed',
    path: `docs/otp-version-renewal-${key.replace(/_/g, '-')}-phase47.md`,
    fingerprint: fingerprint(`phase47-${key}`),
  }))
}

function defaultArchiveReceipt() {
  return {
    archiveReference: 'otp-vnext-phase47-activation-guard-archive',
    guardReceiptArchived: true,
    routeFingerprintManifestArchived: true,
    operatorConfirmationArchived: true,
    rollbackEvidenceArchived: true,
    immutable: true,
  }
}

function phase46Blockers(dryRunReceipt = {}) {
  return [
    dryRunReceipt.version === OTP_VERSION_RENEWAL_PUBLICATION_PHASE46_VERSION ? '' : 'phase46_publication_version_mismatch',
    dryRunReceipt.status === OTP_VERSION_RENEWAL_PUBLICATION_READY_STATUS ? '' : 'phase46_publication_not_ready',
    dryRunReceipt.canCompletePublicationDryRun === true ? '' : 'phase46_publication_dry_run_not_complete',
    list(dryRunReceipt.blockerCodes).length === 0 ? '' : 'phase46_publication_has_blockers',
    dryRunReceipt.mutatedData === false ? '' : 'phase46_publication_mutation_unexpected',
    dryRunReceipt.versionRegistry?.publishedToLive === false ? '' : 'phase46_candidate_already_published_live',
    numberValue(dryRunReceipt.mutationProof?.liveDefaultMutationCount) === 0 ? '' : 'phase46_live_default_mutation_observed',
  ].filter(Boolean)
}

function activationIntentBlockers(activationIntent = {}, dryRunReceipt = {}) {
  return [
    normalizeText(activationIntent.operationId || activationIntent.operation_id) ? '' : 'activation_operation_id_missing',
    normalizeKey(activationIntent.operationType || activationIntent.operation_type) === 'activate_staged_template_version' ? '' : 'activation_operation_type_invalid',
    (activationIntent.sourceDryRunId || activationIntent.source_dry_run_id) === dryRunReceipt.publicationDryRunPlan?.dryRunId ? '' : 'activation_source_dry_run_mismatch',
    (activationIntent.versionKey || activationIntent.version_key) === dryRunReceipt.versionRegistry?.versionKey ? '' : 'activation_version_key_mismatch',
    (activationIntent.previousVersionKey || activationIntent.previous_version_key) === dryRunReceipt.versionRegistry?.previousVersionKey ? '' : 'activation_previous_version_key_mismatch',
    normalizeKey(activationIntent.targetEnvironment || activationIntent.target_environment) === 'production' ? '' : 'activation_target_environment_not_production',
    activationIntent.dryRunFirst === true ? '' : 'activation_controlled_dry_run_not_required',
    normalizeText(activationIntent.requestedBy || activationIntent.requested_by) ? '' : 'activation_requester_missing',
    activationIntent.productionWriteRequested === true ? 'activation_production_write_requested' : '',
    activationIntent.liveDefaultMutationRequested === true ? 'activation_live_default_mutation_requested' : '',
    activationIntent.signingDispatchRequested === true ? 'activation_signing_dispatch_requested' : '',
    activationIntent.allowPartialRouteActivation === true ? 'partial_route_activation_requested' : '',
  ].filter(Boolean)
}

function routeTargetBlockers(routeActivationTargets = [], dryRunReceipt = {}) {
  const dryRunRoutes = list(dryRunReceipt.routePublications)
  const routes = list(routeActivationTargets).map((row) => normalizeKey(row.routeVariant || row.route_variant))
  const missingRoutes = REQUIRED_ROUTES.filter((route) => !routes.includes(route))
  const duplicateRoutes = routes.filter((route, index) => route && routes.indexOf(route) !== index)
  const rowBlockers = list(routeActivationTargets).flatMap((row) => {
    const route = normalizeKey(row.routeVariant || row.route_variant) || 'unknown'
    const dryRunRoute = dryRunRoutes.find((candidate) => normalizeKey(candidate.routeVariant || candidate.route_variant) === route) || {}
    const expectedTemplate = dryRunRoute.candidateTemplateDefaultId || dryRunRoute.candidate_template_default_id
    const expectedEnvelope = dryRunRoute.candidateSigningEnvelopeKey || dryRunRoute.candidate_signing_envelope_key
    const expectedFingerprint = dryRunRoute.outputFingerprint || dryRunRoute.output_fingerprint
    return [
      REQUIRED_ROUTES.includes(route) ? '' : `unsupported_route:${route}`,
      row.routeActivationAllowed === true ? '' : `route_activation_not_allowed:${route}`,
      row.routeIsolationConfirmed === true ? '' : `route_isolation_not_confirmed:${route}`,
      normalizeText(row.currentLiveTemplateDefaultId || row.current_live_template_default_id) ? '' : `current_live_template_missing:${route}`,
      normalizeText(row.targetLiveTemplateDefaultId || row.target_live_template_default_id) ? '' : `target_live_template_missing:${route}`,
      expectedTemplate && (row.targetLiveTemplateDefaultId || row.target_live_template_default_id) !== expectedTemplate ? `target_live_template_mismatch:${route}` : '',
      normalizeText(row.currentSigningEnvelopeKey || row.current_signing_envelope_key) ? '' : `current_signing_envelope_missing:${route}`,
      normalizeText(row.targetSigningEnvelopeKey || row.target_signing_envelope_key) ? '' : `target_signing_envelope_missing:${route}`,
      expectedEnvelope && (row.targetSigningEnvelopeKey || row.target_signing_envelope_key) !== expectedEnvelope ? `target_signing_envelope_mismatch:${route}` : '',
      expectedFingerprint && (row.expectedOutputFingerprint || row.expected_output_fingerprint) !== expectedFingerprint ? `expected_route_fingerprint_mismatch:${route}` : '',
      (row.observedOutputFingerprint || row.observed_output_fingerprint) === (row.expectedOutputFingerprint || row.expected_output_fingerprint) ? '' : `observed_route_fingerprint_mismatch:${route}`,
      /^[a-f0-9]{64}$/i.test(normalizeText(row.observedOutputFingerprint || row.observed_output_fingerprint)) ? '' : `observed_route_fingerprint_missing:${route}`,
      hasDocxSource(row) ? `route_activation_docx_source_observed:${route}` : '',
    ].filter(Boolean)
  })
  return [
    ...missingRoutes.map((route) => `route_activation_missing:${route}`),
    ...unique(duplicateRoutes).map((route) => `route_activation_duplicate:${route}`),
    ...rowBlockers,
  ]
}

function operatorConfirmationBlockers(operatorConfirmation = {}, activationIntent = {}, dryRunReceipt = {}) {
  const expectedPhrase = operatorConfirmation.expectedConfirmationPhrase || operatorConfirmation.expected_confirmation_phrase || confirmationPhrase(dryRunReceipt)
  return [
    normalizeText(operatorConfirmation.operator) ? '' : 'operator_missing',
    operatorConfirmation.operator === (activationIntent.requestedBy || activationIntent.requested_by) ? '' : 'operator_requester_mismatch',
    operatorConfirmation.confirmed === true ? '' : 'operator_confirmation_missing',
    normalizeText(operatorConfirmation.confirmationPhrase || operatorConfirmation.confirmation_phrase) ? '' : 'operator_confirmation_phrase_missing',
    (operatorConfirmation.confirmationPhrase || operatorConfirmation.confirmation_phrase) === expectedPhrase ? '' : 'operator_confirmation_phrase_mismatch',
    normalizeText(operatorConfirmation.confirmedAt || operatorConfirmation.confirmed_at) ? '' : 'operator_confirmation_time_missing',
    normalizeText(operatorConfirmation.approvalReference || operatorConfirmation.approval_reference) ? '' : 'operator_approval_reference_missing',
    operatorConfirmation.mfaVerified === true ? '' : 'operator_mfa_not_verified',
  ].filter(Boolean)
}

function approvalBlockers(approvals = []) {
  const roles = list(approvals).map((row) => normalizeKey(row.role))
  const missingRoles = REQUIRED_APPROVAL_ROLES.filter((role) => !roles.includes(role))
  const incompleteRows = list(approvals).filter((row) => {
    const role = normalizeKey(row.role)
    return REQUIRED_APPROVAL_ROLES.includes(role) && (
      row.approved !== true ||
      !normalizeText(row.approvalReference || row.approval_reference) ||
      !normalizeText(row.approvedAt || row.approved_at)
    )
  })
  return [
    ...missingRoles.map((role) => `missing_activation_approval:${role}`),
    ...incompleteRows.map((row) => `incomplete_activation_approval:${normalizeKey(row.role) || 'unknown'}`),
  ]
}

function activationWindowBlockers(activationWindow = {}) {
  return [
    normalizeText(activationWindow.windowReference || activationWindow.window_reference) ? '' : 'activation_window_reference_missing',
    normalizeKey(activationWindow.status) === 'approved' ? '' : 'activation_window_not_approved',
    normalizeText(activationWindow.opensAt || activationWindow.opens_at) ? '' : 'activation_window_open_time_missing',
    normalizeText(activationWindow.expiresAt || activationWindow.expires_at) ? '' : 'activation_window_expiry_missing',
    activationWindow.freezeActive === true ? 'activation_window_freeze_active' : '',
    activationWindow.incidentFreezeActive === true ? 'activation_window_incident_freeze_active' : '',
  ].filter(Boolean)
}

function rollbackControlBlockers(rollbackControls = {}) {
  return [
    normalizeText(rollbackControls.rollbackPlanReference || rollbackControls.rollback_plan_reference) ? '' : 'rollback_plan_reference_missing',
    normalizeText(rollbackControls.previousDefaultsSnapshotReference || rollbackControls.previous_defaults_snapshot_reference) ? '' : 'previous_defaults_snapshot_reference_missing',
    rollbackControls.restorePreviousVersionReady === true ? '' : 'rollback_restore_previous_version_not_ready',
    rollbackControls.disableCandidateVersionReady === true ? '' : 'rollback_disable_candidate_version_not_ready',
    rollbackControls.stopSigningDispatchReady === true ? '' : 'rollback_stop_signing_dispatch_not_ready',
    normalizeText(rollbackControls.rollbackOwner || rollbackControls.rollback_owner) ? '' : 'rollback_owner_missing',
    rollbackControls.rollbackDrillPassed === true ? '' : 'rollback_drill_not_passed',
  ].filter(Boolean)
}

function noWriteGuardBlockers(noWriteGuard = {}) {
  return [
    normalizeKey(noWriteGuard.guardMode || noWriteGuard.guard_mode) === 'activation_guard_only' ? '' : 'no_write_guard_mode_invalid',
    noWriteGuard.auditOnly === true ? '' : 'no_write_guard_not_audit_only',
    noWriteGuard.mutatedData === false ? '' : 'no_write_guard_mutated_data',
    noWriteGuard.productionWriteAttempted === true ? 'no_write_guard_production_write_attempted' : '',
    numberValue(noWriteGuard.liveDefaultMutationCount || noWriteGuard.live_default_mutation_count) === 0 ? '' : 'no_write_guard_live_default_mutation_observed',
    numberValue(noWriteGuard.productionArtifactMutationCount || noWriteGuard.production_artifact_mutation_count) === 0 ? '' : 'no_write_guard_production_artifact_mutation_observed',
    numberValue(noWriteGuard.signingDispatchMutationCount || noWriteGuard.signing_dispatch_mutation_count) === 0 ? '' : 'no_write_guard_signing_dispatch_mutation_observed',
    noWriteGuard.controlledActivationDryRunRequired === true ? '' : 'controlled_activation_dry_run_not_required',
  ].filter(Boolean)
}

function evidenceBlockers(evidence = []) {
  const keys = list(evidence).map((row) => normalizeKey(row.key))
  const missingKeys = REQUIRED_GUARD_EVIDENCE.filter((key) => !keys.includes(key))
  const badRows = list(evidence).filter((row) =>
    REQUIRED_GUARD_EVIDENCE.includes(normalizeKey(row.key)) &&
      (normalizeKey(row.status) !== 'passed' || !normalizeText(row.path) || !/^[a-f0-9]{64}$/i.test(normalizeText(row.fingerprint || row.sha256))),
  )
  return [
    ...missingKeys.map((key) => `missing_guard_evidence:${key}`),
    ...badRows.map((row) => `guard_evidence_not_passed:${normalizeKey(row.key) || 'unknown'}`),
  ]
}

function archiveReceiptBlockers(archiveReceipt = {}) {
  return [
    normalizeText(archiveReceipt.archiveReference || archiveReceipt.archive_reference) ? '' : 'activation_guard_archive_reference_missing',
    archiveReceipt.guardReceiptArchived === true ? '' : 'guard_receipt_not_archived',
    archiveReceipt.routeFingerprintManifestArchived === true ? '' : 'route_fingerprint_manifest_not_archived',
    archiveReceipt.operatorConfirmationArchived === true ? '' : 'operator_confirmation_not_archived',
    archiveReceipt.rollbackEvidenceArchived === true ? '' : 'rollback_evidence_not_archived',
    archiveReceipt.immutable === true ? '' : 'activation_guard_archive_not_immutable',
  ].filter(Boolean)
}

export function buildOtpVersionRenewalActivationGuardReceipt({
  dryRunReceipt = buildOtpVersionRenewalPublicationReceipt(),
  activationIntent = defaultActivationIntent(dryRunReceipt),
  routeActivationTargets = defaultRouteActivationTargets(dryRunReceipt),
  operatorConfirmation = defaultOperatorConfirmation(dryRunReceipt),
  approvals = defaultApprovals(),
  activationWindow = defaultActivationWindow(),
  rollbackControls = defaultRollbackControls(dryRunReceipt),
  noWriteGuard = defaultNoWriteGuard(),
  evidence = defaultEvidence(),
  archiveReceipt = defaultArchiveReceipt(),
  checkedAt = new Date().toISOString(),
} = {}) {
  const blockerCodes = unique([
    ...phase46Blockers(dryRunReceipt),
    ...activationIntentBlockers(activationIntent, dryRunReceipt),
    ...routeTargetBlockers(routeActivationTargets, dryRunReceipt),
    ...operatorConfirmationBlockers(operatorConfirmation, activationIntent, dryRunReceipt),
    ...approvalBlockers(approvals),
    ...activationWindowBlockers(activationWindow),
    ...rollbackControlBlockers(rollbackControls),
    ...noWriteGuardBlockers(noWriteGuard),
    ...evidenceBlockers(evidence),
    ...archiveReceiptBlockers(archiveReceipt),
  ])
  const canProceedToControlledActivationDryRun = blockerCodes.length === 0

  return Object.freeze({
    version: OTP_VERSION_RENEWAL_ACTIVATION_GUARD_PHASE47_VERSION,
    contract: OTP_VERSION_RENEWAL_ACTIVATION_GUARD_CONTRACT,
    checkedAt,
    status: canProceedToControlledActivationDryRun
      ? OTP_VERSION_RENEWAL_ACTIVATION_GUARD_READY_STATUS
      : 'OTP_VERSION_RENEWAL_ACTIVATION_GUARD_BLOCKED',
    canProceedToControlledActivationDryRun,
    mutatedData: false,
    blockerCodes: Object.freeze(blockerCodes),
    dryRunReceipt: Object.freeze({ ...dryRunReceipt }),
    activationIntent: Object.freeze({ ...activationIntent }),
    routeActivationTargets: Object.freeze(list(routeActivationTargets)),
    operatorConfirmation: Object.freeze({ ...operatorConfirmation }),
    approvals: Object.freeze(list(approvals)),
    activationWindow: Object.freeze({ ...activationWindow }),
    rollbackControls: Object.freeze({ ...rollbackControls }),
    noWriteGuard: Object.freeze({ ...noWriteGuard }),
    evidence: Object.freeze(list(evidence)),
    archiveReceipt: Object.freeze({ ...archiveReceipt }),
    summary: Object.freeze({
      routeCount: REQUIRED_ROUTES.length,
      guardedRouteCount: list(routeActivationTargets).filter((row) => row.routeActivationAllowed === true).length,
      approvalCount: list(approvals).length,
      evidenceCount: list(evidence).length,
      blockerCount: blockerCodes.length,
      liveDefaultMutationCount: numberValue(noWriteGuard.liveDefaultMutationCount || noWriteGuard.live_default_mutation_count),
    }),
  })
}

function addCheck(checks, pass, code, detail) {
  checks.push({ code, pass: Boolean(pass), detail })
}

export function buildOtpVersionRenewalActivationGuardPhase47Audit({
  checkedAt = new Date().toISOString(),
  phase46Audit = null,
  packageJson = {},
} = {}) {
  const checks = []
  const phase46Ready = !phase46Audit || phase46Audit.status === OTP_VERSION_RENEWAL_PUBLICATION_READY_STATUS
  const goodDryRun = phase46Audit?.dryRunReceipts?.find((receipt) => receipt.canCompletePublicationDryRun) ||
    buildOtpVersionRenewalPublicationReceipt({ checkedAt })
  const goodGuard = buildOtpVersionRenewalActivationGuardReceipt({
    checkedAt,
    dryRunReceipt: goodDryRun,
    approvals: defaultApprovals(checkedAt),
    activationWindow: defaultActivationWindow(checkedAt),
    operatorConfirmation: defaultOperatorConfirmation(goodDryRun, checkedAt),
  })
  const blockedPhase46Guard = buildOtpVersionRenewalActivationGuardReceipt({
    checkedAt,
    dryRunReceipt: {
      ...goodDryRun,
      status: 'OTP_VERSION_RENEWAL_PUBLICATION_DRY_RUN_BLOCKED',
      canCompletePublicationDryRun: false,
      blockerCodes: ['missing_dry_run_evidence:generated_pdf_proof'],
    },
    approvals: defaultApprovals(checkedAt),
    activationWindow: defaultActivationWindow(checkedAt),
  })
  const staleOperationGuard = buildOtpVersionRenewalActivationGuardReceipt({
    checkedAt,
    dryRunReceipt: goodDryRun,
    activationIntent: {
      ...defaultActivationIntent(goodDryRun),
      sourceDryRunId: 'stale-dry-run',
      versionKey: 'stale-version',
    },
    approvals: defaultApprovals(checkedAt),
    activationWindow: defaultActivationWindow(checkedAt),
  })
  const routeFingerprintMismatchGuard = buildOtpVersionRenewalActivationGuardReceipt({
    checkedAt,
    dryRunReceipt: goodDryRun,
    routeActivationTargets: defaultRouteActivationTargets(goodDryRun).map((row) =>
      row.routeVariant === 'new_development'
        ? { ...row, observedOutputFingerprint: fingerprint('wrong-new-development-fingerprint') }
        : row,
    ),
    approvals: defaultApprovals(checkedAt),
    activationWindow: defaultActivationWindow(checkedAt),
  })
  const missingRouteGuard = buildOtpVersionRenewalActivationGuardReceipt({
    checkedAt,
    dryRunReceipt: goodDryRun,
    routeActivationTargets: defaultRouteActivationTargets(goodDryRun).filter((row) => row.routeVariant !== 'resale_existing_property'),
    approvals: defaultApprovals(checkedAt),
    activationWindow: defaultActivationWindow(checkedAt),
  })
  const docxRegressionGuard = buildOtpVersionRenewalActivationGuardReceipt({
    checkedAt,
    dryRunReceipt: goodDryRun,
    routeActivationTargets: defaultRouteActivationTargets(goodDryRun).map((row) =>
      row.routeVariant === 'resale_existing_property'
        ? { ...row, sourceFormat: 'docx', sourcePath: 'resale-activation.docx', docxReferenceCount: 1 }
        : row,
    ),
    approvals: defaultApprovals(checkedAt),
    activationWindow: defaultActivationWindow(checkedAt),
  })
  const operatorMismatchGuard = buildOtpVersionRenewalActivationGuardReceipt({
    checkedAt,
    dryRunReceipt: goodDryRun,
    operatorConfirmation: {
      ...defaultOperatorConfirmation(goodDryRun, checkedAt),
      operator: 'someone_else',
      confirmationPhrase: 'wrong phrase',
      mfaVerified: false,
    },
    approvals: defaultApprovals(checkedAt),
    activationWindow: defaultActivationWindow(checkedAt),
  })
  const liveMutationGuard = buildOtpVersionRenewalActivationGuardReceipt({
    checkedAt,
    dryRunReceipt: goodDryRun,
    activationIntent: {
      ...defaultActivationIntent(goodDryRun),
      productionWriteRequested: true,
      liveDefaultMutationRequested: true,
      signingDispatchRequested: true,
    },
    noWriteGuard: {
      ...defaultNoWriteGuard(),
      auditOnly: false,
      mutatedData: true,
      productionWriteAttempted: true,
      liveDefaultMutationCount: 1,
      productionArtifactMutationCount: 1,
      signingDispatchMutationCount: 1,
    },
    approvals: defaultApprovals(checkedAt),
    activationWindow: defaultActivationWindow(checkedAt),
  })
  const rollbackBlockedGuard = buildOtpVersionRenewalActivationGuardReceipt({
    checkedAt,
    dryRunReceipt: goodDryRun,
    rollbackControls: {
      ...defaultRollbackControls(goodDryRun),
      restorePreviousVersionReady: false,
      rollbackDrillPassed: false,
    },
    approvals: defaultApprovals(checkedAt),
    activationWindow: defaultActivationWindow(checkedAt),
  })
  const missingApprovalGuard = buildOtpVersionRenewalActivationGuardReceipt({
    checkedAt,
    dryRunReceipt: goodDryRun,
    approvals: defaultApprovals(checkedAt).filter((row) => row.role !== 'governance_owner'),
    activationWindow: defaultActivationWindow(checkedAt),
  })
  const freezeWindowGuard = buildOtpVersionRenewalActivationGuardReceipt({
    checkedAt,
    dryRunReceipt: goodDryRun,
    approvals: defaultApprovals(checkedAt),
    activationWindow: {
      ...defaultActivationWindow(checkedAt),
      status: 'frozen',
      freezeActive: true,
      incidentFreezeActive: true,
    },
  })
  const missingEvidenceGuard = buildOtpVersionRenewalActivationGuardReceipt({
    checkedAt,
    dryRunReceipt: goodDryRun,
    approvals: defaultApprovals(checkedAt),
    activationWindow: defaultActivationWindow(checkedAt),
    evidence: defaultEvidence().filter((row) => row.key !== 'route_candidate_fingerprint_manifest'),
  })

  addCheck(checks, phase46Ready, 'PHASE47_PHASE46_PUBLICATION_DRY_RUN_READY', 'Activation guard starts only after Phase 46 publication dry-run is ready.')
  addCheck(
    checks,
    goodGuard.canProceedToControlledActivationDryRun &&
      goodGuard.status === OTP_VERSION_RENEWAL_ACTIVATION_GUARD_READY_STATUS &&
      goodGuard.mutatedData === false,
    'PHASE47_GOOD_ACTIVATION_GUARD_READY',
    'A clean Phase 46 dry-run can pass the activation guard without mutating production data.',
  )
  addCheck(
    checks,
    REQUIRED_ROUTES.every((route) => goodGuard.routeActivationTargets.some((row) => row.routeVariant === route && row.routeActivationAllowed === true)),
    'PHASE47_RESALE_AND_NEW_DEVELOPMENT_GUARDED_SEPARATELY',
    'Resale and new-development activation targets must both be present and route-isolated.',
  )
  addCheck(
    checks,
    goodGuard.noWriteGuard.auditOnly === true &&
      goodGuard.noWriteGuard.productionWriteAttempted === false &&
      goodGuard.noWriteGuard.liveDefaultMutationCount === 0 &&
      goodGuard.activationIntent.dryRunFirst === true,
    'PHASE47_NO_LIVE_WRITE_BEFORE_CONTROLLED_DRY_RUN',
    'The guard cannot perform live writes and must require a controlled activation dry-run first.',
  )
  addCheck(
    checks,
    blockedPhase46Guard.canProceedToControlledActivationDryRun === false &&
      blockedPhase46Guard.blockerCodes.includes('phase46_publication_not_ready'),
    'PHASE47_BLOCKED_PHASE46_RECEIPT_REJECTED',
    'A blocked Phase 46 publication receipt cannot pass the activation guard.',
  )
  addCheck(
    checks,
    staleOperationGuard.canProceedToControlledActivationDryRun === false &&
      staleOperationGuard.blockerCodes.includes('activation_source_dry_run_mismatch') &&
      staleOperationGuard.blockerCodes.includes('activation_version_key_mismatch'),
    'PHASE47_STALE_OPERATION_BLOCKED',
    'A stale dry-run id or version key blocks activation guard approval.',
  )
  addCheck(
    checks,
    routeFingerprintMismatchGuard.canProceedToControlledActivationDryRun === false &&
      routeFingerprintMismatchGuard.blockerCodes.includes('observed_route_fingerprint_mismatch:new_development'),
    'PHASE47_ROUTE_FINGERPRINT_MISMATCH_BLOCKED',
    'A route candidate fingerprint mismatch blocks activation guard approval.',
  )
  addCheck(
    checks,
    missingRouteGuard.canProceedToControlledActivationDryRun === false &&
      missingRouteGuard.blockerCodes.includes('route_activation_missing:resale_existing_property'),
    'PHASE47_MISSING_ROUTE_BLOCKED',
    'Missing resale or new-development activation target blocks the guard.',
  )
  addCheck(
    checks,
    docxRegressionGuard.canProceedToControlledActivationDryRun === false &&
      docxRegressionGuard.blockerCodes.includes('route_activation_docx_source_observed:resale_existing_property'),
    'PHASE47_DOCX_REGRESSION_BLOCKED',
    'DOC/DOCX source references are blocked from activation guard approval.',
  )
  addCheck(
    checks,
    operatorMismatchGuard.canProceedToControlledActivationDryRun === false &&
      operatorMismatchGuard.blockerCodes.includes('operator_requester_mismatch') &&
      operatorMismatchGuard.blockerCodes.includes('operator_confirmation_phrase_mismatch'),
    'PHASE47_OPERATOR_CONFIRMATION_MISMATCH_BLOCKED',
    'Operator identity, confirmation phrase, approval reference, and MFA must match.',
  )
  addCheck(
    checks,
    liveMutationGuard.canProceedToControlledActivationDryRun === false &&
      liveMutationGuard.blockerCodes.includes('activation_production_write_requested') &&
      liveMutationGuard.blockerCodes.includes('no_write_guard_live_default_mutation_observed'),
    'PHASE47_LIVE_MUTATION_BLOCKED',
    'Production writes or live default mutation attempts are blocked by the activation guard.',
  )
  addCheck(
    checks,
    rollbackBlockedGuard.canProceedToControlledActivationDryRun === false &&
      rollbackBlockedGuard.blockerCodes.includes('rollback_restore_previous_version_not_ready') &&
      rollbackBlockedGuard.blockerCodes.includes('rollback_drill_not_passed'),
    'PHASE47_ROLLBACK_CONTROL_BLOCKED',
    'Rollback restore, disable-candidate, dispatch stop, owner, and drill evidence are required.',
  )
  addCheck(
    checks,
    missingApprovalGuard.canProceedToControlledActivationDryRun === false &&
      missingApprovalGuard.blockerCodes.includes('missing_activation_approval:governance_owner'),
    'PHASE47_MISSING_APPROVAL_BLOCKED',
    'All activation guard owner approvals are required.',
  )
  addCheck(
    checks,
    freezeWindowGuard.canProceedToControlledActivationDryRun === false &&
      freezeWindowGuard.blockerCodes.includes('activation_window_freeze_active') &&
      freezeWindowGuard.blockerCodes.includes('activation_window_incident_freeze_active'),
    'PHASE47_FREEZE_WINDOW_BLOCKED',
    'A release freeze or incident freeze blocks activation guard approval.',
  )
  addCheck(
    checks,
    missingEvidenceGuard.canProceedToControlledActivationDryRun === false &&
      missingEvidenceGuard.blockerCodes.includes('missing_guard_evidence:route_candidate_fingerprint_manifest'),
    'PHASE47_MISSING_EVIDENCE_BLOCKED',
    'Missing route fingerprint manifest or other guard evidence blocks approval.',
  )
  addCheck(
    checks,
    packageJson.scripts?.['test:otp-version-renewal-activation-guard-phase47'] === 'node scripts/otp-version-renewal-activation-guard-phase47.test.mjs' &&
      packageJson.scripts?.['report:otp-version-renewal-activation-guard-phase47'] === 'node scripts/report-otp-version-renewal-activation-guard-phase47.mjs',
    'PHASE47_PACKAGE_SCRIPTS_WIRED',
    'Package scripts expose the Phase 47 test and report.',
  )

  const blockers = checks.filter((check) => !check.pass)
  return Object.freeze({
    version: OTP_VERSION_RENEWAL_ACTIVATION_GUARD_PHASE47_VERSION,
    contract: OTP_VERSION_RENEWAL_ACTIVATION_GUARD_CONTRACT,
    checkedAt,
    status: blockers.length ? 'OTP_VERSION_RENEWAL_ACTIVATION_GUARD_REMEDIATION_REQUIRED' : OTP_VERSION_RENEWAL_ACTIVATION_GUARD_READY_STATUS,
    mutatedData: false,
    checks: Object.freeze(checks),
    blockers: Object.freeze(blockers),
    guardReceipts: Object.freeze([
      goodGuard,
      blockedPhase46Guard,
      staleOperationGuard,
      routeFingerprintMismatchGuard,
      missingRouteGuard,
      docxRegressionGuard,
      operatorMismatchGuard,
      liveMutationGuard,
      rollbackBlockedGuard,
      missingApprovalGuard,
      freezeWindowGuard,
      missingEvidenceGuard,
    ]),
    summary: Object.freeze({
      blockerCount: blockers.length,
      passedGuardCount: [goodGuard].filter((row) => row.canProceedToControlledActivationDryRun).length,
      blockedGuardCount: [
        blockedPhase46Guard,
        staleOperationGuard,
        routeFingerprintMismatchGuard,
        missingRouteGuard,
        docxRegressionGuard,
        operatorMismatchGuard,
        liveMutationGuard,
        rollbackBlockedGuard,
        missingApprovalGuard,
        freezeWindowGuard,
        missingEvidenceGuard,
      ].filter((row) => !row.canProceedToControlledActivationDryRun).length,
      routeCount: REQUIRED_ROUTES.length,
      evidenceCount: REQUIRED_GUARD_EVIDENCE.length,
    }),
    nextPhase: blockers.length ? null : Object.freeze({
      phase: 48,
      key: 'otp_controlled_version_renewal_activation_dry_run',
      label: 'Controlled Version Renewal Activation Dry Run',
    }),
  })
}

export function formatOtpVersionRenewalActivationGuardPhase47Markdown(report = buildOtpVersionRenewalActivationGuardPhase47Audit()) {
  return [
    '# OTP Generator Phase 47 Version Renewal Activation Guard',
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
        ['Passed guard receipts', report.summary.passedGuardCount],
        ['Blocked guard receipts', report.summary.blockedGuardCount],
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
    '## Guard Receipts',
    '',
    table(
      ['Status', 'Allowed', 'Routes guarded', 'Evidence', 'Live default mutations', 'Blockers'],
      report.guardReceipts.map((receipt) => [
        receipt.status,
        receipt.canProceedToControlledActivationDryRun ? 'yes' : 'no',
        receipt.summary.guardedRouteCount,
        receipt.summary.evidenceCount,
        receipt.summary.liveDefaultMutationCount,
        receipt.blockerCodes.join(', ') || 'none',
      ]),
    ),
    '',
    '## Boundary',
    '',
    'Phase 47 proves a staged Phase 46 template renewal can pass activation guard only when the exact dry-run receipt, version key, route candidate fingerprints, route isolation, operator confirmation, owner approvals, activation window, rollback controls, guard evidence, and no-write proof all match. It still does not activate live defaults or mutate production data; it only permits the next controlled activation dry-run phase.',
    '',
  ].join('\n')
}
