import {
  CONVEYANCER_SIGNING_CAPACITY_STATUSES,
  validateConveyancerSigningCapacity,
} from '../../core/documents/conveyancerSigningCapacityModel.js'
import {
  CONVEYANCER_SIGNING_PLAN_STATUSES,
  validateConveyancerSigningPlan,
} from '../../core/documents/conveyancerSigningPlan.js'
import {
  CONVEYANCER_FINANCIAL_MODEL_STATUSES,
  validateConveyancerFinancialModel,
} from '../../core/transactions/conveyancerFinancialModel.js'
import {
  CONVEYANCER_SIGNING_APPOINTMENT_CAPABILITIES,
  CONVEYANCER_SIGNING_APPOINTMENT_STATUSES,
  canConveyancerSigningAppointmentActor,
  validateConveyancerSigningAppointmentWorkflow,
} from './conveyancerSigningAppointmentWorkflow.js'
import {
  CONVEYANCER_SIGNED_PACK_REVIEW_CAPABILITIES,
  CONVEYANCER_SIGNED_PACK_REVIEW_STATUSES,
  canConveyancerSignedPackReviewActor,
  validateConveyancerSignedPackReview,
} from './conveyancerSignedPackReview.js'
import {
  CONVEYANCER_FINANCIAL_RECONCILIATION_CAPABILITIES,
  CONVEYANCER_FINANCIAL_RECONCILIATION_STATUSES,
  canConveyancerFinancialReconciliationActor,
  validateConveyancerFinancialReconciliation,
} from './conveyancerFinancialReconciliation.js'
import {
  CONVEYANCER_FINAL_ACCOUNT_CAPABILITIES,
  CONVEYANCER_FINAL_ACCOUNT_STATUSES,
  canConveyancerFinalAccountActor,
  validateConveyancerFinalAccount,
} from './conveyancerFinalAccountWorkflow.js'

export const CONVEYANCER_D_SERIES_ASSURANCE_VERSION = 'conveyancer_d_series_assurance_v1'

export const CONVEYANCER_D_SERIES_ASSURANCE_DECISIONS = Object.freeze({
  ready: 'ready',
  observe: 'observe',
  blocked: 'blocked',
})

export const CONVEYANCER_D_SERIES_PILOT_DECISIONS = Object.freeze({
  go: 'go',
  observe: 'observe',
  hold: 'hold',
})

export const CONVEYANCER_D_SERIES_PILOT_THRESHOLDS = Object.freeze({
  minimumScenarioPassRate: 1,
  maximumContractFailures: 0,
  maximumAuditGaps: 0,
  maximumBindingFailures: 0,
  maximumSideEffectAttempts: 0,
  observeMatterExceptionRate: 0.1,
  maximumMatterExceptionRate: 0.25,
})

const DECISION = CONVEYANCER_D_SERIES_ASSURANCE_DECISIONS
const PILOT = CONVEYANCER_D_SERIES_PILOT_DECISIONS
const SIDE_EFFECT_KEYS = Object.freeze([
  'persistencePerformed', 'calendarEventCreated', 'notificationsSent', 'signatureEvidenceRecorded',
  'dispatchPerformed', 'registrationUpdated', 'documentMoved', 'paymentPerformed',
  'trustPostingPerformed', 'statementIssued', 'renderingPerformed', 'deliveryPerformed',
])

function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)) }
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
function text(value) { return typeof value === 'string' ? value.trim() : '' }
function number(value, fallback = 0) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : fallback }
function equal(left, right) { return JSON.stringify(stable(left)) === JSON.stringify(stable(right)) }
function unique(values) { return [...new Set(values)] }
function finding(code, phase, category, severity, evidenceId = null, details = []) {
  return { code, phase, category, severity, evidenceId, details: unique(details) }
}
function laneAuthorised(role, lane, includeOperational = false) {
  if (role === 'system') return true
  if (role === 'firm_manager') return true
  if (includeOperational && ['secretary', 'accounts'].includes(role)) return ['transfer', 'bond', 'cancellation'].includes(lane)
  if (lane === 'transfer') return ['conveyancer', 'transfer_attorney'].includes(role)
  if (lane === 'bond') return role === 'bond_attorney'
  if (lane === 'cancellation') return role === 'cancellation_attorney'
  return false
}

