import assert from 'node:assert/strict'
import { createPrivatePropertyListingPlan, resolvePrivatePropertyCategory } from '../server/services/privatePropertyListingMapper.js'
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
    expected: { erf: 1800, description: 'Erf / land size: 1800 m². Zoning: Residential 2.' },
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
  if (entry.category === 'vacant_land') {
    assert.equal(plan.canSubmit, true)
    assert.equal(plan.previewPayload.propertyInfo.erf.size, 1800)
    assert.equal(plan.previewPayload.propertyInfo.zoneType, undefined)
  } else if (entry.category === 'commercial') {
    assert.equal(plan.canPreview, true)
    assert.equal(plan.canSubmit, true)
    assert.equal(plan.summary.categoryPayload.mappedCommercialInfo.grossLettableAreaSqm, 1250)
    assert.equal(plan.previewPayload.propertyInfo.propertyTypeId, 11)
    assert.equal(plan.previewPayload.commercialInfo.grossLettableAreaSqm, 1250)
    assert.deepEqual(plan.technicalBlockers, [])
  } else if (entry.category === 'agricultural') {
    assert.equal(plan.canSubmit, true)
    assert.equal(plan.previewPayload.propertyInfo.propertyTypeId, 10)
    assert.deepEqual(plan.previewPayload.propertyInfo.erf, { size: 425000, areaUnit: 'SquareMetres' })
  } else {
    assert.ok(plan.dataBlockers.includes(`property24_${entry.category === 'vacant_land' ? 'land' : entry.category}_mapping_not_verified`))
  }
}

for (const measurement of [
  { erfSize: 21.516, erfSizeUnit: 'ha', expected: 215160 },
  { erfSize: 215160, erfSizeUnit: 'm²', expected: 215160 },
  { erf_size_sqm: 215160, erfSize: 21.516, expected: 215160 },
  { erfSize: 2, erfSizeUnit: 'Acres', expected: 8093.712845 },
  { erfSize: 0, expectedError: 'land_area_positive_number_required' },
  { erfSize: -1, expectedError: 'land_area_positive_number_required' },
  { erfSize: 21.516, erfSizeUnit: 'unknown', expectedError: 'land_area_unit_unsupported' },
  { expectedError: 'land_area_required' },
]) {
  const listing = { ...base, address_line_1: 'PORTION 86 OF KLIPDRIFT 90 JR MORETELE LOCAL MUNICIPALITY GAUTENG', property_type: 'vacant_land', property_category: 'vacant_land', ...measurement,
    seller_canonical_facts_json: { property: { specialistFacts: { zoning: 'Agricultural' } } } }
  const publication = { listing_type: 'Sale', description: 'Dinokeng vacant bushveld land.' }
  const p24 = createProperty24ListingPlan({ listing, publication,
    media: [{ media_type: 'image', bytes: 'base64-image-data' }],
    agentMapping: { property24AgentId: 77959 }, catalogMapping: { suburbId: 11544 },
    options: { agencyId: 31382, expiryDate: '2027-12-31', environment: 'production' } })
  const pp = createPrivatePropertyListingPlan({ listing, publication,
    media: [1, 2, 3].map((i) => ({ media_type: 'image', file_url: `https://cdn.example.com/${i}.jpg` })),
    agentMapping: { agentIds: 'test-agent' }, options: { branchGuid: 'CA167B18-C6DC-49AD-B018-2B72B187918F', suburbId: '12345' } })
  assert.equal(p24.summary.propertyTypeId, 8)
  assert.equal(pp.summary.category, 'Land')
  if (measurement.expectedError) {
    assert.equal(p24.canSubmit, false)
    assert.ok(p24.dataBlockers.includes(`property24_${measurement.expectedError}`))
    assert.ok(pp.dataBlockers.includes(`private_property_${measurement.expectedError}`))
  } else {
    assert.equal(pp.canPreview, true)
    assert.match(pp.listingXml, /<StreetNumber>Ptn 86<\/StreetNumber>/)
    assert.match(pp.listingXml, /<StreetName>KLIPDRIFT 90 JR MORETELE LOCAL MUNICIPALITY GAUTENG<\/StreetName>/)
    assert.equal(p24.canSubmit, true)
    assert.deepEqual(p24.previewPayload.propertyInfo.erf, { size: measurement.expected, areaUnit: 'SquareMetres' })
    assert.equal(p24.previewPayload.propertyInfo.zoneType, 'Agricultural')
    assert.ok(pp.listingXml.includes(`<AttributeType>LandArea</AttributeType><Value>${measurement.expected}</Value>`))
    assert.match(pp.listingXml, /<AttributeType>LandType<\/AttributeType><Value>Residential Land<\/Value>/)
  }
}

for (const type of ['vacant_land', 'Vacant Land / Plot', 'vacant_stand']) {
  assert.equal(resolveProperty24PropertyTypeId(type), 8)
  assert.equal(resolvePrivatePropertyCategory(type), 'Land')
}

console.log('Property24 specialist sales mapping phase 4 checks passed')
