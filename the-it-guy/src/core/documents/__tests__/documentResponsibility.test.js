import test from 'node:test'
import assert from 'node:assert/strict'
import { buildDocumentResponsibility } from '../documentResponsibility.js'

const signers = [
  { id: 'agent', signer_role: 'agent', signer_name: 'Agent One', signing_order: 1, status: 'signed' },
  { id: 'seller', signer_role: 'seller', signer_name: 'Seller One', signing_order: 2, status: 'sent', signing_token: 'must-not-leak' },
  { id: 'spouse', signer_role: 'seller_spouse', signer_name: 'Seller Two', signing_order: 3, status: 'ready_to_send' },
]

test('identifies the current and next sequential signing owners', () => {
  const result = buildDocumentResponsibility({ surface: 'workspace', role: 'agent', state: 'partially_signed', signers })
  assert.equal(result.currentOwner.id, 'seller')
  assert.equal(result.title, 'Waiting on Seller One')
  assert.match(result.nextHandoff, /Seller Two signs next/)
  assert.equal(JSON.stringify(result).includes('must-not-leak'), false)
})

test('tells a portal signer when it is their turn', () => {
  const result = buildDocumentResponsibility({ surface: 'signer_portal', role: 'seller', state: 'sent', signers })
  assert.equal(result.currentOwner.isViewer, true)
  assert.equal(result.title, 'Your action is required now')
})

test('moves declined or expired owners into attention state', () => {
  const result = buildDocumentResponsibility({ surface: 'workspace', role: 'agent', state: 'attention_required', signers: [{ ...signers[1], status: 'declined' }] })
  assert.equal(result.phase, 'attention')
  assert.match(result.summary, /cannot continue/i)
})

test('assigns finalisation to system processing and clears completed responsibility', () => {
  const processing = buildDocumentResponsibility({ surface: 'workspace', role: 'principal', state: 'publishing', signers })
  const complete = buildDocumentResponsibility({ surface: 'workspace', role: 'principal', state: 'completed', signers })
  assert.equal(processing.currentOwner.type, 'system')
  assert.equal(complete.currentOwner, null)
  assert.equal(complete.nextHandoff, null)
})

test('keeps preparation responsibility with the internal document team', () => {
  const internal = buildDocumentResponsibility({ surface: 'workspace', role: 'transfer_attorney', state: 'draft' })
  const external = buildDocumentResponsibility({ surface: 'workspace', role: 'buyer', state: 'draft' })
  assert.equal(internal.currentOwner.isViewer, true)
  assert.equal(external.currentOwner.label, 'Document team')
})
