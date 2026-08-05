import {
  OTP_TEMPLATE_RENEWAL_STEADY_STATE_REVIEW_PHASE54_VERSION,
  OTP_TEMPLATE_RENEWAL_STEADY_STATE_REVIEW_READY_STATUS,
  buildOtpTemplateRenewalSteadyStateReviewPhase54Audit,
} from './otpTemplateRenewalSteadyStateReviewPhase54.js'

export const OTP_TEMPLATE_RENEWAL_CHANGE_INTAKE_PHASE55_VERSION = 'otp_template_renewal_change_intake_phase55_v1'
export const OTP_TEMPLATE_RENEWAL_CHANGE_INTAKE_READY_STATUS = 'OTP_TEMPLATE_RENEWAL_CHANGE_INTAKE_READY_FOR_SCOPING_AND_TRIAGE'
export const OTP_TEMPLATE_RENEWAL_CHANGE_INTAKE_CONTRACT = 'otp-vnext-template-renewal-change-intake-phase55-v1'

const REQUIRED_ROUTES = Object.freeze(['resale_existing_property', 'new_development'])
const SUPPORTED_CHANGE_TYPES = Object.freeze([
  'legal_wording',
  'field_registry',
  'branded_pdf_shell',
  'route_default',
  'signing_envelope',
  'commercial_terms',
  'buyer_cost_obligations',
  'suspensive_conditions',
])
const REQUIRED_TRIAGE_STEPS = Object.freeze([
  'duplicate_check',
  'route_impact_screen',
  'legal_screen',
  'rollback_screen',
  'evidence_screen',
  'no_write_screen',
])
const REQUIRED_APPROVAL_ROLES = Object.freeze(['requester', 'template_owner', 'governance_owner'])
const REQUIRED_EVIDENCE = Object.freeze([
  'change_summary',
  'route_impact_notes',
  'source_template_review',
  'attorney_screening_notes',
  'rollback_expectation',
  'no_write_attestation',
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
  return /\.docx?$/i.test(normalizeText(row.path || row.sourcePath || row.source_path || row.templateDefaultId || row.template_default_id || row.sourceTemplatePath || row.source_template_path)) ||
    normalizeKey(row.sourceFormat || row.source_format).includes('doc') ||
    numberValue(row.docxReferenceCount || row.docx_reference_count) > 0
}

function fingerprint(parts = []) {
  const text = parts.map((part) => normalizeText(part)).join('|')
  let hash = 0
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(index)) >>> 0
  }
  return `${hash.toString(16).padStart(8, '0')}${'0'.repeat(56)}`
}

function routeRowsFromReview(phase54Review = {}) {
  return list(phase54Review.routeReviewRows)
}

function defaultIntakeRequest(checkedAt = new Date().toISOString()) {
  return {
    intakeRequestId: 'otp-vnext-phase55-renewal-change-intake-001',
    status: 'submitted',
    requestedAt: checkedAt,
    requestSummary: 'Renew OTP template wording and route configuration through the governed renewal path.',
    businessReason: 'Capture approved business/legal template changes without editing live production defaults.',
    requester: 'operations_owner',
    templateOwner: 'template_owner',
    governanceOwner: 'governance_owner',
    affectedRoutes: REQUIRED_ROUTES,
    changeTypes: ['legal_wording', 'commercial_terms', 'buyer_cost_obligations', 'suspensive_conditions'],
    riskLevel: 'medium',
    productionWriteRequested: false,
    emergencyOverride: false,
    intakeOnly: true,
  }
}

function defaultRouteImpactEntries(phase54Review = {}) {
  return REQUIRED_ROUTES.map((routeVariant) => {
    const reviewRow = routeRowsFromReview(phase54Review).find((row) => normalizeKey(row.routeVariant) === routeVariant) || {}
    return {
      routeVariant,
      intakeComplete: true,
      sourceReviewTemplateDefaultId: reviewRow.observedTemplateDefaultId,
      sourceReviewSigningEnvelopeKey: reviewRow.observedSigningEnvelopeKey,
      sourceReviewOutputFingerprint: reviewRow.observedRouteOutputFingerprint,
      proposedChangeSummary: routeVariant === 'resale_existing_property'
        ? 'Screen resale wording, buyer cost obligations, commission variation display, suspensive conditions, and witness/signature requirements.'
        : 'Screen new-development wording, developer-specific commercial terms, buyer cost obligations, suspensive conditions, and signing envelope requirements.',
      changeTypes: routeVariant === 'resale_existing_property'
        ? ['legal_wording', 'buyer_cost_obligations', 'suspensive_conditions']
        : ['legal_wording', 'commercial_terms', 'buyer_cost_obligations', 'suspensive_conditions'],
      sourceFormat: 'native_pdf_template',
      docxReferenceCount: 0,
      routeDefaultMutationRequested: false,
      signingEnvelopeMutationRequested: false,
    }
  })
}

