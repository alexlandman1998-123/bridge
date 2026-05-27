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

function makeRow(id, overrides = {}) {
  return {
    transaction: {
      id,
      finance_type: 'bond',
      buyer_name: `Buyer ${id}`,
      property_description: `Property ${id}`,
      assigned_agent: 'DaAgency',
      created_at: '2026-05-01T10:00:00.000Z',
      ...overrides.transaction,
    },
    development: {
      id: `development-${id}`,
      name: `Development ${id}`,
      ...overrides.development,
    },
    unit: {
      id: `unit-${id}`,
      unit_number: id,
      ...overrides.unit,
    },
    buyer: {
      id: `buyer-${id}`,
      name: `Buyer ${id}`,
      ...overrides.buyer,
    },
    onboardingFormData: overrides.onboardingFormData || null,
    documentRequests: overrides.documentRequests || [],
    documents: overrides.documents || [],
    rolePlayers: overrides.rolePlayers || [],
  }
}

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

try {
  const queueService = await server.ssrLoadModule('/src/services/bondOperationalQueueService.js')
  const intakeSelectors = await server.ssrLoadModule('/src/core/transactions/bondIntakeSelectors.js')
  const { BOND_INTAKE_STATUSES } = intakeSelectors
  const { getNewApplicationsQueue, buildBondNewApplicationViewModel } = queueService

  const cash = makeRow('cash', { transaction: { finance_type: 'cash' } })
  assert.equal(getNewApplicationsQueue([cash]).length, 0, 'cash transaction is excluded')

  const bondAwaiting = makeRow('bond-awaiting')
  assert.equal(getNewApplicationsQueue([bondAwaiting]).length, 1, 'bond awaiting buyer is included')

  const hybridAwaiting = makeRow('hybrid-awaiting', { transaction: { finance_type: 'Hybrid' } })
  assert.equal(getNewApplicationsQueue([hybridAwaiting]).length, 1, 'hybrid awaiting buyer is included')

  const inProgress = makeRow('in-progress', {
    onboardingFormData: {
      form_data: {
        bond_application: {
          started_at: '2026-05-02T10:00:00.000Z',
          completion_percentage: 35,
        },
      },
    },
  })
  assert.equal(getNewApplicationsQueue([inProgress])[0].intakeStatus, BOND_INTAKE_STATUSES.BUYER_IN_PROGRESS)

  const missingDocs = makeRow('missing-docs', {
    onboardingFormData: submittedOnboarding(),
    documentRequests: [
      { id: 'req-id', category: 'bond', title: 'ID document', status: 'uploaded' },
      { id: 'req-bank', category: 'finance', title: 'Bank statement', status: 'requested' },
    ],
  })
  assert.equal(getNewApplicationsQueue([missingDocs])[0].intakeStatus, BOND_INTAKE_STATUSES.AWAITING_DOCUMENTS)

  const ready = makeRow('ready', {
    onboardingFormData: submittedOnboarding(),
    documentRequests: [
      { id: 'req-id', category: 'bond', title: 'ID document', status: 'uploaded' },
      { id: 'req-bank', category: 'finance', title: 'Bank statement', status: 'requested' },
    ],
    documents: [
      { document_request_id: 'req-bank', status: 'uploaded', uploaded_at: '2026-05-03T11:00:00.000Z' },
    ],
  })
  assert.equal(getNewApplicationsQueue([ready])[0].intakeStatus, BOND_INTAKE_STATUSES.READY_FOR_REVIEW)

  const accepted = makeRow('accepted', {
    transaction: { assigned_bond_originator_email: 'originator@example.test' },
  })
  assert.equal(getNewApplicationsQueue([accepted]).length, 0, 'accepted transaction is excluded')

  const declined = makeRow('declined', {
    transaction: { bond_originator_intake_status: 'declined' },
  })
  assert.equal(getNewApplicationsQueue([declined]).length, 0, 'declined transaction is excluded')

  const progressModel = buildBondNewApplicationViewModel(ready)
  assert.equal(progressModel.documentRequiredCount, 2)
  assert.equal(progressModel.documentUploadedCount, 2)
  assert.equal(progressModel.documentMissingCount, 0)

  const rawOrganisationOnly = makeRow('raw-org', {
    rolePlayers: [
      {
        role_type: 'bond_originator',
        status: 'pending',
        organisation_id: '970e3848-e473-42df-8ffb-9c7bdfec1db0',
        organisation_name: 'organisation-970e3848-e473-42df-8ffb-9c7bdfec1db0@bridge.internal',
      },
    ],
  })
  const rawOrgModel = buildBondNewApplicationViewModel(rawOrganisationOnly)
  assert.equal(rawOrgModel.preferredOriginatorName, 'Unassigned originator')
  assert.equal(rawOrgModel.preferredOriginatorName.includes('bridge.internal'), false)
  assert.equal(rawOrgModel.preferredOriginatorName.includes('970e3848'), false)

  console.log('bondNewApplicationsQueueService tests passed')
} finally {
  await server.close()
}
