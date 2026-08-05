import {
  OTP_PRODUCTION_RELEASE_DECISION_PHASE39_VERSION,
  OTP_PRODUCTION_RELEASE_DECISION_READY_STATUS,
  buildOtpProductionReleaseDecisionPack,
} from './otpProductionReleaseDecisionPhase39.js'

export const OTP_CONTROLLED_PRODUCTION_CUTOVER_PHASE40_VERSION = 'otp_controlled_production_cutover_phase40_v1'
export const OTP_CONTROLLED_PRODUCTION_CUTOVER_READY_STATUS = 'OTP_CONTROLLED_PRODUCTION_CUTOVER_READY_FOR_OPERATOR_EXECUTION'
export const OTP_CONTROLLED_PRODUCTION_CUTOVER_CONTRACT = 'otp-vnext-controlled-production-cutover-phase40-v1'

const REQUIRED_OPERATION_KEY = 'activate_otp_vnext_production_defaults'
const REQUIRED_OPERATOR_CONFIRMATION = 'CONFIRM_OTP_PRODUCTION_CUTOVER'
const REQUIRED_ROUTES = Object.freeze(['resale_existing_property', 'new_development'])

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

function table(headers = [], rows = []) {
  const escape = (value) => normalizeText(value).replace(/\|/g, '\\|').replace(/\n/g, '<br>')
  return [
    `| ${headers.map(escape).join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map(escape).join(' | ')} |`),
  ].join('\n')
}

function hasDocxSource(row = {}) {
  return /\.docx?$/i.test(normalizeText(row.templateDefaultId || row.template_default_id || row.sourcePath || row.source_path)) ||
    normalizeKey(row.sourceFormat || row.source_format).includes('doc')
}

function approvedReleasePack(checkedAt = new Date().toISOString()) {
  return buildOtpProductionReleaseDecisionPack({
    checkedAt,
    attorneyApprovals: REQUIRED_ROUTES.map((routeVariant) => ({
      routeVariant,
      approvalStatus: 'approved',
      approvalReference: `attorney-approval-${routeVariant}-phase40`,
      required: true,
    })),
    operatorApprovalReference: 'operator-release-approval-phase40',
  })
}

function defaultOperationFromPack(pack = approvedReleasePack()) {
  return {
    operationKey: REQUIRED_OPERATION_KEY,
    environment: 'production',
    executionMode: 'controlled_production_cutover',
    mutationMode: 'operator_receipt_only',
    operatorConfirmation: REQUIRED_OPERATOR_CONFIRMATION,
    operatorApprovalReference: pack.operatorApprovalReference,
    flags: list(pack.flags).map((flag) => ({
      key: flag.key,
      targetState: flag.targetState,
      rollbackState: flag.rollbackState,
    })),
    templateDefaultUpdates: list(pack.templateDefaults).map((row) => ({
      routeVariant: row.routeVariant,
      templateDefaultId: row.templateDefaultId,
      previousTemplateDefaultId: row.previousTemplateDefaultId,
      sourceFormat: row.sourceFormat,
    })),
    routeEnvelopeUpdates: list(pack.routeSeparation).map((row) => ({
      routeVariant: row.routeVariant,
      signingEnvelopeKey: row.signingEnvelopeKey,
      templateDefaultId: row.templateDefaultId,
    })),
    rollbackPlan: list(pack.rollbackPlan).map((row) => ({
      key: row.key,
      ready: row.ready,
      owner: row.owner,
    })),
    evidenceLinks: list(pack.evidenceLinks).map((row) => ({
      key: row.key,
      path: row.path,
    })),
  }
}

function routeRow(rows = [], routeVariant = '') {
  const route = normalizeKey(routeVariant)
  return list(rows).find((row) => normalizeKey(row.routeVariant || row.route_variant) === route) || null
}

function sameFlagState(pack = {}, operation = {}) {
  return list(pack.flags).every((flag) => {
    const opFlag = list(operation.flags).find((row) => normalizeKey(row.key) === normalizeKey(flag.key))
    return opFlag && opFlag.targetState === flag.targetState && opFlag.rollbackState === flag.rollbackState
  })
}

function sameRollbackPlan(pack = {}, operation = {}) {
  const packKeys = list(pack.rollbackPlan).map((row) => normalizeKey(row.key))
  const operationKeys = list(operation.rollbackPlan).map((row) => normalizeKey(row.key))
  return packKeys.length === operationKeys.length &&
    packKeys.every((key) => operationKeys.includes(key)) &&
    list(operation.rollbackPlan).every((row) => row.ready === true)
}

