import assert from 'node:assert/strict'
import {
  buildPublicListingPublicationPayload,
  buildPublicListingUrl,
  createPublicListingLaunchCandidateReport,
  createPublicListingLaunchPlan,
  createPublicListingMediaAttachmentPlan,
  getPublicListingBackfillBlockers,
  getPublicListingReadinessBlockers,
  summarizePublicListingReadiness,
} from '../services/publicListingReadinessService.js'

const listing = {
  id: '11111111-2222-3333-4444-555555555555',
  listing_status: 'active',
  listing_visibility: 'active_market',
  bridge_listing_status: 'published',
  bridge_listing_public_url: '',
  title: 'Modern Family Home',
  description: 'A polished public-facing description.',
  address_line_1: '12 Main Road',
  suburb: 'Bedfordview',
  city: 'Johannesburg',
  province: 'Gauteng',
  property_type: 'House',
  asking_price: 3250000,
}

const publication = {
  listing_id: listing.id,
  title: 'Modern Family Home',
  suburb: 'Bedfordview',
  province: 'Gauteng',
  property_type: 'House',
  listing_type: 'Sale',
  asking_price: 3250000,
  description: 'A polished public-facing description.',
  status: 'Published',
}

const media = [
  {
    listing_id: listing.id,
    media_type: 'image',
    file_url: 'https://cdn.example.com/cover.jpg',
    sort_order: 0,
    is_cover: true,
  },
]

assert.deepEqual(getPublicListingReadinessBlockers({ listing, publication, media }), [])

assert.deepEqual(
  getPublicListingReadinessBlockers({
    listing: { ...listing, listing_status: 'sold' },
    publication,
    media,
  }),
  ['listing_status=sold'],
)

assert.deepEqual(
  getPublicListingReadinessBlockers({
    listing,
    publication: { ...publication, status: 'Draft' },
    media,
  }),
  ['publication status is not Published'],
)

assert.deepEqual(
  getPublicListingBackfillBlockers({
    listing,
    publication: { ...publication, status: 'Draft' },
    media,
  }),
  [],
)

assert.equal(buildPublicListingPublicationPayload(listing, {}).title, 'Modern Family Home')
assert.equal(buildPublicListingPublicationPayload(listing, {}).asking_price, 3250000)
assert.equal(
  buildPublicListingUrl({ ...listing, bridge_listing_public_url: 'https://legacy-app.example.test/buy/old-listing' }, publication),
  'https://www.arch9.co.za/buy/modern-family-home-bedfordview-gauteng-11111111',
)

const launchPlan = createPublicListingLaunchPlan({
  listing,
  publication: { ...publication, status: 'Draft' },
  media,
})
assert.equal(launchPlan.canApply, true)
assert.equal(launchPlan.mode, 'ready_to_publish')
assert.equal(launchPlan.publicationPayload.status, 'Published')
assert.equal(launchPlan.listingPatch.bridge_listing_status, 'published')
assert.equal(launchPlan.listingPatch.listing_visibility, 'active_market')

const blockedLaunchPlan = createPublicListingLaunchPlan({
  listing: { ...listing, listing_status: 'sold' },
  publication,
  media,
})
assert.equal(blockedLaunchPlan.canApply, false)
assert.equal(blockedLaunchPlan.mode, 'blocked')
assert.deepEqual(blockedLaunchPlan.summary.launchBlockers, ['listing_status=sold'])

const candidateReport = createPublicListingLaunchCandidateReport({
  listings: [
    listing,
    { ...listing, id: '22222222-2222-3333-4444-555555555555', listing_status: 'sold', title: 'Sold Stock' },
    { ...listing, id: '33333333-2222-3333-4444-555555555555', title: 'Needs Media' },
  ],
  publications: [
    { ...publication, status: 'Draft' },
    { ...publication, listing_id: '22222222-2222-3333-4444-555555555555' },
    { ...publication, listing_id: '33333333-2222-3333-4444-555555555555' },
  ],
  media,
  limit: 3,
})
assert.equal(candidateReport.summary.totalListings, 3)
assert.equal(candidateReport.summary.readyToApply, 1)
assert.equal(candidateReport.summary.blockedLifecycle, 1)
assert.equal(candidateReport.candidates[0].candidateType, 'ready_to_apply')
assert.match(candidateReport.candidates[0].command, /publish:public-listing/)

const mediaPlan = createPublicListingMediaAttachmentPlan({
  listing,
  existingMedia: [],
  imageUrls: ['https://cdn.example.com/front.jpg', 'notaurl'],
  caption: 'Front exterior',
})
assert.equal(mediaPlan.canApply, true)
assert.equal(mediaPlan.mode, 'ready_to_attach')
assert.equal(mediaPlan.rows.length, 1)
assert.equal(mediaPlan.rows[0].is_cover, true)
assert.equal(mediaPlan.rows[0].caption, 'Front exterior')

const duplicateMediaPlan = createPublicListingMediaAttachmentPlan({
  listing,
  existingMedia: media,
  imageUrls: ['https://cdn.example.com/cover.jpg'],
})
assert.equal(duplicateMediaPlan.canApply, false)
assert.deepEqual(duplicateMediaPlan.summary.blockers, ['all image URLs already exist'])

const report = summarizePublicListingReadiness({
  listings: [
    listing,
    { ...listing, id: '22222222-2222-3333-4444-555555555555', listing_status: 'sold', title: 'Sold Stock' },
    { ...listing, id: '33333333-2222-3333-4444-555555555555', title: 'Needs Media' },
  ],
  publications: [
    publication,
    { ...publication, listing_id: '22222222-2222-3333-4444-555555555555' },
    { ...publication, listing_id: '33333333-2222-3333-4444-555555555555' },
  ],
  media,
})

assert.equal(report.summary.totalListings, 3)
assert.equal(report.summary.eligible, 1)
assert.equal(report.summary.blocked, 2)
assert.equal(report.blockerCounts['listing_status=sold'], 1)
assert.equal(report.blockerCounts['missing listing_media image'], 2)
assert.equal(report.actionQueues.blockedLifecycle.length, 1)
assert.equal(report.actionQueues.needsMedia.length, 2)

console.log('publicListingReadinessService tests passed')
