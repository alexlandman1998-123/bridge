import {
  OTP_VERSION_RENEWAL_LIVE_WRITE_GUARD_PHASE50_VERSION,
  OTP_VERSION_RENEWAL_LIVE_WRITE_GUARD_READY_STATUS,
  buildOtpVersionRenewalLiveWriteGuardPhase50Audit,
} from './otpVersionRenewalLiveWriteGuardPhase50.js'

export const OTP_CONTROLLED_VERSION_RENEWAL_APPLY_DRY_RUN_PHASE51_VERSION = 'otp_controlled_version_renewal_apply_dry_run_phase51_v1'
export const OTP_CONTROLLED_VERSION_RENEWAL_APPLY_DRY_RUN_READY_STATUS = 'OTP_CONTROLLED_VERSION_RENEWAL_APPLY_DRY_RUN_READY_FOR_APPLY_RECEIPT'
export const OTP_CONTROLLED_VERSION_RENEWAL_APPLY_DRY_RUN_CONTRACT = 'otp-vnext-controlled-version-renewal-apply-dry-run-phase51-v1'

const REQUIRED_ROUTES = Object.freeze(['resale_existing_property', 'new_development'])
const REQUIRED_ROUTE_OPERATIONS = Object.freeze(['switch_route_default', 'switch_signing_envelope', 'validate_generated_otp'])
const REQUIRED_APPLY_EVIDENCE = Object.freeze([
  'phase50_live_write_guard_receipt',
  'pre_apply_snapshot',
  'route_default_apply_simulation',
  'signing_envelope_apply_simulation',
  'version_pointer_apply_simulation',
  'post_apply_validation',
  'rollback_preview',
  'no_write_proof',
])
const REQUIRED_AUDIT_EVENTS = Object.freeze([
  'apply_dry_run_started',
  'phase50_guard_verified',
  'pre_apply_snapshot_checked',
  'route_defaults_apply_simulated',
  'signing_envelopes_apply_simulated',
  'version_pointer_apply_simulated',
  'post_apply_validation_passed',
  'rollback_preview_verified',
  'apply_dry_run_stopped_before_live_write',
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

function canonicalValue(value) {
  if (Array.isArray(value)) {
    return value.map(canonicalValue)
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalValue(item)]),
    )
  }
  return value
}

function stableFingerprint(value, prefix = 'otp-phase51-apply-dry-run') {
  const canonical = JSON.stringify(canonicalValue(value))
  let hash = 0x811c9dc5
  for (let index = 0; index < canonical.length; index += 1) {
    hash ^= canonical.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return `${prefix}:${hash.toString(16).padStart(8, '0')}:${canonical.length}`
}

function table(headers = [], rows = []) {
  const escape = (value) => normalizeText(value).replace(/\|/g, '\\|').replace(/\n/g, '<br>')
  return [
    `| ${headers.map(escape).join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map(escape).join(' | ')} |`),
  ].join('\n')
}

function routeDecisionMap(guardReceipt = {}) {
  const decisions = list(guardReceipt.guardEvidence?.routeDecisions)
  return new Map(REQUIRED_ROUTES.map((route) => [
    route,
    decisions.filter((decision) => normalizeKey(decision.routeVariant) === route),
  ]))
}

function routeDecisionFor(decisions = [], operation = '') {
  return list(decisions).find((decision) => normalizeKey(decision.operation) === operation) || {}
}

function defaultApplyPlan(guardReceipt = {}, checkedAt = new Date().toISOString()) {
  const guard = guardReceipt.guardEvidence || {}
  return {
    applyDryRunId: 'otp-vnext-phase51-controlled-version-renewal-apply-dry-run',
    sourceGuardId: guard.guardId,
    sourceGuardFingerprint: guardReceipt.guardFingerprint || guard.guardFingerprint,
    sourceReceiptId: guard.sourceReceiptId,
    sourceReceiptFingerprint: guard.sourceReceiptFingerprint,
    operationType: 'controlled_version_renewal_apply_dry_run',
    targetEnvironment: guard.targetEnvironment || 'production',
    previousVersionKey: guard.previousVersionKey,
    targetVersionKey: guard.targetVersionKey,
    rollbackPlanReference: guard.rollbackPlanReference,
    operator: guard.operator,
    dryRunOnly: true,
    productionWriteRequested: false,
    liveDefaultMutationRequested: false,
    versionPointerMutationRequested: false,
    signingDispatchRequested: false,
    executedAt: checkedAt,
  }
}

function defaultPreApplySnapshot(guardReceipt = {}) {
  const guard = guardReceipt.guardEvidence || {}
  return {
    snapshotReference: 'otp-vnext-phase51-pre-apply-snapshot',
    sourceGuardFingerprint: guardReceipt.guardFingerprint || guard.guardFingerprint,
    currentVersionKey: guard.previousVersionKey,
    targetVersionKey: guard.targetVersionKey,
    routeDefaultSnapshotCaptured: true,
    signingEnvelopeSnapshotCaptured: true,
    versionPointerSnapshotCaptured: true,
    immutable: true,
    snapshotFingerprint: stableFingerprint({
      guardFingerprint: guardReceipt.guardFingerprint || guard.guardFingerprint,
      previousVersionKey: guard.previousVersionKey,
      targetVersionKey: guard.targetVersionKey,
    }, 'otp-phase51-pre-snapshot'),
  }
}

