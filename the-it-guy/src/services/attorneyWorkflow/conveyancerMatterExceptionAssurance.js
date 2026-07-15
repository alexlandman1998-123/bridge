import {
  MATTER_PLAN_OWNER_ROLES as R,
  MATTER_PLAN_STATUSES,
  normalizeMatterPlanOwnerRole,
  validateConveyancerMatterPlan,
} from '../../core/transactions/conveyancerMatterPlanContract.js'
import {
  MATTER_EXCEPTION_CAPABILITIES as C,
  MATTER_EXCEPTION_RESOLUTION_OUTCOMES as RO,
  MATTER_EXCEPTION_SEVERITIES,
  MATTER_EXCEPTION_SOURCE_TYPES,
  MATTER_EXCEPTION_STATUSES as S,
  canMatterExceptionActor,
  validateConveyancerMatterException,
} from '../../core/transactions/conveyancerMatterExceptionContract.js'
import {
  CONVEYANCER_MATTER_EXCEPTION_LIBRARY_VERSION,
  getConveyancerMatterExceptionDefinition,
  validateConveyancerMatterExceptionLibrary,
} from '../../core/transactions/conveyancerMatterExceptionLibrary.js'
import { generateConveyancerMatterPlan } from './conveyancerMatterPlanGenerator.js'
import { activateConveyancerMatterExceptions } from './conveyancerMatterExceptionActivation.js'
import {
  MATTER_EXCEPTION_CORRECTION_COMMAND_TYPES as CT,
  executeConveyancerMatterExceptionCorrection,
} from './conveyancerMatterExceptionCorrection.js'
import {
  MATTER_EXCEPTION_WAIVER_COMMAND_TYPES as WT,
  executeConveyancerMatterExceptionWaiver,
} from './conveyancerMatterExceptionWaiver.js'
import {
  MATTER_EXCEPTION_OVERRIDE_COMMAND_TYPES as OT,
  MATTER_EXCEPTION_OVERRIDE_MAX_HOURS,
  MATTER_EXCEPTION_OVERRIDE_OPERATIONS as OO,
  evaluateConveyancerMatterExceptionOverride,
  executeConveyancerMatterExceptionOverride,
} from './conveyancerMatterExceptionOverride.js'

export const CONVEYANCER_MATTER_EXCEPTION_ASSURANCE_VERSION = 'conveyancer_matter_exception_assurance_v1'
export const CONVEYANCER_MATTER_EXCEPTION_PILOT_VERSION = 'conveyancer_matter_exception_pilot_v1'

export const DEFAULT_CONVEYANCER_EXCEPTION_PILOT_THRESHOLDS = Object.freeze({
  minimumScenarioPassRate: 1,
  maximumCommandFailureRate: 0.05,
  observeCommandFailureRate: 0.02,
  maximumUnresolvedCriticalRate: 0.1,
  observeUnresolvedCriticalRate: 0.05,
  maximumExpiredOverrideRate: 0.05,
  observeExpiredOverrideRate: 0,
})

export const CONVEYANCER_MATTER_EXCEPTION_PILOT_SCENARIOS = Object.freeze([
  Object.freeze({ id: 'explicit_activation', label: 'Explicit high-severity activation', workflow: 'activation', expectedAssuranceDecision: 'observe' }),
  Object.freeze({ id: 'evidence_correction', label: 'Evidence-backed correction and review', workflow: 'correction', expectedAssuranceDecision: 'ready' }),
  Object.freeze({ id: 'not_applicable', label: 'Governed not-applicable decision', workflow: 'not_applicable', expectedAssuranceDecision: 'ready' }),
  Object.freeze({ id: 'accepted_risk_waiver', label: 'Independent accepted-risk waiver', workflow: 'waiver', expectedAssuranceDecision: 'observe' }),
  Object.freeze({ id: 'temporary_override', label: 'Manager-approved temporary override', workflow: 'override', expectedAssuranceDecision: 'observe' }),
  Object.freeze({ id: 'critical_override_governance', label: 'Critical override authority boundary', workflow: 'critical_override', expectedAssuranceDecision: 'observe' }),
])

const ACTIVE_STATUSES = new Set([S.open, S.acknowledged, S.investigating, S.waitingExternal, S.remediation, S.pendingReview])
const TERMINAL_STATUSES = new Set([S.resolved, S.waived, S.cancelled, S.superseded])
const OVERRIDE_OPERATIONS = new Set(Object.values(OO))
const REVIEW_KINDS = new Set(['correction', 'not_applicable', 'waiver'])
const TRANSFER_ROLES = new Set([R.conveyancer, R.transferAttorney])

function text(value = '') {
  return String(value || '').trim()
}

function number(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function validDate(value) {
  return Boolean(value && Number.isFinite(new Date(value).getTime()))
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))]
}

function clone(value) {
  return typeof globalThis.structuredClone === 'function'
    ? globalThis.structuredClone(value)
    : JSON.parse(JSON.stringify(value))
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  Object.values(value).forEach(deepFreeze)
  return Object.freeze(value)
}

