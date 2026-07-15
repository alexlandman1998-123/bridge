import assert from 'node:assert/strict'
import {
  MATTER_PLAN_OWNER_ROLES,
  MATTER_PLAN_STATUSES,
} from '../../../core/transactions/conveyancerMatterPlanContract.js'
import { MATTER_EXCEPTION_STATUSES } from '../../../core/transactions/conveyancerMatterExceptionContract.js'
import { generateConveyancerMatterPlan } from '../conveyancerMatterPlanGenerator.js'
import { activateConveyancerMatterExceptions } from '../conveyancerMatterExceptionActivation.js'
import { MATTER_EXCEPTION_CORRECTION_COMMAND_TYPES, executeConveyancerMatterExceptionCorrection } from '../conveyancerMatterExceptionCorrection.js'
import {
  CONVEYANCER_MATTER_EXCEPTION_OVERRIDE_VERSION,
  MATTER_EXCEPTION_OVERRIDE_COMMAND_TYPES as T,
  MATTER_EXCEPTION_OVERRIDE_OPERATIONS as O,
  evaluateConveyancerMatterExceptionOverride,
  executeConveyancerMatterExceptionOverride,
} from '../conveyancerMatterExceptionOverride.js'

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

const system = { role: MATTER_PLAN_OWNER_ROLES.system, userId: 'detector' }
const proposer = { role: MATTER_PLAN_OWNER_ROLES.transferAttorney, userId: 'attorney-1' }
const otherAttorney = { role: MATTER_PLAN_OWNER_ROLES.transferAttorney, userId: 'attorney-2' }
const manager = { role: MATTER_PLAN_OWNER_ROLES.firmManager, userId: 'manager-1' }
const secondManager = { role: MATTER_PLAN_OWNER_ROLES.firmManager, userId: 'manager-2' }
let sequence = 0

