import assert from 'node:assert/strict'
import test from 'node:test'
import { buildSellerPostOnboardingDrafts, createSellerPostOnboardingDraftFingerprint } from '../sellerPostOnboardingDrafts.js'

const generatedAt = '2026-09-19T08:00:00.000Z'
const input = {
  formData: {
    sellerFirstName: 'Alex',
    sellerSurname: 'Landman',
    idNumber: '8001015009087',
    email: 'alex@example.test',
    mobile: '0820000000',
    occupation: 'Researcher',
    sourceOfFunds: 'Salary',
    politicallyExposedPerson: 'no',
    propertyAddress: { line1: '1 Market Street', suburb: 'Pretoria', city: 'Tshwane' },
    sellerOnboardingCompletion: { version: 'seller_onboarding_submission_v1', completedAt: generatedAt },
    propertyDisclosure: { kind: 'residential', responses: {} },
  },
  listing: { id: 'listing-1', listingReference: 'KR-001' },
  branding: { organisationName: 'Kingdom Real Estate', logoLightUrl: 'https://example.test/logo-light.png' },
  generatedAt,
}

test('freezes disclosure, FICA and review-only mandate HTML after seller onboarding', () => {
  const result = buildSellerPostOnboardingDrafts(input)

  assert.equal(result.contract, 'arch9-seller-post-onboarding-drafts-v3')
  assert.equal(result.source.onboardingVersion, 'seller_onboarding_submission_v1')
  assert.equal(result.source.generatedAt, generatedAt)
  assert.equal(result.brandingSnapshot.contract, 'arch9-seller-document-branding-snapshot-v1')
  assert.equal(result.brandingSnapshot.organisationName, 'Kingdom Real Estate')
  assert.match(result.brandingSnapshot.fingerprint, /^fnv1a-32:[0-9a-f]{8}$/)
  assert.equal(result.documents.length, 3)

  const disclosure = result.documents.find((document) => document.key === 'signed_disclosure_form')
  const fica = result.documents.find((document) => document.key === 'fica_review_draft')
  const mandate = result.documents.find((document) => document.key === 'mandate_preparation_summary')

  assert.equal(disclosure.status, 'awaiting_agent_review')
  assert.equal(disclosure.artifactStage, 'review_draft')
  assert.equal(disclosure.brandingVersion, 'seller_onboarding_branding_snapshot_v1')
  assert.equal(disclosure.signable, false)
  assert.match(disclosure.generatedHtml, /Declaration by Seller - Annexure A/)
  assert.match(disclosure.generatedHtml, /Alex Landman/)
  assert.equal(fica.status, 'awaiting_agent_review')
  assert.equal(fica.requirementKey, 'signed_fica_declaration')
  assert.equal(fica.targetRequirementKey, 'signed_fica_declaration')
  assert.ok(fica.templateVersion)
  assert.equal(fica.brandingVersion, 'seller_onboarding_branding_snapshot_v1')
  assert.equal(fica.signable, false)
  assert.match(fica.generatedHtml, /CLIENT DUE DILIGENCE RECORD/)
  assert.match(fica.generatedHtml, /Kingdom Real Estate/)
  assert.match(fica.generatedHtml, /Alex Landman/)
  assert.match(fica.generatedHtml, /Signature __________________________/)
  assert.match(fica.generatedHtml, /Source of funds \/ wealth/)
  assert.match(fica.generatedHtml, /Salary/)
  assert.match(fica.generatedHtml, /Politically exposed person/)
  assert.doesNotMatch(fica.generatedHtml, /Signature capture is completed in the onboarding step/)
  assert.equal(mandate.status, 'awaiting_agent_review')
  assert.equal(mandate.requirementKey, 'signed_mandate')
  assert.equal(mandate.targetRequirementKey, 'signed_mandate')
  assert.equal(mandate.signable, false)
  assert.equal(mandate.metadata.notForSignature, true)
  assert.match(mandate.generatedHtml, /Not for signature/)
  assert.match(mandate.generatedHtml, /Commission structure/)

  for (const document of result.documents) {
    assert.match(document.contentFingerprint, /^fnv1a-32:[0-9a-f]{8}$/)
    assert.equal(document.metadata.brandingSnapshot.fingerprint, result.brandingSnapshot.fingerprint)
  }
})

test('FICA draft uses the company as legal client and shows the captured beneficial owner', () => {
  const result = buildSellerPostOnboardingDrafts({
    ...input,
    formData: {
      ...input.formData,
      ownerEntityType: 'company', ownerStructureType: 'company', ownershipType: 'company', ownershipRouteConfirmed: true,
      companyName: 'Seller Holdings (Pty) Ltd', companyRegistrationNumber: '2026/123456/07',
      authorisedSignatoryName: 'Alex Landman',
      companyDirectors: [{ fullName: 'Alex Landman', idNumber: '8001015009087', signingAuthority: true }],
      companyBeneficialOwners: [{ fullName: 'Pat Owner', idNumber: '8101015009088', nationality: 'South African', residentialAddress: '4 Cedar Road' }],
    },
  })
  const fica = result.documents.find((document) => document.key === 'fica_review_draft')
  assert.match(fica.generatedHtml, /Seller Holdings \(Pty\) Ltd/)
  assert.match(fica.generatedHtml, /Beneficial owners \/ controllers/)
  assert.match(fica.generatedHtml, /Pat Owner/)
  assert.match(fica.generatedHtml, /4 Cedar Road/)
})