function check({ id, label, category = 'platform', severity = 'warning', passed, detail, evidence = null }) {
  return {
    id,
    label,
    category,
    severity,
    status: passed ? 'passed' : 'failed',
    passed: passed === true,
    detail,
    evidence,
  }
}

function rolesMatch(actorRole, ownerRole) {
  if (actorRole === ownerRole) return true
  return TRANSFER_ROLES.has(actorRole) && TRANSFER_ROLES.has(ownerRole)
}

function eventCapability(event) {
  const commandType = text(event.commandType || event.command_type).toLowerCase()
  if (commandType === CT.acknowledge) return C.acknowledge
  if (commandType === CT.startInvestigation) return C.investigate
  if ([CT.beginCorrection, CT.recordCorrectionEvidence, CT.submitCorrectionReview, CT.submitNotApplicableReview, WT.propose, WT.revise, WT.withdraw, OT.propose, OT.revise, OT.withdraw].includes(commandType)) return C.remediate
  if ([CT.approveCorrection, CT.decideNotApplicable, CT.rejectCorrection].includes(commandType)) return C.resolve
  if ([WT.approve, WT.reject].includes(commandType)) return C.waive
  if ([OT.approve, OT.reject, OT.revoke].includes(commandType)) return C.override
  return ''
}

function eventAuthorityIssue(event, exception) {
  const actor = event.actor || {}
  const actorRole = normalizeMatterPlanOwnerRole(actor.role)
  const owner = exception.owner || {}
  const ownerRole = normalizeMatterPlanOwnerRole(owner.role)
  const managerOverride = actorRole === R.firmManager
  const capability = eventCapability(event)
  const actorTeamIds = Array.isArray(actor.teamIds) ? actor.teamIds.map(text) : []
  if (!actorRole) return 'actor_role_missing'
  if (!capability) return 'unknown_command_capability'
  if (!managerOverride && !rolesMatch(actorRole, ownerRole)) return 'actor_role_mismatch'
  if (!managerOverride && owner.userId && text(owner.userId) !== text(actor.userId)) return 'actor_user_mismatch'
  if (!managerOverride && owner.teamId && !actorTeamIds.includes(text(owner.teamId))) return 'actor_team_mismatch'
  if (!canMatterExceptionActor(actorRole, capability)) return 'actor_capability_mismatch'
  const expectedAuthority = managerOverride ? 'manager_override' : 'owned_and_authorised'
  if (text(event.authority) !== expectedAuthority) return 'authority_claim_mismatch'
  const proposer = event.before?.waiverProposal?.proposedBy || event.before?.overrideProposal?.proposedBy
  if ([WT.approve, WT.reject, OT.approve, OT.reject].includes(text(event.commandType)) && proposer?.userId && text(proposer.userId) === text(actor.userId)) return 'independent_review_breached'
  return ''
}

