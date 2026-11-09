// @vitest-environment node
import { expect, it } from 'vitest'
import { fetchClientPortalSafeSharedDocumentRowsByTransactionIds, fetchSharedDocumentRowsByTransactionIds, normalizeSharedDocumentRow } from '../listReadApi.js'

function fixture(responses) {
  const calls = []
  return { calls, from(table) {
    const call = { table, filters: [] }; calls.push(call)
    const query = {}
    for (const method of ['select', 'in', 'or', 'eq', 'order']) query[method] = (...args) => { call.filters.push([method, ...args]); return query }
    query.then = (resolve, reject) => Promise.resolve(responses.shift()).then(resolve, reject)
    return query
  } }
}

it.each([[false, true], [true, false], [undefined, false]])('normalizes evidence current=%s as archived=%s', (current, archived) => {
  expect(normalizeSharedDocumentRow({ id: 'document', is_current_evidence: current }).is_archived).toBe(archived)
})

it('retains older-schema fallback while requesting current-evidence metadata first', async () => {
  const client = fixture([{ data: null, error: { code: '42703', message: 'column is_current_evidence does not exist' } }, { data: [{ id: 'legacy-document' }], error: null }])
  const result = await fetchSharedDocumentRowsByTransactionIds(client, ['transaction', 'transaction'])
  expect(result.rows.map(row => row.id)).toEqual(['legacy-document'])
  expect(client.calls[0].filters.find(([method]) => method === 'select')[1]).toContain('is_current_evidence')
  expect(client.calls[1].filters.find(([method]) => method === 'select')[1]).not.toContain('is_current_evidence')
  expect(client.calls[0].filters).toContainEqual(['in', 'transaction_id', ['transaction']])
})

it('keeps final signed documents on the descriptor query without raw storage locations', async () => {
  const client = fixture([{ data: [{ id: 'ordinary', stage_key: null, is_current_evidence: true }], error: null }, { data: [{ id: 'final', stage_key: 'final_signed', is_current_evidence: true }], error: null }])
  const rows = await fetchClientPortalSafeSharedDocumentRowsByTransactionIds(client, ['transaction'])
  expect(rows.map(row => row.id).sort()).toEqual(['final', 'ordinary'])
  expect(client.calls[0].filters).toContainEqual(['or', 'stage_key.is.null,stage_key.neq.final_signed'])
  const finalQuery = client.calls.find(call => call.filters.some(filter => filter[0] === 'eq' && filter[2] === 'final_signed'))
  expect(finalQuery.filters.find(([method]) => method === 'select')[1]).not.toMatch(/\b(?:file_path|file_bucket|bucket_key)\b/)
})
