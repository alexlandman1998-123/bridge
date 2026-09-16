import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  canAcknowledgeSyndicationChannel,
  isSyndicationReviewRolloutEnabled,
  shouldRequireSyndicationReview,
} from '../src/services/syndicationReviewGateService.js'

const legacyReview = {
  rollout: { enabled: false, mode: 'legacy' },
  channels: { privateProperty: { dataReady: true } },
}
const enabledReview = {
  rollout: { enabled: true, mode: 'review' },
  channels: {
    privateProperty: { dataReady: true },
    property24: { dataReady: false },
  },
}

assert.equal(isSyndicationReviewRolloutEnabled(legacyReview), false)
assert.equal(isSyndicationReviewRolloutEnabled(enabledReview), true)
assert.equal(isSyndicationReviewRolloutEnabled(enabledReview, 'privateProperty'), true)
assert.equal(canAcknowledgeSyndicationChannel(enabledReview, 'privateProperty'), true)
assert.equal(canAcknowledgeSyndicationChannel(enabledReview, 'private-property'), true)
assert.equal(canAcknowledgeSyndicationChannel(enabledReview, 'property24'), false)

assert.equal(shouldRequireSyndicationReview({
  review: legacyReview,
  channel: 'privateProperty',
  acknowledged: false,
  draftDirty: true,
}), false)
assert.equal(shouldRequireSyndicationReview({
  review: enabledReview,
  channel: 'privateProperty',
  acknowledged: false,
  draftDirty: false,
}), true)
assert.equal(shouldRequireSyndicationReview({
  review: enabledReview,
  channel: 'privateProperty',
  acknowledged: true,
  draftDirty: false,
}), false)
assert.equal(shouldRequireSyndicationReview({
  review: enabledReview,
  channel: 'privateProperty',
  acknowledged: true,
  draftDirty: true,
}), true)

const pageSource = await readFile(new URL('../src/pages/AgentListingDetail.jsx', import.meta.url), 'utf8')
for (const expected of [
  "requireSyndicationReviewBeforePublish('privateProperty')",
  "continueSyndicationReview('privateProperty', previewPrivatePropertyListing)",
]) {
  assert.ok(pageSource.includes(expected), `Expected Phase 6 review gate: ${expected}`)
}
assert.ok(!pageSource.includes("requireSyndicationReviewBeforePublish('property24')"), 'Property24 publishing should not be blocked behind a review gate')

console.log('Syndication review gate phase 6 contract passed')
