import assert from 'node:assert/strict'
import {
  MATTER_PLAN_EVIDENCE_STATUSES,
  MATTER_PLAN_EVIDENCE_TYPES,
  MATTER_PLAN_OWNER_ROLES,
  MATTER_PLAN_STATUSES,
} from '../../../core/transactions/conveyancerMatterPlanContract.js'
import {
  MATTER_EXCEPTION_RESOLUTION_OUTCOMES,
  MATTER_EXCEPTION_STATUSES,
} from '../../../core/transactions/conveyancerMatterExceptionContract.js'
import { generateConveyancerMatterPlan } from '../conveyancerMatterPlanGenerator.js'
import { activateConveyancerMatterExceptions } from '../conveyancerMatterExceptionActivation.js'
import { MATTER_EXCEPTION_CORRECTION_COMMAND_TYPES, executeConveyancerMatterExceptionCorrection } from '../conveyancerMatterExceptionCorrection.js'
import {
  CONVEYANCER_MATTER_EXCEPTION_WAIVER_VERSION,
  MATTER_EXCEPTION_WAIVER_COMMAND_TYPES as T,
  executeConveyancerMatterExceptionWaiver,
} from '../conveyancerMatterExceptionWaiver.js'

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
const reviewer = { role: MATTER_PLAN_OWNER_ROLES.transferAttorney, userId: 'attorney-2' }
const manager = { role: MATTER_PLAN_OWNER_ROLES.firmManager, userId: 'manager-1' }
const accounts = { role: MATTER_PLAN_OWNER_ROLES.accounts, userId: 'accounts-1' }
let sequence = 0