function auditExceptions(plan, exceptions, events) {
  const issues = []
  const planId = text(plan.planId || plan.plan_id)
  const planVersion = Number(plan.version || 0)
  const scopedEvents = (Array.isArray(events) ? events : []).filter((event) =>
    text(event.planId || event.plan_id) === planId && Number(event.planVersion || event.plan_version || 0) === planVersion)
  const exceptionById = new Map(exceptions.map((item) => [item.exceptionId, item]))
  const eventIds = scopedEvents.map((event) => text(event.eventId || event.event_id))
  if (eventIds.some((id) => !id)) issues.push('event_id_missing')
  if (new Set(eventIds).size !== eventIds.length) issues.push('duplicate_event_id')
  if (scopedEvents.some((event) => !validDate(event.occurredAt || event.occurred_at))) issues.push('event_time_invalid')
  if (scopedEvents.some((event) => !exceptionById.has(text(event.exceptionId || event.exception_id)))) issues.push('unknown_event_exception')

  for (const exception of exceptions) {
    const matching = scopedEvents.filter((event) => text(event.exceptionId || event.exception_id) === exception.exceptionId)
    const activationEvents = matching.filter((event) => text(event.eventType || event.event_type) === 'exception_activated')
    const mutationEvents = matching.filter((event) => text(event.eventType || event.event_type) !== 'exception_activated')
    if (activationEvents.length !== 1) issues.push(`activation_event_count:${exception.exceptionId}`)
    const activation = activationEvents[0]
    if (activation && text(activation.definitionKey || activation.definition_key) !== text(exception.provenance?.definitionKey)) issues.push(`activation_definition_mismatch:${exception.exceptionId}`)
    if (activation && text(activation.deduplicationKey || activation.deduplication_key) !== text(exception.deduplicationKey)) issues.push(`activation_deduplication_mismatch:${exception.exceptionId}`)
    if (activation && !canMatterExceptionActor(activation.actor?.role, C.raise)) issues.push(`activation_actor_unauthorised:${exception.exceptionId}`)
    const commandIds = mutationEvents.map((event) => text(event.commandId || event.command_id))
    if (commandIds.some((id) => !id)) issues.push(`command_id_missing:${exception.exceptionId}`)
    if (new Set(commandIds).size !== commandIds.length) issues.push(`duplicate_command_id:${exception.exceptionId}`)
    if (mutationEvents.length !== Number(exception.runtimeRevision || 0)) issues.push(`event_count_mismatch:${exception.exceptionId}`)
    const ordered = [...mutationEvents].sort((left, right) => Number(left.after?.runtimeRevision || 0) - Number(right.after?.runtimeRevision || 0))
    ordered.forEach((event, index) => {
      if (Number(event.before?.runtimeRevision || 0) !== index) issues.push(`event_before_revision_gap:${exception.exceptionId}`)
      if (Number(event.after?.runtimeRevision || 0) !== index + 1) issues.push(`event_after_revision_gap:${exception.exceptionId}`)
      if (index > 0 && Number(ordered[index - 1].after?.runtimeRevision || 0) !== Number(event.before?.runtimeRevision || 0)) issues.push(`event_chain_break:${exception.exceptionId}`)
      if (index > 0 && ['status', 'evidence', 'resolution'].some((field) => JSON.stringify(ordered[index - 1].after?.[field]) !== JSON.stringify(event.before?.[field]))) issues.push(`event_snapshot_chain_break:${exception.exceptionId}`)
      if (Object.values(OT).includes(text(event.commandType)) && ['status', 'evidence', 'resolution'].some((field) => JSON.stringify(event.before?.[field]) !== JSON.stringify(event.after?.[field]))) issues.push(`override_mutated_exception_truth:${exception.exceptionId}`)
      if (text(event.commandType) === OT.approve) {
        const proposal = event.before?.overrideProposal
        const maxHours = MATTER_EXCEPTION_OVERRIDE_MAX_HOURS[exception.severity]
        if (!validDate(proposal?.proposedAt) || !validDate(proposal?.expiresAt) || new Date(proposal.expiresAt) - new Date(proposal.proposedAt) > maxHours * 60 * 60 * 1000) issues.push(`override_proposal_duration_unsafe:${exception.exceptionId}`)
      }
      const authorityIssue = eventAuthorityIssue(event, exception)
      if (authorityIssue) issues.push(`event_authority:${exception.exceptionId}:${authorityIssue}`)
    })
    const latest = ordered.at(-1)
    if (Number(exception.runtimeRevision || 0) > 0 && text(exception.lastEventId) !== text(latest?.eventId || latest?.event_id)) issues.push(`last_event_mismatch:${exception.exceptionId}`)
    if (latest && ['status', 'evidence', 'resolution'].some((field) => JSON.stringify(latest.after?.[field]) !== JSON.stringify(exception[field] || (field === 'evidence' ? [] : {})))) issues.push(`final_snapshot_mismatch:${exception.exceptionId}`)
  }
  return { valid: issues.length === 0, eventCount: scopedEvents.length, issues: unique(issues) }
}

function recordIntegrity(plan, exceptions) {
  const actionKeys = (plan.actions || []).map((item) => item.key)
  const errors = []
  exceptions.forEach((item) => {
    const validation = validateConveyancerMatterException(item, { actionKeys })
    if (!validation.valid) errors.push(...validation.errors.map((error) => `${item.exceptionId || 'unknown'}:${error}`))
  })
  return { valid: errors.length === 0, errors: unique(errors) }
}

function planBindingIssues(plan, exceptions) {
  const issues = []
  for (const item of exceptions) {
    if (item.planId !== plan.planId) issues.push(`${item.exceptionId}:plan_id_mismatch`)
    if (Number(item.planVersion) !== Number(plan.version)) issues.push(`${item.exceptionId}:plan_version_mismatch`)
    if (item.transactionId !== plan.transactionId) issues.push(`${item.exceptionId}:transaction_id_mismatch`)
    if (item.organisationId !== plan.organisationId) issues.push(`${item.exceptionId}:organisation_id_mismatch`)
  }
  return unique(issues)
}

function libraryLinkageIssues(exceptions) {
  const issues = []
  for (const item of exceptions) {
    const provenance = item.provenance || {}
    if (!provenance.definitionKey) {
      if (item.source?.type === MATTER_EXCEPTION_SOURCE_TYPES.systemRule) issues.push(`${item.exceptionId}:system_exception_definition_missing`)
      continue
    }
    if (!getConveyancerMatterExceptionDefinition(provenance.definitionKey)) issues.push(`${item.exceptionId}:unknown_definition`)
    if (provenance.libraryVersion !== CONVEYANCER_MATTER_EXCEPTION_LIBRARY_VERSION) issues.push(`${item.exceptionId}:library_version_mismatch`)
  }
  return unique(issues)
}

function duplicateIssues(exceptions) {
  const active = exceptions.filter((item) => ACTIVE_STATUSES.has(item.status))
  const keys = active.map((item) => item.deduplicationKey)
  return unique(keys.filter((key, index) => keys.indexOf(key) !== index).map((key) => `duplicate_active_exception:${key}`))
}