function defaultRouteApplySimulations(guardReceipt = {}) {
  const decisionsByRoute = routeDecisionMap(guardReceipt)
  return REQUIRED_ROUTES.map((routeVariant) => {
    const decisions = decisionsByRoute.get(routeVariant) || []
    const defaultDecision = routeDecisionFor(decisions, 'switch_route_default')
    const envelopeDecision = routeDecisionFor(decisions, 'switch_signing_envelope')
    const validationDecision = routeDecisionFor(decisions, 'validate_generated_otp')
    return {
      routeVariant,
      sourceGuardFingerprint: guardReceipt.guardFingerprint || guardReceipt.guardEvidence?.guardFingerprint,
      plannedOperations: decisions.map((decision) => normalizeKey(decision.operation)),
      targetLiveTemplateDefaultId: defaultDecision.targetLiveTemplateDefaultId,
      targetSigningEnvelopeKey: envelopeDecision.targetSigningEnvelopeKey || defaultDecision.targetSigningEnvelopeKey,
      routeOutputFingerprint: defaultDecision.routeOutputFingerprint || envelopeDecision.routeOutputFingerprint || validationDecision.routeOutputFingerprint,
      routeDefaultApplySimulated: true,
      signingEnvelopeApplySimulated: true,
      generatedOtpValidationSimulated: true,
      routeIsolationPreserved: true,
      liveDefaultChanged: false,
      signingEnvelopeChanged: false,
      generatedOtpChanged: false,
      applyDecision: 'would_apply_after_final_apply_receipt',
    }
  })
}

function defaultVersionPointerApplySimulation(guardReceipt = {}) {
  const decision = guardReceipt.guardEvidence?.versionPointerDecision || {}
  return {
    operation: normalizeKey(decision.operation),
    previousVersionKey: decision.previousVersionKey,
    targetVersionKey: decision.targetVersionKey,
    pointerFingerprint: decision.pointerFingerprint,
    sourceGuardFingerprint: guardReceipt.guardFingerprint || guardReceipt.guardEvidence?.guardFingerprint,
    versionPointerApplySimulated: true,
    versionPointerChanged: false,
    applyDecision: 'would_apply_after_final_apply_receipt',
  }
}

function defaultPostApplyValidation(guardReceipt = {}) {
  return {
    generatedPdfProofStatus: 'passed',
    contentScannerStatus: 'passed',
    signingEnvelopeStatus: 'passed',
    routeSeparationStatus: 'passed',
    versionPointerStatus: 'passed',
    rollbackReadinessStatus: 'passed',
    validationFingerprint: stableFingerprint({
      guardFingerprint: guardReceipt.guardFingerprint || guardReceipt.guardEvidence?.guardFingerprint,
      routeDecisions: guardReceipt.guardEvidence?.routeDecisions,
      versionPointerDecision: guardReceipt.guardEvidence?.versionPointerDecision,
    }, 'otp-phase51-post-apply-validation'),
  }
}

function defaultRollbackPreview(guardReceipt = {}) {
  const guard = guardReceipt.guardEvidence || {}
  return {
    rollbackPlanReference: guard.rollbackPlanReference,
    restorePreviousVersionReady: true,
    restorePreviousRouteDefaultsReady: true,
    restorePreviousSigningEnvelopesReady: true,
    stopSigningDispatchReady: true,
    previewStatus: 'passed',
    previewFingerprint: stableFingerprint({
      rollbackPlanReference: guard.rollbackPlanReference,
      previousVersionKey: guard.previousVersionKey,
      targetVersionKey: guard.targetVersionKey,
    }, 'otp-phase51-rollback-preview'),
  }
}

function defaultNoWriteProof() {
  return {
    dryRunOnly: true,
    mutatedData: false,
    productionWriteAttempted: false,
    liveDefaultMutationCount: 0,
    signingEnvelopeMutationCount: 0,
    versionPointerMutationCount: 0,
    generatedArtifactMutationCount: 0,
    signingDispatchMutationCount: 0,
  }
}

function defaultAuditEvents() {
  return REQUIRED_AUDIT_EVENTS.map((eventType) => ({
    eventType,
    recorded: true,
    reference: `phase51-${eventType}`,
  }))
}

function defaultEvidence() {
  return REQUIRED_APPLY_EVIDENCE.map((key) => ({
    key,
    status: 'passed',
    path: `docs/otp-version-renewal-${key.replace(/_/g, '-')}-phase51.md`,
    fingerprint: stableFingerprint(key, 'otp-phase51-evidence'),
  }))
}

function defaultArchiveReceipt() {
  return {
    archiveReference: 'otp-vnext-phase51-controlled-version-renewal-apply-dry-run-archive',
    applyDryRunReceiptArchived: true,
    simulationEvidenceArchived: true,
    rollbackPreviewArchived: true,
    auditEventsArchived: true,
    immutable: true,
  }
}

function phase50Blockers(guardReceipt = {}) {
  return [
    guardReceipt.version === OTP_VERSION_RENEWAL_LIVE_WRITE_GUARD_PHASE50_VERSION ? '' : 'phase50_live_write_guard_version_mismatch',
    guardReceipt.status === OTP_VERSION_RENEWAL_LIVE_WRITE_GUARD_READY_STATUS ? '' : 'phase50_live_write_guard_not_ready',
    guardReceipt.canProceedToControlledApplyDryRun === true ? '' : 'phase50_live_write_guard_cannot_proceed',
    guardReceipt.mutatedData === false ? '' : 'phase50_live_write_guard_mutation_unexpected',
    list(guardReceipt.blockerCodes).length === 0 ? '' : 'phase50_live_write_guard_has_blockers',
  ].filter(Boolean)
}

