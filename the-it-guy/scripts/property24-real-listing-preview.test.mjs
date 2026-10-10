import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
  createProperty24Arch9ListingPreview,
  fetchArch9ListingForProperty24Preview,
  fetchRecentArch9ListingsForProperty24Preview,
  loadProperty24ImageBytesForPreview,
} from '../server/services/property24Arch9ListingPreviewService.js'
import { extractMatterportSpaceId, extractYouTubeVideoId } from '../server/services/listingPortalVideo.js'

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

class FakeQuery {
  constructor(rows = []) {
    this.rows = rows
    this.filters = []
    this.limitCount = null
  }

  select() {
    return this
  }

  eq(column, value) {
    this.filters.push({ column, value: String(value) })
    return this
  }

  order() {
    return this
  }

  limit(count) {
    this.limitCount = count
    return this
  }

  filteredRows() {
    let rows = this.rows
    for (const filter of this.filters) {
      rows = rows.filter((row) => String(row[filter.column]) === filter.value)
    }
    return typeof this.limitCount === 'number' ? rows.slice(0, this.limitCount) : rows
  }

  async maybeSingle() {
    return { data: this.filteredRows()[0] || null, error: null }
  }

  then(resolve, reject) {
    return Promise.resolve({ data: this.filteredRows(), error: null }).then(resolve, reject)
  }
}

function createFakeClient(tables = {}) {
  return {
    from(table) {
      return new FakeQuery(tables[table] || [])
    },
  }
}

const listingId = 'arch9-listing-001'
const client = createFakeClient({
  private_listings: [
    {
      id: listingId,
      listing_reference: 'ARCH9-LISTING-001',
      listing_status: 'active',
      title: 'Real Arch9 Test Listing',
      address_line_1: '10 Preview Street',
      property_type: 'house',
      asking_price: 2450000,
      suburb: 'Sandton',
      city: 'Sandton',
      province: 'Gauteng',
      updated_at: '2026-08-20T09:00:00.000Z',
    },
    {
      id: 'arch9-listing-onboarding',
      listing_reference: 'ARCH9-LISTING-ONBOARDING',
      listing_status: 'active',
      title: 'Onboarding Hydrated Listing',
      address_line_1: '12 Mandate Road',
      property_type: 'house',
      asking_price: 1850000,
      suburb: 'Bartlett',
      city: 'Boksburg',
      province: 'Gauteng',
      updated_at: '2026-08-26T09:00:00.000Z',
    },
  ],
  listing_publication_data: [
    {
      listing_id: listingId,
      title: 'Real Arch9 Test Listing',
      listing_type: 'Sale',
      property_type: 'House',
      asking_price: 2450000,
      bedrooms: 3,
      bathrooms: 2,
      garages: 2,
      floor_size: 180,
      erf_size: 500,
      description: 'This is a real Arch9-shaped listing preview for Property24.',
      status: 'Published',
    },
    {
      listing_id: 'arch9-listing-onboarding',
      title: 'Onboarding Hydrated Listing',
      listing_type: 'Sale',
      property_type: 'House',
      asking_price: 1850000,
      bedrooms: 2,
      bathrooms: 1,
      garages: 1,
      status: 'Draft',
    },
  ],
  private_listing_seller_onboarding: [
    {
      private_listing_id: 'arch9-listing-onboarding',
      form_data: {
        listingDescription: 'Mandate form data should hydrate the Property24 description.',
        mandateStartDate: '2026-08-26',
        mandateEndDate: '2027-02-26',
        featureFacts: { solar_panels: true },
      },
      updated_at: '2026-08-26T09:05:00.000Z',
    },
  ],
  listing_media: [
    {
      listing_id: listingId,
      media_type: 'image',
      file_url: 'https://www.arch9.co.za/listing-image.jpg',
      caption: 'Front view',
      is_cover: true,
      sort_order: 0,
    },
  ],
})

const bundle = await fetchArch9ListingForProperty24Preview({ client, listingId })
assert.equal(bundle.listing.id, listingId)
assert.equal(bundle.publication.listing_id, listingId)
assert.equal(bundle.media.length, 1)

