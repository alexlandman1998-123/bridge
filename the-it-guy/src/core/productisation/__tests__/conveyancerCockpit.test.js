import assert from 'node:assert/strict'
import {
  CONVEYANCER_ORCHESTRATION_EVENT_TYPES as E,
  buildConveyancerOrchestrationControl,
  orchestrateConveyancerMatterEvent,
} from '../conveyancerOrchestration.js'
import { buildConveyancerCockpit, CONVEYANCER_COCKPIT_GROUPS } from '../conveyancerCockpit.js'

const orgId = '10000000-0000-4000-8000-000000000001'
const firmId = '20000000-0000-4000-8000-000000000001'
const transactionId = '30000000-0000-4000-8000-000000000001'
const at = '2026-07-16T10:00:00.000Z'
const actor = { role: 'firm_manager', userId: '40000000-0000-4000-8000-000000000001' }

function control(overrides = {}) {
  return buildConveyancerOrchestrationControl({
    organisationId: orgId,
    attorneyFirmId: firmId,
    mode: 'pilot',
    allowedEventTypes: Object.values(E),
    pilotTransactionIds: [transactionId],
    killSwitchEnabled: false,
    reason: 'P3 cockpit assurance',
    ...overrides,
  })
}

function activePlan() {
  const result = orchestrateConveyancerMatterEvent({
    control: control(),
    actor,
    event: {
      eventId: 'p3:instruction:1',
      type: E.instructionAccepted,
      organisationId: orgId,
      attorneyFirmId: firmId,
      transactionId,
      sourceReference: 'accepted_instruction:p3:1',
      occurredAt: at,
      payload: {
        transaction: {
          id: transactionId,
          organisation_id: orgId,
          finance_type: 'cash',
          transaction_type: 'private_sale',
          buyer_entity_type: 'individual',
          seller_entity_type: 'individual',
          seller_has_existing_bond: false,
          property_tenure: 'freehold',
        },
      },
    },
  })
  assert.equal(result.ok, true, JSON.stringify(result.errors))
  return result.nextPlan
}

function context(overrides = {}) {
  return {
    control: control(),
    state: {
      currentPlan: activePlan(),
      currentPlanDatabaseId: '50000000-0000-4000-8000-000000000001',
      planRecordId: '60000000-0000-4000-8000-000000000001',
      planRecordRevision: 3,
      actionEvents: [],
      orchestrationReceipts: [],
      ...overrides,
    },
  }
}

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

test('fails safely into the established workflow while orchestration is paused', () => {
  const cockpit = buildConveyancerCockpit({
    context: { control: control({ killSwitchEnabled: true }), state: {} },
    actor,
    asOf: at,
  })
  assert.equal(cockpit.status, 'paused')
  assert.equal(cockpit.ready, false)
  assert.equal(cockpit.primaryAction, null)
  assert.match(cockpit.notices.join(' '), /manual/i)
})

test('explains that an accepted instruction is required before showing a queue', () => {
  const cockpit = buildConveyancerCockpit({ context: { control: control(), state: {} }, actor, asOf: at })
  assert.equal(cockpit.status, 'awaiting_instruction')
  assert.equal(cockpit.groups.length, 0)
  assert.match(cockpit.health.summary, /signed instruction/i)
})

test('turns the deterministic plan into one prioritised, grouped action queue', () => {
  const cockpit = buildConveyancerCockpit({ context: context(), actor, asOf: at })
  assert.equal(cockpit.status, 'ready', JSON.stringify(cockpit.errors))
  assert.ok(cockpit.queue.items.length > 0)
  assert.ok(cockpit.primaryAction)
  assert.deepEqual(cockpit.groups.map((group) => group.key), CONVEYANCER_COCKPIT_GROUPS.filter((definition) => cockpit.queue.items.some((item) => item.bucket === definition.key)).map((definition) => definition.key))
  assert.equal(cockpit.queue.items.every((item) => item.intent?.type), true)
  assert.equal(cockpit.provenance.planRevision, 3)
  assert.match(cockpit.notices.join(' '), /optional/i)
})

test('routes evidence gaps to documents instead of pretending work is complete', () => {
  const cockpit = buildConveyancerCockpit({ context: context(), actor, asOf: at })
  const evidenceGap = cockpit.queue.items.find((item) => item.evidence?.missing?.length)
  assert.ok(evidenceGap, 'fixture should contain at least one evidence gap')
  assert.equal(evidenceGap.intent.type, 'open_documents')
  assert.match(evidenceGap.intent.label, /add evidence/i)
})

test('requires a human reason to resume waiting or blocked work', () => {
  const plan = JSON.parse(JSON.stringify(activePlan()))
  const candidate = plan.actions.find((item) => item.key === 'open_matter')
  candidate.state = 'waiting'
  candidate.waitingOn = 'Seller FICA documents'
  const cockpit = buildConveyancerCockpit({ context: context({ currentPlan: plan }), actor, asOf: at })
  const waiting = cockpit.queue.items.find((item) => item.actionKey === candidate.key)
  assert.equal(waiting.bucket, 'waiting')
  assert.deepEqual(waiting.intent, { type: 'resume', label: 'Resume work', requiresReason: true })
})

test('surfaces fact and external evidence changes as review prompts with provenance', () => {
  const receipts = [
    { id: 'receipt:1', event_type: E.factsChanged, occurred_at: '2026-07-16T11:00:00.000Z', command_results: [] },
    { id: 'receipt:2', event_type: E.externalEvidenceReceived, occurred_at: '2026-07-16T10:30:00.000Z', command_results: [] },
    { id: 'receipt:3', event_type: E.actionCommandRequested, occurred_at: '2026-07-16T10:15:00.000Z', command_results: [{ ok: true }] },
  ]
  const cockpit = buildConveyancerCockpit({ context: context({ orchestrationReceipts: receipts }), actor, asOf: at })
  assert.equal(cockpit.reviewPrompts.length, 2)
  assert.equal(cockpit.provenance.latestReceipt.id, 'receipt:1')
  assert.match(cockpit.reviewPrompts[0].label, /rerouting/i)
})

console.log('P3 conveyancer cockpit view-model tests passed.')
