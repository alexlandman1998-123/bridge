import assert from 'node:assert/strict'
import test from 'node:test'
import { buildSellerOnboardingJourneyStatus } from '../sellerOnboardingJourneyStatus.js'
import { PROPERTY_DISCLOSURE_QUESTIONS } from '../../../lib/propertyDisclosure.js'

test('keeps unsigned disclosure separate while showing the FICA and mandate pack as sent', () => {
  const status = buildSellerOnboardingJourneyStatus({
    onboardingSubmitted: true,
    formData: { sellerOnboardingReview: { status: 'approved' }, sellerOnboardingSigningLifecycle: { stage: 'pack_sent' } },
  })
  assert.equal(status.currentLabel, 'FICA and mandate pack sent')
  assert.deepEqual(status.documents.map((document) => document.status), ['awaiting_review', 'sent_for_signature', 'sent_for_signature'])
})

test('shows correction requested ahead of later signing steps', () => {
  const status = buildSellerOnboardingJourneyStatus({ onboardingSubmitted: true, formData: { sellerOnboardingReview: { status: 'correction_requested', reason: 'Confirm address' } } })
  assert.equal(status.currentLabel, 'Correction requested')
  assert.equal(status.steps[1].attention, true)
})

test('one document signature never completes the other seller documents', () => {
  const status = buildSellerOnboardingJourneyStatus({ onboardingSubmitted: true, mandateSigned: true })
  assert.deepEqual(status.documents.map((document) => document.status), ['awaiting_review', 'awaiting_agent_review', 'signed'])
})

test('recognises a signed onboarding disclosure without marking FICA or mandate signed', () => {
  const status = buildSellerOnboardingJourneyStatus({
    onboardingSubmitted: true,
    formData: {
      propertyDisclosure: {
        responses: Object.fromEntries(PROPERTY_DISCLOSURE_QUESTIONS.map((question) => [question.key, { answer: 'no' }])),
        declarationAccepted: true,
        signature: 'data:image/png;base64,AA',
        signedAt: '2026-09-27',
        arch9TermsAccepted: true,
      },
      sellerComplianceSigning: { complete: true },
    },
  })
  assert.deepEqual(status.documents.map((document) => document.status), ['signed', 'awaiting_agent_review', 'awaiting_agent_review'])
})
