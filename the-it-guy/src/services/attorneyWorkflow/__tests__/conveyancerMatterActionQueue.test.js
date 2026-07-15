import assert from 'node:assert/strict'
import {
  MATTER_PLAN_ACTION_STATES,
  MATTER_PLAN_CAPABILITIES,
  MATTER_PLAN_DUE_DATE_RULE_TYPES,
  MATTER_PLAN_EVIDENCE_STATUSES,
  MATTER_PLAN_OWNER_ROLES,
  MATTER_PLAN_STATUSES,
} from '../../../core/transactions/conveyancerMatterPlanContract.js'
import { generateConveyancerMatterPlan } from '../conveyancerMatterPlanGenerator.js'
import {
  CONVEYANCER_MATTER_ACTION_QUEUE_VERSION,
  buildConveyancerMatterActionQueue,
} from '../conveyancerMatterActionQueue.js'

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

const activatedAt = '2026-07-15T08:00:00.000Z'

function transaction(overrides = {}) {
  return {
    id: 'tx-a4-1',
    organisation_id: 'org-a4-1',
    finance_type: 'cash',
    transaction_type: 'private_sale',
    buyer_entity_type: 'individual',
    seller_entity_type: 'individual',
    seller_has_existing_bond: false,
    property_tenure: 'freehold',
    ...overrides,
  }
}

function activePlan(sourceTransaction = transaction()) {
  const generated = generateConveyancerMatterPlan({ transaction: sourceTransaction, generatedAt: activatedAt })
  assert.equal(generated.valid, true)
  return {
    ...structuredClone(generated.plan),
    status: MATTER_PLAN_STATUSES.active,
    activatedAt,
  }
}

function completeOpenMatter(plan) {
  const action = plan.actions.find((item) => item.key === 'open_matter')
  action.state = MATTER_PLAN_ACTION_STATES.completed
  action.completedAt = '2026-07-15T09:00:00.000Z'
  action.evidence = [{
    requirementKey: 'signed_transfer_instruction',
    status: MATTER_PLAN_EVIDENCE_STATUSES.provided,
    referenceId: 'instruction-1',
    capturedAt: '2026-07-15T08:30:00.000Z',
  }]
}

function queue(plan, actorRole = MATTER_PLAN_OWNER_ROLES.firmManager, overrides = {}) {
  return buildConveyancerMatterActionQueue({
    plan,
    actor: { role: actorRole },
    asOf: '2026-07-15T10:00:00.000Z',
    ...overrides,
  })
}

test('builds one deterministic queue and primary action from an active plan', () => {
  const result = queue(activePlan())
  assert.equal(result.version, CONVEYANCER_MATTER_ACTION_QUEUE_VERSION)
  assert.equal(result.valid, true)
  assert.equal(result.primaryAction.actionKey, 'open_matter')
  assert.equal(result.primaryAction.bucket, 'do_now')
  assert.equal(result.metrics.countsByBucket.do_now, 1)
  assert.equal(Object.isFrozen(result), true)
})

test('promotes upcoming actions when their dependencies complete without mutating the plan', () => {
  const plan = activePlan()
  completeOpenMatter(plan)
  const originalState = plan.actions.find((item) => item.key === 'verify_parties').state
  const result = queue(plan, MATTER_PLAN_OWNER_ROLES.transferAttorney)
  const verification = result.items.find((item) => item.actionKey === 'verify_parties')
  assert.equal(originalState, MATTER_PLAN_ACTION_STATES.upcoming)
  assert.equal(verification.bucket, 'do_now')
  assert.equal(verification.derivedReady, true)
  assert.equal(result.primaryAction.actionKey, 'verify_parties')
  assert.equal(plan.actions.find((item) => item.key === 'verify_parties').state, MATTER_PLAN_ACTION_STATES.upcoming)
})

test('derives due-today, upcoming and overdue urgency in the configured timezone', () => {
  const plan = activePlan()
  const today = queue(plan)
  assert.equal(today.items.find((item) => item.actionKey === 'open_matter').dueStatus, 'due_today')
  const overdue = queue(plan, MATTER_PLAN_OWNER_ROLES.firmManager, { asOf: '2026-07-17T10:00:00.000Z' })
  assert.equal(overdue.items.find((item) => item.actionKey === 'open_matter').dueStatus, 'overdue')
  assert.equal(overdue.metrics.overdue >= 1, true)
})

