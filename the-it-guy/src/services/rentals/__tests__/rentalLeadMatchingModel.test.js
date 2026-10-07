import assert from 'node:assert/strict'
import { buildRentalLeadListingMatches, scoreRentalLeadListingMatch } from '../rentalLeadMatchingModel.js'

const matches = buildRentalLeadListingMatches({ role: 'tenant', desiredArea: 'Sea Point', monthlyBudget: 18000, bedrooms: 2 }, [{ id: 'listing-1', listingCategory: 'rental', suburb: 'Sea Point', monthlyRent: 17500, bedrooms: 2 }])
assert.equal(matches[0].score, 100)
assert.equal(matches[0].recommendation, 'strong_match')
assert.deepEqual(buildRentalLeadListingMatches({ role: 'landlord' }, []), [])

const requirement = { role: 'tenant', desiredArea: 'Brooklyn, Newlands', monthlyBudget: 11000, bedrooms: 2 }
const canonical = { id: 'canonical', propertyAddress: 'Old suburb', bedrooms: 0, sellerCanonicalFacts: { propertyAddress: '12 Main Road, Newlands', propertyProfile: { bedrooms: 2 }, rentalInfo: { monthlyRent: 10000 } } }
assert.equal(scoreRentalLeadListingMatch(requirement, canonical).score, 100)
assert.equal(scoreRentalLeadListingMatch(requirement, { ...canonical, sellerCanonicalFacts: { propertyProfile: { bedrooms: 0 }, rentalInfo: { monthlyRent: 10000 } } }).bedroomMatch, false)
assert.equal(scoreRentalLeadListingMatch(requirement, { id: 'unknown' }).bedroomMatch, false)
assert.equal(scoreRentalLeadListingMatch(requirement, { id: 'unknown' }).budgetMatch, false)
assert.equal(scoreRentalLeadListingMatch(requirement, { monthlyRent: 12000 }).budgetMatch, true)
assert.equal(scoreRentalLeadListingMatch(requirement, { monthlyRent: 12000 }).budgetNearMatch, true)
for (const rent of [10000, 11000, 12000]) assert.equal(scoreRentalLeadListingMatch(requirement, { monthlyRent: rent }).budgetMatch, true)
for (const rent of [0, 9999, 12001, 12100]) assert.equal(scoreRentalLeadListingMatch(requirement, { monthlyRent: rent }).budgetMatch, false)
assert.equal(scoreRentalLeadListingMatch({ ...requirement, qualification: { monthlyBudget: 15000 } }, { monthlyRent: 16000 }).budgetMatch, true)

assert.equal(scoreRentalLeadListingMatch(requirement, { monthlyRent: 500, rentalPriceFrequency: 'daily' }).budgetMatch, false)

assert.notEqual(scoreRentalLeadListingMatch({ ...requirement, desiredArea: 'Newlands' }, { suburb: 'Newlands', monthlyRent: 10000 }).recommendation, 'strong_match')
console.log('Rental lead matching model tests passed.')
