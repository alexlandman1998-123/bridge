import assert from 'node:assert/strict'
import test from 'node:test'
import { recordSellerOnboardingReview, SELLER_ONBOARDING_REVIEW_STATUS } from '../sellerOnboardingReview.js'

test('records agent approval and correction requests as an append-only review history', () => {
  const approved = recordSellerOnboardingReview({ status: SELLER_ONBOARDING_REVIEW_STATUS.approved, actor: 'agent-1', at: '2026-09-19T10:00:00.000Z' })
  const returned = recordSellerOnboardingReview({ existing: approved, status: SELLER_ONBOARDING_REVIEW_STATUS.correctionRequested, reason: 'Please confirm the electrical disclosure.', actor: 'agent-1', at: '2026-09-19T10:05:00.000Z' })
  assert.equal(returned.status, 'correction_requested')
  assert.equal(returned.history.length, 2)
  assert.equal(returned.history[0].status, 'approved')
})

test('requires a reason before returning onboarding for correction', () => {
  assert.throws(() => recordSellerOnboardingReview({ status: SELLER_ONBOARDING_REVIEW_STATUS.correctionRequested }), /reason is required/)
})
