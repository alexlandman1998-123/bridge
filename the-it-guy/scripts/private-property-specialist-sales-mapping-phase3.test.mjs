import assert from 'node:assert/strict'
import { createPrivatePropertyListingPlan } from '../server/services/privatePropertyListingMapper.js'

const branchGuid = 'CA167B18-C6DC-49AD-B018-2B72B187918F'
const media = [
  { media_type: 'image', file_url: 'https://cdn.example.com/one.jpg' },
  { media_type: 'image', file_url: 'https://cdn.example.com/two.jpg' },
  { media_type: 'image', file_url: 'https://cdn.example.com/three.jpg' },
]

function createPlan({ propertyCategory, propertyType, specialistFacts }) {
  return createPrivatePropertyListingPlan({
    listing: {
      id: `pp-specialist-${propertyCategory}`,
      listing_reference: `PP-SPECIALIST-${propertyCategory}`,
      listing_type: 'Sale',
      property_category: propertyCategory,
      property_type: propertyType,
      address_line_1: '12 Portal Road',
      suburb: 'Waterkloof',
      city: 'Pretoria',
      province: 'Gauteng',
      asking_price: 4500000,
      seller_canonical_facts_json: JSON.stringify({ property: { specialistFacts } }),
    },
    publication: {
      title: `${propertyType} portal mapping`,
      listing_type: 'Sale',
      property_category: propertyCategory,
      property_type: propertyType,
      asking_price: 4500000,
      description: 'A specialist property ready for publication.',
    },
    media,
    agentMapping: { agentIds: 'ARCH9-SANDBOX-USER-1' },
    options: { branchGuid, suburbId: '12345' },
  })
}

const commercial = createPlan({
  propertyCategory: 'commercial',
  propertyType: 'Office',
  specialistFacts: { grossLettableArea: '1250', zoning: 'Business 4', parking: '18', listingTerms: 'Vacant occupation' },
})
assert.equal(commercial.canPreview, true)
assert.equal(commercial.summary.category, 'Commercial')
assert.equal(commercial.summary.specialistCategory, 'commercial')
assert.match(commercial.listingXml, /<AttributeType>FloorArea<\/AttributeType><Value>1250<\/Value>/)
assert.match(commercial.listingXml, /<AttributeType>Parking<\/AttributeType><Value>18<\/Value>/)
assert.match(commercial.listingXml, /Zoning: Business 4\. Listing terms: Vacant occupation\./)

const industrial = createPlan({
  propertyCategory: 'industrial',
  propertyType: 'Warehouse',
  specialistFacts: { warehouseOrFactoryArea: '2200', yardSize: '900', powerSupply: '250 kVA', loadingAccess: true },
})
assert.equal(industrial.canPreview, true)
assert.equal(industrial.summary.category, 'Commercial')
assert.equal(industrial.summary.specialistCategory, 'industrial')
assert.match(industrial.listingXml, /<AttributeType>FloorArea<\/AttributeType><Value>2200<\/Value>/)
assert.match(industrial.listingXml, /<AttributeType>LandArea<\/AttributeType><Value>900<\/Value>/)
assert.match(industrial.listingXml, /Power supply: 250 kVA\. Loading access: Yes\./)

const agricultural = createPlan({
  propertyCategory: 'farm',
  propertyType: 'Commercial Farm',
  specialistFacts: { farmSize: '42.5', waterSupplyOrRights: 'Borehole and water rights', agriculturalUse: 'Macadamia orchard' },
})
assert.equal(agricultural.canPreview, true)
assert.equal(agricultural.summary.category, 'Farms')
assert.equal(agricultural.summary.specialistCategory, 'agricultural')
assert.match(agricultural.listingXml, /<AttributeType>FarmType<\/AttributeType><Value>Commercial Farm<\/Value>/)
assert.match(agricultural.listingXml, /<AttributeType>LandArea<\/AttributeType><Value>42.5<\/Value>/)
assert.match(agricultural.listingXml, /Water supply \/ rights: Borehole and water rights\. Agricultural use: Macadamia orchard\./)

const land = createPlan({
  propertyCategory: 'vacant_land',
  propertyType: 'Vacant Land',
  specialistFacts: { erfSize: '1800', zoning: 'Residential 2' },
})
assert.equal(land.canPreview, true)
assert.equal(land.summary.category, 'Land')
assert.equal(land.summary.specialistCategory, 'land')
assert.match(land.listingXml, /<AttributeType>LandArea<\/AttributeType><Value>1800<\/Value>/)
assert.match(land.listingXml, /Zoning: Residential 2\./)

console.log('private property specialist sales mapping phase 3 checks passed')