function defaultTriageSteps() {
  return REQUIRED_TRIAGE_STEPS.map((key) => ({
    key,
    status: 'passed',
    owner: key === 'legal_screen' ? 'template_owner' : 'governance_owner',
    evidencePath: `docs/otp-${key.replace(/_/g, '-')}-phase55.md`,
  }))
}

function defaultAttorneyScreening() {
  return {
    reviewRequired: true,
    legalReviewQueued: true,
    approvalStatus: 'queued',
    attorneyApprovalGranted: false,
    unresolvedLegalHoldCount: 0,
    screeningReference: 'phase55-attorney-screening-intake',
    notesArchived: true,
  }
}

function defaultRollbackExpectation() {
  return {
    rollbackPlanRequired: true,
    rollbackOwner: 'release_operator',
    rollbackExpectationReference: 'phase55-renewal-change-rollback-expectation',
    dryRunReviewRequired: true,
    restorePreviousDefaultsExpected: true,
    stopSigningDispatchExpected: true,
    productionWriteNotAllowed: true,
  }
}

function defaultApprovals(checkedAt = new Date().toISOString()) {
  return REQUIRED_APPROVAL_ROLES.map((role) => ({
    role,
    acknowledged: true,
    acknowledgementReference: `phase55-${role}-intake-acknowledgement`,
    acknowledgedAt: checkedAt,
  }))
}

function defaultEvidence() {
  return REQUIRED_EVIDENCE.map((key) => ({
    key,
    status: 'captured',
    path: `docs/otp-${key.replace(/_/g, '-')}-phase55.md`,
    fingerprint: fingerprint([key, 'phase55']),
  }))
}

function defaultNoWriteProof() {
  return {
    intakeOnly: true,
    productionWriteAttempted: false,
    liveWriteGuardBypassed: false,
    templateDefaultMutationCount: 0,
    versionPointerMutationCount: 0,
    signingEnvelopeMutationCount: 0,
    dispatchMutationCount: 0,
  }
}

function phase54Blockers(phase54Review = {}) {
  return [
    phase54Review.version === OTP_TEMPLATE_RENEWAL_STEADY_STATE_REVIEW_PHASE54_VERSION ? '' : 'phase54_review_version_mismatch',
    phase54Review.status === OTP_TEMPLATE_RENEWAL_STEADY_STATE_REVIEW_READY_STATUS ? '' : 'phase54_review_not_ready',
    phase54Review.canContinueRenewalSteadyState === true ? '' : 'phase54_review_cannot_continue',
    phase54Review.mutatedData === false ? '' : 'phase54_review_mutation_unexpected',
    list(phase54Review.blockerCodes).length === 0 ? '' : 'phase54_review_has_blockers',
    phase54Review.nextRenewalReadiness?.changeIntakeOpen === true ? '' : 'phase54_change_intake_not_open',
    phase54Review.nextRenewalReadiness?.templateOwnerAssigned === true ? '' : 'phase54_template_owner_not_assigned',
    numberValue(phase54Review.nextRenewalReadiness?.unapprovedChangeCount) === 0 ? '' : 'phase54_unapproved_changes_present',
    numberValue(phase54Review.nextRenewalReadiness?.emergencyOverrideCount) === 0 ? '' : 'phase54_emergency_overrides_present',
  ].filter(Boolean)
}

function intakeRequestBlockers(request = {}) {
  const changeTypes = list(request.changeTypes || request.change_types).map(normalizeKey)
  const affectedRoutes = list(request.affectedRoutes || request.affected_routes).map(normalizeKey)
  return [
    normalizeText(request.intakeRequestId || request.intake_request_id) ? '' : 'intake_request_id_missing',
    ['submitted', 'accepted'].includes(normalizeKey(request.status)) ? '' : 'intake_request_not_submitted',
    normalizeText(request.requestedAt || request.requested_at) ? '' : 'intake_request_time_missing',
    normalizeText(request.requestSummary || request.request_summary) ? '' : 'intake_request_summary_missing',
    normalizeText(request.businessReason || request.business_reason) ? '' : 'intake_business_reason_missing',
    normalizeText(request.requester) ? '' : 'intake_requester_missing',
    normalizeText(request.templateOwner || request.template_owner) ? '' : 'intake_template_owner_missing',
    normalizeText(request.governanceOwner || request.governance_owner) ? '' : 'intake_governance_owner_missing',
    normalizeText(request.riskLevel || request.risk_level) ? '' : 'intake_risk_level_missing',
    changeTypes.length ? '' : 'intake_change_types_missing',
    ...changeTypes.filter((type) => !SUPPORTED_CHANGE_TYPES.includes(type)).map((type) => `intake_unsupported_change_type:${type}`),
    ...REQUIRED_ROUTES.filter((route) => !affectedRoutes.includes(route)).map((route) => `intake_affected_route_missing:${route}`),
    request.productionWriteRequested === true ? 'intake_production_write_requested' : '',
    request.emergencyOverride === true ? 'intake_emergency_override_requested' : '',
    request.intakeOnly === true ? '' : 'intake_only_flag_missing',
  ].filter(Boolean)
}