function reviewIssues(exceptions) {
  const issues = []
  for (const item of exceptions) {
    if (item.status === S.pendingReview && !REVIEW_KINDS.has(item.reviewKind)) issues.push(`${item.exceptionId}:pending_review_kind_missing`)
    if (item.status !== S.pendingReview && item.reviewKind) issues.push(`${item.exceptionId}:review_kind_outside_pending_review`)
    if (item.reviewKind === 'waiver' && !item.waiverProposal) issues.push(`${item.exceptionId}:waiver_proposal_missing`)
    if (['correction', 'not_applicable'].includes(item.reviewKind) && item.reviewKind === 'not_applicable' && !item.decisionProposal) issues.push(`${item.exceptionId}:decision_proposal_missing`)
    if (item.overrideProposal && item.reviewKind) issues.push(`${item.exceptionId}:override_conflicts_with_review`)
    if (item.overrideProposal && item.activeOverride) issues.push(`${item.exceptionId}:proposal_and_active_override`)
  }
  return unique(issues)
}

function waiverIssues(exceptions) {
  const issues = []
  for (const item of exceptions.filter((exception) => exception.status === S.waived)) {
    if (item.resolution?.outcome !== RO.acceptedRisk) issues.push(`${item.exceptionId}:accepted_risk_resolution_missing`)
    if (item.waiverDecision?.outcome !== 'approved') issues.push(`${item.exceptionId}:approved_waiver_decision_missing`)
    if (!text(item.waiverDecision?.decisionReferenceId)) issues.push(`${item.exceptionId}:waiver_decision_reference_missing`)
    if (item.severity === MATTER_EXCEPTION_SEVERITIES.critical && normalizeMatterPlanOwnerRole(item.waiverDecision?.approvedBy?.role) !== R.firmManager) issues.push(`${item.exceptionId}:critical_waiver_manager_missing`)
  }
  return unique(issues)
}

function overrideIssues(exceptions) {
  const issues = []
  for (const item of exceptions) {
    const active = item.activeOverride
    if (!active) continue
    if (active.status !== 'active') issues.push(`${item.exceptionId}:override_status_invalid`)
    if (TERMINAL_STATUSES.has(item.status)) issues.push(`${item.exceptionId}:override_on_terminal_exception`)
    if (!Array.isArray(active.operations) || !active.operations.length || active.operations.some((operation) => !OVERRIDE_OPERATIONS.has(operation))) issues.push(`${item.exceptionId}:override_operation_unsafe`)
    if (!Array.isArray(active.safeguards) || !active.safeguards.length) issues.push(`${item.exceptionId}:override_safeguards_missing`)
    if (!validDate(active.approvedAt) || !validDate(active.expiresAt) || new Date(active.expiresAt) <= new Date(active.approvedAt)) issues.push(`${item.exceptionId}:override_dates_invalid`)
    if (validDate(active.approvedAt) && validDate(active.expiresAt) && new Date(active.expiresAt) - new Date(active.approvedAt) > MATTER_EXCEPTION_OVERRIDE_MAX_HOURS[item.severity] * 60 * 60 * 1000) issues.push(`${item.exceptionId}:override_duration_unsafe`)
    if (normalizeMatterPlanOwnerRole(active.approvedBy?.role) !== R.firmManager) issues.push(`${item.exceptionId}:override_manager_approval_missing`)
    if (!text(active.decisionReferenceId)) issues.push(`${item.exceptionId}:override_decision_reference_missing`)
  }
  return unique(issues)
}

