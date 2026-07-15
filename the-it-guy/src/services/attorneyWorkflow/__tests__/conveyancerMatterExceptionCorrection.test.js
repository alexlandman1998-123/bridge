import assert from 'node:assert/strict'
import {
  MATTER_PLAN_EVIDENCE_STATUSES,
  MATTER_PLAN_OWNER_ROLES,
  MATTER_PLAN_STATUSES,
} from '../../../core/transactions/conveyancerMatterPlanContract.js'
import {
  MATTER_EXCEPTION_RESOLUTION_OUTCOMES,
  MATTER_EXCEPTION_STATUSES,
} from '../../../core/transactions/conveyancerMatterExceptionContract.js'
import { generateConveyancerMatterPlan } from '../conveyancerMatterPlanGenerator.js'
import { activateConveyancerMatterExceptions } from '../conveyancerMatterExceptionActivation.js'
import {
  CONVEYANCER_MATTER_EXCEPTION_CORRECTION_VERSION,
  MATTER_EXCEPTION_CORRECTION_COMMAND_TYPES as T,
  executeConveyancerMatterExceptionCorrection,
} from '../conveyancerMatterExceptionCorrection.js'

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
const transfer = { role: MATTER_PLAN_OWNER_ROLES.transferAttorney, userId: 'attorney-1' }
const manager = { role: MATTER_PLAN_OWNER_ROLES.firmManager, userId: 'manager-1' }
const accounts = { role: MATTER_PLAN_OWNER_ROLES.accounts, userId: 'accounts-1' }
let commandSequence = 0