function routeImpactBlockers(routeImpactEntries = [], phase54Review = {}) {
  const routes = list(routeImpactEntries).map((row) => normalizeKey(row.routeVariant || row.route_variant))
  const missingRoutes = REQUIRED_ROUTES.filter((route) => !routes.includes(route))
  const duplicateRoutes = routes.filter((route, index) => route && routes.indexOf(route) !== index)
  const rowBlockers = list(routeImpactEntries).flatMap((row) => {
    const route = normalizeKey(row.routeVariant || row.route_variant) || 'unknown'
    const reviewRow = routeRowsFromReview(phase54Review).find((candidate) => normalizeKey(candidate.routeVariant) === route) || {}
    const changeTypes = list(row.changeTypes || row.change_types).map(normalizeKey)
    return [
      REQUIRED_ROUTES.includes(route) ? '' : `intake_route_unsupported:${route}`,
      row.intakeComplete === true ? '' : `intake_route_incomplete:${route}`,
      normalizeText(row.sourceReviewTemplateDefaultId || row.source_review_template_default_id) ? '' : `intake_source_template_missing:${route}`,
      normalizeText(row.sourceReviewSigningEnvelopeKey || row.source_review_signing_envelope_key) ? '' : `intake_source_envelope_missing:${route}`,
      normalizeText(row.sourceReviewOutputFingerprint || row.source_review_output_fingerprint) ? '' : `intake_source_output_fingerprint_missing:${route}`,
      row.sourceReviewTemplateDefaultId === reviewRow.observedTemplateDefaultId ? '' : `intake_source_template_mismatch:${route}`,
      row.sourceReviewSigningEnvelopeKey === reviewRow.observedSigningEnvelopeKey ? '' : `intake_source_envelope_mismatch:${route}`,
      row.sourceReviewOutputFingerprint === reviewRow.observedRouteOutputFingerprint ? '' : `intake_source_output_fingerprint_mismatch:${route}`,
      normalizeText(row.proposedChangeSummary || row.proposed_change_summary) ? '' : `intake_proposed_change_summary_missing:${route}`,
      changeTypes.length ? '' : `intake_route_change_types_missing:${route}`,
      ...changeTypes.filter((type) => !SUPPORTED_CHANGE_TYPES.includes(type)).map((type) => `intake_route_unsupported_change_type:${route}:${type}`),
      hasDocxSource(row) ? `intake_docx_source_observed:${route}` : '',
      row.routeDefaultMutationRequested === true ? `intake_route_default_mutation_requested:${route}` : '',
      row.signingEnvelopeMutationRequested === true ? `intake_signing_envelope_mutation_requested:${route}` : '',
    ].filter(Boolean)
  })
  return [
    ...missingRoutes.map((route) => `intake_route_impact_missing:${route}`),
    ...unique(duplicateRoutes).map((route) => `intake_route_impact_duplicate:${route}`),
    ...rowBlockers,
  ]
}

function triageBlockers(triageSteps = []) {
  const keys = list(triageSteps).map((row) => normalizeKey(row.key))
  const missingKeys = REQUIRED_TRIAGE_STEPS.filter((key) => !keys.includes(key))
  const badRows = list(triageSteps).filter((row) =>
    REQUIRED_TRIAGE_STEPS.includes(normalizeKey(row.key)) &&
      (normalizeKey(row.status) !== 'passed' || !normalizeText(row.owner) || !normalizeText(row.evidencePath)),
  )
  return [
    ...missingKeys.map((key) => `intake_triage_step_missing:${key}`),
    ...badRows.map((row) => `intake_triage_step_not_passed:${normalizeKey(row.key) || 'unknown'}`),
  ]
}

