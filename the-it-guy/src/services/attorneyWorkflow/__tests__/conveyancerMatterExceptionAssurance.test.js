import assert from 'node:assert/strict'
import {
  MATTER_PLAN_OWNER_ROLES,
  MATTER_PLAN_STATUSES,
} from '../../../core/transactions/conveyancerMatterPlanContract.js'
import { MATTER_EXCEPTION_STATUSES } from '../../../core/transactions/conveyancerMatterExceptionContract.js'
import { generateConveyancerMatterPlan } from '../conveyancerMatterPlanGenerator.js'
import { activateConveyancerMatterExceptions } from '../conveyancerMatterExceptionActivation.js'
import {
  MATTER_EXCEPTION_CORRECTION_COMMAND_TYPES as CT,
  executeConveyancerMatterExceptionCorrection,
} from '../conveyancerMatterExceptionCorrection.js'
import {
  MATTER_EXCEPTION_OVERRIDE_COMMAND_TYPES as OT,
  MATTER_EXCEPTION_OVERRIDE_OPERATIONS as OO,
  executeConveyancerMatterExceptionOverride,
} from '../conveyancerMatterExceptionOverride.js'
import {
  CONVEYANCER_MATTER_EXCEPTION_ASSURANCE_VERSION,
  CONVEYANCER_MATTER_EXCEPTION_PILOT_SCENARIOS,
  CONVEYANCER_MATTER_EXCEPTION_PILOT_VERSION,
  buildConveyancerMatterExceptionAssurance,
  buildConveyancerMatterExceptionPilotManifest,
  runConveyancerMatterExceptionPilotSuite,
  serializeConveyancerMatterExceptionAssuranceEvidence,
} from '../conveyancerMatterExceptionAssurance.js'

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

const asOf = '2026-07-15T09:00:00.000Z'
const system = { role: MATTER_PLAN_OWNER_ROLES.system, userId: 'detector' }
const attorney = { role: MATTER_PLAN_OWNER_ROLES.transferAttorney, userId: 'attorney-1' }
const manager = { role: MATTER_PLAN_OWNER_ROLES.firmManager, userId: 'manager-1' }

