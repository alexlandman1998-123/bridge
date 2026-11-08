import assert from 'node:assert/strict'
import test from 'node:test'

import {
  getPendingListingMediaUploads,
  hasBlockingListingMediaUploads,
  resolveMarketingDraftList,
  resolveMarketingDraftText,
} from '../listingMarketingDraftSafety.js'

test('intentional empty marketing values do not fall back to stale saved values', () => {
  assert.equal(resolveMarketingDraftText({ description: '' }, 'description', 'Old description'), '')
  assert.deepEqual(resolveMarketingDraftList({ amenities: [] }, 'amenities', ['Pool']), [])
})

test('missing marketing values retain their existing fallback', () => {
  assert.equal(resolveMarketingDraftText({}, 'description', 'Existing description'), 'Existing description')
  assert.deepEqual(resolveMarketingDraftList({}, 'amenities', ['Pool']), ['Pool'])
})

test('local and failed media are blocked while durable remote media are accepted', () => {
  const draft = {
    galleryImages: [
      { id: 'remote', url: 'https://cdn.example.com/listing.jpg' },
      { id: 'local', url: 'data:image/jpeg;base64,abc' },
    ],
    floorplans: [
      { id: 'failed', url: 'https://cdn.example.com/plan.jpg', uploadWarning: 'Storage rejected the upload.' },
    ],
  }

  assert.deepEqual(getPendingListingMediaUploads(draft).map((item) => item.id), ['local', 'failed'])
  assert.equal(hasBlockingListingMediaUploads(draft), true)
  assert.equal(hasBlockingListingMediaUploads({ galleryImages: [{ url: 'https://cdn.example.com/ready.jpg' }] }), false)
})


test('uses public advert copy instead of internal developer metadata', async () => {
 const { resolvePublicListingDescription } = await import('../listingMarketingDraftSafety.js')
 const notes = 'Developer listing: development unit\nDevelopment ID: abc\nBRIDGE_QUICK_ADD_METADATA: {"origin":"development_unit"}'
 assert.equal(resolvePublicListingDescription({description: notes, publicationData:{description:'A bright Madison Place home.'}}), 'A bright Madison Place home.')
 assert.equal(resolvePublicListingDescription({description:notes}), '')
 assert.equal(resolvePublicListingDescription({description:'Original public advert.'}), 'Original public advert.')
 assert.equal(resolvePublicListingDescription(null), '')
})
