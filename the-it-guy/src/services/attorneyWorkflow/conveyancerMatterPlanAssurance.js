import {
  MATTER_PLAN_CAPABILITIES as C,
  MATTER_PLAN_OWNER_ROLES as R,
  MATTER_PLAN_STATUSES,
  canMatterPlanActor,
  normalizeMatterPlanOwnerRole,
  validateConveyancerMatterPlan,
} from '../../core/transactions/conveyancerMatterPlanContract.js'
import { buildConveyancerMatterActionQueue } from './conveyancerMatterActionQueue.js'
import { generateConveyancerMatterPlan } from './conveyancerMatterPlanGenerator.js'
import { previewConveyancerMatterPlanRerouting } from './conveyancerMatterPlanReroutingPreview.js'
import { buildConveyancerMatterTeamOwnership } from './conveyancerMatterTeamOwnership.js'

export const CONVEYANCER_MATTER_ASSURANCE_VERSION = 'conveyancer_matter_assurance_v1'
export const CONVEYANCER_MATTER_PILOT_VERSION = 'conveyancer_matter_pilot_v1'

export const DEFAULT_CONVEYANCER_PILOT_THRESHOLDS = Object.freeze({
  minimumScenarioPassRate: 1,
  maximumExecutionFailureRate: 0.05,
  observeExecutionFailureRate: 0.02,
  maximumOverdueActionRate: 0.2,
  observeOverdueActionRate: 0.1,
  maximumBlockedActionRate: 0.2,
  observeBlockedActionRate: 0.1,
})

export const CONVEYANCER_MATTER_PILOT_SCENARIOS = Object.freeze([
  Object.freeze({
    id: 'cash_individual_freehold',
    label: 'Cash individual freehold transfer',
    transaction: Object.freeze({ finance_type: 'cash', transaction_type: 'private_sale', buyer_entity_type: 'individual', seller_entity_type: 'individual', seller_has_existing_bond: false, property_tenure: 'freehold' }),
    requiredActionKeys: Object.freeze(['open_matter', 'verify_parties', 'confirm_financial_readiness', 'lodge_transfer', 'close_matter']),
    excludedActionKeys: Object.freeze(['coordinate_bond_attorney', 'coordinate_cancellation_attorney']),
    expectedAssuranceDecision: 'ready',
  }),
  Object.freeze({
    id: 'bond_company_buyer',
    label: 'Bond-financed company buyer',
    transaction: Object.freeze({ finance_type: 'bond', transaction_type: 'private_sale', buyer_entity_type: 'company', seller_entity_type: 'individual', seller_has_existing_bond: false, property_tenure: 'freehold' }),
    requiredActionKeys: Object.freeze(['verify_authority', 'coordinate_bond_attorney', 'confirm_financial_readiness']),
    excludedActionKeys: Object.freeze(['coordinate_cancellation_attorney']),
    expectedAssuranceDecision: 'ready',
  }),
  Object.freeze({
    id: 'hybrid_trust_existing_bond',
    label: 'Hybrid trust matter with seller cancellation',
    transaction: Object.freeze({ finance_type: 'hybrid', transaction_type: 'resale', buyer_entity_type: 'trust', seller_entity_type: 'trust', seller_has_existing_bond: true, property_tenure: 'freehold' }),
    requiredActionKeys: Object.freeze(['verify_authority', 'coordinate_bond_attorney', 'coordinate_cancellation_attorney']),
    excludedActionKeys: Object.freeze([]),
    expectedAssuranceDecision: 'ready',
  }),
  Object.freeze({
    id: 'sectional_title_transfer',
    label: 'Sectional-title clearance path',
    transaction: Object.freeze({ finance_type: 'cash', transaction_type: 'resale', buyer_entity_type: 'individual', seller_entity_type: 'individual', seller_has_existing_bond: false, property_tenure: 'sectional_title' }),
    requiredActionKeys: Object.freeze(['obtain_clearances']),
    requiredEvidenceKeys: Object.freeze(['body_corporate_levy_clearance']),
    excludedActionKeys: Object.freeze([]),
    expectedAssuranceDecision: 'ready',
  }),
  Object.freeze({
    id: 'commercial_vat_entities',
    label: 'Commercial VAT transfer between entities',
    transaction: Object.freeze({ finance_type: 'cash', transaction_type: 'commercial', property_type: 'commercial', property_tenure: 'freehold', buyer_entity_type: 'company', seller_entity_type: 'company', seller_has_existing_bond: false, vat_treatment: 'vat' }),
    requiredActionKeys: Object.freeze(['verify_authority', 'confirm_tax_position', 'draft_transfer_documents']),
    requiredEvidenceKeys: Object.freeze(['vat_treatment_confirmed', 'commercial_beneficial_ownership']),
    excludedActionKeys: Object.freeze([]),
    expectedAssuranceDecision: 'ready',
  }),
  Object.freeze({
    id: 'missing_classification_exception',
    label: 'Incomplete facts fail safely into review',
    transaction: Object.freeze({ transaction_type: 'private_sale', seller_has_existing_bond: false, property_tenure: 'freehold' }),
    requiredActionKeys: Object.freeze(['resolve_fact_gaps']),
    excludedActionKeys: Object.freeze([]),
    expectedAssuranceDecision: 'observe',
  }),
])

