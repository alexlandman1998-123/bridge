import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { MATTER_PLAN_OWNER_ROLES, MATTER_PLAN_STATUSES } from '../../transactions/conveyancerMatterPlanContract.js'
import { generateConveyancerMatterPlan } from '../../../services/attorneyWorkflow/conveyancerMatterPlanGenerator.js'
import {
  CONVEYANCER_ORCHESTRATION_EVENT_TYPES,
  buildConveyancerOrchestrationControl,
} from '../conveyancerOrchestration.js'
import {
  CONVEYANCER_APPLICATION_H2_CONTROLS,
  CONVEYANCER_APPLICATION_H2_EVENT_TYPES as E,
  buildConveyancerApplicationProjection,
  loadConveyancerApplicationRuntime,
  orchestrateConveyancerApplicationEvent,
  persistConveyancerApplicationResult,
} from '../conveyancerApplicationOrchestratorH2.js'

const migration = readFileSync(new URL('../../../../../supabase/migrations/20260716160001_conveyancer_h2_application_runtime.sql', import.meta.url), 'utf8')
const cockpit = readFileSync(new URL('../../../components/attorney/cockpit/ConveyancerCockpit.jsx', import.meta.url), 'utf8')
const orgId = '10000000-0000-4000-8000-000000000001'
const firmId = '20000000-0000-4000-8000-000000000001'
const transactionId = '30000000-0000-4000-8000-000000000001'
const userId = '40000000-0000-4000-8000-000000000001'
const at = '2026-07-16T10:00:00.000Z'
const hash = 'a'.repeat(64)
const actor = { role: MATTER_PLAN_OWNER_ROLES.system, userId }
const pending = []

