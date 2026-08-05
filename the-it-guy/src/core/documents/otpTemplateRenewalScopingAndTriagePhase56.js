import {
  OTP_TEMPLATE_RENEWAL_CHANGE_INTAKE_PHASE55_VERSION,
  OTP_TEMPLATE_RENEWAL_CHANGE_INTAKE_READY_STATUS,
  buildOtpTemplateRenewalChangeIntakePhase55Audit,
} from './otpTemplateRenewalChangeIntakePhase55.js'

export const OTP_TEMPLATE_RENEWAL_SCOPING_AND_TRIAGE_PHASE56_VERSION = 'otp_template_renewal_scoping_and_triage_phase56_v1'
export const OTP_TEMPLATE_RENEWAL_SCOPING_AND_TRIAGE_READY_STATUS = 'OTP_TEMPLATE_RENEWAL_SCOPING_AND_TRIAGE_READY_FOR_WORK_PACKAGE_DRAFT'
export const OTP_TEMPLATE_RENEWAL_SCOPING_AND_TRIAGE_CONTRACT = 'otp-vnext-template-renewal-scoping-and-triage-phase56-v1'

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
const REQUIRED_ASSIGNMENT_ROLES = Object.freeze(['scope_owner', 'template_owner', 'attorney_coordinator', 'qa_owner', 'release_operator'])
const REQUIRED_TEST_PLAN_ITEMS = Object.freeze([
  'content_scanner',
  'generated_pdf_proof',
  'signing_envelope_alignment',
  'agent_review_runtime',
  'route_regression',
  'rollback_rehearsal',
  'no_write_guard',
])
const REQUIRED_ROUTE_SCOPE_FIELDS = Object.freeze(['clauses_to_review', 'fields_to_review', 'acceptance_criteria'])

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

function defaultScopeDecision(intakeReceipt = {}, checkedAt = new Date().toISOString()) {
  return {
    scopingId: 'otp-vnext-phase56-renewal-scoping-and-triage-001',
    status: 'scoped',
    scopedAt: checkedAt,
    intakeFingerprint: intakeReceipt.intakeFingerprint,
    priority: 'p1_controlled',
    scopeOwner: 'template_owner',
    triageOwner: 'governance_owner',
    attorneyCoordinator: 'attorney_coordinator',
    routeSeparationMode: 'separate_route_work_packages',
    scopeSummary: 'Scope accepted OTP renewal intake into route-separated work packages before any wording or runtime changes.',
    inScopeChangeTypes: intakeReceipt.intakeRequest?.changeTypes || ['legal_wording', 'commercial_terms', 'buyer_cost_obligations', 'suspensive_conditions'],
    outOfScopeChangeTypes: ['live_template_default_write', 'signing_dispatch', 'production_activation'],
    productionWriteRequested: false,
    emergencyOverride: false,
    scopedOnly: true,
  }
}

function defaultRouteScopePlans(intakeReceipt = {}) {
  return REQUIRED_ROUTES.map((routeVariant) => {
    const impact = list(intakeReceipt.routeImpactEntries).find((row) => normalizeKey(row.routeVariant) === routeVariant) || {}
    const resale = routeVariant === 'resale_existing_property'
    return {
      routeVariant,
      scoped: true,
      workPackageKey: resale ? 'otp-renewal-resale-work-package-phase56' : 'otp-renewal-new-development-work-package-phase56',
      sourceIntakeTemplateDefaultId: impact.sourceReviewTemplateDefaultId,
      sourceIntakeSigningEnvelopeKey: impact.sourceReviewSigningEnvelopeKey,
      sourceIntakeOutputFingerprint: impact.sourceReviewOutputFingerprint,
      changeTypes: impact.changeTypes || [],
      clausesToReview: resale
        ? ['definitions', 'parties', 'property', 'purchase_price_and_deposit', 'buyer_cost_obligations', 'commission', 'suspensive_conditions', 'signatures_and_witnesses']
        : ['definitions', 'parties', 'property', 'developer_obligations', 'purchase_price_and_deposit', 'buyer_cost_obligations', 'suspensive_conditions', 'signatures_and_witnesses'],
      fieldsToReview: resale
        ? ['buyer_details', 'seller_details', 'property_details', 'purchase_price', 'deposit', 'commission_variation', 'finance_condition', 'custom_suspensive_condition']
        : ['buyer_details', 'developer_details', 'property_details', 'purchase_price', 'deposit', 'levies_and_hoa_costs', 'occupation_date', 'custom_suspensive_condition'],
      signingEnvelopeImpacts: ['signature_roles', 'witness_fields', 'initials_on_every_page'],
      agentReviewUiImpacts: ['buyer_cost_obligations', 'suspensive_conditions', 'commission_variation'],
      acceptanceCriteria: [
        'Route wording remains separate from the other OTP route.',
        'Generated PDF proof contains the scoped wording and no DOC/DOCX source reference.',
        'Signing envelope proof remains role-scoped with witnesses and initials.',
      ],
      attorneyReviewRequired: true,
      sourceFormat: 'native_pdf_template',
      docxReferenceCount: 0,
      routeDefaultMutationRequested: false,
      signingEnvelopeMutationRequested: false,
    }
  })
}

