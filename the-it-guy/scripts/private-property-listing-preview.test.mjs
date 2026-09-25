import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
  createPrivatePropertyArch9ListingPreview,
  createPrivatePropertySandboxFixture,
  fetchArch9ListingForPrivatePropertyPreview,
  fetchRecentArch9ListingsForPrivatePropertyPreview,
} from '../server/services/privatePropertyListingPreviewService.js'
import {
  createPrivatePropertyListingPlan,
  resolvePrivatePropertyCategory,
  resolvePrivatePropertyMandateType,
  resolvePrivatePropertyProvince,
} from '../server/services/privatePropertyListingMapper.js'
import { LISTING_FEATURE_CATALOG } from '../src/services/listings/listingFeatureCatalog.js'

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

assert.equal(resolvePrivatePropertyCategory('House'), 'Residential')
assert.equal(resolvePrivatePropertyCategory('Commercial Property'), 'Commercial')
assert.equal(resolvePrivatePropertyCategory('Vacant Land'), 'Land')
assert.equal(resolvePrivatePropertyCategory('Farm'), 'Farms')
assert.equal(resolvePrivatePropertyCategory('agricultural'), 'Farms')
assert.equal(resolvePrivatePropertyProvince('Western Cape'), 'WesternCape')
assert.equal(resolvePrivatePropertyMandateType({ listingType: 'Sale', value: 'sole mandate' }), 'FullMandate')

const fixture = createPrivatePropertySandboxFixture('rental-residential')
const rentalPreview = createPrivatePropertyArch9ListingPreview({
  ...fixture,
  agentMapping: { agentIds: 'ARCH9-SANDBOX-USER-1' },
  options: {
    ...fixture.options,
    branchGuid: 'CA167B18-C6DC-49AD-B018-2B72B187918F',
    agentIds: 'ARCH9-SANDBOX-USER-1',
    suburbId: '12345',
  },
})

assert.equal(rentalPreview.status, 'PREVIEW_READY')
assert.equal(rentalPreview.canPreview, true)
assert.equal(rentalPreview.canSubmit, false)
assert.deepEqual(rentalPreview.dataBlockers, [])
assert.equal(rentalPreview.summary.listingType, 'Rental')
assert.equal(rentalPreview.summary.category, 'Residential')
assert.equal(rentalPreview.summary.mandateType, 'Rental')
assert.equal(rentalPreview.summary.propertyStatus, 'ToLet')
assert.equal(rentalPreview.summary.imageUrlCount, 3)
assert.doesNotMatch(rentalPreview.listingXml, /<UpdateListing/, 'preview should not include SOAP wrapper')
assert.match(rentalPreview.listingXml, /<ListingImport>/)
assert.match(rentalPreview.listingXml, /<BranchId>CA167B18-C6DC-49AD-B018-2B72B187918F<\/BranchId>/)
assert.match(rentalPreview.listingXml, /<AgentId>ARCH9-SANDBOX-USER-1<\/AgentId>/)
assert.match(rentalPreview.listingXml, /<ListingType>Rental<\/ListingType>/)
assert.match(rentalPreview.listingXml, /<PropertyStatus>ToLet<\/PropertyStatus>/)
assert.match(rentalPreview.listingXml, /<SuburbId>12345<\/SuburbId>/)
assert.match(rentalPreview.listingXml, /<PhotoUrls><string>https:\/\/cdn\.arch9\.co\.za\/private-property\/rental-residential-1\.jpg<\/string>/)
assert.equal(rentalPreview.safety.privatePropertyApiCalled, false)
assert.equal(rentalPreview.safety.databaseWritten, false)
assert.equal(rentalPreview.safety.listingPublished, false)

const blocked = createPrivatePropertyListingPlan({
  listing: { id: 'blocked-listing', listing_type: 'Sale' },
  publication: {},
  media: [],
  agentMapping: {},
  options: {},
})
assert.equal(blocked.canPreview, false)
for (const blocker of [
  'missing_private_property_branch_guid',
  'missing_private_property_agent_id',
  'missing_description',
  'missing_or_invalid_price',
  'minimum_three_listing_image_urls_required',
]) {
  assert.ok(blocked.dataBlockers.includes(blocker), `expected blocker ${blocker}`)
}

