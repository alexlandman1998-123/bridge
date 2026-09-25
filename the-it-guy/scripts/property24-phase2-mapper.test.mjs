import assert from 'node:assert/strict'
import {
  createProperty24ListingPlan,
  resolveProperty24ListingType,
  resolveProperty24PropertyTypeId,
  resolveProperty24Status,
} from '../server/services/property24ListingMapper.js'
import { LISTING_FEATURE_CATALOG } from '../src/services/listings/listingFeatureCatalog.js'
import { PROPERTY24_NATIVE_FACT_FIELDS } from '../server/services/listingFeatureDeliveryReview.js'

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

const largeGallerySelectedBatch = Array.from({ length: 69 }, (_, index) => ({
  media_type: 'image',
  file_url: `https://cdn.example.test/listing/photo-${index + 1}.jpg`,
  ...(index < 20 ? { bytes: `base64-image-data-${index + 1}`, mimeContentType: 'image/jpeg' } : {}),
  sort_order: index,
}))

assert.equal(resolveProperty24ListingType('To Rent'), 'Rental')
assert.equal(resolveProperty24ListingType('For Sale'), 'Sale')
assert.equal(resolveProperty24Status('sold'), 'Sold')
assert.equal(resolveProperty24Status('rented'), 'Rented')
assert.equal(resolveProperty24Status('ReducedPrice'), 'ReducedPrice')
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
  'missing_property24_agency_id',
  'missing_property24_agent_id',
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
  options: { agencyId: 31382, expiryDate: '2026-12-31' },
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

const cappedGalleryReady = createProperty24ListingPlan({
  listing: baseListing,
  publication: basePublication,
  media: largeGallerySelectedBatch,
  agentMapping: baseAgentMapping,
  catalogMapping: baseCatalogMapping,
  options: {
    agencyId: 31382,
    expiryDate: '2026-12-31',
    expectedPhotoPayloadCount: 20,
  },
})

assert.equal(cappedGalleryReady.canSubmit, true)
assert.deepEqual(cappedGalleryReady.technicalBlockers, [])
assert.equal(cappedGalleryReady.summary.imageCount, 69)
assert.equal(cappedGalleryReady.summary.expectedPhotoPayloadCount, 20)
assert.equal(cappedGalleryReady.summary.photoPayloadCount, 20)
assert.equal(cappedGalleryReady.payload.photos.length, 20)

const cappedGalleryMissingSelectedBytes = createProperty24ListingPlan({
  listing: baseListing,
  publication: basePublication,
  media: largeGallerySelectedBatch.map((item, index) => index === 19 ? { ...item, bytes: '' } : item),
  agentMapping: baseAgentMapping,
  catalogMapping: baseCatalogMapping,
  options: {
    agencyId: 31382,
    expiryDate: '2026-12-31',
    expectedPhotoPayloadCount: 20,
  },
})

assert.equal(cappedGalleryMissingSelectedBytes.canSubmit, false)
assert.deepEqual(cappedGalleryMissingSelectedBytes.technicalBlockers, ['listing_image_bytes_not_loaded_for_property24_submit'])

const sandboxPreviewWithoutAgentId = createProperty24ListingPlan({
  listing: baseListing,
  publication: basePublication,
  media: imageWithBytes,
  agentMapping: {},
  catalogMapping: baseCatalogMapping,
  options: {
    agencyId: 31382,
    expiryDate: '2026-12-31',
    environment: 'exdev',
    sandboxPayloadTestMode: true,
  },
})

assert.equal(sandboxPreviewWithoutAgentId.canPreview, true)
assert.equal(sandboxPreviewWithoutAgentId.canSubmit, false)
assert.deepEqual(sandboxPreviewWithoutAgentId.dataBlockers, [])
assert.ok(sandboxPreviewWithoutAgentId.technicalBlockers.includes('sandbox_property24_agent_id_required_before_submit'))
assert.ok(sandboxPreviewWithoutAgentId.qualityWarnings.includes('missing_agent_source_reference'))
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
assert.ok(productionWithoutAgentId.qualityWarnings.includes('missing_agent_source_reference'))

