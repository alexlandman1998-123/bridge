import assert from 'node:assert/strict'
import {
  buildRentalCanonicalFacts,
  buildRentalPrivateListingPayload,
  buildRentalPublicationDraft,
  RENTAL_LISTING_INITIAL_FORM,
  validateRentalListingDraftForm,
  validateRentalPrivatePropertyRequiredFields,
} from '../src/services/rentals/rentalListingDraftModel.js'
import {
  buildRentalListingEditForm,
  buildRentalListingUpdatePayload,
} from '../src/services/rentals/rentalListingEditModel.js'
import {
  buildRentalListingIndexRow,
} from '../src/services/rentals/rentalListingIndexModel.js'
import {
  PRIVATE_PROPERTY_RENTAL_READINESS_FIELDS,
  getRentalListingFieldNames,
} from '../src/services/rentals/rentalListingArchitecture.js'
import {
  buildRentalListingCreateProgress,
} from '../src/services/rentals/rentalListingCreateFlowModel.js'

const completeForm = {
  ...RENTAL_LISTING_INITIAL_FORM,
  title: '2 bedroom apartment in Green Point',
  landlordName: 'A Landlord',
  landlordEmail: 'landlord@example.com',
  propertyAddress: '99 Leith Road',
  streetNumber: '99',
  streetName: 'Leith Road',
  suburb: 'Green Point',
  city: 'Cape Town',
  province: 'Western Cape',
  privatePropertySuburbId: '11017',
  propertyType: 'Apartment',
  bedrooms: '2',
  bathrooms: '2',
  garages: '0',
  monthlyRent: '10000',
  depositAmount: '10000',
  availableFrom: '2026-09-01',
  mandateEndDate: '2027-02-28',
  mandateStatus: 'signed_uploaded',
  marketingApprovalStatus: 'approved',
  garden: 'no',
  pool: 'no',
  flatlet: 'no',
  description: 'Bright apartment with secure parking and easy access to local amenities.',
  galleryImages: [
    { id: 'image-1', url: 'https://example.test/rental-1.jpg' },
    { id: 'image-2', url: 'https://example.test/rental-2.jpg' },
    { id: 'image-3', url: 'https://example.test/rental-3.jpg' },
  ],
}

const missingPrivatePropertyFields = validateRentalPrivatePropertyRequiredFields({
  ...completeForm,
  streetNumber: '',
  privatePropertySuburbId: '',
  mandateStatus: 'sent',
  marketingApprovalStatus: 'draft',
  galleryImages: completeForm.galleryImages.slice(0, 2),
})

assert.ok(missingPrivatePropertyFields.includes('Street number is required for Private Property.'))
assert.ok(missingPrivatePropertyFields.includes('Private Property suburb ID is required.'))
assert.ok(missingPrivatePropertyFields.includes('At least three listing photos are required for Private Property.'))
assert.ok(missingPrivatePropertyFields.includes('A signed rental mandate is required for Private Property.'))
assert.ok(missingPrivatePropertyFields.includes('Marketing approval is required for Private Property.'))

assert.deepEqual(validateRentalListingDraftForm(completeForm, { organisationId: '11111111-1111-4111-8111-111111111111' }), [])

const canonicalFacts = buildRentalCanonicalFacts(completeForm)
assert.equal(canonicalFacts.privatePropertySuburbId, '11017')
assert.equal(canonicalFacts.private_property_suburb_id, '11017')
assert.equal(canonicalFacts.addressProfile.privatePropertySuburbId, '11017')
assert.equal(canonicalFacts.addressProfile.private_property_suburb_id, '11017')

const publicationDraft = buildRentalPublicationDraft(completeForm)
assert.equal(publicationDraft.privatePropertySuburbId, '11017')
assert.equal(publicationDraft.private_property_suburb_id, '11017')

const privateListingPayload = buildRentalPrivateListingPayload(completeForm, {
  organisationId: '11111111-1111-4111-8111-111111111111',
})
assert.equal(privateListingPayload.privatePropertySuburbId, '11017')
assert.equal(privateListingPayload.private_property_suburb_id, '11017')
assert.equal(privateListingPayload.sellerCanonicalFacts.privatePropertySuburbId, '11017')
assert.equal(privateListingPayload.sellerCanonicalFactReadiness.privatePropertySuburbId, true)

const indexRow = buildRentalListingIndexRow({
  ...privateListingPayload,
  listingPublicationData: publicationDraft,
})
assert.equal(indexRow.privatePropertySuburbId, '11017')

const editForm = buildRentalListingEditForm({
  ...privateListingPayload,
  listingPublicationData: publicationDraft,
})
assert.equal(editForm.privatePropertySuburbId, '11017')

const updatePayload = buildRentalListingUpdatePayload(completeForm)
assert.equal(updatePayload.privatePropertySuburbId, '11017')
assert.equal(updatePayload.private_property_suburb_id, '11017')
assert.equal(updatePayload.sellerCanonicalFacts.privatePropertySuburbId, '11017')

assert.ok(PRIVATE_PROPERTY_RENTAL_READINESS_FIELDS.includes('privatePropertySuburbId'))
assert.ok(getRentalListingFieldNames().includes('privatePropertySuburbId'))
assert.equal(buildRentalListingCreateProgress(completeForm).firstIncompleteStep, '')

console.log('Rental Private Property required fields contract passed')
