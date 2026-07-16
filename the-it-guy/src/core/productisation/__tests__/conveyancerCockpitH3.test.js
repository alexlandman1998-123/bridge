import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { MATTER_PLAN_STATUSES } from '../../transactions/conveyancerMatterPlanContract.js'
import { generateConveyancerMatterPlan } from '../../../services/attorneyWorkflow/conveyancerMatterPlanGenerator.js'
import { buildConveyancerOrchestrationControl, CONVEYANCER_ORCHESTRATION_EVENT_TYPES } from '../conveyancerOrchestration.js'
import {
  CONVEYANCER_COCKPIT_H3_CONTROLS,
  buildConveyancerCockpitH3,
  loadConveyancerCockpitH3Context,
  summarizeConveyancerCockpitRuntime,
} from '../conveyancerCockpitH3.js'

const cockpitSource = readFileSync(new URL('../../../components/attorney/cockpit/ConveyancerCockpit.jsx', import.meta.url), 'utf8')
const h3Source = readFileSync(new URL('../conveyancerCockpitH3.js', import.meta.url), 'utf8')
const orgId = '10000000-0000-4000-8000-000000000001'
const firmId = '20000000-0000-4000-8000-000000000001'
const transactionId = '30000000-0000-4000-8000-000000000001'
const userId = '40000000-0000-4000-8000-000000000001'
const at = '2026-07-16T10:00:00.000Z'
const actor = { role: 'firm_manager', userId }
const pending = []

function test(name, fn) {
  try {
    const result = fn()
    if (result?.then) { pending.push(result.then(() => console.log(`ok - ${name}`)).catch((error) => { console.error(`not ok - ${name}`); throw error })); return }
    console.log(`ok - ${name}`)
  } catch (error) { console.error(`not ok - ${name}`); throw error }
}

function activePlan() {
  const generated = generateConveyancerMatterPlan({
    transaction: { id: transactionId, organisation_id: orgId, finance_type: 'cash', transaction_type: 'private_sale', buyer_entity_type: 'individual', seller_entity_type: 'individual', seller_has_existing_bond: false, property_tenure: 'freehold' },
    generatedAt: '2026-07-16T08:00:00.000Z',
  })
  assert.equal(generated.valid, true, JSON.stringify(generated.errors))
  return { ...structuredClone(generated.plan), status: MATTER_PLAN_STATUSES.active, activatedAt: '2026-07-16T08:05:00.000Z' }
}

function context(overrides = {}) {
  return {
    control: buildConveyancerOrchestrationControl({ organisationId: orgId, attorneyFirmId: firmId, mode: 'pilot', allowedEventTypes: Object.values(CONVEYANCER_ORCHESTRATION_EVENT_TYPES), pilotTransactionIds: [transactionId], killSwitchEnabled: false, reason: 'H3 pilot' }),
    state: { currentPlan: activePlan(), planRecordRevision: 2, orchestrationReceipts: [] },
    runtime: { exceptions: [], coordinations: [], evidence: [], financialModels: [] },
    runtimeAvailability: { available: true, reason: 'loaded' },
    ...overrides,
  }
}

test('defaults to one attention queue and leaves waiting work available through a filter', () => {
  const result = buildConveyancerCockpitH3({ context: context(), actor, asOf: at })
  assert.equal(result.status, 'ready', JSON.stringify(result.errors))
  assert.equal(result.workspace.selectedFilter, 'attention')
  assert.equal(result.workspace.items.every((item) => ['review', 'do_now', 'blocked'].includes(item.bucket)), true)
  const all = buildConveyancerCockpitH3({ context: context(), actor, asOf: at, filter: 'all' })
  assert.equal(all.workspace.items.length, all.queue.items.length)
  assert.ok(all.workspace.filters.find((item) => item.key === 'waiting').count >= 0)
})

test('supports role-owned work, decision, blocker and later filters without persisting views', () => {
  const source = context()
  const mine = buildConveyancerCockpitH3({ context: source, actor, asOf: at, filter: 'mine' })
  assert.equal(mine.workspace.items.every((item) => item.owner?.role === actor.role || item.owner?.userId === actor.userId), true)
  const decisions = buildConveyancerCockpitH3({ context: source, actor, asOf: at, filter: 'decisions' })
  assert.equal(decisions.workspace.items.every((item) => item.bucket === 'review'), true)
  assert.equal(CONVEYANCER_COCKPIT_H3_CONTROLS.filtersPersisted, false)
  assert.equal(CONVEYANCER_COCKPIT_H3_CONTROLS.queuePersisted, false)
})