function transaction(overrides = {}) {
  return {
    id: 'tx-b7-1',
    organisation_id: 'org-b7-1',
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
  const generated = generateConveyancerMatterPlan({ transaction: source, generatedAt: asOf })
  assert.equal(generated.valid, true)
  return { ...structuredClone(generated.plan), status: MATTER_PLAN_STATUSES.active, activatedAt: asOf }
}

function activated(signalKey = 'instruction.signed_transfer_instruction', state = 'missing', source = transaction()) {
  const plan = activePlan(source)
  const result = activateConveyancerMatterExceptions({
    plan,
    observations: [{ signalKey, state, observedAt: asOf, detectedBy: system }],
    actor: system,
    asOf,
  })
  assert.equal(result.valid, true)
  assert.equal(result.activatedExceptions.length, 1)
  return { plan, exception: result.activatedExceptions[0], events: [...result.events], sequence: 0 }
}

function execute(context, service, type, actor = attorney, payload = {}) {
  context.sequence += 1
  const result = service({
    exception: context.exception,
    actor,
    occurredAt: new Date(new Date(asOf).getTime() + context.sequence * 60 * 1000).toISOString(),
    planActionKeys: context.plan.actions.map((item) => item.key),
    command: {
      commandId: `cmd-b7-${context.sequence}`,
      type,
      expectedExceptionId: context.exception.exceptionId,
      expectedRuntimeRevision: Number(context.exception.runtimeRevision || 0),
      ...payload,
    },
  })
  assert.equal(result.ok, true, result.code)
  context.exception = result.exception
  context.events.push(result.event)
  return result
}

function assure(context, overrides = {}) {
  return buildConveyancerMatterExceptionAssurance({
    plan: context.plan,
    exceptions: [context.exception],
    events: context.events,
    asOf: '2026-07-15T12:00:00.000Z',
    ...overrides,
  })
}

function approvedOverride() {
  const context = activated()
  execute(context, executeConveyancerMatterExceptionCorrection, CT.acknowledge)
  execute(context, executeConveyancerMatterExceptionOverride, OT.propose, attorney, {
    override: {
      reason: 'Allow safe preparation.',
      businessJustification: 'Avoid delay while evidence is collected.',
      operations: [OO.requestDocuments],
      safeguards: ['Do not change legal state'],
      expiresAt: '2026-07-17T09:00:00.000Z',
    },
  })
  execute(context, executeConveyancerMatterExceptionOverride, OT.approve, manager, {
    summary: 'Safe request activity approved.',
    decisionReferenceId: 'override-decision-1',
  })
  return context
}

test('certifies a clean active matter with no exceptions', () => {
  const result = buildConveyancerMatterExceptionAssurance({ plan: activePlan(), exceptions: [], events: [], asOf })
  assert.equal(result.version, CONVEYANCER_MATTER_EXCEPTION_ASSURANCE_VERSION)
  assert.equal(result.decision, 'ready')
  assert.equal(result.releaseReady, true)
  assert.equal(result.failedCriticalCount, 0)
  assert.equal(Object.isFrozen(result), true)
})

test('treats an unresolved high exception as matter observation, not platform failure', () => {
  const result = assure(activated())
  assert.equal(result.decision, 'observe')
  assert.equal(result.failedCriticalCount, 0)
  assert.equal(result.evidence.metrics.activeCount, 1)
  assert.ok(result.failedChecks.some((item) => item.id === 'active_exception_health'))
})

test('observes unresolved critical exceptions while retaining release assurance', () => {
  const context = activated('authority.signatory_conflict', 'conflict', transaction({ buyer_entity_type: 'company' }))
  const result = assure(context)
  assert.equal(result.decision, 'observe')
  assert.equal(result.releaseReady, false)
  assert.ok(result.failedChecks.some((item) => item.id === 'unresolved_critical_health'))
})

test('blocks when an exception mutation has no matching event', () => {
  const context = activated()
  execute(context, executeConveyancerMatterExceptionCorrection, CT.acknowledge)
  const result = assure(context, { events: context.events.slice(0, 1) })
  assert.equal(result.decision, 'blocked')
  assert.ok(result.evidence.audit.issues.some((item) => item.startsWith('event_count_mismatch:')))
})

test('blocks forged authority in an otherwise valid event chain', () => {
  const context = activated()
  execute(context, executeConveyancerMatterExceptionCorrection, CT.acknowledge)
  const forged = structuredClone(context.events)
  forged[1].actor = { role: MATTER_PLAN_OWNER_ROLES.client, userId: 'client-1', teamIds: [] }
  forged[1].authority = 'owned_and_authorised'
  const result = assure(context, { events: forged })
  assert.equal(result.decision, 'blocked')
  assert.ok(result.evidence.audit.issues.some((item) => item.includes(':actor_role_mismatch')))
})

test('blocks a semantically forged final event snapshot', () => {
  const context = activated()
  execute(context, executeConveyancerMatterExceptionCorrection, CT.acknowledge)
  const forged = structuredClone(context.events)
  forged[1].after.status = MATTER_EXCEPTION_STATUSES.investigating
  const result = assure(context, { events: forged })
  assert.equal(result.decision, 'blocked')
  assert.ok(result.evidence.audit.issues.some((item) => item.startsWith('final_snapshot_mismatch:')))
})

test('blocks duplicate active exception scopes', () => {
  const context = activated()
  const duplicate = structuredClone(context.exception)
  duplicate.exceptionId = 'duplicate-exception-id'
  duplicate.runtimeRevision = 0
  duplicate.lastEventId = null
  const duplicateActivation = { ...structuredClone(context.events[0]), eventId: 'duplicate-activation', exceptionId: duplicate.exceptionId }
  const result = buildConveyancerMatterExceptionAssurance({
    plan: context.plan,
    exceptions: [context.exception, duplicate],
    events: [...context.events, duplicateActivation],
    asOf,
  })
  assert.equal(result.decision, 'blocked')
  assert.ok(result.failedChecks.some((item) => item.id === 'b3_activation_uniqueness'))
})

test('blocks structurally unsafe active overrides', () => {
  const context = approvedOverride()
  context.exception.activeOverride.operations = ['complete_action']
  const result = assure(context)
  assert.equal(result.decision, 'blocked')
  assert.ok(result.failedChecks.find((item) => item.id === 'b6_override_integrity').evidence.some((item) => item.endsWith(':override_operation_unsafe')))
})

test('observes a valid active override and separately flags expiry cleanup', () => {
  const context = approvedOverride()
  const active = assure(context)
  assert.equal(active.decision, 'observe')
  assert.ok(active.failedChecks.some((item) => item.id === 'active_override_health'))
  assert.ok(!active.failedChecks.some((item) => item.id === 'expired_override_cleanup'))

  const expired = assure(context, { asOf: '2026-07-18T09:00:00.000Z' })
  assert.equal(expired.decision, 'observe')
  assert.ok(expired.failedChecks.some((item) => item.id === 'expired_override_cleanup'))
})

test('serializes a stable B7 evidence packet', () => {
  const result = buildConveyancerMatterExceptionAssurance({ plan: activePlan(), exceptions: [], events: [], asOf })
  const parsed = JSON.parse(serializeConveyancerMatterExceptionAssuranceEvidence(result))
  assert.equal(parsed.version, CONVEYANCER_MATTER_EXCEPTION_ASSURANCE_VERSION)
  assert.equal(parsed.decision, 'ready')
  assert.ok(Array.isArray(parsed.checks))
})

test('passes the complete B1-B6 pilot scenario suite', () => {
  const result = runConveyancerMatterExceptionPilotSuite({ generatedAt: asOf })
  assert.equal(result.version, CONVEYANCER_MATTER_EXCEPTION_PILOT_VERSION)
  assert.equal(result.decision, 'go')
  assert.equal(result.metrics.failedCount, 0)
  assert.equal(result.metrics.scenarioPassRate, 1)
  const critical = result.scenarioResults.find((item) => item.workflow === 'critical_override')
  assert.equal(critical.controls.nonManagerApprovalDenied, true)
  assert.equal(critical.controls.unsafeOperationDenied, true)
})

test('holds the pilot when a scenario contract fails', () => {
  const broken = { ...CONVEYANCER_MATTER_EXCEPTION_PILOT_SCENARIOS[0], id: 'broken-scenario', expectedAssuranceDecision: 'blocked' }
  const result = runConveyancerMatterExceptionPilotSuite({ scenarios: [broken], generatedAt: asOf })
  assert.equal(result.decision, 'hold')
  assert.ok(result.releaseBlockers.includes('scenario_pass_rate'))
})

test('holds or observes expansion when live thresholds are breached', () => {
  const held = runConveyancerMatterExceptionPilotSuite({
    generatedAt: asOf,
    operationalMetrics: { commandAttempts: 100, commandFailures: 6 },
  })
  assert.equal(held.decision, 'hold')
  assert.ok(held.rollbackTriggers.some((item) => item.key === 'command_failure_rate' && item.severity === 'critical'))

  const observed = runConveyancerMatterExceptionPilotSuite({
    generatedAt: asOf,
    operationalMetrics: { commandAttempts: 100, commandFailures: 3 },
  })
  assert.equal(observed.decision, 'observe')
  assert.ok(observed.rollbackTriggers.some((item) => item.key === 'command_failure_rate' && item.severity === 'warning'))
})

test('builds a guarded pilot manifest without enabling writes or auto-decisions', () => {
  const valid = buildConveyancerMatterExceptionPilotManifest({
    firmIds: ['firm-1'],
    startsAt: '2026-08-01T08:00:00.000Z',
    endsAt: '2026-08-15T17:00:00.000Z',
    maximumMatters: 20,
    assuranceOwnerId: 'assurance-1',
    rollbackOwnerId: 'rollback-1',
    supportOwnerId: 'support-1',
  })
  assert.equal(valid.valid, true)
  assert.equal(valid.controls.databaseWritesEnabledByManifest, false)
  assert.equal(valid.controls.automaticWaiverApproval, false)
  assert.equal(valid.controls.automaticOverrideApproval, false)

  const invalid = buildConveyancerMatterExceptionPilotManifest({})
  assert.equal(invalid.valid, false)
  assert.ok(invalid.errors.includes('assurance_owner_required'))
})

test('blocks terminal exceptions that still carry an active override', () => {
  const context = approvedOverride()
  context.exception.status = MATTER_EXCEPTION_STATUSES.resolved
  const result = assure(context)
  assert.equal(result.decision, 'blocked')
  assert.ok(result.failedChecks.find((item) => item.id === 'b6_override_integrity').evidence.some((item) => item.endsWith(':override_on_terminal_exception')))
})

console.log('conveyancer matter exception B7 assurance tests passed')