function defaultRiskClassification() {
  return {
    overallRisk: 'medium',
    legalRisk: 'requires_attorney_review',
    operationalRisk: 'controlled_low_downtime',
    signingRisk: 'requires_envelope_regression',
    dataMigrationRequired: false,
    productionMutationRequired: false,
    downtimeExpected: false,
    riskOwner: 'governance_owner',
    escalationRequired: false,
  }
}

function defaultAssignments(checkedAt = new Date().toISOString()) {
  return REQUIRED_ASSIGNMENT_ROLES.map((role) => ({
    role,
    owner: role,
    assigned: true,
    assignedAt: checkedAt,
    acknowledgementReference: `phase56-${role}-assignment`,
  }))
}

function defaultAttorneyTriage() {
  return {
    reviewRequired: true,
    routeLegalReviewQueued: true,
    attorneyApprovalGranted: false,
    unresolvedLegalHoldCount: 0,
    reviewMode: 'pre_approval_required',
    attorneyTriageReference: 'phase56-attorney-triage-route-separated',
    evidencePath: 'docs/otp-attorney-triage-phase56.md',
  }
}

function defaultTestPlan() {
  return REQUIRED_TEST_PLAN_ITEMS.map((key) => ({
    key,
    status: 'planned',
    owner: key === 'content_scanner' ? 'template_owner' : 'qa_owner',
    requiredBeforePublication: true,
    evidencePath: `docs/otp-${key.replace(/_/g, '-')}-phase56.md`,
  }))
}

function defaultRollbackPlan() {
  return {
    rollbackScopeReference: 'phase56-template-renewal-scoped-rollback-plan',
    owner: 'release_operator',
    restorePreviousDefaultsPlanned: true,
    restorePreviousSigningEnvelopesPlanned: true,
    restoreVersionPointerPlanned: true,
    stopSigningDispatchPlanned: true,
    dryRunRequired: true,
    productionWriteNotAllowed: true,
  }
}

function defaultNoWriteProof() {
  return {
    scopedOnly: true,
    productionWriteAttempted: false,
    templateDefaultMutationCount: 0,
    signingEnvelopeMutationCount: 0,
    versionPointerMutationCount: 0,
    dispatchMutationCount: 0,
  }
}

function phase55Blockers(intakeReceipt = {}) {
  return [
    intakeReceipt.version === OTP_TEMPLATE_RENEWAL_CHANGE_INTAKE_PHASE55_VERSION ? '' : 'phase55_intake_version_mismatch',
    intakeReceipt.status === OTP_TEMPLATE_RENEWAL_CHANGE_INTAKE_READY_STATUS ? '' : 'phase55_intake_not_ready',
    intakeReceipt.canAcceptChangeIntake === true ? '' : 'phase55_intake_not_accepted',
    intakeReceipt.mutatedData === false ? '' : 'phase55_intake_mutation_unexpected',
    list(intakeReceipt.blockerCodes).length === 0 ? '' : 'phase55_intake_has_blockers',
    intakeReceipt.noWriteProof?.productionWriteAttempted === false ? '' : 'phase55_intake_write_attempted',
  ].filter(Boolean)
}

function scopeDecisionBlockers(scopeDecision = {}, intakeReceipt = {}) {
  const inScopeTypes = list(scopeDecision.inScopeChangeTypes || scopeDecision.in_scope_change_types).map(normalizeKey)
  return [
    normalizeText(scopeDecision.scopingId || scopeDecision.scoping_id) ? '' : 'scoping_id_missing',
    normalizeKey(scopeDecision.status) === 'scoped' ? '' : 'scoping_status_not_scoped',
    normalizeText(scopeDecision.scopedAt || scopeDecision.scoped_at) ? '' : 'scoping_time_missing',
    scopeDecision.intakeFingerprint === intakeReceipt.intakeFingerprint ? '' : 'scoping_intake_fingerprint_mismatch',
    normalizeText(scopeDecision.priority) ? '' : 'scoping_priority_missing',
    normalizeText(scopeDecision.scopeOwner || scopeDecision.scope_owner) ? '' : 'scoping_scope_owner_missing',
    normalizeText(scopeDecision.triageOwner || scopeDecision.triage_owner) ? '' : 'scoping_triage_owner_missing',
    normalizeText(scopeDecision.attorneyCoordinator || scopeDecision.attorney_coordinator) ? '' : 'scoping_attorney_coordinator_missing',
    normalizeKey(scopeDecision.routeSeparationMode || scopeDecision.route_separation_mode) === 'separate_route_work_packages' ? '' : 'scoping_route_separation_missing',
    normalizeText(scopeDecision.scopeSummary || scopeDecision.scope_summary) ? '' : 'scoping_summary_missing',
    inScopeTypes.length ? '' : 'scoping_in_scope_change_types_missing',
    ...inScopeTypes.filter((type) => !SUPPORTED_CHANGE_TYPES.includes(type)).map((type) => `scoping_unsupported_change_type:${type}`),
    scopeDecision.productionWriteRequested === true ? 'scoping_production_write_requested' : '',
    scopeDecision.emergencyOverride === true ? 'scoping_emergency_override_requested' : '',
    scopeDecision.scopedOnly === true ? '' : 'scoping_only_flag_missing',
  ].filter(Boolean)
}

