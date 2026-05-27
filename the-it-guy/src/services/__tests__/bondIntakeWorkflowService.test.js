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

function submittedOnboarding() {
  return {
    form_data: {
      bond_application: {
        started_at: '2026-05-02T10:00:00.000Z',
        submitted_at: '2026-05-03T10:00:00.000Z',
      },
    },
  }
}

function makeReadyRow(overrides = {}) {
  return {
    transaction: {
      id: 'tx-ready',
      finance_type: 'bond',
      buyer_name: 'Buyer Ready',
      ...overrides.transaction,
    },
    onboardingFormData: Object.prototype.hasOwnProperty.call(overrides, 'onboardingFormData') ? overrides.onboardingFormData : submittedOnboarding(),
    documentRequests: Object.prototype.hasOwnProperty.call(overrides, 'documentRequests') ? overrides.documentRequests : [
      { id: 'req-id', category: 'bond', title: 'ID document', status: 'uploaded' },
      { id: 'req-bank', category: 'finance', title: 'Bank statement', status: 'requested' },
    ],
    documents: Object.prototype.hasOwnProperty.call(overrides, 'documents') ? overrides.documents : [
      { document_request_id: 'req-bank', status: 'uploaded', uploaded_at: '2026-05-03T11:00:00.000Z' },
    ],
    rolePlayers: Object.prototype.hasOwnProperty.call(overrides, 'rolePlayers') ? overrides.rolePlayers : [],
  }
}

function makeUser(overrides = {}) {
  return {
    role: 'bond_originator',
    workspaceRole: 'consultant',
    currentWorkspace: { id: 'bond-org-1', name: 'OOBA Demo Originators', type: 'bond_originator' },
    profile: {
      id: 'user-consultant-1',
      email: 'consultant@bond.test',
      full_name: 'Sarah M.',
    },
    ...overrides,
  }
}

function createMockClient() {
  const calls = []
  const client = {
    calls,
    from(table) {
      return {
        upsert(payload) {
          calls.push({ table, action: 'upsert', payload })
          return {
            select() {
              return {
                limit() {
                  return Promise.resolve({ data: [{ id: 'role-player-1' }], error: null })
                },
              }
            },
          }
        },
        insert(payload) {
          calls.push({ table, action: 'insert', payload })
          return {
            select() {
              return {
                single() {
                  return Promise.resolve({ data: { id: `${table}-event-1`, ...payload }, error: null })
                },
                limit() {
                  return Promise.resolve({ data: [{ id: `${table}-insert-1` }], error: null })
                },
              }
            },
          }
        },
        update(payload) {
          return {
            eq(column, value) {
              calls.push({ table, action: 'update', column, value, payload })
              return {
                select() {
                  return {
                    maybeSingle() {
                      return Promise.resolve({ data: { id: value, ...payload }, error: null })
                    },
                  }
                },
              }
            },
          }
        },
        select(columns) {
          const query = {
            filters: [],
            eq(column, value) {
              query.filters.push({ column, value })
              return query
            },
            in(column, values) {
              query.filters.push({ column, values })
              return query
            },
            order() {
              return query
            },
            limit() {
              return query
            },
            maybeSingle() {
              calls.push({ table, action: 'selectMaybeSingle', columns, filters: query.filters })
              return Promise.resolve({ data: null, error: null })
            },
            then(resolve) {
              calls.push({ table, action: 'select', columns, filters: query.filters })
              resolve({ data: [], error: null })
            },
          }
          return query
        },
      }
    },
  }
  return client
}

