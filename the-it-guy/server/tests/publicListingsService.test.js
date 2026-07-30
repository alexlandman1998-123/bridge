import assert from 'node:assert/strict'
import {
  createListingSlug,
  getPublicListings,
  isPublicListingEligible,
  mapPublicListingContract,
} from '../services/publicListingsService.js'

const validListing = {
  id: '11111111-2222-3333-4444-555555555555',
  organisation_id: 'org-1',
  listing_status: 'active',
  listing_visibility: 'active_market',
  bridge_listing_status: 'published',
  bridge_listing_public_url: '',
  city: 'Johannesburg',
  province: 'Gauteng',
}

const validPublication = {
  listing_id: validListing.id,
  title: 'Modern Family Home',
  suburb: 'Bedfordview',
  province: 'Gauteng',
  property_type: 'House',
  listing_type: 'Sale',
  asking_price: 3250000,
  bedrooms: 4,
  bathrooms: 3.5,
  garages: 2,
  description: 'A polished public-facing description.',
  features: ['Pool', 'Solar'],
  amenities: ['Security estate'],
  status: 'Published',
  updated_at: '2026-06-25T12:00:00.000Z',
}

const validMedia = [
  {
    listing_id: validListing.id,
    media_type: 'image',
    file_url: 'https://cdn.example.com/cover.jpg',
    caption: 'Front elevation',
    sort_order: 0,
    is_cover: true,
  },
]

assert.equal(isPublicListingEligible({ listing: validListing, publication: validPublication, media: validMedia }), true)

assert.equal(
  isPublicListingEligible({
    listing: { ...validListing, listing_visibility: 'internal' },
    publication: validPublication,
    media: validMedia,
  }),
  false,
)

assert.equal(
  isPublicListingEligible({
    listing: validListing,
    publication: { ...validPublication, status: 'Draft' },
    media: validMedia,
  }),
  false,
)

assert.equal(
  isPublicListingEligible({
    listing: validListing,
    publication: validPublication,
    media: [],
  }),
  false,
)

assert.equal(
  isPublicListingEligible({
    listing: validListing,
    publication: { ...validPublication, asking_price: null },
    media: validMedia,
  }),
  false,
)

assert.equal(
  createListingSlug({ listing: validListing, publication: validPublication }),
  'modern-family-home-bedfordview-gauteng-11111111',
)

const contract = mapPublicListingContract({
  listing: { ...validListing, bridge_listing_public_url: 'https://legacy-app.example.test/buy/old-listing' },
  publication: validPublication,
  media: validMedia,
  host: 'https://www.arch9.co.za',
})

assert.deepEqual(Object.keys(contract).sort(), [
  'agencyName',
  'agencySlug',
  'agentName',
  'amenities',
  'askingPrice',
  'bathrooms',
  'bedrooms',
  'coverImageUrl',
  'description',
  'erfSize',
  'enquiryUrl',
  'features',
  'floorPlans',
  'floorSize',
  'galleryImages',
  'garages',
  'id',
  'levies',
  'listingType',
  'parkingBays',
  'propertyType',
  'province',
  'publicUrl',
  'publishedAt',
  'ratesTaxes',
  'slug',
  'suburb',
  'city',
  'title',
  'videos',
].sort())

assert.equal(contract.slug, 'modern-family-home-bedfordview-gauteng-11111111')
assert.equal(contract.publicUrl, 'https://www.arch9.co.za/buy/modern-family-home-bedfordview-gauteng-11111111')
assert.equal(contract.agencySlug, '')
assert.equal(contract.enquiryUrl, '')
assert.equal(contract.coverImageUrl, 'https://cdn.example.com/cover.jpg')
assert.equal(contract.features.length, 2)

const agencyContract = mapPublicListingContract({
  listing: {
    ...validListing,
    agency_public_intake_slug: 'kingstons',
    agency_public_name: 'Kingstons Real Estate',
  },
  publication: validPublication,
  media: validMedia,
  host: 'https://www.arch9.co.za/',
})

assert.equal(agencyContract.agencyName, 'Kingstons Real Estate')
assert.equal(agencyContract.agencySlug, 'kingstons')
assert.equal(
  agencyContract.enquiryUrl,
  'https://www.arch9.co.za/intake/kingstons?intent=buy&listing=modern-family-home-bedfordview-gauteng-11111111&listingId=11111111-2222-3333-4444-555555555555',
)

function createFakePublicListingsClient({ agencyScope = { organisation_id: 'org-1', slug: 'kingstons' }, overrides = {} } = {}) {
  const calls = []
  const results = {
    agency_public_intake_links: { data: agencyScope ? [agencyScope] : [], error: null },
    listing_publication_data: { data: [validPublication], error: null },
    private_listings: { data: [validListing], error: null },
    listing_media: { data: validMedia, error: null },
    organisations: { data: [{ id: 'org-1', name: 'Kingstons Real Estate' }], error: null },
    ...overrides,
  }

  function createBuilder(table) {
    const call = { table, filters: [] }
    calls.push(call)
    return {
      select(fields) {
        call.select = fields
        return this
      },
      eq(field, value) {
        call.filters.push(['eq', field, value])
        return this
      },
      is(field, value) {
        call.filters.push(['is', field, value])
        return this
      },
      in(field, value) {
        call.filters.push(['in', field, value])
        return this
      },
      order(field, options) {
        call.filters.push(['order', field, options])
        return this
      },
      limit(value) {
        call.limit = value
        return this
      },
      maybeSingle() {
        call.single = true
        return Promise.resolve({ data: agencyScope, error: null })
      },
      then(resolve, reject) {
        return Promise.resolve(results[table] || { data: [], error: null }).then(resolve, reject)
      },
    }
  }

  return {
    calls,
    from(table) {
      return createBuilder(table)
    },
  }
}

