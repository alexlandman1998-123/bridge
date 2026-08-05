import {
  OTP_END_TO_END_STAGING_WALKTHROUGH_READY_STATUS,
} from './otpEndToEndStagingWalkthroughPhase38.js'

export const OTP_PRODUCTION_RELEASE_DECISION_PHASE39_VERSION = 'otp_production_release_decision_phase39_v1'
export const OTP_PRODUCTION_RELEASE_DECISION_READY_STATUS = 'OTP_PRODUCTION_RELEASE_DECISION_READY_FOR_MANUAL_SIGNOFF'
export const OTP_PRODUCTION_RELEASE_DECISION_CONTRACT = 'otp-vnext-production-release-decision-phase39-v1'

const REQUIRED_FLAGS = Object.freeze([
  'otp_vnext_enabled',
  'otp_agent_review_required',
  'otp_signing_dispatch_guard_enabled',
  'otp_final_artifact_proof_required',
])

const REQUIRED_ROUTES = Object.freeze(['resale_existing_property', 'new_development'])

const REQUIRED_EVIDENCE_KEYS = Object.freeze([
  'phase31_agent_review_ui',
  'phase32_runtime_generation_proof',
  'phase33_signing_alignment',
  'phase34_dispatch_guard',
  'phase35_signer_session',
  'phase36_completion_guard',
  'phase37_final_artifact_proof',
  'phase38_end_to_end_staging_walkthrough',
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

function table(headers = [], rows = []) {
  const escape = (value) => normalizeText(value).replace(/\|/g, '\\|').replace(/\n/g, '<br>')
  return [
    `| ${headers.map(escape).join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map(escape).join(' | ')} |`),
  ].join('\n')
}

function defaultFlags() {
  return REQUIRED_FLAGS.map((key) => ({
    key,
    targetState: true,
    rollbackState: false,
    owner: 'release_operator',
  }))
}

function defaultRollbackPlan() {
  return [
    { key: 'disable_otp_vnext_flags', ready: true, owner: 'release_operator' },
    { key: 'restore_previous_resale_default', ready: true, owner: 'document_admin' },
    { key: 'restore_previous_new_development_default', ready: true, owner: 'document_admin' },
    { key: 'stop_signing_dispatch', ready: true, owner: 'release_operator' },
    { key: 'record_cutover_receipt_reversal', ready: true, owner: 'release_operator' },
  ]
}

function defaultTemplateDefaults() {
  return [
    {
      routeVariant: 'resale_existing_property',
      templateDefaultId: 'otp-resale-template-vnext-phase39',
      previousTemplateDefaultId: 'otp-resale-template-current',
      sourceFormat: 'native_pdf_template',
      status: 'locked',
    },
    {
      routeVariant: 'new_development',
      templateDefaultId: 'otp-new-development-template-vnext-phase39',
      previousTemplateDefaultId: 'otp-new-development-template-current',
      sourceFormat: 'native_pdf_template',
      status: 'locked',
    },
  ]
}

function defaultRouteSeparation() {
  return [
    {
      routeVariant: 'resale_existing_property',
      signerRoles: ['purchaser_1', 'seller'],
      signingEnvelopeKey: 'otp-resale-envelope-vnext',
      templateDefaultId: 'otp-resale-template-vnext-phase39',
    },
    {
      routeVariant: 'new_development',
      signerRoles: ['purchaser_1', 'developer_authorised_signatory', 'contractor_authorised_signatory', 'agent'],
      signingEnvelopeKey: 'otp-new-development-envelope-vnext',
      templateDefaultId: 'otp-new-development-template-vnext-phase39',
    },
  ]
}

function defaultEvidenceLinks() {
  return [
    { key: 'phase31_agent_review_ui', path: 'docs/otp-agent-review-ui-phase31.md' },
    { key: 'phase32_runtime_generation_proof', path: 'docs/otp-agent-review-runtime-proof-phase32.md' },
    { key: 'phase33_signing_alignment', path: 'docs/otp-agent-review-signing-alignment-phase33.md' },
    { key: 'phase34_dispatch_guard', path: 'docs/otp-agent-review-dispatch-guard-phase34.md' },
    { key: 'phase35_signer_session', path: 'docs/otp-agent-review-signer-session-phase35.md' },
    { key: 'phase36_completion_guard', path: 'docs/otp-agent-review-completion-guard-phase36.md' },
    { key: 'phase37_final_artifact_proof', path: 'docs/otp-final-signed-artifact-proof-phase37.md' },
    { key: 'phase38_end_to_end_staging_walkthrough', path: 'docs/otp-end-to-end-staging-walkthrough-phase38.md' },
  ]
}

function defaultAttorneyApprovals(status = 'pending_attorney_approval') {
  return REQUIRED_ROUTES.map((routeVariant) => ({
    routeVariant,
    approvalStatus: status,
    approvalReference: status === 'approved' ? `attorney-approval-${routeVariant}-phase39` : '',
    required: true,
    note: status === 'approved'
      ? 'Attorney approval captured for release decision.'
      : 'Attorney approval is still required before live cutover.',
  }))
}

function routeKeys(rows = []) {
  return list(rows).map((row) => normalizeKey(row.routeVariant || row.route_variant))
}

function hasDocxSource(row = {}) {
  return /\.docx?$/i.test(normalizeText(row.templateDefaultId || row.template_default_id || row.sourcePath || row.source_path)) ||
    normalizeKey(row.sourceFormat || row.source_format).includes('doc')
}

function releaseDecision({ blockerCodes = [], legalApprovalHoldCodes = [] } = {}) {
  if (blockerCodes.length) return 'no_go_remediation_required'
  if (legalApprovalHoldCodes.length) return 'conditional_go_pending_attorney_approval'
  return 'go_for_controlled_cutover'
}

export function buildOtpProductionReleaseDecisionPack({
  phase38Audit = null,
  flags = defaultFlags(),
  rollbackPlan = defaultRollbackPlan(),
  templateDefaults = defaultTemplateDefaults(),
  routeSeparation = defaultRouteSeparation(),
  evidenceLinks = defaultEvidenceLinks(),
  attorneyApprovals = defaultAttorneyApprovals(),
  operatorApprovalReference = '',
  checkedAt = new Date().toISOString(),
} = {}) {
  const flagKeys = list(flags).map((flag) => normalizeKey(flag.key))
  const templateRoutes = routeKeys(templateDefaults)
  const separatedRoutes = routeKeys(routeSeparation)
  const evidenceKeys = list(evidenceLinks).map((link) => normalizeKey(link.key))
  const routeTemplateIds = list(templateDefaults).map((row) => normalizeText(row.templateDefaultId || row.template_default_id))
  const routeEnvelopeKeys = list(routeSeparation).map((row) => normalizeText(row.signingEnvelopeKey || row.signing_envelope_key))
  const attorneyRows = list(attorneyApprovals)

  const missingFlags = REQUIRED_FLAGS.filter((key) => !flagKeys.includes(key))
  const missingTemplateRoutes = REQUIRED_ROUTES.filter((key) => !templateRoutes.includes(key))
  const missingSeparatedRoutes = REQUIRED_ROUTES.filter((key) => !separatedRoutes.includes(key))
  const missingEvidence = REQUIRED_EVIDENCE_KEYS.filter((key) => !evidenceKeys.includes(key))
  const duplicateTemplateIds = routeTemplateIds.filter((id, index) => id && routeTemplateIds.indexOf(id) !== index)
  const duplicateEnvelopeKeys = routeEnvelopeKeys.filter((id, index) => id && routeEnvelopeKeys.indexOf(id) !== index)
  const unreadyRollback = list(rollbackPlan).filter((row) => row.ready !== true)
  const docxTemplateRows = list(templateDefaults).filter(hasDocxSource)
  const incompleteAttorneyRows = attorneyRows.filter((row) => {
    if (row.required === false) return false
    return normalizeKey(row.approvalStatus || row.approval_status) !== 'approved' ||
      !normalizeText(row.approvalReference || row.approval_reference)
  })

  const phase38Ready = !phase38Audit || phase38Audit.status === OTP_END_TO_END_STAGING_WALKTHROUGH_READY_STATUS
  const blockerCodes = [
    phase38Ready ? '' : 'phase38_walkthrough_not_ready',
    ...missingFlags.map((key) => `missing_release_flag:${key}`),
    list(flags).every((flag) => flag.targetState === true && flag.rollbackState === false) ? '' : 'release_flags_missing_target_or_rollback_state',
    rollbackPlan.length >= 4 ? '' : 'rollback_plan_too_short',
    ...unreadyRollback.map((row) => `rollback_step_not_ready:${normalizeKey(row.key) || 'unknown'}`),
    ...missingTemplateRoutes.map((key) => `missing_template_default:${key}`),
    ...unique(duplicateTemplateIds).map((id) => `template_default_collision:${id}`),
    ...docxTemplateRows.map((row) => `docx_template_source_not_allowed:${normalizeKey(row.routeVariant || row.route_variant) || 'unknown'}`),
    ...missingSeparatedRoutes.map((key) => `missing_route_separation:${key}`),
    ...unique(duplicateEnvelopeKeys).map((id) => `signing_envelope_collision:${id}`),
    ...missingEvidence.map((key) => `missing_evidence_link:${key}`),
  ].filter(Boolean)
  const legalApprovalHoldCodes = incompleteAttorneyRows.map((row) =>
    `attorney_approval_required:${normalizeKey(row.routeVariant || row.route_variant) || 'unknown'}`,
  )
  const decision = releaseDecision({ blockerCodes, legalApprovalHoldCodes })

  return Object.freeze({
    version: OTP_PRODUCTION_RELEASE_DECISION_PHASE39_VERSION,
    contract: OTP_PRODUCTION_RELEASE_DECISION_CONTRACT,
    checkedAt,
    status: blockerCodes.length
      ? 'OTP_PRODUCTION_RELEASE_DECISION_REMEDIATION_REQUIRED'
      : OTP_PRODUCTION_RELEASE_DECISION_READY_STATUS,
    releaseDecision: decision,
    canCutoverProduction: decision === 'go_for_controlled_cutover' && Boolean(normalizeText(operatorApprovalReference)),
    operatorApprovalReference: normalizeText(operatorApprovalReference),
    blockerCodes: Object.freeze(unique(blockerCodes)),
    legalApprovalHoldCodes: Object.freeze(unique(legalApprovalHoldCodes)),
    flags: Object.freeze(list(flags)),
    rollbackPlan: Object.freeze(list(rollbackPlan)),
    templateDefaults: Object.freeze(list(templateDefaults)),
    routeSeparation: Object.freeze(list(routeSeparation)),
    evidenceLinks: Object.freeze(list(evidenceLinks)),
    attorneyApprovals: Object.freeze(attorneyRows),
    summary: Object.freeze({
      flagCount: list(flags).length,
      rollbackStepCount: list(rollbackPlan).length,
      templateDefaultCount: list(templateDefaults).length,
      separatedRouteCount: list(routeSeparation).length,
      evidenceLinkCount: list(evidenceLinks).length,
      legalApprovalHoldCount: legalApprovalHoldCodes.length,
      blockerCount: blockerCodes.length,
    }),
  })
}

function addCheck(checks, pass, code, detail) {
  checks.push({ code, pass: Boolean(pass), detail })
}

export function buildOtpProductionReleaseDecisionPhase39Audit({
  checkedAt = new Date().toISOString(),
  phase38Audit = null,
  packageJson = {},
} = {}) {
  const checks = []
  const approvedPack = buildOtpProductionReleaseDecisionPack({
    checkedAt,
    phase38Audit,
    attorneyApprovals: defaultAttorneyApprovals('approved'),
    operatorApprovalReference: 'release-operator-approval-phase39',
  })
  const attorneyPendingPack = buildOtpProductionReleaseDecisionPack({
    checkedAt,
    phase38Audit,
    attorneyApprovals: defaultAttorneyApprovals('pending_attorney_approval'),
    operatorApprovalReference: 'release-operator-approval-phase39',
  })
  const missingRollbackPack = buildOtpProductionReleaseDecisionPack({
    checkedAt,
    phase38Audit,
    rollbackPlan: defaultRollbackPlan().map((row) =>
      row.key === 'restore_previous_resale_default' ? { ...row, ready: false } : row,
    ),
    attorneyApprovals: defaultAttorneyApprovals('approved'),
    operatorApprovalReference: 'release-operator-approval-phase39',
  })
  const routeCollisionPack = buildOtpProductionReleaseDecisionPack({
    checkedAt,
    phase38Audit,
    templateDefaults: defaultTemplateDefaults().map((row) => ({ ...row, templateDefaultId: 'shared-template-id' })),
    attorneyApprovals: defaultAttorneyApprovals('approved'),
    operatorApprovalReference: 'release-operator-approval-phase39',
  })
  const docxSourcePack = buildOtpProductionReleaseDecisionPack({
    checkedAt,
    phase38Audit,
    templateDefaults: defaultTemplateDefaults().map((row) =>
      row.routeVariant === 'resale_existing_property' ? { ...row, sourceFormat: 'docx', sourcePath: 'old-otp.docx' } : row,
    ),
    attorneyApprovals: defaultAttorneyApprovals('approved'),
    operatorApprovalReference: 'release-operator-approval-phase39',
  })

  addCheck(
    checks,
    !phase38Audit || phase38Audit.status === OTP_END_TO_END_STAGING_WALKTHROUGH_READY_STATUS,
    'PHASE39_PHASE38_STAGING_WALKTHROUGH_READY',
    'Production release decision starts only after the Phase 38 end-to-end staging walkthrough is ready.',
  )
  addCheck(
    checks,
    approvedPack.flags.length >= REQUIRED_FLAGS.length &&
      REQUIRED_FLAGS.every((key) => approvedPack.flags.some((flag) => normalizeKey(flag.key) === key)),
    'PHASE39_RELEASE_FLAGS_DEFINED',
    'The production release pack defines all required feature flags and rollback states.',
  )
  addCheck(
    checks,
    approvedPack.rollbackPlan.length >= 4 && approvedPack.rollbackPlan.every((step) => step.ready === true),
    'PHASE39_ROLLBACK_PLAN_READY',
    'Rollback has explicit ready steps for disabling flags, restoring defaults, stopping dispatch and recording reversal.',
  )
  addCheck(
    checks,
    REQUIRED_ROUTES.every((route) => approvedPack.templateDefaults.some((row) => normalizeKey(row.routeVariant) === route)) &&
      new Set(approvedPack.templateDefaults.map((row) => row.templateDefaultId)).size === approvedPack.templateDefaults.length,
    'PHASE39_TEMPLATE_DEFAULTS_LOCKED_PER_ROUTE',
    'Resale and new-development template defaults are present and separate.',
  )
  addCheck(
    checks,
    approvedPack.templateDefaults.every((row) => !hasDocxSource(row)),
    'PHASE39_NO_DOCX_TEMPLATE_DEFAULTS',
    'Production defaults are locked to native/PDF template sources rather than retired DOC/DOCX references.',
  )
  addCheck(
    checks,
    REQUIRED_ROUTES.every((route) => approvedPack.routeSeparation.some((row) => normalizeKey(row.routeVariant) === route)) &&
      new Set(approvedPack.routeSeparation.map((row) => row.signingEnvelopeKey)).size === approvedPack.routeSeparation.length,
    'PHASE39_ROUTE_AND_ENVELOPE_SEPARATION_LOCKED',
    'Resale and new-development routes keep separate template defaults and signing envelope keys.',
  )
  addCheck(
    checks,
    REQUIRED_EVIDENCE_KEYS.every((key) => approvedPack.evidenceLinks.some((link) => normalizeKey(link.key) === key)),
    'PHASE39_EVIDENCE_LINKS_COMPLETE',
    'The release pack links the Phase 31 to Phase 38 evidence chain.',
  )
  addCheck(
    checks,
    attorneyPendingPack.releaseDecision === 'conditional_go_pending_attorney_approval' &&
      attorneyPendingPack.canCutoverProduction === false &&
      attorneyPendingPack.legalApprovalHoldCodes.length === REQUIRED_ROUTES.length,
    'PHASE39_ATTORNEY_APPROVAL_PENDING_MARKED',
    'Legal content that still needs attorney approval is clearly marked and blocks production cutover.',
  )
  addCheck(
    checks,
    approvedPack.releaseDecision === 'go_for_controlled_cutover' && approvedPack.canCutoverProduction === true,
    'PHASE39_APPROVED_PACK_CAN_CUTOVER_WITH_OPERATOR_REFERENCE',
    'A fully approved pack can move to controlled cutover only with operator approval reference present.',
  )
  addCheck(
    checks,
    missingRollbackPack.blockerCodes.includes('rollback_step_not_ready:restore_previous_resale_default'),
    'PHASE39_INCOMPLETE_ROLLBACK_BLOCKED',
    'A release pack with incomplete rollback readiness is blocked.',
  )
  addCheck(
    checks,
    routeCollisionPack.blockerCodes.includes('template_default_collision:shared-template-id'),
    'PHASE39_TEMPLATE_DEFAULT_COLLISION_BLOCKED',
    'A release pack that points both routes at one template default is blocked.',
  )
  addCheck(
    checks,
    docxSourcePack.blockerCodes.includes('docx_template_source_not_allowed:resale_existing_property'),
    'PHASE39_DOCX_SOURCE_BLOCKED',
    'A release pack that reintroduces a DOC/DOCX template source is blocked.',
  )
  addCheck(
    checks,
    packageJson.scripts?.['test:otp-production-release-decision-phase39'] === 'node scripts/otp-production-release-decision-phase39.test.mjs' &&
      packageJson.scripts?.['report:otp-production-release-decision-phase39'] === 'node scripts/report-otp-production-release-decision-phase39.mjs',
    'PHASE39_PACKAGE_SCRIPTS_WIRED',
    'Package scripts expose the Phase 39 test and report.',
  )

  const blockers = checks.filter((check) => !check.pass)
  return Object.freeze({
    version: OTP_PRODUCTION_RELEASE_DECISION_PHASE39_VERSION,
    contract: OTP_PRODUCTION_RELEASE_DECISION_CONTRACT,
    checkedAt,
    status: blockers.length ? 'OTP_PRODUCTION_RELEASE_DECISION_REMEDIATION_REQUIRED' : OTP_PRODUCTION_RELEASE_DECISION_READY_STATUS,
    mutatedData: false,
    checks: Object.freeze(checks),
    blockers: Object.freeze(blockers),
    decisionPacks: Object.freeze([approvedPack, attorneyPendingPack, missingRollbackPack, routeCollisionPack, docxSourcePack]),
    summary: Object.freeze({
      blockerCount: blockers.length,
      approvedCutoverPackCount: [approvedPack].filter((pack) => pack.canCutoverProduction).length,
      conditionalLegalHoldPackCount: [attorneyPendingPack].filter((pack) => pack.legalApprovalHoldCodes.length).length,
      blockedUnsafePackCount: [missingRollbackPack, routeCollisionPack, docxSourcePack].filter((pack) => pack.blockerCodes.length).length,
    }),
    nextPhase: blockers.length ? null : Object.freeze({
      phase: 40,
      key: 'otp_controlled_production_cutover_execution',
      label: 'Controlled Production Cutover Execution',
    }),
  })
}

export function formatOtpProductionReleaseDecisionPhase39Markdown(report = buildOtpProductionReleaseDecisionPhase39Audit()) {
  return [
    '# OTP Generator Phase 39 Production Release Decision / Cutover Checklist',
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
        ['Approved cutover packs', report.summary.approvedCutoverPackCount],
        ['Conditional legal-hold packs', report.summary.conditionalLegalHoldPackCount],
        ['Unsafe packs blocked', report.summary.blockedUnsafePackCount],
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
    '## Decision Packs',
    '',
    table(
      ['Decision', 'Can Cutover', 'Flags', 'Rollback', 'Evidence', 'Legal Holds', 'Blockers'],
      report.decisionPacks.map((pack) => [
        pack.releaseDecision,
        pack.canCutoverProduction ? 'yes' : 'no',
        pack.summary.flagCount,
        pack.summary.rollbackStepCount,
        pack.summary.evidenceLinkCount,
        pack.legalApprovalHoldCodes.join(', ') || 'none',
        pack.blockerCodes.join(', ') || 'none',
      ]),
    ),
    '',
    '## Template Defaults',
    '',
    table(
      ['Route', 'Template Default', 'Previous Default', 'Source', 'Status'],
      (report.decisionPacks[0]?.templateDefaults || []).map((row) => [
        row.routeVariant,
        row.templateDefaultId,
        row.previousTemplateDefaultId,
        row.sourceFormat,
        row.status,
      ]),
    ),
    '',
    '## Attorney Approval',
    '',
    table(
      ['Route', 'Status', 'Reference', 'Note'],
      (report.decisionPacks[1]?.attorneyApprovals || []).map((row) => [
        row.routeVariant,
        row.approvalStatus,
        row.approvalReference || 'pending',
        row.note,
      ]),
    ),
    '',
    '## Boundary',
    '',
    'Phase 39 creates the production release decision and cutover checklist. It does not execute the production cutover. If attorney approval is pending, the pack may be technically complete but must remain a conditional go and cannot cut over.',
    '',
  ].join('\n')
}
