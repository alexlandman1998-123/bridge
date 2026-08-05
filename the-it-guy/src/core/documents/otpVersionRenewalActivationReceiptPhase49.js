import {
  OTP_CONTROLLED_VERSION_RENEWAL_ACTIVATION_DRY_RUN_PHASE48_VERSION,
  OTP_CONTROLLED_VERSION_RENEWAL_ACTIVATION_DRY_RUN_READY_STATUS,
  buildOtpControlledVersionRenewalActivationDryRunReceipt,
} from './otpControlledVersionRenewalActivationDryRunPhase48.js'

export const OTP_VERSION_RENEWAL_ACTIVATION_RECEIPT_PHASE49_VERSION = 'otp_version_renewal_activation_receipt_phase49_v1'
export const OTP_VERSION_RENEWAL_ACTIVATION_RECEIPT_READY_STATUS = 'OTP_VERSION_RENEWAL_ACTIVATION_RECEIPT_READY_FOR_LIVE_WRITE_GUARD'
export const OTP_VERSION_RENEWAL_ACTIVATION_RECEIPT_CONTRACT = 'otp-vnext-version-renewal-activation-receipt-phase49-v1'

const REQUIRED_ROUTES = Object.freeze(['resale_existing_property', 'new_development'])
const REQUIRED_ROUTE_OPERATIONS = Object.freeze(['switch_route_default', 'switch_signing_envelope', 'validate_generated_otp'])
const REQUIRED_RECEIPT_TERMS = Object.freeze([
  'receipt_required_before_version_renewal_write',
  'separate_apply_command_required',
  'matching_receipt_fingerprint_required',
  'operator_confirmation_required',
  'rollback_plan_required',
  'no_uncontrolled_write_allowed',
])
const REQUIRED_STOP_CONDITIONS = Object.freeze([
  'activation_dry_run_not_ready',
  'receipt_expired',
  'receipt_authority_missing',
  'simulation_fingerprint_mismatch',
  'route_receipt_mismatch',
  'version_pointer_receipt_mismatch',
  'operator_confirmation_mismatch',
  'rollback_plan_missing',
  'write_terms_unsafe',
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

function stableFingerprint(value, prefix = 'otp-vnext-version-renewal-receipt') {
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

function dryRunSimulationFingerprint(dryRunReceipt = {}) {
  return stableFingerprint({
    contract: 'phase48-controlled-version-renewal-activation-dry-run-source',
    sourceGuardOperationId: dryRunReceipt.activationSimulationPlan?.sourceGuardOperationId,
    simulationId: dryRunReceipt.activationSimulationPlan?.simulationId,
    operationType: dryRunReceipt.activationSimulationPlan?.operationType,
    versionKey: dryRunReceipt.activationSimulationPlan?.versionKey,
    previousVersionKey: dryRunReceipt.activationSimulationPlan?.previousVersionKey,
    targetEnvironment: dryRunReceipt.activationSimulationPlan?.targetEnvironment,
    routeSimulations: list(dryRunReceipt.routeSimulations).map((route) => ({
      routeVariant: route.routeVariant,
      simulatedTemplateDefaultId: route.simulatedTemplateDefaultId,
      simulatedSigningEnvelopeKey: route.simulatedSigningEnvelopeKey,
      simulatedOutputFingerprint: route.simulatedOutputFingerprint,
    })),
    versionPointerSimulation: dryRunReceipt.versionPointerSimulation,
    postActivationValidation: dryRunReceipt.postActivationValidation,
    rollbackRehearsal: dryRunReceipt.rollbackRehearsal,
    archiveReference: dryRunReceipt.archiveReceipt?.archiveReference,
  }, 'otp-phase48-source')
}

function buildRouteReceipts(dryRunReceipt = {}) {
  return REQUIRED_ROUTES.map((routeVariant) => {
    const route = list(dryRunReceipt.routeSimulations).find((row) => normalizeKey(row.routeVariant) === routeVariant) || {}
    return Object.freeze({
      routeVariant,
      routeLabel: routeLabel(routeVariant),
      currentLiveTemplateDefaultId: route.currentLiveTemplateDefaultId,
      targetLiveTemplateDefaultId: route.simulatedTemplateDefaultId,
      currentSigningEnvelopeKey: route.currentSigningEnvelopeKey,
      targetSigningEnvelopeKey: route.simulatedSigningEnvelopeKey,
      routeOutputFingerprint: route.simulatedOutputFingerprint,
      expectedOutputFingerprint: route.expectedOutputFingerprint,
      receiptRequiredBeforeWrite: true,
      operationNames: Object.freeze([...REQUIRED_ROUTE_OPERATIONS]),
    })
  })
}

function receiptPayload(receipt = {}) {
  return {
    contract: OTP_VERSION_RENEWAL_ACTIVATION_RECEIPT_CONTRACT,
    receiptId: receipt.receiptId,
    receiptStatus: receipt.receiptStatus,
    issuedAt: receipt.issuedAt,
    expiresAt: receipt.expiresAt,
    issuedByRole: receipt.issuedByRole,
    authorisedByRole: receipt.authorisedByRole,
    authorityScope: receipt.authorityScope,
    approvalReference: receipt.approvalReference,
    sourceDryRunVersion: receipt.sourceDryRunVersion,
    sourceDryRunStatus: receipt.sourceDryRunStatus,
    sourceGuardOperationId: receipt.sourceGuardOperationId,
    sourceSimulationId: receipt.sourceSimulationId,
    sourceSimulationFingerprint: receipt.sourceSimulationFingerprint,
    target: receipt.target,
    operatorConfirmation: receipt.operatorConfirmation,
    versionPointerReceipt: receipt.versionPointerReceipt,
    rollbackPlanReference: receipt.rollbackPlanReference,
    writeTerms: receipt.writeTerms,
    routeReceipts: list(receipt.routeReceipts).map((route) => ({
      routeVariant: route.routeVariant,
      currentLiveTemplateDefaultId: route.currentLiveTemplateDefaultId,
      targetLiveTemplateDefaultId: route.targetLiveTemplateDefaultId,
      currentSigningEnvelopeKey: route.currentSigningEnvelopeKey,
      targetSigningEnvelopeKey: route.targetSigningEnvelopeKey,
      routeOutputFingerprint: route.routeOutputFingerprint,
      expectedOutputFingerprint: route.expectedOutputFingerprint,
      receiptRequiredBeforeWrite: route.receiptRequiredBeforeWrite,
      operationNames: route.operationNames,
    })),
  }
}

function defaultReceiptEvidence(dryRunReceipt = buildOtpControlledVersionRenewalActivationDryRunReceipt(), checkedAt = new Date().toISOString()) {
  return {
    receiptId: 'otp-vnext-version-renewal-activation-receipt-2026-08-05',
    receiptStatus: 'authority_format_recorded',
    issuedAt: checkedAt,
    expiresAt: '2026-08-06T23:59:59.000Z',
    issuedByRole: 'system_release_manager',
    authorisedByRole: 'accountable_template_release_owner',
    authorityScope: 'otp_vnext_version_renewal_activation',
    approvalReference: dryRunReceipt.activationGuardReceipt?.operatorConfirmation?.approvalReference || 'phase47-release-operator-activation-guard',
    sourceDryRunVersion: dryRunReceipt.version,
    sourceDryRunStatus: dryRunReceipt.status,
    sourceGuardOperationId: dryRunReceipt.activationSimulationPlan?.sourceGuardOperationId,
    sourceSimulationId: dryRunReceipt.activationSimulationPlan?.simulationId,
    sourceSimulationFingerprint: dryRunSimulationFingerprint(dryRunReceipt),
    target: Object.freeze({
      environment: dryRunReceipt.activationSimulationPlan?.targetEnvironment || 'production',
      versionKey: dryRunReceipt.activationSimulationPlan?.versionKey,
      previousVersionKey: dryRunReceipt.activationSimulationPlan?.previousVersionKey,
      routeVariants: Object.freeze([...REQUIRED_ROUTES]),
    }),
    operatorConfirmation: Object.freeze({
      operator: dryRunReceipt.activationSimulationPlan?.operator,
      confirmedBy: dryRunReceipt.activationGuardReceipt?.operatorConfirmation?.operator,
      approvalReference: dryRunReceipt.activationGuardReceipt?.operatorConfirmation?.approvalReference,
      mfaVerified: dryRunReceipt.activationGuardReceipt?.operatorConfirmation?.mfaVerified === true,
    }),
    versionPointerReceipt: Object.freeze({
      previousVersionKey: dryRunReceipt.versionPointerSimulation?.previousVersionKey,
      targetVersionKey: dryRunReceipt.versionPointerSimulation?.targetVersionKey,
      pointerFingerprint: dryRunReceipt.versionPointerSimulation?.pointerFingerprint,
      receiptRequiredBeforeWrite: true,
    }),
    rollbackPlanReference: dryRunReceipt.rollbackRehearsal?.rollbackPlanReference,
    writeTerms: Object.freeze({
      requiredBeforeVersionRenewalWrite: true,
      productionWritesAllowedByThisReceipt: false,
      requiresSeparateApplyCommand: true,
      requiresMatchingReceiptFingerprint: true,
      requiresOperatorConfirmation: true,
      requiresRollbackPlan: true,
      noUncontrolledWriteAllowed: true,
      terms: Object.freeze([...REQUIRED_RECEIPT_TERMS]),
    }),
    routeReceipts: Object.freeze(buildRouteReceipts(dryRunReceipt)),
    stopConditions: Object.freeze([...REQUIRED_STOP_CONDITIONS]),
    archiveReceipt: Object.freeze({
      archiveReference: 'otp-vnext-phase49-version-renewal-activation-receipt-archive',
      activationReceiptArchived: true,
      sourceDryRunReceiptArchived: true,
      routeReceiptsArchived: true,
      writeTermsArchived: true,
      immutable: true,
    }),
    noWriteProof: Object.freeze({
      receiptOnly: true,
      mutatedData: false,
      productionWriteAttempted: false,
      liveDefaultMutationCount: 0,
      versionPointerMutationCount: 0,
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

function phase48Blockers(dryRunReceipt = {}) {
  return [
    dryRunReceipt.version === OTP_CONTROLLED_VERSION_RENEWAL_ACTIVATION_DRY_RUN_PHASE48_VERSION ? '' : 'phase48_activation_dry_run_version_mismatch',
    dryRunReceipt.status === OTP_CONTROLLED_VERSION_RENEWAL_ACTIVATION_DRY_RUN_READY_STATUS ? '' : 'phase48_activation_dry_run_not_ready',
    dryRunReceipt.canIssueActivationReceipt === true ? '' : 'phase48_activation_receipt_not_allowed',
    list(dryRunReceipt.blockerCodes).length === 0 ? '' : 'phase48_activation_dry_run_has_blockers',
    dryRunReceipt.mutatedData === false ? '' : 'phase48_activation_dry_run_mutation_unexpected',
  ].filter(Boolean)
}

function authorityBlockers(receipt = {}) {
  return [
    normalizeText(receipt.receiptId) ? '' : 'receipt_id_missing',
    normalizeKey(receipt.receiptStatus) === 'authority_format_recorded' ? '' : 'receipt_status_invalid',
    normalizeText(receipt.issuedByRole) ? '' : 'receipt_issuing_role_missing',
    normalizeText(receipt.authorisedByRole) ? '' : 'receipt_authorising_role_missing',
    normalizeText(receipt.authorityScope) ? '' : 'receipt_authority_scope_missing',
    normalizeText(receipt.approvalReference) ? '' : 'receipt_approval_reference_missing',
  ].filter(Boolean)
}

function sourceBindingBlockers(receipt = {}, dryRunReceipt = {}) {
  return [
    receipt.sourceDryRunVersion === dryRunReceipt.version ? '' : 'source_dry_run_version_mismatch',
    receipt.sourceDryRunStatus === dryRunReceipt.status ? '' : 'source_dry_run_status_mismatch',
    receipt.sourceGuardOperationId === dryRunReceipt.activationSimulationPlan?.sourceGuardOperationId ? '' : 'source_guard_operation_mismatch',
    receipt.sourceSimulationId === dryRunReceipt.activationSimulationPlan?.simulationId ? '' : 'source_simulation_id_mismatch',
    receipt.sourceSimulationFingerprint === dryRunSimulationFingerprint(dryRunReceipt) ? '' : 'source_simulation_fingerprint_mismatch',
    normalizeKey(receipt.target?.environment) === 'production' ? '' : 'receipt_target_not_production',
    receipt.target?.versionKey === dryRunReceipt.activationSimulationPlan?.versionKey ? '' : 'receipt_target_version_mismatch',
    receipt.target?.previousVersionKey === dryRunReceipt.activationSimulationPlan?.previousVersionKey ? '' : 'receipt_previous_version_mismatch',
  ].filter(Boolean)
}

function routeReceiptBlockers(routeReceipts = [], dryRunReceipt = {}) {
  const routes = list(routeReceipts).map((row) => normalizeKey(row.routeVariant))
  const missingRoutes = REQUIRED_ROUTES.filter((route) => !routes.includes(route))
  const duplicateRoutes = routes.filter((route, index) => route && routes.indexOf(route) !== index)
  const rowBlockers = list(routeReceipts).flatMap((row) => {
    const route = normalizeKey(row.routeVariant) || 'unknown'
    const dryRunRoute = list(dryRunReceipt.routeSimulations).find((candidate) => normalizeKey(candidate.routeVariant) === route) || {}
    const operationNames = list(row.operationNames).map(normalizeKey)
    const missingOperations = REQUIRED_ROUTE_OPERATIONS.filter((operation) => !operationNames.includes(operation))
    const extraOperations = operationNames.filter((operation) => !REQUIRED_ROUTE_OPERATIONS.includes(operation))
    return [
      REQUIRED_ROUTES.includes(route) ? '' : `route_receipt_unsupported:${route}`,
      row.currentLiveTemplateDefaultId === dryRunRoute.currentLiveTemplateDefaultId ? '' : `route_receipt_current_template_mismatch:${route}`,
      row.targetLiveTemplateDefaultId === dryRunRoute.simulatedTemplateDefaultId ? '' : `route_receipt_target_template_mismatch:${route}`,
      row.currentSigningEnvelopeKey === dryRunRoute.currentSigningEnvelopeKey ? '' : `route_receipt_current_envelope_mismatch:${route}`,
      row.targetSigningEnvelopeKey === dryRunRoute.simulatedSigningEnvelopeKey ? '' : `route_receipt_target_envelope_mismatch:${route}`,
      row.routeOutputFingerprint === dryRunRoute.simulatedOutputFingerprint ? '' : `route_receipt_output_fingerprint_mismatch:${route}`,
      row.expectedOutputFingerprint === dryRunRoute.expectedOutputFingerprint ? '' : `route_receipt_expected_fingerprint_mismatch:${route}`,
      row.receiptRequiredBeforeWrite === true ? '' : `route_receipt_not_required_before_write:${route}`,
      ...missingOperations.map((operation) => `route_receipt_missing_operation:${route}:${operation}`),
      ...extraOperations.map((operation) => `route_receipt_extra_operation:${route}:${operation}`),
    ].filter(Boolean)
  })
  return [
    ...missingRoutes.map((route) => `route_receipt_missing:${route}`),
    ...unique(duplicateRoutes).map((route) => `route_receipt_duplicate:${route}`),
    ...rowBlockers,
  ]
}

function versionPointerBlockers(versionPointerReceipt = {}, dryRunReceipt = {}) {
  return [
    versionPointerReceipt.previousVersionKey === dryRunReceipt.versionPointerSimulation?.previousVersionKey ? '' : 'version_pointer_previous_version_mismatch',
    versionPointerReceipt.targetVersionKey === dryRunReceipt.versionPointerSimulation?.targetVersionKey ? '' : 'version_pointer_target_version_mismatch',
    versionPointerReceipt.pointerFingerprint === dryRunReceipt.versionPointerSimulation?.pointerFingerprint ? '' : 'version_pointer_fingerprint_mismatch',
    versionPointerReceipt.receiptRequiredBeforeWrite === true ? '' : 'version_pointer_receipt_not_required_before_write',
  ].filter(Boolean)
}

function operatorBlockers(operatorConfirmation = {}, receipt = {}, dryRunReceipt = {}) {
  return [
    operatorConfirmation.operator === dryRunReceipt.activationSimulationPlan?.operator ? '' : 'operator_confirmation_operator_mismatch',
    operatorConfirmation.confirmedBy === dryRunReceipt.activationGuardReceipt?.operatorConfirmation?.operator ? '' : 'operator_confirmation_confirmed_by_mismatch',
    receipt.approvalReference === dryRunReceipt.activationGuardReceipt?.operatorConfirmation?.approvalReference ? '' : 'operator_confirmation_approval_reference_mismatch',
    operatorConfirmation.mfaVerified === true ? '' : 'operator_confirmation_mfa_missing',
  ].filter(Boolean)
}

function writeTermsBlockers(writeTerms = {}) {
  const termList = list(writeTerms.terms).map(normalizeKey)
  return [
    writeTerms.requiredBeforeVersionRenewalWrite === true ? '' : 'write_terms_receipt_not_required',
    writeTerms.productionWritesAllowedByThisReceipt === false ? '' : 'write_terms_allow_production_write',
    writeTerms.requiresSeparateApplyCommand === true ? '' : 'write_terms_separate_apply_not_required',
    writeTerms.requiresMatchingReceiptFingerprint === true ? '' : 'write_terms_matching_fingerprint_not_required',
    writeTerms.requiresOperatorConfirmation === true ? '' : 'write_terms_operator_confirmation_not_required',
    writeTerms.requiresRollbackPlan === true ? '' : 'write_terms_rollback_plan_not_required',
    writeTerms.noUncontrolledWriteAllowed === true ? '' : 'write_terms_uncontrolled_write_allowed',
    ...REQUIRED_RECEIPT_TERMS.filter((term) => !termList.includes(term)).map((term) => `write_terms_missing:${term}`),
  ].filter(Boolean)
}

function archiveBlockers(archiveReceipt = {}) {
  return [
    normalizeText(archiveReceipt.archiveReference) ? '' : 'archive_reference_missing',
    archiveReceipt.activationReceiptArchived === true ? '' : 'activation_receipt_not_archived',
    archiveReceipt.sourceDryRunReceiptArchived === true ? '' : 'source_dry_run_receipt_not_archived',
    archiveReceipt.routeReceiptsArchived === true ? '' : 'route_receipts_not_archived',
    archiveReceipt.writeTermsArchived === true ? '' : 'write_terms_not_archived',
    archiveReceipt.immutable === true ? '' : 'archive_receipt_not_immutable',
  ].filter(Boolean)
}

function noWriteBlockers(noWriteProof = {}) {
  return [
    noWriteProof.receiptOnly === true ? '' : 'receipt_no_write_proof_not_receipt_only',
    noWriteProof.mutatedData === false ? '' : 'receipt_no_write_proof_mutated_data',
    noWriteProof.productionWriteAttempted === true ? 'receipt_no_write_proof_production_write_attempted' : '',
    numberValue(noWriteProof.liveDefaultMutationCount) === 0 ? '' : 'receipt_no_write_proof_live_default_mutation',
    numberValue(noWriteProof.versionPointerMutationCount) === 0 ? '' : 'receipt_no_write_proof_version_pointer_mutation',
    numberValue(noWriteProof.signingDispatchMutationCount) === 0 ? '' : 'receipt_no_write_proof_signing_dispatch_mutation',
  ].filter(Boolean)
}

function stopConditionBlockers(stopConditions = []) {
  const conditions = list(stopConditions).map(normalizeKey)
  return REQUIRED_STOP_CONDITIONS
    .filter((condition) => !conditions.includes(condition))
    .map((condition) => `receipt_stop_condition_missing:${condition}`)
}

function addCheck(checks, pass, code, detail) {
  checks.push({ code, pass: Boolean(pass), detail })
}

export function buildOtpVersionRenewalActivationReceipt({
  activationDryRunReceipt = buildOtpControlledVersionRenewalActivationDryRunReceipt(),
  receiptEvidence = defaultReceiptEvidence(activationDryRunReceipt),
  checkedAt = new Date().toISOString(),
} = {}) {
  const receipt = { ...receiptEvidence }
  const expectedReceiptFingerprint = stableFingerprint(receiptPayload(receipt), 'otp-phase49-receipt')
  const receiptFingerprint = normalizeText(receipt.receiptFingerprint) || expectedReceiptFingerprint
  const blockerCodes = unique([
    ...phase48Blockers(activationDryRunReceipt),
    ...authorityBlockers(receipt),
    receiptTimeValid(receipt, checkedAt) ? '' : 'receipt_expired_or_not_yet_valid',
    ...sourceBindingBlockers(receipt, activationDryRunReceipt),
    ...routeReceiptBlockers(receipt.routeReceipts, activationDryRunReceipt),
    ...versionPointerBlockers(receipt.versionPointerReceipt, activationDryRunReceipt),
    ...operatorBlockers(receipt.operatorConfirmation, receipt, activationDryRunReceipt),
    normalizeText(receipt.rollbackPlanReference) === normalizeText(activationDryRunReceipt.rollbackRehearsal?.rollbackPlanReference) ? '' : 'rollback_plan_reference_mismatch',
    ...writeTermsBlockers(receipt.writeTerms),
    ...archiveBlockers(receipt.archiveReceipt),
    ...noWriteBlockers(receipt.noWriteProof),
    ...stopConditionBlockers(receipt.stopConditions),
    receiptFingerprint === expectedReceiptFingerprint ? '' : 'receipt_fingerprint_mismatch',
  ])
  const canProceedToLiveWriteGuard = blockerCodes.length === 0

  return Object.freeze({
    version: OTP_VERSION_RENEWAL_ACTIVATION_RECEIPT_PHASE49_VERSION,
    contract: OTP_VERSION_RENEWAL_ACTIVATION_RECEIPT_CONTRACT,
    checkedAt,
    status: canProceedToLiveWriteGuard
      ? OTP_VERSION_RENEWAL_ACTIVATION_RECEIPT_READY_STATUS
      : 'OTP_VERSION_RENEWAL_ACTIVATION_RECEIPT_BLOCKED',
    canProceedToLiveWriteGuard,
    mutatedData: false,
    blockerCodes: Object.freeze(blockerCodes),
    expectedReceiptFingerprint,
    receiptFingerprint,
    receiptEvidence: Object.freeze({
      ...receipt,
      receiptFingerprint,
    }),
    activationDryRunReceipt: Object.freeze({
      version: activationDryRunReceipt.version,
      status: activationDryRunReceipt.status,
      canIssueActivationReceipt: activationDryRunReceipt.canIssueActivationReceipt === true,
      sourceSimulationId: activationDryRunReceipt.activationSimulationPlan?.simulationId,
      sourceSimulationFingerprint: dryRunSimulationFingerprint(activationDryRunReceipt),
      blockerCount: list(activationDryRunReceipt.blockerCodes).length,
    }),
    summary: Object.freeze({
      routeReceiptCount: list(receipt.routeReceipts).length,
      validRouteReceiptCount: REQUIRED_ROUTES.filter((route) => !routeReceiptBlockers(receipt.routeReceipts, activationDryRunReceipt).some((code) => code.includes(route))).length,
      authorityPresent: authorityBlockers(receipt).length === 0,
      timeWindowValid: receiptTimeValid(receipt, checkedAt),
      sourceDryRunBound: sourceBindingBlockers(receipt, activationDryRunReceipt).length === 0,
      versionPointerBound: versionPointerBlockers(receipt.versionPointerReceipt, activationDryRunReceipt).length === 0,
      rollbackBound: normalizeText(receipt.rollbackPlanReference) === normalizeText(activationDryRunReceipt.rollbackRehearsal?.rollbackPlanReference),
      writeTermsSafe: writeTermsBlockers(receipt.writeTerms).length === 0,
      fingerprintMatches: receiptFingerprint === expectedReceiptFingerprint,
      blockerCount: blockerCodes.length,
    }),
  })
}

export function buildOtpVersionRenewalActivationReceiptPhase49Audit({
  checkedAt = new Date().toISOString(),
  phase48Audit = null,
  packageJson = {},
} = {}) {
  const checks = []
  const phase48Ready = !phase48Audit || phase48Audit.status === OTP_CONTROLLED_VERSION_RENEWAL_ACTIVATION_DRY_RUN_READY_STATUS
  const goodDryRun = phase48Audit?.dryRunReceipts?.find((receipt) => receipt.canIssueActivationReceipt) ||
    buildOtpControlledVersionRenewalActivationDryRunReceipt({ checkedAt })
  const goodReceiptEvidence = defaultReceiptEvidence(goodDryRun, checkedAt)
  const goodReceipt = buildOtpVersionRenewalActivationReceipt({
    checkedAt,
    activationDryRunReceipt: goodDryRun,
    receiptEvidence: goodReceiptEvidence,
  })
  const blockedPhase48Receipt = buildOtpVersionRenewalActivationReceipt({
    checkedAt,
    activationDryRunReceipt: {
      ...goodDryRun,
      status: 'OTP_CONTROLLED_VERSION_RENEWAL_ACTIVATION_DRY_RUN_BLOCKED',
      canIssueActivationReceipt: false,
      blockerCodes: ['activation_simulation_production_write_requested'],
    },
    receiptEvidence: goodReceiptEvidence,
  })
  const missingAuthorityReceipt = buildOtpVersionRenewalActivationReceipt({
    checkedAt,
    activationDryRunReceipt: goodDryRun,
    receiptEvidence: { ...goodReceiptEvidence, authorisedByRole: '', approvalReference: '' },
  })
  const expiredReceipt = buildOtpVersionRenewalActivationReceipt({
    checkedAt,
    activationDryRunReceipt: goodDryRun,
    receiptEvidence: { ...goodReceiptEvidence, issuedAt: '2026-08-01T00:00:00.000Z', expiresAt: '2026-08-02T00:00:00.000Z' },
  })
  const routeMismatchReceipt = buildOtpVersionRenewalActivationReceipt({
    checkedAt,
    activationDryRunReceipt: goodDryRun,
    receiptEvidence: {
      ...goodReceiptEvidence,
      routeReceipts: goodReceiptEvidence.routeReceipts.map((row) =>
        row.routeVariant === 'resale_existing_property'
          ? { ...row, targetLiveTemplateDefaultId: 'wrong-template-default', routeOutputFingerprint: 'wrong-route-fingerprint' }
          : row,
      ),
    },
  })
  const versionPointerMismatchReceipt = buildOtpVersionRenewalActivationReceipt({
    checkedAt,
    activationDryRunReceipt: goodDryRun,
    receiptEvidence: {
      ...goodReceiptEvidence,
      versionPointerReceipt: { ...goodReceiptEvidence.versionPointerReceipt, targetVersionKey: 'wrong-target-version' },
    },
  })
  const unsafeWriteTermsReceipt = buildOtpVersionRenewalActivationReceipt({
    checkedAt,
    activationDryRunReceipt: goodDryRun,
    receiptEvidence: {
      ...goodReceiptEvidence,
      writeTerms: { ...goodReceiptEvidence.writeTerms, productionWritesAllowedByThisReceipt: true, requiresSeparateApplyCommand: false },
    },
  })
  const operatorMismatchReceipt = buildOtpVersionRenewalActivationReceipt({
    checkedAt,
    activationDryRunReceipt: goodDryRun,
    receiptEvidence: {
      ...goodReceiptEvidence,
      operatorConfirmation: { ...goodReceiptEvidence.operatorConfirmation, operator: 'wrong-operator', confirmedBy: 'wrong-confirmer' },
    },
  })
  const rollbackMissingReceipt = buildOtpVersionRenewalActivationReceipt({
    checkedAt,
    activationDryRunReceipt: goodDryRun,
    receiptEvidence: { ...goodReceiptEvidence, rollbackPlanReference: '' },
  })
  const fingerprintMismatchReceipt = buildOtpVersionRenewalActivationReceipt({
    checkedAt,
    activationDryRunReceipt: goodDryRun,
    receiptEvidence: { ...goodReceiptEvidence, receiptFingerprint: 'otp-phase49-receipt:00000000:1' },
  })

  addCheck(checks, phase48Ready, 'PHASE49_PHASE48_CONTROLLED_DRY_RUN_READY', 'Phase 48 controlled version renewal activation dry-run is ready before an activation receipt can be issued.')
  addCheck(checks, goodReceipt.canProceedToLiveWriteGuard && goodReceipt.mutatedData === false, 'PHASE49_GOOD_ACTIVATION_RECEIPT_READY', 'A clean Phase 48 dry-run can issue a receipt for the next live write guard without mutating production.')
  addCheck(checks, goodReceipt.summary.authorityPresent, 'PHASE49_RECEIPT_AUTHORITY_PRESENT', 'Receipt includes id, authority status, issuing role, authorising role, authority scope, and approval reference.')
  addCheck(checks, goodReceipt.summary.timeWindowValid, 'PHASE49_RECEIPT_TIME_WINDOW_VALID', 'Receipt issue and expiry window is valid.')
  addCheck(checks, goodReceipt.summary.validRouteReceiptCount === REQUIRED_ROUTES.length, 'PHASE49_BOTH_ROUTE_RECEIPTS_BOUND', 'Receipt records exact resale and new-development route rows.')
  addCheck(checks, goodReceipt.summary.versionPointerBound, 'PHASE49_VERSION_POINTER_RECEIPT_BOUND', 'Receipt binds the target version pointer to the Phase 48 simulation.')
  addCheck(checks, goodReceipt.summary.writeTermsSafe, 'PHASE49_WRITE_TERMS_REQUIRE_SEPARATE_LIVE_WRITE_GUARD', 'Write terms require the receipt, a separate live write guard, operator confirmation, rollback, and matching fingerprint.')
  addCheck(checks, goodReceipt.summary.fingerprintMatches, 'PHASE49_RECEIPT_FINGERPRINT_MATCHES', 'Receipt fingerprint matches authority, source dry-run, routes, version pointer, rollback, and write terms.')
  addCheck(checks, blockedPhase48Receipt.canProceedToLiveWriteGuard === false && blockedPhase48Receipt.blockerCodes.includes('phase48_activation_dry_run_not_ready'), 'PHASE49_BLOCKED_PHASE48_DRY_RUN_REJECTED', 'A blocked Phase 48 dry-run cannot issue a usable receipt.')
  addCheck(checks, missingAuthorityReceipt.canProceedToLiveWriteGuard === false && missingAuthorityReceipt.blockerCodes.includes('receipt_authorising_role_missing'), 'PHASE49_MISSING_AUTHORITY_BLOCKED', 'Missing authority or approval reference blocks the receipt.')
  addCheck(checks, expiredReceipt.canProceedToLiveWriteGuard === false && expiredReceipt.blockerCodes.includes('receipt_expired_or_not_yet_valid'), 'PHASE49_EXPIRED_RECEIPT_BLOCKED', 'Expired receipts cannot proceed to live write guard.')
  addCheck(checks, routeMismatchReceipt.canProceedToLiveWriteGuard === false && routeMismatchReceipt.blockerCodes.includes('route_receipt_target_template_mismatch:resale_existing_property'), 'PHASE49_ROUTE_RECEIPT_MISMATCH_BLOCKED', 'Route receipt template and output fingerprint mismatches are blocked.')
  addCheck(checks, versionPointerMismatchReceipt.canProceedToLiveWriteGuard === false && versionPointerMismatchReceipt.blockerCodes.includes('version_pointer_target_version_mismatch'), 'PHASE49_VERSION_POINTER_MISMATCH_BLOCKED', 'Version pointer receipt mismatches are blocked.')
  addCheck(checks, unsafeWriteTermsReceipt.canProceedToLiveWriteGuard === false && unsafeWriteTermsReceipt.blockerCodes.includes('write_terms_allow_production_write'), 'PHASE49_UNSAFE_WRITE_TERMS_BLOCKED', 'Receipt terms cannot permit production write by themselves.')
  addCheck(checks, operatorMismatchReceipt.canProceedToLiveWriteGuard === false && operatorMismatchReceipt.blockerCodes.includes('operator_confirmation_operator_mismatch'), 'PHASE49_OPERATOR_MISMATCH_BLOCKED', 'Operator mismatches are blocked.')
  addCheck(checks, rollbackMissingReceipt.canProceedToLiveWriteGuard === false && rollbackMissingReceipt.blockerCodes.includes('rollback_plan_reference_mismatch'), 'PHASE49_ROLLBACK_PLAN_BLOCKED', 'Missing rollback plan reference blocks the receipt.')
  addCheck(checks, fingerprintMismatchReceipt.canProceedToLiveWriteGuard === false && fingerprintMismatchReceipt.blockerCodes.includes('receipt_fingerprint_mismatch'), 'PHASE49_RECEIPT_FINGERPRINT_MISMATCH_BLOCKED', 'Receipt fingerprint mismatches are blocked.')
  addCheck(
    checks,
    packageJson.scripts?.['test:otp-version-renewal-activation-receipt-phase49'] === 'node scripts/otp-version-renewal-activation-receipt-phase49.test.mjs' &&
      packageJson.scripts?.['report:otp-version-renewal-activation-receipt-phase49'] === 'node scripts/report-otp-version-renewal-activation-receipt-phase49.mjs' &&
      packageJson.scripts?.['verify:otp-template-vnext']?.includes('test:otp-version-renewal-activation-receipt-phase49'),
    'PHASE49_PACKAGE_SCRIPTS_WIRED',
    'Package scripts expose the Phase 49 test, report, and vNext verification chain entry.',
  )

  const blockers = checks.filter((check) => !check.pass)
  return Object.freeze({
    version: OTP_VERSION_RENEWAL_ACTIVATION_RECEIPT_PHASE49_VERSION,
    contract: OTP_VERSION_RENEWAL_ACTIVATION_RECEIPT_CONTRACT,
    checkedAt,
    status: blockers.length ? 'OTP_VERSION_RENEWAL_ACTIVATION_RECEIPT_REMEDIATION_REQUIRED' : OTP_VERSION_RENEWAL_ACTIVATION_RECEIPT_READY_STATUS,
    canProceedToLiveWriteGuard: blockers.length === 0,
    mutatedData: false,
    checks: Object.freeze(checks),
    blockers: Object.freeze(blockers),
    activationReceipts: Object.freeze([
      goodReceipt,
      blockedPhase48Receipt,
      missingAuthorityReceipt,
      expiredReceipt,
      routeMismatchReceipt,
      versionPointerMismatchReceipt,
      unsafeWriteTermsReceipt,
      operatorMismatchReceipt,
      rollbackMissingReceipt,
      fingerprintMismatchReceipt,
    ]),
    summary: Object.freeze({
      blockerCount: blockers.length,
      readyReceiptCount: [goodReceipt].filter((row) => row.canProceedToLiveWriteGuard).length,
      blockedReceiptCount: [
        blockedPhase48Receipt,
        missingAuthorityReceipt,
        expiredReceipt,
        routeMismatchReceipt,
        versionPointerMismatchReceipt,
        unsafeWriteTermsReceipt,
        operatorMismatchReceipt,
        rollbackMissingReceipt,
        fingerprintMismatchReceipt,
      ].filter((row) => !row.canProceedToLiveWriteGuard).length,
      routeCount: REQUIRED_ROUTES.length,
      requiredWriteTermCount: REQUIRED_RECEIPT_TERMS.length,
      requiredStopConditionCount: REQUIRED_STOP_CONDITIONS.length,
    }),
    nextPhase: blockers.length ? null : Object.freeze({
      phase: 50,
      key: 'otp_version_renewal_live_write_guard',
      label: 'Version Renewal Live Write Guard',
    }),
  })
}

export function formatOtpVersionRenewalActivationReceiptPhase49Markdown(report = buildOtpVersionRenewalActivationReceiptPhase49Audit()) {
  const readyReceipt = report.activationReceipts.find((receipt) => receipt.canProceedToLiveWriteGuard) || report.activationReceipts[0]
  const receipt = readyReceipt?.receiptEvidence || {}
  return [
    '# OTP Generator Phase 49 Version Renewal Activation Receipt',
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
        ['Ready receipts', report.summary.readyReceiptCount],
        ['Blocked receipts', report.summary.blockedReceiptCount],
        ['Routes', report.summary.routeCount],
        ['Write terms', report.summary.requiredWriteTermCount],
        ['Stop conditions', report.summary.requiredStopConditionCount],
        ['Blockers', report.summary.blockerCount],
        ['Proceed to live write guard', report.canProceedToLiveWriteGuard ? 'yes' : 'no'],
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
        ['Source simulation id', receipt.sourceSimulationId],
        ['Source simulation fingerprint', receipt.sourceSimulationFingerprint],
        ['Version key', receipt.target?.versionKey],
        ['Previous version key', receipt.target?.previousVersionKey],
        ['Rollback plan reference', receipt.rollbackPlanReference],
        ['Receipt fingerprint', readyReceipt?.receiptFingerprint],
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
      ['Route', 'Route Key', 'Target Template', 'Target Envelope', 'Fingerprint', 'Operations', 'Receipt Required'],
      list(receipt.routeReceipts).map((row) => [
        row.routeLabel,
        row.routeVariant,
        row.targetLiveTemplateDefaultId,
        row.targetSigningEnvelopeKey,
        row.routeOutputFingerprint,
        list(row.operationNames).join(', '),
        row.receiptRequiredBeforeWrite ? 'yes' : 'no',
      ]),
    ),
    '',
    '## Blocked Receipt Proofs',
    '',
    table(
      ['Status', 'Allowed', 'Blockers'],
      report.activationReceipts.map((candidate) => [
        candidate.status,
        candidate.canProceedToLiveWriteGuard ? 'yes' : 'no',
        candidate.blockerCodes.join(', ') || 'none',
      ]),
    ),
    '',
    '## Boundary',
    '',
    'Phase 49 records the exact authority and activation receipt format required before any version renewal live write guard may proceed. It binds the Phase 48 dry-run, resale and new-development route receipts, version pointer, operator authority, rollback reference, stop conditions, and write terms. It remains receipt-only: it does not execute production writes, mutate live defaults, change version pointers, dispatch signing, or publish templates.',
    '',
  ].join('\n')
}
