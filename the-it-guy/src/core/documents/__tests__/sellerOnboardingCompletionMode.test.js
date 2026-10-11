import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createSellerOnboardingCompletionRecord,
  readSellerOnboardingCompletionRecord,
  SELLER_ONBOARDING_COMPLETION_MODES,
} from '../sellerOnboardingCompletionMode.js'

test('records agent-assisted completion with immutable audit fields', () => {
  const record = createSellerOnboardingCompletionRecord({
    mode: 'agent assisted',
    completedBy: 'agent-123',
    completedAt: '2026-09-14T12:00:00.000Z',
    notes: 'Captured with seller by phone.',
  })

  assert.equal(record.mode, SELLER_ONBOARDING_COMPLETION_MODES.agentAssisted)
  assert.equal(record.agentAssisted, true)
  assert.equal(record.completedBy, 'agent-123')
  assert.equal(record.completedAt, '2026-09-14T12:00:00.000Z')
  assert.equal(record.reviewStatus, 'awaiting_agent_review')
})

test('reads legacy aliases and defaults safely to self service', () => {
  const record = readSellerOnboardingCompletionRecord({
    completion_mode: 'self_service',
    completed_by: 'seller@example.test',
    completed_at: '2026-09-14T12:01:00.000Z',
  })

  assert.equal(record.mode, SELLER_ONBOARDING_COMPLETION_MODES.selfService)
  assert.equal(record.agentAssisted, false)
  assert.equal(record.completedBy, 'seller@example.test')
})


test('information completion records the separate documents step without rewriting historical records', () => {
  const completion = createSellerOnboardingCompletionRecord({ informationOnly: true, completedAt: '2026-10-11T10:00:00Z' })
  assert.equal(completion.nextStep, 'documents')
  assert.equal(completion.informationOnly, true)
  assert.equal(readSellerOnboardingCompletionRecord({ sellerOnboardingCompletion: completion }).informationOnly, true)
  assert.equal(createSellerOnboardingCompletionRecord({ completedAt: '2026-09-01T10:00:00Z' }).informationOnly, undefined)
})
