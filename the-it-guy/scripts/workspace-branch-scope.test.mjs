import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({
  root: process.cwd(),
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const { PERMISSIONS } = await server.ssrLoadModule('/src/auth/permissions/permissionRegistry.js')
  const {
    can,
    canAccessWorkspaceRecord,
    resolvePermissionContext,
  } = await server.ssrLoadModule('/src/auth/permissions/permissionResolver.js')
  const { buildWorkspaceQueryScope } = await server.ssrLoadModule('/src/auth/permissions/queryScope.js')

  const workspace = { id: 'workspace-1', type: 'agency' }
  const ownerContext = {
    appRole: 'agent',
    workspaceType: 'agency',
    currentWorkspace: workspace,
    currentMembership: {
      id: 'owner-membership',
      workspaceId: workspace.id,
      workspace,
      status: 'active',
      role: 'principal',
      branchId: 'branch-a',
      branchScope: 'all_branches',
    },
    userId: 'owner-user',
  }

  assert.equal(resolvePermissionContext(ownerContext).branchScope, 'all_branches')
  assert.equal(can(PERMISSIONS.manageBranches, ownerContext), true)
  assert.equal(canAccessWorkspaceRecord(PERMISSIONS.viewTransactions, ownerContext, { branch_id: 'branch-b' }), true)

  const agencyBranchManager = {
    ...ownerContext,
    currentMembership: {
      ...ownerContext.currentMembership,
      id: 'branch-manager-membership',
      role: 'branch_manager',
      branchId: 'branch-a',
      branchScope: 'assigned_branch',
    },
    userId: 'manager-user',
  }
  assert.equal(canAccessWorkspaceRecord(PERMISSIONS.viewTransactions, agencyBranchManager, { branch_id: 'branch-a' }), true)
  assert.equal(canAccessWorkspaceRecord(PERMISSIONS.viewTransactions, agencyBranchManager, { branch_id: 'branch-b' }), false)
  assert.equal(canAccessWorkspaceRecord(PERMISSIONS.viewTransactions, agencyBranchManager, { branch_id: 'branch-b', assigned_user_id: 'manager-user' }), true)

  const localStorageOverride = buildWorkspaceQueryScope(PERMISSIONS.viewTransactions, {
    ...agencyBranchManager,
    selectedBranchId: 'branch-b',
  })
  assert.equal(localStorageOverride.branchId, 'branch-a')
  assert.equal(localStorageOverride.canFilterAllBranches, false)

  const attorneyBranchManager = {
    appRole: 'attorney',
    workspaceType: 'attorney_firm',
    currentWorkspace: { id: 'attorney-workspace', type: 'attorney_firm' },
    currentMembership: {
      id: 'attorney-manager',
      workspaceId: 'attorney-workspace',
      workspace: { id: 'attorney-workspace', type: 'attorney_firm' },
      status: 'active',
      role: 'branch_manager',
      branchId: 'office-1',
      branchScope: 'assigned_branch',
    },
    userId: 'attorney-manager-user',
  }
  assert.equal(canAccessWorkspaceRecord(PERMISSIONS.viewMatters, attorneyBranchManager, { branch_id: 'office-1' }), true)
  assert.equal(canAccessWorkspaceRecord(PERMISSIONS.viewMatters, attorneyBranchManager, { branch_id: 'office-2' }), false)

  const attorneyOwner = {
    ...attorneyBranchManager,
    currentMembership: {
      ...attorneyBranchManager.currentMembership,
      role: 'partner',
      branchScope: 'all_branches',
    },
  }
  assert.equal(canAccessWorkspaceRecord(PERMISSIONS.viewMatters, attorneyOwner, { branch_id: 'office-2' }), true)

  const bondManager = {
    appRole: 'bond_originator',
    workspaceType: 'bond_originator',
    currentWorkspace: { id: 'bond-workspace', type: 'bond_originator' },
    currentMembership: {
      id: 'bond-manager',
      workspaceId: 'bond-workspace',
      workspace: { id: 'bond-workspace', type: 'bond_originator' },
      status: 'active',
      role: 'branch_manager',
      branchId: 'team-1',
      branchScope: 'assigned_branch',
    },
    userId: 'bond-manager-user',
  }
  assert.equal(canAccessWorkspaceRecord(PERMISSIONS.viewApplications, bondManager, { branch_id: 'team-1' }), true)
  assert.equal(canAccessWorkspaceRecord(PERMISSIONS.viewApplications, bondManager, { branch_id: 'team-2' }), false)
  assert.equal(canAccessWorkspaceRecord(PERMISSIONS.viewRegionApplications, bondManager, { region_id: 'region-1' }), false)

  const bondRegionalManager = {
    appRole: 'bond_originator',
    workspaceType: 'bond_originator',
    currentWorkspace: { id: 'bond-workspace', type: 'bond_originator' },
    currentMembership: {
      id: 'bond-regional-manager',
      workspaceId: 'bond-workspace',
      workspace: { id: 'bond-workspace', type: 'bond_originator' },
      status: 'active',
      role: 'regional_manager',
      region_id: 'region-1',
      branchId: 'team-3',
      branchScope: 'all_branches',
      scopeLevel: 'region',
    },
    userId: 'regional-user',
  }
  assert.equal(canAccessWorkspaceRecord(PERMISSIONS.viewRegionApplications, bondRegionalManager, { branch_id: 'team-3', region_id: 'region-1' }), true)
  assert.equal(canAccessWorkspaceRecord(PERMISSIONS.viewRegionApplications, bondRegionalManager, { branch_id: 'team-3', region_id: 'region-2' }), false)

  const bondTeamConsultant = {
    ...bondManager,
    currentMembership: {
      ...bondManager.currentMembership,
      role: 'consultant',
      workspaceRole: 'consultant',
      branchScope: 'own',
      scopeLevel: 'assigned',
    },
    userId: 'team-consultant-user',
  }
  assert.equal(canAccessWorkspaceRecord(PERMISSIONS.viewApplications, bondTeamConsultant, { branch_id: 'team-1', assigned_user_id: 'team-consultant-user' }), true)
  assert.equal(canAccessWorkspaceRecord(PERMISSIONS.viewApplications, bondTeamConsultant, { branch_id: 'team-1', assigned_user_id: 'other-user' }), false)

  const originator = {
    ...bondManager,
    currentMembership: {
      ...bondManager.currentMembership,
      role: 'bond_originator',
      branchScope: 'own',
    },
    userId: 'originator-user',
  }
  assert.equal(canAccessWorkspaceRecord(PERMISSIONS.viewApplications, originator, { branch_id: 'team-1', assigned_user_id: 'originator-user' }), true)
  assert.equal(canAccessWorkspaceRecord(PERMISSIONS.viewApplications, originator, { branch_id: 'team-1', assigned_user_id: 'other-user' }), false)

  console.log('workspace-branch-scope tests passed')
} finally {
  await server.close()
}
