import assert from 'node:assert/strict'
import { runMvpTransactionScenario } from '../src/core/transactions/mvpScenarioSimulation.js'

const jsonOutput = process.argv.includes('--json')
const report = []

const scenarios = [
  ['cash-individual', 'resale', 'cash', 'individual', 'individual'],
  ['bond-company', 'private_sale', 'bond', 'company', 'company'],
  ['hybrid-trust', 'resale', 'hybrid', 'trust', 'trust'],
  ['development-cash-company', 'development_sale', 'cash', 'company', 'developer'],
  ['cash-trust-seller-company', 'private_sale', 'cash', 'trust', 'company'],
  ['bond-individual-seller-trust', 'resale', 'bond', 'individual', 'trust'],
  ['hybrid-company-seller-individual', 'private_sale', 'hybrid', 'company', 'individual'],
]

for (const [id, transactionType, financeType, buyerEntityType, sellerEntityType] of scenarios) {
  const result = runMvpTransactionScenario({ id, transactionType, financeType, buyerEntityType, sellerEntityType, propertyTenure: 'sectional_title' })
  assert.equal(result.routingProfile.launchScope.supported, true, id)
  assert.equal(result.command.launchScope.supported, true, id)
  assert.ok(result.documents.requirements.length >= 4, id)
  assert.ok(result.workflow.lanes.some((lane) => lane.laneType === 'transfer'), id)
  if (financeType !== 'cash') assert.ok(result.workflow.lanes.some((lane) => lane.laneType === 'bond'), id)

  const replay = runMvpTransactionScenario({ id, transactionType, financeType, buyerEntityType, sellerEntityType, propertyTenure: 'sectional_title' })
  assert.equal(replay.command.idempotencyKey, result.command.idempotencyKey, `${id} replay key`)
  report.push({
    id,
    scope: result.routingProfile.launchScope.status,
    idempotencyKey: result.command.idempotencyKey,
    participantRequirements: result.participants.requirements.length,
    documentRequirements: result.documents.requirements.length,
    workflowLanes: result.workflow.lanes.map((lane) => lane.laneType),
    readiness: result.truth.readiness.status,
    replaySafe: replay.command.idempotencyKey === result.command.idempotencyKey,
  })
}

assert.throws(
  () => runMvpTransactionScenario({ id: 'unsupported', transactionType: 'commercial', financeType: 'cash', buyerEntityType: 'individual', sellerEntityType: 'individual', propertyTenure: 'freehold' }),
  (error) => error?.code === 'mvp_transaction_out_of_scope',
)

assert.throws(
  () => runMvpTransactionScenario({ id: 'incomplete', transactionType: 'resale', financeType: 'cash', buyerEntityType: 'individual', sellerEntityType: 'individual' }),
  (error) => error?.code === 'mvp_transaction_out_of_scope',
)
const output = {
  version: 'arch9_mvp_scenario_release_report_v1',
  passed: true,
  supportedScenarioCount: report.length,
  rejectedScenarioCount: 2,
  scenarios: report,
}

if (jsonOutput) console.log(JSON.stringify(output, null, 2))
else console.log(`MVP scenario simulation passed (${scenarios.length} supported scenarios, 2 rejection checks)`)