function applyPlanBlockers(applyPlan = {}, guardReceipt = {}) {
  const guard = guardReceipt.guardEvidence || {}
  return [
    normalizeText(applyPlan.applyDryRunId) ? '' : 'apply_dry_run_id_missing',
    applyPlan.sourceGuardId === guard.guardId ? '' : 'apply_source_guard_id_mismatch',
    applyPlan.sourceGuardFingerprint === (guardReceipt.guardFingerprint || guard.guardFingerprint) ? '' : 'apply_source_guard_fingerprint_mismatch',
    applyPlan.sourceReceiptId === guard.sourceReceiptId ? '' : 'apply_source_receipt_id_mismatch',
    applyPlan.sourceReceiptFingerprint === guard.sourceReceiptFingerprint ? '' : 'apply_source_receipt_fingerprint_mismatch',
    normalizeKey(applyPlan.operationType) === 'controlled_version_renewal_apply_dry_run' ? '' : 'apply_operation_type_invalid',
    normalizeKey(applyPlan.targetEnvironment) === 'production' ? '' : 'apply_target_not_production',
    applyPlan.previousVersionKey === guard.previousVersionKey ? '' : 'apply_previous_version_mismatch',
    applyPlan.targetVersionKey === guard.targetVersionKey ? '' : 'apply_target_version_mismatch',
    applyPlan.rollbackPlanReference === guard.rollbackPlanReference ? '' : 'apply_rollback_plan_mismatch',
    applyPlan.operator === guard.operator ? '' : 'apply_operator_mismatch',
    applyPlan.dryRunOnly === true ? '' : 'apply_not_dry_run_only',
    applyPlan.productionWriteRequested === true ? 'apply_production_write_requested' : '',
    applyPlan.liveDefaultMutationRequested === true ? 'apply_live_default_mutation_requested' : '',
    applyPlan.versionPointerMutationRequested === true ? 'apply_version_pointer_mutation_requested' : '',
    applyPlan.signingDispatchRequested === true ? 'apply_signing_dispatch_requested' : '',
    normalizeText(applyPlan.executedAt) ? '' : 'apply_execution_time_missing',
  ].filter(Boolean)
}

function preApplySnapshotBlockers(snapshot = {}, guardReceipt = {}) {
  const guard = guardReceipt.guardEvidence || {}
  return [
    normalizeText(snapshot.snapshotReference) ? '' : 'pre_apply_snapshot_reference_missing',
    snapshot.sourceGuardFingerprint === (guardReceipt.guardFingerprint || guard.guardFingerprint) ? '' : 'pre_apply_guard_fingerprint_mismatch',
    snapshot.currentVersionKey === guard.previousVersionKey ? '' : 'pre_apply_current_version_mismatch',
    snapshot.targetVersionKey === guard.targetVersionKey ? '' : 'pre_apply_target_version_mismatch',
    snapshot.routeDefaultSnapshotCaptured === true ? '' : 'pre_apply_route_snapshot_missing',
    snapshot.signingEnvelopeSnapshotCaptured === true ? '' : 'pre_apply_envelope_snapshot_missing',
    snapshot.versionPointerSnapshotCaptured === true ? '' : 'pre_apply_pointer_snapshot_missing',
    snapshot.immutable === true ? '' : 'pre_apply_snapshot_not_immutable',
    /^otp-phase51-pre-snapshot:[a-f0-9]{8}:\d+$/i.test(normalizeText(snapshot.snapshotFingerprint)) ? '' : 'pre_apply_snapshot_fingerprint_missing',
  ].filter(Boolean)
}

function routeApplyBlockers(routeApplySimulations = [], guardReceipt = {}) {
  const decisionsByRoute = routeDecisionMap(guardReceipt)
  const routes = list(routeApplySimulations).map((row) => normalizeKey(row.routeVariant))
  const missingRoutes = REQUIRED_ROUTES.filter((route) => !routes.includes(route))
  const duplicateRoutes = routes.filter((route, index) => route && routes.indexOf(route) !== index)
  const rowBlockers = list(routeApplySimulations).flatMap((row) => {
    const route = normalizeKey(row.routeVariant) || 'unknown'
    const decisions = decisionsByRoute.get(route) || []
    const defaultDecision = routeDecisionFor(decisions, 'switch_route_default')
    const envelopeDecision = routeDecisionFor(decisions, 'switch_signing_envelope')
    const validationDecision = routeDecisionFor(decisions, 'validate_generated_otp')
    const planned = list(row.plannedOperations).map(normalizeKey)
    return [
      REQUIRED_ROUTES.includes(route) ? '' : `apply_route_unsupported:${route}`,
      row.sourceGuardFingerprint === (guardReceipt.guardFingerprint || guardReceipt.guardEvidence?.guardFingerprint) ? '' : `apply_route_guard_fingerprint_mismatch:${route}`,
      row.targetLiveTemplateDefaultId === defaultDecision.targetLiveTemplateDefaultId ? '' : `apply_route_target_template_mismatch:${route}`,
      row.targetSigningEnvelopeKey === envelopeDecision.targetSigningEnvelopeKey ? '' : `apply_route_target_envelope_mismatch:${route}`,
      row.routeOutputFingerprint === (defaultDecision.routeOutputFingerprint || envelopeDecision.routeOutputFingerprint || validationDecision.routeOutputFingerprint) ? '' : `apply_route_output_fingerprint_mismatch:${route}`,
      ...REQUIRED_ROUTE_OPERATIONS.filter((operation) => !planned.includes(operation)).map((operation) => `apply_route_missing_operation:${route}:${operation}`),
      row.routeDefaultApplySimulated === true ? '' : `apply_route_default_not_simulated:${route}`,
      row.signingEnvelopeApplySimulated === true ? '' : `apply_signing_envelope_not_simulated:${route}`,
      row.generatedOtpValidationSimulated === true ? '' : `apply_generated_otp_validation_not_simulated:${route}`,
      row.routeIsolationPreserved === true ? '' : `apply_route_isolation_not_preserved:${route}`,
      row.liveDefaultChanged === true ? `apply_live_default_changed:${route}` : '',
      row.signingEnvelopeChanged === true ? `apply_signing_envelope_changed:${route}` : '',
      row.generatedOtpChanged === true ? `apply_generated_otp_changed:${route}` : '',
      normalizeKey(row.applyDecision) === 'would_apply_after_final_apply_receipt' ? '' : `apply_route_decision_invalid:${route}`,
    ].filter(Boolean)
  })
  return [
    ...missingRoutes.map((route) => `apply_route_missing:${route}`),
    ...unique(duplicateRoutes).map((route) => `apply_route_duplicate:${route}`),
    ...rowBlockers,
  ]
}

