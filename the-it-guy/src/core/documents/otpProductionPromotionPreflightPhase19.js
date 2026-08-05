import { canonicalLegalDocumentReleaseValue } from './legalDocumentReleaseReceipt.js'
import {
  OTP_DOCUMENT_VARIANTS,
} from './otpRouteUniverse.js'
import {
  OTP_RELEASE_CANDIDATE_LOCK_READY_EVIDENCE,
  OTP_RELEASE_CANDIDATE_LOCK_READY_STATUS,
  buildOtpReleaseCandidateLockPhase18Audit,
} from './otpReleaseCandidateLockPhase18.js'

export const OTP_PRODUCTION_PROMOTION_PREFLIGHT_PHASE19_VERSION = 'otp_production_promotion_preflight_phase19_v1'
export const OTP_PRODUCTION_PROMOTION_PREFLIGHT_READY_STATUS = 'OTP_PRODUCTION_PROMOTION_PREFLIGHT_READY_FOR_CONTROLLED_PRODUCTION_ACTIVATION'
export const OTP_PRODUCTION_PROMOTION_PREFLIGHT_CONTRACT = 'otp-vnext-production-promotion-preflight-phase19-v1'

const REQUIRED_AUDIT_EVENTS = Object.freeze([
  'otp_production_promotion_preflight_started',
  'otp_production_target_verified',
  'otp_release_candidate_lock_verified',
  'otp_no_write_promotion_dry_run_completed',
])

