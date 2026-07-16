export const CONVEYANCER_PRODUCT_BASELINE_VERSION = 'conveyancer_product_baseline_p0_v1'

export const CONVEYANCER_PRODUCT_BASELINE_STATUSES = Object.freeze({
  draft: 'draft',
  ready: 'ready',
  blocked: 'blocked',
})

export const CONVEYANCER_PRODUCT_PERSISTENCE_MODES = Object.freeze({
  canonical: 'canonical_persisted',
  appendOnly: 'append_only_persisted',
  configuration: 'versioned_configuration',
  projection: 'derived_projection',
  externalReference: 'external_reference_only',
})

export const CONVEYANCER_PRODUCT_CANONICAL_TERMS = Object.freeze({
  matterStatuses: Object.freeze({
    notStarted: 'not_started',
    ready: 'ready',
    inProgress: 'in_progress',
    waitingExternal: 'waiting_external',
    actionRequired: 'action_required',
    blocked: 'blocked',
    completed: 'completed',
    cancelled: 'cancelled',
    superseded: 'superseded',
  }),
  evidenceStatuses: Object.freeze({
    captured: 'captured',
    underReview: 'under_review',
    accepted: 'accepted',
    rejected: 'rejected',
    expired: 'expired',
    revoked: 'revoked',
    superseded: 'superseded',
  }),
  readinessTerms: Object.freeze({
    complete: 'All required work and evidence for the bounded outcome are satisfied.',
    reviewed: 'An authorised human has made an evidence-bound review decision.',
    ready: 'All current preconditions for the proposed next action are satisfied.',
    registered: 'Registration is supported by reviewed registration evidence; a stage label alone is insufficient.',
  }),
})

export const CONVEYANCER_PRODUCT_PILOT_ARCHETYPES = Object.freeze([
  Object.freeze({
    id: 'cash_no_existing_bond',
    label: 'Cash transfer without existing bond',
    financeType: 'cash',
    sellerHasExistingBond: false,
    propertyTenure: 'freehold',
    requiredLanes: Object.freeze(['transfer']),
    requiredExternalEvidence: Object.freeze(['transfer_duty', 'municipal_clearance', 'deeds_progression']),
  }),
  Object.freeze({
    id: 'cash_existing_bond',
    label: 'Cash transfer with cancellation',
    financeType: 'cash',
    sellerHasExistingBond: true,
    propertyTenure: 'freehold',
    requiredLanes: Object.freeze(['transfer', 'cancellation']),
    requiredExternalEvidence: Object.freeze(['cancellation_figures', 'transfer_duty', 'municipal_clearance', 'deeds_progression']),
  }),
  Object.freeze({
    id: 'financed_no_existing_bond',
    label: 'Financed purchase without cancellation',
    financeType: 'bond',
    sellerHasExistingBond: false,
    propertyTenure: 'freehold',
    requiredLanes: Object.freeze(['transfer', 'bond']),
    requiredExternalEvidence: Object.freeze(['bank_instruction', 'bank_guarantee', 'transfer_duty', 'municipal_clearance', 'deeds_progression']),
  }),
  Object.freeze({
    id: 'financed_existing_bond',
    label: 'Financed purchase with cancellation',
    financeType: 'hybrid',
    sellerHasExistingBond: true,
    propertyTenure: 'freehold',
    requiredLanes: Object.freeze(['transfer', 'bond', 'cancellation']),
    requiredExternalEvidence: Object.freeze(['bank_instruction', 'bank_guarantee', 'cancellation_figures', 'transfer_duty', 'municipal_clearance', 'deeds_progression']),
  }),
  Object.freeze({
    id: 'sectional_financed_existing_bond',
    label: 'Sectional-title financed purchase with cancellation',
    financeType: 'hybrid',
    sellerHasExistingBond: true,
    propertyTenure: 'sectional_title',
    requiredLanes: Object.freeze(['transfer', 'bond', 'cancellation']),
    requiredExternalEvidence: Object.freeze(['bank_instruction', 'bank_guarantee', 'cancellation_figures', 'transfer_duty', 'municipal_clearance', 'levy_clearance', 'deeds_progression']),
  }),
])