function transaction(overrides = {}) {
  return {
    id: 'tx-b4-1',
    organisation_id: 'org-b4-1',
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

function activatedException(signalKey, state, source = transaction()) {
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

function execute(exception, plan, type, payload = {}, actor = transfer, overrides = {}) {
  commandSequence += 1
  return executeConveyancerMatterExceptionCorrection({
    exception,
    actor,
    occurredAt: `2026-07-15T${String(10 + Math.floor(commandSequence / 50)).padStart(2, '0')}:${String(commandSequence % 50).padStart(2, '0')}:00.000Z`,
    planActionKeys: plan.actions.map((item) => item.key),
    command: {
      commandId: `cmd-b4-${commandSequence}`,
      type,
      expectedExceptionId: exception.exceptionId,
      expectedRuntimeRevision: Number(exception.runtimeRevision || 0),
      ...payload,
    },
    ...overrides,
  })
}

function expectApplied(result) {
  assert.equal(result.ok, true, result.code)
  assert.equal(result.duplicate, false)
  return result.exception
}

function correctionReady() {
  const context = activatedException('fica.required_evidence', 'missing')
  let current = context.exception
  current = expectApplied(execute(current, context.plan, T.acknowledge))
  current = expectApplied(execute(current, context.plan, T.startInvestigation))
  current = expectApplied(execute(current, context.plan, T.beginCorrection))
  const requirementKey = current.evidenceRequirements[0].key
  current = expectApplied(execute(current, context.plan, T.recordCorrectionEvidence, {
    evidence: { requirementKey, referenceId: 'document-pack-1' },
  }))
  current = expectApplied(execute(current, context.plan, T.submitCorrectionReview))
  return { ...context, exception: current, requirementKey }
}

test('runs an evidence-backed correction through review to resolution', () => {
  const context = correctionReady()
  const result = execute(context.exception, context.plan, T.approveCorrection, {
    summary: 'The complete FICA pack was verified and accepted.',
  })
  const resolved = expectApplied(result)
  assert.equal(resolved.status, MATTER_EXCEPTION_STATUSES.resolved)
  assert.equal(resolved.resolution.outcome, MATTER_EXCEPTION_RESOLUTION_OUTCOMES.corrected)
  assert.equal(resolved.evidence[0].status, MATTER_PLAN_EVIDENCE_STATUSES.approved)
  assert.equal(resolved.runtimeRevision, 6)
  assert.equal(result.event.version, CONVEYANCER_MATTER_EXCEPTION_CORRECTION_VERSION)
  assert.equal(result.event.decision.outcome, MATTER_EXCEPTION_RESOLUTION_OUTCOMES.corrected)
  assert.equal(Object.isFrozen(result.event), true)
})

test('refuses correction review until every required evidence item is supplied', () => {
  const context = activatedException('fica.required_evidence', 'missing')
  let current = expectApplied(execute(context.exception, context.plan, T.acknowledge))
  current = expectApplied(execute(current, context.plan, T.beginCorrection))
  const before = structuredClone(current)
  const result = execute(current, context.plan, T.submitCorrectionReview)
  assert.equal(result.ok, false)
  assert.equal(result.code, 'correction_evidence_incomplete')
  assert.deepEqual(current, before)
})

test('records not-applicable as a factual resolution rather than a risk waiver', () => {
  const context = activatedException('instruction.signed_transfer_instruction', 'missing')
  let current = expectApplied(execute(context.exception, context.plan, T.acknowledge))
  current = expectApplied(execute(current, context.plan, T.submitNotApplicableReview, {
    reason: 'The imported signal belongs to a different transaction.',
    summary: 'Source reference was reconciled to the correct matter.',
  }))
  assert.equal(current.status, MATTER_EXCEPTION_STATUSES.pendingReview)
  assert.equal(current.reviewKind, 'not_applicable')

  current = expectApplied(execute(current, context.plan, T.decideNotApplicable, {
    reason: 'The imported signal belongs to a different transaction.',
    summary: 'Exception does not apply to this transfer matter.',
    referenceId: 'decision-note-1',
  }))
  assert.equal(current.status, MATTER_EXCEPTION_STATUSES.resolved)
  assert.equal(current.resolution.outcome, MATTER_EXCEPTION_RESOLUTION_OUTCOMES.notApplicable)
  assert.equal(current.evidence[0].status, MATTER_PLAN_EVIDENCE_STATUSES.waived)
  assert.notEqual(current.status, MATTER_EXCEPTION_STATUSES.waived)
})

test('requires a firm manager for a critical not-applicable decision', () => {
  const context = activatedException('authority.signatory_conflict', 'conflict', transaction({ buyer_entity_type: 'company' }))
  let current = expectApplied(execute(context.exception, context.plan, T.acknowledge))
  current = expectApplied(execute(current, context.plan, T.submitNotApplicableReview, {
    reason: 'The conflicting source may be stale.',
    summary: 'Request manager review of source applicability.',
  }))
  const denied = execute(current, context.plan, T.decideNotApplicable, {
    reason: 'The source was stale.',
    summary: 'The current authority records are internally consistent.',
  })
  assert.equal(denied.ok, false)
  assert.equal(denied.code, 'critical_not_applicable_requires_firm_manager')

  const approved = execute(current, context.plan, T.decideNotApplicable, {
    reason: 'The source was stale.',
    summary: 'The current authority records are internally consistent.',
  }, manager)
  assert.equal(approved.ok, true)
  assert.equal(approved.exception.resolution.resolvedBy.role, MATTER_PLAN_OWNER_ROLES.firmManager)
})

test('requires waive capability for a financial not-applicable decision', () => {
  const context = activatedException('finance.required_payment', 'overdue')
  assert.equal(context.exception.owner.role, MATTER_PLAN_OWNER_ROLES.accounts)
  let current = expectApplied(execute(context.exception, context.plan, T.acknowledge, {}, accounts))
  current = expectApplied(execute(current, context.plan, T.submitNotApplicableReview, {
    reason: 'Payment signal needs classification review.',
    summary: 'Submit payment applicability for legal decision.',
  }, accounts))
  const denied = execute(current, context.plan, T.decideNotApplicable, {
    reason: 'Payment was not required.',
    summary: 'Matter ledger confirms no payment obligation.',
  }, accounts)
  assert.equal(denied.ok, false)
  assert.equal(denied.code, 'not_applicable_decision_requires_waive_capability')
})

test('rejects a correction back to remediation with an evidence-specific reason', () => {
  const context = correctionReady()
  const rejected = execute(context.exception, context.plan, T.rejectCorrection, {
    requirementKey: context.requirementKey,
    reason: 'The uploaded document is illegible.',
  })
  const current = expectApplied(rejected)
  assert.equal(current.status, MATTER_EXCEPTION_STATUSES.remediation)
  assert.equal(current.evidence[0].status, MATTER_PLAN_EVIDENCE_STATUSES.rejected)
  assert.equal(current.evidence[0].reason, 'The uploaded document is illegible.')
})

test('enforces exception owner role and assignment boundaries', () => {
  const context = activatedException('fica.required_evidence', 'missing')
  const wrongRole = execute(context.exception, context.plan, T.acknowledge, {}, accounts)
  assert.equal(wrongRole.code, 'exception_owned_by_another_role')

  const assigned = structuredClone(context.exception)
  assigned.owner.userId = 'attorney-1'
  const wrongUser = execute(assigned, context.plan, T.acknowledge, {}, { ...transfer, userId: 'attorney-2' })
  assert.equal(wrongUser.code, 'exception_assigned_to_another_user_or_team')

  const override = execute(assigned, context.plan, T.acknowledge, {}, manager)
  assert.equal(override.ok, true)
  assert.equal(override.event.authority, 'manager_override')
})

test('rejects stale revisions and preserves the original exception', () => {
  const context = activatedException('fica.required_evidence', 'missing')
  const before = structuredClone(context.exception)
  const result = executeConveyancerMatterExceptionCorrection({
    exception: context.exception,
    actor: transfer,
    occurredAt: '2026-07-15T12:00:00.000Z',
    planActionKeys: context.plan.actions.map((item) => item.key),
    command: {
      commandId: 'cmd-b4-stale',
      type: T.acknowledge,
      expectedExceptionId: context.exception.exceptionId,
      expectedRuntimeRevision: 99,
    },
  })
  assert.equal(result.code, 'stale_exception_revision')
  assert.deepEqual(context.exception, before)
})

test('returns idempotent replays only to an authorised exception actor', () => {
  const context = activatedException('fica.required_evidence', 'missing')
  const first = execute(context.exception, context.plan, T.acknowledge)
  assert.equal(first.ok, true)
  const replay = executeConveyancerMatterExceptionCorrection({
    exception: context.exception,
    actor: transfer,
    occurredAt: '2026-07-15T12:00:00.000Z',
    planActionKeys: context.plan.actions.map((item) => item.key),
    existingEvents: [first.event],
    command: {
      commandId: first.event.commandId,
      type: T.acknowledge,
      expectedExceptionId: context.exception.exceptionId,
      expectedRuntimeRevision: 0,
    },
  })
  assert.equal(replay.ok, true)
  assert.equal(replay.duplicate, true)

  const hidden = executeConveyancerMatterExceptionCorrection({
    exception: context.exception,
    actor: { role: MATTER_PLAN_OWNER_ROLES.client, userId: 'buyer-1' },
    occurredAt: '2026-07-15T12:00:00.000Z',
    planActionKeys: context.plan.actions.map((item) => item.key),
    existingEvents: [first.event],
    command: {
      commandId: first.event.commandId,
      type: T.acknowledge,
      expectedExceptionId: context.exception.exceptionId,
      expectedRuntimeRevision: 0,
    },
  })
  assert.equal(hidden.ok, false)
  assert.equal(hidden.code, 'exception_owned_by_another_role')
})

test('requires reasons and summaries for governed not-applicable review', () => {
  const context = activatedException('instruction.signed_transfer_instruction', 'missing')
  const acknowledged = expectApplied(execute(context.exception, context.plan, T.acknowledge))
  const missingReason = execute(acknowledged, context.plan, T.submitNotApplicableReview, { summary: 'Review it.' })
  assert.equal(missingReason.code, 'not_applicable_reason_required')
  const missingSummary = execute(acknowledged, context.plan, T.submitNotApplicableReview, { reason: 'Wrong matter.' })
  assert.equal(missingSummary.code, 'not_applicable_summary_required')
})

test('rejects correction commands against terminal exceptions', () => {
  const context = correctionReady()
  const resolved = expectApplied(execute(context.exception, context.plan, T.approveCorrection, { summary: 'Corrected.' }))
  const result = execute(resolved, context.plan, T.startInvestigation)
  assert.equal(result.ok, false)
  assert.equal(result.code, 'terminal_exception_not_correctable')
})

test('validates the exception against the current plan action contract', () => {
  const context = activatedException('fica.required_evidence', 'missing')
  const result = executeConveyancerMatterExceptionCorrection({
    exception: context.exception,
    actor: transfer,
    occurredAt: '2026-07-15T12:00:00.000Z',
    planActionKeys: ['open_matter'],
    command: { commandId: 'cmd-invalid-plan-scope', type: T.acknowledge },
  })
  assert.equal(result.code, 'matter_exception_invalid')
  assert.ok(result.errors.includes('unknown_exception_action'))
})

console.log('conveyancer matter exception B4 correction and not-applicable tests passed')
