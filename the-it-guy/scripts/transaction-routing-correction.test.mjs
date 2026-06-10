import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const apiSource = fs.readFileSync(path.join(root, 'src/lib/api.js'), 'utf8')
const pageSource = fs.readFileSync(path.join(root, 'src/pages/AttorneyTransactionDetail.jsx'), 'utf8')
const packageSource = fs.readFileSync(path.join(root, 'package.json'), 'utf8')

function assertHas(source, pattern, message) {
  assert.match(source, pattern, message)
}

assertHas(
  apiSource,
  /export async function saveTransactionRoutingProfile/,
  'Phase 5 should expose a routing correction API.',
)
assertHas(
  apiSource,
  /resolveTransactionRoutingProfile\(\{ transaction: nextTransaction \}\)/,
  'Routing correction should regenerate the routing profile from corrected facts.',
)
for (const column of [
  'finance_type',
  'transaction_type',
  'property_tenure',
  'seller_type',
  'seller_has_existing_bond',
  'cancellation_required',
  'vat_treatment',
  'routing_profile_version',
  'routing_profile_json',
]) {
  assertHas(apiSource, new RegExp(`\\b${column}\\b`), `Routing correction should persist ${column}.`)
}
assertHas(
  apiSource,
  /eventType: 'RoutingProfileUpdated'/,
  'Routing correction should record a routing update event.',
)
assertHas(
  apiSource,
  /reasonCode: 'routing_profile_updated'/,
  'Routing correction should trigger workflow recompute.',
)

assertHas(
  pageSource,
  /saveTransactionRoutingProfile/,
  'Attorney transaction page should call the routing correction API.',
)
assertHas(
  pageSource,
  /title="Edit Routing Profile"/,
  'Attorney transaction page should render the routing correction modal.',
)
for (const field of [
  'financeType',
  'transactionType',
  'propertyTenure',
  'sellerHasExistingBond',
  'cancellationRequired',
  'vatTreatment',
]) {
  assertHas(pageSource, new RegExp(`routingProfileDraft\\.${field}`), `Routing modal should expose ${field}.`)
}
assertHas(
  pageSource,
  /canEditRoutingProfile/,
  'Routing correction should be role-gated in the UI.',
)
assertHas(
  packageSource,
  /"test:transaction-routing-correction": "node scripts\/transaction-routing-correction\.test\.mjs"/,
  'Package scripts should expose the Phase 5 routing correction guard.',
)

console.log('transaction-routing-correction tests passed')
