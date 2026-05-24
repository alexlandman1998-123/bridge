import { ACCESS_SCOPES } from './permissionRegistry'
import { getPermissionScope, resolvePermissionContext } from './permissionResolver'

function normalizeText(value) {
  return String(value || '').trim()
}

export function buildWorkspaceQueryScope(permission, context = {}) {
  const resolved = resolvePermissionContext(context)
  const scope = getPermissionScope(permission, context)
  const workspaceId = normalizeText(resolved.workspace?.id || resolved.membership?.workspaceId)

  return {
    permission,
    scope,
    workspaceId,
    organisationId: workspaceId,
    branchId: normalizeText(resolved.branchId),
    departmentId: normalizeText(resolved.departmentId),
    teamId: normalizeText(resolved.teamId),
    assignedUserId: normalizeText(resolved.userId),
    canRead: scope !== ACCESS_SCOPES.none,
    isAllWorkspace: scope === ACCESS_SCOPES.allWorkspace,
    isBranchOnly: scope === ACCESS_SCOPES.branchOnly,
    isDepartmentOnly: scope === ACCESS_SCOPES.departmentOnly,
    isTeamOnly: scope === ACCESS_SCOPES.teamOnly,
    isAssignedOnly: scope === ACCESS_SCOPES.assignedOnly,
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

  let scopedQuery = query
  if (queryScope.workspaceId && queryScope.scope !== ACCESS_SCOPES.clientLinkOnly) {
    scopedQuery = scopedQuery.eq(organisationColumn, queryScope.workspaceId)
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
  if (queryScope.isAssignedOnly && queryScope.assignedUserId) {
    scopedQuery = scopedQuery.eq(assignedColumn, queryScope.assignedUserId)
  }
  return scopedQuery
}