const inferredAddressPlan = createPrivatePropertyListingPlan({
  listing: {
    id: 'inferred-street-address',
    listing_status: 'active',
    listing_reference: 'PP-INFER-001',
    address_line_1: '99 Ridge Road',
    formatted_address: '99 Ridge Road, Bartlett, Boksburg, 1472',
    suburb: 'Bartlett',
    city: 'Boksburg',
    province: 'Gauteng',
    property_type: 'House',
    asking_price: 1000000,
    created_at: '2026-08-26T08:00:00.000Z',
  },
  publication: {
    title: 'Combined address listing',
    listing_type: 'Sale',
    property_type: 'House',
    asking_price: 1000000,
    bedrooms: 2,
    bathrooms: 1,
    description: 'A listing with a combined street address.',
  },
  media: [
    { media_type: 'image', file_url: 'https://cdn.example.com/one.jpg' },
    { media_type: 'image', file_url: 'https://cdn.example.com/two.jpg' },
    { media_type: 'image', file_url: 'https://cdn.example.com/three.jpg' },
  ],
  agentMapping: { agentIds: 'ARCH9-SANDBOX-USER-1' },
  options: {
    branchGuid: 'CA167B18-C6DC-49AD-B018-2B72B187918F',
    suburbId: '12345',
  },
})
assert.equal(inferredAddressPlan.canPreview, true)
assert.equal(inferredAddressPlan.payload.address.streetNumber, '99')
assert.equal(inferredAddressPlan.payload.address.streetName, 'Ridge Road')
assert.doesNotMatch(inferredAddressPlan.listingXml, /<StreetName>99 Ridge Road<\/StreetName>/)
assert.match(inferredAddressPlan.listingXml, /<StreetNumber>99<\/StreetNumber>/)

const normalizedFeaturePlan = createPrivatePropertyListingPlan({
  listing: {
    ...inferredAddressPlan.payload,
    id: 'normalized-feature-listing',
    listing_reference: 'PP-FEATURE-001',
    listing_status: 'active',
    address_line_1: '16 Main Road',
    suburb: 'Capital Park',
    city: 'Pretoria',
    province: 'Gauteng',
    property_type: 'House',
    asking_price: 2050000,
    created_at: '2026-09-21T08:00:00.000Z',
    exactAddressVisibility: 'hide_street_address',
  },
  publication: {
    title: 'Feature parity listing',
    listing_type: 'Sale',
    property_type: 'House',
    asking_price: 2050000,
    bedrooms: 5,
    bathrooms: 4,
    garages: 2,
    parking_bays: 16,
    description: 'A complete portal feature test.',
    features: ['Flatlet', 'Staff Quarters', 'Fibre', 'Security'],
  },
  media: [
    { media_type: 'image', file_url: 'https://cdn.example.com/feature-one.jpg' },
    { media_type: 'image', file_url: 'https://cdn.example.com/feature-two.jpg' },
    { media_type: 'image', file_url: 'https://cdn.example.com/feature-three.jpg' },
  ],
  agentMapping: { agentIds: 'ARCH9-SANDBOX-USER-1' },
  options: { branchGuid: 'CA167B18-C6DC-49AD-B018-2B72B187918F', suburbId: '309' },
})
assert.equal(normalizedFeaturePlan.canPreview, true)
assert.match(normalizedFeaturePlan.listingXml, /<AttributeType>Parking<\/AttributeType><Value>16<\/Value>/)
assert.match(normalizedFeaturePlan.listingXml, /<AttributeType>Flatlet<\/AttributeType><Value>Yes<\/Value>/)
assert.match(normalizedFeaturePlan.listingXml, /<AttributeType>StaffQuarters<\/AttributeType><Value>Yes<\/Value>/)
assert.match(normalizedFeaturePlan.listingXml, /Additional features include fibre connectivity and Security\./)

