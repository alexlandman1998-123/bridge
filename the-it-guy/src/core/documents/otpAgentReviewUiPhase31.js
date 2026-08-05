import {
  OTP_AGENT_CONTROLLED_EDITS_CONTRACT,
  OTP_AGENT_CONTROLLED_EDITS_PHASE30_VERSION,
} from './otpAgentControlledEditsPhase30.js'

export const OTP_AGENT_REVIEW_UI_PHASE31_VERSION = 'otp_agent_review_ui_phase31_v1'
export const OTP_AGENT_REVIEW_UI_READY_STATUS = 'OTP_AGENT_REVIEW_UI_READY_FOR_RUNTIME_PROOF'
export const OTP_AGENT_REVIEW_UI_CONTRACT = 'otp-vnext-agent-review-ui-phase31-v1'

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

function table(headers = [], rows = []) {
  const escape = (value) => normalizeText(value).replace(/\|/g, '\\|').replace(/\n/g, '<br>')
  return [
    `| ${headers.map(escape).join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map(escape).join(' | ')} |`),
  ].join('\n')
}

function readReviewRecord(sourceContext = {}) {
  const record = sourceContext?.otpAgentReviewRecord && typeof sourceContext.otpAgentReviewRecord === 'object'
    ? sourceContext.otpAgentReviewRecord
    : sourceContext?.otp_agent_review_record && typeof sourceContext.otp_agent_review_record === 'object'
      ? sourceContext.otp_agent_review_record
      : null
  return record || null
}

export function buildOtpAgentReviewRecord({
  model = null,
  termsSnapshot = {},
  standardConditionSelections = [],
  customConditionRequests = [],
  actorRole = 'agent',
  confirmedAt = new Date().toISOString(),
} = {}) {
  const safeModel = model && typeof model === 'object' ? model : {}
  return Object.freeze({
    version: OTP_AGENT_REVIEW_UI_PHASE31_VERSION,
    contract: OTP_AGENT_REVIEW_UI_CONTRACT,
    phase30Version: OTP_AGENT_CONTROLLED_EDITS_PHASE30_VERSION,
    phase30Contract: OTP_AGENT_CONTROLLED_EDITS_CONTRACT,
    confirmed: safeModel.canGenerateOtp === true,
    confirmedAt,
    confirmedByRole: normalizeKey(actorRole || 'agent'),
    routeVariant: normalizeKey(safeModel.routeVariant || termsSnapshot.routeVariant || 'resale_existing_property'),
    routeLabel: normalizeText(safeModel.routeLabel),
    blockerCodes: Object.freeze(list(safeModel.blockerCodes)),
    warningCodes: Object.freeze(list(safeModel.warningCodes)),
    termsSnapshot: Object.freeze({ ...(termsSnapshot || {}) }),
    standardConditionSelections: Object.freeze(list(standardConditionSelections).map((item) => Object.freeze({ ...(item || {}) }))),
    customConditionRequests: Object.freeze(list(customConditionRequests).map((item) => Object.freeze({ ...(item || {}) }))),
    controlPolicy: Object.freeze({
      agentsEditTransactionTermsOnly: true,
      rawLegalTemplateEditingAllowed: false,
      customSuspensiveConditionsRequireApproval: true,
      generatesFromReviewedTransactionTerms: true,
    }),
  })
}

