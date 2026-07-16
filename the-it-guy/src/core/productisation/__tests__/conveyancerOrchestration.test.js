import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  CONVEYANCER_ORCHESTRATION_EVENT_TYPES as E,
  buildConveyancerOperationalProjections,
  buildConveyancerOrchestrationControl,
  evaluateConveyancerOrchestrationGate,
  orchestrateConveyancerMatterEvent,
  runConveyancerMatterEvent,
  persistConveyancerOrchestrationControl,
  persistConveyancerOrchestrationResult,
} from '../conveyancerOrchestration.js'

const migration = readFileSync(new URL('../../../../../supabase/migrations/202607160002_conveyancer_productisation_p2.sql', import.meta.url), 'utf8')
const orgId = '10000000-0000-4000-8000-000000000001'
const firmId = '20000000-0000-4000-8000-000000000001'
const transactionId = '30000000-0000-4000-8000-000000000001'
const at = '2026-07-16T10:00:00.000Z'
const actor = { role: 'firm_manager', userId: '40000000-0000-4000-8000-000000000001' }
const pending = []

function test(name, fn) {
  try {
    const result = fn()
    if (result?.then) {
      pending.push(result.then(() => console.log(`ok - ${name}`)).catch((error) => { console.error(`not ok - ${name}`); throw error }))
      return
    }
    console.log(`ok - ${name}`)
  }
  catch (error) { console.error(`not ok - ${name}`); throw error }
}

function control(overrides = {}) {
  return buildConveyancerOrchestrationControl({ organisationId: orgId, attorneyFirmId: firmId, mode: 'pilot', allowedEventTypes: Object.values(E), pilotTransactionIds: [transactionId], killSwitchEnabled: false, reason: 'P2 isolated pilot', ...overrides })
}

function event(type, overrides = {}) {
  return { eventId: `event:${type}:1`, type, organisationId: orgId, attorneyFirmId: firmId, transactionId, sourceReference: `transaction_event:${type}:1`, occurredAt: at, payload: {}, ...overrides }
}

function transaction(overrides = {}) {
  return { id: transactionId, organisation_id: orgId, finance_type: 'cash', transaction_type: 'private_sale', buyer_entity_type: 'individual', seller_entity_type: 'individual', seller_has_existing_bond: false, property_tenure: 'freehold', ...overrides }
}

test('defaults to a fail-closed kill switch and requires the exact pilot matter', () => {
  const disabled = buildConveyancerOrchestrationControl({ organisationId: orgId, attorneyFirmId: firmId, mode: 'pilot', pilotTransactionIds: [transactionId], reason: 'Not activated' })
  assert.equal(evaluateConveyancerOrchestrationGate(disabled, event(E.instructionAccepted)).reason, 'orchestration_kill_switch_enabled')
  const outside = evaluateConveyancerOrchestrationGate(control(), { ...event(E.instructionAccepted), transactionId: '30000000-0000-4000-8000-000000000002' })
  assert.equal(outside.reason, 'matter_outside_pilot_cohort')
})

test('turns an accepted instruction into an active deterministic plan command', () => {
  const result = orchestrateConveyancerMatterEvent({ event: event(E.instructionAccepted, { payload: { transaction: transaction() } }), control: control(), actor })
  assert.equal(result.ok, true, JSON.stringify(result.errors))
  assert.equal(result.decision, 'committed')
  assert.equal(result.nextPlan.status, 'active')
  assert.equal(result.commands.length, 1)
  assert.equal(result.commands[0].kind, 'matter_plan_revision')
  assert.equal(result.commands[0].payload.transactionId, transactionId)
  assert.ok(result.nextPlan.actions.some((item) => item.key === 'open_matter'))
})

test('observe mode runs the contract without producing database commands', () => {
  const result = orchestrateConveyancerMatterEvent({ event: event(E.instructionAccepted, { payload: { transaction: transaction() } }), control: control({ mode: 'observe', pilotTransactionIds: [] }), actor })
  assert.equal(result.ok, true)
  assert.equal(result.decision, 'observed')
  assert.equal(result.commands.length, 0)
  assert.equal(result.persistenceEnvelope, null)
  assert.ok(result.preview.plan)
})

