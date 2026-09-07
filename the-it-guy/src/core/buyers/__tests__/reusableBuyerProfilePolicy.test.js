import assert from 'node:assert/strict'
import {
  BUYER_PROFILE_REUSE_POLICY_VERSION,
  buildBuyerProfileReuseReceipt,
  resolveBuyerProfileReusePolicy,
} from '../reusableBuyerProfilePolicy.js'

const fica = resolveBuyerProfileReusePolicy('buyer_id_document', { kind: 'document' })
assert.equal(fica.reusable, true)
assert.equal(fica.storage, 'buyer_profile')
assert.equal(fica.requiresFreshUpload, false)
assert.equal(fica.group, 'documents')

const income = resolveBuyerProfileReusePolicy('gross monthly income')
assert.equal(income.reusable, true)
assert.equal(income.group, 'employment_and_income')

const futureField = resolveBuyerProfileReusePolicy('future buyer onboarding answer')
assert.equal(futureField.reusable, true, 'new fields must default to reuse instead of duplication')
assert.equal(futureField.knownKey, false)

const receipt = buildBuyerProfileReuseReceipt({
  buyerId: 'buyer-1',
  sourceId: 'document-1',
  sourceVersion: 'sha256:abc',
  key: 'buyer_id_document',
  kind: 'document',
  usedAt: '2026-09-07T18:00:00.000Z',
})
assert.equal(receipt.policyVersion, BUYER_PROFILE_REUSE_POLICY_VERSION)
assert.equal(receipt.transactionStorage, 'profile_reference_with_usage_receipt')
assert.equal(receipt.sourceId, 'document-1')

console.log('Reusable buyer profile policy tests passed')
