/* global process */
import assert from 'node:assert/strict'
import { createServer } from 'vite'

process.env.VITE_SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://example.supabase.co'
process.env.VITE_SUPABASE_ANON_KEY =
  process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.signature'

function buildMockClient(seed = {}) {
  const state = {
    profiles: seed.profiles || [],
    transactions: seed.transactions || [],
    units: seed.units || [],
    transaction_events: [],
    documents: [],
    checklist_items: [],
    document_requests: [],
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
      this.limitValue = null
      this.rangeValue = null
      this.wantsSingle = false
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
      this.wantsSingle = true
      return this
    }

    single() {
      this.wantsSingle = true
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
      if (!state[this.table]) {
        state[this.table] = []
      }
      return state[this.table]
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
        return { data: this.wantsSingle ? filtered[0] || null : filtered, error: null }
      }

      if (this.action === 'insert' || this.action === 'upsert') {
        const inserted = this._upsertRows(rows)
        return { data: this.wantsSingle ? inserted[0] || null : inserted, error: null }
      }

      if (this.action === 'update') {
        const updated = this._applyUpdate(rows)
        return { data: this.wantsSingle ? updated[0] || null : updated, error: null }
      }

      return { data: [], error: null }
    }

    then(resolve, reject) {
      return this.execute().then(resolve, reject)
    }
  }

  return {
    state,
    auth: {
      async getSession() {
        return {
          data: {
            session: {
              user: {
                id: seed.sessionUserId || 'user-1',
              },
            },
          },
          error: null,
        }
      },
    },
    from(table) {
      return new Query(table)
    },
  }
}

const server = await createServer({
  root: process.cwd(),
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const api = await server.ssrLoadModule('/src/lib/api.js')
  const workflowModel = await server.ssrLoadModule('/server/services/transactionWorkflowModelService.js')
  const supabaseClientModule = await server.ssrLoadModule('/src/lib/supabaseClient.js')

  const client = buildMockClient({
    sessionUserId: 'user-1',
    profiles: [{
      id: 'user-1',
      role: 'developer',
      firm_id: null,
      firm_role: null,
    }],
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
    ],
    units: [
      { id: 'unit-1', status: 'OTP In Progress' },
      { id: 'unit-2', status: 'OTP In Progress' },
    ],
  })

  supabaseClientModule.supabase.from = client.from.bind(client)
  supabaseClientModule.supabase.auth = client.auth

  await workflowModel.ensureTransactionWorkflowInstances('tx-1', {
    client,
    transaction: client.state.transactions[0],
  })
  await workflowModel.ensureTransactionWorkflowInstances('tx-2', {
    client,
    transaction: client.state.transactions[1],
  })

  let blockedError = null
  try {
    await api.updateTransactionMainStage({
      transactionId: 'tx-1',
      mainStage: 'FIN',
      actorRole: 'developer',
    })
  } catch (error) {
    blockedError = error
  }

  assert.ok(blockedError)
  assert.equal(Array.isArray(blockedError.blockers), true)
  assert.equal(client.state.transactions[0].current_main_stage, 'OTP')
  assert.equal(client.state.transaction_events.length, 0)

  for (const stepKey of [
    'buyer_onboarding_complete',
    'seller_onboarding_complete',
    'signed_otp_received',
    'supporting_docs_complete',
  ]) {
    await workflowModel.updateWorkflowStepStatus('tx-1', 'sales_otp', stepKey, 'complete', {
      client,
      transaction: client.state.transactions[0],
    })
  }

  const financeResult = await api.updateTransactionMainStage({
    transactionId: 'tx-1',
    mainStage: 'FIN',
    note: 'OTP workflow completed',
    actorRole: 'developer',
  })

  assert.equal(financeResult.rollup.parentStage, 'FINANCE')
  assert.equal(financeResult.nextMainStage, 'FIN')
  assert.equal(financeResult.nextStage, 'FIN')
  assert.match(String(financeResult.warning || ''), /compatibility mode/i)
  assert.equal(client.state.transactions[0].current_main_stage, 'FIN')
  assert.equal(client.state.units[0].status, 'FIN')

  const stageChangeEvents = client.state.transaction_events.filter((item) => item.event_type === 'TransactionStageChanged')
  assert.equal(stageChangeEvents.length > 0, true)
  assert.equal(stageChangeEvents.some((item) => item.event_data?.translatedAction === 'MOVE_TO_FINANCE'), true)
  assert.equal(stageChangeEvents.some((item) => item.event_data?.source === 'manual_stage_update'), false)

  const cancelledResult = await api.updateTransactionMainStage({
    transactionId: 'tx-2',
    mainStage: 'CANCELLED',
    note: 'Buyer withdrew',
    actorRole: 'developer',
  })

  assert.equal(cancelledResult.rollup.parentStage, 'CANCELLED')
  assert.equal(client.state.transactions[1].cancelled_reason, 'Buyer withdrew')
  assert.equal(
    client.state.transaction_events.some((item) => item.event_data?.translatedAction === 'CANCEL_TRANSACTION'),
    true,
  )

  await assert.rejects(
    () => api.updateTransactionMainStage({
      transactionId: 'tx-1',
      mainStage: 'OTP',
      actorRole: 'developer',
    }),
    /Unsupported legacy stage: OTP/,
  )

  console.log('legacyStageApiCompatibility tests passed')
} finally {
  await server.close()
}