const typedFeaturePlan = createPrivatePropertyListingPlan({
  listing: { id: 'typed-feature-listing', listing_reference: 'PP-TYPED-001', listing_status: 'active',
    address_line_1: '16 Main Road', suburb: 'Capital Park', city: 'Pretoria', province: 'Gauteng',
    property_type: 'House', asking_price: 2050000, created_at: '2026-09-21T08:00:00.000Z', featureFacts: {
    study: true, air_conditioning: false, en_suite: 2, roof_type: 'Tiles',
    solar_panels: true, pool: false, borehole: true,
  } },
  publication: { title: 'Typed features', listing_type: 'Sale', property_type: 'House', asking_price: 2050000, bedrooms: 3, bathrooms: 2,
    description: 'A family home.', features: ['Air conditioning', 'Pool'] },
  media: [1, 2, 3].map((index) => ({ media_type: 'image', file_url: `https://cdn.example.com/typed-${index}.jpg` })),
  agentMapping: { agentIds: 'ARCH9-SANDBOX-USER-1' },
  options: { branchGuid: 'CA167B18-C6DC-49AD-B018-2B72B187918F', suburbId: '309' },
})
assert.equal(typedFeaturePlan.canPreview, true, JSON.stringify(typedFeaturePlan.dataBlockers))
assert.match(typedFeaturePlan.listingXml, /<AttributeType>Study<\/AttributeType><Value>Yes<\/Value>/)
assert.match(typedFeaturePlan.listingXml, /<AttributeType>Aircon<\/AttributeType><Value>No<\/Value>/)
assert.match(typedFeaturePlan.listingXml, /<AttributeType>EnSuite<\/AttributeType><Value>2<\/Value>/)
assert.match(typedFeaturePlan.listingXml, /<AttributeType>RoofType<\/AttributeType><Value>Tiles<\/Value>/)
assert.match(typedFeaturePlan.listingXml, /<AttributeType>Pool<\/AttributeType><Value>No<\/Value>/)
assert.doesNotMatch(typedFeaturePlan.listingXml, /<AttributeType>Borehole<\/AttributeType>/)
assert.doesNotMatch(typedFeaturePlan.listingXml, /<AttributeType>Solar/)
assert.match(typedFeaturePlan.listingXml, /Solar panels/)
assert.doesNotMatch(typedFeaturePlan.listingXml, /Additional features include[^<]*Air conditioning/)

// Independent Rev 4.7 Appendix A expectations: every direct-sale catalogue fact
// must be native in Residential or remain visibly represented in the description.
const residentialNativeFeatureAttributes = {
  en_suite: 'EnSuite', lounges: 'Lounges', dining_areas: 'DiningAreas', carports: 'Carports', storeys: 'Storeys',
  roof_type: 'RoofType', finishes: 'Finishes', study: 'Study', staff_quarters: 'StaffQuarters',
  pool: 'Pool', flatlet: 'Flatlet', satellite: 'Satelite', tv: 'TV', air_conditioning: 'Aircon',
  alarm: 'Alarm', scenic_view: 'ScenicView', sea_view: 'SeaView', walk_in_closet: 'WalkInCloset',
  built_in_cupboards: 'BuiltInCupboards', wheelchair_accessible: 'HandicapAvailable',
  balcony: 'Balcony', deck: 'Deck', access_gate: 'AccessGate', security_post: 'SecurityPost',
  tennis_court: 'TennisCourt', squash_court: 'SquashCourt', clubhouse: 'Clubhouse', gym: 'Gym',
  golf: 'Golf', jacuzzi: 'Jacuzzi', patio: 'Patio', storage: 'Storage', fence: 'Fence',
  laundry: 'Laundry', kitchen: 'Kitchen', lapa: 'Lapa', electric_fence: 'Electric Fencing',
  built_in_braai: 'Built-in-Braai', fireplace: 'Fireplace', garden_cottage: 'Garden Cottage',
  jetty_berth: 'Jetty Berth', scullery: 'Scullery', pantry: 'Pantry', guest_toilet: 'Guest Toilet',
  entrance_hall: 'Entrance hall', irrigation_system: 'Irrigation System', paving: 'Paving',
  intercom: 'Intercom', family_tv_room: 'Family/TV Room', garden: 'Garden', pet_friendly: 'PetsAllowed',
}
const featureJourneyListing = {
  id: 'pp-feature-journey', listing_reference: 'PP-JOURNEY-001', listing_status: 'active',
  address_line_1: '16 Main Road', suburb: 'Capital Park', city: 'Pretoria', province: 'Gauteng',
  property_type: 'House', asking_price: 2050000, created_at: '2026-09-21T08:00:00.000Z',
}
const featureJourneyPublication = {
  title: 'Feature journey', listing_type: 'Sale', property_type: 'House', asking_price: 2050000,
  bedrooms: 3, bathrooms: 2, description: 'A family home.',
}
for (const feature of LISTING_FEATURE_CATALOG.filter((item) => item.listingTypes.includes('sale'))) {
  const value = feature.type === 'boolean' ? true : feature.type === 'count' ? 2 : feature.options[0]
  const plan = createPrivatePropertyListingPlan({
    listing: { ...featureJourneyListing, featureFacts: { [feature.key]: value } },
    publication: featureJourneyPublication,
    media: [1, 2, 3].map((index) => ({ media_type: 'image', file_url: `https://cdn.example.com/journey-${index}.jpg` })),
    agentMapping: { agentIds: 'ARCH9-SANDBOX-USER-1' },
    options: { branchGuid: 'CA167B18-C6DC-49AD-B018-2B72B187918F', suburbId: '309' },
  })
  assert.equal(plan.canPreview, true, `${feature.key}: ${JSON.stringify(plan.dataBlockers)}`)
  const attribute = residentialNativeFeatureAttributes[feature.key]
  if (attribute) {
    assert.ok(plan.payload.attributes.some((item) => item.attributeType === attribute && item.value === String(value === true ? 'Yes' : value)), `${feature.key} must map to ${attribute}`)
  } else {
    assert.ok(plan.payload.description.toLowerCase().includes(feature.key === 'borehole' ? 'borehole' : feature.label.toLowerCase()), `${feature.key} must have a description fallback`)
  }
}