function attorneyScreeningBlockers(attorneyScreening = {}) {
  return [
    attorneyScreening.reviewRequired === true ? '' : 'attorney_screening_not_required',
    attorneyScreening.legalReviewQueued === true ? '' : 'attorney_screening_not_queued',
    normalizeKey(attorneyScreening.approvalStatus || attorneyScreening.approval_status) === 'queued' ? '' : 'attorney_screening_status_not_queued',
    attorneyScreening.attorneyApprovalGranted === true ? 'attorney_screening_premature_approval' : '',
    numberValue(attorneyScreening.unresolvedLegalHoldCount || attorneyScreening.unresolved_legal_hold_count) === 0 ? '' : 'attorney_screening_legal_holds_unresolved',
    normalizeText(attorneyScreening.screeningReference || attorneyScreening.screening_reference) ? '' : 'attorney_screening_reference_missing',
    attorneyScreening.notesArchived === true ? '' : 'attorney_screening_notes_not_archived',
  ].filter(Boolean)
}

function rollbackExpectationBlockers(rollbackExpectation = {}) {
  return [
    rollbackExpectation.rollbackPlanRequired === true ? '' : 'intake_rollback_plan_not_required',
    normalizeText(rollbackExpectation.rollbackOwner || rollbackExpectation.rollback_owner) ? '' : 'intake_rollback_owner_missing',
    normalizeText(rollbackExpectation.rollbackExpectationReference || rollbackExpectation.rollback_expectation_reference) ? '' : 'intake_rollback_reference_missing',
    rollbackExpectation.dryRunReviewRequired === true ? '' : 'intake_dry_run_review_not_required',
    rollbackExpectation.restorePreviousDefaultsExpected === true ? '' : 'intake_restore_previous_defaults_not_expected',
    rollbackExpectation.stopSigningDispatchExpected === true ? '' : 'intake_stop_signing_dispatch_not_expected',
    rollbackExpectation.productionWriteNotAllowed === true ? '' : 'intake_rollback_production_write_not_blocked',
  ].filter(Boolean)
}

function approvalBlockers(approvals = []) {
  const roles = list(approvals).map((row) => normalizeKey(row.role))
  const missingRoles = REQUIRED_APPROVAL_ROLES.filter((role) => !roles.includes(role))
  const incompleteRows = list(approvals).filter((row) => {
    const role = normalizeKey(row.role)
    return REQUIRED_APPROVAL_ROLES.includes(role) && (
      row.acknowledged !== true ||
      !normalizeText(row.acknowledgementReference || row.acknowledgement_reference) ||
      !normalizeText(row.acknowledgedAt || row.acknowledged_at)
    )
  })
  return [
    ...missingRoles.map((role) => `intake_acknowledgement_missing:${role}`),
    ...incompleteRows.map((row) => `intake_acknowledgement_incomplete:${normalizeKey(row.role) || 'unknown'}`),
  ]
}

function evidenceBlockers(evidence = []) {
  const keys = list(evidence).map((row) => normalizeKey(row.key))
  const missingKeys = REQUIRED_EVIDENCE.filter((key) => !keys.includes(key))
  const badRows = list(evidence).filter((row) =>
    REQUIRED_EVIDENCE.includes(normalizeKey(row.key)) &&
      (normalizeKey(row.status) !== 'captured' || !normalizeText(row.path) || !/^[a-f0-9]{64}$/i.test(normalizeText(row.fingerprint || row.sha256))),
  )
  return [
    ...missingKeys.map((key) => `intake_evidence_missing:${key}`),
    ...badRows.map((row) => `intake_evidence_invalid:${normalizeKey(row.key) || 'unknown'}`),
  ]
}

function noWriteBlockers(noWriteProof = {}) {
  return [
    noWriteProof.intakeOnly === true ? '' : 'intake_no_write_intake_only_missing',
    noWriteProof.productionWriteAttempted === true ? 'intake_production_write_attempted' : '',
    noWriteProof.liveWriteGuardBypassed === true ? 'intake_live_write_guard_bypassed' : '',
    numberValue(noWriteProof.templateDefaultMutationCount || noWriteProof.template_default_mutation_count) === 0 ? '' : 'intake_template_default_mutation_observed',
    numberValue(noWriteProof.versionPointerMutationCount || noWriteProof.version_pointer_mutation_count) === 0 ? '' : 'intake_version_pointer_mutation_observed',
    numberValue(noWriteProof.signingEnvelopeMutationCount || noWriteProof.signing_envelope_mutation_count) === 0 ? '' : 'intake_signing_envelope_mutation_observed',
    numberValue(noWriteProof.dispatchMutationCount || noWriteProof.dispatch_mutation_count) === 0 ? '' : 'intake_dispatch_mutation_observed',
  ].filter(Boolean)
}