function routeScopeBlockers(routeScopePlans = [], intakeReceipt = {}) {
  const routes = list(routeScopePlans).map((row) => normalizeKey(row.routeVariant || row.route_variant))
  const missingRoutes = REQUIRED_ROUTES.filter((route) => !routes.includes(route))
  const duplicateRoutes = routes.filter((route, index) => route && routes.indexOf(route) !== index)
  const rowBlockers = list(routeScopePlans).flatMap((row) => {
    const route = normalizeKey(row.routeVariant || row.route_variant) || 'unknown'
    const intakeImpact = list(intakeReceipt.routeImpactEntries).find((candidate) => normalizeKey(candidate.routeVariant) === route) || {}
    const changeTypes = list(row.changeTypes || row.change_types).map(normalizeKey)
    const clauses = list(row.clausesToReview || row.clauses_to_review)
    const fields = list(row.fieldsToReview || row.fields_to_review)
    const acceptance = list(row.acceptanceCriteria || row.acceptance_criteria)
    return [
      REQUIRED_ROUTES.includes(route) ? '' : `scoping_route_unsupported:${route}`,
      row.scoped === true ? '' : `scoping_route_not_scoped:${route}`,
      normalizeText(row.workPackageKey || row.work_package_key) ? '' : `scoping_route_work_package_missing:${route}`,
      row.sourceIntakeTemplateDefaultId === intakeImpact.sourceReviewTemplateDefaultId ? '' : `scoping_source_template_mismatch:${route}`,
      row.sourceIntakeSigningEnvelopeKey === intakeImpact.sourceReviewSigningEnvelopeKey ? '' : `scoping_source_envelope_mismatch:${route}`,
      row.sourceIntakeOutputFingerprint === intakeImpact.sourceReviewOutputFingerprint ? '' : `scoping_source_output_fingerprint_mismatch:${route}`,
      changeTypes.length ? '' : `scoping_route_change_types_missing:${route}`,
      ...changeTypes.filter((type) => !SUPPORTED_CHANGE_TYPES.includes(type)).map((type) => `scoping_route_unsupported_change_type:${route}:${type}`),
      clauses.length ? '' : `scoping_route_clauses_missing:${route}`,
      fields.length ? '' : `scoping_route_fields_missing:${route}`,
      acceptance.length ? '' : `scoping_route_acceptance_criteria_missing:${route}`,
      list(row.signingEnvelopeImpacts || row.signing_envelope_impacts).length ? '' : `scoping_signing_envelope_impacts_missing:${route}`,
      list(row.agentReviewUiImpacts || row.agent_review_ui_impacts).length ? '' : `scoping_agent_review_ui_impacts_missing:${route}`,
      row.attorneyReviewRequired === true ? '' : `scoping_attorney_review_not_required:${route}`,
      hasDocxSource(row) ? `scoping_docx_source_observed:${route}` : '',
      row.routeDefaultMutationRequested === true ? `scoping_route_default_mutation_requested:${route}` : '',
      row.signingEnvelopeMutationRequested === true ? `scoping_signing_envelope_mutation_requested:${route}` : '',
    ].filter(Boolean)
  })
  return [
    ...missingRoutes.map((route) => `scoping_route_missing:${route}`),
    ...unique(duplicateRoutes).map((route) => `scoping_route_duplicate:${route}`),
    ...rowBlockers,
  ]
}

function riskBlockers(risk = {}) {
  return [
    normalizeText(risk.overallRisk || risk.overall_risk) ? '' : 'scoping_overall_risk_missing',
    normalizeText(risk.legalRisk || risk.legal_risk) ? '' : 'scoping_legal_risk_missing',
    normalizeText(risk.operationalRisk || risk.operational_risk) ? '' : 'scoping_operational_risk_missing',
    normalizeText(risk.signingRisk || risk.signing_risk) ? '' : 'scoping_signing_risk_missing',
    risk.dataMigrationRequired === true ? 'scoping_data_migration_requested' : '',
    risk.productionMutationRequired === true ? 'scoping_production_mutation_required' : '',
    risk.downtimeExpected === true ? 'scoping_downtime_expected' : '',
    normalizeText(risk.riskOwner || risk.risk_owner) ? '' : 'scoping_risk_owner_missing',
    risk.escalationRequired === true ? 'scoping_escalation_required' : '',
  ].filter(Boolean)
}

function assignmentBlockers(assignments = []) {
  const roles = list(assignments).map((row) => normalizeKey(row.role))
  const missingRoles = REQUIRED_ASSIGNMENT_ROLES.filter((role) => !roles.includes(role))
  const badRows = list(assignments).filter((row) => {
    const role = normalizeKey(row.role)
    return REQUIRED_ASSIGNMENT_ROLES.includes(role) && (
      row.assigned !== true ||
      !normalizeText(row.owner) ||
      !normalizeText(row.assignedAt || row.assigned_at) ||
      !normalizeText(row.acknowledgementReference || row.acknowledgement_reference)
    )
  })
  return [
    ...missingRoles.map((role) => `scoping_assignment_missing:${role}`),
    ...badRows.map((row) => `scoping_assignment_incomplete:${normalizeKey(row.role) || 'unknown'}`),
  ]
}

