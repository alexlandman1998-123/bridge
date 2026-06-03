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
      currentWorkspace: { id: 'workspace-branches', type: 'bond_originator', workspace_kind: 'bond_company' },
      currentMembership: {
        id: `membership-${userId}`,
        workspaceId: 'workspace-branches',
        organisation_id: 'workspace-branches',
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
    { id: 'regional-north', user_id: 'regional-north', first_name: 'Regional', last_name: 'North', role: 'regional_manager', workspace_role: 'regional_manager', region_id: 'region-north' },
    { id: 'branch-manager', user_id: 'branch-manager', first_name: 'Branch', last_name: 'Manager', role: 'branch_manager', workspace_role: 'branch_manager', region_id: 'region-north', workspace_unit_id: 'branch-north' },
    { id: 'consultant-a', user_id: 'consultant-a', first_name: 'Consultant', last_name: 'One', role: 'consultant', workspace_role: 'consultant', region_id: 'region-north', workspace_unit_id: 'branch-north' },
  ]
  const hqContext = makeContext()

  await service.createBondRegion({ id: 'region-north', name: 'Gauteng North', code: 'GN' }, hqContext, 'workspace-branches', { users, forceLocal: true })
  await service.createBondRegion({ id: 'region-south', name: 'Western Cape', code: 'WC' }, hqContext, 'workspace-branches', { users, forceLocal: true })
  const regions = service.__bondOrganisationServiceTestUtils.getRegionRows('workspace-branches')

  const northBranch = await service.createBondBranch({
    id: 'branch-north',
    name: ' Pretoria Branch ',
    regionId: 'region-north',
    code: ' pta ',
    officeLocation: 'Pretoria',
    contactEmail: 'pretoria@example.test',
    contactNumber: '+27 12 555 0101',
  }, hqContext, 'workspace-branches', { users, regions, forceLocal: true })
  assert.equal(northBranch.name, 'Pretoria Branch')
  assert.equal(northBranch.code, 'PTA')
  assert.equal(northBranch.regionId, 'region-north')

  await assert.rejects(
    () => service.createBondBranch({ name: 'Duplicate Branch', regionId: 'region-north', code: 'pta' }, hqContext, 'workspace-branches', { users, regions, forceLocal: true }),
    (error) => error.fieldErrors?.code === 'Branch code must be unique within this organisation.',
  )

  await assert.rejects(
    () => service.createBondBranch({ name: 'Email Bad', regionId: 'region-north', contactEmail: 'not-an-email' }, hqContext, 'workspace-branches', { users, regions, forceLocal: true }),
    (error) => error.fieldErrors?.contactEmail === 'Enter a valid contact email.',
  )

  const southBranch = await service.createBondBranch({
    id: 'branch-south',
    name: 'Cape Branch',
    regionId: 'region-south',
    code: 'CPT',
  }, hqContext, 'workspace-branches', { users, regions, forceLocal: true })
  assert.equal(southBranch.regionId, 'region-south')

  const editedNorth = await service.updateBondBranch('branch-north', {
    name: 'Pretoria Central Branch',
    regionId: 'region-north',
    code: 'PTC',
    contactEmail: 'central@example.test',
    contactNumber: '+27 12 555 0199',
    notes: 'Updated branch record',
  }, hqContext, 'workspace-branches', { users, regions, forceLocal: true })
  assert.equal(editedNorth.name, 'Pretoria Central Branch')
  assert.equal(editedNorth.contactEmail, 'central@example.test')

  const assignedNorth = await service.assignBondBranchManager('branch-north', 'branch-manager', hqContext, 'workspace-branches', { users, regions, forceLocal: true })
  assert.equal(assignedNorth.managerUserId, 'branch-manager')

  const branchesBeforeMove = service.__bondOrganisationServiceTestUtils.getBranchRows('workspace-branches')
  const applications = [
    {
      key: 'app-north-1',
      regionId: 'region-north',
      branchId: 'branch-north',
      workspaceUnitId: 'branch-north',
      consultant: 'Consultant One',
      assignedUserId: 'consultant-a',
      financeStageLabel: 'Submitted',
      financeStageKey: 'submitted',
      status: 'submitted',
      lastActivityAt: '2026-05-20T10:00:00.000Z',
      createdAt: '2026-05-18T10:00:00.000Z',
    },
  ]
  const hqSnapshot = service.buildBondOrganisationSnapshot({
    context: hqContext,
    workspaceId: 'workspace-branches',
    hierarchy: { regions, units: branchesBeforeMove },
    users,
    applicationSnapshot: { rows: applications },
    options: {
      regions,
      branches: branchesBeforeMove,
      activityEvents: service.__bondOrganisationServiceTestUtils.getActivityRows('workspace-branches'),
    },
  })
  assert.equal(hqSnapshot.overview.metrics.totalBranches, 2)
  assert.equal(hqSnapshot.regionPerformance.find((row) => row.id === 'region-north').branches, 1)
  assert.ok(hqSnapshot.recentActivity.some((row) => row.type === 'Branch manager assigned'))

  const branchWorkspace = service.getBondBranchWorkspace('branch-north', {
    organisationScope: hqSnapshot.organisationScope,
    regions: hqSnapshot.regions,
    branches: hqSnapshot.branches,
    consultants: hqSnapshot.consultants,
    applications: hqSnapshot.applications,
    activityEvents: service.__bondOrganisationServiceTestUtils.getActivityRows('workspace-branches'),
  })
  assert.equal(branchWorkspace.metrics.consultants, 2)
  assert.equal(branchWorkspace.metrics.activeApplications, 1)
  assert.equal(branchWorkspace.metrics.submittedApplications, 1)
  assert.equal(branchWorkspace.branch.manager, 'Branch Manager')

  const regionalContext = makeContext({ userId: 'regional-north', workspaceRole: 'regional_manager', scopeLevel: 'region', regionId: 'region-north' })
  const regionalSnapshot = service.buildBondOrganisationSnapshot({
    context: regionalContext,
    workspaceId: 'workspace-branches',
    hierarchy: { regions, units: branchesBeforeMove },
    users,
    applicationSnapshot: { rows: applications },
    options: { regions, branches: branchesBeforeMove },
  })
  assert.deepEqual(regionalSnapshot.branchPerformance.map((row) => row.id), ['branch-north'])
  await assert.rejects(
    () => service.moveBondBranchToRegion('branch-north', 'region-south', regionalContext, 'workspace-branches', { users, regions, forceLocal: true }),
    /You do not have permission to manage branches/,
  )

  const branchContext = makeContext({ userId: 'branch-manager', workspaceRole: 'branch_manager', scopeLevel: 'branch', regionId: 'region-north', workspaceUnitId: 'branch-north' })
  const branchSnapshot = service.buildBondOrganisationSnapshot({
    context: branchContext,
    workspaceId: 'workspace-branches',
    hierarchy: { regions, units: branchesBeforeMove },
    users,
    applicationSnapshot: { rows: applications },
    options: { regions, branches: branchesBeforeMove },
  })
  assert.deepEqual(branchSnapshot.branchPerformance.map((row) => row.id), ['branch-north'])
  assert.equal(branchSnapshot.capabilities.canViewBranches, true)

  const consultantContext = makeContext({ userId: 'consultant-a', workspaceRole: 'consultant', scopeLevel: 'assigned', regionId: 'region-north', workspaceUnitId: 'branch-north' })
  const consultantSnapshot = service.buildBondOrganisationSnapshot({
    context: consultantContext,
    workspaceId: 'workspace-branches',
    hierarchy: { regions, units: branchesBeforeMove },
    users,
    applicationSnapshot: { rows: applications },
    options: { regions, branches: branchesBeforeMove },
  })
  assert.equal(consultantSnapshot.capabilities.canViewBranches, false)
  assert.equal(consultantSnapshot.branchPerformance.length, 0)

  const movedNorth = await service.moveBondBranchToRegion('branch-north', 'region-south', hqContext, 'workspace-branches', { users, regions, forceLocal: true })
  assert.equal(movedNorth.regionId, 'region-south')
  const branchesAfterMove = service.__bondOrganisationServiceTestUtils.getBranchRows('workspace-branches')
  const movedSnapshot = service.buildBondOrganisationSnapshot({
    context: hqContext,
    workspaceId: 'workspace-branches',
    hierarchy: { regions, units: branchesAfterMove },
    users,
    applicationSnapshot: { rows: [] },
    options: {
      regions,
      branches: branchesAfterMove,
      activityEvents: service.__bondOrganisationServiceTestUtils.getActivityRows('workspace-branches'),
    },
  })
  assert.equal(movedSnapshot.regionPerformance.find((row) => row.id === 'region-north').branches, 0)
  assert.equal(movedSnapshot.regionPerformance.find((row) => row.id === 'region-south').branches, 2)
  assert.ok(movedSnapshot.recentActivity.some((row) => row.type === 'Branch moved region'))

  assert.throws(
    () => service.getBondBranchWorkspace('branch-south', {
      organisationScope: regionalSnapshot.organisationScope,
      regions,
      branches: branchesBeforeMove,
      consultants: users,
      applications,
    }),
    /You do not have permission to manage branches/,
  )

  console.log('bondBranchesManagementService tests passed')
} finally {
  await server.close()
}
