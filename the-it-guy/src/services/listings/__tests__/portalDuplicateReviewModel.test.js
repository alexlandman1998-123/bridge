import assert from 'node:assert/strict'
import { findPortalDuplicateCandidates, scorePortalDuplicate } from '../portalDuplicateReviewModel.js'

const property24 = { id: 'p24', formattedAddress: '10 Main Road, Gardens, Cape Town', askingPrice: 2500000, propertyType: 'Apartment', property24Status: 'published' }
const privateProperty = { id: 'pp', formattedAddress: '10 Main Road, Gardens, Cape Town', askingPrice: 2500000, propertyType: 'Apartment', privatePropertyStatus: 'active' }

assert.equal(scorePortalDuplicate(property24, privateProperty).candidate, true)
assert.equal(findPortalDuplicateCandidates([property24, privateProperty]).length, 1)
assert.equal(scorePortalDuplicate(property24, { ...privateProperty, formattedAddress: '12 Main Road, Gardens, Cape Town' }).candidate, false)
console.log('Portal duplicate review model passed')
