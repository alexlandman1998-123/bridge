import assert from 'node:assert/strict'
import test from 'node:test'
import { PROPERTY_DISCLOSURE_QUESTIONS, isPropertyDisclosureDigitallyComplete } from '../propertyDisclosure.js'

const completeDisclosure = { responses: Object.fromEntries(PROPERTY_DISCLOSURE_QUESTIONS.map(question => [question.key, { answer: 'no', note: '' }])) }

import { LISTING_SELLER_PROFILE_CAPTURE_SOURCE, createListingSellerProfileBuilderDraft, buildListingSellerProfileCapturePayload } from '../listingSellerProfileBuilderModel.js'
import { readSellerPopiConsent } from '../../core/documents/sellerOnboardingConsent.js'
import {
  buildSellerLeadAgentOnboardingSubmission,
  buildSellerLeadManualCapturePayload,
  createSellerLeadAgentOnboardingDraft,
  getSellerLeadProfileEditChanges,
} from '../sellerLeadManualCaptureModel.js'

test('nested onboarding consent and legacy FICA fields survive capture, editing and reopen', () => {
  const acceptedAt = '2026-09-30T08:00:00Z'
  const existingFormData = {
    ownerEntityType: 'natural_person', ownerStructureType: 'individual', ownershipRouteConfirmed: true,
    sellerFirstName: 'Jane', sellerSurname: 'Owner', date_of_birth: '1980-01-01', nationality: 'South African',
    income_tax_number: 'TAX-1', sa_resident: false, residential_address: '10 Home Road',
    occupation: 'Teacher', source_of_funds: 'Employment', politically_exposed_person: false,
    sellerOnboardingConsents: { privacyProcessing: { accepted: true, acceptedAt, wordingVersion: 'original-wording' } },
    propertyDisclosure: { answers: { roof: 'yes' }, sellerSignature: { name: 'Jane Owner' } },
  }
  const listing = { sellerOnboarding: { formData: existingFormData } }
  const draft = createSellerLeadAgentOnboardingDraft({ listing, formData: existingFormData })
  assert.equal(draft.popiConsentAccepted, true)
  assert.equal(draft.popiConsent, 'Accepted')
  assert.equal(draft.incomeTaxNumber, 'TAX-1')
  assert.equal(draft.saResident, 'no')
  assert.equal(draft.politicallyExposedPerson, 'no')
  const captured = buildListingSellerProfileCapturePayload({ ...draft, sourceOfFunds: 'Savings' }, listing, { draft: true })
  const saved = { ...existingFormData, ...captured.formPatch }
  assert.deepEqual(saved.sellerOnboardingConsents, existingFormData.sellerOnboardingConsents)
  assert.equal(saved.popiConsentAcceptedAt, acceptedAt)
  assert.deepEqual(saved.propertyDisclosure, existingFormData.propertyDisclosure)
  assert.equal(captured.canonicalSellerFacts.seller.popi_consent_accepted, true)
  const reopened = createListingSellerProfileBuilderDraft({ sellerOnboarding: { formData: saved } })
  assert.equal(reopened.sourceOfFunds, 'Savings')
  assert.equal(reopened.incomeTaxNumber, 'TAX-1')
  assert.equal(reopened.residentialAddress, '10 Home Road')
  assert.equal(reopened.saResident, 'no')
  assert.equal(reopened.popiConsent, 'Accepted')
})

for (const branch of ['company', 'trust']) {
  test(`compact ${branch} profile retains FICA people and preserves an explicit decline`, () => {
    const person = { name: 'Pat', surname: 'Owner', idNumber: 'ID-123', nationality: 'South African', residentialAddress: '1 Main Road', controlBasis: 'Voting rights' }
    const people = branch === 'company' ? { companyBeneficialOwners: [person] }
      : { trustFounders: [person], trustBeneficiaries: [person], trustBeneficiaryClass: 'Descendants' }
    const existingFormData = {
      ownerEntityType: branch, ownerStructureType: branch, ownershipRouteConfirmed: true,
      companyName: 'Company Ltd', trustName: 'Family Trust',
      occupation: 'Property investment', sourceOfFunds: 'Business', politicallyExposedPerson: 'yes', politicallyExposedDetails: 'Former official',
      incomeTaxNumber: 'TAX-2', saResident: 'yes', ...people,
      sellerOnboardingConsents: { privacyProcessing: { accepted: false } }, popiConsent: 'Accepted',
    }
    const capture = buildSellerLeadManualCapturePayload({ form: { firstName: 'New contact' }, legacyFormData: existingFormData })
    assert.equal(capture.formPatch.occupation, 'Property investment')
    assert.equal(capture.formPatch.sourceOfFunds, 'Business')
    assert.equal(capture.formPatch.incomeTaxNumber, 'TAX-2')
    assert.equal(capture.canonicalSellerFacts.seller.popi_consent_accepted, false)
    const reopened = createListingSellerProfileBuilderDraft({ sellerOnboarding: { formData: { ...existingFormData, ...capture.formPatch } } })
    for (const key of Object.keys(people).filter(key => Array.isArray(people[key]))) assert.equal(reopened[key][0].idNumber, 'ID-123')
    assert.deepEqual(readSellerPopiConsent({ ...existingFormData, ...capture.formPatch }), { accepted: false, acceptedAt: '' })
  })
}

