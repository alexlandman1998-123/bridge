import assert from 'node:assert/strict'
import { buildRentalLeadListingMatches } from '../rentalLeadMatchingModel.js'

const matches = buildRentalLeadListingMatches({ role: 'tenant', desiredArea: 'Sea Point', monthlyBudget: 18000, bedrooms: 2 }, [{ id: 'listing-1', listingCategory: 'rental', suburb: 'Sea Point', monthlyRent: 17500, bedrooms: 2 }])
assert.equal(matches[0].score, 100)
assert.equal(matches[0].recommendation, 'strong_match')
assert.deepEqual(buildRentalLeadListingMatches({ role: 'landlord' }, []), [])
console.log('Rental lead matching model tests passed.')