function eventCapability(phase, commandType) {
  if (phase === 'D3') return ({
    propose: CONVEYANCER_SIGNING_APPOINTMENT_CAPABILITIES.propose,
    record_response: CONVEYANCER_SIGNING_APPOINTMENT_CAPABILITIES.recordResponse,
    request_reschedule: CONVEYANCER_SIGNING_APPOINTMENT_CAPABILITIES.recordResponse,
    reschedule: CONVEYANCER_SIGNING_APPOINTMENT_CAPABILITIES.reschedule,
    confirm: CONVEYANCER_SIGNING_APPOINTMENT_CAPABILITIES.confirm,
    record_attendance: CONVEYANCER_SIGNING_APPOINTMENT_CAPABILITIES.recordAttendance,
    complete: CONVEYANCER_SIGNING_APPOINTMENT_CAPABILITIES.complete,
    cancel: CONVEYANCER_SIGNING_APPOINTMENT_CAPABILITIES.cancel,
  })[commandType]
  if (phase === 'D4') return ({
    start_review: CONVEYANCER_SIGNED_PACK_REVIEW_CAPABILITIES.start,
    recommend_acceptance: CONVEYANCER_SIGNED_PACK_REVIEW_CAPABILITIES.review,
    request_correction: CONVEYANCER_SIGNED_PACK_REVIEW_CAPABILITIES.review,
    accept: CONVEYANCER_SIGNED_PACK_REVIEW_CAPABILITIES.accept,
    reject: CONVEYANCER_SIGNED_PACK_REVIEW_CAPABILITIES.reject,
  })[commandType]
  if (phase === 'D6') return ({
    start_reconciliation: CONVEYANCER_FINANCIAL_RECONCILIATION_CAPABILITIES.prepare,
    recommend_reconciliation: CONVEYANCER_FINANCIAL_RECONCILIATION_CAPABILITIES.prepare,
    request_correction: CONVEYANCER_FINANCIAL_RECONCILIATION_CAPABILITIES.review,
    approve_reconciliation: CONVEYANCER_FINANCIAL_RECONCILIATION_CAPABILITIES.approve,
    reject_reconciliation: CONVEYANCER_FINANCIAL_RECONCILIATION_CAPABILITIES.review,
  })[commandType]
  return ({
    start_final_account: CONVEYANCER_FINAL_ACCOUNT_CAPABILITIES.prepare,
    recommend_approval: CONVEYANCER_FINAL_ACCOUNT_CAPABILITIES.prepare,
    request_correction: CONVEYANCER_FINAL_ACCOUNT_CAPABILITIES.review,
    approve_final_account: CONVEYANCER_FINAL_ACCOUNT_CAPABILITIES.approve,
    reject_final_account: CONVEYANCER_FINAL_ACCOUNT_CAPABILITIES.review,
  })[commandType]
}

function canActor(phase, role, capability) {
  if (!capability) return false
  if (phase === 'D3') return canConveyancerSigningAppointmentActor(role, capability)
  if (phase === 'D4') return canConveyancerSignedPackReviewActor(role, capability)
  if (phase === 'D6') return canConveyancerFinancialReconciliationActor(role, capability)
  return canConveyancerFinalAccountActor(role, capability)
}

