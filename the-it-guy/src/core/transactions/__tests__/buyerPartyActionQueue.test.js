import assert from 'node:assert/strict'
import test from 'node:test'
import { buildBuyerPartyActionQueue } from '../buyerPartyActionQueue.js'

test('buyer party action queue creates targeted onboarding and FICA actions', () => {
  const queue = buildBuyerPartyActionQueue([{ id: 'one', participant_name: 'Alex Buyer', is_primary_buyer: true, signing_required: true, buyer_onboarding_status: 'not_started', buyer_profile_status: 'draft' }])
  assert.equal(queue.outstandingCount, 2)
  assert.deepEqual(queue.actions.map((item) => item.kind), ['onboarding', 'fica'])
})
