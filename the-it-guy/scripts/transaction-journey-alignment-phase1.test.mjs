import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const read = (path) => readFile(new URL(path, root), 'utf8')
const audit = JSON.parse(await read('docs/transaction-journey-alignment-phase1.json'))

const targetMilestoneKeys = ['otp_signed', 'finance', 'guarantees', 'transfer', 'lodgement', 'registration']
const requiredAudiences = [
  'agent',
  'buyer',
  'seller',
  'transfer_attorney',
  'bond_originator',
  'bond_attorney',
  'cancellation_attorney',
  'developer',
  'external_share',
]

test('freezes one six-milestone transaction journey vocabulary', () => {
  assert.equal(audit.schemaVersion, 1)
  assert.equal(audit.phase, 'phase_1_audit_and_stabilise')
  assert.equal(audit.canonicalAuthority.entryPoint, 'resolveTransactionRollup')
  assert.deepEqual(audit.targetMilestones.map((stage) => stage.key), targetMilestoneKeys)
  assert.deepEqual(audit.milestoneRules.map((stage) => stage.milestoneKey), targetMilestoneKeys)

  for (const rule of audit.milestoneRules) {
    assert.ok(rule.parentStages.length, `${rule.milestoneKey} must map at least one rollup parent stage`)
    assert.ok(rule.stepKeys.length, `${rule.milestoneKey} must map at least one direct workflow step`)
  }
})

test('inventories every audience and keeps the demo outside live workflow authority', async () => {
  const inventoriedAudiences = new Set(audit.surfaceInventory.flatMap((surface) => surface.audiences))
  for (const audience of requiredAudiences) {
    assert.ok(inventoriedAudiences.has(audience), `Missing journey surface for ${audience}`)
  }

  for (const surface of audit.surfaceInventory) {
    assert.ok(surface.key)
    assert.ok(surface.sourcePath)
    assert.ok(surface.renderer)
    assert.ok(surface.stateBuilder)
    assert.ok(surface.currentAuthority)
    assert.ok(surface.targetAuthority)
    assert.ok(surface.gap)
    await access(new URL(surface.sourcePath, root))
  }

  const demo = audit.surfaceInventory.find((surface) => surface.key === 'buyer_demo_reference')
  assert.equal(demo.currentAuthority, 'static_demo_fixture')
  assert.notEqual(demo.targetAuthority, 'transaction_workflow_rollup')
})

test('defines executable semantic parity scenarios for the requested handoffs', () => {
  const requiredScenarios = [
    'bond_waiting_for_quotes',
    'guarantees_being_issued',
    'rates_clearance_requested',
    'simultaneous_lodgement_preparation',
    'lodged_at_deeds_office',
    'registration_confirmed',
    'cash_purchase_funds_verification',
    'blocked_otp_signature',
  ]
  assert.deepEqual(audit.parityScenarios.map((scenario) => scenario.key), requiredScenarios)

  for (const scenario of audit.parityScenarios) {
    assert.ok(targetMilestoneKeys.includes(scenario.milestone), `Unknown milestone for ${scenario.key}`)
    assert.ok(scenario.workflowItem, `Missing workflow item for ${scenario.key}`)
    assert.ok(scenario.ownerRole, `Missing owner role for ${scenario.key}`)
    assert.ok(scenario.externalSummary, `Missing audience-safe summary for ${scenario.key}`)
  }
})

test('records the current divergence without allowing it to masquerade as parity', async () => {
  const [agentSource, buyerSource, sellerSource, rollupSource] = await Promise.all([
    read('src/pages/AttorneyTransactionDetail.jsx'),
    read('src/core/clientJourney/clientJourney.utils.js'),
    read('src/components/client-portal/seller/TransactionStageWorkspace.jsx'),
    read('server/services/transactionWorkflowRollup.js'),
  ])

  assert.match(agentSource, /function buildAgentJourneyStages/)
  assert.match(agentSource, /function getAgentJourneyStageIndex/)
  assert.match(buyerSource, /function buildBuyerTemplate/)
  assert.match(sellerSource, /SELLER_TRANSACTION_STAGE_ORDER/)
  assert.match(rollupSource, /activeWorkflowKey:/)
  assert.match(rollupSource, /activeStepKey:/)
})

test('keeps the agent transaction shell visible while secondary data hydrates', async () => {
  const source = await read('src/pages/AttorneyTransactionDetail.jsx')

  assert.match(source, /const foregroundLoadTransactionRef = useRef\(''\)/)
  assert.match(source, /foregroundLoadTransactionRef\.current === transactionId/)
  assert.match(source, /const \w+ = await fetchTransactionCoreById\(transactionId\)/)
  assert.match(source, /if \(!background\) \{\s*setLoading\(false\)\s*\}/)
  assert.match(source, /finally \{[\s\S]*?setHydratingDetail\(false\)[\s\S]*?setLoading\(false\)/)
})
