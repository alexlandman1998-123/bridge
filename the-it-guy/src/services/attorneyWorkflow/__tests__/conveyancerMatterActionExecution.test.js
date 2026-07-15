import assert from 'node:assert/strict'
import {
  MATTER_PLAN_ACTION_STATES,
  MATTER_PLAN_CAPABILITIES,
  MATTER_PLAN_EVIDENCE_STATUSES,
  MATTER_PLAN_OWNER_ROLES,
  MATTER_PLAN_STATUSES,
} from '../../../core/transactions/conveyancerMatterPlanContract.js'
import { generateConveyancerMatterPlan } from '../conveyancerMatterPlanGenerator.js'
import {
  CONVEYANCER_MATTER_ACTION_EXECUTION_VERSION,
  MATTER_ACTION_COMMAND_TYPES,
  executeConveyancerMatterAction,
} from '../conveyancerMatterActionExecution.js'

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

const occurredAt = '2026-07-15T10:00:00.000Z'

function transaction(overrides = {}) {
  return {
    id: 'tx-a5-1',
    organisation_id: 'org-a5-1',
    finance_type: 'cash',
    transaction_type: 'private_sale',
    buyer_entity_type: 'individual',
    seller_entity_type: 'individual',
    seller_has_existing_bond: false,
    property_tenure: 'freehold',
    ...overrides,
  }
}

function activePlan(source = transaction()) {
  const generated = generateConveyancerMatterPlan({ transaction: source, generatedAt: '2026-07-15T08:00:00.000Z' })
  assert.equal(generated.valid, true)
  return {
    ...structuredClone(generated.plan),
    status: MATTER_PLAN_STATUSES.active,
    activatedAt: '2026-07-15T08:05:00.000Z',
  }
}

function command(plan, actionKey, type, overrides = {}) {
  const action = plan.actions.find((item) => item.key === actionKey)
  return {
    commandId: `cmd-${actionKey}-${type}-${Number(action?.runtimeRevision || 0)}`,
    type,
    actionKey,
    expectedPlanId: plan.planId,
    expectedPlanVersion: plan.version,
    expectedActionRevision: Number(action?.runtimeRevision || 0),
    ...overrides,
  }
}

function execute(plan, actionKey, type, overrides = {}, actor = { role: MATTER_PLAN_OWNER_ROLES.firmManager }) {
  return executeConveyancerMatterAction({
    plan,
    command: command(plan, actionKey, type, overrides),
    actor,
    occurredAt,
  })
}

function provideOpenInstruction(plan) {
  return execute(plan, 'open_matter', MATTER_ACTION_COMMAND_TYPES.recordEvidence, {
    evidence: {
      requirementKey: 'signed_transfer_instruction',
      status: MATTER_PLAN_EVIDENCE_STATUSES.provided,
      referenceId: 'instruction-1',
    },
  })
}

function completeOpenMatter(plan) {
  const evidence = provideOpenInstruction(plan)
  assert.equal(evidence.ok, true)
  const completed = execute(evidence.plan, 'open_matter', MATTER_ACTION_COMMAND_TYPES.complete)
  assert.equal(completed.ok, true)
  return completed.plan
}

test('records evidence and completes an action with an immutable audit event', () => {
  const plan = activePlan()
  const before = structuredClone(plan)
  const evidence = provideOpenInstruction(plan)
  assert.equal(evidence.ok, true)
  assert.deepEqual(plan, before)
  assert.equal(evidence.plan.actions.find((item) => item.key === 'open_matter').runtimeRevision, 1)

  const completed = execute(evidence.plan, 'open_matter', MATTER_ACTION_COMMAND_TYPES.complete)
  assert.equal(completed.ok, true)
  assert.equal(completed.plan.actions.find((item) => item.key === 'open_matter').state, MATTER_PLAN_ACTION_STATES.completed)
  assert.equal(completed.event.version, CONVEYANCER_MATTER_ACTION_EXECUTION_VERSION)
  assert.equal(completed.event.before.state, MATTER_PLAN_ACTION_STATES.doNow)
  assert.equal(completed.event.after.state, MATTER_PLAN_ACTION_STATES.completed)
  assert.equal(Object.isFrozen(completed.event), true)
})

test('starts a newly ready action only after its dependencies complete', () => {
  const plan = activePlan()
  const blocked = execute(plan, 'verify_parties', MATTER_ACTION_COMMAND_TYPES.start)
  assert.equal(blocked.ok, false)
  assert.equal(blocked.code, 'required_dependencies_not_satisfied')

  const opened = completeOpenMatter(plan)
  const started = execute(opened, 'verify_parties', MATTER_ACTION_COMMAND_TYPES.start, {}, {
    role: MATTER_PLAN_OWNER_ROLES.transferAttorney,
  })
  assert.equal(started.ok, true)
  assert.equal(started.plan.actions.find((item) => item.key === 'verify_parties').state, MATTER_PLAN_ACTION_STATES.doNow)
})

