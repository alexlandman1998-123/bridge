import test from 'node:test'
import assert from 'node:assert/strict'
import { buildSigningProgressTimeline } from '../signingProgressTimeline.js'

test('orders signers and identifies the next outstanding party', () => {
  const result = buildSigningProgressTimeline({ signers: [
    { id: 'seller', signer_role: 'seller', signing_order: 2, status: 'sent' },
    { id: 'agent', signer_role: 'agent', signing_order: 1, status: 'signed', signed_at: '2026-07-18T10:00:00Z' },
  ] })
  assert.deepEqual(result.rows.map((row) => row.id), ['agent', 'seller'])
  assert.equal(result.nextSigner.id, 'seller')
  assert.equal(result.completedCount, 1)
})

test('turns an expired token into a send-new-link action without exposing the token', () => {
  const result = buildSigningProgressTimeline({
    now: Date.parse('2026-07-20T00:00:00Z'),
    signers: [{ id: 'buyer', signer_role: 'purchaser_1', status: 'sent', signing_token: 'secret-token', token_expires_at: '2026-07-19T00:00:00Z' }],
  })
  assert.equal(result.rows[0].status, 'expired')
  assert.equal(result.rows[0].action.key, 'resend')
  assert.equal('signingToken' in result.rows[0], false)
  assert.equal(JSON.stringify(result).includes('secret-token'), false)
})
