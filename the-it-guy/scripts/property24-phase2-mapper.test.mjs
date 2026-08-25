import assert from 'node:assert/strict'
import {
  createProperty24ListingPlan,
  resolveProperty24ListingType,
  resolveProperty24PropertyTypeId,
  resolveProperty24Status,
} from '../server/services/property24ListingMapper.js'

const baseListing = {
  id: 'listing-1',
  listing_reference: 'ARCH9-LISTING-001',
  listing_status: 'active',
  title: 'Modern Family Home',
  address_line_1: '12 Test Road',
  property_type: 'house',
  asking_price: 2450000,
}

const basePublication = {
  title: 'Modern Family Home',
  listing_type: 'Sale',
  property_type: 'House',
  asking_price: 2450000,
  bedrooms: 3,
  bathrooms: 2,
  garages: 2,
  parking_bays: 1,
  erf_size: 520,
  floor_size: 220,
  rates_taxes: 1300,
  levies: 0,
  description: 'A polished public-facing description for Property24.',
}

const baseAgentMapping = {
  property24AgentId: 77959,
  sourceReference: 'ARCH9-AGENT-001',
}

const baseCatalogMapping = {
  suburbId: 12345,
}

const imageUrlOnly = [
  {
    media_type: 'image',
    file_url: 'https://cdn.example.test/listing/front.jpg',
    caption: 'Front view',
    is_cover: true,
  },
]

const imageWithBytes = [
  {
    media_type: 'image',
    bytes: 'base64-image-data',
    mimeContentType: 'image/jpeg',
    caption: 'Front view',
    is_cover: true,
  },
]

assert.equal(resolveProperty24ListingType('To Rent'), 'Rental')
assert.equal(resolveProperty24ListingType('For Sale'), 'Sale')
assert.equal(resolveProperty24Status('sold'), 'Sold')
assert.equal(resolveProperty24Status('active', { isNew: true }), 'NewListing')
assert.equal(resolveProperty24Status('active', { isNew: false }), 'Active')
assert.equal(resolveProperty24PropertyTypeId('Apartment'), 5)
assert.equal(resolveProperty24PropertyTypeId('warehouse'), 12)
assert.equal(resolveProperty24PropertyTypeId('small_holding'), 10)

const missing = createProperty24ListingPlan({
  listing: {},
  publication: {},
  media: [],
  agentMapping: {},
  catalogMapping: {},
  options: { agencyId: null },
})

for (const blocker of [
  'missing_property24_agent_id',
  'missing_agent_source_reference',
  'missing_description',
  'missing_expiry_date',
  'missing_property24_suburb_id',
  'missing_property24_property_type_id',
  'missing_price_or_poa',
  'missing_listing_image',
]) {
  assert.ok(missing.dataBlockers.includes(blocker), `Expected blocker ${blocker}`)
}
assert.equal(missing.canPreview, false)
assert.equal(missing.canSubmit, false)
assert.equal(missing.payload, null)

const previewOnly = createProperty24ListingPlan({
  listing: baseListing,
  publication: basePublication,
  media: imageUrlOnly,
  agentMapping: baseAgentMapping,
  catalogMapping: baseCatalogMapping,
  options: { expiryDate: '2026-12-31' },
})

assert.equal(previewOnly.canPreview, true)
assert.equal(previewOnly.canSubmit, false)
assert.deepEqual(previewOnly.dataBlockers, [])
assert.deepEqual(previewOnly.technicalBlockers, ['listing_image_bytes_not_loaded_for_property24_submit'])
assert.equal(previewOnly.summary.agencyId, 31382)
assert.deepEqual(previewOnly.summary.contactAgentIds, [77959])
assert.equal(previewOnly.summary.propertyTypeId, 4)
assert.equal(previewOnly.summary.suburbId, 12345)
assert.equal(previewOnly.summary.imageCount, 1)
assert.equal(previewOnly.previewPayload.agencyId, 31382)
assert.deepEqual(previewOnly.previewPayload.contactAgentIds, [77959])
assert.equal(previewOnly.previewPayload.photos.length, 1)
assert.equal(previewOnly.previewPayload.photos[0].sourceUrl, 'https://cdn.example.test/listing/front.jpg')
assert.equal(previewOnly.previewPayload.photos[0].bytesLoaded, false)
assert.equal(previewOnly.payload, null)

const sandboxPreviewWithoutAgentId = createProperty24ListingPlan({
  listing: baseListing,
  publication: basePublication,
  media: imageWithBytes,
  agentMapping: {},
  catalogMapping: baseCatalogMapping,
  options: {
    expiryDate: '2026-12-31',
    environment: 'exdev',
    sandboxPayloadTestMode: true,
  },
})

