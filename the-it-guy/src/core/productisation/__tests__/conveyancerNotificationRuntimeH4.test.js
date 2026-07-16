import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { MATTER_PLAN_STATUSES } from '../../transactions/conveyancerMatterPlanContract.js'
import { generateConveyancerMatterPlan } from '../../../services/attorneyWorkflow/conveyancerMatterPlanGenerator.js'
import { buildConveyancerOrchestrationControl, CONVEYANCER_ORCHESTRATION_EVENT_TYPES } from '../conveyancerOrchestration.js'
import { buildConveyancerNotificationControl } from '../conveyancerNotificationDelivery.js'
import {
  CONVEYANCER_NOTIFICATION_H4_CONTROLS,
  buildConveyancerRuntimeNotificationSignals,
  persistConveyancerRuntimeNotificationSignals,
  runConveyancerApplicationEventH4,
} from '../conveyancerNotificationRuntimeH4.js'
import { CONVEYANCER_APPLICATION_H2_EVENT_TYPES as E } from '../conveyancerApplicationOrchestratorH2.js'

const migration = readFileSync(new URL('../../../../../supabase/migrations/20260716170001_conveyancer_h4_notification_runtime.sql', import.meta.url), 'utf8')
const cockpit = readFileSync(new URL('../../../components/attorney/cockpit/ConveyancerCockpit.jsx', import.meta.url), 'utf8')
const worker = readFileSync(new URL('../../../../../supabase/functions/dispatch-conveyancer-notifications/index.ts', import.meta.url), 'utf8')
const orgId = '10000000-0000-4000-8000-000000000001'
const firmId = '20000000-0000-4000-8000-000000000001'
const transactionId = '30000000-0000-4000-8000-000000000001'
const attorneyId = '40000000-0000-4000-8000-000000000001'
const secretaryId = '40000000-0000-4000-8000-000000000002'
const managerId = '40000000-0000-4000-8000-000000000003'
const accountsId = '40000000-0000-4000-8000-000000000004'
const outsiderId = '40000000-0000-4000-8000-000000000099'
const at = '2026-07-16T10:00:00.000Z'
const actor = { role: 'transfer_attorney', userId: attorneyId }
const members = [
  { userId: attorneyId, role: 'transfer_attorney', status: 'active' },
  { userId: secretaryId, role: 'conveyancing_secretary', status: 'active' },
  { userId: managerId, role: 'firm_admin', status: 'active' },
  { userId: accountsId, role: 'admin_staff', status: 'active' },
  { userId: outsiderId, role: 'bond_attorney', status: 'active' },
]
const pending = []

function test(name, fn) {
  try {
    const result = fn()
    if (result?.then) { pending.push(result.then(() => console.log(`ok - ${name}`)).catch((error) => { console.error(`not ok - ${name}`); throw error })); return }
    console.log(`ok - ${name}`)
  } catch (error) { console.error(`not ok - ${name}`); throw error }
}

function notificationControl(overrides = {}) {
  return buildConveyancerNotificationControl({ organisationId: orgId, attorneyFirmId: firmId, mode: 'pilot', channels: ['in_app'], pilotTransactionIds: [transactionId], killSwitchEnabled: false, reason: 'H4 pilot', ...overrides })
}

function notificationContext(overrides = {}) {
  return { available: true, reason: 'loaded', control: notificationControl(), members, ...overrides }
}

function event(type, overrides = {}) {
  return { eventId: `event:${type}:1`, type, organisationId: orgId, attorneyFirmId: firmId, transactionId, sourceReference: `matter:${transactionId}:${type}:1`, occurredAt: at, payload: { privilegedClientName: 'Must never enter notification metadata' }, ...overrides }
}

function activePlan() {
  const generated = generateConveyancerMatterPlan({ transaction: { id: transactionId, organisation_id: orgId, finance_type: 'cash', transaction_type: 'private_sale', buyer_entity_type: 'individual', seller_entity_type: 'individual', seller_has_existing_bond: false, property_tenure: 'freehold' }, generatedAt: '2026-07-16T08:00:00.000Z' })
  assert.equal(generated.valid, true, JSON.stringify(generated.errors))
  return { ...structuredClone(generated.plan), status: MATTER_PLAN_STATUSES.active, activatedAt: '2026-07-16T08:05:00.000Z' }
}