export function buildConveyancerMatterExceptionAssurance({ plan = {}, exceptions = [], events = [], asOf = '' } = {}) {
  const resolvedAsOf = validDate(asOf) ? new Date(asOf).toISOString() : new Date().toISOString()
  const scopedExceptions = Array.isArray(exceptions) ? clone(exceptions) : []
  const planValidation = validateConveyancerMatterPlan(plan)
  const records = recordIntegrity(plan, scopedExceptions)
  const library = validateConveyancerMatterExceptionLibrary()
  const bindings = planBindingIssues(plan, scopedExceptions)
  const linkage = libraryLinkageIssues(scopedExceptions)
  const duplicates = duplicateIssues(scopedExceptions)
  const reviews = reviewIssues(scopedExceptions)
  const waivers = waiverIssues(scopedExceptions)
  const overrides = overrideIssues(scopedExceptions)
  const audit = auditExceptions(plan, scopedExceptions, events)
  const active = scopedExceptions.filter((item) => ACTIVE_STATUSES.has(item.status))
  const unresolvedCritical = active.filter((item) => item.severity === MATTER_EXCEPTION_SEVERITIES.critical)
  const acceptedRisk = scopedExceptions.filter((item) => item.status === S.waived)
  const activeOverrides = scopedExceptions.filter((item) => item.activeOverride)
  const expiredOverrides = activeOverrides.filter((item) => !validDate(item.activeOverride.expiresAt) || new Date(item.activeOverride.expiresAt) <= new Date(resolvedAsOf))
  const overdueSlas = active.filter((item) => validDate(item.sla?.resolveBy) && new Date(item.sla.resolveBy) < new Date(resolvedAsOf))
  const checks = [
    check({ id: 'active_plan_context', label: 'The exception set belongs to an active valid matter plan', severity: 'critical', passed: planValidation.valid && plan.status === MATTER_PLAN_STATUSES.active, detail: planValidation.valid ? `Plan status: ${plan.status || 'missing'}.` : `${planValidation.errors.length} plan contract error(s).`, evidence: planValidation.errors }),
    check({ id: 'b1_exception_contracts', label: 'B1 exception records are valid', severity: 'critical', passed: records.valid, detail: records.valid ? `${scopedExceptions.length} exception record(s) verified.` : `${records.errors.length} record error(s).`, evidence: records.errors }),
    check({ id: 'matter_plan_binding', label: 'Exceptions bind to the exact matter-plan context', severity: 'critical', passed: bindings.length === 0, detail: `${bindings.length} binding issue(s).`, evidence: bindings }),
    check({ id: 'b2_library_integrity', label: 'B2 definition library and provenance are current', severity: 'critical', passed: library.valid && linkage.length === 0, detail: library.valid ? `${linkage.length} provenance issue(s).` : `${library.errors.length} library error(s).`, evidence: [...library.errors, ...linkage] }),
    check({ id: 'b3_activation_uniqueness', label: 'B3 activation remains unique per active scope', severity: 'critical', passed: duplicates.length === 0, detail: `${duplicates.length} duplicate active scope(s).`, evidence: duplicates }),
    check({ id: 'b4_review_integrity', label: 'B4 correction and applicability reviews are coherent', severity: 'critical', passed: reviews.length === 0, detail: `${reviews.length} review integrity issue(s).`, evidence: reviews }),
    check({ id: 'b5_waiver_integrity', label: 'B5 accepted-risk decisions retain governed evidence', severity: 'critical', passed: waivers.length === 0, detail: `${waivers.length} waiver integrity issue(s).`, evidence: waivers }),
    check({ id: 'b6_override_integrity', label: 'B6 overrides are scoped, temporary and manager-approved', severity: 'critical', passed: overrides.length === 0, detail: `${overrides.length} override integrity issue(s).`, evidence: overrides }),
    check({ id: 'exception_audit_integrity', label: 'The exception activation and mutation event chains are complete', severity: 'critical', passed: audit.valid, detail: audit.valid ? `${audit.eventCount} event(s) verified.` : `${audit.issues.length} audit issue(s).`, evidence: audit.issues }),
    check({ id: 'active_exception_health', label: 'No exception currently requires operational handling', category: 'matter', passed: active.length === 0, detail: `${active.length} active exception(s).`, evidence: active.map((item) => item.exceptionId) }),
    check({ id: 'unresolved_critical_health', label: 'No critical exception remains unresolved', category: 'matter', passed: unresolvedCritical.length === 0, detail: `${unresolvedCritical.length} unresolved critical exception(s).`, evidence: unresolvedCritical.map((item) => item.exceptionId) }),
    check({ id: 'accepted_risk_health', label: 'No accepted-risk waiver requires operational observation', category: 'matter', passed: acceptedRisk.length === 0, detail: `${acceptedRisk.length} accepted-risk waiver(s).`, evidence: acceptedRisk.map((item) => item.exceptionId) }),
    check({ id: 'active_override_health', label: 'No temporary override is currently active', category: 'matter', passed: activeOverrides.length === 0, detail: `${activeOverrides.length} active override(s).`, evidence: activeOverrides.map((item) => item.exceptionId) }),
    check({ id: 'expired_override_cleanup', label: 'No expired override awaits explicit cleanup', category: 'matter', passed: expiredOverrides.length === 0, detail: `${expiredOverrides.length} expired override(s).`, evidence: expiredOverrides.map((item) => item.exceptionId) }),
    check({ id: 'exception_sla_health', label: 'No active exception is beyond its resolution SLA', category: 'matter', passed: overdueSlas.length === 0, detail: `${overdueSlas.length} overdue exception(s).`, evidence: overdueSlas.map((item) => item.exceptionId) }),
  ]
  const failedCritical = checks.filter((item) => item.status === 'failed' && item.severity === 'critical')
  const failedWarnings = checks.filter((item) => item.status === 'failed' && item.severity !== 'critical')
  const decision = failedCritical.length ? 'blocked' : failedWarnings.length ? 'observe' : 'ready'
  const evidence = {
    version: CONVEYANCER_MATTER_EXCEPTION_ASSURANCE_VERSION,
    generatedAt: resolvedAsOf,
    planId: plan.planId || plan.plan_id || null,
    planVersion: Number(plan.version || 0),
    decision,
    metrics: {
      exceptionCount: scopedExceptions.length,
      activeCount: active.length,
      unresolvedCriticalCount: unresolvedCritical.length,
      acceptedRiskCount: acceptedRisk.length,
      activeOverrideCount: activeOverrides.length,
      expiredOverrideCount: expiredOverrides.length,
      overdueSlaCount: overdueSlas.length,
      eventCount: audit.eventCount,
    },
    audit,
    checks: checks.map((item) => ({ id: item.id, status: item.status, detail: item.detail })),
  }
  return deepFreeze({
    version: CONVEYANCER_MATTER_EXCEPTION_ASSURANCE_VERSION,
    decision,
    decisionLabel: decision === 'ready' ? 'Exception handling assured' : decision === 'observe' ? 'Assured with matter-level observation' : 'Exception assurance blocked',
    releaseReady: decision === 'ready',
    checks,
    failedChecks: checks.filter((item) => item.status === 'failed'),
    failedCriticalCount: failedCritical.length,
    failedWarningCount: failedWarnings.length,
    evidence,
  })
}

