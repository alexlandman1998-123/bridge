import { canonicalLegalDocumentReleaseValue } from './legalDocumentReleaseReceipt.js'
import {
  OTP_DOCUMENT_VARIANTS,
} from './otpRouteUniverse.js'
import {
  OTP_PRODUCTION_PROMOTION_PREFLIGHT_READY_EVIDENCE,
  OTP_PRODUCTION_PROMOTION_PREFLIGHT_READY_STATUS,
  buildOtpProductionPromotionPreflightPhase19Audit,
} from './otpProductionPromotionPreflightPhase19.js'

export const OTP_CONTROLLED_PRODUCTION_ACTIVATION_DRY_RUN_PHASE20_VERSION = 'otp_controlled_production_activation_dry_run_phase20_v1'
export const OTP_CONTROLLED_PRODUCTION_ACTIVATION_DRY_RUN_READY_STATUS = 'OTP_CONTROLLED_PRODUCTION_ACTIVATION_DRY_RUN_READY_FOR_PRODUCTION_ACTIVATION_RECEIPT'
export const OTP_CONTROLLED_PRODUCTION_ACTIVATION_DRY_RUN_CONTRACT = 'otp-vnext-controlled-production-activation-dry-run-phase20-v1'

const REQUIRED_AUDIT_EVENTS = Object.freeze([
  'otp_controlled_production_activation_dry_run_started',
  'otp_activation_preflight_fingerprint_verified',
  'otp_activation_stop_controls_verified',
  'otp_activation_rollback_controls_verified',
])

const REQUIRED_STOP_CONDITIONS = Object.freeze([
  'production_preflight_not_ready',
  'preflight_fingerprint_mismatch',
  'production_write_guard_unlocked',
  'live_template_write_attempted',
  'route_default_write_attempted',
  'rollback_controls_not_armed',
  'route_activation_fingerprint_mismatch',
  'mutation_detected',
])

function normalizeText(value) {
  return String(value ?? '').trim()
}

function normalizeKey(value = '') {
  return normalizeText(value).toLowerCase().replace(/[\s./-]+/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '')
}

function list(value = []) {
  return Array.isArray(value) ? value.map(normalizeText).filter(Boolean) : []
}

function evidenceByRoute(evidence = []) {
  return new Map((Array.isArray(evidence) ? evidence : []).map((row) => [normalizeKey(row.routeKey), row]))
}

function routeLabel(routeKey = '') {
  return OTP_DOCUMENT_VARIANTS.find((variant) => variant.key === routeKey)?.label || routeKey
}

