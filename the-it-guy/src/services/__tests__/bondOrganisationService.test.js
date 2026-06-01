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
      financeStageLabel: 'Bank Feedback',
      financeStageKey: 'bank_feedback',
      status: 'active',
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

  console.log('bondOrganisationService tests passed')
} finally {
  await server.close()
}
