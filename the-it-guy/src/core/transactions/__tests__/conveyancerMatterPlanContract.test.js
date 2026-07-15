import assert from 'node:assert/strict'
import {
  CONVEYANCER_MATTER_PLAN_CONTRACT_VERSION,
  MATTER_PLAN_ACTION_PRIORITIES,
  MATTER_PLAN_ACTION_STATES,
  MATTER_PLAN_CAPABILITIES,
  MATTER_PLAN_DEPENDENCY_TYPES,
  MATTER_PLAN_DUE_DATE_RULE_TYPES,
  MATTER_PLAN_EVIDENCE_STATUSES,
  MATTER_PLAN_EVIDENCE_TYPES,
  MATTER_PLAN_OWNER_ROLES,
  MATTER_PLAN_STATUSES,
  canMatterPlanActor,
  evaluateMatterPlanActionTransition,
  evaluateMatterPlanSupersession,
  validateConveyancerMatterPlan,
  validateMatterPlanAction,
} from '../conveyancerMatterPlanContract.js'

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

const baseEvidenceRequirement = {
  key: 'instruction_received',
  label: 'Transfer instruction received',
  type: MATTER_PLAN_EVIDENCE_TYPES.document,
  required: true,
  requiresApproval: true,
}

function action(overrides = {}) {
  return {
    key: 'open_matter',
    label: 'Open the conveyancing matter',
    state: MATTER_PLAN_ACTION_STATES.doNow,
    priority: MATTER_PLAN_ACTION_PRIORITIES.high,
    owner: { role: MATTER_PLAN_OWNER_ROLES.secretary },
    requiredCapability: MATTER_PLAN_CAPABILITIES.executeOperational,
    dependencies: [],
    dueDateRule: { type: MATTER_PLAN_DUE_DATE_RULE_TYPES.planActivationOffset, offsetDays: 0 },
    evidenceRequirements: [baseEvidenceRequirement],
    evidence: [],
    ...overrides,
  }
}

function plan(overrides = {}) {
  return {
    contractVersion: CONVEYANCER_MATTER_PLAN_CONTRACT_VERSION,
    planId: 'plan-1',
    transactionId: 'transaction-1',
    organisationId: 'organisation-1',
    version: 1,
    status: MATTER_PLAN_STATUSES.active,
    generatedAt: '2026-07-15T08:00:00.000Z',
    activatedAt: '2026-07-15T08:05:00.000Z',
    sourceFactsVersion: 'facts-v1',
    actions: [action()],
    ...overrides,
  }
}

test('validates a canonical versioned matter plan', () => {
  const result = validateConveyancerMatterPlan(plan())
  assert.equal(result.valid, true)
  assert.equal(result.plan.actions[0].owner.role, MATTER_PLAN_OWNER_ROLES.secretary)
})

test('requires immutable version lineage after version one', () => {
  const result = validateConveyancerMatterPlan(plan({ version: 2, previousPlanId: '', changeReason: '' }))
  assert.equal(result.valid, false)
  assert.ok(result.errors.includes('previous_plan_id_required'))
  assert.ok(result.errors.includes('plan_change_reason_required'))
})

test('rejects duplicate action keys and dependency cycles', () => {
  const result = validateConveyancerMatterPlan(plan({
    actions: [
      action({ key: 'request_fica', dependencies: [{ key: 'review_fica', type: MATTER_PLAN_DEPENDENCY_TYPES.action }] }),
      action({ key: 'review_fica', dependencies: [{ key: 'request_fica', type: MATTER_PLAN_DEPENDENCY_TYPES.action }] }),
    ],
  }))
  assert.equal(result.valid, false)
  assert.ok(result.errors.some((error) => error.startsWith('cyclic_action_dependencies:')))
})

test('rejects action owners without the required capability', () => {
  const result = validateMatterPlanAction(action({
    owner: { role: MATTER_PLAN_OWNER_ROLES.secretary },
    requiredCapability: MATTER_PLAN_CAPABILITIES.executeLegal,
  }))
  assert.equal(result.valid, false)
  assert.ok(result.errors.includes('owner_lacks_required_capability'))
  assert.equal(canMatterPlanActor(MATTER_PLAN_OWNER_ROLES.firmManager, MATTER_PLAN_CAPABILITIES.override), true)
})

test('requires due-date references for dependent rules', () => {
  const result = validateMatterPlanAction(action({
    dueDateRule: { type: MATTER_PLAN_DUE_DATE_RULE_TYPES.actionCompletionOffset, offsetDays: 2 },
  }))
  assert.ok(result.errors.includes('due_date_reference_required'))
})

