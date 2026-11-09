import assert from 'node:assert/strict'
import test from 'node:test'
import { fetchCrossModuleDocumentConsistencySnapshot } from '../crossModuleDocumentConsistencyService.js'

function clientWithRows(tables = {}) {
  const reads = []
  return { reads, from(table) {
    const read = { table, filters: [] }
    reads.push(read)
    const query = {
      select() { return query },
      eq(column, value) { read.filters.push({ column, value }); return query },
      in(column, values) { read.filters.push({ column, values }); return query },
      limit(limit) { return Promise.resolve({ data: (tables[table] || []).slice(0, limit) }) },
    }
    return query
  } }
}

test('live consistency reads both transaction checklists and uses the persisted listing context columns', async () => {
  const client = clientWithRows({ transaction_required_documents: [{ id: 'required', transaction_id: 'tx', document_key: 'buyer_id_document', required_from_role: 'buyer' }] })
  const result = await fetchCrossModuleDocumentConsistencySnapshot({ client, listingIds: ['listing'], transactionIds: ['tx'] })
  assert.equal(result.sourceCounts.transactionDocumentRequirements, 1)
  assert.equal(client.reads.some(read => read.table === 'transaction_document_requirements'), true)
  assert.deepEqual(client.reads.find(read => read.table === 'documents' && read.filters.some(filter => filter.column === 'related_entity_id')).filters,
    [{ column: 'related_entity_type', value: 'private_listing' }, { column: 'related_entity_id', values: ['listing'] }])
  assert.equal(client.reads.some(read => read.table === 'documents' && read.filters.some(filter => filter.column === 'private_listing_id')), false)
  assert.deepEqual(result.queryWarnings, [])
})

test('a capped live read cannot silently claim complete coverage', async () => {
  const client = clientWithRows({ documents: [{ id: 'one', transaction_id: 'tx', document_type: 'buyer_id_document' }] })
  const result = await fetchCrossModuleDocumentConsistencySnapshot({ client, transactionIds: ['tx'], limit: 1 })
  assert.equal(result.queryWarnings.some(warning => warning.table === 'documents' && warning.code === 'audit_scope_limit_reached'), true)
  assert.equal(result.summary.queryWarningCount > 0, true)
  assert.notEqual(result.status, 'healthy')
  assert.equal(result.coverageComplete, false)
})
