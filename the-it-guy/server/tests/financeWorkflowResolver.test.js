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

      if (this.action === 'insert' || this.action === 'upsert') {
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
  const financeResolver = await server.ssrLoadModule('/server/services/financeWorkflowResolver.js')
  const documentRequestResolver = await server.ssrLoadModule('/server/services/documentRequestResolver.js')
  const workflowModel = await server.ssrLoadModule('/server/services/transactionWorkflowModelService.js')
  const rollupRules = await server.ssrLoadModule('/server/services/workflowRollupRules.js')

  assert.equal(financeResolver.normaliseFinanceType('mortgage'), 'bond')
  assert.equal(financeResolver.normaliseFinanceType('cash_buyer'), 'cash')
  assert.equal(financeResolver.normaliseFinanceType('cash_and_bond'), 'hybrid')
  assert.equal(financeResolver.normaliseFinanceType(''), 'unknown')

  assert.equal(financeResolver.resolveFinanceWorkflowKey({ finance_type: 'bond' }), 'finance_bond')
  assert.equal(financeResolver.resolveFinanceWorkflowKey({ finance_type: 'cash' }), 'finance_cash')
  assert.equal(financeResolver.resolveFinanceWorkflowKey({ finance_type: 'hybrid' }), 'finance_hybrid')
  assert.equal(financeResolver.resolveFinanceWorkflowKey({ finance_type: null }), 'finance_unknown')

  const cashProfile = documentRequestResolver.resolveDocumentRequestProfile({
    id: 'tx-cash',
    finance_type: 'cash',
    purchaser_type: 'individual',
  })
  assert.equal(cashProfile.workflowKey, 'finance_cash')
  assert.deepEqual(cashProfile.requiredAttorneyWorkflowKeys, ['attorney_transfer'])
  assert.equal(cashProfile.attorneyLanes.attorney_transfer.required, true)
  assert.equal(cashProfile.attorneyLanes.attorney_bond.required, false)
  assert.equal(cashProfile.attorneyLanes.seller_bond_cancellation.required, false)
  assert.equal(cashProfile.documentKeys.includes('proof_of_funds'), true)
  assert.equal(cashProfile.documentKeys.includes('payslips'), false)
  assert.equal(cashProfile.documentKeys.includes('bank_statements'), false)

  const bondProfile = documentRequestResolver.resolveDocumentRequestProfile({
    id: 'tx-bond',
    finance_type: 'bond',
    purchaser_type: 'individual',
  })
  assert.equal(bondProfile.workflowKey, 'finance_bond')
  assert.deepEqual(bondProfile.requiredAttorneyWorkflowKeys, ['attorney_transfer', 'attorney_bond'])
  assert.equal(bondProfile.attorneyLanes.attorney_transfer.required, true)
  assert.equal(bondProfile.attorneyLanes.attorney_bond.required, true)
  assert.equal(bondProfile.documentKeys.includes('payslips'), true)
  assert.equal(bondProfile.documentKeys.includes('bank_statements'), true)
  assert.equal(bondProfile.documentKeys.includes('proof_of_income'), true)
  assert.equal(bondProfile.documentKeys.includes('proof_of_funds'), false)

  const hybridProfile = documentRequestResolver.resolveDocumentRequestProfile({
    id: 'tx-hybrid',
    finance_type: 'hybrid',
    purchaser_type: 'individual',
  })
  assert.equal(hybridProfile.workflowKey, 'finance_hybrid')
  assert.deepEqual(hybridProfile.requiredAttorneyWorkflowKeys, ['attorney_transfer', 'attorney_bond'])
  assert.equal(hybridProfile.attorneyLanes.attorney_transfer.required, true)
  assert.equal(hybridProfile.attorneyLanes.attorney_bond.required, true)
  assert.equal(hybridProfile.documentKeys.includes('proof_of_funds_cash_component'), true)
  assert.equal(hybridProfile.documentKeys.includes('payslips'), true)
  assert.equal(hybridProfile.documentKeys.includes('bank_statements'), true)
  assert.equal(hybridProfile.documentKeys.includes('proof_of_income'), true)

  const client = buildMockClient({
    transactions: [{
      id: 'tx-1',
      finance_type: 'cash',
      current_main_stage: 'OTP',
      stage: 'OTP In Progress',
      onboarding_status: 'approved',
      seller_onboarding_status: 'approved',
      lifecycle_state: 'active',
      seller_has_existing_bond: false,
      updated_at: '2026-06-02T10:00:00.000Z',
      created_at: '2026-05-29T09:00:00.000Z',
    }],
  })

  let state = await workflowModel.ensureTransactionWorkflowInstances('tx-1', {
    client,
    transaction: client.state.transactions[0],
  })

  assert.equal(state.instances.some((row) => row.workflow_key === 'finance_cash'), true)
  assert.equal(state.instances.some((row) => row.workflow_key === 'finance_bond'), false)
  assert.equal(state.instances.some((row) => row.workflow_key === 'finance_hybrid'), false)
  assert.equal(state.instances.some((row) => row.workflow_key === 'finance_unknown'), false)

  const cashProofStep = (state.stepsByWorkflowKey.finance_cash || []).find((row) => row.step_key === 'proof_of_funds_received')
  await workflowModel.attachWorkflowEvidence(
    'tx-1',
    cashProofStep.id,
    {
      workflowKey: 'finance_cash',
      stepKey: 'proof_of_funds_received',
      evidenceType: 'document',
      evidenceId: 'doc-pof-1',
      evidenceStatus: 'accepted',
    },
    { client },
  )

  client.state.transactions[0].finance_type = 'bond'

  state = await workflowModel.ensureTransactionWorkflowInstances('tx-1', {
    client,
    transaction: client.state.transactions[0],
  })

  const instancesByKey = Object.fromEntries(state.instances.map((row) => [row.workflow_key, row]))
  assert.equal(instancesByKey.finance_cash?.status, 'skipped')
  assert.equal(Boolean(instancesByKey.finance_bond?.id), true)
  assert.equal(client.state.transaction_workflow_evidence.some((row) => row.evidence_id === 'doc-pof-1'), true)

  const workflowMap = workflowModel.buildWorkflowStateMap(state)
  const activeFinanceWorkflow = rollupRules.getActiveFinanceWorkflow(client.state.transactions[0], workflowMap)
  assert.equal(activeFinanceWorkflow.workflowKey, 'finance_bond')
  assert.equal(activeFinanceWorkflow.status, 'blocked')

  console.log('financeWorkflowResolver tests passed')
} finally {
  await server.close()
}