test('draft fingerprints are deterministic and only detect content changes', () => {
  const first = buildSellerPostOnboardingDrafts(input)
  const second = buildSellerPostOnboardingDrafts(input)
  assert.deepEqual(first.documents.map((document) => document.contentFingerprint), second.documents.map((document) => document.contentFingerprint))
  assert.equal(
    createSellerPostOnboardingDraftFingerprint({ b: ['x'], a: 1 }),
    createSellerPostOnboardingDraftFingerprint({ a: 1, b: ['x'] }),
  )
})

test('all co-owners and long disclosure explanations survive document preparation', () => {
  const result = buildSellerPostOnboardingDrafts({ ...input, formData: {
    ...input.formData, ownerEntityType: 'natural_person', ownerStructureType: 'multiple_owners', ownershipType: 'multiple_owners', ownershipRouteConfirmed: true,
    multipleOwners: Array.from({ length: 6 }, (_, index) => ({ name: `Owner ${index + 1}`, surname: 'Sample', idNumber: `ID-${index + 1}`, email: 'shared@example.test' })),
    propertyDisclosure: { responses: {}, comments: 'Long disclosure explanation.\n'.repeat(80) + 'Final disclosure sentence.' },
  } })
  const disclosure = result.documents.find(d => d.key === 'signed_disclosure_form').generatedHtml
  const fica = result.documents.find(d => d.key === 'fica_review_draft').generatedHtml
  for (let index = 1; index <= 6; index += 1) {
    assert.match(disclosure, new RegExp(`Owner ${index} Sample`))
    assert.match(fica, new RegExp(`Owner ${index} Sample`))
  }
  assert.match(disclosure, /I\/We, Owner 1 Sample, Owner 2 Sample, Owner 3 Sample, Owner 4 Sample, Owner 5 Sample, Owner 6 Sample/)
  assert.match(disclosure, /Final disclosure sentence\./)
  assert.match(disclosure, /Disclosure details continuation/)
  assert.doesNotMatch(disclosure, /combined FICA and property disclosure/)
  assert.equal((fica.match(/class="signer-card"/g) || []).length, 6)
})

for (const [route, details, owner, identity] of [
  ['company', { companyName: 'Local Company', companyRegistrationNumber: 'CO-123', authorisedSignatoryName: 'Robin Director' }, 'Local Company', 'CO-123'],
  ['close_corporation', { companyName: 'Local CC', companyRegistrationNumber: 'CC-123', authorisedSignatoryName: 'Robin Member' }, 'Local CC', 'CC-123'],
  ['trust', { trustName: 'Family Trust', trustRegistrationNumber: 'IT-123', authorisedTrusteeName: 'Robin Trustee' }, 'Family Trust', 'IT-123'],
  ['foreign_trust', { trustName: 'Foreign Trust', foreignRegistrationNumber: 'FT-123', foreignOwnerCountry: 'United Kingdom', authorisedTrusteeName: 'Robin Trustee' }, 'Foreign Trust', 'FT-123'],
  ['deceased_estate', { deceasedEstateName: 'Estate Late Pat Owner', estateReferenceNumber: 'EST-123', executorName: 'Robin Executor', executorAuthorityDetails: 'Letters of executorship' }, 'Estate Late Pat Owner', 'EST-123'],
  ['power_of_attorney', { powerOfAttorneyPrincipalName: 'Pat Principal', powerOfAttorneyPrincipalIdNumber: 'PR-123', powerOfAttorneyName: 'Robin Representative', powerOfAttorneyAuthorityDetails: 'Power of attorney' }, 'Pat Principal', 'PR-123'],
  ['other', { otherEntityName: 'Community Association', otherEntityRegistrationNumber: 'OT-123', otherAuthorityDetails: 'Constitution and resolution', primaryContactName: 'Robin Representative' }, 'Community Association', 'OT-123'],
  ['foreign_individual', { sellerFirstName: 'Pat', sellerSurname: 'Foreign', foreignPassportNumber: 'PP-123', foreignOwnerCountry: 'United Kingdom' }, 'Pat Foreign', 'PP-123'],
]) {
  test(`${route} documents identify the legal owner and captured authority`, () => {
    const result = buildSellerPostOnboardingDrafts({ ...input, formData: {
      ...input.formData, idNumber: '', ownerEntityType: route.includes('trust') ? 'trust' : ['company', 'close_corporation'].includes(route) ? 'company' : 'natural_person',
      ownerStructureType: route, ownershipType: route, sellerLegalType: route, ownershipRouteConfirmed: true, ...details,
    } })
    const disclosure = result.documents.find(d => d.key === 'signed_disclosure_form').generatedHtml
    const fica = result.documents.find(d => d.key === 'fica_review_draft').generatedHtml
    assert.ok(disclosure.includes(owner), `${owner} must be the disclosed owner`)
    assert.ok(disclosure.includes(identity), `${identity} must be the disclosed identity`)
    assert.ok(fica.includes(owner))
    assert.ok(fica.includes(identity))
    if (route !== 'foreign_individual') assert.doesNotMatch(fica, /Marital status|Date of birth/)
  })
}
