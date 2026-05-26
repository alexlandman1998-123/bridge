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

function makeContext({
  userId,
  workspaceRole,
  scopeLevel,
  workspaceId = 'workspace-1',
  regionId = null,
  unitId = null,
} = {}) {
  return {
    appRole: 'bond_originator',
    workspaceType: 'bond_originator',
    userId,
    currentWorkspace: { id: workspaceId, type: 'bond_originator' },
    currentMembership: {
      id: `membership-${userId || workspaceRole}`,
      workspaceId,
      organisation_id: workspaceId,
      user_id: userId,
      status: 'active',
      workspaceRole,
      workspace_role: workspaceRole,
      scopeLevel,
      scope_level: scopeLevel,
      region_id: regionId,
      workspace_unit_id: unitId,
      branch_id: unitId,
    },
  }
}

const transactions = [
  {
    id: 'tx-consultant',
    organisation_id: 'workspace-1',
    bond_workspace_id: 'workspace-1',
    bond_region_id: 'region-1',
    bond_workspace_unit_id: 'unit-1',
    primary_bond_consultant_user_id: '11111111-1111-4111-8111-111111111111',
    assigned_bond_processor_user_id: '22222222-2222-4222-8222-222222222222',
    assigned_bond_manager_user_id: '33333333-3333-4333-8333-333333333333',
    assigned_bond_compliance_user_id: '44444444-4444-4444-8444-444444444444',
    finance_status: 'application_in_progress',
    documents_missing: true,
    missing_documents_count: 2,
    updated_at: '2026-05-10T10:00:00.000Z',
  },
  {
    id: 'tx-processing-team',
    organisation_id: 'workspace-1',
    bond_workspace_id: 'workspace-1',
    bond_region_id: 'region-1',
    bond_workspace_unit_id: 'team-1',
    primary_bond_consultant_user_id: '55555555-5555-4555-8555-555555555555',
    assigned_bond_processor_user_id: '66666666-6666-4666-8666-666666666666',
    assigned_bond_manager_user_id: '33333333-3333-4333-8333-333333333333',
    bank_feedback_pending: true,
    finance_status: 'bank_feedback_received',
    updated_at: '2026-05-20T10:00:00.000Z',
  },
  {
    id: 'tx-ready',
    organisation_id: 'workspace-1',
    bond_workspace_id: 'workspace-1',
    bond_region_id: 'region-1',
    bond_workspace_unit_id: 'unit-1',
    primary_bond_consultant_user_id: '11111111-1111-4111-8111-111111111111',
    assigned_bond_processor_user_id: '22222222-2222-4222-8222-222222222222',
    assigned_bond_manager_user_id: '33333333-3333-4333-8333-333333333333',
    documents_complete: true,
    application_prepared: true,
    submitted_to_banks: false,
    next_action: 'Submit to banks',
    updated_at: '2026-05-21T10:00:00.000Z',
  },
  {
    id: 'tx-compliance',
    organisation_id: 'workspace-1',
    bond_workspace_id: 'workspace-1',
    bond_region_id: 'region-1',
    bond_workspace_unit_id: 'unit-1',
    primary_bond_consultant_user_id: '77777777-7777-4777-8777-777777777777',
    assigned_bond_processor_user_id: '88888888-8888-4888-8888-888888888888',
    assigned_bond_compliance_user_id: '44444444-4444-4444-8444-444444444444',
    compliance_review_required: true,
    finance_status: 'pending_review',
    updated_at: '2026-05-22T10:00:00.000Z',
  },
  {
    id: 'tx-escalation',
    organisation_id: 'workspace-1',
    bond_workspace_id: 'workspace-1',
    bond_region_id: 'region-1',
    bond_workspace_unit_id: 'unit-2',
    primary_bond_consultant_user_id: '99999999-9999-4999-8999-999999999999',
    assigned_bond_processor_user_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    escalation_required: true,
    blocked: true,
    due_at: '2024-01-01T00:00:00.000Z',
    finance_status: 'blocked',
    updated_at: '2026-05-05T10:00:00.000Z',
  },
]

try {
  const queueService = await server.ssrLoadModule('/src/services/bondOperationalQueueService.js')

  const consultant = makeContext({
    userId: '11111111-1111-4111-8111-111111111111',
    workspaceRole: 'consultant',
    scopeLevel: 'assigned',
  })
  assert.equal(queueService.getMyApplicationsQueue(consultant, transactions).length, 2)

  const processorAssigned = makeContext({
    userId: '22222222-2222-4222-8222-222222222222',
    workspaceRole: 'processor',
    scopeLevel: 'assigned',
  })
  assert.equal(queueService.getProcessingQueue(processorAssigned, transactions).length, 2)

  const processorTeam = makeContext({
    userId: 'processor-team-1',
    workspaceRole: 'processor',
    scopeLevel: 'team',
    unitId: 'team-1',
  })
  assert.equal(queueService.getProcessingQueue(processorTeam, transactions).length, 1)
  assert.equal(queueService.getProcessingQueue(processorTeam, transactions)[0].transactionId, 'tx-processing-team')

  const manager = makeContext({
    userId: '33333333-3333-4333-8333-333333333333',
    workspaceRole: 'hq_manager',
    scopeLevel: 'workspace_hq',
  })
  assert.equal(queueService.getMissingDocumentsQueue(manager, transactions).length >= 1, true)
  assert.equal(queueService.getBankFeedbackQueue(manager, transactions).length >= 1, true)
  assert.equal(queueService.getSubmissionReadinessQueue(manager, transactions).length >= 1, true)
  assert.equal(queueService.getManagerEscalationsQueue(manager, transactions).length >= 1, true)

  const compliance = makeContext({
    userId: '44444444-4444-4444-8444-444444444444',
    workspaceRole: 'compliance',
    scopeLevel: 'assigned',
  })
  const complianceQueue = queueService.getComplianceReviewQueue(compliance, transactions)
  assert.equal(complianceQueue.length >= 1, true)
  assert.equal(complianceQueue.some((item) => item.transactionId === 'tx-compliance'), true)

  const queues = queueService.resolveBondOperationalQueues(manager, transactions)
  assert.equal(Array.isArray(queues.processing_queue), true)
  assert.equal(queues.manager_escalations.length >= 1, true)

  console.log('bondOperationalQueueService tests passed')
} finally {
  await server.close()
}
