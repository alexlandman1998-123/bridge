import test from 'node:test'
import assert from 'node:assert/strict'
import { buildDocumentCommitConfirmation } from '../documentCommitConfirmation.js'

test('summarises the exact number of signing invitations before send', () => {
  const model = buildDocumentCommitConfirmation({ action: 'send_signature', packetType: 'otp', signerCount: 3 })
  assert.equal(model.canConfirm, true)
  assert.equal(model.confirmLabel, 'Send to 3 signers')
  assert.match(model.summary, /lock this document version/)
})

test('blocks send confirmation when there are no signing parties', () => {
  const model = buildDocumentCommitConfirmation({ action: 'send_signature', signerCount: 0 })
  assert.equal(model.canConfirm, false)
})

test('allows signer completion only after every required field is complete', () => {
  assert.equal(buildDocumentCommitConfirmation({ action: 'complete_signing', remainingFields: 1 }).canConfirm, false)
  assert.equal(buildDocumentCommitConfirmation({ action: 'complete_signing', remainingFields: 0 }).canConfirm, true)
})

test('uses plain document labels for mandate and OTP', () => {
  assert.match(buildDocumentCommitConfirmation({ action: 'send_signature', packetType: 'mandate', signerCount: 1 }).title, /mandate/)
  assert.match(buildDocumentCommitConfirmation({ action: 'send_signature', packetType: 'otp', signerCount: 1 }).title, /Offer to Purchase/)
})

test('does not create confirmations for ordinary navigation actions', () => {
  assert.equal(buildDocumentCommitConfirmation({ action: 'open_preview' }), null)
})
