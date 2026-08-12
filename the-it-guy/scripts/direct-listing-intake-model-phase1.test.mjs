import assert from 'node:assert/strict'

import {
  DIRECT_LISTING_INTAKE_SOURCE,
  DIRECT_LISTING_INTAKE_VERSION,
  buildDirectListingCanonicalFacts,
  buildDirectListingComplianceDeclarations,
  buildDirectListingIntakePayload,
  buildDirectListingOnboardingFormData,
  buildDirectListingPartyFacts,
  buildDirectListingPropertyFacts,
} from '../src/lib/directListingIntakeModel.js'

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

test('builds declaration-only compliance status without upload requirements', () => {
  const declarations = buildDirectListingComplianceDeclarations({
    hasSignedMandate: true,
    mandateType: 'dual',
    hasSignedPropertyConditionDisclosure: false,
    hasSignedFicaForm: true,
  })

  assert.equal(declarations.version, DIRECT_LISTING_INTAKE_VERSION)
  assert.equal(declarations.source, DIRECT_LISTING_INTAKE_SOURCE)
  assert.equal(declarations.declarationsOnly, true)
  assert.equal(declarations.uploadsRequired, false)
  assert.equal(declarations.evidenceRequired, false)
  assert.equal(declarations.mandate.hasSignedMandate, true)
  assert.equal(declarations.mandate.status, 'reported_held')
  assert.equal(declarations.mandate.mandateType, 'dual')
  assert.equal(declarations.propertyConditionDisclosure.signed, false)
  assert.equal(declarations.propertyConditionDisclosure.status, 'reported_not_held')
  assert.equal(declarations.ficaForm.signed, true)
  assert.equal(declarations.ficaForm.status, 'reported_held')
})

test('maps existing quick-add external mandate status as held but still declaration-only', () => {
  const declarations = buildDirectListingComplianceDeclarations({
    manualMandateStatus: 'signed_external_pending_upload',
    mandateType: 'sole',
  })

  assert.equal(declarations.mandate.hasSignedMandate, true)
  assert.equal(declarations.mandate.status, 'reported_held')
  assert.equal(declarations.uploadsRequired, false)
  assert.equal(declarations.evidenceRequired, false)
})

test('normalizes company facts for FICA requirement routing', () => {
  const party = buildDirectListingPartyFacts({
    sellerType: 'Company',
    companyName: 'Acme Property Holdings',
    sellerRegistrationNumber: '2024/123456/07',
    sellerEmail: 'ops@example.com',
    companyDirectors: [
      { name: 'Ava', surname: 'Director', email: 'ava@example.com', phone: '0820000000' },
      { fullName: 'Ben Board', email: 'ben@example.com' },
    ],
  })

  assert.equal(party.sellerLegalType, 'company')
  assert.equal(party.ownerEntityType, 'company')
  assert.equal(party.ownerStructureType, 'company')
  assert.equal(party.company.name, 'Acme Property Holdings')
  assert.equal(party.company.registrationNumber, '2024/123456/07')
  assert.equal(party.companyDirectors.length, 2)
  assert.equal(party.company_directors[0].fullName, 'Ava Director')
  assert.equal(party.directors[1].fullName, 'Ben Board')
})

test('normalizes trust facts for trustee-driven FICA requirements', () => {
  const party = buildDirectListingPartyFacts({
    sellerType: 'trust',
    trustName: 'The Sunrise Trust',
    trustRegistrationNumber: 'IT1234/2020',
    trustees: [
      { fullName: 'Tara Trustee', email: 'tara@example.com' },
      { name: 'Theo', surname: 'Trustee' },
    ],
  })

  assert.equal(party.sellerLegalType, 'trust')
  assert.equal(party.ownerEntityType, 'trust')
  assert.equal(party.ownerStructureType, 'trust')
  assert.equal(party.trust.name, 'The Sunrise Trust')
  assert.equal(party.trust.trustees.length, 2)
  assert.equal(party.trustees[0].fullName, 'Tara Trustee')
  assert.equal(party.trust_trustees[1].fullName, 'Theo Trustee')
})

test('captures sectional-title fields alongside global property facts', () => {
  const property = buildDirectListingPropertyFacts({
    propertyAddress: 'Unit 12, Ocean View, Cape Town',
    propertyStructureType: 'Sectional Title',
    propertyType: 'Apartment',
    unitNumber: '12',
    sectionNumber: '12',
    complexName: 'Ocean View',
    sectionalTitleNumber: 'SS 455/2019',
    country: 'South Africa',
  })

  assert.equal(property.propertyStructureType, 'sectional_title')
  assert.equal(property.property_structure_type, 'sectional_title')
  assert.equal(property.unitNumber, '12')
  assert.equal(property.complexName, 'Ocean View')
  assert.equal(property.sectionalTitleNumber, 'SS 455/2019')
})

test('normalizes foreign individual owner facts for portal and document requirement consumers', () => {
  const party = buildDirectListingPartyFacts({
    sellerType: 'foreign individual',
    sellerName: 'Mia',
    sellerSurname: 'Muller',
    sellerEmail: 'mia@example.com',
    sellerPhone: '+49 30 123456',
    foreignOwnerCountry: 'Germany',
    foreignPassportNumber: 'C01X2345',
  })

  assert.equal(party.sellerLegalType, 'foreign_individual')
  assert.equal(party.ownerEntityType, 'foreign')
  assert.equal(party.ownerStructureType, 'foreign_individual')
  assert.equal(party.foreignOwner, true)
  assert.equal(party.foreign_owner, true)
  assert.equal(party.foreign.country, 'Germany')
  assert.equal(party.foreign.passportNumber, 'C01X2345')
})

test('builds canonical facts and onboarding form data from the same intake contract', () => {
  const form = {
    sellerType: 'multiple owners',
    sellerName: 'Primary',
    sellerSurname: 'Owner',
    sellerEmail: 'primary@example.com',
    sellerPhone: '0821111111',
    propertyAddress: '10 Main Road',
    propertyStructureType: 'full title',
    multipleOwners: [
      { name: 'Primary', surname: 'Owner', email: 'primary@example.com' },
      { name: 'Second', surname: 'Owner', email: 'second@example.com' },
    ],
    hasSignedMandate: 'yes',
    hasSignedPropertyConditionDisclosure: 'yes',
    hasSignedFicaForm: 'no',
    sellerPortalInviteRequested: true,
  }
  const onboardingFormData = buildDirectListingOnboardingFormData(form, {
    capturedBy: 'agent-1',
    capturedAt: '2026-08-12T08:00:00.000Z',
  })
  const canonicalFacts = buildDirectListingCanonicalFacts(form, {
    capturedBy: 'agent-1',
    capturedAt: '2026-08-12T08:00:00.000Z',
  })
  const payload = buildDirectListingIntakePayload(form)

  assert.equal(onboardingFormData.ownerStructureType, 'multiple_owners')
  assert.equal(onboardingFormData.owners.length, 2)
  assert.equal(onboardingFormData.complianceDeclarations.uploadsRequired, false)
  assert.equal(canonicalFacts.seller.legal_type, 'multiple_owners')
  assert.equal(canonicalFacts.seller.owners.length, 2)
  assert.equal(canonicalFacts.compliance_declarations.ficaForm.status, 'reported_not_held')
  assert.equal(payload.sellerPortalInvite.requested, true)
  assert.equal(payload.sellerPortalInvite.destinationEmail, 'primary@example.com')
  assert.equal(payload.uploadsRequired, false)
  assert.equal(payload.evidenceRequired, false)
})
