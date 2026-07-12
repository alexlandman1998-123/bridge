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
  {
    id: 'tx-awaiting-grant',
    organisation_id: 'workspace-1',
    bond_workspace_id: 'workspace-1',
    bond_region_id: 'region-1',
    bond_workspace_unit_id: 'unit-2',
    primary_bond_consultant_user_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    assigned_bond_processor_user_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    finance_status: 'documents_pending',
    transactionFinanceWorkflow: {
      workflow: { currentStage: 'bond_approved', status: 'active' },
    },
    updated_at: '2026-05-23T10:00:00.000Z',
  },
  {
    id: 'tx-grant-received',
    organisation_id: 'workspace-1',
    bond_workspace_id: 'workspace-1',
    bond_region_id: 'region-1',
    bond_workspace_unit_id: 'unit-2',
    primary_bond_consultant_user_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    assigned_bond_processor_user_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    transactionFinanceWorkflow: {
      workflow: { currentStage: 'grant_received', status: 'active' },
    },
    updated_at: '2026-05-24T10:00:00.000Z',
  },
  {
    id: 'tx-grant-signed',
    organisation_id: 'workspace-1',
    bond_workspace_id: 'workspace-1',
    bond_region_id: 'region-1',
    bond_workspace_unit_id: 'unit-2',
    primary_bond_consultant_user_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    assigned_bond_processor_user_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    transactionFinanceWorkflow: {
      workflow: { currentStage: 'grant_signed', status: 'active' },
    },
    updated_at: '2026-05-25T10:00:00.000Z',
  },
  {
    id: 'tx-ready-for-instruction',
    organisation_id: 'workspace-1',
    bond_workspace_id: 'workspace-1',
    bond_region_id: 'region-1',
    bond_workspace_unit_id: 'unit-2',
    primary_bond_consultant_user_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    assigned_bond_processor_user_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    transactionFinanceWorkflow: {
      workflow: { currentStage: 'grant_submitted', status: 'active' },
    },
    updated_at: '2026-05-26T10:00:00.000Z',
  },
  {
    id: 'tx-awaiting-bank-feedback',
    organisation_id: 'workspace-1',
    bond_workspace_id: 'workspace-1',
    bond_region_id: 'region-1',
    bond_workspace_unit_id: 'unit-2',
    primary_bond_consultant_user_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    assigned_bond_processor_user_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    transactionFinanceWorkflow: {
      workflow: { currentStage: 'submitted_to_banks', status: 'active' },
    },
    transaction_bond_applications: [
      { id: 'app-awaiting-bank', status: 'submitted', submitted_at: '2026-05-26T09:00:00.000Z' },
    ],
    updated_at: '2026-05-26T10:00:00.000Z',
  },
  {
    id: 'tx-additional-documents',
    organisation_id: 'workspace-1',
    bond_workspace_id: 'workspace-1',
    bond_region_id: 'region-1',
    bond_workspace_unit_id: 'unit-2',
    primary_bond_consultant_user_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    assigned_bond_processor_user_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    transactionFinanceWorkflow: {
      workflow: { currentStage: 'bank_review', status: 'active' },
    },
    transaction_bond_applications: [
      { id: 'app-additional-docs', status: 'additional_documents_required', updated_at: '2026-05-27T09:00:00.000Z' },
    ],
    updated_at: '2026-05-27T10:00:00.000Z',
  },
  {
    id: 'tx-buyer-reupload',
    organisation_id: 'workspace-1',
    bond_workspace_id: 'workspace-1',
    bond_region_id: 'region-1',
    bond_workspace_unit_id: 'unit-2',
    primary_bond_consultant_user_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    assigned_bond_processor_user_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    transactionFinanceWorkflow: {
      workflow: { currentStage: 'bank_review', status: 'active' },
    },
    transaction_bond_applications: [
      { id: 'app-buyer-reupload', status: 'additional_documents_required', updated_at: '2026-05-28T09:00:00.000Z' },
    ],
    document_requests: [
      { id: 'doc-reupload', document_key: 'bank_statement', status: 'reupload_required' },
    ],
    updated_at: '2026-05-28T10:00:00.000Z',
  },
  {
    id: 'tx-awaiting-grant-doc',
    organisation_id: 'workspace-1',
    bond_workspace_id: 'workspace-1',
    bond_region_id: 'region-1',
    bond_workspace_unit_id: 'unit-2',
    primary_bond_consultant_user_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    assigned_bond_processor_user_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    transactionFinanceWorkflow: {
      workflow: { currentStage: 'bond_approved', status: 'active' },
    },
    updated_at: '2026-05-29T10:00:00.000Z',
  },
  {
    id: 'tx-awaiting-signed-grant',
    organisation_id: 'workspace-1',
    bond_workspace_id: 'workspace-1',
    bond_region_id: 'region-1',
    bond_workspace_unit_id: 'unit-2',
    primary_bond_consultant_user_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    assigned_bond_processor_user_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    transactionFinanceWorkflow: {
      workflow: { currentStage: 'grant_received', status: 'active' },
      instruction: { grantDocumentId: 'doc-grant-1', grantReceived: true },
    },
    updated_at: '2026-05-30T10:00:00.000Z',
  },
  {
    id: 'tx-instruction-awaiting-attorney',
    organisation_id: 'workspace-1',
    bond_workspace_id: 'workspace-1',
    bond_region_id: 'region-1',
    bond_workspace_unit_id: 'unit-2',
    primary_bond_consultant_user_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    assigned_bond_processor_user_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    transactionFinanceWorkflow: {
      workflow: { currentStage: 'instruction_sent', status: 'active' },
      instruction: { instructionSent: true, instructionDocumentId: 'doc-instruction-1' },
    },
    updated_at: '2026-05-31T10:00:00.000Z',
  },
  {
    id: 'tx-clean-instruction',
    organisation_id: 'workspace-1',
    bond_workspace_id: 'workspace-1',
    bond_region_id: 'region-1',
    bond_workspace_unit_id: 'unit-2',
    primary_bond_consultant_user_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    assigned_bond_processor_user_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    transactionFinanceWorkflow: {
      workflow: { currentStage: 'instruction_sent', status: 'active' },
      instruction: { instructionSent: true, instructionDocumentId: 'doc-instruction-2' },
    },
    transaction_attorney_assignments: [
      { id: 'attorney-assignment-1', attorney_role: 'bond_attorney', assignment_status: 'active', attorney_user_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' },
    ],
    updated_at: '2026-06-01T10:00:00.000Z',
  },
  {
    id: 'tx-unknown-active',
    organisation_id: 'workspace-1',
    bond_workspace_id: 'workspace-1',
    bond_region_id: 'region-1',
    bond_workspace_unit_id: 'unit-2',
    finance_type: 'bond',
    finance_managed_by: 'bond_originator',
    bond_assignment_status: 'consultant_assigned',
    primary_bond_consultant_user_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    assigned_bond_processor_user_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    updated_at: '2026-06-02T10:00:00.000Z',
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
  assert.equal(queueService.getAwaitingBankFeedbackQueue(manager, transactions).some((item) => item.transactionId === 'tx-awaiting-bank-feedback'), true)
  assert.equal(queueService.getAdditionalDocumentsRequiredQueue(manager, transactions).some((item) => item.transactionId === 'tx-additional-documents'), true)
  assert.equal(queueService.getAwaitingBuyerReuploadQueue(manager, transactions).some((item) => item.transactionId === 'tx-buyer-reupload'), true)
  assert.equal(queueService.getAwaitingGrantQueue(manager, transactions).some((item) => item.transactionId === 'tx-awaiting-grant'), true)
  assert.equal(queueService.getAwaitingGrantDocumentQueue(manager, transactions).some((item) => item.transactionId === 'tx-awaiting-grant-doc'), true)
  assert.equal(queueService.getGrantReceivedQueue(manager, transactions).some((item) => item.transactionId === 'tx-grant-received'), true)
  assert.equal(queueService.getAwaitingSignedGrantQueue(manager, transactions).some((item) => item.transactionId === 'tx-awaiting-signed-grant'), true)
  assert.equal(queueService.getGrantSignedQueue(manager, transactions).some((item) => item.transactionId === 'tx-grant-signed'), true)
  const readyForInstruction = queueService.getReadyForInstructionQueue(manager, transactions)
  assert.equal(readyForInstruction.some((item) => item.transactionId === 'tx-ready-for-instruction'), true)
  assert.equal(readyForInstruction.find((item) => item.transactionId === 'tx-ready-for-instruction')?.canonicalFinanceStage, 'grant_submitted')
  assert.equal(queueService.getInstructionSentAwaitingAttorneyAcceptanceQueue(manager, transactions).some((item) => item.transactionId === 'tx-instruction-awaiting-attorney'), true)
  assert.equal(queueService.getInstructionSentAwaitingAttorneyAcceptanceQueue(manager, transactions).some((item) => item.transactionId === 'tx-clean-instruction'), false)
  assert.equal(queueService.getInstructionSentQueue(manager, transactions).some((item) => item.transactionId === 'tx-clean-instruction'), true)
  assert.equal(queueService.getActiveReviewRequiredQueue(manager, transactions).some((item) => item.transactionId === 'tx-unknown-active'), true)
  assert.equal(queueService.getActiveReviewRequiredQueue(manager, transactions).some((item) => item.transactionId === 'tx-clean-instruction'), false)

  assert.equal(
    queueService.getBondOperationalQueueContract(transactions.find((item) => item.id === 'tx-awaiting-bank-feedback')).queueKey,
    queueService.BOND_OPERATIONAL_QUEUE_KEYS.AWAITING_BANK_FEEDBACK,
  )
  assert.equal(
    queueService.getBondOperationalQueueContract(transactions.find((item) => item.id === 'tx-buyer-reupload')).waitState,
    queueService.BOND_OPERATIONAL_WAIT_STATES.AWAITING_BUYER_REUPLOAD,
  )
  assert.equal(
    queueService.getBondOperationalQueueContract(transactions.find((item) => item.id === 'tx-unknown-active')).queueKey,
    queueService.BOND_OPERATIONAL_QUEUE_KEYS.ACTIVE_REVIEW_REQUIRED,
  )
  assert.equal(
    queueService.getBondOperationalQueueContract(transactions.find((item) => item.id === 'tx-clean-instruction')).queueKey,
    queueService.BOND_OPERATIONAL_QUEUE_KEYS.INSTRUCTION_SENT,
  )
  assert.equal(queueService.getBondOperationalQueueContract({ id: 'tx-complete', finance_type: 'bond', status: 'completed' }).hiddenAllowed, true)
  assert.equal(queueService.getBondOperationalQueueContract({ id: 'tx-declined', finance_type: 'bond', status: 'declined' }).hiddenAllowed, true)
  assert.equal(queueService.getBondOperationalQueueContract({ id: 'tx-archived', finance_type: 'bond', archived_at: '2026-06-01T00:00:00.000Z' }).hiddenAllowed, true)

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
  assert.equal(queues.awaiting_grant.some((item) => item.transactionId === 'tx-awaiting-grant'), true)
  assert.equal(queues.awaiting_bank_feedback.some((item) => item.transactionId === 'tx-awaiting-bank-feedback'), true)
  assert.equal(queues.additional_documents_required.some((item) => item.transactionId === 'tx-additional-documents'), true)
  assert.equal(queues.awaiting_buyer_reupload.some((item) => item.transactionId === 'tx-buyer-reupload'), true)
  assert.equal(queues.awaiting_grant_document.some((item) => item.transactionId === 'tx-awaiting-grant-doc'), true)
  assert.equal(queues.awaiting_signed_grant.some((item) => item.transactionId === 'tx-awaiting-signed-grant'), true)
  assert.equal(queues.ready_for_instruction.some((item) => item.transactionId === 'tx-ready-for-instruction'), true)
  assert.equal(queues.instruction_sent_awaiting_attorney_acceptance.some((item) => item.transactionId === 'tx-instruction-awaiting-attorney'), true)
  assert.equal(queues.instruction_sent.some((item) => item.transactionId === 'tx-clean-instruction'), true)
  assert.equal(queues.active_review_required.some((item) => item.transactionId === 'tx-unknown-active'), true)

  const intakeRows = [
    {
      id: 'tx-org-intake',
      organisation_id: 'workspace-1',
      assigned_organisation_id: 'workspace-1',
      finance_type: 'bond',
      onboarding_completed_at: '2026-05-23T09:00:00.000Z',
      updated_at: '2026-05-23T10:00:00.000Z',
    },
    {
      id: 'tx-branch-intake',
      organisation_id: 'workspace-1',
      assigned_organisation_id: 'workspace-1',
      assigned_branch_id: 'unit-1',
      finance_type: 'bond',
      onboarding_completed_at: '2026-05-24T09:00:00.000Z',
      updated_at: '2026-05-24T10:00:00.000Z',
    },
    {
      id: 'tx-consultant-intake',
      organisation_id: 'workspace-1',
      assigned_organisation_id: 'workspace-1',
      assigned_user_id: '11111111-1111-4111-8111-111111111111',
      finance_type: 'bond',
      onboarding_completed_at: '2026-05-25T09:00:00.000Z',
      updated_at: '2026-05-25T10:00:00.000Z',
    },
    {
      id: 'tx-other-consultant-intake',
      organisation_id: 'workspace-1',
      assigned_organisation_id: 'workspace-1',
      assigned_user_id: '99999999-9999-4999-8999-999999999999',
      finance_type: 'bond',
      onboarding_completed_at: '2026-05-26T09:00:00.000Z',
      updated_at: '2026-05-26T10:00:00.000Z',
    },
  ]
  const scopedQueuesForConsultant = queueService.resolveBondOperationalQueues(consultant, intakeRows)
  assert.deepEqual(scopedQueuesForConsultant.new_applications.map((item) => item.transactionId), ['tx-consultant-intake'])

  const scopedQueuesForBranch = queueService.resolveBondOperationalQueues(
    makeContext({
      userId: 'branch-manager-1',
      workspaceRole: 'branch_manager',
      scopeLevel: 'branch',
      unitId: 'unit-1',
    }),
    intakeRows,
  )
  assert.deepEqual(scopedQueuesForBranch.new_applications.map((item) => item.transactionId), ['tx-branch-intake'])

  const scopedQueuesForHq = queueService.resolveBondOperationalQueues(manager, intakeRows)
  assert.equal(scopedQueuesForHq.new_applications.length, 4)

  console.log('bondOperationalQueueService tests passed')
} finally {
  await server.close()
}