function attorneyTriageBlockers(attorneyTriage = {}) {
  return [
    attorneyTriage.reviewRequired === true ? '' : 'scoping_attorney_review_not_required',
    attorneyTriage.routeLegalReviewQueued === true ? '' : 'scoping_route_legal_review_not_queued',
    attorneyTriage.attorneyApprovalGranted === true ? 'scoping_attorney_approval_premature' : '',
    numberValue(attorneyTriage.unresolvedLegalHoldCount || attorneyTriage.unresolved_legal_hold_count) === 0 ? '' : 'scoping_legal_holds_unresolved',
    normalizeKey(attorneyTriage.reviewMode || attorneyTriage.review_mode) === 'pre_approval_required' ? '' : 'scoping_attorney_review_mode_invalid',
    normalizeText(attorneyTriage.attorneyTriageReference || attorneyTriage.attorney_triage_reference) ? '' : 'scoping_attorney_triage_reference_missing',
    normalizeText(attorneyTriage.evidencePath || attorneyTriage.evidence_path) ? '' : 'scoping_attorney_triage_evidence_missing',
  ].filter(Boolean)
}

function testPlanBlockers(testPlan = []) {
  const keys = list(testPlan).map((row) => normalizeKey(row.key))
  const missingKeys = REQUIRED_TEST_PLAN_ITEMS.filter((key) => !keys.includes(key))
  const badRows = list(testPlan).filter((row) =>
    REQUIRED_TEST_PLAN_ITEMS.includes(normalizeKey(row.key)) &&
      (normalizeKey(row.status) !== 'planned' || row.requiredBeforePublication !== true || !normalizeText(row.owner) || !normalizeText(row.evidencePath || row.evidence_path)),
  )
  return [
    ...missingKeys.map((key) => `scoping_test_plan_missing:${key}`),
    ...badRows.map((row) => `scoping_test_plan_invalid:${normalizeKey(row.key) || 'unknown'}`),
  ]
}

function rollbackBlockers(rollbackPlan = {}) {
  return [
    normalizeText(rollbackPlan.rollbackScopeReference || rollbackPlan.rollback_scope_reference) ? '' : 'scoping_rollback_reference_missing',
    normalizeText(rollbackPlan.owner) ? '' : 'scoping_rollback_owner_missing',
    rollbackPlan.restorePreviousDefaultsPlanned === true ? '' : 'scoping_restore_defaults_not_planned',
    rollbackPlan.restorePreviousSigningEnvelopesPlanned === true ? '' : 'scoping_restore_envelopes_not_planned',
    rollbackPlan.restoreVersionPointerPlanned === true ? '' : 'scoping_restore_pointer_not_planned',
    rollbackPlan.stopSigningDispatchPlanned === true ? '' : 'scoping_stop_dispatch_not_planned',
    rollbackPlan.dryRunRequired === true ? '' : 'scoping_rollback_dry_run_not_required',
    rollbackPlan.productionWriteNotAllowed === true ? '' : 'scoping_rollback_production_write_not_blocked',
  ].filter(Boolean)
}

function noWriteBlockers(noWriteProof = {}) {
  return [
    noWriteProof.scopedOnly === true ? '' : 'scoping_no_write_scoped_only_missing',
    noWriteProof.productionWriteAttempted === true ? 'scoping_production_write_attempted' : '',
    numberValue(noWriteProof.templateDefaultMutationCount || noWriteProof.template_default_mutation_count) === 0 ? '' : 'scoping_template_default_mutation_observed',
    numberValue(noWriteProof.signingEnvelopeMutationCount || noWriteProof.signing_envelope_mutation_count) === 0 ? '' : 'scoping_signing_envelope_mutation_observed',
    numberValue(noWriteProof.versionPointerMutationCount || noWriteProof.version_pointer_mutation_count) === 0 ? '' : 'scoping_version_pointer_mutation_observed',
    numberValue(noWriteProof.dispatchMutationCount || noWriteProof.dispatch_mutation_count) === 0 ? '' : 'scoping_dispatch_mutation_observed',
  ].filter(Boolean)
}