export const CONVEYANCER_PILOT_TEAMS = Object.freeze([
  Object.freeze({ id: 'pilot-transfer', name: 'Pilot Transfers', status: 'active', maxWorkload: 30 }),
  Object.freeze({ id: 'pilot-admin', name: 'Pilot Admin', status: 'active', maxWorkload: 20 }),
  Object.freeze({ id: 'pilot-accounts', name: 'Pilot Accounts', status: 'active', maxWorkload: 12 }),
])

export const CONVEYANCER_PILOT_MEMBERS = Object.freeze([
  Object.freeze({ userId: 'pilot-transfer-1', teamId: 'pilot-transfer', role: 'transfer_attorney', status: 'active', maxWorkload: 12 }),
  Object.freeze({ userId: 'pilot-transfer-2', teamId: 'pilot-transfer', role: 'transfer_attorney', status: 'active', maxWorkload: 12 }),
  Object.freeze({ userId: 'pilot-secretary-1', teamId: 'pilot-admin', role: 'conveyancing_secretary', status: 'active', maxWorkload: 10 }),
  Object.freeze({ userId: 'pilot-secretary-2', teamId: 'pilot-admin', role: 'conveyancing_secretary', status: 'active', maxWorkload: 10 }),
  Object.freeze({ userId: 'pilot-accounts-1', teamId: 'pilot-accounts', role: 'admin_staff', planRole: 'accounts', status: 'active', maxWorkload: 8 }),
])

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

function check({ id, label, category = 'platform', severity = 'warning', passed, evaluated = true, detail, evidence = null }) {
  return {
    id,
    label,
    category,
    severity,
    status: !evaluated ? 'not_evaluated' : passed ? 'passed' : 'failed',
    passed: evaluated ? passed === true : null,
    detail,
    evidence,
  }
}

const TRANSFER_TEAM_ROLES = new Set([R.conveyancer, R.transferAttorney])

function eventCapability(event, action) {
  const commandType = text(event.commandType || event.command_type).toLowerCase()
  if (commandType === 'assign') return C.assign
  if (commandType === 'record_evidence') {
    const status = text(event.evidenceChange?.status).toLowerCase()
    if (status === 'waived') return C.waive
    if (['approved', 'rejected'].includes(status)) return C.review
  }
  if (commandType === 'reopen' || (commandType === 'complete' && event.before?.state === 'review')) return C.review
  return action.requiredCapability
}

function eventAuthorityIssue(event, action) {
  const actor = event.actor || {}
  const actorRole = normalizeMatterPlanOwnerRole(actor.role)
  const owner = event.before?.owner || action.owner || {}
  const ownerRole = normalizeMatterPlanOwnerRole(owner.role)
  const managerOverride = canMatterPlanActor(actorRole, C.override)
  const rolesMatch = actorRole === ownerRole || (TRANSFER_TEAM_ROLES.has(actorRole) && TRANSFER_TEAM_ROLES.has(ownerRole))
  const actorTeamIds = Array.isArray(actor.teamIds) ? actor.teamIds.map(text) : []
  const actorMatchesUser = !owner.userId || text(owner.userId) === text(actor.userId)
  const actorMatchesTeam = !owner.teamId || actorTeamIds.includes(text(owner.teamId))
  const capability = eventCapability(event, action)
  if (!actorRole) return 'actor_role_missing'
  if (!managerOverride && !rolesMatch) return 'actor_role_mismatch'
  if (!managerOverride && !actorMatchesUser) return 'actor_user_mismatch'
  if (!managerOverride && !actorMatchesTeam) return 'actor_team_mismatch'
  if (!managerOverride && !canMatterPlanActor(actorRole, capability)) return 'actor_capability_mismatch'
  const expectedAuthority = managerOverride ? 'manager_override' : 'owned_and_authorised'
  if (text(event.authority) !== expectedAuthority) return 'authority_claim_mismatch'
  return ''
}

