import assert from 'node:assert/strict'
import test from 'node:test'

import { buildSellerSubject } from '../sellerSubjectModel.js'

test('never infers an unresolved seller subject as an individual', () => {
  const subject = buildSellerSubject({ lead: { sellerName: 'Alex Landman', sellerEmail: 'alex@example.com' } })

  assert.equal(subject.kind, 'unknown')
  assert.equal(subject.status, 'ownership_setup_required')
  assert.equal(subject.onboardingReady, false)
  assert.equal(subject.requiredSetupFields.includes('Ownership route'), true)
})

test('does not trust a legacy individual default until an agent or submitted onboarding confirms it', () => {
  const legacy = buildSellerSubject({
    formData: {
      ownerEntityType: 'natural_person',
      ownerStructureType: 'individual',
      ownershipType: 'individual',
      sellerFirstName: 'Alex',
      sellerSurname: 'Landman',
    },
  })
  const confirmed = buildSellerSubject({
    formData: {
      ownerEntityType: 'natural_person',
      ownerStructureType: 'individual',
      ownershipType: 'individual',
      ownershipRouteConfirmed: true,
      sellerFirstName: 'Alex',
      sellerSurname: 'Landman',
    },
  })

  assert.equal(legacy.kind, 'unknown')
  assert.equal(legacy.legalOwner.name, '')
  assert.equal(confirmed.kind, 'individual')
  assert.equal(confirmed.legalOwner.name, 'Alex Landman')
})

test('separates a company legal owner from its primary contact and signatory', () => {
  const subject = buildSellerSubject({
    formData: {
      ownerEntityType: 'company',
      ownerStructureType: 'company',
      companyName: 'Kingdom Holdings (Pty) Ltd',
      companyRegistrationNumber: '2020/123456/07',
      sellerFirstName: 'Jane',
      sellerSurname: 'Smith',
      email: 'jane@example.com',
      authorisedSignatoryName: 'John Doe',
      authorisedSignatoryEmail: 'john@example.com',
    },
  })

  assert.equal(subject.kind, 'company')
  assert.equal(subject.legalOwner.name, 'Kingdom Holdings (Pty) Ltd')
  assert.equal(subject.primaryContact.name, 'Jane Smith')
  assert.equal(subject.signers[0].name, 'John Doe')
  assert.equal(subject.identityRequirement.field, 'company_registration_number')
})

test('does not allow an entity route to send onboarding without its legal authority', () => {
  const subject = buildSellerSubject({
    formData: {
      ownerEntityType: 'company',
      ownerStructureType: 'company',
      companyName: 'Kingdom Holdings (Pty) Ltd',
      companyRegistrationNumber: '2020/123456/07',
      sellerFirstName: 'Jane',
      sellerSurname: 'Smith',
      email: 'jane@example.com',
    },
  })

  assert.equal(subject.onboardingReady, false)
  assert.equal(subject.requiredSetupFields.includes('Authorised signer'), true)
})

test('uses canonical seller facts ahead of compatibility inputs', () => {
  const subject = buildSellerSubject({
    formData: { ownerEntityType: 'natural_person', ownerStructureType: 'individual', sellerFirstName: 'Legacy', sellerSurname: 'Seller' },
    canonicalFacts: {
      seller: {
        owner_entity_type: 'trust',
        owner_structure_type: 'trust',
        trust_name: 'The Example Family Trust',
        trust_registration_number: 'IT123/2020',
        authorised_trustee_name: 'Tracy Trustee',
        email: 'tracy@example.com',
      },
    },
  })

  assert.equal(subject.kind, 'trust')
  assert.equal(subject.legalOwner.name, 'The Example Family Trust')
  assert.equal(subject.signers[0].name, 'Tracy Trustee')
  assert.equal(subject.source, 'canonical_seller_facts')
})

test('can prepare a company onboarding route from canonical facts alone', () => {
  const subject = buildSellerSubject({
    canonicalFacts: {
      seller: {
        owner_entity_type: 'company',
        owner_structure_type: 'company',
        first_name: 'Jane',
        surname: 'Smith',
        email: 'jane@example.com',
        company: {
          name: 'Kingdom Holdings (Pty) Ltd',
          registration_number: '2020/123456/07',
          authorised_signatory: { full_name: 'John Doe', email: 'john@example.com' },
        },
      },
    },
  })

  assert.equal(subject.onboardingReady, true)
  assert.equal(subject.legalOwner.registrationNumber, '2020/123456/07')
  assert.equal(subject.signers[0].name, 'John Doe')
})

test('represents multi-owner and power-of-attorney signing routes explicitly', () => {
  const owners = buildSellerSubject({
    formData: {
      ownerEntityType: 'natural_person',
      ownerStructureType: 'multiple_owners',
      multipleOwners: [
        { name: 'Alex', surname: 'Landman', email: 'alex@example.com' },
        { name: 'Sam', surname: 'Landman', email: 'sam@example.com' },
      ],
    },
  })
  const poa = buildSellerSubject({
    formData: {
      ownerEntityType: 'natural_person',
      ownerStructureType: 'power_of_attorney',
      sellerFirstName: 'Alex',
      sellerSurname: 'Landman',
      email: 'alex@example.com',
      powerOfAttorneyName: 'Pat Representative',
      powerOfAttorneyPrincipalName: 'Alex Landman',
      powerOfAttorneyPrincipalIdNumber: '8001015009087',
    },
  })

  assert.deepEqual(owners.signers.map((item) => item.name), ['Alex Landman', 'Sam Landman'])
  assert.equal(poa.kind, 'power_of_attorney')
  assert.equal(poa.signers[0].name, 'Pat Representative')
  assert.equal(poa.authorityRequirement, 'Power of attorney authority')
})

test('requires the principal identity before a power-of-attorney route can be sent', () => {
  const subject = buildSellerSubject({
    formData: {
      ownerEntityType: 'natural_person',
      ownerStructureType: 'power_of_attorney',
      sellerFirstName: 'Alex',
      sellerSurname: 'Landman',
      email: 'alex@example.com',
      powerOfAttorneyName: 'Pat Representative',
    },
  })

  assert.equal(subject.onboardingReady, false)
  assert.equal(subject.requiredSetupFields.includes('Principal ID/passport number'), true)
})
