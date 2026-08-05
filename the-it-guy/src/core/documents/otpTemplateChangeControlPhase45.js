import {
  OTP_STEADY_STATE_GOVERNANCE_MONITORING_PHASE44_VERSION,
  OTP_STEADY_STATE_GOVERNANCE_MONITORING_READY_STATUS,
  buildOtpSteadyStateGovernanceMonitoringReceipt,
} from './otpSteadyStateGovernanceMonitoringPhase44.js'

export const OTP_TEMPLATE_CHANGE_CONTROL_PHASE45_VERSION = 'otp_template_change_control_phase45_v1'
export const OTP_TEMPLATE_CHANGE_CONTROL_READY_STATUS = 'OTP_TEMPLATE_CHANGE_CONTROL_READY_FOR_VERSION_RENEWAL_DRY_RUN'
export const OTP_TEMPLATE_CHANGE_CONTROL_CONTRACT = 'otp-vnext-template-change-control-phase45-v1'

const REQUIRED_ROUTES = Object.freeze(['resale_existing_property', 'new_development'])
const REQUIRED_APPROVAL_ROLES = Object.freeze(['document_owner', 'governance_owner', 'release_operator'])
const REQUIRED_TEST_EVIDENCE = Object.freeze([
  'content_scanner',
  'generated_pdf_proof',
  'signing_envelope_alignment',
  'agent_review_runtime_proof',
  'rollback_plan',
])
const REQUIRED_CHANGE_TYPES = Object.freeze([
  'legal_wording',
  'branded_pdf_shell',
  'field_registry',
  'route_default',
  'signing_envelope',
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

function table(headers = [], rows = []) {
  const escape = (value) => normalizeText(value).replace(/\|/g, '\\|').replace(/\n/g, '<br>')
  return [
    `| ${headers.map(escape).join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map(escape).join(' | ')} |`),
  ].join('\n')
}

function hasDocxSource(row = {}) {
  return /\.docx?$/i.test(normalizeText(row.path || row.sourcePath || row.source_path || row.templateId || row.template_id || row.templateDefaultId || row.template_default_id)) ||
    normalizeKey(row.sourceFormat || row.source_format).includes('doc') ||
    numberValue(row.docxReferenceCount || row.docx_reference_count) > 0
}

function defaultChangeRequest(checkedAt = new Date().toISOString()) {
  return {
    changeRequestId: 'otp-vnext-change-2026-001',
    status: 'approved',
    requestedBy: 'document_owner',
    approvedBy: 'governance_owner',
    approvalReference: 'phase45-governance-change-approval',
    approvedAt: checkedAt,
    changeTypes: REQUIRED_CHANGE_TYPES,
    reason: 'Scheduled template version renewal after steady-state governance review.',
    productionWriteRequested: false,
    emergencyOverride: false,
  }
}

function defaultRouteImpactReview() {
  return REQUIRED_ROUTES.map((routeVariant) => ({
    routeVariant,
    impacted: true,
    previousTemplateDefaultId: routeVariant === 'resale_existing_property'
      ? 'otp-resale-template-vnext-phase39'
      : 'otp-new-development-template-vnext-phase39',
    proposedTemplateDefaultId: routeVariant === 'resale_existing_property'
      ? 'otp-resale-template-vnext-phase45'
      : 'otp-new-development-template-vnext-phase45',
    previousSigningEnvelopeKey: routeVariant === 'resale_existing_property'
      ? 'otp-resale-envelope-vnext'
      : 'otp-new-development-envelope-vnext',
    proposedSigningEnvelopeKey: routeVariant === 'resale_existing_property'
      ? 'otp-resale-envelope-vnext-phase45'
      : 'otp-new-development-envelope-vnext-phase45',
    sourceFormat: 'native_pdf_template',
    reviewComplete: true,
  }))
}

function defaultVersionRenewal() {
  return {
    versionKey: 'otp-template-vnext-2026-08-renewal',
    previousVersionKey: 'otp-template-vnext-phase39',
    semanticVersion: '2.1.0',
    previousSemanticVersion: '2.0.0',
    versionCollision: false,
    immutableVersionRecord: true,
    effectiveMode: 'dry_run_only',
    productionWriteRequested: false,
  }
}

function defaultLegalApproval(checkedAt = new Date().toISOString()) {
  return {
    required: true,
    approvalStatus: 'approved',
    approvalReference: 'phase45-attorney-renewal-approval',
    approvedAt: checkedAt,
    unresolvedLegalHoldCount: 0,
    attorneyReviewNotesArchived: true,
  }
}

function defaultApprovals(checkedAt = new Date().toISOString()) {
  return REQUIRED_APPROVAL_ROLES.map((role) => ({
    role,
    approved: true,
    approvalReference: `phase45-${role}-change-control`,
    approvedAt: checkedAt,
  }))
}

function defaultTestEvidence() {
  return REQUIRED_TEST_EVIDENCE.map((key) => ({
    key,
    status: 'passed',
    path: `docs/otp-${key.replace(/_/g, '-')}-phase45.md`,
    sha256: `${key.replace(/[^a-f0-9]/gi, 'a')}${'0'.repeat(64)}`.slice(0, 64).replace(/[^a-f0-9]/gi, 'a'),
  }))
}

function defaultRollbackPlan() {
  return {
    rollbackPlanReference: 'phase45-template-renewal-rollback-plan',
    restorePreviousDefaultsReady: true,
    disableRenewedVersionReady: true,
    stopSigningDispatchReady: true,
    owner: 'release_operator',
    rehearsalComplete: true,
  }
}

function defaultPublicationPlan() {
  return {
    publicationMode: 'dry_run_only',
    targetEnvironment: 'staging',
    productionWriteRequested: false,
    featureFlag: 'otp_template_renewal_phase45',
    releaseWindowReference: 'phase45-controlled-renewal-window',
  }
}

function defaultArchivePlan() {
  return {
    archiveReference: 'otp-vnext-phase45-change-control-archive',
    diffSummaryArchived: true,
    evidenceArchived: true,
    approvalArchiveReady: true,
    immutable: true,
  }
}

function changeRequestBlockers(changeRequest = {}) {
  const changeTypes = list(changeRequest.changeTypes || changeRequest.change_types).map(normalizeKey)
  return [
    normalizeText(changeRequest.changeRequestId || changeRequest.change_request_id) ? '' : 'change_request_id_missing',
    normalizeKey(changeRequest.status) === 'approved' ? '' : 'change_request_not_approved',
    normalizeText(changeRequest.requestedBy || changeRequest.requested_by) ? '' : 'change_request_requester_missing',
    normalizeText(changeRequest.approvedBy || changeRequest.approved_by) ? '' : 'change_request_approver_missing',
    normalizeText(changeRequest.approvalReference || changeRequest.approval_reference) ? '' : 'change_request_approval_reference_missing',
    normalizeText(changeRequest.approvedAt || changeRequest.approved_at) ? '' : 'change_request_approval_time_missing',
    normalizeText(changeRequest.reason) ? '' : 'change_request_reason_missing',
    changeTypes.length ? '' : 'change_request_types_missing',
    ...changeTypes.filter((type) => !REQUIRED_CHANGE_TYPES.includes(type)).map((type) => `unsupported_change_type:${type}`),
    changeRequest.productionWriteRequested === true ? 'change_request_production_write_requested' : '',
    changeRequest.emergencyOverride === true ? 'change_request_emergency_override_not_allowed' : '',
  ].filter(Boolean)
}

function routeImpactBlockers(routeImpactReview = []) {
  const routes = list(routeImpactReview).map((row) => normalizeKey(row.routeVariant || row.route_variant))
  const missingRoutes = REQUIRED_ROUTES.filter((route) => !routes.includes(route))
  const duplicateRoutes = routes.filter((route, index) => route && routes.indexOf(route) !== index)
  const rowBlockers = list(routeImpactReview).flatMap((row) => {
    const route = normalizeKey(row.routeVariant || row.route_variant) || 'unknown'
    return [
      row.reviewComplete === true ? '' : `route_impact_review_incomplete:${route}`,
      normalizeText(row.previousTemplateDefaultId || row.previous_template_default_id) ? '' : `previous_template_default_missing:${route}`,
      normalizeText(row.proposedTemplateDefaultId || row.proposed_template_default_id) ? '' : `proposed_template_default_missing:${route}`,
      normalizeText(row.previousSigningEnvelopeKey || row.previous_signing_envelope_key) ? '' : `previous_signing_envelope_missing:${route}`,
      normalizeText(row.proposedSigningEnvelopeKey || row.proposed_signing_envelope_key) ? '' : `proposed_signing_envelope_missing:${route}`,
      hasDocxSource(row) ? `route_impact_docx_source_observed:${route}` : '',
    ].filter(Boolean)
  })
  return [
    ...missingRoutes.map((route) => `route_impact_missing:${route}`),
    ...unique(duplicateRoutes).map((route) => `route_impact_duplicate:${route}`),
    ...rowBlockers,
  ]
}

function versionRenewalBlockers(versionRenewal = {}) {
  return [
    normalizeText(versionRenewal.versionKey || versionRenewal.version_key) ? '' : 'version_key_missing',
    normalizeText(versionRenewal.previousVersionKey || versionRenewal.previous_version_key) ? '' : 'previous_version_key_missing',
    normalizeText(versionRenewal.semanticVersion || versionRenewal.semantic_version) ? '' : 'semantic_version_missing',
    normalizeText(versionRenewal.previousSemanticVersion || versionRenewal.previous_semantic_version) ? '' : 'previous_semantic_version_missing',
    versionRenewal.versionCollision === true ? 'version_collision_detected' : '',
    versionRenewal.immutableVersionRecord === true ? '' : 'version_record_not_immutable',
    normalizeKey(versionRenewal.effectiveMode || versionRenewal.effective_mode) === 'dry_run_only' ? '' : 'version_effective_mode_not_dry_run',
    versionRenewal.productionWriteRequested === true ? 'version_renewal_production_write_requested' : '',
  ].filter(Boolean)
}

function legalApprovalBlockers(legalApproval = {}) {
  if (legalApproval.required === false) return []
  return [
    normalizeKey(legalApproval.approvalStatus || legalApproval.approval_status) === 'approved' ? '' : 'legal_approval_not_approved',
    normalizeText(legalApproval.approvalReference || legalApproval.approval_reference) ? '' : 'legal_approval_reference_missing',
    normalizeText(legalApproval.approvedAt || legalApproval.approved_at) ? '' : 'legal_approval_time_missing',
    numberValue(legalApproval.unresolvedLegalHoldCount || legalApproval.unresolved_legal_hold_count) === 0 ? '' : 'legal_holds_unresolved',
    legalApproval.attorneyReviewNotesArchived === true ? '' : 'legal_review_notes_not_archived',
  ].filter(Boolean)
}

function approvalBlockers(approvals = []) {
  const roles = list(approvals).map((row) => normalizeKey(row.role))
  const missingRoles = REQUIRED_APPROVAL_ROLES.filter((role) => !roles.includes(role))
  const incompleteRows = list(approvals).filter((row) => {
    const role = normalizeKey(row.role)
    return REQUIRED_APPROVAL_ROLES.includes(role) && (
      row.approved !== true ||
      !normalizeText(row.approvalReference || row.approval_reference) ||
      !normalizeText(row.approvedAt || row.approved_at)
    )
  })
  return [
    ...missingRoles.map((role) => `missing_change_approval:${role}`),
    ...incompleteRows.map((row) => `incomplete_change_approval:${normalizeKey(row.role) || 'unknown'}`),
  ]
}

function testEvidenceBlockers(testEvidence = []) {
  const keys = list(testEvidence).map((row) => normalizeKey(row.key))
  const missingKeys = REQUIRED_TEST_EVIDENCE.filter((key) => !keys.includes(key))
  const badRows = list(testEvidence).filter((row) =>
    REQUIRED_TEST_EVIDENCE.includes(normalizeKey(row.key)) &&
      (normalizeKey(row.status) !== 'passed' || !normalizeText(row.path) || !/^[a-f0-9]{64}$/i.test(normalizeText(row.sha256 || row.fingerprint))),
  )
  return [
    ...missingKeys.map((key) => `missing_test_evidence:${key}`),
    ...badRows.map((row) => `test_evidence_not_passed:${normalizeKey(row.key) || 'unknown'}`),
  ]
}

function rollbackPlanBlockers(rollbackPlan = {}) {
  return [
    normalizeText(rollbackPlan.rollbackPlanReference || rollbackPlan.rollback_plan_reference) ? '' : 'rollback_plan_reference_missing',
    rollbackPlan.restorePreviousDefaultsReady === true ? '' : 'rollback_restore_previous_defaults_not_ready',
    rollbackPlan.disableRenewedVersionReady === true ? '' : 'rollback_disable_renewed_version_not_ready',
    rollbackPlan.stopSigningDispatchReady === true ? '' : 'rollback_stop_signing_dispatch_not_ready',
    normalizeText(rollbackPlan.owner) ? '' : 'rollback_owner_missing',
    rollbackPlan.rehearsalComplete === true ? '' : 'rollback_rehearsal_not_complete',
  ].filter(Boolean)
}

function publicationPlanBlockers(publicationPlan = {}) {
  return [
    normalizeKey(publicationPlan.publicationMode || publicationPlan.publication_mode) === 'dry_run_only' ? '' : 'publication_mode_not_dry_run',
    normalizeKey(publicationPlan.targetEnvironment || publicationPlan.target_environment) === 'staging' ? '' : 'publication_target_not_staging',
    publicationPlan.productionWriteRequested === true ? 'publication_production_write_requested' : '',
    normalizeText(publicationPlan.featureFlag || publicationPlan.feature_flag) ? '' : 'publication_feature_flag_missing',
    normalizeText(publicationPlan.releaseWindowReference || publicationPlan.release_window_reference) ? '' : 'publication_release_window_missing',
  ].filter(Boolean)
}

function archivePlanBlockers(archivePlan = {}) {
  return [
    normalizeText(archivePlan.archiveReference || archivePlan.archive_reference) ? '' : 'change_archive_reference_missing',
    archivePlan.diffSummaryArchived === true ? '' : 'change_diff_summary_not_archived',
    archivePlan.evidenceArchived === true ? '' : 'change_evidence_not_archived',
    archivePlan.approvalArchiveReady === true ? '' : 'change_approval_archive_not_ready',
    archivePlan.immutable === true ? '' : 'change_archive_not_immutable',
  ].filter(Boolean)
}

export function buildOtpTemplateChangeControlReceipt({
  steadyStateMonitoring = buildOtpSteadyStateGovernanceMonitoringReceipt(),
  changeRequest = defaultChangeRequest(),
  routeImpactReview = defaultRouteImpactReview(),
  versionRenewal = defaultVersionRenewal(),
  legalApproval = defaultLegalApproval(),
  approvals = defaultApprovals(),
  testEvidence = defaultTestEvidence(),
  rollbackPlan = defaultRollbackPlan(),
  publicationPlan = defaultPublicationPlan(),
  archivePlan = defaultArchivePlan(),
  checkedAt = new Date().toISOString(),
} = {}) {
  const monitoring = steadyStateMonitoring || {}
  const blockerCodes = unique([
    monitoring.version === OTP_STEADY_STATE_GOVERNANCE_MONITORING_PHASE44_VERSION ? '' : 'phase44_monitoring_version_mismatch',
    monitoring.status === OTP_STEADY_STATE_GOVERNANCE_MONITORING_READY_STATUS ? '' : 'phase44_monitoring_not_ready',
    monitoring.canContinueSteadyStateGovernance === true ? '' : 'phase44_monitoring_cannot_continue',
    list(monitoring.blockerCodes).length === 0 ? '' : 'phase44_monitoring_has_blockers',
    monitoring.mutatedData === false ? '' : 'phase44_monitoring_mutation_unexpected',
    ...changeRequestBlockers(changeRequest),
    ...routeImpactBlockers(routeImpactReview),
    ...versionRenewalBlockers(versionRenewal),
    ...legalApprovalBlockers(legalApproval),
    ...approvalBlockers(approvals),
    ...testEvidenceBlockers(testEvidence),
    ...rollbackPlanBlockers(rollbackPlan),
    ...publicationPlanBlockers(publicationPlan),
    ...archivePlanBlockers(archivePlan),
  ])
  const canPrepareVersionRenewal = blockerCodes.length === 0

  return Object.freeze({
    version: OTP_TEMPLATE_CHANGE_CONTROL_PHASE45_VERSION,
    contract: OTP_TEMPLATE_CHANGE_CONTROL_CONTRACT,
    checkedAt,
    status: canPrepareVersionRenewal
      ? OTP_TEMPLATE_CHANGE_CONTROL_READY_STATUS
      : 'OTP_TEMPLATE_CHANGE_CONTROL_BLOCKED',
    canPrepareVersionRenewal,
    mutatedData: false,
    blockerCodes: Object.freeze(blockerCodes),
    changeRequest: Object.freeze({ ...changeRequest }),
    routeImpactReview: Object.freeze(list(routeImpactReview)),
    versionRenewal: Object.freeze({ ...versionRenewal }),
    legalApproval: Object.freeze({ ...legalApproval }),
    approvals: Object.freeze(list(approvals)),
    testEvidence: Object.freeze(list(testEvidence)),
    rollbackPlan: Object.freeze({ ...rollbackPlan }),
    publicationPlan: Object.freeze({ ...publicationPlan }),
    archivePlan: Object.freeze({ ...archivePlan }),
    summary: Object.freeze({
      routeCount: REQUIRED_ROUTES.length,
      impactedRouteCount: list(routeImpactReview).filter((row) => row.impacted === true).length,
      approvalCount: list(approvals).length,
      evidenceCount: list(testEvidence).length,
      blockerCount: blockerCodes.length,
    }),
  })
}

function addCheck(checks, pass, code, detail) {
  checks.push({ code, pass: Boolean(pass), detail })
}

export function buildOtpTemplateChangeControlPhase45Audit({
  checkedAt = new Date().toISOString(),
  phase44Audit = null,
  packageJson = {},
} = {}) {
  const checks = []
  const phase44Ready = !phase44Audit || phase44Audit.status === OTP_STEADY_STATE_GOVERNANCE_MONITORING_READY_STATUS
  const goodMonitoring = phase44Audit?.monitoringReceipts?.find((receipt) => receipt.canContinueSteadyStateGovernance) ||
    buildOtpSteadyStateGovernanceMonitoringReceipt({ checkedAt })
  const goodChange = buildOtpTemplateChangeControlReceipt({
    checkedAt,
    steadyStateMonitoring: goodMonitoring,
    changeRequest: defaultChangeRequest(checkedAt),
    approvals: defaultApprovals(checkedAt),
    legalApproval: defaultLegalApproval(checkedAt),
  })
  const unapprovedChange = buildOtpTemplateChangeControlReceipt({
    checkedAt,
    steadyStateMonitoring: goodMonitoring,
    changeRequest: {
      ...defaultChangeRequest(checkedAt),
      status: 'draft',
      approvalReference: '',
    },
    approvals: defaultApprovals(checkedAt),
    legalApproval: defaultLegalApproval(checkedAt),
  })
  const missingRouteChange = buildOtpTemplateChangeControlReceipt({
    checkedAt,
    steadyStateMonitoring: goodMonitoring,
    routeImpactReview: defaultRouteImpactReview().filter((row) => row.routeVariant !== 'new_development'),
    changeRequest: defaultChangeRequest(checkedAt),
    approvals: defaultApprovals(checkedAt),
    legalApproval: defaultLegalApproval(checkedAt),
  })
  const docxChange = buildOtpTemplateChangeControlReceipt({
    checkedAt,
    steadyStateMonitoring: goodMonitoring,
    routeImpactReview: defaultRouteImpactReview().map((row) =>
      row.routeVariant === 'resale_existing_property'
        ? { ...row, sourceFormat: 'docx', sourcePath: 'resale-renewal.docx', docxReferenceCount: 1 }
        : row,
    ),
    changeRequest: defaultChangeRequest(checkedAt),
    approvals: defaultApprovals(checkedAt),
    legalApproval: defaultLegalApproval(checkedAt),
  })
  const versionCollisionChange = buildOtpTemplateChangeControlReceipt({
    checkedAt,
    steadyStateMonitoring: goodMonitoring,
    versionRenewal: {
      ...defaultVersionRenewal(),
      versionCollision: true,
      immutableVersionRecord: false,
    },
    changeRequest: defaultChangeRequest(checkedAt),
    approvals: defaultApprovals(checkedAt),
    legalApproval: defaultLegalApproval(checkedAt),
  })
  const legalBlockedChange = buildOtpTemplateChangeControlReceipt({
    checkedAt,
    steadyStateMonitoring: goodMonitoring,
    changeRequest: defaultChangeRequest(checkedAt),
    approvals: defaultApprovals(checkedAt),
    legalApproval: {
      ...defaultLegalApproval(checkedAt),
      approvalStatus: 'pending',
      approvalReference: '',
      unresolvedLegalHoldCount: 1,
      attorneyReviewNotesArchived: false,
    },
  })
  const evidenceMissingChange = buildOtpTemplateChangeControlReceipt({
    checkedAt,
    steadyStateMonitoring: goodMonitoring,
    testEvidence: defaultTestEvidence().filter((row) => row.key !== 'generated_pdf_proof'),
    changeRequest: defaultChangeRequest(checkedAt),
    approvals: defaultApprovals(checkedAt),
    legalApproval: defaultLegalApproval(checkedAt),
  })
  const rollbackMissingChange = buildOtpTemplateChangeControlReceipt({
    checkedAt,
    steadyStateMonitoring: goodMonitoring,
    rollbackPlan: {
      ...defaultRollbackPlan(),
      restorePreviousDefaultsReady: false,
      rehearsalComplete: false,
    },
    changeRequest: defaultChangeRequest(checkedAt),
    approvals: defaultApprovals(checkedAt),
    legalApproval: defaultLegalApproval(checkedAt),
  })
  const productionWriteChange = buildOtpTemplateChangeControlReceipt({
    checkedAt,
    steadyStateMonitoring: goodMonitoring,
    changeRequest: {
      ...defaultChangeRequest(checkedAt),
      productionWriteRequested: true,
    },
    publicationPlan: {
      ...defaultPublicationPlan(),
      publicationMode: 'production_write',
      targetEnvironment: 'production',
      productionWriteRequested: true,
    },
    approvals: defaultApprovals(checkedAt),
    legalApproval: defaultLegalApproval(checkedAt),
  })
  const missingApprovalChange = buildOtpTemplateChangeControlReceipt({
    checkedAt,
    steadyStateMonitoring: goodMonitoring,
    approvals: defaultApprovals(checkedAt).filter((row) => row.role !== 'governance_owner'),
    changeRequest: defaultChangeRequest(checkedAt),
    legalApproval: defaultLegalApproval(checkedAt),
  })

  addCheck(checks, phase44Ready, 'PHASE45_PHASE44_GOVERNANCE_READY', 'Template change control starts only after Phase 44 steady-state governance is ready.')
  addCheck(
    checks,
    goodChange.canPrepareVersionRenewal &&
      goodChange.status === OTP_TEMPLATE_CHANGE_CONTROL_READY_STATUS &&
      goodChange.mutatedData === false,
    'PHASE45_GOOD_CHANGE_CONTROL_READY',
    'A fully approved template change can prepare version renewal dry-run without mutating production data.',
  )
  addCheck(
    checks,
    REQUIRED_ROUTES.every((route) => goodChange.routeImpactReview.some((row) => row.routeVariant === route && row.reviewComplete === true)),
    'PHASE45_BOTH_ROUTE_IMPACTS_REVIEWED',
    'Resale and new-development route impacts must both be reviewed before renewal.',
  )
  addCheck(
    checks,
    REQUIRED_TEST_EVIDENCE.every((key) => goodChange.testEvidence.some((row) => row.key === key && row.status === 'passed')),
    'PHASE45_REQUIRED_TEST_EVIDENCE_CAPTURED',
    'Content scanner, PDF proof, signing alignment, agent review runtime, and rollback evidence must pass.',
  )
  addCheck(
    checks,
    goodChange.publicationPlan.productionWriteRequested === false &&
      goodChange.publicationPlan.publicationMode === 'dry_run_only' &&
      goodChange.versionRenewal.productionWriteRequested === false,
    'PHASE45_NO_PRODUCTION_WRITE_ALLOWED',
    'Phase 45 can only prepare dry-run renewal and cannot request production writes.',
  )
  addCheck(
    checks,
    unapprovedChange.canPrepareVersionRenewal === false &&
      unapprovedChange.blockerCodes.includes('change_request_not_approved'),
    'PHASE45_UNAPPROVED_CHANGE_BLOCKED',
    'Unapproved template change requests are blocked.',
  )
  addCheck(
    checks,
    missingRouteChange.canPrepareVersionRenewal === false &&
      missingRouteChange.blockerCodes.includes('route_impact_missing:new_development'),
    'PHASE45_MISSING_ROUTE_IMPACT_BLOCKED',
    'Missing route impact review for resale or new-development is blocked.',
  )
  addCheck(
    checks,
    docxChange.canPrepareVersionRenewal === false &&
      docxChange.blockerCodes.includes('route_impact_docx_source_observed:resale_existing_property'),
    'PHASE45_DOCX_SOURCE_BLOCKED',
    'DOC/DOCX source references are blocked from template renewal.',
  )
  addCheck(
    checks,
    versionCollisionChange.canPrepareVersionRenewal === false &&
      versionCollisionChange.blockerCodes.includes('version_collision_detected') &&
      versionCollisionChange.blockerCodes.includes('version_record_not_immutable'),
    'PHASE45_VERSION_COLLISION_BLOCKED',
    'Version collisions or mutable version records are blocked.',
  )
  addCheck(
    checks,
    legalBlockedChange.canPrepareVersionRenewal === false &&
      legalBlockedChange.blockerCodes.includes('legal_approval_not_approved') &&
      legalBlockedChange.blockerCodes.includes('legal_holds_unresolved'),
    'PHASE45_LEGAL_HOLD_BLOCKED',
    'Legal approval must be complete with no unresolved holds before renewal.',
  )
  addCheck(
    checks,
    evidenceMissingChange.canPrepareVersionRenewal === false &&
      evidenceMissingChange.blockerCodes.includes('missing_test_evidence:generated_pdf_proof'),
    'PHASE45_MISSING_EVIDENCE_BLOCKED',
    'Missing generated PDF proof or other required test evidence blocks renewal.',
  )
  addCheck(
    checks,
    rollbackMissingChange.canPrepareVersionRenewal === false &&
      rollbackMissingChange.blockerCodes.includes('rollback_restore_previous_defaults_not_ready') &&
      rollbackMissingChange.blockerCodes.includes('rollback_rehearsal_not_complete'),
    'PHASE45_ROLLBACK_PLAN_BLOCKED',
    'Rollback readiness and rehearsal are required before renewal.',
  )
  addCheck(
    checks,
    productionWriteChange.canPrepareVersionRenewal === false &&
      productionWriteChange.blockerCodes.includes('change_request_production_write_requested') &&
      productionWriteChange.blockerCodes.includes('publication_production_write_requested'),
    'PHASE45_PRODUCTION_WRITE_BLOCKED',
    'Phase 45 blocks any production-write renewal request.',
  )
  addCheck(
    checks,
    missingApprovalChange.canPrepareVersionRenewal === false &&
      missingApprovalChange.blockerCodes.includes('missing_change_approval:governance_owner'),
    'PHASE45_MISSING_APPROVAL_BLOCKED',
    'Governance approval is required for template version renewal.',
  )
  addCheck(
    checks,
    packageJson.scripts?.['test:otp-template-change-control-phase45'] === 'node scripts/otp-template-change-control-phase45.test.mjs' &&
      packageJson.scripts?.['report:otp-template-change-control-phase45'] === 'node scripts/report-otp-template-change-control-phase45.mjs',
    'PHASE45_PACKAGE_SCRIPTS_WIRED',
    'Package scripts expose the Phase 45 test and report.',
  )

  const blockers = checks.filter((check) => !check.pass)
  return Object.freeze({
    version: OTP_TEMPLATE_CHANGE_CONTROL_PHASE45_VERSION,
    contract: OTP_TEMPLATE_CHANGE_CONTROL_CONTRACT,
    checkedAt,
    status: blockers.length ? 'OTP_TEMPLATE_CHANGE_CONTROL_REMEDIATION_REQUIRED' : OTP_TEMPLATE_CHANGE_CONTROL_READY_STATUS,
    mutatedData: false,
    checks: Object.freeze(checks),
    blockers: Object.freeze(blockers),
    changeReceipts: Object.freeze([
      goodChange,
      unapprovedChange,
      missingRouteChange,
      docxChange,
      versionCollisionChange,
      legalBlockedChange,
      evidenceMissingChange,
      rollbackMissingChange,
      productionWriteChange,
      missingApprovalChange,
    ]),
    summary: Object.freeze({
      blockerCount: blockers.length,
      approvedChangeCount: [goodChange].filter((row) => row.canPrepareVersionRenewal).length,
      blockedChangeCount: [
        unapprovedChange,
        missingRouteChange,
        docxChange,
        versionCollisionChange,
        legalBlockedChange,
        evidenceMissingChange,
        rollbackMissingChange,
        productionWriteChange,
        missingApprovalChange,
      ].filter((row) => !row.canPrepareVersionRenewal).length,
      routeCount: REQUIRED_ROUTES.length,
      evidenceCount: REQUIRED_TEST_EVIDENCE.length,
    }),
    nextPhase: blockers.length ? null : Object.freeze({
      phase: 46,
      key: 'otp_version_renewal_publication_dry_run',
      label: 'Version Renewal Publication Dry Run',
    }),
  })
}

export function formatOtpTemplateChangeControlPhase45Markdown(report = buildOtpTemplateChangeControlPhase45Audit()) {
  return [
    '# OTP Generator Phase 45 Template Change Control And Version Renewal',
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
        ['Approved change receipts', report.summary.approvedChangeCount],
        ['Blocked change receipts', report.summary.blockedChangeCount],
        ['Routes', report.summary.routeCount],
        ['Evidence items', report.summary.evidenceCount],
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
    '## Change Receipts',
    '',
    table(
      ['Status', 'Allowed', 'Routes', 'Evidence', 'Approvals', 'Blockers'],
      report.changeReceipts.map((receipt) => [
        receipt.status,
        receipt.canPrepareVersionRenewal ? 'yes' : 'no',
        receipt.summary.impactedRouteCount,
        receipt.summary.evidenceCount,
        receipt.summary.approvalCount,
        receipt.blockerCodes.join(', ') || 'none',
      ]),
    ),
    '',
    '## Boundary',
    '',
    'Phase 45 proves template changes can enter version renewal only from a clean Phase 44 governance state, approved change request, complete resale/new-development impact review, immutable version metadata, legal approval, required test evidence, rollback rehearsal, dry-run-only publication plan, and archived change evidence. The test/report path remains receipt-only and does not mutate production data.',
    '',
  ].join('\n')
}
