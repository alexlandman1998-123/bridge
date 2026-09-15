import assert from 'node:assert/strict'
import {
  canAcknowledgeSyndicationChannel,
  isSyndicationReviewRolloutEnabled,
  shouldRequireSyndicationReview,
} from '../src/services/syndicationReviewGateService.js'
import { resolveSyndicationReviewRollout, SYNDICATION_REVIEW_ROLLOUT_ENV } from '../server/services/syndicationReviewRolloutService.js'

const rollout = resolveSyndicationReviewRollout({
  env: {
    [SYNDICATION_REVIEW_ROLLOUT_ENV.enabled]: 'true',
    [SYNDICATION_REVIEW_ROLLOUT_ENV.organisationIds]: 'pilot-agency',
    [SYNDICATION_REVIEW_ROLLOUT_ENV.pilotChannels]: 'Private Property',
    [SYNDICATION_REVIEW_ROLLOUT_ENV.pilotCategories]: 'residential',
  },
  organisationId: 'pilot-agency',
  listingCategory: 'House',
})
const review = {
  rollout,
  channels: {
    privateProperty: { dataReady: true },
    property24: { dataReady: true },
  },
}

assert.equal(rollout.enabled, true)
assert.deepEqual(rollout.pilotChannels, ['privateProperty'])
assert.deepEqual(rollout.pilotCategories, ['residential'])
assert.equal(isSyndicationReviewRolloutEnabled(review, 'privateProperty'), true)
assert.equal(isSyndicationReviewRolloutEnabled(review, 'property24'), false)
assert.equal(canAcknowledgeSyndicationChannel(review, 'privateProperty'), true)
assert.equal(shouldRequireSyndicationReview({ review, channel: 'privateProperty' }), true)
assert.equal(shouldRequireSyndicationReview({ review, channel: 'property24' }), false)

console.log('Syndication review pilot phase 7 contract passed')