function runtimeSnapshot(phase, record) {
  if (phase === 'D3') return {
    status: record.status,
    runtimeRevision: record.runtimeRevision,
    readinessStatus: record.readiness?.status,
    bindingFingerprint: record.bindingFingerprint,
  }
  if (phase === 'D4') return stable({
    status: record.status,
    reviewDecision: record.reviewDecision ? { type: record.reviewDecision.type, reasonCode: record.reviewDecision.reasonCode || null, reviewedAt: record.reviewDecision.reviewedAt, reviewedBy: record.reviewDecision.reviewedBy, controls: record.reviewDecision.controls || null } : null,
    acceptance: record.acceptance ? { acceptedAt: record.acceptance.acceptedAt, acceptedBy: record.acceptance.acceptedBy } : null,
    runtimeRevision: record.runtimeRevision,
    updatedAt: record.updatedAt,
    lastEventId: record.lastEventId,
  })
  return stable({
    status: record.status,
    recommendation: record.recommendation ? { recommendedAt: record.recommendation.recommendedAt, recommendedBy: record.recommendation.recommendedBy, controls: record.recommendation.controls } : null,
    decision: record.decision ? { type: record.decision.type, reasonCode: record.decision.reasonCode || null, decidedAt: record.decision.decidedAt, decidedBy: record.decision.decidedBy } : null,
    runtimeRevision: record.runtimeRevision,
    updatedAt: record.updatedAt,
    lastEventId: record.lastEventId,
  })
}

function auditRecord({ phase, record, events, idKey, revisionKey, startCommand, startStatus, lane, bindingChecks = {} }) {
  const id = record[idKey]
  const eventRevision = (event) => revisionKey ? event[revisionKey] : event.after?.runtimeRevision
  const matched = events.filter((event) => event[idKey] === id).sort((a, b) => eventRevision(a) - eventRevision(b))
  const errors = []
  if (matched.length !== record.runtimeRevision) errors.push('event_count_mismatch')
  if (new Set(matched.map((event) => event.eventId)).size !== matched.length) errors.push('duplicate_event_id')
  if (new Set(matched.map((event) => event.commandId)).size !== matched.length) errors.push('duplicate_command_id')
  matched.forEach((event, index) => {
    const revision = index + 1
    if (eventRevision(event) !== revision || event.after?.runtimeRevision !== revision || event.before?.runtimeRevision !== revision - 1) errors.push(`revision_${revision}_continuity_invalid`)
    if (index === 0 && (event.commandType !== startCommand || event.before?.status !== startStatus)) errors.push('start_event_invalid')
    if (index > 0 && !equal(event.before, matched[index - 1].after)) errors.push(`revision_${revision}_snapshot_gap`)
    if (!event.eventId || !event.commandId || !event.occurredAt || Number.isNaN(Date.parse(event.occurredAt))) errors.push(`revision_${revision}_identity_invalid`)
    const operationalLaneAccess = phase === 'D3' || (phase === 'D4' && event.commandType === startCommand) || ['start_reconciliation', 'recommend_reconciliation', 'start_final_account', 'recommend_approval'].includes(event.commandType)
    if (!event.performedBy?.userId || !canActor(phase, event.performedBy.role, eventCapability(phase, event.commandType)) || !laneAuthorised(event.performedBy.role, lane, operationalLaneAccess)) errors.push(`revision_${revision}_authority_invalid`)
    if (index > 0 && !/^fnv1a_[a-f0-9]{8}$/.test(event.commandFingerprint || '')) errors.push(`revision_${revision}_command_fingerprint_invalid`)
    if (SIDE_EFFECT_KEYS.some((key) => event[key] === true)) errors.push(`revision_${revision}_side_effect_boundary_violated`)
    Object.entries(bindingChecks).forEach(([key, value]) => { if (event[key] !== value) errors.push(`revision_${revision}_${key}_binding_invalid`) })
  })
  if (matched.length && !equal(matched.at(-1).after, runtimeSnapshot(phase, record))) errors.push('final_snapshot_mismatch')
  if (matched.length && record.lastEventId !== matched.at(-1).eventId) errors.push('last_event_id_mismatch')
  return errors
}

function addValidation(findings, phase, evidenceId, result) {
  if (!result.valid) findings.push(finding(`${phase.toLowerCase()}_contract_invalid`, phase, 'contract', 'critical', evidenceId, result.errors))
}

