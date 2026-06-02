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
    units: seed.units || [],
    transaction_workflow_instances: [],
    transaction_workflow_steps: [],
    transaction_workflow_evidence: [],
    transaction_rollups: [],
    transaction_rollup_audit: [],
    transaction_workflow_events: [],
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

    _applyUpdate(rows) {
      const targets = this._filterRows(rows)
      for (const row of targets) {
        Object.assign(row, this.payload)
      }
      return targets
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
  const workflowModel = await server.ssrLoadModule('/server/services/transactionWorkflowModelService.js')
  const actionService = await server.ssrLoadModule('/server/services/workflowActionService.js')

  const transaction = {
    id: 'tx-1',
    unit_id: 'unit-1',
    finance_type: 'bond',
    current_main_stage: 'OTP',
    stage: 'OTP In Progress',
    onboarding_status: 'approved',
    seller_onboarding_status: 'approved',
    lifecycle_state: 'active',
    seller_has_existing_bond: false,
    updated_at: '2026-06-02T10:00:00.000Z',
    created_at: '2026-05-29T09:00:00.000Z',
  }

  const client = buildMockClient({
    transactions: [transaction],
    units: [{ id: 'unit-1', status: 'OTP In Progress' }],
  })

  await workflowModel.ensureTransactionWorkflowInstances('tx-1', {
    client,
    transaction,
  })

  const blockedFinanceMove = await actionService.runWorkflowAction({
    transactionId: 'tx-1',
    actionKey: 'MOVE_TO_FINANCE',
    userId: 'user-1',
    payload: { source: 'test' },
    client,
  })

  assert.equal(blockedFinanceMove.allowed, false)
  assert.equal((blockedFinanceMove.blockers || []).length > 0, true)

  for (const key of [
    'buyer_onboarding_complete',
    'seller_onboarding_complete',
    'signed_otp_received',
    'supporting_docs_complete',
  ]) {
    await workflowModel.updateWorkflowStepStatus('tx-1', 'sales_otp', key, 'complete', { client, transaction })
  }

  const financeMove = await actionService.runWorkflowAction({
    transactionId: 'tx-1',
    actionKey: 'MOVE_TO_FINANCE',
    userId: 'user-1',
    payload: { source: 'test' },
    client,
  })

  assert.equal(financeMove.allowed, true)
  assert.equal(financeMove.rollup.parentStage, 'FINANCE')
  assert.equal(financeMove.compatibility.current_main_stage, 'FIN')
  assert.equal(client.state.transactions[0].current_main_stage, 'FIN')
  assert.equal(client.state.transaction_workflow_events.length >= 2, true)

  for (const key of ['documents_received', 'documents_reviewed', 'applications_submitted', 'feedback_received', 'quote_approved', 'instruction_sent']) {
    await workflowModel.updateWorkflowStepStatus('tx-1', 'finance_bond', key, 'complete', { client, transaction })
  }

  const transferMove = await actionService.runWorkflowAction({
    transactionId: 'tx-1',
    actionKey: 'MOVE_TO_TRANSFER',
    userId: 'user-1',
    payload: { source: 'test' },
    client,
  })

  assert.equal(transferMove.allowed, true)
  assert.equal(transferMove.rollup.parentStage, 'TRANSFER')
  assert.equal(transferMove.compatibility.current_main_stage, 'TRANSFER')
  assert.equal(client.state.units[0].status, 'TRANSFER')

  const cashClient = buildMockClient({
    transactions: [{
      id: 'tx-2',
      unit_id: 'unit-2',
      finance_type: 'cash',
      current_main_stage: 'OTP',
      stage: 'OTP In Progress',
      onboarding_status: 'approved',
      seller_onboarding_status: 'approved',
      lifecycle_state: 'active',
      seller_has_existing_bond: false,
      title_deed_number: '',
      registration_confirmation_document_id: '',
      updated_at: '2026-06-02T10:00:00.000Z',
      created_at: '2026-05-29T09:00:00.000Z',
    }],
    units: [{ id: 'unit-2', status: 'OTP In Progress' }],
  })

  await workflowModel.ensureTransactionWorkflowInstances('tx-2', {
    client: cashClient,
    transaction: cashClient.state.transactions[0],
  })

  for (const key of [
    'buyer_onboarding_complete',
    'seller_onboarding_complete',
    'signed_otp_received',
    'supporting_docs_complete',
  ]) {
    await workflowModel.updateWorkflowStepStatus('tx-2', 'sales_otp', key, 'complete', { client: cashClient, transaction: cashClient.state.transactions[0] })
  }
  const cashFinanceMove = await actionService.runWorkflowAction({
    transactionId: 'tx-2',
    actionKey: 'MOVE_TO_FINANCE',
    userId: 'user-2',
    payload: { source: 'test' },
    client: cashClient,
  })
  assert.equal(cashFinanceMove.allowed, true)
  await workflowModel.updateWorkflowStepStatus('tx-2', 'finance_cash', 'proof_of_funds_received', 'complete', { client: cashClient, transaction: cashClient.state.transactions[0] })
  await workflowModel.updateWorkflowStepStatus('tx-2', 'finance_cash', 'proof_of_funds_reviewed', 'complete', { client: cashClient, transaction: cashClient.state.transactions[0] })
  await workflowModel.updateWorkflowStepStatus('tx-2', 'finance_cash', 'cash_confirmation_approved', 'complete', { client: cashClient, transaction: cashClient.state.transactions[0] })
  const cashTransferMove = await actionService.runWorkflowAction({
    transactionId: 'tx-2',
    actionKey: 'MOVE_TO_TRANSFER',
    userId: 'user-2',
    payload: { source: 'test' },
    client: cashClient,
  })
  assert.equal(cashTransferMove.allowed, true)
  for (const key of [
    'instruction_received',
    'transfer_documents_requested',
    'transfer_documents_received',
    'transfer_documents_prepared',
    'transfer_documents_signed',
    'clearance_figures_requested',
    'clearance_figures_received',
    'transfer_duty_requested',
    'transfer_duty_received',
    'guarantees_confirmed',
    'ready_for_lodgement',
    'lodged',
  ]) {
    await workflowModel.updateWorkflowStepStatus('tx-2', 'attorney_transfer', key, 'complete', { client: cashClient, transaction: cashClient.state.transactions[0] })
  }

  const registrationReady = await actionService.runWorkflowAction({
    transactionId: 'tx-2',
    actionKey: 'MARK_READY_FOR_REGISTRATION',
    userId: 'user-2',
    payload: { source: 'test' },
    client: cashClient,
  })
  assert.equal(registrationReady.allowed, true)
  assert.equal(registrationReady.rollup.parentStage, 'REGISTRATION')
  assert.equal(registrationReady.compatibility.current_main_stage, 'REGISTRATION')

  const registered = await actionService.runWorkflowAction({
    transactionId: 'tx-2',
    actionKey: 'MARK_REGISTERED',
    userId: 'user-2',
    payload: {
      source: 'test',
      registrationDate: '2026-06-02',
      titleDeedNumber: 'T123',
      registrationConfirmationDocumentId: 'doc-reg-1',
    },
    client: cashClient,
  })
  assert.equal(registered.allowed, true)
  assert.equal(registered.rollup.parentStage, 'COMPLETE')
  assert.equal(registered.compatibility.current_main_stage, 'COMPLETE')
  assert.equal(cashClient.state.transactions[0].registration_confirmation_document_id, 'doc-reg-1')
  assert.equal(cashClient.state.transaction_workflow_evidence.some((item) => item.evidence_id === 'doc-reg-1'), true)

  console.log('workflowActionService tests passed')
} finally {
  await server.close()
}