export function buildOtpTemplateRenewalScopingAndTriageReceipt({
  intakeReceipt = buildOtpTemplateRenewalChangeIntakePhase55Audit().intakeReceipts?.find((receipt) => receipt.canAcceptChangeIntake),
  scopeDecision = null,
  routeScopePlans = null,
  riskClassification = defaultRiskClassification(),
  assignments = null,
  attorneyTriage = defaultAttorneyTriage(),
  testPlan = defaultTestPlan(),
  rollbackPlan = defaultRollbackPlan(),
  noWriteProof = defaultNoWriteProof(),
  checkedAt = new Date().toISOString(),
} = {}) {
  const decision = scopeDecision || defaultScopeDecision(intakeReceipt, checkedAt)
  const routes = routeScopePlans || defaultRouteScopePlans(intakeReceipt)
  const scopedAssignments = assignments || defaultAssignments(checkedAt)
  const blockerCodes = unique([
    ...phase55Blockers(intakeReceipt || {}),
    ...scopeDecisionBlockers(decision, intakeReceipt),
    ...routeScopeBlockers(routes, intakeReceipt),
    ...riskBlockers(riskClassification),
    ...assignmentBlockers(scopedAssignments),
    ...attorneyTriageBlockers(attorneyTriage),
    ...testPlanBlockers(testPlan),
    ...rollbackBlockers(rollbackPlan),
    ...noWriteBlockers(noWriteProof),
  ])
  const canPrepareWorkPackageDraft = blockerCodes.length === 0
  const scopingFingerprint = fingerprint([
    decision.scopingId,
    intakeReceipt?.intakeFingerprint,
    list(routes).map((row) => `${row.routeVariant}:${row.workPackageKey}`).join(','),
    list(decision.inScopeChangeTypes).join(','),
  ])

  return Object.freeze({
    version: OTP_TEMPLATE_RENEWAL_SCOPING_AND_TRIAGE_PHASE56_VERSION,
    contract: OTP_TEMPLATE_RENEWAL_SCOPING_AND_TRIAGE_CONTRACT,
    checkedAt,
    status: canPrepareWorkPackageDraft
      ? OTP_TEMPLATE_RENEWAL_SCOPING_AND_TRIAGE_READY_STATUS
      : 'OTP_TEMPLATE_RENEWAL_SCOPING_AND_TRIAGE_BLOCKED',
    canPrepareWorkPackageDraft,
    mutatedData: false,
    blockerCodes: Object.freeze(blockerCodes),
    scopingFingerprint,
    intakeReceipt: Object.freeze({
      version: intakeReceipt?.version,
      status: intakeReceipt?.status,
      canAcceptChangeIntake: intakeReceipt?.canAcceptChangeIntake === true,
      intakeFingerprint: intakeReceipt?.intakeFingerprint,
      requestId: intakeReceipt?.intakeRequest?.intakeRequestId,
    }),
    scopeDecision: Object.freeze({ ...decision }),
    routeScopePlans: Object.freeze(list(routes)),
    riskClassification: Object.freeze({ ...riskClassification }),
    assignments: Object.freeze(list(scopedAssignments)),
    attorneyTriage: Object.freeze({ ...attorneyTriage }),
    testPlan: Object.freeze(list(testPlan)),
    rollbackPlan: Object.freeze({ ...rollbackPlan }),
    noWriteProof: Object.freeze({ ...noWriteProof }),
    summary: Object.freeze({
      routeCount: REQUIRED_ROUTES.length,
      scopedRouteCount: list(routes).filter((row) => row.scoped === true).length,
      changeTypeCount: list(decision.inScopeChangeTypes).length,
      assignmentCount: list(scopedAssignments).length,
      testPlanCount: list(testPlan).length,
      blockerCount: blockerCodes.length,
    }),
  })
}

function addCheck(checks, pass, code, detail) {
  checks.push({ code, pass: Boolean(pass), detail })
}

