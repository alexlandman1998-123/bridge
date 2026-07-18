import test from 'node:test'
import assert from 'node:assert/strict'
import { buildDocumentAccessibility } from '../documentAccessibility.js'

test('announces the current journey and next action', () => {
  const model = buildDocumentAccessibility({ journey: { title: 'Current stage: Set up signing', summary: 'Place fields.' }, mobileAction: { action: { label: 'Send for signature' } } })
  assert.match(model.announcement, /Current stage: Set up signing/)
  assert.match(model.announcement, /Next action: Send for signature/)
})

test('announces signer field progress and personal responsibility', () => {
  const model = buildDocumentAccessibility({ surface: 'signer_portal', completedFields: 2, requiredFields: 3, responsibility: { currentOwner: { isViewer: true } } })
  assert.match(model.announcement, /2 of 3 required signing fields complete/)
  assert.match(model.announcement, /You are responsible/)
})

test('prioritises safe recovery guidance when an issue exists', () => {
  const model = buildDocumentAccessibility({ journey: { title: 'Normal journey' }, helpRecovery: { hasIssue: true, title: 'A required field is incomplete', summary: 'Complete the highlighted field.' } })
  assert.doesNotMatch(model.announcement, /Normal journey/)
  assert.match(model.announcement, /required field is incomplete/)
})

test('removes technical identifiers and secrets from announcements', () => {
  const model = buildDocumentAccessibility({ journey: { title: 'Retry token=secret at https://example.test/path', summary: 'Contact person@example.test with 123e4567-e89b-12d3-a456-426614174000' } })
  assert.doesNotMatch(model.announcement, /secret|https|example\.test|123e4567/)
})

test('uses safe landmark fallbacks for invalid target ids', () => {
  const model = buildDocumentAccessibility({ contentTargetId: 'bad id', actionsTargetId: '<script>' })
  assert.equal(model.contentTargetId, 'document-main-content')
  assert.equal(model.actionsTargetId, 'document-main-actions')
})