export const CONVEYANCER_PRODUCT_RECORD_CATALOGUE = Object.freeze([
  Object.freeze({ key: 'matter', domain: 'matter', mode: 'canonical_persisted', sourceOfTruth: 'platform_matter', writeAuthority: 'matter_intake_service' }),
  Object.freeze({ key: 'matter_plan', domain: 'planning', mode: 'canonical_persisted', sourceOfTruth: 'a1_matter_plan', writeAuthority: 'matter_plan_orchestrator' }),
  Object.freeze({ key: 'action_execution', domain: 'planning', mode: 'append_only_persisted', sourceOfTruth: 'a5_action_event', writeAuthority: 'action_command_handler' }),
  Object.freeze({ key: 'action_queue', domain: 'planning', mode: 'derived_projection', sourceOfTruth: 'matter_plan_and_action_events', writeAuthority: 'projection_engine' }),
  Object.freeze({ key: 'exception', domain: 'exceptions', mode: 'canonical_persisted', sourceOfTruth: 'b1_exception', writeAuthority: 'exception_orchestrator' }),
  Object.freeze({ key: 'exception_decision', domain: 'exceptions', mode: 'append_only_persisted', sourceOfTruth: 'b4_b6_decision_event', writeAuthority: 'exception_command_handler' }),
  Object.freeze({ key: 'template', domain: 'documents', mode: 'versioned_configuration', sourceOfTruth: 'c1_template_governance', writeAuthority: 'template_governance_service' }),
  Object.freeze({ key: 'document_artifact', domain: 'documents', mode: 'canonical_persisted', sourceOfTruth: 'c2_c7_document_lifecycle', writeAuthority: 'document_service' }),
  Object.freeze({ key: 'signing_record', domain: 'signing', mode: 'canonical_persisted', sourceOfTruth: 'd1_d4_signing_lifecycle', writeAuthority: 'signing_orchestrator' }),
  Object.freeze({ key: 'financial_model', domain: 'financial', mode: 'canonical_persisted', sourceOfTruth: 'd5_financial_model', writeAuthority: 'financial_orchestrator' }),
  Object.freeze({ key: 'financial_event', domain: 'financial', mode: 'append_only_persisted', sourceOfTruth: 'd6_d7_financial_decision', writeAuthority: 'financial_command_handler' }),
  Object.freeze({ key: 'coordination', domain: 'coordination', mode: 'canonical_persisted', sourceOfTruth: 'e1_coordination_contract', writeAuthority: 'coordination_orchestrator' }),
  Object.freeze({ key: 'professional_timeline', domain: 'coordination', mode: 'derived_projection', sourceOfTruth: 'coordination_and_milestone_evidence', writeAuthority: 'projection_engine' }),
  Object.freeze({ key: 'evidence', domain: 'evidence', mode: 'canonical_persisted', sourceOfTruth: 'canonical_evidence_register', writeAuthority: 'evidence_service' }),
  Object.freeze({ key: 'evidence_review', domain: 'evidence', mode: 'append_only_persisted', sourceOfTruth: 'human_review_decision', writeAuthority: 'evidence_review_handler' }),
  Object.freeze({ key: 'lodgement_readiness', domain: 'coordination', mode: 'derived_projection', sourceOfTruth: 'e5_attestations_and_current_evidence', writeAuthority: 'projection_engine' }),
  Object.freeze({ key: 'integration_profile', domain: 'integrations', mode: 'versioned_configuration', sourceOfTruth: 'f1_provider_registry', writeAuthority: 'integration_governance_service' }),
  Object.freeze({ key: 'inbound_integration_event', domain: 'integrations', mode: 'append_only_persisted', sourceOfTruth: 'signed_provider_envelope', writeAuthority: 'integration_inbox' }),
  Object.freeze({ key: 'outbound_integration_command', domain: 'integrations', mode: 'append_only_persisted', sourceOfTruth: 'approved_platform_command', writeAuthority: 'integration_outbox' }),
  Object.freeze({ key: 'external_document', domain: 'evidence', mode: 'external_reference_only', sourceOfTruth: 'secure_object_store', writeAuthority: 'document_storage_service' }),
  Object.freeze({ key: 'assurance_report', domain: 'assurance', mode: 'append_only_persisted', sourceOfTruth: 'a7_b7_c8_d8_e7_f8_assurance', writeAuthority: 'assurance_pipeline' }),
])

