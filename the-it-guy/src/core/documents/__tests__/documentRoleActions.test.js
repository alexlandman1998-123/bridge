import test from 'node:test'
import assert from 'node:assert/strict'
import { buildDocumentRoleActions } from '../documentRoleActions.js'

test('prioritises editing and preview for an attorney draft', () => {
  const model = buildDocumentRoleActions({ surface: 'workspace', role: 'transfer_attorney', state: 'draft', canEdit: true })
  assert.deepEqual(model.actions.map((item) => item.id), ['edit_document', 'open_preview'])
  assert.equal(model.actions[0].label, 'Review wording')
})

test('shows only signer tracking actions after dispatch', () => {
  const model = buildDocumentRoleActions({ surface: 'workspace', role: 'agent', state: 'awaiting_signers', canSend: true })
  assert.deepEqual(model.actions.map((item) => item.id), ['open_signers', 'open_activity'])
  assert.equal(model.actions.some((item) => item.id === 'send_document'), false)
})

test('enables completed evidence only when each artifact exists', () => {
  const model = buildDocumentRoleActions({ surface: 'workspace', role: 'principal', state: 'completed', finalCopyAvailable: true, certificateAvailable: false })
  assert.equal(model.actions.find((item) => item.id === 'open_final').disabled, false)
  assert.equal(model.actions.find((item) => item.id === 'open_certificate').disabled, true)
})

test('keeps signer completion disabled until required fields are finished', () => {
  const pending = buildDocumentRoleActions({ surface: 'signer_portal', role: 'seller', remainingFields: 1, requiredFields: 2, canComplete: false })
  const ready = buildDocumentRoleActions({ surface: 'signer_portal', role: 'seller', remainingFields: 0, requiredFields: 2, canComplete: true })
  assert.equal(pending.actions.find((item) => item.id === 'complete_signing').disabled, true)
  assert.equal(ready.actions.find((item) => item.id === 'complete_signing').disabled, false)
  assert.ok(pending.actions.length <= 3)
})
