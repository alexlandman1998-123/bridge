import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  TRANSACTION_BUYER_COMPLETION_VERSION,
  buildBuyerOnboardingCompletionParticipantPatch,
  resolveBuyerOnboardingCompletionTarget,
} from '../src/core/transactions/transactionBuyerCompletion.js'

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

const apiSource = await readFile(new URL('../src/lib/api.js', import.meta.url), 'utf8')
const completionSource = await readFile(
  new URL('../src/core/transactions/transactionBuyerCompletion.js', import.meta.url),
  'utf8',
)
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))

const buyerRows = [
  {
    id: 'participant-primary',
    transaction_id: 'txn-1',
    role_type: 'buyer',
    participant_name: 'Primary Buyer',
    participant_email: 'primary@example.com',
    buyer_party_id: 'buyer-party-primary',
    is_primary_buyer: true,
    buyer_party_position: 0,
    status: 'active',
  },
  {
    id: 'participant-secondary',
    transaction_id: 'txn-1',
    role_type: 'buyer',
    participant_name: 'Secondary Buyer',
    participant_email: 'SECONDARY@example.com',
    buyer_party_id: 'buyer-party-secondary',
    is_primary_buyer: false,
    buyer_party_position: 1,
    status: 'active',
  },
]

test('completion target resolves the submitting buyer by email before primary fallback', () => {
  const target = resolveBuyerOnboardingCompletionTarget({
    buyers: buyerRows,
    formData: {
      email: 'secondary@example.com',
      full_name: 'Secondary Buyer',
    },
  })

  assert.equal(target.version, TRANSACTION_BUYER_COMPLETION_VERSION)
  assert.equal(target.participantId, 'participant-secondary')
  assert.equal(target.buyerPartyId, 'buyer-party-secondary')
  assert.equal(target.email, 'secondary@example.com')
  assert.equal(target.matchBasis, 'email')
  assert.equal(target.isPrimary, false)
})

test('completion target prefers explicit buyer participant ids', () => {
  const target = resolveBuyerOnboardingCompletionTarget({
    buyers: buyerRows,
    formData: {
      buyer_participant_id: 'participant-primary',
      email: 'secondary@example.com',
    },
  })

  assert.equal(target.participantId, 'participant-primary')
  assert.equal(target.matchBasis, 'participant_id')
  assert.equal(target.email, 'primary@example.com')
})

test('completion participant patch stamps completed profile and onboarding statuses', () => {
  const patch = buildBuyerOnboardingCompletionParticipantPatch({
    target: {
      targetId: 'participant-secondary',
      matchBasis: 'email',
    },
    completedAt: '2026-08-15T10:00:00.000Z',
    source: 'phase5-test',
    existingMetadata: {
      retained: true,
    },
  })

  assert.equal(patch.buyer_profile_status, 'completed')
  assert.equal(patch.buyer_onboarding_status, 'completed')
  assert.equal(patch.buyer_onboarding_completed_at, '2026-08-15T10:00:00.000Z')
  assert.equal(patch.buyer_metadata.retained, true)
  assert.equal(patch.buyer_metadata.buyerOnboardingCompletionVersion, TRANSACTION_BUYER_COMPLETION_VERSION)
  assert.equal(patch.buyer_metadata.lastBuyerOnboardingCompletionMatchBasis, 'email')
})

test('client onboarding submit path marks and exposes buyer participant completion', () => {
  assert.match(apiSource, /markTransactionBuyerOnboardingCompleted/)
  assert.match(apiSource, /resolveBuyerOnboardingCompletionTarget/)
  assert.match(completionSource, /buyer_profile_status: TRANSACTION_BUYER_PROFILE_STATUSES\.completed/)
  assert.match(completionSource, /buyer_onboarding_status: TRANSACTION_BUYER_ONBOARDING_STATUSES\.completed/)
  assert.match(completionSource, /buyer_onboarding_completed_at: timestamp/)
  assert.match(apiSource, /eventType: 'buyer_onboarding_participant_completed'/)
  assert.match(apiSource, /buyerCompletion: buyerCompletionProjection/)
})

test('buyer participant completion is repairable after rollout failures', () => {
  assert.match(apiSource, /buyer_participant_completion: 'buyer_onboarding_buyer_participant_projection_failed'/)
  assert.match(apiSource, /projection === 'buyer_participant_completion'/)
  assert.match(apiSource, /source: 'buyer_onboarding_projection_replay'/)
})

test('package exposes the multi-buyer transaction Phase 5 completion regression', () => {
  assert.equal(
    packageJson.scripts?.['test:multi-buyer-transaction-phase5'],
    'node scripts/multi-buyer-transaction-phase5.test.mjs',
  )
})

console.log('multi-buyer transaction phase 5 tests passed')
