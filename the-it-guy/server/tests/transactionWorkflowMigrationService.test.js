/* global process */
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
    documents: seed.documents || [],
    transaction_required_documents: seed.transaction_required_documents || [],
    transaction_events: seed.transaction_events || [],
    transaction_participants: seed.transaction_participants || [],
    transaction_checklist_items: seed.transaction_checklist_items || [],
    transaction_document_requests: seed.transaction_document_requests || [],
    transaction_subprocesses: seed.transaction_subprocesses || [],
    transaction_subprocess_steps: seed.transaction_subprocess_steps || [],
    transaction_workflow_instances: [],
    transaction_workflow_steps: [],
    transaction_workflow_evidence: [],
    transaction_workflow_events: [],
    transaction_rollups: [],
    transaction_rollup_audit: [],
    transaction_rollup_validation: [],
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

    update(payload) {
      this.action = 'update'
      this.payload = payload
      return this
    }

    _rows() {
      return state[this.table] || []
    }

    _nextId(prefix = 'row') {
      return `${prefix}-${this._rows().length + 1}`
    }

    _conflictKeys() {
      return String(this.onConflict || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
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

    _upsertRows(rows) {
      const payloadRows = Array.isArray(this.payload) ? this.payload : [this.payload]
      const inserted = []
      const conflictKeys = this._conflictKeys()

      for (const incoming of payloadRows) {
        const next = { ...incoming }
        let existingIndex = -1
        if (conflictKeys.length) {
          existingIndex = rows.findIndex((row) => conflictKeys.every((key) => row?.[key] === next?.[key]))
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

    _applyUpdate(rows) {
      const targets = this._filterRows(rows)
      for (const row of targets) {
        Object.assign(row, this.payload)
      }
      return targets
    }

    async execute() {
      const rows = this._rows()

      if (this.action === 'select') {
        const filtered = this._filterRows(rows)
        return { data: this.single ? filtered[0] || null : filtered, error: null }
      }

      if (this.action === 'insert') {
        return { data: this._upsertRows(rows), error: null }
      }

      if (this.action === 'upsert') {
        return { data: this._upsertRows(rows), error: null }
      }

      if (this.action === 'update') {
        const updated = this._applyUpdate(rows)
        return { data: this.single ? updated[0] || null : updated, error: null }
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
  const migrationService = await server.ssrLoadModule('/server/services/transactionWorkflowMigrationService.js')
  const validationService = await server.ssrLoadModule('/server/services/transactionRollupValidationService.js')

  const client = buildMockClient({
    transactions: [
      {
        id: 'tx-bond',
        finance_type: 'bond',
        current_main_stage: 'FIN',
        stage: 'Finance Pending',
        onboarding_status: 'approved',
        seller_onboarding_status: 'approved',
        lifecycle_state: 'active',
        seller_has_existing_bond: false,
        updated_at: '2026-06-02T10:00:00.000Z',
        created_at: '2026-05-29T09:00:00.000Z',
      },
      {
        id: 'tx-cash',
        finance_type: 'cash',
        current_main_stage: 'FIN',
        stage: 'Finance Pending',
        onboarding_status: 'approved',
        seller_onboarding_status: 'approved',
        lifecycle_state: 'active',
        seller_has_existing_bond: false,
        updated_at: '2026-06-02T10:05:00.000Z',
        created_at: '2026-05-29T09:05:00.000Z',
      },
      {
        id: 'tx-hybrid',
        finance_type: 'hybrid',
        current_main_stage: 'FIN',
        stage: 'Finance Pending',
        onboarding_status: 'approved',
        seller_onboarding_status: 'approved',
        lifecycle_state: 'active',
        seller_has_existing_bond: false,
        updated_at: '2026-06-02T10:10:00.000Z',
        created_at: '2026-05-29T09:10:00.000Z',
      },
      {
        id: 'tx-cancelled',
        finance_type: 'cash',
        current_main_stage: 'CANCELLED',
        stage: 'Cancelled',
        onboarding_status: 'not_started',
        seller_onboarding_status: 'not_started',
        lifecycle_state: 'cancelled',
        seller_has_existing_bond: false,
        updated_at: '2026-06-02T10:15:00.000Z',
        created_at: '2026-05-29T09:15:00.000Z',
      },
      {
        id: 'tx-mismatch',
        finance_type: 'bond',
        current_main_stage: 'TRANSFER',
        stage: 'Transfer In Progress',
        onboarding_status: 'not_started',
        seller_onboarding_status: 'not_started',
        lifecycle_state: 'active',
        seller_has_existing_bond: false,
        updated_at: '2026-06-02T10:20:00.000Z',
        created_at: '2026-05-29T09:20:00.000Z',
      },
    ],
    documents: [
      { id: 'doc-bond-generated', transaction_id: 'tx-bond', document_type: 'generated_otp', status: 'completed', created_at: '2026-06-01T08:00:00.000Z' },
      { id: 'doc-bond-signed', transaction_id: 'tx-bond', document_type: 'signed_otp', status: 'completed', created_at: '2026-06-01T08:05:00.000Z' },
      { id: 'doc-bond-buyer', transaction_id: 'tx-bond', document_type: 'buyer_id_document', status: 'completed', created_at: '2026-06-01T08:10:00.000Z' },
      { id: 'doc-bond-seller', transaction_id: 'tx-bond', document_type: 'seller_id_document', status: 'completed', created_at: '2026-06-01T08:15:00.000Z' },
      { id: 'doc-bond-application', transaction_id: 'tx-bond', document_type: 'bond_application_form', status: 'completed', created_at: '2026-06-01T08:20:00.000Z' },

      { id: 'doc-cash-generated', transaction_id: 'tx-cash', document_type: 'generated_otp', status: 'completed', created_at: '2026-06-01T09:00:00.000Z' },
      { id: 'doc-cash-signed', transaction_id: 'tx-cash', document_type: 'signed_otp', status: 'completed', created_at: '2026-06-01T09:05:00.000Z' },
      { id: 'doc-cash-buyer', transaction_id: 'tx-cash', document_type: 'buyer_id_document', status: 'completed', created_at: '2026-06-01T09:10:00.000Z' },
      { id: 'doc-cash-seller', transaction_id: 'tx-cash', document_type: 'seller_id_document', status: 'completed', created_at: '2026-06-01T09:15:00.000Z' },
      { id: 'doc-cash-proof', transaction_id: 'tx-cash', document_type: 'proof_of_funds', status: 'completed', created_at: '2026-06-01T09:20:00.000Z' },

      { id: 'doc-hybrid-generated', transaction_id: 'tx-hybrid', document_type: 'generated_otp', status: 'completed', created_at: '2026-06-01T10:00:00.000Z' },
      { id: 'doc-hybrid-signed', transaction_id: 'tx-hybrid', document_type: 'signed_otp', status: 'completed', created_at: '2026-06-01T10:05:00.000Z' },
      { id: 'doc-hybrid-buyer', transaction_id: 'tx-hybrid', document_type: 'buyer_id_document', status: 'completed', created_at: '2026-06-01T10:10:00.000Z' },
      { id: 'doc-hybrid-seller', transaction_id: 'tx-hybrid', document_type: 'seller_id_document', status: 'completed', created_at: '2026-06-01T10:15:00.000Z' },
      { id: 'doc-hybrid-proof', transaction_id: 'tx-hybrid', document_type: 'proof_of_funds', status: 'completed', created_at: '2026-06-01T10:20:00.000Z' },
      { id: 'doc-hybrid-bond', transaction_id: 'tx-hybrid', document_type: 'bond_application_form', status: 'completed', created_at: '2026-06-01T10:25:00.000Z' },
    ],
  })

  const migration = await migrationService.runTransactionWorkflowMigration({
    client,
    limit: 10,
    source: 'test_phase16',
  })

  assert.equal(migration.transactionsProcessed, 5)
  assert.equal(migration.failedCount, 0)
  assert.equal(client.state.transaction_rollup_validation.length, 5)
  assert.equal(client.state.transaction_workflow_evidence.length > 0, true)
  assert.equal(client.state.transaction_rollups.length, 5)

  const bondInstances = client.state.transaction_workflow_instances.filter((row) => row.transaction_id === 'tx-bond')
  assert.equal(bondInstances.some((row) => row.workflow_key === 'finance_bond'), true)
  assert.equal(bondInstances.some((row) => row.workflow_key === 'finance_cash'), false)

  const cashInstances = client.state.transaction_workflow_instances.filter((row) => row.transaction_id === 'tx-cash')
  assert.equal(cashInstances.some((row) => row.workflow_key === 'finance_cash'), true)
  assert.equal(cashInstances.some((row) => row.workflow_key === 'finance_bond'), false)

  const hybridInstances = client.state.transaction_workflow_instances.filter((row) => row.transaction_id === 'tx-hybrid')
  assert.equal(hybridInstances.some((row) => row.workflow_key === 'finance_hybrid'), true)
  assert.equal(hybridInstances.some((row) => row.workflow_key === 'finance_bond'), false)

  const cancelledRow = migration.report.rows.find((row) => row.transactionId === 'tx-cancelled')
  assert.equal(cancelledRow.rollupStage, 'CANCELLED')

  const syntheticMismatch = validationService.buildTransactionRollupValidation({
    transaction: {
      id: 'tx-synthetic',
      finance_type: 'bond',
      current_main_stage: 'TRANSFER',
      stage: 'Transfer In Progress',
      lifecycle_state: 'active',
      updated_at: '2026-06-02T11:00:00.000Z',
    },
    rollup: {
      transactionId: 'tx-synthetic',
      parentStage: 'SALES_OTP',
      parentStatus: 'blocked',
      progressPercent: 20,
      blockers: [{ code: 'SIGNED_OTP_REQUIRED', message: 'Signed OTP is required.' }],
      nextAction: { label: 'Upload signed OTP' },
      derivedAt: '2026-06-02T11:00:00.000Z',
    },
    state: {
      instances: [{ workflow_key: 'sales_otp' }],
      steps: [{ workflow_key: 'sales_otp', step_key: 'signed_otp_received', status: 'pending' }],
      stepsByWorkflowKey: {
        sales_otp: [{ workflow_key: 'sales_otp', step_key: 'signed_otp_received', status: 'pending' }],
      },
      evidence: [],
    },
    source: 'test_phase16_manual_mismatch',
  })

  assert.equal(syntheticMismatch.comparisonStatus, 'mismatch')
  assert.equal(syntheticMismatch.mismatchCategory, 'D')
  assert.equal(syntheticMismatch.exceptionCodes.includes('SIGNED_OTP_MISSING'), true)

  const summary = validationService.buildTransactionRollupValidationSummary([
    ...migration.report.rows,
    syntheticMismatch,
  ])
  assert.equal(summary.totalTransactions, 6)
  assert.equal(summary.mismatchedTransactions >= 1, true)
  assert.equal(summary.mismatchCategories.D >= 1, true)

  const persistedReport = await validationService.fetchTransactionRollupValidationReport({
    client,
    limit: 10,
  })
  assert.equal(persistedReport.rows.length, 5)

  const validateOnly = await migrationService.runTransactionWorkflowMigration({
    client,
    transactionId: 'tx-bond',
    validateOnly: true,
    source: 'test_phase16_validate_only',
  })
  assert.equal(validateOnly.transactionsProcessed, 1)
  assert.equal(validateOnly.report.rows[0].transactionId, 'tx-bond')
  assert.equal(validateOnly.report.rows[0].rollupStage, 'FINANCE')

  console.log('transactionWorkflowMigrationService tests passed')
} finally {
  await server.close()
}
