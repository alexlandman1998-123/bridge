import assert from 'node:assert/strict'
import test from 'node:test'

import { LISTING_SELLER_PROFILE_CAPTURE_SOURCE } from '../listingSellerProfileBuilderModel.js'
import {
  buildSellerLeadAgentOnboardingSubmission,
  buildSellerLeadManualCapturePayload,
  createSellerLeadAgentOnboardingDraft,
} from '../sellerLeadManualCaptureModel.js'

test('seller-lead manual capture produces the same canonical source marker as listings', () => {
  const result = buildSellerLeadManualCapturePayload({
    form: {
      sellerOwnershipRoute: 'company',
      ownerEntityType: 'company',
      ownerStructureType: 'company',
      firstName: 'Jane',
      lastName: 'Smith',
      email: 'jane@example.com',
      propertyAddress: '1 Main Road',
      companyName: 'Kingdom Holdings (Pty) Ltd',
      companyRegistrationNumber: '2020/123456/07',
      authorisedSignatoryName: 'John Doe',
      authorisedSignatoryCapacity: 'Director',
      authorisedSignatoryEmail: 'john@example.com',
    },
    listing: { id: 'listing-1' },
  })

  assert.equal(result.formPatch.sellerProfileCaptureSource, LISTING_SELLER_PROFILE_CAPTURE_SOURCE)
  assert.equal(result.formPatch.ownerStructureType, 'company')
  assert.equal(result.canonicalSellerFacts.seller.owner_structure_type, 'company')
  assert.equal(result.canonicalSellerFacts.seller.company.name, 'Kingdom Holdings (Pty) Ltd')
})

test('seller-lead manual capture keeps a power-of-attorney route instead of collapsing it to individual', () => {
  const result = buildSellerLeadManualCapturePayload({
    form: {
      sellerOwnershipRoute: 'power_of_attorney',
      powerOfAttorneyPrincipalName: 'Alex Landman',
      powerOfAttorneyPrincipalIdNumber: '8001015009087',
      powerOfAttorneyName: 'Pat Representative',
      powerOfAttorneyEmail: 'pat@example.com',
      propertyAddress: '1 Main Road',
    },
  })

  assert.equal(result.formPatch.ownerStructureType, 'power_of_attorney')
  assert.equal(result.formPatch.powerOfAttorneyPrincipalName, 'Alex Landman')
  assert.equal(result.canonicalSellerFacts.seller.owner_structure_type, 'power_of_attorney')
})

test('agent onboarding pre-fills lead, contact, listing and existing onboarding fields', () => {
  const draft = createSellerLeadAgentOnboardingDraft({
    lead: { sellerName: 'Jane', sellerSurname: 'Smith', sellerPropertyAddress: '1 Main Road' },
    contact: { email: 'jane@example.com', phone: '0820000000' },
    listing: {
      id: 'listing-1', suburb: 'Sandton', city: 'Johannesburg', province: 'Gauteng',
      sellerOnboarding: { form_data: { sellerFirstName: 'Stale name' } },
    },
    formData: { ownershipType: 'individual', idNumber: '8001015009087', incomeTaxNumber: '12345' },
  })

  assert.equal(draft.branch, 'individual')
  assert.equal(draft.sellerFirstName, 'Jane')
  assert.equal(draft.email, 'jane@example.com')
  assert.equal(draft.propertySuburb, 'Sandton')
  assert.equal(draft.incomeTaxNumber, '12345')
})

test('agent onboarding validates required facts and preserves existing onboarding sections', () => {
  const draft = createSellerLeadAgentOnboardingDraft({
    lead: { sellerName: 'Jane', sellerSurname: 'Smith', sellerPropertyAddress: '1 Main Road' },
    contact: { email: 'jane@example.com', phone: '0820000000' },
    listing: { id: 'listing-1', suburb: 'Sandton', city: 'Johannesburg', province: 'Gauteng' },
    formData: { ownershipType: 'individual', idNumber: '8001015009087' },
  })
  const incomplete = buildSellerLeadAgentOnboardingSubmission({ draft, listing: { id: 'listing-1' } })
  assert.ok(incomplete.errors.some((message) => /consent/i.test(message)))
  assert.ok(incomplete.errors.some((message) => /tax number/i.test(message)))

  const complete = buildSellerLeadAgentOnboardingSubmission({
    draft: {
      ...draft,
      dateOfBirth: '1980-01-01',
      nationality: 'South African',
      residentialAddress: '1 Main Road',
      incomeTaxNumber: '12345',
      saResident: 'Yes',
      ratesTaxes: '1000',
      leviesNotApplicable: true,
      maritalStatus: 'single',
      popiConsentAccepted: true,
    },
    listing: { id: 'listing-1' },
    existingFormData: { propertyDisclosure: { answers: { roof: 'good' } } },
  })
  assert.deepEqual(complete.errors, [])
  assert.equal(complete.formData.canonicalSellerFacts.property.address_details.suburb, 'Sandton')
  assert.equal(complete.formData.canonicalSellerFacts.seller.tax_number, '12345')
  assert.equal(complete.formData.propertyDisclosure.answers.roof, 'good')
  assert.equal(complete.formData.popiConsentAccepted, true)
})