function eventAudit(plan, events = []) {
  const planId = text(plan.planId || plan.plan_id)
  const planVersion = Number(plan.version || 0)
  const actions = new Map((plan.actions || []).map((action) => [action.key, action]))
  const relevant = (Array.isArray(events) ? events : []).filter((event) =>
    text(event.planId || event.plan_id) === planId && Number(event.planVersion || event.plan_version || 0) === planVersion)
  const issues = []
  const eventIds = relevant.map((event) => text(event.eventId || event.event_id))
  const commandIds = relevant.map((event) => text(event.commandId || event.command_id))
  if (eventIds.some((id) => !id)) issues.push('event_id_missing')
  if (commandIds.some((id) => !id)) issues.push('command_id_missing')
  if (new Set(eventIds).size !== eventIds.length) issues.push('duplicate_event_id')
  if (new Set(commandIds).size !== commandIds.length) issues.push('duplicate_command_id')
  if (relevant.some((event) => !actions.has(text(event.actionKey || event.action_key)))) issues.push('unknown_event_action')

  relevant.forEach((event) => {
    const actionKey = text(event.actionKey || event.action_key)
    const action = actions.get(actionKey)
    if (!action) return
    const authorityIssue = eventAuthorityIssue(event, action)
    if (authorityIssue) issues.push(`event_authority:${actionKey}:${authorityIssue}`)
  })

  for (const [actionKey, action] of actions) {
    const actionEvents = relevant.filter((event) => text(event.actionKey || event.action_key) === actionKey)
      .sort((left, right) => Number(left.actionRevision || left.action_revision || 0) - Number(right.actionRevision || right.action_revision || 0))
    const expectedRevision = Number(action.runtimeRevision || 0)
    if (actionEvents.length !== expectedRevision) issues.push(`event_count_mismatch:${actionKey}`)
    actionEvents.forEach((event, index) => {
      if (Number(event.actionRevision || event.action_revision || 0) !== index + 1) issues.push(`event_revision_gap:${actionKey}`)
      if (index > 0) {
        const previous = actionEvents[index - 1]
        if (Number(previous.after?.runtimeRevision || 0) !== Number(event.before?.runtimeRevision || 0)) issues.push(`event_chain_break:${actionKey}`)
      }
    })
    const latest = actionEvents.at(-1)
    if (latest && Number(latest.actionRevision || latest.action_revision || 0) !== expectedRevision) issues.push(`runtime_revision_mismatch:${actionKey}`)
    if (expectedRevision > 0 && text(action.lastEventId) !== text(latest?.eventId || latest?.event_id)) issues.push(`last_event_mismatch:${actionKey}`)
  }
  return { valid: issues.length === 0, eventCount: relevant.length, issues: unique(issues) }
}

function generationParity(plan, transaction, generatedAt) {
  if (!transaction || !Object.keys(transaction).length) return { evaluated: false, valid: false, issues: ['transaction_snapshot_unavailable'] }
  const regenerated = generateConveyancerMatterPlan({
    transaction: { ...transaction, id: plan.transactionId || transaction.id },
    organisationId: plan.organisationId,
    generatedAt,
    sourceFactsVersion: plan.sourceFactsVersion,
  })
  if (!regenerated.valid) return { evaluated: true, valid: false, issues: regenerated.errors }
  const current = new Map((plan.actions || []).map((action) => [action.key, action.definitionFingerprint]))
  const candidate = new Map((regenerated.plan.actions || []).map((action) => [action.key, action.definitionFingerprint]))
  const issues = []
  for (const [actionKey, definition] of current) {
    if (!candidate.has(actionKey)) issues.push(`unexpected_current_action:${actionKey}`)
    else if (candidate.get(actionKey) !== definition) issues.push(`definition_drift:${actionKey}`)
  }
  for (const actionKey of candidate.keys()) if (!current.has(actionKey)) issues.push(`missing_current_action:${actionKey}`)
  return { evaluated: true, valid: issues.length === 0, issues, regenerated }
}