export function assureConveyancerDSeriesEvidence(input = {}) {
  const value = clone(input)
  const asOf = value.asOf
  const capacityRecords = Array.isArray(value.capacityRecords) ? value.capacityRecords : []
  const signingPlans = Array.isArray(value.signingPlans) ? value.signingPlans : []
  const appointments = Array.isArray(value.appointments) ? value.appointments : []
  const appointmentEvents = Array.isArray(value.appointmentEvents) ? value.appointmentEvents : []
  const signedPackReviews = Array.isArray(value.signedPackReviews) ? value.signedPackReviews : []
  const signedPackReviewEvents = Array.isArray(value.signedPackReviewEvents) ? value.signedPackReviewEvents : []
  const financialModels = Array.isArray(value.financialModels) ? value.financialModels : []
  const reconciliations = Array.isArray(value.reconciliations) ? value.reconciliations : []
  const reconciliationEvents = Array.isArray(value.reconciliationEvents) ? value.reconciliationEvents : []
  const finalAccounts = Array.isArray(value.finalAccounts) ? value.finalAccounts : []
  const finalAccountEvents = Array.isArray(value.finalAccountEvents) ? value.finalAccountEvents : []
  const findings = []

  const required = { D1: capacityRecords, D2: signingPlans, D3: appointments, D4: signedPackReviews, D5: financialModels, D6: reconciliations, D7: finalAccounts }
  Object.entries(required).forEach(([phase, records]) => { if (!records.length) findings.push(finding(`${phase.toLowerCase()}_evidence_required`, phase, 'evidence', 'critical')) })

  capacityRecords.forEach((record) => {
    addValidation(findings, 'D1', record.capacityId, validateConveyancerSigningCapacity(record))
    if (record.assessment?.status !== CONVEYANCER_SIGNING_CAPACITY_STATUSES.ready) findings.push(finding('d1_capacity_not_ready', 'D1', 'matter', 'warning', record.capacityId, [record.assessment?.status]))
  })
  signingPlans.forEach((plan) => {
    addValidation(findings, 'D2', plan.signingPlanId, validateConveyancerSigningPlan(plan, { capacityRecords, asOf: plan.assessment?.assessedAt }))
    if (plan.assessment?.status !== CONVEYANCER_SIGNING_PLAN_STATUSES.ready) findings.push(finding('d2_signing_plan_not_ready', 'D2', 'matter', 'warning', plan.signingPlanId, [plan.assessment?.status]))
  })
  appointments.forEach((appointment) => {
    addValidation(findings, 'D3', appointment.appointmentId, validateConveyancerSigningAppointmentWorkflow(appointment))
    const plan = signingPlans.find((item) => item.signingPlanId === appointment.signingPlan?.signingPlanId)
    if (!plan || plan.fingerprint !== appointment.signingPlan?.signingPlanFingerprint) findings.push(finding('d3_signing_plan_binding_invalid', 'D3', 'binding', 'critical', appointment.appointmentId))
    const auditErrors = auditRecord({ phase: 'D3', record: appointment, events: appointmentEvents, idKey: 'appointmentId', revisionKey: null, startCommand: 'propose', startStatus: 'not_proposed', lane: appointment.signingPlan?.lane, bindingChecks: { signingPlanId: appointment.signingPlan?.signingPlanId, signingPlanFingerprint: appointment.signingPlan?.signingPlanFingerprint } })
    if (auditErrors.length) findings.push(finding('d3_audit_chain_invalid', 'D3', 'audit', 'critical', appointment.appointmentId, auditErrors))
    if (appointment.status !== CONVEYANCER_SIGNING_APPOINTMENT_STATUSES.completed) findings.push(finding('d3_appointment_not_completed', 'D3', 'matter', 'warning', appointment.appointmentId, [appointment.status]))
  })
  signedPackReviews.forEach((review) => {
    addValidation(findings, 'D4', review.signedPackReviewId, validateConveyancerSignedPackReview(review))
    const plan = signingPlans.find((item) => item.signingPlanId === review.signingPlan?.signingPlanId)
    if (!plan || plan.fingerprint !== review.signingPlan?.signingPlanFingerprint) findings.push(finding('d4_signing_plan_binding_invalid', 'D4', 'binding', 'critical', review.signedPackReviewId))
    const auditErrors = auditRecord({ phase: 'D4', record: review, events: signedPackReviewEvents, idKey: 'signedPackReviewId', revisionKey: 'reviewRevision', startCommand: 'start_review', startStatus: 'not_started', lane: review.signing?.lane, bindingChecks: { signingPlanId: review.signingPlan?.signingPlanId, bindingFingerprint: review.bindingFingerprint } })
    if (auditErrors.length) findings.push(finding('d4_audit_chain_invalid', 'D4', 'audit', 'critical', review.signedPackReviewId, auditErrors))
    if (review.status !== CONVEYANCER_SIGNED_PACK_REVIEW_STATUSES.accepted) findings.push(finding('d4_signed_pack_not_accepted', 'D4', 'matter', 'warning', review.signedPackReviewId, [review.status]))
  })
  financialModels.forEach((model) => {
    addValidation(findings, 'D5', model.financialModelId, validateConveyancerFinancialModel(model))
    if (model.assessment?.status !== CONVEYANCER_FINANCIAL_MODEL_STATUSES.ready) findings.push(finding('d5_financial_model_not_ready', 'D5', 'matter', 'warning', model.financialModelId, [model.assessment?.status]))
  })
  reconciliations.forEach((reconciliation) => {
    addValidation(findings, 'D6', reconciliation.reconciliationId, validateConveyancerFinancialReconciliation(reconciliation))
    const model = financialModels.find((item) => item.financialModelId === reconciliation.financialModel?.financialModelId)
    if (!model || model.fingerprint !== reconciliation.financialModel?.financialModelFingerprint || model.revision !== reconciliation.financialModel?.financialModelRevision) findings.push(finding('d6_financial_model_binding_invalid', 'D6', 'binding', 'critical', reconciliation.reconciliationId))
    const auditErrors = auditRecord({ phase: 'D6', record: reconciliation, events: reconciliationEvents, idKey: 'reconciliationId', revisionKey: 'reconciliationRevision', startCommand: 'start_reconciliation', startStatus: 'not_started', lane: reconciliation.financialModel?.lane, bindingChecks: { financialModelId: reconciliation.financialModel?.financialModelId, bindingFingerprint: reconciliation.bindingFingerprint } })
    if (auditErrors.length) findings.push(finding('d6_audit_chain_invalid', 'D6', 'audit', 'critical', reconciliation.reconciliationId, auditErrors))
    if (reconciliation.status !== CONVEYANCER_FINANCIAL_RECONCILIATION_STATUSES.reconciled) findings.push(finding('d6_reconciliation_not_approved', 'D6', 'matter', 'warning', reconciliation.reconciliationId, [reconciliation.status]))
  })
  finalAccounts.forEach((account) => {
    addValidation(findings, 'D7', account.finalAccountId, validateConveyancerFinalAccount(account))
    const model = financialModels.find((item) => item.financialModelId === account.financialModel?.financialModelId)
    const reconciliation = reconciliations.find((item) => item.reconciliationId === account.reconciliation?.reconciliationId)
    if (!model || model.fingerprint !== account.financialModel?.fingerprint || model.revision !== account.financialModel?.revision) findings.push(finding('d7_financial_model_binding_invalid', 'D7', 'binding', 'critical', account.finalAccountId))
    if (!reconciliation || reconciliation.fingerprint !== account.reconciliation?.fingerprint || reconciliation.bindingFingerprint !== account.reconciliation?.bindingFingerprint) findings.push(finding('d7_reconciliation_binding_invalid', 'D7', 'binding', 'critical', account.finalAccountId))
    const auditErrors = auditRecord({ phase: 'D7', record: account, events: finalAccountEvents, idKey: 'finalAccountId', revisionKey: 'finalAccountRevision', startCommand: 'start_final_account', startStatus: 'not_started', lane: account.financialModel?.lane, bindingChecks: { financialModelId: account.financialModel?.financialModelId, reconciliationId: account.reconciliation?.reconciliationId, contentHash: account.contentHash } })
    if (auditErrors.length) findings.push(finding('d7_audit_chain_invalid', 'D7', 'audit', 'critical', account.finalAccountId, auditErrors))
    if (account.status !== CONVEYANCER_FINAL_ACCOUNT_STATUSES.approved) findings.push(finding('d7_final_account_not_approved', 'D7', 'matter', 'warning', account.finalAccountId, [account.status]))
  })

  const criticalCount = findings.filter((item) => item.severity === 'critical').length
  const warningCount = findings.filter((item) => item.severity === 'warning').length
  const decision = criticalCount ? DECISION.blocked : warningCount ? DECISION.observe : DECISION.ready
  const result = {
    version: CONVEYANCER_D_SERIES_ASSURANCE_VERSION,
    decision,
    assuredAt: text(asOf) || new Date().toISOString(),
    counts: {
      capacityRecords: capacityRecords.length, signingPlans: signingPlans.length, appointments: appointments.length,
      signedPackReviews: signedPackReviews.length, financialModels: financialModels.length,
      reconciliations: reconciliations.length, finalAccounts: finalAccounts.length,
      events: appointmentEvents.length + signedPackReviewEvents.length + reconciliationEvents.length + finalAccountEvents.length,
      critical: criticalCount, warnings: warningCount,
    },
    findings,
    controls: { readOnly: true, persistencePerformed: false, notificationPerformed: false, paymentPerformed: false, deliveryPerformed: false, registrationUpdated: false },
  }
  return deepFreeze(result)
}

