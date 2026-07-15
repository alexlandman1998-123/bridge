import assert from 'node:assert/strict'
import {
  MATTER_PLAN_OWNER_ROLES,
  MATTER_PLAN_STATUSES,
} from '../../../core/transactions/conveyancerMatterPlanContract.js'
import { executeConveyancerMatterAction } from '../conveyancerMatterActionExecution.js'
import { generateConveyancerMatterPlan } from '../conveyancerMatterPlanGenerator.js'
import {
  CONVEYANCER_MATTER_ASSURANCE_VERSION,
  CONVEYANCER_MATTER_PILOT_SCENARIOS,
  CONVEYANCER_MATTER_PILOT_VERSION,
  CONVEYANCER_PILOT_MEMBERS,
  CONVEYANCER_PILOT_TEAMS,
  buildConveyancerMatterPilotManifest,
  buildConveyancerMatterPlanAssurance,
  runConveyancerMatterPilotSuite,
  serializeConveyancerMatterAssuranceEvidence,
} from '../conveyancerMatterPlanAssurance.js'

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
const actor = { role: MATTER_PLAN_OWNER_ROLES.firmManager, userId: 'manager-1' }

function transaction(overrides = {}) {
  return {
    id: 'tx-a7-1',
    organisation_id: 'org-a7-1',
    finance_type: 'cash',
    transaction_type: 'private_sale',
    buyer_entity_type: 'individual',
    seller_entity_type: 'individual',
    seller_has_existing_bond: false,
    property_tenure: 'freehold',
    ...overrides,
  }
}

function teamForRole(role) {
  if (role === MATTER_PLAN_OWNER_ROLES.secretary) return 'pilot-admin'
  if (role === MATTER_PLAN_OWNER_ROLES.accounts) return 'pilot-accounts'
  return 'pilot-transfer'
}

function activeOwnedPlan(source = transaction()) {
  const generated = generateConveyancerMatterPlan({ transaction: source, generatedAt: asOf })
  assert.equal(generated.valid, true)
  return {
    ...structuredClone(generated.plan),
    status: MATTER_PLAN_STATUSES.active,
    activatedAt: asOf,
    actions: generated.plan.actions.map((action) => ({
      ...structuredClone(action),
      owner: { ...action.owner, teamId: teamForRole(action.owner.role), userId: null },
    })),
  }
}

function assure(plan = activeOwnedPlan(), source = transaction(), overrides = {}) {
  return buildConveyancerMatterPlanAssurance({
    plan,
    transaction: source,
    members: CONVEYANCER_PILOT_MEMBERS,
    teams: CONVEYANCER_PILOT_TEAMS,
    actor,
    events: [],
    asOf,
    ...overrides,
  })
}

test('certifies a healthy active matter across A1-A6', () => {
  const result = assure()
  assert.equal(result.version, CONVEYANCER_MATTER_ASSURANCE_VERSION)
  assert.equal(result.decision, 'ready')
  assert.equal(result.releaseReady, true)
  assert.equal(result.failedCriticalCount, 0)
  assert.equal(result.checks.every((item) => item.status === 'passed'), true)
  assert.equal(Object.isFrozen(result), true)
})

test('blocks assurance when the source plan is not active', () => {
  const plan = activeOwnedPlan()
  plan.status = MATTER_PLAN_STATUSES.draft
  plan.activatedAt = null
  const result = assure(plan)
  assert.equal(result.decision, 'blocked')
  assert.ok(result.failedChecks.some((item) => item.id === 'active_plan_runtime'))
  assert.ok(result.failedChecks.some((item) => item.id === 'a4_queue_valid'))
})

test('blocks assurance when a runtime revision has no audit event', () => {
  const plan = activeOwnedPlan()
  const action = plan.actions.find((item) => item.key === 'open_matter')
  action.runtimeRevision = 1
  action.lastEventId = 'missing-event'
  const result = assure(plan)
  assert.equal(result.decision, 'blocked')
  const audit = result.failedChecks.find((item) => item.id === 'a5_audit_integrity')
  assert.ok(audit.evidence.some((item) => item.startsWith('event_count_mismatch:open_matter')))
})

test('blocks assurance when an audit event contains forged cross-role authority', () => {
  const plan = activeOwnedPlan()
  const action = plan.actions.find((item) => item.key === 'open_matter')
  const executed = executeConveyancerMatterAction({
    plan,
    actor,
    occurredAt: asOf,
    command: {
      commandId: 'cmd-a7-assign',
      type: 'assign',
      actionKey: action.key,
      expectedPlanId: plan.planId,
      expectedPlanVersion: plan.version,
      expectedActionRevision: Number(action.runtimeRevision || 0),
      assignment: { teamId: 'pilot-admin' },
    },
  })
  assert.equal(executed.ok, true, executed.code)
  const forgedEvent = structuredClone(executed.event)
  forgedEvent.actor = { role: MATTER_PLAN_OWNER_ROLES.accounts, userId: 'pilot-accounts-1', teamIds: ['pilot-accounts'] }
  const result = assure(executed.plan, transaction(), { events: [forgedEvent] })
  assert.equal(result.decision, 'blocked')
  assert.ok(result.evidence.audit.issues.includes('event_authority:open_matter:actor_role_mismatch'))
})

