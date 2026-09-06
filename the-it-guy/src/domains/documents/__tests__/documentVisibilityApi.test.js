import assert from 'node:assert/strict'
import { updateDocumentClientVisibilityRecord } from '../api.js'

function createClient(responses) {
  const calls = []
  return {
    calls,
    from(table) {
      const call = { table, payload: null, id: null, selection: null }
      calls.push(call)
      const query = {
        update(payload) { call.payload = payload; return query },
        eq(column, value) { call[column] = value; return query },
        select(selection) { call.selection = selection; return query },
        async single() { return responses.shift() },
      }
      return query
    },
  }
}

const events = []
const client = createClient([{
  data: { id: 'doc-1', transaction_id: 'tx-1', is_client_visible: true, visibility_scope: 'shared' },
  error: null,
}])
const data = await updateDocumentClientVisibilityRecord({
  client,
  documentId: 'doc-1',
  isClientVisible: true,
  isMissingColumnError: () => false,
  recordEvent: async (event) => events.push(event),
})
assert.equal(data.id, 'doc-1')
assert.deepEqual(client.calls[0].payload, { is_client_visible: true, visibility_scope: 'shared' })
assert.deepEqual(events, [{
  transactionId: 'tx-1',
  eventType: 'DocumentVisibilityChanged',
  eventData: { documentId: 'doc-1', isClientVisible: true, visibilityScope: 'shared' },
}])

const fallbackClient = createClient([
  { data: null, error: { code: '42703', message: 'visibility_scope does not exist' } },
  { data: { id: 'doc-2', transaction_id: 'tx-2', is_client_visible: false }, error: null },
])
await updateDocumentClientVisibilityRecord({
  client: fallbackClient,
  documentId: 'doc-2',
  isClientVisible: false,
  isMissingColumnError: (_error, column) => column === 'visibility_scope',
  recordEvent: async () => {},
})
assert.equal(fallbackClient.calls.length, 2)
assert.deepEqual(fallbackClient.calls[1].payload, { is_client_visible: false })

console.log('Document visibility API tests passed.')