function reroutingRehearsal(plan, transaction, generatedAt) {
  if (!transaction || !Object.keys(transaction).length) return { evaluated: false, valid: false, issues: ['transaction_snapshot_unavailable'] }
  const preview = previewConveyancerMatterPlanRerouting({
    currentPlan: plan,
    proposedTransaction: { ...transaction, id: plan.transactionId || transaction.id },
    actorRole: R.firmManager,
    changeReason: 'A7 assurance no-change rerouting rehearsal',
    generatedAt,
  })
  const issues = []
  if (!preview.candidatePlanValid) issues.push('candidate_plan_invalid')
  if (preview.status !== 'no_changes') issues.push(`unexpected_preview_status:${preview.status}`)
  if (preview.summary.factChanges > 0) issues.push('unexpected_fact_changes')
  if (preview.summary.actionsAdded > 0) issues.push('unexpected_actions_added')
  if (preview.summary.actionsRemoved > 0) issues.push('unexpected_actions_removed')
  if (preview.summary.actionsChanged > 0) issues.push('unexpected_actions_changed')
  return { evaluated: true, valid: issues.length === 0, issues, status: preview.status }
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  Object.values(value).forEach(deepFreeze)
  return Object.freeze(value)
}

export function buildConveyancerMatterPlanAssurance({
  plan = {},
  transaction = null,
  members = [],
  teams = [],
  actor = { role: R.firmManager },
  events = [],
  asOf = '',
  existingWorkloadByUser = {},
  existingWorkloadByTeam = {},
} = {}) {
  const resolvedAsOf = validDate(asOf) ? new Date(asOf).toISOString() : new Date().toISOString()
  const planValidation = validateConveyancerMatterPlan(plan)
  const queue = buildConveyancerMatterActionQueue({ plan, actor, asOf: resolvedAsOf, includeCompleted: true })
  const ownership = buildConveyancerMatterTeamOwnership({
    plan,
    members,
    teams,
    actor,
    asOf: resolvedAsOf,
    existingWorkloadByUser,
    existingWorkloadByTeam,
  })
  const audit = eventAudit(plan, events)
  const parity = generationParity(plan, transaction, plan.generatedAt || resolvedAsOf)
  const rerouting = reroutingRehearsal(plan, transaction, plan.generatedAt || resolvedAsOf)
  const activeActions = ownership.actions || []
  const terminalCount = (plan.actions || []).filter((action) => ['completed', 'cancelled'].includes(action.state)).length
  const matterComplete = terminalCount === (plan.actions || []).length && (plan.actions || []).length > 0
  const missingFacts = plan.factsSnapshot?.missingFields || []
  const unowned = activeActions.filter((action) => ['unassigned', 'stale_user_assignment', 'stale_team_assignment'].includes(action.ownershipStatus))
  const checks = [
    check({ id: 'a1_contract_valid', label: 'A1 matter-plan contract is valid', severity: 'critical', passed: planValidation.valid, detail: planValidation.valid ? 'Plan contract verified.' : `${planValidation.errors.length} contract error(s).`, evidence: planValidation.errors }),
    check({ id: 'active_plan_runtime', label: 'The assured plan is active', severity: 'critical', passed: plan.status === MATTER_PLAN_STATUSES.active, detail: `Plan status: ${plan.status || 'missing'}.` }),
    check({ id: 'a2_generation_parity', label: 'Active definitions match deterministic A2 generation', severity: 'critical', evaluated: parity.evaluated, passed: parity.valid, detail: parity.evaluated ? parity.valid ? 'No generated definition drift.' : `${parity.issues.length} generation parity issue(s).` : 'Transaction snapshot unavailable.', evidence: parity.issues }),
    check({ id: 'a3_rerouting_rehearsal', label: 'A3 rerouting reproduces the active route without side effects', severity: 'critical', evaluated: rerouting.evaluated, passed: rerouting.valid, detail: rerouting.evaluated ? rerouting.valid ? 'No-change rerouting rehearsal verified.' : `${rerouting.issues.length} rerouting rehearsal issue(s).` : 'Transaction snapshot unavailable.', evidence: rerouting.issues }),
    check({ id: 'a4_queue_valid', label: 'A4 single action queue is available', severity: 'critical', passed: queue.valid, detail: queue.valid ? `${queue.metrics.visible} queue item(s) available.` : queue.blockers.join(', '), evidence: queue.blockers }),
    check({ id: 'a5_audit_integrity', label: 'A5 runtime event chain is complete', severity: 'critical', passed: audit.valid, detail: audit.valid ? `${audit.eventCount} event(s) verified.` : `${audit.issues.length} audit issue(s).`, evidence: audit.issues }),
    check({ id: 'a6_critical_coverage', label: 'Critical actions have resilient team coverage', severity: 'critical', passed: ownership.valid && ownership.coverageRisks.length === 0, detail: ownership.valid ? `${ownership.coverageRisks.length} critical coverage risk(s).` : 'Ownership projection unavailable.', evidence: ownership.coverageRisks }),
    check({ id: 'classification_complete', label: 'Plan-driving transaction facts are complete', category: 'matter', passed: missingFacts.length === 0, detail: missingFacts.length ? `Missing: ${missingFacts.join(', ')}.` : 'Canonical facts complete.', evidence: missingFacts }),
    check({ id: 'action_ownership_complete', label: 'Every active action has valid team or user ownership', category: 'matter', passed: ownership.valid && unowned.length === 0, detail: `${unowned.length} active ownership exception(s).`, evidence: unowned.map((item) => ({ actionKey: item.actionKey, ownershipStatus: item.ownershipStatus })) }),
    check({ id: 'queue_actionable', label: 'The matter exposes an executable next action or is complete', category: 'matter', passed: matterComplete || Boolean(queue.primaryAction), detail: queue.primaryAction ? `Primary action: ${queue.primaryAction.label}.` : matterComplete ? 'Matter terminal.' : 'No executable next action.' }),
    check({ id: 'deadline_health', label: 'No active action is overdue', category: 'matter', passed: queue.metrics.overdue === 0, detail: `${queue.metrics.overdue} overdue action(s).` }),
    check({ id: 'blocker_health', label: 'No active action is blocked', category: 'matter', passed: queue.metrics.blocked === 0, detail: `${queue.metrics.blocked} blocked action(s).` }),
    check({ id: 'capacity_health', label: 'No assigned member or team is overloaded', category: 'matter', passed: ownership.valid && ownership.metrics.overloadedMembers === 0 && ownership.metrics.overloadedTeams === 0, detail: ownership.valid ? `${ownership.metrics.overloadedMembers} member and ${ownership.metrics.overloadedTeams} team overload(s).` : 'Ownership projection unavailable.' }),
  ]
  const failedCritical = checks.filter((item) => item.status === 'failed' && item.severity === 'critical')
  const failedWarnings = checks.filter((item) => item.status === 'failed' && item.severity !== 'critical')
  const notEvaluatedCritical = checks.filter((item) => item.status === 'not_evaluated' && item.severity === 'critical')
  const decision = failedCritical.length ? 'blocked' : failedWarnings.length || notEvaluatedCritical.length ? 'observe' : 'ready'
  const evidence = {
    version: CONVEYANCER_MATTER_ASSURANCE_VERSION,
    generatedAt: resolvedAsOf,
    planId: plan.planId || plan.plan_id || null,
    planVersion: Number(plan.version || 0),
    decision,
    contractErrorCount: planValidation.errors.length,
    queueMetrics: queue.metrics,
    ownershipMetrics: ownership.metrics,
    audit,
    generationParity: { evaluated: parity.evaluated, valid: parity.valid, issues: parity.issues },
    reroutingRehearsal: rerouting,
    checks: checks.map((item) => ({ id: item.id, status: item.status, detail: item.detail })),
  }
  return deepFreeze({
    version: CONVEYANCER_MATTER_ASSURANCE_VERSION,
    decision,
    decisionLabel: decision === 'ready' ? 'Matter plan assured' : decision === 'observe' ? 'Assured with operational attention' : 'Assurance blocked',
    releaseReady: decision === 'ready',
    checks,
    failedChecks: checks.filter((item) => item.status === 'failed'),
    failedCriticalCount: failedCritical.length,
    failedWarningCount: failedWarnings.length,
    notEvaluatedCriticalCount: notEvaluatedCritical.length,
    evidence,
  })
}

