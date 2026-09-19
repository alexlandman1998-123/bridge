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
