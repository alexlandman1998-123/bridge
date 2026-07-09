import assert from 'node:assert/strict'

import {
  assertNoLegacyLifecycleFieldWrites,
  buildTransactionCompatibilityPayload,
  mapParentStageToDetailedStage,
  mapParentStageToLegacyStage,
  syncTransactionCompatibilityFields,
} from '../services/transactionStageCompatibilityService.js'

function buildMockClient(seed = {}) {
  const state = {
    transactions: seed.transactions || [],
    units: seed.units || [],
    transaction_workflow_events: seed.transaction_workflow_events || [],
  }

  class Query {
    constructor(table) {
      this.table = table
      this.filters = []
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

    maybeSingle() {
      this.single = true
      return this
    }

    update(payload) {
      this.action = 'update'
      this.payload = payload
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
      return filtered
    }

    async execute() {
      const rows = this._rows()

      if (this.action === 'select') {
        const filtered = this._filterRows(rows)
        return { data: this.single ? filtered[0] || null : filtered, error: null }
      }

      if (this.action === 'update') {
        const targets = this._filterRows(rows)
        for (const row of targets) {
          Object.assign(row, this.payload)
        }
        return { data: this.single ? targets[0] || null : targets, error: null }
      }

      if (this.action === 'insert') {
        const payloadRows = Array.isArray(this.payload) ? this.payload : [this.payload]
        const inserted = payloadRows.map((row, index) => ({
          id: row.id || `${this.table}-${rows.length + index + 1}`,
          ...row,
        }))
        rows.push(...inserted)
        return { data: this.single ? inserted[0] || null : inserted, error: null }
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

const payload = buildTransactionCompatibilityPayload(
  { id: 'tx-1', current_main_stage: 'OTP' },
  {
    parentStage: 'FINANCE',
    blockers: [],
    nextAction: {
      label: 'Upload bond approval',
    },
  },
  { now: '2026-06-02T10:00:00.000Z' },
)

assert.equal(payload.stage, 'Finance Pending')
assert.equal(payload.current_main_stage, 'FIN')
assert.equal(payload.current_sub_stage_summary, 'Upload bond approval')
assert.equal(payload.updated_at, '2026-06-02T10:00:00.000Z')
assert.equal(mapParentStageToLegacyStage('TRANSFER'), 'XFER')
assert.equal(mapParentStageToLegacyStage('REGISTRATION'), 'REG')
assert.equal(mapParentStageToLegacyStage('COMPLETE'), 'REG')
assert.equal(mapParentStageToLegacyStage('CANCELLED', 'FIN'), 'FIN')
assert.equal(mapParentStageToDetailedStage('SALES_OTP', 'Reserved'), 'Reserved')
assert.equal(mapParentStageToDetailedStage('TRANSFER', 'Transfer In Progress'), 'Transfer in Progress')

const blockedPayload = buildTransactionCompatibilityPayload(
  { id: 'tx-2', current_main_stage: 'FIN' },
  {
    parentStage: 'TRANSFER',
    blockers: [{ message: 'Guarantees are still missing.' }],
    nextAction: { label: 'Ignored because blocker comes first' },
  },
  { now: '2026-06-02T11:00:00.000Z' },
)

assert.equal(blockedPayload.stage, 'Transfer in Progress')
assert.equal(blockedPayload.current_main_stage, 'XFER')
assert.equal(blockedPayload.current_sub_stage_summary, 'Ignored because blocker comes first')

const client = buildMockClient({
  transactions: [{
    id: 'tx-3',
    unit_id: 'unit-3',
    current_main_stage: 'OTP',
    stage: 'OTP In Progress',
  }],
  units: [{ id: 'unit-3', status: 'OTP In Progress' }],
})

const syncPayload = await syncTransactionCompatibilityFields(
  'tx-3',
  {
    parentStage: 'REGISTRATION',
    blockers: [],
    nextAction: {
      label: 'Confirm registration evidence',
    },
  },
  {
    client,
    transaction: client.state.transactions[0],
    now: '2026-06-02T12:00:00.000Z',
  },
)

assert.equal(syncPayload.current_main_stage, 'REG')
assert.equal(syncPayload.stage, 'Transfer Lodged')
assert.equal(client.state.transactions[0].current_main_stage, 'REG')
assert.equal(client.state.transactions[0].stage, 'Transfer Lodged')
assert.equal(client.state.transactions[0].current_sub_stage_summary, 'Confirm registration evidence')
assert.equal(client.state.units[0].status, 'Transfer Lodged')
assert.equal(client.state.transaction_workflow_events.length, 1)
assert.equal(client.state.transaction_workflow_events[0].source, 'rollup_sync')
assert.equal(client.state.transaction_workflow_events[0].payload_json.previous_current_main_stage, 'OTP')
assert.equal(client.state.transaction_workflow_events[0].payload_json.new_current_main_stage, 'REG')

assert.throws(
  () =>
    assertNoLegacyLifecycleFieldWrites(
      { current_main_stage: 'FIN' },
      { source: 'test_guard' },
    ),
  /Legacy lifecycle fields must be derived via transactionStageCompatibilityService only/,
)

console.log('transactionStageCompatibilityService tests passed')
