import test from 'node:test'
import assert from 'node:assert/strict'
import { buildDocumentHelpRecovery } from '../documentHelpRecovery.js'

test('gives an expired signer a safe fresh-link path', () => {
  const model = buildDocumentHelpRecovery({ surface: 'signer_portal', role: 'seller', issue: 'This signing link has expired. token=secret' })
  assert.equal(model.category, 'link')
  assert.equal(model.action, null)
  assert.doesNotMatch(JSON.stringify(model), /secret|token=/)
})

test('routes incomplete signing to the next required field', () => {
  const model = buildDocumentHelpRecovery({ surface: 'signer_portal', role: 'purchaser_1', issue: 'Complete all required fields before submitting signing.' })
  assert.equal(model.action.id, 'next_field')
})

test('protects workspace changes during revision conflicts', () => {
  const model = buildDocumentHelpRecovery({ surface: 'workspace', role: 'agent', issue: 'The draft changed elsewhere.' })
  assert.equal(model.category, 'conflict')
  assert.equal(model.action.id, 'refresh')
})

test('turns temporary failures into a controlled retry', () => {
  const model = buildDocumentHelpRecovery({ surface: 'workspace', role: 'principal', issue: 'Network connection failed. Please retry.' })
  assert.equal(model.action.id, 'retry')
  assert.match(model.summary, /saved document remains available/i)
})

test('provides contextual help when there is no failure', () => {
  const model = buildDocumentHelpRecovery({ surface: 'workspace', role: 'attorney', state: 'completed' })
  assert.equal(model.hasIssue, false)
  assert.match(model.steps.join(' '), /completion certificate/i)
})
