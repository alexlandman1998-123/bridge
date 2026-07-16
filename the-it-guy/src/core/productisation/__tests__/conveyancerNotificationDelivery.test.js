import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  CONVEYANCER_ORCHESTRATION_EVENT_TYPES as E,
  buildConveyancerOrchestrationControl,
  orchestrateConveyancerMatterEvent,
} from '../conveyancerOrchestration.js'
import {
  CONVEYANCER_NOTIFICATION_KINDS,
  buildConveyancerNotificationControl,
  buildConveyancerNotificationIntents,
  evaluateConveyancerNotificationGate,
  persistConveyancerNotificationIntents,
  persistConveyancerNotificationControl,
} from '../conveyancerNotificationDelivery.js'

const migration = readFileSync(new URL('../../../../../supabase/migrations/202607160004_conveyancer_productisation_p4.sql', import.meta.url), 'utf8')
const worker = readFileSync(new URL('../../../../../supabase/functions/dispatch-conveyancer-notifications/index.ts', import.meta.url), 'utf8')
const orgId = '10000000-0000-4000-8000-000000000001'
const firmId = '20000000-0000-4000-8000-000000000001'
const transactionId = '30000000-0000-4000-8000-000000000001'
const attorneyId = '40000000-0000-4000-8000-000000000001'
const managerId = '40000000-0000-4000-8000-000000000002'
const at = '2026-07-16T10:00:00.000Z'
const actor = { role: 'transfer_attorney', userId: attorneyId }
const members = [
  { userId: attorneyId, role: 'transfer_attorney', status: 'active' },
  { userId: managerId, role: 'firm_admin', status: 'active' },
  { userId: '40000000-0000-4000-8000-000000000003', role: 'conveyancing_secretary', status: 'active' },
]
const pending = []

function plan() {
  const orchestration = orchestrateConveyancerMatterEvent({
    control: buildConveyancerOrchestrationControl({ organisationId: orgId, attorneyFirmId: firmId, mode: 'pilot', allowedEventTypes: Object.values(E), pilotTransactionIds: [transactionId], killSwitchEnabled: false, reason: 'P4 test' }),
    actor,
    event: {
      eventId: 'p4:instruction:1', type: E.instructionAccepted, organisationId: orgId,
      attorneyFirmId: firmId, transactionId, sourceReference: 'instruction:p4:1', occurredAt: at,
      payload: { transaction: { id: transactionId, organisation_id: orgId, finance_type: 'bond', transaction_type: 'private_sale', buyer_entity_type: 'individual', seller_entity_type: 'individual', seller_has_existing_bond: true, property_tenure: 'sectional_title' } },
    },
  })
  assert.equal(orchestration.ok, true, JSON.stringify(orchestration.errors))
  return orchestration.nextPlan
}

function control(overrides = {}) {
  return buildConveyancerNotificationControl({ organisationId: orgId, attorneyFirmId: firmId, mode: 'pilot', channels: ['in_app'], pilotTransactionIds: [transactionId], dueSoonHours: 24, escalationHours: 24, killSwitchEnabled: false, reason: 'P4 pilot', ...overrides })
}

function test(name, fn) {
  try {
    const outcome = fn()
    if (outcome?.then) { pending.push(outcome.then(() => console.log(`ok - ${name}`))); return }
    console.log(`ok - ${name}`)
  } catch (error) { console.error(`not ok - ${name}`); throw error }
}

test('defaults fail-closed and isolates the exact notification pilot cohort', () => {
  const disabled = buildConveyancerNotificationControl({ organisationId: orgId, attorneyFirmId: firmId, reason: 'Not enabled' })
  assert.equal(evaluateConveyancerNotificationGate(disabled, transactionId).reason, 'notification_kill_switch_enabled')
  assert.equal(evaluateConveyancerNotificationGate(control(), '30000000-0000-4000-8000-000000000099').reason, 'matter_outside_notification_pilot')
})