function transaction(overrides = {}) {
  return {
    id: 'tx-b6-1',
    organisation_id: 'org-b6-1',
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
  return { ...structuredClone(generated.plan), status: MATTER_PLAN_STATUSES.active, activatedAt: '2026-07-15T08:05:00.000Z' }
}

function activated(signalKey = 'instruction.signed_transfer_instruction', state = 'missing', source = transaction()) {
  const plan = activePlan(source)
  const result = activateConveyancerMatterExceptions({
    plan,
    observations: [{ signalKey, state, observedAt: '2026-07-15T09:00:00.000Z', detectedBy: system }],
    actor: system,
    asOf: '2026-07-15T10:00:00.000Z',
  })
  assert.equal(result.valid, true)
  assert.equal(result.activatedExceptions.length, 1)
  return { plan, exception: result.activatedExceptions[0] }
}

function commandTime() {
  sequence += 1
  return `2026-07-15T${String(11 + Math.floor(sequence / 50)).padStart(2, '0')}:${String(sequence % 50).padStart(2, '0')}:00.000Z`
}

function acknowledge(context, actor = proposer) {
  const exception = context.exception
  const result = executeConveyancerMatterExceptionCorrection({
    exception,
    actor,
    occurredAt: commandTime(),
    planActionKeys: context.plan.actions.map((item) => item.key),
    command: {
      commandId: `cmd-b6-ack-${sequence}`,
      type: MATTER_EXCEPTION_CORRECTION_COMMAND_TYPES.acknowledge,
      expectedExceptionId: exception.exceptionId,
      expectedRuntimeRevision: Number(exception.runtimeRevision || 0),
    },
  })
  assert.equal(result.ok, true, result.code)
  context.exception = result.exception
  return context
}

function execute(context, type, payload = {}, actor = proposer, overrides = {}) {
  const occurredAt = overrides.occurredAt || commandTime()
  return executeConveyancerMatterExceptionOverride({
    exception: context.exception,
    actor,
    occurredAt,
    planActionKeys: context.plan.actions.map((item) => item.key),
    existingEvents: overrides.existingEvents || [],
    command: {
      commandId: overrides.commandId || `cmd-b6-${sequence}`,
      type,
      expectedExceptionId: context.exception.exceptionId,
      expectedRuntimeRevision: Number(context.exception.runtimeRevision || 0),
      ...payload,
    },
  })
}

function applied(context, result) {
  assert.equal(result.ok, true, result.code)
  assert.equal(result.duplicate, false)
  context.exception = result.exception
  return result
}

function proposal(overrides = {}) {
  return {
    override: {
      reason: 'The missing instruction must not prevent safe preparatory work.',
      businessJustification: 'Avoid a needless delay while the signed instruction is collected.',
      operations: [O.requestDocuments, O.prepareDraftDocuments],
      safeguards: ['Do not issue or sign a document', 'Recheck the exception before each activity'],
      expiresAt: '2026-07-17T09:00:00.000Z',
      ...overrides,
    },
  }
}

function proposed(context = acknowledge(activated()), actor = proposer, overrides = {}) {
  applied(context, execute(context, T.propose, proposal(overrides), actor))
  return context
}

function approved(context = proposed(), actor = manager) {
  applied(context, execute(context, T.approve, {
    summary: 'Preparatory work approved within the listed safeguards.',
    decisionReferenceId: 'override-decision-1',
  }, actor))
  return context
}

test('approves a temporary operational override without changing exception truth', () => {
  const context = proposed()
  const before = structuredClone(context.exception)
  const result = execute(context, T.approve, {
    summary: 'Safe document preparation may continue.',
    decisionReferenceId: 'override-decision-2',
  }, manager)
  const event = applied(context, result).event
  assert.equal(context.exception.status, MATTER_EXCEPTION_STATUSES.acknowledged)
  assert.deepEqual(context.exception.evidence, before.evidence)
  assert.deepEqual(context.exception.resolution, before.resolution)
  assert.equal(context.exception.activeOverride.status, 'active')
  assert.equal(context.exception.overrideProposal, null)
  assert.equal(event.version, CONVEYANCER_MATTER_EXCEPTION_OVERRIDE_VERSION)
  assert.equal(event.decision.outcome, 'approved')
  assert.equal(Object.isFrozen(event), true)
})

test('evaluates only approved operations while an override is active', () => {
  const context = approved()
  const allowed = evaluateConveyancerMatterExceptionOverride({
    exception: context.exception,
    operation: O.requestDocuments,
    asOf: '2026-07-16T09:00:00.000Z',
  })
  assert.equal(allowed.allowed, true)
  assert.equal(allowed.reason, 'override_active')

  const denied = evaluateConveyancerMatterExceptionOverride({
    exception: context.exception,
    operation: O.scheduleSigning,
    asOf: '2026-07-16T09:00:00.000Z',
  })
  assert.equal(denied.allowed, false)
  assert.equal(denied.reason, 'operation_not_overridden')
})

test('fails closed after expiry without mutating the exception', () => {
  const context = approved()
  const before = structuredClone(context.exception)
  const result = evaluateConveyancerMatterExceptionOverride({
    exception: context.exception,
    operation: O.requestDocuments,
    asOf: '2026-07-17T09:00:00.000Z',
  })
  assert.equal(result.allowed, false)
  assert.equal(result.reason, 'override_expired')
  assert.deepEqual(context.exception, before)
})

test('rejects legal-state changes and all unknown operations', () => {
  const context = acknowledge(activated())
  for (const operation of ['complete_action', 'assert_instruction', 'lodge_matter', 'resolve_exception']) {
    const result = execute(context, T.propose, proposal({ operations: [operation] }))
    assert.equal(result.ok, false)
    assert.equal(result.code, 'unsafe_or_unknown_override_operation')
  }
  const runtime = evaluateConveyancerMatterExceptionOverride({
    exception: context.exception,
    operation: 'register_matter',
    asOf: '2026-07-16T09:00:00.000Z',
  })
  assert.equal(runtime.reason, 'unsafe_or_unknown_override_operation')
})

test('enforces severity-specific duration limits', () => {
  const high = acknowledge(activated())
  const tooLong = execute(high, T.propose, proposal({ expiresAt: '2026-07-19T12:00:00.000Z' }), proposer, {
    occurredAt: '2026-07-15T12:00:00.000Z',
  })
  assert.equal(tooLong.code, 'override_duration_exceeds_severity_limit')

  const critical = acknowledge(activated('authority.signatory_conflict', 'conflict', transaction({ buyer_entity_type: 'company' })))
  const criticalTooLong = execute(critical, T.propose, proposal({ expiresAt: '2026-07-16T01:00:00.000Z' }), proposer, {
    occurredAt: '2026-07-15T12:00:00.000Z',
  })
  assert.equal(criticalTooLong.code, 'override_duration_exceeds_severity_limit')
  const accepted = execute(critical, T.propose, proposal({ expiresAt: '2026-07-16T00:00:00.000Z' }), proposer, {
    occurredAt: '2026-07-15T12:00:00.000Z',
  })
  assert.equal(accepted.ok, true, accepted.code)
})

test('requires an independent firm-manager approval', () => {
  const context = proposed()
  const attorneyDenied = execute(context, T.approve, {
    summary: 'Attorney approval attempt.',
    decisionReferenceId: 'attorney-decision',
  }, otherAttorney)
  assert.equal(attorneyDenied.code, 'actor_lacks_exception_capability')

  const managerProposal = proposed(acknowledge(activated()), manager)
  const selfDenied = execute(managerProposal, T.approve, {
    summary: 'Manager self-approval attempt.',
    decisionReferenceId: 'self-decision',
  }, manager)
  assert.equal(selfDenied.code, 'independent_override_approval_required')
  const accepted = execute(managerProposal, T.approve, {
    summary: 'Independently reviewed manager proposal.',
    decisionReferenceId: 'independent-decision',
  }, secondManager)
  assert.equal(accepted.ok, true, accepted.code)
})

test('rejects a proposal without changing the exception status', () => {
  const context = proposed()
  const result = execute(context, T.reject, { reason: 'Safeguards are insufficient.' }, manager)
  applied(context, result)
  assert.equal(context.exception.status, MATTER_EXCEPTION_STATUSES.acknowledged)
  assert.equal(context.exception.overrideProposal, null)
  assert.equal(context.exception.lastOverrideDecision.outcome, 'rejected')
})

test('allows only the proposer or a manager to revise and withdraw', () => {
  const context = proposed()
  const revisionDenied = execute(context, T.revise, proposal({ reason: 'Revised by another attorney.' }), otherAttorney)
  assert.equal(revisionDenied.code, 'override_revision_requires_proposer_or_manager')
  applied(context, execute(context, T.revise, proposal({ reason: 'Narrowed preparatory authority.', operations: [O.requestDocuments] })))
  assert.equal(context.exception.overrideProposal.version, 2)
  const withdrawalDenied = execute(context, T.withdraw, { reason: 'Another attorney attempts withdrawal.' }, otherAttorney)
  assert.equal(withdrawalDenied.code, 'override_withdrawal_requires_proposer_or_manager')
  applied(context, execute(context, T.withdraw, { reason: 'The source document arrived.' }))
  assert.equal(context.exception.lastOverrideDecision.outcome, 'withdrawn')
})

test('prevents concurrent exception reviews and multiple active overrides', () => {
  const underReview = acknowledge(activated())
  underReview.exception.reviewKind = 'waiver'
  assert.equal(execute(underReview, T.propose, proposal()).code, 'override_blocked_by_active_exception_review')

  const context = approved()
  assert.equal(execute(context, T.propose, proposal()).code, 'active_override_exists')
})

test('supports manager revocation and immediately denies further use', () => {
  const context = approved()
  const attorneyDenied = execute(context, T.revoke, { reason: 'Attorney revocation attempt.' }, proposer)
  assert.equal(attorneyDenied.code, 'actor_lacks_exception_capability')
  applied(context, execute(context, T.revoke, { reason: 'The operational risk has changed.' }, manager))
  assert.equal(context.exception.activeOverride, null)
  assert.equal(context.exception.lastOverrideDecision.outcome, 'revoked')
  const evaluated = evaluateConveyancerMatterExceptionOverride({
    exception: context.exception,
    operation: O.requestDocuments,
    asOf: '2026-07-16T09:00:00.000Z',
  })
  assert.equal(evaluated.reason, 'no_active_override')
})

test('is optimistic, idempotent and does not mutate failed inputs', () => {
  const context = acknowledge(activated())
  const before = structuredClone(context.exception)
  const stale = executeConveyancerMatterExceptionOverride({
    exception: context.exception,
    actor: proposer,
    occurredAt: '2026-07-15T12:00:00.000Z',
    planActionKeys: context.plan.actions.map((item) => item.key),
    command: {
      commandId: 'stale-command',
      type: T.propose,
      expectedExceptionId: context.exception.exceptionId,
      expectedRuntimeRevision: Number(context.exception.runtimeRevision || 0) + 1,
      ...proposal(),
    },
  })
  assert.equal(stale.code, 'stale_exception_revision')
  assert.deepEqual(context.exception, before)

  const first = execute(context, T.propose, proposal())
  applied(context, first)
  const replay = executeConveyancerMatterExceptionOverride({
    exception: context.exception,
    actor: proposer,
    occurredAt: 'not-a-date',
    existingEvents: [first.event],
    planActionKeys: context.plan.actions.map((item) => item.key),
    command: { commandId: first.event.commandId, type: T.propose },
  })
  assert.equal(replay.ok, true)
  assert.equal(replay.duplicate, true)
  assert.equal(replay.code, 'idempotent_replay')
})

test('never authorizes operations on a terminal exception', () => {
  const context = approved()
  context.exception.status = MATTER_EXCEPTION_STATUSES.resolved
  const result = evaluateConveyancerMatterExceptionOverride({
    exception: context.exception,
    operation: O.requestDocuments,
    asOf: '2026-07-16T09:00:00.000Z',
  })
  assert.equal(result.allowed, false)
  assert.equal(result.reason, 'exception_terminal')
})

console.log('conveyancer matter exception B6 override tests passed')
