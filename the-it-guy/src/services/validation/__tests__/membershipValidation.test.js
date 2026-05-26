import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({
  root: process.cwd(),
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const { BOND_SCOPE_LEVELS } = await server.ssrLoadModule('/src/constants/workspaceUnits.js')
  const { resolvePermissionContext } = await server.ssrLoadModule('/src/auth/permissions/permissionResolver.js')
  const {
    canUserAccessBondScope,
    getAccessibleBondRegions,
    getAccessibleBondUnits,
  } = await server.ssrLoadModule('/src/services/bondWorkspaceHierarchyService.js')

  const resolveScope = (role, scopeLevel, overrides = {}) => ({
    appRole: 'bond_originator',
    workspaceType: 'bond_originator',
    currentWorkspace: { id: 'workspace-1', type: 'bond_originator' },
    currentMembership: {
      id: `membership-${role}`,
      workspaceId: 'workspace-1',
      user_id: overrides.user_id || 'user-1',
      status: 'active',
      workspaceRole: role,
      role,
      scope_level: scopeLevel,
      ...overrides,
    },
    ...overrides,
  })

  const owner = resolveScope('owner', BOND_SCOPE_LEVELS.workspaceHq)
  assert.equal(resolvePermissionContext(owner).workspaceRole, 'owner')
  assert.equal(resolvePermissionContext(owner).scopeLevel, BOND_SCOPE_LEVELS.workspaceHq)
  assert.equal(canUserAccessBondScope(owner, { scopeLevel: BOND_SCOPE_LEVELS.workspaceHq }), true)

  const director = resolveScope('director', BOND_SCOPE_LEVELS.workspaceHq)
  assert.equal(resolvePermissionContext(director).workspaceRole, 'director')
  assert.equal(resolvePermissionContext(director).scopeLevel, BOND_SCOPE_LEVELS.workspaceHq)
  assert.equal(canUserAccessBondScope(director, { scopeLevel: BOND_SCOPE_LEVELS.workspaceHq }), true)

  const hqManager = resolveScope('hq_manager', BOND_SCOPE_LEVELS.workspaceHq)
  assert.equal(resolvePermissionContext(hqManager).workspaceRole, 'hq_manager')
  assert.equal(canUserAccessBondScope(hqManager, { scopeLevel: BOND_SCOPE_LEVELS.workspaceHq }), true)
  assert.equal(canUserAccessBondScope(hqManager, { scopeLevel: BOND_SCOPE_LEVELS.region, regionId: 'region-1' }), true)

  const regionalManager = resolveScope('regional_manager', BOND_SCOPE_LEVELS.region, { regionId: 'region-cpt' })
  assert.equal(resolvePermissionContext(regionalManager).workspaceRole, 'regional_manager')
  assert.equal(resolvePermissionContext(regionalManager).scopeLevel, BOND_SCOPE_LEVELS.region)
  assert.equal(canUserAccessBondScope(regionalManager, { scopeLevel: BOND_SCOPE_LEVELS.region, regionId: 'region-cpt' }), true)
  assert.equal(canUserAccessBondScope(regionalManager, { scopeLevel: BOND_SCOPE_LEVELS.region, regionId: 'region-gau' }), false)

  const regionalManagerMissingRegion = resolveScope('regional_manager', BOND_SCOPE_LEVELS.region)
  assert.equal(canUserAccessBondScope(regionalManagerMissingRegion, { scopeLevel: BOND_SCOPE_LEVELS.region, regionId: 'region-cpt' }), false)
  assert.equal(getAccessibleBondRegions(regionalManagerMissingRegion, 'workspace-1').length, 0)

  const branchManager = resolveScope('branch_manager', BOND_SCOPE_LEVELS.branch, { workspaceUnitId: 'branch-1' })
  assert.equal(resolvePermissionContext(branchManager).workspaceRole, 'branch_manager')
  assert.equal(canUserAccessBondScope(branchManager, { scopeLevel: BOND_SCOPE_LEVELS.branch, workspaceUnitId: 'branch-1' }), true)
  assert.equal(canUserAccessBondScope(branchManager, { scopeLevel: BOND_SCOPE_LEVELS.branch, workspaceUnitId: 'branch-2' }), false)

  const branchManagerMissingUnit = resolveScope('branch_manager', BOND_SCOPE_LEVELS.branch)
  assert.equal(canUserAccessBondScope(branchManagerMissingUnit, { scopeLevel: BOND_SCOPE_LEVELS.branch, workspaceUnitId: 'branch-1' }), false)
  assert.equal(getAccessibleBondUnits(branchManagerMissingUnit, 'workspace-1').length, 0)

  const teamLead = resolveScope('team_lead', BOND_SCOPE_LEVELS.team, { workspaceUnitId: 'team-1' })
  assert.equal(resolvePermissionContext(teamLead).workspaceRole, 'team_lead')
  assert.equal(canUserAccessBondScope(teamLead, { scopeLevel: BOND_SCOPE_LEVELS.team, workspaceUnitId: 'team-1' }), true)

  const consultantAssigned = resolveScope('consultant', BOND_SCOPE_LEVELS.assigned)
  assert.equal(resolvePermissionContext(consultantAssigned).workspaceRole, 'consultant')
  assert.equal(canUserAccessBondScope(consultantAssigned, { scopeLevel: BOND_SCOPE_LEVELS.assigned, assignedUserId: 'user-1' }), true)

  const processorAssigned = resolveScope('processor', BOND_SCOPE_LEVELS.assigned)
  assert.equal(resolvePermissionContext(processorAssigned).workspaceRole, 'processor')
  assert.equal(canUserAccessBondScope(processorAssigned, { scopeLevel: BOND_SCOPE_LEVELS.assigned, assignedUserId: 'user-1' }), true)

  const processorTeam = resolveScope('processor', BOND_SCOPE_LEVELS.team, { workspaceUnitId: 'team-2' })
  assert.equal(resolvePermissionContext(processorTeam).workspaceRole, 'processor')
  assert.equal(canUserAccessBondScope(processorTeam, { scopeLevel: BOND_SCOPE_LEVELS.team, workspaceUnitId: 'team-2' }), true)

  const compliance = resolveScope('compliance', BOND_SCOPE_LEVELS.workspaceHq)
  assert.equal(resolvePermissionContext(compliance).workspaceRole, 'compliance')
  assert.equal(canUserAccessBondScope(compliance, { scopeLevel: BOND_SCOPE_LEVELS.branch, workspaceUnitId: 'any-branch' }), true)
  assert.equal(canUserAccessBondScope(compliance, { scopeLevel: BOND_SCOPE_LEVELS.region, regionId: 'region-1' }), true)

  const adminStaff = resolveScope('admin_staff', BOND_SCOPE_LEVELS.assigned)
  assert.equal(resolvePermissionContext(adminStaff).workspaceRole, 'admin_staff')
  assert.equal(canUserAccessBondScope(adminStaff, { scopeLevel: BOND_SCOPE_LEVELS.assigned, assignedUserId: 'user-1' }), true)
  assert.equal(canUserAccessBondScope(adminStaff, { scopeLevel: BOND_SCOPE_LEVELS.team, workspaceUnitId: 'team-1' }), false)

  const assignedWithoutRegion = resolveScope('consultant', BOND_SCOPE_LEVELS.assigned, { regionId: null, workspaceUnitId: null })
  assert.equal(canUserAccessBondScope(assignedWithoutRegion, { scopeLevel: BOND_SCOPE_LEVELS.assigned, assignedUserId: 'user-1' }), true)

  const personalNoHierarchy = resolveScope('owner', BOND_SCOPE_LEVELS.workspaceHq, { regionId: null, workspaceUnitId: null })
  assert.equal(resolvePermissionContext(personalNoHierarchy).scopeLevel, BOND_SCOPE_LEVELS.workspaceHq)
  assert.equal(canUserAccessBondScope(personalNoHierarchy, { scopeLevel: BOND_SCOPE_LEVELS.branch, workspaceUnitId: 'any-branch' }), true)

  console.log('membership validation compatibility tests passed')
} finally {
  await server.close()
}
