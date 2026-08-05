import { canonicalLegalDocumentReleaseValue } from './legalDocumentReleaseReceipt.js'
import {
  OTP_DOCUMENT_VARIANTS,
} from './otpRouteUniverse.js'
import {
  OTP_PRODUCTION_ACTIVATION_RECEIPT_READY_EVIDENCE,
  OTP_PRODUCTION_ACTIVATION_RECEIPT_READY_STATUS,
  buildOtpProductionActivationReceiptPhase21Audit,
} from './otpProductionActivationReceiptPhase21.js'

export const OTP_LIVE_WRITE_GUARD_PHASE22_VERSION = 'otp_live_write_guard_phase22_v1'
export const OTP_LIVE_WRITE_GUARD_READY_STATUS = 'OTP_LIVE_WRITE_GUARD_READY_FOR_APPLY_COMMAND_REHEARSAL'
export const OTP_LIVE_WRITE_GUARD_CONTRACT = 'otp-vnext-live-write-guard-phase22-v1'

const REQUIRED_GUARD_TERMS = Object.freeze([
  'receipt_fingerprint_required',
  'operator_confirmation_required',
  'project_ref_required',
  'rollback_plan_required',
  'route_fingerprint_required',
  'exact_operation_required',
  'deny_by_default',
])

const REQUIRED_STOP_CONDITIONS = Object.freeze([
  'receipt_not_ready',
  'receipt_fingerprint_mismatch',
  'operator_confirmation_missing',
  'project_ref_mismatch',
  'rollback_plan_mismatch',
  'route_fingerprint_mismatch',
  'operation_not_authorised',
  'write_executed_during_guard',
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

function stableFingerprint(value, prefix = 'otp-live-guard') {
  const canonical = JSON.stringify(canonicalLegalDocumentReleaseValue(value))
  let hash = 0x811c9dc5
  for (let index = 0; index < canonical.length; index += 1) {
    hash ^= canonical.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return `${prefix}:${hash.toString(16).padStart(8, '0')}:${canonical.length}`
}

function guardPayload(guard = {}) {
  return canonicalLegalDocumentReleaseValue({
    contract: OTP_LIVE_WRITE_GUARD_CONTRACT,
    guardId: guard.guardId,
    sourceReceiptId: guard.sourceReceiptId,
    sourceReceiptFingerprint: guard.sourceReceiptFingerprint,
    targetProjectRef: guard.targetProjectRef,
    rollbackPlanId: guard.rollbackPlanId,
    operatorConfirmation: guard.operatorConfirmation,
    guardTerms: guard.guardTerms,
    decisions: (guard.decisions || []).map((decision) => ({
      routeKey: decision.routeKey,
      operation: decision.operation,
      receiptFingerprint: decision.receiptFingerprint,
      routeFingerprint: decision.routeFingerprint,
      projectRef: decision.projectRef,
      rollbackPlanId: decision.rollbackPlanId,
      operatorConfirmation: decision.operatorConfirmation,
      guardDecision: decision.guardDecision,
    })),
  })
}

function buildGuardDecisions(receipt = OTP_PRODUCTION_ACTIVATION_RECEIPT_READY_EVIDENCE) {
  return (receipt.routeReceipts || []).flatMap((route) =>
    (route.operationNames || []).map((operation) => Object.freeze({
      decisionId: `otp-live-guard-${normalizeKey(route.routeKey)}-${normalizeKey(operation)}`,
      routeKey: route.routeKey,
      routeLabel: route.routeLabel,
      operation: normalizeKey(operation),
      targetTemplateKey: route.targetTemplateKey,
      projectRef: receipt.target?.projectRef,
      receiptId: receipt.receiptId,
      receiptFingerprint: receipt.receiptFingerprint,
      routeFingerprint: route.routeFingerprint,
      rollbackPlanId: receipt.rollbackPlanId,
      operatorConfirmation: 'OTP_VNEXT_PRODUCTION_ACTIVATION_CONFIRMED',
      exactOperationMatched: true,
      guardDecision: 'would_allow_after_receipt_apply_command',
      writeExecuted: false,
      mutationSuppressed: true,
    })),
  )
}

function buildReadyGuard(receipt = OTP_PRODUCTION_ACTIVATION_RECEIPT_READY_EVIDENCE) {
  const guard = {
    guardId: 'otp-vnext-live-write-guard-2026-08-05',
    checkedAt: '2026-08-05T11:05:00.000Z',
    sourceReceiptId: receipt.receiptId,
    sourceReceiptFingerprint: receipt.receiptFingerprint,
    targetEnvironment: receipt.target?.environment,
    targetProjectRef: receipt.target?.projectRef,
    rollbackPlanId: receipt.rollbackPlanId,
    operatorConfirmation: 'OTP_VNEXT_PRODUCTION_ACTIVATION_CONFIRMED',
    mode: 'guard_evaluation_only',
    denyByDefault: true,
    writesExecuted: false,
    mutatedData: false,
    guardTerms: Object.freeze({
      receiptFingerprintRequired: true,
      operatorConfirmationRequired: true,
      projectRefRequired: true,
      rollbackPlanRequired: true,
      routeFingerprintRequired: true,
      exactOperationRequired: true,
      denyByDefault: true,
      terms: REQUIRED_GUARD_TERMS,
    }),
    decisions: Object.freeze(buildGuardDecisions(receipt)),
    stopConditions: REQUIRED_STOP_CONDITIONS,
  }
  return Object.freeze({
    ...guard,
    guardFingerprint: stableFingerprint(guardPayload(guard), 'otp-live-guard'),
  })
}

export const OTP_LIVE_WRITE_GUARD_READY_EVIDENCE = buildReadyGuard()

function guardTermsSafe(terms = {}) {
  const termList = list(terms.terms).map(normalizeKey)
  return terms.receiptFingerprintRequired === true &&
    terms.operatorConfirmationRequired === true &&
    terms.projectRefRequired === true &&
    terms.rollbackPlanRequired === true &&
    terms.routeFingerprintRequired === true &&
    terms.exactOperationRequired === true &&
    terms.denyByDefault === true &&
    REQUIRED_GUARD_TERMS.every((term) => termList.includes(term))
}

function buildDecisionRow(variant, decision = {}, receiptRoute = {}, receipt = {}, guard = {}) {
  const operationNames = list(receiptRoute.operationNames).map(normalizeKey)
  const operationMatched = operationNames.includes(normalizeKey(decision.operation)) && decision.exactOperationMatched === true
  const receiptFingerprintMatched = normalizeText(decision.receiptFingerprint) === normalizeText(receipt.receiptFingerprint) &&
    normalizeText(guard.sourceReceiptFingerprint) === normalizeText(receipt.receiptFingerprint)
  const operatorConfirmed = normalizeText(decision.operatorConfirmation) === normalizeText(guard.operatorConfirmation) &&
    normalizeText(decision.operatorConfirmation) === 'OTP_VNEXT_PRODUCTION_ACTIVATION_CONFIRMED'
  const projectRefMatched = normalizeText(decision.projectRef) === normalizeText(receipt.target?.projectRef) &&
    normalizeText(guard.targetProjectRef) === normalizeText(receipt.target?.projectRef)
  const rollbackMatched = normalizeText(decision.rollbackPlanId) === normalizeText(receipt.rollbackPlanId) &&
    normalizeText(guard.rollbackPlanId) === normalizeText(receipt.rollbackPlanId)
  const routeFingerprintMatched = normalizeText(decision.routeFingerprint) === normalizeText(receiptRoute.routeFingerprint)
  const routeBound = normalizeKey(decision.routeKey) === variant.key &&
    normalizeText(decision.targetTemplateKey) === normalizeText(receiptRoute.targetTemplateKey)
  const noExecution = decision.writeExecuted === false && decision.mutationSuppressed === true
  const wouldAllow = normalizeKey(decision.guardDecision) === 'would_allow_after_receipt_apply_command'
  const pass = routeBound &&
    receiptFingerprintMatched &&
    operatorConfirmed &&
    projectRefMatched &&
    rollbackMatched &&
    routeFingerprintMatched &&
    operationMatched &&
    noExecution &&
    wouldAllow

  return {
    decisionId: normalizeText(decision.decisionId),
    routeKey: variant.key,
    routeLabel: variant.label,
    operation: normalizeKey(decision.operation),
    targetTemplateKey: normalizeText(decision.targetTemplateKey),
    guardDecision: normalizeText(decision.guardDecision),
    receiptFingerprintMatched,
    operatorConfirmed,
    projectRefMatched,
    rollbackMatched,
    routeFingerprintMatched,
    operationMatched,
    routeBound,
    noExecution,
    pass,
  }
}

function addCheck(checks, pass, code, detail, category = 'phase22_live_write_guard') {
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

export function buildOtpLiveWriteGuardPhase22Audit({
  guardEvidence = OTP_LIVE_WRITE_GUARD_READY_EVIDENCE,
  productionActivationReceipt = null,
  checkedAt = new Date().toISOString(),
} = {}) {
  const receiptAudit = productionActivationReceipt || buildOtpProductionActivationReceiptPhase21Audit({ checkedAt })
  const receipt = OTP_PRODUCTION_ACTIVATION_RECEIPT_READY_EVIDENCE
  const receiptRouteMap = evidenceByRoute(receipt.routeReceipts || [])
  const decisions = Array.isArray(guardEvidence?.decisions) ? guardEvidence.decisions : []
  const decisionRows = OTP_DOCUMENT_VARIANTS.flatMap((variant) =>
    decisions
      .filter((decision) => normalizeKey(decision.routeKey) === variant.key)
      .map((decision) => buildDecisionRow(
        variant,
        decision,
        receiptRouteMap.get(variant.key) || {},
        receipt,
        guardEvidence || {},
      )),
  )
  const expectedDecisionCount = (receipt.routeReceipts || []).reduce((sum, route) => sum + Number(route.plannedOperationCount || 0), 0)
  const receiptReady = receiptAudit.status === OTP_PRODUCTION_ACTIVATION_RECEIPT_READY_STATUS
  const guardBound = normalizeText(guardEvidence?.sourceReceiptId) === normalizeText(receiptAudit.receipt?.receiptId) &&
    normalizeText(guardEvidence?.sourceReceiptFingerprint) === normalizeText(receiptAudit.receipt?.receiptFingerprint)
  const targetMatched = normalizeKey(guardEvidence?.targetEnvironment) === 'production' &&
    normalizeText(guardEvidence?.targetProjectRef) === normalizeText(receiptAudit.receipt?.targetProjectRef)
  const rollbackMatched = normalizeText(guardEvidence?.rollbackPlanId) === normalizeText(receiptAudit.receipt?.rollbackPlanId)
  const operatorConfirmed = normalizeText(guardEvidence?.operatorConfirmation) === 'OTP_VNEXT_PRODUCTION_ACTIVATION_CONFIRMED'
  const termsSafe = guardTermsSafe(guardEvidence?.guardTerms || {})
  const noExecution = guardEvidence?.writesExecuted === false &&
    guardEvidence?.mutatedData === false &&
    decisionRows.every((row) => row.noExecution)
  const expectedGuardFingerprint = stableFingerprint(guardPayload(guardEvidence || {}), 'otp-live-guard')
  const missingStopConditions = REQUIRED_STOP_CONDITIONS.filter((condition) => !list(guardEvidence?.stopConditions).map(normalizeKey).includes(condition))
  const checks = []
  const blockers = []
  const warnings = []

  addCheck(checks, receiptReady, 'PHASE22_PRODUCTION_ACTIVATION_RECEIPT_READY', 'Phase 21 production activation receipt is ready before live write guard evaluation.')
  addCheck(checks, guardBound, 'PHASE22_RECEIPT_FINGERPRINT_MATCHES', 'Guard is bound to the exact Phase 21 receipt id and fingerprint.')
  addCheck(checks, operatorConfirmed && decisionRows.every((row) => row.operatorConfirmed), 'PHASE22_OPERATOR_CONFIRMATION_MATCHES', 'Guard and each operation carry the exact operator confirmation phrase.')
  addCheck(checks, targetMatched && decisionRows.every((row) => row.projectRefMatched), 'PHASE22_PROJECT_REF_MATCHES', 'Guard and each operation match the production project ref.')
  addCheck(checks, rollbackMatched && decisionRows.every((row) => row.rollbackMatched), 'PHASE22_ROLLBACK_PLAN_MATCHES', 'Guard and each operation match the receipt rollback plan.')
  addCheck(checks, decisionRows.every((row) => row.routeFingerprintMatched), 'PHASE22_ROUTE_FINGERPRINTS_MATCH', 'Every operation matches its route receipt fingerprint.')
  addCheck(checks, decisionRows.every((row) => row.operationMatched), 'PHASE22_EXACT_OPERATIONS_AUTHORISED', 'Every operation exactly matches the receipt operation list.')
  addCheck(checks, termsSafe && guardEvidence?.denyByDefault === true, 'PHASE22_DENY_BY_DEFAULT_TERMS_BOUND', 'Guard terms require receipt fingerprint, operator, project, rollback, route fingerprint and exact operation, and deny by default.')
  addCheck(checks, decisions.length === expectedDecisionCount && decisionRows.length === expectedDecisionCount && decisionRows.every((row) => row.pass), 'PHASE22_ALL_GUARD_DECISIONS_PASS', 'All receipt-authorised production write operations pass guard evaluation.')
  addCheck(checks, noExecution, 'PHASE22_NO_PRODUCTION_WRITE_EXECUTED', 'Guard evaluation executes no production write and mutates no data.')
  addCheck(checks, normalizeText(guardEvidence?.guardFingerprint) === expectedGuardFingerprint, 'PHASE22_GUARD_FINGERPRINT_MATCHES', 'Guard fingerprint matches receipt, operator, project, rollback, decision and term payload.')
  addCheck(checks, missingStopConditions.length === 0, 'PHASE22_STOP_CONDITIONS_BOUND', 'Stop conditions cover receipt, fingerprint, operator, project, rollback, route, operation and execution failures.')

  for (const row of decisionRows.filter((item) => !item.pass)) {
    addIssue(blockers, {
      code: 'PHASE22_LIVE_WRITE_GUARD_DECISION_INVALID',
      category: 'live_write_guard',
      routeKey: row.routeKey,
      message: `${routeLabel(row.routeKey)} live write guard decision is incomplete or unsafe for ${row.operation}.`,
      remediation: 'Repair receipt fingerprint, operator confirmation, project ref, rollback plan, route fingerprint, exact operation, or execution suppression before apply command rehearsal.',
    })
  }
  for (const check of checks.filter((row) => !row.pass && row.code !== 'PHASE22_ALL_GUARD_DECISIONS_PASS')) {
    addIssue(blockers, {
      code: check.code,
      category: check.category,
      message: check.detail,
      remediation: 'Repair live write guard evidence before apply command rehearsal.',
    })
  }

  return {
    version: OTP_LIVE_WRITE_GUARD_PHASE22_VERSION,
    contract: OTP_LIVE_WRITE_GUARD_CONTRACT,
    checkedAt,
    mutatedData: false,
    status: blockers.length ? 'OTP_LIVE_WRITE_GUARD_REMEDIATION_REQUIRED' : OTP_LIVE_WRITE_GUARD_READY_STATUS,
    canProceedToApplyCommandRehearsal: blockers.length === 0,
    productionActivationReceipt: {
      version: receiptAudit.version,
      status: receiptAudit.status,
      canProceedToLiveWriteGuard: receiptAudit.canProceedToLiveWriteGuard === true,
      receiptId: receiptAudit.receipt?.receiptId,
      receiptFingerprint: receiptAudit.receipt?.receiptFingerprint,
      blockerCount: receiptAudit.summary?.blockerCount || 0,
    },
    guard: {
      guardId: normalizeText(guardEvidence?.guardId),
      mode: normalizeText(guardEvidence?.mode),
      sourceReceiptId: normalizeText(guardEvidence?.sourceReceiptId),
      sourceReceiptFingerprint: normalizeText(guardEvidence?.sourceReceiptFingerprint),
      operatorConfirmation: normalizeText(guardEvidence?.operatorConfirmation),
      targetEnvironment: normalizeText(guardEvidence?.targetEnvironment),
      targetProjectRef: normalizeText(guardEvidence?.targetProjectRef),
      rollbackPlanId: normalizeText(guardEvidence?.rollbackPlanId),
      guardFingerprint: normalizeText(guardEvidence?.guardFingerprint),
      expectedGuardFingerprint,
    },
    summary: {
      decisionCount: decisionRows.length,
      expectedDecisionCount,
      passingDecisionCount: decisionRows.filter((row) => row.pass).length,
      receiptFingerprintMatches: guardBound === true && decisionRows.every((row) => row.receiptFingerprintMatched),
      operatorConfirmationMatches: operatorConfirmed === true && decisionRows.every((row) => row.operatorConfirmed),
      projectRefMatches: targetMatched === true && decisionRows.every((row) => row.projectRefMatched),
      rollbackPlanMatches: rollbackMatched === true && decisionRows.every((row) => row.rollbackMatched),
      routeFingerprintMatches: decisionRows.every((row) => row.routeFingerprintMatched),
      exactOperationsAuthorised: decisionRows.every((row) => row.operationMatched),
      denyByDefault: guardEvidence?.denyByDefault === true,
      noProductionWriteExecuted: noExecution === true,
      missingStopConditionCount: missingStopConditions.length,
      blockerCount: blockers.length,
      warningCount: warnings.length,
    },
    decisionRows,
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

export function formatOtpLiveWriteGuardPhase22Markdown(report = buildOtpLiveWriteGuardPhase22Audit()) {
  return [
    '# OTP Template vNext Phase 22 Live Write Guard',
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
        ['Decisions', report.summary.decisionCount],
        ['Expected decisions', report.summary.expectedDecisionCount],
        ['Passing decisions', report.summary.passingDecisionCount],
        ['Receipt fingerprint matches', report.summary.receiptFingerprintMatches ? 'yes' : 'no'],
        ['Operator confirmation matches', report.summary.operatorConfirmationMatches ? 'yes' : 'no'],
        ['Project ref matches', report.summary.projectRefMatches ? 'yes' : 'no'],
        ['Rollback plan matches', report.summary.rollbackPlanMatches ? 'yes' : 'no'],
        ['Route fingerprints match', report.summary.routeFingerprintMatches ? 'yes' : 'no'],
        ['Exact operations authorised', report.summary.exactOperationsAuthorised ? 'yes' : 'no'],
        ['Deny by default', report.summary.denyByDefault ? 'yes' : 'no'],
        ['No production write executed', report.summary.noProductionWriteExecuted ? 'yes' : 'no'],
        ['Missing stop conditions', report.summary.missingStopConditionCount],
        ['Blockers', report.summary.blockerCount],
        ['Warnings', report.summary.warningCount],
        ['Proceed to apply command rehearsal', report.canProceedToApplyCommandRehearsal ? 'yes' : 'no'],
      ],
    ),
    '',
    '## Guard',
    '',
    table(
      ['Field', 'Value'],
      [
        ['Guard id', report.guard.guardId],
        ['Mode', report.guard.mode],
        ['Source receipt id', report.guard.sourceReceiptId],
        ['Source receipt fingerprint', report.guard.sourceReceiptFingerprint],
        ['Operator confirmation', report.guard.operatorConfirmation],
        ['Target environment', report.guard.targetEnvironment],
        ['Target project ref', report.guard.targetProjectRef],
        ['Rollback plan id', report.guard.rollbackPlanId],
        ['Guard fingerprint', report.guard.guardFingerprint],
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
    '## Guard Terms',
    '',
    table(
      ['Term', 'Required'],
      REQUIRED_GUARD_TERMS.map((term) => [term, 'yes']),
    ),
    '',
    '## Decisions',
    '',
    table(
      ['Route', 'Operation', 'Receipt', 'Operator', 'Project', 'Rollback', 'Route Fingerprint', 'No Execution', 'Pass'],
      report.decisionRows.map((row) => [
        row.routeLabel,
        row.operation,
        row.receiptFingerprintMatched ? 'yes' : 'no',
        row.operatorConfirmed ? 'yes' : 'no',
        row.projectRefMatched ? 'yes' : 'no',
        row.rollbackMatched ? 'yes' : 'no',
        row.routeFingerprintMatched ? 'yes' : 'no',
        row.noExecution ? 'yes' : 'no',
        row.pass ? 'yes' : 'no',
      ]),
    ),
    '',
    '## Boundary',
    '',
    'Phase 22 proves the live write guard decision contract only. It does not execute a production write, mutate templates, change route defaults, dispatch signing, create final artifacts, or replace the later apply-command rehearsal.',
    '',
  ].join('\n')
}
