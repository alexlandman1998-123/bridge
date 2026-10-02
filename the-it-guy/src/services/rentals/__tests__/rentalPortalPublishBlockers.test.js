import { expect, it } from 'vitest'
import { RENTAL_LISTING_RELEASE_GATE_FIXTURE as fixture } from '../rentalListingReleaseGateModel.js'
import { buildRentalProperty24Readiness } from '../rentalListingProperty24ReadinessModel.js'
import { buildRentalProperty24FieldComparison } from '../rentalListingProperty24FieldComparisonModel.js'
import { buildRentalProperty24PublishRequest } from '../rentalListingProperty24PublishModel.js'
import { createProperty24RentalListingPlan } from '../../../../server/services/property24RentalListingAdapter.js'
import { createPrivatePropertyRentalListingPlan } from '../../../../server/services/privatePropertyRentalListingAdapter.js'
const media = Array.from({ length: 3 }, (_, index) => ({ url: `https://example.test/property-${index}.jpg`, mediaType: 'image', bytes: 'dGVzdA==', mimeContentType: 'image/jpeg' }))
function optionalMissing() {
  return { ...fixture, garden: undefined, pool: undefined, flatlet: undefined, garages: undefined, property24AgentSourceReference: '',
    sellerCanonicalFacts: { ...fixture.sellerCanonicalFacts, rentalInfo: { monthlyRent: 22000, depositAmount: 44000, mandateStatus: 'not_started', marketingApprovalStatus: 'draft' } } }
}
const p24 = (listing) => createProperty24RentalListingPlan({ listing, media, agentMapping: { property24AgentId: 77959, sourceReference: '' }, options: { includeSubmitPayload: true } })
const pp = (listing, chosenMedia = media) => createPrivatePropertyRentalListingPlan({ listing, media: chosenMedia, agentMapping: { privatePropertyAgentId: 'pp-agent' }, options: { branchGuid: '11111111-1111-4111-8111-111111111111', suburbId: '140', propertyId: 'rental-test' } })
it('keeps local P24 readiness and backend publishing open without optional capture or tenant onboarding', () => {
  const listing = optionalMissing()
  const readiness = buildRentalProperty24Readiness(listing)
  expect(readiness.blockers).toEqual([])
  expect(readiness.readyToPublish).toBe(true)
  expect(readiness.warnings.map((item) => item.key)).toEqual(expect.arrayContaining(['mandateStatus','marketingApprovalStatus','availableFrom','depositPolicy','petsAllowed']))
  expect(buildRentalProperty24FieldComparison(listing).readyForBackendAdapter).toBe(true)
  expect(buildRentalProperty24PublishRequest(listing).canPrepare).toBe(true)
  const plan = p24(listing)
  expect(plan.dataBlockers).toEqual([])
  expect(plan.canSubmit).toBe(true)
  expect(plan.qualityWarnings).toEqual(expect.arrayContaining(['rental_mandate_not_signed','rental_marketing_not_approved','missing_rental_deposit_policy','missing_rental_occupation_date']))
  expect(plan.payload.rentalInfo.rentalRate).toBe('Month')
})
it('allows PP without optional availability, marketing status or mandate status while retaining a known deposit', () => {
  const plan = pp(optionalMissing())
  expect(plan.dataBlockers).toEqual([])
  expect(plan.canPreview).toBe(true)
  expect(plan.qualityWarnings).toEqual(expect.arrayContaining(['missing_rental_available_from','rental_mandate_not_signed','rental_marketing_not_approved']))
  expect(plan.payload.deposit).toBe(44000)
  expect(plan.payload.rentalPriceType).toBe('PerMonth')
  expect(plan.listingXml).not.toContain('<AvailableFrom>')
})
it('retains real PP requirements for deposit and three rental photos', () => {
  const listing = optionalMissing()
  delete listing.sellerCanonicalFacts.rentalInfo.depositAmount
  const unknownDeposit = pp(listing)
  expect(unknownDeposit.canPreview).toBe(false)
  expect(unknownDeposit.dataBlockers).toContain('missing_or_invalid_rental_deposit_amount')
  listing.sellerCanonicalFacts.rentalInfo.depositPolicy = 'no_deposit'
  const zeroDeposit = pp(listing)
  expect(zeroDeposit.canPreview).toBe(true); expect(zeroDeposit.payload.deposit).toBe(0)
  expect(pp(listing, media.slice(0, 2)).dataBlockers).toContain('minimum_three_listing_image_urls_required')
})
it('retains P24 image, real agent mapping and unsupported house-share blockers', () => {
  const listing = optionalMissing()
  listing.sellerCanonicalFacts.rentalInfo.rentalMandateType = 'house_share'
  expect(p24(listing).dataBlockers).toContain('property24_house_share_not_supported')
  const missingAgent = createProperty24RentalListingPlan({ listing: { ...optionalMissing(), property24ContactAgentIds: [], assignedAgentId: '' }, media, agentMapping: {}, options: { environment: 'production', sandboxPayloadTestMode: false } })
  expect(missingAgent.canSubmit).toBe(false)
  expect(missingAgent.dataBlockers).toContain('missing_property24_agent_id')
})