export const CONVEYANCER_PRODUCT_SOURCE_OF_TRUTH_MATRIX = Object.freeze([
  Object.freeze({ domain: 'matter_identity', canonicalSource: 'platform_matter', conflictPolicy: 'manual_review', externalOverwriteAllowed: false }),
  Object.freeze({ domain: 'parties_and_property', canonicalSource: 'verified_matter_facts', conflictPolicy: 'manual_review', externalOverwriteAllowed: false }),
  Object.freeze({ domain: 'planning', canonicalSource: 'a1_active_matter_plan', conflictPolicy: 'new_plan_version', externalOverwriteAllowed: false }),
  Object.freeze({ domain: 'actions', canonicalSource: 'append_only_action_events', conflictPolicy: 'reject_conflicting_command', externalOverwriteAllowed: false }),
  Object.freeze({ domain: 'exceptions', canonicalSource: 'b_series_exception_ledger', conflictPolicy: 'append_decision', externalOverwriteAllowed: false }),
  Object.freeze({ domain: 'documents', canonicalSource: 'approved_document_artifact', conflictPolicy: 'new_artifact_version', externalOverwriteAllowed: false }),
  Object.freeze({ domain: 'signing', canonicalSource: 'reviewed_signing_evidence', conflictPolicy: 'manual_review', externalOverwriteAllowed: false }),
  Object.freeze({ domain: 'financial', canonicalSource: 'approved_financial_model_and_events', conflictPolicy: 'reconciliation_required', externalOverwriteAllowed: false }),
  Object.freeze({ domain: 'coordination', canonicalSource: 'e1_coordination_ledger', conflictPolicy: 'append_or_supersede', externalOverwriteAllowed: false }),
  Object.freeze({ domain: 'evidence', canonicalSource: 'accepted_canonical_evidence', conflictPolicy: 'replacement_review_required', externalOverwriteAllowed: false }),
  Object.freeze({ domain: 'provider_events', canonicalSource: 'signed_f1_inbox_envelope', conflictPolicy: 'idempotency_or_quarantine', externalOverwriteAllowed: false }),
  Object.freeze({ domain: 'registration', canonicalSource: 'reviewed_registration_evidence', conflictPolicy: 'legal_review_required', externalOverwriteAllowed: false }),
])

export const CONVEYANCER_PRODUCT_THREAT_MODEL = Object.freeze([
  Object.freeze({ id: 'cross_tenant_access', category: 'tenancy', severity: 'critical', control: 'organisation_and_firm_scope_required', owner: 'security' }),
  Object.freeze({ id: 'wrong_firm_action', category: 'authorisation', severity: 'critical', control: 'exact_appointed_firm_binding', owner: 'legal' }),
  Object.freeze({ id: 'privileged_information_disclosure', category: 'privilege', severity: 'critical', control: 'classification_and_matter_access_policy', owner: 'privacy' }),
  Object.freeze({ id: 'personal_information_exposure', category: 'privacy', severity: 'critical', control: 'reference_only_payloads_and_minimisation', owner: 'privacy' }),
  Object.freeze({ id: 'evidence_tampering', category: 'integrity', severity: 'critical', control: 'fingerprint_and_append_only_lineage', owner: 'security' }),
  Object.freeze({ id: 'webhook_replay', category: 'integration', severity: 'critical', control: 'signature_nonce_and_replay_window', owner: 'security' }),
  Object.freeze({ id: 'duplicate_command_execution', category: 'reliability', severity: 'critical', control: 'idempotency_and_transactional_outbox', owner: 'operations' }),
  Object.freeze({ id: 'provider_creates_legal_truth', category: 'legal', severity: 'critical', control: 'human_review_before_canonical_evidence', owner: 'legal' }),
  Object.freeze({ id: 'unauthorised_money_movement', category: 'financial', severity: 'critical', control: 'preparation_only_and_dual_approval_boundary', owner: 'legal' }),
  Object.freeze({ id: 'stale_or_expired_evidence', category: 'operational', severity: 'high', control: 'expiry_recalculation_and_readiness_block', owner: 'operations' }),
  Object.freeze({ id: 'migration_data_loss', category: 'migration', severity: 'critical', control: 'dry_run_reconciliation_backup_and_restore', owner: 'data' }),
  Object.freeze({ id: 'failed_release_without_recovery', category: 'continuity', severity: 'critical', control: 'feature_flag_kill_switch_and_rollback_owner', owner: 'rollback' }),
])

export const CONVEYANCER_PRODUCT_MIGRATION_POLICY = Object.freeze({
  strategy: 'expand_migrate_verify_contract',
  forwardRepairPreferred: true,
  destructiveRollbackAllowed: false,
  dryRunRequired: true,
  backupRequired: true,
  restoreTestRequired: true,
  rowCountReconciliationRequired: true,
  fingerprintReconciliationRequired: true,
  featureFlagActivationRequired: true,
  pilotCohortRequired: true,
  rollbackOwnerRequired: true,
})