function routeMismatches(pack = {}, operation = {}) {
  return REQUIRED_ROUTES.flatMap((routeVariant) => {
    const packTemplate = routeRow(pack.templateDefaults, routeVariant)
    const opTemplate = routeRow(operation.templateDefaultUpdates, routeVariant)
    const packEnvelope = routeRow(pack.routeSeparation, routeVariant)
    const opEnvelope = routeRow(operation.routeEnvelopeUpdates, routeVariant)
    return [
      packTemplate && opTemplate && normalizeText(packTemplate.templateDefaultId) === normalizeText(opTemplate.templateDefaultId)
        ? ''
        : `template_default_mismatch:${routeVariant}`,
      packTemplate && opTemplate && !hasDocxSource(opTemplate) ? '' : `docx_template_source_not_allowed:${routeVariant}`,
      packEnvelope && opEnvelope && normalizeText(packEnvelope.signingEnvelopeKey) === normalizeText(opEnvelope.signingEnvelopeKey)
        ? ''
        : `signing_envelope_mismatch:${routeVariant}`,
      packEnvelope && opEnvelope && normalizeText(packEnvelope.templateDefaultId) === normalizeText(opEnvelope.templateDefaultId)
        ? ''
        : `route_template_binding_mismatch:${routeVariant}`,
    ].filter(Boolean)
  })
}

export function buildOtpControlledProductionCutoverReceipt({
  releaseDecisionPack = approvedReleasePack(),
  operation = null,
  checkedAt = new Date().toISOString(),
} = {}) {
  const pack = releaseDecisionPack || {}
  const op = operation || defaultOperationFromPack(pack)
  const blockerCodes = [
    pack.version === OTP_PRODUCTION_RELEASE_DECISION_PHASE39_VERSION ? '' : 'phase39_release_pack_version_mismatch',
    pack.status === OTP_PRODUCTION_RELEASE_DECISION_READY_STATUS ? '' : 'phase39_release_pack_not_ready',
    pack.releaseDecision === 'go_for_controlled_cutover' ? '' : `release_decision_not_go:${normalizeKey(pack.releaseDecision || 'missing')}`,
    pack.canCutoverProduction === true ? '' : 'release_pack_cannot_cutover_production',
    list(pack.blockerCodes).length ? 'release_pack_has_blockers' : '',
    list(pack.legalApprovalHoldCodes).length ? 'release_pack_has_legal_approval_holds' : '',
    normalizeText(op.operationKey) === REQUIRED_OPERATION_KEY ? '' : 'operation_key_mismatch',
    normalizeKey(op.environment) === 'production' ? '' : 'operation_environment_not_production',
    normalizeKey(op.executionMode) === 'controlled_production_cutover' ? '' : 'operation_mode_not_controlled_cutover',
    normalizeKey(op.mutationMode) === 'operator_receipt_only' ? '' : 'operation_mutation_mode_not_receipt_only',
    normalizeText(op.operatorConfirmation) === REQUIRED_OPERATOR_CONFIRMATION ? '' : 'missing_operator_cutover_confirmation',
    normalizeText(op.operatorApprovalReference) && normalizeText(op.operatorApprovalReference) === normalizeText(pack.operatorApprovalReference)
      ? ''
      : 'operator_approval_reference_mismatch',
    sameFlagState(pack, op) ? '' : 'release_flag_state_mismatch',
    sameRollbackPlan(pack, op) ? '' : 'rollback_plan_mismatch',
    ...routeMismatches(pack, op),
  ].filter(Boolean)

  const canExecuteControlledCutover = blockerCodes.length === 0
  return Object.freeze({
    version: OTP_CONTROLLED_PRODUCTION_CUTOVER_PHASE40_VERSION,
    contract: OTP_CONTROLLED_PRODUCTION_CUTOVER_CONTRACT,
    checkedAt,
    status: canExecuteControlledCutover
      ? OTP_CONTROLLED_PRODUCTION_CUTOVER_READY_STATUS
      : 'OTP_CONTROLLED_PRODUCTION_CUTOVER_BLOCKED',
    canExecuteControlledCutover,
    mutatedData: false,
    operationKey: normalizeText(op.operationKey),
    environment: normalizeKey(op.environment),
    executionMode: normalizeKey(op.executionMode),
    mutationMode: normalizeKey(op.mutationMode),
    operatorApprovalReference: normalizeText(op.operatorApprovalReference),
    operatorConfirmation: normalizeText(op.operatorConfirmation),
    blockerCodes: Object.freeze(unique(blockerCodes)),
    routeCount: REQUIRED_ROUTES.length,
    flagCount: list(op.flags).length,
    rollbackStepCount: list(op.rollbackPlan).length,
    evidenceLinkCount: list(op.evidenceLinks).length,
    templateDefaultUpdates: Object.freeze(list(op.templateDefaultUpdates)),
    routeEnvelopeUpdates: Object.freeze(list(op.routeEnvelopeUpdates)),
  })
}