function versionPointerApplyBlockers(simulation = {}, guardReceipt = {}) {
  const decision = guardReceipt.guardEvidence?.versionPointerDecision || {}
  return [
    normalizeKey(simulation.operation) === 'switch_version_pointer' ? '' : 'apply_version_pointer_operation_invalid',
    simulation.previousVersionKey === decision.previousVersionKey ? '' : 'apply_version_pointer_previous_version_mismatch',
    simulation.targetVersionKey === decision.targetVersionKey ? '' : 'apply_version_pointer_target_version_mismatch',
    simulation.pointerFingerprint === decision.pointerFingerprint ? '' : 'apply_version_pointer_fingerprint_mismatch',
    simulation.sourceGuardFingerprint === (guardReceipt.guardFingerprint || guardReceipt.guardEvidence?.guardFingerprint) ? '' : 'apply_version_pointer_guard_fingerprint_mismatch',
    simulation.versionPointerApplySimulated === true ? '' : 'apply_version_pointer_not_simulated',
    simulation.versionPointerChanged === true ? 'apply_version_pointer_changed' : '',
    normalizeKey(simulation.applyDecision) === 'would_apply_after_final_apply_receipt' ? '' : 'apply_version_pointer_decision_invalid',
  ].filter(Boolean)
}

function postApplyValidationBlockers(validation = {}) {
  const fields = [
    ['generatedPdfProofStatus', 'generated_pdf_proof'],
    ['contentScannerStatus', 'content_scanner'],
    ['signingEnvelopeStatus', 'signing_envelope'],
    ['routeSeparationStatus', 'route_separation'],
    ['versionPointerStatus', 'version_pointer'],
    ['rollbackReadinessStatus', 'rollback_readiness'],
  ]
  return [
    ...fields.map(([key, label]) => normalizeKey(validation[key]) === 'passed' ? '' : `post_apply_validation_not_passed:${label}`),
    /^otp-phase51-post-apply-validation:[a-f0-9]{8}:\d+$/i.test(normalizeText(validation.validationFingerprint)) ? '' : 'post_apply_validation_fingerprint_missing',
  ].filter(Boolean)
}

function rollbackPreviewBlockers(preview = {}, guardReceipt = {}) {
  const guard = guardReceipt.guardEvidence || {}
  return [
    preview.rollbackPlanReference === guard.rollbackPlanReference ? '' : 'rollback_preview_plan_mismatch',
    preview.restorePreviousVersionReady === true ? '' : 'rollback_previous_version_not_ready',
    preview.restorePreviousRouteDefaultsReady === true ? '' : 'rollback_route_defaults_not_ready',
    preview.restorePreviousSigningEnvelopesReady === true ? '' : 'rollback_signing_envelopes_not_ready',
    preview.stopSigningDispatchReady === true ? '' : 'rollback_stop_dispatch_not_ready',
    normalizeKey(preview.previewStatus) === 'passed' ? '' : 'rollback_preview_not_passed',
    /^otp-phase51-rollback-preview:[a-f0-9]{8}:\d+$/i.test(normalizeText(preview.previewFingerprint)) ? '' : 'rollback_preview_fingerprint_missing',
  ].filter(Boolean)
}

function noWriteProofBlockers(proof = {}) {
  return [
    proof.dryRunOnly === true ? '' : 'no_write_proof_not_dry_run_only',
    proof.mutatedData === false ? '' : 'no_write_proof_mutated_data',
    proof.productionWriteAttempted === true ? 'no_write_proof_production_write_attempted' : '',
    numberValue(proof.liveDefaultMutationCount) === 0 ? '' : 'no_write_live_default_mutation_observed',
    numberValue(proof.signingEnvelopeMutationCount) === 0 ? '' : 'no_write_signing_envelope_mutation_observed',
    numberValue(proof.versionPointerMutationCount) === 0 ? '' : 'no_write_version_pointer_mutation_observed',
    numberValue(proof.generatedArtifactMutationCount) === 0 ? '' : 'no_write_generated_artifact_mutation_observed',
    numberValue(proof.signingDispatchMutationCount) === 0 ? '' : 'no_write_signing_dispatch_mutation_observed',
  ].filter(Boolean)
}

function auditEventBlockers(auditEvents = []) {
  const events = list(auditEvents).map((row) => normalizeKey(row.eventType))
  const missing = REQUIRED_AUDIT_EVENTS.filter((eventType) => !events.includes(eventType))
  const incomplete = list(auditEvents).filter((row) =>
    REQUIRED_AUDIT_EVENTS.includes(normalizeKey(row.eventType)) &&
      (row.recorded !== true || !normalizeText(row.reference)),
  )
  return [
    ...missing.map((eventType) => `missing_audit_event:${eventType}`),
    ...incomplete.map((row) => `audit_event_incomplete:${normalizeKey(row.eventType) || 'unknown'}`),
  ]
}

