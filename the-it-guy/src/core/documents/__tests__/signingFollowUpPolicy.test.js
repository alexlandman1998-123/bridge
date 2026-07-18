import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveSignerFollowUp } from '../signingFollowUpPolicy.js'

const now = Date.parse('2026-07-18T12:00:00Z')

test('waits through the first follow-up window', () => {
  const result = resolveSignerFollowUp({
    now,
    signer: { status: 'sent', updated_at: '2026-07-18T00:00:00Z', token_expires_at: '2026-07-21T00:00:00Z' },
  })
  assert.equal(result.key, 'wait')
  assert.equal(result.state, 'waiting')
})

test('offers a reminder without replacing an active link', () => {
  const result = resolveSignerFollowUp({
    now,
    signer: { status: 'viewed', viewed_at: '2026-07-17T10:00:00Z', token_expires_at: '2026-07-20T00:00:00Z' },
  })
  assert.equal(result.key, 'remind')
  assert.equal(result.state, 'reminder_due')
})

test('enforces a reminder cooldown', () => {
  const result = resolveSignerFollowUp({
    now,
    signer: { status: 'sent', reminder_sent_at: '2026-07-18T06:00:00Z', token_expires_at: '2026-07-20T00:00:00Z' },
  })
  assert.equal(result.key, 'wait')
  assert.equal(result.state, 'reminder_cooldown')
})

test('uses resend only for expired or near-expiry links', () => {
  assert.equal(resolveSignerFollowUp({ now, signer: { status: 'sent', token_expires_at: '2026-07-18T11:00:00Z' } }).key, 'resend')
  assert.equal(resolveSignerFollowUp({ now, signer: { status: 'sent', token_expires_at: '2026-07-18T16:00:00Z' } }).state, 'link_expiring')
})

test('never follows up with completed or declined signers', () => {
  assert.equal(resolveSignerFollowUp({ now, signer: { status: 'signed' } }).key, 'none')
  assert.equal(resolveSignerFollowUp({ now, signer: { status: 'declined' } }).key, 'review')
})