export function buildOtpTemplateRenewalScopingAndTriagePhase56Audit({
  checkedAt = new Date().toISOString(),
  phase55Audit = null,
  packageJson = {},
} = {}) {
  const checks = []
  const phase55Ready = !phase55Audit || phase55Audit.status === OTP_TEMPLATE_RENEWAL_CHANGE_INTAKE_READY_STATUS
  const goodIntake = phase55Audit?.intakeReceipts?.find((receipt) => receipt.canAcceptChangeIntake) ||
    buildOtpTemplateRenewalChangeIntakePhase55Audit({ checkedAt }).intakeReceipts.find((receipt) => receipt.canAcceptChangeIntake)
  const goodScope = buildOtpTemplateRenewalScopingAndTriageReceipt({
    checkedAt,
    intakeReceipt: goodIntake,
  })
  const fingerprintMismatchScope = buildOtpTemplateRenewalScopingAndTriageReceipt({
    checkedAt,
    intakeReceipt: goodIntake,
    scopeDecision: {
      ...defaultScopeDecision(goodIntake, checkedAt),
      intakeFingerprint: 'wrong-fingerprint',
    },
  })
  const missingRouteScope = buildOtpTemplateRenewalScopingAndTriageReceipt({
    checkedAt,
    intakeReceipt: goodIntake,
    routeScopePlans: defaultRouteScopePlans(goodIntake).filter((row) => row.routeVariant !== 'new_development'),
  })
  const docxScope = buildOtpTemplateRenewalScopingAndTriageReceipt({
    checkedAt,
    intakeReceipt: goodIntake,
    routeScopePlans: defaultRouteScopePlans(goodIntake).map((row) =>
      row.routeVariant === 'resale_existing_property'
        ? { ...row, sourceFormat: 'docx', sourcePath: 'resale-scoped-template.docx', docxReferenceCount: 1 }
        : row,
    ),
  })
  const weakRouteScope = buildOtpTemplateRenewalScopingAndTriageReceipt({
    checkedAt,
    intakeReceipt: goodIntake,
    routeScopePlans: defaultRouteScopePlans(goodIntake).map((row) =>
      row.routeVariant === 'new_development'
        ? { ...row, clausesToReview: [], fieldsToReview: [], acceptanceCriteria: [] }
        : row,
    ),
  })
  const riskBlockedScope = buildOtpTemplateRenewalScopingAndTriageReceipt({
    checkedAt,
    intakeReceipt: goodIntake,
    riskClassification: {
      ...defaultRiskClassification(),
      dataMigrationRequired: true,
      productionMutationRequired: true,
      downtimeExpected: true,
    },
  })
  const assignmentBlockedScope = buildOtpTemplateRenewalScopingAndTriageReceipt({
    checkedAt,
    intakeReceipt: goodIntake,
    assignments: defaultAssignments(checkedAt).filter((row) => row.role !== 'attorney_coordinator'),
  })
  const attorneyBlockedScope = buildOtpTemplateRenewalScopingAndTriageReceipt({
    checkedAt,
    intakeReceipt: goodIntake,
    attorneyTriage: {
      ...defaultAttorneyTriage(),
      routeLegalReviewQueued: false,
      attorneyApprovalGranted: true,
      unresolvedLegalHoldCount: 1,
    },
  })
  const testPlanBlockedScope = buildOtpTemplateRenewalScopingAndTriageReceipt({
    checkedAt,
    intakeReceipt: goodIntake,
    testPlan: [
      { key: 'content_scanner', status: 'failed', owner: '', requiredBeforePublication: false, evidencePath: '' },
    ],
  })
  const rollbackBlockedScope = buildOtpTemplateRenewalScopingAndTriageReceipt({
    checkedAt,
    intakeReceipt: goodIntake,
    rollbackPlan: {
      ...defaultRollbackPlan(),
      owner: '',
      stopSigningDispatchPlanned: false,
      dryRunRequired: false,
    },
  })
  const productionWriteScope = buildOtpTemplateRenewalScopingAndTriageReceipt({
    checkedAt,
    intakeReceipt: goodIntake,
    scopeDecision: {
      ...defaultScopeDecision(goodIntake, checkedAt),
      productionWriteRequested: true,
      emergencyOverride: true,
      scopedOnly: false,
    },
    noWriteProof: {
      ...defaultNoWriteProof(),
      productionWriteAttempted: true,
      signingEnvelopeMutationCount: 1,
    },
  })

  addCheck(checks, phase55Ready, 'PHASE56_PHASE55_INTAKE_READY', 'Template renewal scoping and triage starts only after Phase 55 intake is accepted.')
  addCheck(
    checks,
    goodScope.canPrepareWorkPackageDraft &&
      goodScope.status === OTP_TEMPLATE_RENEWAL_SCOPING_AND_TRIAGE_READY_STATUS &&
      goodScope.mutatedData === false,
    'PHASE56_GOOD_SCOPING_READY',
    'A clean accepted intake can become a scoped work-package draft without mutating production data.',
  )
  addCheck(
    checks,
    goodScope.scopeDecision.intakeFingerprint === goodIntake.intakeFingerprint,
    'PHASE56_SCOPING_BOUND_TO_INTAKE',
    'Scoping is bound to the exact Phase 55 intake fingerprint.',
  )
  addCheck(
    checks,
    REQUIRED_ROUTES.every((route) => goodScope.routeScopePlans.some((row) => row.routeVariant === route && row.scoped === true && normalizeText(row.workPackageKey))),
    'PHASE56_ROUTE_WORK_PACKAGES_SEPARATED',
    'Resale and new-development scope into separate work packages.',
  )
  addCheck(
    checks,
    REQUIRED_ROUTE_SCOPE_FIELDS.every((field) =>
      goodScope.routeScopePlans.every((row) => list(row[field.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())] || row[field]).length > 0),
    ),
    'PHASE56_ROUTE_SCOPE_FIELDS_COMPLETE',
    'Each route has clauses, fields, and acceptance criteria scoped.',
  )
  addCheck(
    checks,
    goodScope.attorneyTriage.reviewRequired === true &&
      goodScope.attorneyTriage.routeLegalReviewQueued === true &&
      goodScope.attorneyTriage.attorneyApprovalGranted === false,
    'PHASE56_ATTORNEY_TRIAGE_QUEUED_NOT_APPROVED',
    'Attorney route review is queued for scoping, but legal approval is not prematurely granted.',
  )
  addCheck(
    checks,
    REQUIRED_TEST_PLAN_ITEMS.every((key) => goodScope.testPlan.some((row) => row.key === key && row.status === 'planned' && row.requiredBeforePublication === true)),
    'PHASE56_TEST_PLAN_SCOPED',
    'Content scanner, PDF proof, signing alignment, agent review, route regression, rollback, and no-write tests are planned.',
  )
  addCheck(
    checks,
    goodScope.noWriteProof.scopedOnly === true &&
      goodScope.noWriteProof.productionWriteAttempted === false &&
      goodScope.noWriteProof.templateDefaultMutationCount === 0,
    'PHASE56_NO_PRODUCTION_WRITE_ALLOWED',
    'Phase 56 scopes only and cannot mutate live template defaults, envelopes, version pointers, or dispatch state.',
  )
  addCheck(
    checks,
    fingerprintMismatchScope.canPrepareWorkPackageDraft === false &&
      fingerprintMismatchScope.blockerCodes.includes('scoping_intake_fingerprint_mismatch'),
    'PHASE56_INTAKE_FINGERPRINT_MISMATCH_BLOCKED',
    'A scope package must match the accepted Phase 55 intake fingerprint.',
  )
  addCheck(
    checks,
    missingRouteScope.canPrepareWorkPackageDraft === false &&
      missingRouteScope.blockerCodes.includes('scoping_route_missing:new_development'),
    'PHASE56_MISSING_ROUTE_SCOPE_BLOCKED',
    'Missing resale or new-development scope blocks work-package drafting.',
  )
  addCheck(
    checks,
    docxScope.canPrepareWorkPackageDraft === false &&
      docxScope.blockerCodes.includes('scoping_docx_source_observed:resale_existing_property'),
    'PHASE56_DOCX_SOURCE_BLOCKED',
    'DOC/DOCX sources remain blocked during scoping.',
  )
  addCheck(
    checks,
    weakRouteScope.canPrepareWorkPackageDraft === false &&
      weakRouteScope.blockerCodes.includes('scoping_route_clauses_missing:new_development') &&
      weakRouteScope.blockerCodes.includes('scoping_route_fields_missing:new_development'),
    'PHASE56_INCOMPLETE_ROUTE_SCOPE_BLOCKED',
    'Route scopes without clauses, fields, or acceptance criteria are blocked.',
  )
  addCheck(
    checks,
    riskBlockedScope.canPrepareWorkPackageDraft === false &&
      riskBlockedScope.blockerCodes.includes('scoping_production_mutation_required') &&
      riskBlockedScope.blockerCodes.includes('scoping_downtime_expected'),
    'PHASE56_RISK_ESCALATION_BLOCKED',
    'Data migration, production mutation, or downtime requirements block this scoped-only path.',
  )
  addCheck(
    checks,
    assignmentBlockedScope.canPrepareWorkPackageDraft === false &&
      assignmentBlockedScope.blockerCodes.includes('scoping_assignment_missing:attorney_coordinator'),
    'PHASE56_ASSIGNMENT_BLOCKED',
    'Scope owner, template owner, attorney coordinator, QA owner, and release operator assignments are required.',
  )
  addCheck(
    checks,
    attorneyBlockedScope.canPrepareWorkPackageDraft === false &&
      attorneyBlockedScope.blockerCodes.includes('scoping_route_legal_review_not_queued') &&
      attorneyBlockedScope.blockerCodes.includes('scoping_attorney_approval_premature'),
    'PHASE56_ATTORNEY_TRIAGE_BLOCKED',
    'Missing attorney queueing, unresolved legal holds, or premature approval blocks scoping.',
  )
  addCheck(
    checks,
    testPlanBlockedScope.canPrepareWorkPackageDraft === false &&
      testPlanBlockedScope.blockerCodes.includes('scoping_test_plan_missing:generated_pdf_proof') &&
      testPlanBlockedScope.blockerCodes.includes('scoping_test_plan_invalid:content_scanner'),
    'PHASE56_TEST_PLAN_BLOCKED',
    'Missing or invalid test-plan items block scoping.',
  )
  addCheck(
    checks,
    rollbackBlockedScope.canPrepareWorkPackageDraft === false &&
      rollbackBlockedScope.blockerCodes.includes('scoping_rollback_owner_missing') &&
      rollbackBlockedScope.blockerCodes.includes('scoping_stop_dispatch_not_planned'),
    'PHASE56_ROLLBACK_PLAN_BLOCKED',
    'Rollback ownership, restore plans, dispatch stop, and dry-run requirements are mandatory.',
  )
  addCheck(
    checks,
    productionWriteScope.canPrepareWorkPackageDraft === false &&
      productionWriteScope.blockerCodes.includes('scoping_production_write_requested') &&
      productionWriteScope.blockerCodes.includes('scoping_signing_envelope_mutation_observed'),
    'PHASE56_PRODUCTION_WRITE_BLOCKED',
    'Production write requests or observed mutations block scoping.',
  )
  addCheck(
    checks,
    packageJson.scripts?.['test:otp-template-renewal-scoping-and-triage-phase56'] === 'node scripts/otp-template-renewal-scoping-and-triage-phase56.test.mjs' &&
      packageJson.scripts?.['report:otp-template-renewal-scoping-and-triage-phase56'] === 'node scripts/report-otp-template-renewal-scoping-and-triage-phase56.mjs' &&
      packageJson.scripts?.['verify:otp-template-vnext']?.includes('test:otp-template-renewal-scoping-and-triage-phase56'),
    'PHASE56_PACKAGE_SCRIPTS_WIRED',
    'Package scripts expose the Phase 56 test, report, and vNext verification chain entry.',
  )

  const blockers = checks.filter((check) => !check.pass)
  return Object.freeze({
    version: OTP_TEMPLATE_RENEWAL_SCOPING_AND_TRIAGE_PHASE56_VERSION,
    contract: OTP_TEMPLATE_RENEWAL_SCOPING_AND_TRIAGE_CONTRACT,
    checkedAt,
    status: blockers.length ? 'OTP_TEMPLATE_RENEWAL_SCOPING_AND_TRIAGE_REMEDIATION_REQUIRED' : OTP_TEMPLATE_RENEWAL_SCOPING_AND_TRIAGE_READY_STATUS,
    mutatedData: false,
    checks: Object.freeze(checks),
    blockers: Object.freeze(blockers),
    scopingReceipts: Object.freeze([
      goodScope,
      fingerprintMismatchScope,
      missingRouteScope,
      docxScope,
      weakRouteScope,
      riskBlockedScope,
      assignmentBlockedScope,
      attorneyBlockedScope,
      testPlanBlockedScope,
      rollbackBlockedScope,
      productionWriteScope,
    ]),
    summary: Object.freeze({
      blockerCount: blockers.length,
      readyScopingCount: [goodScope].filter((row) => row.canPrepareWorkPackageDraft).length,
      blockedScopingCount: [
        fingerprintMismatchScope,
        missingRouteScope,
        docxScope,
        weakRouteScope,
        riskBlockedScope,
        assignmentBlockedScope,
        attorneyBlockedScope,
        testPlanBlockedScope,
        rollbackBlockedScope,
        productionWriteScope,
      ].filter((row) => !row.canPrepareWorkPackageDraft).length,
      routeCount: REQUIRED_ROUTES.length,
      testPlanCount: REQUIRED_TEST_PLAN_ITEMS.length,
    }),
    nextPhase: blockers.length ? null : Object.freeze({
      phase: 57,
      key: 'otp_template_renewal_work_package_draft',
      label: 'Template Renewal Work Package Draft',
    }),
  })
}