test('routes fact changes through A3 human review without changing legal truth', () => {
  const initial = orchestrateConveyancerMatterEvent({ event: event(E.instructionAccepted, { payload: { transaction: transaction() } }), control: control(), actor })
  const changed = orchestrateConveyancerMatterEvent({ event: event(E.factsChanged, { eventId: 'event:facts:2', payload: { transaction: transaction({ finance_type: 'bond' }), changeReason: 'Buyer changed to bond finance' } }), control: control(), state: { currentPlan: initial.nextPlan }, actor })
  assert.equal(changed.ok, true)
  assert.equal(changed.decision, 'requires_review')
  assert.equal(changed.commands.length, 0)
  assert.equal(changed.preview.impacts.legalLanes.some((item) => item.lane === 'bond'), true)
  assert.ok(changed.persistenceEnvelope)
})

test('executes A5 action commands and appends both runtime plan and event', () => {
  const initial = orchestrateConveyancerMatterEvent({ event: event(E.instructionAccepted, { payload: { transaction: transaction() } }), control: control(), actor })
  const currentPlan = initial.nextPlan
  const result = orchestrateConveyancerMatterEvent({
    event: event(E.actionCommandRequested, { eventId: 'event:action:2', occurredAt: '2026-07-16T10:10:00.000Z', payload: { command: { commandId: 'command:wait:1', type: 'mark_waiting', actionKey: 'open_matter', waitingOn: 'Signed instruction' } } }),
    control: control(),
    state: { currentPlan, currentPlanDatabaseId: '50000000-0000-4000-8000-000000000001', planRecordId: '60000000-0000-4000-8000-000000000001', planRecordRevision: 1 },
    actor,
  })
  assert.equal(result.ok, true, JSON.stringify(result.errors))
  assert.deepEqual(result.commands.map((item) => item.kind), ['matter_plan_revision', 'action_event'])
  assert.equal(result.commands[0].revision, 2)
  assert.equal(result.commands[1].eventType, 'waiting')
  assert.equal(result.nextPlan.actions.find((item) => item.key === 'open_matter').state, 'waiting')
})

test('rebuilds the single action queue as a projection, never as persisted state', () => {
  const initial = orchestrateConveyancerMatterEvent({ event: event(E.instructionAccepted, { payload: { transaction: transaction() } }), control: control(), actor })
  const projections = buildConveyancerOperationalProjections({ plan: initial.nextPlan, actor, asOf: at })
  assert.equal(projections.ok, true, JSON.stringify(projections.errors))
  assert.equal(projections.actionQueue.valid, true)
  assert.ok(projections.actionQueue.items.length > 0)
  assert.match(projections.fingerprint, /^fnv1a_[a-f0-9]{8}$/)
})

test('persists only through the two guarded P2 RPC boundaries', async () => {
  const calls = []
  const client = { rpc: async (name, args) => { calls.push({ name, args }); return { data: { ok: true }, error: null } } }
  const result = orchestrateConveyancerMatterEvent({ event: event(E.instructionAccepted, { payload: { transaction: transaction() } }), control: control(), actor })
  const persisted = await persistConveyancerOrchestrationResult(client, result)
  const configured = await persistConveyancerOrchestrationControl(client, control())
  assert.equal(persisted.ok, true)
  assert.equal(configured.ok, true)
  assert.deepEqual(calls.map((item) => item.name), ['bridge_apply_conveyancer_orchestration_batch', 'bridge_set_conveyancer_orchestration_control'])
})

test('runs a real matter event through context, contracts and persistence', async () => {
  const calls = []
  const client = { rpc: async (name, args) => { calls.push({ name, args }); return { data: { ok: true, receiptId: 'receipt:1' }, error: null } } }
  const context = { control: control(), state: {} }
  const outcome = await runConveyancerMatterEvent(client, { event: event(E.instructionAccepted, { payload: { transaction: transaction() } }), actor, context })
  assert.equal(outcome.ok, true)
  assert.equal(outcome.result.nextPlan.status, 'active')
  assert.equal(outcome.persistence.skipped, false)
  assert.equal(calls[0].name, 'bridge_apply_conveyancer_orchestration_batch')
})

test('migration provides immutable controls, receipts and an atomic idempotent command handler', () => {
  for (const table of ['conveyancer_orchestration_controls', 'conveyancer_orchestration_receipts']) {
    assert.match(migration, new RegExp(`create table if not exists public\\.${table}`))
  }
  assert.match(migration, /bridge_apply_conveyancer_orchestration_batch/)
  assert.match(migration, /attorney_firm_id, event_id/)
  assert.match(migration, /orchestration writes are disabled/i)
  assert.match(migration, /before update or delete/)
  assert.match(migration, /pilot commands require transfer-attorney or management authority/i)
})

await Promise.all(pending)
console.log('P2 conveyancer orchestration tests passed.')