const onboardingHydratedBundle = await fetchArch9ListingForProperty24Preview({ client, listingId: 'arch9-listing-onboarding' })
assert.equal(onboardingHydratedBundle.listing.listingPreviewDescription, 'Mandate form data should hydrate the Property24 description.')
assert.equal(onboardingHydratedBundle.listing.mandateEndDate, '2027-02-26')
assert.deepEqual(onboardingHydratedBundle.listing.featureFacts, { solar_panels: true })

const candidates = await fetchRecentArch9ListingsForProperty24Preview({ client, limit: 5 })
assert.equal(candidates.length, 2)
assert.equal(candidates[0].id, listingId)
assert.equal(candidates[0].suburb, 'Sandton')

const report = createProperty24Arch9ListingPreview({
  ...bundle,
  agentMapping: {
    property24AgentId: 77959,
    sourceReference: 'ARCH9-AGENT-001',
  },
  catalogMapping: {
    suburbId: 5864,
    propertyTypeId: 4,
  },
  options: {
    agencyId: 31382,
    expiryDate: '2026-12-31',
  },
})

assert.equal(report.status, 'PREVIEW_READY')
assert.equal(report.canPreview, true)
assert.equal(report.canSubmit, false)
assert.doesNotMatch(report.nextStep, /ExDev/)
assert.deepEqual(report.dataBlockers, [])
assert.deepEqual(report.technicalBlockers, ['listing_image_bytes_not_loaded_for_property24_submit'])
assert.equal(report.summary.agencyId, 31382)
assert.deepEqual(report.summary.contactAgentIds, [77959])
assert.equal(report.summary.suburbId, 5864)
assert.equal(report.summary.propertyTypeId, 4)
assert.equal(report.previewPayload.propertyInfo.suburbId, 5864)
assert.equal(report.previewPayload.photos[0].bytesLoaded, false)
assert.equal(report.safety.property24ApiCalled, false)
assert.equal(report.safety.databaseWritten, false)
assert.equal(report.safety.listingPublished, false)

const onboardingHydratedReport = createProperty24Arch9ListingPreview({
  ...onboardingHydratedBundle,
  media: bundle.media,
  agentMapping: {
    property24AgentId: 77959,
    sourceReference: 'ARCH9-AGENT-001',
  },
  catalogMapping: {
    suburbId: 1987,
    propertyTypeId: 4,
  },
  options: {
    agencyId: 31382,
    requirePhotoBytes: false,
  },
})
assert.equal(onboardingHydratedReport.summary.expiryDate, '2027-02-26T00:00:00.000Z')
assert.equal(onboardingHydratedReport.summary.descriptionPresent, true)
assert.equal(onboardingHydratedReport.dataBlockers.includes('missing_expiry_date'), false)
assert.equal(onboardingHydratedReport.dataBlockers.includes('missing_description'), false)
assert.ok(onboardingHydratedReport.previewPayload, JSON.stringify(onboardingHydratedReport.dataBlockers))
assert.match(onboardingHydratedReport.previewPayload.description, /Solar panels/)

const loaded = await loadProperty24ImageBytesForPreview({
  media: bundle.media,
  fetchImpl: async () => ({
    ok: true,
    status: 200,
    headers: {
      get: () => 'image/jpeg',
    },
    arrayBuffer: async () => new TextEncoder().encode('fake-image-bytes').buffer,
  }),
})
assert.equal(loaded.summary.loaded, 1)
assert.equal(loaded.results[0].status, 'LOADED')
assert.match(loaded.media[0].bytes, /^[A-Za-z0-9+/=]+$/)

