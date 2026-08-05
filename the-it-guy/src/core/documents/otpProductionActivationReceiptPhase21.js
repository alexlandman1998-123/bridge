import { canonicalLegalDocumentReleaseValue } from './legalDocumentReleaseReceipt.js'
import {
  OTP_DOCUMENT_VARIANTS,
} from './otpRouteUniverse.js'
import {
  OTP_CONTROLLED_PRODUCTION_ACTIVATION_DRY_RUN_READY_EVIDENCE,
  OTP_CONTROLLED_PRODUCTION_ACTIVATION_DRY_RUN_READY_STATUS,
  buildOtpControlledProductionActivationDryRunPhase20Audit,
} from './otpControlledProductionActivationDryRunPhase20.js'

export const OTP_PRODUCTION_ACTIVATION_RECEIPT_PHASE21_VERSION = 'otp_production_activation_receipt_phase21_v1'
export const OTP_PRODUCTION_ACTIVATION_RECEIPT_READY_STATUS = 'OTP_PRODUCTION_ACTIVATION_RECEIPT_READY_FOR_LIVE_WRITE_GUARD'
export const OTP_PRODUCTION_ACTIVATION_RECEIPT_CONTRACT = 'otp-vnext-production-activation-receipt-phase21-v1'

const REQUIRED_RECEIPT_TERMS = Object.freeze([
  'receipt_required_before_production_write',
  'separate_apply_command_required',
  'matching_receipt_fingerprint_required',
  'operator_confirmation_required',
  'rollback_plan_required',
  'no_uncontrolled_write_allowed',
])