function transaction(overrides = {}) {
  return {
    id: 'tx-b5-1',
    organisation_id: 'org-b5-1',
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

function activated(signalKey, state, source = transaction()) {
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

function correct(exception, plan, type, payload = {}, actor = proposer) {
  return executeConveyancerMatterExceptionCorrection({
    exception,
    actor,
    occurredAt: commandTime(),
    planActionKeys: plan.actions.map((item) => item.key),
    command: {
      commandId: `cmd-b5-correction-${sequence}`,
      type,
      expectedExceptionId: exception.exceptionId,
      expectedRuntimeRevision: Number(exception.runtimeRevision || 0),
      ...payload,
    },
  })
}

function waive(exception, plan, type, payload = {}, actor = proposer, overrides = {}) {
  return executeConveyancerMatterExceptionWaiver({
    exception,
    actor,
    occurredAt: commandTime(),
    planActionKeys: plan.actions.map((item) => item.key),
    command: {
      commandId: `cmd-b5-waiver-${sequence}`,
      type,
      expectedExceptionId: exception.exceptionId,
      expectedRuntimeRevision: Number(exception.runtimeRevision || 0),
      ...payload,
    },
    ...overrides,
  })
}

function applied(result) {
  assert.equal(result.ok, true, result.code)
  return result.exception
}

function acknowledged(signalKey = 'instruction.signed_transfer_instruction', state = 'missing', source = transaction(), actor = proposer) {
  const context = activated(signalKey, state, source)
  context.exception = applied(correct(context.exception, context.plan, MATTER_EXCEPTION_CORRECTION_COMMAND_TYPES.acknowledge, {}, actor))
  return context
}

function proposalPayload(exception, overrides = {}) {
  return {
    waiver: {
      reason: 'The firm accepts the documented residual risk for this matter.',
      risk: 'Progress may continue without the requested evidence.',
      mitigation: 'The conveyancer will verify the related source before lodgement.',
      requirementKeys: [exception.evidenceRequirements[0].key],
      conditions: ['Reconfirm the source before lodgement'],
      ...overrides,
    },
  }
}

function proposed(context, actor = proposer, overrides = {}) {
  context.exception = applied(waive(context.exception, context.plan, T.propose, proposalPayload(context.exception, overrides), actor))
  return context
}

test('approves a scoped accepted-risk waiver with independent review', () => {
  const context = proposed(acknowledged())
  const result = waive(context.exception, context.plan, T.approve, {
    summary: 'Residual instruction risk accepted subject to the recorded condition.',
    decisionReferenceId: 'waiver-decision-1',
  }, reviewer)
  const current = applied(result)
  assert.equal(current.status, MATTER_EXCEPTION_STATUSES.waived)
  assert.equal(current.resolution.outcome, MATTER_EXCEPTION_RESOLUTION_OUTCOMES.acceptedRisk)
  assert.equal(current.evidence[0].status, MATTER_PLAN_EVIDENCE_STATUSES.waived)
  assert.equal(current.waiverDecision.outcome, 'approved')
  assert.equal(current.waiverDecision.approvedBy.userId, 'attorney-2')
  assert.equal(result.event.version, CONVEYANCER_MATTER_EXCEPTION_WAIVER_VERSION)
  assert.equal(result.event.decision.outcome, 'approved')
  assert.equal(Object.isFrozen(result.event), true)
})

test('prevents a proposer from approving their own waiver', () => {
  const context = proposed(acknowledged())
  const result = waive(context.exception, context.plan, T.approve, {
    summary: 'Self-approved.',
    decisionReferenceId: 'waiver-self',
  }, proposer)
  assert.equal(result.ok, false)
  assert.equal(result.code, 'independent_waiver_approval_required')
})

test('requires a firm manager and future review date for critical waivers', () => {
  const context = acknowledged('authority.signatory_conflict', 'conflict', transaction({ buyer_entity_type: 'company' }))
  const missingReviewDate = waive(context.exception, context.plan, T.propose, proposalPayload(context.exception), proposer)
  assert.equal(missingReviewDate.code, 'critical_waiver_review_date_required')

  proposed(context, proposer, { reviewBy: '2026-07-20T09:00:00.000Z' })
  const transferDenied = waive(context.exception, context.plan, T.approve, {
    summary: 'Risk accepted.',
    decisionReferenceId: 'critical-decision-1',
  }, reviewer)
  assert.equal(transferDenied.code, 'critical_waiver_requires_firm_manager')

  const approved = waive(context.exception, context.plan, T.approve, {
    summary: 'Critical residual risk accepted under manager review.',
    decisionReferenceId: 'critical-decision-2',
  }, manager)
  assert.equal(approved.ok, true)
  assert.equal(approved.exception.resolution.resolvedBy.role, MATTER_PLAN_OWNER_ROLES.firmManager)
  assert.equal(approved.exception.waiverDecision.reviewBy, '2026-07-20T09:00:00.000Z')
})

test('does not approve a waiver after its review date has elapsed', () => {
  const context = acknowledged('authority.signatory_conflict', 'conflict', transaction({ buyer_entity_type: 'company' }))
  context.exception = applied(waive(context.exception, context.plan, T.propose, proposalPayload(context.exception, {
    reviewBy: '2026-07-16T09:00:00.000Z',
  }), proposer))
  const result = waive(context.exception, context.plan, T.approve, {
    summary: 'Stale proposal approval.',
    decisionReferenceId: 'stale-critical-decision',
  }, manager, { occurredAt: '2026-07-16T10:00:00.000Z' })
  assert.equal(result.ok, false)
  assert.equal(result.code, 'waiver_review_date_elapsed')
})

test('allows accounts to propose but not approve a financial waiver', () => {
  const context = proposed(acknowledged('finance.required_payment', 'overdue', transaction(), accounts), accounts)
  const denied = waive(context.exception, context.plan, T.approve, {
    summary: 'Accounts approval attempt.',
    decisionReferenceId: 'accounts-decision',
  }, { ...accounts, userId: 'accounts-2' })
  assert.equal(denied.code, 'actor_lacks_exception_capability')

  const approved = waive(context.exception, context.plan, T.approve, {
    summary: 'Manager accepts the reconciled financial risk.',
    decisionReferenceId: 'manager-financial-decision',
  }, manager)
  assert.equal(approved.ok, true)
})

test('refuses a partial waiver while unscoped required evidence remains incomplete', () => {
  const context = activated('fica.required_evidence', 'missing')
  context.exception.evidenceRequirements.push({
    key: 'secondary_confirmation',
    label: 'Secondary confirmation',
    type: MATTER_PLAN_EVIDENCE_TYPES.confirmation,
    required: true,
    requiresApproval: false,
  })
  context.exception = applied(correct(context.exception, context.plan, MATTER_EXCEPTION_CORRECTION_COMMAND_TYPES.acknowledge))
  proposed(context)
  const denied = waive(context.exception, context.plan, T.approve, {
    summary: 'Only one item waived.',
    decisionReferenceId: 'partial-waiver',
  }, reviewer)
  assert.equal(denied.code, 'unscoped_resolution_evidence_incomplete')
})

test('permits a scoped waiver when remaining requirements already have evidence', () => {
  const context = activated('fica.required_evidence', 'missing')
  context.exception.evidenceRequirements.push({
    key: 'secondary_confirmation',
    label: 'Secondary confirmation',
    type: MATTER_PLAN_EVIDENCE_TYPES.confirmation,
    required: true,
    requiresApproval: false,
  })
  context.exception = applied(correct(context.exception, context.plan, MATTER_EXCEPTION_CORRECTION_COMMAND_TYPES.acknowledge))
  context.exception = applied(correct(context.exception, context.plan, MATTER_EXCEPTION_CORRECTION_COMMAND_TYPES.beginCorrection))
  context.exception = applied(correct(context.exception, context.plan, MATTER_EXCEPTION_CORRECTION_COMMAND_TYPES.recordCorrectionEvidence, {
    evidence: { requirementKey: 'secondary_confirmation', referenceId: 'confirmation-1' },
  }))
  proposed(context)
  const approved = waive(context.exception, context.plan, T.approve, {
    summary: 'Primary item waived; secondary confirmation supplied.',
    decisionReferenceId: 'scoped-waiver',
  }, reviewer)
  assert.equal(approved.ok, true)
  assert.ok(approved.exception.evidence.some((item) => item.requirementKey === 'secondary_confirmation' && item.status === MATTER_PLAN_EVIDENCE_STATUSES.provided))
})

test('rejects a waiver back to remediation with an independent reason', () => {
  const context = proposed(acknowledged())
  const rejected = waive(context.exception, context.plan, T.reject, { reason: 'Mitigation is insufficient.' }, reviewer)
  const current = applied(rejected)
  assert.equal(current.status, MATTER_EXCEPTION_STATUSES.remediation)
  assert.equal(current.lastWaiverDecision.outcome, 'rejected')
  assert.equal(current.waiverProposal, null)
})

test('allows only the proposer or manager to revise and withdraw a proposal', () => {
  const context = proposed(acknowledged())
  const reviseDenied = waive(context.exception, context.plan, T.revise, proposalPayload(context.exception, {
    mitigation: 'Different mitigation.',
  }), reviewer)
  assert.equal(reviseDenied.code, 'waiver_revision_requires_proposer_or_manager')

  context.exception = applied(waive(context.exception, context.plan, T.revise, proposalPayload(context.exception, {
    mitigation: 'A strengthened independent verification before lodgement.',
  }), proposer))
  assert.equal(context.exception.waiverProposal.version, 2)

  const withdrawDenied = waive(context.exception, context.plan, T.withdraw, { reason: 'No longer needed.' }, reviewer)
  assert.equal(withdrawDenied.code, 'waiver_withdrawal_requires_proposer_or_manager')
  const withdrawn = waive(context.exception, context.plan, T.withdraw, { reason: 'Correction evidence became available.' }, proposer)
  assert.equal(withdrawn.ok, true)
  assert.equal(withdrawn.exception.lastWaiverDecision.outcome, 'withdrawn')
})

test('validates waiver scope, risk, mitigation and review dates', () => {
  const context = acknowledged()
  assert.equal(waive(context.exception, context.plan, T.propose, proposalPayload(context.exception, { risk: '' })).code, 'waiver_risk_required')
  assert.equal(waive(context.exception, context.plan, T.propose, proposalPayload(context.exception, { mitigation: '' })).code, 'waiver_mitigation_required')
  assert.equal(waive(context.exception, context.plan, T.propose, proposalPayload(context.exception, { requirementKeys: ['unknown'] })).code, 'unknown_waiver_evidence_requirement')
  assert.equal(waive(context.exception, context.plan, T.propose, proposalPayload(context.exception, { reviewBy: '2026-07-15T09:00:00.000Z' })).code, 'waiver_review_date_must_be_future')
})

test('requires decision summary and reference before approval', () => {
  const context = proposed(acknowledged())
  assert.equal(waive(context.exception, context.plan, T.approve, { decisionReferenceId: 'decision-1' }, reviewer).code, 'waiver_decision_summary_required')
  assert.equal(waive(context.exception, context.plan, T.approve, { summary: 'Approved.' }, reviewer).code, 'waiver_decision_reference_required')
})

test('enforces optimistic concurrency and secure idempotent replay', () => {
  const context = acknowledged()
  sequence += 1
  const command = {
    commandId: `cmd-b5-fixed-${sequence}`,
    type: T.propose,
    expectedExceptionId: context.exception.exceptionId,
    expectedRuntimeRevision: Number(context.exception.runtimeRevision || 0),
    ...proposalPayload(context.exception),
  }
  const first = executeConveyancerMatterExceptionWaiver({
    exception: context.exception,
    command,
    actor: proposer,
    occurredAt: '2026-07-15T13:00:00.000Z',
    planActionKeys: context.plan.actions.map((item) => item.key),
  })
  assert.equal(first.ok, true)
  const replay = executeConveyancerMatterExceptionWaiver({
    exception: context.exception,
    command,
    actor: proposer,
    occurredAt: '2026-07-15T13:00:00.000Z',
    existingEvents: [first.event],
    planActionKeys: context.plan.actions.map((item) => item.key),
  })
  assert.equal(replay.duplicate, true)

  const hidden = executeConveyancerMatterExceptionWaiver({
    exception: context.exception,
    command,
    actor: { role: MATTER_PLAN_OWNER_ROLES.client, userId: 'buyer-1' },
    occurredAt: '2026-07-15T13:00:00.000Z',
    existingEvents: [first.event],
    planActionKeys: context.plan.actions.map((item) => item.key),
  })
  assert.equal(hidden.code, 'exception_owned_by_another_role')

  const stale = { ...command, commandId: 'cmd-b5-stale', expectedRuntimeRevision: 99 }
  assert.equal(executeConveyancerMatterExceptionWaiver({
    exception: context.exception,
    command: stale,
    actor: proposer,
    occurredAt: '2026-07-15T13:00:00.000Z',
    planActionKeys: context.plan.actions.map((item) => item.key),
  }).code, 'stale_exception_revision')
})

test('does not mutate inputs and refuses new waiver commands after approval', () => {
  const context = proposed(acknowledged())
  const before = structuredClone(context.exception)
  const approved = waive(context.exception, context.plan, T.approve, {
    summary: 'Approved independently.',
    decisionReferenceId: 'terminal-waiver',
  }, reviewer)
  assert.equal(approved.ok, true)
  assert.deepEqual(context.exception, before)

  const terminal = waive(approved.exception, context.plan, T.revise, proposalPayload(approved.exception), proposer)
  assert.equal(terminal.code, 'terminal_exception_not_waivable')
})

console.log('conveyancer matter exception B5 waiver workflow tests passed')
