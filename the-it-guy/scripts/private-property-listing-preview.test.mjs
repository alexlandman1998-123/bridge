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
  listing_media: [
    { listing_id: listingId, media_type: 'image', file_url: 'https://cdn.example.com/one.jpg', sort_order: 0 },
    { listing_id: listingId, media_type: 'image', file_url: 'https://cdn.example.com/two.jpg', sort_order: 1 },
    { listing_id: listingId, media_type: 'image', file_url: 'https://cdn.example.com/three.jpg', sort_order: 2 },
  ],
})

const bundle = await fetchArch9ListingForPrivatePropertyPreview({ client: fakeClient, listingId })
assert.equal(bundle.listing.id, listingId)
assert.equal(bundle.media.length, 3)
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
