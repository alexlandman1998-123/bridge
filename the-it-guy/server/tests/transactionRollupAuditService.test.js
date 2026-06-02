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
    transaction_rollup_audit: seed.transaction_rollup_audit || [],
  }

  class Query {
    constructor(table) {
      this.table = table
      this.filters = []
      this.orderBy = null
      this.limitValue = null
      this.single = false
      this.action = 'select'
      this.payload = null
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

    _rows() {
      return state[this.table] || []
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

    _nextId() {
      return `audit-${this._rows().length + 1}`
    }

    async execute() {
      const rows = this._rows()
      if (this.action === 'select') {
        const filtered = this._filterRows(rows)
        return { data: this.single ? filtered[0] || null : filtered, error: null }
      }

      if (this.action === 'insert') {
        const payloadRows = Array.isArray(this.payload) ? this.payload : [this.payload]
        const inserted = payloadRows.map((item) => ({
          id: item.id || this._nextId(),
          created_at: item.created_at || new Date().toISOString(),
          ...item,
        }))
        rows.push(...inserted)
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
  const auditService = await server.ssrLoadModule('/server/services/transactionRollupAuditService.js')

  const previousRollup = {
    parent_stage: 'SALES_OTP',
    parent_status: 'blocked',
    progress_percent: 20,
    active_workflow_key: 'sales_otp',
    active_step_key: 'signed_otp_received',
    blockers_json: [{ code: 'SIGNED_OTP_REQUIRED', workflowKey: 'sales_otp', stepKey: 'signed_otp_received' }],
    next_action_json: { label: 'Upload signed OTP', workflowKey: 'sales_otp', stepKey: 'signed_otp_received' },
    derived_from_json: {
      workflowSteps: ['sales_otp.signed_otp_received'],
    },
  }

  const nextRollup = {
    parent_stage: 'FINANCE',
    parent_status: 'active',
    progress_percent: 40,
    active_workflow_key: 'finance_bond',
    active_step_key: 'documents_received',
    blockers_json: [],
    next_action_json: { label: 'Submit bond documents', workflowKey: 'finance_bond', stepKey: 'documents_received' },
    derived_from_json: {
      workflowSteps: [
        'sales_otp.signed_otp_received',
        'sales_otp.buyer_onboarding_complete',
        'sales_otp.supporting_docs_complete',
        'sales_otp.ready_for_finance_handoff',
      ],
      documents: ['doc-signed-otp-1'],
    },
  }

  const client = buildMockClient()
  const created = await auditService.writeRollupAudit({
    transactionId: 'tx-1',
    previousRollup,
    newRollup: nextRollup,
    triggerType: 'workflow_action',
    triggerId: 'MOVE_TO_FINANCE',
    triggerSource: 'user_action',
    reasonCode: 'move_to_finance_completed',
    userId: 'user-1',
    client,
  })

  assert.equal(Boolean(created?.id), true)
  assert.equal(client.state.transaction_rollup_audit.length, 1)
  assert.equal(client.state.transaction_rollup_audit[0].previous_parent_stage, 'SALES_OTP')
  assert.equal(client.state.transaction_rollup_audit[0].new_parent_stage, 'FINANCE')
  assert.equal(client.state.transaction_rollup_audit[0].reason_code, 'move_to_finance_completed')
  assert.equal(client.state.transaction_rollup_audit[0].trigger_source, 'user_action')
  assert.deepEqual(client.state.transaction_rollup_audit[0].blockers_json, [])
  assert.deepEqual(
    client.state.transaction_rollup_audit[0].derived_from_json.changedFields.sort(),
    ['activeStepKey', 'activeWorkflowKey', 'blockers', 'nextAction', 'parentStage', 'parentStatus', 'progressPercent'].sort(),
  )

  const blockerOnly = await auditService.writeRollupAudit({
    transactionId: 'tx-1',
    previousRollup: nextRollup,
    newRollup: {
      ...nextRollup,
      blockers_json: [{ code: 'BOND_DOCUMENTS_REQUIRED', workflowKey: 'finance_bond', stepKey: 'documents_received' }],
      next_action_json: { label: 'Upload bond documents', workflowKey: 'finance_bond', stepKey: 'documents_received' },
    },
    triggerType: 'document',
    triggerId: 'doc-2',
    triggerSource: 'document_review',
    reasonCode: 'document_rejected',
    userId: 'user-2',
    client,
  })

  assert.equal(Boolean(blockerOnly?.id), true)
  assert.equal(client.state.transaction_rollup_audit.length, 2)
  assert.equal(client.state.transaction_rollup_audit[1].reason_code, 'document_rejected')
  assert.deepEqual(client.state.transaction_rollup_audit[1].derived_from_json.changedFields.sort(), ['blockers', 'nextAction'].sort())

  const noOp = await auditService.writeRollupAudit({
    transactionId: 'tx-1',
    previousRollup: nextRollup,
    newRollup: nextRollup,
    triggerType: 'workflow_action',
    triggerId: 'MOVE_TO_FINANCE',
    triggerSource: 'user_action',
    reasonCode: 'move_to_finance_completed',
    userId: 'user-1',
    client,
  })

  assert.equal(noOp, null)
  assert.equal(client.state.transaction_rollup_audit.length, 2)

  const history = await auditService.fetchTransactionRollupAudit('tx-1', {
    client,
    limit: 10,
  })
  assert.equal(history.length, 2)
  assert.equal(history[0].transaction_id, 'tx-1')

  console.log('transactionRollupAuditService tests passed')
} finally {
  await server.close()
}