function addCheck(checks, pass, code, detail) {
  checks.push({ code, pass: Boolean(pass), detail })
}

export function buildOtpControlledProductionCutoverPhase40Audit({
  checkedAt = new Date().toISOString(),
  phase39Audit = null,
  packageJson = {},
} = {}) {
  const checks = []
  const phase39Ready = !phase39Audit || phase39Audit.status === OTP_PRODUCTION_RELEASE_DECISION_READY_STATUS
  const goodPack = approvedReleasePack(checkedAt)
  const goodReceipt = buildOtpControlledProductionCutoverReceipt({
    checkedAt,
    releaseDecisionPack: goodPack,
  })
  const pendingAttorneyPack = buildOtpProductionReleaseDecisionPack({
    checkedAt,
    operatorApprovalReference: 'operator-release-approval-phase40',
  })
  const pendingAttorneyReceipt = buildOtpControlledProductionCutoverReceipt({
    checkedAt,
    releaseDecisionPack: pendingAttorneyPack,
    operation: defaultOperationFromPack(pendingAttorneyPack),
  })
  const missingConfirmationReceipt = buildOtpControlledProductionCutoverReceipt({
    checkedAt,
    releaseDecisionPack: goodPack,
    operation: {
      ...defaultOperationFromPack(goodPack),
      operatorConfirmation: '',
    },
  })
  const routeMismatchReceipt = buildOtpControlledProductionCutoverReceipt({
    checkedAt,
    releaseDecisionPack: goodPack,
    operation: {
      ...defaultOperationFromPack(goodPack),
      templateDefaultUpdates: defaultOperationFromPack(goodPack).templateDefaultUpdates.map((row) =>
        row.routeVariant === 'resale_existing_property' ? { ...row, templateDefaultId: 'wrong-template-default' } : row,
      ),
    },
  })
  const rollbackMismatchReceipt = buildOtpControlledProductionCutoverReceipt({
    checkedAt,
    releaseDecisionPack: goodPack,
    operation: {
      ...defaultOperationFromPack(goodPack),
      rollbackPlan: defaultOperationFromPack(goodPack).rollbackPlan.slice(0, -1),
    },
  })
  const docxReceipt = buildOtpControlledProductionCutoverReceipt({
    checkedAt,
    releaseDecisionPack: goodPack,
    operation: {
      ...defaultOperationFromPack(goodPack),
      templateDefaultUpdates: defaultOperationFromPack(goodPack).templateDefaultUpdates.map((row) =>
        row.routeVariant === 'resale_existing_property'
          ? { ...row, sourceFormat: 'docx', sourcePath: 'old-otp.docx' }
          : row,
      ),
    },
  })
  const wrongOperationReceipt = buildOtpControlledProductionCutoverReceipt({
    checkedAt,
    releaseDecisionPack: goodPack,
    operation: {
      ...defaultOperationFromPack(goodPack),
      operationKey: 'activate_unrelated_template',
    },
  })

  addCheck(checks, phase39Ready, 'PHASE40_PHASE39_RELEASE_DECISION_READY', 'Controlled cutover starts only after Phase 39 release decision is ready.')
  addCheck(
    checks,
    goodReceipt.canExecuteControlledCutover &&
      goodReceipt.operationKey === REQUIRED_OPERATION_KEY &&
      goodReceipt.environment === 'production',
    'PHASE40_APPROVED_PACK_EXECUTION_RECEIPT_READY',
    'A fully approved Phase 39 pack can produce the controlled production cutover receipt.',
  )
  addCheck(
    checks,
    pendingAttorneyReceipt.canExecuteControlledCutover === false &&
      pendingAttorneyReceipt.blockerCodes.includes('release_pack_has_legal_approval_holds'),
    'PHASE40_CONDITIONAL_LEGAL_HOLD_BLOCKED',
    'A conditional-go pack with attorney approval holds cannot execute production cutover.',
  )
  addCheck(
    checks,
    missingConfirmationReceipt.canExecuteControlledCutover === false &&
      missingConfirmationReceipt.blockerCodes.includes('missing_operator_cutover_confirmation'),
    'PHASE40_OPERATOR_CONFIRMATION_REQUIRED',
    'Controlled cutover is blocked without the exact operator confirmation phrase.',
  )
  addCheck(
    checks,
    routeMismatchReceipt.canExecuteControlledCutover === false &&
      routeMismatchReceipt.blockerCodes.includes('template_default_mismatch:resale_existing_property'),
    'PHASE40_ROUTE_TEMPLATE_MISMATCH_BLOCKED',
    'A route template default that does not match the Phase 39 pack is blocked.',
  )
  addCheck(
    checks,
    rollbackMismatchReceipt.canExecuteControlledCutover === false &&
      rollbackMismatchReceipt.blockerCodes.includes('rollback_plan_mismatch'),
    'PHASE40_ROLLBACK_MISMATCH_BLOCKED',
    'A cutover operation whose rollback plan does not match the release pack is blocked.',
  )
  addCheck(
    checks,
    docxReceipt.canExecuteControlledCutover === false &&
      docxReceipt.blockerCodes.includes('docx_template_source_not_allowed:resale_existing_property'),
    'PHASE40_DOCX_SOURCE_BLOCKED',
    'A cutover operation that reintroduces DOC/DOCX template source is blocked.',
  )
  addCheck(
    checks,
    wrongOperationReceipt.canExecuteControlledCutover === false &&
      wrongOperationReceipt.blockerCodes.includes('operation_key_mismatch'),
    'PHASE40_EXACT_OPERATION_LOCKED',
    'Only the exact OTP vNext production-default activation operation is accepted.',
  )
  addCheck(
    checks,
    goodReceipt.mutatedData === false && goodReceipt.mutationMode === 'operator_receipt_only',
    'PHASE40_EXECUTION_RECEIPT_NO_DATA_MUTATION',
    'Phase 40 produces a receipt-only operator cutover proof and does not mutate production data from the test/report path.',
  )
  addCheck(
    checks,
    packageJson.scripts?.['test:otp-controlled-production-cutover-phase40'] === 'node scripts/otp-controlled-production-cutover-phase40.test.mjs' &&
      packageJson.scripts?.['report:otp-controlled-production-cutover-phase40'] === 'node scripts/report-otp-controlled-production-cutover-phase40.mjs',
    'PHASE40_PACKAGE_SCRIPTS_WIRED',
    'Package scripts expose the Phase 40 test and report.',
  )

  const blockers = checks.filter((check) => !check.pass)
  return Object.freeze({
    version: OTP_CONTROLLED_PRODUCTION_CUTOVER_PHASE40_VERSION,
    contract: OTP_CONTROLLED_PRODUCTION_CUTOVER_CONTRACT,
    checkedAt,
    status: blockers.length ? 'OTP_CONTROLLED_PRODUCTION_CUTOVER_REMEDIATION_REQUIRED' : OTP_CONTROLLED_PRODUCTION_CUTOVER_READY_STATUS,
    mutatedData: false,
    checks: Object.freeze(checks),
    blockers: Object.freeze(blockers),
    receipts: Object.freeze([
      goodReceipt,
      pendingAttorneyReceipt,
      missingConfirmationReceipt,
      routeMismatchReceipt,
      rollbackMismatchReceipt,
      docxReceipt,
      wrongOperationReceipt,
    ]),
    summary: Object.freeze({
      blockerCount: blockers.length,
      approvedReceiptCount: [goodReceipt].filter((row) => row.canExecuteControlledCutover).length,
      blockedUnsafeReceiptCount: [
        pendingAttorneyReceipt,
        missingConfirmationReceipt,
        routeMismatchReceipt,
        rollbackMismatchReceipt,
        docxReceipt,
        wrongOperationReceipt,
      ].filter((row) => !row.canExecuteControlledCutover).length,
      routeCount: REQUIRED_ROUTES.length,
    }),
    nextPhase: blockers.length ? null : Object.freeze({
      phase: 41,
      key: 'otp_post_cutover_monitoring',
      label: 'Post-Cutover Monitoring And Rollback Watch',
    }),
  })
}

export function formatOtpControlledProductionCutoverPhase40Markdown(report = buildOtpControlledProductionCutoverPhase40Audit()) {
  return [
    '# OTP Generator Phase 40 Controlled Production Cutover Execution',
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
        ['Approved cutover receipts', report.summary.approvedReceiptCount],
        ['Unsafe receipts blocked', report.summary.blockedUnsafeReceiptCount],
        ['Routes', report.summary.routeCount],
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
    '## Cutover Receipts',
    '',
    table(
      ['Operation', 'Environment', 'Mode', 'Routes', 'Allowed', 'Blockers'],
      report.receipts.map((receipt) => [
        receipt.operationKey,
        receipt.environment,
        receipt.mutationMode,
        receipt.routeCount,
        receipt.canExecuteControlledCutover ? 'yes' : 'no',
        receipt.blockerCodes.join(', ') || 'none',
      ]),
    ),
    '',
    '## Boundary',
    '',
    'Phase 40 proves the controlled production cutover operation is locked to a fully approved Phase 39 pack and exact operator receipt. It does not mutate production data from tests or reports; real cutover still requires the operator-controlled execution path using this receipt.',
    '',
  ].join('\n')
}
