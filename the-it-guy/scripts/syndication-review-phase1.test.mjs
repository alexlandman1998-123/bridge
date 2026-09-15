import assert from 'node:assert/strict'
import {
  SYNDICATION_REVIEW_ROLLOUT_ENV,
  resolveSyndicationReviewRollout,
} from '../server/services/syndicationReviewRolloutService.js'

const disabled = resolveSyndicationReviewRollout()
assert.deepEqual(disabled, {
  version: 'arch9_syndication_review_rollout_v1',
  enabled: false,
  mode: 'legacy',
  reason: 'disabled_by_default',
  organisationId: null,
  pilotChannels: [],
  pilotChannelsConfigured: false,
  pilotCategories: [],
  pilotCategoriesConfigured: false,
  listingCategory: null,
  listingCategoryEnabled: false,
  legacyPublishPathPreserved: true,
})

const globalOnly = resolveSyndicationReviewRollout({
  env: { [SYNDICATION_REVIEW_ROLLOUT_ENV.enabled]: 'true' },
  organisationId: 'organisation-a',
})
assert.equal(globalOnly.enabled, false)
assert.equal(globalOnly.mode, 'legacy')
assert.equal(globalOnly.reason, 'organisation_not_enabled')

const enabled = resolveSyndicationReviewRollout({
  env: {
    [SYNDICATION_REVIEW_ROLLOUT_ENV.enabled]: 'YES',
    [SYNDICATION_REVIEW_ROLLOUT_ENV.organisationIds]: 'organisation-a, organisation-b, organisation-a',
  },
  organisationId: 'organisation-b',
})
assert.equal(enabled.enabled, true)
assert.equal(enabled.mode, 'review')
assert.equal(enabled.reason, 'organisation_enabled')
assert.equal(enabled.legacyPublishPathPreserved, true)
assert.deepEqual(enabled.pilotChannels, ['privateProperty', 'property24'])
assert.equal(enabled.pilotChannelsConfigured, false)
assert.deepEqual(enabled.pilotCategories, ['residential', 'land', 'farm', 'commercial', 'industrial', 'mixedUse'])
assert.equal(enabled.pilotCategoriesConfigured, false)

const privatePropertyOnlyPilot = resolveSyndicationReviewRollout({
  env: {
    [SYNDICATION_REVIEW_ROLLOUT_ENV.enabled]: 'true',
    [SYNDICATION_REVIEW_ROLLOUT_ENV.organisationIds]: 'organisation-a',
    [SYNDICATION_REVIEW_ROLLOUT_ENV.pilotChannels]: 'private-property',
  },
  organisationId: 'organisation-a',
})
assert.deepEqual(privatePropertyOnlyPilot.pilotChannels, ['privateProperty'])
assert.equal(privatePropertyOnlyPilot.pilotChannelsConfigured, true)

const residentialOnlyPilot = resolveSyndicationReviewRollout({
  env: {
    [SYNDICATION_REVIEW_ROLLOUT_ENV.enabled]: 'true',
    [SYNDICATION_REVIEW_ROLLOUT_ENV.organisationIds]: 'organisation-a',
    [SYNDICATION_REVIEW_ROLLOUT_ENV.pilotCategories]: 'residential',
  },
  organisationId: 'organisation-a',
  listingCategory: 'Townhouse',
})
assert.deepEqual(residentialOnlyPilot.pilotCategories, ['residential'])
assert.equal(residentialOnlyPilot.listingCategory, 'residential')
assert.equal(residentialOnlyPilot.listingCategoryEnabled, true)

const unlistedOrganisation = resolveSyndicationReviewRollout({
  env: {
    [SYNDICATION_REVIEW_ROLLOUT_ENV.enabled]: 'true',
    [SYNDICATION_REVIEW_ROLLOUT_ENV.organisationIds]: 'organisation-a',
  },
  organisationId: 'organisation-c',
})
assert.equal(unlistedOrganisation.enabled, false)
assert.equal(unlistedOrganisation.mode, 'legacy')
assert.equal(unlistedOrganisation.reason, 'organisation_not_enabled')

console.log('Syndication review phase 1 rollout contract passed')
