import assert from 'node:assert/strict'

import {
  buildRentalCanonicalFacts,
  buildRentalListingNotes,
  buildRentalPrivateListingPayload,
  buildRentalPublicationDraft,
  validateRentalListingDraftForm,
} from '../the-it-guy/src/services/rentals/rentalListingDraftModel.js'

const form = {
  title: '2 bedroom apartment in Sea Point',
  landlordName: 'A Landlord',
  landlordEmail: 'landlord@example.com',
  propertyAddress: '10 Beach Road',
  unitNumber: '12',
  complexName: 'The Atrium',
  streetNumber: '10',
  streetName: 'Beach Road',
  suburb: 'Sea Point',
  city: 'Cape Town',
  province: 'Western Cape',
  postalCode: '8005',
  propertyType: 'Apartment',
  enSuiteBathrooms: '1',
  lounges: '1',
  garages: '0',
  coveredParking: '1',
  openParking: '0',
  monthlyRent: '18500',
  depositAmount: '37000',
  depositRequirement: 'Two months deposit required',
  depositMultiplier: '2',
  availableFrom: '2026-09-01',
  occupationDate: '2026-09-03',
  leasePeriodMonths: '12',
  leasePeriodType: 'fixed_12_months',
  rentalIncludes: 'Water',
  rentalExcludes: 'Prepaid electricity',
  applicationFee: '300',
  leaseAdminFee: '1200',
  creditCheckFee: '250',
  keyDepositAmount: '500',
  utilityDepositAmount: '1500',
  furnishedStatus: 'semi_furnished',
  petsPolicy: 'subject_to_approval',
  utilitiesPolicy: 'prepaid_electricity',
  garden: 'no',
  pool: 'yes',
  flatlet: 'no',
  accessGate: 'yes',
  prepaidElectricity: 'yes',
  inspectionStatus: 'scheduled',
  mandateStatus: 'sent',
  mandateStartDate: '2026-08-25',
  mandateEndDate: '2026-12-31',
  marketingApprovalStatus: 'approved',
  description: 'Bright apartment close to the promenade.',
}

assert.deepEqual(validateRentalListingDraftForm(form, { organisationId: 'org-1' }), [])

const facts = buildRentalCanonicalFacts(form)
assert.equal(facts.listingType, 'Rental')
assert.equal(facts.landlordName, 'A Landlord')
assert.equal(facts.rentalInfo.monthlyRent, 18500)
assert.equal(facts.rentalInfo.depositAmount, 37000)
assert.equal(facts.rentalInfo.depositRequirement, 'Two months deposit required')
assert.equal(facts.rentalInfo.availableFrom, '2026-09-01')
assert.equal(facts.rentalInfo.occupationDate, '2026-09-03')
assert.equal(facts.propertyProfile.garages, 0)
assert.equal(facts.propertyProfile.coveredParking, 1)
assert.equal(facts.propertyProfile.portalFeatures.pool, true)
assert.equal(facts.propertyProfile.portalFeatures.garden, false)

const payload = buildRentalPrivateListingPayload(form, {
  organisationId: 'org-1',
  branchId: 'branch-1',
  assignedAgentId: 'agent-1',
})
assert.equal(payload.listingCategory, 'rental')
assert.equal(payload.listingSource, 'private_listing')
assert.equal(payload.askingPrice, 18500)
assert.equal(payload.streetNumber, '10')
assert.equal(payload.postalCode, '8005')
assert.equal(payload.sellerCanonicalFacts.listingType, 'Rental')
assert.equal(payload.expiryDate, '2026-12-31')
assert.equal(payload.mandateStatus, 'sent')
assert.match(payload.internalListingNotes, /ARCH9_RENTAL_CAPTURE_V1/)

const publication = buildRentalPublicationDraft(form)
assert.equal(publication.listingType, 'Rental')
assert.equal(publication.status, 'Ready')
assert.equal(publication.askingPrice, 18500)
assert.equal(publication.rentalTerms.rentalExcludes, 'Prepaid electricity')
assert.equal(publication.portalFeatures.accessGate, true)

const notes = buildRentalListingNotes(form)
assert.match(notes, /Monthly rent: R18500/)
assert.match(notes, /Utilities: Prepaid electricity/)
assert.match(notes, /Rental excludes: Prepaid electricity/)

assert.ok(
  validateRentalListingDraftForm({ ...form, monthlyRent: '' }, { organisationId: 'org-1' }).includes('Monthly rent is required.'),
)

console.log('rental listing draft model tests passed')
