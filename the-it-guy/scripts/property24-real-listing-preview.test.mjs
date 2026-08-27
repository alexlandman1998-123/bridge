import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
  createProperty24Arch9ListingPreview,
  fetchArch9ListingForProperty24Preview,
  fetchRecentArch9ListingsForProperty24Preview,
  loadProperty24ImageBytesForPreview,
} from '../server/services/property24Arch9ListingPreviewService.js'

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
assert.deepEqual(submitReadyReport.technicalBlockers, [])
assert.equal(submitReadyReport.previewPayload.photos[0].bytesLoaded, true)
assert.equal(submitReadyReport.imageByteLoad.summary.loaded, 1)
assert.equal(Object.hasOwn(submitReadyReport.imageByteLoad, 'media'), false)

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
