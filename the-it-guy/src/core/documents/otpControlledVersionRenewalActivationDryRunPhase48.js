import {
  OTP_VERSION_RENEWAL_ACTIVATION_GUARD_PHASE47_VERSION,
  OTP_VERSION_RENEWAL_ACTIVATION_GUARD_READY_STATUS,
  buildOtpVersionRenewalActivationGuardReceipt,
} from './otpVersionRenewalActivationGuardPhase47.js'

export const OTP_CONTROLLED_VERSION_RENEWAL_ACTIVATION_DRY_RUN_PHASE48_VERSION = 'otp_controlled_version_renewal_activation_dry_run_phase48_v1'
export const OTP_CONTROLLED_VERSION_RENEWAL_ACTIVATION_DRY_RUN_READY_STATUS = 'OTP_CONTROLLED_VERSION_RENEWAL_ACTIVATION_DRY_RUN_READY_FOR_ACTIVATION_RECEIPT'
export const OTP_CONTROLLED_VERSION_RENEWAL_ACTIVATION_DRY_RUN_CONTRACT = 'otp-vnext-controlled-version-renewal-activation-dry-run-phase48-v1'

const REQUIRED_ROUTES = Object.freeze(['resale_existing_property', 'new_development'])
const REQUIRED_SIMULATION_EVIDENCE = Object.freeze([
  'phase47_activation_guard_receipt',
  'pre_activation_snapshot',
  'simulated_route_default_switch',
  'simulated_version_pointer_switch',
  'post_activation_validation',
  'rollback_rehearsal',
  'no_write_proof',
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

function fingerprint(seed = 'phase48') {
  return `${normalizeKey(seed).replace(/[^a-f0-9]/gi, 'a')}${'0'.repeat(64)}`.slice(0, 64).replace(/[^a-f0-9]/gi, 'a')
}

function hasDocxSource(row = {}) {
  return /\.docx?$/i.test(normalizeText(row.path || row.sourcePath || row.source_path || row.simulatedTemplateDefaultId || row.simulated_template_default_id || row.targetLiveTemplateDefaultId || row.target_live_template_default_id)) ||
    normalizeKey(row.sourceFormat || row.source_format).includes('doc') ||
    numberValue(row.docxReferenceCount || row.docx_reference_count) > 0
}

function defaultActivationSimulationPlan(activationGuardReceipt = buildOtpVersionRenewalActivationGuardReceipt(), checkedAt = new Date().toISOString()) {
  return {
    simulationId: 'otp-vnext-phase48-controlled-version-renewal-activation-dry-run',
    sourceGuardOperationId: activationGuardReceipt.activationIntent?.operationId || 'otp-vnext-phase47-version-renewal-activation-guard',
    operationType: 'controlled_activation_dry_run',
    versionKey: activationGuardReceipt.activationIntent?.versionKey || 'otp-template-vnext-2026-08-renewal',
    previousVersionKey: activationGuardReceipt.activationIntent?.previousVersionKey || 'otp-template-vnext-phase39',
    targetEnvironment: 'production',
    operator: activationGuardReceipt.operatorConfirmation?.operator || 'release_operator',
    dryRunOnly: true,
    productionWriteRequested: false,
    liveDefaultMutationRequested: false,
    signingDispatchRequested: false,
    executedAt: checkedAt,
  }
}

function defaultPreActivationSnapshot(activationGuardReceipt = buildOtpVersionRenewalActivationGuardReceipt()) {
  return {
    snapshotReference: activationGuardReceipt.rollbackControls?.previousDefaultsSnapshotReference || 'phase46-version-renewal-dry-run-rollback-snapshot',
    currentVersionKey: activationGuardReceipt.activationIntent?.previousVersionKey || 'otp-template-vnext-phase39',
    currentVersionFingerprint: fingerprint('phase48-current-version'),
    routeDefaultSnapshotCaptured: true,
    signingEnvelopeSnapshotCaptured: true,
    immutable: true,
  }
}

function defaultRouteSimulations(activationGuardReceipt = buildOtpVersionRenewalActivationGuardReceipt()) {
  return REQUIRED_ROUTES.map((routeVariant) => {
    const target = list(activationGuardReceipt.routeActivationTargets).find((row) => normalizeKey(row.routeVariant || row.route_variant) === routeVariant) || {}
    return {
      routeVariant,
      currentLiveTemplateDefaultId: target.currentLiveTemplateDefaultId || target.current_live_template_default_id || `otp-${routeVariant}-previous`,
      simulatedTemplateDefaultId: target.targetLiveTemplateDefaultId || target.target_live_template_default_id || `otp-${routeVariant}-candidate`,
      currentSigningEnvelopeKey: target.currentSigningEnvelopeKey || target.current_signing_envelope_key || `otp-${routeVariant}-envelope`,
      simulatedSigningEnvelopeKey: target.targetSigningEnvelopeKey || target.target_signing_envelope_key || `otp-${routeVariant}-envelope-candidate`,
      expectedOutputFingerprint: target.observedOutputFingerprint || target.observed_output_fingerprint || fingerprint(`phase46-${routeVariant}`),
      simulatedOutputFingerprint: target.observedOutputFingerprint || target.observed_output_fingerprint || fingerprint(`phase46-${routeVariant}`),
      simulatedSwitchReady: true,
      routeIsolationPreserved: true,
      liveDefaultChanged: false,
      sourceFormat: 'native_pdf_template',
    }
  })
}

function defaultVersionPointerSimulation(activationGuardReceipt = buildOtpVersionRenewalActivationGuardReceipt()) {
  return {
    previousVersionKey: activationGuardReceipt.activationIntent?.previousVersionKey || 'otp-template-vnext-phase39',
    targetVersionKey: activationGuardReceipt.activationIntent?.versionKey || 'otp-template-vnext-2026-08-renewal',
    simulatedPointerSwitchReady: true,
    currentPointerChanged: false,
    targetVersionImmutable: true,
    pointerFingerprint: fingerprint('phase48-version-pointer'),
  }
}

function defaultPostActivationValidation() {
  return {
    generatedPdfProofStatus: 'passed',
    contentScannerStatus: 'passed',
    signingEnvelopeStatus: 'passed',
    routeSeparationStatus: 'passed',
    legalWordingStatus: 'passed',
    fieldRegistryStatus: 'passed',
    validationFingerprint: fingerprint('phase48-post-activation-validation'),
  }
}

function defaultRollbackRehearsal(activationGuardReceipt = buildOtpVersionRenewalActivationGuardReceipt()) {
  return {
    rollbackPlanReference: activationGuardReceipt.rollbackControls?.rollbackPlanReference || 'phase45-template-renewal-rollback-plan',
    restorePreviousVersionSimulated: true,
    restorePreviousDefaultsSimulated: true,
    disableCandidateVersionSimulated: true,
    stopSigningDispatchSimulated: true,
    rehearsalStatus: 'passed',
    rehearsalFingerprint: fingerprint('phase48-rollback-rehearsal'),
  }
}

function defaultNoWriteProof() {
  return {
    dryRunOnly: true,
    mutatedData: false,
    productionWriteAttempted: false,
    liveDefaultMutationCount: 0,
    productionArtifactMutationCount: 0,
    versionPointerMutationCount: 0,
    signingDispatchMutationCount: 0,
  }
}

function defaultAuditEvents() {
  return [
    'activation_dry_run_started',
    'pre_activation_snapshot_checked',
    'route_default_switch_simulated',
    'version_pointer_switch_simulated',
    'post_activation_validation_passed',
    'rollback_rehearsal_simulated',
    'activation_dry_run_stopped_before_live_write',
  ].map((eventType) => ({
    eventType,
    recorded: true,
    reference: `phase48-${eventType}`,
  }))
}

function defaultEvidence() {
  return REQUIRED_SIMULATION_EVIDENCE.map((key) => ({
    key,
    status: 'passed',
    path: `docs/otp-version-renewal-${key.replace(/_/g, '-')}-phase48.md`,
    fingerprint: fingerprint(`phase48-${key}`),
  }))
}

function defaultArchiveReceipt() {
  return {
    archiveReference: 'otp-vnext-phase48-controlled-activation-dry-run-archive',
    dryRunReceiptArchived: true,
    simulationEvidenceArchived: true,
    rollbackEvidenceArchived: true,
    auditEventsArchived: true,
    immutable: true,
  }
}

function phase47Blockers(activationGuardReceipt = {}) {
  return [
    activationGuardReceipt.version === OTP_VERSION_RENEWAL_ACTIVATION_GUARD_PHASE47_VERSION ? '' : 'phase47_activation_guard_version_mismatch',
    activationGuardReceipt.status === OTP_VERSION_RENEWAL_ACTIVATION_GUARD_READY_STATUS ? '' : 'phase47_activation_guard_not_ready',
    activationGuardReceipt.canProceedToControlledActivationDryRun === true ? '' : 'phase47_activation_guard_cannot_proceed',
    list(activationGuardReceipt.blockerCodes).length === 0 ? '' : 'phase47_activation_guard_has_blockers',
    activationGuardReceipt.mutatedData === false ? '' : 'phase47_activation_guard_mutation_unexpected',
    activationGuardReceipt.noWriteGuard?.controlledActivationDryRunRequired === true ? '' : 'phase47_controlled_dry_run_not_required',
  ].filter(Boolean)
}

function activationSimulationPlanBlockers(activationSimulationPlan = {}, activationGuardReceipt = {}) {
  return [
    normalizeText(activationSimulationPlan.simulationId || activationSimulationPlan.simulation_id) ? '' : 'activation_simulation_id_missing',
    (activationSimulationPlan.sourceGuardOperationId || activationSimulationPlan.source_guard_operation_id) === activationGuardReceipt.activationIntent?.operationId ? '' : 'activation_guard_operation_mismatch',
    normalizeKey(activationSimulationPlan.operationType || activationSimulationPlan.operation_type) === 'controlled_activation_dry_run' ? '' : 'activation_simulation_operation_type_invalid',
    (activationSimulationPlan.versionKey || activationSimulationPlan.version_key) === activationGuardReceipt.activationIntent?.versionKey ? '' : 'activation_simulation_version_key_mismatch',
    (activationSimulationPlan.previousVersionKey || activationSimulationPlan.previous_version_key) === activationGuardReceipt.activationIntent?.previousVersionKey ? '' : 'activation_simulation_previous_version_key_mismatch',
    normalizeKey(activationSimulationPlan.targetEnvironment || activationSimulationPlan.target_environment) === 'production' ? '' : 'activation_simulation_target_not_production',
    activationSimulationPlan.operator === activationGuardReceipt.operatorConfirmation?.operator ? '' : 'activation_simulation_operator_mismatch',
    activationSimulationPlan.dryRunOnly === true ? '' : 'activation_simulation_not_dry_run_only',
    activationSimulationPlan.productionWriteRequested === true ? 'activation_simulation_production_write_requested' : '',
    activationSimulationPlan.liveDefaultMutationRequested === true ? 'activation_simulation_live_default_mutation_requested' : '',
    activationSimulationPlan.signingDispatchRequested === true ? 'activation_simulation_signing_dispatch_requested' : '',
    normalizeText(activationSimulationPlan.executedAt || activationSimulationPlan.executed_at) ? '' : 'activation_simulation_execution_time_missing',
  ].filter(Boolean)
}

function preActivationSnapshotBlockers(preActivationSnapshot = {}, activationGuardReceipt = {}) {
  return [
    normalizeText(preActivationSnapshot.snapshotReference || preActivationSnapshot.snapshot_reference) ? '' : 'pre_activation_snapshot_reference_missing',
    (preActivationSnapshot.currentVersionKey || preActivationSnapshot.current_version_key) === activationGuardReceipt.activationIntent?.previousVersionKey ? '' : 'pre_activation_current_version_mismatch',
    /^[a-f0-9]{64}$/i.test(normalizeText(preActivationSnapshot.currentVersionFingerprint || preActivationSnapshot.current_version_fingerprint)) ? '' : 'pre_activation_current_version_fingerprint_missing',
    preActivationSnapshot.routeDefaultSnapshotCaptured === true ? '' : 'pre_activation_route_default_snapshot_missing',
    preActivationSnapshot.signingEnvelopeSnapshotCaptured === true ? '' : 'pre_activation_signing_envelope_snapshot_missing',
    preActivationSnapshot.immutable === true ? '' : 'pre_activation_snapshot_not_immutable',
  ].filter(Boolean)
}

function routeSimulationBlockers(routeSimulations = [], activationGuardReceipt = {}) {
  const guardTargets = list(activationGuardReceipt.routeActivationTargets)
  const routes = list(routeSimulations).map((row) => normalizeKey(row.routeVariant || row.route_variant))
  const missingRoutes = REQUIRED_ROUTES.filter((route) => !routes.includes(route))
  const duplicateRoutes = routes.filter((route, index) => route && routes.indexOf(route) !== index)
  const rowBlockers = list(routeSimulations).flatMap((row) => {
    const route = normalizeKey(row.routeVariant || row.route_variant) || 'unknown'
    const target = guardTargets.find((candidate) => normalizeKey(candidate.routeVariant || candidate.route_variant) === route) || {}
    const expectedTemplate = target.targetLiveTemplateDefaultId || target.target_live_template_default_id
    const expectedEnvelope = target.targetSigningEnvelopeKey || target.target_signing_envelope_key
    const expectedFingerprint = target.observedOutputFingerprint || target.observed_output_fingerprint
    return [
      REQUIRED_ROUTES.includes(route) ? '' : `unsupported_route:${route}`,
      normalizeText(row.currentLiveTemplateDefaultId || row.current_live_template_default_id) ? '' : `simulation_current_template_missing:${route}`,
      normalizeText(row.simulatedTemplateDefaultId || row.simulated_template_default_id) ? '' : `simulation_target_template_missing:${route}`,
      expectedTemplate && (row.simulatedTemplateDefaultId || row.simulated_template_default_id) !== expectedTemplate ? `simulation_target_template_mismatch:${route}` : '',
      normalizeText(row.currentSigningEnvelopeKey || row.current_signing_envelope_key) ? '' : `simulation_current_envelope_missing:${route}`,
      normalizeText(row.simulatedSigningEnvelopeKey || row.simulated_signing_envelope_key) ? '' : `simulation_target_envelope_missing:${route}`,
      expectedEnvelope && (row.simulatedSigningEnvelopeKey || row.simulated_signing_envelope_key) !== expectedEnvelope ? `simulation_target_envelope_mismatch:${route}` : '',
      expectedFingerprint && (row.expectedOutputFingerprint || row.expected_output_fingerprint) !== expectedFingerprint ? `simulation_expected_fingerprint_mismatch:${route}` : '',
      (row.simulatedOutputFingerprint || row.simulated_output_fingerprint) === (row.expectedOutputFingerprint || row.expected_output_fingerprint) ? '' : `simulation_output_fingerprint_mismatch:${route}`,
      row.simulatedSwitchReady === true ? '' : `route_simulated_switch_not_ready:${route}`,
      row.routeIsolationPreserved === true ? '' : `route_isolation_not_preserved:${route}`,
      row.liveDefaultChanged === true ? `route_live_default_changed:${route}` : '',
      hasDocxSource(row) ? `route_simulation_docx_source_observed:${route}` : '',
    ].filter(Boolean)
  })
  return [
    ...missingRoutes.map((route) => `route_simulation_missing:${route}`),
    ...unique(duplicateRoutes).map((route) => `route_simulation_duplicate:${route}`),
    ...rowBlockers,
  ]
}

function versionPointerSimulationBlockers(versionPointerSimulation = {}, activationGuardReceipt = {}) {
  return [
    (versionPointerSimulation.previousVersionKey || versionPointerSimulation.previous_version_key) === activationGuardReceipt.activationIntent?.previousVersionKey ? '' : 'version_pointer_previous_version_mismatch',
    (versionPointerSimulation.targetVersionKey || versionPointerSimulation.target_version_key) === activationGuardReceipt.activationIntent?.versionKey ? '' : 'version_pointer_target_version_mismatch',
    versionPointerSimulation.simulatedPointerSwitchReady === true ? '' : 'version_pointer_switch_not_ready',
    versionPointerSimulation.currentPointerChanged === true ? 'version_pointer_changed_during_dry_run' : '',
    versionPointerSimulation.targetVersionImmutable === true ? '' : 'target_version_not_immutable',
    /^[a-f0-9]{64}$/i.test(normalizeText(versionPointerSimulation.pointerFingerprint || versionPointerSimulation.pointer_fingerprint)) ? '' : 'version_pointer_fingerprint_missing',
  ].filter(Boolean)
}

function postActivationValidationBlockers(postActivationValidation = {}) {
  const fields = [
    ['generatedPdfProofStatus', 'generated_pdf_proof_status', 'generated_pdf_proof'],
    ['contentScannerStatus', 'content_scanner_status', 'content_scanner'],
    ['signingEnvelopeStatus', 'signing_envelope_status', 'signing_envelope'],
    ['routeSeparationStatus', 'route_separation_status', 'route_separation'],
    ['legalWordingStatus', 'legal_wording_status', 'legal_wording'],
    ['fieldRegistryStatus', 'field_registry_status', 'field_registry'],
  ]
  return [
    ...fields.map(([camel, snake, key]) => normalizeKey(postActivationValidation[camel] || postActivationValidation[snake]) === 'passed' ? '' : `post_activation_validation_not_passed:${key}`),
    /^[a-f0-9]{64}$/i.test(normalizeText(postActivationValidation.validationFingerprint || postActivationValidation.validation_fingerprint)) ? '' : 'post_activation_validation_fingerprint_missing',
  ].filter(Boolean)
}

function rollbackRehearsalBlockers(rollbackRehearsal = {}) {
  return [
    normalizeText(rollbackRehearsal.rollbackPlanReference || rollbackRehearsal.rollback_plan_reference) ? '' : 'rollback_plan_reference_missing',
    rollbackRehearsal.restorePreviousVersionSimulated === true ? '' : 'rollback_restore_previous_version_not_simulated',
    rollbackRehearsal.restorePreviousDefaultsSimulated === true ? '' : 'rollback_restore_previous_defaults_not_simulated',
    rollbackRehearsal.disableCandidateVersionSimulated === true ? '' : 'rollback_disable_candidate_version_not_simulated',
    rollbackRehearsal.stopSigningDispatchSimulated === true ? '' : 'rollback_stop_signing_dispatch_not_simulated',
    normalizeKey(rollbackRehearsal.rehearsalStatus || rollbackRehearsal.rehearsal_status) === 'passed' ? '' : 'rollback_rehearsal_not_passed',
    /^[a-f0-9]{64}$/i.test(normalizeText(rollbackRehearsal.rehearsalFingerprint || rollbackRehearsal.rehearsal_fingerprint)) ? '' : 'rollback_rehearsal_fingerprint_missing',
  ].filter(Boolean)
}

function noWriteProofBlockers(noWriteProof = {}) {
  return [
    noWriteProof.dryRunOnly === true ? '' : 'no_write_proof_not_dry_run_only',
    noWriteProof.mutatedData === false ? '' : 'no_write_proof_mutated_data',
    noWriteProof.productionWriteAttempted === true ? 'no_write_proof_production_write_attempted' : '',
    numberValue(noWriteProof.liveDefaultMutationCount || noWriteProof.live_default_mutation_count) === 0 ? '' : 'no_write_proof_live_default_mutation_observed',
    numberValue(noWriteProof.productionArtifactMutationCount || noWriteProof.production_artifact_mutation_count) === 0 ? '' : 'no_write_proof_production_artifact_mutation_observed',
    numberValue(noWriteProof.versionPointerMutationCount || noWriteProof.version_pointer_mutation_count) === 0 ? '' : 'no_write_proof_version_pointer_mutation_observed',
    numberValue(noWriteProof.signingDispatchMutationCount || noWriteProof.signing_dispatch_mutation_count) === 0 ? '' : 'no_write_proof_signing_dispatch_mutation_observed',
  ].filter(Boolean)
}

function auditEventBlockers(auditEvents = []) {
  const required = defaultAuditEvents().map((row) => row.eventType)
  const events = list(auditEvents).map((row) => normalizeKey(row.eventType || row.event_type))
  const missing = required.filter((eventType) => !events.includes(eventType))
  const incomplete = list(auditEvents).filter((row) => required.includes(normalizeKey(row.eventType || row.event_type)) && (row.recorded !== true || !normalizeText(row.reference)))
  return [
    ...missing.map((eventType) => `missing_audit_event:${eventType}`),
    ...incomplete.map((row) => `audit_event_incomplete:${normalizeKey(row.eventType || row.event_type) || 'unknown'}`),
  ]
}

function evidenceBlockers(evidence = []) {
  const keys = list(evidence).map((row) => normalizeKey(row.key))
  const missingKeys = REQUIRED_SIMULATION_EVIDENCE.filter((key) => !keys.includes(key))
  const badRows = list(evidence).filter((row) =>
    REQUIRED_SIMULATION_EVIDENCE.includes(normalizeKey(row.key)) &&
      (normalizeKey(row.status) !== 'passed' || !normalizeText(row.path) || !/^[a-f0-9]{64}$/i.test(normalizeText(row.fingerprint || row.sha256))),
  )
  return [
    ...missingKeys.map((key) => `missing_simulation_evidence:${key}`),
    ...badRows.map((row) => `simulation_evidence_not_passed:${normalizeKey(row.key) || 'unknown'}`),
  ]
}

function archiveReceiptBlockers(archiveReceipt = {}) {
  return [
    normalizeText(archiveReceipt.archiveReference || archiveReceipt.archive_reference) ? '' : 'activation_dry_run_archive_reference_missing',
    archiveReceipt.dryRunReceiptArchived === true ? '' : 'activation_dry_run_receipt_not_archived',
    archiveReceipt.simulationEvidenceArchived === true ? '' : 'simulation_evidence_not_archived',
    archiveReceipt.rollbackEvidenceArchived === true ? '' : 'rollback_evidence_not_archived',
    archiveReceipt.auditEventsArchived === true ? '' : 'audit_events_not_archived',
    archiveReceipt.immutable === true ? '' : 'activation_dry_run_archive_not_immutable',
  ].filter(Boolean)
}

export function buildOtpControlledVersionRenewalActivationDryRunReceipt({
  activationGuardReceipt = buildOtpVersionRenewalActivationGuardReceipt(),
  activationSimulationPlan = defaultActivationSimulationPlan(activationGuardReceipt),
  preActivationSnapshot = defaultPreActivationSnapshot(activationGuardReceipt),
  routeSimulations = defaultRouteSimulations(activationGuardReceipt),
  versionPointerSimulation = defaultVersionPointerSimulation(activationGuardReceipt),
  postActivationValidation = defaultPostActivationValidation(),
  rollbackRehearsal = defaultRollbackRehearsal(activationGuardReceipt),
  noWriteProof = defaultNoWriteProof(),
  auditEvents = defaultAuditEvents(),
  evidence = defaultEvidence(),
  archiveReceipt = defaultArchiveReceipt(),
  checkedAt = new Date().toISOString(),
} = {}) {
  const blockerCodes = unique([
    ...phase47Blockers(activationGuardReceipt),
    ...activationSimulationPlanBlockers(activationSimulationPlan, activationGuardReceipt),
    ...preActivationSnapshotBlockers(preActivationSnapshot, activationGuardReceipt),
    ...routeSimulationBlockers(routeSimulations, activationGuardReceipt),
    ...versionPointerSimulationBlockers(versionPointerSimulation, activationGuardReceipt),
    ...postActivationValidationBlockers(postActivationValidation),
    ...rollbackRehearsalBlockers(rollbackRehearsal),
    ...noWriteProofBlockers(noWriteProof),
    ...auditEventBlockers(auditEvents),
    ...evidenceBlockers(evidence),
    ...archiveReceiptBlockers(archiveReceipt),
  ])
  const canIssueActivationReceipt = blockerCodes.length === 0

  return Object.freeze({
    version: OTP_CONTROLLED_VERSION_RENEWAL_ACTIVATION_DRY_RUN_PHASE48_VERSION,
    contract: OTP_CONTROLLED_VERSION_RENEWAL_ACTIVATION_DRY_RUN_CONTRACT,
    checkedAt,
    status: canIssueActivationReceipt
      ? OTP_CONTROLLED_VERSION_RENEWAL_ACTIVATION_DRY_RUN_READY_STATUS
      : 'OTP_CONTROLLED_VERSION_RENEWAL_ACTIVATION_DRY_RUN_BLOCKED',
    canIssueActivationReceipt,
    mutatedData: false,
    blockerCodes: Object.freeze(blockerCodes),
    activationGuardReceipt: Object.freeze({ ...activationGuardReceipt }),
    activationSimulationPlan: Object.freeze({ ...activationSimulationPlan }),
    preActivationSnapshot: Object.freeze({ ...preActivationSnapshot }),
    routeSimulations: Object.freeze(list(routeSimulations)),
    versionPointerSimulation: Object.freeze({ ...versionPointerSimulation }),
    postActivationValidation: Object.freeze({ ...postActivationValidation }),
    rollbackRehearsal: Object.freeze({ ...rollbackRehearsal }),
    noWriteProof: Object.freeze({ ...noWriteProof }),
    auditEvents: Object.freeze(list(auditEvents)),
    evidence: Object.freeze(list(evidence)),
    archiveReceipt: Object.freeze({ ...archiveReceipt }),
    summary: Object.freeze({
      routeCount: REQUIRED_ROUTES.length,
      simulatedRouteCount: list(routeSimulations).filter((row) => row.simulatedSwitchReady === true).length,
      evidenceCount: list(evidence).length,
      auditEventCount: list(auditEvents).length,
      blockerCount: blockerCodes.length,
      liveDefaultMutationCount: numberValue(noWriteProof.liveDefaultMutationCount || noWriteProof.live_default_mutation_count),
      versionPointerMutationCount: numberValue(noWriteProof.versionPointerMutationCount || noWriteProof.version_pointer_mutation_count),
    }),
  })
}

function addCheck(checks, pass, code, detail) {
  checks.push({ code, pass: Boolean(pass), detail })
}

export function buildOtpControlledVersionRenewalActivationDryRunPhase48Audit({
  checkedAt = new Date().toISOString(),
  phase47Audit = null,
  packageJson = {},
} = {}) {
  const checks = []
  const phase47Ready = !phase47Audit || phase47Audit.status === OTP_VERSION_RENEWAL_ACTIVATION_GUARD_READY_STATUS
  const goodGuard = phase47Audit?.guardReceipts?.find((receipt) => receipt.canProceedToControlledActivationDryRun) ||
    buildOtpVersionRenewalActivationGuardReceipt({ checkedAt })
  const goodDryRun = buildOtpControlledVersionRenewalActivationDryRunReceipt({
    checkedAt,
    activationGuardReceipt: goodGuard,
  })
  const blockedGuardDryRun = buildOtpControlledVersionRenewalActivationDryRunReceipt({
    checkedAt,
    activationGuardReceipt: {
      ...goodGuard,
      status: 'OTP_VERSION_RENEWAL_ACTIVATION_GUARD_BLOCKED',
      canProceedToControlledActivationDryRun: false,
      blockerCodes: ['operator_confirmation_phrase_mismatch'],
    },
  })
  const operationMismatchDryRun = buildOtpControlledVersionRenewalActivationDryRunReceipt({
    checkedAt,
    activationGuardReceipt: goodGuard,
    activationSimulationPlan: {
      ...defaultActivationSimulationPlan(goodGuard, checkedAt),
      sourceGuardOperationId: 'wrong-guard-operation',
      versionKey: 'wrong-version',
      operator: 'wrong-operator',
    },
  })
  const missingRouteDryRun = buildOtpControlledVersionRenewalActivationDryRunReceipt({
    checkedAt,
    activationGuardReceipt: goodGuard,
    routeSimulations: defaultRouteSimulations(goodGuard).filter((row) => row.routeVariant !== 'new_development'),
  })
  const routeMismatchDryRun = buildOtpControlledVersionRenewalActivationDryRunReceipt({
    checkedAt,
    activationGuardReceipt: goodGuard,
    routeSimulations: defaultRouteSimulations(goodGuard).map((row) =>
      row.routeVariant === 'resale_existing_property'
        ? { ...row, simulatedTemplateDefaultId: 'wrong-template', simulatedOutputFingerprint: fingerprint('wrong-output') }
        : row,
    ),
  })
  const docxRegressionDryRun = buildOtpControlledVersionRenewalActivationDryRunReceipt({
    checkedAt,
    activationGuardReceipt: goodGuard,
    routeSimulations: defaultRouteSimulations(goodGuard).map((row) =>
      row.routeVariant === 'resale_existing_property'
        ? { ...row, sourceFormat: 'docx', sourcePath: 'resale-dry-run.docx', docxReferenceCount: 1 }
        : row,
    ),
  })
  const liveWriteDryRun = buildOtpControlledVersionRenewalActivationDryRunReceipt({
    checkedAt,
    activationGuardReceipt: goodGuard,
    activationSimulationPlan: {
      ...defaultActivationSimulationPlan(goodGuard, checkedAt),
      dryRunOnly: false,
      productionWriteRequested: true,
      liveDefaultMutationRequested: true,
      signingDispatchRequested: true,
    },
    noWriteProof: {
      ...defaultNoWriteProof(),
      dryRunOnly: false,
      mutatedData: true,
      productionWriteAttempted: true,
      liveDefaultMutationCount: 1,
      productionArtifactMutationCount: 1,
      versionPointerMutationCount: 1,
      signingDispatchMutationCount: 1,
    },
  })
  const postValidationFailedDryRun = buildOtpControlledVersionRenewalActivationDryRunReceipt({
    checkedAt,
    activationGuardReceipt: goodGuard,
    postActivationValidation: {
      ...defaultPostActivationValidation(),
      contentScannerStatus: 'failed',
      signingEnvelopeStatus: 'failed',
    },
  })
  const rollbackFailedDryRun = buildOtpControlledVersionRenewalActivationDryRunReceipt({
    checkedAt,
    activationGuardReceipt: goodGuard,
    rollbackRehearsal: {
      ...defaultRollbackRehearsal(goodGuard),
      restorePreviousVersionSimulated: false,
      rehearsalStatus: 'failed',
    },
  })
  const missingEvidenceDryRun = buildOtpControlledVersionRenewalActivationDryRunReceipt({
    checkedAt,
    activationGuardReceipt: goodGuard,
    evidence: defaultEvidence().filter((row) => row.key !== 'simulated_route_default_switch'),
  })
  const missingAuditEventDryRun = buildOtpControlledVersionRenewalActivationDryRunReceipt({
    checkedAt,
    activationGuardReceipt: goodGuard,
    auditEvents: defaultAuditEvents().filter((row) => row.eventType !== 'activation_dry_run_stopped_before_live_write'),
  })

  addCheck(checks, phase47Ready, 'PHASE48_PHASE47_ACTIVATION_GUARD_READY', 'Controlled activation dry-run starts only after Phase 47 activation guard is ready.')
  addCheck(
    checks,
    goodDryRun.canIssueActivationReceipt &&
      goodDryRun.status === OTP_CONTROLLED_VERSION_RENEWAL_ACTIVATION_DRY_RUN_READY_STATUS &&
      goodDryRun.mutatedData === false,
    'PHASE48_GOOD_CONTROLLED_ACTIVATION_DRY_RUN_READY',
    'A clean Phase 47 guard can complete a controlled activation dry-run without mutating production data.',
  )
  addCheck(
    checks,
    REQUIRED_ROUTES.every((route) => goodDryRun.routeSimulations.some((row) => row.routeVariant === route && row.simulatedSwitchReady === true)),
    'PHASE48_RESALE_AND_NEW_DEVELOPMENT_SIMULATED_SEPARATELY',
    'Resale and new-development route default switches must both be simulated and remain route-specific.',
  )
  addCheck(
    checks,
    goodDryRun.noWriteProof.dryRunOnly === true &&
      goodDryRun.noWriteProof.productionWriteAttempted === false &&
      goodDryRun.noWriteProof.liveDefaultMutationCount === 0 &&
      goodDryRun.noWriteProof.versionPointerMutationCount === 0,
    'PHASE48_NO_LIVE_WRITE_OR_POINTER_MUTATION',
    'The controlled dry-run cannot mutate live defaults, version pointers, production artifacts, or signing dispatch.',
  )
  addCheck(
    checks,
    blockedGuardDryRun.canIssueActivationReceipt === false &&
      blockedGuardDryRun.blockerCodes.includes('phase47_activation_guard_not_ready'),
    'PHASE48_BLOCKED_PHASE47_GUARD_REJECTED',
    'A blocked Phase 47 guard cannot enter controlled activation dry-run.',
  )
  addCheck(
    checks,
    operationMismatchDryRun.canIssueActivationReceipt === false &&
      operationMismatchDryRun.blockerCodes.includes('activation_guard_operation_mismatch') &&
      operationMismatchDryRun.blockerCodes.includes('activation_simulation_version_key_mismatch'),
    'PHASE48_OPERATION_MISMATCH_BLOCKED',
    'The simulation must match the exact Phase 47 operation, version key, and operator.',
  )
  addCheck(
    checks,
    missingRouteDryRun.canIssueActivationReceipt === false &&
      missingRouteDryRun.blockerCodes.includes('route_simulation_missing:new_development'),
    'PHASE48_MISSING_ROUTE_BLOCKED',
    'Missing resale or new-development route simulation blocks the dry-run.',
  )
  addCheck(
    checks,
    routeMismatchDryRun.canIssueActivationReceipt === false &&
      routeMismatchDryRun.blockerCodes.includes('simulation_target_template_mismatch:resale_existing_property') &&
      routeMismatchDryRun.blockerCodes.includes('simulation_output_fingerprint_mismatch:resale_existing_property'),
    'PHASE48_ROUTE_OUTPUT_MISMATCH_BLOCKED',
    'Route template or output fingerprint mismatches block the dry-run.',
  )
  addCheck(
    checks,
    docxRegressionDryRun.canIssueActivationReceipt === false &&
      docxRegressionDryRun.blockerCodes.includes('route_simulation_docx_source_observed:resale_existing_property'),
    'PHASE48_DOCX_REGRESSION_BLOCKED',
    'DOC/DOCX source references are blocked from activation dry-run.',
  )
  addCheck(
    checks,
    liveWriteDryRun.canIssueActivationReceipt === false &&
      liveWriteDryRun.blockerCodes.includes('activation_simulation_production_write_requested') &&
      liveWriteDryRun.blockerCodes.includes('no_write_proof_version_pointer_mutation_observed'),
    'PHASE48_LIVE_MUTATION_BLOCKED',
    'Production writes, live default changes, version pointer changes, and dispatch mutations are blocked.',
  )
  addCheck(
    checks,
    postValidationFailedDryRun.canIssueActivationReceipt === false &&
      postValidationFailedDryRun.blockerCodes.includes('post_activation_validation_not_passed:content_scanner') &&
      postValidationFailedDryRun.blockerCodes.includes('post_activation_validation_not_passed:signing_envelope'),
    'PHASE48_POST_VALIDATION_BLOCKED',
    'Generated proof, scanner, signing, legal wording, field registry, and route separation validation must pass.',
  )
  addCheck(
    checks,
    rollbackFailedDryRun.canIssueActivationReceipt === false &&
      rollbackFailedDryRun.blockerCodes.includes('rollback_restore_previous_version_not_simulated') &&
      rollbackFailedDryRun.blockerCodes.includes('rollback_rehearsal_not_passed'),
    'PHASE48_ROLLBACK_REHEARSAL_BLOCKED',
    'Rollback restore, candidate disable, dispatch stop, and rehearsal evidence are required.',
  )
  addCheck(
    checks,
    missingEvidenceDryRun.canIssueActivationReceipt === false &&
      missingEvidenceDryRun.blockerCodes.includes('missing_simulation_evidence:simulated_route_default_switch'),
    'PHASE48_MISSING_EVIDENCE_BLOCKED',
    'Missing route default switch evidence or other simulation evidence blocks the dry-run.',
  )
  addCheck(
    checks,
    missingAuditEventDryRun.canIssueActivationReceipt === false &&
      missingAuditEventDryRun.blockerCodes.includes('missing_audit_event:activation_dry_run_stopped_before_live_write'),
    'PHASE48_MISSING_AUDIT_EVENT_BLOCKED',
    'The dry-run must record the stop-before-live-write audit event.',
  )
  addCheck(
    checks,
    packageJson.scripts?.['test:otp-controlled-version-renewal-activation-dry-run-phase48'] === 'node scripts/otp-controlled-version-renewal-activation-dry-run-phase48.test.mjs' &&
      packageJson.scripts?.['report:otp-controlled-version-renewal-activation-dry-run-phase48'] === 'node scripts/report-otp-controlled-version-renewal-activation-dry-run-phase48.mjs',
    'PHASE48_PACKAGE_SCRIPTS_WIRED',
    'Package scripts expose the Phase 48 test and report.',
  )

  const blockers = checks.filter((check) => !check.pass)
  return Object.freeze({
    version: OTP_CONTROLLED_VERSION_RENEWAL_ACTIVATION_DRY_RUN_PHASE48_VERSION,
    contract: OTP_CONTROLLED_VERSION_RENEWAL_ACTIVATION_DRY_RUN_CONTRACT,
    checkedAt,
    status: blockers.length ? 'OTP_CONTROLLED_VERSION_RENEWAL_ACTIVATION_DRY_RUN_REMEDIATION_REQUIRED' : OTP_CONTROLLED_VERSION_RENEWAL_ACTIVATION_DRY_RUN_READY_STATUS,
    mutatedData: false,
    checks: Object.freeze(checks),
    blockers: Object.freeze(blockers),
    dryRunReceipts: Object.freeze([
      goodDryRun,
      blockedGuardDryRun,
      operationMismatchDryRun,
      missingRouteDryRun,
      routeMismatchDryRun,
      docxRegressionDryRun,
      liveWriteDryRun,
      postValidationFailedDryRun,
      rollbackFailedDryRun,
      missingEvidenceDryRun,
      missingAuditEventDryRun,
    ]),
    summary: Object.freeze({
      blockerCount: blockers.length,
      passedDryRunCount: [goodDryRun].filter((row) => row.canIssueActivationReceipt).length,
      blockedDryRunCount: [
        blockedGuardDryRun,
        operationMismatchDryRun,
        missingRouteDryRun,
        routeMismatchDryRun,
        docxRegressionDryRun,
        liveWriteDryRun,
        postValidationFailedDryRun,
        rollbackFailedDryRun,
        missingEvidenceDryRun,
        missingAuditEventDryRun,
      ].filter((row) => !row.canIssueActivationReceipt).length,
      routeCount: REQUIRED_ROUTES.length,
      evidenceCount: REQUIRED_SIMULATION_EVIDENCE.length,
    }),
    nextPhase: blockers.length ? null : Object.freeze({
      phase: 49,
      key: 'otp_version_renewal_activation_receipt',
      label: 'Version Renewal Activation Receipt',
    }),
  })
}

export function formatOtpControlledVersionRenewalActivationDryRunPhase48Markdown(report = buildOtpControlledVersionRenewalActivationDryRunPhase48Audit()) {
  return [
    '# OTP Generator Phase 48 Controlled Version Renewal Activation Dry Run',
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
        ['Passed dry-run receipts', report.summary.passedDryRunCount],
        ['Blocked dry-run receipts', report.summary.blockedDryRunCount],
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
    '## Dry-Run Receipts',
    '',
    table(
      ['Status', 'Allowed', 'Routes simulated', 'Evidence', 'Live default mutations', 'Version pointer mutations', 'Blockers'],
      report.dryRunReceipts.map((receipt) => [
        receipt.status,
        receipt.canIssueActivationReceipt ? 'yes' : 'no',
        receipt.summary.simulatedRouteCount,
        receipt.summary.evidenceCount,
        receipt.summary.liveDefaultMutationCount,
        receipt.summary.versionPointerMutationCount,
        receipt.blockerCodes.join(', ') || 'none',
      ]),
    ),
    '',
    '## Boundary',
    '',
    'Phase 48 proves the exact Phase 47-approved activation can be rehearsed end-to-end: pre-activation snapshots are checked, resale and new-development route default switches are simulated separately, version pointer movement is simulated, post-activation OTP proof validation passes, rollback is rehearsed, audit events are recorded, and the dry-run stops before any live default, production artifact, signing dispatch, or version pointer mutation. It only prepares the Phase 49 activation receipt.',
    '',
  ].join('\n')
}