function pilotTransaction(id, overrides = {}) {
  return {
    id,
    organisation_id: 'pilot-exception-organisation',
    finance_type: 'cash',
    transaction_type: 'private_sale',
    buyer_entity_type: 'individual',
    seller_entity_type: 'individual',
    seller_has_existing_bond: false,
    property_tenure: 'freehold',
    ...overrides,
  }
}

function pilotContext(scenario, generatedAt) {
  const company = scenario.workflow === 'critical_override'
  const transaction = pilotTransaction(`pilot-${scenario.id}`, company ? { buyer_entity_type: 'company' } : {})
  const generated = generateConveyancerMatterPlan({ transaction, generatedAt })
  if (!generated.valid) return { error: generated.errors }
  const plan = { ...clone(generated.plan), status: MATTER_PLAN_STATUSES.active, activatedAt: generatedAt }
  const critical = scenario.workflow === 'critical_override'
  const activation = activateConveyancerMatterExceptions({
    plan,
    observations: [{
      signalKey: critical ? 'authority.signatory_conflict' : scenario.workflow === 'correction' ? 'fica.required_evidence' : 'instruction.signed_transfer_instruction',
      state: critical ? 'conflict' : 'missing',
      observedAt: generatedAt,
      detectedBy: { role: R.system, userId: 'pilot-detector' },
    }],
    actor: { role: R.system, userId: 'pilot-detector' },
    asOf: generatedAt,
  })
  if (!activation.valid || activation.activatedExceptions.length !== 1) return { error: activation.errors.length ? activation.errors : ['pilot_activation_failed'] }
  return { plan, exception: activation.activatedExceptions[0], events: [...activation.events], commandSequence: 0 }
}

function commandAt(context, generatedAt) {
  context.commandSequence += 1
  return new Date(new Date(generatedAt).getTime() + context.commandSequence * 60 * 1000).toISOString()
}

function pilotCommand(context, service, type, actor, payload, generatedAt) {
  const result = service({
    exception: context.exception,
    actor,
    occurredAt: commandAt(context, generatedAt),
    planActionKeys: context.plan.actions.map((item) => item.key),
    command: {
      commandId: `pilot-${context.exception.exceptionId}-${context.commandSequence}`,
      type,
      expectedExceptionId: context.exception.exceptionId,
      expectedRuntimeRevision: Number(context.exception.runtimeRevision || 0),
      ...payload,
    },
  })
  if (result.ok) {
    context.exception = result.exception
    context.events.push(result.event)
  }
  return result
}