const largeGallery = Array.from({ length: 151 }, (_, index) => ({
  media_type: 'image',
  file_url: `https://www.arch9.co.za/gallery-${index}.jpg`,
}))
const galleryLoaded = await loadProperty24ImageBytesForPreview({
  media: largeGallery,
  fetchImpl: async () => ({
    ok: true,
    status: 200,
    headers: { get: () => 'image/jpeg' },
    arrayBuffer: async () => new Uint8Array([1]).buffer,
  }),
})
assert.equal(galleryLoaded.summary.requested, 151)
assert.equal(galleryLoaded.summary.loaded, 151)
assert.equal(galleryLoaded.summary.skipped, 0)
assert.equal(galleryLoaded.media[150].bytes, 'AQ==')

const galleryCappedByCaller = await loadProperty24ImageBytesForPreview({
  media: largeGallery,
  maxImages: 50,
  fetchImpl: async () => ({
    ok: true,
    status: 200,
    headers: { get: () => 'image/jpeg' },
    arrayBuffer: async () => new Uint8Array([1]).buffer,
  }),
})
assert.equal(galleryCappedByCaller.summary.loaded, 50)
assert.equal(galleryCappedByCaller.summary.skipped, 101)

const galleryWithPlans = await loadProperty24ImageBytesForPreview({
  media: [
    ...largeGallery,
    ...Array.from({ length: 6 }, (_, index) => ({
      media_type: 'floor_plan',
      file_url: `https://www.arch9.co.za/plan-${index}.jpg`,
    })),
  ],
  fetchImpl: async () => ({
    ok: true,
    status: 200,
    headers: { get: () => 'image/jpeg' },
    arrayBuffer: async () => new Uint8Array([1]).buffer,
  }),
})
assert.equal(galleryWithPlans.summary.loaded, 156)
assert.equal(galleryWithPlans.summary.skipped, 1)
assert.equal(galleryWithPlans.media[155].bytes, 'AQ==')
assert.equal(galleryWithPlans.media[156].bytes, undefined)
const gallerySubmit = createProperty24Arch9ListingPreview({
  ...bundle,
  media: galleryWithPlans.media,
  agentMapping: { property24AgentId: 77959, sourceReference: 'ARCH9-AGENT-001' },
  catalogMapping: { suburbId: 5864, propertyTypeId: 4 },
  options: {
    agencyId: 31382,
    expiryDate: '2026-12-31',
    expectedPhotoPayloadCount: galleryWithPlans.summary.requested,
    includeSubmitPayload: true,
  },
})
assert.equal(gallerySubmit.canSubmit, true)
assert.equal(gallerySubmit.payload.photos.length, 156)
assert.equal(gallerySubmit.payload.photos.filter((photo) => photo.isFloorPlan).length, 5)

const budgetLoaded = await loadProperty24ImageBytesForPreview({
  media: largeGallery.slice(0, 3),
  maxTotalImageBytes: 2,
  fetchImpl: async () => ({
    ok: true,
    status: 200,
    headers: { get: () => 'image/jpeg' },
    arrayBuffer: async () => new Uint8Array([1]).buffer,
  }),
})
assert.equal(budgetLoaded.summary.requested, 2)
assert.equal(budgetLoaded.summary.loaded, 2)
assert.equal(budgetLoaded.summary.skipped, 1)
assert.equal(budgetLoaded.summary.totalImageBytes, 2)
assert.equal(budgetLoaded.results[2].status, 'SKIPPED')

const fallbackLoaded = await loadProperty24ImageBytesForPreview({
  media: [
    {
      listing_id: listingId,
      media_type: 'image',
      file_url: 'https://project.supabase.co/storage/v1/object/sign/documents/private-listings/example/photo.jpg?token=expired',
    },
  ],
  fetchImpl: async () => ({
    ok: false,
    status: 400,
    headers: {
      get: () => '',
    },
    arrayBuffer: async () => new ArrayBuffer(0),
  }),
  storageClient: {
    storage: {
      from(bucket) {
        assert.equal(bucket, 'documents')
        return {
          async download(objectPath) {
            assert.equal(objectPath, 'private-listings/example/photo.jpg')
            return {
              data: new Blob(['storage-image-bytes'], { type: 'image/jpeg' }),
              error: null,
            }
          },
        }
      },
    },
  },
})
assert.equal(fallbackLoaded.summary.loaded, 1)
assert.equal(fallbackLoaded.results[0].source, 'supabase_storage')

