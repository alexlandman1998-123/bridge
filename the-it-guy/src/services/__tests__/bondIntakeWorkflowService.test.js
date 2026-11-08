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
      onboarding_completed_at: '2026-05-02T09:00:00.000Z',
      otp_status: 'fully_signed',
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

function createMockClient({ transactionUpdateMissing = false, applicationCount = 1 } = {}) {
  const calls = []
  const client = {
    calls,
    async rpc(name, args) {
      calls.push({ action: 'rpc', name, args })
      assert.equal(name, 'bridge_save_bond_intake_assignment')
      if (transactionUpdateMissing) return { data: null, error: new Error('This application could not be updated.') }
      const applications = Array.from({ length: Math.max(1, applicationCount) }, (_, index) => ({ id: `bond-application-${index + 1}`, ...args.p_application_changes }))
      if (!applications.length) return { data: null, error: new Error('The originator referral record is missing.') }
      // Record the intended atomic changes for the existing field-mapping assertions.
      calls.push({ table: 'transactions', action: 'update', payload: args.p_transaction_changes })
      for (const application of applications) calls.push({ table: 'transaction_bond_applications', action: 'update', value: application.id, payload: args.p_application_changes })
      return { data: { transaction: { id: args.p_transaction, ...args.p_transaction_changes }, applications }, error: null }
    },
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
                      return Promise.resolve({ data: table === 'transactions' && transactionUpdateMissing ? null : { id: value, ...payload }, error: null })
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
              if (table === 'transaction_bond_applications') {
                resolve({ data: Array.from({ length: applicationCount }, (_, index) => ({ id: `bond-application-${index + 1}`, assigned_organisation_id: 'bond-org-1' })), error: null })
                return
              }
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
  assert.equal(acceptClient.calls.filter(call => call.action === 'rpc' && call.name === 'bridge_save_bond_intake_assignment').length, 1)
  const acceptTransactionUpdate = acceptClient.calls.find((call) => call.table === 'transactions' && call.action === 'update')
  assert.equal(acceptTransactionUpdate.payload.bond_assignment_status, 'consultant_assigned')
  assert.equal(acceptTransactionUpdate.payload.primary_bond_consultant_user_id, 'user-consultant-1')
  const acceptBondApplicationUpdate = acceptClient.calls.find((call) => call.table === 'transaction_bond_applications' && call.action === 'update')
  assert.equal(acceptBondApplicationUpdate.payload.assigned_organisation_id, 'bond-org-1')
  assert.equal(acceptBondApplicationUpdate.payload.assigned_user_id, 'user-consultant-1')
  assert.equal(acceptBondApplicationUpdate.payload.assigned_workspace_unit_id, null)
  assert.equal(acceptBondApplicationUpdate.payload.scope_level, 'independent')
  assert.equal(acceptBondApplicationUpdate.payload.scope_metadata.source, 'accepted_from_intake')
  assert.equal(acceptBondApplicationUpdate.payload.assignment_source, 'accepted_from_intake')

  for (const row of [
    makeReadyRow({ onboardingFormData: null, documentRequests: [], documents: [] }),
    makeReadyRow({ transaction: { onboarding_completed_at: null, otp_status: 'not_signed' }, documentRequests: [{ id: 'req-bank', category: 'finance', title: 'Bank statement', status: 'requested' }], documents: [] }),
  ]) {
    const db = createMockClient()
    await acceptBondIntakeApplication({ row, user: makeUser(), client: db })
    assert.equal(db.calls.some(call => call.table === 'transactions' && call.payload?.bond_assignment_status === 'consultant_assigned'), true)
    assert.equal(db.calls.some(call => call.payload?.status === 'submitted'), false, 'accepting ownership must not invent a bank submission')
  }
  for (const transaction of [{ registered_at: '2026-11-01' }, { finance_type: 'cash' }, { lifecycle_state: 'cancelled' }]) {
    await assert.rejects(() => acceptBondIntakeApplication({ row: makeReadyRow({ transaction }), user: makeUser(), client: createMockClient() }), /cannot be accepted/)
  }

  const staleClient = createMockClient({ transactionUpdateMissing: true })
  await assert.rejects(() => acceptBondIntakeApplication({ row: readyRow, user: makeUser(), client: staleClient }), /could not be updated/)
  assert.equal(staleClient.calls.some(call => call.table === 'transaction_role_players' && call.action === 'upsert'), false)
  assert.equal(staleClient.calls.some(call => call.table === 'transaction_events' && call.payload?.event_type === 'BOND_APPLICATION_ACCEPTED'), false)
  const foreignClient = createMockClient()
  await assert.rejects(() => acceptBondIntakeApplication({ row: readyRow, transactionId: 'another-deal', user: makeUser(), client: foreignClient }), /application changed/)
  assert.equal(foreignClient.calls.some(call => ['update','upsert','insert'].includes(call.action)), false)
  const galleryClient = createMockClient({ applicationCount: 12 })
  await acceptBondIntakeApplication({ row: readyRow, user: makeUser(), client: galleryClient })
  const allAssignments = galleryClient.calls.filter(call => call.table === 'transaction_bond_applications' && call.action === 'update')
  assert.equal(allAssignments.length, 12)
  assert.equal(Object.hasOwn(allAssignments[0].payload, 'assignment_rule_id'), true)
  assert.equal(Object.hasOwn(allAssignments[0].payload, 'assignment_method'), true)
  assert.equal(Object.hasOwn(allAssignments[0].payload, 'bond_assignment_rule_id'), false)

  const acceptedRow = makeReadyRow({
    transaction: {
      assigned_bond_originator_email: 'consultant@bond.test',
      primary_bond_consultant_user_id: 'user-consultant-1',
      bond_assignment_status: 'consultant_assigned',
    },
  })
  assert.equal(getNewApplicationsQueue([acceptedRow]).length, 0)
  assert.equal(getBondIntakeStatus({ transaction: acceptedRow.transaction }), BOND_INTAKE_STATUSES.ACCEPTED)

  const manager = makeUser({
    workspaceRole: 'branch_manager',
    currentMembership: {
      organisation_id: 'bond-org-1',
      workspaceRole: 'branch_manager',
      workspace_role: 'branch_manager',
      scopeLevel: 'branch',
      scope_level: 'branch',
      region_id: 'region-1',
      workspace_unit_id: 'branch-1',
      branch_id: 'branch-1',
    },
  })
  assert.equal(canAssignBondIntake(manager), true)
  const assignClient = createMockClient()
  await assignBondIntakeApplication({
    row: readyRow,
    user: manager,
    assignee: {
      id: 'user-consultant-2',
      name: 'Jason P.',
      email: 'jason@bond.test',
      regionId: 'region-1',
      branchId: 'branch-1',
    },
    note: 'Manager assignment',
    client: assignClient,
  })
  const assignUpdate = assignClient.calls.find((call) => call.table === 'transactions' && call.action === 'update')
  assert.equal(assignUpdate.payload.primary_bond_consultant_user_id, 'user-consultant-2')
  const assignBondApplicationUpdate = assignClient.calls.find((call) => call.table === 'transaction_bond_applications' && call.action === 'update')
  assert.equal(assignBondApplicationUpdate.payload.assigned_user_id, 'user-consultant-2')
  assert.equal(assignBondApplicationUpdate.payload.assigned_region_id, 'region-1')
  assert.equal(assignBondApplicationUpdate.payload.assigned_workspace_unit_id, 'branch-1')
  assert.equal(assignBondApplicationUpdate.payload.assigned_branch_id, 'branch-1')
  assert.equal(assignBondApplicationUpdate.payload.scope_level, 'user')
  assert.equal(assignBondApplicationUpdate.payload.assignment_source, 'assigned_from_intake')
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
