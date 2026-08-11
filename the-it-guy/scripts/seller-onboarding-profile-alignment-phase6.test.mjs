import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { buildCanonicalSellerOnboardingPayload, validateSellerOnboardingFacts } from '../src/services/documents/sellerOnboardingFactTransformer.js'

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

const [sellerOnboardingSource, agencyPipelineSource] = await Promise.all([
  readFile(new URL('../src/pages/SellerOnboarding.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/pages/agency/AgencyPipelinePage.jsx', import.meta.url), 'utf8'),
])

function assertSourceIncludes(source, token, message) {
  assert.ok(source.includes(token), message)
}

test('seller onboarding persists profile-compatible aliases on draft and submit', () => {
  assertSourceIncludes(
    sellerOnboardingSource,
    'function buildSellerEntityProfileAliases(form = {})',
    'Seller onboarding should centralize entity/profile alias mapping.',
  )
  assertSourceIncludes(
    sellerOnboardingSource,
    '...buildSellerEntityProfileAliases(formForDraft)',
    'Draft saves should persist entity/profile aliases.',
  )
  assertSourceIncludes(
    sellerOnboardingSource,
    '...buildSellerEntityProfileAliases(submissionForm)',
    'Final submissions should persist entity/profile aliases.',
  )
  for (const token of [
    'owner_entity_type',
    'owner_structure_type',
    'seller_legal_type',
    'company_directors',
    'trust_trustees',
    'authorised_signatory_name',
    'authorised_trustee_name',
    'foreign_owner_country',
    'foreign_registration_number',
  ]) {
    assertSourceIncludes(sellerOnboardingSource, token, `Seller onboarding aliases should include ${token}.`)
  }
})

test('seller onboarding final validation gates entity-specific profile fields', () => {
  const validationBlock = sellerOnboardingSource.match(/const submissionSellerMissing = \[[\s\S]*?\]\.filter\(Boolean\)/)?.[0] || ''
  assertSourceIncludes(validationBlock, 'Tax number', 'Final submit should require seller tax number.')
  assertSourceIncludes(validationBlock, 'SA resident status', 'Final submit should require SA resident status.')
  assertSourceIncludes(validationBlock, 'Date of birth', 'Final submit should require DOB for natural-person sellers.')
  assertSourceIncludes(validationBlock, 'Nationality', 'Final submit should require nationality for natural-person sellers.')
  assertSourceIncludes(validationBlock, 'Foreign country / jurisdiction', 'Final submit should require foreign jurisdiction.')
  assertSourceIncludes(validationBlock, 'At least one company director', 'Final submit should require company directors.')
  assertSourceIncludes(validationBlock, 'Company signing authority', 'Final submit should require company authority.')
  assertSourceIncludes(validationBlock, 'At least one trustee', 'Final submit should require trustees.')
  assertSourceIncludes(validationBlock, 'Trust signing authority', 'Final submit should require trust authority.')
})

test('agency seller profile reads full director and trustee names from onboarding records', () => {
  const formatterBlock = agencyPipelineSource.match(/function formatKingstonsSellerProfilePeople[\s\S]*?\n}\n\nfunction buildKingstonsSellerProfilePeople/)?.[0] || ''
  assertSourceIncludes(formatterBlock, 'const firstName = normalizeText', 'Profile formatter should split first names from entity records.')
  assertSourceIncludes(formatterBlock, 'const surname = normalizeText', 'Profile formatter should read surnames from entity records.')
  assertSourceIncludes(formatterBlock, '[firstName, surname].filter(Boolean).join', 'Profile formatter should render full director/trustee names.')
  assertSourceIncludes(agencyPipelineSource, 'company_directors', 'Profile should hydrate company director aliases.')
  assertSourceIncludes(agencyPipelineSource, 'trust_trustees', 'Profile should hydrate trustee aliases.')
  assertSourceIncludes(agencyPipelineSource, 'foreign_registration_number', 'Profile should hydrate foreign registration aliases.')
})

