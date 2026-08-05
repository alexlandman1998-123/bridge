import {
  OTP_CONTROLLED_VERSION_RENEWAL_APPLY_DRY_RUN_PHASE51_VERSION,
  OTP_CONTROLLED_VERSION_RENEWAL_APPLY_DRY_RUN_READY_STATUS,
  buildOtpControlledVersionRenewalApplyDryRunPhase51Audit,
} from './otpControlledVersionRenewalApplyDryRunPhase51.js'

export const OTP_VERSION_RENEWAL_APPLY_RECEIPT_PHASE52_VERSION = 'otp_version_renewal_apply_receipt_phase52_v1'
export const OTP_VERSION_RENEWAL_APPLY_RECEIPT_READY_STATUS = 'OTP_VERSION_RENEWAL_APPLY_RECEIPT_READY_FOR_FINAL_LIVE_WRITE_AUTHORITY'
export const OTP_VERSION_RENEWAL_APPLY_RECEIPT_CONTRACT = 'otp-vnext-version-renewal-apply-receipt-phase52-v1'

const REQUIRED_ROUTES = Object.freeze(['resale_existing_property', 'new_development'])
const REQUIRED_ROUTE_OPERATIONS = Object.freeze(['switch_route_default', 'switch_signing_envelope', 'validate_generated_otp'])
const REQUIRED_RECEIPT_TERMS = Object.freeze([
  'apply_receipt_required_before_version_renewal_write',
  'separate_apply_command_required',
  'matching_apply_receipt_fingerprint_required',
  'matching_phase50_guard_fingerprint_required',
  'operator_confirmation_required',
  'rollback_plan_required',
  'route_fingerprint_required',
  'version_pointer_fingerprint_required',
  'no_uncontrolled_write_allowed',
])
const REQUIRED_STOP_CONDITIONS = Object.freeze([
  'apply_dry_run_not_ready',
  'apply_receipt_expired',
  'apply_receipt_authority_missing',
  'apply_dry_run_fingerprint_mismatch',
  'phase50_guard_fingerprint_mismatch',
  'route_apply_receipt_mismatch',
  'version_pointer_apply_receipt_mismatch',
  'operator_confirmation_mismatch',
  'rollback_plan_missing',
  'write_terms_unsafe',
  'live_write_requested_by_receipt',
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

function stableFingerprint(value, prefix = 'otp-phase52-apply-receipt') {
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

function routeLabel(routeVariant = '') {
  return routeVariant === 'new_development' ? 'New development OTP' : 'Existing / resale property OTP'
}

function buildRouteApplyReceipts(applyDryRunReceipt = {}) {
  return REQUIRED_ROUTES.map((routeVariant) => {
    const simulation = list(applyDryRunReceipt.routeApplySimulations).find((row) => normalizeKey(row.routeVariant) === routeVariant) || {}
    return Object.freeze({
      routeVariant,
      routeLabel: routeLabel(routeVariant),
      targetLiveTemplateDefaultId: simulation.targetLiveTemplateDefaultId,
      targetSigningEnvelopeKey: simulation.targetSigningEnvelopeKey,
      routeOutputFingerprint: simulation.routeOutputFingerprint,
      operationNames: Object.freeze([...REQUIRED_ROUTE_OPERATIONS]),
      receiptRequiredBeforeLiveWrite: true,
    })
  })
}

function receiptPayload(receipt = {}) {
  return {
    contract: OTP_VERSION_RENEWAL_APPLY_RECEIPT_CONTRACT,
    receiptId: receipt.receiptId,
    receiptStatus: receipt.receiptStatus,
    issuedAt: receipt.issuedAt,
    expiresAt: receipt.expiresAt,
    issuedByRole: receipt.issuedByRole,
    authorisedByRole: receipt.authorisedByRole,
    authorityScope: receipt.authorityScope,
    approvalReference: receipt.approvalReference,
    sourceApplyDryRunVersion: receipt.sourceApplyDryRunVersion,
    sourceApplyDryRunStatus: receipt.sourceApplyDryRunStatus,
    sourceApplyDryRunId: receipt.sourceApplyDryRunId,
    sourceApplyDryRunFingerprint: receipt.sourceApplyDryRunFingerprint,
    sourceGuardFingerprint: receipt.sourceGuardFingerprint,
    sourceReceiptFingerprint: receipt.sourceReceiptFingerprint,
    target: receipt.target,
    operatorConfirmation: receipt.operatorConfirmation,
    rollbackPlanReference: receipt.rollbackPlanReference,
    writeTerms: receipt.writeTerms,
    routeApplyReceipts: list(receipt.routeApplyReceipts).map((route) => ({
      routeVariant: route.routeVariant,
      targetLiveTemplateDefaultId: route.targetLiveTemplateDefaultId,
      targetSigningEnvelopeKey: route.targetSigningEnvelopeKey,
      routeOutputFingerprint: route.routeOutputFingerprint,
      operationNames: route.operationNames,
      receiptRequiredBeforeLiveWrite: route.receiptRequiredBeforeLiveWrite,
    })),
    versionPointerApplyReceipt: receipt.versionPointerApplyReceipt,
  }
}

function defaultReceiptEvidence(applyDryRunReceipt = {}, checkedAt = new Date().toISOString()) {
  return {
    receiptId: 'otp-vnext-version-renewal-apply-receipt-2026-08-05',
    receiptStatus: 'authority_format_recorded',
    issuedAt: checkedAt,
    expiresAt: '2026-08-06T23:59:59.000Z',
    issuedByRole: 'system_release_manager',
    authorisedByRole: 'accountable_template_release_owner',
    authorityScope: 'otp_vnext_version_renewal_apply',
    approvalReference: 'phase52-accountable-template-release-owner-apply-receipt',
    sourceApplyDryRunVersion: applyDryRunReceipt.version,
    sourceApplyDryRunStatus: applyDryRunReceipt.status,
    sourceApplyDryRunId: applyDryRunReceipt.applyPlan?.applyDryRunId,
    sourceApplyDryRunFingerprint: applyDryRunReceipt.applyDryRunFingerprint,
    sourceGuardFingerprint: applyDryRunReceipt.applyPlan?.sourceGuardFingerprint,
    sourceReceiptFingerprint: applyDryRunReceipt.applyPlan?.sourceReceiptFingerprint,
    target: Object.freeze({
      environment: applyDryRunReceipt.applyPlan?.targetEnvironment,
      previousVersionKey: applyDryRunReceipt.applyPlan?.previousVersionKey,
      targetVersionKey: applyDryRunReceipt.applyPlan?.targetVersionKey,
      routeVariants: Object.freeze([...REQUIRED_ROUTES]),
    }),
    operatorConfirmation: Object.freeze({
      operator: applyDryRunReceipt.applyPlan?.operator,
      confirmationPhrase: `OTP_VERSION_RENEWAL_APPLY_CONFIRMED:${applyDryRunReceipt.applyPlan?.applyDryRunId}:${applyDryRunReceipt.applyPlan?.targetVersionKey}`,
      mfaVerified: true,
      approvalReference: 'phase52-release-operator-apply-receipt',
    }),
    rollbackPlanReference: applyDryRunReceipt.applyPlan?.rollbackPlanReference,
    routeApplyReceipts: Object.freeze(buildRouteApplyReceipts(applyDryRunReceipt)),
    versionPointerApplyReceipt: Object.freeze({
      operation: applyDryRunReceipt.versionPointerApplySimulation?.operation,
      previousVersionKey: applyDryRunReceipt.versionPointerApplySimulation?.previousVersionKey,
      targetVersionKey: applyDryRunReceipt.versionPointerApplySimulation?.targetVersionKey,
      pointerFingerprint: applyDryRunReceipt.versionPointerApplySimulation?.pointerFingerprint,
      receiptRequiredBeforeLiveWrite: true,
    }),
    writeTerms: Object.freeze({
      applyReceiptRequiredBeforeVersionRenewalWrite: true,
      productionWritesAllowedByThisReceipt: false,
      requiresSeparateApplyCommand: true,
      requiresMatchingApplyReceiptFingerprint: true,
      requiresMatchingPhase50GuardFingerprint: true,
      requiresOperatorConfirmation: true,
      requiresRollbackPlan: true,
      requiresRouteFingerprint: true,
      requiresVersionPointerFingerprint: true,
      noUncontrolledWriteAllowed: true,
      terms: Object.freeze([...REQUIRED_RECEIPT_TERMS]),
    }),
    stopConditions: Object.freeze([...REQUIRED_STOP_CONDITIONS]),
    archiveReceipt: Object.freeze({
      archiveReference: 'otp-vnext-phase52-version-renewal-apply-receipt-archive',
      applyReceiptArchived: true,
      sourceApplyDryRunReceiptArchived: true,
      routeApplyReceiptsArchived: true,
      versionPointerReceiptArchived: true,
      writeTermsArchived: true,
      immutable: true,
    }),
    noWriteProof: Object.freeze({
      receiptOnly: true,
      mutatedData: false,
      productionWriteAttempted: false,
      liveDefaultMutationCount: 0,
      signingEnvelopeMutationCount: 0,
      versionPointerMutationCount: 0,
      generatedArtifactMutationCount: 0,
      signingDispatchMutationCount: 0,
    }),
  }
}

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

function phase51Blockers(applyDryRunReceipt = {}) {
  return [
    applyDryRunReceipt.version === OTP_CONTROLLED_VERSION_RENEWAL_APPLY_DRY_RUN_PHASE51_VERSION ? '' : 'phase51_apply_dry_run_version_mismatch',
    applyDryRunReceipt.status === OTP_CONTROLLED_VERSION_RENEWAL_APPLY_DRY_RUN_READY_STATUS ? '' : 'phase51_apply_dry_run_not_ready',
    applyDryRunReceipt.canIssueApplyReceipt === true ? '' : 'phase51_apply_receipt_not_allowed',
    applyDryRunReceipt.mutatedData === false ? '' : 'phase51_apply_dry_run_mutation_unexpected',
    list(applyDryRunReceipt.blockerCodes).length === 0 ? '' : 'phase51_apply_dry_run_has_blockers',
  ].filter(Boolean)
}

function authorityBlockers(receipt = {}) {
  return [
    normalizeText(receipt.receiptId) ? '' : 'apply_receipt_id_missing',
    normalizeKey(receipt.receiptStatus) === 'authority_format_recorded' ? '' : 'apply_receipt_status_invalid',
    normalizeText(receipt.issuedByRole) ? '' : 'apply_receipt_issuing_role_missing',
    normalizeText(receipt.authorisedByRole) ? '' : 'apply_receipt_authorising_role_missing',
    normalizeText(receipt.authorityScope) ? '' : 'apply_receipt_authority_scope_missing',
    normalizeText(receipt.approvalReference) ? '' : 'apply_receipt_approval_reference_missing',
  ].filter(Boolean)
}

function sourceBindingBlockers(receipt = {}, applyDryRunReceipt = {}) {
  return [
    receipt.sourceApplyDryRunVersion === applyDryRunReceipt.version ? '' : 'source_apply_dry_run_version_mismatch',
    receipt.sourceApplyDryRunStatus === applyDryRunReceipt.status ? '' : 'source_apply_dry_run_status_mismatch',
    receipt.sourceApplyDryRunId === applyDryRunReceipt.applyPlan?.applyDryRunId ? '' : 'source_apply_dry_run_id_mismatch',
    receipt.sourceApplyDryRunFingerprint === applyDryRunReceipt.applyDryRunFingerprint ? '' : 'source_apply_dry_run_fingerprint_mismatch',
    receipt.sourceGuardFingerprint === applyDryRunReceipt.applyPlan?.sourceGuardFingerprint ? '' : 'source_guard_fingerprint_mismatch',
    receipt.sourceReceiptFingerprint === applyDryRunReceipt.applyPlan?.sourceReceiptFingerprint ? '' : 'source_receipt_fingerprint_mismatch',
    normalizeKey(receipt.target?.environment) === 'production' ? '' : 'apply_receipt_target_not_production',
    receipt.target?.previousVersionKey === applyDryRunReceipt.applyPlan?.previousVersionKey ? '' : 'apply_receipt_previous_version_mismatch',
    receipt.target?.targetVersionKey === applyDryRunReceipt.applyPlan?.targetVersionKey ? '' : 'apply_receipt_target_version_mismatch',
  ].filter(Boolean)
}

function routeApplyReceiptBlockers(routeApplyReceipts = [], applyDryRunReceipt = {}) {
  const routes = list(routeApplyReceipts).map((row) => normalizeKey(row.routeVariant))
  const missingRoutes = REQUIRED_ROUTES.filter((route) => !routes.includes(route))
  const duplicateRoutes = routes.filter((route, index) => route && routes.indexOf(route) !== index)
  const rowBlockers = list(routeApplyReceipts).flatMap((row) => {
    const route = normalizeKey(row.routeVariant) || 'unknown'
    const simulation = list(applyDryRunReceipt.routeApplySimulations).find((candidate) => normalizeKey(candidate.routeVariant) === route) || {}
    const operations = list(row.operationNames).map(normalizeKey)
    return [
      REQUIRED_ROUTES.includes(route) ? '' : `apply_route_receipt_unsupported:${route}`,
      row.targetLiveTemplateDefaultId === simulation.targetLiveTemplateDefaultId ? '' : `apply_route_receipt_template_mismatch:${route}`,
      row.targetSigningEnvelopeKey === simulation.targetSigningEnvelopeKey ? '' : `apply_route_receipt_envelope_mismatch:${route}`,
      row.routeOutputFingerprint === simulation.routeOutputFingerprint ? '' : `apply_route_receipt_fingerprint_mismatch:${route}`,
      row.receiptRequiredBeforeLiveWrite === true ? '' : `apply_route_receipt_not_required_before_live_write:${route}`,
      ...REQUIRED_ROUTE_OPERATIONS.filter((operation) => !operations.includes(operation)).map((operation) => `apply_route_receipt_missing_operation:${route}:${operation}`),
    ].filter(Boolean)
  })
  return [
    ...missingRoutes.map((route) => `apply_route_receipt_missing:${route}`),
    ...unique(duplicateRoutes).map((route) => `apply_route_receipt_duplicate:${route}`),
    ...rowBlockers,
  ]
}

function versionPointerApplyReceiptBlockers(versionPointerApplyReceipt = {}, applyDryRunReceipt = {}) {
  const simulation = applyDryRunReceipt.versionPointerApplySimulation || {}
  return [
    normalizeKey(versionPointerApplyReceipt.operation) === 'switch_version_pointer' ? '' : 'apply_version_pointer_receipt_operation_invalid',
    versionPointerApplyReceipt.previousVersionKey === simulation.previousVersionKey ? '' : 'apply_version_pointer_receipt_previous_version_mismatch',
    versionPointerApplyReceipt.targetVersionKey === simulation.targetVersionKey ? '' : 'apply_version_pointer_receipt_target_version_mismatch',
    versionPointerApplyReceipt.pointerFingerprint === simulation.pointerFingerprint ? '' : 'apply_version_pointer_receipt_fingerprint_mismatch',
    versionPointerApplyReceipt.receiptRequiredBeforeLiveWrite === true ? '' : 'apply_version_pointer_receipt_not_required_before_live_write',
  ].filter(Boolean)
}

function operatorBlockers(operatorConfirmation = {}, applyDryRunReceipt = {}) {
  const expectedPhrase = `OTP_VERSION_RENEWAL_APPLY_CONFIRMED:${applyDryRunReceipt.applyPlan?.applyDryRunId}:${applyDryRunReceipt.applyPlan?.targetVersionKey}`
  return [
    operatorConfirmation.operator === applyDryRunReceipt.applyPlan?.operator ? '' : 'apply_operator_mismatch',
    operatorConfirmation.confirmationPhrase === expectedPhrase ? '' : 'apply_operator_confirmation_phrase_mismatch',
    operatorConfirmation.mfaVerified === true ? '' : 'apply_operator_mfa_missing',
    normalizeText(operatorConfirmation.approvalReference) ? '' : 'apply_operator_approval_reference_missing',
  ].filter(Boolean)
}

function writeTermsBlockers(writeTerms = {}) {
  const terms = list(writeTerms.terms).map(normalizeKey)
  return [
    writeTerms.applyReceiptRequiredBeforeVersionRenewalWrite === true ? '' : 'write_terms_apply_receipt_not_required',
    writeTerms.productionWritesAllowedByThisReceipt === false ? '' : 'write_terms_allow_production_write',
    writeTerms.requiresSeparateApplyCommand === true ? '' : 'write_terms_separate_apply_not_required',
    writeTerms.requiresMatchingApplyReceiptFingerprint === true ? '' : 'write_terms_matching_apply_receipt_not_required',
    writeTerms.requiresMatchingPhase50GuardFingerprint === true ? '' : 'write_terms_phase50_guard_not_required',
    writeTerms.requiresOperatorConfirmation === true ? '' : 'write_terms_operator_confirmation_not_required',
    writeTerms.requiresRollbackPlan === true ? '' : 'write_terms_rollback_plan_not_required',
    writeTerms.requiresRouteFingerprint === true ? '' : 'write_terms_route_fingerprint_not_required',
    writeTerms.requiresVersionPointerFingerprint === true ? '' : 'write_terms_version_pointer_fingerprint_not_required',
    writeTerms.noUncontrolledWriteAllowed === true ? '' : 'write_terms_uncontrolled_write_allowed',
    ...REQUIRED_RECEIPT_TERMS.filter((term) => !terms.includes(term)).map((term) => `write_terms_missing:${term}`),
  ].filter(Boolean)
}

function noWriteProofBlockers(noWriteProof = {}) {
  return [
    noWriteProof.receiptOnly === true ? '' : 'apply_receipt_no_write_proof_not_receipt_only',
    noWriteProof.mutatedData === false ? '' : 'apply_receipt_no_write_proof_mutated_data',
    noWriteProof.productionWriteAttempted === true ? 'apply_receipt_no_write_proof_production_write_attempted' : '',
    numberValue(noWriteProof.liveDefaultMutationCount) === 0 ? '' : 'apply_receipt_live_default_mutation_observed',
    numberValue(noWriteProof.signingEnvelopeMutationCount) === 0 ? '' : 'apply_receipt_signing_envelope_mutation_observed',
    numberValue(noWriteProof.versionPointerMutationCount) === 0 ? '' : 'apply_receipt_version_pointer_mutation_observed',
    numberValue(noWriteProof.generatedArtifactMutationCount) === 0 ? '' : 'apply_receipt_generated_artifact_mutation_observed',
    numberValue(noWriteProof.signingDispatchMutationCount) === 0 ? '' : 'apply_receipt_signing_dispatch_mutation_observed',
  ].filter(Boolean)
}

function archiveBlockers(archive = {}) {
  return [
    normalizeText(archive.archiveReference) ? '' : 'apply_receipt_archive_reference_missing',
    archive.applyReceiptArchived === true ? '' : 'apply_receipt_not_archived',
    archive.sourceApplyDryRunReceiptArchived === true ? '' : 'source_apply_dry_run_receipt_not_archived',
    archive.routeApplyReceiptsArchived === true ? '' : 'route_apply_receipts_not_archived',
    archive.versionPointerReceiptArchived === true ? '' : 'version_pointer_receipt_not_archived',
    archive.writeTermsArchived === true ? '' : 'write_terms_not_archived',
    archive.immutable === true ? '' : 'apply_receipt_archive_not_immutable',
  ].filter(Boolean)
}

function stopConditionBlockers(stopConditions = []) {
  const conditions = list(stopConditions).map(normalizeKey)
  return REQUIRED_STOP_CONDITIONS
    .filter((condition) => !conditions.includes(condition))
    .map((condition) => `apply_receipt_stop_condition_missing:${condition}`)
}

function addCheck(checks, pass, code, detail) {
  checks.push({ code, pass: Boolean(pass), detail })
}

export function buildOtpVersionRenewalApplyReceipt({
  applyDryRunReceipt = buildOtpControlledVersionRenewalApplyDryRunPhase51Audit().applyDryRunReceipts?.find((receipt) => receipt.canIssueApplyReceipt),
  receiptEvidence = defaultReceiptEvidence(applyDryRunReceipt),
  checkedAt = new Date().toISOString(),
} = {}) {
  const receipt = { ...receiptEvidence }
  const expectedApplyReceiptFingerprint = stableFingerprint(receiptPayload(receipt), 'otp-phase52-apply-receipt')
  const applyReceiptFingerprint = normalizeText(receipt.applyReceiptFingerprint) || expectedApplyReceiptFingerprint
  const blockerCodes = unique([
    ...phase51Blockers(applyDryRunReceipt || {}),
    ...authorityBlockers(receipt),
    receiptTimeValid(receipt, checkedAt) ? '' : 'apply_receipt_expired_or_not_yet_valid',
    ...sourceBindingBlockers(receipt, applyDryRunReceipt),
    ...routeApplyReceiptBlockers(receipt.routeApplyReceipts, applyDryRunReceipt),
    ...versionPointerApplyReceiptBlockers(receipt.versionPointerApplyReceipt, applyDryRunReceipt),
    ...operatorBlockers(receipt.operatorConfirmation, applyDryRunReceipt),
    receipt.rollbackPlanReference === applyDryRunReceipt?.applyPlan?.rollbackPlanReference ? '' : 'apply_receipt_rollback_plan_mismatch',
    ...writeTermsBlockers(receipt.writeTerms),
    ...noWriteProofBlockers(receipt.noWriteProof),
    ...archiveBlockers(receipt.archiveReceipt),
    ...stopConditionBlockers(receipt.stopConditions),
    applyReceiptFingerprint === expectedApplyReceiptFingerprint ? '' : 'apply_receipt_fingerprint_mismatch',
  ])
  const canPermitFinalLiveWriteAuthority = blockerCodes.length === 0

  return Object.freeze({
    version: OTP_VERSION_RENEWAL_APPLY_RECEIPT_PHASE52_VERSION,
    contract: OTP_VERSION_RENEWAL_APPLY_RECEIPT_CONTRACT,
    checkedAt,
    status: canPermitFinalLiveWriteAuthority
      ? OTP_VERSION_RENEWAL_APPLY_RECEIPT_READY_STATUS
      : 'OTP_VERSION_RENEWAL_APPLY_RECEIPT_BLOCKED',
    canPermitFinalLiveWriteAuthority,
    mutatedData: false,
    blockerCodes: Object.freeze(blockerCodes),
    expectedApplyReceiptFingerprint,
    applyReceiptFingerprint,
    receiptEvidence: Object.freeze({
      ...receipt,
      applyReceiptFingerprint,
    }),
    applyDryRunReceipt: Object.freeze({
      version: applyDryRunReceipt?.version,
      status: applyDryRunReceipt?.status,
      canIssueApplyReceipt: applyDryRunReceipt?.canIssueApplyReceipt === true,
      applyDryRunId: applyDryRunReceipt?.applyPlan?.applyDryRunId,
      applyDryRunFingerprint: applyDryRunReceipt?.applyDryRunFingerprint,
      blockerCount: list(applyDryRunReceipt?.blockerCodes).length,
    }),
    summary: Object.freeze({
      routeApplyReceiptCount: list(receipt.routeApplyReceipts).length,
      validRouteApplyReceiptCount: REQUIRED_ROUTES.filter((route) => !routeApplyReceiptBlockers(receipt.routeApplyReceipts, applyDryRunReceipt).some((code) => code.includes(route))).length,
      authorityPresent: authorityBlockers(receipt).length === 0,
      timeWindowValid: receiptTimeValid(receipt, checkedAt),
      sourceDryRunBound: sourceBindingBlockers(receipt, applyDryRunReceipt).length === 0,
      versionPointerBound: versionPointerApplyReceiptBlockers(receipt.versionPointerApplyReceipt, applyDryRunReceipt).length === 0,
      rollbackBound: receipt.rollbackPlanReference === applyDryRunReceipt?.applyPlan?.rollbackPlanReference,
      writeTermsSafe: writeTermsBlockers(receipt.writeTerms).length === 0,
      noWriteObserved: noWriteProofBlockers(receipt.noWriteProof).length === 0,
      fingerprintMatches: applyReceiptFingerprint === expectedApplyReceiptFingerprint,
      blockerCount: blockerCodes.length,
    }),
  })
}

export function buildOtpVersionRenewalApplyReceiptPhase52Audit({
  checkedAt = new Date().toISOString(),
  phase51Audit = null,
  packageJson = {},
} = {}) {
  const checks = []
  const phase51Ready = !phase51Audit || phase51Audit.status === OTP_CONTROLLED_VERSION_RENEWAL_APPLY_DRY_RUN_READY_STATUS
  const goodApplyDryRun = phase51Audit?.applyDryRunReceipts?.find((receipt) => receipt.canIssueApplyReceipt) ||
    buildOtpControlledVersionRenewalApplyDryRunPhase51Audit({ checkedAt }).applyDryRunReceipts.find((receipt) => receipt.canIssueApplyReceipt)
  const goodReceiptEvidence = defaultReceiptEvidence(goodApplyDryRun, checkedAt)
  const goodReceipt = buildOtpVersionRenewalApplyReceipt({
    checkedAt,
    applyDryRunReceipt: goodApplyDryRun,
    receiptEvidence: goodReceiptEvidence,
  })
  const blockedApplyDryRunReceipt = buildOtpVersionRenewalApplyReceipt({
    checkedAt,
    applyDryRunReceipt: {
      ...goodApplyDryRun,
      status: 'OTP_CONTROLLED_VERSION_RENEWAL_APPLY_DRY_RUN_BLOCKED',
      canIssueApplyReceipt: false,
      blockerCodes: ['apply_production_write_requested'],
    },
    receiptEvidence: goodReceiptEvidence,
  })
  const missingAuthorityReceipt = buildOtpVersionRenewalApplyReceipt({
    checkedAt,
    applyDryRunReceipt: goodApplyDryRun,
    receiptEvidence: { ...goodReceiptEvidence, authorisedByRole: '', approvalReference: '' },
  })
  const expiredReceipt = buildOtpVersionRenewalApplyReceipt({
    checkedAt,
    applyDryRunReceipt: goodApplyDryRun,
    receiptEvidence: { ...goodReceiptEvidence, issuedAt: '2026-08-01T00:00:00.000Z', expiresAt: '2026-08-02T00:00:00.000Z' },
  })
  const sourceFingerprintMismatchReceipt = buildOtpVersionRenewalApplyReceipt({
    checkedAt,
    applyDryRunReceipt: goodApplyDryRun,
    receiptEvidence: { ...goodReceiptEvidence, sourceApplyDryRunFingerprint: 'wrong-apply-dry-run-fingerprint' },
  })
  const routeMismatchReceipt = buildOtpVersionRenewalApplyReceipt({
    checkedAt,
    applyDryRunReceipt: goodApplyDryRun,
    receiptEvidence: {
      ...goodReceiptEvidence,
      routeApplyReceipts: goodReceiptEvidence.routeApplyReceipts.map((row) =>
        row.routeVariant === 'resale_existing_property'
          ? { ...row, targetLiveTemplateDefaultId: 'wrong-template', routeOutputFingerprint: 'wrong-route-fingerprint' }
          : row,
      ),
    },
  })
  const versionPointerMismatchReceipt = buildOtpVersionRenewalApplyReceipt({
    checkedAt,
    applyDryRunReceipt: goodApplyDryRun,
    receiptEvidence: {
      ...goodReceiptEvidence,
      versionPointerApplyReceipt: { ...goodReceiptEvidence.versionPointerApplyReceipt, targetVersionKey: 'wrong-target-version' },
    },
  })
  const unsafeWriteTermsReceipt = buildOtpVersionRenewalApplyReceipt({
    checkedAt,
    applyDryRunReceipt: goodApplyDryRun,
    receiptEvidence: {
      ...goodReceiptEvidence,
      writeTerms: { ...goodReceiptEvidence.writeTerms, productionWritesAllowedByThisReceipt: true, requiresSeparateApplyCommand: false },
    },
  })
  const operatorMismatchReceipt = buildOtpVersionRenewalApplyReceipt({
    checkedAt,
    applyDryRunReceipt: goodApplyDryRun,
    receiptEvidence: {
      ...goodReceiptEvidence,
      operatorConfirmation: { ...goodReceiptEvidence.operatorConfirmation, operator: 'wrong-operator', confirmationPhrase: 'wrong-confirmation' },
    },
  })
  const rollbackMissingReceipt = buildOtpVersionRenewalApplyReceipt({
    checkedAt,
    applyDryRunReceipt: goodApplyDryRun,
    receiptEvidence: { ...goodReceiptEvidence, rollbackPlanReference: '' },
  })
  const liveWriteReceipt = buildOtpVersionRenewalApplyReceipt({
    checkedAt,
    applyDryRunReceipt: goodApplyDryRun,
    receiptEvidence: {
      ...goodReceiptEvidence,
      noWriteProof: {
        ...goodReceiptEvidence.noWriteProof,
        receiptOnly: false,
        mutatedData: true,
        productionWriteAttempted: true,
        liveDefaultMutationCount: 1,
        versionPointerMutationCount: 1,
      },
    },
  })
  const fingerprintMismatchReceipt = buildOtpVersionRenewalApplyReceipt({
    checkedAt,
    applyDryRunReceipt: goodApplyDryRun,
    receiptEvidence: { ...goodReceiptEvidence, applyReceiptFingerprint: 'otp-phase52-apply-receipt:00000000:1' },
  })

  addCheck(checks, phase51Ready, 'PHASE52_PHASE51_APPLY_DRY_RUN_READY', 'Phase 51 controlled apply dry-run is ready before an apply receipt can be recorded.')
  addCheck(checks, goodReceipt.canPermitFinalLiveWriteAuthority && goodReceipt.mutatedData === false, 'PHASE52_GOOD_APPLY_RECEIPT_READY', 'A clean Phase 51 apply dry-run can record final apply receipt authority without mutating production.')
  addCheck(checks, goodReceipt.summary.authorityPresent, 'PHASE52_RECEIPT_AUTHORITY_PRESENT', 'Apply receipt includes id, status, issuing role, authorising role, authority scope, and approval reference.')
  addCheck(checks, goodReceipt.summary.timeWindowValid, 'PHASE52_RECEIPT_TIME_WINDOW_VALID', 'Apply receipt issue and expiry window is valid.')
  addCheck(checks, goodReceipt.summary.sourceDryRunBound, 'PHASE52_SOURCE_APPLY_DRY_RUN_BOUND', 'Apply receipt is bound to the exact Phase 51 dry-run, Phase 50 guard, and source receipt fingerprints.')
  addCheck(checks, goodReceipt.summary.validRouteApplyReceiptCount === REQUIRED_ROUTES.length, 'PHASE52_BOTH_ROUTE_APPLY_RECEIPTS_BOUND', 'Apply receipt records exact resale and new-development apply rows.')
  addCheck(checks, goodReceipt.summary.versionPointerBound, 'PHASE52_VERSION_POINTER_APPLY_RECEIPT_BOUND', 'Apply receipt binds the version pointer operation and fingerprint.')
  addCheck(checks, goodReceipt.summary.writeTermsSafe, 'PHASE52_WRITE_TERMS_REQUIRE_SEPARATE_APPLY_AND_FINGERPRINTS', 'Write terms require separate apply command, matching fingerprints, operator, rollback, route, and version pointer proof.')
  addCheck(checks, goodReceipt.summary.noWriteObserved, 'PHASE52_RECEIPT_ONLY_NO_WRITE', 'Apply receipt itself cannot write production or mutate live defaults, envelopes, pointers, artifacts, or dispatch.')
  addCheck(checks, goodReceipt.summary.fingerprintMatches, 'PHASE52_APPLY_RECEIPT_FINGERPRINT_MATCHES', 'Apply receipt fingerprint matches authority, source dry-run, route rows, version pointer, rollback, and write terms.')
  addCheck(checks, blockedApplyDryRunReceipt.canPermitFinalLiveWriteAuthority === false && blockedApplyDryRunReceipt.blockerCodes.includes('phase51_apply_dry_run_not_ready'), 'PHASE52_BLOCKED_PHASE51_DRY_RUN_REJECTED', 'A blocked Phase 51 dry-run cannot issue a usable apply receipt.')
  addCheck(checks, missingAuthorityReceipt.canPermitFinalLiveWriteAuthority === false && missingAuthorityReceipt.blockerCodes.includes('apply_receipt_authorising_role_missing'), 'PHASE52_MISSING_AUTHORITY_BLOCKED', 'Missing authority or approval reference blocks the apply receipt.')
  addCheck(checks, expiredReceipt.canPermitFinalLiveWriteAuthority === false && expiredReceipt.blockerCodes.includes('apply_receipt_expired_or_not_yet_valid'), 'PHASE52_EXPIRED_RECEIPT_BLOCKED', 'Expired apply receipts cannot permit final live write authority.')
  addCheck(checks, sourceFingerprintMismatchReceipt.canPermitFinalLiveWriteAuthority === false && sourceFingerprintMismatchReceipt.blockerCodes.includes('source_apply_dry_run_fingerprint_mismatch'), 'PHASE52_SOURCE_FINGERPRINT_MISMATCH_BLOCKED', 'Source apply dry-run fingerprint mismatches are blocked.')
  addCheck(checks, routeMismatchReceipt.canPermitFinalLiveWriteAuthority === false && routeMismatchReceipt.blockerCodes.includes('apply_route_receipt_template_mismatch:resale_existing_property'), 'PHASE52_ROUTE_APPLY_RECEIPT_MISMATCH_BLOCKED', 'Route apply template and output fingerprint mismatches are blocked.')
  addCheck(checks, versionPointerMismatchReceipt.canPermitFinalLiveWriteAuthority === false && versionPointerMismatchReceipt.blockerCodes.includes('apply_version_pointer_receipt_target_version_mismatch'), 'PHASE52_VERSION_POINTER_RECEIPT_MISMATCH_BLOCKED', 'Version pointer apply receipt mismatches are blocked.')
  addCheck(checks, unsafeWriteTermsReceipt.canPermitFinalLiveWriteAuthority === false && unsafeWriteTermsReceipt.blockerCodes.includes('write_terms_allow_production_write'), 'PHASE52_UNSAFE_WRITE_TERMS_BLOCKED', 'Apply receipt terms cannot permit production write by themselves.')
  addCheck(checks, operatorMismatchReceipt.canPermitFinalLiveWriteAuthority === false && operatorMismatchReceipt.blockerCodes.includes('apply_operator_mismatch'), 'PHASE52_OPERATOR_MISMATCH_BLOCKED', 'Operator mismatches are blocked.')
  addCheck(checks, rollbackMissingReceipt.canPermitFinalLiveWriteAuthority === false && rollbackMissingReceipt.blockerCodes.includes('apply_receipt_rollback_plan_mismatch'), 'PHASE52_ROLLBACK_PLAN_BLOCKED', 'Missing rollback plan reference blocks the apply receipt.')
  addCheck(checks, liveWriteReceipt.canPermitFinalLiveWriteAuthority === false && liveWriteReceipt.blockerCodes.includes('apply_receipt_no_write_proof_production_write_attempted'), 'PHASE52_LIVE_WRITE_BY_RECEIPT_BLOCKED', 'Any production write or mutation by the receipt is blocked.')
  addCheck(checks, fingerprintMismatchReceipt.canPermitFinalLiveWriteAuthority === false && fingerprintMismatchReceipt.blockerCodes.includes('apply_receipt_fingerprint_mismatch'), 'PHASE52_APPLY_RECEIPT_FINGERPRINT_MISMATCH_BLOCKED', 'Apply receipt fingerprint mismatches are blocked.')
  addCheck(
    checks,
    packageJson.scripts?.['test:otp-version-renewal-apply-receipt-phase52'] === 'node scripts/otp-version-renewal-apply-receipt-phase52.test.mjs' &&
      packageJson.scripts?.['report:otp-version-renewal-apply-receipt-phase52'] === 'node scripts/report-otp-version-renewal-apply-receipt-phase52.mjs' &&
      packageJson.scripts?.['verify:otp-template-vnext']?.includes('test:otp-version-renewal-apply-receipt-phase52'),
    'PHASE52_PACKAGE_SCRIPTS_WIRED',
    'Package scripts expose the Phase 52 test, report, and vNext verification chain entry.',
  )

  const blockers = checks.filter((check) => !check.pass)
  return Object.freeze({
    version: OTP_VERSION_RENEWAL_APPLY_RECEIPT_PHASE52_VERSION,
    contract: OTP_VERSION_RENEWAL_APPLY_RECEIPT_CONTRACT,
    checkedAt,
    status: blockers.length ? 'OTP_VERSION_RENEWAL_APPLY_RECEIPT_REMEDIATION_REQUIRED' : OTP_VERSION_RENEWAL_APPLY_RECEIPT_READY_STATUS,
    canPermitFinalLiveWriteAuthority: blockers.length === 0,
    mutatedData: false,
    checks: Object.freeze(checks),
    blockers: Object.freeze(blockers),
    applyReceipts: Object.freeze([
      goodReceipt,
      blockedApplyDryRunReceipt,
      missingAuthorityReceipt,
      expiredReceipt,
      sourceFingerprintMismatchReceipt,
      routeMismatchReceipt,
      versionPointerMismatchReceipt,
      unsafeWriteTermsReceipt,
      operatorMismatchReceipt,
      rollbackMissingReceipt,
      liveWriteReceipt,
      fingerprintMismatchReceipt,
    ]),
    summary: Object.freeze({
      blockerCount: blockers.length,
      readyApplyReceiptCount: [goodReceipt].filter((row) => row.canPermitFinalLiveWriteAuthority).length,
      blockedApplyReceiptCount: [
        blockedApplyDryRunReceipt,
        missingAuthorityReceipt,
        expiredReceipt,
        sourceFingerprintMismatchReceipt,
        routeMismatchReceipt,
        versionPointerMismatchReceipt,
        unsafeWriteTermsReceipt,
        operatorMismatchReceipt,
        rollbackMissingReceipt,
        liveWriteReceipt,
        fingerprintMismatchReceipt,
      ].filter((row) => !row.canPermitFinalLiveWriteAuthority).length,
      routeCount: REQUIRED_ROUTES.length,
      requiredWriteTermCount: REQUIRED_RECEIPT_TERMS.length,
      requiredStopConditionCount: REQUIRED_STOP_CONDITIONS.length,
    }),
    nextPhase: blockers.length ? null : Object.freeze({
      phase: 53,
      key: 'otp_post_renewal_monitoring_closeout',
      label: 'Post-Renewal Monitoring And Closeout',
    }),
  })
}

export function formatOtpVersionRenewalApplyReceiptPhase52Markdown(report = buildOtpVersionRenewalApplyReceiptPhase52Audit()) {
  const readyReceipt = report.applyReceipts.find((receipt) => receipt.canPermitFinalLiveWriteAuthority) || report.applyReceipts[0]
  const receipt = readyReceipt?.receiptEvidence || {}
  return [
    '# OTP Generator Phase 52 Version Renewal Apply Receipt',
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
        ['Ready apply receipts', report.summary.readyApplyReceiptCount],
        ['Blocked apply receipts', report.summary.blockedApplyReceiptCount],
        ['Routes', report.summary.routeCount],
        ['Write terms', report.summary.requiredWriteTermCount],
        ['Stop conditions', report.summary.requiredStopConditionCount],
        ['Blockers', report.summary.blockerCount],
        ['Permit final live write authority', report.canPermitFinalLiveWriteAuthority ? 'yes' : 'no'],
        ['Next phase', report.nextPhase ? `Phase ${report.nextPhase.phase}: ${report.nextPhase.label}` : 'Blocked'],
      ],
    ),
    '',
    '## Receipt',
    '',
    table(
      ['Field', 'Value'],
      [
        ['Receipt id', receipt.receiptId],
        ['Receipt status', receipt.receiptStatus],
        ['Issued at', receipt.issuedAt],
        ['Expires at', receipt.expiresAt],
        ['Issued by role', receipt.issuedByRole],
        ['Authorised by role', receipt.authorisedByRole],
        ['Approval reference', receipt.approvalReference],
        ['Source apply dry-run id', receipt.sourceApplyDryRunId],
        ['Source apply dry-run fingerprint', receipt.sourceApplyDryRunFingerprint],
        ['Source guard fingerprint', receipt.sourceGuardFingerprint],
        ['Source receipt fingerprint', receipt.sourceReceiptFingerprint],
        ['Previous version', receipt.target?.previousVersionKey],
        ['Target version', receipt.target?.targetVersionKey],
        ['Rollback plan reference', receipt.rollbackPlanReference],
        ['Apply receipt fingerprint', readyReceipt?.applyReceiptFingerprint],
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
    '## Route Apply Receipts',
    '',
    table(
      ['Route', 'Target Template', 'Target Envelope', 'Fingerprint', 'Operations', 'Receipt Required'],
      list(receipt.routeApplyReceipts).map((route) => [
        route.routeVariant,
        route.targetLiveTemplateDefaultId,
        route.targetSigningEnvelopeKey,
        route.routeOutputFingerprint,
        list(route.operationNames).join(', '),
        route.receiptRequiredBeforeLiveWrite ? 'yes' : 'no',
      ]),
    ),
    '',
    '## Version Pointer Apply Receipt',
    '',
    table(
      ['Operation', 'Previous Version', 'Target Version', 'Fingerprint', 'Receipt Required'],
      [[
        receipt.versionPointerApplyReceipt?.operation,
        receipt.versionPointerApplyReceipt?.previousVersionKey,
        receipt.versionPointerApplyReceipt?.targetVersionKey,
        receipt.versionPointerApplyReceipt?.pointerFingerprint,
        receipt.versionPointerApplyReceipt?.receiptRequiredBeforeLiveWrite ? 'yes' : 'no',
      ]],
    ),
    '',
    '## Blocked Apply Receipt Proofs',
    '',
    table(
      ['Status', 'Allowed', 'Blockers'],
      report.applyReceipts.map((candidate) => [
        candidate.status,
        candidate.canPermitFinalLiveWriteAuthority ? 'yes' : 'no',
        candidate.blockerCodes.join(', ') || 'none',
      ]),
    ),
    '',
    '## Boundary',
    '',
    'Phase 52 records what would be required before a real version renewal write is permitted. It binds the exact Phase 51 apply dry-run fingerprint, Phase 50 guard fingerprint, source receipt fingerprint, resale and new-development apply rows, version pointer row, operator authority, rollback plan, stop conditions, and write terms. It remains receipt-only: it does not execute production writes, mutate live defaults, change signing envelopes, move version pointers, create generated artifacts, dispatch signing, or publish templates.',
    '',
  ].join('\n')
}