function applicationContext() {
  return {
    control: buildConveyancerOrchestrationControl({ organisationId: orgId, attorneyFirmId: firmId, mode: 'pilot', allowedEventTypes: Object.values(CONVEYANCER_ORCHESTRATION_EVENT_TYPES), pilotTransactionIds: [transactionId], killSwitchEnabled: false, reason: 'H4 application pilot' }),
    state: { currentPlan: activePlan(), currentPlanDatabaseId: '50000000-0000-4000-8000-000000000001', planRecordId: '60000000-0000-4000-8000-000000000001', planRecordRevision: 1 },
    runtime: { exceptions: [], coordinations: [], evidence: [], financialModels: [] },
  }
}

test('maps each H2 runtime event to bounded current-firm recipients', () => {
  const expected = [
    [E.exceptionObserved, 'exception_attention', {}],
    [E.coordinationRecorded, 'coordination_attention', { coordination: { status: 'blocked' } }],
    [E.evidenceCaptured, 'evidence_review', {}],
    [E.financialSnapshotRecorded, 'financial_reconciliation', { financialModel: { status: 'reconciliation_required' } }],
    [E.closeoutAssessed, 'closeout_review', {}],
  ]
  for (const [type, signalType, payload] of expected) {
    const result = buildConveyancerRuntimeNotificationSignals({ event: event(type, { payload }), notificationContext: notificationContext(), actor })
    assert.equal(result.ok, true)
    assert.equal(result.signals.every((signal) => signal.signalType === signalType), true)
    assert.equal(result.signals.some((signal) => signal.recipientUserId === outsiderId), false)
    assert.equal(new Set(result.signals.map((signal) => signal.dedupeKey)).size, result.signals.length)
  }
})

test('does not create attention noise for routine coordination or approved finance updates', () => {
  const coordination = buildConveyancerRuntimeNotificationSignals({ event: event(E.coordinationRecorded, { payload: { coordination: { status: 'acknowledged' } } }), notificationContext: notificationContext(), actor })
  const financial = buildConveyancerRuntimeNotificationSignals({ event: event(E.financialSnapshotRecorded, { payload: { financialModel: { status: 'approved' } } }), notificationContext: notificationContext(), actor })
  assert.equal(coordination.reason, 'runtime_event_does_not_need_attention')
  assert.equal(financial.reason, 'runtime_event_does_not_need_attention')
  assert.deepEqual(coordination.signals, [])
  assert.deepEqual(financial.signals, [])
})

test('keeps notification metadata minimal and review-bound', () => {
  const result = buildConveyancerRuntimeNotificationSignals({ event: event(E.evidenceCaptured), notificationContext: notificationContext(), actor })
  assert.ok(result.signals.length > 0)
  assert.equal(result.signals.every((signal) => signal.metadata.legalTruth === false && signal.metadata.humanReviewRequired === true), true)
  assert.doesNotMatch(JSON.stringify(result.signals), /privilegedClientName|Must never enter/)
  assert.deepEqual(CONVEYANCER_NOTIFICATION_H4_CONTROLS.channels, ['in_app'])
  assert.equal(CONVEYANCER_NOTIFICATION_H4_CONTROLS.externalMessagingRequired, false)
})

test('fails closed under notification controls and preserves manual fallback', () => {
  const killed = buildConveyancerRuntimeNotificationSignals({ event: event(E.exceptionObserved), notificationContext: notificationContext({ control: notificationControl({ killSwitchEnabled: true }) }), actor })
  assert.equal(killed.skipped, true)
  assert.equal(killed.reason, 'notification_kill_switch_enabled')
  const observed = buildConveyancerRuntimeNotificationSignals({ event: event(E.exceptionObserved), notificationContext: notificationContext({ control: notificationControl({ mode: 'observe', pilotTransactionIds: [] }) }), actor })
  assert.equal(observed.reason, 'observe_only')
  const outside = buildConveyancerRuntimeNotificationSignals({ event: event(E.exceptionObserved, { transactionId: '30000000-0000-4000-8000-000000000099' }), notificationContext: notificationContext(), actor })
  assert.equal(outside.reason, 'matter_outside_notification_pilot')
  assert.equal(CONVEYANCER_NOTIFICATION_H4_CONTROLS.manualFallbackRequired, true)
})

test('does not invent a recipient when no eligible active firm member exists', () => {
  const result = buildConveyancerRuntimeNotificationSignals({ event: event(E.financialSnapshotRecorded, { payload: { financialModel: { status: 'reconciliation_required' } } }), notificationContext: notificationContext({ members: [{ userId: outsiderId, role: 'bond_attorney', status: 'active' }] }), actor })
  assert.equal(result.skipped, true)
  assert.equal(result.reason, 'no_eligible_current_firm_recipients')
  assert.deepEqual(result.signals, [])
})

