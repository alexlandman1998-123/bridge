import assert from 'node:assert/strict'
import test from 'node:test'

import { buildLeadArchivePatch, resolveSellerLeadActionTokens } from '../sellerLeadActionModel.js'

test('seller menu links use distinct onboarding and portal tokens', () => {
  const tokens = resolveSellerLeadActionTokens({
    lead: { sellerOnboardingToken: 'onboarding-token' },
    listing: { sellerOnboarding: { sellerPortalToken: 'portal-token' } },
  })
  assert.deepEqual(tokens, { onboardingToken: 'onboarding-token', portalToken: 'portal-token' })
  assert.equal(resolveSellerLeadActionTokens({ lead: { sellerOnboardingToken: 'only-onboarding' } }).portalToken, '')
  assert.equal(resolveSellerLeadActionTokens({
    lead: { seller_onboarding: { seller_portal_token: 'nested-portal' } },
  }).portalToken, 'nested-portal')
})

test('archive and lost actions persist different lead stages', () => {
  const archived = buildLeadArchivePatch({ lead: { notes: 'Earlier note' }, mode: 'archive', notes: 'No longer active' })
  assert.equal(archived.stage, 'Archived')
  assert.equal(archived.status, 'Archived')
  assert.equal(archived.notes, 'Earlier note | Archived | No longer active')
  assert.equal(Object.hasOwn(archived, 'lostReason'), false)

  const lost = buildLeadArchivePatch({ mode: 'lost', reason: 'Not interested' })
  assert.equal(lost.stage, 'Lost')
  assert.equal(lost.lostReason, 'Not interested')
})