const conversionFallbackLoaded = await loadProperty24ImageBytesForPreview({
  media: [
    {
      listing_id: listingId,
      media_type: 'image',
      file_url: 'https://cdn.arch9.test/photo.png',
    },
  ],
  fetchImpl: async () => ({
    ok: true,
    status: 200,
    headers: {
      get: () => 'image/png',
    },
    arrayBuffer: async () => new TextEncoder().encode('not-a-real-png').buffer,
  }),
  convertImagesToJpeg: true,
})
assert.equal(conversionFallbackLoaded.summary.loaded, 1)
assert.equal(conversionFallbackLoaded.results[0].status, 'LOADED')
assert.equal(conversionFallbackLoaded.results[0].conversionFailedOriginalUsed, true)
assert.equal(conversionFallbackLoaded.media[0].mimeContentType, 'image/png')
assert.match(conversionFallbackLoaded.media[0].bytes, /^[A-Za-z0-9+/=]+$/)

const submitReadyReport = createProperty24Arch9ListingPreview({
  ...bundle,
  media: loaded.media,
  agentMapping: {
    property24AgentId: 77959,
    sourceReference: 'ARCH9-AGENT-001',
  },
  catalogMapping: {
    suburbId: 5864,
    propertyTypeId: 4,
  },
  imageByteLoad: {
    summary: loaded.summary,
    results: loaded.results,
  },
  options: {
    agencyId: 31382,
    expiryDate: '2026-12-31',
  },
})
assert.equal(submitReadyReport.canSubmit, true)
assert.doesNotMatch(submitReadyReport.nextStep, /ExDev/)
assert.deepEqual(submitReadyReport.technicalBlockers, [])
assert.equal(submitReadyReport.previewPayload.photos[0].bytesLoaded, true)
assert.equal(submitReadyReport.imageByteLoad.summary.loaded, 1)
assert.equal(Object.hasOwn(submitReadyReport.imageByteLoad, 'media'), false)

assert.equal(extractYouTubeVideoId('https://youtu.be/dQw4w9WgXcQ?t=10'), 'dQw4w9WgXcQ')
assert.equal(extractYouTubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), 'dQw4w9WgXcQ')
assert.equal(extractYouTubeVideoId('https://youtube.com/shorts/dQw4w9WgXcQ'), 'dQw4w9WgXcQ')
assert.equal(extractYouTubeVideoId('https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ'), '')
assert.equal(extractMatterportSpaceId('https://my.matterport.com/show/?m=cJhhdz6udAu&play=1'), 'cJhhdz6udAu')
assert.equal(extractMatterportSpaceId('https://my.matterport.com.evil.test/show/?m=cJhhdz6udAu'), '')

const mediaWithVideo = [
  ...loaded.media,
  { media_type: 'video', file_url: 'https://youtu.be/dQw4w9WgXcQ?t=10' },
  { media_type: 'virtual_tour', file_url: 'https://my.matterport.com/show/?m=cJhhdz6udAu' },
]
const mappedVideoReport = createProperty24Arch9ListingPreview({
  ...bundle,
  media: mediaWithVideo,
  agentMapping: { property24AgentId: 77959, sourceReference: 'ARCH9-AGENT-001' },
  catalogMapping: { suburbId: 5864, propertyTypeId: 4 },
  options: { agencyId: 31382, expiryDate: '2026-12-31', includeSubmitPayload: true },
})
assert.equal(mappedVideoReport.canSubmit, true)
assert.equal(mappedVideoReport.previewPayload.youTubeVideoId, 'dQw4w9WgXcQ')
assert.equal(mappedVideoReport.payload.youTubeVideoId, 'dQw4w9WgXcQ')
assert.equal(mappedVideoReport.payload.matterportSpaceId, 'cJhhdz6udAu')
assert.equal(mappedVideoReport.summary.video.videoLinkPresent, true)
assert.deepEqual(mappedVideoReport.summary.video.warnings, [])