test('resolves fixed, event-relative and inherited due-date rules', () => {
  const plan = activePlan()
  plan.actions.find((item) => item.key === 'open_matter').dueDateRule = {
    type: MATTER_PLAN_DUE_DATE_RULE_TYPES.fixedDate,
    dueAt: '2026-07-18T12:00:00.000Z',
  }
  plan.actions.find((item) => item.key === 'verify_parties').dueDateRule = {
    type: MATTER_PLAN_DUE_DATE_RULE_TYPES.eventOffset,
    referenceKey: 'otp_signed',
    offsetDays: 2,
  }
  plan.actions.find((item) => item.key === 'obtain_clearances').dueDateRule = {
    type: MATTER_PLAN_DUE_DATE_RULE_TYPES.inherited,
    referenceKey: 'open_matter',
  }
  const result = queue(plan, MATTER_PLAN_OWNER_ROLES.firmManager, {
    events: { otp_signed: '2026-07-16T09:00:00.000Z' },
  })
  assert.match(result.items.find((item) => item.actionKey === 'open_matter').dueAt, /^2026-07-18/)
  assert.match(result.items.find((item) => item.actionKey === 'verify_parties').dueAt, /^2026-07-18/)
  assert.match(result.items.find((item) => item.actionKey === 'obtain_clearances').dueAt, /^2026-07-18/)
})

test('turns a cancelled required dependency into a visible blocker', () => {
  const plan = activePlan()
  const open = plan.actions.find((item) => item.key === 'open_matter')
  open.state = MATTER_PLAN_ACTION_STATES.cancelled
  open.stateReason = 'Instruction withdrawn'
  const result = queue(plan)
  const verification = result.items.find((item) => item.actionKey === 'verify_parties')
  assert.equal(verification.bucket, 'blocked')
  assert.equal(verification.dependencySummary.blocked, 1)
  assert.match(verification.blockerReason, /open and triage/i)
})

test('shows the exact outstanding evidence contract on each action', () => {
  const result = queue(activePlan())
  const opening = result.items.find((item) => item.actionKey === 'open_matter')
  assert.equal(opening.evidence.required, 1)
  assert.deepEqual(opening.evidence.missing.map((item) => item.key), ['signed_transfer_instruction'])
  assert.equal(result.metrics.evidenceGaps > 0, true)
})

test('keeps work owned by another legal lane visible but read-only', () => {
  const plan = activePlan(transaction({ finance_type: 'bond' }))
  const coordination = plan.actions.find((item) => item.key === 'coordinate_bond_attorney')
  coordination.owner.role = MATTER_PLAN_OWNER_ROLES.bondAttorney
  coordination.requiredCapability = MATTER_PLAN_CAPABILITIES.executeLegal
  completeOpenMatter(plan)

  const result = queue(plan, MATTER_PLAN_OWNER_ROLES.transferAttorney)
  const item = result.items.find((entry) => entry.actionKey === 'coordinate_bond_attorney')
  assert.equal(item.bucket, 'do_now')
  assert.equal(item.canExecute, false)
  assert.equal(item.permissionReason, 'owned_by_another_role')
})

test('ranks review and executable work ahead of blockers, waiting and upcoming work', () => {
  const plan = activePlan()
  completeOpenMatter(plan)
  const verify = plan.actions.find((item) => item.key === 'verify_parties')
  verify.state = MATTER_PLAN_ACTION_STATES.review
  const clearances = plan.actions.find((item) => item.key === 'obtain_clearances')
  clearances.state = MATTER_PLAN_ACTION_STATES.blocked
  clearances.stateReason = 'Municipal account mismatch'
  const result = queue(plan)
  assert.equal(result.items[0].bucket, 'review')
  assert.equal(result.primaryAction.actionKey, 'verify_parties')
  assert.equal(result.attentionAction.actionKey, 'verify_parties')
})

test('hides terminal actions by default and can include them for a complete view', () => {
  const plan = activePlan()
  completeOpenMatter(plan)
  assert.equal(queue(plan).items.some((item) => item.actionKey === 'open_matter'), false)
  assert.equal(queue(plan, MATTER_PLAN_OWNER_ROLES.firmManager, { includeCompleted: true }).items.some((item) => item.actionKey === 'open_matter'), true)
})

test('rejects draft plans as an operational queue source', () => {
  const draft = generateConveyancerMatterPlan({ transaction: transaction(), generatedAt: activatedAt }).plan
  const result = queue(draft)
  assert.equal(result.valid, false)
  assert.ok(result.blockers.includes('matter_plan_must_be_active'))
})

test('returns no queue contents to an actor without plan-view capability', () => {
  const result = queue(activePlan(), 'unknown_role')
  assert.equal(result.valid, false)
  assert.deepEqual(result.items, [])
  assert.equal(result.metrics.total, 0)
  assert.ok(result.blockers.includes('actor_cannot_view_matter_plan'))
})

test('falls back safely when an invalid timezone is supplied', () => {
  const result = queue(activePlan(), MATTER_PLAN_OWNER_ROLES.firmManager, { timeZone: 'Mars/Olympus' })
  assert.equal(result.valid, true)
  assert.equal(result.timeZone, 'Africa/Johannesburg')
})

console.log('conveyancer matter-plan A4 single action queue tests passed')
