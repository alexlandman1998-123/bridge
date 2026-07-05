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

function test(name, fn) {
  try {
    const result = fn()
    if (result && typeof result.then === 'function') {
      return result.then(() => console.log(`ok - ${name}`))
    }
    console.log(`ok - ${name}`)
    return Promise.resolve()
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

function makeQueryResult(data = []) {
  return { data, error: null }
}

function makeWorkflowReadModelClient({ transaction, attorneyAssignments = [] } = {}) {
  const rowsByTable = {
    transaction_subprocesses: [],
    transaction_checklist_items: [],
    document_requests: [],
    transaction_participants: [],
    transaction_events: [],
    transaction_attorney_assignments: attorneyAssignments,
  }

  return {
    from(table) {
      const builder = {
        select() {
          return builder
        },
        eq() {
          return builder
        },
        in() {
          return builder
        },
        order() {
          return builder
        },
        limit() {
          return builder
        },
        maybeSingle() {
          return Promise.resolve(makeQueryResult(transaction))
        },
        then(resolve, reject) {
          return Promise.resolve(makeQueryResult(rowsByTable[table] || [])).then(resolve, reject)
        },
      }
      return builder
    },
  }
}

function makeTransaction(overrides = {}) {
  return {
    id: 'tx-phase4',
    transaction_reference: 'PHASE4',
    stage: 'OTP Signed',
    current_main_stage: 'FIN',
    finance_type: 'bond',
    finance_managed_by: 'bond_originator',
    updated_at: '2026-07-05T08:00:00.000Z',
    created_at: '2026-07-01T08:00:00.000Z',
    ...overrides,
  }
}

const transferAssignment = {
  id: 'transfer-assignment',
  transaction_id: 'tx-phase4',
  assignment_type: 'transfer',
  status: 'active',
}

try {
  const nextActionsModule = await server.ssrLoadModule('/src/lib/clientPortalNextActionsEngine.js')
  const financeService = await server.ssrLoadModule('/src/services/transactionFinanceService.js')
  const readModelService = await server.ssrLoadModule('/src/services/transactionWorkflowReadModelService.js')
  const { generateClientPortalNextActions } = nextActionsModule
  const { buildTransactionFinanceWorkspace } = financeService
  const { getTransactionWorkflowReadModel } = readModelService

  await test('client-managed bond finance does not create a bond role-player blocker', async () => {
    const readModel = await getTransactionWorkflowReadModel('tx-phase4', {
      client: makeWorkflowReadModelClient({
        transaction: makeTransaction({ finance_managed_by: 'client' }),
        attorneyAssignments: [transferAssignment],
      }),
    })

    assert.equal(readModel.transaction.financeManagedBy, 'client')
    assert.equal(readModel.blockers.some((blocker) => blocker.id === 'missing-bond-role-assignment'), false)
  })

  await test('originator-managed bond finance still requires a bond role-player assignment', async () => {
    const readModel = await getTransactionWorkflowReadModel('tx-phase4', {
      client: makeWorkflowReadModelClient({
        transaction: makeTransaction(),
        attorneyAssignments: [transferAssignment],
      }),
    })

    const blocker = readModel.blockers.find((item) => item.id === 'missing-bond-role-assignment')
    assert.equal(Boolean(blocker), true)
    assert.equal(blocker.blockingRole, 'bond_originator')
  })

  await test('client-managed bond next actions route to document upload instead of bond application', () => {
    const actions = generateClientPortalNextActions({
      workspaceMode: 'buying',
      onboarding: { status: 'submitted' },
      transaction: {
        finance_type: 'bond',
        finance_managed_by: 'client',
      },
      documentCenter: {
        requiredDocuments: [
          {
            key: 'bank_approval_letter',
            label: 'Bank approval letter',
            status: 'required',
          },
        ],
      },
    })

    assert.equal(actions.some((action) => action.id === 'bond_application_required'), false)
    const financeAction = actions.find((action) => action.id === 'bond_finance_documents_required')
    assert.equal(financeAction?.title, 'Upload external finance documents')
    assert.equal(financeAction?.actionRoute, 'documents')
  })

  await test('finance workspace labels self-managed bond owner as buyer/attorney', () => {
    const workspace = buildTransactionFinanceWorkspace({
      transaction: {
        id: 'tx-client-finance',
        finance_type: 'bond',
        finance_managed_by: 'client',
      },
      workflowData: null,
      requiredDocumentChecklist: [
        { id: 'approval', key: 'bank_approval_letter', label: 'Bank approval letter', status: 'missing' },
      ],
      viewerRole: 'agent',
    })

    const ownerBlock = workspace.summaryBlocks.find((item) => item.key === 'finance_owner')
    assert.equal(ownerBlock?.value, 'Buyer / Attorney')
    assert.equal(ownerBlock?.subtext, 'Buyer-arranged finance')
  })

  console.log('finance owner phase 4 workflow visibility tests passed')
} finally {
  await server.close()
}