const submitReady = createProperty24ListingPlan({
  listing: baseListing,
  publication: basePublication,
  media: imageWithBytes,
  agentMapping: baseAgentMapping,
  catalogMapping: baseCatalogMapping,
  options: { agencyId: 31382, expiryDate: '2026-12-31' },
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
assert.equal(submitReady.payload.propertyInfo.streetNumber, '12')
assert.equal(submitReady.payload.propertyInfo.streetName, 'Test Road')
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

const selectedFeaturePlan = createProperty24ListingPlan({
  listing: {
    ...baseListing,
    seller_canonical_facts_json: { property24ShowLocation: true },
  },
  publication: {
    ...basePublication,
    parking_bays: 16,
    features: ['flatlet', 'staff_quarters', 'fibre', 'Security'],
  },
  media: imageWithBytes,
  agentMapping: baseAgentMapping,
  catalogMapping: baseCatalogMapping,
  options: { agencyId: 31382, expiryDate: '2026-12-31' },
})

assert.equal(selectedFeaturePlan.payload.propertyFeatures.flatlet, true)
assert.deepEqual(selectedFeaturePlan.payload.propertyFeatures.parking, { parkingSpaces: 16 })
assert.equal(selectedFeaturePlan.payload.propertyInfo.showLocation, true)
assert.match(selectedFeaturePlan.payload.description, /Additional features include staff accommodation, fibre connectivity and Security\./)

const energyAndPetsPlan = createProperty24ListingPlan({
  listing: baseListing,
  publication: { ...basePublication, features: ['solar', 'backup_power', 'pet_friendly'] },
  media: imageWithBytes,
  agentMapping: baseAgentMapping,
  catalogMapping: baseCatalogMapping,
  options: { agencyId: 31382, expiryDate: '2026-12-31' },
})
assert.equal(energyAndPetsPlan.payload.propertyFeatures.petsAllowed, 'Yes')

const typedFeaturePlan = createProperty24ListingPlan({
  listing: { ...baseListing, featureFacts: { study: true, studies: 2, solar_panels: true, pool: false, pet_friendly: false, en_suite: 2 } },
  publication: { ...basePublication, features: ['Pool', 'Pet friendly'] },
  media: imageWithBytes,
  agentMapping: baseAgentMapping,
  catalogMapping: baseCatalogMapping,
  options: { agencyId: 31382, expiryDate: '2026-12-31' },
})
assert.equal(typedFeaturePlan.payload.propertyFeatures.pool, false)
assert.equal(typedFeaturePlan.payload.propertyFeatures.petsAllowed, 'No')
assert.equal(typedFeaturePlan.payload.propertyFeatures.studies, 2)
assert.equal(typedFeaturePlan.payload.propertyFeatures.sustainabilityInfo.solarPanels, true)
assert.match(typedFeaturePlan.payload.description, /Study/)
assert.match(typedFeaturePlan.payload.description, /Solar panels/)
assert.match(typedFeaturePlan.payload.description, /En-suite bathrooms: 2/)
assert.equal(typedFeaturePlan.payload.propertyFeatures.study, undefined)
assert.equal(typedFeaturePlan.payload.propertyFeatures.solarPanels, undefined)

const nativeFeaturePlan = createProperty24ListingPlan({
  listing: { ...baseListing, featureFacts: {
    carports: 2, storeys: 3, balcony: false, solar_panels: false,
    solar_geyser: true, inverter_battery: true, water_tank: true,
    borehole: true, fibre: true, generator: true, backup_water: true,
    wheelchair_accessible: true, pantry: true, alarm: true,
    built_in_cupboards: true,
  } },
  publication: basePublication,
  media: imageWithBytes,
  agentMapping: baseAgentMapping,
  catalogMapping: baseCatalogMapping,
  options: { agencyId: 31382, expiryDate: '2026-12-31' },
})
assert.deepEqual(nativeFeaturePlan.payload.propertyFeatures.parking, { parkingSpaces: 1, carport: true })
assert.equal(nativeFeaturePlan.payload.propertyFeatures.numberOfFloors, 3)
assert.equal(nativeFeaturePlan.payload.propertyFeatures.outsideArea.balcony, false)
assert.equal(nativeFeaturePlan.payload.propertyFeatures.sustainabilityInfo.solarPanels, false)
assert.equal(nativeFeaturePlan.payload.propertyFeatures.sustainabilityInfo.solarGeyser, true)
assert.equal(nativeFeaturePlan.payload.propertyFeatures.sustainabilityInfo.backupBatteryOrInverter, true)
assert.equal(nativeFeaturePlan.payload.propertyFeatures.sustainabilityInfo.waterTank, true)
assert.equal(nativeFeaturePlan.payload.propertyFeatures.sustainabilityInfo.borehole, true)
assert.equal(nativeFeaturePlan.payload.propertyFeatures.internetAccess.fibre, true)
assert.equal(nativeFeaturePlan.payload.propertyFeatures.hasGenerator, true)
assert.equal(nativeFeaturePlan.payload.propertyFeatures.hasBackupWater, true)
assert.equal(nativeFeaturePlan.payload.propertyFeatures.isWheelchairAccessible, true)
assert.deepEqual(nativeFeaturePlan.payload.tags, ['Pantry', 'AlarmSystem'])
assert.ok(!nativeFeaturePlan.payload.tags.includes('Built_inCupboards'), 'Feature-description-only tags need a FeatureType')
assert.equal(createProperty24ListingPlan({
  listing: { ...baseListing, featureFacts: { study: true } }, publication: basePublication,
  media: imageWithBytes, agentMapping: baseAgentMapping, catalogMapping: baseCatalogMapping,
  options: { agencyId: 31382, expiryDate: '2026-12-31' },
}).payload.propertyFeatures.studies, undefined, 'A Study Yes must not invent a count')

for (const [key, path] of Object.entries(PROPERTY24_NATIVE_FACT_FIELDS)) {
  const feature = LISTING_FEATURE_CATALOG.find((item) => item.key === key)
  assert.ok(feature, `${key} needs an agent-facing capture`)
  const value = feature.type === 'count' ? 2 : true
  const plan = createProperty24ListingPlan({
    listing: { ...baseListing, featureFacts: { [key]: value } },
    publication: basePublication,
    media: imageWithBytes,
    agentMapping: baseAgentMapping,
    catalogMapping: baseCatalogMapping,
    options: { agencyId: 31382, expiryDate: '2026-12-31' },
  })
  assert.equal(path.split('.').reduce((item, part) => item?.[part], plan.payload), key === 'pet_friendly' ? 'Yes' : value, `${key} must reach ${path}`)
}

const featureTagPlan = createProperty24ListingPlan({
  listing: { ...baseListing, featureFacts: {
    built_in_cupboards: true, walk_in_closet: true, guest_toilet: true,
    irrigation_system: true, clubhouse: true, lapa: true, squash_court: true,
  } },
  publication: basePublication,
  media: imageWithBytes,
  agentMapping: baseAgentMapping,
  catalogMapping: baseCatalogMapping,
  options: { agencyId: 31382, expiryDate: '2026-12-31' },
})
assert.deepEqual(featureTagPlan.payload.featureTags, [
  { featureType: 'Closet', tags: ['Built_inCupboards'] },
  { featureType: 'Closet', tags: ['Walk_in_closet'] },
  { featureType: 'Bathroom', tags: ['GuestToilet'] },
  { featureType: 'Garden', tags: ['Irrigationsystem'] },
  { featureType: 'SpecialFeature', tags: ['Clubhouse'] },
  { featureType: 'SpecialFeature', tags: ['Lapa'] },
  { featureType: 'SpecialFeature', tags: ['SquashCourt'] },
])
const roomAndRoofPlan = createProperty24ListingPlan({
  listing: { ...baseListing, featureFacts: { family_tv_room: true, kitchen: true, entrance_hall: true, roof_type: 'Tiles' } },
  publication: basePublication, media: imageWithBytes,
  agentMapping: baseAgentMapping, catalogMapping: baseCatalogMapping,
  options: { agencyId: 31382, expiryDate: '2026-12-31' },
})
assert.deepEqual(roomAndRoofPlan.payload.featureTags, [
  { featureType: 'FamilyTVRoom' }, { featureType: 'Kitchen' }, { featureType: 'EntranceHall' },
])
assert.deepEqual(roomAndRoofPlan.payload.tags, ['Tile'])
for (const [choice, tag] of [['Slate', 'Slate'], ['Thatch', 'Thatch'], ['Other', null]]) {
  const plan = createProperty24ListingPlan({
    listing: { ...baseListing, featureFacts: { roof_type: choice } },
    publication: basePublication, media: imageWithBytes,
    agentMapping: baseAgentMapping, catalogMapping: baseCatalogMapping,
    options: { agencyId: 31382, expiryDate: '2026-12-31' },
  })
  assert.equal(plan.payload.tags?.[0] || null, tag)
}

const property24NativeFeatureKeys = new Map([
  ['flatlet', 'flatlet'], ['pool', 'pool'], ['garden', 'garden'], ['pet_friendly', 'petsAllowed'],
  ['studies', 'studies'], ['storeys', 'numberOfFloors'], ['generator', 'hasGenerator'],
  ['backup_water', 'hasBackupWater'], ['wheelchair_accessible', 'isWheelchairAccessible'],
])
for (const feature of LISTING_FEATURE_CATALOG.filter((item) => item.listingTypes.includes('sale'))) {
  const value = feature.type === 'boolean' ? true : feature.type === 'count' ? 2 : feature.options[0]
  const plan = createProperty24ListingPlan({
    listing: { ...baseListing, featureFacts: { [feature.key]: value } },
    publication: basePublication,
    media: imageWithBytes,
    agentMapping: baseAgentMapping,
    catalogMapping: baseCatalogMapping,
    options: { agencyId: 31382, expiryDate: '2026-12-31' },
  })
  assert.equal(plan.canPreview, true, `${feature.key}: ${JSON.stringify(plan.dataBlockers)}`)
  const nativeKey = property24NativeFeatureKeys.get(feature.key)
  if (nativeKey) {
    assert.equal(plan.payload.propertyFeatures[nativeKey], feature.key === 'pet_friendly' ? 'Yes' : feature.type === 'count' ? 2 : true, `${feature.key} must use its confirmed feed field`)
  } else {
    const expected = { staff_quarters: 'staff accommodation', electric_fence: 'electric fencing' }[feature.key] || feature.label.toLowerCase()
    assert.ok(plan.payload.description.toLowerCase().includes(expected), `${feature.key} must have a description fallback`)
  }
}

const soldPricePlan = createProperty24ListingPlan({
  listing: { ...baseListing, listing_status: 'sold', asking_price: 1995000 },
  publication: { ...basePublication, asking_price: 1995000 },
  media: imageWithBytes,
  agentMapping: baseAgentMapping,
  catalogMapping: baseCatalogMapping,
  options: { agencyId: 31382, expiryDate: '2026-12-31' },
})
assert.equal(soldPricePlan.canPreview, true)
assert.equal(soldPricePlan.payload.status, 'Sold')
assert.equal(soldPricePlan.payload.price, 1995000)
const reducedPricePlan = createProperty24ListingPlan({
  listing: { ...baseListing, asking_price: 1995000 },
  publication: { ...basePublication, asking_price: 1995000 },
  media: imageWithBytes,
  agentMapping: baseAgentMapping,
  catalogMapping: baseCatalogMapping,
  existingSync: { listingNumber: 123456 },
  options: { agencyId: 31382, expiryDate: '2026-12-31', status: 'ReducedPrice', photosChanged: false },
})
assert.equal(reducedPricePlan.canSubmit, true, JSON.stringify({ dataBlockers: reducedPricePlan.dataBlockers, technicalBlockers: reducedPricePlan.technicalBlockers }))
assert.equal(reducedPricePlan.payload.status, 'ReducedPrice')
assert.equal(reducedPricePlan.payload.price, 1995000)
assert.equal(reducedPricePlan.payload.photos, null, 'A price-only update must not remove or retransmit unchanged photos')
assert.ok(createProperty24ListingPlan({
  listing: baseListing, publication: basePublication, media: imageWithBytes,
  agentMapping: baseAgentMapping, catalogMapping: baseCatalogMapping,
  options: { agencyId: 31382, expiryDate: '2026-12-31', status: 'ReducedPrice' },
}).dataBlockers.includes('reduced_price_status_requires_existing_listing'))
assert.match(energyAndPetsPlan.payload.description, /Solar power/)
assert.match(energyAndPetsPlan.payload.description, /Backup power/)
assert.equal(energyAndPetsPlan.payload.propertyInfo.municipalRatesAndTaxes.amount, 1300)

const missingResidentialQuality = createProperty24ListingPlan({
  listing: { ...baseListing, title: '' },
  publication: {
    ...basePublication,
    title: '',
    floor_size: '',
    bedrooms: '',
    bathrooms: '',
  },
  media: imageWithBytes,
  agentMapping: baseAgentMapping,
  catalogMapping: baseCatalogMapping,
  options: { agencyId: 31382, expiryDate: '2026-12-31' },
})

assert.equal(missingResidentialQuality.canPreview, true)
assert.equal(missingResidentialQuality.canSubmit, true)
for (const warning of ['missing_marketing_title', 'missing_floor_size', 'missing_bedrooms', 'missing_bathrooms']) {
  assert.ok(missingResidentialQuality.qualityWarnings.includes(warning), `Expected residential quality warning ${warning}`)
}

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
  options: { agencyId: 31382, expiryDate: '2026-12-31' },
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
  existingSync: { listingNumber: 987654, agencyId: 31382 },
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

const migratedUpdateWithoutExplicitExpiry = createProperty24ListingPlan({
  listing: {
    ...baseListing,
    seller_canonical_facts_json: { property24Import: { expiryDate: '2026-12-31' } },
  },
  publication: basePublication,
  media: imageUrlOnly,
  agentMapping: baseAgentMapping,
  catalogMapping: baseCatalogMapping,
  existingSync: { listingNumber: 987654, agencyId: 31382 },
  options: { photosChanged: false },
})

assert.equal(migratedUpdateWithoutExplicitExpiry.canSubmit, true)
assert.equal(migratedUpdateWithoutExplicitExpiry.payload.expiryDate, '2026-12-31T00:00:00.000Z')
assert.equal(migratedUpdateWithoutExplicitExpiry.payload.photos, null)

console.log('Property24 Phase 2 mapper contract passed')