function runPilotWorkflow(scenario, generatedAt) {
  const context = pilotContext(scenario, generatedAt)
  if (context.error) return { passed: false, errors: context.error, assurance: null, controls: {} }
  const owner = { role: R.transferAttorney, userId: 'pilot-attorney-1' }
  const reviewer = { role: R.transferAttorney, userId: 'pilot-attorney-2' }
  const manager = { role: R.firmManager, userId: 'pilot-manager-1' }
  const required = (result) => {
    if (!result.ok) throw new Error(result.code)
    return result
  }
  const controls = {}
  try {
    if (scenario.workflow !== 'activation') required(pilotCommand(context, executeConveyancerMatterExceptionCorrection, CT.acknowledge, owner, {}, generatedAt))
    if (scenario.workflow === 'correction') {
      required(pilotCommand(context, executeConveyancerMatterExceptionCorrection, CT.beginCorrection, owner, {}, generatedAt))
      required(pilotCommand(context, executeConveyancerMatterExceptionCorrection, CT.recordCorrectionEvidence, owner, { evidence: { requirementKey: context.exception.evidenceRequirements[0].key, referenceId: 'pilot-evidence-1' } }, generatedAt))
      required(pilotCommand(context, executeConveyancerMatterExceptionCorrection, CT.submitCorrectionReview, owner, {}, generatedAt))
      required(pilotCommand(context, executeConveyancerMatterExceptionCorrection, CT.approveCorrection, reviewer, { summary: 'Pilot evidence independently verified.' }, generatedAt))
    }
    if (scenario.workflow === 'not_applicable') {
      required(pilotCommand(context, executeConveyancerMatterExceptionCorrection, CT.submitNotApplicableReview, owner, { reason: 'The imported signal belongs to another matter.', summary: 'Request factual applicability review.' }, generatedAt))
      required(pilotCommand(context, executeConveyancerMatterExceptionCorrection, CT.decideNotApplicable, manager, { reason: 'The imported signal belongs to another matter.', summary: 'Source reconciled to the correct matter.', referenceId: 'pilot-na-1' }, generatedAt))
    }
    if (scenario.workflow === 'waiver') {
      required(pilotCommand(context, executeConveyancerMatterExceptionWaiver, WT.propose, owner, { waiver: { reason: 'Documented pilot residual risk.', risk: 'Evidence remains unavailable.', mitigation: 'Verify source before lodgement.', requirementKeys: [context.exception.evidenceRequirements[0].key] } }, generatedAt))
      required(pilotCommand(context, executeConveyancerMatterExceptionWaiver, WT.approve, reviewer, { summary: 'Residual risk accepted for the pilot.', decisionReferenceId: 'pilot-waiver-1' }, generatedAt))
    }
    if (['override', 'critical_override'].includes(scenario.workflow)) {
      const expiryHours = scenario.workflow === 'critical_override' ? 10 : 48
      const expiry = new Date(new Date(generatedAt).getTime() + expiryHours * 60 * 60 * 1000).toISOString()
      required(pilotCommand(context, executeConveyancerMatterExceptionOverride, OT.propose, owner, { override: { reason: 'Allow safe preparatory work.', businessJustification: 'Avoid unnecessary delay.', operations: [OO.requestDocuments], safeguards: ['Do not change legal state'], expiresAt: expiry } }, generatedAt))
      if (scenario.workflow === 'critical_override') {
        const denied = pilotCommand(context, executeConveyancerMatterExceptionOverride, OT.approve, reviewer, { summary: 'Unauthorised approval attempt.', decisionReferenceId: 'pilot-denied' }, generatedAt)
        controls.nonManagerApprovalDenied = !denied.ok && denied.code === 'actor_lacks_exception_capability'
      }
      required(pilotCommand(context, executeConveyancerMatterExceptionOverride, OT.approve, manager, { summary: 'Safe operation approved under safeguards.', decisionReferenceId: 'pilot-override-1' }, generatedAt))
      controls.allowedOperation = evaluateConveyancerMatterExceptionOverride({ exception: context.exception, operation: OO.requestDocuments, asOf: new Date(new Date(generatedAt).getTime() + 2 * 60 * 60 * 1000).toISOString() }).allowed
      controls.unsafeOperationDenied = !evaluateConveyancerMatterExceptionOverride({ exception: context.exception, operation: 'complete_action', asOf: generatedAt }).allowed
    }
  } catch (error) {
    return { passed: false, errors: [error.message], assurance: null, controls }
  }
  const assurance = buildConveyancerMatterExceptionAssurance({ plan: context.plan, exceptions: [context.exception], events: context.events, asOf: new Date(new Date(generatedAt).getTime() + 3 * 60 * 60 * 1000).toISOString() })
  const controlsPassed = Object.values(controls).every(Boolean)
  return {
    passed: assurance.decision === scenario.expectedAssuranceDecision && controlsPassed,
    errors: [],
    assurance,
    controls,
  }
}

function operationalTriggers(metrics, thresholds) {
  const attempts = number(metrics.commandAttempts)
  const active = number(metrics.activeExceptions)
  const overrides = number(metrics.activeOverrides)
  const commandFailureRate = attempts ? number(metrics.commandFailures) / attempts : 0
  const unresolvedCriticalRate = active ? number(metrics.unresolvedCriticalExceptions) / active : 0
  const expiredOverrideRate = overrides ? number(metrics.expiredOverrides) / overrides : 0
  const triggers = [
    number(metrics.activationFailures) > 0 ? { key: 'activation_failure', severity: 'critical', detail: `${number(metrics.activationFailures)} activation failure(s).` } : null,
    number(metrics.auditGaps) > 0 ? { key: 'exception_audit_gap', severity: 'critical', detail: `${number(metrics.auditGaps)} audit gap(s).` } : null,
    number(metrics.unauthorisedCommandsAccepted || metrics.unauthorizedCommandsAccepted) > 0 ? { key: 'unauthorised_command_accepted', severity: 'critical', detail: 'An unauthorised exception command crossed the execution boundary.' } : null,
    commandFailureRate > thresholds.maximumCommandFailureRate ? { key: 'command_failure_rate', severity: 'critical', detail: `${Math.round(commandFailureRate * 100)}% command failure rate.` } : commandFailureRate > thresholds.observeCommandFailureRate ? { key: 'command_failure_rate', severity: 'warning', detail: `${Math.round(commandFailureRate * 100)}% command failure rate.` } : null,
    unresolvedCriticalRate > thresholds.maximumUnresolvedCriticalRate ? { key: 'unresolved_critical_rate', severity: 'critical', detail: `${Math.round(unresolvedCriticalRate * 100)}% unresolved critical rate.` } : unresolvedCriticalRate > thresholds.observeUnresolvedCriticalRate ? { key: 'unresolved_critical_rate', severity: 'warning', detail: `${Math.round(unresolvedCriticalRate * 100)}% unresolved critical rate.` } : null,
    expiredOverrideRate > thresholds.maximumExpiredOverrideRate ? { key: 'expired_override_rate', severity: 'critical', detail: `${Math.round(expiredOverrideRate * 100)}% expired override rate.` } : expiredOverrideRate > thresholds.observeExpiredOverrideRate ? { key: 'expired_override_rate', severity: 'warning', detail: `${Math.round(expiredOverrideRate * 100)}% expired override rate.` } : null,
  ].filter(Boolean)
  return { triggers, commandFailureRate, unresolvedCriticalRate, expiredOverrideRate }
}

