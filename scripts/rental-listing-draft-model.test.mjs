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
  suburb: 'Sea Point',
  city: 'Cape Town',
  province: 'Western Cape',
  propertyType: 'Apartment',
  monthlyRent: '18500',
  depositAmount: '37000',
  availableFrom: '2026-09-01',
  leasePeriodMonths: '12',
  furnishedStatus: 'semi_furnished',
  petsPolicy: 'subject_to_approval',
  utilitiesPolicy: 'prepaid_electricity',
  inspectionStatus: 'scheduled',
  mandateStatus: 'sent',
  marketingApprovalStatus: 'approved',
  description: 'Bright apartment close to the promenade.',
}

assert.deepEqual(validateRentalListingDraftForm(form, { organisationId: 'org-1' }), [])

const facts = buildRentalCanonicalFacts(form)
assert.equal(facts.listingType, 'Rental')
assert.equal(facts.landlordName, 'A Landlord')
assert.equal(facts.rentalInfo.monthlyRent, 18500)
assert.equal(facts.rentalInfo.depositAmount, 37000)
assert.equal(facts.rentalInfo.availableFrom, '2026-09-01')

const payload = buildRentalPrivateListingPayload(form, {
  organisationId: 'org-1',
  branchId: 'branch-1',
  assignedAgentId: 'agent-1',
})
assert.equal(payload.listingCategory, 'rental')
assert.equal(payload.listingSource, 'private_listing')
assert.equal(payload.askingPrice, 18500)
assert.equal(payload.sellerCanonicalFacts.listingType, 'Rental')
assert.equal(payload.mandateStatus, 'sent')
assert.match(payload.internalListingNotes, /ARCH9_RENTAL_CAPTURE_V1/)

const publication = buildRentalPublicationDraft(form)
assert.equal(publication.listingType, 'Rental')
assert.equal(publication.status, 'Ready')
assert.equal(publication.askingPrice, 18500)

const notes = buildRentalListingNotes(form)
assert.match(notes, /Monthly rent: R18500/)
assert.match(notes, /Utilities: Prepaid electricity/)

assert.ok(
  validateRentalListingDraftForm({ ...form, monthlyRent: '' }, { organisationId: 'org-1' }).includes('Monthly rent is required.'),
)

console.log('rental listing draft model tests passed')
