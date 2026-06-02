/* global process */
import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({
  root: process.cwd(),
  logLevel: 'silent',
  server: { middlewareMode: true },
})

function buildMockClient(seed = {}, options = {}) {
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

    order(field, opts = {}) {
      this.orderBy = { field, ascending: opts.ascending !== false }
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

    upsert(payload, opts = {}) {
      this.action = 'upsert'
      this.payload = payload
      this.onConflict = opts.onConflict || ''
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
      if (
        options.fail &&
        options.fail.table === this.table &&
        options.fail.action === this.action
      ) {
        return {
          data: null,
          error: new Error(options.fail.message || `Mock ${this.table}.${this.action} failure`),
        }
      }

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
  const workflowModel = await server.ssrLoadModule('/server/services/transactionWorkflowModelService.js')
  const recomputeService = await server.ssrLoadModule('/server/services/workflowRecomputeService.js')

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
    transactions: [{ ...transaction }],
    units: [{ id: 'unit-1', status: 'OTP In Progress' }],
  })

  await workflowModel.ensureTransactionWorkflowInstances('tx-1', {
    client,
    transaction,
  })

  for (const key of [
    'buyer_onboarding_complete',
    'seller_onboarding_complete',
    'signed_otp_received',
    'supporting_docs_complete',
    'ready_for_finance_handoff',
  ]) {
    await workflowModel.updateWorkflowStepStatus('tx-1', 'sales_otp', key, 'complete', {
      client,
      transaction,
    })
  }

  const first = await recomputeService.publishWorkflowChanged({
    transactionId: 'tx-1',
    triggerType: 'workflow_action',
    triggerId: 'MOVE_TO_FINANCE',
    reasonCode: 'workflow_action_completed',
    userId: 'user-1',
    source: 'test',
    client,
  })

  assert.equal(first.rollup.parentStage, 'FINANCE')
  assert.equal(first.compatibility.current_main_stage, 'FIN')
  assert.equal(client.state.transaction_rollups[0].parent_stage, 'FINANCE')
  assert.equal(client.state.transactions[0].current_main_stage, 'FIN')
  assert.equal(client.state.transaction_rollup_audit.length, 1)
  assert.equal(client.state.transaction_rollup_audit[0].previous_parent_stage, null)
  assert.equal(client.state.transaction_rollup_audit[0].new_parent_stage, 'FINANCE')
  assert.equal(client.state.transaction_rollup_audit[0].previous_progress_percent, 0)
  assert.equal(client.state.transaction_rollup_audit[0].new_progress_percent > 0, true)
  assert.equal(client.state.transaction_rollup_audit[0].trigger_source, 'test')
  assert.equal(
    Array.isArray(client.state.transaction_rollup_audit[0].derived_from_json?.changedFields),
    true,
  )
  assert.equal(
    client.state.transaction_workflow_events.some((row) => row.event_type === 'transaction.workflow.changed'),
    true,
  )
  assert.equal(
    client.state.transaction_workflow_events.some((row) => row.event_type === 'workflow_recompute_completed'),
    true,
  )

  const second = await recomputeService.publishWorkflowChanged({
    transactionId: 'tx-1',
    triggerType: 'workflow_action',
    triggerId: 'MOVE_TO_FINANCE',
    reasonCode: 'workflow_action_completed',
    userId: 'user-1',
    source: 'test',
    client,
  })

  assert.equal(second.noOp, true)
  assert.equal(client.state.transaction_rollup_audit.length, 1)
  assert.equal(
    client.state.transaction_workflow_events.some((row) => row.event_type === 'workflow_recompute_noop'),
    true,
  )

  const failingClient = buildMockClient(
    {
      transactions: [{ ...transaction, id: 'tx-err', unit_id: 'unit-err' }],
      units: [{ id: 'unit-err', status: 'OTP In Progress' }],
    },
    {
      fail: {
        table: 'transaction_workflow_instances',
        action: 'select',
        message: 'workflow instances unavailable',
      },
    },
  )

  await assert.rejects(
    recomputeService.publishWorkflowChanged({
      transactionId: 'tx-err',
      triggerType: 'event',
      triggerId: 'evt-1',
      reasonCode: 'transaction_event_registration_confirmed',
      userId: 'user-2',
      source: 'test',
      client: failingClient,
    }),
    /workflow instances unavailable/,
  )

  assert.equal(failingClient.state.transaction_rollups[0].transaction_id, 'tx-err')
  assert.equal(failingClient.state.transaction_rollups[0].is_stale, true)
  assert.equal(
    String(failingClient.state.transaction_rollups[0].last_error || '').includes('workflow instances unavailable'),
    true,
  )
  assert.equal(Boolean(failingClient.state.transaction_rollups[0].last_recompute_attempt_at), true)
  assert.equal(
    failingClient.state.transaction_workflow_events.some((row) => row.event_type === 'workflow_recompute_failed'),
    true,
  )

  console.log('workflowRecomputeService tests passed')
} finally {
  await server.close()
}