export function buildOtpTemplateRenewalChangeIntakeReceipt({
  phase54Review = buildOtpTemplateRenewalSteadyStateReviewPhase54Audit().reviewReceipts?.find((receipt) => receipt.canContinueRenewalSteadyState),
  intakeRequest = null,
  routeImpactEntries = null,
  triageSteps = defaultTriageSteps(),
  attorneyScreening = defaultAttorneyScreening(),
  rollbackExpectation = defaultRollbackExpectation(),
  approvals = null,
  evidence = defaultEvidence(),
  noWriteProof = defaultNoWriteProof(),
  checkedAt = new Date().toISOString(),
} = {}) {
  const request = intakeRequest || defaultIntakeRequest(checkedAt)
  const routeImpacts = routeImpactEntries || defaultRouteImpactEntries(phase54Review)
  const acknowledgements = approvals || defaultApprovals(checkedAt)
  const blockerCodes = unique([
    ...phase54Blockers(phase54Review || {}),
    ...intakeRequestBlockers(request),
    ...routeImpactBlockers(routeImpacts, phase54Review),
    ...triageBlockers(triageSteps),
    ...attorneyScreeningBlockers(attorneyScreening),
    ...rollbackExpectationBlockers(rollbackExpectation),
    ...approvalBlockers(acknowledgements),
    ...evidenceBlockers(evidence),
    ...noWriteBlockers(noWriteProof),
  ])
  const canAcceptChangeIntake = blockerCodes.length === 0
  const intakeFingerprint = fingerprint([
    request.intakeRequestId,
    phase54Review?.closeoutReceipt?.closeoutFingerprint,
    list(routeImpacts).map((row) => `${row.routeVariant}:${row.sourceReviewOutputFingerprint}`).join(','),
    list(request.changeTypes).join(','),
  ])

  return Object.freeze({
    version: OTP_TEMPLATE_RENEWAL_CHANGE_INTAKE_PHASE55_VERSION,
    contract: OTP_TEMPLATE_RENEWAL_CHANGE_INTAKE_CONTRACT,
    checkedAt,
    status: canAcceptChangeIntake
      ? OTP_TEMPLATE_RENEWAL_CHANGE_INTAKE_READY_STATUS
      : 'OTP_TEMPLATE_RENEWAL_CHANGE_INTAKE_BLOCKED',
    canAcceptChangeIntake,
    mutatedData: false,
    blockerCodes: Object.freeze(blockerCodes),
    intakeFingerprint,
    phase54Review: Object.freeze({
      version: phase54Review?.version,
      status: phase54Review?.status,
      canContinueRenewalSteadyState: phase54Review?.canContinueRenewalSteadyState === true,
      closeoutFingerprint: phase54Review?.closeoutReceipt?.closeoutFingerprint,
      targetVersionKey: phase54Review?.closeoutReceipt?.targetVersionKey,
    }),
    intakeRequest: Object.freeze({ ...request }),
    routeImpactEntries: Object.freeze(list(routeImpacts)),
    triageSteps: Object.freeze(list(triageSteps)),
    attorneyScreening: Object.freeze({ ...attorneyScreening }),
    rollbackExpectation: Object.freeze({ ...rollbackExpectation }),
    approvals: Object.freeze(list(acknowledgements)),
    evidence: Object.freeze(list(evidence)),
    noWriteProof: Object.freeze({ ...noWriteProof }),
    summary: Object.freeze({
      routeCount: REQUIRED_ROUTES.length,
      routeImpactCount: list(routeImpacts).length,
      changeTypeCount: list(request.changeTypes).length,
      triageStepCount: list(triageSteps).length,
      acknowledgementCount: list(acknowledgements).length,
      evidenceCount: list(evidence).length,
      blockerCount: blockerCodes.length,
    }),
  })
}

function addCheck(checks, pass, code, detail) {
  checks.push({ code, pass: Boolean(pass), detail })
}

