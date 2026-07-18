import test from 'node:test'
import assert from 'node:assert/strict'
import { buildSigningActivityHistory } from '../signingActivityHistory.js'

test('combines packet evidence and signer timestamps newest first', () => {
  const result = buildSigningActivityHistory({
    signers: [{ id: 'seller-1', signer_role: 'seller', viewed_at: '2026-07-18T10:00:00Z', signed_at: '2026-07-18T11:00:00Z' }],
    events: [{ id: 'invite', event_type: 'mandate_sent_for_digital_signing', created_at: '2026-07-18T09:00:00Z', event_payload_json: { recipientRole: 'seller', emailConfirmed: true } }],
  })
  assert.deepEqual(result.rows.map((row) => row.type), ['signed', 'viewed', 'invitation_sent'])
  assert.equal(result.rows[2].deliveryConfirmed, true)
  assert.equal(result.rows[0].roleLabel, 'Seller')
})

test('excludes unknown events and sensitive payload fields', () => {
  const result = buildSigningActivityHistory({
    events: [
      { id: 'unsafe', event_type: 'unknown_internal_event', created_at: '2026-07-18T09:00:00Z', event_payload_json: { signing_token: 'secret' } },
      { id: 'safe', event_type: 'signer_reminder_sent', created_at: '2026-07-18T10:00:00Z', event_payload_json: { signerRole: 'purchaser_1', portalLink: 'secret-url' } },
    ],
  })
  assert.equal(result.rows.length, 1)
  assert.equal(result.rows[0].type, 'reminder_sent')
  assert.equal(JSON.stringify(result).includes('secret'), false)
})

test('records a decline from signer state when no audit event exists', () => {
  const result = buildSigningActivityHistory({ signers: [{ id: 'buyer', signer_role: 'purchaser_1', status: 'declined', updated_at: '2026-07-18T12:00:00Z' }] })
  assert.equal(result.rows[0].type, 'declined')
})
