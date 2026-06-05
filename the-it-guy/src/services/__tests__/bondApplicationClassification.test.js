import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')

const server = await createServer({
  root: PROJECT_ROOT,
  logLevel: 'silent',
  server: { middlewareMode: true },
})

const MISSING_CANONICAL_WORKFLOW_TABLES = new Set([
  'transaction_workflow_instances',
  'transaction_workflow_steps',
  'transaction_workflow_evidence',
  'transaction_workflow_events',
  'transaction_rollups',
])

function createMissingTableError(table) {
  return { code: '42P01', message: `relation "${table}" does not exist` }
}

function buildMockClient(seed = {}) {
  const state = {
    profiles: [{ id: 'user-bond-1', role: 'bond_originator', firm_id: null, firm_role: null }],
    transactions: [{
      id: 'tx-bond-1',
      finance_type: 'bond',
      finance_status: 'Documents Received',
      updated_at: '2026-06-04T08:00:00.000Z',
      ...(seed.transaction || {}),
    }],
    transaction_finance_workflows: [{
      id: 'workflow-bond-1',
      transaction_id: 'tx-bond-1',
      workflow_type: 'bond_hybrid',
      current_stage: 'documents_received',
      status: 'active',
      last_updated_by: 'user-bond-1',
      last_updated_at: '2026-06-04T08:00:00.000Z',
      created_at: '2026-06-04T08:00:00.000Z',
      updated_at: '2026-06-04T08:00:00.000Z',
    }],
    transaction_bond_applications: [],
    transaction_bond_quotes: [],
    transaction_finance_workflow_events: [],
    transaction_bond_offer_decisions: [],
    transaction_bond_instructions: [],
    transaction_lifecycle_workflows: [],
    transaction_comments: [],
    transaction_events: [],
    transaction_participants: [],
    transaction_role_players: [],
    transaction_notifications: [],
    ...seed.state,
  }
  const calls = []

  class Query {
    constructor(table) {
      this.table = table
      this.action = 'select'
      this.payload = null
      this.filters = []
      this.orderBy = null
      this.limitValue = null
      this.singleMode = false
      this.onConflict = ''
    }

    select() {
      return this
    }

    insert(payload) {
      this.action = 'insert'
      this.payload = payload
      return this
    }

    update(payload) {
      this.action = 'update'
      this.payload = payload
      return this
    }

    upsert(payload, options = {}) {
      this.action = 'upsert'
      this.payload = payload
      this.onConflict = options.onConflict || ''
      return this
    }

    eq(field, value) {
      this.filters.push((row) => row?.[field] === value)
      return this
    }

    in(field, values = []) {
      const set = new Set(values)
      this.filters.push((row) => set.has(row?.[field]))
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
      this.singleMode = true
      return this
    }

    single() {
      this.singleMode = true
      return this
    }

    _rows() {
      if (!state[this.table]) state[this.table] = []
      return state[this.table]
    }

    _nextId() {
      return `${this.table}-${this._rows().length + 1}`
    }

    _filterRows(rows) {
      let next = [...rows]
      for (const filter of this.filters) {
        next = next.filter(filter)
      }
      if (this.orderBy) {
        const { field, ascending } = this.orderBy
        next.sort((left, right) => {
          const a = left?.[field] || ''
          const b = right?.[field] || ''
          if (a === b) return 0
          return ascending ? (a < b ? -1 : 1) : (a > b ? -1 : 1)
        })
      }
      if (Number.isFinite(this.limitValue)) {
        next = next.slice(0, this.limitValue)
      }
      return next
    }

    _conflictKeys() {
      return String(this.onConflict || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    }

    _insertRows(rows) {
      const payloadRows = Array.isArray(this.payload) ? this.payload : [this.payload]
      return payloadRows.map((incoming) => {
        const row = { ...incoming }
        if (!row.id) row.id = this._nextId()
        rows.push(row)
        return row
      })
    }

    _upsertRows(rows) {
      const payloadRows = Array.isArray(this.payload) ? this.payload : [this.payload]
      const conflictKeys = this._conflictKeys()
      return payloadRows.map((incoming) => {
        const row = { ...incoming }
        const existingIndex = conflictKeys.length
          ? rows.findIndex((candidate) => conflictKeys.every((key) => candidate?.[key] === row?.[key]))
          : row.id
            ? rows.findIndex((candidate) => candidate?.id === row.id)
            : -1
        if (existingIndex >= 0) {
          rows[existingIndex] = { ...rows[existingIndex], ...row }
          return rows[existingIndex]
        }
        if (!row.id) row.id = this._nextId()
        rows.push(row)
        return row
      })
    }

    async execute() {
      calls.push({ table: this.table, action: this.action, payload: this.payload })

      if (MISSING_CANONICAL_WORKFLOW_TABLES.has(this.table)) {
        return { data: this.singleMode ? null : [], error: createMissingTableError(this.table) }
      }

      const rows = this._rows()
      if (this.action === 'select') {
        const data = this._filterRows(rows)
        return { data: this.singleMode ? data[0] || null : data, error: null }
      }
      if (this.action === 'insert') {
        const data = this._insertRows(rows)
        return { data: this.singleMode ? data[0] || null : data, error: null }
      }
      if (this.action === 'upsert') {
        const data = this._upsertRows(rows)
        return { data: this.singleMode ? data[0] || null : data, error: null }
      }
      if (this.action === 'update') {
        const data = this._filterRows(rows)
        data.forEach((row) => Object.assign(row, this.payload))
        return { data: this.singleMode ? data[0] || null : data, error: null }
      }
      return { data: this.singleMode ? null : [], error: null }
    }

    then(resolve, reject) {
      return this.execute().then(resolve, reject)
    }
  }

  return {
    state,
    calls,
    auth: {
      async getSession() {
        return { data: { session: { user: { id: 'user-bond-1' } } }, error: null }
      },
    },
    from(table) {
      return new Query(table)
    },
  }
}

try {
  const api = await server.ssrLoadModule('/src/lib/api.js')
  const queueService = await server.ssrLoadModule('/src/services/bondOperationalQueueService.js')
  const { addBondApplication, __transactionBondApplicationClassificationTestUtils } = api
  const { getBondOriginatorQueueState, getNewApplicationsQueue, isBondApplicationTrackerRow } = queueService
  const client = buildMockClient()

  const intake = await __transactionBondApplicationClassificationTestUtils.ensureBondApplicationWorkspaceRecord(client, {
    transactionId: 'tx-bond-1',
    buyerId: 'buyer-1',
    selection: {
      roleType: 'bond_originator',
      partnerOrganisationId: 'bond-org-1',
      workspaceUnitId: 'branch-1',
      branchId: 'branch-1',
      userId: 'user-bond-1',
    },
    actorProfile: { userId: 'agent-1', role: 'agent' },
  })

  assert.equal(intake.application_type, 'originator_intake')
  assert.equal(intake.bank_name, 'Bond Originator Intake')

  const workflow = await addBondApplication(
    'tx-bond-1',
    {
      bankName: 'FNB',
      status: 'submitted',
      referenceNumber: 'FNB-001',
    },
    { client, actorRole: 'bond_originator' },
  )

  const applications = client.state.transaction_bond_applications
  const originatorRows = applications.filter((row) => row.application_type === 'originator_intake')
  const bankRows = applications.filter((row) => row.application_type === 'bank_application')
  assert.equal(originatorRows.length, 1)
  assert.equal(bankRows.length, 1)
  assert.equal(bankRows[0].bank_name, 'FNB')
  assert.equal(bankRows[0].transaction_id, originatorRows[0].transaction_id)
  assert.equal(client.state.transaction_finance_workflows[0].current_stage, 'applications_submitted')
  assert.equal(workflow.workflow.currentStage, 'applications_submitted')
  assert.equal(workflow.applications.some((row) => row.applicationType === 'bank_application' && row.bankName === 'FNB'), true)

  const originatorQueueRows = getNewApplicationsQueue([{
    transaction: {
      id: 'tx-bond-1',
      finance_type: 'bond',
      bond_workspace_id: 'bond-org-1',
      onboarding_completed_at: '2026-06-04T08:05:00.000Z',
      otp_status: 'fully_signed',
    },
    onboardingFormData: {
      form_data: {
        bond_application: {
          status: 'Submitted',
          submitted_at: '2026-06-04T08:10:00.000Z',
        },
      },
    },
    documentRequests: [{ id: 'req-bank', category: 'finance', title: 'Bank statement', status: 'requested' }],
    documents: [{ document_request_id: 'req-bank', status: 'uploaded', uploaded_at: '2026-06-04T08:15:00.000Z' }],
    bondApplications: applications,
    primaryBondApplication: originatorRows[0],
  }])
  assert.equal(originatorQueueRows.length, 0, 'ready for review file is no longer in Pipeline')
  const trackerInput = {
    transaction: {
      id: 'tx-bond-1',
      finance_type: 'bond',
      bond_workspace_id: 'bond-org-1',
      onboarding_completed_at: '2026-06-04T08:05:00.000Z',
      otp_status: 'fully_signed',
    },
    onboardingFormData: {
      form_data: {
        bond_application: {
          status: 'Submitted',
          submitted_at: '2026-06-04T08:10:00.000Z',
        },
      },
    },
    documentRequests: [{ id: 'req-bank', category: 'finance', title: 'Bank statement', status: 'requested' }],
    documents: [{ document_request_id: 'req-bank', status: 'uploaded', uploaded_at: '2026-06-04T08:15:00.000Z' }],
    bondApplications: applications,
    primaryBondApplication: originatorRows[0],
  }
  assert.equal(isBondApplicationTrackerRow(trackerInput), true)
  assert.equal(getBondOriginatorQueueState(trackerInput).status, 'READY_FOR_REVIEW')

  console.log('bondApplicationClassification tests passed')
} finally {
  await server.close()
}