export function buildOtpAgentReviewUiState({
  model = null,
  sourceContext = {},
  lifecycleState = '',
  canGeneratePermission = false,
  hasGeneratedPacketVersion = false,
} = {}) {
  const safeModel = model && typeof model === 'object' ? model : {}
  const record = readReviewRecord(sourceContext)
  const lifecycleKey = normalizeKey(lifecycleState)
  const recordMatchesModel = Boolean(
    record?.confirmed === true &&
      record.contract === OTP_AGENT_REVIEW_UI_CONTRACT &&
      record.phase30Contract === OTP_AGENT_CONTROLLED_EDITS_CONTRACT &&
      normalizeKey(record.routeVariant) === normalizeKey(safeModel.routeVariant),
  )
  const recordHasNoBlockers = list(record?.blockerCodes).length === 0
  const reviewConfirmed = Boolean(recordMatchesModel && recordHasNoBlockers)
  const generationLocked = ['sent', 'partially_signed', 'completed', 'archived'].includes(lifecycleKey)
  const canOpenReview = Boolean(safeModel.canOpenAgentReviewModal && canGeneratePermission && !generationLocked)
  const requiresReviewBeforeGenerate = Boolean(
    canOpenReview &&
      !reviewConfirmed &&
      !hasGeneratedPacketVersion,
  )
  const canGenerate = Boolean(
    canGeneratePermission &&
      safeModel.canGenerateOtp &&
      !generationLocked &&
      (reviewConfirmed || hasGeneratedPacketVersion),
  )

  return Object.freeze({
    version: OTP_AGENT_REVIEW_UI_PHASE31_VERSION,
    contract: OTP_AGENT_REVIEW_UI_CONTRACT,
    phase30Contract: OTP_AGENT_CONTROLLED_EDITS_CONTRACT,
    routeVariant: normalizeKey(safeModel.routeVariant),
    routeLabel: normalizeText(safeModel.routeLabel),
    canOpenReview,
    reviewConfirmed,
    requiresReviewBeforeGenerate,
    canGenerate,
    generationLocked,
    reviewRecord: record,
    blockerCodes: Object.freeze([
      ...list(safeModel.blockerCodes),
      canGeneratePermission ? '' : 'missing_generate_permission',
      generationLocked ? 'document_lifecycle_locked' : '',
      requiresReviewBeforeGenerate ? 'agent_review_required_before_generation' : '',
    ].filter(Boolean)),
    summary: Object.freeze({
      sectionCount: list(safeModel.editableSections).length,
      standardConditionControlCount: list(safeModel.standardConditionControls).length,
      approvalCount: list(safeModel.approvalRows).length,
    }),
  })
}

function addCheck(checks, pass, code, detail) {
  checks.push({ code, pass: Boolean(pass), detail })
}

