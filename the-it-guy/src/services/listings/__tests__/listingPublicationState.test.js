import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildListingPublicationSnapshot,
  deriveListingPublicationStates,
  diffListingPublicationSnapshots,
} from '../listingPublicationState.js'

const baseDraft = {
  headline: 'Family home',
  description: 'Original description',
  price: '2500000',
  pricePresentation: 'Standard',
  listingStatus: 'active',
  formattedAddress: '1 Main Road, Cape Town',
  propertyType: 'House',
  bedrooms: '3',
  bathrooms: '2',
  selectedFeatures: ['Pool', 'Solar'],
  amenities: ['Fibre'],
  galleryImages: [{ id: 'cover', path: 'listing/cover.jpg' }],
  coverImageId: 'cover',
}

test('publication snapshots normalize unordered feature fields', () => {
  const first = buildListingPublicationSnapshot(baseDraft)
  const second = buildListingPublicationSnapshot({ ...baseDraft, selectedFeatures: ['Solar', 'Pool'] })
  assert.deepEqual(diffListingPublicationSnapshots(first, second), [])
})

test('snapshot differences identify exact changed fields', () => {
  const published = buildListingPublicationSnapshot(baseDraft)
  const current = buildListingPublicationSnapshot({ ...baseDraft, description: '', price: '2400000' })
  assert.deepEqual(diffListingPublicationSnapshots(current, published).map((change) => change.key), ['description', 'price'])
})

test('channel lifecycle keeps accepted snapshot separate from later local edits', () => {
  const published = buildListingPublicationSnapshot(baseDraft)
  const current = buildListingPublicationSnapshot({ ...baseDraft, headline: 'Updated family home' })
  const states = deriveListingPublicationStates([
    {
      activity_type: 'listing_channel_publication_submitted',
      created_at: '2026-09-24T08:00:00.000Z',
      metadata: { channel: 'Property24', submittedAt: '2026-09-24T08:00:00.000Z' },
    },
    {
      activity_type: 'listing_channel_publication_accepted',
      created_at: '2026-09-24T08:01:00.000Z',
      metadata: { channel: 'Property24', acceptedAt: '2026-09-24T08:01:00.000Z', snapshot: published },
    },
  ], current)

  assert.equal(states.property24.stage, 'accepted')
  assert.equal(states.property24.changeCount, 1)
  assert.equal(states.property24.changes[0].key, 'headline')
  assert.equal(states.property24.verifiedAt, '')
})

test('withdrawal activity supersedes the old verified snapshot without reporting unpublished changes', () => {
  const snapshot = buildListingPublicationSnapshot({ headline: 'Old headline', price: '1000000' })
  const states = deriveListingPublicationStates([
    { activity_type: 'listing_channel_publication_verified', created_at: '2026-09-20T08:00:00Z', metadata: { channel: 'Property24', snapshot } },
    { activity_type: 'listing_channel_withdrawal_succeeded', created_at: '2026-09-21T08:00:00Z', metadata: { channel: 'Property24', withdrawnAt: '2026-09-21T08:00:00Z' } },
  ], buildListingPublicationSnapshot({ headline: 'New headline', price: '1000000' }))

  assert.equal(states.property24.stage, 'withdrawn')
  assert.equal(states.property24.withdrawnAt, '2026-09-21T08:00:00Z')
  assert.equal(states.property24.changeCount, 0)
})

test('failed withdrawal is visible without misclassifying content as unpublished', () => {
  const snapshot = buildListingPublicationSnapshot(baseDraft)
  const states = deriveListingPublicationStates([
    { activity_type: 'listing_channel_publication_verified', created_at: '2026-09-20T08:00:00Z', metadata: { channel: 'Private Property', snapshot } },
    { activity_type: 'listing_channel_withdrawal_failed', created_at: '2026-09-21T08:00:00Z', metadata: { channel: 'Private Property', error: 'Portal unavailable' } },
  ], buildListingPublicationSnapshot({ ...baseDraft, headline: 'Later edit' }))

  assert.equal(states.private_property.stage, 'withdrawal_failed')
  assert.equal(states.private_property.failureDetail, 'Portal unavailable')
  assert.equal(states.private_property.changeCount, 0)
})
