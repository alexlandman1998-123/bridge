import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createServer } from 'vite'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))

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

assert.equal(
  packageJson.scripts?.['test:legal-suspensive-condition-gates'],
  'node scripts/suspensive-condition-workflow-gates-phase6.test.mjs',
  'package.json should expose the Phase 6 suspensive-condition gate contract.',
)

const server = await createServer({
  root: process.cwd(),
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const conditionGates = await server.ssrLoadModule('/server/workflows/suspensiveConditionWorkflowGates.js')
  const transactionGates = await server.ssrLoadModule('/server/workflows/transactionWorkflowGates.js')
  const workflowModel = await server.ssrLoadModule('/server/services/transactionWorkflowModelService.js')
  const actionService = await server.ssrLoadModule('/server/services/workflowActionService.js')

  const {
    SUSPENSIVE_CONDITION_GATE_KEYS,
    extractSuspensiveConditions,
    evaluateSuspensiveConditionWorkflowGates,
    buildSuspensiveConditionWorkflowBlockers,
    areSuspensiveConditionWorkflowGatesSatisfied,
  } = conditionGates

  const now = '2026-07-11T10:00:00.000Z'
  const pendingSubjectToSale = {
    id: 'tx-subject-sale',
    conditionsJson: {
      subjectToSale: true,
      subjectSaleDeadline: '2026-07-31',
    },
  }

  const extracted = extractSuspensiveConditions(pendingSubjectToSale)
  assert.equal(extracted.length, 1)
  assert.equal(extracted[0].type, 'subject_to_sale')

  const pendingEvaluation = evaluateSuspensiveConditionWorkflowGates(pendingSubjectToSale, { now })
  assert.equal(pendingEvaluation.gates[SUSPENSIVE_CONDITION_GATE_KEYS.deadlinesCurrent].ready, true)
  assert.equal(pendingEvaluation.gates[SUSPENSIVE_CONDITION_GATE_KEYS.resolutionsReady].ready, false)
  assert.equal(
    pendingEvaluation.gates[SUSPENSIVE_CONDITION_GATE_KEYS.resolutionsReady].blockers[0].code,
    'SUSPENSIVE_CONDITION_RESOLUTION_REQUIRED',
  )

  assert.equal(
    areSuspensiveConditionWorkflowGatesSatisfied(pendingSubjectToSale, SUSPENSIVE_CONDITION_GATE_KEYS.deadlinesCurrent, { now }),
    true,
  )
  assert.equal(
    areSuspensiveConditionWorkflowGatesSatisfied(pendingSubjectToSale, SUSPENSIVE_CONDITION_GATE_KEYS.resolutionsReady, { now }),
    false,
  )
  assert.equal(
    transactionGates.isWorkflowGateSatisfied(SUSPENSIVE_CONDITION_GATE_KEYS.resolutionsReady, { transaction: pendingSubjectToSale, now }),
    false,
  )
  assert.equal(
    transactionGates.isWorkflowGateSatisfied('transfer_ready', {
      transaction: pendingSubjectToSale,
      parentStage: 'REGISTRATION',
      now,
    }),
    false,
    'transfer_ready should not report satisfied while an active condition remains unresolved',
  )

  const missingDeadlineBlockers = buildSuspensiveConditionWorkflowBlockers({
    conditionsJson: { subjectToSale: true },
  }, {
    targetParentStage: 'FINANCE',
    now,
  })
  assert.equal(missingDeadlineBlockers.some((blocker) => blocker.code === 'SUSPENSIVE_CONDITION_DEADLINE_REQUIRED'), true)

  const extended = evaluateSuspensiveConditionWorkflowGates({
    conditions_json: {
      conditions: [{
        type: 'subject_to_sale',
        deadline: '2026-06-20',
        extended_deadline: '2026-07-31',
        extension_document_id: 'doc-extension-1',
      }],
    },
  }, { now })
  assert.equal(extended.gates[SUSPENSIVE_CONDITION_GATE_KEYS.deadlinesCurrent].ready, true)
  assert.equal(extended.gates[SUSPENSIVE_CONDITION_GATE_KEYS.resolutionsReady].ready, false)

  const expiredWithoutExtension = buildSuspensiveConditionWorkflowBlockers({
    conditions_json: {
      conditions: [{ type: 'subject_to_inspection', deadline: '2026-06-20' }],
    },
  }, {
    targetParentStage: 'TRANSFER',
    now,
  })
  assert.equal(expiredWithoutExtension.some((blocker) => blocker.code === 'SUSPENSIVE_CONDITION_DEADLINE_EXPIRED'), true)

  const waived = evaluateSuspensiveConditionWorkflowGates({
    conditions_json: {
      conditions: [{
        type: 'subject_to_sale',
        deadline: '2026-06-20',
        status: 'waived',
        waiver_reason: 'Purchaser waived the condition in writing.',
      }],
    },
  }, { now })
  assert.equal(waived.gates[SUSPENSIVE_CONDITION_GATE_KEYS.deadlinesCurrent].ready, true)
  assert.equal(waived.gates[SUSPENSIVE_CONDITION_GATE_KEYS.resolutionsReady].ready, true)

  assert.equal(
    transactionGates.getTransactionWorkflowGate('finance_ready').requiredEvidence.includes(SUSPENSIVE_CONDITION_GATE_KEYS.deadlinesCurrent),
    true,
  )
  assert.equal(
    transactionGates.getTransactionWorkflowGate('transfer_ready').requiredEvidence.includes(SUSPENSIVE_CONDITION_GATE_KEYS.resolutionsReady),
    true,
  )

  const transaction = {
    id: 'tx-condition-action',
    unit_id: 'unit-condition-action',
    finance_type: 'cash',
    current_main_stage: 'OTP',
    stage: 'OTP In Progress',
    onboarding_status: 'approved',
    seller_onboarding_status: 'approved',
    lifecycle_state: 'active',
    seller_has_existing_bond: false,
    title_deed_number: '',
    registration_confirmation_document_id: '',
    conditionsJson: {
      subjectToSale: true,
      subjectSaleDeadline: '2026-07-31',
    },
    updated_at: '2026-07-11T09:00:00.000Z',
    created_at: '2026-07-10T09:00:00.000Z',
  }
  const client = buildMockClient({
    transactions: [transaction],
    units: [{ id: 'unit-condition-action', status: 'OTP In Progress' }],
  })

  await workflowModel.ensureTransactionWorkflowInstances('tx-condition-action', { client, transaction })
  for (const key of [
    'buyer_onboarding_complete',
    'seller_onboarding_complete',
    'signed_otp_received',
    'supporting_docs_complete',
  ]) {
    await workflowModel.updateWorkflowStepStatus('tx-condition-action', 'sales_otp', key, 'complete', { client, transaction })
  }

  const financeMove = await actionService.runWorkflowAction({
    transactionId: 'tx-condition-action',
    actionKey: 'MOVE_TO_FINANCE',
    userId: 'agent-1',
    actorRole: 'agent',
    payload: { source: 'phase6-test', occurredAt: now },
    client,
  })
  assert.equal(financeMove.allowed, true, 'future-dated unresolved condition should not block finance tracking')

  const unresolvedTransfer = await actionService.runWorkflowAction({
    transactionId: 'tx-condition-action',
    actionKey: 'MOVE_TO_TRANSFER',
    userId: 'agent-1',
    actorRole: 'agent',
    payload: { source: 'phase6-test', occurredAt: now },
    client,
  })
  assert.equal(unresolvedTransfer.allowed, false)
  assert.equal(
    unresolvedTransfer.blockers.some((blocker) => blocker.code === 'SUSPENSIVE_CONDITION_RESOLUTION_REQUIRED'),
    true,
  )
  assert.equal(client.state.transactions[0].current_main_stage, 'FIN')

  client.state.transactions[0].conditionsJson.subjectSaleFulfilledAt = '2026-07-12T08:00:00.000Z'
  client.state.transactions[0].conditionsJson.subjectSaleEvidenceId = 'linked-sale-otp-1'
  for (const key of ['proof_of_funds_received', 'proof_of_funds_reviewed', 'cash_confirmation_approved']) {
    await workflowModel.updateWorkflowStepStatus('tx-condition-action', 'finance_cash', key, 'complete', { client, transaction: client.state.transactions[0] })
  }

  const resolvedTransfer = await actionService.runWorkflowAction({
    transactionId: 'tx-condition-action',
    actionKey: 'MOVE_TO_TRANSFER',
    userId: 'agent-1',
    actorRole: 'agent',
    payload: { source: 'phase6-test', occurredAt: now },
    client,
  })
  assert.equal(resolvedTransfer.allowed, true)
  assert.equal(resolvedTransfer.rollup.parentStage, 'TRANSFER')

  console.log('suspensive-condition workflow gates Phase 6 tests passed')
} finally {
  await server.close()
}
