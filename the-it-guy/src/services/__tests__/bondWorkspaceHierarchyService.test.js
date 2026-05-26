import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({
  root: process.cwd(),
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const { BOND_SCOPE_LEVELS } = await server.ssrLoadModule('/src/constants/workspaceUnits.js')
  const {
    canUserAccessBondScope,
    getAccessibleBondRegions,
    getAccessibleBondUnits,
    isWorkspaceHqUser,
    isRegionalBondManager,
    isBranchBondManager,
    isAssignedOnlyBondUser,
    getUserBondScope,
    getRegionAwareUnitAccess,
    resolveBondScopeForMembership,
  } = await server.ssrLoadModule('/src/services/bondWorkspaceHierarchyService.js')

  const personalOwner = {
    id: 'membership-personal-owner',
    workspaceId: 'workspace-personal',
    userId: 'user-personal',
    status: 'active',
    workspaceRole: 'owner',
    scopeLevel: BOND_SCOPE_LEVELS.workspaceHq,
    workspace_type: 'bond_originator',
  }
  assert.equal(resolveBondScopeForMembership(personalOwner), BOND_SCOPE_LEVELS.workspaceHq)
  assert.equal(isWorkspaceHqUser({ currentMembership: personalOwner }, 'workspace-personal'), true)
  assert.equal(canUserAccessBondScope({ currentMembership: personalOwner }, { scopeLevel: BOND_SCOPE_LEVELS.workspaceHq }), true)

  const personalAssigned = {
    ...personalOwner,
    id: 'membership-personal-assigned',
    workspaceRole: 'consultant',
    scopeLevel: BOND_SCOPE_LEVELS.assigned,
    userId: 'user-personal',
  }
  assert.equal(resolveBondScopeForMembership(personalAssigned), BOND_SCOPE_LEVELS.assigned)
  assert.equal(canUserAccessBondScope({ currentMembership: personalAssigned }, { scopeLevel: BOND_SCOPE_LEVELS.assigned, assignedUserId: 'user-personal' }), true)

  const legacyOriginatorRole = {
    id: 'membership-legacy-originator',
    workspaceId: 'workspace-personal',
    workspaceRole: 'bond_originator',
    scopeLevel: BOND_SCOPE_LEVELS.assigned,
    userId: 'legacy-user',
    status: 'active',
    workspace_type: 'bond_originator',
  }
  assert.equal(resolveBondScopeForMembership(legacyOriginatorRole), BOND_SCOPE_LEVELS.assigned)
  assert.equal(canUserAccessBondScope({ currentMembership: legacyOriginatorRole }, { scopeLevel: BOND_SCOPE_LEVELS.assigned, assignedUserId: 'legacy-user' }), true)

  const regionalManager = {
    id: 'membership-regional-manager',
    workspaceId: 'workspace-company',
    userId: 'regional-user',
    workspaceRole: 'regional_manager',
    scopeLevel: BOND_SCOPE_LEVELS.region,
    regionId: 'region-cpt',
    status: 'active',
    workspace_type: 'bond_originator',
  }
  assert.equal(resolveBondScopeForMembership(regionalManager), BOND_SCOPE_LEVELS.region)
  assert.equal(canUserAccessBondScope({ currentMembership: regionalManager }, { scopeLevel: BOND_SCOPE_LEVELS.region, regionId: 'region-cpt' }), true)
  assert.equal(canUserAccessBondScope({ currentMembership: regionalManager }, { scopeLevel: BOND_SCOPE_LEVELS.region, regionId: 'region-gau' }), false)
  assert.equal(getAccessibleBondRegions({ currentMembership: regionalManager }, 'workspace-company')[0], 'region-cpt')

  const branchManager = {
    id: 'membership-branch-manager',
    workspaceId: 'workspace-company',
    workspaceRole: 'branch_manager',
    scopeLevel: BOND_SCOPE_LEVELS.branch,
    workspaceUnitId: 'branch-1',
    userId: 'branch-user',
    status: 'active',
    workspace_type: 'bond_originator',
  }
  assert.equal(resolveBondScopeForMembership(branchManager), BOND_SCOPE_LEVELS.branch)
  assert.equal(isBranchBondManager({ currentMembership: branchManager }, 'workspace-company', 'branch-1'), true)
  assert.equal(canUserAccessBondScope({ currentMembership: branchManager }, { scopeLevel: BOND_SCOPE_LEVELS.branch, workspaceUnitId: 'branch-1' }), true)
  assert.equal(canUserAccessBondScope({ currentMembership: branchManager }, { scopeLevel: BOND_SCOPE_LEVELS.branch, workspaceUnitId: 'branch-2' }), false)
  assert.equal(getAccessibleBondUnits({ currentMembership: branchManager }, 'workspace-company')[0], 'branch-1')

  const teamLead = {
    id: 'membership-team-lead',
    workspaceId: 'workspace-company',
    workspaceRole: 'team_lead',
    scopeLevel: BOND_SCOPE_LEVELS.team,
    workspaceUnitId: 'team-1',
    userId: 'team-user',
    status: 'active',
    workspace_type: 'bond_originator',
  }
  assert.equal(resolveBondScopeForMembership(teamLead), BOND_SCOPE_LEVELS.team)
  assert.equal(canUserAccessBondScope({ currentMembership: teamLead }, { scopeLevel: BOND_SCOPE_LEVELS.team, workspaceUnitId: 'team-1' }), true)

  const consultant = {
    id: 'membership-consultant',
    workspaceId: 'workspace-company',
    workspaceRole: 'consultant',
    scopeLevel: BOND_SCOPE_LEVELS.assigned,
    userId: 'consultant-user',
    status: 'active',
    workspace_type: 'bond_originator',
  }
  assert.equal(resolveBondScopeForMembership(consultant), BOND_SCOPE_LEVELS.assigned)
  assert.equal(canUserAccessBondScope({ currentMembership: consultant }, { scopeLevel: BOND_SCOPE_LEVELS.assigned, assignedUserId: 'consultant-user' }), true)

  const processorTeam = {
    id: 'membership-processor-team',
    workspaceId: 'workspace-company',
    workspaceRole: 'processor',
    scopeLevel: BOND_SCOPE_LEVELS.team,
    workspaceUnitId: 'processing-team-1',
    userId: 'processor-user',
    status: 'active',
    workspace_type: 'bond_originator',
  }
  assert.equal(resolveBondScopeForMembership(processorTeam), BOND_SCOPE_LEVELS.team)
  assert.equal(canUserAccessBondScope({ currentMembership: processorTeam }, { scopeLevel: BOND_SCOPE_LEVELS.team, workspaceUnitId: 'processing-team-1' }), true)

  const processorAssigned = {
    ...processorTeam,
    id: 'membership-processor-assigned',
    workspaceUnitId: null,
    scopeLevel: BOND_SCOPE_LEVELS.assigned,
  }
  assert.equal(resolveBondScopeForMembership(processorAssigned), BOND_SCOPE_LEVELS.assigned)
  assert.equal(canUserAccessBondScope({ currentMembership: processorAssigned }, { scopeLevel: BOND_SCOPE_LEVELS.assigned, assignedUserId: 'processor-user' }), true)

  const complianceScopeWorkspace = {
    id: 'membership-compliance-workspace',
    workspaceId: 'workspace-company',
    workspaceRole: 'compliance',
    scopeLevel: BOND_SCOPE_LEVELS.workspaceHq,
    userId: 'compliance-user',
    status: 'active',
    workspace_type: 'bond_originator',
  }
  assert.equal(resolveBondScopeForMembership(complianceScopeWorkspace), BOND_SCOPE_LEVELS.workspaceHq)
  assert.equal(canUserAccessBondScope({ currentMembership: complianceScopeWorkspace }, { scopeLevel: BOND_SCOPE_LEVELS.branch, workspaceUnitId: 'any-branch' }), true)
  assert.equal(getRegionAwareUnitAccess({ currentMembership: complianceScopeWorkspace }, 'workspace-company', { workspace_unit_id: 'any-branch' }), true)

  const adminTeam = {
    id: 'membership-admin-team',
    workspaceId: 'workspace-company',
    workspaceRole: 'admin_staff',
    scopeLevel: BOND_SCOPE_LEVELS.assigned,
    userId: 'admin-user',
    status: 'active',
    workspace_type: 'bond_originator',
  }
  assert.equal(resolveBondScopeForMembership(adminTeam), BOND_SCOPE_LEVELS.assigned)
  assert.equal(isAssignedOnlyBondUser({ currentMembership: adminTeam }, 'workspace-company'), true)

  assert.equal(resolveBondScopeForMembership({ workspaceRole: 'unknown_role' }), BOND_SCOPE_LEVELS.assigned)

  const managerRegion = {
    id: 'membership-manager-region',
    workspaceRole: 'manager',
    scopeLevel: BOND_SCOPE_LEVELS.region,
    regionId: 'region-cpt',
    status: 'active',
    workspace_type: 'bond_originator',
  }
  assert.equal(resolveBondScopeForMembership(managerRegion), BOND_SCOPE_LEVELS.region)

  const managerBranch = {
    id: 'membership-manager-branch',
    workspaceRole: 'manager',
    scopeLevel: BOND_SCOPE_LEVELS.branch,
    workspaceUnitId: 'branch-1',
    status: 'active',
    workspace_type: 'bond_originator',
  }
  assert.equal(resolveBondScopeForMembership(managerBranch), BOND_SCOPE_LEVELS.branch)
  assert.equal(isRegionalBondManager({ currentMembership: regionalManager }, 'workspace-company', 'region-cpt'), true)

  let noScopeUser = null
  try {
    noScopeUser = await getUserBondScope({ userId: 'missing-user', id: 'missing-user' }, 'missing-workspace')
  } catch {
    noScopeUser = null
  }
  assert.equal(noScopeUser, null)

  console.log('bondWorkspaceHierarchyService tests passed')
} finally {
  await server.close()
}