test('canonical facts preserve profile-aligned company, trust, and foreign owner fields', () => {
  const listing = {
    id: '11111111-1111-4111-8111-111111111111',
    propertyCategory: 'residential',
    propertyStructureType: 'freehold',
  }
  const baseForm = {
    sellerFirstName: 'Primary',
    sellerSurname: 'Contact',
    email: 'primary@example.test',
    phone: '0820000000',
    sellerTaxNumber: '1234567890',
    saResident: 'yes',
    popiConsentAccepted: true,
    popiConsentAcceptedAt: '2026-08-11T08:00:00.000Z',
    arch9TermsAccepted: true,
    propertyCategory: 'residential',
    propertyStructureType: 'freehold',
    mandateType: 'sole',
    ratesTaxes: '1500',
    leviesNotApplicable: true,
    waterBillingType: 'municipal',
    propertyAddressDetails: {
      line1: '10 Example Street',
      suburb: 'Parkview',
      city: 'Johannesburg',
      province: 'Gauteng',
      postalCode: '2193',
    },
  }

  const companyPayload = buildCanonicalSellerOnboardingPayload({
    ...baseForm,
    ownerEntityType: 'foreign',
    ownerStructureType: 'foreign_company',
    ownershipType: 'company',
    companyName: 'Profile Saved Company Pty Ltd',
    companyRegistrationNumber: '2026/123456/07',
    companyRegisteredAddress: '10 Example Street, Johannesburg',
    companyDirectors: [
      { firstName: 'Alex', surname: 'Director', fullName: 'Alex Director', email: 'alex@example.test' },
    ],
    authorisedSignatoryName: 'Alex Director',
    authorisedSignatoryCapacity: 'Director',
    authorisedSignatoryEmail: 'alex@example.test',
    authorisedSignatoryPhone: '0821111111',
    companyResolutionDate: '2026-08-01',
    companyAuthorityBasis: 'Board resolution',
    foreignOwnerCountry: 'United Kingdom',
    foreignRegistrationNumber: 'FC-123',
    foreignResidencyStatus: 'Signing abroad',
  }, listing, { draft: false })

  assert.equal(companyPayload.canonicalSellerFacts.seller.owner_structure_type, 'foreign_company')
  assert.equal(companyPayload.canonicalSellerFacts.seller.foreign_owner, true)
  assert.equal(companyPayload.canonicalSellerFacts.seller.foreign.registration_number, 'FC-123')
  assert.equal(companyPayload.canonicalSellerFacts.seller.company.name, 'Profile Saved Company Pty Ltd')
  assert.equal(companyPayload.canonicalSellerFacts.seller.company.directors[0].full_name, 'Alex Director')
  assert.equal(validateSellerOnboardingFacts(companyPayload.canonicalSellerFacts, { draft: false }).ok, true)

  const trustPayload = buildCanonicalSellerOnboardingPayload({
    ...baseForm,
    ownerEntityType: 'trust',
    ownerStructureType: 'trust',
    ownershipType: 'trust',
    trustName: 'Profile Saved Trust',
    trustRegistrationNumber: 'IT1234/2026',
    trustRegisteredAddress: '11 Trust Road, Cape Town',
    trustees: [
      { firstName: 'Taylor', surname: 'Trustee', fullName: 'Taylor Trustee', email: 'taylor@example.test' },
    ],
    authorisedTrusteeName: 'Taylor Trustee',
    authorisedTrusteeCapacity: 'Trustee',
    authorisedTrusteeEmail: 'taylor@example.test',
    authorisedTrusteePhone: '0831111111',
    trustAuthorityBasis: 'Letters of authority',
  }, listing, { draft: false })

  assert.equal(trustPayload.canonicalSellerFacts.seller.owner_entity_type, 'trust')
  assert.equal(trustPayload.canonicalSellerFacts.seller.trust.name, 'Profile Saved Trust')
  assert.equal(trustPayload.canonicalSellerFacts.seller.trust.trustees[0].full_name, 'Taylor Trustee')
  assert.equal(validateSellerOnboardingFacts(trustPayload.canonicalSellerFacts, { draft: false }).ok, true)
})

console.log('seller onboarding profile alignment phase 6 passed')