test('persists only through the H4 RPC and treats duplicates as successful replay', async () => {
  const calls = []
  const projection = buildConveyancerRuntimeNotificationSignals({ event: event(E.exceptionObserved), notificationContext: notificationContext(), actor })
  const client = { rpc: async (name, args) => { calls.push({ name, args }); return { data: { ok: true, queued: 0, duplicates: projection.signals.length }, error: null } } }
  const persisted = await persistConveyancerRuntimeNotificationSignals(client, projection)
  assert.deepEqual(calls.map((call) => call.name), ['bridge_enqueue_conveyancer_notification_signal'])
  assert.equal(calls[0].args.payload.signals.length, projection.signals.length)
  assert.equal(persisted.reason, 'idempotent_replay')
})

test('connects committed H2 events to H4 while leaving application success independent', async () => {
  const calls = []
  function tableResponse(table) {
    if (table === 'conveyancer_notification_controls') return { data: [{ organisation_id: orgId, attorney_firm_id: firmId, mode: 'pilot', channels: ['in_app'], pilot_transaction_ids: [transactionId], due_soon_hours: 24, escalation_hours: 24, kill_switch_enabled: false, reason: 'H4 test' }], error: null }
    if (table === 'attorney_firm_members') return { data: members.map((member) => ({ user_id: member.userId, role: member.role, status: member.status })), error: null }
    return { data: [], error: null }
  }
  const client = {
    rpc: async (name, args) => { calls.push({ name, args }); if (name === 'bridge_apply_conveyancer_application_batch') return { data: { ok: true, duplicate: false, receiptId: 'receipt:h4:1' }, error: null }; return { data: { ok: true, queued: 2, duplicates: 0 }, error: null } },
    from(table) {
      const chain = { select: () => chain, eq: () => chain, order: () => chain, limit: () => chain, then: (resolve) => Promise.resolve(tableResponse(table)).then(resolve) }
      return chain
    },
  }
  const evidenceEvent = event(E.evidenceCaptured, { payload: { evidence: { evidenceType: 'manual_signed_instruction', sourceSystem: 'manual', contentHash: 'a'.repeat(64), observedAt: at, captureReference: 'manual:h4:1' } } })
  const outcome = await runConveyancerApplicationEventH4(client, { event: evidenceEvent, actor, context: applicationContext() })
  assert.equal(outcome.ok, true)
  assert.equal(outcome.notifications.reason, 'queued')
  assert.deepEqual(calls.map((call) => call.name), ['bridge_apply_conveyancer_application_batch', 'bridge_enqueue_conveyancer_notification_signal'])
})

test('migration extends the P4 outbox instead of creating a competing delivery system', () => {
  assert.match(migration, /alter table public\.conveyancer_notification_outbox/)
  assert.doesNotMatch(migration, /create table if not exists public\.conveyancer_notification_runtime_outbox/)
  assert.match(migration, /source_type in \('plan_action', 'runtime_event'\)/)
  assert.match(migration, /H4 source application receipt is missing/)
  assert.match(migration, /H4 recipient is not an active member of the exact firm/)
  assert.match(migration, /H4 recipient role is not eligible for this signal/)
  assert.match(migration, /legalTruth',false,'humanReviewRequired',true/)
  assert.match(migration, /v_row\.source_type = 'plan_action'/)
  assert.match(migration, /v_row\.source_type = 'runtime_event'/)
  assert.match(migration, /for update skip locked/)
  assert.match(migration, /recipient_user_id.*status = 'active'/s)
  assert.match(migration, /grant execute on function public\.bridge_dispatch_conveyancer_notifications\(integer, timestamptz\) to service_role/)
  assert.doesNotMatch(migration, /grant (insert|update|delete).*conveyancer_notification_outbox.*authenticated/i)
})

test('the cockpit executes matter commands through the H4 application wrapper', () => {
  assert.match(cockpit, /conveyancerNotificationRuntimeH4\.js/)
  assert.match(cockpit, /runConveyancerApplicationEventH4 as runConveyancerMatterEvent/)
  assert.doesNotMatch(cockpit, /\.from\([^)]*\)\.(insert|update|delete|upsert)/)
})

test('the global delivery worker requires service-role authority', () => {
  assert.match(worker, /jwtRole\(request\) !== "service_role"/)
  assert.match(worker, /Dispatcher authority required/)
  assert.match(worker, /bridge_dispatch_conveyancer_notifications/)
  assert.doesNotMatch(worker, /error:\s*serviceRoleKey/)
})

await Promise.all(pending)
console.log('H4 conveyancer notification runtime tests passed.')
