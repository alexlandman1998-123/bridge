import { expect, it } from 'vitest'
import { buildRentalCanonicalFacts, RENTAL_LISTING_INITIAL_FORM, validateRentalListingDraftForm } from '../rentalListingDraftModel.js'
import { buildRentalPortalMapping, RENTAL_PROPERTY_TYPE_MAPPING } from '../rentalPortalFieldContract.js'
import { createProperty24RentalListingPlan } from '../../../../server/services/property24RentalListingAdapter.js'
import { createPrivatePropertyRentalListingPlan } from '../../../../server/services/privatePropertyRentalListingAdapter.js'
import { buildRentalListingEditForm } from '../rentalListingEditModel.js'
import { RENTAL_LISTING_RELEASE_GATE_FIXTURE } from '../rentalListingReleaseGateModel.js'

function listing(category, type, answers, extra = {}) {
  return { ...RENTAL_LISTING_RELEASE_GATE_FIXTURE, sellerCanonicalFacts: null, propertyCategory: category, propertyType: type, seller_canonical_facts_json: buildRentalCanonicalFacts({ ...RENTAL_LISTING_INITIAL_FORM, landlordName: 'Owner', propertyAddress: '12 Example Road', streetNumber: '12', streetName: 'Example Road', suburb: 'Newlands', city: 'Pretoria', province: 'Gauteng', monthlyRent: '11000', availableFrom: '2027-01-01', mandateEndDate: '2028-10-01', depositPolicy: 'no_deposit', mandateStatus: 'signed', marketingApprovalStatus: 'approved', description: 'Well maintained premises', propertyCategory: category, propertyType: type, rentalPortalFacts: answers, ...extra }) }
}

function privatePlan(item) {
  return createPrivatePropertyRentalListingPlan({ listing: item, media: [1, 2, 3].map((number) => ({ mediaType: 'image', url: `https://example.test/rental-${number}.jpg` })), agentMapping: { privatePropertyAgentId: 'ARCH9-SANDBOX-USER-1' }, options: { branchGuid: '11111111-1111-4111-8111-111111111111', propertyId: 'RENTAL-TEST', suburbId: '140' } })
}

it('writes structured answers into the real P24 payload and native attributes into real PP XML', () => {
  const item = listing('residential', 'Apartment', { 'propertyInfo.age': 7, 'propertyInfo.municipalRatesAndTaxes.amount': 800, 'propertyFeatures.bathrooms.cleaningService': false, 'propertyFeatures.kitchens.dishwasher': true, 'propertyFeatures.sustainabilityInfo.solarGeyser': false, 'feature.alarm': false, 'feature.roof_type': 'Slate', 'propertyInfo.propertyDescription.propertyDescriptionType': 'Unit', 'propertyInfo.propertyDescription.schemeNumber': 42 }, { alarm: 'no', bedrooms: '0', bathrooms: '1.5', garages: '1', parkingBays: '5', unitNumber: '4B', complexName: 'Atrium', enSuiteBathrooms: '1', lounges: '2', diningRooms: '0', carports: '3' })
  const p24 = createProperty24RentalListingPlan({ listing: item, agentMapping: { property24AgentId: 77959 }, options: { expiryDate: '2028-10-01' } })
  expect(p24.dataBlockers).toEqual([])
  expect(p24.previewPayload.propertyInfo).toMatchObject({ age: 7, municipalRatesAndTaxes: { amount: 800, unit: 'TotalPrice' }, propertyDescription: { propertyDescriptionType: 'Unit', schemeName: 'Atrium', schemeNumber: 42, unitNumber: '4B' } })
  expect(p24.previewPayload.propertyFeatures).toMatchObject({ bathrooms: { bathrooms: 1.5, cleaningService: false }, kitchens: { dishwasher: true }, sustainabilityInfo: { solarGeyser: false }, garages: 1, parking: { parkingSpaces: 5 } })
  expect(p24.previewPayload.tags).toContain('Slate')
  expect(p24.previewPayload.tags).not.toContain('AlarmSystem')
  const pp = privatePlan(item)
  expect(pp.payload.attributes).toEqual(expect.arrayContaining([{ attributeType: 'Alarm', value: 'No' }, { attributeType: 'EnSuite', value: '1' }, { attributeType: 'Garages', value: '1' }, { attributeType: 'Parking', value: '5' }, { attributeType: 'Carports', value: '3' }, { attributeType: 'Rates', value: '800' }]))
  expect(pp.dataBlockers).toEqual([])
  expect(pp.listingXml).toContain('<AttributeType>Alarm</AttributeType><Value>No</Value>')
  expect(pp.listingXml).toContain('<AttributeType>EnSuite</AttributeType><Value>1</Value>')
  expect(pp.payload.description).toContain('Age: 7')
  expect(pp.payload.description).not.toContain('Scheme number')
})