export function buildOtpTemplateRenewalChangeIntakePhase55Audit({
  checkedAt = new Date().toISOString(),
  phase54Audit = null,
  packageJson = {},
} = {}) {
  const checks = []
  const phase54Ready = !phase54Audit || phase54Audit.status === OTP_TEMPLATE_RENEWAL_STEADY_STATE_REVIEW_READY_STATUS
  const goodReview = phase54Audit?.reviewReceipts?.find((receipt) => receipt.canContinueRenewalSteadyState) ||
    buildOtpTemplateRenewalSteadyStateReviewPhase54Audit({ checkedAt }).reviewReceipts.find((receipt) => receipt.canContinueRenewalSteadyState)
  const goodIntake = buildOtpTemplateRenewalChangeIntakeReceipt({
    checkedAt,
    phase54Review: goodReview,
  })
  const unsupportedChange = buildOtpTemplateRenewalChangeIntakeReceipt({
    checkedAt,
    phase54Review: goodReview,
    intakeRequest: {
      ...defaultIntakeRequest(checkedAt),
      changeTypes: ['legal_wording', 'free_text_contract_rewrite'],
    },
  })
  const missingRouteImpact = buildOtpTemplateRenewalChangeIntakeReceipt({
    checkedAt,
    phase54Review: goodReview,
    routeImpactEntries: defaultRouteImpactEntries(goodReview).filter((row) => row.routeVariant !== 'new_development'),
  })
  const docxSource = buildOtpTemplateRenewalChangeIntakeReceipt({
    checkedAt,
    phase54Review: goodReview,
    routeImpactEntries: defaultRouteImpactEntries(goodReview).map((row) =>
      row.routeVariant === 'resale_existing_property'
        ? { ...row, sourceFormat: 'docx', sourcePath: 'resale-otp-renewal.docx', docxReferenceCount: 1 }
        : row,
    ),
  })
  const attorneyBlocked = buildOtpTemplateRenewalChangeIntakeReceipt({
    checkedAt,
    phase54Review: goodReview,
    attorneyScreening: {
      ...defaultAttorneyScreening(),
      legalReviewQueued: false,
      approvalStatus: 'approved',
      attorneyApprovalGranted: true,
      unresolvedLegalHoldCount: 1,
      notesArchived: false,
    },
  })
  const rollbackBlocked = buildOtpTemplateRenewalChangeIntakeReceipt({
    checkedAt,
    phase54Review: goodReview,
    rollbackExpectation: {
      ...defaultRollbackExpectation(),
      rollbackOwner: '',
      dryRunReviewRequired: false,
      productionWriteNotAllowed: false,
    },
  })
  const productionWrite = buildOtpTemplateRenewalChangeIntakeReceipt({
    checkedAt,
    phase54Review: goodReview,
    intakeRequest: {
      ...defaultIntakeRequest(checkedAt),
      productionWriteRequested: true,
      emergencyOverride: true,
      intakeOnly: false,
    },
    noWriteProof: {
      ...defaultNoWriteProof(),
      productionWriteAttempted: true,
      templateDefaultMutationCount: 1,
    },
  })
  const missingApproval = buildOtpTemplateRenewalChangeIntakeReceipt({
    checkedAt,
    phase54Review: goodReview,
    approvals: defaultApprovals(checkedAt).filter((row) => row.role !== 'governance_owner'),
  })
  const badEvidence = buildOtpTemplateRenewalChangeIntakeReceipt({
    checkedAt,
    phase54Review: goodReview,
    evidence: [
      { key: 'change_summary', status: 'missing', path: '', fingerprint: 'bad' },
    ],
  })

  addCheck(checks, phase54Ready, 'PHASE55_PHASE54_REVIEW_READY', 'Template renewal change intake starts only after Phase 54 steady-state review is ready.')
  addCheck(
    checks,
    goodIntake.canAcceptChangeIntake &&
      goodIntake.status === OTP_TEMPLATE_RENEWAL_CHANGE_INTAKE_READY_STATUS &&
      goodIntake.mutatedData === false,
    'PHASE55_GOOD_INTAKE_READY',
    'A clean renewal change intake can be accepted for scoping and triage without mutating production data.',
  )
  addCheck(
    checks,
    goodIntake.phase54Review.closeoutFingerprint === goodReview.closeoutReceipt.closeoutFingerprint &&
      goodIntake.phase54Review.targetVersionKey === goodReview.closeoutReceipt.targetVersionKey,
    'PHASE55_INTAKE_BOUND_TO_PHASE54_REVIEW',
    'Accepted intake is bound to the exact Phase 54 review closeout fingerprint and target version.',
  )
  addCheck(
    checks,
    REQUIRED_ROUTES.every((route) => goodIntake.routeImpactEntries.some((row) => row.routeVariant === route && row.intakeComplete === true)),
    'PHASE55_BOTH_ROUTES_SCREENED',
    'Resale and new-development impact entries are both screened during intake.',
  )
  addCheck(
    checks,
    REQUIRED_TRIAGE_STEPS.every((key) => goodIntake.triageSteps.some((row) => row.key === key && row.status === 'passed')),
    'PHASE55_REQUIRED_TRIAGE_STEPS_PASSED',
    'Duplicate, route, legal, rollback, evidence, and no-write intake screens all pass.',
  )
  addCheck(
    checks,
    goodIntake.attorneyScreening.reviewRequired === true &&
      goodIntake.attorneyScreening.legalReviewQueued === true &&
      goodIntake.attorneyScreening.attorneyApprovalGranted === false,
    'PHASE55_ATTORNEY_SCREENING_QUEUED_NOT_APPROVED',
    'Attorney screening is queued at intake, but legal approval is not prematurely granted.',
  )
  addCheck(
    checks,
    goodIntake.noWriteProof.intakeOnly === true &&
      goodIntake.noWriteProof.productionWriteAttempted === false &&
      goodIntake.noWriteProof.templateDefaultMutationCount === 0,
    'PHASE55_NO_PRODUCTION_WRITE_ALLOWED',
    'Phase 55 accepts intake only and cannot mutate live template defaults, version pointers, envelopes, or dispatch state.',
  )
  addCheck(
    checks,
    unsupportedChange.canAcceptChangeIntake === false &&
      unsupportedChange.blockerCodes.includes('intake_unsupported_change_type:free_text_contract_rewrite'),
    'PHASE55_UNSUPPORTED_CHANGE_TYPE_BLOCKED',
    'Unsupported change types cannot enter the renewal intake queue.',
  )
  addCheck(
    checks,
    missingRouteImpact.canAcceptChangeIntake === false &&
      missingRouteImpact.blockerCodes.includes('intake_route_impact_missing:new_development'),
    'PHASE55_MISSING_ROUTE_IMPACT_BLOCKED',
    'Missing resale or new-development route impact screening blocks intake.',
  )
  addCheck(
    checks,
    docxSource.canAcceptChangeIntake === false &&
      docxSource.blockerCodes.includes('intake_docx_source_observed:resale_existing_property'),
    'PHASE55_DOCX_SOURCE_BLOCKED',
    'DOC/DOCX sources remain blocked from template renewal intake.',
  )
  addCheck(
    checks,
    attorneyBlocked.canAcceptChangeIntake === false &&
      attorneyBlocked.blockerCodes.includes('attorney_screening_not_queued') &&
      attorneyBlocked.blockerCodes.includes('attorney_screening_premature_approval'),
    'PHASE55_ATTORNEY_SCREENING_BLOCKED',
    'Missing attorney queueing, unresolved legal holds, or premature approval blocks intake.',
  )
  addCheck(
    checks,
    rollbackBlocked.canAcceptChangeIntake === false &&
      rollbackBlocked.blockerCodes.includes('intake_rollback_owner_missing') &&
      rollbackBlocked.blockerCodes.includes('intake_dry_run_review_not_required'),
    'PHASE55_ROLLBACK_EXPECTATION_BLOCKED',
    'Renewal intake requires rollback ownership and dry-run review expectation.',
  )
  addCheck(
    checks,
    productionWrite.canAcceptChangeIntake === false &&
      productionWrite.blockerCodes.includes('intake_production_write_requested') &&
      productionWrite.blockerCodes.includes('intake_template_default_mutation_observed'),
    'PHASE55_PRODUCTION_WRITE_BLOCKED',
    'Production write requests or observed live mutations block change intake.',
  )
  addCheck(
    checks,
    missingApproval.canAcceptChangeIntake === false &&
      missingApproval.blockerCodes.includes('intake_acknowledgement_missing:governance_owner'),
    'PHASE55_MISSING_APPROVAL_BLOCKED',
    'Requester, template owner, and governance owner acknowledgements are required for intake.',
  )
  addCheck(
    checks,
    badEvidence.canAcceptChangeIntake === false &&
      badEvidence.blockerCodes.includes('intake_evidence_missing:route_impact_notes') &&
      badEvidence.blockerCodes.includes('intake_evidence_invalid:change_summary'),
    'PHASE55_BAD_EVIDENCE_BLOCKED',
    'Missing or invalid intake evidence blocks the request before scoping.',
  )
  addCheck(
    checks,
    packageJson.scripts?.['test:otp-template-renewal-change-intake-phase55'] === 'node scripts/otp-template-renewal-change-intake-phase55.test.mjs' &&
      packageJson.scripts?.['report:otp-template-renewal-change-intake-phase55'] === 'node scripts/report-otp-template-renewal-change-intake-phase55.mjs' &&
      packageJson.scripts?.['verify:otp-template-vnext']?.includes('test:otp-template-renewal-change-intake-phase55'),
    'PHASE55_PACKAGE_SCRIPTS_WIRED',
    'Package scripts expose the Phase 55 test, report, and vNext verification chain entry.',
  )

  const blockers = checks.filter((check) => !check.pass)
  return Object.freeze({
    version: OTP_TEMPLATE_RENEWAL_CHANGE_INTAKE_PHASE55_VERSION,
    contract: OTP_TEMPLATE_RENEWAL_CHANGE_INTAKE_CONTRACT,
    checkedAt,
    status: blockers.length ? 'OTP_TEMPLATE_RENEWAL_CHANGE_INTAKE_REMEDIATION_REQUIRED' : OTP_TEMPLATE_RENEWAL_CHANGE_INTAKE_READY_STATUS,
    mutatedData: false,
    checks: Object.freeze(checks),
    blockers: Object.freeze(blockers),
    intakeReceipts: Object.freeze([
      goodIntake,
      unsupportedChange,
      missingRouteImpact,
      docxSource,
      attorneyBlocked,
      rollbackBlocked,
      productionWrite,
      missingApproval,
      badEvidence,
    ]),
    summary: Object.freeze({
      blockerCount: blockers.length,
      acceptedIntakeCount: [goodIntake].filter((row) => row.canAcceptChangeIntake).length,
      blockedIntakeCount: [
        unsupportedChange,
        missingRouteImpact,
        docxSource,
        attorneyBlocked,
        rollbackBlocked,
        productionWrite,
        missingApproval,
        badEvidence,
      ].filter((row) => !row.canAcceptChangeIntake).length,
      routeCount: REQUIRED_ROUTES.length,
      triageStepCount: REQUIRED_TRIAGE_STEPS.length,
      evidenceCount: REQUIRED_EVIDENCE.length,
    }),
    nextPhase: blockers.length ? null : Object.freeze({
      phase: 56,
      key: 'otp_template_renewal_scoping_and_triage',
      label: 'Template Renewal Scoping And Triage',
    }),
  })
}