test('projects deterministic immediate notices, reminders and management escalations', () => {
  const first = buildConveyancerNotificationIntents({ plan: plan(), planRevision: 1, control: control(), members, actor, asOf: at })
  const second = buildConveyancerNotificationIntents({ plan: plan(), planRevision: 1, control: control(), members, actor, asOf: at })
  assert.equal(first.ok, true, JSON.stringify(first.errors))
  assert.ok(first.intents.length > 0)
  assert.equal(first.fingerprint, second.fingerprint)
  assert.deepEqual(first.intents, second.intents)
  assert.ok(first.intents.some((intent) => [CONVEYANCER_NOTIFICATION_KINDS.actionReady, CONVEYANCER_NOTIFICATION_KINDS.reviewRequired].includes(intent.kind)))
  assert.ok(first.intents.some((intent) => intent.kind === CONVEYANCER_NOTIFICATION_KINDS.overdue))
  assert.ok(first.intents.some((intent) => intent.kind === CONVEYANCER_NOTIFICATION_KINDS.escalation && intent.recipientUserId === managerId))
  assert.equal(first.intents.every((intent) => intent.channel === 'in_app'), true)
  assert.equal(new Set(first.intents.map((intent) => intent.dedupeKey)).size, first.intents.length)
})

test('does not notify current-firm users as if they owned external legal work', () => {
  const projection = buildConveyancerNotificationIntents({ plan: plan(), planRevision: 1, control: control(), members, actor, asOf: at })
  const externalActionKeys = new Set(plan().actions.filter((action) => ['external_party', 'client', 'system'].includes(action.owner?.role)).map((action) => action.key))
  assert.equal(projection.intents.some((intent) => externalActionKeys.has(intent.actionKey)), false)
})

test('observe mode calculates delivery without queueing it', () => {
  const projection = buildConveyancerNotificationIntents({ plan: plan(), planRevision: 1, control: control({ mode: 'observe', pilotTransactionIds: [] }), members, actor, asOf: at })
  assert.equal(projection.ok, true)
  assert.equal(projection.skipped, true)
  assert.equal(projection.reason, 'observe_only')
  assert.ok(projection.intents.length > 0)
})

test('persists through the guarded P4 enqueue RPC only', async () => {
  const calls = []
  const projection = buildConveyancerNotificationIntents({ plan: plan(), planRevision: 1, control: control(), members, actor, asOf: at })
  const client = { rpc: async (name, args) => { calls.push({ name, args }); return { data: { ok: true, queued: projection.intents.length }, error: null } } }
  const result = await persistConveyancerNotificationIntents(client, { organisationId: orgId, attorneyFirmId: firmId, transactionId, planRecordId: '50000000-0000-4000-8000-000000000001', planRevision: 1, projection, generatedAt: at })
  assert.equal(result.ok, true)
  assert.deepEqual(calls.map((call) => call.name), ['bridge_enqueue_conveyancer_notifications'])
  assert.equal(calls[0].args.payload.intents.length, projection.intents.length)
})

test('versions activation only through the firm-admin control RPC', async () => {
  const calls = []
  const client = { rpc: async (name, args) => { calls.push({ name, args }); return { data: { ok: true, revision: 1 }, error: null } } }
  const result = await persistConveyancerNotificationControl(client, control())
  assert.equal(result.ok, true)
  assert.deepEqual(calls.map((call) => call.name), ['bridge_set_conveyancer_notification_control'])
  assert.equal(calls[0].args.payload.fingerprint, result.control.fingerprint)
})

test('migration provides tenant-safe controls, outbox, receipts and stale-delivery checks', () => {
  for (const table of ['conveyancer_notification_controls', 'conveyancer_notification_outbox', 'conveyancer_notification_delivery_events']) assert.match(migration, new RegExp(`create table if not exists public\\.${table}`))
  assert.match(migration, /enable row level security/g)
  assert.match(migration, /recipient is not an active member of the exact firm/i)
  assert.match(migration, /P2 orchestration must remain enabled for P4 delivery/i)
  assert.match(migration, /control_or_plan_state_changed/)
  assert.match(migration, /for update skip locked/)
  assert.match(migration, /grant execute on function public\.bridge_dispatch_conveyancer_notifications\(integer, timestamptz\) to service_role/)
  assert.doesNotMatch(migration, /grant (insert|update|delete).*conveyancer_notification_outbox.*authenticated/i)
})

test('worker exposes only the bounded service-role dispatcher', () => {
  assert.match(worker, /bridge_dispatch_conveyancer_notifications/)
  assert.match(worker, /positiveInteger\(body\.limit, 50, 200\)/)
  assert.doesNotMatch(worker, /\.from\(/)
})

await Promise.all(pending)
console.log('P4 conveyancer notification delivery tests passed.')
