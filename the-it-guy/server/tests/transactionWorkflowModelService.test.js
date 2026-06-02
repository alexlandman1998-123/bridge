import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({
  root: process.cwd(),
  logLevel: 'silent',
  server: { middlewareMode: true },
})

function buildMockClient(seed = {}) {
  const state = {
    transactions: seed.transactions || [],
    transaction_workflow_instances: [],
    transaction_workflow_steps: [],
    transaction_workflow_evidence: [],
    transaction_rollups: [],
    transaction_rollup_audit: [],
  }

  class Query {
    constructor(table) {
      this.table = table
      this.filters = []
      this.orderBy = null
      this.single = false
      this.limitValue = null
      this.rangeValue = null
      this.action = 'select'
      this.payload = null
      this.onConflict = ''
    }

    select() {
      return this
    }

    eq(field, value) {
      this.filters.push((row) => row?.[field] === value)
      return this
    }

    order(field, options = {}) {
      this.orderBy = { field, ascending: options.ascending !== false }
      return this
    }

    limit(value) {
      this.limitValue = value
      return this
    }

    range(from, to) {
      this.rangeValue = { from, to }
      return this
    }

    maybeSingle() {
      this.single = true
      return this
    }

    insert(payload) {
      this.action = 'insert'
      this.payload = payload
      return this
    }

    upsert(payload, options = {}) {
      this.action = 'upsert'
      this.payload = payload
      this.onConflict = options.onConflict || ''
      return this
    }

    _rows() {
      return state[this.table] || []
    }

    _nextId(prefix = 'row') {
      return `${prefix}-${this._rows().length + 1}`
    }

    _filterRows(rows) {
      let filtered = [...rows]
      for (const fn of this.filters) {
        filtered = filtered.filter(fn)
      }
      if (this.orderBy) {
        const { field, ascending } = this.orderBy
        filtered.sort((left, right) => {
          const a = left?.[field] || ''
          const b = right?.[field] || ''
          if (a === b) return 0
          return ascending ? (a < b ? -1 : 1) : (a > b ? -1 : 1)
        })
      }
      if (this.rangeValue) {
        filtered = filtered.slice(this.rangeValue.from, this.rangeValue.to + 1)
      }
      if (Number.isFinite(this.limitValue)) {
        filtered = filtered.slice(0, this.limitValue)
      }
      return filtered
    }

    _conflictKeys() {
      return String(this.onConflict || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    }

    _upsertRows(rows) {
      const payloadRows = Array.isArray(this.payload) ? this.payload : [this.payload]
      const inserted = []
      const conflictKeys = this._conflictKeys()

      for (const incoming of payloadRows) {
        const next = { ...incoming }
        let existingIndex = -1
        if (conflictKeys.length) {
          existingIndex = rows.findIndex((row) =>
            conflictKeys.every((key) => row?.[key] === next?.[key]),
          )
        } else if (next.id) {
          existingIndex = rows.findIndex((row) => row?.id === next.id)
        }

        if (existingIndex >= 0) {
          rows[existingIndex] = { ...rows[existingIndex], ...next }
          inserted.push(rows[existingIndex])
        } else {
          if (!next.id) {
            next.id = this._nextId(this.table.replace(/[^a-z]/g, '') || 'row')
          }
          rows.push(next)
          inserted.push(next)
        }
      }

      return inserted
    }

    async execute() {
      const rows = this._rows()

      if (this.action === 'select') {
        const filtered = this._filterRows(rows)
        return { data: this.single ? filtered[0] || null : filtered, error: null }
      }

      if (this.action === 'insert') {
        const inserted = this._upsertRows(rows)
        return { data: inserted, error: null }
      }

      if (this.action === 'upsert') {
        const inserted = this._upsertRows(rows)
        return { data: inserted, error: null }
      }

      return { data: [], error: null }
    }

    then(resolve, reject) {
      return this.execute().then(resolve, reject)
    }
  }

  return {
    state,
    from(table) {
      return new Query(table)
    },
  }
}

try {
  const workflowModel = await server.ssrLoadModule('/server/services/transactionWorkflowModelService.js')
  const rollupService = await server.ssrLoadModule('/server/services/transactionWorkflowRollup.js')

  const transaction = {
    id: 'tx-1',
    finance_type: 'bond',
    current_main_stage: 'OTP',
    stage: 'OTP Signed',
    onboarding_status: 'approved',
    seller_onboarding_status: 'approved',
    lifecycle_state: 'active',
    seller_has_existing_bond: true,
    updated_at: '2026-06-02T10:00:00.000Z',
    created_at: '2026-05-29T09:00:00.000Z',
  }

  const client = buildMockClient({
    transactions: [transaction],
  })

  const seeded = await workflowModel.ensureTransactionWorkflowInstances('tx-1', {
    client,
    transaction,
  })

  const workflowKeys = seeded.instances.map((row) => row.workflow_key).sort()
  assert.deepEqual(
    workflowKeys,
    ['attorney_bond', 'attorney_transfer', 'finance_bond', 'registration', 'sales_otp', 'seller_bond_cancellation'],
  )
  assert.equal(seeded.steps.filter((row) => row.workflow_key === 'sales_otp').length > 0, true)

  const rollup = await rollupService.resolveTransactionRollup('tx-1', {
    client,
    preferLegacy: true,
    context: {
      transaction,
      documents: [
        { id: 'doc-generated-otp', document_type: 'generated_otp', status: 'completed' },
        { id: 'doc-signed-otp', document_type: 'signed_otp', status: 'completed' },
        { id: 'doc-buyer-fica', document_type: 'buyer_id_document', status: 'completed' },
        { id: 'doc-seller-fica', document_type: 'seller_id_document', status: 'completed' },
        { id: 'doc-bond-app', document_type: 'bond_application_form', status: 'completed' },
      ],
      requiredDocuments: [],
      lanes: [],
      checklistItems: [],
      documentRequests: [],
      events: [],
    },
  })

  assert.equal(rollup.parentStage, 'FINANCE')
  assert.equal(rollup.blockers.some((item) => item.code === 'BOND_APPROVAL_REQUIRED'), true)

  const synced = await workflowModel.syncTransactionWorkflowModel('tx-1', rollup, {
    client,
    transaction,
    reasonCode: 'TEST_SYNC',
    triggerType: 'test',
    triggerId: 'tx-1',
  })

  assert.equal(synced.persistedRollup.parent_stage, 'FINANCE')
  assert.equal(client.state.transaction_rollup_audit.length, 1)
  assert.equal(client.state.transaction_workflow_evidence.length > 0, true)

  const normalized = await workflowModel.getWorkflowStateForTransaction('tx-1', {
    client,
    transaction,
  })
  assert.equal(normalized.rollup.parent_stage, 'FINANCE')

  const rerolled = await rollupService.resolveTransactionRollup('tx-1', {
    client,
    normalizedState: normalized,
    context: {
      transaction,
      documents: [],
      requiredDocuments: [],
      lanes: [],
      checklistItems: [],
      documentRequests: [],
      events: [],
    },
  })

  assert.equal(rerolled.parentStage, 'FINANCE')
  assert.equal(rerolled.parentStatus, 'blocked')
  assert.equal(rerolled.activeWorkflowKey, 'finance_bond')

  console.log('transactionWorkflowModelService tests passed')
} finally {
  await server.close()
}