test('observes incomplete classification without treating it as a platform defect', () => {
  const source = { id: 'tx-a7-missing', organisation_id: 'org-a7-1', transaction_type: 'private_sale', seller_has_existing_bond: false, property_tenure: 'freehold' }
  const result = assure(activeOwnedPlan(source), source)
  assert.equal(result.decision, 'observe')
  assert.equal(result.failedCriticalCount, 0)
  assert.ok(result.failedChecks.some((item) => item.id === 'classification_complete'))
})

test('observes overdue operational work while retaining platform assurance', () => {
  const result = assure(activeOwnedPlan(), transaction(), { asOf: '2026-07-20T09:00:00.000Z' })
  assert.equal(result.decision, 'observe')
  assert.ok(result.failedChecks.some((item) => item.id === 'deadline_health'))
  assert.equal(result.failedCriticalCount, 0)
})

test('detects generated definition drift as a release blocker', () => {
  const plan = activeOwnedPlan()
  plan.actions.find((item) => item.key === 'verify_parties').definitionFingerprint = 'drifted'
  const result = assure(plan)
  assert.equal(result.decision, 'blocked')
  assert.ok(result.failedChecks.some((item) => item.id === 'a2_generation_parity'))
})

test('serializes a stable assurance evidence packet', () => {
  const result = assure()
  const serialized = serializeConveyancerMatterAssuranceEvidence(result)
  const parsed = JSON.parse(serialized)
  assert.equal(parsed.version, CONVEYANCER_MATTER_ASSURANCE_VERSION)
  assert.equal(parsed.decision, 'ready')
  assert.equal(parsed.checks.length, result.checks.length)
})

test('passes the complete default pilot scenario suite', () => {
  const result = runConveyancerMatterPilotSuite({ generatedAt: asOf })
  assert.equal(result.version, CONVEYANCER_MATTER_PILOT_VERSION)
  assert.equal(result.decision, 'go')
  assert.equal(result.metrics.failedCount, 0)
  assert.equal(result.metrics.scenarioPassRate, 1)
  assert.equal(result.metrics.expectedObserveCount, 1)
})

test('holds the pilot when a scenario contract fails', () => {
  const brokenScenario = {
    ...CONVEYANCER_MATTER_PILOT_SCENARIOS[0],
    id: 'broken-scenario',
    requiredActionKeys: ['action_that_does_not_exist'],
  }
  const result = runConveyancerMatterPilotSuite({ scenarios: [brokenScenario], generatedAt: asOf })
  assert.equal(result.decision, 'hold')
  assert.ok(result.releaseBlockers.includes('scenario_pass_rate'))
  assert.deepEqual(result.scenarioResults[0].missingActions, ['action_that_does_not_exist'])
})

test('holds or observes expansion when live pilot thresholds are breached', () => {
  const held = runConveyancerMatterPilotSuite({
    generatedAt: asOf,
    operationalMetrics: { executionAttempts: 100, executionFailures: 6 },
  })
  assert.equal(held.decision, 'hold')
  assert.ok(held.rollbackTriggers.some((item) => item.key === 'execution_failure_rate' && item.severity === 'critical'))

  const observed = runConveyancerMatterPilotSuite({
    generatedAt: asOf,
    operationalMetrics: { activeActions: 100, overdueActions: 15 },
  })
  assert.equal(observed.decision, 'observe')
  assert.ok(observed.rollbackTriggers.some((item) => item.key === 'overdue_action_rate' && item.severity === 'warning'))
})

test('builds a guarded pilot manifest without enabling production writes', () => {
  const valid = buildConveyancerMatterPilotManifest({
    firmIds: ['firm-1'],
    startsAt: '2026-08-01T08:00:00.000Z',
    endsAt: '2026-08-15T17:00:00.000Z',
    maximumMatters: 20,
    rollbackOwnerId: 'owner-1',
    supportOwnerId: 'support-1',
  })
  assert.equal(valid.valid, true)
  assert.equal(valid.controls.legacyWorkflowFallback, true)
  assert.equal(valid.controls.killSwitchRequired, true)
  assert.equal(valid.controls.databaseWritesEnabledByManifest, false)

  const invalid = buildConveyancerMatterPilotManifest({})
  assert.equal(invalid.valid, false)
  assert.ok(invalid.errors.includes('pilot_firm_required'))
  assert.ok(invalid.errors.includes('rollback_owner_required'))
})

console.log('conveyancer matter-plan A7 assurance and pilot tests passed')
