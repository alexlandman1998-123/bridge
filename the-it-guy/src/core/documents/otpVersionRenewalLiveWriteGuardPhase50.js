import {
  OTP_VERSION_RENEWAL_ACTIVATION_RECEIPT_PHASE49_VERSION,
  OTP_VERSION_RENEWAL_ACTIVATION_RECEIPT_READY_STATUS,
  buildOtpVersionRenewalActivationReceiptPhase49Audit,
} from './otpVersionRenewalActivationReceiptPhase49.js'

export const OTP_VERSION_RENEWAL_LIVE_WRITE_GUARD_PHASE50_VERSION = 'otp_version_renewal_live_write_guard_phase50_v1'
export const OTP_VERSION_RENEWAL_LIVE_WRITE_GUARD_READY_STATUS = 'OTP_VERSION_RENEWAL_LIVE_WRITE_GUARD_READY_FOR_CONTROLLED_APPLY_DRY_RUN'
export const OTP_VERSION_RENEWAL_LIVE_WRITE_GUARD_CONTRACT = 'otp-vnext-version-renewal-live-write-guard-phase50-v1'

const REQUIRED_ROUTES = Object.freeze(['resale_existing_property', 'new_development'])
const VERSION_POINTER_OPERATION = 'switch_version_pointer'
const REQUIRED_GUARD_TERMS = Object.freeze([
  'receipt_fingerprint_required',
  'operator_confirmation_required',
  'rollback_plan_required',
  'route_fingerprint_required',
  'version_pointer_fingerprint_required',
  'exact_operation_required',
  'deny_by_default',
  'no_write_during_guard',
])
const REQUIRED_STOP_CONDITIONS = Object.freeze([
  'receipt_not_ready',
  'receipt_fingerprint_mismatch',
  'operator_confirmation_mismatch',
  'rollback_plan_mismatch',
  'route_fingerprint_mismatch',
  'version_pointer_fingerprint_mismatch',
  'operation_not_authorised',
  'write_executed_during_guard',
  'guard_fingerprint_mismatch',
  'guard_terms_unsafe',
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

function stableFingerprint(value, prefix = 'otp-phase50-live-guard') {
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

function confirmationPhrase(receipt = {}) {
  return `OTP_VERSION_RENEWAL_ACTIVATION_CONFIRMED:${receipt.receiptId}:${receipt.target?.versionKey}`
}

function guardPayload(guard = {}) {
  return {
    contract: OTP_VERSION_RENEWAL_LIVE_WRITE_GUARD_CONTRACT,
    guardId: guard.guardId,
    sourceReceiptId: guard.sourceReceiptId,
    sourceReceiptFingerprint: guard.sourceReceiptFingerprint,
    targetEnvironment: guard.targetEnvironment,
    targetVersionKey: guard.targetVersionKey,
    previousVersionKey: guard.previousVersionKey,
    rollbackPlanReference: guard.rollbackPlanReference,
    operator: guard.operator,
    operatorConfirmationPhrase: guard.operatorConfirmationPhrase,
    guardTerms: guard.guardTerms,
    routeDecisions: list(guard.routeDecisions).map((decision) => ({
      routeVariant: decision.routeVariant,
      operation: decision.operation,
      targetLiveTemplateDefaultId: decision.targetLiveTemplateDefaultId,
      targetSigningEnvelopeKey: decision.targetSigningEnvelopeKey,
      receiptFingerprint: decision.receiptFingerprint,
      routeOutputFingerprint: decision.routeOutputFingerprint,
      rollbackPlanReference: decision.rollbackPlanReference,
      operator: decision.operator,
      operatorConfirmationPhrase: decision.operatorConfirmationPhrase,
      guardDecision: decision.guardDecision,
    })),
    versionPointerDecision: guard.versionPointerDecision,
  }
}

function routeReceiptMap(receipt = {}) {
  return new Map(list(receipt.routeReceipts).map((route) => [normalizeKey(route.routeVariant), route]))
}

function buildRouteDecisions(receipt = {}) {
  return list(receipt.routeReceipts).flatMap((route) =>
    list(route.operationNames).map((operation) => Object.freeze({
      decisionId: `otp-version-renewal-live-write-guard-${normalizeKey(route.routeVariant)}-${normalizeKey(operation)}`,
      routeVariant: route.routeVariant,
      routeLabel: route.routeLabel,
      operation: normalizeKey(operation),
      targetLiveTemplateDefaultId: route.targetLiveTemplateDefaultId,
      targetSigningEnvelopeKey: route.targetSigningEnvelopeKey,
      receiptId: receipt.receiptId,
      receiptFingerprint: receipt.receiptFingerprint,
      routeOutputFingerprint: route.routeOutputFingerprint,
      rollbackPlanReference: receipt.rollbackPlanReference,
      operator: receipt.operatorConfirmation?.operator,
      operatorConfirmationPhrase: confirmationPhrase(receipt),
      exactOperationMatched: true,
      guardDecision: 'would_allow_after_controlled_apply_dry_run',
      writeExecuted: false,
      mutationSuppressed: true,
    })),
  )
}

function buildVersionPointerDecision(receipt = {}) {
  return Object.freeze({
    decisionId: 'otp-version-renewal-live-write-guard-version-pointer',
    operation: VERSION_POINTER_OPERATION,
    previousVersionKey: receipt.versionPointerReceipt?.previousVersionKey,
    targetVersionKey: receipt.versionPointerReceipt?.targetVersionKey,
    pointerFingerprint: receipt.versionPointerReceipt?.pointerFingerprint,
    receiptId: receipt.receiptId,
    receiptFingerprint: receipt.receiptFingerprint,
    rollbackPlanReference: receipt.rollbackPlanReference,
    operator: receipt.operatorConfirmation?.operator,
    operatorConfirmationPhrase: confirmationPhrase(receipt),
    exactOperationMatched: true,
    guardDecision: 'would_allow_after_controlled_apply_dry_run',
    writeExecuted: false,
    mutationSuppressed: true,
  })
}

function defaultGuardEvidence(activationReceipt = {}) {
  const receipt = activationReceipt.receiptEvidence || {}
  const receiptWithFingerprint = { ...receipt, receiptFingerprint: activationReceipt.receiptFingerprint || receipt.receiptFingerprint }
  const guard = {
    guardId: 'otp-vnext-phase50-version-renewal-live-write-guard',
    sourceReceiptId: receiptWithFingerprint.receiptId,
    sourceReceiptFingerprint: receiptWithFingerprint.receiptFingerprint,
    targetEnvironment: receiptWithFingerprint.target?.environment,
    targetVersionKey: receiptWithFingerprint.target?.versionKey,
    previousVersionKey: receiptWithFingerprint.target?.previousVersionKey,
    rollbackPlanReference: receiptWithFingerprint.rollbackPlanReference,
    operator: receiptWithFingerprint.operatorConfirmation?.operator,
    operatorConfirmationPhrase: confirmationPhrase(receiptWithFingerprint),
    mode: 'guard_evaluation_only',
    denyByDefault: true,
    writesExecuted: false,
    mutatedData: false,
    guardTerms: Object.freeze({
      receiptFingerprintRequired: true,
      operatorConfirmationRequired: true,
      rollbackPlanRequired: true,
      routeFingerprintRequired: true,
      versionPointerFingerprintRequired: true,
      exactOperationRequired: true,
      denyByDefault: true,
      noWriteDuringGuard: true,
      terms: Object.freeze([...REQUIRED_GUARD_TERMS]),
    }),
    routeDecisions: Object.freeze(buildRouteDecisions(receiptWithFingerprint)),
    versionPointerDecision: buildVersionPointerDecision(receiptWithFingerprint),
    stopConditions: Object.freeze([...REQUIRED_STOP_CONDITIONS]),
    noWriteProof: Object.freeze({
      guardOnly: true,
      mutatedData: false,
      writeExecuted: false,
      liveDefaultMutationCount: 0,
      signingEnvelopeMutationCount: 0,
      versionPointerMutationCount: 0,
      signingDispatchMutationCount: 0,
    }),
  }
  return Object.freeze({
    ...guard,
    guardFingerprint: stableFingerprint(guardPayload(guard), 'otp-phase50-live-guard'),
  })
}

function phase49Blockers(activationReceipt = {}) {
  return [
    activationReceipt.version === OTP_VERSION_RENEWAL_ACTIVATION_RECEIPT_PHASE49_VERSION ? '' : 'phase49_receipt_version_mismatch',
    activationReceipt.status === OTP_VERSION_RENEWAL_ACTIVATION_RECEIPT_READY_STATUS ? '' : 'phase49_receipt_not_ready',
    activationReceipt.canProceedToLiveWriteGuard === true ? '' : 'phase49_receipt_cannot_proceed',
    activationReceipt.mutatedData === false ? '' : 'phase49_receipt_mutation_unexpected',
    list(activationReceipt.blockerCodes).length === 0 ? '' : 'phase49_receipt_has_blockers',
  ].filter(Boolean)
}

function guardTermsBlockers(terms = {}) {
  const termList = list(terms.terms).map(normalizeKey)
  return [
    terms.receiptFingerprintRequired === true ? '' : 'guard_terms_receipt_fingerprint_not_required',
    terms.operatorConfirmationRequired === true ? '' : 'guard_terms_operator_confirmation_not_required',
    terms.rollbackPlanRequired === true ? '' : 'guard_terms_rollback_plan_not_required',
    terms.routeFingerprintRequired === true ? '' : 'guard_terms_route_fingerprint_not_required',
    terms.versionPointerFingerprintRequired === true ? '' : 'guard_terms_version_pointer_fingerprint_not_required',
    terms.exactOperationRequired === true ? '' : 'guard_terms_exact_operation_not_required',
    terms.denyByDefault === true ? '' : 'guard_terms_deny_by_default_missing',
    terms.noWriteDuringGuard === true ? '' : 'guard_terms_no_write_during_guard_missing',
    ...REQUIRED_GUARD_TERMS.filter((term) => !termList.includes(term)).map((term) => `guard_terms_missing:${term}`),
  ].filter(Boolean)
}

function guardHeaderBlockers(guard = {}, receipt = {}) {
  return [
    normalizeText(guard.guardId) ? '' : 'guard_id_missing',
    guard.sourceReceiptId === receipt.receiptId ? '' : 'guard_source_receipt_id_mismatch',
    guard.sourceReceiptFingerprint === receipt.receiptFingerprint ? '' : 'guard_source_receipt_fingerprint_mismatch',
    normalizeKey(guard.targetEnvironment) === 'production' ? '' : 'guard_target_not_production',
    guard.targetVersionKey === receipt.target?.versionKey ? '' : 'guard_target_version_mismatch',
    guard.previousVersionKey === receipt.target?.previousVersionKey ? '' : 'guard_previous_version_mismatch',
    guard.rollbackPlanReference === receipt.rollbackPlanReference ? '' : 'guard_rollback_plan_mismatch',
    guard.operator === receipt.operatorConfirmation?.operator ? '' : 'guard_operator_mismatch',
    guard.operatorConfirmationPhrase === confirmationPhrase(receipt) ? '' : 'guard_operator_confirmation_phrase_mismatch',
    normalizeKey(guard.mode) === 'guard_evaluation_only' ? '' : 'guard_mode_not_evaluation_only',
    guard.denyByDefault === true ? '' : 'guard_not_deny_by_default',
  ].filter(Boolean)
}

function routeDecisionBlockers(routeDecisions = [], receipt = {}) {
  const receiptRoutes = routeReceiptMap(receipt)
  const decisions = list(routeDecisions)
  const rowBlockers = decisions.flatMap((decision) => {
    const route = normalizeKey(decision.routeVariant)
    const receiptRoute = receiptRoutes.get(route) || {}
    const allowedOperations = list(receiptRoute.operationNames).map(normalizeKey)
    return [
      REQUIRED_ROUTES.includes(route) ? '' : `route_decision_unsupported:${route || 'unknown'}`,
      allowedOperations.includes(normalizeKey(decision.operation)) && decision.exactOperationMatched === true ? '' : `route_decision_operation_not_authorised:${route || 'unknown'}:${normalizeKey(decision.operation) || 'unknown'}`,
      decision.targetLiveTemplateDefaultId === receiptRoute.targetLiveTemplateDefaultId ? '' : `route_decision_template_mismatch:${route || 'unknown'}`,
      decision.targetSigningEnvelopeKey === receiptRoute.targetSigningEnvelopeKey ? '' : `route_decision_envelope_mismatch:${route || 'unknown'}`,
      decision.receiptFingerprint === receipt.receiptFingerprint ? '' : `route_decision_receipt_fingerprint_mismatch:${route || 'unknown'}`,
      decision.routeOutputFingerprint === receiptRoute.routeOutputFingerprint ? '' : `route_decision_route_fingerprint_mismatch:${route || 'unknown'}`,
      decision.rollbackPlanReference === receipt.rollbackPlanReference ? '' : `route_decision_rollback_mismatch:${route || 'unknown'}`,
      decision.operator === receipt.operatorConfirmation?.operator ? '' : `route_decision_operator_mismatch:${route || 'unknown'}`,
      decision.operatorConfirmationPhrase === confirmationPhrase(receipt) ? '' : `route_decision_operator_confirmation_mismatch:${route || 'unknown'}`,
      normalizeKey(decision.guardDecision) === 'would_allow_after_controlled_apply_dry_run' ? '' : `route_decision_not_allowable:${route || 'unknown'}`,
      decision.writeExecuted === false && decision.mutationSuppressed === true ? '' : `route_decision_write_executed:${route || 'unknown'}`,
    ].filter(Boolean)
  })
  const expectedDecisionCount = list(receipt.routeReceipts).reduce((sum, route) => sum + list(route.operationNames).length, 0)
  const routeCoverageBlockers = REQUIRED_ROUTES.flatMap((route) => {
    const receiptRoute = receiptRoutes.get(route) || {}
    const allowedOperations = list(receiptRoute.operationNames).map(normalizeKey)
    const observedOperations = decisions
      .filter((decision) => normalizeKey(decision.routeVariant) === route)
      .map((decision) => normalizeKey(decision.operation))
    return allowedOperations
      .filter((operation) => !observedOperations.includes(operation))
      .map((operation) => `route_decision_missing:${route}:${operation}`)
  })
  return [
    decisions.length === expectedDecisionCount ? '' : 'route_decision_count_mismatch',
    ...routeCoverageBlockers,
    ...rowBlockers,
  ].filter(Boolean)
}

function versionPointerDecisionBlockers(decision = {}, receipt = {}) {
  return [
    normalizeKey(decision.operation) === VERSION_POINTER_OPERATION && decision.exactOperationMatched === true ? '' : 'version_pointer_operation_not_authorised',
    decision.previousVersionKey === receipt.versionPointerReceipt?.previousVersionKey ? '' : 'version_pointer_previous_version_mismatch',
    decision.targetVersionKey === receipt.versionPointerReceipt?.targetVersionKey ? '' : 'version_pointer_target_version_mismatch',
    decision.pointerFingerprint === receipt.versionPointerReceipt?.pointerFingerprint ? '' : 'version_pointer_fingerprint_mismatch',
    decision.receiptFingerprint === receipt.receiptFingerprint ? '' : 'version_pointer_receipt_fingerprint_mismatch',
    decision.rollbackPlanReference === receipt.rollbackPlanReference ? '' : 'version_pointer_rollback_mismatch',
    decision.operator === receipt.operatorConfirmation?.operator ? '' : 'version_pointer_operator_mismatch',
    decision.operatorConfirmationPhrase === confirmationPhrase(receipt) ? '' : 'version_pointer_operator_confirmation_mismatch',
    normalizeKey(decision.guardDecision) === 'would_allow_after_controlled_apply_dry_run' ? '' : 'version_pointer_decision_not_allowable',
    decision.writeExecuted === false && decision.mutationSuppressed === true ? '' : 'version_pointer_write_executed',
  ].filter(Boolean)
}

function noWriteBlockers(guard = {}) {
  const proof = guard.noWriteProof || {}
  return [
    guard.writesExecuted === false ? '' : 'guard_writes_executed',
    guard.mutatedData === false ? '' : 'guard_mutated_data',
    proof.guardOnly === true ? '' : 'guard_no_write_proof_not_guard_only',
    proof.mutatedData === false ? '' : 'guard_no_write_proof_mutated_data',
    proof.writeExecuted === false ? '' : 'guard_no_write_proof_write_executed',
    numberValue(proof.liveDefaultMutationCount) === 0 ? '' : 'guard_live_default_mutation_observed',
    numberValue(proof.signingEnvelopeMutationCount) === 0 ? '' : 'guard_signing_envelope_mutation_observed',
    numberValue(proof.versionPointerMutationCount) === 0 ? '' : 'guard_version_pointer_mutation_observed',
    numberValue(proof.signingDispatchMutationCount) === 0 ? '' : 'guard_signing_dispatch_mutation_observed',
  ].filter(Boolean)
}

function stopConditionBlockers(stopConditions = []) {
  const conditions = list(stopConditions).map(normalizeKey)
  return REQUIRED_STOP_CONDITIONS
    .filter((condition) => !conditions.includes(condition))
    .map((condition) => `guard_stop_condition_missing:${condition}`)
}

function addCheck(checks, pass, code, detail) {
  checks.push({ code, pass: Boolean(pass), detail })
}

export function buildOtpVersionRenewalLiveWriteGuard({
  activationReceipt = buildOtpVersionRenewalActivationReceiptPhase49Audit().activationReceipts?.find((receipt) => receipt.canProceedToLiveWriteGuard),
  guardEvidence = defaultGuardEvidence(activationReceipt),
  checkedAt = new Date().toISOString(),
} = {}) {
  const receipt = {
    ...(activationReceipt?.receiptEvidence || {}),
    receiptFingerprint: activationReceipt?.receiptFingerprint || activationReceipt?.receiptEvidence?.receiptFingerprint,
  }
  const expectedGuardFingerprint = stableFingerprint(guardPayload(guardEvidence), 'otp-phase50-live-guard')
  const guardFingerprint = normalizeText(guardEvidence?.guardFingerprint) || expectedGuardFingerprint
  const blockerCodes = unique([
    ...phase49Blockers(activationReceipt || {}),
    ...guardHeaderBlockers(guardEvidence || {}, receipt),
    ...guardTermsBlockers(guardEvidence?.guardTerms || {}),
    ...routeDecisionBlockers(guardEvidence?.routeDecisions, receipt),
    ...versionPointerDecisionBlockers(guardEvidence?.versionPointerDecision, receipt),
    ...noWriteBlockers(guardEvidence || {}),
    ...stopConditionBlockers(guardEvidence?.stopConditions),
    guardFingerprint === expectedGuardFingerprint ? '' : 'guard_fingerprint_mismatch',
  ])
  const canProceedToControlledApplyDryRun = blockerCodes.length === 0

  return Object.freeze({
    version: OTP_VERSION_RENEWAL_LIVE_WRITE_GUARD_PHASE50_VERSION,
    contract: OTP_VERSION_RENEWAL_LIVE_WRITE_GUARD_CONTRACT,
    checkedAt,
    status: canProceedToControlledApplyDryRun
      ? OTP_VERSION_RENEWAL_LIVE_WRITE_GUARD_READY_STATUS
      : 'OTP_VERSION_RENEWAL_LIVE_WRITE_GUARD_BLOCKED',
    canProceedToControlledApplyDryRun,
    mutatedData: false,
    blockerCodes: Object.freeze(blockerCodes),
    expectedGuardFingerprint,
    guardFingerprint,
    guardEvidence: Object.freeze({
      ...guardEvidence,
      guardFingerprint,
    }),
    activationReceipt: Object.freeze({
      version: activationReceipt?.version,
      status: activationReceipt?.status,
      canProceedToLiveWriteGuard: activationReceipt?.canProceedToLiveWriteGuard === true,
      receiptId: receipt.receiptId,
      receiptFingerprint: receipt.receiptFingerprint,
      blockerCount: list(activationReceipt?.blockerCodes).length,
    }),
    summary: Object.freeze({
      routeDecisionCount: list(guardEvidence?.routeDecisions).length,
      expectedRouteDecisionCount: list(receipt.routeReceipts).reduce((sum, route) => sum + list(route.operationNames).length, 0),
      routeCount: REQUIRED_ROUTES.length,
      versionPointerDecisionPresent: Boolean(guardEvidence?.versionPointerDecision),
      guardTermsSafe: guardTermsBlockers(guardEvidence?.guardTerms || {}).length === 0,
      receiptFingerprintMatches: guardHeaderBlockers(guardEvidence || {}, receipt).filter((code) => code.includes('receipt')).length === 0,
      noWriteObserved: noWriteBlockers(guardEvidence || {}).length === 0,
      fingerprintMatches: guardFingerprint === expectedGuardFingerprint,
      blockerCount: blockerCodes.length,
    }),
  })
}

export function buildOtpVersionRenewalLiveWriteGuardPhase50Audit({
  checkedAt = new Date().toISOString(),
  phase49Audit = null,
  packageJson = {},
} = {}) {
  const checks = []
  const phase49Ready = !phase49Audit || phase49Audit.status === OTP_VERSION_RENEWAL_ACTIVATION_RECEIPT_READY_STATUS
  const goodReceipt = phase49Audit?.activationReceipts?.find((receipt) => receipt.canProceedToLiveWriteGuard) ||
    buildOtpVersionRenewalActivationReceiptPhase49Audit({ checkedAt }).activationReceipts.find((receipt) => receipt.canProceedToLiveWriteGuard)
  const goodGuardEvidence = defaultGuardEvidence(goodReceipt)
  const goodGuard = buildOtpVersionRenewalLiveWriteGuard({ checkedAt, activationReceipt: goodReceipt, guardEvidence: goodGuardEvidence })
  const blockedReceiptGuard = buildOtpVersionRenewalLiveWriteGuard({
    checkedAt,
    activationReceipt: {
      ...goodReceipt,
      status: 'OTP_VERSION_RENEWAL_ACTIVATION_RECEIPT_BLOCKED',
      canProceedToLiveWriteGuard: false,
      blockerCodes: ['receipt_fingerprint_mismatch'],
    },
    guardEvidence: goodGuardEvidence,
  })
  const receiptFingerprintMismatchGuard = buildOtpVersionRenewalLiveWriteGuard({
    checkedAt,
    activationReceipt: goodReceipt,
    guardEvidence: { ...goodGuardEvidence, sourceReceiptFingerprint: 'wrong-receipt-fingerprint' },
  })
  const operatorMismatchGuard = buildOtpVersionRenewalLiveWriteGuard({
    checkedAt,
    activationReceipt: goodReceipt,
    guardEvidence: {
      ...goodGuardEvidence,
      operator: 'wrong-operator',
      operatorConfirmationPhrase: 'wrong-confirmation',
    },
  })
  const routeMismatchGuard = buildOtpVersionRenewalLiveWriteGuard({
    checkedAt,
    activationReceipt: goodReceipt,
    guardEvidence: {
      ...goodGuardEvidence,
      routeDecisions: goodGuardEvidence.routeDecisions.map((decision) =>
        decision.routeVariant === 'resale_existing_property'
          ? { ...decision, routeOutputFingerprint: 'wrong-route-fingerprint', targetLiveTemplateDefaultId: 'wrong-template' }
          : decision,
      ),
    },
  })
  const versionPointerMismatchGuard = buildOtpVersionRenewalLiveWriteGuard({
    checkedAt,
    activationReceipt: goodReceipt,
    guardEvidence: {
      ...goodGuardEvidence,
      versionPointerDecision: { ...goodGuardEvidence.versionPointerDecision, targetVersionKey: 'wrong-version', pointerFingerprint: 'wrong-pointer' },
    },
  })
  const unauthorizedOperationGuard = buildOtpVersionRenewalLiveWriteGuard({
    checkedAt,
    activationReceipt: goodReceipt,
    guardEvidence: {
      ...goodGuardEvidence,
      routeDecisions: goodGuardEvidence.routeDecisions.map((decision, index) =>
        index === 0 ? { ...decision, operation: 'delete_live_template', exactOperationMatched: false } : decision,
      ),
    },
  })
  const rollbackMismatchGuard = buildOtpVersionRenewalLiveWriteGuard({
    checkedAt,
    activationReceipt: goodReceipt,
    guardEvidence: {
      ...goodGuardEvidence,
      rollbackPlanReference: 'wrong-rollback-plan',
      routeDecisions: goodGuardEvidence.routeDecisions.map((decision) => ({ ...decision, rollbackPlanReference: 'wrong-rollback-plan' })),
      versionPointerDecision: { ...goodGuardEvidence.versionPointerDecision, rollbackPlanReference: 'wrong-rollback-plan' },
    },
  })
  const unsafeTermsGuard = buildOtpVersionRenewalLiveWriteGuard({
    checkedAt,
    activationReceipt: goodReceipt,
    guardEvidence: {
      ...goodGuardEvidence,
      denyByDefault: false,
      guardTerms: { ...goodGuardEvidence.guardTerms, denyByDefault: false, noWriteDuringGuard: false },
    },
  })
  const liveWriteObservedGuard = buildOtpVersionRenewalLiveWriteGuard({
    checkedAt,
    activationReceipt: goodReceipt,
    guardEvidence: {
      ...goodGuardEvidence,
      writesExecuted: true,
      mutatedData: true,
      routeDecisions: goodGuardEvidence.routeDecisions.map((decision, index) =>
        index === 0 ? { ...decision, writeExecuted: true, mutationSuppressed: false } : decision,
      ),
      noWriteProof: {
        ...goodGuardEvidence.noWriteProof,
        guardOnly: false,
        mutatedData: true,
        writeExecuted: true,
        liveDefaultMutationCount: 1,
        versionPointerMutationCount: 1,
      },
    },
  })
  const guardFingerprintMismatch = buildOtpVersionRenewalLiveWriteGuard({
    checkedAt,
    activationReceipt: goodReceipt,
    guardEvidence: { ...goodGuardEvidence, guardFingerprint: 'otp-phase50-live-guard:00000000:1' },
  })

  addCheck(checks, phase49Ready, 'PHASE50_PHASE49_ACTIVATION_RECEIPT_READY', 'Phase 49 activation receipt is ready before live write guard evaluation.')
  addCheck(checks, goodGuard.canProceedToControlledApplyDryRun && goodGuard.mutatedData === false, 'PHASE50_GOOD_LIVE_WRITE_GUARD_READY', 'A clean Phase 49 receipt can pass guard evaluation without executing a live write.')
  addCheck(checks, goodGuard.summary.receiptFingerprintMatches, 'PHASE50_RECEIPT_FINGERPRINT_MATCHES', 'Guard is bound to the exact Phase 49 receipt fingerprint.')
  addCheck(checks, goodGuard.summary.routeDecisionCount === goodGuard.summary.expectedRouteDecisionCount, 'PHASE50_ROUTE_OPERATIONS_BOUND', 'Every receipt-authorised route operation is evaluated exactly.')
  addCheck(checks, goodGuard.summary.versionPointerDecisionPresent, 'PHASE50_VERSION_POINTER_OPERATION_BOUND', 'Version pointer switch is explicitly guarded.')
  addCheck(checks, goodGuard.summary.guardTermsSafe, 'PHASE50_GUARD_TERMS_DENY_BY_DEFAULT', 'Guard terms require receipt fingerprint, operator, rollback, route fingerprint, version pointer fingerprint, exact operation, deny-by-default, and no-write mode.')
  addCheck(checks, goodGuard.summary.noWriteObserved, 'PHASE50_NO_LIVE_WRITE_EXECUTED', 'Guard evaluation executes no live write and records no mutation.')
  addCheck(checks, goodGuard.summary.fingerprintMatches, 'PHASE50_GUARD_FINGERPRINT_MATCHES', 'Guard fingerprint matches receipt, operator, rollback, route decisions, version pointer decision, and terms.')
  addCheck(checks, blockedReceiptGuard.canProceedToControlledApplyDryRun === false && blockedReceiptGuard.blockerCodes.includes('phase49_receipt_not_ready'), 'PHASE50_BLOCKED_PHASE49_RECEIPT_REJECTED', 'A blocked Phase 49 receipt cannot pass live write guard.')
  addCheck(checks, receiptFingerprintMismatchGuard.canProceedToControlledApplyDryRun === false && receiptFingerprintMismatchGuard.blockerCodes.includes('guard_source_receipt_fingerprint_mismatch'), 'PHASE50_RECEIPT_FINGERPRINT_MISMATCH_BLOCKED', 'Receipt fingerprint mismatches are blocked.')
  addCheck(checks, operatorMismatchGuard.canProceedToControlledApplyDryRun === false && operatorMismatchGuard.blockerCodes.includes('guard_operator_mismatch'), 'PHASE50_OPERATOR_MISMATCH_BLOCKED', 'Operator and confirmation phrase mismatches are blocked.')
  addCheck(checks, routeMismatchGuard.canProceedToControlledApplyDryRun === false && routeMismatchGuard.blockerCodes.includes('route_decision_route_fingerprint_mismatch:resale_existing_property'), 'PHASE50_ROUTE_FINGERPRINT_MISMATCH_BLOCKED', 'Route template and fingerprint mismatches are blocked.')
  addCheck(checks, versionPointerMismatchGuard.canProceedToControlledApplyDryRun === false && versionPointerMismatchGuard.blockerCodes.includes('version_pointer_target_version_mismatch'), 'PHASE50_VERSION_POINTER_MISMATCH_BLOCKED', 'Version pointer mismatches are blocked.')
  addCheck(checks, unauthorizedOperationGuard.canProceedToControlledApplyDryRun === false && unauthorizedOperationGuard.blockerCodes.includes('route_decision_operation_not_authorised:resale_existing_property:delete_live_template'), 'PHASE50_UNAUTHORISED_OPERATION_BLOCKED', 'Operations not authorised by the Phase 49 receipt are blocked.')
  addCheck(checks, rollbackMismatchGuard.canProceedToControlledApplyDryRun === false && rollbackMismatchGuard.blockerCodes.includes('guard_rollback_plan_mismatch'), 'PHASE50_ROLLBACK_MISMATCH_BLOCKED', 'Rollback plan mismatches are blocked.')
  addCheck(checks, unsafeTermsGuard.canProceedToControlledApplyDryRun === false && unsafeTermsGuard.blockerCodes.includes('guard_terms_deny_by_default_missing'), 'PHASE50_UNSAFE_GUARD_TERMS_BLOCKED', 'Unsafe guard terms are blocked.')
  addCheck(checks, liveWriteObservedGuard.canProceedToControlledApplyDryRun === false && liveWriteObservedGuard.blockerCodes.includes('guard_writes_executed'), 'PHASE50_LIVE_WRITE_OBSERVED_BLOCKED', 'Any write or mutation during guard evaluation is blocked.')
  addCheck(checks, guardFingerprintMismatch.canProceedToControlledApplyDryRun === false && guardFingerprintMismatch.blockerCodes.includes('guard_fingerprint_mismatch'), 'PHASE50_GUARD_FINGERPRINT_MISMATCH_BLOCKED', 'Guard fingerprint mismatches are blocked.')
  addCheck(
    checks,
    packageJson.scripts?.['test:otp-version-renewal-live-write-guard-phase50'] === 'node scripts/otp-version-renewal-live-write-guard-phase50.test.mjs' &&
      packageJson.scripts?.['report:otp-version-renewal-live-write-guard-phase50'] === 'node scripts/report-otp-version-renewal-live-write-guard-phase50.mjs' &&
      packageJson.scripts?.['verify:otp-template-vnext']?.includes('test:otp-version-renewal-live-write-guard-phase50'),
    'PHASE50_PACKAGE_SCRIPTS_WIRED',
    'Package scripts expose the Phase 50 test, report, and vNext verification chain entry.',
  )

  const blockers = checks.filter((check) => !check.pass)
  return Object.freeze({
    version: OTP_VERSION_RENEWAL_LIVE_WRITE_GUARD_PHASE50_VERSION,
    contract: OTP_VERSION_RENEWAL_LIVE_WRITE_GUARD_CONTRACT,
    checkedAt,
    status: blockers.length ? 'OTP_VERSION_RENEWAL_LIVE_WRITE_GUARD_REMEDIATION_REQUIRED' : OTP_VERSION_RENEWAL_LIVE_WRITE_GUARD_READY_STATUS,
    canProceedToControlledApplyDryRun: blockers.length === 0,
    mutatedData: false,
    checks: Object.freeze(checks),
    blockers: Object.freeze(blockers),
    guardReceipts: Object.freeze([
      goodGuard,
      blockedReceiptGuard,
      receiptFingerprintMismatchGuard,
      operatorMismatchGuard,
      routeMismatchGuard,
      versionPointerMismatchGuard,
      unauthorizedOperationGuard,
      rollbackMismatchGuard,
      unsafeTermsGuard,
      liveWriteObservedGuard,
      guardFingerprintMismatch,
    ]),
    summary: Object.freeze({
      blockerCount: blockers.length,
      readyGuardCount: [goodGuard].filter((row) => row.canProceedToControlledApplyDryRun).length,
      blockedGuardCount: [
        blockedReceiptGuard,
        receiptFingerprintMismatchGuard,
        operatorMismatchGuard,
        routeMismatchGuard,
        versionPointerMismatchGuard,
        unauthorizedOperationGuard,
        rollbackMismatchGuard,
        unsafeTermsGuard,
        liveWriteObservedGuard,
        guardFingerprintMismatch,
      ].filter((row) => !row.canProceedToControlledApplyDryRun).length,
      routeCount: REQUIRED_ROUTES.length,
      routeDecisionCount: goodGuard.summary.routeDecisionCount,
      requiredGuardTermCount: REQUIRED_GUARD_TERMS.length,
      requiredStopConditionCount: REQUIRED_STOP_CONDITIONS.length,
    }),
    nextPhase: blockers.length ? null : Object.freeze({
      phase: 51,
      key: 'otp_controlled_version_renewal_apply_dry_run',
      label: 'Controlled Version Renewal Apply Dry Run',
    }),
  })
}

export function formatOtpVersionRenewalLiveWriteGuardPhase50Markdown(report = buildOtpVersionRenewalLiveWriteGuardPhase50Audit()) {
  const readyGuard = report.guardReceipts.find((guard) => guard.canProceedToControlledApplyDryRun) || report.guardReceipts[0]
  const guard = readyGuard?.guardEvidence || {}
  return [
    '# OTP Generator Phase 50 Version Renewal Live Write Guard',
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
        ['Route decisions', report.summary.routeDecisionCount],
        ['Guard terms', report.summary.requiredGuardTermCount],
        ['Stop conditions', report.summary.requiredStopConditionCount],
        ['Blockers', report.summary.blockerCount],
        ['Proceed to controlled apply dry run', report.canProceedToControlledApplyDryRun ? 'yes' : 'no'],
        ['Next phase', report.nextPhase ? `Phase ${report.nextPhase.phase}: ${report.nextPhase.label}` : 'Blocked'],
      ],
    ),
    '',
    '## Guard',
    '',
    table(
      ['Field', 'Value'],
      [
        ['Guard id', guard.guardId],
        ['Mode', guard.mode],
        ['Source receipt id', guard.sourceReceiptId],
        ['Source receipt fingerprint', guard.sourceReceiptFingerprint],
        ['Target environment', guard.targetEnvironment],
        ['Target version key', guard.targetVersionKey],
        ['Previous version key', guard.previousVersionKey],
        ['Rollback plan reference', guard.rollbackPlanReference],
        ['Operator', guard.operator],
        ['Operator confirmation', guard.operatorConfirmationPhrase],
        ['Guard fingerprint', readyGuard?.guardFingerprint],
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
    '## Route Decisions',
    '',
    table(
      ['Route', 'Operation', 'Target Template', 'Target Envelope', 'Fingerprint', 'Decision', 'Write Executed'],
      list(guard.routeDecisions).map((decision) => [
        decision.routeVariant,
        decision.operation,
        decision.targetLiveTemplateDefaultId,
        decision.targetSigningEnvelopeKey,
        decision.routeOutputFingerprint,
        decision.guardDecision,
        decision.writeExecuted ? 'yes' : 'no',
      ]),
    ),
    '',
    '## Version Pointer Decision',
    '',
    table(
      ['Operation', 'Previous Version', 'Target Version', 'Fingerprint', 'Decision', 'Write Executed'],
      [[
        guard.versionPointerDecision?.operation,
        guard.versionPointerDecision?.previousVersionKey,
        guard.versionPointerDecision?.targetVersionKey,
        guard.versionPointerDecision?.pointerFingerprint,
        guard.versionPointerDecision?.guardDecision,
        guard.versionPointerDecision?.writeExecuted ? 'yes' : 'no',
      ]],
    ),
    '',
    '## Blocked Guard Proofs',
    '',
    table(
      ['Status', 'Allowed', 'Blockers'],
      report.guardReceipts.map((candidate) => [
        candidate.status,
        candidate.canProceedToControlledApplyDryRun ? 'yes' : 'no',
        candidate.blockerCodes.join(', ') || 'none',
      ]),
    ),
    '',
    '## Boundary',
    '',
    'Phase 50 proves no live version renewal write can proceed unless the Phase 49 receipt fingerprint, exact route operations, version pointer operation, operator confirmation, rollback reference, guard terms, and guard fingerprint all match. It remains guard-only: it does not execute production writes, mutate live defaults, change version pointers, dispatch signing, or publish templates. It only prepares Phase 51 controlled apply dry run.',
    '',
  ].join('\n')
}
