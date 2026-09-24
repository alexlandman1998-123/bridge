import assert from 'node:assert/strict'
import {
  buildRentalCanonicalFacts,
  buildRentalListingNotes,
  buildRentalPrivateListingPayload,
  buildRentalPublicationDraft,
  RENTAL_LISTING_INITIAL_FORM,
  RENTAL_PRICE_FREQUENCIES,
  RENTAL_MANDATE_TYPES,
  RENTAL_DEPOSIT_POLICIES,
  RETIREMENT_ACCOMMODATION_OPTIONS,
  validateRentalListingDraftForm,
} from '../src/services/rentals/rentalListingDraftModel.js'
import {
  buildRentalListingEditForm,
} from '../src/services/rentals/rentalListingEditModel.js'
import { buildRentalListingIndexRow } from '../src/services/rentals/rentalListingIndexModel.js'

assert.equal(RENTAL_LISTING_INITIAL_FORM.rentalPriceFrequency, 'monthly')
assert.equal(RENTAL_LISTING_INITIAL_FORM.rentalMandateType, 'standard_rental')
assert.equal(RENTAL_LISTING_INITIAL_FORM.depositPolicy, 'not_captured')
assert.equal(RENTAL_LISTING_INITIAL_FORM.retirementAccommodation, 'not_captured')
assert.deepEqual(RENTAL_PRICE_FREQUENCIES, ['monthly', 'weekly', 'daily', 'per_square_metre', 'annual'])
assert.deepEqual(RENTAL_MANDATE_TYPES, ['standard_rental', 'house_share'])
assert.deepEqual(RENTAL_DEPOSIT_POLICIES, ['not_captured', 'deposit_required', 'no_deposit'])
assert.deepEqual(RETIREMENT_ACCOMMODATION_OPTIONS, ['not_captured', 'yes', 'no'])

const form = {
  ...RENTAL_LISTING_INITIAL_FORM,
  title: 'Retirement house share',
  propertyAddress: '509 30th Avenue, Villieria, Pretoria, 0186, South Africa',
  streetNumber: '509',
  streetName: '30th Avenue',
  suburb: 'Villieria',
  city: 'Pretoria',
  province: 'Gauteng',
  postalCode: '0186',
  monthlyRent: '8500',
  rentalPriceFrequency: 'per_square_metre',
  depositAmount: '8500',
  depositPolicy: 'deposit_required',
  availableFrom: '2026-10-01',
  occupationDate: '2026-10-01',
  leasePeriodMonths: '12',
  rentalMandateType: 'house_share',
  retirementAccommodation: 'yes',
  selectedFeatures: ['Security', 'Fibre'],
  description: 'A QA rental description that must survive the save and reload cycle.',
}
const facts = buildRentalCanonicalFacts(form)
assert.equal(facts.rentalInfo.rentalPriceFrequency, 'per_square_metre')
assert.equal(facts.rentalInfo.depositPolicy, 'deposit_required')
assert.equal(facts.rentalInfo.rentalMandateType, 'house_share')
assert.equal(facts.propertyProfile.retirementAccommodation, 'yes')

const publication = buildRentalPublicationDraft(form)
assert.equal(publication.rentalTerms.rentalPriceFrequency, 'per_square_metre')
assert.equal(publication.rentalTerms.depositPolicy, 'deposit_required')
assert.equal(publication.rentalTerms.rentalMandateType, 'house_share')
assert.equal(publication.retirementAccommodation, 'yes')

const payload = buildRentalPrivateListingPayload(form, { organisationId: 'org-1' })
assert.equal(payload.sellerCanonicalFacts.rentalInfo.rentalPriceFrequency, 'per_square_metre')
assert.equal(payload.sellerCanonicalFacts.rentalInfo.depositPolicy, 'deposit_required')
assert.equal(payload.sellerCanonicalFacts.rentalInfo.rentalMandateType, 'house_share')
assert.equal(payload.sellerCanonicalFacts.propertyProfile.retirementAccommodation, 'yes')
assert.equal(payload.streetNumber, '509')
assert.equal(payload.streetName, '30th Avenue')
assert.equal(payload.sellerCanonicalFacts.rentalInfo.depositAmount, 8500)
assert.equal(payload.sellerCanonicalFacts.rentalInfo.availableFrom, '2026-10-01')
assert.deepEqual(payload.sellerCanonicalFacts.propertyProfile.selectedFeatures, ['Security', 'Fibre'])
assert.match(buildRentalListingNotes(form), /Rental price frequency: Per square metre/)
assert.match(buildRentalListingNotes(form), /Retirement accommodation: Yes/)

const hydrated = buildRentalListingEditForm({
  listingCategory: 'rental',
  sellerCanonicalFacts: facts,
  listingPublicationData: publication,
})
assert.equal(hydrated.rentalPriceFrequency, 'per_square_metre')
assert.equal(hydrated.depositPolicy, 'deposit_required')
assert.equal(hydrated.rentalMandateType, 'house_share')
assert.equal(hydrated.retirementAccommodation, 'yes')
assert.equal(hydrated.streetNumber, '509')
assert.equal(hydrated.streetName, '30th Avenue')
assert.equal(hydrated.depositAmount, '8500')
assert.equal(hydrated.availableFrom, '2026-10-01')
assert.equal(hydrated.occupationDate, '2026-10-01')
assert.deepEqual(hydrated.selectedFeatures, ['Security', 'Fibre'])

const lineOne = '509 30th Avenue, Villieria, Pretoria, 0186, South Africa'
const lineTwo = 'Unit 1, 1'
const addressRow = buildRentalListingIndexRow({
  addressLine1: lineOne,
  formattedAddress: lineOne,
  // This is the legacy presentation value returned by the private-listing
  // reader. It must never become the editable address-line-one value.
  propertyAddress: `${lineOne}, ${lineTwo}`,
  addressLine2: lineTwo,
  suburb: 'Villieria',
  city: 'Pretoria',
})
assert.equal(addressRow.address, lineOne)
assert.equal(buildRentalListingEditForm({
  addressLine1: lineOne,
  formattedAddress: lineOne,
  propertyAddress: `${lineOne}, ${lineTwo}`,
  addressLine2: lineTwo,
  suburb: 'Villieria',
  city: 'Pretoria',
}).propertyAddress, lineOne)

assert.deepEqual(
  validateRentalListingDraftForm({ ...form, depositPolicy: 'not_captured' }, { organisationId: 'org-1' }),
  ['Choose whether a deposit is required.'],
)
assert.deepEqual(
  validateRentalListingDraftForm({ ...form, availableFrom: '', occupationDate: '' }, { organisationId: 'org-1' }),
  ['Available from or occupation date is required.'],
)

const legacyFacts = buildRentalCanonicalFacts({
  ...RENTAL_LISTING_INITIAL_FORM,
  rentalPriceFrequency: 'unsupported',
  depositPolicy: 'unexpected',
  rentalMandateType: 'unknown',
  retirementAccommodation: 'maybe',
})
assert.equal(legacyFacts.rentalInfo.rentalPriceFrequency, 'monthly')
assert.equal(legacyFacts.rentalInfo.depositPolicy, 'not_captured')
assert.equal(legacyFacts.rentalInfo.rentalMandateType, 'standard_rental')
assert.equal(legacyFacts.propertyProfile.retirementAccommodation, 'not_captured')

console.log('Rental listing data contract Phase 2 passed')
