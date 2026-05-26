import { ACCESS_SCOPES } from './permissionRegistry'
import { getPermissionScope, resolvePermissionContext } from './permissionResolver'
import { BOND_SCOPE_LEVELS, BRANCH_SCOPES } from '../../constants/workspaceUnits'
import { WORKSPACE_TYPES } from '../../constants/workspaceTypes'

function normalizeText(value) {
  return String(value || '').trim()
}

export function buildWorkspaceQueryScope(permission, context = {}) {
  const resolved = resolvePermissionContext(context)
  const scope = getPermissionScope(permission, context)
  const workspaceId = normalizeText(resolved.workspace?.id || resolved.membership?.workspaceId)
  const isBondWorkspace = resolved.workspaceType === WORKSPACE_TYPES.bondOriginator
  const bondScope = normalizeText(resolved.scopeLevel)
  const requestedBranchId = normalizeText(context.selectedBranchId || context.branchFilterId || context.filterBranchId)
  const assignedBranchId = normalizeText(resolved.assignedBranchId || resolved.branchId || resolved.primaryBranchId || resolved.departmentId || resolved.teamId)
  const regionId = normalizeText(resolved.regionId || context.regionId || context.region_id || resolved.region)
  const workspaceUnitId = normalizeText(
    resolved.workspaceUnitId || resolved.unitId || context.workspaceUnitId || context.unit_id || resolved.teamId || resolved.team_id,
  )
  const isRegionLevel = isBondWorkspace && bondScope === BOND_SCOPE_LEVELS.region
  const isBranchLevel = isBondWorkspace && bondScope === BOND_SCOPE_LEVELS.branch
  const isTeamLevel = isBondWorkspace && bondScope === BOND_SCOPE_LEVELS.team
  const isAssignedLevel = isBondWorkspace && bondScope === BOND_SCOPE_LEVELS.assigned
  const isWorkspaceHq = isBondWorkspace && bondScope === BOND_SCOPE_LEVELS.workspaceHq
  const canFilterAllBranches =
    resolved.branchScope === BRANCH_SCOPES.allBranches ||
    scope === ACCESS_SCOPES.allWorkspace ||
    isWorkspaceHq ||
    (isBondWorkspace && scope === ACCESS_SCOPES.workspaceHq)
  const effectiveBranchId = canFilterAllBranches ? requestedBranchId : assignedBranchId

  return {
    permission,
    scope,
    branchScope: resolved.branchScope,
    scopeLevel: bondScope,
    isBondWorkspace,
    regionId,
    workspaceUnitId,
    workspaceId,
    organisationId: workspaceId,
    branchId: effectiveBranchId || normalizeText(resolved.branchId),
    assignedBranchId,
    requestedBranchId,
    departmentId: normalizeText(resolved.departmentId),
    teamId: normalizeText(resolved.teamId),
    assignedUserId: normalizeText(resolved.userId),
    canRead: scope !== ACCESS_SCOPES.none,
    canFilterAllBranches,
    isAllWorkspace: scope === ACCESS_SCOPES.allWorkspace && !requestedBranchId,
    isBranchOnly: scope === ACCESS_SCOPES.branchOnly || isBranchLevel || Boolean(canFilterAllBranches && requestedBranchId) || (!canFilterAllBranches && resolved.branchScope === BRANCH_SCOPES.assignedBranch),
    isDepartmentOnly: scope === ACCESS_SCOPES.departmentOnly,
    isTeamOnly: scope === ACCESS_SCOPES.teamOnly || isTeamLevel,
    isRegionOnly: scope === ACCESS_SCOPES.regionOnly || isRegionLevel,
    isAssignedOnly: scope === ACCESS_SCOPES.assignedOnly || isAssignedLevel || resolved.branchScope === BRANCH_SCOPES.own,
    isWorkspaceHq: scope === ACCESS_SCOPES.workspaceHq || isWorkspaceHq,
  }
}

export function assertWorkspaceScope(permission, context = {}) {
  const queryScope = buildWorkspaceQueryScope(permission, context)
  if (!queryScope.canRead) {
    throw new Error('You do not have permission to access this workspace data.')
  }
  if (queryScope.scope !== ACCESS_SCOPES.clientLinkOnly && !queryScope.workspaceId) {
    throw new Error('A valid workspace is required before loading workspace data.')
  }
  return queryScope
}

export function applySupabaseWorkspaceScope(query, queryScope, columns = {}) {
  if (!queryScope?.canRead) {
    throw new Error('Permission scope is required before querying workspace data.')
  }

  const organisationColumn = columns.organisationId || columns.workspaceId || 'organisation_id'
  const branchColumn = columns.branchId || 'branch_id'
  const departmentColumn = columns.departmentId || 'department_id'
  const teamColumn = columns.teamId || 'team_id'
  const assignedColumn = columns.assignedUserId || 'assigned_user_id'
  const regionColumn = columns.regionId || null
  const workspaceUnitColumn = columns.workspaceUnitId || columns.unitId || null

  let scopedQuery = query
  if (queryScope.workspaceId && queryScope.scope !== ACCESS_SCOPES.clientLinkOnly) {
    scopedQuery = scopedQuery.eq(organisationColumn, queryScope.workspaceId)
  }
  if (queryScope.isRegionOnly && queryScope.regionId && regionColumn) {
    scopedQuery = scopedQuery.eq(regionColumn, queryScope.regionId)
  }
  if (queryScope.isBranchOnly && queryScope.branchId) {
    scopedQuery = scopedQuery.eq(branchColumn, queryScope.branchId)
  }
  if (queryScope.isDepartmentOnly && queryScope.departmentId) {
    scopedQuery = scopedQuery.eq(departmentColumn, queryScope.departmentId)
  }
  if (queryScope.isTeamOnly && queryScope.teamId) {
    scopedQuery = scopedQuery.eq(teamColumn, queryScope.teamId)
  }
  if (queryScope.isTeamOnly && queryScope.workspaceUnitId && workspaceUnitColumn && workspaceUnitColumn !== teamColumn) {
    scopedQuery = scopedQuery.eq(workspaceUnitColumn, queryScope.workspaceUnitId)
  }
  if (queryScope.isBranchOnly && queryScope.workspaceUnitId && workspaceUnitColumn && workspaceUnitColumn !== branchColumn) {
    scopedQuery = scopedQuery.eq(workspaceUnitColumn, queryScope.workspaceUnitId)
  }
  if (queryScope.isAssignedOnly && queryScope.assignedUserId) {
    scopedQuery = scopedQuery.eq(assignedColumn, queryScope.assignedUserId)
  }
  return scopedQuery
}