function stableFingerprint(value, prefix = 'otp-prod-activation') {
  const canonical = JSON.stringify(canonicalLegalDocumentReleaseValue(value))
  let hash = 0x811c9dc5
  for (let index = 0; index < canonical.length; index += 1) {
    hash ^= canonical.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return `${prefix}:${hash.toString(16).padStart(8, '0')}:${canonical.length}`
}

function activationPayload(activation = {}) {
  return canonicalLegalDocumentReleaseValue({
    contract: OTP_CONTROLLED_PRODUCTION_ACTIVATION_DRY_RUN_CONTRACT,
    activationId: activation.activationId,
    sourcePreflightId: activation.sourcePreflightId,
    sourcePreflightFingerprint: activation.sourcePreflightFingerprint,
    sourceLockFingerprint: activation.sourceLockFingerprint,
    approvalReference: activation.approvalReference,
    target: activation.target,
    runtimeWriteGuard: activation.runtimeWriteGuard,
    rollbackControls: activation.rollbackControls,
    routeFingerprints: (activation.routes || []).map((route) => ({
      routeKey: route.routeKey,
      routeFingerprint: route.routeFingerprint,
      qaEvidenceFingerprint: route.qaEvidenceFingerprint,
    })),
    operationNames: (activation.operations || []).map((operation) => ({
      routeKey: operation.routeKey,
      operation: operation.operation,
      stoppedBeforeMutation: operation.stoppedBeforeMutation,
      executed: operation.executed,
    })),
  })
}

function buildActivationRoutes(preflight = OTP_PRODUCTION_PROMOTION_PREFLIGHT_READY_EVIDENCE) {
  return (preflight.routes || []).map((route) => Object.freeze({
    routeKey: route.routeKey,
    routeLabel: route.routeLabel,
    sourcePacketId: route.sourcePacketId,
    sourceVersionId: route.sourceVersionId,
    targetTemplateKey: route.targetTemplateKey,
    targetProjectRef: route.targetProjectRef,
    routeFingerprint: route.routeFingerprint,
    qaEvidenceFingerprint: route.qaEvidenceFingerprint,
    sourcePreflightFingerprint: preflight.preflightFingerprint,
    activationDryRunOnly: true,
    rollbackControlReady: true,
    liveTemplateWriteSuppressed: true,
    routeDefaultWriteSuppressed: true,
  }))
}

function buildActivationOperations(preflight = OTP_PRODUCTION_PROMOTION_PREFLIGHT_READY_EVIDENCE) {
  return (preflight.routes || []).flatMap((route) => [
    Object.freeze({
      routeKey: route.routeKey,
      operation: 'activate_production_template_version',
      targetTemplateKey: route.targetTemplateKey,
      wouldMutateProduction: true,
      executed: false,
      stoppedBeforeMutation: true,
      rollbackControlReady: true,
    }),
    Object.freeze({
      routeKey: route.routeKey,
      operation: 'bind_production_route_default',
      targetTemplateKey: route.targetTemplateKey,
      wouldMutateProduction: true,
      executed: false,
      stoppedBeforeMutation: true,
      rollbackControlReady: true,
    }),
    Object.freeze({
      routeKey: route.routeKey,
      operation: 'publish_runtime_activation_audit_marker',
      targetTemplateKey: route.targetTemplateKey,
      wouldMutateProduction: true,
      executed: false,
      stoppedBeforeMutation: true,
      rollbackControlReady: true,
    }),
  ])
}

function buildReadyActivation(preflight = OTP_PRODUCTION_PROMOTION_PREFLIGHT_READY_EVIDENCE) {
  const activation = {
    activationId: 'otp-vnext-controlled-production-activation-dry-run-2026-08-05',
    checkedAt: '2026-08-05T10:40:00.000Z',
    mode: 'controlled_activation_dry_run',
    sourcePreflightId: preflight.preflightId,
    sourcePreflightFingerprint: preflight.preflightFingerprint,
    sourceLockId: preflight.sourceLockId,
    sourceLockFingerprint: preflight.sourceLockFingerprint,
    approvalReference: preflight.approvalReference,
    target: Object.freeze({
      environment: 'production',
      projectRef: preflight.target?.projectRef,
      confirmEnvironment: preflight.target?.confirmEnvironment,
      confirmProjectRef: preflight.target?.confirmProjectRef,
      routeKeys: Object.freeze(OTP_DOCUMENT_VARIANTS.map((variant) => variant.key)),
    }),
    runtimeWriteGuard: Object.freeze({
      dryRunOnly: true,
      productionWritesEnabled: false,
      liveTemplateWritesSuppressed: true,
      routeDefaultWritesSuppressed: true,
      runtimeFlagWritesSuppressed: true,
      signingDispatchSuppressed: true,
      finalArtifactMutationSuppressed: true,
      stopBeforeMutation: true,
    }),
    rollbackControls: Object.freeze({
      rollbackPlanId: preflight.rollbackPlan?.rollbackPlanId,
      sourcePreflightFingerprint: preflight.preflightFingerprint,
      sourceLockFingerprint: preflight.sourceLockFingerprint,
      targetProjectRef: preflight.target?.projectRef,
      rollbackPrearmed: true,
      fireBeforeMutation: true,
      restorePreviousProductionTemplates: true,
      restorePreviousRouteDefaults: true,
      disableRuntimeFlagsOnFailure: true,
      auditRollbackEventPlanned: true,
    }),
    dryRun: Object.freeze({
      noWrite: true,
      mutatedData: false,
      activatedProduction: false,
      liveTemplateChangesApplied: 0,
      routeDefaultChangesApplied: 0,
      runtimeFlagChangesApplied: 0,
      auditEventsPlanned: REQUIRED_AUDIT_EVENTS,
    }),
    routes: Object.freeze(buildActivationRoutes(preflight)),
    operations: Object.freeze(buildActivationOperations(preflight)),
    stopConditions: REQUIRED_STOP_CONDITIONS,
  }
  return Object.freeze({
    ...activation,
    activationFingerprint: stableFingerprint(activationPayload(activation), 'otp-prod-activation'),
  })
}

export const OTP_CONTROLLED_PRODUCTION_ACTIVATION_DRY_RUN_READY_EVIDENCE = buildReadyActivation()

function writeGuardLocked(guard = {}) {
  return guard.dryRunOnly === true &&
    guard.productionWritesEnabled === false &&
    guard.liveTemplateWritesSuppressed === true &&
    guard.routeDefaultWritesSuppressed === true &&
    guard.runtimeFlagWritesSuppressed === true &&
    guard.signingDispatchSuppressed === true &&
    guard.finalArtifactMutationSuppressed === true &&
    guard.stopBeforeMutation === true
}

function rollbackControlsReady(controls = {}, activation = {}) {
  return normalizeText(controls.rollbackPlanId) &&
    normalizeText(controls.sourcePreflightFingerprint) === normalizeText(activation.sourcePreflightFingerprint) &&
    normalizeText(controls.sourceLockFingerprint) === normalizeText(activation.sourceLockFingerprint) &&
    normalizeText(controls.targetProjectRef) === normalizeText(activation.target?.projectRef) &&
    controls.rollbackPrearmed === true &&
    controls.fireBeforeMutation === true &&
    controls.restorePreviousProductionTemplates === true &&
    controls.restorePreviousRouteDefaults === true &&
    controls.disableRuntimeFlagsOnFailure === true &&
    controls.auditRollbackEventPlanned === true
}

function buildRouteActivationRow(variant, route = {}, preflightRoute = {}, activation = {}) {
  const operations = (Array.isArray(activation.operations) ? activation.operations : [])
    .filter((operation) => normalizeKey(operation.routeKey) === variant.key)
  const executedOperationCount = operations.filter((operation) => operation.executed === true).length
  const unstoppedOperationCount = operations.filter((operation) => operation.stoppedBeforeMutation !== true).length
  const rollbackGapCount = operations.filter((operation) => operation.rollbackControlReady !== true).length
  const routeBound = normalizeKey(route.routeKey) === variant.key &&
    normalizeText(route.sourcePacketId) === normalizeText(preflightRoute.sourcePacketId) &&
    normalizeText(route.sourceVersionId) === normalizeText(preflightRoute.sourceVersionId) &&
    normalizeText(route.targetTemplateKey) === normalizeText(preflightRoute.targetTemplateKey) &&
    normalizeText(route.targetProjectRef) === normalizeText(preflightRoute.targetProjectRef)
  const fingerprintsBound = normalizeText(route.routeFingerprint) === normalizeText(preflightRoute.routeFingerprint) &&
    normalizeText(route.qaEvidenceFingerprint) === normalizeText(preflightRoute.qaEvidenceFingerprint) &&
    normalizeText(route.sourcePreflightFingerprint) === normalizeText(activation.sourcePreflightFingerprint)
  const stopBeforeMutation = route.liveTemplateWriteSuppressed === true &&
    route.routeDefaultWriteSuppressed === true &&
    route.activationDryRunOnly === true &&
    executedOperationCount === 0 &&
    unstoppedOperationCount === 0
  const rollbackReady = route.rollbackControlReady === true && rollbackGapCount === 0
  const pass = routeBound &&
    fingerprintsBound &&
    stopBeforeMutation &&
    rollbackReady &&
    operations.length === 3

  return {
    routeKey: variant.key,
    routeLabel: variant.label,
    sourcePacketId: normalizeText(route.sourcePacketId),
    sourceVersionId: normalizeText(route.sourceVersionId),
    targetTemplateKey: normalizeText(route.targetTemplateKey),
    targetProjectRef: normalizeText(route.targetProjectRef),
    routeFingerprint: normalizeText(route.routeFingerprint),
    qaEvidenceFingerprint: normalizeText(route.qaEvidenceFingerprint),
    operationCount: operations.length,
    executedOperationCount,
    unstoppedOperationCount,
    rollbackGapCount,
    routeBound,
    fingerprintsBound,
    stopBeforeMutation,
    rollbackReady,
    pass,
  }
}

function addCheck(checks, pass, code, detail, category = 'phase20_controlled_production_activation_dry_run') {
  checks.push({ code, pass: Boolean(pass), detail, category })
}

function addIssue(issues, issue = {}) {
  issues.push({
    severity: issue.severity || 'blocking',
    code: normalizeText(issue.code),
    category: normalizeText(issue.category),
    routeKey: normalizeText(issue.routeKey),
    message: normalizeText(issue.message),
    remediation: normalizeText(issue.remediation),
  })
}

export function buildOtpControlledProductionActivationDryRunPhase20Audit({
  activationEvidence = OTP_CONTROLLED_PRODUCTION_ACTIVATION_DRY_RUN_READY_EVIDENCE,
  productionPromotionPreflight = null,
  checkedAt = new Date().toISOString(),
} = {}) {
  const preflightAudit = productionPromotionPreflight || buildOtpProductionPromotionPreflightPhase19Audit({ checkedAt })
  const preflightRouteMap = evidenceByRoute(OTP_PRODUCTION_PROMOTION_PREFLIGHT_READY_EVIDENCE.routes || [])
  const activationRouteMap = evidenceByRoute(activationEvidence?.routes || [])
  const routeRows = OTP_DOCUMENT_VARIANTS.map((variant) =>
    buildRouteActivationRow(
      variant,
      activationRouteMap.get(variant.key) || {},
      preflightRouteMap.get(variant.key) || {},
      activationEvidence || {},
    ),
  )
  const targetConfirmed = normalizeKey(activationEvidence?.target?.environment) === 'production' &&
    normalizeKey(activationEvidence?.target?.confirmEnvironment) === 'production' &&
    normalizeText(activationEvidence?.target?.projectRef) === normalizeText(activationEvidence?.target?.confirmProjectRef) &&
    normalizeText(activationEvidence?.target?.projectRef) === normalizeText(preflightAudit.preflight?.targetProjectRef)
  const preflightFingerprintMatches = normalizeText(activationEvidence?.sourcePreflightFingerprint) === normalizeText(preflightAudit.preflight?.preflightFingerprint)
  const lockFingerprintMatches = normalizeText(activationEvidence?.sourceLockFingerprint) === normalizeText(preflightAudit.releaseCandidateLock?.releaseCandidateFingerprint)
  const approvalReferenceMatches = normalizeText(activationEvidence?.approvalReference) === normalizeText(preflightAudit.releaseCandidateLock?.approvalReference)
  const guardLocked = writeGuardLocked(activationEvidence?.runtimeWriteGuard || {})
  const rollbackReady = rollbackControlsReady(activationEvidence?.rollbackControls || {}, activationEvidence || {})
  const operations = Array.isArray(activationEvidence?.operations) ? activationEvidence.operations : []
  const executedOperationCount = operations.filter((operation) => operation.executed === true).length
  const unstoppedOperationCount = operations.filter((operation) => operation.stoppedBeforeMutation !== true).length
  const rollbackGapCount = operations.filter((operation) => operation.rollbackControlReady !== true).length
  const noProductionMutation = activationEvidence?.dryRun?.noWrite === true &&
    activationEvidence?.dryRun?.mutatedData === false &&
    activationEvidence?.dryRun?.activatedProduction === false &&
    Number(activationEvidence?.dryRun?.liveTemplateChangesApplied || 0) === 0 &&
    Number(activationEvidence?.dryRun?.routeDefaultChangesApplied || 0) === 0 &&
    Number(activationEvidence?.dryRun?.runtimeFlagChangesApplied || 0) === 0 &&
    executedOperationCount === 0
  const expectedActivationFingerprint = stableFingerprint(activationPayload(activationEvidence || {}), 'otp-prod-activation')
  const missingAuditEvents = REQUIRED_AUDIT_EVENTS.filter((event) => !list(activationEvidence?.dryRun?.auditEventsPlanned).map(normalizeKey).includes(event))
  const missingStopConditions = REQUIRED_STOP_CONDITIONS.filter((condition) => !list(activationEvidence?.stopConditions).map(normalizeKey).includes(condition))
  const checks = []
  const blockers = []
  const warnings = []

  addCheck(checks, preflightAudit.status === OTP_PRODUCTION_PROMOTION_PREFLIGHT_READY_STATUS, 'PHASE20_PRODUCTION_PREFLIGHT_READY', 'Phase 19 production promotion preflight is ready before activation dry-run.')
  addCheck(checks, targetConfirmed, 'PHASE20_PRODUCTION_TARGET_STILL_CONFIRMED', 'Activation dry-run target still matches the confirmed production project.')
  addCheck(checks, preflightFingerprintMatches && lockFingerprintMatches && approvalReferenceMatches, 'PHASE20_PREFLIGHT_AND_LOCK_BOUND', 'Activation dry-run is bound to the exact Phase 19 preflight, Phase 18 lock fingerprint and approval reference.')
  addCheck(checks, guardLocked, 'PHASE20_RUNTIME_WRITE_GUARD_LOCKED', 'Runtime write guard keeps production writes, template writes, route-default writes and runtime flag writes suppressed.')
  addCheck(checks, rollbackReady, 'PHASE20_ROLLBACK_CONTROLS_ARMED', 'Rollback controls are pre-armed and fire before mutation.')
  addCheck(checks, noProductionMutation, 'PHASE20_NO_PRODUCTION_MUTATION_PROVED', 'Activation dry-run applies no live template, route default, runtime flag or production activation mutation.')
  addCheck(checks, operations.length === 6 && executedOperationCount === 0 && unstoppedOperationCount === 0, 'PHASE20_STOP_BEFORE_LIVE_TEMPLATE_OR_ROUTE_DEFAULT', 'Every planned live template, route default and audit marker operation is stopped before execution.')
  addCheck(checks, routeRows.length === 2 && routeRows.every((row) => row.pass), 'PHASE20_BOTH_ROUTES_ACTIVATION_SIMULATED', 'Controlled activation is simulated for both resale and new-development routes.')
  addCheck(checks, routeRows.every((row) => row.fingerprintsBound), 'PHASE20_ROUTE_ACTIVATION_FINGERPRINTS_BOUND', 'Each activation route is bound to the Phase 19 route and QA fingerprints.')
  addCheck(checks, rollbackGapCount === 0, 'PHASE20_ROLLBACK_AVAILABLE_BEFORE_EACH_OPERATION', 'Rollback controls are available before every planned production operation.')
  addCheck(checks, normalizeText(activationEvidence?.activationFingerprint) === expectedActivationFingerprint, 'PHASE20_ACTIVATION_FINGERPRINT_MATCHES', 'Activation dry-run fingerprint matches target, preflight, rollback, routes and stopped operations.')
  addCheck(checks, missingAuditEvents.length === 0, 'PHASE20_AUDIT_EVENTS_PLANNED', 'Activation preflight, stop-control and rollback-control audit events are planned.')
  addCheck(checks, missingStopConditions.length === 0, 'PHASE20_STOP_CONDITIONS_BOUND', 'Stop conditions cover preflight, fingerprint, write guard, live write, rollback, route fingerprint and mutation failures.')

  for (const row of routeRows.filter((item) => !item.pass)) {
    addIssue(blockers, {
      code: 'PHASE20_ROUTE_ACTIVATION_DRY_RUN_INCOMPLETE',
      category: 'controlled_production_activation_dry_run',
      routeKey: row.routeKey,
      message: `${routeLabel(row.routeKey)} controlled production activation dry-run is incomplete or unsafe.`,
      remediation: 'Repair route binding, fingerprint binding, write suppression, rollback readiness, or stopped operation evidence before recording production activation.',
    })
  }
  for (const check of checks.filter((row) => !row.pass && row.code !== 'PHASE20_BOTH_ROUTES_ACTIVATION_SIMULATED')) {
    addIssue(blockers, {
      code: check.code,
      category: check.category,
      message: check.detail,
      remediation: 'Repair controlled production activation dry-run evidence before production activation receipt.',
    })
  }

  return {
    version: OTP_CONTROLLED_PRODUCTION_ACTIVATION_DRY_RUN_PHASE20_VERSION,
    contract: OTP_CONTROLLED_PRODUCTION_ACTIVATION_DRY_RUN_CONTRACT,
    checkedAt,
    mutatedData: false,
    status: blockers.length ? 'OTP_CONTROLLED_PRODUCTION_ACTIVATION_DRY_RUN_REMEDIATION_REQUIRED' : OTP_CONTROLLED_PRODUCTION_ACTIVATION_DRY_RUN_READY_STATUS,
    canProceedToProductionActivationReceipt: blockers.length === 0,
    productionPromotionPreflight: {
      version: preflightAudit.version,
      status: preflightAudit.status,
      canProceedToControlledProductionActivation: preflightAudit.canProceedToControlledProductionActivation === true,
      preflightId: preflightAudit.preflight?.preflightId,
      preflightFingerprint: preflightAudit.preflight?.preflightFingerprint,
      blockerCount: preflightAudit.summary?.blockerCount || 0,
    },
    activation: {
      activationId: normalizeText(activationEvidence?.activationId),
      mode: normalizeText(activationEvidence?.mode),
      sourcePreflightId: normalizeText(activationEvidence?.sourcePreflightId),
      sourcePreflightFingerprint: normalizeText(activationEvidence?.sourcePreflightFingerprint),
      sourceLockFingerprint: normalizeText(activationEvidence?.sourceLockFingerprint),
      approvalReference: normalizeText(activationEvidence?.approvalReference),
      rollbackPlanId: normalizeText(activationEvidence?.rollbackControls?.rollbackPlanId),
      targetEnvironment: normalizeText(activationEvidence?.target?.environment),
      targetProjectRef: normalizeText(activationEvidence?.target?.projectRef),
      activationFingerprint: normalizeText(activationEvidence?.activationFingerprint),
      expectedActivationFingerprint,
    },
    summary: {
      routeCount: routeRows.length,
      simulatedRouteCount: routeRows.filter((row) => row.pass).length,
      plannedOperationCount: operations.length,
      executedOperationCount,
      unstoppedOperationCount,
      rollbackGapCount,
      targetConfirmed: targetConfirmed === true,
      preflightFingerprintMatches: preflightFingerprintMatches === true,
      lockFingerprintMatches: lockFingerprintMatches === true,
      approvalReferenceMatches: approvalReferenceMatches === true,
      runtimeWriteGuardLocked: guardLocked === true,
      rollbackReady: rollbackReady === true,
      noProductionMutation: noProductionMutation === true,
      missingAuditEventCount: missingAuditEvents.length,
      missingStopConditionCount: missingStopConditions.length,
      blockerCount: blockers.length,
      warningCount: warnings.length,
    },
    routeRows,
    checks,
    blockers,
    warnings,
  }
}

function table(headers = [], rows = []) {
  const escape = (value) => normalizeText(value).replace(/\|/g, '\\|').replace(/\n/g, '<br>')
  return [
    `| ${headers.map(escape).join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map(escape).join(' | ')} |`),
  ].join('\n')
}