export function formatOtpTemplateRenewalScopingAndTriagePhase56Markdown(report = buildOtpTemplateRenewalScopingAndTriagePhase56Audit()) {
  const readyReceipt = report.scopingReceipts.find((receipt) => receipt.canPrepareWorkPackageDraft) || report.scopingReceipts[0]
  return [
    '# OTP Generator Phase 56 Template Renewal Scoping And Triage',
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
        ['Ready scopes', report.summary.readyScopingCount],
        ['Blocked scopes', report.summary.blockedScopingCount],
        ['Routes', report.summary.routeCount],
        ['Test plan items', report.summary.testPlanCount],
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
    '## Scope Decision',
    '',
    table(
      ['Field', 'Value'],
      [
        ['Scoping ID', readyReceipt.scopeDecision.scopingId],
        ['Priority', readyReceipt.scopeDecision.priority],
        ['Route separation', readyReceipt.scopeDecision.routeSeparationMode],
        ['Intake fingerprint', readyReceipt.scopeDecision.intakeFingerprint],
        ['Scoping fingerprint', readyReceipt.scopingFingerprint],
        ['In scope', readyReceipt.scopeDecision.inScopeChangeTypes.join(', ')],
        ['Out of scope', readyReceipt.scopeDecision.outOfScopeChangeTypes.join(', ')],
      ],
    ),
    '',
    '## Route Work Packages',
    '',
    table(
      ['Route', 'Work Package', 'Clauses', 'Fields', 'Acceptance Criteria'],
      readyReceipt.routeScopePlans.map((route) => [
        route.routeVariant,
        route.workPackageKey,
        route.clausesToReview.join(', '),
        route.fieldsToReview.join(', '),
        route.acceptanceCriteria.join('; '),
      ]),
    ),
    '',
    '## Attorney Triage',
    '',
    table(
      ['Field', 'Value'],
      [
        ['review_required', readyReceipt.attorneyTriage.reviewRequired ? 'yes' : 'no'],
        ['route_review_queued', readyReceipt.attorneyTriage.routeLegalReviewQueued ? 'yes' : 'no'],
        ['approval_granted', readyReceipt.attorneyTriage.attorneyApprovalGranted ? 'yes' : 'no'],
        ['review_mode', readyReceipt.attorneyTriage.reviewMode],
        ['reference', readyReceipt.attorneyTriage.attorneyTriageReference],
      ],
    ),
    '',
    '## Test Plan',
    '',
    table(
      ['Test', 'Status', 'Owner', 'Required Before Publication'],
      readyReceipt.testPlan.map((item) => [
        item.key,
        item.status,
        item.owner,
        item.requiredBeforePublication ? 'yes' : 'no',
      ]),
    ),
    '',
    '## Scoping Receipts',
    '',
    table(
      ['Status', 'Ready', 'Routes', 'Assignments', 'Tests', 'Blockers'],
      report.scopingReceipts.map((receipt) => [
        receipt.status,
        receipt.canPrepareWorkPackageDraft ? 'yes' : 'no',
        receipt.summary.scopedRouteCount,
        receipt.summary.assignmentCount,
        receipt.summary.testPlanCount,
        receipt.blockerCodes.join(', ') || 'none',
      ]),
    ),
    '',
    '## Boundary',
    '',
    'Phase 56 converts an accepted renewal intake into scoped, route-separated work packages. It records ownership, risk classification, attorney triage, test planning, rollback planning, and no-write proof. It does not draft new legal wording, approve attorney changes, publish a version, mutate route defaults, alter signing envelopes, or dispatch signing links.',
    '',
  ].join('\n')
}