function teamForRole(role) {
  if (role === R.secretary) return 'pilot-admin'
  if (role === R.accounts) return 'pilot-accounts'
  return 'pilot-transfer'
}

function evidenceKeys(plan) {
  return new Set((plan.actions || []).flatMap((action) => (action.evidenceRequirements || []).map((item) => item.key)))
}

function pilotScenarioResult(scenario, options) {
  const transaction = { id: `pilot-${scenario.id}`, organisation_id: options.organisationId, ...scenario.transaction }
  const generated = generateConveyancerMatterPlan({ transaction, generatedAt: options.generatedAt })
  if (!generated.valid) return { scenarioId: scenario.id, label: scenario.label, passed: false, errors: generated.errors, assurance: null }
  const plan = {
    ...generated.plan,
    status: MATTER_PLAN_STATUSES.active,
    activatedAt: options.generatedAt,
    actions: generated.plan.actions.map((action) => ({
      ...action,
      owner: { ...action.owner, teamId: teamForRole(action.owner.role), userId: null },
    })),
  }
  const assurance = buildConveyancerMatterPlanAssurance({
    plan,
    transaction,
    members: options.members,
    teams: options.teams,
    actor: { role: R.firmManager, userId: 'pilot-manager' },
    events: [],
    asOf: options.generatedAt,
  })
  const actionKeys = new Set(plan.actions.map((action) => action.key))
  const planEvidenceKeys = evidenceKeys(plan)
  const missingActions = (scenario.requiredActionKeys || []).filter((key) => !actionKeys.has(key))
  const unexpectedActions = (scenario.excludedActionKeys || []).filter((key) => actionKeys.has(key))
  const missingEvidence = (scenario.requiredEvidenceKeys || []).filter((key) => !planEvidenceKeys.has(key))
  const decisionMatched = assurance.decision === scenario.expectedAssuranceDecision
  return {
    scenarioId: scenario.id,
    label: scenario.label,
    passed: !missingActions.length && !unexpectedActions.length && !missingEvidence.length && decisionMatched,
    expectedAssuranceDecision: scenario.expectedAssuranceDecision,
    actualAssuranceDecision: assurance.decision,
    missingActions,
    unexpectedActions,
    missingEvidence,
    assurance,
  }
}