test('rejects explicit invalid enum values instead of silently defaulting them', () => {
  const result = validateConveyancerMatterPlan(plan({
    status: 'mystery',
    actions: [action({ state: 'somewhere', priority: 'eventually', requiredCapability: 'magic' })],
  }))
  assert.equal(result.valid, false)
  assert.ok(result.errors.includes('invalid_plan_status'))
  assert.ok(result.errors.includes('open_matter:invalid_action_state'))
  assert.ok(result.errors.includes('open_matter:invalid_action_priority'))
  assert.ok(result.errors.includes('open_matter:invalid_action_capability'))
})

test('requires waiting, blocked and cancelled states to carry context', () => {
  assert.ok(validateMatterPlanAction(action({ state: MATTER_PLAN_ACTION_STATES.waiting })).errors.includes('waiting_on_required'))
  assert.ok(validateMatterPlanAction(action({ state: MATTER_PLAN_ACTION_STATES.blocked })).errors.includes('state_reason_required'))
  assert.ok(validateMatterPlanAction(action({ state: MATTER_PLAN_ACTION_STATES.cancelled })).errors.includes('state_reason_required'))
})

test('prevents completion until required evidence is satisfied', () => {
  const incomplete = validateMatterPlanAction(action({
    state: MATTER_PLAN_ACTION_STATES.completed,
    completedAt: '2026-07-15T12:00:00.000Z',
  }))
  assert.ok(incomplete.errors.includes('required_evidence_not_satisfied'))

  const complete = validateMatterPlanAction(action({
    state: MATTER_PLAN_ACTION_STATES.completed,
    completedAt: '2026-07-15T12:00:00.000Z',
    evidence: [{
      requirementKey: baseEvidenceRequirement.key,
      status: MATTER_PLAN_EVIDENCE_STATUSES.approved,
      referenceId: 'document-1',
      capturedAt: '2026-07-15T11:00:00.000Z',
    }],
  }))
  assert.equal(complete.valid, true)
})

test('waived evidence requires an auditable reason', () => {
  const result = validateMatterPlanAction(action({
    evidence: [{ requirementKey: baseEvidenceRequirement.key, status: MATTER_PLAN_EVIDENCE_STATUSES.waived }],
  }))
  assert.ok(result.errors.includes('waived_evidence_reason_required'))
})

test('evidence records require an audit timestamp', () => {
  const result = validateMatterPlanAction(action({
    evidence: [{ requirementKey: 'fica_pack', status: MATTER_PLAN_EVIDENCE_STATUSES.provided, referenceId: 'doc-1' }],
  }))
  assert.equal(result.valid, false)
  assert.ok(result.errors.includes('evidence_captured_at_required'))
})

test('action transitions distinguish normal progress from controlled reopening', () => {
  assert.deepEqual(evaluateMatterPlanActionTransition({
    fromState: MATTER_PLAN_ACTION_STATES.doNow,
    toState: MATTER_PLAN_ACTION_STATES.completed,
    actorRole: MATTER_PLAN_OWNER_ROLES.secretary,
    requiredEvidenceSatisfied: false,
  }), { allowed: false, reason: 'required_evidence_not_satisfied' })

  assert.equal(evaluateMatterPlanActionTransition({
    fromState: MATTER_PLAN_ACTION_STATES.completed,
    toState: MATTER_PLAN_ACTION_STATES.doNow,
    actorRole: MATTER_PLAN_OWNER_ROLES.conveyancer,
    reason: 'Correcting rejected signature evidence',
  }).allowed, true)

  assert.equal(evaluateMatterPlanActionTransition({
    fromState: MATTER_PLAN_ACTION_STATES.completed,
    toState: MATTER_PLAN_ACTION_STATES.doNow,
    actorRole: MATTER_PLAN_OWNER_ROLES.secretary,
    reason: 'Retry',
  }).allowed, false)
})

test('plan supersession requires manager authority, sequential version and reason', () => {
  const currentPlan = plan()
  const nextPlan = plan({
    planId: 'plan-2',
    version: 2,
    previousPlanId: 'plan-1',
    changeReason: 'Seller changed from individual to deceased estate',
  })
  assert.deepEqual(evaluateMatterPlanSupersession({
    currentPlan,
    nextPlan,
    actorRole: MATTER_PLAN_OWNER_ROLES.firmManager,
  }), { allowed: true, reason: 'authorised_supersession' })
  assert.equal(evaluateMatterPlanSupersession({
    currentPlan,
    nextPlan,
    actorRole: MATTER_PLAN_OWNER_ROLES.conveyancer,
  }).reason, 'plan_supersession_not_authorised')
})

console.log('conveyancer matter-plan A1 contract tests passed')