function safeThresholds(input = {}) {
  const defaults = CONVEYANCER_D_SERIES_PILOT_THRESHOLDS
  return {
    minimumScenarioPassRate: Math.max(defaults.minimumScenarioPassRate, Math.min(1, number(input.minimumScenarioPassRate, defaults.minimumScenarioPassRate))),
    maximumContractFailures: Math.min(defaults.maximumContractFailures, Math.max(0, number(input.maximumContractFailures, defaults.maximumContractFailures))),
    maximumAuditGaps: Math.min(defaults.maximumAuditGaps, Math.max(0, number(input.maximumAuditGaps, defaults.maximumAuditGaps))),
    maximumBindingFailures: Math.min(defaults.maximumBindingFailures, Math.max(0, number(input.maximumBindingFailures, defaults.maximumBindingFailures))),
    maximumSideEffectAttempts: Math.min(defaults.maximumSideEffectAttempts, Math.max(0, number(input.maximumSideEffectAttempts, defaults.maximumSideEffectAttempts))),
    observeMatterExceptionRate: Math.min(defaults.observeMatterExceptionRate, Math.max(0, number(input.observeMatterExceptionRate, defaults.observeMatterExceptionRate))),
    maximumMatterExceptionRate: Math.min(defaults.maximumMatterExceptionRate, Math.max(0, number(input.maximumMatterExceptionRate, defaults.maximumMatterExceptionRate))),
  }
}

