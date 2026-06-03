/* global process */
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

try {
  const service = await server.ssrLoadModule('/src/services/bondOrganisationService.js')

  function makeContext({
    userId = 'user-hq',
    workspaceRole = 'owner',
    scopeLevel = 'workspace_hq',
    workspaceId = 'workspace-1',
    email = 'hq@example.test',
    regionId = '',
    workspaceUnitId = '',
  } = {}) {
    return {
      appRole: 'bond_originator',
      workspaceType: 'bond_originator',
      userId,
      email,
      profile: {
        id: userId,
        email,
        fullName: 'HQ User',
      },
      currentWorkspace: {
        id: workspaceId,
        type: 'bond_originator',
        workspace_kind: 'bond_company',
      },
      currentMembership: {
        id: `membership-${userId}`,
        workspaceId,
        organisation_id: workspaceId,
        user_id: userId,
        status: 'active',
        workspaceRole,
        workspace_role: workspaceRole,
        scopeLevel,
        scope_level: scopeLevel,
        regionId,
        region_id: regionId,
        workspaceUnitId,
        workspace_unit_id: workspaceUnitId,
      },
    }
  }

  function createApplicationRow({
    id,
    buyerName,
    regionId = '',
    region = '',
    branchId = '',
    branch = '',
    consultant = '',
    assignedUserId = '',
    createdAt = '2026-05-12T10:00:00.000Z',
    updatedAt = '2026-05-24T10:00:00.000Z',
    financeStageLabel = 'Bank Feedback',
    financeStageKey = 'bank_feedback',
    status = 'active',
    nextAction = '',
    source,
    isDemo = false,
    synthetic = false,
    __demo = false,
  } = {}) {
    return {
      source,
      isDemo,
      synthetic,
      __demo,
      transaction: {
        id,
        transaction_reference: id.toUpperCase(),
        organisation_id: 'workspace-1',
        bond_workspace_id: 'workspace-1',
        finance_type: 'bond',
        finance_status: 'application_in_progress',
        buyer_name: buyerName,
        property_address_line_1: '12 Sandton Drive',
        bank: 'Nedbank',
        updated_at: updatedAt,
        created_at: createdAt,
      },
      buyer: {
        id: `buyer-${id}`,
        name: buyerName,
        email: `${id}@example.test`,
      },
      regionId,
      region,
      branchId,
      branch,
      workspaceUnitId: branchId,
      consultant,
      assignedUserId,
      assignedUserEmail: assignedUserId ? `${assignedUserId}@example.test` : '',
      financeStageLabel,
      financeStageKey,
      status,
      nextAction,
      lastActivityAt: updatedAt,
      lastActivityLabel: 'Today',
      createdAt,
    }
  }

  assert.equal(service.getBondOrganisationRouteForTab('regions'), '/bond/organisation?view=regions')
  assert.equal(
    service.getBondOrganisationRouteForTab('branches', { branchId: 'branch-hq-1' }),
    '/bond/organisation?view=branches&branchId=branch-hq-1',
  )

  const scope = {
    regions: [
      { id: 'region-central', name: 'Gauteng Central', manager_user_id: 'user-hq' },
    ],
    branches: [
      { id: 'branch-hq', name: 'Sandton HQ', region_id: 'region-central', region: 'Gauteng Central', manager_user_id: 'user-hq' },
      { id: 'branch-waterfall', name: 'Waterfall Desk', region_id: 'region-central', region: 'Gauteng Central', manager_user_id: 'user-branch' },
    ],
    consultants: [
      { id: 'consultant-1', user_id: 'consultant-1', name: 'Lerato', email: 'lerato@example.com', workspaceUnitId: 'branch-hq', regionId: 'region-central' },
      { id: 'consultant-2', user_id: 'consultant-2', name: 'Aisha', email: 'aisha@example.com', workspaceUnitId: 'branch-waterfall', regionId: 'region-central' },
      { id: 'user-hq', user_id: 'user-hq', name: 'Maya Pillay', email: 'maya@example.com', workspaceUnitId: 'branch-hq', regionId: 'region-central' },
    ],
    applications: [
      {
        key: 'app-1',
        regionId: 'region-central',
        branchId: 'branch-hq',
        consultant: 'Lerato',
        assignedUserId: 'consultant-1',
        financeStageLabel: 'Bank Feedback',
        status: 'active',
        lastActivityAt: new Date().toISOString(),
        lastActivityLabel: 'Today',
        createdAt: new Date().toISOString(),
      },
      {
        key: 'app-2',
        regionId: 'region-central',
        branchId: 'branch-waterfall',
        consultant: 'Aisha',
        assignedUserId: 'consultant-2',
        financeStageLabel: 'Approved',
        status: 'approved',
        lastActivityAt: new Date().toISOString(),
        lastActivityLabel: 'Today',
        createdAt: new Date().toISOString(),
      },
    ],
  }

  const branchPerformance = service.getBranchPerformance(scope)
  const regionPerformance = service.getRegionPerformance(scope, branchPerformance)
  assert.equal(regionPerformance.length, 1)
  assert.equal(regionPerformance[0].region, 'Gauteng Central')
  assert.equal(regionPerformance[0].branches, 2)
  assert.equal(regionPerformance[0].consultants, 3)
  assert.equal(regionPerformance[0].activeApplications, 2)

  const hqContext = makeContext()
  const demoOnlySnapshot = service.buildBondOrganisationSnapshot({
    context: hqContext,
    workspaceId: 'workspace-1',
    options: {
      includeDemoRows: false,
    },
    applicationSnapshot: {
      rows: [
      createApplicationRow({
        id: 'demo-only-1',
        buyerName: 'Demo Buyer 1',
        regionId: 'region-demo',
        region: 'Demo Region',
        branchId: 'branch-demo',
        branch: 'Demo Branch',
        consultant: 'Demo Consultant',
        assignedUserId: 'demo-user',
        source: 'demo',
        isDemo: true,
        __demo: true,
        synthetic: true,
      }),
      ],
    },
  })
  assert.equal(demoOnlySnapshot.kpis.regions, 0)
  assert.equal(demoOnlySnapshot.kpis.branches, 0)
  assert.equal(demoOnlySnapshot.kpis.consultants, 0)
  assert.equal(demoOnlySnapshot.kpis.activeApplications, 0)
  assert.equal(demoOnlySnapshot.organisationScope.scopeLevel, 'hq')
  assert.equal(demoOnlySnapshot.capabilities.canViewRegions, true)
  assert.equal(demoOnlySnapshot.capabilities.canViewBranches, true)
  assert.equal(demoOnlySnapshot.capabilities.canViewConsultants, true)
  assert.equal(demoOnlySnapshot.overview.setupState.key, 'regions')
  assert.equal(demoOnlySnapshot.regionPerformance.length, 0)
  assert.equal(demoOnlySnapshot.branchPerformance.length, 0)
  assert.equal(demoOnlySnapshot.consultantPerformance.length, 0)
  assert.equal(demoOnlySnapshot.applications.length, 0)

  const mixedSnapshot = service.buildBondOrganisationSnapshot({
    context: hqContext,
    workspaceId: 'workspace-1',
    options: {
      includeDemoRows: false,
    },
    applicationSnapshot: {
      rows: [
      createApplicationRow({
        id: 'real-application-1',
        buyerName: 'Real Buyer 1',
        regionId: 'region-real',
        region: 'Gauteng North',
        branchId: 'branch-real',
        branch: 'Pretoria Desk',
        consultant: 'Lerato Example',
        assignedUserId: 'consultant-real',
      }),
      createApplicationRow({
        id: 'demo-application-1',
        buyerName: 'Demo Buyer 22',
        regionId: 'region-demo',
        region: 'Demo Region',
        branchId: 'branch-demo',
        branch: 'Demo Branch',
        consultant: 'Demo Consultant',
        assignedUserId: 'consultant-demo',
        source: 'mock',
      }),
      ],
    },
  })
  assert.equal(mixedSnapshot.kpis.regions, 1)
  assert.equal(mixedSnapshot.kpis.branches, 1)
  assert.equal(mixedSnapshot.kpis.consultants, 1)
  assert.equal(mixedSnapshot.kpis.activeApplications, 1)
  assert.equal(mixedSnapshot.regionPerformance.length, 1)
  assert.equal(mixedSnapshot.regionPerformance[0].region, 'Gauteng North')
  assert.equal(mixedSnapshot.branchPerformance.length, 1)
  assert.equal(mixedSnapshot.branchPerformance[0].branch, 'Pretoria Desk')
  assert.equal(mixedSnapshot.consultantPerformance.length, 1)
  assert.equal(mixedSnapshot.consultantPerformance[0].consultant, 'Lerato Example')
  assert.equal(mixedSnapshot.applications.length, 1)
  assert.equal(mixedSnapshot.applications[0].buyer?.name, 'Real Buyer 1')

  const hqOverviewSnapshot = service.buildBondOrganisationSnapshot({
    context: hqContext,
    workspaceId: 'workspace-1',
    hierarchy: {
      regions: [
        { id: 'region-real', name: 'Gauteng North' },
        { id: 'region-empty', name: 'No Branch Region' },
      ],
      units: [
        { id: 'branch-real', name: 'Pretoria Desk', unit_type: 'branch', region_id: 'region-real' },
        { id: 'branch-empty', name: 'Empty Desk', unit_type: 'branch', region_id: 'region-real', manager_user_id: 'manager-1' },
      ],
    },
    users: [
      { id: 'consultant-real', user_id: 'consultant-real', email: 'real@example.test', role: 'consultant', region_id: 'region-real', workspace_unit_id: 'branch-real' },
    ],
    applicationSnapshot: {
      rows: [
        createApplicationRow({
          id: 'overview-submitted-1',
          buyerName: 'Submitted Buyer',
          regionId: 'region-real',
          region: 'Gauteng North',
          branchId: 'branch-real',
          branch: 'Pretoria Desk',
          consultant: 'Real Consultant',
          assignedUserId: 'consultant-real',
          financeStageLabel: 'Submitted',
          financeStageKey: 'submitted',
        }),
        createApplicationRow({
          id: 'overview-docs-1',
          buyerName: 'Docs Buyer',
          regionId: 'region-real',
          region: 'Gauteng North',
          branchId: 'branch-real',
          branch: 'Pretoria Desk',
          consultant: 'Real Consultant',
          assignedUserId: 'consultant-real',
          financeStageLabel: 'Awaiting Documents',
          financeStageKey: 'awaiting_documents',
          nextAction: 'Upload documents',
        }),
        createApplicationRow({
          id: 'overview-unassigned-1',
          buyerName: 'Unassigned Buyer',
          regionId: 'region-real',
          region: 'Gauteng North',
          branchId: 'branch-empty',
          branch: 'Empty Desk',
          consultant: 'Unassigned',
          assignedUserId: '',
          financeStageLabel: 'Approved',
          financeStageKey: 'approved',
          status: 'approved',
        }),
      ],
    },
  })
  assert.equal(hqOverviewSnapshot.overview.metrics.totalRegions, 2)
  assert.equal(hqOverviewSnapshot.overview.metrics.totalBranches, 2)
  assert.equal(hqOverviewSnapshot.overview.metrics.totalConsultants, 1)
  assert.equal(hqOverviewSnapshot.overview.metrics.activeApplications, 3)
  assert.equal(hqOverviewSnapshot.overview.metrics.submittedApplications, 2)
  assert.equal(hqOverviewSnapshot.overview.metrics.pendingDocumentApplications, 1)
  assert.equal(hqOverviewSnapshot.overview.metrics.unassignedApplications, 1)
  assert.equal(hqOverviewSnapshot.overview.metrics.approvalRate, 33)
  assert.equal(hqOverviewSnapshot.overview.setupState, null)
  assert.equal(hqOverviewSnapshot.overview.structure.regions.length, 2)
  assert.ok(hqOverviewSnapshot.overview.alerts.some((alert) => alert.key === 'pending-documents'))
  assert.ok(hqOverviewSnapshot.overview.alerts.some((alert) => alert.key === 'unassigned-applications'))
  assert.ok(hqOverviewSnapshot.overview.alerts.some((alert) => alert.key === 'region-no-branches-region-empty'))
  assert.ok(hqOverviewSnapshot.overview.alerts.some((alert) => alert.key === 'branch-no-manager-branch-real'))
  assert.ok(hqOverviewSnapshot.overview.alerts.some((alert) => alert.key === 'branch-no-consultants-branch-empty'))
  assert.ok(hqOverviewSnapshot.overview.performance.applicationsByStatus.length >= 2)

  const noBranchesSnapshot = service.buildBondOrganisationSnapshot({
    context: hqContext,
    workspaceId: 'workspace-1',
    hierarchy: {
      regions: [{ id: 'region-setup', name: 'Setup Region' }],
      units: [],
    },
    applicationSnapshot: { rows: [] },
  })
  assert.equal(noBranchesSnapshot.overview.setupState.key, 'branches')

  const noConsultantsSnapshot = service.buildBondOrganisationSnapshot({
    context: hqContext,
    workspaceId: 'workspace-1',
    hierarchy: {
      regions: [{ id: 'region-setup', name: 'Setup Region' }],
      units: [{ id: 'branch-setup', name: 'Setup Branch', unit_type: 'branch', region_id: 'region-setup' }],
    },
    users: [],
    applicationSnapshot: { rows: [] },
  })
  assert.equal(noConsultantsSnapshot.overview.setupState.key, 'consultants')

  const regionalSnapshot = service.buildBondOrganisationSnapshot({
    context: makeContext({
      userId: 'regional-manager-1',
      workspaceRole: 'regional_manager',
      scopeLevel: 'region',
      regionId: 'region-real',
    }),
    workspaceId: 'workspace-1',
    hierarchy: {
      regions: [
        { id: 'region-real', name: 'Gauteng North' },
        { id: 'region-other', name: 'Western Cape' },
      ],
      units: [
        { id: 'branch-real', name: 'Pretoria Desk', unit_type: 'branch', region_id: 'region-real' },
        { id: 'branch-other', name: 'Cape Desk', unit_type: 'branch', region_id: 'region-other' },
      ],
    },
    users: [
      { id: 'consultant-real', user_id: 'consultant-real', email: 'real@example.test', role: 'consultant', region_id: 'region-real', workspace_unit_id: 'branch-real' },
      { id: 'consultant-other', user_id: 'consultant-other', email: 'other@example.test', role: 'consultant', region_id: 'region-other', workspace_unit_id: 'branch-other' },
    ],
    applicationSnapshot: {
      rows: [
        createApplicationRow({
          id: 'regional-real-1',
          buyerName: 'Regional Buyer 1',
          regionId: 'region-real',
          region: 'Gauteng North',
          branchId: 'branch-real',
          branch: 'Pretoria Desk',
          consultant: 'Regional Consultant',
          assignedUserId: 'consultant-real',
        }),
        createApplicationRow({
          id: 'regional-other-1',
          buyerName: 'Other Buyer 1',
          regionId: 'region-other',
          region: 'Western Cape',
          branchId: 'branch-other',
          branch: 'Cape Desk',
          consultant: 'Other Consultant',
          assignedUserId: 'consultant-other',
        }),
      ],
    },
  })
  assert.equal(regionalSnapshot.organisationScope.scopeLevel, 'region')
  assert.equal(regionalSnapshot.capabilities.canViewRegions, true)
  assert.equal(regionalSnapshot.capabilities.canViewBranches, true)
  assert.equal(regionalSnapshot.capabilities.canViewConsultants, true)
  assert.deepEqual(regionalSnapshot.regions.map((region) => region.id), ['region-real'])
  assert.deepEqual(regionalSnapshot.branches.map((branch) => branch.id), ['branch-real'])
  assert.deepEqual(regionalSnapshot.applications.map((row) => row.client || row.buyer?.name), ['Regional Buyer 1'])
  assert.equal(regionalSnapshot.overview.metrics.totalRegions, 1)
  assert.equal(regionalSnapshot.overview.metrics.totalBranches, 1)
  assert.equal(regionalSnapshot.overview.metrics.totalConsultants, 1)

  const branchSnapshot = service.buildBondOrganisationSnapshot({
    context: makeContext({
      userId: 'branch-manager-1',
      workspaceRole: 'branch_manager',
      scopeLevel: 'branch',
      regionId: 'region-real',
      workspaceUnitId: 'branch-real',
    }),
    workspaceId: 'workspace-1',
    hierarchy: {
      regions: [
        { id: 'region-real', name: 'Gauteng North' },
      ],
      units: [
        { id: 'branch-real', name: 'Pretoria Desk', unit_type: 'branch', region_id: 'region-real' },
        { id: 'branch-other', name: 'Cape Desk', unit_type: 'branch', region_id: 'region-real' },
      ],
    },
    users: [
      { id: 'consultant-real', user_id: 'consultant-real', email: 'real@example.test', role: 'consultant', region_id: 'region-real', workspace_unit_id: 'branch-real' },
      { id: 'consultant-other', user_id: 'consultant-other', email: 'other@example.test', role: 'consultant', region_id: 'region-real', workspace_unit_id: 'branch-other' },
    ],
    applicationSnapshot: {
      rows: [
        createApplicationRow({
          id: 'branch-real-1',
          buyerName: 'Branch Buyer 1',
          regionId: 'region-real',
          region: 'Gauteng North',
          branchId: 'branch-real',
          branch: 'Pretoria Desk',
          consultant: 'Branch Consultant',
          assignedUserId: 'consultant-real',
        }),
        createApplicationRow({
          id: 'branch-other-1',
          buyerName: 'Other Branch Buyer 1',
          regionId: 'region-real',
          region: 'Gauteng North',
          branchId: 'branch-other',
          branch: 'Cape Desk',
          consultant: 'Other Branch Consultant',
          assignedUserId: 'consultant-other',
        }),
      ],
    },
  })
  assert.equal(branchSnapshot.organisationScope.scopeLevel, 'branch')
  assert.equal(branchSnapshot.capabilities.canViewRegions, false)
  assert.equal(branchSnapshot.capabilities.canViewBranches, true)
  assert.equal(branchSnapshot.capabilities.canViewConsultants, true)
  assert.deepEqual(branchSnapshot.branches.map((branch) => branch.id), ['branch-real'])
  assert.deepEqual(branchSnapshot.applications.map((row) => row.client || row.buyer?.name), ['Branch Buyer 1'])
  assert.equal(branchSnapshot.overview.metrics.totalRegions, 0)
  assert.equal(branchSnapshot.overview.metrics.totalBranches, 1)
  assert.equal(branchSnapshot.overview.metrics.totalConsultants, 1)

  console.log('bondOrganisationService tests passed')
} finally {
  await server.close()
}