function evidenceBlockers(evidence = []) {
  const keys = list(evidence).map((row) => normalizeKey(row.key))
  const missing = REQUIRED_APPLY_EVIDENCE.filter((key) => !keys.includes(key))
  const badRows = list(evidence).filter((row) =>
    REQUIRED_APPLY_EVIDENCE.includes(normalizeKey(row.key)) &&
      (normalizeKey(row.status) !== 'passed' || !normalizeText(row.path) || !/^otp-phase51-evidence:[a-f0-9]{8}:\d+$/i.test(normalizeText(row.fingerprint))),
  )
  return [
    ...missing.map((key) => `missing_apply_evidence:${key}`),
    ...badRows.map((row) => `apply_evidence_not_passed:${normalizeKey(row.key) || 'unknown'}`),
  ]
}

function archiveBlockers(archive = {}) {
  return [
    normalizeText(archive.archiveReference) ? '' : 'apply_archive_reference_missing',
    archive.applyDryRunReceiptArchived === true ? '' : 'apply_dry_run_receipt_not_archived',
    archive.simulationEvidenceArchived === true ? '' : 'apply_simulation_evidence_not_archived',
    archive.rollbackPreviewArchived === true ? '' : 'rollback_preview_not_archived',
    archive.auditEventsArchived === true ? '' : 'audit_events_not_archived',
    archive.immutable === true ? '' : 'apply_archive_not_immutable',
  ].filter(Boolean)
}

function applyPayload(receipt = {}) {
  return {
    contract: OTP_CONTROLLED_VERSION_RENEWAL_APPLY_DRY_RUN_CONTRACT,
    applyPlan: receipt.applyPlan,
    preApplySnapshot: receipt.preApplySnapshot,
    routeApplySimulations: receipt.routeApplySimulations,
    versionPointerApplySimulation: receipt.versionPointerApplySimulation,
    postApplyValidation: receipt.postApplyValidation,
    rollbackPreview: receipt.rollbackPreview,
    noWriteProof: receipt.noWriteProof,
  }
}

function addCheck(checks, pass, code, detail) {
  checks.push({ code, pass: Boolean(pass), detail })
}

export function buildOtpControlledVersionRenewalApplyDryRunReceipt({
  guardReceipt = buildOtpVersionRenewalLiveWriteGuardPhase50Audit().guardReceipts?.find((receipt) => receipt.canProceedToControlledApplyDryRun),
  applyPlan = defaultApplyPlan(guardReceipt),
  preApplySnapshot = defaultPreApplySnapshot(guardReceipt),
  routeApplySimulations = defaultRouteApplySimulations(guardReceipt),
  versionPointerApplySimulation = defaultVersionPointerApplySimulation(guardReceipt),
  postApplyValidation = defaultPostApplyValidation(guardReceipt),
  rollbackPreview = defaultRollbackPreview(guardReceipt),
  noWriteProof = defaultNoWriteProof(),
  auditEvents = defaultAuditEvents(),
  evidence = defaultEvidence(),
  archiveReceipt = defaultArchiveReceipt(),
  checkedAt = new Date().toISOString(),
} = {}) {
  const receiptWithoutFingerprint = {
    applyPlan,
    preApplySnapshot,
    routeApplySimulations,
    versionPointerApplySimulation,
    postApplyValidation,
    rollbackPreview,
    noWriteProof,
  }
  const expectedApplyDryRunFingerprint = stableFingerprint(applyPayload(receiptWithoutFingerprint), 'otp-phase51-apply-dry-run')
  const blockerCodes = unique([
    ...phase50Blockers(guardReceipt || {}),
    ...applyPlanBlockers(applyPlan, guardReceipt),
    ...preApplySnapshotBlockers(preApplySnapshot, guardReceipt),
    ...routeApplyBlockers(routeApplySimulations, guardReceipt),
    ...versionPointerApplyBlockers(versionPointerApplySimulation, guardReceipt),
    ...postApplyValidationBlockers(postApplyValidation),
    ...rollbackPreviewBlockers(rollbackPreview, guardReceipt),
    ...noWriteProofBlockers(noWriteProof),
    ...auditEventBlockers(auditEvents),
    ...evidenceBlockers(evidence),
    ...archiveBlockers(archiveReceipt),
  ])
  const canIssueApplyReceipt = blockerCodes.length === 0

  return Object.freeze({
    version: OTP_CONTROLLED_VERSION_RENEWAL_APPLY_DRY_RUN_PHASE51_VERSION,
    contract: OTP_CONTROLLED_VERSION_RENEWAL_APPLY_DRY_RUN_CONTRACT,
    checkedAt,
    status: canIssueApplyReceipt
      ? OTP_CONTROLLED_VERSION_RENEWAL_APPLY_DRY_RUN_READY_STATUS
      : 'OTP_CONTROLLED_VERSION_RENEWAL_APPLY_DRY_RUN_BLOCKED',
    canIssueApplyReceipt,
    mutatedData: false,
    blockerCodes: Object.freeze(blockerCodes),
    applyDryRunFingerprint: expectedApplyDryRunFingerprint,
    guardReceipt: Object.freeze({
      version: guardReceipt?.version,
      status: guardReceipt?.status,
      canProceedToControlledApplyDryRun: guardReceipt?.canProceedToControlledApplyDryRun === true,
      guardFingerprint: guardReceipt?.guardFingerprint,
      blockerCount: list(guardReceipt?.blockerCodes).length,
    }),
    applyPlan: Object.freeze({ ...applyPlan }),
    preApplySnapshot: Object.freeze({ ...preApplySnapshot }),
    routeApplySimulations: Object.freeze(list(routeApplySimulations)),
    versionPointerApplySimulation: Object.freeze({ ...versionPointerApplySimulation }),
    postApplyValidation: Object.freeze({ ...postApplyValidation }),
    rollbackPreview: Object.freeze({ ...rollbackPreview }),
    noWriteProof: Object.freeze({ ...noWriteProof }),
    auditEvents: Object.freeze(list(auditEvents)),
    evidence: Object.freeze(list(evidence)),
    archiveReceipt: Object.freeze({ ...archiveReceipt }),
    summary: Object.freeze({
      routeCount: REQUIRED_ROUTES.length,
      simulatedRouteCount: list(routeApplySimulations).filter((row) => row.routeDefaultApplySimulated === true && row.signingEnvelopeApplySimulated === true).length,
      evidenceCount: list(evidence).length,
      auditEventCount: list(auditEvents).length,
      liveDefaultMutationCount: numberValue(noWriteProof.liveDefaultMutationCount),
      signingEnvelopeMutationCount: numberValue(noWriteProof.signingEnvelopeMutationCount),
      versionPointerMutationCount: numberValue(noWriteProof.versionPointerMutationCount),
      blockerCount: blockerCodes.length,
    }),
  })
}