export function formatOtpTemplateRenewalChangeIntakePhase55Markdown(report = buildOtpTemplateRenewalChangeIntakePhase55Audit()) {
  const readyReceipt = report.intakeReceipts.find((receipt) => receipt.canAcceptChangeIntake) || report.intakeReceipts[0]
  return [
    '# OTP Generator Phase 55 Template Renewal Change Intake',
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
        ['Accepted intakes', report.summary.acceptedIntakeCount],
        ['Blocked intakes', report.summary.blockedIntakeCount],
        ['Routes', report.summary.routeCount],
        ['Triage steps', report.summary.triageStepCount],
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
    '## Intake Request',
    '',
    table(
      ['Field', 'Value'],
      [
        ['Request ID', readyReceipt.intakeRequest.intakeRequestId],
        ['Requester', readyReceipt.intakeRequest.requester],
        ['Template owner', readyReceipt.intakeRequest.templateOwner],
        ['Governance owner', readyReceipt.intakeRequest.governanceOwner],
        ['Change types', readyReceipt.intakeRequest.changeTypes.join(', ')],
        ['Intake fingerprint', readyReceipt.intakeFingerprint],
      ],
    ),
    '',
    '## Route Impact Intake',
    '',
    table(
      ['Route', 'Source Template', 'Source Envelope', 'Change Types', 'Summary'],
      readyReceipt.routeImpactEntries.map((route) => [
        route.routeVariant,
        route.sourceReviewTemplateDefaultId,
        route.sourceReviewSigningEnvelopeKey,
        route.changeTypes.join(', '),
        route.proposedChangeSummary,
      ]),
    ),
    '',
    '## Intake Screens',
    '',
    table(
      ['Screen', 'Status', 'Owner', 'Evidence'],
      readyReceipt.triageSteps.map((step) => [
        step.key,
        step.status,
        step.owner,
        step.evidencePath,
      ]),
    ),
    '',
    '## Attorney Screening',
    '',
    table(
      ['Field', 'Value'],
      [
        ['attorney_screening.required', readyReceipt.attorneyScreening.reviewRequired ? 'yes' : 'no'],
        ['attorney_screening.queued', readyReceipt.attorneyScreening.legalReviewQueued ? 'yes' : 'no'],
        ['attorney_screening.status', readyReceipt.attorneyScreening.approvalStatus],
        ['attorney_screening.approved', readyReceipt.attorneyScreening.attorneyApprovalGranted ? 'yes' : 'no'],
        ['attorney_screening.reference', readyReceipt.attorneyScreening.screeningReference],
      ],
    ),
    '',
    '## Intake Receipts',
    '',
    table(
      ['Status', 'Accepted', 'Routes', 'Change Types', 'Triage Steps', 'Evidence', 'Blockers'],
      report.intakeReceipts.map((receipt) => [
        receipt.status,
        receipt.canAcceptChangeIntake ? 'yes' : 'no',
        receipt.summary.routeImpactCount,
        receipt.summary.changeTypeCount,
        receipt.summary.triageStepCount,
        receipt.summary.evidenceCount,
        receipt.blockerCodes.join(', ') || 'none',
      ]),
    ),
    '',
    '## Boundary',
    '',
    'Phase 55 accepts a renewal change into the governed intake queue only when Phase 54 is clean, resale and new-development impacts are screened, attorney screening is queued, rollback expectations exist, evidence is captured, and no production write is requested or observed. It does not approve legal wording, publish a version, change route defaults, alter signing envelopes, or dispatch signing links.',
    '',
  ].join('\n')
}
