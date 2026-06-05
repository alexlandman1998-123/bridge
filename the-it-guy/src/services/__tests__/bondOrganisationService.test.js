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
    transactionOverrides = {},
    extra = {},
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
        ...transactionOverrides,
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
      ...extra,
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
  assert.equal(hqOverviewSnapshot.organisationCommandCentre.scopeLabel, 'National')
  assert.equal(hqOverviewSnapshot.organisationCommandCentre.summary.activeApplications, 3)
  assert.equal(hqOverviewSnapshot.organisationCommandCentre.summary.approvalRate, 100)
  assert.equal(hqOverviewSnapshot.organisationCommandCentre.summary.revenueForecast, null)
  assert.equal(hqOverviewSnapshot.organisationCommandCentre.health.applicationsWithoutOwner, 1)
  assert.ok(hqOverviewSnapshot.organisationCommandCentre.health.items.some((item) => item.key === 'applications-without-owner'))
  assert.ok(hqOverviewSnapshot.organisationCommandCentre.branchPerformance.length <= 5)
  assert.ok(hqOverviewSnapshot.organisationCommandCentre.consultantWorkload.length <= 8)

  const consultantCommandSnapshot = service.buildBondOrganisationSnapshot({
    context: hqContext,
    workspaceId: 'workspace-1',
    hierarchy: {
      regions: [{ id: 'region-command', name: 'Gauteng Command' }],
      units: [{ id: 'branch-command', name: 'Command Desk', unit_type: 'branch', region_id: 'region-command' }],
    },
    users: [
      { id: 'consultant-alpha', user_id: 'consultant-alpha', email: 'alpha@example.test', name: 'Alpha Consultant', role: 'consultant', region_id: 'region-command', workspace_unit_id: 'branch-command' },
      { id: 'consultant-beta', user_id: 'consultant-beta', email: 'beta@example.test', name: 'Beta Consultant', role: 'consultant', region_id: 'region-command', workspace_unit_id: 'branch-command' },
      { id: 'consultant-empty', user_id: 'consultant-empty', email: 'empty@example.test', name: 'Empty Consultant', role: 'consultant', region_id: 'region-command', workspace_unit_id: 'branch-command' },
    ],
    applicationSnapshot: {
      rows: [
        createApplicationRow({
          id: 'command-alpha-approved',
          buyerName: 'Alpha Approved',
          regionId: 'region-command',
          region: 'Gauteng Command',
          branchId: 'branch-command',
          branch: 'Command Desk',
          consultant: 'Alpha Consultant',
          assignedUserId: 'consultant-alpha',
          financeStageLabel: 'Approved',
          financeStageKey: 'approved',
          status: 'approved',
          transactionOverrides: {
            bond_amount: 1_200_000,
            gross_commission_amount: 12_000,
          },
        }),
        createApplicationRow({
          id: 'command-alpha-submitted',
          buyerName: 'Alpha Submitted',
          regionId: 'region-command',
          region: 'Gauteng Command',
          branchId: 'branch-command',
          branch: 'Command Desk',
          consultant: 'Alpha Consultant',
          assignedUserId: 'consultant-alpha',
          financeStageLabel: 'Submitted',
          financeStageKey: 'submitted',
          status: 'submitted',
          transactionOverrides: {
            purchase_price: 800_000,
            agent_commission_amount: 3_500,
            agency_commission_amount: 4_500,
          },
        }),
        createApplicationRow({
          id: 'command-alpha-completed',
          buyerName: 'Alpha Completed',
          regionId: 'region-command',
          region: 'Gauteng Command',
          branchId: 'branch-command',
          branch: 'Command Desk',
          consultant: 'Alpha Consultant',
          assignedUserId: 'consultant-alpha',
          financeStageLabel: 'Registered',
          financeStageKey: 'registered',
          status: 'completed',
          extra: { lifecycleState: 'completed' },
          transactionOverrides: {
            bond_amount: 5_000_000,
            gross_commission_amount: 50_000,
            registered_at: new Date().toISOString(),
          },
        }),
        createApplicationRow({
          id: 'command-beta-docs',
          buyerName: 'Beta Docs',
          regionId: 'region-command',
          region: 'Gauteng Command',
          branchId: 'branch-command',
          branch: 'Command Desk',
          consultant: 'Beta Consultant',
          assignedUserId: 'consultant-beta',
          financeStageLabel: 'Awaiting Documents',
          financeStageKey: 'awaiting_documents',
          status: 'active',
          transactionOverrides: {
            bond_amount: 500_000,
          },
        }),
      ],
    },
  })
  const consultantCommand = consultantCommandSnapshot.overview.consultantCommandCentre
  assert.equal(consultantCommand.summary.totalPipelineValue, 2_500_000)
  assert.equal(consultantCommand.summary.activeApplications, 3)
  assert.equal(consultantCommand.summary.approvalRate, 67)
  assert.equal(consultantCommand.summary.forecastRevenue, 20_000)
  assert.equal(consultantCommand.summary.averageRevenuePerConsultant, 6_667)
  assert.equal(consultantCommand.summary.registrations, 1)
  assert.equal(consultantCommand.directory.find((row) => row.id === 'consultant-alpha').activeApplications, 2)
  assert.equal(consultantCommand.directory.find((row) => row.id === 'consultant-alpha').pipelineValue, 2_000_000)
  assert.equal(consultantCommand.directory.find((row) => row.id === 'consultant-alpha').forecastRevenue, 20_000)
  assert.equal(consultantCommand.directory.find((row) => row.id === 'consultant-beta').approvalRate, null)
  assert.equal(consultantCommand.leaderboards.pipeline[0].id, 'consultant-alpha')
  assert.equal(consultantCommand.rankings.conversion[0].id, 'consultant-alpha')
  assert.ok(consultantCommand.healthCards.some((row) => row.key === 'files-without-owner' && row.count === 0))

  const branchCommandSnapshot = service.buildBondOrganisationSnapshot({
    context: hqContext,
    workspaceId: 'workspace-1',
    hierarchy: {
      regions: [
        { id: 'region-branch-a', name: 'Gauteng' },
        { id: 'region-branch-b', name: 'Western Cape' },
      ],
      units: [
        { id: 'branch-alpha', name: 'Alpha Branch', unit_type: 'branch', region_id: 'region-branch-a', manager_user_id: 'manager-alpha' },
        { id: 'branch-beta', name: 'Beta Branch', unit_type: 'branch', region_id: 'region-branch-b' },
        { id: 'branch-empty', name: 'Empty Branch', unit_type: 'branch', region_id: 'region-branch-b' },
      ],
    },
    users: [
      { id: 'consultant-alpha-1', user_id: 'consultant-alpha-1', email: 'a1@example.test', name: 'Alpha One', role: 'consultant', region_id: 'region-branch-a', workspace_unit_id: 'branch-alpha' },
      { id: 'consultant-alpha-2', user_id: 'consultant-alpha-2', email: 'a2@example.test', name: 'Alpha Two', role: 'consultant', region_id: 'region-branch-a', workspace_unit_id: 'branch-alpha' },
      { id: 'consultant-floating', user_id: 'consultant-floating', email: 'float@example.test', name: 'Floating Consultant', role: 'consultant', region_id: 'region-branch-b', workspace_unit_id: '' },
    ],
    applicationSnapshot: {
      rows: [
        createApplicationRow({
          id: 'branch-alpha-approved',
          buyerName: 'Alpha Approved',
          regionId: 'region-branch-a',
          region: 'Gauteng',
          branchId: 'branch-alpha',
          branch: 'Alpha Branch',
          consultant: 'Alpha One',
          assignedUserId: 'consultant-alpha-1',
          financeStageLabel: 'Approved',
          financeStageKey: 'approved',
          status: 'approved',
          transactionOverrides: { bond_amount: 1_000_000, gross_commission_amount: 10_000 },
        }),
        createApplicationRow({
          id: 'branch-alpha-submitted',
          buyerName: 'Alpha Submitted',
          regionId: 'region-branch-a',
          region: 'Gauteng',
          branchId: 'branch-alpha',
          branch: 'Alpha Branch',
          consultant: 'Alpha Two',
          assignedUserId: 'consultant-alpha-2',
          financeStageLabel: 'Submitted',
          financeStageKey: 'submitted',
          status: 'submitted',
          transactionOverrides: { purchase_price: 750_000 },
        }),
        createApplicationRow({
          id: 'branch-alpha-registered',
          buyerName: 'Alpha Registered',
          regionId: 'region-branch-a',
          region: 'Gauteng',
          branchId: 'branch-alpha',
          branch: 'Alpha Branch',
          consultant: 'Alpha One',
          assignedUserId: 'consultant-alpha-1',
          financeStageLabel: 'Registered',
          financeStageKey: 'registered',
          status: 'completed',
          extra: { lifecycleState: 'completed' },
          transactionOverrides: { bond_amount: 5_000_000, registered_at: new Date().toISOString() },
        }),
        createApplicationRow({
          id: 'branch-beta-docs',
          buyerName: 'Beta Docs',
          regionId: 'region-branch-b',
          region: 'Western Cape',
          branchId: 'branch-beta',
          branch: 'Beta Branch',
          consultant: 'Unassigned',
          assignedUserId: '',
          financeStageLabel: 'Awaiting Documents',
          financeStageKey: 'awaiting_documents',
          status: 'active',
          transactionOverrides: { bond_amount: 500_000 },
        }),
        createApplicationRow({
          id: 'branch-no-branch',
          buyerName: 'No Branch',
          regionId: 'region-branch-b',
          region: 'Western Cape',
          branchId: '',
          branch: 'Unassigned',
          consultant: 'Unassigned',
          assignedUserId: '',
          financeStageLabel: 'Submitted',
          financeStageKey: 'submitted',
          status: 'submitted',
          transactionOverrides: { bond_amount: 250_000 },
        }),
      ],
    },
  })
  const branchCommand = branchCommandSnapshot.overview.branchCommandCentre
  assert.equal(branchCommand.summary.totalBranches, 3)
  assert.equal(branchCommand.summary.activeBranches, 2)
  assert.equal(branchCommand.summary.pipelineValue, 2_250_000)
  assert.equal(branchCommand.summary.activeApplications, 3)
  assert.equal(branchCommand.summary.approvalRate, 67)
  assert.equal(branchCommand.summary.registrationsThisMonth, 1)
  assert.equal(branchCommand.summary.branchesAtRisk, 3)
  assert.equal(branchCommand.summary.averageConsultantLoad, 1.5)
  assert.equal(branchCommand.summary.forecastRevenue, 10_000)
  assert.equal(branchCommand.health.branchesWithoutManagers, 2)
  assert.equal(branchCommand.health.branchesWithNoConsultants, 2)
  assert.equal(branchCommand.health.applicationsWithoutBranch, 1)
  assert.equal(branchCommand.directory.find((row) => row.branchId === 'branch-alpha').activeApplications, 2)
  assert.equal(branchCommand.directory.find((row) => row.branchId === 'branch-alpha').pipelineValue, 1_750_000)
  assert.equal(branchCommand.directory.find((row) => row.branchId === 'branch-alpha').approvalRate, 67)
  assert.equal(branchCommand.directory.find((row) => row.branchId === 'branch-alpha').capacityPercent, 4)
  assert.equal(branchCommand.directory.find((row) => row.branchId === 'branch-beta').riskLevel, 'high')
  assert.equal(branchCommand.leaderboards.pipeline[0].branchId, 'branch-alpha')
  assert.equal(branchCommand.leaderboards.volume[0].branchId, 'branch-alpha')
  assert.equal(branchCommand.leaderboards.approval[0].branchId, 'branch-alpha')
  assert.equal(branchCommand.leaderboards.risk[0].branchId, 'branch-alpha')
  assert.equal(branchCommand.regionalDistribution[0].regionName, 'Gauteng')
  assert.equal(branchCommand.branchWorkload[0].branchId, 'branch-beta')

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

  const smallOriginatorSnapshot = service.buildBondOrganisationSnapshot({
    context: hqContext,
    workspaceId: 'workspace-1',
    users: [
      { id: 'consultant-solo', user_id: 'consultant-solo', email: 'solo@example.test', role: 'consultant', scope_level: 'assigned' },
    ],
    applicationSnapshot: { rows: [] },
  })
  assert.equal(smallOriginatorSnapshot.organisationCommandCentre.scopeLabel, 'Organisation')
  assert.equal(smallOriginatorSnapshot.organisationCommandCentre.structure.hasHierarchy, false)
  assert.equal(smallOriginatorSnapshot.organisationCommandCentre.summary.approvalRate, null)
  assert.equal(smallOriginatorSnapshot.organisationCommandCentre.summary.revenueForecast, null)
  assert.ok(!smallOriginatorSnapshot.organisationCommandCentre.health.items.some((item) => item.key === 'regions-missing-coverage'))

  const largeOriginatorSnapshot = service.buildBondOrganisationSnapshot({
    context: hqContext,
    workspaceId: 'workspace-1',
    hierarchy: {
      regions: Array.from({ length: 8 }, (_, index) => ({ id: `region-${index}`, name: `Region ${index}` })),
      units: Array.from({ length: 8 }, (_, index) => ({ id: `branch-${index}`, name: `Branch ${index}`, unit_type: 'branch', region_id: `region-${index}` })),
    },
    users: Array.from({ length: 8 }, (_, index) => ({
      id: `consultant-${index}`,
      user_id: `consultant-${index}`,
      email: `consultant-${index}@example.test`,
      role: 'consultant',
      region_id: `region-${index}`,
      workspace_unit_id: `branch-${index}`,
    })),
    applicationSnapshot: {
      rows: Array.from({ length: 8 }, (_, index) => createApplicationRow({
        id: `large-${index}`,
        buyerName: `Large Buyer ${index}`,
        regionId: `region-${index}`,
        branchId: `branch-${index}`,
        consultant: `Consultant ${index}`,
        assignedUserId: `consultant-${index}`,
        transactionOverrides: { bond_amount: 1000000 + index },
      })),
    },
  })
  assert.equal(largeOriginatorSnapshot.organisationCommandCentre.scopeLabel, 'National')
  assert.equal(largeOriginatorSnapshot.organisationCommandCentre.structure.topRegions.length, 6)
  assert.equal(largeOriginatorSnapshot.organisationCommandCentre.summary.pipelineValue > 0, true)

  const inactiveRowsSnapshot = service.buildBondOrganisationSnapshot({
    context: hqContext,
    workspaceId: 'workspace-1',
    applicationSnapshot: {
      rows: [
        createApplicationRow({ id: 'active-row', buyerName: 'Active Buyer' }),
        createApplicationRow({
          id: 'registered-row',
          buyerName: 'Registered Buyer',
          status: 'registered',
          financeStageLabel: 'Registered',
          transactionOverrides: { lifecycle_state: 'registered', registered_at: '2026-06-01T10:00:00.000Z' },
        }),
      ],
    },
  })
  assert.equal(inactiveRowsSnapshot.organisationCommandCentre.summary.activeApplications, 1)

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