it('maps business-specific fields through both adapters without enabling unverified P24 publishing', () => {
  const item = listing('industrial', 'Warehouse', { 'commercialInfo.warehouseSpaceSqm': 1200, 'commercialInfo.yardSpaceSqm': 250, 'commercialInfo.truckAccess': 'Superlink', 'commercialInfo.powerAvailability': 'ThreePhase', 'commercialInfo.rollerShutterDoors': 3, 'commercialInfo.multiTenanted': false, 'commercialInfo.leaseType': 'TripleNet', 'commercialInfo.boardrooms.boardrooms': 0, 'commercialInfo.availabilityDate': '2027-03-02' })
  const p24 = createProperty24RentalListingPlan({ listing: item, agentMapping: { property24AgentId: 77959 } })
  expect(p24.canSubmit).toBe(false)
  expect(p24.summary.categoryPayload.mappedCommercialInfo).toMatchObject({ warehouseSpaceSqm: 1200, yardSpaceSqm: 250, truckAccess: 'Superlink', powerAvailability: 'ThreePhase', rollerShutterDoors: 3, multiTenanted: false, leaseType: 'TripleNet', boardrooms: { boardrooms: 0 }, availabilityDate: '2027-01-01T00:00:00.000Z' })
  const pp = createPrivatePropertyRentalListingPlan({ listing: item })
  expect(pp.payload.category).toBe('Commercial')
  expect(pp.payload.attributes).toContainEqual({ attributeType: 'BusinessType', value: 'Industrial' })
  expect(pp.payload.description).toContain('Truck access: Superlink')
  expect(pp.payload.description).toContain('Power availability: ThreePhase')
})

it('uses documented type values for both portals for every category and property type', () => {
  for (const mapping of RENTAL_PROPERTY_TYPE_MAPPING) {
    const item = listing(mapping.category, mapping.type, {}, { erfSize: '1000' })
    const p24 = createProperty24RentalListingPlan({ listing: item, agentMapping: { property24AgentId: 77959 } })
    expect(p24.summary.propertyTypeId, mapping.type).toBe(mapping.property24TypeId)
    expect(p24.dataBlockers, mapping.type).not.toContain('missing_property24_property_type_id')
    const pp = createPrivatePropertyRentalListingPlan({ listing: item })
    expect(pp.payload.category, mapping.type).toBe(mapping.privatePropertyCategory)
    expect(pp.payload.attributes, mapping.type).toContainEqual({ attributeType: mapping.privatePropertyTypeField, value: mapping.privatePropertyType })
    if (mapping.category === 'agricultural') expect(pp.payload.attributes.some((attribute) => attribute.attributeType === 'HomeType')).toBe(false)
  }
})