test('refuses completion until every required evidence item is satisfied', () => {
  let plan = completeOpenMatter(activePlan())
  const started = execute(plan, 'verify_parties', MATTER_ACTION_COMMAND_TYPES.start)
  plan = started.plan
  const incomplete = execute(plan, 'verify_parties', MATTER_ACTION_COMMAND_TYPES.complete)
  assert.equal(incomplete.ok, false)
  assert.equal(incomplete.code, 'required_evidence_not_satisfied')

  const action = plan.actions.find((item) => item.key === 'verify_parties')
  for (const requirement of action.evidenceRequirements) {
    const recorded = execute(plan, 'verify_parties', MATTER_ACTION_COMMAND_TYPES.recordEvidence, {
      commandId: `approve-${requirement.key}`,
      evidence: {
        requirementKey: requirement.key,
        status: MATTER_PLAN_EVIDENCE_STATUSES.approved,
        referenceId: `evidence-${requirement.key}`,
      },
    })
    assert.equal(recorded.ok, true)
    plan = recorded.plan
  }
  const complete = execute(plan, 'verify_parties', MATTER_ACTION_COMMAND_TYPES.complete)
  assert.equal(complete.ok, true)
})

test('supports controlled waiting, blocking and resumption with reasons', () => {
  const plan = activePlan()
  const invalidWaiting = execute(plan, 'open_matter', MATTER_ACTION_COMMAND_TYPES.markWaiting)
  assert.equal(invalidWaiting.code, 'waiting_on_required')
  const waiting = execute(plan, 'open_matter', MATTER_ACTION_COMMAND_TYPES.markWaiting, { waitingOn: 'Signed instruction' })
  assert.equal(waiting.ok, true)
  const resumed = execute(waiting.plan, 'open_matter', MATTER_ACTION_COMMAND_TYPES.resume, { reason: 'Instruction received' })
  assert.equal(resumed.ok, true)
  const blocked = execute(resumed.plan, 'open_matter', MATTER_ACTION_COMMAND_TYPES.markBlocked, { reason: 'Conflict check failed' })
  assert.equal(blocked.ok, true)
  assert.equal(blocked.plan.actions.find((item) => item.key === 'open_matter').state, MATTER_PLAN_ACTION_STATES.blocked)
})

test('reopens completed work and cancels it only through reasoned commands', () => {
  const completed = completeOpenMatter(activePlan())
  const reopened = execute(completed, 'open_matter', MATTER_ACTION_COMMAND_TYPES.reopen, {
    reason: 'Instruction pack was replaced',
  })
  assert.equal(reopened.ok, true)
  assert.equal(reopened.plan.actions.find((item) => item.key === 'open_matter').state, MATTER_PLAN_ACTION_STATES.doNow)
  assert.equal(reopened.plan.actions.find((item) => item.key === 'open_matter').completedAt, null)
  const cancelled = execute(reopened.plan, 'open_matter', MATTER_ACTION_COMMAND_TYPES.cancel, {
    reason: 'Matter formally withdrawn',
  })
  assert.equal(cancelled.ok, true)
  assert.equal(cancelled.plan.actions.find((item) => item.key === 'open_matter').state, MATTER_PLAN_ACTION_STATES.cancelled)
})

test('enforces review authority for approvals and evidence waivers', () => {
  const plan = completeOpenMatter(activePlan())
  const requirement = plan.actions.find((item) => item.key === 'verify_parties').evidenceRequirements[0]
  const secretaryApproval = execute(plan, 'verify_parties', MATTER_ACTION_COMMAND_TYPES.recordEvidence, {
    evidence: { requirementKey: requirement.key, status: MATTER_PLAN_EVIDENCE_STATUSES.approved, referenceId: 'doc-1' },
  }, { role: MATTER_PLAN_OWNER_ROLES.secretary })
  assert.equal(secretaryApproval.ok, false)

  const missingReason = execute(plan, 'verify_parties', MATTER_ACTION_COMMAND_TYPES.recordEvidence, {
    evidence: { requirementKey: requirement.key, status: MATTER_PLAN_EVIDENCE_STATUSES.waived },
  })
  assert.equal(missingReason.code, 'waived_evidence_reason_required')
  const waived = execute(plan, 'verify_parties', MATTER_ACTION_COMMAND_TYPES.recordEvidence, {
    evidence: { requirementKey: requirement.key, status: MATTER_PLAN_EVIDENCE_STATUSES.waived, reason: 'Certified exception approved' },
  })
  assert.equal(waived.ok, true)
})

test('requires review capability to complete work submitted for review', () => {
  const plan = activePlan()
  const evidence = provideOpenInstruction(plan)
  const review = execute(evidence.plan, 'open_matter', MATTER_ACTION_COMMAND_TYPES.submitReview)
  assert.equal(review.ok, true)
  const secretaryCompletion = execute(review.plan, 'open_matter', MATTER_ACTION_COMMAND_TYPES.complete, {}, {
    role: MATTER_PLAN_OWNER_ROLES.secretary,
  })
  assert.equal(secretaryCompletion.ok, false)
  assert.equal(secretaryCompletion.code, 'actor_lacks_required_capability')
})

