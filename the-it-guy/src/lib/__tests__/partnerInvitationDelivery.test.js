import assert from 'node:assert/strict'
import test from 'node:test'
import { assertPartnerInvitationEmailAccepted, attachPartnerInvitationDeliveries, partnerInvitationEmailPresentation } from '../partnerInvitationDelivery.js'

test('a failed retry replaces an earlier sent receipt and survives refresh', () => {
  const [invite] = attachPartnerInvitationDeliveries([{ id: 'one' }], [
    { status: 'failed', metadata_json: { partnerInvitationId: 'one' } },
    { status: 'sent', provider_message_id: 'old-email', metadata_json: { partnerInvitationId: 'one' } },
    { status: 'sent', provider_message_id: 'other-email', metadata_json: { partnerInvitationId: 'two' } },
  ])
  assert.equal(partnerInvitationEmailPresentation(invite).label, 'Email failed to send')
  assert.equal(partnerInvitationEmailPresentation(invite).sent, false)
})

test('a successful retry replaces the earlier failure without changing invitation state', () => {
  const [invite] = attachPartnerInvitationDeliveries([{ id: 'one', status: 'pending' }], [
    { status: 'sent', provider_message_id: 'receipt', metadata_json: { partnerInvitationId: 'one' } },
    { status: 'failed', metadata_json: { partnerInvitationId: 'one' } },
  ])
  assert.equal(partnerInvitationEmailPresentation(invite).label, 'Email sent')
  assert.equal(invite.status, 'pending')
})

test('missing, pending, unavailable or contradictory receipts never report sent', () => {
  for (const emailDelivery of [null, { status: 'sent' }, { status: 'delivered' }, { status: 'prepared' }, { status: 'queued' }]) {
    assert.equal(partnerInvitationEmailPresentation({ emailDelivery }).sent, false)
  }
  assert.equal(partnerInvitationEmailPresentation({ emailDelivery: { status: 'delivered', provider_message_id: 'receipt' } }).label, 'Email delivered')
})

test('empty and rejected API responses cannot produce a send success message', () => {
  for (const result of [null, {}, { sent: false }, { sent: true }, { sent: false, providerResponse: { id: 'receipt' } }]) {
    assert.throws(() => assertPartnerInvitationEmailAccepted(result), /could not be confirmed/)
  }
  assert.doesNotThrow(() => assertPartnerInvitationEmailAccepted({ sent: true, providerResponse: { id: 'receipt' } }))
})
