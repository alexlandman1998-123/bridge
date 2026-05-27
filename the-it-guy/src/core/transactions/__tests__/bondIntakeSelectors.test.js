import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')

const server = await createServer({
  root: PROJECT_ROOT,
  logLevel: 'silent',
  server: { middlewareMode: true },
})

function makeSubmittedInput(overrides = {}) {
  return {
    transaction: {
      id: 'tx-bond',
      finance_type: 'bond',
      ...overrides.transaction,
    },
    onboardingFormData: {
      form_data: {
        bond_application: {
          started_at: '2026-05-01T10:00:00.000Z',
          submitted_at: '2026-05-02T10:00:00.000Z',
          sections_completed: ['personal', 'income', 'expenses'],
          ...overrides.bondApplication,
        },
        ...overrides.formData,
      },
    },
    documentRequests: overrides.documentRequests || [],
    documents: overrides.documents || [],
    rolePlayers: overrides.rolePlayers || [],
    currentOrganisationId: overrides.currentOrganisationId,
  }
}

try {
  const selectors = await server.ssrLoadModule('/src/core/transactions/bondIntakeSelectors.js')
  const {
    BOND_INTAKE_STATUSES,
    BOND_APPLICATION_PROGRESS_STATUSES,
    getBondIntakeStatus,
    getBondIntakeSummary,
    getBondApplicationProgress,
    getDocumentReadinessSummary,
    isBondFinanceType,
  } = selectors

  assert.equal(
    getBondIntakeStatus({ transaction: { finance_type: 'cash' } }),
    BOND_INTAKE_STATUSES.NOT_BOND_RELEVANT,
    'cash transaction returns NOT_BOND_RELEVANT',
  )

  assert.equal(
    getBondIntakeStatus({ transaction: { finance_type: 'bond' } }),
    BOND_INTAKE_STATUSES.AWAITING_BUYER_APPLICATION,
    'bond transaction with no bond app awaits buyer application',
  )

  assert.equal(
    getBondIntakeStatus({ transaction: { finance_type: 'hybrid' } }),
    BOND_INTAKE_STATUSES.AWAITING_BUYER_APPLICATION,
    'hybrid transaction with no bond app awaits buyer application',
  )

  const draftInput = {
    transaction: { finance_type: 'bond' },
    onboardingFormData: {
      form_data: {
        bond_application: {
          started_at: '2026-05-01T10:00:00.000Z',
          sections_completed: ['personal'],
          completion_percentage: 35,
        },
      },
    },
  }
  assert.equal(getBondIntakeStatus(draftInput), BOND_INTAKE_STATUSES.BUYER_IN_PROGRESS)
  assert.equal(getBondApplicationProgress(draftInput).status, BOND_APPLICATION_PROGRESS_STATUSES.IN_PROGRESS)

  const missingDocsInput = makeSubmittedInput({
    documentRequests: [
      { id: 'req-id', title: 'ID document', category: 'bond', status: 'uploaded' },
      { id: 'req-payslip', title: 'Latest payslip', category: 'finance', status: 'requested' },
    ],
  })
  assert.equal(getBondIntakeStatus(missingDocsInput), BOND_INTAKE_STATUSES.AWAITING_DOCUMENTS)
  assert.deepEqual(getDocumentReadinessSummary(missingDocsInput).missingLabels, ['Latest payslip'])

  const readyInput = makeSubmittedInput({
    documentRequests: [
      { id: 'req-id', title: 'ID document', category: 'bond', status: 'uploaded' },
      { id: 'req-payslip', title: 'Latest payslip', category: 'finance', status: 'requested' },
    ],
    documents: [
      { document_request_id: 'req-payslip', status: 'uploaded', uploaded_at: '2026-05-02T12:00:00.000Z' },
    ],
  })
  assert.equal(getBondIntakeStatus(readyInput), BOND_INTAKE_STATUSES.READY_FOR_REVIEW)
  assert.equal(getBondIntakeSummary(readyInput).canAccept, true)

  assert.equal(
    getBondIntakeStatus({
      transaction: {
        finance_type: 'bond',
        assigned_bond_originator_email: 'originator@example.test',
      },
    }),
    BOND_INTAKE_STATUSES.ACCEPTED,
    'assigned bond originator returns ACCEPTED',
  )

  const rejectedDocInput = makeSubmittedInput({
    documentRequests: [
      { id: 'req-id', title: 'ID document', category: 'bond', status: 'uploaded' },
      { id: 'req-bank', title: 'Bank statement', category: 'finance', status: 'rejected' },
    ],
    documents: [
      { document_request_id: 'req-bank', status: 'uploaded', uploaded_at: '2026-05-02T12:00:00.000Z' },
    ],
  })
  assert.equal(getBondIntakeStatus(rejectedDocInput), BOND_INTAKE_STATUSES.AWAITING_DOCUMENTS)

  assert.equal(
    getBondIntakeSummary({ transaction: { finance_type: 'Bond' } }).intakeStatus,
    BOND_INTAKE_STATUSES.AWAITING_BUYER_APPLICATION,
    'missing onboarding payload does not crash',
  )

  assert.equal(isBondFinanceType({ finance_type: 'BOND' }), true)
  assert.equal(isBondFinanceType({ finance_type: 'HYBRID' }), true)
  assert.equal(
    getBondIntakeStatus({
      transaction: {},
      onboardingFormData: { form_data: { finance: { finance_type: 'Hybrid' } } },
    }),
    BOND_INTAKE_STATUSES.AWAITING_BUYER_APPLICATION,
    'unknown finance casing and alternative onboarding finance shape works',
  )

  assert.equal(
    getBondIntakeStatus({
      transaction: { finance_type: 'bond', bond_originator_intake_status: 'declined' },
    }),
    BOND_INTAKE_STATUSES.DECLINED,
    'declined marker returns DECLINED',
  )

  console.log('bondIntakeSelectors tests passed')
} finally {
  await server.close()
}
