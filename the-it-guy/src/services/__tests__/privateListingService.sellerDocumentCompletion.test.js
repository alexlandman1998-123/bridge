import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function createQuery(state, calls, table, action = 'select', payload = null) {
  const query = {
    filters: [],
    limitCount: null,
    eq(column, value) {
      this.filters.push({ op: 'eq', column, value })
      return this
    },
    limit(count) {
      this.limitCount = count
      return this
    },
    maybeSingle() {
      const rows = this.resolveRows()
      calls.push({ table, action: `${action}:maybeSingle`, payload, filters: this.filters })
      return Promise.resolve({ data: rows[0] || null, error: null })
    },
    single() {
      if (action === 'insert') {
        const row = { id: `${table}-${state[table].length + 1}`, ...payload }
        state[table].push(row)
        calls.push({ table, action: 'insert', payload: row, filters: this.filters })
        return Promise.resolve({ data: row, error: null })
      }
      const rows = this.resolveRows()
      calls.push({ table, action: `${action}:single`, payload, filters: this.filters })
      return Promise.resolve({ data: rows[0] || null, error: null })
    },
    resolveRows() {
      let rows = [...(state[table] || [])]
      for (const filter of this.filters) {
        if (filter.op === 'eq') {
          rows = rows.filter((row) => row?.[filter.column] === filter.value)
        }
      }
      if (Number.isFinite(this.limitCount)) rows = rows.slice(0, this.limitCount)
      return rows.map(clone)
    },
    then(resolve) {
      const rows = this.resolveRows()
      calls.push({ table, action, payload, filters: this.filters })
      resolve({ data: rows, error: null })
    },
  }
  return query
}

function createMockClient(initialState = {}) {
  const state = {
    transaction_notifications: [],
    ...clone(initialState),
  }
  const calls = []
  return {
    state,
    calls,
    from(table) {
      if (!state[table]) state[table] = []
      return {
        select() {
          return createQuery(state, calls, table, 'select')
        },
        insert(payload) {
          return {
            select() {
              return createQuery(state, calls, table, 'insert', payload)
            },
          }
        },
      }
    },
  }
}

const server = await createServer({
  root: PROJECT_ROOT,
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const {
    __privateListingServiceTestUtils,
  } = await server.ssrLoadModule('/src/services/privateListingService.js')

  const client = createMockClient()
  const listing = {
    id: 'listing-1',
    transactionId: 'tx-1',
    assignedAgentId: 'agent-user-1',
    documentRequirements: [
      {
        id: 'requirement-1',
        requirement_key: 'property_disclosure',
        requirement_name: 'Property disclosure',
        document_visibility: 'seller_visible',
        is_required: true,
        status: 'requested',
      },
      {
        id: 'requirement-2',
        requirement_key: 'id_copy',
        requirement_name: 'ID copy',
        document_visibility: 'seller_visible',
        is_required: true,
        status: 'requested',
      },
    ],
    documents: [
      {
        id: 'document-1',
        requirement_id: 'requirement-1',
        document_type: 'property_disclosure',
        status: 'uploaded',
        storage_path: 'private-listings/listing-1/document-1.pdf',
      },
    ],
  }

  const firstNotification = await __privateListingServiceTestUtils.notifyAgentWhenSellerDocumentsComplete(client, {
    listing,
    documentRow: {
      id: 'document-2',
      requirement_id: 'requirement-2',
      document_type: 'id_copy',
      status: 'uploaded',
      storage_path: 'private-listings/listing-1/document-2.pdf',
    },
    transactionId: 'tx-1',
  })

  assert.equal(firstNotification?.notification_type, 'readiness_updated')
  assert.equal(firstNotification?.title, 'Seller documents are in')
  assert.equal(client.state.transaction_notifications.length, 1)
  assert.equal(client.state.transaction_notifications[0].dedupe_key, 'seller-documents-complete:listing-1')
  assert.equal(client.state.transaction_notifications[0].event_data.trigger, 'seller_documents_complete')

  const duplicateNotification = await __privateListingServiceTestUtils.notifyAgentWhenSellerDocumentsComplete(client, {
    listing: {
      ...listing,
      documents: [
        ...listing.documents,
        {
          id: 'document-2',
          requirement_id: 'requirement-2',
          document_type: 'id_copy',
          status: 'uploaded',
          storage_path: 'private-listings/listing-1/document-2.pdf',
        },
      ],
    },
    documentRow: {
      id: 'document-3',
      requirement_id: 'requirement-2',
      document_type: 'id_copy',
      status: 'uploaded',
      storage_path: 'private-listings/listing-1/document-3.pdf',
    },
    transactionId: 'tx-1',
  })

  assert.equal(duplicateNotification, null)
  assert.equal(client.state.transaction_notifications.length, 1)
} finally {
  await server.close()
}