export const CONVEYANCER_PRODUCT_SUCCESS_METRICS = Object.freeze([
  Object.freeze({ key: 'pilot_scenario_coverage', target: 1, comparator: 'equals', unit: 'ratio' }),
  Object.freeze({ key: 'deterministic_plan_rate', target: 1, comparator: 'equals', unit: 'ratio' }),
  Object.freeze({ key: 'deterministic_action_queue_rate', target: 1, comparator: 'equals', unit: 'ratio' }),
  Object.freeze({ key: 'evidence_lineage_complete_rate', target: 1, comparator: 'equals', unit: 'ratio' }),
  Object.freeze({ key: 'unauthorised_action_successes', target: 0, comparator: 'equals', unit: 'count' }),
  Object.freeze({ key: 'cross_tenant_access_successes', target: 0, comparator: 'equals', unit: 'count' }),
  Object.freeze({ key: 'provider_required_for_manual_workflow', target: 0, comparator: 'equals', unit: 'count' }),
  Object.freeze({ key: 'unreviewed_external_legal_outcomes', target: 0, comparator: 'equals', unit: 'count' }),
  Object.freeze({ key: 'migration_reconciliation_variance', target: 0, comparator: 'equals', unit: 'count' }),
  Object.freeze({ key: 'critical_open_pilot_findings', target: 0, comparator: 'equals', unit: 'count' }),
])

const SERIES_PHASE_COUNTS = Object.freeze({ A: 7, B: 7, C: 8, D: 8, E: 7, F: 8 })
const SERIES_DOMAINS = Object.freeze({ A: 'planning', B: 'exceptions', C: 'documents', D: 'signing_and_financial', E: 'coordination', F: 'integrations' })
const SERIES_RECORD_KEYS = Object.freeze({ A: 'matter_plan', B: 'exception', C: 'document_artifact', D: 'signing_record', E: 'coordination', F: 'integration_profile' })

export const CONVEYANCER_PRODUCT_PHASE_IDS = Object.freeze(
  Object.entries(SERIES_PHASE_COUNTS).flatMap(([series, count]) =>
    Array.from({ length: count }, (_, index) => `${series}${index + 1}`),
  ),
)

export const CONVEYANCER_PRODUCT_PHASE_TRACEABILITY = Object.freeze(
  CONVEYANCER_PRODUCT_PHASE_IDS.map((phase) => Object.freeze({
    phase,
    domain: SERIES_DOMAINS[phase[0]],
    baselineRecordKey: SERIES_RECORD_KEYS[phase[0]],
    verificationRequired: true,
  })),
)

export const CONVEYANCER_PRODUCT_BASELINE_BOUNDARY = Object.freeze({
  definitionOnly: true,
  manualFirst: true,
  integrationOptional: true,
  databaseWritesPerformed: false,
  migrationsExecuted: false,
  workflowsMutated: false,
  externalCallsPerformed: false,
  notificationsSent: false,
  documentsRendered: false,
  moneyMoved: false,
  registrationOutcomeMutated: false,
  deploymentPerformed: false,
})

const REQUIRED_APPROVALS = Object.freeze(['product', 'legal', 'security', 'data', 'operations', 'rollback'])

function text(value = '') { return String(value ?? '').trim() }
function validDate(value) { return Boolean(value && Number.isFinite(new Date(value).getTime())) }
function iso(value) { return validDate(value) ? new Date(value).toISOString() : value || null }
function stable(value) {
  if (Array.isArray(value)) return value.map(stable)
  if (!value || typeof value !== 'object') return value
  return Object.keys(value).sort().reduce((result, key) => { result[key] = stable(value[key]); return result }, {})
}
function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  Object.values(value).forEach(deepFreeze)
  return Object.freeze(value)
}
function fnv(value) {
  const source = JSON.stringify(stable(value)); let hash = 0x811c9dc5
  for (let index = 0; index < source.length; index += 1) { hash ^= source.charCodeAt(index); hash = Math.imul(hash, 0x01000193) }
  return `fnv1a_${(hash >>> 0).toString(16).padStart(8, '0')}`
}
function snapshot(value = {}) { const copy = stable(value); delete copy.fingerprint; return copy }
function equal(left, right) { return JSON.stringify(stable(left)) === JSON.stringify(stable(right)) }
function unique(values = []) { return [...new Set(values.filter(Boolean))] }
function approval(input = {}) {
  return { area: text(input.area).toLowerCase(), decision: text(input.decision).toLowerCase(), userId: text(input.userId || input.user_id) || null, approvedAt: iso(input.approvedAt || input.approved_at), referenceId: text(input.referenceId || input.reference_id) || null }
}
function boundaryValid(value = {}) { return Object.entries(CONVEYANCER_PRODUCT_BASELINE_BOUNDARY).every(([key, expected]) => value.controls?.[key] === expected) }