const scopedClient = createFakePublicListingsClient()
const scopedListings = await getPublicListings({
  client: scopedClient,
  agencySlug: 'kingstons',
  host: 'https://www.arch9.co.za',
})

assert.equal(scopedListings.count, 1)
assert.equal(scopedListings.items[0].agencySlug, 'kingstons')
assert.equal(scopedListings.items[0].agencyName, 'Kingstons Real Estate')
assert.equal(scopedListings.items[0].enquiryUrl.includes('/intake/kingstons?intent=buy'), true)
assert.deepEqual(
  scopedClient.calls
    .find((call) => call.table === 'private_listings')
    .filters
    .find((filter) => filter[0] === 'eq' && filter[1] === 'organisation_id'),
  ['eq', 'organisation_id', 'org-1'],
)

const scopedListingsWithUnsetFilters = await getPublicListings({
  client: createFakePublicListingsClient(),
  agencySlug: 'kingstons',
  minPrice: null,
  maxPrice: null,
  bedrooms: null,
  bathrooms: null,
})

assert.equal(scopedListingsWithUnsetFilters.count, 1, 'unset API query filters should not be treated as zero values')

const missingAgencyListings = await getPublicListings({
  client: createFakePublicListingsClient({ agencyScope: null }),
  agencySlug: 'missing-agency',
})

assert.equal(missingAgencyListings.count, 0)
assert.deepEqual(missingAgencyListings.items, [])

const intakeListing = {
  ...validListing,
  id: '22222222-3333-4444-5555-666666666666',
  title: 'Active App Listing',
  bridge_listing_status: 'not_published',
  asking_price: 2100000,
}

const strictUnpublishedListings = await getPublicListings({
  client: createFakePublicListingsClient({
    overrides: {
      listing_publication_data: { data: [{ ...validPublication, listing_id: intakeListing.id, status: 'Draft' }], error: null },
      private_listings: { data: [intakeListing], error: null },
      listing_media: { data: [], error: null },
    },
  }),
  agencySlug: 'kingstons',
})

assert.equal(strictUnpublishedListings.count, 0, 'public listings should stay strict outside agency intake mode')

const agencyIntakeListings = await getPublicListings({
  client: createFakePublicListingsClient({
    overrides: {
      listing_publication_data: { data: [{ ...validPublication, listing_id: intakeListing.id, title: '', status: 'Draft' }], error: null },
      private_listings: { data: [intakeListing], error: null },
      listing_media: { data: [], error: null },
    },
  }),
  agencySlug: 'kingstons',
  audience: 'agency-intake',
})

assert.equal(agencyIntakeListings.count, 1, 'agency intake should show active agency listings before public publication')
assert.equal(agencyIntakeListings.items[0].title, 'Active App Listing')
assert.equal(agencyIntakeListings.items[0].askingPrice, 2100000)
assert.equal(agencyIntakeListings.items[0].coverImageUrl, '')

const createAgencyIntakeClient = () => createFakePublicListingsClient({
  overrides: {
    listing_publication_data: { data: [{ ...validPublication, listing_id: intakeListing.id, title: '', status: 'Draft' }], error: null },
    private_listings: { data: [intakeListing], error: null },
    listing_media: { data: [], error: null },
  },
})

assert.equal(
  (await getPublicListings({
    client: createAgencyIntakeClient(),
    agencySlug: 'kingstons',
    audience: 'agency-intake',
    minPrice: 2400000,
  })).count,
  1,
  'agency intake min price should include listings up to R300,000 below the buyer budget',
)

assert.equal(
  (await getPublicListings({
    client: createAgencyIntakeClient(),
    agencySlug: 'kingstons',
    audience: 'agency-intake',
    minPrice: 2400001,
  })).count,
  0,
  'agency intake min price should exclude listings more than R300,000 below the buyer budget',
)

assert.equal(
  (await getPublicListings({
    client: createAgencyIntakeClient(),
    agencySlug: 'kingstons',
    audience: 'agency-intake',
    maxPrice: 1800000,
  })).count,
  1,
  'agency intake max price should include listings up to R300,000 above the buyer budget',
)

assert.equal(
  (await getPublicListings({
    client: createAgencyIntakeClient(),
    agencySlug: 'kingstons',
    audience: 'agency-intake',
    maxPrice: 1799999,
  })).count,
  0,
  'agency intake max price should exclude listings more than R300,000 above the buyer budget',
)

console.log('publicListingsService tests passed')
