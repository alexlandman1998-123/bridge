import assert from 'node:assert/strict'
import { buildBuyerMatchLocationOptions, filterAutomaticBuyerMatches, matchesBuyerLocation, readBuyerMatchLocation, resolveBuyerMatchLocationDefaults } from '../buyerMatchLocationModel.js'
const listings = [
  { city: 'Pretoria', suburb: 'Faerie Glen', province: 'Gauteng' },
  { sourceListing: { city: 'Pretoria', suburb: 'Garsfontein', province: 'Gauteng' } },
  { city: 'Johannesburg', suburb: 'Rosebank', province: 'Gauteng' },
  { city: 'Cape Town', suburb: 'Claremont' },
  { city: 'pretoria', suburb: 'faerie glen' },
  { title: 'Pretoria bargain', address: 'Faerie Glen, Pretoria' },
]
assert.deepEqual(buildBuyerMatchLocationOptions(listings).cities, ['Cape Town', 'Johannesburg', 'Pretoria'])
assert.deepEqual(buildBuyerMatchLocationOptions(listings, 'PRETORIA').suburbs, ['Faerie Glen', 'Garsfontein'])
assert.equal(matchesBuyerLocation(listings[0], { city: ' Pretoria ', suburbs: [] }), true)
assert.equal(matchesBuyerLocation(listings[0], { city: 'Johannesburg', suburbs: ['Faerie Glen'] }), false)
assert.equal(matchesBuyerLocation(listings[0], { city: 'Pretoria', suburbs: ['Garsfontein'] }), false)
assert.equal(matchesBuyerLocation(listings[0], { city: 'Pretoria', suburbs: ['Garsfontein', 'Faerie Glen'] }), true)
assert.equal(matchesBuyerLocation({ city: 'Pretoria', suburb: 'Faerie Glen North' }, { suburbs: ['Faerie Glen'] }), false)
assert.equal(matchesBuyerLocation(readBuyerMatchLocation(listings[5]), { city: 'Pretoria', suburbs: ['Faerie Glen'] }), false)
assert.deepEqual(readBuyerMatchLocation({ sourceAuthority: 'lead_projection', city: 'Pretoria', suburb: 'Faerie Glen' }), { city: '', suburb: '', province: '' })
assert.deepEqual(readBuyerMatchLocation({ sourceListing: { sellerOnboarding: { formData: { propertyCity: 'Pretoria', propertySuburb: 'Faerie Glen' } } } }), { city: 'Pretoria', suburb: 'Faerie Glen', province: '' })
const defaults = preferredAreas => resolveBuyerMatchLocationDefaults({ preferredAreas, enquiryListing: listings[0], listings })
assert.deepEqual(defaults(''), { city: 'Pretoria', suburbs: ['Faerie Glen'] })
assert.deepEqual(defaults('Johannesburg'), { city: 'Johannesburg', suburbs: [] })
assert.deepEqual(defaults('Rosebank'), { city: 'Johannesburg', suburbs: ['Rosebank'] })
assert.deepEqual(defaults('Faerie Glen; Garsfontein'), { city: 'Pretoria', suburbs: ['Faerie Glen', 'Garsfontein'] })
assert.deepEqual(defaults('Faerie Glen, Pretoria, Gauteng, South Africa'), { city: 'Pretoria', suburbs: ['Faerie Glen'] })
assert.deepEqual(defaults('Unknown suburb'), { city: '', suburbs: ['Unknown suburb'] })
assert.deepEqual(resolveBuyerMatchLocationDefaults({}), { city: '', suburbs: [] })
assert.equal(listings.slice(0, 4).map(readBuyerMatchLocation).filter(row => matchesBuyerLocation(row, { city: 'Pretoria', suburbs: [] })).length, 2)
const recommendations = listings.slice(0, 4).map(readBuyerMatchLocation)
assert.deepEqual(filterAutomaticBuyerMatches(recommendations, {}), [])
assert.deepEqual(filterAutomaticBuyerMatches(recommendations, defaults('Rosebank')), [{ city: 'Johannesburg', suburb: 'Rosebank', province: 'Gauteng' }])
assert.equal(filterAutomaticBuyerMatches(recommendations, defaults('')).length, 1)
assert.equal(filterAutomaticBuyerMatches(recommendations, defaults('Faerie Glen; Garsfontein')).length, 2)
assert.equal(filterAutomaticBuyerMatches(recommendations, defaults('Unknown suburb')).length, 0)
assert.equal(filterAutomaticBuyerMatches([readBuyerMatchLocation(listings[5])], defaults('')).length, 0)
console.log('Buyer match location tests passed')
