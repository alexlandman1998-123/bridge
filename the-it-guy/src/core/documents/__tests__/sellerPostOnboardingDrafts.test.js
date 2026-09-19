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

  assert.equal(result.contract, 'arch9-seller-post-onboarding-drafts-v1')
  assert.equal(result.source.onboardingVersion, 'seller_onboarding_submission_v1')
  assert.equal(result.source.generatedAt, generatedAt)
  assert.equal(result.documents.length, 3)

  const disclosure = result.documents.find((document) => document.key === 'signed_disclosure_form')
  const fica = result.documents.find((document) => document.key === 'signed_fica_declaration')
  const mandate = result.documents.find((document) => document.key === 'signed_mandate')

  assert.equal(disclosure.status, 'complete')
  assert.equal(disclosure.signable, true)
  assert.match(disclosure.generatedHtml, /Declaration by Seller - Annexure A/)
  assert.match(disclosure.generatedHtml, /Alex Landman/)
  assert.equal(fica.status, 'awaiting_agent_review')
  assert.equal(fica.signable, false)
  assert.match(fica.generatedHtml, /Seller FICA Declaration/)
  assert.match(fica.generatedHtml, /Kingdom Real Estate/)
  assert.equal(mandate.status, 'awaiting_agent_review')
  assert.equal(mandate.signable, false)
  assert.equal(mandate.metadata.notForSignature, true)
  assert.match(mandate.generatedHtml, /Not for signature/)
  assert.match(mandate.generatedHtml, /Commission structure/)

  for (const document of result.documents) {
    assert.match(document.contentFingerprint, /^fnv1a-32:[0-9a-f]{8}$/)
  }
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
