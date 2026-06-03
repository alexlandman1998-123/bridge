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
  service.__bondOrganisationServiceTestUtils.clearRegionStores()

  function makeContext({
    userId = 'user-hq',
    workspaceRole = 'owner',
    scopeLevel = 'workspace_hq',
    regionId = '',
    workspaceUnitId = '',
  } = {}) {
    return {
      appRole: 'bond_originator',
      workspaceType: 'bond_originator',
      userId,
      email: `${userId}@example.test`,
      profile: { id: userId, email: `${userId}@example.test`, fullName: userId },
      currentWorkspace: { id: 'workspace-regions', type: 'bond_originator', workspace_kind: 'bond_company' },
      currentMembership: {
        id: `membership-${userId}`,
        workspaceId: 'workspace-regions',
        organisation_id: 'workspace-regions',
        user_id: userId,
        workspaceRole,
        workspace_role: workspaceRole,
        scopeLevel,
        scope_level: scopeLevel,
        regionId,
        region_id: regionId,
        workspaceUnitId,
        workspace_unit_id: workspaceUnitId,
        status: 'active',
      },
    }
  }

  const users = [
    { id: 'user-hq', user_id: 'user-hq', first_name: 'HQ', last_name: 'Owner', role: 'owner', workspace_role: 'owner' },
    { id: 'regional-a', user_id: 'regional-a', first_name: 'Regional', last_name: 'Manager', role: 'regional_manager', workspace_role: 'regional_manager' },
    { id: 'branch-manager', user_id: 'branch-manager', first_name: 'Branch', last_name: 'Manager', role: 'branch_manager', workspace_role: 'branch_manager', region_id: 'region-north', workspace_unit_id: 'branch-north' },
    { id: 'consultant-a', user_id: 'consultant-a', first_name: 'Consultant', last_name: 'One', role: 'consultant', workspace_role: 'consultant', region_id: 'region-north', workspace_unit_id: 'branch-north' },
  ]
  const hqContext = makeContext()

  const north = await service.createBondRegion({
    id: 'region-north',
    name: ' Gauteng North ',
    code: ' gn ',
    status: 'active',
    notes: 'Primary region',
  }, hqContext, 'workspace-regions', { users, forceLocal: true })

  assert.equal(north.name, 'Gauteng North')
  assert.equal(north.code, 'GN')
  assert.equal(north.status, 'active')

  await assert.rejects(
    () => service.createBondRegion({ name: 'Gauteng Duplicate', code: 'gn' }, hqContext, 'workspace-regions', { users, forceLocal: true }),
    (error) => error.fieldErrors?.code === 'Region code must be unique within this organisation.',
  )

  const south = await service.createBondRegion({
    id: 'region-south',
    name: 'Western Cape',
    code: 'WC',
  }, hqContext, 'workspace-regions', { users, forceLocal: true })
  assert.equal(south.name, 'Western Cape')

  const updatedNorth = await service.updateBondRegion('region-north', {
    name: 'Gauteng North Region',
    code: 'GNR',
    notes: 'Updated notes',
    status: 'inactive',
  }, hqContext, 'workspace-regions', { users, forceLocal: true })
  assert.equal(updatedNorth.name, 'Gauteng North Region')
  assert.equal(updatedNorth.status, 'inactive')

  const assignedNorth = await service.assignBondRegionManager('region-north', 'regional-a', hqContext, 'workspace-regions', { users, forceLocal: true })
  assert.equal(assignedNorth.managerUserId, 'regional-a')

  await assert.rejects(
    () => service.assignBondRegionManager('region-north', 'consultant-a', hqContext, 'workspace-regions', { users, forceLocal: true }),
    (error) => error.fieldErrors?.managerUserId === 'Selected user does not have a compatible region manager role.',
  )

  const applications = [
    {
      key: 'app-north-1',
      regionId: 'region-north',
      branchId: 'branch-north',
      consultant: 'Consultant One',
      assignedUserId: 'consultant-a',
      financeStageLabel: 'Submitted',
      financeStageKey: 'submitted',
      status: 'submitted',
      lastActivityAt: '2026-05-20T10:00:00.000Z',
      createdAt: '2026-05-18T10:00:00.000Z',
    },
    {
      key: 'app-south-1',
      regionId: 'region-south',
      branchId: 'branch-south',
      consultant: 'Other Consultant',
      assignedUserId: 'consultant-b',
      financeStageLabel: 'Document Collection',
      financeStageKey: 'documents',
      status: 'active',
      lastActivityAt: '2026-05-20T10:00:00.000Z',
      createdAt: '2026-05-18T10:00:00.000Z',
    },
  ]
  const regions = service.__bondOrganisationServiceTestUtils.getRegionRows('workspace-regions')
  const branches = [
    { id: 'branch-north', name: 'Pretoria Branch', unit_type: 'branch', region_id: 'region-north' },
    { id: 'branch-south', name: 'Cape Branch', unit_type: 'branch', region_id: 'region-south' },
  ]

  const hqSnapshot = service.buildBondOrganisationSnapshot({
    context: hqContext,
    workspaceId: 'workspace-regions',
    hierarchy: { regions, units: branches },
    users,
    applicationSnapshot: { rows: applications },
    options: {
      regions,
      activityEvents: service.__bondOrganisationServiceTestUtils.getActivityRows('workspace-regions'),
    },
  })
  assert.deepEqual(hqSnapshot.regionPerformance.map((row) => row.id).sort(), ['region-north', 'region-south'])
  assert.equal(hqSnapshot.regionPerformance.find((row) => row.id === 'region-north').submittedApplications, 1)
  assert.ok(hqSnapshot.recentActivity.some((row) => row.type === 'Regional manager assigned'))

  const regionalSnapshot = service.buildBondOrganisationSnapshot({
    context: makeContext({ userId: 'regional-a', workspaceRole: 'regional_manager', scopeLevel: 'region', regionId: 'region-north' }),
    workspaceId: 'workspace-regions',
    hierarchy: { regions, units: branches },
    users,
    applicationSnapshot: { rows: applications },
    options: { regions },
  })
  assert.deepEqual(regionalSnapshot.regions.map((region) => region.id), ['region-north'])
  assert.equal(regionalSnapshot.capabilities.canViewRegions, true)
  assert.equal(regionalSnapshot.capabilities.canManageRegions, false)

  await assert.rejects(
    () => service.createBondRegion({ name: 'Not Allowed' }, makeContext({ userId: 'regional-a', workspaceRole: 'regional_manager', scopeLevel: 'region', regionId: 'region-north' }), 'workspace-regions', { users, forceLocal: true }),
    /You do not have permission to manage regions/,
  )

  const branchSnapshot = service.buildBondOrganisationSnapshot({
    context: makeContext({ userId: 'branch-manager', workspaceRole: 'branch_manager', scopeLevel: 'branch', regionId: 'region-north', workspaceUnitId: 'branch-north' }),
    workspaceId: 'workspace-regions',
    hierarchy: { regions, units: branches },
    users,
    applicationSnapshot: { rows: applications },
    options: { regions },
  })
  assert.equal(branchSnapshot.capabilities.canViewRegions, false)
  assert.equal(branchSnapshot.regionPerformance.length, 0)

  const consultantSnapshot = service.buildBondOrganisationSnapshot({
    context: makeContext({ userId: 'consultant-a', workspaceRole: 'consultant', scopeLevel: 'assigned', regionId: 'region-north', workspaceUnitId: 'branch-north' }),
    workspaceId: 'workspace-regions',
    hierarchy: { regions, units: branches },
    users,
    applicationSnapshot: { rows: applications },
    options: { regions },
  })
  assert.equal(consultantSnapshot.organisationScope.scopeLevel, 'consultant')
  assert.equal(consultantSnapshot.capabilities.canViewRegions, false)

  const workspace = service.getBondRegionWorkspace('region-north', {
    organisationScope: hqSnapshot.organisationScope,
    regions: hqSnapshot.regions,
    branches: hqSnapshot.branches,
    consultants: hqSnapshot.consultants,
    applications: hqSnapshot.applications,
  })
  assert.equal(workspace.metrics.branches, 1)
  assert.equal(workspace.metrics.consultants, 3)
  assert.equal(workspace.metrics.activeApplications, 1)
  assert.equal(workspace.metrics.submittedApplications, 1)

  assert.throws(
    () => service.getBondRegionWorkspace('region-south', {
      organisationScope: regionalSnapshot.organisationScope,
      regions,
      branches,
      consultants: users,
      applications,
    }),
    /You do not have permission to manage regions/,
  )

  console.log('bondRegionsManagementService tests passed')
} finally {
  await server.close()
}