function operationalTriggers(metrics, thresholds) {
  const attempts = number(metrics.executionAttempts)
  const activeActions = number(metrics.activeActions)
  const executionFailureRate = attempts ? number(metrics.executionFailures) / attempts : 0
  const overdueRate = activeActions ? number(metrics.overdueActions) / activeActions : 0
  const blockedRate = activeActions ? number(metrics.blockedActions) / activeActions : 0
  const triggers = [
    number(metrics.generationFailures) > 0 ? { key: 'generation_failure', severity: 'critical', detail: `${number(metrics.generationFailures)} generation failure(s).` } : null,
    number(metrics.unauthorisedMutationAttempts || metrics.unauthorizedMutationAttempts) > 0 ? { key: 'unauthorised_mutation', severity: 'critical', detail: 'An unauthorised mutation attempt reached the pilot boundary.' } : null,
    number(metrics.auditGaps) > 0 ? { key: 'audit_gap', severity: 'critical', detail: `${number(metrics.auditGaps)} audit gap(s).` } : null,
    number(metrics.activeMattersWithoutQueue) > 0 ? { key: 'missing_action_queue', severity: 'critical', detail: `${number(metrics.activeMattersWithoutQueue)} active matter(s) lack a queue.` } : null,
    executionFailureRate > thresholds.maximumExecutionFailureRate ? { key: 'execution_failure_rate', severity: 'critical', detail: `${Math.round(executionFailureRate * 100)}% execution failure rate.` } : executionFailureRate > thresholds.observeExecutionFailureRate ? { key: 'execution_failure_rate', severity: 'warning', detail: `${Math.round(executionFailureRate * 100)}% execution failure rate.` } : null,
    overdueRate > thresholds.maximumOverdueActionRate ? { key: 'overdue_action_rate', severity: 'critical', detail: `${Math.round(overdueRate * 100)}% overdue action rate.` } : overdueRate > thresholds.observeOverdueActionRate ? { key: 'overdue_action_rate', severity: 'warning', detail: `${Math.round(overdueRate * 100)}% overdue action rate.` } : null,
    blockedRate > thresholds.maximumBlockedActionRate ? { key: 'blocked_action_rate', severity: 'critical', detail: `${Math.round(blockedRate * 100)}% blocked action rate.` } : blockedRate > thresholds.observeBlockedActionRate ? { key: 'blocked_action_rate', severity: 'warning', detail: `${Math.round(blockedRate * 100)}% blocked action rate.` } : null,
  ].filter(Boolean)
  return { triggers, executionFailureRate, overdueRate, blockedRate }
}

