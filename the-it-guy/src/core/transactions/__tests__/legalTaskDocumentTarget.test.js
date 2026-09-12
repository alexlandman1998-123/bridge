import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveLegalTaskUploadRequirement as resolve } from '../legalTaskDocumentTarget.js'

test('explicit document selection wins', () => {
  const selected = { id: 'chosen' }
  assert.equal(resolve([{ missing: true, requirement: { id: 'other' } }], selected), selected)
})
test('one missing item takes priority over existing evidence', () => {
  const missing = { id: 'missing' }
  assert.equal(resolve([{ requirement: { id: 'attached' } }, { missing: true, requirement: missing }]), missing)
})
test('ambiguous uploads do not select a random requirement', () => {
  assert.equal(resolve([{ missing: true, requirement: { id: 'a' } }, { ready: false, requirement: { id: 'b' } }]), null)
  assert.equal(resolve([{ requirement: { id: 'a' } }, { requirement: { id: 'b' } }]), null)
  assert.equal(resolve([null, { id: 'unlinked-file' }]), null)
})