const REQUIRED_STOP_CONDITIONS = Object.freeze([
  'production_target_mismatch',
  'project_ref_mismatch',
  'approval_reference_mismatch',
  'release_candidate_lock_fingerprint_mismatch',
  'runtime_flag_unsafe',
  'rollback_plan_missing',
  'no_write_dry_run_mutated_data',
  'route_fingerprint_mismatch',
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

function routeLabel(routeKey = '') {
  return OTP_DOCUMENT_VARIANTS.find((variant) => variant.key === routeKey)?.label || routeKey
}

function evidenceByRoute(evidence = []) {
  return new Map((Array.isArray(evidence) ? evidence : []).map((row) => [normalizeKey(row.routeKey), row]))
}

function stableFingerprint(value, prefix = 'otp-prod-preflight') {
  const canonical = JSON.stringify(canonicalLegalDocumentReleaseValue(value))
  let hash = 0x811c9dc5
  for (let index = 0; index < canonical.length; index += 1) {
    hash ^= canonical.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return `${prefix}:${hash.toString(16).padStart(8, '0')}:${canonical.length}`
}

function preflightPayload(preflight = {}) {
  return canonicalLegalDocumentReleaseValue({
    contract: OTP_PRODUCTION_PROMOTION_PREFLIGHT_CONTRACT,
    preflightId: preflight.preflightId,
    sourceLockId: preflight.sourceLockId,
    sourceLockFingerprint: preflight.sourceLockFingerprint,
    approvalReference: preflight.approvalReference,
    target: preflight.target,
    runtimeFlags: preflight.runtimeFlags,
    rollbackPlanId: preflight.rollbackPlan?.rollbackPlanId,
    routeFingerprints: (preflight.routes || []).map((route) => ({
      routeKey: route.routeKey,
      routeFingerprint: route.routeFingerprint,
      qaEvidenceFingerprint: route.qaEvidenceFingerprint,
    })),
    dryRunMode: preflight.dryRun?.mode,
  })
}

function buildPromotionRoutes(lock = OTP_RELEASE_CANDIDATE_LOCK_READY_EVIDENCE) {
  return (lock.routes || []).map((route) => Object.freeze({
    routeKey: route.routeKey,
    routeLabel: route.routeLabel,
    sourcePacketId: route.packetId,
    sourceVersionId: route.versionId,
    sourceTemplateKey: route.templateKey,
    targetTemplateKey: route.templateKey,
    sourceRenderedSha256: route.renderedSha256,
    sourceEnvelopeId: route.envelopeId,
    sourceLockId: lock.lockId,
    sourceLockFingerprint: lock.releaseCandidateFingerprint,
    approvalReference: lock.approvalReference,
    targetEnvironment: 'production',
    targetProjectRef: 'production-project-ref',
    routeFingerprint: route.routeFingerprint,
    qaEvidenceFingerprint: route.qaEvidenceFingerprint,
    runtimeFlagsBound: true,
    rollbackBound: true,
    noWrite: true,
    wouldPromote: true,
    executed: false,
  }))
}

function buildReadyPreflight(lock = OTP_RELEASE_CANDIDATE_LOCK_READY_EVIDENCE) {
  const preflight = {
    preflightId: 'otp-vnext-production-promotion-preflight-2026-08-05',
    checkedAt: '2026-08-05T10:35:00.000Z',
    mode: 'no_write_dry_run',
    sourceLockId: lock.lockId,
    sourceLockFingerprint: lock.releaseCandidateFingerprint,
    approvalReference: lock.approvalReference,
    sourceEnvironment: lock.environment,
    sourceProjectRef: lock.projectRef,
    target: Object.freeze({
      environment: 'production',
      projectRef: 'production-project-ref',
      confirmEnvironment: 'production',
      confirmProjectRef: 'production-project-ref',
      routeKeys: Object.freeze(OTP_DOCUMENT_VARIANTS.map((variant) => variant.key)),
    }),
    runtimeFlags: Object.freeze({
      otpTemplateVnextEnabled: true,
      nativePdfRendererEnabled: true,
      routeSplitEnforced: true,
      docxGenerationDisabled: true,
      fallbackDocxDisabled: true,
      signingDispatchSuppressed: true,
      finalArtifactMutationSuppressed: true,
      productionWritesEnabled: false,
    }),
    rollbackPlan: Object.freeze({
      rollbackPlanId: 'otp-vnext-production-promotion-rollback-2026-08-05',
      ownerRole: 'system_release_manager',
      sourceLockFingerprint: lock.releaseCandidateFingerprint,
      targetProjectRef: 'production-project-ref',
      routeCount: (lock.routes || []).length,
      rehearsed: true,
      restorePreviousProductionTemplates: true,
      disableRuntimeFlagsOnFailure: true,
      auditRollbackEventPlanned: true,
    }),
    dryRun: Object.freeze({
      mode: 'no_write',
      noWrite: true,
      mutatedData: false,
      providerCallsSuppressed: true,
      templateWritesSuppressed: true,
      runtimeFlagWritesSuppressed: true,
      writeOperations: Object.freeze((lock.routes || []).flatMap((route) => [
        Object.freeze({ routeKey: route.routeKey, operation: 'promote_template_version', wouldWrite: true, executed: false }),
        Object.freeze({ routeKey: route.routeKey, operation: 'bind_runtime_route_default', wouldWrite: true, executed: false }),
      ])),
      auditEventsPlanned: REQUIRED_AUDIT_EVENTS,
    }),
    routes: Object.freeze(buildPromotionRoutes(lock)),
    stopConditions: REQUIRED_STOP_CONDITIONS,
  }
  return Object.freeze({
    ...preflight,
    preflightFingerprint: stableFingerprint(preflightPayload(preflight), 'otp-prod-preflight'),
  })
}

export const OTP_PRODUCTION_PROMOTION_PREFLIGHT_READY_EVIDENCE = buildReadyPreflight()

function buildRoutePreflightRow(variant, route = {}, lockedRoute = {}, preflight = {}) {
  const target = preflight.target || {}
  const dryRun = preflight.dryRun || {}
  const writeOperations = (Array.isArray(dryRun.writeOperations) ? dryRun.writeOperations : [])
    .filter((operation) => normalizeKey(operation.routeKey) === variant.key)
  const executedWriteCount = writeOperations.filter((operation) => operation.executed === true).length
  const routeFingerprintMatches = normalizeText(route.routeFingerprint) === normalizeText(lockedRoute.routeFingerprint)
  const qaFingerprintMatches = normalizeText(route.qaEvidenceFingerprint) === normalizeText(lockedRoute.qaEvidenceFingerprint)
  const lockFingerprintMatches = normalizeText(route.sourceLockFingerprint) === normalizeText(preflight.sourceLockFingerprint)
  const approvalReferenceMatches = normalizeText(route.approvalReference) === normalizeText(preflight.approvalReference)
  const projectRefMatches = normalizeText(route.targetProjectRef) === normalizeText(target.projectRef) &&
    normalizeText(target.projectRef) === normalizeText(target.confirmProjectRef)
  const productionTargetMatches = normalizeKey(route.targetEnvironment) === 'production' &&
    normalizeKey(target.environment) === 'production' &&
    normalizeKey(target.confirmEnvironment) === 'production'
  const routeBound = normalizeKey(route.routeKey) === variant.key &&
    normalizeText(route.sourcePacketId) === normalizeText(lockedRoute.packetId) &&
    normalizeText(route.sourceVersionId) === normalizeText(lockedRoute.versionId) &&
    normalizeText(route.sourceTemplateKey) === normalizeText(lockedRoute.templateKey) &&
    normalizeText(route.sourceRenderedSha256) === normalizeText(lockedRoute.renderedSha256) &&
    normalizeText(route.sourceEnvelopeId) === normalizeText(lockedRoute.envelopeId)
  const noWrite = route.noWrite === true &&
    route.executed === false &&
    executedWriteCount === 0 &&
    dryRun.noWrite === true &&
    dryRun.mutatedData === false
  const pass = routeBound &&
    productionTargetMatches &&
    projectRefMatches &&
    routeFingerprintMatches &&
    qaFingerprintMatches &&
    lockFingerprintMatches &&
    approvalReferenceMatches &&
    route.runtimeFlagsBound === true &&
    route.rollbackBound === true &&
    route.wouldPromote === true &&
    noWrite

  return {
    routeKey: variant.key,
    routeLabel: variant.label,
    sourcePacketId: normalizeText(route.sourcePacketId),
    sourceVersionId: normalizeText(route.sourceVersionId),
    targetTemplateKey: normalizeText(route.targetTemplateKey),
    targetEnvironment: normalizeText(route.targetEnvironment),
    targetProjectRef: normalizeText(route.targetProjectRef),
    routeFingerprint: normalizeText(route.routeFingerprint),
    qaEvidenceFingerprint: normalizeText(route.qaEvidenceFingerprint),
    routeBound,
    productionTargetMatches,
    projectRefMatches,
    routeFingerprintMatches,
    qaFingerprintMatches,
    lockFingerprintMatches,
    approvalReferenceMatches,
    runtimeFlagsBound: route.runtimeFlagsBound === true,
    rollbackBound: route.rollbackBound === true,
    noWrite,
    executedWriteCount,
    pass,
  }
}

function runtimeFlagsSafe(flags = {}) {
  return flags.otpTemplateVnextEnabled === true &&
    flags.nativePdfRendererEnabled === true &&
    flags.routeSplitEnforced === true &&
    flags.docxGenerationDisabled === true &&
    flags.fallbackDocxDisabled === true &&
    flags.signingDispatchSuppressed === true &&
    flags.finalArtifactMutationSuppressed === true &&
    flags.productionWritesEnabled === false
}

function rollbackPlanReady(plan = {}, preflight = {}) {
  return normalizeText(plan.rollbackPlanId) &&
    normalizeText(plan.ownerRole) &&
    normalizeText(plan.sourceLockFingerprint) === normalizeText(preflight.sourceLockFingerprint) &&
    normalizeText(plan.targetProjectRef) === normalizeText(preflight.target?.projectRef) &&
    Number(plan.routeCount || 0) === Number((preflight.routes || []).length) &&
    plan.rehearsed === true &&
    plan.restorePreviousProductionTemplates === true &&
    plan.disableRuntimeFlagsOnFailure === true &&
    plan.auditRollbackEventPlanned === true
}

function addCheck(checks, pass, code, detail, category = 'phase19_production_promotion_preflight') {
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

export function buildOtpProductionPromotionPreflightPhase19Audit({
  preflightEvidence = OTP_PRODUCTION_PROMOTION_PREFLIGHT_READY_EVIDENCE,
  releaseCandidateLock = null,
  checkedAt = new Date().toISOString(),
} = {}) {
  const releaseCandidateAudit = releaseCandidateLock || buildOtpReleaseCandidateLockPhase18Audit({ checkedAt })
  const lockedRouteMap = evidenceByRoute(OTP_RELEASE_CANDIDATE_LOCK_READY_EVIDENCE.routes || [])
  const preflightRouteMap = evidenceByRoute(preflightEvidence?.routes || [])
  const routeRows = OTP_DOCUMENT_VARIANTS.map((variant) =>
    buildRoutePreflightRow(
      variant,
      preflightRouteMap.get(variant.key) || {},
      lockedRouteMap.get(variant.key) || {},
      preflightEvidence || {},
    ),
  )
  const expectedPreflightFingerprint = stableFingerprint(preflightPayload(preflightEvidence || {}), 'otp-prod-preflight')
  const expectedRouteKeys = OTP_DOCUMENT_VARIANTS.map((variant) => variant.key).join(',')
  const targetRouteKeys = list(preflightEvidence?.target?.routeKeys).map(normalizeKey).join(',')
  const targetConfirmed = normalizeKey(preflightEvidence?.target?.environment) === 'production' &&
    normalizeKey(preflightEvidence?.target?.confirmEnvironment) === 'production' &&
    targetRouteKeys === expectedRouteKeys
  const projectConfirmed = normalizeText(preflightEvidence?.target?.projectRef) === normalizeText(preflightEvidence?.target?.confirmProjectRef) &&
    Boolean(normalizeText(preflightEvidence?.target?.projectRef))
  const approvalReferenceMatches = normalizeText(preflightEvidence?.approvalReference) === normalizeText(releaseCandidateAudit.lock?.approvalReference)
  const lockFingerprintMatches = normalizeText(preflightEvidence?.sourceLockFingerprint) === normalizeText(releaseCandidateAudit.lock?.releaseCandidateFingerprint)
  const safeFlags = runtimeFlagsSafe(preflightEvidence?.runtimeFlags || {})
  const rollbackReady = rollbackPlanReady(preflightEvidence?.rollbackPlan || {}, preflightEvidence || {})
  const dryRun = preflightEvidence?.dryRun || {}
  const noWriteDryRun = normalizeKey(preflightEvidence?.mode) === 'no_write_dry_run' &&
    normalizeKey(dryRun.mode) === 'no_write' &&
    dryRun.noWrite === true &&
    dryRun.mutatedData === false &&
    dryRun.providerCallsSuppressed === true &&
    dryRun.templateWritesSuppressed === true &&
    dryRun.runtimeFlagWritesSuppressed === true &&
    (Array.isArray(dryRun.writeOperations) ? dryRun.writeOperations : []).every((operation) => operation.wouldWrite === true && operation.executed === false)
  const missingAuditEvents = REQUIRED_AUDIT_EVENTS.filter((event) => !list(dryRun.auditEventsPlanned).map(normalizeKey).includes(event))
  const missingStopConditions = REQUIRED_STOP_CONDITIONS.filter((condition) => !list(preflightEvidence?.stopConditions).map(normalizeKey).includes(condition))
  const checks = []
  const blockers = []
  const warnings = []

  addCheck(checks, releaseCandidateAudit.status === OTP_RELEASE_CANDIDATE_LOCK_READY_STATUS, 'PHASE19_RELEASE_CANDIDATE_LOCK_READY', 'Phase 18 release-candidate lock is ready before production promotion preflight.')
  addCheck(checks, targetConfirmed, 'PHASE19_PRODUCTION_TARGET_CONFIRMED', 'Production target and route set are explicitly confirmed.')
  addCheck(checks, projectConfirmed, 'PHASE19_PROJECT_REF_CONFIRMED', 'Production project ref matches the explicit confirmation value.')
  addCheck(checks, approvalReferenceMatches, 'PHASE19_APPROVAL_REFERENCE_MATCHES_LOCK', 'Promotion preflight approval reference matches the Phase 18 lock.')
  addCheck(checks, lockFingerprintMatches, 'PHASE19_LOCK_FINGERPRINT_MATCHES', 'Promotion preflight is bound to the exact release-candidate lock fingerprint.')
  addCheck(checks, safeFlags, 'PHASE19_RUNTIME_FLAGS_SAFE', 'Runtime flags keep native OTP vNext enabled, route split enforced, DOCX/fallback disabled and production writes off.')
  addCheck(checks, rollbackReady, 'PHASE19_ROLLBACK_PLAN_BOUND', 'Rollback plan is rehearsed and bound to the same lock fingerprint and production project ref.')
  addCheck(checks, noWriteDryRun, 'PHASE19_NO_WRITE_DRY_RUN_PROVED', 'Promotion dry-run plans write operations without executing them or mutating data.')
  addCheck(checks, routeRows.length === 2 && routeRows.every((row) => row.pass), 'PHASE19_BOTH_ROUTES_PREFLIGHTED', 'Both resale and new-development route promotions pass no-write preflight.')
  addCheck(checks, routeRows.every((row) => row.routeFingerprintMatches && row.qaFingerprintMatches), 'PHASE19_ROUTE_FINGERPRINTS_BOUND', 'Each route promotion is bound to the locked route and QA evidence fingerprints.')
  addCheck(checks, normalizeText(preflightEvidence?.preflightFingerprint) === expectedPreflightFingerprint, 'PHASE19_PREFLIGHT_FINGERPRINT_MATCHES', 'The preflight fingerprint matches the target, lock, runtime flag, rollback and route payload.')
  addCheck(checks, missingAuditEvents.length === 0, 'PHASE19_AUDIT_EVENTS_PLANNED', 'Production target, lock verification and no-write dry-run audit events are planned.')
  addCheck(checks, missingStopConditions.length === 0, 'PHASE19_STOP_CONDITIONS_BOUND', 'Stop conditions cover target, project, approval, lock, runtime, rollback, no-write and route-fingerprint failures.')

  for (const row of routeRows.filter((item) => !item.pass)) {
    addIssue(blockers, {
      code: 'PHASE19_ROUTE_PRODUCTION_PREFLIGHT_INCOMPLETE',
      category: 'production_promotion_preflight',
      routeKey: row.routeKey,
      message: `${routeLabel(row.routeKey)} production promotion preflight is incomplete or unsafe.`,
      remediation: 'Repair route binding, production target, project confirmation, release lock fingerprint, runtime flags, rollback binding or no-write evidence before controlled production activation.',
    })
  }
  for (const check of checks.filter((row) => !row.pass && row.code !== 'PHASE19_BOTH_ROUTES_PREFLIGHTED')) {
    addIssue(blockers, {
      code: check.code,
      category: check.category,
      message: check.detail,
      remediation: 'Repair production promotion preflight evidence before controlled production activation.',
    })
  }

  return {
    version: OTP_PRODUCTION_PROMOTION_PREFLIGHT_PHASE19_VERSION,
    contract: OTP_PRODUCTION_PROMOTION_PREFLIGHT_CONTRACT,
    checkedAt,
    mutatedData: false,
    status: blockers.length ? 'OTP_PRODUCTION_PROMOTION_PREFLIGHT_REMEDIATION_REQUIRED' : OTP_PRODUCTION_PROMOTION_PREFLIGHT_READY_STATUS,
    canProceedToControlledProductionActivation: blockers.length === 0,
    releaseCandidateLock: {
      version: releaseCandidateAudit.version,
      status: releaseCandidateAudit.status,
      canProceedToProductionPromotionPreflight: releaseCandidateAudit.canProceedToProductionPromotionPreflight === true,
      lockId: releaseCandidateAudit.lock?.lockId,
      approvalReference: releaseCandidateAudit.lock?.approvalReference,
      releaseCandidateFingerprint: releaseCandidateAudit.lock?.releaseCandidateFingerprint,
      blockerCount: releaseCandidateAudit.summary?.blockerCount || 0,
    },
    preflight: {
      preflightId: normalizeText(preflightEvidence?.preflightId),
      mode: normalizeText(preflightEvidence?.mode),
      sourceLockId: normalizeText(preflightEvidence?.sourceLockId),
      sourceLockFingerprint: normalizeText(preflightEvidence?.sourceLockFingerprint),
      approvalReference: normalizeText(preflightEvidence?.approvalReference),
      targetEnvironment: normalizeText(preflightEvidence?.target?.environment),
      targetProjectRef: normalizeText(preflightEvidence?.target?.projectRef),
      preflightFingerprint: normalizeText(preflightEvidence?.preflightFingerprint),
      expectedPreflightFingerprint,
    },
    summary: {
      routeCount: routeRows.length,
      preflightedRouteCount: routeRows.filter((row) => row.pass).length,
      targetConfirmed: targetConfirmed === true,
      projectConfirmed: projectConfirmed === true,
      approvalReferenceMatches: approvalReferenceMatches === true,
      lockFingerprintMatches: lockFingerprintMatches === true,
      runtimeFlagsSafe: safeFlags === true,
      rollbackReady: rollbackReady === true,
      noWriteDryRun: noWriteDryRun === true,
      executedWriteCount: routeRows.reduce((sum, row) => sum + row.executedWriteCount, 0),
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

export function formatOtpProductionPromotionPreflightPhase19Markdown(report = buildOtpProductionPromotionPreflightPhase19Audit()) {
  return [
    '# OTP Template vNext Phase 19 Production Promotion Preflight',
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
        ['Preflighted routes', report.summary.preflightedRouteCount],
        ['Target confirmed', report.summary.targetConfirmed ? 'yes' : 'no'],
        ['Project confirmed', report.summary.projectConfirmed ? 'yes' : 'no'],
        ['Approval reference matches', report.summary.approvalReferenceMatches ? 'yes' : 'no'],
        ['Lock fingerprint matches', report.summary.lockFingerprintMatches ? 'yes' : 'no'],
        ['Runtime flags safe', report.summary.runtimeFlagsSafe ? 'yes' : 'no'],
        ['Rollback ready', report.summary.rollbackReady ? 'yes' : 'no'],
        ['No-write dry-run', report.summary.noWriteDryRun ? 'yes' : 'no'],
        ['Executed writes', report.summary.executedWriteCount],
        ['Missing audit events', report.summary.missingAuditEventCount],
        ['Missing stop conditions', report.summary.missingStopConditionCount],
        ['Blockers', report.summary.blockerCount],
        ['Warnings', report.summary.warningCount],
        ['Proceed to controlled production activation', report.canProceedToControlledProductionActivation ? 'yes' : 'no'],
      ],
    ),
    '',
    '## Preflight',
    '',
    table(
      ['Field', 'Value'],
      [
        ['Preflight id', report.preflight.preflightId],
        ['Mode', report.preflight.mode],
        ['Source lock id', report.preflight.sourceLockId],
        ['Source lock fingerprint', report.preflight.sourceLockFingerprint],
        ['Approval reference', report.preflight.approvalReference],
        ['Target environment', report.preflight.targetEnvironment],
        ['Target project ref', report.preflight.targetProjectRef],
        ['Preflight fingerprint', report.preflight.preflightFingerprint],
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
    '## Route Preflight',
    '',
    table(
      ['Route', 'Source Packet', 'Version', 'Target Template', 'Project', 'Route Fingerprint', 'QA Fingerprint', 'No Write', 'Pass'],
      report.routeRows.map((row) => [
        row.routeLabel,
        row.sourcePacketId,
        row.sourceVersionId,
        row.targetTemplateKey,
        row.targetProjectRef,
        row.routeFingerprint,
        row.qaEvidenceFingerprint,
        row.noWrite ? 'yes' : 'no',
        row.pass ? 'yes' : 'no',
      ]),
    ),
    '',
    '## Boundary',
    '',
    'Phase 19 proves production promotion readiness as a no-write dry-run only. It does not mutate production templates, enable production writes, dispatch signing, create final signed artifacts, or activate production traffic.',
    '',
  ].join('\n')
}