export function runConveyancerMatterPilotSuite({
  scenarios = CONVEYANCER_MATTER_PILOT_SCENARIOS,
  members = CONVEYANCER_PILOT_MEMBERS,
  teams = CONVEYANCER_PILOT_TEAMS,
  generatedAt = '',
  organisationId = 'pilot-organisation',
  thresholds = {},
  operationalMetrics = {},
} = {}) {
  const resolvedGeneratedAt = validDate(generatedAt) ? new Date(generatedAt).toISOString() : new Date().toISOString()
  const effectiveThresholds = { ...DEFAULT_CONVEYANCER_PILOT_THRESHOLDS, ...thresholds }
  const results = (Array.isArray(scenarios) ? scenarios : []).map((scenario) => pilotScenarioResult(scenario, {
    members,
    teams,
    generatedAt: resolvedGeneratedAt,
    organisationId,
  }))
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
    version: CONVEYANCER_MATTER_PILOT_VERSION,
    decision,
    decisionLabel: decision === 'go' ? 'Pilot evidence supports controlled expansion' : decision === 'observe' ? 'Pilot may continue under observation' : 'Hold or roll back the pilot',
    generatedAt: resolvedGeneratedAt,
    scenarioResults: results,
    metrics: {
      scenarioCount: results.length,
      passedCount,
      failedCount: results.length - passedCount,
      scenarioPassRate,
      readyCount: results.filter((item) => item.actualAssuranceDecision === 'ready').length,
      expectedObserveCount: results.filter((item) => item.expectedAssuranceDecision === 'observe' && item.actualAssuranceDecision === 'observe').length,
      executionFailureRate: operational.executionFailureRate,
      overdueActionRate: operational.overdueRate,
      blockedActionRate: operational.blockedRate,
    },
    thresholds: effectiveThresholds,
    rollbackTriggers: operational.triggers,
    releaseBlockers: unique(releaseBlockers),
  })
}

export function buildConveyancerMatterPilotManifest({
  firmIds = [],
  startsAt = '',
  endsAt = '',
  maximumMatters = 25,
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
  if (!text(rollbackOwnerId)) errors.push('rollback_owner_required')
  if (!text(supportOwnerId)) errors.push('support_owner_required')
  return deepFreeze({
    version: CONVEYANCER_MATTER_PILOT_VERSION,
    valid: errors.length === 0,
    errors,
    cohort: {
      firmIds: normalizedFirmIds,
      maximumMatters: Number(maximumMatters),
      startsAt: validDate(startsAt) ? new Date(startsAt).toISOString() : null,
      endsAt: validDate(endsAt) ? new Date(endsAt).toISOString() : null,
    },
    owners: { rollbackOwnerId: text(rollbackOwnerId) || null, supportOwnerId: text(supportOwnerId) || null },
    controls: {
      legacyWorkflowFallback: true,
      killSwitchRequired: true,
      automaticRerouting: false,
      automaticRebalancing: false,
      databaseWritesEnabledByManifest: false,
    },
    entryCriteria: ['A1-A7 tests passing', 'active firm membership coverage', 'named rollback and support owners', 'legacy workflow fallback available'],
    exitCriteria: ['100% scenario pass rate', 'no critical rollback trigger', 'complete audit chains', 'no unauthorised cross-role mutation', 'queue and ownership coverage within thresholds'],
  })
}

export function serializeConveyancerMatterAssuranceEvidence(assurance) {
  return JSON.stringify(assurance?.evidence || {}, null, 2)
}
