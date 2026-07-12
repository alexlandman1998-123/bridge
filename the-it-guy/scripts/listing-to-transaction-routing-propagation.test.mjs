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

assert.match(
  transactionLifecycleSource,
  /const TRANSACTION_IDENTITY_SELECT = '[^']*assigned_agent_id[^']*assigned_branch_id/,
  'Transaction duplicate detection should retain agent and branch assignment context.',
)

assert.match(
  transactionLifecycleSource,
  /function resolveTransactionBranchId/,
  'Transaction lifecycle creation should resolve branch context from payload, listing, lead, offer, or actor.',
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
  'assigned_branch_id',
  'seller_contact_id',
]) {
  assert.match(transactionLifecycleSource, new RegExp(`${field}:`), `Transaction insert payload should persist ${field}.`)
}

assert.match(
  transactionLifecycleSource,
  /function removeRoutingProfileTransactionFields/,
  'Transaction lifecycle creation should keep schema-safe fallback when optional routing columns are unavailable.',
)

assert.match(
  transactionLifecycleSource,
  /delete fallback\.assigned_branch_id/,
  'Transaction insert fallback should strip branch assignment when older schemas lack optional hierarchy fields.',
)

assert.match(
  transactionLifecycleSource,
  /insertAgentParticipant\(\{[\s\S]*assignedAgentId: nextAssignedAgentId/,
  'Accepted offer conversion should still create the assigned-agent participant/roleplayer boundary.',
)

assert.match(
  buyerLifecycleSource,
  /conversionPayload\.routingProfile = resolveTransactionRoutingProfile/,
  'Accepted canonical offer conversion should precompute and pass the routing profile into transaction creation.',
)

assert.match(
  buyerLifecycleSource,
  /branchId: listing\?\.branchId/,
  'Accepted offer conversion should propagate listing branch context into transaction creation.',
)

assert.match(
  buyerLifecycleSource,
  /assignedBranchId: listing\?\.assignedBranchId/,
  'Accepted offer conversion should propagate assignment branch context into transaction creation.',
)

assert.match(
  buyerLifecycleSource,
  /sellerContactId: canonicalOffer\.sellerContactId/,
  'Accepted offer conversion should propagate seller contact context into transaction creation.',
)

assert.match(
  buyerLifecycleSource,
  /originatingSellerLeadId: canonicalOffer\.sellerLeadId/,
  'Accepted offer conversion should keep seller lead provenance available to transaction/runtime rows.',
)

assert.match(
  buyerLifecycleSource,
  /function mapListingDbRow[\s\S]*branchId: row\.branch_id[\s\S]*sellerLeadId: row\.seller_lead_id[\s\S]*mandatePacketId: row\.mandate_packet_id/,
  'Canonical offer listing mapper should retain branch, seller lead, and mandate context for transaction conversion.',
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