export function evaluateConveyancerDSeriesPilot({ scenarios = [], operationalMetrics = {}, thresholds = {} } = {}) {
  const resolved = safeThresholds(thresholds)
  const rows = Array.isArray(scenarios) ? scenarios.map((scenario, index) => ({
    scenarioId: text(scenario.scenarioId) || `scenario_${index + 1}`,
    expectedDecision: text(scenario.expectedDecision) || DECISION.ready,
    actualDecision: text(scenario.assurance?.decision),
    passed: text(scenario.assurance?.decision) === (text(scenario.expectedDecision) || DECISION.ready),
  })) : []
  const scenarioPassRate = rows.length ? rows.filter((row) => row.passed).length / rows.length : 0
  const metrics = {
    contractFailures: Math.max(0, number(operationalMetrics.contractFailures)),
    auditGaps: Math.max(0, number(operationalMetrics.auditGaps)),
    bindingFailures: Math.max(0, number(operationalMetrics.bindingFailures)),
    sideEffectAttempts: Math.max(0, number(operationalMetrics.sideEffectAttempts)),
    matterExceptionRate: Math.max(0, Math.min(1, number(operationalMetrics.matterExceptionRate))),
  }
  const holds = []
  if (!rows.length) holds.push('pilot_scenarios_required')
  if (scenarioPassRate < resolved.minimumScenarioPassRate) holds.push('scenario_pass_rate_below_threshold')
  if (metrics.contractFailures > resolved.maximumContractFailures) holds.push('contract_failure_threshold_exceeded')
  if (metrics.auditGaps > resolved.maximumAuditGaps) holds.push('audit_gap_threshold_exceeded')
  if (metrics.bindingFailures > resolved.maximumBindingFailures) holds.push('binding_failure_threshold_exceeded')
  if (metrics.sideEffectAttempts > resolved.maximumSideEffectAttempts) holds.push('side_effect_threshold_exceeded')
  if (metrics.matterExceptionRate > resolved.maximumMatterExceptionRate) holds.push('matter_exception_threshold_exceeded')
  const decision = holds.length ? PILOT.hold : metrics.matterExceptionRate > resolved.observeMatterExceptionRate ? PILOT.observe : PILOT.go
  return deepFreeze({ version: CONVEYANCER_D_SERIES_ASSURANCE_VERSION, decision, thresholds: resolved, scenarioPassRate, scenarios: rows, operationalMetrics: metrics, holds })
}