export function runConveyancerMatterExceptionPilotSuite({
  scenarios = CONVEYANCER_MATTER_EXCEPTION_PILOT_SCENARIOS,
  generatedAt = '',
  thresholds = {},
  operationalMetrics = {},
} = {}) {
  const resolvedGeneratedAt = validDate(generatedAt) ? new Date(generatedAt).toISOString() : new Date().toISOString()
  const effectiveThresholds = { ...DEFAULT_CONVEYANCER_EXCEPTION_PILOT_THRESHOLDS, ...thresholds }
  const results = (Array.isArray(scenarios) ? scenarios : []).map((scenario) => {
    const result = runPilotWorkflow(scenario, resolvedGeneratedAt)
    return { scenarioId: scenario.id, label: scenario.label, workflow: scenario.workflow, expectedAssuranceDecision: scenario.expectedAssuranceDecision, actualAssuranceDecision: result.assurance?.decision || null, ...result }
  })
  const passedCount = results.filter((item) => item.passed).length
  const scenarioPassRate = results.length ? passedCount / results.length : 0
  const operational = operationalTriggers(operationalMetrics, effectiveThresholds)
  const criticalTriggers = operational.triggers.filter((item) => item.severity === 'critical')
  const warningTriggers = operational.triggers.filter((item) => item.severity !== 'critical')
  const releaseBlockers = [
    ...(results.length ? [] : ['no_pilot_scenarios']),
    ...(scenarioPassRate < effectiveThresholds.minimumScenarioPassRate ? ['scenario_pass_rate'] : []),
    ...criticalTriggers.map((item) => item.key),
  ]
  const decision = releaseBlockers.length ? 'hold' : warningTriggers.length ? 'observe' : 'go'
  return deepFreeze({
    version: CONVEYANCER_MATTER_EXCEPTION_PILOT_VERSION,
    decision,
    decisionLabel: decision === 'go' ? 'Exception pilot supports controlled expansion' : decision === 'observe' ? 'Exception pilot may continue under observation' : 'Hold or roll back the exception pilot',
    generatedAt: resolvedGeneratedAt,
    scenarioResults: results,
    metrics: {
      scenarioCount: results.length,
      passedCount,
      failedCount: results.length - passedCount,
      scenarioPassRate,
      commandFailureRate: operational.commandFailureRate,
      unresolvedCriticalRate: operational.unresolvedCriticalRate,
      expiredOverrideRate: operational.expiredOverrideRate,
    },
    thresholds: effectiveThresholds,
    rollbackTriggers: operational.triggers,
    releaseBlockers: unique(releaseBlockers),
  })
}

export function buildConveyancerMatterExceptionPilotManifest({
  firmIds = [],
  startsAt = '',
  endsAt = '',
  maximumMatters = 25,
  assuranceOwnerId = '',
  rollbackOwnerId = '',
  supportOwnerId = '',
} = {}) {
  const errors = []
  const normalizedFirmIds = unique((Array.isArray(firmIds) ? firmIds : []).map(text))
  if (!normalizedFirmIds.length) errors.push('pilot_firm_required')
  if (!validDate(startsAt)) errors.push('valid_start_date_required')
  if (!validDate(endsAt)) errors.push('valid_end_date_required')
  if (validDate(startsAt) && validDate(endsAt) && new Date(endsAt) <= new Date(startsAt)) errors.push('pilot_end_must_follow_start')
  if (!Number.isInteger(Number(maximumMatters)) || Number(maximumMatters) < 5 || Number(maximumMatters) > 50) errors.push('pilot_matter_limit_out_of_range')
  if (!text(assuranceOwnerId)) errors.push('assurance_owner_required')
  if (!text(rollbackOwnerId)) errors.push('rollback_owner_required')
  if (!text(supportOwnerId)) errors.push('support_owner_required')
  return deepFreeze({
    version: CONVEYANCER_MATTER_EXCEPTION_PILOT_VERSION,
    valid: errors.length === 0,
    errors,
    cohort: {
      firmIds: normalizedFirmIds,
      maximumMatters: Number(maximumMatters),
      startsAt: validDate(startsAt) ? new Date(startsAt).toISOString() : null,
      endsAt: validDate(endsAt) ? new Date(endsAt).toISOString() : null,
    },
    owners: { assuranceOwnerId: text(assuranceOwnerId) || null, rollbackOwnerId: text(rollbackOwnerId) || null, supportOwnerId: text(supportOwnerId) || null },
    controls: {
      legacyExceptionFallback: true,
      killSwitchRequired: true,
      automaticResolution: false,
      automaticWaiverApproval: false,
      automaticOverrideApproval: false,
      databaseWritesEnabledByManifest: false,
    },
    entryCriteria: ['A1-A7 and B1-B7 tests passing', 'named assurance, rollback and support owners', 'legacy exception fallback available', 'manager review coverage available'],
    exitCriteria: ['100% scenario pass rate', 'no critical rollback trigger', 'complete activation and mutation audit chains', 'no unauthorised accepted commands', 'expired overrides explicitly cleaned up'],
  })
}

export function serializeConveyancerMatterExceptionAssuranceEvidence(assurance) {
  return JSON.stringify(assurance?.evidence || {}, null, 2)
}
