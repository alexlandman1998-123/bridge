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
  const { ALL_BOND_ORGANISATION_SCOPE, resolveBondOrganisationScope } = await server.ssrLoadModule('/src/services/bondOrganisationScopeResolver.js')

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
      currentWorkspace: { id: 'workspace-1', type: 'bond_originator' },
      currentMembership: {
        id: `membership-${userId}`,
        organisation_id: 'workspace-1',
        workspaceId: 'workspace-1',
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

  const data = {
    regions: [
      { id: 'region-1', name: 'North' },
      { id: 'region-2', name: 'South' },
    ],
    branches: [
      { id: 'branch-1', region_id: 'region-1', name: 'A' },
      { id: 'branch-2', region_id: 'region-1', name: 'B' },
      { id: 'branch-3', region_id: 'region-2', name: 'C' },
    ],
    consultants: [
      { id: 'consultant-1', user_id: 'consultant-1', region_id: 'region-1', workspace_unit_id: 'branch-1' },
      { id: 'consultant-2', user_id: 'consultant-2', region_id: 'region-1', workspace_unit_id: 'branch-1' },
      { id: 'consultant-3', user_id: 'consultant-3', region_id: 'region-1', workspace_unit_id: 'branch-2' },
      { id: 'consultant-4', user_id: 'consultant-4', region_id: 'region-2', workspace_unit_id: 'branch-3' },
    ],
    applications: [
      { assignedUserId: 'consultant-1', regionId: 'region-1', branchId: 'branch-1' },
      { assignedUserId: 'consultant-2', regionId: 'region-1', branchId: 'branch-1' },
      { assignedUserId: 'consultant-3', regionId: 'region-1', branchId: 'branch-2' },
      { assignedUserId: 'consultant-4', regionId: 'region-2', branchId: 'branch-3' },
    ],
  }

  const hqScope = resolveBondOrganisationScope(makeContext(), data)
  assert.equal(hqScope.scopeLevel, 'hq')
  assert.equal(hqScope.regionIds, ALL_BOND_ORGANISATION_SCOPE)
  assert.equal(hqScope.branchIds, ALL_BOND_ORGANISATION_SCOPE)
  assert.equal(hqScope.consultantIds, ALL_BOND_ORGANISATION_SCOPE)
  assert.equal(data.regions.length, 2)
  assert.equal(data.branches.filter((branch) => branch.region_id === 'region-1').length, 2)
  assert.equal(data.consultants.filter((consultant) => consultant.workspace_unit_id === 'branch-1').length, 2)
  assert.equal(hqScope.canViewRegions, true)
  assert.equal(hqScope.canViewPartners, true)
  assert.equal(hqScope.canViewReports, true)

  const regionScope = resolveBondOrganisationScope(makeContext({ userId: 'regional-1', workspaceRole: 'regional_manager', scopeLevel: 'region', regionId: 'region-1' }), data)
  assert.equal(regionScope.scopeLevel, 'region')
  assert.deepEqual(regionScope.regionIds, ['region-1'])
  assert.deepEqual(regionScope.branchIds.sort(), ['branch-1', 'branch-2'].sort())
  assert.deepEqual(regionScope.consultantIds.sort(), ['consultant-1', 'consultant-2', 'consultant-3'].sort())
  assert.equal(regionScope.canViewRegions, true)
  assert.equal(regionScope.canViewBranches, true)
  assert.equal(regionScope.canViewConsultants, true)
  assert.equal(regionScope.canViewPartners, false)
  assert.equal(regionScope.canViewReports, false)

  const branchScope = resolveBondOrganisationScope(makeContext({ userId: 'branch-manager-1', workspaceRole: 'branch_manager', scopeLevel: 'branch', regionId: 'region-1', workspaceUnitId: 'branch-1' }), data)
  assert.equal(branchScope.scopeLevel, 'branch')
  assert.deepEqual(branchScope.branchIds, ['branch-1'])
  assert.deepEqual(branchScope.consultantIds.sort(), ['branch-manager-1', 'consultant-1', 'consultant-2'].sort())
  assert.equal(branchScope.canViewBranches, true)
  assert.equal(branchScope.canViewConsultants, true)

  const consultantScope = resolveBondOrganisationScope(makeContext({ userId: 'consultant-1', workspaceRole: 'consultant', scopeLevel: 'assigned', regionId: 'region-1', workspaceUnitId: 'branch-1' }), data)
  assert.equal(consultantScope.scopeLevel, 'consultant')
  assert.deepEqual(consultantScope.consultantIds, ['consultant-1'])
  assert.equal(consultantScope.canViewConsultants, false)
  assert.equal(consultantScope.canViewApplications, true)

  console.log('bondOrganisationScopeResolver tests passed')
} finally {
  await server.close()
}
