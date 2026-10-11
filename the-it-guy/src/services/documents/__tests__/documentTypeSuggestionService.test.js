import test from 'node:test'
import assert from 'node:assert/strict'
import { loadDocumentTypeSuggestions, matchDocumentTypes } from '../documentTypeSuggestionService.js'

test('catalogue reads active types for the requested party and follows pagination', async () => {
  const calls = []
  const query = Object.fromEntries(['select', 'eq', 'contains', 'order'].map(name => [name, (...args) => { calls.push([name, ...args]); return query }]))
  query.range = async (start, end) => {
    calls.push(['range', start, end])
    return { data: start === 0 ? Array.from({ length: 500 }, (_, index) => ({ key: String(index) })) : [{ key: 'last' }] }
  }
  const rows = await loadDocumentTypeSuggestions({ from: name => { assert.equal(name, 'document_definitions'); return query } }, 'buyer')
  assert.equal(rows.length, 501)
  assert.ok(calls.some(call => JSON.stringify(call) === JSON.stringify(['contains', 'default_upload_roles', ['buyer']])))
  assert.ok(calls.some(call => JSON.stringify(call) === JSON.stringify(['eq', 'is_active', true])))
  assert.ok(calls.some(call => JSON.stringify(call) === JSON.stringify(['range', 500, 999])))
})

test('search ranks exact names first and matches descriptions without inventing catalogue types', () => {
  const rows = [
    { key: 'seller_correspondence', display_label: 'Tax correspondence', description: 'Additional SARS letters' },
    { key: 'seller_sars', display_label: 'SARS', description: '' },
    { key: 'seller_divorce', display_label: 'Divorce decree', description: 'Divorce papers' },
  ]
  assert.deepEqual(matchDocumentTypes(rows, 'SARS').map(row => row.key), ['seller_sars', 'seller_correspondence'])
  assert.equal(matchDocumentTypes(rows, 'divorce papers')[0].key, 'seller_divorce')
  assert.deepEqual(matchDocumentTypes(rows, 'unlisted file'), [])
  assert.deepEqual(matchDocumentTypes(rows, '  '), [])
})
