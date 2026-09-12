import test from 'node:test'
import assert from 'node:assert/strict'
import { buildMatterWorkflowPlan } from '../attorneyWorkflow/matterWorkflowPlanService.js'
import { evaluateTransferTaxLodgementReadiness } from '../attorneyWorkflow/transferTaxLodgementGate.js'
import { fetchSharedMatterJourney, fetchSellerSharedMatterJourney, sharedJourneyHeaderPhases, sharedJourneyAudienceForRole } from '../sharedMatterJourneyReader.js'

test('freehold clearance is excluded only for an explicitly absent HOA', () => {
  for (const [hoaApplicable, expected] of [['yes', true], ['unknown', true], [undefined, true], ['no', false]]) {
    const plan = buildMatterWorkflowPlan({ routingProfile: { propertyTenure: 'freehold', hoaApplicable } })
    assert.equal(plan.lanes[0].stepKeys.includes('levy_hoa_clearance_review'), expected)
  }
})

test('every non-duty route needs the final receipt, and reopening removes readiness', () => {
  for (const route of ['vat', 'zero_rated_going_concern', 'exempt']) {
    for (const status of ['not_started', 'completed', 'in_progress', 'not_applicable']) {
      const result = evaluateTransferTaxLodgementReadiness({
        transferTaxDecision: { route, status: 'confirmed' },
        steps: [{ stepKey: 'vat_exemption_evidence_verified', status: 'completed' },
          { stepKey: 'sars_transfer_tax_receipt_verified', status }],
      })
      assert.equal(result.ready, status === 'completed')
    }
  }
})

// Match the deployed RPC shape, including the older portal projection that
// supplies only label. Do not manufacture a buildSharedMatterJourney output.
const payload = status => ({ schemaVersion: 1, transactionId: 'baseline', revision: 2, planRevision: 2,
  lanes: [{ key: 'transfer', phases: [{ key: 'financial_preparation', label: 'Financial preparation',
    clientLabel: 'Financial preparation', tasks: [{ key: 'task_1', label: 'Transfer tax clearance', status, revision: 2 }] }] }] })

test('professional journey recovers from one transient failure with a fresh response', async () => {
  for (const audience of ['attorney', 'developer', 'agent']) {
    let calls = 0
    const result = await fetchSharedMatterJourney({rpc: async () => ++calls === 1
      ? {error:{code:'57014',message:'statement timeout'}} : {data:payload('completed')}}, 'baseline', {audience})
    assert.equal(calls, 2)
    assert.equal(result.status, 'ready')
    assert.equal(result.snapshot.legalProgress.percent, 100)
  }
})

test('buyer and seller RPC responses load, and a new read reflects completion and reopening', async () => {
  let status = 'not_started'
  const calls = []
  const client = { rpc: async name => { calls.push(name); return { data: payload(status), error: null } } }
  for (const next of ['not_started', 'completed', 'in_progress']) {
    status = next
    const buyer = await fetchSharedMatterJourney(client, 'baseline')
    const seller = await fetchSellerSharedMatterJourney(client, 'test-token', 'test-session')
    assert.equal(buyer.status, 'ready')
    assert.equal(seller.status, 'ready')
    assert.equal(buyer.snapshot.legalProgress.percent, next === 'completed' ? 100 : 0)
    assert.deepEqual(buyer.snapshot.legalProgress, seller.snapshot.legalProgress)
    assert.equal(sharedJourneyHeaderPhases(buyer, 'transfer')[0].status, next)
  }
  assert.ok(calls.includes('bridge_read_shared_matter_journey'))
  assert.ok(calls.includes('bridge_read_seller_shared_matter_journey'))
})

test('wrong matter and permission failures never become an empty successful journey', async () => {
  for (const response of [{ data: payload('completed'), error: null }, { data: null, error: { code: '42501' } }]) {
    const result = await fetchSharedMatterJourney({ rpc: async () => response }, 'different-matter')
    assert.equal(result.status, 'unavailable')
    assert.equal(result.snapshot, null)
  }
})

test('redacted task keys may repeat across phases without rejecting the journey', async () => {
  const data = payload('completed')
  data.lanes[0].phases.push({ ...data.lanes[0].phases[0], key: 'registration' })
  const result = await fetchSharedMatterJourney({ rpc: async () => ({ data }) }, 'baseline')
  assert.equal(result.status, 'ready')
  assert.equal(result.snapshot.legalProgress.completedCount, 2)
  assert.notEqual(result.snapshot.lanes[0].phases[0].tasks[0].id, result.snapshot.lanes[0].phases[1].tasks[0].id)
})

test('workspace audience selects professional RPC without broadening client roles', async () => {
  for (const [role, expected] of [['attorney','attorney'],['bond_attorney','attorney'],['developer','developer'],['agent','agent'],['buyer','buyer'],['seller','seller'],['unknown','buyer']]) {
    assert.equal(sharedJourneyAudienceForRole(role), expected)
    let called
    await fetchSharedMatterJourney({ rpc: async name => { called = name; return { data: payload('completed') } } }, 'baseline', { audience: sharedJourneyAudienceForRole(role) })
    assert.equal(called, ['attorney','agent','developer'].includes(expected) ? 'bridge_read_professional_matter_journey' : 'bridge_read_shared_matter_journey')
  }
})
