import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const server = await createServer({
  root: PROJECT_ROOT,
  logLevel: 'silent',
  server: { middlewareMode: true },
})

function createFakeClient(fixtures = {}) {
  const updates = []
  const inserts = []
  const tables = {
    transaction_attorney_assignments: fixtures.attorneyAssignments || [],
    transaction_bond_applications: fixtures.bondApplications || [],
    transactions: fixtures.transactions || [],
    transaction_events: [],
  }

  function makeQuery(table, operation = 'select', payload = null) {
    const state = { table, operation, payload, filters: [], selected: '' }
    const query = {
      select(columns = '') {
        state.selected = columns
        if (operation === 'insert') {
          inserts.push({ table, payload, selected: columns })
        }
        return query
      },
      update(values = {}) {
        return makeQuery(table, 'update', values)
      },
      insert(values = {}) {
        return makeQuery(table, 'insert', values)
      },
      eq(column, value) {
        state.filters.push({ type: 'eq', column, value })
        return query
      },
      in(column, values = []) {
        state.filters.push({ type: 'in', column, values })
        return query
      },
      limit() {
        if (operation === 'update') {
          updates.push({ table, payload, filters: state.filters })
          return Promise.resolve({ data: [{ id: state.filters.find((filter) => filter.column === 'id')?.value || 'updated' }], error: null })
        }
        if (operation === 'insert') {
          return Promise.resolve({ data: [{ id: `${table}-event` }], error: null })
        }
        const rows = [...(tables[table] || [])].filter((row) => state.filters.every((filter) => {
          if (filter.type === 'eq') return row[filter.column] === filter.value
          if (filter.type === 'in') return filter.values.includes(row[filter.column])
          return true
        }))
        return Promise.resolve({ data: rows, error: null })
      },
    }
    return query
  }

  return {
    updates,
    inserts,
    from(table) {
      return makeQuery(table)
    },
  }
}

try {
  const {
    applyPartnerPersonRoutingRemediation,
    buildPartnerPersonRoutingRemediationPlanFromSources,
  } = await server.ssrLoadModule('/src/services/partnerPersonRoutingDiagnosticsService.js')

  const sources = {
    attorneyAssignments: [
      {
        id: 'att-awaiting',
        transaction_id: 'tx-att-awaiting',
        attorney_firm_id: 'firm-1',
        allocation_state: 'awaiting_staff_assignment',
        firm_acceptance_status: 'accepted',
        updated_at: '2026-07-20T08:00:00.000Z',
      },
    ],
    bondApplications: [
      {
        id: 'bond-needs-app-sync',
        transaction_id: 'tx-app-sync',
        assigned_organisation_id: 'bond-org-1',
        assignment_status: 'organisation_queue',
        updated_at: '2026-07-25T08:00:00.000Z',
      },
      {
        id: 'bond-needs-tx-sync',
        transaction_id: 'tx-tx-sync',
        assigned_organisation_id: 'bond-org-1',
        assigned_user_id: 'consultant-from-app',
        assignment_status: 'consultant_assigned',
        updated_at: '2026-07-25T08:00:00.000Z',
      },
      {
        id: 'bond-mismatch',
        transaction_id: 'tx-mismatch',
        assigned_organisation_id: 'bond-org-1',
        assigned_user_id: 'consultant-app',
        assignment_status: 'consultant_assigned',
        updated_at: '2026-07-25T08:00:00.000Z',
      },
    ],
    transactions: [
      {
        id: 'tx-app-sync',
        bond_workspace_id: 'bond-org-1',
        bond_region_id: 'region-1',
        bond_workspace_unit_id: 'branch-1',
        primary_bond_consultant_user_id: 'consultant-from-tx',
      },
      {
        id: 'tx-tx-sync',
        bond_workspace_id: 'bond-org-1',
      },
      {
        id: 'tx-mismatch',
        bond_workspace_id: 'bond-org-1',
        primary_bond_consultant_user_id: 'consultant-tx',
      },
    ],
  }

  const plan = buildPartnerPersonRoutingRemediationPlanFromSources(sources, {
    now: '2026-07-26T08:00:00.000Z',
    staleAfterDays: 2,
  })

  assert.equal(plan.remediation.summary.automatic, 2)
  assert.equal(plan.remediation.summary.manualReview, 2)
  assert.equal(plan.remediation.summary.needsPerson, 1)
  assert.equal(plan.remediation.summary.reviewRequired, 1)
  assert(plan.remediation.automaticActions.some((action) => action.code === 'sync_bond_application_from_transaction'))
  assert(plan.remediation.automaticActions.some((action) => action.code === 'sync_bond_transaction_from_application'))

  const client = createFakeClient(sources)
  const result = await applyPartnerPersonRoutingRemediation({
    workspaceId: 'bond-org-1',
    dryRun: false,
    actorUserId: 'manager-1',
    client,
  })

  assert.equal(result.summary.planned, 2)
  assert.equal(result.summary.applied, 2)
  assert.equal(result.summary.skipped, 0)
  assert.equal(result.summary.failed, 0)
  assert.equal(client.updates.length, 2)
  assert(client.updates.some((update) => update.table === 'transaction_bond_applications' && update.payload.assigned_user_id === 'consultant-from-tx'))
  assert(client.updates.some((update) => update.table === 'transactions' && update.payload.primary_bond_consultant_user_id === 'consultant-from-app'))
  assert(client.inserts.some((insert) => insert.table === 'transaction_events'), 'should record a best-effort remediation timeline event')

  console.log('phase6 partner-person routing remediation tests passed')
} finally {
  await server.close()
}