it('omits inactive category/title answers, blocks invalid native enums, and clears optional facts', () => {
  const item = listing('residential', 'House', { 'commercialInfo.truckAccess': 'Superlink', 'propertyInfo.propertyDescription.propertyDescriptionType': 'Erf', 'propertyInfo.propertyDescription.schemeNumber': 42, 'propertyFeatures.kitchens.dishwasher': null })
  const map = buildRentalPortalMapping(item)
  expect(map.property24.commercialInfo).toBeUndefined()
  expect(map.property24.propertyInfo.propertyDescription.schemeNumber).toBeUndefined()
  expect(map.property24.propertyFeatures?.kitchens).toBeUndefined()
  const invalid = listing('industrial', 'Warehouse', { 'commercialInfo.truckAccess': 'invented' })
  // Capture normally rejects invalid choices; imported/corrupted persisted data
  // must also block publishing rather than silently omit a answered field.
  invalid.seller_canonical_facts_json.rentalPortalFacts['commercialInfo.truckAccess'] = 'invented'
  expect(createPrivatePropertyRentalListingPlan({ listing: invalid }).dataBlockers).toContain('invalid_rental_field:commercialInfo.truckAccess')
  for (const value of ['invented', -1, 2.5]) expect(validateRentalListingDraftForm({ ...RENTAL_LISTING_INITIAL_FORM, propertyCategory: 'industrial', rentalPortalFacts: { 'commercialInfo.rollerShutterDoors': value } }, { organisationId: 'org' })).toContain('Enter a valid roller shutter doors.')
})

it('blocks PP-only limits instead of changing a valid Property24 fee', () => {
  const item = listing('residential', 'Apartment', { 'propertyInfo.municipalRatesAndTaxes.amount': 800.5, 'propertyInfo.municipalRatesAndTaxes.unit': 'PricePerSquareMetre' })
  // Use the exact enum from the P24 contract, then check PP's whole-total limit.
  item.seller_canonical_facts_json.rentalPortalFacts['propertyInfo.municipalRatesAndTaxes.unit'] = 'TotalPrice'
  expect(createPrivatePropertyRentalListingPlan({ listing: item }).dataBlockers).toContain('private_property_rates_must_be_whole_amount')
  expect(buildRentalPortalMapping(item).property24.propertyInfo.municipalRatesAndTaxes.amount).toBe(800.5)
})

it('does not resurrect explicitly cleared optional answers from older listing/publication facts', () => {
  const item = listing('residential', 'Apartment', { 'propertyFeatures.hasGenerator': null, 'feature.alarm': null, 'propertyInfo.municipalRatesAndTaxes.amount': null }, { bedrooms: '2', bathrooms: '1', alarm: '' })
  item.ratesTaxes = 999
  item.seller_canonical_facts_json.featureFacts = { generator: true, alarm: true }
  const p24 = createProperty24RentalListingPlan({ listing: item, agentMapping: { property24AgentId: 77959 } })
  expect(p24.previewPayload.propertyFeatures.hasGenerator).toBeUndefined()
  expect(p24.previewPayload.tags || []).not.toContain('AlarmSystem')
  const pp = privatePlan(item)
  expect(pp.payload.attributes.some((attribute) => attribute.attributeType === 'Rates' || attribute.attributeType === 'Alarm')).toBe(false)
})

it('keeps PP PerM2 rentals limited to Commercial and Land, including older farm aliases', () => {
  for (const category of ['agricultural', 'farm', 'farms', 'residential']) {
    const pp = createPrivatePropertyRentalListingPlan({ listing: listing(category, 'Farm', {}, { rentalPriceFrequency: 'per_square_metre' }) })
    expect(pp.dataBlockers, category).toContain('private_property_per_square_metre_requires_specialist_category')
  }
})


