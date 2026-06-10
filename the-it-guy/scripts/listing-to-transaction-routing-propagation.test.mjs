import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const transactionLifecycleSource = await readFile(new URL('../src/lib/transactionLifecycleService.js', import.meta.url), 'utf8')
const buyerLifecycleSource = await readFile(new URL('../src/lib/buyerLifecycleService.js', import.meta.url), 'utf8')
const packageJson = await readFile(new URL('../package.json', import.meta.url), 'utf8')

assert.match(
  transactionLifecycleSource,
  /import \{ resolveTransactionRoutingProfile \} from '\.\.\/services\/transactionRoutingProfileService\.js'/,
  'Transaction lifecycle creation should import the canonical routing profile service.',
)

assert.match(
  transactionLifecycleSource,
  /function resolveRoutingProfileForTransaction/,
  'Transaction lifecycle creation should resolve routing profile from listing, lead, offer, and payload context.',
)

for (const field of [
  'routing_profile_json',
  'routing_profile_version',
  'property_tenure',
  'seller_type',
  'seller_has_existing_bond',
  'existing_bond',
  'cancellation_required',
  'vat_treatment',
]) {
  assert.match(transactionLifecycleSource, new RegExp(`${field}:`), `Transaction insert payload should persist ${field}.`)
}

assert.match(
  transactionLifecycleSource,
  /function removeRoutingProfileTransactionFields/,
  'Transaction lifecycle creation should keep schema-safe fallback when optional routing columns are unavailable.',
)

assert.match(
  buyerLifecycleSource,
  /conversionPayload\.routingProfile = resolveTransactionRoutingProfile/,
  'Accepted canonical offer conversion should precompute and pass the routing profile into transaction creation.',
)

assert.match(
  buyerLifecycleSource,
  /sellerHasExistingBond: listing\?\.sellerHasExistingBond/,
  'Accepted offer conversion should propagate seller existing bond signals from the listing.',
)

assert.match(
  buyerLifecycleSource,
  /propertyTenure: listing\?\.propertyTenure/,
  'Accepted offer conversion should propagate property tenure signals from the listing.',
)

assert.match(
  packageJson,
  /"test:listing-to-transaction-routing-propagation": "node scripts\/listing-to-transaction-routing-propagation\.test\.mjs"/,
  'package.json should expose the listing-to-transaction routing propagation test.',
)

console.log('listing-to-transaction-routing-propagation tests passed')