test('clearing FICA fields does not restore old aliases when a profile reopens', () => {
  const formData = { ownerStructureType: 'individual', ownershipRouteConfirmed: true, incomeTaxNumber: 'TAX', tax_number: 'OLD',
    saResident: 'yes', taxResident: 'yes', residentialAddress: 'New address', residentialStreet: 'Old address',
    sourceOfFunds: 'Salary', source_of_funds: 'Old savings', politicallyExposedPerson: 'yes', politically_exposed_person: 'yes' }
  const listing = { sellerOnboarding: { formData } }
  const draft = { ...createListingSellerProfileBuilderDraft(listing), incomeTaxNumber: '', saResident: '', residentialAddress: '', sourceOfFunds: '', politicallyExposedPerson: '' }
  const capture = buildListingSellerProfileCapturePayload(draft, listing, { draft: true })
  const reopened = createListingSellerProfileBuilderDraft({ sellerOnboarding: { formData: { ...formData, ...capture.formPatch } } })
  for (const key of ['incomeTaxNumber', 'saResident', 'residentialAddress', 'sourceOfFunds', 'politicallyExposedPerson']) assert.equal(reopened[key], '', key)
  assert.equal(capture.canonicalSellerFacts.seller.tax_number, '')
  assert.equal(capture.canonicalSellerFacts.seller.sa_resident, '')
  assert.equal(capture.canonicalSellerFacts.seller.residential_address, '')
})

test('unchanged seller drafts ignore object key order, whitespace, email case and number input types', () => {
  const before = { firstName: 'Jane', email: 'jane@example.com', garages: 0, notes: '', companyDirectors: [{ name: 'Jane', idNumber: '123', email: 'jane@example.com' }] }
  const after = { ...before, firstName: ' Jane ', email: 'JANE@example.com', garages: '0', notes: undefined,
    companyDirectors: [{ email: 'JANE@example.com', idNumber: '123', name: ' Jane ' }] }
  assert.deepEqual(getSellerLeadProfileEditChanges(before, after), [])
  assert.deepEqual(getSellerLeadProfileEditChanges(before, { ...after, garages: '', firstName: 'Pat' }), ['firstName', 'garages'])
  assert.deepEqual(getSellerLeadProfileEditChanges({ consent: false }, { consent: true }), ['consent'])
  assert.deepEqual(getSellerLeadProfileEditChanges(before, { ...before, companyDirectors: [{ ...before.companyDirectors[0], idNumber: '' }] }), ['companyDirectors'])
})

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
      occupation: 'Teacher',
      sourceOfFunds: 'Employment income',
      politicallyExposedPerson: 'no',
      residentialAddress: '1 Main Road',
      incomeTaxNumber: '12345',
      saResident: 'Yes',
      ratesTaxes: '1000',
      leviesNotApplicable: true,
      maritalStatus: 'single',
      popiConsentAccepted: true,
      propertyDisclosure: { ...completeDisclosure, comments: 'Captured with the seller.' },
    },
    listing: { id: 'listing-1' },
    existingFormData: { propertyDisclosure: { answers: { roof: 'good' } } },
  })
  assert.deepEqual(complete.errors, [])
  assert.equal(complete.formData.canonicalSellerFacts.property.address_details.suburb, 'Sandton')
  assert.equal(complete.formData.canonicalSellerFacts.seller.tax_number, '12345')
  assert.equal(complete.formData.propertyDisclosure.comments, 'Captured with the seller.')
  assert.equal(isPropertyDisclosureDigitallyComplete(complete.formData.propertyDisclosure), false)
  assert.equal(complete.formData.popiConsentAccepted, true)
})

