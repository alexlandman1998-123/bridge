import test from 'node:test'
import assert from 'node:assert/strict'
import { buildDocumentMobileAction } from '../documentMobileAction.js'

test('uses the workspace primary action without recreating workflow logic', () => {
  const model = buildDocumentMobileAction({ surface: 'workspace', primaryAction: { id: 'workspace_primary', label: 'Generate PDF', description: 'Create the signing copy.' } })
  assert.equal(model.action.id, 'workspace_primary')
  assert.equal(model.action.label, 'Generate PDF')
})

test('prioritises a recoverable problem over the normal workspace action', () => {
  const model = buildDocumentMobileAction({ surface: 'workspace', primaryAction: { id: 'send', label: 'Send' }, recoveryAction: { id: 'refresh', label: 'Refresh document', description: 'Load the latest revision.' } })
  assert.equal(model.contextLabel, 'Needs attention')
  assert.equal(model.action.id, 'refresh')
})

test('takes a signer to the next required field', () => {
  const model = buildDocumentMobileAction({ surface: 'signer_portal', remainingFields: 2, requiredFields: 4 })
  assert.equal(model.action.id, 'next_field')
  assert.match(model.helper, /2 required fields remaining/)
})

test('switches the signer dock to completion at one hundred percent', () => {
  const model = buildDocumentMobileAction({ surface: 'signer_portal', remainingFields: 0, requiredFields: 3, canComplete: true })
  assert.equal(model.action.id, 'complete_signing')
})

test('does not expose disabled or malformed supplied actions', () => {
  assert.equal(buildDocumentMobileAction({ primaryAction: { id: 'send', label: 'Send', disabled: true } }), null)
  assert.equal(buildDocumentMobileAction({ primaryAction: { id: 'token=secret', label: '' } }), null)
})

test('hides normal actions when an issue has no safe automated recovery', () => {
  const model = buildDocumentMobileAction({ surface: 'signer_portal', remainingFields: 2, requiredFields: 2, blocked: true })
  assert.equal(model, null)
})