const REQUIRED_STOP_CONDITIONS = Object.freeze([
  'activation_dry_run_not_ready',
  'activation_fingerprint_mismatch',
  'preflight_fingerprint_mismatch',
  'lock_fingerprint_mismatch',
  'receipt_expired',
  'receipt_authority_missing',
  'route_receipt_mismatch',
  'write_terms_unsafe',
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

function stableFingerprint(value, prefix = 'otp-prod-receipt') {
  const canonical = JSON.stringify(canonicalLegalDocumentReleaseValue(value))
  let hash = 0x811c9dc5
  for (let index = 0; index < canonical.length; index += 1) {
    hash ^= canonical.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return `${prefix}:${hash.toString(16).padStart(8, '0')}:${canonical.length}`
}

function receiptPayload(receipt = {}) {
  return canonicalLegalDocumentReleaseValue({
    contract: OTP_PRODUCTION_ACTIVATION_RECEIPT_CONTRACT,
    receiptId: receipt.receiptId,
    receiptStatus: receipt.receiptStatus,
    issuedAt: receipt.issuedAt,
    expiresAt: receipt.expiresAt,
    issuedByRole: receipt.issuedByRole,
    authorisedByRole: receipt.authorisedByRole,
    approvalReference: receipt.approvalReference,
    sourceActivationId: receipt.sourceActivationId,
    sourceActivationFingerprint: receipt.sourceActivationFingerprint,
    sourcePreflightFingerprint: receipt.sourcePreflightFingerprint,
    sourceLockFingerprint: receipt.sourceLockFingerprint,
    target: receipt.target,
    rollbackPlanId: receipt.rollbackPlanId,
    writeTerms: receipt.writeTerms,
    routeReceipts: (receipt.routeReceipts || []).map((route) => ({
      routeKey: route.routeKey,
      routeFingerprint: route.routeFingerprint,
      qaEvidenceFingerprint: route.qaEvidenceFingerprint,
      operationNames: route.operationNames,
    })),
  })
}

function buildRouteReceipts(activation = OTP_CONTROLLED_PRODUCTION_ACTIVATION_DRY_RUN_READY_EVIDENCE) {
  return (activation.routes || []).map((route) => {
    const operationNames = (activation.operations || [])
      .filter((operation) => normalizeKey(operation.routeKey) === normalizeKey(route.routeKey))
      .map((operation) => normalizeKey(operation.operation))
    return Object.freeze({
      routeKey: route.routeKey,
      routeLabel: route.routeLabel,
      sourcePacketId: route.sourcePacketId,
      sourceVersionId: route.sourceVersionId,
      targetTemplateKey: route.targetTemplateKey,
      targetProjectRef: route.targetProjectRef,
      routeFingerprint: route.routeFingerprint,
      qaEvidenceFingerprint: route.qaEvidenceFingerprint,
      operationNames: Object.freeze(operationNames),
      plannedOperationCount: operationNames.length,
      receiptRequiredBeforeWrite: true,
    })
  })
}

function buildReadyReceipt(activation = OTP_CONTROLLED_PRODUCTION_ACTIVATION_DRY_RUN_READY_EVIDENCE) {
  const receipt = {
    receiptId: 'otp-vnext-production-activation-receipt-2026-08-05',
    receiptStatus: 'authority_format_recorded',
    issuedAt: '2026-08-05T10:40:00.000Z',
    expiresAt: '2026-08-06T10:40:00.000Z',
    issuedByRole: 'system_release_manager',
    authorisedByRole: 'accountable_production_release_owner',
    authorityScope: 'otp_vnext_controlled_production_activation',
    approvalReference: activation.approvalReference,
    sourceActivationId: activation.activationId,
    sourceActivationFingerprint: activation.activationFingerprint,
    sourcePreflightId: activation.sourcePreflightId,
    sourcePreflightFingerprint: activation.sourcePreflightFingerprint,
    sourceLockId: activation.sourceLockId,
    sourceLockFingerprint: activation.sourceLockFingerprint,
    target: Object.freeze({
      environment: 'production',
      projectRef: activation.target?.projectRef,
      routeKeys: Object.freeze(OTP_DOCUMENT_VARIANTS.map((variant) => variant.key)),
    }),
    rollbackPlanId: activation.rollbackControls?.rollbackPlanId,
    writeTerms: Object.freeze({
      requiredBeforeProductionWrite: true,
      productionWritesAllowedByThisReceipt: false,
      requiresSeparateApplyCommand: true,
      requiresMatchingReceiptFingerprint: true,
      requiresOperatorConfirmation: true,
      requiresRollbackPlan: true,
      noUncontrolledWriteAllowed: true,
      terms: REQUIRED_RECEIPT_TERMS,
    }),
    routeReceipts: Object.freeze(buildRouteReceipts(activation)),
    stopConditions: REQUIRED_STOP_CONDITIONS,
  }
  return Object.freeze({
    ...receipt,
    receiptFingerprint: stableFingerprint(receiptPayload(receipt), 'otp-prod-receipt'),
  })
}

export const OTP_PRODUCTION_ACTIVATION_RECEIPT_READY_EVIDENCE = buildReadyReceipt()

function receiptTimeValid(receipt = {}, checkedAt = new Date().toISOString()) {
  const issuedAt = Date.parse(receipt.issuedAt || '')
  const expiresAt = Date.parse(receipt.expiresAt || '')
  const checked = Date.parse(checkedAt || '')
  return Number.isFinite(issuedAt) &&
    Number.isFinite(expiresAt) &&
    Number.isFinite(checked) &&
    issuedAt <= checked &&
    checked < expiresAt
}

function authorityPresent(receipt = {}) {
  return Boolean(normalizeText(receipt.receiptId)) &&
    normalizeKey(receipt.receiptStatus) === 'authority_format_recorded' &&
    Boolean(normalizeText(receipt.issuedByRole)) &&
    Boolean(normalizeText(receipt.authorisedByRole)) &&
    Boolean(normalizeText(receipt.authorityScope)) &&
    Boolean(normalizeText(receipt.approvalReference))
}

function writeTermsSafe(terms = {}) {
  const termList = list(terms.terms).map(normalizeKey)
  return terms.requiredBeforeProductionWrite === true &&
    terms.productionWritesAllowedByThisReceipt === false &&
    terms.requiresSeparateApplyCommand === true &&
    terms.requiresMatchingReceiptFingerprint === true &&
    terms.requiresOperatorConfirmation === true &&
    terms.requiresRollbackPlan === true &&
    terms.noUncontrolledWriteAllowed === true &&
    REQUIRED_RECEIPT_TERMS.every((term) => termList.includes(term))
}

function buildRouteReceiptRow(variant, receiptRoute = {}, activationRoute = {}, activation = {}) {
  const expectedOperations = (activation.operations || [])
    .filter((operation) => normalizeKey(operation.routeKey) === variant.key)
    .map((operation) => normalizeKey(operation.operation))
  const operationNames = list(receiptRoute.operationNames).map(normalizeKey)
  const missingOperations = expectedOperations.filter((operation) => !operationNames.includes(operation))
  const extraOperations = operationNames.filter((operation) => !expectedOperations.includes(operation))
  const routeBound = normalizeKey(receiptRoute.routeKey) === variant.key &&
    normalizeText(receiptRoute.sourcePacketId) === normalizeText(activationRoute.sourcePacketId) &&
    normalizeText(receiptRoute.sourceVersionId) === normalizeText(activationRoute.sourceVersionId) &&
    normalizeText(receiptRoute.targetTemplateKey) === normalizeText(activationRoute.targetTemplateKey) &&
    normalizeText(receiptRoute.targetProjectRef) === normalizeText(activationRoute.targetProjectRef)
  const fingerprintsBound = normalizeText(receiptRoute.routeFingerprint) === normalizeText(activationRoute.routeFingerprint) &&
    normalizeText(receiptRoute.qaEvidenceFingerprint) === normalizeText(activationRoute.qaEvidenceFingerprint)
  const pass = routeBound &&
    fingerprintsBound &&
    receiptRoute.receiptRequiredBeforeWrite === true &&
    expectedOperations.length === 3 &&
    missingOperations.length === 0 &&
    extraOperations.length === 0

  return {
    routeKey: variant.key,
    routeLabel: variant.label,
    sourcePacketId: normalizeText(receiptRoute.sourcePacketId),
    sourceVersionId: normalizeText(receiptRoute.sourceVersionId),
    targetTemplateKey: normalizeText(receiptRoute.targetTemplateKey),
    targetProjectRef: normalizeText(receiptRoute.targetProjectRef),
    routeFingerprint: normalizeText(receiptRoute.routeFingerprint),
    qaEvidenceFingerprint: normalizeText(receiptRoute.qaEvidenceFingerprint),
    plannedOperationCount: Number(receiptRoute.plannedOperationCount || 0),
    expectedOperationCount: expectedOperations.length,
    missingOperations,
    extraOperations,
    routeBound,
    fingerprintsBound,
    receiptRequiredBeforeWrite: receiptRoute.receiptRequiredBeforeWrite === true,
    pass,
  }
}

function addCheck(checks, pass, code, detail, category = 'phase21_production_activation_receipt') {
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

export function buildOtpProductionActivationReceiptPhase21Audit({
  receiptEvidence = OTP_PRODUCTION_ACTIVATION_RECEIPT_READY_EVIDENCE,
  controlledActivationDryRun = null,
  checkedAt = new Date().toISOString(),
} = {}) {
  const activationAudit = controlledActivationDryRun || buildOtpControlledProductionActivationDryRunPhase20Audit({ checkedAt })
  const receiptRouteMap = evidenceByRoute(receiptEvidence?.routeReceipts || [])
  const activationRouteMap = evidenceByRoute(OTP_CONTROLLED_PRODUCTION_ACTIVATION_DRY_RUN_READY_EVIDENCE.routes || [])
  const routeRows = OTP_DOCUMENT_VARIANTS.map((variant) =>
    buildRouteReceiptRow(
      variant,
      receiptRouteMap.get(variant.key) || {},
      activationRouteMap.get(variant.key) || {},
      OTP_CONTROLLED_PRODUCTION_ACTIVATION_DRY_RUN_READY_EVIDENCE,
    ),
  )
  const activationFingerprintMatches = normalizeText(receiptEvidence?.sourceActivationFingerprint) === normalizeText(activationAudit.activation?.activationFingerprint)
  const preflightFingerprintMatches = normalizeText(receiptEvidence?.sourcePreflightFingerprint) === normalizeText(activationAudit.activation?.sourcePreflightFingerprint)
  const lockFingerprintMatches = normalizeText(receiptEvidence?.sourceLockFingerprint) === normalizeText(activationAudit.activation?.sourceLockFingerprint)
  const approvalReferenceMatches = normalizeText(receiptEvidence?.approvalReference) === normalizeText(activationAudit.activation?.approvalReference)
  const targetBound = normalizeKey(receiptEvidence?.target?.environment) === 'production' &&
    normalizeText(receiptEvidence?.target?.projectRef) === normalizeText(activationAudit.activation?.targetProjectRef) &&
    list(receiptEvidence?.target?.routeKeys).map(normalizeKey).join(',') === OTP_DOCUMENT_VARIANTS.map((variant) => variant.key).join(',')
  const rollbackBound = normalizeText(receiptEvidence?.rollbackPlanId) === normalizeText(activationAudit.activation?.rollbackPlanId)
  const timeValid = receiptTimeValid(receiptEvidence || {}, checkedAt)
  const authorityValid = authorityPresent(receiptEvidence || {})
  const safeWriteTerms = writeTermsSafe(receiptEvidence?.writeTerms || {})
  const expectedReceiptFingerprint = stableFingerprint(receiptPayload(receiptEvidence || {}), 'otp-prod-receipt')
  const missingStopConditions = REQUIRED_STOP_CONDITIONS.filter((condition) => !list(receiptEvidence?.stopConditions).map(normalizeKey).includes(condition))
  const checks = []
  const blockers = []
  const warnings = []

  addCheck(checks, activationAudit.status === OTP_CONTROLLED_PRODUCTION_ACTIVATION_DRY_RUN_READY_STATUS, 'PHASE21_CONTROLLED_ACTIVATION_DRY_RUN_READY', 'Phase 20 controlled production activation dry-run is ready before receipt authority is recorded.')
  addCheck(checks, authorityValid, 'PHASE21_RECEIPT_AUTHORITY_PRESENT', 'Receipt includes id, status, issuing role, authorising role, authority scope and approval reference.')
  addCheck(checks, timeValid, 'PHASE21_RECEIPT_TIME_WINDOW_VALID', 'Receipt issue and expiry window is valid for this check.')
  addCheck(checks, activationFingerprintMatches && preflightFingerprintMatches && lockFingerprintMatches && approvalReferenceMatches, 'PHASE21_ACTIVATION_AUTHORITY_CHAIN_BOUND', 'Receipt is bound to the exact activation dry-run, preflight, release lock and approval reference.')
  addCheck(checks, targetBound, 'PHASE21_PRODUCTION_TARGET_BOUND', 'Receipt target is production and matches the activation dry-run project and route set.')
  addCheck(checks, rollbackBound, 'PHASE21_ROLLBACK_PLAN_BOUND', 'Receipt carries the rollback plan required by controlled activation.')
  addCheck(checks, safeWriteTerms, 'PHASE21_WRITE_TERMS_REQUIRE_RECEIPT_AND_SEPARATE_APPLY', 'Receipt terms require the receipt before production write and still require a separate apply command and operator confirmation.')
  addCheck(checks, routeRows.length === 2 && routeRows.every((row) => row.pass), 'PHASE21_BOTH_ROUTE_RECEIPTS_RECORDED', 'Receipt records exact resale and new-development route authority rows.')
  addCheck(checks, routeRows.every((row) => row.fingerprintsBound), 'PHASE21_ROUTE_RECEIPT_FINGERPRINTS_BOUND', 'Each route receipt is bound to the activation route and QA fingerprints.')
  addCheck(checks, normalizeText(receiptEvidence?.receiptFingerprint) === expectedReceiptFingerprint, 'PHASE21_RECEIPT_FINGERPRINT_MATCHES', 'Receipt fingerprint matches authority, target, write terms, rollback and route receipt payload.')
  addCheck(checks, missingStopConditions.length === 0, 'PHASE21_RECEIPT_STOP_CONDITIONS_BOUND', 'Stop conditions cover activation readiness, fingerprint mismatch, expiry, authority, routes and unsafe write terms.')

  for (const row of routeRows.filter((item) => !item.pass)) {
    addIssue(blockers, {
      code: 'PHASE21_ROUTE_PRODUCTION_ACTIVATION_RECEIPT_INVALID',
      category: 'production_activation_receipt',
      routeKey: row.routeKey,
      message: `${routeLabel(row.routeKey)} production activation receipt route row is incomplete or unsafe.`,
      remediation: 'Repair route receipt binding, operation list, fingerprint binding, or receipt-required-before-write terms before any live write guard can proceed.',
    })
  }
  for (const check of checks.filter((row) => !row.pass && row.code !== 'PHASE21_BOTH_ROUTE_RECEIPTS_RECORDED')) {
    addIssue(blockers, {
      code: check.code,
      category: check.category,
      message: check.detail,
      remediation: 'Repair production activation receipt authority before live write guard.',
    })
  }

  return {
    version: OTP_PRODUCTION_ACTIVATION_RECEIPT_PHASE21_VERSION,
    contract: OTP_PRODUCTION_ACTIVATION_RECEIPT_CONTRACT,
    checkedAt,
    mutatedData: false,
    status: blockers.length ? 'OTP_PRODUCTION_ACTIVATION_RECEIPT_REMEDIATION_REQUIRED' : OTP_PRODUCTION_ACTIVATION_RECEIPT_READY_STATUS,
    canProceedToLiveWriteGuard: blockers.length === 0,
    controlledActivationDryRun: {
      version: activationAudit.version,
      status: activationAudit.status,
      canProceedToProductionActivationReceipt: activationAudit.canProceedToProductionActivationReceipt === true,
      activationId: activationAudit.activation?.activationId,
      activationFingerprint: activationAudit.activation?.activationFingerprint,
      blockerCount: activationAudit.summary?.blockerCount || 0,
    },
    receipt: {
      receiptId: normalizeText(receiptEvidence?.receiptId),
      receiptStatus: normalizeText(receiptEvidence?.receiptStatus),
      issuedAt: normalizeText(receiptEvidence?.issuedAt),
      expiresAt: normalizeText(receiptEvidence?.expiresAt),
      issuedByRole: normalizeText(receiptEvidence?.issuedByRole),
      authorisedByRole: normalizeText(receiptEvidence?.authorisedByRole),
      approvalReference: normalizeText(receiptEvidence?.approvalReference),
      sourceActivationFingerprint: normalizeText(receiptEvidence?.sourceActivationFingerprint),
      sourcePreflightFingerprint: normalizeText(receiptEvidence?.sourcePreflightFingerprint),
      sourceLockFingerprint: normalizeText(receiptEvidence?.sourceLockFingerprint),
      rollbackPlanId: normalizeText(receiptEvidence?.rollbackPlanId),
      targetEnvironment: normalizeText(receiptEvidence?.target?.environment),
      targetProjectRef: normalizeText(receiptEvidence?.target?.projectRef),
      receiptFingerprint: normalizeText(receiptEvidence?.receiptFingerprint),
      expectedReceiptFingerprint,
    },
    summary: {
      routeCount: routeRows.length,
      validRouteReceiptCount: routeRows.filter((row) => row.pass).length,
      authorityPresent: authorityValid === true,
      timeWindowValid: timeValid === true,
      activationFingerprintMatches: activationFingerprintMatches === true,
      preflightFingerprintMatches: preflightFingerprintMatches === true,
      lockFingerprintMatches: lockFingerprintMatches === true,
      approvalReferenceMatches: approvalReferenceMatches === true,
      targetBound: targetBound === true,
      rollbackBound: rollbackBound === true,
      writeTermsSafe: safeWriteTerms === true,
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

export function formatOtpProductionActivationReceiptPhase21Markdown(report = buildOtpProductionActivationReceiptPhase21Audit()) {
  return [
    '# OTP Template vNext Phase 21 Production Activation Receipt',
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
        ['Valid route receipts', report.summary.validRouteReceiptCount],
        ['Authority present', report.summary.authorityPresent ? 'yes' : 'no'],
        ['Time window valid', report.summary.timeWindowValid ? 'yes' : 'no'],
        ['Activation fingerprint matches', report.summary.activationFingerprintMatches ? 'yes' : 'no'],
        ['Preflight fingerprint matches', report.summary.preflightFingerprintMatches ? 'yes' : 'no'],
        ['Lock fingerprint matches', report.summary.lockFingerprintMatches ? 'yes' : 'no'],
        ['Target bound', report.summary.targetBound ? 'yes' : 'no'],
        ['Rollback bound', report.summary.rollbackBound ? 'yes' : 'no'],
        ['Write terms safe', report.summary.writeTermsSafe ? 'yes' : 'no'],
        ['Missing stop conditions', report.summary.missingStopConditionCount],
        ['Blockers', report.summary.blockerCount],
        ['Warnings', report.summary.warningCount],
        ['Proceed to live write guard', report.canProceedToLiveWriteGuard ? 'yes' : 'no'],
      ],
    ),
    '',
    '## Receipt',
    '',
    table(
      ['Field', 'Value'],
      [
        ['Receipt id', report.receipt.receiptId],
        ['Receipt status', report.receipt.receiptStatus],
        ['Issued at', report.receipt.issuedAt],
        ['Expires at', report.receipt.expiresAt],
        ['Issued by role', report.receipt.issuedByRole],
        ['Authorised by role', report.receipt.authorisedByRole],
        ['Approval reference', report.receipt.approvalReference],
        ['Activation fingerprint', report.receipt.sourceActivationFingerprint],
        ['Preflight fingerprint', report.receipt.sourcePreflightFingerprint],
        ['Lock fingerprint', report.receipt.sourceLockFingerprint],
        ['Rollback plan id', report.receipt.rollbackPlanId],
        ['Target environment', report.receipt.targetEnvironment],
        ['Target project ref', report.receipt.targetProjectRef],
        ['Receipt fingerprint', report.receipt.receiptFingerprint],
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
    '## Write Terms',
    '',
    table(
      ['Term', 'Required'],
      REQUIRED_RECEIPT_TERMS.map((term) => [term, 'yes']),
    ),
    '',
    '## Route Receipts',
    '',
    table(
      ['Route', 'Source Packet', 'Version', 'Target Template', 'Operations', 'Receipt Required', 'Fingerprints', 'Pass'],
      report.routeRows.map((row) => [
        row.routeLabel,
        row.sourcePacketId,
        row.sourceVersionId,
        row.targetTemplateKey,
        `${row.plannedOperationCount}/${row.expectedOperationCount}`,
        row.receiptRequiredBeforeWrite ? 'yes' : 'no',
        row.fingerprintsBound ? 'yes' : 'no',
        row.pass ? 'yes' : 'no',
      ]),
    ),
    '',
    '## Boundary',
    '',
    'Phase 21 records the activation authority/receipt format required before any real production write is allowed. It does not grant uncontrolled write authority, execute production writes, mutate live templates, change route defaults, dispatch signing, or activate production traffic.',
    '',
  ].join('\n')
}
