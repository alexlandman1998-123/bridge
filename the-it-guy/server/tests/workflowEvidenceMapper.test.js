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
  const mapper = await server.ssrLoadModule('/server/services/workflowEvidenceMapper.js')

  const client = buildMockClient({
    transactions: [
      {
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
      },
      {
        id: 'tx-2',
        unit_id: 'unit-2',
        finance_type: 'cash',
        current_main_stage: 'OTP',
        stage: 'OTP In Progress',
        onboarding_status: 'approved',
        seller_onboarding_status: 'approved',
        lifecycle_state: 'active',
        seller_has_existing_bond: false,
        updated_at: '2026-06-02T10:00:00.000Z',
        created_at: '2026-05-29T09:00:00.000Z',
      },
      {
        id: 'tx-3',
        unit_id: 'unit-3',
        finance_type: 'hybrid',
        current_main_stage: 'OTP',
        stage: 'OTP In Progress',
        onboarding_status: 'approved',
        seller_onboarding_status: 'approved',
        lifecycle_state: 'active',
        seller_has_existing_bond: false,
        updated_at: '2026-06-02T10:00:00.000Z',
        created_at: '2026-05-29T09:00:00.000Z',
      },
    ],
    units: [
      { id: 'unit-1', status: 'OTP In Progress' },
      { id: 'unit-2', status: 'OTP In Progress' },
      { id: 'unit-3', status: 'OTP In Progress' },
    ],
  })

  await workflowModel.ensureTransactionWorkflowInstances('tx-1', {
    client,
    transaction: client.state.transactions[0],
  })
  await workflowModel.ensureTransactionWorkflowInstances('tx-2', {
    client,
    transaction: client.state.transactions[1],
  })
  await workflowModel.ensureTransactionWorkflowInstances('tx-3', {
    client,
    transaction: client.state.transactions[2],
  })

  await mapper.processWorkflowEvidence({
    transactionId: 'tx-1',
    evidenceType: 'onboarding',
    evidenceId: 'buyer-onboarding-1',
    evidenceKey: 'buyer_onboarding_complete',
    status: 'completed',
    source: 'test',
    client,
  })
  await mapper.processWorkflowEvidence({
    transactionId: 'tx-1',
    evidenceType: 'onboarding',
    evidenceId: 'seller-onboarding-1',
    evidenceKey: 'seller_onboarding_complete',
    status: 'completed',
    source: 'test',
    client,
  })
  await mapper.processWorkflowEvidence({
    transactionId: 'tx-1',
    evidenceType: 'document',
    evidenceId: 'doc-signed-otp-1',
    evidenceKey: 'signed_otp',
    status: 'approved',
    source: 'test',
    client,
  })
  await mapper.processWorkflowEvidence({
    transactionId: 'tx-1',
    evidenceType: 'document_request',
    evidenceId: 'req-supporting-1',
    evidenceKey: 'supporting_docs_complete',
    status: 'completed',
    source: 'test',
    client,
  })

  const financeMove = await actionService.runWorkflowAction({
    transactionId: 'tx-1',
    actionKey: 'MOVE_TO_FINANCE',
    userId: 'user-1',
    payload: { source: 'test' },
    client,
  })
  assert.equal(financeMove.allowed, true)
  assert.equal(financeMove.rollup.parentStage, 'FINANCE')

  const rejection = await mapper.processWorkflowEvidence({
    transactionId: 'tx-1',
    evidenceType: 'document',
    evidenceId: 'doc-signed-otp-1',
    evidenceKey: 'signed_otp',
    status: 'rejected',
    source: 'test',
    client,
  })
  assert.equal(rejection.rollup.parentStage, 'SALES_OTP')
  assert.equal(rejection.compatibility.current_main_stage, 'OTP')
  assert.equal(client.state.transaction_rollup_audit.length > 0, true)
  const latestAudit = client.state.transaction_rollup_audit[client.state.transaction_rollup_audit.length - 1]
  assert.equal(latestAudit.reason_code, 'WORKFLOW_EVIDENCE_DOCUMENT_SIGNED_OTP_REJECTED')
  assert.equal(latestAudit.trigger_type, 'workflow_evidence')
  assert.equal(
    Array.isArray(latestAudit.derived_from_json?.workflowStepIds || latestAudit.derived_from_json?.workflowSteps),
    true,
  )

  const rejectedState = await workflowModel.getWorkflowStateForTransaction('tx-1', {
    client,
    transaction: client.state.transactions[0],
  })
  const signedOtpStep = (rejectedState.stepsByWorkflowKey.sales_otp || []).find((step) => step.step_key === 'signed_otp_received')
  assert.equal(signedOtpStep?.status, 'blocked')
  assert.equal(client.state.transaction_workflow_events.some((item) => item.event_type === 'workflow_evidence_processed'), true)

  await mapper.processWorkflowEvidence({
    transactionId: 'tx-2',
    evidenceType: 'document',
    evidenceId: 'doc-pof-1',
    evidenceKey: 'proof_of_funds',
    status: 'uploaded',
    source: 'test',
    client,
  })
  let cashState = await workflowModel.getWorkflowStateForTransaction('tx-2', {
    client,
    transaction: client.state.transactions[1],
  })
  const pofReceivedStep = (cashState.stepsByWorkflowKey.finance_cash || []).find((step) => step.step_key === 'proof_of_funds_received')
  const pofReviewedStep = (cashState.stepsByWorkflowKey.finance_cash || []).find((step) => step.step_key === 'proof_of_funds_reviewed')
  const cashApprovedStep = (cashState.stepsByWorkflowKey.finance_cash || []).find((step) => step.step_key === 'cash_confirmation_approved')
  assert.equal(pofReceivedStep?.status, 'complete')
  assert.equal(pofReviewedStep?.status, 'pending')
  assert.equal(cashApprovedStep?.status, 'pending')

  await mapper.processWorkflowEvidence({
    transactionId: 'tx-2',
    evidenceType: 'document',
    evidenceId: 'doc-pof-1',
    evidenceKey: 'proof_of_funds',
    status: 'approved',
    source: 'test',
    client,
  })
  cashState = await workflowModel.getWorkflowStateForTransaction('tx-2', {
    client,
    transaction: client.state.transactions[1],
  })
  const cashReviewedAfterReview = (cashState.stepsByWorkflowKey.finance_cash || []).find((step) => step.step_key === 'proof_of_funds_reviewed')
  const cashApprovedAfterReview = (cashState.stepsByWorkflowKey.finance_cash || []).find((step) => step.step_key === 'cash_confirmation_approved')
  assert.equal(cashReviewedAfterReview?.status, 'complete')
  assert.equal(cashApprovedAfterReview?.status, 'complete')

  await mapper.processWorkflowEvidence({
    transactionId: 'tx-3',
    evidenceType: 'document',
    evidenceId: 'doc-hybrid-pof-1',
    evidenceKey: 'proof_of_funds_cash_component',
    status: 'approved',
    source: 'test',
    client,
  })
  await mapper.processWorkflowEvidence({
    transactionId: 'tx-3',
    evidenceType: 'external_status',
    evidenceId: 'bond-feedback-1',
    evidenceKey: 'bank_feedback_received',
    status: 'received',
    source: 'test',
    client,
  })
  let hybridState = await workflowModel.getWorkflowStateForTransaction('tx-3', {
    client,
    transaction: client.state.transactions[2],
  })
  const hybridCashStep = (hybridState.stepsByWorkflowKey.finance_hybrid || []).find((step) => step.step_key === 'cash_portion_confirmed')
  const hybridFeedbackStep = (hybridState.stepsByWorkflowKey.finance_hybrid || []).find((step) => step.step_key === 'feedback_received')
  assert.equal(hybridCashStep?.status, 'complete')
  assert.equal(hybridFeedbackStep?.status, 'complete')

  const ignoredCashBondEvidence = await mapper.processWorkflowEvidence({
    transactionId: 'tx-2',
    evidenceType: 'external_status',
    evidenceId: 'cash-bond-feedback-ignored',
    evidenceKey: 'bank_feedback_received',
    status: 'received',
    source: 'test',
    client,
  })
  assert.equal(ignoredCashBondEvidence.mapped, false)

  console.log('workflowEvidenceMapper tests passed')
} finally {
  await server.close()
}