try {
  const workflow = await server.ssrLoadModule('/src/services/bondIntakeWorkflowService.js')
  const queueService = await server.ssrLoadModule('/src/services/bondOperationalQueueService.js')
  const selectors = await server.ssrLoadModule('/src/core/transactions/bondIntakeSelectors.js')
  const {
    acceptBondIntakeApplication,
    assignBondIntakeApplication,
    declineBondIntakeApplication,
    canAssignBondIntake,
  } = workflow
  const { getNewApplicationsQueue } = queueService
  const { getBondIntakeStatus, BOND_INTAKE_STATUSES } = selectors

  const readyRow = makeReadyRow()
  const acceptClient = createMockClient()
  const acceptResult = await acceptBondIntakeApplication({
    row: readyRow,
    user: makeUser(),
    client: acceptClient,
  })
  assert.equal(acceptResult.message, 'Application accepted and moved to My Applications.')
  assert.equal(acceptClient.calls.some((call) => call.table === 'transaction_role_players' && call.action === 'upsert'), true)
  assert.equal(acceptClient.calls.some((call) => call.table === 'transaction_events' && call.payload?.event_type === 'BOND_APPLICATION_ACCEPTED'), true)
  const acceptTransactionUpdate = acceptClient.calls.find((call) => call.table === 'transactions' && call.action === 'update')
  assert.equal(acceptTransactionUpdate.payload.bond_assignment_status, 'consultant_assigned')
  assert.equal(acceptTransactionUpdate.payload.primary_bond_consultant_user_id, 'user-consultant-1')

  await assert.rejects(
    () => acceptBondIntakeApplication({
      row: makeReadyRow({ onboardingFormData: null, documentRequests: [], documents: [] }),
      user: makeUser(),
      client: createMockClient(),
    }),
    /complete before acceptance/,
  )

  await assert.rejects(
    () => acceptBondIntakeApplication({
      row: makeReadyRow({
        documentRequests: [{ id: 'req-bank', category: 'finance', title: 'Bank statement', status: 'requested' }],
        documents: [],
      }),
      user: makeUser(),
      client: createMockClient(),
    }),
    /complete before acceptance/,
  )

  const acceptedRow = makeReadyRow({
    transaction: {
      assigned_bond_originator_email: 'consultant@bond.test',
      primary_bond_consultant_user_id: 'user-consultant-1',
      bond_assignment_status: 'consultant_assigned',
    },
  })
  assert.equal(getNewApplicationsQueue([acceptedRow]).length, 0)
  assert.equal(getBondIntakeStatus({ transaction: acceptedRow.transaction }), BOND_INTAKE_STATUSES.ACCEPTED)

  const manager = makeUser({ workspaceRole: 'branch_manager' })
  assert.equal(canAssignBondIntake(manager), true)
  const assignClient = createMockClient()
  await assignBondIntakeApplication({
    row: readyRow,
    user: manager,
    assignee: {
      id: 'user-consultant-2',
      name: 'Jason P.',
      email: 'jason@bond.test',
    },
    note: 'Manager assignment',
    client: assignClient,
  })
  const assignUpdate = assignClient.calls.find((call) => call.table === 'transactions' && call.action === 'update')
  assert.equal(assignUpdate.payload.primary_bond_consultant_user_id, 'user-consultant-2')
  assert.equal(assignClient.calls.some((call) => call.table === 'transaction_events' && call.payload?.event_type === 'BOND_APPLICATION_ASSIGNED'), true)

  await assert.rejects(
    () => assignBondIntakeApplication({
      row: readyRow,
      user: makeUser(),
      assignee: { id: 'other-user', name: 'Other User' },
      client: createMockClient(),
    }),
    /permission to assign/,
  )

  await assert.rejects(
    () => declineBondIntakeApplication({
      row: readyRow,
      user: makeUser(),
      reason: '',
      client: createMockClient(),
    }),
    /reason is required/,
  )

  const declineClient = createMockClient()
  await declineBondIntakeApplication({
    row: readyRow,
    user: makeUser(),
    reason: 'Outside mandate',
    note: 'Outside bond desk mandate.',
    client: declineClient,
  })
  const declineUpdate = declineClient.calls.find((call) => call.table === 'transactions' && call.action === 'update')
  assert.equal(declineUpdate.payload.bond_assignment_status, 'declined')
  assert.equal(declineClient.calls.some((call) => call.table === 'transaction_events' && call.payload?.event_type === 'BOND_APPLICATION_DECLINED'), true)

  const declinedRow = makeReadyRow({ transaction: { bond_assignment_status: 'declined' } })
  assert.equal(getNewApplicationsQueue([declinedRow]).length, 0)
  assert.equal(getBondIntakeStatus({ transaction: declinedRow.transaction }), BOND_INTAKE_STATUSES.DECLINED)

  console.log('bondIntakeWorkflowService tests passed')
} finally {
  await server.close()
}
