import assert from 'node:assert/strict'
import {
  buildProperty24CategoryPayload,
  createProperty24ListingPlan,
  resolveProperty24PropertyTypeId,
} from '../server/services/property24ListingMapper.js'

const base = {
  id: 'specialist-property24-listing',
  listing_reference: 'ARCH9-P24-SPECIALIST-001',
  listing_type: 'Sale',
  listing_status: 'active',
  address_line_1: '12 Portal Road',
  asking_price: 4500000,
}

const cases = [
  {
    category: 'commercial',
    type: 'office_building',
    typeId: 11,
    facts: { grossLettableArea: '1250', zoning: 'Business 4', parking: '18 bays', listingTerms: 'Vacant occupation' },
    expected: { floorArea: 1250, description: 'Gross lettable area: 1250 m². Zoning: Business 4. Parking: 18 bays. Listing terms: Vacant occupation.' },
  },
  {
    category: 'industrial',
    type: 'distribution_centre',
    typeId: 12,
    facts: { warehouseOrFactoryArea: '2200', yardSize: '900', powerSupply: '250 kVA', loadingAccess: true },
    expected: { floorArea: 2200, erf: 900, description: 'Warehouse / factory area: 2200 m². Yard size: 900 m². Power supply: 250 kVA. Loading access: Yes.' },
  },
  {
    category: 'agricultural',
    type: 'agricultural_land',
    typeId: 10,
    facts: { farmSize: '42.5', waterSupplyOrRights: 'Borehole and water rights', agriculturalUse: 'Macadamia orchard' },
    expected: { erf: 425000, description: 'Farm size: 42.5 ha. Water supply / rights: Borehole and water rights. Agricultural use: Macadamia orchard.' },
  },
  {
    category: 'vacant_land',
    type: 'vacant_stand',
    typeId: 8,
    facts: { erfSize: '1800', zoning: 'Residential 2' },
    expected: { erf: 1800, zoneType: 'Residential 2', description: 'Erf / land size: 1800 m². Zoning: Residential 2.' },
  },
]

for (const entry of cases) {
  assert.equal(resolveProperty24PropertyTypeId(entry.type), entry.typeId)
  const payload = buildProperty24CategoryPayload({
    listing: { ...base, property_category: entry.category, property_type: entry.type, seller_canonical_facts_json: { property: { specialistFacts: entry.facts } } },
    category: entry.category === 'vacant_land' ? 'land' : entry.category,
    propertyTypeId: entry.typeId,
  })
  assert.equal(payload.propertyInfo.floorArea?.size, entry.expected.floorArea)
  assert.equal(payload.propertyInfo.erf?.size, entry.expected.erf)
  assert.equal(payload.propertyInfo.zoneType, entry.expected.zoneType)
  assert.equal(payload.description, entry.expected.description)

  const plan = createProperty24ListingPlan({
    listing: { ...base, property_category: entry.category, property_type: entry.type, seller_canonical_facts_json: { property: { specialistFacts: entry.facts } } },
    publication: { listing_type: 'Sale', property_category: entry.category, property_type: entry.type, asking_price: 4500000, description: 'Portal-ready specialist property.' },
    media: [{ media_type: 'image', bytes: 'base64-image-data' }],
    agentMapping: { property24AgentId: 77959, sourceReference: 'ARCH9-P24-SPECIALIST-AGENT' },
    catalogMapping: { suburbId: 12345 },
    options: { agencyId: 31382, expiryDate: '2027-12-31', environment: 'exdev' },
  })
  assert.equal(plan.summary.propertyTypeId, entry.typeId)
  assert.equal(plan.summary.categoryPayload.mappedPropertyInfo.floorArea?.size, entry.expected.floorArea)
  assert.equal(plan.summary.categoryPayload.mappedPropertyInfo.erf?.size, entry.expected.erf)
  assert.equal(plan.summary.categoryPayload.mappedPropertyInfo.zoneType, entry.expected.zoneType)
  assert.ok(plan.dataBlockers.includes(`property24_${entry.category === 'vacant_land' ? 'land' : entry.category}_mapping_not_verified`))
}

console.log('Property24 specialist sales mapping phase 4 checks passed')
