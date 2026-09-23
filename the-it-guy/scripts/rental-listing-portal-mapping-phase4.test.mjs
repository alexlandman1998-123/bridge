import assert from 'node:assert/strict'
import { createProperty24RentalListingPlan } from '../server/services/property24RentalListingAdapter.js'
import { createPrivatePropertyRentalListingPlan } from '../server/services/privatePropertyRentalListingAdapter.js'
import { RENTAL_LISTING_RELEASE_GATE_FIXTURE } from '../src/services/rentals/rentalListingReleaseGateModel.js'

const property24Agent = { property24AgentId: 77959, sourceReference: 'arch9-agent-1' }
const privatePropertyAgent = { privatePropertyAgentId: 'ARCH9-SANDBOX-USER-1' }
const privatePropertyOptions = {
  branchGuid: '11111111-1111-4111-8111-111111111111',
  propertyId: 'PHASE4-RENTAL-1',
  suburbId: '140',
}
const privatePropertyMedia = [
  'https://example.test/phase4-1.jpg',
  'https://example.test/phase4-2.jpg',
  'https://example.test/phase4-3.jpg',
]

function withRentalTerms(rentalInfo = {}, propertyProfile = {}) {
  return {
    ...RENTAL_LISTING_RELEASE_GATE_FIXTURE,
    listingReference: 'PHASE4-RENTAL-1',
    privatePropertySuburbId: '140',
    mandateEndDate: '2027-02-28',
    photos: privatePropertyMedia,
    sellerCanonicalFacts: {
      ...RENTAL_LISTING_RELEASE_GATE_FIXTURE.sellerCanonicalFacts,
      propertyProfile,
      rentalInfo: {
        ...RENTAL_LISTING_RELEASE_GATE_FIXTURE.sellerCanonicalFacts.rentalInfo,
        ...rentalInfo,
      },
    },
  }
}

const weeklyNoDeposit = withRentalTerms({ rentalPriceFrequency: 'weekly', depositPolicy: 'no_deposit' })
const property24Weekly = createProperty24RentalListingPlan({ listing: weeklyNoDeposit, agentMapping: property24Agent })
assert.equal(property24Weekly.canPreview, true)
assert.equal(property24Weekly.previewPayload.rentalInfo.rentalRate, 'Week')
assert.equal(property24Weekly.previewPayload.rentalInfo.depositRequirementsComments, 'No deposit required')
assert.equal(property24Weekly.summary.rentalPriceFrequency, 'weekly')
assert.equal(property24Weekly.summary.depositPolicy, 'no_deposit')

const property24HouseShare = createProperty24RentalListingPlan({
  listing: withRentalTerms({ rentalMandateType: 'house_share' }),
  agentMapping: property24Agent,
})
assert.equal(property24HouseShare.canPreview, false)
assert.ok(property24HouseShare.dataBlockers.includes('property24_house_share_not_supported'))

const property24Retirement = createProperty24RentalListingPlan({
  listing: withRentalTerms({}, { retirementAccommodation: 'yes' }),
  agentMapping: property24Agent,
})
assert.equal(property24Retirement.canPreview, true)
assert.ok(property24Retirement.qualityWarnings.includes('property24_retirement_accommodation_not_mapped'))

const privateHouseShare = createPrivatePropertyRentalListingPlan({
  listing: withRentalTerms({ rentalPriceFrequency: 'daily', rentalMandateType: 'house_share', depositPolicy: 'no_deposit' }),
  agentMapping: privatePropertyAgent,
  options: privatePropertyOptions,
})
assert.equal(privateHouseShare.canPreview, true)
assert.equal(privateHouseShare.payload.mandateType, 'HouseShare')
assert.equal(privateHouseShare.payload.rentalPriceType, 'PerDay')
assert.equal(privateHouseShare.payload.deposit, 0)
assert.match(privateHouseShare.listingXml, /<MandateType>HouseShare<\/MandateType>/)
assert.match(privateHouseShare.listingXml, /<RentalPriceType>PerDay<\/RentalPriceType>/)

const privateAnnual = createPrivatePropertyRentalListingPlan({
  listing: withRentalTerms({ rentalPriceFrequency: 'annual' }),
  agentMapping: privatePropertyAgent,
  options: privatePropertyOptions,
})
assert.equal(privateAnnual.canPreview, false)
assert.ok(privateAnnual.dataBlockers.includes('private_property_rental_price_frequency_not_supported'))

const privateResidentialPerSquareMetre = createPrivatePropertyRentalListingPlan({
  listing: withRentalTerms({ rentalPriceFrequency: 'per_square_metre' }),
  agentMapping: privatePropertyAgent,
  options: privatePropertyOptions,
})
assert.equal(privateResidentialPerSquareMetre.canPreview, false)
assert.ok(privateResidentialPerSquareMetre.dataBlockers.includes('private_property_per_square_metre_requires_specialist_category'))

const privateRetirement = createPrivatePropertyRentalListingPlan({
  listing: withRentalTerms({}, { retirementAccommodation: 'yes' }),
  agentMapping: privatePropertyAgent,
  options: privatePropertyOptions,
})
assert.equal(privateRetirement.canPreview, true)
assert.ok(privateRetirement.qualityWarnings.includes('private_property_retirement_accommodation_not_mapped'))

console.log('Rental listing portal mapping phase 4 contract passed')