export function validateConveyancerProductBaseline(input = {}) {
  const value = JSON.parse(JSON.stringify(input || {})); const errors = []
  if (value.version !== CONVEYANCER_PRODUCT_BASELINE_VERSION || !value.baselineId || !value.releaseCandidateId || !value.organisationId) errors.push('product_baseline_identity_invalid')
  if (!validDate(value.generatedAt) || !value.generatedBy?.userId || !['product_owner', 'system'].includes(value.generatedBy?.role)) errors.push('product_baseline_provenance_invalid')
  if (!equal(value.canonicalTerms, CONVEYANCER_PRODUCT_CANONICAL_TERMS)) errors.push('product_baseline_terminology_drift')
  if (!equal(value.pilotArchetypes, CONVEYANCER_PRODUCT_PILOT_ARCHETYPES)) errors.push('product_baseline_pilot_scope_invalid')
  if (!equal(value.recordCatalogue, CONVEYANCER_PRODUCT_RECORD_CATALOGUE)) errors.push('product_baseline_record_catalogue_invalid')
  if (!equal(value.sourceOfTruthMatrix, CONVEYANCER_PRODUCT_SOURCE_OF_TRUTH_MATRIX)) errors.push('product_baseline_source_of_truth_invalid')
  if (!equal(value.threatModel, CONVEYANCER_PRODUCT_THREAT_MODEL)) errors.push('product_baseline_threat_model_invalid')
  if (!equal(value.migrationPolicy, CONVEYANCER_PRODUCT_MIGRATION_POLICY)) errors.push('product_baseline_migration_policy_invalid')
  if (!equal(value.successMetrics, CONVEYANCER_PRODUCT_SUCCESS_METRICS)) errors.push('product_baseline_success_metrics_invalid')
  if (!equal(value.phaseTraceability, CONVEYANCER_PRODUCT_PHASE_TRACEABILITY)) errors.push('product_baseline_phase_traceability_invalid')
  if (unique((value.phaseTraceability || []).map((item) => item.phase)).length !== CONVEYANCER_PRODUCT_PHASE_IDS.length) errors.push('product_baseline_phase_coverage_invalid')
  const recordKeys = new Set((value.recordCatalogue || []).map((item) => item.key))
  if ((value.phaseTraceability || []).some((item) => !recordKeys.has(item.baselineRecordKey))) errors.push('product_baseline_trace_record_missing')
  if ((value.recordCatalogue || []).some((item) => !Object.values(CONVEYANCER_PRODUCT_PERSISTENCE_MODES).includes(item.mode))) errors.push('product_baseline_persistence_mode_invalid')
  if ((value.sourceOfTruthMatrix || []).some((item) => item.externalOverwriteAllowed !== false)) errors.push('product_baseline_external_overwrite_forbidden')
  const approvals = Array.isArray(value.approvals) ? value.approvals : []
  const approvalAreas = approvals.map((item) => item.area)
  if (approvalAreas.length !== REQUIRED_APPROVALS.length || unique(approvalAreas).length !== REQUIRED_APPROVALS.length || REQUIRED_APPROVALS.some((area) => !approvalAreas.includes(area))) errors.push('product_baseline_approval_coverage_invalid')
  if (approvals.some((item) => item.decision !== 'accepted' || !item.userId || !validDate(item.approvedAt) || new Date(item.approvedAt) < new Date(value.generatedAt) || !item.referenceId)) errors.push('product_baseline_approval_invalid')
  if (unique(approvals.map((item) => item.userId)).length !== approvals.length) errors.push('product_baseline_independent_approvers_required')
  if (value.status !== CONVEYANCER_PRODUCT_BASELINE_STATUSES.ready) errors.push('product_baseline_not_ready')
  if (!boundaryValid(value)) errors.push('product_baseline_side_effect_boundary_violated')
  if (value.fingerprint !== fnv(snapshot(value))) errors.push('product_baseline_fingerprint_invalid')
  return deepFreeze({ valid: errors.length === 0, errors: unique(errors), baseline: value })
}