const studiesCountPlan = createPrivatePropertyListingPlan({
  listing: { ...featureJourneyListing, featureFacts: { studies: 2 } },
  publication: featureJourneyPublication,
  media: [1, 2, 3].map((index) => ({ media_type: 'image', file_url: `https://cdn.example.com/study-${index}.jpg` })),
  agentMapping: { agentIds: 'ARCH9-SANDBOX-USER-1' },
  options: { branchGuid: 'CA167B18-C6DC-49AD-B018-2B72B187918F', suburbId: '309' },
})
assert.ok(studiesCountPlan.payload.attributes.some((item) => item.attributeType === 'Study' && item.value === 'Yes'))

const energyAndPetsPlan = createPrivatePropertyListingPlan({
  listing: {
    id: 'energy-feature-listing',
    listing_reference: 'PP-ENERGY-001',
    listing_status: 'active',
    address_line_1: '16 Main Road',
    suburb: 'Capital Park',
    city: 'Pretoria',
    province: 'Gauteng',
    property_type: 'House',
    asking_price: 2050000,
    created_at: '2026-09-21T08:00:00.000Z',
  },
  publication: {
    title: 'Energy and pets listing',
    listing_type: 'Sale',
    property_type: 'House',
    asking_price: 2050000,
    bedrooms: 3,
    bathrooms: 2,
    description: 'A complete portal feature test.',
    features: ['solar', 'backup_power', 'pet_friendly'],
    rates_taxes: 1300,
    levies: 400,
  },
  media: [
    { media_type: 'image', file_url: 'https://cdn.example.com/feature-one.jpg' },
    { media_type: 'image', file_url: 'https://cdn.example.com/feature-two.jpg' },
    { media_type: 'image', file_url: 'https://cdn.example.com/feature-three.jpg' },
  ],
  agentMapping: { agentIds: 'ARCH9-SANDBOX-USER-1' },
  options: { branchGuid: 'CA167B18-C6DC-49AD-B018-2B72B187918F', suburbId: '309' },
})
assert.match(energyAndPetsPlan.listingXml, /<AttributeType>PetsAllowed<\/AttributeType><Value>Yes<\/Value>/)
assert.match(energyAndPetsPlan.listingXml, /<AttributeType>Rates<\/AttributeType><Value>1300<\/Value>/)
assert.match(energyAndPetsPlan.listingXml, /<AttributeType>Levies<\/AttributeType><Value>400<\/Value>/)
assert.match(energyAndPetsPlan.listingXml, /Solar power/)
assert.match(normalizedFeaturePlan.listingXml, /<HideStreetName>true<\/HideStreetName>/)
assert.match(normalizedFeaturePlan.listingXml, /<HideStreetNo>true<\/HideStreetNo>/)