export function buildConveyancerDSeriesPilotManifest(input = {}) {
  const firmIds = unique((Array.isArray(input.firmIds) ? input.firmIds : []).map(text).filter(Boolean)).slice(0, 3)
  const lanes = unique((Array.isArray(input.lanes) ? input.lanes : ['transfer']).map(text).filter((lane) => ['transfer', 'bond', 'cancellation'].includes(lane)))
  const maximumMatters = Math.max(1, Math.min(25, Math.floor(number(input.maximumMatters, 5))))
  const owners = input.owners || {}
  const requiredOwners = ['assurance', 'legal', 'financial', 'support', 'rollback']
  const ownerMap = Object.fromEntries(requiredOwners.map((key) => [key, text(owners[key]) || null]))
  const errors = []
  if (!firmIds.length) errors.push('pilot_firm_required')
  if (!lanes.length) errors.push('pilot_lane_required')
  if (!input.startsAt || !input.endsAt || Number.isNaN(Date.parse(input.startsAt)) || Number.isNaN(Date.parse(input.endsAt)) || Date.parse(input.startsAt) >= Date.parse(input.endsAt)) errors.push('pilot_window_invalid')
  if (Object.values(ownerMap).some((owner) => !owner)) errors.push('pilot_owner_required')
  return deepFreeze({
    version: CONVEYANCER_D_SERIES_ASSURANCE_VERSION,
    valid: errors.length === 0,
    errors,
    scope: { firmIds, lanes, maximumMatters, startsAt: input.startsAt || null, endsAt: input.endsAt || null },
    owners: ownerMap,
    controls: { humanApprovalRequired: true, readOnlyAssurance: true, databaseWritesEnabled: false, automaticNotificationsEnabled: false, automaticPaymentsEnabled: false, automaticDeliveryEnabled: false, automaticRegistrationUpdatesEnabled: false, rollbackOwnerRequired: true },
  })
}

export function serializeConveyancerDSeriesAssuranceEvidence({ assurance = {}, pilot = null, manifest = null } = {}) {
  const safeFindings = (Array.isArray(assurance.findings) ? assurance.findings : []).map(({ code, phase, category, severity, evidenceId, details }) => ({ code, phase, category, severity, evidenceId, details }))
  return JSON.stringify(stable({
    version: CONVEYANCER_D_SERIES_ASSURANCE_VERSION,
    assurance: { decision: assurance.decision || null, assuredAt: assurance.assuredAt || null, counts: assurance.counts || {}, findings: safeFindings, controls: assurance.controls || {} },
    pilot: pilot ? { decision: pilot.decision, thresholds: pilot.thresholds, scenarioPassRate: pilot.scenarioPassRate, scenarios: pilot.scenarios, operationalMetrics: pilot.operationalMetrics, holds: pilot.holds } : null,
    manifest: manifest ? { valid: manifest.valid, errors: manifest.errors, scope: manifest.scope, owners: manifest.owners, controls: manifest.controls } : null,
  }))
}
