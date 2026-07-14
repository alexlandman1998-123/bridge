import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getLegalDocumentDefinition,
  listLegalDocumentDefinitions,
  normalizeLegalDocumentEditorScope,
} from '../legalDocumentCatalog.js'

test('catalog exposes standard documents and supported addenda', () => {
  assert.deepEqual(listLegalDocumentDefinitions().map((document) => document.key), [
    'otp',
    'mandate',
    'purchase_price_addendum',
    'occupation_addendum',
  ])
  assert.equal(getLegalDocumentDefinition('purchase_price_addendum')?.packetType, 'otp')
})

test('catalog filters by the packet types available to a module', () => {
  assert.deepEqual(listLegalDocumentDefinitions({ packetTypes: ['mandate'] }).map((document) => document.key), ['mandate'])
})

test('editor scopes fail safely to the full editor', () => {
  assert.equal(normalizeLegalDocumentEditorScope('situations'), 'situations')
  assert.equal(normalizeLegalDocumentEditorScope('unsupported'), 'all')
})