const landFixture = createPrivatePropertySandboxFixture('sale-land')
const landPreview = createPrivatePropertyArch9ListingPreview({
  ...landFixture,
  agentMapping: { agentIds: 'ARCH9-SANDBOX-USER-1' },
  options: {
    ...landFixture.options,
    branchGuid: 'CA167B18-C6DC-49AD-B018-2B72B187918F',
    agentIds: 'ARCH9-SANDBOX-USER-1',
    suburbId: '12345',
  },
})
assert.equal(landPreview.status, 'PREVIEW_READY')
assert.equal(landPreview.summary.category, 'Land')
assert.match(landPreview.listingXml, /<AttributeType>LandArea<\/AttributeType>/)
assert.match(landPreview.listingXml, /<AttributeType>LandType<\/AttributeType>/)

const farmFixture = createPrivatePropertySandboxFixture('sale-farm-auction')
const farmPreview = createPrivatePropertyArch9ListingPreview({
  ...farmFixture,
  agentMapping: { agentIds: 'ARCH9-SANDBOX-USER-1,ARCH9-SANDBOX-USER-2' },
  options: {
    ...farmFixture.options,
    branchGuid: 'CA167B18-C6DC-49AD-B018-2B72B187918F',
    agentIds: 'ARCH9-SANDBOX-USER-1,ARCH9-SANDBOX-USER-2',
    suburbId: '12345',
  },
})
assert.equal(farmPreview.status, 'PREVIEW_READY')
assert.equal(farmPreview.summary.category, 'Farms')
assert.equal(farmPreview.summary.mandateType, 'AuctionOnly')
assert.deepEqual(farmPreview.summary.agentIds, ['ARCH9-SANDBOX-USER-1', 'ARCH9-SANDBOX-USER-2'])
assert.match(farmPreview.listingXml, /<AgentId>ARCH9-SANDBOX-USER-1,ARCH9-SANDBOX-USER-2<\/AgentId>/)
assert.match(farmPreview.listingXml, /<AttributeType>FarmName<\/AttributeType>/)

const farmFeaturePreview = createPrivatePropertyArch9ListingPreview({
  ...farmFixture,
  listing: { ...farmFixture.listing, featureFacts: { borehole: true, garden: true, study: false } },
  agentMapping: { agentIds: 'ARCH9-SANDBOX-USER-1' },
  options: { ...farmFixture.options, branchGuid: 'CA167B18-C6DC-49AD-B018-2B72B187918F', suburbId: '12345' },
})
assert.equal(farmFeaturePreview.canPreview, true)
assert.match(farmFeaturePreview.listingXml, /<AttributeType>Borehole<\/AttributeType><Value>Yes<\/Value>/)
assert.match(farmFeaturePreview.listingXml, /<AttributeType>Study<\/AttributeType><Value>No<\/Value>/)
assert.doesNotMatch(farmFeaturePreview.listingXml, /<AttributeType>Garden<\/AttributeType>/)
assert.match(farmFeaturePreview.listingXml, /Additional features include Garden/)

const rentalFeaturePreview = createPrivatePropertyArch9ListingPreview({
  ...fixture,
  listing: { ...fixture.listing, featureFacts: { water_included: true, electricity_included: false } },
  agentMapping: { agentIds: 'ARCH9-SANDBOX-USER-1' },
  options: { ...fixture.options, branchGuid: 'CA167B18-C6DC-49AD-B018-2B72B187918F', suburbId: '12345' },
})
assert.equal(rentalFeaturePreview.canPreview, true)
assert.match(rentalFeaturePreview.listingXml, /<AttributeType>WaterIncluded<\/AttributeType><Value>Yes<\/Value>/)
assert.match(rentalFeaturePreview.listingXml, /<AttributeType>ElectrictyIncluded<\/AttributeType><Value>No<\/Value>/)

const soldFeaturePreview = createPrivatePropertyListingPlan({
  listing: { ...featureJourneyListing, listing_status: 'sold', asking_price: 1995000 },
  publication: { ...featureJourneyPublication, asking_price: 1995000 },
  media: [1, 2, 3].map((index) => ({ media_type: 'image', file_url: `https://cdn.example.com/sold-${index}.jpg` })),
  agentMapping: { agentIds: 'ARCH9-SANDBOX-USER-1' },
  options: { branchGuid: 'CA167B18-C6DC-49AD-B018-2B72B187918F', suburbId: '309' },
})
assert.equal(soldFeaturePreview.canPreview, true)
assert.equal(soldFeaturePreview.payload.propertyStatus, 'Sold')
assert.equal(soldFeaturePreview.payload.price, 1995000)

