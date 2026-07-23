import assert from 'node:assert/strict'
import {
  buildLeadListingLinkPatch,
  getBuyerLeadOptions,
  isBuyerStyleLead,
  isLeadLinkedToListing,
  mapAgencyLeadSelectionRows,
} from '../src/lib/agencyLeadSelection.js'

const rows = mapAgencyLeadSelectionRows({
  leads: [null, undefined, { leadId: 'buyer-1', leadCategory: 'buyer', listingId: 'listing-1', firstName: 'Test', lastName: 'Buyer' }],
  contacts: [null, undefined],
})

assert.equal(rows.length, 1)
assert.equal(rows[0].id, 'buyer-1')
assert.equal(rows[0].name, 'Test Buyer')
assert.equal(isBuyerStyleLead(null), false)
assert.equal(isLeadLinkedToListing(null, { id: 'listing-1' }), false)
assert.equal(getBuyerLeadOptions([null, ...rows], { id: 'listing-1' }).length, 1)
assert.equal(getBuyerLeadOptions([null, ...rows], null).length, 1)
assert.deepEqual(buildLeadListingLinkPatch(null), {
  listingId: '',
  enquiredListingId: '',
  enquiredPropertyTitle: '',
  enquiredPropertyAddress: '',
  enquiredPropertyPrice: null,
})

console.log('agency-lead-selection-null-safety: passed')