export function buildOtpAgentReviewUiPhase31Audit({
  checkedAt = new Date().toISOString(),
  phase30Audit = null,
  workspaceSource = '',
  packageJson = {},
} = {}) {
  const checks = []
  const readyPhase30 = !phase30Audit || phase30Audit.status === 'OTP_AGENT_CONTROLLED_EDITS_READY_FOR_UI_WIRING'
  const modelReady = phase30Audit?.sampleModels?.resaleReady || {
    canOpenAgentReviewModal: true,
    canGenerateOtp: true,
    routeVariant: 'resale_existing_property',
    routeLabel: 'Existing / resale property OTP',
    blockerCodes: [],
    warningCodes: [],
    editableSections: [{ key: 'buyer_cost_obligations' }],
    standardConditionControls: [{ key: 'bond_approval' }],
    approvalRows: [],
  }
  const unconfirmedState = buildOtpAgentReviewUiState({
    model: modelReady,
    sourceContext: {},
    lifecycleState: 'draft',
    canGeneratePermission: true,
    hasGeneratedPacketVersion: false,
  })
  const confirmedRecord = buildOtpAgentReviewRecord({
    model: modelReady,
    termsSnapshot: { purchase_price: 2850000 },
    standardConditionSelections: [{ conditionType: 'bond_approval' }],
    actorRole: 'agent',
    confirmedAt: checkedAt,
  })
  const confirmedState = buildOtpAgentReviewUiState({
    model: modelReady,
    sourceContext: { otpAgentReviewRecord: confirmedRecord },
    lifecycleState: 'draft',
    canGeneratePermission: true,
    hasGeneratedPacketVersion: false,
  })

  addCheck(
    checks,
    readyPhase30,
    'PHASE31_PHASE30_CONTROLS_READY',
    'The review UI starts from the Phase 30 controlled-edit contract.',
  )
  addCheck(
    checks,
    unconfirmedState.requiresReviewBeforeGenerate === true && unconfirmedState.canGenerate === false,
    'PHASE31_GENERATE_GATED_BY_REVIEW',
    'The OTP Generate button is gated until the agent confirms reviewed transaction terms.',
  )
  addCheck(
    checks,
    confirmedState.reviewConfirmed === true && confirmedState.canGenerate === true,
    'PHASE31_CONFIRMED_REVIEW_CAN_GENERATE',
    'A matching review record unlocks generation without raw template mutation.',
  )
  addCheck(
    checks,
    workspaceSource.includes('OtpAgentReviewPanel') &&
      workspaceSource.includes('setOtpAgentReviewOpen(true)') &&
      workspaceSource.includes('otpAgentReviewRecord'),
    'PHASE31_WORKSPACE_PANEL_WIRED',
    'The legal document workspace includes the OTP review panel, open action and persisted review record.',
  )
  addCheck(
    checks,
    workspaceSource.includes('requiresReviewBeforeGenerate') &&
      workspaceSource.includes('handleConfirmOtpAgentReview') &&
      workspaceSource.includes('otpAgentReviewRecord: otpAgentReviewUiState?.reviewRecord'),
    'PHASE31_GENERATION_PAYLOAD_WIRED',
    'Generation receives the reviewed OTP record after the review is confirmed.',
  )
  addCheck(
    checks,
    packageJson.scripts?.['test:otp-agent-review-ui-phase31'] === 'node scripts/otp-agent-review-ui-phase31.test.mjs' &&
      packageJson.scripts?.['report:otp-agent-review-ui-phase31'] === 'node scripts/report-otp-agent-review-ui-phase31.mjs',
    'PHASE31_PACKAGE_SCRIPTS_WIRED',
    'Package scripts expose the Phase 31 test and report.',
  )

  const blockers = checks.filter((check) => !check.pass)
  return Object.freeze({
    version: OTP_AGENT_REVIEW_UI_PHASE31_VERSION,
    contract: OTP_AGENT_REVIEW_UI_CONTRACT,
    checkedAt,
    status: blockers.length ? 'OTP_AGENT_REVIEW_UI_REMEDIATION_REQUIRED' : OTP_AGENT_REVIEW_UI_READY_STATUS,
    mutatedData: false,
    checks: Object.freeze(checks),
    blockers: Object.freeze(blockers),
    summary: Object.freeze({
      blockerCount: blockers.length,
      sectionCount: confirmedState.summary.sectionCount,
      standardConditionControlCount: confirmedState.summary.standardConditionControlCount,
    }),
    nextPhase: blockers.length ? null : Object.freeze({
      phase: 32,
      key: 'otp_agent_review_runtime_generation_proof',
      label: 'OTP Agent Review Runtime Generation Proof',
    }),
    evidence: Object.freeze({
      phase30Status: phase30Audit?.status || 'not_supplied',
      reviewRecordContract: confirmedRecord.contract,
      unconfirmedBlockers: unconfirmedState.blockerCodes,
      confirmedCanGenerate: confirmedState.canGenerate,
    }),
  })
}

export function formatOtpAgentReviewUiPhase31Markdown(report = buildOtpAgentReviewUiPhase31Audit()) {
  return [
    '# OTP Generator Phase 31 Agent OTP Review UI Wiring',
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
        ['Review sections', report.summary.sectionCount],
        ['Standard condition controls', report.summary.standardConditionControlCount],
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
    '## Boundary',
    '',
    'Phase 31 wires the agent review UI and generation gate. It records reviewed transaction terms only; it does not edit legal clauses, signing maps, route defaults, or production template records.',
    '',
  ].join('\n')
}
