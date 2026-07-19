import assert from 'node:assert/strict'
import { assessBuyerOfferEligibility } from '../src/lib/listingDataIntegrity.js'

const organisationId = 'org-1'
const listing = { id: 'listing-1', organisationId, askingPrice: 2_000_000 }
const buyer = {
  id: 'buyer-1', leadId: 'buyer-1', contactId: 'contact-1', organisationId,
  leadCategory: 'Buyer', email: 'buyer@example.test', stage: 'Qualified', budget: 1_500_000,
}

const eligible = assessBuyerOfferEligibility({ organisationId, listing, buyerLead: buyer })
assert.equal(eligible.eligible, true)
assert.ok(eligible.warnings.some((entry) => entry.code === 'buyer_not_linked_to_listing'))
assert.ok(eligible.warnings.some((entry) => entry.code === 'buyer_budget_below_listing'))

const wrongType = assessBuyerOfferEligibility({ organisationId, listing, buyerLead: { ...buyer, leadCategory: 'Seller' } })
assert.equal(wrongType.eligible, false)
assert.ok(wrongType.blockers.some((entry) => entry.code === 'buyer_type_invalid'))

const inactive = assessBuyerOfferEligibility({ organisationId, listing, buyerLead: { ...buyer, stage: 'Lost' } })
assert.equal(inactive.eligible, false)
assert.ok(inactive.blockers.some((entry) => entry.code === 'buyer_inactive'))
console.log('buyer-offer-eligibility: passed')