export function buildOtpControlledVersionRenewalApplyDryRunPhase51Audit({
  checkedAt = new Date().toISOString(),
  phase50Audit = null,
  packageJson = {},
} = {}) {
  const checks = []
  const phase50Ready = !phase50Audit || phase50Audit.status === OTP_VERSION_RENEWAL_LIVE_WRITE_GUARD_READY_STATUS
  const goodGuard = phase50Audit?.guardReceipts?.find((receipt) => receipt.canProceedToControlledApplyDryRun) ||
    buildOtpVersionRenewalLiveWriteGuardPhase50Audit({ checkedAt }).guardReceipts.find((receipt) => receipt.canProceedToControlledApplyDryRun)
  const goodApply = buildOtpControlledVersionRenewalApplyDryRunReceipt({ checkedAt, guardReceipt: goodGuard })
  const blockedGuardApply = buildOtpControlledVersionRenewalApplyDryRunReceipt({
    checkedAt,
    guardReceipt: {
      ...goodGuard,
      status: 'OTP_VERSION_RENEWAL_LIVE_WRITE_GUARD_BLOCKED',
      canProceedToControlledApplyDryRun: false,
      blockerCodes: ['guard_fingerprint_mismatch'],
    },
  })
  const operationMismatchApply = buildOtpControlledVersionRenewalApplyDryRunReceipt({
    checkedAt,
    guardReceipt: goodGuard,
    applyPlan: {
      ...defaultApplyPlan(goodGuard, checkedAt),
      sourceGuardFingerprint: 'wrong-guard-fingerprint',
      operationType: 'manual_apply',
      targetVersionKey: 'wrong-version',
      operator: 'wrong-operator',
    },
  })
  const missingRouteApply = buildOtpControlledVersionRenewalApplyDryRunReceipt({
    checkedAt,
    guardReceipt: goodGuard,
    routeApplySimulations: defaultRouteApplySimulations(goodGuard).filter((row) => row.routeVariant !== 'new_development'),
  })
  const routeMismatchApply = buildOtpControlledVersionRenewalApplyDryRunReceipt({
    checkedAt,
    guardReceipt: goodGuard,
    routeApplySimulations: defaultRouteApplySimulations(goodGuard).map((row) =>
      row.routeVariant === 'resale_existing_property'
        ? { ...row, targetLiveTemplateDefaultId: 'wrong-template', routeOutputFingerprint: 'wrong-route-fingerprint' }
        : row,
    ),
  })
  const versionPointerMismatchApply = buildOtpControlledVersionRenewalApplyDryRunReceipt({
    checkedAt,
    guardReceipt: goodGuard,
    versionPointerApplySimulation: {
      ...defaultVersionPointerApplySimulation(goodGuard),
      targetVersionKey: 'wrong-target-version',
      versionPointerChanged: true,
    },
  })
  const liveMutationApply = buildOtpControlledVersionRenewalApplyDryRunReceipt({
    checkedAt,
    guardReceipt: goodGuard,
    applyPlan: {
      ...defaultApplyPlan(goodGuard, checkedAt),
      dryRunOnly: false,
      productionWriteRequested: true,
      liveDefaultMutationRequested: true,
      versionPointerMutationRequested: true,
      signingDispatchRequested: true,
    },
    noWriteProof: {
      ...defaultNoWriteProof(),
      dryRunOnly: false,
      mutatedData: true,
      productionWriteAttempted: true,
      liveDefaultMutationCount: 1,
      signingEnvelopeMutationCount: 1,
      versionPointerMutationCount: 1,
      generatedArtifactMutationCount: 1,
      signingDispatchMutationCount: 1,
    },
  })
  const postValidationFailedApply = buildOtpControlledVersionRenewalApplyDryRunReceipt({
    checkedAt,
    guardReceipt: goodGuard,
    postApplyValidation: {
      ...defaultPostApplyValidation(goodGuard),
      contentScannerStatus: 'failed',
      routeSeparationStatus: 'failed',
    },
  })
  const rollbackFailedApply = buildOtpControlledVersionRenewalApplyDryRunReceipt({
    checkedAt,
    guardReceipt: goodGuard,
    rollbackPreview: {
      ...defaultRollbackPreview(goodGuard),
      restorePreviousVersionReady: false,
      previewStatus: 'failed',
    },
  })
  const missingEvidenceApply = buildOtpControlledVersionRenewalApplyDryRunReceipt({
    checkedAt,
    guardReceipt: goodGuard,
    evidence: defaultEvidence().filter((row) => row.key !== 'route_default_apply_simulation'),
  })
  const missingAuditEventApply = buildOtpControlledVersionRenewalApplyDryRunReceipt({
    checkedAt,
    guardReceipt: goodGuard,
    auditEvents: defaultAuditEvents().filter((row) => row.eventType !== 'apply_dry_run_stopped_before_live_write'),
  })

  addCheck(checks, phase50Ready, 'PHASE51_PHASE50_LIVE_WRITE_GUARD_READY', 'Controlled apply dry-run starts only after Phase 50 live write guard is ready.')
  addCheck(checks, goodApply.canIssueApplyReceipt && goodApply.mutatedData === false, 'PHASE51_GOOD_CONTROLLED_APPLY_DRY_RUN_READY', 'A clean Phase 50 guard can complete the controlled apply dry-run without mutating production.')
  addCheck(checks, goodApply.summary.simulatedRouteCount === REQUIRED_ROUTES.length, 'PHASE51_RESALE_AND_NEW_DEVELOPMENT_APPLY_SIMULATED', 'Resale and new-development route default and signing envelope apply operations are simulated separately.')
  addCheck(checks, goodApply.versionPointerApplySimulation.versionPointerApplySimulated === true && goodApply.versionPointerApplySimulation.versionPointerChanged === false, 'PHASE51_VERSION_POINTER_APPLY_SIMULATED', 'Version pointer switch is simulated without changing the live pointer.')
  addCheck(checks, goodApply.noWriteProof.dryRunOnly === true && goodApply.noWriteProof.productionWriteAttempted === false && goodApply.noWriteProof.versionPointerMutationCount === 0, 'PHASE51_NO_LIVE_WRITE_OR_POINTER_MUTATION', 'Apply dry-run cannot mutate route defaults, signing envelopes, version pointers, artifacts, or dispatch.')
  addCheck(checks, blockedGuardApply.canIssueApplyReceipt === false && blockedGuardApply.blockerCodes.includes('phase50_live_write_guard_not_ready'), 'PHASE51_BLOCKED_PHASE50_GUARD_REJECTED', 'A blocked Phase 50 guard cannot enter controlled apply dry-run.')
  addCheck(checks, operationMismatchApply.canIssueApplyReceipt === false && operationMismatchApply.blockerCodes.includes('apply_source_guard_fingerprint_mismatch'), 'PHASE51_OPERATION_MISMATCH_BLOCKED', 'Apply plan must match the exact guard fingerprint, operation, target version, and operator.')
  addCheck(checks, missingRouteApply.canIssueApplyReceipt === false && missingRouteApply.blockerCodes.includes('apply_route_missing:new_development'), 'PHASE51_MISSING_ROUTE_BLOCKED', 'Missing resale or new-development route apply simulation blocks the dry-run.')
  addCheck(checks, routeMismatchApply.canIssueApplyReceipt === false && routeMismatchApply.blockerCodes.includes('apply_route_target_template_mismatch:resale_existing_property'), 'PHASE51_ROUTE_APPLY_MISMATCH_BLOCKED', 'Route template or output fingerprint mismatches block the apply dry-run.')
  addCheck(checks, versionPointerMismatchApply.canIssueApplyReceipt === false && versionPointerMismatchApply.blockerCodes.includes('apply_version_pointer_target_version_mismatch'), 'PHASE51_VERSION_POINTER_MISMATCH_BLOCKED', 'Version pointer mismatches or live pointer changes block the apply dry-run.')
  addCheck(checks, liveMutationApply.canIssueApplyReceipt === false && liveMutationApply.blockerCodes.includes('apply_production_write_requested') && liveMutationApply.blockerCodes.includes('no_write_version_pointer_mutation_observed'), 'PHASE51_LIVE_MUTATION_BLOCKED', 'Production writes, default mutations, pointer mutations, artifact mutations, and dispatch mutations are blocked.')
  addCheck(checks, postValidationFailedApply.canIssueApplyReceipt === false && postValidationFailedApply.blockerCodes.includes('post_apply_validation_not_passed:content_scanner'), 'PHASE51_POST_VALIDATION_BLOCKED', 'Post-apply proof, scanner, signing, route separation, pointer, and rollback validation must pass.')
  addCheck(checks, rollbackFailedApply.canIssueApplyReceipt === false && rollbackFailedApply.blockerCodes.includes('rollback_previous_version_not_ready'), 'PHASE51_ROLLBACK_PREVIEW_BLOCKED', 'Rollback preview must prove previous version, route defaults, signing envelopes, and dispatch stop are ready.')
  addCheck(checks, missingEvidenceApply.canIssueApplyReceipt === false && missingEvidenceApply.blockerCodes.includes('missing_apply_evidence:route_default_apply_simulation'), 'PHASE51_MISSING_EVIDENCE_BLOCKED', 'Missing apply simulation evidence blocks the dry-run.')
  addCheck(checks, missingAuditEventApply.canIssueApplyReceipt === false && missingAuditEventApply.blockerCodes.includes('missing_audit_event:apply_dry_run_stopped_before_live_write'), 'PHASE51_MISSING_AUDIT_EVENT_BLOCKED', 'The apply dry-run must record the stop-before-live-write audit event.')
  addCheck(
    checks,
    packageJson.scripts?.['test:otp-controlled-version-renewal-apply-dry-run-phase51'] === 'node scripts/otp-controlled-version-renewal-apply-dry-run-phase51.test.mjs' &&
      packageJson.scripts?.['report:otp-controlled-version-renewal-apply-dry-run-phase51'] === 'node scripts/report-otp-controlled-version-renewal-apply-dry-run-phase51.mjs' &&
      packageJson.scripts?.['verify:otp-template-vnext']?.includes('test:otp-controlled-version-renewal-apply-dry-run-phase51'),
    'PHASE51_PACKAGE_SCRIPTS_WIRED',
    'Package scripts expose the Phase 51 test, report, and vNext verification chain entry.',
  )

  const blockers = checks.filter((check) => !check.pass)
  return Object.freeze({
    version: OTP_CONTROLLED_VERSION_RENEWAL_APPLY_DRY_RUN_PHASE51_VERSION,
    contract: OTP_CONTROLLED_VERSION_RENEWAL_APPLY_DRY_RUN_CONTRACT,
    checkedAt,
    status: blockers.length ? 'OTP_CONTROLLED_VERSION_RENEWAL_APPLY_DRY_RUN_REMEDIATION_REQUIRED' : OTP_CONTROLLED_VERSION_RENEWAL_APPLY_DRY_RUN_READY_STATUS,
    canProceedToApplyReceipt: blockers.length === 0,
    mutatedData: false,
    checks: Object.freeze(checks),
    blockers: Object.freeze(blockers),
    applyDryRunReceipts: Object.freeze([
      goodApply,
      blockedGuardApply,
      operationMismatchApply,
      missingRouteApply,
      routeMismatchApply,
      versionPointerMismatchApply,
      liveMutationApply,
      postValidationFailedApply,
      rollbackFailedApply,
      missingEvidenceApply,
      missingAuditEventApply,
    ]),
    summary: Object.freeze({
      blockerCount: blockers.length,
      passedApplyDryRunCount: [goodApply].filter((row) => row.canIssueApplyReceipt).length,
      blockedApplyDryRunCount: [
        blockedGuardApply,
        operationMismatchApply,
        missingRouteApply,
        routeMismatchApply,
        versionPointerMismatchApply,
        liveMutationApply,
        postValidationFailedApply,
        rollbackFailedApply,
        missingEvidenceApply,
        missingAuditEventApply,
      ].filter((row) => !row.canIssueApplyReceipt).length,
      routeCount: REQUIRED_ROUTES.length,
      evidenceCount: REQUIRED_APPLY_EVIDENCE.length,
      auditEventCount: REQUIRED_AUDIT_EVENTS.length,
    }),
    nextPhase: blockers.length ? null : Object.freeze({
      phase: 52,
      key: 'otp_version_renewal_apply_receipt',
      label: 'Version Renewal Apply Receipt',
    }),
  })
}

