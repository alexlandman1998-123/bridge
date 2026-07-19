import assert from 'node:assert/strict'
import {
  createListingSlug,
  isPublicListingEligible,
  mapPublicListingContract,
} from '../services/publicListingsService.js'

const validListing = {
  id: '11111111-2222-3333-4444-555555555555',
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
  'agentName',
  'amenities',
  'askingPrice',
  'bathrooms',
  'bedrooms',
  'coverImageUrl',
  'description',
  'erfSize',
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
assert.equal(contract.coverImageUrl, 'https://cdn.example.com/cover.jpg')
assert.equal(contract.features.length, 2)

console.log('publicListingsService tests passed')
