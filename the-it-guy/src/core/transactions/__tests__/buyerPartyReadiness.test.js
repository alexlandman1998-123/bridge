import assert from 'node:assert/strict'
import test from 'node:test'
import { buildBuyerPartyReadiness } from '../buyerPartyReadiness.js'

test('buyer party readiness requires complete 100 percent ownership and signer capture', () => {
  const result = buildBuyerPartyReadiness([
    { is_primary_buyer: true, ownership_percentage: 60, signing_required: true, buyer_onboarding_status: 'completed', buyer_profile_status: 'captured' },
    { ownership_percentage: 40, signing_required: true, buyer_onboarding_status: 'completed', buyer_profile_status: 'completed' },
  ])
  assert.equal(result.ready, true)
  assert.equal(result.ownershipTotal, 100)
})

test('buyer party readiness identifies incomplete ownership and FICA capture', () => {
  const result = buildBuyerPartyReadiness([
    { is_primary_buyer: true, ownership_percentage: 70, signing_required: true, buyer_onboarding_status: 'completed', buyer_profile_status: 'captured' },
    { signing_required: true, buyer_onboarding_status: 'not_started', buyer_profile_status: 'draft' },
  ])
  assert.equal(result.ready, false)
  assert.equal(result.issues.length, 3)
})