const illegalDescription = createPrivatePropertyListingPlan({
  ...fixture,
  agentMapping: { agentIds: 'ARCH9-SANDBOX-USER-1' },
  options: {
    ...fixture.options,
    branchGuid: 'CA167B18-C6DC-49AD-B018-2B72B187918F',
    agentIds: 'ARCH9-SANDBOX-USER-1',
    suburbId: '12345',
  },
  publication: {
    ...fixture.publication,
    description: 'Visit https://example.com or call 067 612 5009 for details.',
  },
})
assert.ok(illegalDescription.dataBlockers.includes('illegal_description_web_address'))
assert.ok(illegalDescription.dataBlockers.includes('illegal_description_phone_number'))

const listingId = 'arch9-private-property-preview-001'
const fakeClient = createFakeClient({
  private_listings: [
    {
      id: listingId,
      listing_reference: 'ARCH9-PP-001',
      listing_status: 'active',
      title: 'Private Property DB Preview',
      street_name: 'Database Street',
      street_number: '22',
      suburb: 'Sandton',
      city: 'Sandton',
      province: 'Gauteng',
      property_type: 'House',
      asking_price: 2200000,
      created_at: '2026-08-24T08:00:00.000Z',
      updated_at: '2026-08-24T08:00:00.000Z',
    },
  ],
  listing_publication_data: [
    {
      listing_id: listingId,
      title: 'Private Property DB Preview',
      listing_type: 'Sale',
      property_type: 'House',
      asking_price: 2200000,
      bedrooms: 3,
      bathrooms: 2,
      description: 'A database-shaped listing for Private Property preview.',
    },
  ],
  private_listing_seller_onboarding: [{ private_listing_id: listingId, form_data: { featureFacts: { study: true, pool: false } } }],
  listing_media: [
    { listing_id: listingId, media_type: 'image', file_url: 'https://cdn.example.com/one.jpg', sort_order: 0 },
    { listing_id: listingId, media_type: 'image', file_url: 'https://cdn.example.com/two.jpg', sort_order: 1 },
    { listing_id: listingId, media_type: 'image', file_url: 'https://cdn.example.com/three.jpg', sort_order: 2 },
  ],
})

const bundle = await fetchArch9ListingForPrivatePropertyPreview({ client: fakeClient, listingId })
assert.equal(bundle.listing.id, listingId)
assert.deepEqual(bundle.listing.featureFacts, { study: true, pool: false })
assert.equal(bundle.media.length, 3)
const savedFactPreview = createPrivatePropertyArch9ListingPreview({
  ...bundle,
  agentMapping: { agentIds: 'ARCH9-SANDBOX-USER-1' },
  options: { branchGuid: 'CA167B18-C6DC-49AD-B018-2B72B187918F', suburbId: '309' },
})
assert.equal(savedFactPreview.canPreview, true, JSON.stringify(savedFactPreview.dataBlockers))
assert.match(savedFactPreview.listingXml, /<AttributeType>Study<\/AttributeType><Value>Yes<\/Value>/)
assert.match(savedFactPreview.listingXml, /<AttributeType>Pool<\/AttributeType><Value>No<\/Value>/)
const candidates = await fetchRecentArch9ListingsForPrivatePropertyPreview({ client: fakeClient, limit: 5 })
assert.equal(candidates.length, 1)
assert.equal(candidates[0].id, listingId)

const scriptSource = read('scripts/private-property-preview-listing.mjs')
assert.match(scriptSource, /--fixture=/)
assert.match(scriptSource, /privatePropertyApiCalled: false/)
assert.doesNotMatch(scriptSource, /createPrivatePropertyClient/)

const packageJson = JSON.parse(read('package.json'))
assert.equal(packageJson.scripts['private-property:preview-listing'], 'node scripts/private-property-preview-listing.mjs')
assert.equal(packageJson.scripts['test:private-property-preview-listing'], 'node scripts/private-property-listing-preview.test.mjs')

console.log('Private Property phase 3 listing preview contract passed')