test('agent onboarding keeps beneficial owners and FICA answers in the shared seller facts', () => {
  const draft = createSellerLeadAgentOnboardingDraft({
    listing: { id: 'listing-1' },
    formData: {
      ownershipType: 'company',
      companyName: 'Example Property Holdings',
      companyBeneficialOwners: [{ name: 'Ana', surname: 'Nkosi', idNumber: '8001015009087', nationality: 'South African', residentialAddress: '1 Main Road', ownershipShare: '30%' }],
      occupation: 'Property holding company',
      sourceOfFunds: 'Rental income',
      politicallyExposedPerson: 'no',
    },
  })
  const { formData } = buildSellerLeadAgentOnboardingSubmission({ draft, listing: { id: 'listing-1' } })
  assert.equal(formData.companyBeneficialOwners[0].ownershipShare, '30%')
  assert.equal(formData.canonicalSellerFacts.seller.company.beneficial_owners[0].id_number, '8001015009087')
  assert.equal(formData.canonicalSellerFacts.seller.source_of_funds, 'Rental income')
})

const manualBase = {
  propertyDisclosure: completeDisclosure,
  phone: '0820000000', incomeTaxNumber: '12345', saResident: 'yes', popiConsentAccepted: true,
  propertyAddress: '1 Main Road', propertySuburb: 'Sandton', propertyCity: 'Johannesburg', propertyProvince: 'Gauteng',
  ratesTaxes: '0', waterBillingType: 'municipal', leviesNotApplicable: true, occupation: 'Property owner', sourceOfFunds: 'Savings', politicallyExposedPerson: 'no',
}
const person = { name: 'Pat', surname: 'Representative', idNumber: '8001015009087', nationality: 'South African', residentialAddress: '2 Main Road' }

for (const branch of ['company', 'close_corporation', 'foreign_company', 'trust', 'foreign_trust']) {
  test(`${branch} can be captured without hidden personal fields or email`, () => {
    const company = branch.includes('company') || branch === 'close_corporation'
    const draft = {
      ...manualBase, branch, primaryContactName: 'Administrative Contact',
      foreignOwnerCountry: branch.startsWith('foreign') ? 'United Kingdom' : '',
      ...(company ? {
        companyName: 'Owner Holdings', companyRegistrationNumber: 'REG-123', companyRegisteredAddress: '3 Main Road',
        companyDirectors: [person], companyBeneficialOwners: [{ ...person, ownershipShare: '100%' }],
        authorisedSignatoryName: 'Pat Representative', authorisedSignatoryCapacity: 'Director',
        companyResolutionDate: '2026-10-01', companyAuthorityBasis: 'Board resolution',
      } : {
        trustName: 'Owner Trust', trustRegistrationNumber: 'IT123', trustRegisteredAddress: '3 Main Road',
        trustees: [person], trustFounders: [person], trustBeneficiaryClass: 'Descendants',
        authorisedTrusteeName: 'Pat Representative', authorisedTrusteeCapacity: 'Trustee', trustAuthorityBasis: 'Trustee resolution',
      }),
    }
    const result = buildSellerLeadAgentOnboardingSubmission({ draft })
    assert.deepEqual(result.errors, [])
    assert.equal(result.formData.canonicalSellerFacts.seller.name, company ? 'Owner Holdings' : 'Owner Trust')
    assert.equal(result.formData.canonicalSellerFacts.seller.contact.name, 'Administrative Contact')
    assert.equal(result.formData.canonicalSellerFacts.seller.first_name, '')
    const reopened = createSellerLeadAgentOnboardingDraft({ formData: result.formData })
    assert.equal(reopened.primaryContactName, 'Administrative Contact')
    assert.equal(reopened.sellerFirstName, '')
    assert.equal(reopened.branch, branch)
    const missingAuthority = buildSellerLeadAgentOnboardingSubmission({ draft: { ...draft, companyAuthorityBasis: '', trustAuthorityBasis: '' } })
    assert.ok(missingAuthority.errors.some((message) => /authority basis/i.test(message)))
  })
}

