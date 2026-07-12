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
  const overrideService = await server.ssrLoadModule('/server/services/workflowOverrideService.js')

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

  for (const key of [
    'buyer_onboarding_complete',
    'seller_onboarding_complete',
    'signed_otp_received',
    'supporting_docs_complete',
  ]) {
    await workflowModel.updateWorkflowStepStatus('tx-1', 'sales_otp', key, 'complete', {
      client,
      transaction,
    })
  }

  await assert.rejects(
    overrideService.applyWorkflowOverride({
      transactionId: 'tx-1',
      workflowKey: 'sales_otp',
      stepKey: 'ready_for_finance_handoff',
      overrideType: 'force_complete',
      reason: '',
      userId: 'user-1',
      actorRole: 'principal',
      client,
    }),
    /reason is required/i,
  )

  await assert.rejects(
    overrideService.applyWorkflowOverride({
      transactionId: 'tx-1',
      workflowKey: 'sales_otp',
      stepKey: 'ready_for_finance_handoff',
      overrideType: 'force_complete',
      reason: 'Trying to bypass flow',
      userId: 'user-2',
      actorRole: 'buyer',
      client,
    }),
    /do not have permission/i,
  )

  const forced = await overrideService.applyWorkflowOverride({
    transactionId: 'tx-1',
    workflowKey: 'sales_otp',
    stepKey: 'ready_for_finance_handoff',
    overrideType: 'force_complete',
    reason: 'Principal confirmed the handoff can proceed.',
    userId: 'principal-1',
    actorRole: 'principal',
    payload: {
      supportingNote: 'OTP pack verified offline.',
      attachmentId: 'doc-offline-confirmation',
    },
    client,
  })

  assert.equal(forced.success, true)
  assert.equal(forced.nextStatus, 'complete')
  assert.equal(forced.rollup.parentStage, 'FINANCE')
  assert.equal(forced.compatibility.current_main_stage, 'FIN')
  assert.equal(client.state.transactions[0].current_main_stage, 'FIN')
  assert.equal(client.state.transaction_workflow_evidence.some((row) => row.evidence_type === 'manual_override'), true)
  assert.equal(client.state.transaction_workflow_events.some((row) => row.event_type === 'workflow_override_applied'), true)
  assert.equal(client.state.transaction_rollup_audit.length > 0, true)
  const forcedAudit = client.state.transaction_rollup_audit[client.state.transaction_rollup_audit.length - 1]
  assert.equal(forcedAudit.reason_code, 'manual_override_applied')
  assert.equal(forcedAudit.trigger_type, 'manual_override')
  assert.equal(forcedAudit.trigger_source, 'workflow_override')
  assert.equal(forcedAudit.derived_from_json?.auditMetadata?.overrideType, 'force_complete')
  assert.equal(forcedAudit.derived_from_json?.auditMetadata?.stepKey, 'ready_for_finance_handoff')
  assert.equal(forcedAudit.derived_from_json?.auditMetadata?.reason, 'Principal confirmed the handoff can proceed.')
  assert.equal(forcedAudit.derived_from_json?.forcedAudit, true)

  const reopened = await overrideService.applyWorkflowOverride({
    transactionId: 'tx-1',
    workflowKey: 'sales_otp',
    stepKey: 'ready_for_finance_handoff',
    overrideType: 'force_reopen',
    reason: 'Handoff paused pending final branch sign-off.',
    userId: 'admin-1',
    actorRole: 'developer',
    payload: {
      reopenTo: 'pending',
    },
    client,
  })

  assert.equal(reopened.success, true)
  assert.equal(reopened.nextStatus, 'pending')
  assert.equal(reopened.rollup.parentStage, 'SALES_OTP')
  assert.equal(reopened.compatibility.current_main_stage, 'OTP')
  assert.equal(client.state.transactions[0].current_main_stage, 'OTP')
  const reopenedAudit = client.state.transaction_rollup_audit[client.state.transaction_rollup_audit.length - 1]
  assert.equal(reopenedAudit.reason_code, 'step_reopened')
  assert.equal(reopenedAudit.derived_from_json?.auditMetadata?.overrideType, 'force_reopen')

  const waived = await overrideService.applyWorkflowOverride({
    transactionId: 'tx-1',
    workflowKey: 'sales_otp',
    stepKey: 'ready_for_finance_handoff',
    overrideType: 'force_waive',
    reason: 'Principal confirmed finance handoff is not required for this transaction.',
    userId: 'principal-1',
    actorRole: 'principal',
    payload: {
      attachmentId: 'doc-waiver-confirmation',
      attachmentType: 'waiver_confirmation',
    },
    client,
  })

  assert.equal(waived.success, true)
  assert.equal(waived.nextStatus, 'not_applicable')
  const waiverEvent = client.state.transaction_workflow_events.find((row) => row.payload_json?.overrideType === 'force_waive')
  assert.equal(waiverEvent?.payload_json?.overrideIntent, 'waiver_override')
  assert.equal(waiverEvent?.payload_json?.completionMode, 'waived')
  assert.equal(waiverEvent?.payload_json?.waiver, true)
  const waiverAudit = client.state.transaction_rollup_audit[client.state.transaction_rollup_audit.length - 1]
  assert.equal(waiverAudit.reason_code, 'step_waived')
  assert.equal(waiverAudit.derived_from_json?.auditMetadata?.overrideIntent, 'waiver_override')
  assert.equal(waiverAudit.derived_from_json?.auditMetadata?.completionMode, 'waived')
  assert.equal(waiverAudit.derived_from_json?.auditMetadata?.waiver, true)

  console.log('workflowOverrideService tests passed')
} finally {
  await server.close()
}