it('preserves all previously omitted public details through save/reopen and both adverts', () => {
  const extra = { bedrooms: '2', bathrooms: '1', storerooms: '2', coveredParking: '3', openParking: '0', retirementAccommodation: 'yes', occupationDate: '2027-02-02', depositPolicy: 'deposit_required', depositAmount: '22000', depositRequirement: 'Pay before handover', rentalIncludes: 'Garden service', rentalExcludes: 'Refuse charges', applicationFee: '123', leaseAdminFee: '234', creditCheckFee: '345', keyDepositAmount: '456', utilityDepositAmount: '567', petsPolicy: 'subject_to_approval', landlordEmail: 'private-owner@example.test', internalNotes: 'Private team note' }
  const item = listing('residential', 'House', {}, extra)
  const reopened = buildRentalListingEditForm(JSON.parse(JSON.stringify(item)))
  for (const [key, value] of Object.entries(extra).filter(([key]) => key !== 'internalNotes')) expect(reopened[key], key).toBe(value)
  item.internalNotes = extra.internalNotes
  const p24 = createProperty24RentalListingPlan({ listing: item, agentMapping: { property24AgentId: 77959 }, options: { expiryDate: '2028-10-01' } })
  const pp = privatePlan(item)
  expect(p24.dataBlockers).toEqual([])
  expect(pp.dataBlockers).toEqual([])
  const details = ['Storerooms: 2', 'Covered parking: 3', 'Open parking: 0', 'Retirement accommodation: Yes', 'Occupation date: 2027-02-02', 'Available from: 2027-01-01', 'Deposit requirements: Pay before handover', 'Rental includes: Garden service', 'Rental excludes: Refuse charges', 'Application fee: R123', 'Lease admin fee: R234', 'Credit check fee: R345', 'Key deposit: R456', 'Utility deposit: R567', 'Pets: Subject to approval', 'Utilities: Tenant pays utilities']
  for (const description of [p24.previewPayload.description, pp.payload.description]) {
    for (const detail of details) expect(description).toContain(detail)
    expect(description).not.toContain('private-owner@example.test')
    expect(description).not.toContain('Private team note')
  }
  expect(p24.previewPayload.occupationDate).toBe('2027-02-02T00:00:00.000Z')
  expect(pp.payload.availableFrom).toBe('2027-01-01')
  expect(p24.previewPayload.rentalInfo.depositRequirementsComments).toContain('R22000')
  expect(p24.previewPayload.rentalInfo.depositRequirementsComments).toContain('Pay before handover')
  expect(pp.listingXml).toContain('Application fee: R123')
})

it('keeps conditional pet permission unknown rather than advertising no pets', () => {
  for (const [policy, expected] of [['allowed', 'Yes'], ['not_allowed', 'No'], ['subject_to_approval', 'DontKnow']]) {
    const item = listing('residential', 'House', {}, { petsPolicy: policy })
    const plan = createProperty24RentalListingPlan({ listing: item, agentMapping: { property24AgentId: 77959 }, options: { expiryDate: '2028-10-01' } })
    expect(plan.previewPayload.propertyFeatures.petsAllowed, policy).toBe(expected)
  }
})

it('honours flexible leases and omits cleared or inapplicable public details', () => {
  for (const [leasePeriodType, label] of [['month_to_month', 'Month to month'], ['negotiable', 'Negotiable']]) {
    const item = listing('residential', 'House', {}, { leasePeriodType, leasePeriodMonths: '12', depositRequirement: 'Old deposit instructions', applicationFee: '', coveredParking: '', retirementAccommodation: 'not_captured', creditCheckFee: '0' })
    const p24 = createProperty24RentalListingPlan({ listing: item, agentMapping: { property24AgentId: 77959 }, options: { expiryDate: '2028-10-01' } })
    const pp = privatePlan(item)
    expect(p24.previewPayload.rentalInfo.leasePeriod).toBe(label)
    for (const description of [p24.previewPayload.description, pp.payload.description]) {
      expect(description).toContain(`Lease period: ${label}`)
      expect(description).not.toContain('Lease period: 12')
      expect(description).not.toContain('Old deposit instructions')
      expect(description).not.toContain('Application fee:')
      expect(description).not.toContain('Covered parking:')
      expect(description).not.toContain('Retirement accommodation:')
      expect(description).toContain('Credit check fee: R0')
    }
    expect(pp.payload.description.split(`Lease period: ${label}`)).toHaveLength(2)
  }
  const business = listing('industrial', 'Warehouse', {}, { storerooms: '9', coveredParking: '8', retirementAccommodation: 'yes' })
  expect(privatePlan(business).payload.description).not.toContain('Storerooms:')
})


it('does not append rental terms to sales listings', () => {
  const mapping = buildRentalPortalMapping({ listingType: 'Sale', propertyCategory: 'residential', coveredParking: 2, applicationFee: 100, availableFrom: '2027-01-01', sellerCanonicalFacts: { propertyProfile: { storerooms: 3 } } })
  expect(mapping.property24Description).toEqual([])
  expect(mapping.privatePropertyDescription).toEqual([])
})
