import assert from 'node:assert/strict'

import {
  buildRentalListingEditForm,
  buildRentalListingEditPublicationDraft,
  buildRentalListingUpdatePayload,
  RENTAL_LISTING_EDIT_VERSION,
  validateRentalListingEditForm,
} from '../the-it-guy/src/services/rentals/rentalListingEditModel.js'

const listing = {
  id: 'rental-1',
  title: 'Old title',
  formattedAddress: '10 Beach Road',
  suburb: 'Sea Point',
  city: 'Cape Town',
  province: 'Western Cape',
  propertyType: 'Apartment',
  askingPrice: 18500,
  description: 'Bright apartment.',
  sellerType: 'individual',
  mandateStatus: 'sent',
  sellerCanonicalFacts: {
    landlordName: 'A Landlord',
    landlordEmail: 'landlord@example.com',
    landlordType: 'trust',
    rentalInfo: {
      monthlyRent: 18500,
      depositAmount: 37000,
      availableFrom: '2026-09-01',
      leasePeriodMonths: 12,
      furnishedStatus: 'semi_furnished',
      petsPolicy: 'allowed',
      utilitiesPolicy: 'prepaid_electricity',
      inspectionStatus: 'scheduled',
      inspectionNotes: 'Access via security.',
      mandateStatus: 'sent',
      marketingApprovalStatus: 'landlord_review',
    },
  },
}

assert.equal(RENTAL_LISTING_EDIT_VERSION, 'arch9_rental_listing_edit_v1')

const form = buildRentalListingEditForm(listing)
assert.equal(form.title, 'Old title')
assert.equal(form.landlordName, 'A Landlord')
assert.equal(form.landlordType, 'trust')
assert.equal(form.monthlyRent, '18500')
assert.equal(form.depositAmount, '37000')
assert.equal(form.furnishedStatus, 'semi_furnished')
assert.equal(form.inspectionNotes, 'Access via security.')

const invalidErrors = validateRentalListingEditForm({ ...form, monthlyRent: '' }, { organisationId: 'org-1' })
assert.ok(invalidErrors.includes('Monthly rent is required.'))
assert.deepEqual(validateRentalListingEditForm(form, { organisationId: 'org-1' }), [])

const editedForm = {
  ...form,
  title: 'Updated rental',
  monthlyRent: '19500',
  depositAmount: '39000',
  mandateStatus: 'signed_uploaded',
  marketingApprovalStatus: 'approved',
}

const payload = buildRentalListingUpdatePayload(editedForm)
assert.equal(payload.title, 'Updated rental')
assert.equal(payload.listingCategory, 'rental')
assert.equal(payload.askingPrice, 19500)
assert.equal(payload.mandateStatus, 'signed_uploaded')
assert.equal(payload.sellerCanonicalFacts.listingType, 'Rental')
assert.equal(payload.sellerCanonicalFacts.rentalInfo.monthlyRent, 19500)
assert.equal(payload.sellerCanonicalFacts.rentalInfo.depositAmount, 39000)
assert.equal(payload.sellerCanonicalFactReadiness.monthlyRent, true)

const publication = buildRentalListingEditPublicationDraft(editedForm)
assert.equal(publication.listingType, 'Rental')
assert.equal(publication.askingPrice, 19500)
assert.equal(publication.status, 'Ready')

console.log('rental listing edit model tests passed')
