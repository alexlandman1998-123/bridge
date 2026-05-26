import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({
  root: process.cwd(),
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
const { BOND_SCOPE_LEVELS } = await server.ssrLoadModule('/src/constants/workspaceUnits.js')
  const { PERMISSIONS } = await server.ssrLoadModule('/src/auth/permissions/permissionRegistry.js')
  const { canAccessWorkspaceRecord } = await server.ssrLoadModule('/src/auth/permissions/permissionResolver.js')
  const { buildWorkspaceQueryScope } = await server.ssrLoadModule('/src/auth/permissions/queryScope.js')

  const base = {
    appRole: 'bond_originator',
    workspaceType: 'bond_originator',
    currentWorkspace: { id: 'workspace-1', type: 'bond_originator' },
    userId: 'user-1',
  }

  const makeContext = (scopeLevel, overrides = {}) => ({
    ...base,
    currentMembership: {
      id: 'membership-legacy',
      workspaceId: base.currentWorkspace.id,
      status: 'active',
      workspaceRole: overrides.role || 'owner',
      scopeLevel,
      regionId: overrides.regionId || 'region-1',
      workspaceUnitId: overrides.workspaceUnitId || 'branch-1',
      ...overrides,
    },
    role: overrides.role || 'owner',
    ...overrides,
  })

  const allBranches = buildWorkspaceQueryScope(PERMISSIONS.viewApplications, makeContext('all_branches'))
  assert.equal(allBranches.scopeLevel, BOND_SCOPE_LEVELS.workspaceHq)

  const branchOnly = buildWorkspaceQueryScope(PERMISSIONS.viewApplications, makeContext('branch_only', { role: 'branch_manager', workspaceRole: 'branch_manager' }))
  assert.equal(branchOnly.scopeLevel, BOND_SCOPE_LEVELS.branch)
  assert.equal(branchOnly.isBranchOnly, true)

  const legacyAssignedBranch = buildWorkspaceQueryScope(PERMISSIONS.viewApplications, makeContext('assigned_branch'))
  assert.equal(legacyAssignedBranch.scopeLevel, BOND_SCOPE_LEVELS.branch)

  const teamOnly = buildWorkspaceQueryScope(PERMISSIONS.viewApplications, makeContext('team_only', { role: 'team_lead', workspaceRole: 'team_lead' }))
  assert.equal(teamOnly.scopeLevel, BOND_SCOPE_LEVELS.team)
  assert.equal(teamOnly.isTeamOnly, true)

  const assignedOnly = buildWorkspaceQueryScope(PERMISSIONS.viewApplications, makeContext('assigned_only'))
  assert.equal(assignedOnly.scopeLevel, BOND_SCOPE_LEVELS.assigned)
  assert.equal(assignedOnly.isAssignedOnly, true)

  const legacyOwn = buildWorkspaceQueryScope(PERMISSIONS.viewApplications, makeContext('own'))
  assert.equal(legacyOwn.scopeLevel, BOND_SCOPE_LEVELS.assigned)
  assert.equal(legacyOwn.isAssignedOnly, true)

  const assignedScopeOnly = buildWorkspaceQueryScope(
    PERMISSIONS.viewAssignedApplications,
    makeContext('assigned', { role: 'consultant', workspaceRole: 'consultant', branchScope: 'own' }),
  )
  assert.equal(assignedScopeOnly.scopeLevel, BOND_SCOPE_LEVELS.assigned)
  assert.equal(assignedScopeOnly.isAssignedOnly, true)
  assert.equal(assignedScopeOnly.isBranchOnly, false)

  const workspaceHqCanSeeAll = buildWorkspaceQueryScope(PERMISSIONS.viewAllApplications, makeContext(BOND_SCOPE_LEVELS.workspaceHq, { selectedBranchId: 'branch-2' }))
  assert.equal(workspaceHqCanSeeAll.isWorkspaceHq, true)
  assert.equal(workspaceHqCanSeeAll.canFilterAllBranches, true)

  const regionContext = makeContext(BOND_SCOPE_LEVELS.region, { role: 'regional_manager', workspaceRole: 'regional_manager', regionId: 'region-1' })
  assert.equal(canAccessWorkspaceRecord(PERMISSIONS.viewApplications, regionContext, { region_id: 'region-1' }), true)
  assert.equal(canAccessWorkspaceRecord(PERMISSIONS.viewApplications, regionContext, { region_id: 'region-2' }), false)

  const branchContext = makeContext(BOND_SCOPE_LEVELS.branch, { role: 'branch_manager', workspaceRole: 'branch_manager', workspaceUnitId: 'branch-1' })
  assert.equal(canAccessWorkspaceRecord(PERMISSIONS.viewApplications, branchContext, { branch_id: 'branch-1' }), true)
  assert.equal(canAccessWorkspaceRecord(PERMISSIONS.viewApplications, branchContext, { branch_id: 'branch-2' }), false)

  const teamContext = makeContext(BOND_SCOPE_LEVELS.team, { role: 'team_lead', workspaceRole: 'team_lead', workspaceUnitId: 'team-1' })
  assert.equal(canAccessWorkspaceRecord(PERMISSIONS.viewTeamApplications, teamContext, { team_id: 'team-1' }), true)
  assert.equal(canAccessWorkspaceRecord(PERMISSIONS.viewTeamApplications, teamContext, { team_id: 'team-2' }), false)

  const assignedContext = makeContext(BOND_SCOPE_LEVELS.assigned, { role: 'consultant', workspaceRole: 'consultant' })
  assert.equal(canAccessWorkspaceRecord(PERMISSIONS.viewApplications, assignedContext, { assigned_user_id: 'user-1' }), true)
  assert.equal(canAccessWorkspaceRecord(PERMISSIONS.viewApplications, assignedContext, { assigned_user_id: 'other-user' }), false)

  const regionWorkspaceHq = makeContext(BOND_SCOPE_LEVELS.workspaceHq, { role: 'owner', workspaceRole: 'owner' })
  assert.equal(canAccessWorkspaceRecord(PERMISSIONS.viewApplications, regionWorkspaceHq, { branch_id: 'branch-99', region_id: 'region-2' }), true)
  assert.equal(canAccessWorkspaceRecord(PERMISSIONS.viewApplications, regionWorkspaceHq, { assigned_user_id: 'other-user' }), true)

  console.log('queryScope compatibility tests passed')
} finally {
  await server.close()
}