test('searches task, owner, blocker and missing-evidence language and explains an empty result', () => {
  const all = buildConveyancerCockpitH3({ context: context(), actor, asOf: at, filter: 'all' })
  const candidate = all.workspace.items[0]
  const searched = buildConveyancerCockpitH3({ context: context(), actor, asOf: at, filter: 'all', search: candidate.label })
  assert.ok(searched.workspace.items.some((item) => item.actionKey === candidate.actionKey))
  const empty = buildConveyancerCockpitH3({ context: context(), actor, asOf: at, filter: 'all', search: 'definitely-no-such-conveyancing-task' })
  assert.equal(empty.workspace.empty, true)
  assert.match(empty.workspace.emptyMessage, /clear the search/i)
})

test('deduplicates immutable revisions before surfacing runtime attention', () => {
  const runtime = summarizeConveyancerCockpitRuntime({
    exceptions: [
      { id: 'exception-rev-1', record_id: 'exception-record-1', revision: 1, status: 'open', exception_code: 'fica_missing' },
      { id: 'exception-rev-2', record_id: 'exception-record-1', revision: 2, status: 'resolved', exception_code: 'fica_missing' },
      { id: 'exception-rev-3', record_id: 'exception-record-2', revision: 1, status: 'open', exception_code: 'instruction_missing' },
    ],
    coordinations: [{ id: 'coordination-1', record_id: 'coordination-record-1', revision: 1, coordination_status: 'action_required' }],
    evidence: [{ id: 'evidence-1', record_id: 'evidence-record-1', revision: 1, evidence_status: 'under_review', evidence_type: 'bank_instruction' }],
    financialModels: [{ id: 'financial-1', record_id: 'financial-record-1', revision: 1, model_status: 'reconciliation_required' }],
  })
  assert.deepEqual(runtime.counts, { exceptions: 1, coordination: 1, evidenceReview: 1, financial: 1, totalAttention: 4 })
  assert.equal(runtime.notices.some((item) => item.label === 'Fica missing'), false)
  assert.equal(runtime.notices.find((item) => item.type === 'financial').target, 'finance')
})

test('keeps provider-independent runtime records visible without treating them as legal truth', () => {
  const source = context({
    runtime: { exceptions: [], coordinations: [], evidence: [{ id: 'evidence-1', record_id: 'evidence-1', revision: 1, evidence_status: 'under_review', evidence_type: 'manual_signed_instruction', source_system: 'manual', payload: { legalTruth: false } }], financialModels: [] },
  })
  const result = buildConveyancerCockpitH3({ context: source, actor, asOf: at })
  assert.equal(result.runtime.counts.evidenceReview, 1)
  assert.equal(source.runtime.evidence[0].payload.legalTruth, false)
  assert.equal(CONVEYANCER_COCKPIT_H3_CONTROLS.externalProvidersRequired, false)
  assert.equal(CONVEYANCER_COCKPIT_H3_CONTROLS.directTableWritesAllowed, false)
})

test('falls back safely when H2 runtime tables are not installed yet', async () => {
  function responseFor(table) {
    if (['conveyancer_exceptions', 'conveyancer_coordinations', 'conveyancer_evidence', 'conveyancer_financial_models'].includes(table)) return { data: null, error: { code: 'PGRST205', message: `Could not find ${table}` } }
    if (table === 'conveyancer_orchestration_controls') return { data: [], error: null }
    return { data: [], error: null }
  }
  const client = {
    from(table) {
      const chain = {
        select: () => chain,
        eq: () => chain,
        order: () => chain,
        limit: () => chain,
        then: (resolve) => Promise.resolve(responseFor(table)).then(resolve),
      }
      return chain
    },
  }
  const loaded = await loadConveyancerCockpitH3Context(client, { organisationId: orgId, attorneyFirmId: firmId, transactionId })
  assert.equal(loaded.runtimeAvailability.available, false)
  assert.equal(loaded.runtimeAvailability.reason, 'h2_runtime_not_installed')
  assert.deepEqual(loaded.runtime.exceptions, [])
})

test('the UI exposes accessible search, filters, empty recovery and runtime review links', () => {
  assert.match(cockpitSource, /Single work queue/)
  assert.match(cockpitSource, /aria-label="Search matter work"/)
  assert.match(cockpitSource, /aria-pressed=/)
  assert.match(cockpitSource, /Show all open work/)
  assert.match(cockpitSource, /Matter records needing attention/)
  assert.match(cockpitSource, /overflow-x-auto/)
  assert.match(cockpitSource, /runConveyancerMatterEvent/)
  assert.doesNotMatch(cockpitSource, /\.from\([^)]*\)\.(insert|update|delete|upsert)/)
})

test('H3 hydrates H2 records and rebuilds the application projection instead of duplicating state', () => {
  assert.match(h3Source, /loadConveyancerApplicationRuntime/)
  assert.match(h3Source, /buildConveyancerApplicationProjection/)
  assert.match(h3Source, /queuePersisted: false/)
  assert.match(h3Source, /directTableWritesAllowed: false/)
})

await Promise.all(pending)
console.log('H3 conveyancer cockpit tests passed.')
