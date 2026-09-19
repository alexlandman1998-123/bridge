import assert from 'node:assert/strict'
import test from 'node:test'
import { buildSellerPostOnboardingDocumentState } from '../sellerPostOnboardingDocumentState.js'

function states(input) {
  return buildSellerPostOnboardingDocumentState(input).documents.map((document) => document.status)
}

test('onboarding completion satisfies disclosure but leaves FICA and mandate for agent review', () => {
  assert.deepEqual(states({ onboardingSubmitted: true }), ['complete', 'awaiting_agent_review', 'awaiting_agent_review'])
})

test('digital pack shows sent and multi-signer progress without requesting an upload', () => {
  assert.deepEqual(
    states({ onboardingSubmitted: true, formData: { sellerOnboardingSigningLifecycle: { stage: 'pack_sent' } } }),
    ['complete', 'sent_for_signature', 'sent_for_signature'],
  )
  assert.deepEqual(
    states({ onboardingSubmitted: true, completedSignerCount: 1, requiredSignerCount: 2, formData: { sellerOnboardingSigningLifecycle: { stage: 'partially_signed' } } }),
    ['complete', 'awaiting_remaining_signatures', 'awaiting_remaining_signatures'],
  )
})

test('manual route waits for signed hard copies only after agent review records the route', () => {
  assert.deepEqual(
    states({ onboardingSubmitted: true, formData: { mandateSignatureRoute: 'manual_upload', sellerOnboardingSigningLifecycle: { stage: 'manual_awaiting_upload' } } }),
    ['complete', 'awaiting_signed_hard_copy', 'awaiting_signed_hard_copy'],
  )
})
