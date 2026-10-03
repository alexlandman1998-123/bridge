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

const signed = (name, token = 'old') => `https://example.supabase.co/storage/v1/object/sign/documents/listing/${name}?token=${token}`

test('renewed signed links match historical snapshots and storage paths', () => {
  const published = { coverImage: signed('one.jpg'), gallery: [signed('one.jpg'), signed('two.jpg')], floorplans: [signed('plan.pdf')] }
  const current = buildListingPublicationSnapshot({ galleryImages: [{ id: 'one', path: 'listing/one.jpg' }, { id: 'two', url: signed('two.jpg', 'renewed') }], floorplans: [{ url: signed('plan.pdf', 'renewed') }] })
  const mediaChanges = diffListingPublicationSnapshots(current, published).filter(({ group }) => group === 'Media')
  assert.deepEqual(mediaChanges, [])
  assert.equal(current.gallery[1], 'listing/two.jpg')
  assert.ok(!JSON.stringify(current).includes('token='))
})

test('gallery reorder, addition, removal and cover replacement remain detectable', () => {
  const published = { gallery: [signed('one.jpg'), signed('two.jpg')], coverImage: signed('one.jpg') }
  for (const gallery of [[signed('two.jpg'), signed('one.jpg')], [signed('one.jpg')], [signed('one.jpg'), signed('two.jpg'), signed('three.jpg')]]) {
    assert.ok(diffListingPublicationSnapshots({ ...published, gallery }, published).some(({ key }) => key === 'gallery'))
  }
  assert.ok(diffListingPublicationSnapshots({ ...published, coverImage: signed('two.jpg') }, published).some(({ key }) => key === 'coverImage'))
  const change = diffListingPublicationSnapshots({ gallery: [signed('two.jpg'), signed('one.jpg')] }, { gallery: published.gallery })[0]
  assert.deepEqual(change.previousItems, ['one.jpg', 'two.jpg'])
  assert.deepEqual(change.currentItems, ['two.jpg', 'one.jpg'])
  assert.ok(!JSON.stringify(change).includes('token='))
})

test('external media transformations and different storage objects are real changes', () => {
  assert.equal(diffListingPublicationSnapshots({ coverImage: 'https://cdn.example.com/a.jpg?width=800&token=new' }, { coverImage: 'https://cdn.example.com/a.jpg?width=400&token=old' }).length, 1)
  assert.equal(diffListingPublicationSnapshots({ coverImage: signed('a.jpg').replace('/documents/', '/other/') }, { coverImage: signed('a.jpg') }).length, 1)
})

test('equivalent explicit hectares and square metres compare equally', () => {
  const ha = buildListingPublicationSnapshot({ erfSize: '21.516', erfSizeUnit: 'ha' })
  const sqm = buildListingPublicationSnapshot({ erfSize: '215160', erfSizeUnit: 'm²' })
  assert.deepEqual(diffListingPublicationSnapshots(sqm, ha), [])
  const acres = buildListingPublicationSnapshot({ erfSize: '2', erfSizeUnit: 'Acres' })
  assert.deepEqual(diffListingPublicationSnapshots(buildListingPublicationSnapshot({ erfSize: '8093.712845' }), acres), [])
  const changed = diffListingPublicationSnapshots(buildListingPublicationSnapshot({ erfSize: '215161' }), ha)[0]
  assert.match(changed.previousValue, /21[.,]516 ha$/)
  assert.match(changed.currentValue, /m²$/)
})

test('legacy units are not guessed and unchanged old measurements are not flagged', () => {
  assert.deepEqual(diffListingPublicationSnapshots({ erfSize: '100', erfSizeUnit: 'm²' }, { erfSize: '100' }), [])
  const change = diffListingPublicationSnapshots({ erfSize: '215160', erfSizeUnit: 'm²' }, { erfSize: '21.516' })[0]
  assert.match(change.previousValue, /unit not recorded/)
  assert.match(change.currentValue, /m²$/)
  assert.equal(diffListingPublicationSnapshots({ erfSize: '100', erfSizeUnit: 'ha' }, { erfSize: '100', erfSizeUnit: 'm²' }).length, 1)
})