const unsupportedVideoReport = createProperty24Arch9ListingPreview({
  ...bundle,
  media: [...loaded.media, { media_type: 'video', file_url: 'https://vimeo.com/123456' }],
  agentMapping: { property24AgentId: 77959 },
  catalogMapping: { suburbId: 5864, propertyTypeId: 4 },
  options: { agencyId: 31382, expiryDate: '2026-12-31', includeSubmitPayload: true },
})
assert.equal(unsupportedVideoReport.canSubmit, true)
assert.equal(Object.hasOwn(unsupportedVideoReport.payload, 'youTubeVideoId'), false)
assert.ok(unsupportedVideoReport.qualityWarnings.includes('unsupported_youtube_video_link'))

const scriptSource = read('scripts/property24-preview-listing.mjs')
assert.match(scriptSource, /SUPABASE_SERVICE_ROLE_KEY/)
assert.match(scriptSource, /property24-real-listing-preview\.json/)
assert.match(scriptSource, /--list-candidates/)
assert.match(scriptSource, /--load-image-bytes/)
assert.doesNotMatch(scriptSource, /createProperty24Client/)

const packageJson = JSON.parse(read('package.json'))
assert.equal(packageJson.scripts['property24:preview-listing'], 'node scripts/property24-preview-listing.mjs')
assert.equal(packageJson.scripts['test:property24-preview-listing'], 'node scripts/property24-real-listing-preview.test.mjs')

console.log('Property24 real listing preview contract passed')

// Responses finish out of order: retain the cover and budget in gallery order.
const concurrentStarts = []
const completeDownloads = new Map()
const concurrentMedia = [
  { media_type: 'image', file_url: 'https://images.example/second.jpg', sort_order: 1 },
  { media_type: 'image', file_url: 'https://images.example/cover.jpg', is_cover: true },
  { media_type: 'image', file_url: 'https://images.example/third.jpg', sort_order: 2 },
]
const concurrentLoad = loadProperty24ImageBytesForPreview({
  media: concurrentMedia, maxTotalImageBytes: 3,
  fetchImpl: url => {
    concurrentStarts.push(url)
    return new Promise(resolve => completeDownloads.set(url, () => resolve({
      ok: true, status: 200, headers: { get: () => 'image/jpeg' },
      arrayBuffer: async () => new Uint8Array([1, 2]).buffer,
    })))
  },
})
assert.deepEqual(concurrentStarts, ['https://images.example/cover.jpg', 'https://images.example/second.jpg'])
completeDownloads.get('https://images.example/second.jpg')()
await new Promise(resolve => setImmediate(resolve))
assert.equal(concurrentStarts.length, 2, 'bound work while the cover is still loading')
completeDownloads.get('https://images.example/cover.jpg')()
await new Promise(resolve => setImmediate(resolve))
assert.equal(concurrentStarts.length, 3)
completeDownloads.get('https://images.example/third.jpg')()
const concurrentResult = await concurrentLoad
assert.deepEqual(concurrentResult.results.map(row => [row.index, row.status]), [[1, 'LOADED'], [0, 'SKIPPED'], [2, 'SKIPPED']])
assert.equal(concurrentResult.media[1].bytes, 'AQI=')
assert.equal(concurrentResult.media[0].bytes, undefined)
assert.equal(concurrentResult.summary.totalImageBytes, 2)
assert.equal(concurrentMedia[1].bytes, undefined)
const partialFailure = await loadProperty24ImageBytesForPreview({
  media: concurrentMedia,
  fetchImpl: async url => {
    if (url.endsWith('cover.jpg')) throw new Error('Photo download unavailable')
    return { ok: true, status: 200, headers: { get: () => 'image/jpeg' }, arrayBuffer: async () => new Uint8Array([3]).buffer }
  },
})
assert.deepEqual(partialFailure.results.map(row => row.status), ['FAILED', 'LOADED', 'LOADED'])
assert.equal(partialFailure.summary.failed, 1)
assert.equal(partialFailure.summary.loaded, 2)
console.log('Property24 bounded photo preparation and ordered byte budget checks passed.')
