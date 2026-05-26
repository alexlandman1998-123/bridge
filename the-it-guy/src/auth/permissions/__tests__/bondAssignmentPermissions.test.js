import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({
  root: process.cwd(),
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const {
    canAssignBondComplianceReviewer,
    canAssignBondManager,
    canAssignBondProcessor,
    canAssignBondRegion,
    canAssignBondUnit,
    canAssignBondWorkspace,
    canAssignPrimaryBondConsultant,
    resolvePermissionContext,
  } = await server.ssrLoadModule('/src/auth/permissions/permissionResolver.js')
  const { can } = await server.ssrLoadModule('/src/auth/permissions/permissionResolver.js')
  const { PERMISSIONS } = await server.ssrLoadModule('/src/auth/permissions/permissionRegistry.js')

  const baseContext = {
    appRole: 'bond_originator',
    workspaceType: 'bond_originator',
    currentWorkspace: { id: 'workspace-1', type: 'bond_originator' },
    userId: 'member-1',
  }

  const context = (overrides = {}) => ({
    ...baseContext,
    currentMembership: {
      id: `membership-${overrides.membershipId || overrides.workspaceRole || 'default'}`,
      workspaceId: 'workspace-1',
      status: 'active',
      workspaceRole: overrides.workspaceRole || 'owner',
      scope_level: overrides.scopeLevel,
      scopeLevel: overrides.scopeLevel,
      region_id: overrides.regionId,
      workspace_unit_id: overrides.unitId || overrides.branchId,
      branchId: overrides.branchId,
      user_id: overrides.userId || baseContext.userId,
      ...overrides.currentMembership,
      ...overrides,
    },
    ...overrides,
  })

  const workspaceManager = context({
    workspaceRole: 'owner',
    scopeLevel: 'workspace_hq',
  })
  const directorContext = context({ workspaceRole: 'director', scopeLevel: 'workspace_hq', membershipId: 'director' })
  const hqManagerContext = context({ workspaceRole: 'hq_manager', scopeLevel: 'workspace_hq', membershipId: 'hq-manager' })
  const regionalManagerContext = context({
    workspaceRole: 'regional_manager',
    scopeLevel: 'region',
    regionId: 'region-1',
    membershipId: 'regional-manager',
  })
  const branchManagerContext = context({
    workspaceRole: 'branch_manager',
    scopeLevel: 'branch',
    regionId: 'region-1',
    branchId: 'branch-1',
    unitId: 'branch-1',
    membershipId: 'branch-manager',
  })
  const teamLeadContext = context({
    workspaceRole: 'team_lead',
    scopeLevel: 'team',
    branchId: 'team-1',
    unitId: 'team-1',
    membershipId: 'team-lead',
  })
  const consultantContext = context({ workspaceRole: 'consultant', scopeLevel: 'assigned', membershipId: 'consultant' })
  const processorContext = context({ workspaceRole: 'processor', scopeLevel: 'assigned', membershipId: 'processor' })
  const complianceContext = context({ workspaceRole: 'compliance', scopeLevel: 'workspace_hq', membershipId: 'compliance' })
  const adminStaffContext = context({ workspaceRole: 'admin_staff', scopeLevel: 'assigned', membershipId: 'admin-staff' })

  assert.equal(resolvePermissionContext(workspaceManager).workspaceRole, 'owner')
  assert.equal(resolvePermissionContext(directorContext).workspaceRole, 'director')
  assert.equal(resolvePermissionContext(hqManagerContext).scopeLevel, 'workspace_hq')
  assert.equal(canAssignBondWorkspace(workspaceManager), true)
  assert.equal(canAssignBondWorkspace(directorContext), true)
  assert.equal(canAssignBondWorkspace(hqManagerContext), true)
  assert.equal(canAssignBondWorkspace(adminStaffContext), false)

  assert.equal(canAssignBondRegion(workspaceManager, { regionId: 'region-1' }), true)
  assert.equal(canAssignBondRegion(regionalManagerContext, { regionId: 'region-1' }), true)
  assert.equal(canAssignBondRegion(regionalManagerContext, { regionId: 'region-2' }), false)
  assert.equal(canAssignBondRegion(branchManagerContext, { regionId: 'region-1' }), false)

  assert.equal(canAssignBondUnit(workspaceManager, { workspaceUnitId: 'branch-1' }), true)
  assert.equal(canAssignBondUnit(branchManagerContext, { workspaceUnitId: 'branch-1' }), true)
  assert.equal(canAssignBondUnit(branchManagerContext, { workspaceUnitId: 'branch-2' }), false)
  assert.equal(canAssignBondUnit(teamLeadContext, { workspaceUnitId: 'team-2' }), false)

  assert.equal(canAssignPrimaryBondConsultant(workspaceManager, { workspaceUnitId: 'team-1' }), true)
  assert.equal(canAssignPrimaryBondConsultant(consultantContext, { workspaceUnitId: 'any-unit' }), false)
  assert.equal(canAssignBondProcessor(consultantContext, { workspaceUnitId: 'any-unit' }), false)
  assert.equal(canAssignBondProcessor(processorContext, { workspaceUnitId: 'any-unit' }), true)
  assert.equal(canAssignBondProcessor(branchManagerContext, { workspaceUnitId: 'branch-1' }), true)
  assert.equal(canAssignBondManager(hqManagerContext, { workspaceUnitId: 'branch-1' }), true)
  assert.equal(canAssignBondManager(teamLeadContext, { workspaceUnitId: 'team-1' }), true)
  assert.equal(canAssignBondManager(complianceContext, { workspaceUnitId: 'branch-1' }), false)

  assert.equal(canAssignBondComplianceReviewer(complianceContext, { workspaceUnitId: 'any-unit' }), true)
  assert.equal(canAssignBondComplianceReviewer(adminStaffContext, { workspaceUnitId: 'any-unit' }), false)

  assert.equal(can(PERMISSIONS.assignBondProcessor, workspaceManager), true)
  assert.equal(can(PERMISSIONS.assignBondConsultant, consultantContext), false)
  assert.equal(can(PERMISSIONS.assignBondProcessor, processorContext), true)
  assert.equal(can(PERMISSIONS.manageBondWorkspace, workspaceManager), true)
  assert.equal(can(PERMISSIONS.manageBondWorkspace, adminStaffContext), false)

  console.log('bond assignment permission tests passed')
} finally {
  await server.close()
}
