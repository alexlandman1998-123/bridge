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
  workspaceKind = 'bond_company',
  regionId = null,
  unitId = null,
  email = null,
} = {}) {
  return {
    appRole: 'bond_originator',
    workspaceType: 'bond_originator',
    userId,
    profile: email ? { email } : undefined,
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

const hierarchy = {
  workspaceId: 'workspace-1',
  regions: [
    { id: 'region-1', name: 'Gauteng' },
    { id: 'region-2', name: 'Western Cape' },
  ],
  units: [
    { id: 'unit-1', name: 'Sandton Branch', region_id: 'region-1', unit_type: 'branch' },
    { id: 'unit-2', name: 'Cape Town Branch', region_id: 'region-2', unit_type: 'branch' },
    { id: 'team-1', name: 'Processing Team A', region_id: 'region-1', unit_type: 'team' },
  ],
}

const transactions = [
  {
    id: 'tx-canonical-consultant',
    organisation_id: 'workspace-1',
    bond_workspace_id: 'workspace-1',
    bond_region_id: 'region-1',
    bond_workspace_unit_id: 'unit-1',
    primary_bond_consultant_user_id: '11111111-1111-4111-8111-111111111111',
    assigned_bond_processor_user_id: '22222222-2222-4222-8222-222222222222',
    assigned_bond_manager_user_id: '33333333-3333-4333-8333-333333333333',
    finance_status: 'application_in_progress',
    documents_missing: true,
    missing_documents_count: 1,
    updated_at: '2026-05-10T10:00:00.000Z',
  },
  {
    id: 'tx-processing',
    organisation_id: 'workspace-1',
    bond_workspace_id: 'workspace-1',
    bond_region_id: 'region-1',
    bond_workspace_unit_id: 'team-1',
    primary_bond_consultant_user_id: '44444444-4444-4444-8444-444444444444',
    assigned_bond_processor_user_id: '22222222-2222-4222-8222-222222222222',
    assigned_bond_manager_user_id: '33333333-3333-4333-8333-333333333333',
    bank_feedback_pending: true,
    finance_status: 'bank_feedback_pending',
    updated_at: '2026-05-11T10:00:00.000Z',
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
    finance_status: 'prepared',
    updated_at: '2026-05-12T10:00:00.000Z',
  },
  {
    id: 'tx-overdue-blocked',
    organisation_id: 'workspace-1',
    bond_workspace_id: 'workspace-1',
    bond_region_id: 'region-2',
    bond_workspace_unit_id: 'unit-2',
    primary_bond_consultant_user_id: '55555555-5555-4555-8555-555555555555',
    assigned_bond_processor_user_id: '66666666-6666-4666-8666-666666666666',
    assigned_bond_manager_user_id: '77777777-7777-4777-8777-777777777777',
    finance_status: 'blocked',
    due_at: '2024-01-01T00:00:00.000Z',
    escalation_required: true,
    updated_at: '2026-05-13T10:00:00.000Z',
  },
  {
    id: 'tx-legacy-email',
    organisation_id: 'workspace-1',
    assigned_bond_originator_email: 'legacy-consultant@example.test',
    finance_status: 'approved',
    updated_at: '2026-05-14T10:00:00.000Z',
  },
  {
    id: 'tx-participant-only',
    organisation_id: 'workspace-1',
    finance_status: 'application_in_progress',
    transaction_participants: [
      {
        role_type: 'bond_originator',
        transaction_role: 'bond_originator',
        user_id: '11111111-1111-4111-8111-111111111111',
        status: 'active',
      },
    ],
    updated_at: '2026-05-15T10:00:00.000Z',
  },
]

const personalOriginatorTransactions = [
  {
    id: 'tx-personal-1',
    organisation_id: 'workspace-personal-1',
    bond_workspace_id: 'workspace-personal-1',
    primary_bond_consultant_user_id: '88888888-8888-4888-8888-888888888888',
    finance_status: 'application_in_progress',
    updated_at: '2026-05-20T10:00:00.000Z',
  },
]

try {
  const dashboardService = await server.ssrLoadModule('/src/services/bondDashboardService.js')

  const independent = makeContext({
    userId: '88888888-8888-4888-8888-888888888888',
    workspaceRole: 'owner',
    scopeLevel: 'workspace_hq',
    workspaceId: 'workspace-personal-1',
    workspaceKind: 'personal_originator',
  })
  const independentContext = await dashboardService.getBondDashboardContext(independent, 'workspace-personal-1', {
    transactions: personalOriginatorTransactions,
    hierarchy: { workspaceId: 'workspace-personal-1', regions: [], units: [] },
  })
  assert.equal(independentContext.workspaceKind, 'personal_originator')
  assert.equal(independentContext.dashboardMode, 'independent_originator')
  assert.equal(independentContext.regionId, null)
  assert.equal(independentContext.workspaceUnitId, null)

  const independentSummary = await dashboardService.getBondDashboardSummary(independent, 'workspace-personal-1', {
    transactions: personalOriginatorTransactions,
  })
  assert.equal(independentSummary.totalApplications, 1)
  assert.equal(independentSummary.myApplications, 1)

  const consultant = makeContext({
    userId: '11111111-1111-4111-8111-111111111111',
    workspaceRole: 'consultant',
    scopeLevel: 'assigned',
    email: 'legacy-consultant@example.test',
  })
  const consultantSummary = await dashboardService.getBondDashboardSummary(consultant, 'workspace-1', { transactions })
  assert.equal(consultantSummary.myApplications >= 2, true)
  assert.equal(consultantSummary.legacyFallbackRecords >= 1, true)

  const processor = makeContext({
    userId: '22222222-2222-4222-8222-222222222222',
    workspaceRole: 'processor',
    scopeLevel: 'assigned',
  })
  const processorQueues = await dashboardService.getBondDashboardQueues(processor, 'workspace-1', { transactions })
  assert.equal(processorQueues.processing_queue.length >= 2, true)

  const branchManager = makeContext({
    userId: '33333333-3333-4333-8333-333333333333',
    workspaceRole: 'branch_manager',
    scopeLevel: 'branch',
    regionId: 'region-1',
    unitId: 'unit-1',
  })
  const branchSummary = await dashboardService.getBondDashboardSummary(branchManager, 'workspace-1', { transactions })
  assert.equal(branchSummary.totalApplications >= 2, true)
  assert.equal(branchSummary.totalApplications < 6, true)

  const regionalManager = makeContext({
    userId: 'regional-manager-1',
    workspaceRole: 'regional_manager',
    scopeLevel: 'region',
    regionId: 'region-1',
  })
  const regionalSummary = await dashboardService.getBondDashboardSummary(regionalManager, 'workspace-1', { transactions })
  assert.equal(regionalSummary.totalApplications >= 3, true)
  assert.equal(regionalSummary.totalApplications < 6, true)

  const hqManager = makeContext({
    userId: 'hq-manager-1',
    workspaceRole: 'hq_manager',
    scopeLevel: 'workspace_hq',
  })
  const hqSummary = await dashboardService.getBondDashboardSummary(hqManager, 'workspace-1', { transactions })
  assert.equal(hqSummary.totalApplications, 6)
  assert.equal(hqSummary.missingDocuments >= 1, true)
  assert.equal(hqSummary.bankFeedbackPending >= 1, true)
  assert.equal(hqSummary.submissionReady >= 1, true)
  assert.equal(hqSummary.overdueApplications >= 1, true)
  assert.equal(hqSummary.managerEscalations >= 1, true)
  assert.equal(hqSummary.approvedApplications >= 1, true)
  assert.equal(hqSummary.declinedOrBlockedApplications >= 1, true)
  assert.equal(hqSummary.canonicalAssignmentRecords >= 4, true)

  const filters = await dashboardService.getBondDashboardFilters(hqManager, 'workspace-1', {
    transactions,
    hierarchy,
  })
  assert.equal(filters.visibleFilters.region, true)
  assert.equal(filters.options.regions.length, 2)
  assert.equal(filters.options.units.length, 3)

  const reportingScope = await dashboardService.getBondDashboardReportingScope(branchManager, 'workspace-1')
  assert.equal(reportingScope.scopeLevel, 'branch')
  assert.equal(reportingScope.workspaceUnitId, 'unit-1')

  console.log('bondDashboardService tests passed')
} finally {
  await server.close()
}
