import assert from 'node:assert/strict'
import { MATTER_PLAN_OWNER_ROLES, MATTER_PLAN_STATUSES } from '../../../core/transactions/conveyancerMatterPlanContract.js'
import { MATTER_EXCEPTION_SOURCE_TYPES, MATTER_EXCEPTION_STATUSES } from '../../../core/transactions/conveyancerMatterExceptionContract.js'
import { generateConveyancerMatterPlan } from '../conveyancerMatterPlanGenerator.js'
import {
  CONVEYANCER_MATTER_EXCEPTION_ACTIVATION_VERSION,
  MATTER_EXCEPTION_OBSERVATION_STATES,
  activateConveyancerMatterExceptions,
} from '../conveyancerMatterExceptionActivation.js'

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

const asOf = '2026-07-15T10:00:00.000Z'
const system = { role: MATTER_PLAN_OWNER_ROLES.system, userId: 'exception-detector' }

function transaction(overrides = {}) {
  return {
    id: 'tx-b3-1',
    organisation_id: 'org-b3-1',
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

function observation(signalKey, state, overrides = {}) {
  return {
    signalKey,
    state,
    observedAt: '2026-07-15T09:00:00.000Z',
    detectedBy: system,
    ...overrides,
  }
}

function activate(observations, overrides = {}) {
  return activateConveyancerMatterExceptions({
    plan: activePlan(),
    observations,
    actor: system,
    asOf,
    ...overrides,
  })
}

test('activates a validated exception and immutable audit event from an explicit signal', () => {
  const result = activate([observation('instruction.signed_transfer_instruction', MATTER_EXCEPTION_OBSERVATION_STATES.missing)])
  assert.equal(result.version, CONVEYANCER_MATTER_EXCEPTION_ACTIVATION_VERSION)
  assert.equal(result.valid, true)
  assert.equal(result.metrics.activated, 1)
  assert.equal(result.activatedExceptions[0].code, 'signed_transfer_instruction_missing')
  assert.equal(result.activatedExceptions[0].status, MATTER_EXCEPTION_STATUSES.open)
  assert.equal(result.events[0].eventType, 'exception_activated')
  assert.equal(Object.isFrozen(result.events[0]), true)
  assert.equal(result.nextExceptions.length, 1)
})

test('never interprets an absent observation as a missing fact or document', () => {
  const result = activate([])
  assert.equal(result.valid, true)
  assert.equal(result.metrics.activated, 0)
  assert.equal(result.events.length, 0)
  assert.equal(result.metrics.notObserved > 0, true)
})

test('is idempotent when the same active exception already exists', () => {
  const first = activate([observation('fica.required_evidence', MATTER_EXCEPTION_OBSERVATION_STATES.missing)])
  const second = activate([observation('fica.required_evidence', MATTER_EXCEPTION_OBSERVATION_STATES.missing)], {
    existingExceptions: first.nextExceptions,
  })
  assert.equal(second.valid, true)
  assert.equal(second.metrics.activated, 0)
  assert.equal(second.metrics.retained, 1)
  assert.equal(second.events.length, 0)
  assert.equal(second.nextExceptions.length, 1)
  assert.equal(second.retainedExceptions[0].exceptionId, first.activatedExceptions[0].exceptionId)
})

test('creates separate scoped exceptions for repeatable evidence failures', () => {
  const result = activate([
    observation('fica.required_evidence', MATTER_EXCEPTION_OBSERVATION_STATES.missing, { scopeKey: 'buyer-1:id-document' }),
    observation('fica.required_evidence', MATTER_EXCEPTION_OBSERVATION_STATES.missing, { scopeKey: 'seller-1:address-document' }),
  ])
  assert.equal(result.valid, true)
  assert.equal(result.metrics.activated, 2)
  assert.notEqual(result.activatedExceptions[0].deduplicationKey, result.activatedExceptions[1].deduplicationKey)
})

test('marks a cleared signal for resolution review without closing the exception', () => {
  const first = activate([observation('instruction.signed_transfer_instruction', MATTER_EXCEPTION_OBSERVATION_STATES.missing)])
  const cleared = activate([observation('instruction.signed_transfer_instruction', MATTER_EXCEPTION_OBSERVATION_STATES.present)], {
    existingExceptions: first.nextExceptions,
  })
  assert.equal(cleared.valid, true)
  assert.equal(cleared.metrics.resolutionCandidates, 1)
  assert.equal(cleared.resolutionCandidates[0].requiresReview, true)
  assert.equal(cleared.resolutionCandidates[0].exception.status, MATTER_EXCEPTION_STATUSES.open)
  assert.equal(cleared.nextExceptions[0].status, MATTER_EXCEPTION_STATUSES.open)
  assert.equal(cleared.events.length, 0)
})

test('requires authorised reopening when a terminal exception recurs', () => {
  const first = activate([observation('instruction.signed_transfer_instruction', MATTER_EXCEPTION_OBSERVATION_STATES.missing)])
  const terminal = structuredClone(first.activatedExceptions[0])
  terminal.status = MATTER_EXCEPTION_STATUSES.cancelled
  terminal.stateReason = 'Incorrect source signal'
  const recurrence = activate([observation('instruction.signed_transfer_instruction', MATTER_EXCEPTION_OBSERVATION_STATES.missing)], {
    existingExceptions: [terminal],
  })
  assert.equal(recurrence.valid, true)
  assert.equal(recurrence.metrics.activated, 0)
  assert.equal(recurrence.metrics.reopenCandidates, 1)
  assert.equal(recurrence.reopenCandidates[0].requiresAuthorisedReopen, true)
  assert.equal(recurrence.nextExceptions.length, 1)
})

test('enforces conditional bank-appointed legal lanes during activation', () => {
  const signal = observation('bond.bank_appointment', MATTER_EXCEPTION_OBSERVATION_STATES.missing)
  const cash = activate([signal])
  assert.equal(cash.valid, true)
  assert.equal(cash.metrics.activated, 0)
  assert.ok(cash.evaluations.some((item) => item.definitionKey === 'bond_attorney_appointment_outstanding' && item.outcome === 'not_applicable'))

  const bond = activate([signal], { plan: activePlan(transaction({ finance_type: 'bond' })) })
  assert.equal(bond.valid, true)
  assert.equal(bond.metrics.activated, 1)
  assert.equal(bond.activatedExceptions[0].code, 'bond_attorney_appointment_outstanding')
})

test('supports explicit deadline evaluation without treating every open action as overdue', () => {
  const result = activate([observation('clearance.municipal', MATTER_EXCEPTION_OBSERVATION_STATES.present, {
    dueAt: '2026-07-14T10:00:00.000Z',
    satisfied: false,
  })])
  assert.equal(result.valid, true)
  assert.equal(result.metrics.activated, 1)
  assert.equal(result.activatedExceptions[0].code, 'municipal_clearance_outstanding')
})

test('requires immediate authorised escalation for critical client reports', () => {
  const plan = activePlan(transaction({ buyer_entity_type: 'company' }))
  const clientSignal = observation('authority.signatory_conflict', MATTER_EXCEPTION_OBSERVATION_STATES.conflict, {
    detectedBy: { role: MATTER_PLAN_OWNER_ROLES.client, userId: 'buyer-1' },
    sourceType: MATTER_EXCEPTION_SOURCE_TYPES.userReport,
  })
  const blocked = activate([clientSignal], { plan })
  assert.equal(blocked.valid, false)
  assert.ok(blocked.errors.some((item) => item.endsWith(':critical_exception_escalation_required')))
  assert.equal(blocked.metrics.activated, 0)

  const escalated = activate([clientSignal], {
    plan,
    escalationActor: { role: MATTER_PLAN_OWNER_ROLES.firmManager, userId: 'manager-1' },
  })
  assert.equal(escalated.valid, true)
  assert.equal(escalated.metrics.activated, 1)
  assert.equal(escalated.activatedExceptions[0].escalation.escalatedBy.role, MATTER_PLAN_OWNER_ROLES.firmManager)
})

test('applies activation batches atomically when one observation is blocked', () => {
  const plan = activePlan(transaction({ buyer_entity_type: 'company' }))
  const result = activate([
    observation('fica.required_evidence', MATTER_EXCEPTION_OBSERVATION_STATES.missing),
    observation('authority.signatory_conflict', MATTER_EXCEPTION_OBSERVATION_STATES.conflict, {
      detectedBy: { role: MATTER_PLAN_OWNER_ROLES.client, userId: 'buyer-1' },
      sourceType: MATTER_EXCEPTION_SOURCE_TYPES.userReport,
    }),
  ], { plan })
  assert.equal(result.valid, false)
  assert.equal(result.metrics.activated, 0)
  assert.equal(result.activatedExceptions.length, 0)
  assert.equal(result.events.length, 0)
  assert.equal(result.nextExceptions.length, 0)
})

test('rejects duplicate scopes, future observations and unauthorised detectors', () => {
  const duplicate = activate([
    observation('fica.required_evidence', MATTER_EXCEPTION_OBSERVATION_STATES.missing),
    observation('fica.required_evidence', MATTER_EXCEPTION_OBSERVATION_STATES.missing),
  ])
  assert.equal(duplicate.valid, false)
  assert.ok(duplicate.errors.includes('duplicate_observation_scope'))

  const future = activate([observation('fica.required_evidence', MATTER_EXCEPTION_OBSERVATION_STATES.missing, {
    observedAt: '2026-07-16T09:00:00.000Z',
  })])
  assert.ok(future.errors.some((item) => item.endsWith(':observation_from_future')))

  const unauthorised = activate([observation('fica.required_evidence', MATTER_EXCEPTION_OBSERVATION_STATES.missing, {
    detectedBy: { role: 'unknown_role' },
  })])
  assert.ok(unauthorised.errors.some((item) => item.endsWith(':detector_cannot_raise_exception')))
})

test('rejects inactive plans and unauthorised activation actors', () => {
  const draft = activePlan()
  draft.status = MATTER_PLAN_STATUSES.draft
  draft.activatedAt = null
  const inactive = activate([], { plan: draft })
  assert.deepEqual(inactive.errors, ['active_plan_required'])

  const actorDenied = activate([], { actor: { role: 'unknown_role' } })
  assert.deepEqual(actorDenied.errors, ['actor_cannot_activate_exceptions'])
})

test('does not mutate plans, observations or existing exception records', () => {
  const plan = activePlan()
  const observations = [observation('fica.required_evidence', MATTER_EXCEPTION_OBSERVATION_STATES.missing)]
  const first = activate(observations, { plan })
  const existing = first.nextExceptions
  const planBefore = structuredClone(plan)
  const observationsBefore = structuredClone(observations)
  const existingBefore = structuredClone(existing)
  activate(observations, { plan, existingExceptions: existing })
  assert.deepEqual(plan, planBefore)
  assert.deepEqual(observations, observationsBefore)
  assert.deepEqual(existing, existingBefore)
})

console.log('conveyancer matter exception B3 activation tests passed')