export function formatOtpControlledProductionActivationDryRunPhase20Markdown(report = buildOtpControlledProductionActivationDryRunPhase20Audit()) {
  return [
    '# OTP Template vNext Phase 20 Controlled Production Activation Dry Run',
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
        ['Routes', report.summary.routeCount],
        ['Simulated routes', report.summary.simulatedRouteCount],
        ['Planned operations', report.summary.plannedOperationCount],
        ['Executed operations', report.summary.executedOperationCount],
        ['Unstopped operations', report.summary.unstoppedOperationCount],
        ['Rollback gaps', report.summary.rollbackGapCount],
        ['Target confirmed', report.summary.targetConfirmed ? 'yes' : 'no'],
        ['Preflight fingerprint matches', report.summary.preflightFingerprintMatches ? 'yes' : 'no'],
        ['Runtime write guard locked', report.summary.runtimeWriteGuardLocked ? 'yes' : 'no'],
        ['Rollback ready', report.summary.rollbackReady ? 'yes' : 'no'],
        ['No production mutation', report.summary.noProductionMutation ? 'yes' : 'no'],
        ['Missing audit events', report.summary.missingAuditEventCount],
        ['Missing stop conditions', report.summary.missingStopConditionCount],
        ['Blockers', report.summary.blockerCount],
        ['Warnings', report.summary.warningCount],
        ['Proceed to production activation receipt', report.canProceedToProductionActivationReceipt ? 'yes' : 'no'],
      ],
    ),
    '',
    '## Activation',
    '',
    table(
      ['Field', 'Value'],
      [
        ['Activation id', report.activation.activationId],
        ['Mode', report.activation.mode],
        ['Source preflight id', report.activation.sourcePreflightId],
        ['Source preflight fingerprint', report.activation.sourcePreflightFingerprint],
        ['Source lock fingerprint', report.activation.sourceLockFingerprint],
        ['Approval reference', report.activation.approvalReference],
        ['Rollback plan id', report.activation.rollbackPlanId],
        ['Target environment', report.activation.targetEnvironment],
        ['Target project ref', report.activation.targetProjectRef],
        ['Activation fingerprint', report.activation.activationFingerprint],
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
    '## Route Activation Dry Run',
    '',
    table(
      ['Route', 'Source Packet', 'Version', 'Target Template', 'Operations', 'Executed', 'Unstopped', 'Rollback Gaps', 'Pass'],
      report.routeRows.map((row) => [
        row.routeLabel,
        row.sourcePacketId,
        row.sourceVersionId,
        row.targetTemplateKey,
        row.operationCount,
        row.executedOperationCount,
        row.unstoppedOperationCount,
        row.rollbackGapCount,
        row.pass ? 'yes' : 'no',
      ]),
    ),
    '',
    '## Boundary',
    '',
    'Phase 20 simulates controlled production activation only. It stops before live template writes, route default changes, runtime flag changes, signing dispatch, final signed artifact mutation, or production traffic activation.',
    '',
  ].join('\n')
}