export function buildConveyancerProductBaseline(input = {}) {
  const approvals = (Array.isArray(input.approvals) ? input.approvals : []).map(approval).sort((a, b) => a.area.localeCompare(b.area))
  const hasApprovals = REQUIRED_APPROVALS.every((area) => approvals.some((item) => item.area === area && item.decision === 'accepted'))
  const value = {
    version: CONVEYANCER_PRODUCT_BASELINE_VERSION,
    baselineId: text(input.baselineId),
    releaseCandidateId: text(input.releaseCandidateId),
    organisationId: text(input.organisationId),
    status: hasApprovals ? CONVEYANCER_PRODUCT_BASELINE_STATUSES.ready : CONVEYANCER_PRODUCT_BASELINE_STATUSES.draft,
    generatedAt: iso(input.generatedAt),
    generatedBy: { role: text(input.generatedBy?.role).toLowerCase(), userId: text(input.generatedBy?.userId || input.generatedBy?.user_id) || null },
    canonicalTerms: CONVEYANCER_PRODUCT_CANONICAL_TERMS,
    pilotArchetypes: CONVEYANCER_PRODUCT_PILOT_ARCHETYPES,
    recordCatalogue: CONVEYANCER_PRODUCT_RECORD_CATALOGUE,
    sourceOfTruthMatrix: CONVEYANCER_PRODUCT_SOURCE_OF_TRUTH_MATRIX,
    threatModel: CONVEYANCER_PRODUCT_THREAT_MODEL,
    migrationPolicy: CONVEYANCER_PRODUCT_MIGRATION_POLICY,
    successMetrics: CONVEYANCER_PRODUCT_SUCCESS_METRICS,
    phaseTraceability: CONVEYANCER_PRODUCT_PHASE_TRACEABILITY,
    approvals,
    controls: CONVEYANCER_PRODUCT_BASELINE_BOUNDARY,
    fingerprint: null,
  }
  value.fingerprint = fnv(snapshot(value))
  const validation = validateConveyancerProductBaseline(value)
  return deepFreeze({ ok: validation.valid, code: validation.valid ? 'product_baseline_ready' : 'product_baseline_invalid', errors: validation.errors, baseline: validation.baseline })
}

export function evaluateConveyancerProductBaselineMetrics({ baseline = {}, measurements = {} } = {}) {
  const validation = validateConveyancerProductBaseline(baseline); const results = CONVEYANCER_PRODUCT_SUCCESS_METRICS.map((metric) => {
    const measured = Number(measurements[metric.key]); const present = Number.isFinite(measured)
    const passed = present && (metric.comparator === 'equals' ? measured === metric.target : false)
    return { ...metric, measured: present ? measured : null, passed }
  })
  const failures = results.filter((item) => !item.passed).map((item) => item.key)
  return deepFreeze({ version: CONVEYANCER_PRODUCT_BASELINE_VERSION, baselineId: baseline.baselineId || null, baselineFingerprint: baseline.fingerprint || null, decision: validation.valid && !failures.length ? 'ready_for_p1' : 'blocked', results, failures, controls: CONVEYANCER_PRODUCT_BASELINE_BOUNDARY })
}

export function serializeConveyancerProductBaselineEvidence({ baseline = {}, metricEvaluation = null } = {}) {
  return JSON.stringify(stable({
    version: CONVEYANCER_PRODUCT_BASELINE_VERSION,
    baseline: {
      baselineId: baseline.baselineId || null,
      releaseCandidateId: baseline.releaseCandidateId || null,
      organisationId: baseline.organisationId || null,
      status: baseline.status || null,
      generatedAt: baseline.generatedAt || null,
      generatedBy: baseline.generatedBy || null,
      pilotArchetypeIds: (baseline.pilotArchetypes || []).map((item) => item.id),
      recordKeys: (baseline.recordCatalogue || []).map((item) => item.key),
      phaseIds: (baseline.phaseTraceability || []).map((item) => item.phase),
      approvalEvidence: (baseline.approvals || []).map((item) => ({ area: item.area, decision: item.decision, approvedAt: item.approvedAt, referenceId: item.referenceId })),
      controls: baseline.controls || {},
      fingerprint: baseline.fingerprint || null,
    },
    metrics: metricEvaluation ? { decision: metricEvaluation.decision, results: metricEvaluation.results, failures: metricEvaluation.failures } : null,
  }))
}