test('keeps cross-lane actions read-only to the transfer team', () => {
  const plan = activePlan(transaction({ finance_type: 'bond' }))
  const action = plan.actions.find((item) => item.key === 'coordinate_bond_attorney')
  action.owner.role = MATTER_PLAN_OWNER_ROLES.bondAttorney
  action.requiredCapability = MATTER_PLAN_CAPABILITIES.executeLegal
  const result = execute(plan, action.key, MATTER_ACTION_COMMAND_TYPES.recordEvidence, {
    evidence: {
      requirementKey: action.evidenceRequirements[0].key,
      status: MATTER_PLAN_EVIDENCE_STATUSES.provided,
      referenceId: 'appointment-1',
    },
  }, { role: MATTER_PLAN_OWNER_ROLES.transferAttorney })
  assert.equal(result.ok, false)
  assert.equal(result.code, 'action_owned_by_another_role')
})

test('assigns an action without changing its owner role or definition', () => {
  const plan = completeOpenMatter(activePlan())
  const action = plan.actions.find((item) => item.key === 'verify_parties')
  const fingerprint = action.definitionFingerprint
  const result = execute(plan, action.key, MATTER_ACTION_COMMAND_TYPES.assign, {
    assignment: { userId: 'user-1', teamId: 'team-1' },
  }, { role: MATTER_PLAN_OWNER_ROLES.transferAttorney })
  assert.equal(result.ok, true)
  const assigned = result.plan.actions.find((item) => item.key === action.key)
  assert.equal(assigned.owner.role, MATTER_PLAN_OWNER_ROLES.transferAttorney)
  assert.equal(assigned.owner.userId, 'user-1')
  assert.equal(assigned.definitionFingerprint, fingerprint)
})

test('rejects stale plan and action revisions', () => {
  const plan = activePlan()
  const stalePlan = executeConveyancerMatterAction({
    plan,
    command: command(plan, 'open_matter', MATTER_ACTION_COMMAND_TYPES.markWaiting, {
      expectedPlanVersion: 99,
      waitingOn: 'Client',
    }),
    actor: { role: MATTER_PLAN_OWNER_ROLES.firmManager },
    occurredAt,
  })
  assert.equal(stalePlan.code, 'stale_plan_version')

  const staleAction = executeConveyancerMatterAction({
    plan,
    command: command(plan, 'open_matter', MATTER_ACTION_COMMAND_TYPES.markWaiting, {
      expectedActionRevision: 2,
      waitingOn: 'Client',
    }),
    actor: { role: MATTER_PLAN_OWNER_ROLES.firmManager },
    occurredAt,
  })
  assert.equal(staleAction.code, 'stale_action_revision')
})

test('returns an idempotent replay for an already applied command', () => {
  const plan = activePlan()
  const first = execute(plan, 'open_matter', MATTER_ACTION_COMMAND_TYPES.markWaiting, { waitingOn: 'Client' })
  assert.equal(first.ok, true)
  const replay = executeConveyancerMatterAction({
    plan: first.plan,
    command: command(plan, 'open_matter', MATTER_ACTION_COMMAND_TYPES.markWaiting, { waitingOn: 'Client' }),
    actor: { role: MATTER_PLAN_OWNER_ROLES.firmManager },
    occurredAt,
    existingEvents: [first.event],
  })
  assert.equal(replay.ok, true)
  assert.equal(replay.duplicate, true)
  assert.equal(replay.event.eventId, first.event.eventId)
})

test('does not expose an idempotent replay to an actor without plan visibility', () => {
  const plan = activePlan()
  const replayCommand = command(plan, 'open_matter', MATTER_ACTION_COMMAND_TYPES.markWaiting, { waitingOn: 'Client' })
  const first = executeConveyancerMatterAction({
    plan,
    command: replayCommand,
    actor: { role: MATTER_PLAN_OWNER_ROLES.firmManager },
    occurredAt,
  })
  const denied = executeConveyancerMatterAction({
    plan: first.plan,
    command: replayCommand,
    actor: { role: 'unknown_role' },
    occurredAt,
    existingEvents: [first.event],
  })
  assert.equal(denied.ok, false)
  assert.equal(denied.code, 'actor_cannot_view_matter_plan')
  assert.equal(denied.plan, null)
})

test('rejects action execution against an inactive plan', () => {
  const plan = activePlan()
  plan.status = MATTER_PLAN_STATUSES.draft
  plan.activatedAt = null
  const result = execute(plan, 'open_matter', MATTER_ACTION_COMMAND_TYPES.markWaiting, { waitingOn: 'Client' })
  assert.equal(result.ok, false)
  assert.equal(result.code, 'matter_plan_must_be_active')
})

console.log('conveyancer matter-plan A5 action execution tests passed')