function test(name, fn) {
  try {
    const result = fn()
    if (result?.then) {
      pending.push(result.then(() => console.log(`ok - ${name}`)).catch((error) => { console.error(`not ok - ${name}`); throw error }))
      return
    }
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

function transaction(overrides = {}) {
  return {
    id: transactionId,
    organisation_id: orgId,
    finance_type: 'cash',
    transaction_type: 'private_sale',
    buyer_entity_type: 'individual',
    seller_entity_type: 'individual',
    seller_has_existing_bond: false,
    property_tenure: 'freehold',
    ...overrides,
  }
}

function activePlan() {
  const generated = generateConveyancerMatterPlan({ transaction: transaction(), generatedAt: '2026-07-16T08:00:00.000Z' })
  assert.equal(generated.valid, true, JSON.stringify(generated.errors))
  return { ...structuredClone(generated.plan), status: MATTER_PLAN_STATUSES.active, activatedAt: '2026-07-16T08:05:00.000Z' }
}

function context(overrides = {}) {
  return {
    control: buildConveyancerOrchestrationControl({
      organisationId: orgId,
      attorneyFirmId: firmId,
      mode: 'pilot',
      allowedEventTypes: Object.values(CONVEYANCER_ORCHESTRATION_EVENT_TYPES),
      pilotTransactionIds: [transactionId],
      killSwitchEnabled: false,
      reason: 'H2 guarded pilot',
    }),
    state: { currentPlan: activePlan(), events: {}, externalDependencies: {} },
    runtime: { exceptions: [], coordinations: [], evidence: [], financialModels: [] },
    ...overrides,
  }
}

function event(type, payload = {}, overrides = {}) {
  return {
    eventId: `event:${type}:1`,
    type,
    organisationId: orgId,
    attorneyFirmId: firmId,
    transactionId,
    sourceReference: `matter:${transactionId}:${type}:1`,
    occurredAt: at,
    payload,
    ...overrides,
  }
}

test('keeps plan and action events on the proven P2 boundary', () => {
  const result = orchestrateConveyancerApplicationEvent({ event: event(E.actionCommandRequested), context: context(), actor })
  assert.equal(result.ok, true)
  assert.equal(result.route, 'p2')
  assert.equal(result.persistenceEnvelope, null)
})

test('activates observed exceptions through a guarded immutable revision command', () => {
  const result = orchestrateConveyancerApplicationEvent({
    event: event(E.exceptionObserved, { observations: [{ signalKey: 'instruction.signed_transfer_instruction', state: 'missing', observedAt: '2026-07-16T09:00:00.000Z', detectedBy: actor }] }),
    context: context(),
    actor,
  })
  assert.equal(result.ok, true, JSON.stringify(result.errors))
  assert.equal(result.commands.length, 1)
  assert.equal(result.commands[0].kind, 'exception_revision')
  assert.equal(result.commands[0].exceptionCode, 'signed_transfer_instruction_missing')
  assert.match(result.commands[0].fingerprint, /^fnv1a_[a-f0-9]{8}$/)
  assert.equal(result.persistenceEnvelope.eventId, result.event.eventId)
})

test('supports manual evidence without a provider and never promotes it to legal truth', () => {
  const result = orchestrateConveyancerApplicationEvent({
    event: event(E.evidenceCaptured, { evidence: { evidenceType: 'signed_instruction', sourceSystem: 'manual', contentHash: hash, observedAt: at, captureReference: 'manual-upload:1' } }),
    context: context(),
    actor,
  })
  assert.equal(result.ok, true, JSON.stringify(result.errors))
  assert.equal(result.commands[0].sourceSystem, 'manual')
  assert.equal(result.commands[0].payload.legalTruth, false)
  assert.equal(result.commands[0].payload.humanReviewRequired, true)
})

test('requires signed provenance for provider evidence and routes it to human review', () => {
  const missing = orchestrateConveyancerApplicationEvent({
    event: event(E.evidenceCaptured, { evidence: { evidenceType: 'bank_instruction', sourceSystem: 'integration', contentHash: hash, observedAt: at } }),
    context: context(), actor,
  })
  assert.equal(missing.ok, false)
  assert.ok(missing.errors.includes('provider_evidence_provenance_invalid'))
  const valid = orchestrateConveyancerApplicationEvent({
    event: event(E.evidenceCaptured, { evidence: { evidenceType: 'bank_instruction', sourceSystem: 'integration', contentHash: hash, observedAt: at, providerEventReference: 'bank:event:1', signatureVerified: true } }, { eventId: 'event:evidence:2' }),
    context: context(), actor,
  })
  assert.equal(valid.ok, true)
  assert.equal(valid.commands[0].evidenceStatus, 'under_review')
  assert.equal(valid.commands[0].payload.legalTruth, false)
})

test('persists financial snapshots as revisions and closeout only as reviewed evidence', () => {
  const financial = orchestrateConveyancerApplicationEvent({
    event: event(E.financialSnapshotRecorded, { financialModel: { contractVersion: 'conveyancer_financial_model_v1', fingerprint: 'model_12345678', status: 'approved', currency: 'zar', totals: { due: 1000 } } }),
    context: context(), actor,
  })
  assert.equal(financial.ok, true)
  assert.equal(financial.commands[0].kind, 'financial_model_revision')
  assert.equal(financial.commands[0].currency, 'ZAR')
  const closeout = orchestrateConveyancerApplicationEvent({
    event: event(E.closeoutAssessed, { assessment: { contentHash: hash, observedAt: at, outcome: 'ready_for_human_review' } }, { eventId: 'event:closeout:2' }),
    context: context(), actor,
  })
  assert.equal(closeout.ok, true)
  assert.equal(closeout.commands[0].kind, 'evidence_revision')
  assert.equal(closeout.commands[0].evidenceStatus, 'under_review')
  assert.equal(closeout.commands[0].evidenceType, 'matter_closeout_assessment')
})

test('fails closed for an unbound actor, a kill switch, and matters outside the pilot', () => {
  const noActor = orchestrateConveyancerApplicationEvent({ event: event(E.evidenceCaptured, { evidence: {} }), context: context(), actor: {} })
  assert.ok(noActor.errors.includes('application_actor_identity_invalid'))
  const killed = orchestrateConveyancerApplicationEvent({ event: event(E.evidenceCaptured), context: context({ control: { ...context().control, killSwitchEnabled: true } }), actor })
  assert.ok(killed.errors.includes('application_kill_switch_enabled'))
  const outside = orchestrateConveyancerApplicationEvent({ event: event(E.evidenceCaptured, {}, { transactionId: '30000000-0000-4000-8000-000000000099' }), context: context(), actor })
  assert.ok(outside.errors.includes('application_matter_outside_pilot'))
})

test('persists exactly once through the H2 RPC and reports an idempotent replay', async () => {
  const calls = []
  const client = { rpc: async (name, args) => { calls.push({ name, args }); return { data: { ok: true, duplicate: true, receiptId: 'receipt:1' }, error: null } } }
  const result = orchestrateConveyancerApplicationEvent({
    event: event(E.evidenceCaptured, { evidence: { evidenceType: 'manual_note', sourceSystem: 'manual', contentHash: hash, observedAt: at, captureReference: 'note:1' } }),
    context: context(), actor,
  })
  const persisted = await persistConveyancerApplicationResult(client, result)
  assert.deepEqual(calls.map((item) => item.name), ['bridge_apply_conveyancer_application_batch'])
  assert.equal(calls[0].args.payload.eventId, result.event.eventId)
  assert.equal(persisted.reason, 'idempotent_replay')
})

test('hydrates the four persisted runtime record families with tenant-scoped queries', async () => {
  const tables = []
  const client = {
    from(table) {
      tables.push(table)
      const chain = {
        select: () => chain,
        eq: () => chain,
        order: () => Promise.resolve({ data: [{ table }], error: null }),
      }
      return chain
    },
  }
  const runtime = await loadConveyancerApplicationRuntime(client, { organisationId: orgId, attorneyFirmId: firmId, transactionId })
  assert.deepEqual(tables.sort(), ['conveyancer_coordinations', 'conveyancer_evidence', 'conveyancer_exceptions', 'conveyancer_financial_models'])
  assert.equal(runtime.evidence[0].table, 'conveyancer_evidence')
})

test('keeps queues, timelines, and readiness as rebuildable projections', () => {
  const result = buildConveyancerApplicationProjection({ context: context(), actor: { role: MATTER_PLAN_OWNER_ROLES.firmManager, userId }, asOf: at })
  assert.equal(result.ok, true, JSON.stringify(result.projections.errors))
  assert.equal(result.persistedProjectionRecords, 0)
  assert.equal(result.externalProvidersRequired, false)
  assert.equal(CONVEYANCER_APPLICATION_H2_CONTROLS.directTableWritesAllowed, false)
})

test('migration enforces access, authority, pilot controls, idempotency, and immutable receipts', () => {
  assert.match(migration, /create table if not exists public\.conveyancer_application_receipts/)
  assert.match(migration, /unique \(attorney_firm_id, event_id\)/)
  assert.match(migration, /enable row level security/)
  assert.match(migration, /bridge_conveyancer_can_access_record/)
  assert.match(migration, /H2 firm authority required/)
  assert.match(migration, /H2 application writes are disabled/)
  assert.match(migration, /before update or delete/)
  assert.match(migration, /bridge_apply_conveyancer_application_batch/)
  for (const kind of ['exception_revision', 'coordination_revision', 'evidence_revision', 'financial_model_revision']) assert.match(migration, new RegExp(kind))
  assert.doesNotMatch(migration, /execute\s+format/i)
})

test('the live cockpit action path is wired through H2 while retaining the P2 API contract', () => {
  assert.match(cockpit, /conveyancerApplicationOrchestratorH2\.js/)
  assert.match(cockpit, /runConveyancerApplicationEventH4 as runConveyancerMatterEvent/)
  assert.match(cockpit, /loadConveyancerCockpitH3Context/)
})

await Promise.all(pending)
console.log('H2 conveyancer application orchestration tests passed.')