test('foreign individual manual capture accepts passport without an SA ID or email', () => {
  const draft = { ...manualBase, branch: 'foreign_individual', sellerFirstName: 'Alex', sellerSurname: 'Owner',
    foreignOwnerCountry: 'United Kingdom', foreignPassportNumber: 'UK123456', dateOfBirth: '1980-01-01',
    nationality: 'British', residentialAddress: '2 Main Road', maritalStatus: 'single' }
  const result = buildSellerLeadAgentOnboardingSubmission({ draft })
  assert.deepEqual(result.errors, [])
  assert.equal(result.formData.canonicalSellerFacts.seller.foreign.passport_number, 'UK123456')
  assert.ok(buildSellerLeadAgentOnboardingSubmission({ draft: { ...draft, foreignPassportNumber: '' } }).errors.some((message) => /passport/i.test(message)))
  assert.ok(buildSellerLeadAgentOnboardingSubmission({ draft: { ...draft, email: 'invalid' } }).errors.some((message) => /email/i.test(message)))
})

for (const [value, expected, declaration] of [[true, 'bonded', true], [false, 'no_bond', false], ['active', 'bonded', true], ['none', 'no_bond', false], ['unknown', 'unknown', null], [undefined, 'unknown', null]]) {
  test(`bond answer ${String(value)} and zero rates survive capture and reopen`, () => {
    const result = buildSellerLeadManualCapturePayload({ form: { sellerOwnershipRoute: 'individual', bondExists: value, ratesAndTaxes: 0 } })
    assert.equal(result.formPatch.bondStatus, expected)
    assert.equal(result.canonicalSellerFacts.finance.existing_bond, declaration)
    assert.equal(createSellerLeadAgentOnboardingDraft({ formData: result.formPatch }).bondStatus, expected)
    assert.equal(result.formPatch.ratesTaxes, '0')
  })
}

test('an explicit unknown bond answer takes priority over a stale boolean declaration', () => {
  const result = buildSellerLeadManualCapturePayload({ form: { bondStatus: 'unknown', bondExists: false }, legacyFormData: { bondStatus: 'active' } })
  assert.equal(result.canonicalSellerFacts.finance.existing_bond, null)
})

test('an entity lead name is not fabricated into a contact first name', () => {
  const draft = createSellerLeadAgentOnboardingDraft({ lead: { sellerName: 'Owner Holdings' }, formData: { ownershipType: 'company', companyName: 'Owner Holdings' } })
  assert.equal(draft.sellerFirstName, '')
  assert.equal(draft.primaryContactName, '')
  assert.equal(draft.companyName, 'Owner Holdings')
})

test('manual submission can remove a stale email instead of restoring it from saved data', () => {
  const result = buildSellerLeadAgentOnboardingSubmission({
    draft: { ...manualBase, branch: 'individual', sellerFirstName: 'Alex', sellerSurname: 'Owner', idNumber: '8001015009087', dateOfBirth: '1980-01-01', nationality: 'South African', residentialAddress: '1 Main Road', maritalStatus: 'single', email: '' },
    existingFormData: { email: 'invalid-old-value', sellerEmail: 'invalid-old-value' },
  })
  assert.deepEqual(result.errors, [])
  assert.equal(result.formData.email, '')
  assert.equal(result.formData.sellerEmail, '')
  assert.equal(result.formData.canonicalSellerFacts.seller.email, '')
})

test('compact lead capture retains spouse details, explicit contact clearing and dual agency', () => {
  const result = buildSellerLeadManualCapturePayload({ form: {
    sellerOwnershipRoute: 'married', maritalStatus: 'married_in_community',
    sellerFirstName: 'Pat', sellerSurname: 'Owner', spouseName: 'Sam Spouse', spouseIdNumber: 'SPOUSE-ID',
    email: '', sellerEmail: 'retired@example.test', phone: '', sellerPhone: '0123456789',
    mandateType: 'dual', otherAgencyName: 'Second Agency',
  } })
  assert.equal(result.formPatch.spouseName, 'Sam Spouse')
  assert.equal(result.formPatch.spouseIdNumber, 'SPOUSE-ID')
  assert.equal(result.canonicalSellerFacts.seller.marital_regime, 'in_community')
  assert.equal(result.formPatch.email, '')
  assert.equal(result.formPatch.phone, '')
  assert.equal(result.formPatch.mandateType, 'dual')
  assert.equal(result.formPatch.otherAgencyName, 'Second Agency')
  const reopened = createSellerLeadAgentOnboardingDraft({ formData: result.formPatch })
  assert.equal(reopened.otherAgencyName, 'Second Agency')
})
