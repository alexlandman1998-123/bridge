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
    transaction_rollups: seed.transaction_rollups || [],
    transaction_workflow_instances: seed.transaction_workflow_instances || [],
    transaction_workflow_steps: seed.transaction_workflow_steps || [],
    transaction_workflow_evidence: seed.transaction_workflow_evidence || [],
    transaction_workflow_events: seed.transaction_workflow_events || [],
    transaction_rollup_audit: seed.transaction_rollup_audit || [],
  }

  class Query {
    constructor(table) {
      this.table = table
      this.filters = []
      this.orderBy = null
      this.limitValue = null
      this.action = 'select'
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

    async execute() {
      if (this.action === 'select') {
        return { data: this._filterRows(this._rows()), error: null }
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
  const workflowEngineHealthService = await server.ssrLoadModule('/server/services/workflowEngineHealthService.js')

  const snapshot = await workflowEngineHealthService.getWorkflowEngineHealthSnapshot({
    client: buildMockClient({
      transactions: [
        { id: 'tx-1', updated_at: '2026-06-02T10:00:00.000Z' },
        { id: 'tx-2', updated_at: '2026-06-02T10:00:00.000Z' },
        { id: 'tx-3', updated_at: '2026-06-02T10:00:00.000Z' },
      ],
      transaction_rollups: [
        {
          transaction_id: 'tx-1',
          parent_status: 'active',
          blockers_json: [],
          is_stale: false,
          derived_at: new Date().toISOString(),
        },
        {
          transaction_id: 'tx-2',
          parent_status: 'blocked',
          blockers_json: [{ code: 'SIGNED_OTP_REQUIRED' }],
          is_stale: true,
          derived_at: '2026-05-01T10:00:00.000Z',
        },
      ],
      transaction_workflow_instances: [
        { transaction_id: 'tx-1', workflow_key: 'sales_otp' },
        { transaction_id: 'tx-2', workflow_key: 'sales_otp' },
      ],
      transaction_workflow_steps: [
        { transaction_id: 'tx-1', workflow_key: 'sales_otp', step_key: 'signed_otp_received' },
      ],
      transaction_workflow_evidence: [
        { transaction_id: 'tx-2', evidence_type: 'manual_override' },
      ],
      transaction_workflow_events: [
        { transaction_id: 'tx-1', event_type: 'workflow_recompute_completed', payload_json: { durationMs: 110 }, created_at: new Date().toISOString() },
        { transaction_id: 'tx-2', event_type: 'workflow_recompute_failed', payload_json: { durationMs: 250 }, created_at: new Date().toISOString() },
      ],
      transaction_rollup_audit: [
        { id: 'audit-1', created_at: new Date().toISOString() },
        { id: 'audit-2', created_at: new Date().toISOString() },
      ],
    }),
    staleThresholdMinutes: 30,
  })

  assert.equal(snapshot.totals.transactions, 3)
  assert.equal(snapshot.totals.rollups, 2)
  assert.equal(snapshot.totals.coveragePercent, 67)
  assert.equal(snapshot.totals.staleRollups, 1)
  assert.equal(snapshot.totals.blockedWorkflows, 1)
  assert.equal(snapshot.totals.recomputeFailures, 1)
  assert.equal(snapshot.totals.overrideCount, 1)
  assert.equal(snapshot.totals.auditVolume, 2)
  assert.equal(snapshot.totals.averageRecomputeTimeMs, 180)
  assert.equal(snapshot.totals.missingWorkflowInstances, 1)
  assert.equal(snapshot.totals.missingWorkflowSteps, 2)
  assert.deepEqual(snapshot.staleTransactions, ['tx-2'])

  console.log('workflowEngineHealthService tests passed')
} finally {
  await server.close()
}
