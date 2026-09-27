import assert from 'node:assert/strict'
import test from 'node:test'
import { buildSellerPostOnboardingDocumentState } from '../sellerPostOnboardingDocumentState.js'
import { PROPERTY_DISCLOSURE_QUESTIONS } from '../../../lib/propertyDisclosure.js'

function states(input) {
  return buildSellerPostOnboardingDocumentState(input).documents.map((document) => document.status)
}

test('onboarding submission leaves all three documents awaiting review and signature', () => {
  const state = buildSellerPostOnboardingDocumentState({ onboardingSubmitted: true })
  assert.deepEqual(state.documents.map((document) => document.status), ['awaiting_agent_review', 'awaiting_agent_review', 'awaiting_agent_review'])
  assert.equal(state.signingRoute, '')
})

test('digital pack shows sent and multi-signer progress without requesting an upload', () => {
  assert.deepEqual(
    states({ onboardingSubmitted: true, formData: { sellerOnboardingSigningLifecycle: { stage: 'pack_sent' } } }),
    ['awaiting_agent_review', 'sent_for_signature', 'sent_for_signature'],
  )
  assert.deepEqual(
    states({ onboardingSubmitted: true, completedSignerCount: 1, requiredSignerCount: 2, formData: { sellerOnboardingSigningLifecycle: { stage: 'partially_signed' } } }),
    ['awaiting_agent_review', 'awaiting_remaining_signatures', 'awaiting_remaining_signatures'],
  )
})

test('manual route waits for signed hard copies only after agent review records the route', () => {
  assert.deepEqual(
    states({ onboardingSubmitted: true, formData: { mandateSignatureRoute: 'manual_upload', sellerOnboardingSigningLifecycle: { stage: 'manual_awaiting_upload' } } }),
    ['awaiting_agent_review', 'awaiting_signed_hard_copy', 'awaiting_signed_hard_copy'],
  )
})

test('a signed mandate does not silently complete FICA or disclosure', () => {
  assert.deepEqual(
    states({ onboardingSubmitted: true, mandateSigned: true, formData: { sellerOnboardingSigningLifecycle: { stage: 'mandate_signed' } } }),
    ['awaiting_agent_review', 'sent_for_signature', 'signed'],
  )
  assert.deepEqual(
    states({ onboardingSubmitted: true, mandateSigned: true, disclosureSigned: true, ficaSigned: true }),
    ['signed', 'signed', 'signed'],
  )
})

test('completed onboarding disclosure evidence may complete only the disclosure', () => {
  const disclosure = {
    responses: Object.fromEntries(PROPERTY_DISCLOSURE_QUESTIONS.map((question) => [question.key, { answer: 'no' }])),
    declarationAccepted: true,
    signature: 'data:image/png;base64,AA',
    signedAt: '2026-09-27',
    arch9TermsAccepted: true,
  }
  assert.deepEqual(states({ onboardingSubmitted: true, formData: { propertyDisclosure: disclosure, sellerComplianceSigning: { complete: true } } }), ['signed', 'awaiting_agent_review', 'awaiting_agent_review'])
  assert.deepEqual(states({ onboardingSubmitted: true, formData: { propertyDisclosure: disclosure, sellerComplianceSigning: { complete: false } } }), ['awaiting_agent_review', 'awaiting_agent_review', 'awaiting_agent_review'])
})
