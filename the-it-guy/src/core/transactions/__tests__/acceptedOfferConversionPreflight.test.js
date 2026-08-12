import assert from 'node:assert/strict'
import {
  buildAcceptedOfferConversionPreflight,
  formatAcceptedOfferConversionPreflightMessage,
} from '../acceptedOfferConversionPreflight.js'

const ready = buildAcceptedOfferConversionPreflight({
  organisationId: 'org-1',
  offer: {
    id: 'offer-1',
    status: 'accepted',
    listingId: 'listing-1',
    buyerLeadId: 'lead-1',
    offerAmount: 2_450_000,
    agentId: 'agent-1',
  },
  routingProfile: {
    transactionType: 'private_sale',
    financeType: 'bond',
    propertyTenure: 'freehold',
    buyerEntityType: 'individual',
    sellerEntityType: 'individual',
  },
})

assert.equal(ready.status, 'ready')
assert.equal(ready.canConvert, true)
assert.equal(ready.summary.blockerCount, 0)

const missingRoutingFacts = buildAcceptedOfferConversionPreflight({
  organisationId: 'org-1',
  offer: {
    id: 'offer-2',
    status: 'accepted',
    listingId: 'listing-2',
    buyerLeadId: 'lead-2',
    offerAmount: 1_850_000,
    agentId: 'agent-2',
  },
  routingProfile: {
    transactionType: 'private_sale',
    financeType: 'bond',
    propertyTenure: 'unknown',
    buyerEntityType: 'individual',
    sellerEntityType: 'unknown',
  },
})

assert.equal(missingRoutingFacts.status, 'blocked')
assert.equal(missingRoutingFacts.canConvert, false)
assert.deepEqual(
  missingRoutingFacts.blockers.map((item) => item.key),
  ['routing_propertyTenure', 'routing_sellerEntityType'],
)
assert.match(formatAcceptedOfferConversionPreflightMessage(missingRoutingFacts), /Property tenure/i)

const relaxedMissingRoutingFacts = buildAcceptedOfferConversionPreflight({
  organisationId: 'org-1',
  offer: {
    id: 'offer-2',
    status: 'accepted',
    listingId: 'listing-2',
    buyerLeadId: 'lead-2',
    offerAmount: 1_850_000,
    agentId: 'agent-2',
  },
  routingProfile: {
    transactionType: 'private_sale',
    financeType: 'unknown',
    propertyTenure: 'unknown',
    buyerEntityType: '',
    sellerEntityType: 'unknown',
  },
  allowIncompleteRoutingFacts: true,
})

assert.equal(relaxedMissingRoutingFacts.status, 'ready')
assert.equal(relaxedMissingRoutingFacts.canConvert, true)
assert.deepEqual(
  relaxedMissingRoutingFacts.checks
    .filter((item) => item.status === 'warning')
    .map((item) => item.key),
  ['routing_financeType', 'routing_propertyTenure', 'routing_buyerEntityType', 'routing_sellerEntityType'],
)

const reusable = buildAcceptedOfferConversionPreflight({
  organisationId: 'org-1',
  offer: {
    id: 'offer-3',
    status: 'converted_to_transaction',
    transactionId: 'tx-3',
    listingId: 'listing-3',
    buyerLeadId: 'lead-3',
  },
})

assert.equal(reusable.status, 'reusable')
assert.equal(reusable.canConvert, true)
assert.equal(reusable.checks.some((item) => item.key === 'existing_transaction'), true)

console.log('accepted offer conversion preflight tests passed')
