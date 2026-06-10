import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({
  root: process.cwd(),
  logLevel: 'silent',
  server: { middlewareMode: true },
})

const TRANSACTION_ID = '44444444-4444-4444-8444-444444444444'

const staleRows = [
  {
    id: 'stale-bond-approval',
    transaction_id: TRANSACTION_ID,
    document_key: 'bond_approval',
    document_label: 'Bond Approval',
    is_required: true,
    is_uploaded: false,
    status: 'missing',
    enabled: true,
    group_key: 'finance',
    group_label: 'Finance',
    description: '',
    required_from_role: 'bond_originator',
    visibility_scope: 'client',
    allow_multiple: false,
    uploaded_document_id: null,
    uploaded_at: null,
    verified_at: null,
    rejected_at: null,
    notes: null,
    sort_order: 10,
    canonical_requirement_instance_id: null,
    created_at: '2026-06-10T00:00:00.000Z',
    updated_at: '2026-06-10T00:00:00.000Z',
  },
  {
    id: 'stale-grant',
    transaction_id: TRANSACTION_ID,
    document_key: 'grant_signed',
    document_label: 'Grant / Loan Agreement',
    is_required: true,
    is_uploaded: false,
    status: 'missing',
    enabled: true,
    group_key: 'finance',
    group_label: 'Finance',
    description: '',
    required_from_role: 'bond_originator',
    visibility_scope: 'client',
    allow_multiple: false,
    uploaded_document_id: null,
    uploaded_at: null,
    verified_at: null,
    rejected_at: null,
    notes: null,
    sort_order: 11,
    canonical_requirement_instance_id: null,
    created_at: '2026-06-10T00:00:00.000Z',
    updated_at: '2026-06-10T00:00:00.000Z',
  },
]

let upsertRows = []
const staleUpdates = []
let requiredRows = staleRows.map((row) => ({ ...row }))

class FakeQuery {
  constructor(table, operation = 'select') {
    this.table = table
    this.operation = operation
    this.filters = {}
    this.payload = null
  }

  select() {
    return this
  }

  eq(column, value) {
    this.filters[column] = value
    if (this.operation === 'update') {
      staleUpdates.push({ id: value, payload: this.payload })
      requiredRows = requiredRows.map((row) => (
        row.id === value ? { ...row, ...this.payload } : row
      ))
      return Promise.resolve({ data: null, error: null })
    }
    return this
  }

  maybeSingle() {
    if (this.table === 'transactions') {
      return Promise.resolve({
        data: {
          stage: 'Finance Pending',
          current_main_stage: 'FIN',
        },
        error: null,
      })
    }
    return Promise.resolve({ data: null, error: null })
  }

  order() {
    if (this.table === 'transaction_required_documents') {
      return Promise.resolve({
        data: [...requiredRows].sort((left, right) => (left.sort_order || 0) - (right.sort_order || 0)),
        error: null,
      })
    }
    return Promise.resolve({ data: [], error: null })
  }

  then(resolve, reject) {
    if (this.table === 'transaction_required_documents') {
      return Promise.resolve({ data: requiredRows, error: null }).then(resolve, reject)
    }
    return Promise.resolve({ data: [], error: null }).then(resolve, reject)
  }
}

const fakeClient = {
  from(table) {
    return {
      select() {
        return new FakeQuery(table).select()
      },
      upsert(rows) {
        upsertRows = rows
        const existingByKey = new Map(requiredRows.map((row) => [row.document_key, row]))
        for (const row of rows) {
          const existing = existingByKey.get(row.document_key)
          const nextRow = {
            ...(existing || {}),
            ...row,
            id: existing?.id || `required-${row.document_key}`,
            created_at: existing?.created_at || '2026-06-10T00:00:00.000Z',
            updated_at: '2026-06-10T00:00:00.000Z',
          }
          existingByKey.set(row.document_key, nextRow)
        }
        requiredRows = Array.from(existingByKey.values())
        return Promise.resolve({ data: rows, error: null })
      },
      update(payload) {
        const query = new FakeQuery(table, 'update')
        query.payload = payload
        return query
      },
      insert() {
        return {
          select() {
            return {
              single() {
                return Promise.resolve({ data: null, error: null })
              },
            }
          },
        }
      },
    }
  },
}

try {
  const { ensureTransactionRequiredDocuments } = await server.ssrLoadModule('/src/lib/api.js')
  const result = await ensureTransactionRequiredDocuments(fakeClient, {
    transactionId: TRANSACTION_ID,
    purchaserType: 'married_anc',
    financeType: 'cash',
    formData: {
      purchaser_type: 'married_anc',
      marital_status: 'married',
      marital_regime: 'out_of_community',
      spouse_full_name: 'Fixture Spouse',
      spouse_is_co_purchaser: 'no',
      purchase_finance_type: 'cash',
    },
  }, { sync: true })

  const upsertKeys = new Set(upsertRows.map((row) => row.document_key))
  assert.equal(upsertKeys.has('proof_of_funds'), true, 'cash recalculation should require proof of funds')
  assert.equal(upsertKeys.has('bond_approval'), false, 'cash recalculation should not keep bond approval required')
  assert.equal(upsertKeys.has('grant_signed'), false, 'cash recalculation should not keep grant/loan required')

  const updatesById = new Map(staleUpdates.map((item) => [item.id, item.payload]))
  assert.deepEqual(updatesById.get('stale-bond-approval'), {
    is_required: false,
    enabled: false,
    status: 'not_required',
  })
  assert.deepEqual(updatesById.get('stale-grant'), {
    is_required: false,
    enabled: false,
    status: 'not_required',
  })

  const bondApproval = result.find((row) => row.key === 'bond_approval')
  const grantSigned = result.find((row) => row.key === 'grant_signed')
  assert.equal(bondApproval?.isRequired, false, 'returned stale bond approval should be disabled')
  assert.equal(bondApproval?.isEnabled, false, 'returned stale bond approval should not be enabled')
  assert.equal(bondApproval?.status, 'not_required', 'returned stale bond approval should be not_required')
  assert.equal(grantSigned?.isRequired, false, 'returned stale grant/loan agreement should be disabled')
  assert.equal(grantSigned?.isEnabled, false, 'returned stale grant/loan agreement should not be enabled')
  assert.equal(grantSigned?.status, 'not_required', 'returned stale grant/loan agreement should be not_required')

  console.log('document request stale finance row tests passed')
} finally {
  await server.close()
}