assert.equal(sandboxPreviewWithoutAgentId.canPreview, true)
assert.equal(sandboxPreviewWithoutAgentId.canSubmit, false)
assert.deepEqual(sandboxPreviewWithoutAgentId.dataBlockers, [])
assert.ok(sandboxPreviewWithoutAgentId.technicalBlockers.includes('sandbox_property24_agent_id_required_before_submit'))
assert.ok(sandboxPreviewWithoutAgentId.technicalBlockers.includes('sandbox_agent_source_reference_required_before_submit'))
assert.deepEqual(sandboxPreviewWithoutAgentId.previewPayload.contactAgentIds, [])
assert.equal(sandboxPreviewWithoutAgentId.payload, null)
assert.equal(sandboxPreviewWithoutAgentId.summary.sandboxPayloadTestMode, true)
assert.equal(sandboxPreviewWithoutAgentId.summary.agentMappingRequiredBeforeSubmit, true)

const productionWithoutAgentId = createProperty24ListingPlan({
  listing: baseListing,
  publication: basePublication,
  media: imageWithBytes,
  agentMapping: {},
  catalogMapping: baseCatalogMapping,
  options: {
    expiryDate: '2026-12-31',
    environment: 'production',
    sandboxPayloadTestMode: true,
  },
})

assert.equal(productionWithoutAgentId.canPreview, false)
assert.ok(productionWithoutAgentId.dataBlockers.includes('missing_property24_agent_id'))
assert.ok(productionWithoutAgentId.dataBlockers.includes('missing_agent_source_reference'))

const submitReady = createProperty24ListingPlan({
  listing: baseListing,
  publication: basePublication,
  media: imageWithBytes,
  agentMapping: baseAgentMapping,
  catalogMapping: baseCatalogMapping,
  options: { expiryDate: '2026-12-31' },
})

assert.equal(submitReady.canPreview, true)
assert.equal(submitReady.canSubmit, true)
assert.equal(submitReady.payload.agencyId, 31382)
assert.deepEqual(submitReady.payload.contactAgentIds, [77959])
assert.equal(submitReady.payload.listingType, 'Sale')
assert.equal(submitReady.payload.status, 'NewListing')
assert.equal(submitReady.payload.price, 2450000)
assert.equal(submitReady.payload.isPOA, false)
assert.equal(submitReady.payload.listingVisibility, 'Public')
assert.equal(submitReady.payload.propertyInfo.suburbId, 12345)
assert.equal(submitReady.payload.propertyInfo.propertyTypeId, 4)
assert.equal(submitReady.payload.propertyInfo.erf.size, 520)
assert.equal(submitReady.payload.propertyInfo.floorArea.size, 220)
assert.equal(submitReady.payload.propertyFeatures.bedrooms, 3)
assert.equal(submitReady.payload.propertyFeatures.bathrooms.bathrooms, 2)
assert.equal(submitReady.payload.propertyFeatures.garages, 2)
assert.equal(submitReady.payload.propertyFeatures.garden, false)
assert.equal(submitReady.payload.propertyFeatures.pool, false)
assert.equal(submitReady.payload.propertyFeatures.flatlet, false)
assert.equal(submitReady.payload.propertyFeatures.petsAllowed, 'DontKnow')
assert.equal(submitReady.payload.propertyFeatures.furnishedStatus, 'No')
assert.equal(submitReady.payload.photos.length, 1)
assert.equal(submitReady.payload.photos[0].bytes, 'base64-image-data')
assert.equal(submitReady.previewPayload.photos[0].bytesLoaded, true)

const poaViaPublicationFeature = createProperty24ListingPlan({
  listing: { ...baseListing, asking_price: 0 },
  publication: {
    ...basePublication,
    asking_price: 0,
    features: ['price_on_application'],
  },
  media: imageWithBytes,
  agentMapping: baseAgentMapping,
  catalogMapping: baseCatalogMapping,
  options: { expiryDate: '2026-12-31' },
})

assert.equal(poaViaPublicationFeature.canPreview, true)
assert.equal(poaViaPublicationFeature.payload.price, 0)
assert.equal(poaViaPublicationFeature.payload.isPOA, true)

const updateWithoutPhotoChange = createProperty24ListingPlan({
  listing: baseListing,
  publication: basePublication,
  media: imageUrlOnly,
  agentMapping: baseAgentMapping,
  catalogMapping: baseCatalogMapping,
  existingSync: { listingNumber: 987654 },
  options: {
    expiryDate: '2026-12-31',
    photosChanged: false,
  },
})

assert.equal(updateWithoutPhotoChange.canPreview, true)
assert.equal(updateWithoutPhotoChange.canSubmit, true)
assert.equal(updateWithoutPhotoChange.payload.listingNumber, 987654)
assert.equal(updateWithoutPhotoChange.payload.status, 'Active')
assert.equal(updateWithoutPhotoChange.payload.photos, null)

console.log('Property24 Phase 2 mapper contract passed')