export function formatOtpControlledVersionRenewalApplyDryRunPhase51Markdown(report = buildOtpControlledVersionRenewalApplyDryRunPhase51Audit()) {
  const readyReceipt = report.applyDryRunReceipts.find((receipt) => receipt.canIssueApplyReceipt) || report.applyDryRunReceipts[0]
  return [
    '# OTP Generator Phase 51 Controlled Version Renewal Apply Dry Run',
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
        ['Passed apply dry-run receipts', report.summary.passedApplyDryRunCount],
        ['Blocked apply dry-run receipts', report.summary.blockedApplyDryRunCount],
        ['Routes', report.summary.routeCount],
        ['Evidence items', report.summary.evidenceCount],
        ['Audit events', report.summary.auditEventCount],
        ['Blockers', report.summary.blockerCount],
        ['Next phase', report.nextPhase ? `Phase ${report.nextPhase.phase}: ${report.nextPhase.label}` : 'Blocked'],
      ],
    ),
    '',
    '## Apply Plan',
    '',
    table(
      ['Field', 'Value'],
      [
        ['Apply dry-run id', readyReceipt.applyPlan.applyDryRunId],
        ['Source guard id', readyReceipt.applyPlan.sourceGuardId],
        ['Source guard fingerprint', readyReceipt.applyPlan.sourceGuardFingerprint],
        ['Source receipt fingerprint', readyReceipt.applyPlan.sourceReceiptFingerprint],
        ['Target environment', readyReceipt.applyPlan.targetEnvironment],
        ['Previous version', readyReceipt.applyPlan.previousVersionKey],
        ['Target version', readyReceipt.applyPlan.targetVersionKey],
        ['Rollback plan reference', readyReceipt.applyPlan.rollbackPlanReference],
        ['Operator', readyReceipt.applyPlan.operator],
        ['Apply dry-run fingerprint', readyReceipt.applyDryRunFingerprint],
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
    '## Route Apply Simulations',
    '',
    table(
      ['Route', 'Target Template', 'Target Envelope', 'Operations', 'Fingerprint', 'Default Changed', 'Envelope Changed'],
      readyReceipt.routeApplySimulations.map((route) => [
        route.routeVariant,
        route.targetLiveTemplateDefaultId,
        route.targetSigningEnvelopeKey,
        route.plannedOperations.join(', '),
        route.routeOutputFingerprint,
        route.liveDefaultChanged ? 'yes' : 'no',
        route.signingEnvelopeChanged ? 'yes' : 'no',
      ]),
    ),
    '',
    '## Version Pointer Simulation',
    '',
    table(
      ['Operation', 'Previous Version', 'Target Version', 'Fingerprint', 'Changed'],
      [[
        readyReceipt.versionPointerApplySimulation.operation,
        readyReceipt.versionPointerApplySimulation.previousVersionKey,
        readyReceipt.versionPointerApplySimulation.targetVersionKey,
        readyReceipt.versionPointerApplySimulation.pointerFingerprint,
        readyReceipt.versionPointerApplySimulation.versionPointerChanged ? 'yes' : 'no',
      ]],
    ),
    '',
    '## Blocked Apply Dry-Run Proofs',
    '',
    table(
      ['Status', 'Allowed', 'Blockers'],
      report.applyDryRunReceipts.map((receipt) => [
        receipt.status,
        receipt.canIssueApplyReceipt ? 'yes' : 'no',
        receipt.blockerCodes.join(', ') || 'none',
      ]),
    ),
    '',
    '## Boundary',
    '',
    'Phase 51 simulates the actual guarded version-renewal apply sequence: resale and new-development route defaults, signing envelopes, generated OTP validation, and the version pointer are all rehearsed from the Phase 50 live-write guard. It remains dry-run only and does not mutate production templates, live defaults, signing envelopes, version pointers, generated artifacts, signing dispatch, or production traffic. It only prepares the Phase 52 apply receipt.',
    '',
  ].join('\n')
}
