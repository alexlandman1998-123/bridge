import assert from 'node:assert/strict'
import { buildSyndicationChannelPreflight } from '../server/services/syndicationChannelPreflightService.js'
import { shouldRequireSyndicationReview } from '../src/services/syndicationReviewGateService.js'

const env = {
  ARCH9_SYNDICATION_REVIEW_ENABLED: 'true',
  ARCH9_SYNDICATION_REVIEW_ORGANISATION_IDS: 'pilot-agency',
  ARCH9_SYNDICATION_REVIEW_PILOT_CHANNELS: 'private-property',
  ARCH9_SYNDICATION_REVIEW_PILOT_CATEGORIES: 'residential',
}

const residentialReview = buildSyndicationChannelPreflight({
  listing: { id: 'house-1', property_type: 'House', asking_price: 1200000 },
  publication: { title: 'Pilot house', description: 'A complete pilot description.', bedrooms: 3, bathrooms: 2 },
  organisationId: 'pilot-agency',
  env,
})
assert.equal(residentialReview.rollout.listingCategory, 'residential')
assert.equal(residentialReview.rollout.listingCategoryEnabled, true)
assert.equal(shouldRequireSyndicationReview({ review: residentialReview, channel: 'privateProperty' }), true)
assert.equal(shouldRequireSyndicationReview({ review: residentialReview, channel: 'property24' }), false)

const farmReview = buildSyndicationChannelPreflight({
  listing: { id: 'farm-1', property_type: 'Farm', asking_price: 1200000, propertyDetails: { propertySubtype: 'Smallholding' } },
  publication: { title: 'Pilot farm', description: 'A complete pilot description.', bedrooms: 3, bathrooms: 2 },
  organisationId: 'pilot-agency',
  env,
})
assert.equal(farmReview.rollout.listingCategory, 'farm')
assert.equal(farmReview.rollout.listingCategoryEnabled, false)
assert.equal(shouldRequireSyndicationReview({ review: farmReview, channel: 'privateProperty' }), false)

console.log('Syndication review category pilot phase 8 contract passed')
