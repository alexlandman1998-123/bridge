/* global process */
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')

function makeContext({
  userId,
  workspaceRole,
  scopeLevel,
  workspaceId = 'workspace-1',
  workspaceKind = 'bond_company',
  regionId = null,
  unitId = null,
  email = null,
} = {}) {
  return {
    appRole: 'bond_originator',
    workspaceType: 'bond_originator',
    userId,
    profile: {
      id: userId,
      email: email || '',
      fullName: 'Alex Bond',
    },
    currentWorkspace: {
      id: workspaceId,
      type: 'bond_originator',
      workspace_kind: workspaceKind,
    },
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

function createTransaction(overrides = {}) {
  return {
    id: `tx-${Math.random().toString(36).slice(2, 8)}`,
    organisation_id: 'workspace-1',
    bond_workspace_id: 'workspace-1',
    bond_region_id: 'region-1',
    bond_workspace_unit_id: 'unit-1',
    primary_bond_consultant_user_id: '11111111-1111-4111-8111-111111111111',
    assigned_bond_processor_user_id: '22222222-2222-4222-8222-222222222222',
    assigned_bond_compliance_user_id: '33333333-3333-4333-8333-333333333333',
    assigned_bond_manager_user_id: '44444444-4444-4444-8444-444444444444',
    assigned_bond_originator_email: 'consultant@example.test',
    finance_type: 'bond',
    sales_price: 2100000,
    bond_amount: 1785000,
    bank: 'Nedbank',
    buyer_name: 'Buyer One',
    property_address_line_1: '12 Sandton Drive',
    transaction_reference: 'APP-001',
    updated_at: '2026-05-24T10:00:00.000Z',
    created_at: '2026-05-12T10:00:00.000Z',
    ...overrides,
  }
}

const transactions = [
  createTransaction({
    id: 'tx-missing-docs',
    finance_status: 'documents_pending',
    next_action: 'Collect payslips and proof of address',
    comment: 'Awaiting missing docs from buyer.',
    missing_documents_count: 2,
    documents_missing: true,
  }),
  createTransaction({
    id: 'tx-bank-feedback',
    finance_status: 'bank_feedback_pending',
    next_action: 'Respond to valuation query from bank',
    comment: 'Bank feedback needs action before approval.',
    updated_at: '2026-05-23T10:00:00.000Z',
  }),
  createTransaction({
    id: 'tx-approved-linked',
    finance_status: 'approved',
    stage: 'Proceed to Attorneys',
    current_main_stage: 'ATTY',
    next_action: 'Attorney instruction sent with guarantees',
    comment: 'Grant signed and sent to attorneys.',
    updated_at: '2026-05-22T10:00:00.000Z',
  }),
  createTransaction({
    id: 'tx-compliance-flag',
    finance_status: 'blocked',
    compliance_status: 'review_required',
    next_action: 'Expired FICA needs refresh',
    comment: 'Compliance review required before submission.',
    updated_at: '2026-05-18T10:00:00.000Z',
  }),
  createTransaction({
    id: 'tx-registered',
    finance_status: 'approved',
    stage: 'Registered',
    current_main_stage: 'REG',
    next_action: 'Archive file',
    comment: 'Registration confirmed.',
    updated_at: '2026-05-20T10:00:00.000Z',
  }),
  createTransaction({
    id: 'tx-participant-only',
    organisation_id: 'workspace-1',
    primary_bond_consultant_user_id: null,
    assigned_bond_processor_user_id: null,
    assigned_bond_compliance_user_id: null,
    assigned_bond_manager_user_id: null,
    finance_type: 'bond',
    sales_price: 1890000,
    bond_amount: 1510000,
    bank: 'ABSA',
    buyer_name: 'Participant Buyer',
    property_address_line_1: '99 Bryanston Lane',
    finance_status: 'application_in_progress',
    next_action: 'Awaiting salary advice',
    updated_at: '2026-05-21T10:00:00.000Z',
    transaction_participants: [
      {
        role_type: 'bond_originator',
        transaction_role: 'bond_originator',
        user_id: '55555555-5555-4555-8555-555555555555',
        status: 'active',
      },
    ],
  }),
]

try {
  const server = await createServer({
    root: PROJECT_ROOT,
    logLevel: 'silent',
    server: { middlewareMode: true },
  })

  try {
    const service = await server.ssrLoadModule('/src/services/bondCommandCenterService.js')

    const consultant = makeContext({
      userId: '11111111-1111-4111-8111-111111111111',
      workspaceRole: 'consultant',
      scopeLevel: 'assigned',
      email: 'consultant@example.test',
    })
    const processor = makeContext({
      userId: '22222222-2222-4222-8222-222222222222',
      workspaceRole: 'processor',
      scopeLevel: 'assigned',
    })
    const compliance = makeContext({
      userId: '33333333-3333-4333-8333-333333333333',
      workspaceRole: 'compliance',
      scopeLevel: 'workspace_hq',
    })
    const manager = makeContext({
      userId: '44444444-4444-4444-8444-444444444444',
      workspaceRole: 'owner',
      scopeLevel: 'workspace_hq',
    })
    const participantOnlyUser = makeContext({
      userId: '55555555-5555-4555-8555-555555555555',
      workspaceRole: 'consultant',
      scopeLevel: 'assigned',
    })

    const consultantSnapshot = await service.getBondCommandCenterSnapshot(consultant, 'workspace-1', {
      transactions,
      rangeKey: 'all_time',
    })
    assert.equal(consultantSnapshot.reportingScope.dashboardMode, 'consultant')
    assert.equal(consultantSnapshot.priorityActions.find((item) => item.key === 'missing_documents')?.count >= 1, true)
    assert.equal(consultantSnapshot.totalApplications >= 4, true)

    const processorSnapshot = await service.getBondCommandCenterSnapshot(processor, 'workspace-1', {
      transactions,
      rangeKey: 'all_time',
    })
    assert.equal(processorSnapshot.roleFocus.workloadHeading, 'Processor Queue')
    assert.equal(processorSnapshot.priorityActions.find((item) => item.key === 'bank_feedback')?.count >= 1, true)

    const complianceSnapshot = await service.getBondCommandCenterSnapshot(compliance, 'workspace-1', {
      transactions,
      rangeKey: 'all_time',
    })
    assert.equal(complianceSnapshot.roleFocus.workloadHeading, 'Compliance Reviewers')
    assert.equal(complianceSnapshot.priorityActions.find((item) => item.key === 'compliance_review')?.count >= 1, true)

    const managerSnapshot = await service.getBondCommandCenterSnapshot(manager, 'workspace-1', {
      transactions,
      rangeKey: 'all_time',
    })
    assert.equal(managerSnapshot.reportingScope.dashboardMode, 'owner_director')
    assert.equal(managerSnapshot.totalApplications >= consultantSnapshot.totalApplications, true)

    const transactionSnapshot = await service.getBondTransactionTrackerSnapshot(consultant, 'workspace-1', {
      transactions,
      status: 'all',
    })
    const linkedApprovedRow = transactionSnapshot.rows.find((row) => row.transactionId === 'tx-approved-linked')
    assert.ok(linkedApprovedRow)
    assert.equal(linkedApprovedRow.linkedApplicationId, 'tx-approved-linked')
    assert.equal(['instruction_sent', 'in_transfer', 'bond_approved', 'grant_signed'].includes(linkedApprovedRow.status), true)

    const registeredSnapshot = await service.getBondTransactionTrackerSnapshot(manager, 'workspace-1', {
      transactions,
      status: 'registered',
    })
    assert.equal(registeredSnapshot.rows.length, 1)
    assert.equal(registeredSnapshot.rows[0].transactionId, 'tx-registered')

    const participantSnapshot = await service.getBondTransactionTrackerSnapshot(participantOnlyUser, 'workspace-1', {
      transactions: transactions.filter((transaction) => transaction.id === 'tx-participant-only'),
      status: 'all',
    })
    assert.equal(participantSnapshot.rows.some((row) => row.transactionId === 'tx-participant-only'), true)

    console.log('bondCommandCenterService tests passed')
  } finally {
    await server.close()
  }
} catch (error) {
  console.error(error)
  process.exitCode = 1
}
