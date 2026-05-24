import { APP_ROLES, normalizeCanonicalAppRole } from '../../constants/appRoles'
import { isActiveMembershipStatus, normalizeMembershipStatus } from '../../constants/membershipStatuses'
import { normalizeOrgRole, ORG_ROLES } from '../../constants/orgRoles'
import {
  BRANCH_SCOPES,
  canAccessWorkspaceRecord as canAccessScopedRecord,
  getDefaultBranchScope,
  normalizeBranchScope,
} from '../../constants/workspaceUnits'
import { inferWorkspaceTypeFromAppRole, normalizeWorkspaceType } from '../../constants/workspaceTypes'
import { FEATURE_FLAGS } from '../../lib/featureFlags'
import { resolveSystemRole, resolveWorkspaceRole, SYSTEM_ROLES } from '../../services/roleResolutionService'
import {
  ACCESS_SCOPES,
  clientPermissions,
  navPermissionByKey,
  normalizePermission,
  PERMISSIONS,
  permissionsByWorkspaceRole,
  platformAdminPermissions,
  routePermissionRules,
} from './permissionRegistry'

const LEGACY_CAPABILITY_MAP = Object.freeze({
  manage_organisation_settings: PERMISSIONS.manageWorkspaceSettings,
  edit_main_transaction_stage: PERMISSIONS.advanceTransactionStage,
  edit_finance_lane: PERMISSIONS.updateBondStatus,
  edit_attorney_lane: PERMISSIONS.manageTransferWorkflow,
  upload_documents: PERMISSIONS.requestDocuments,
  comment_shared: PERMISSIONS.commentOnClientThread,
  comment_internal: PERMISSIONS.editTransactions,
})

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizePermissionKey(permission = '') {
  const raw = String(permission || '').trim().toLowerCase()
  return normalizePermission(LEGACY_CAPABILITY_MAP[raw] || raw)
}

function activeMembershipFromContext(context = {}) {
  const current = context.currentMembership || null
  if (current?.id && isActiveMembershipStatus(current.status)) return current
  return (context.activeMemberships || []).find((membership) => membership?.id && isActiveMembershipStatus(membership.status)) || null
}

export function resolvePermissionContext(context = {}) {
  const profile = context.profile || context.authState?.profile || null
  const systemRole = resolveSystemRole(profile || context.authState?.profile || {})
  const appRole = normalizeCanonicalAppRole(context.appRole || context.role || context.authState?.appRole || profile?.role, '')
  const currentMembership = activeMembershipFromContext(context.authState || context)
  const workspaceType = normalizeWorkspaceType(
    context.workspaceType ||
      context.currentWorkspace?.type ||
      context.authState?.workspaceType ||
      currentMembership?.workspaceType ||
      currentMembership?.workspace?.type,
    inferWorkspaceTypeFromAppRole(appRole),
  )
  const organisationRole = resolveWorkspaceRole({
    ...currentMembership,
    workspace_role: context.workspaceRole || context.organisationRole || currentMembership?.workspaceRole || currentMembership?.workspace_role,
    organisation_role: context.organisationRole || context.membershipRole || currentMembership?.organisationRole || currentMembership?.organisation_role,
    role: context.membershipRole || currentMembership?.role || currentMembership?.rawRole,
    app_role: appRole,
    workspace_type: workspaceType,
  }, { appRole, workspaceType })
  const membershipStatus = normalizeMembershipStatus(currentMembership?.status || context.membershipStatus || '')
  const userId = normalizeText(context.userId || context.authState?.user?.id || profile?.id)
  const primaryBranchId = normalizeText(
    context.primaryBranchId ||
      context.primary_branch_id ||
      currentMembership?.primaryBranchId ||
      currentMembership?.primary_branch_id ||
      currentMembership?.branchId ||
      currentMembership?.branch_id,
  )
  const branchId = normalizeText(context.branchId || currentMembership?.branchId || currentMembership?.branch_id || primaryBranchId)
  const departmentId = normalizeText(context.departmentId || currentMembership?.departmentId)
  const teamId = normalizeText(context.teamId || currentMembership?.teamId)
  const branchScope = normalizeBranchScope(
    context.branchScope || context.branch_scope || currentMembership?.branchScope || currentMembership?.branch_scope,
    getDefaultBranchScope(organisationRole, { appRole, workspaceType }),
  )

  return {
    profile,
    userId,
    appRole,
    systemRole,
    workspaceType,
    organisationRole,
    workspaceRole: organisationRole,
    membershipStatus,
    membership: currentMembership,
    workspace: context.currentWorkspace || context.authState?.currentWorkspace || currentMembership?.workspace || null,
    branchId,
    primaryBranchId,
    assignedBranchId: branchId || primaryBranchId,
    branchScope,
    departmentId,
    teamId,
    hasActiveMembership: Boolean(currentMembership?.id && isActiveMembershipStatus(currentMembership.status)),
    isPending: ['pending', 'invited'].includes(normalizeMembershipStatus(context.currentMembership?.status || context.membershipStatus || '')),
    isBlocked: ['suspended', 'removed', 'deactivated'].includes(normalizeMembershipStatus(context.currentMembership?.status || context.membershipStatus || '')),
  }
}

export function getPermissionMap(context = {}) {
  const resolved = resolvePermissionContext(context)
  if (FEATURE_FLAGS.disableRoleRestrictions && !import.meta.env.PROD) {
    return new Proxy({}, { get: () => ACCESS_SCOPES.allWorkspace })
  }
  if (resolved.systemRole === SYSTEM_ROLES.admin || resolved.systemRole === SYSTEM_ROLES.superAdmin || resolved.appRole === APP_ROLES.platformAdmin) return platformAdminPermissions
  if (resolved.systemRole === SYSTEM_ROLES.client || resolved.appRole === APP_ROLES.client) return clientPermissions
  if (!resolved.hasActiveMembership) return Object.freeze({})
  return permissionsByWorkspaceRole[resolved.workspaceType]?.[resolved.organisationRole] || Object.freeze({})
}

export function getPermissionScope(permission, context = {}) {
  const key = normalizePermissionKey(permission)
  if (!key) return ACCESS_SCOPES.none
  const map = getPermissionMap(context)
  return map[key] || ACCESS_SCOPES.none
}

export function can(permission, context = {}) {
  return getPermissionScope(permission, context) !== ACCESS_SCOPES.none
}

export function canAccessWorkspaceRecord(permission, context = {}, record = {}) {
  const permissionScope = getPermissionScope(permission, context)
  if (permissionScope === ACCESS_SCOPES.none) return false
  if (permissionScope === ACCESS_SCOPES.clientLinkOnly) return false

  const resolved = resolvePermissionContext(context)
  const effectiveBranchScope =
    permissionScope === ACCESS_SCOPES.allWorkspace || resolved.branchScope === BRANCH_SCOPES.allBranches
      ? BRANCH_SCOPES.allBranches
      : resolved.branchScope

  return canAccessScopedRecord({
    branchScope: effectiveBranchScope,
    assignedBranchId: resolved.assignedBranchId || resolved.branchId || resolved.primaryBranchId || resolved.departmentId || resolved.teamId,
    userId: resolved.userId,
    recordBranchId:
      record.branchId ||
      record.branch_id ||
      record.assignedBranchId ||
      record.assigned_branch_id ||
      record.officeId ||
      record.office_id ||
      record.departmentId ||
      record.department_id ||
      record.teamId ||
      record.team_id,
    assignedUserId: record.assignedUserId || record.assigned_user_id || record.userId || record.user_id,
    ownerUserId: record.ownerUserId || record.owner_user_id || record.createdBy || record.created_by,
  })
}

export function canAny(permissions = [], context = {}) {
  return permissions.some((permission) => can(permission, context))
}

export function canAll(permissions = [], context = {}) {
  return permissions.every((permission) => can(permission, context))
}

export function hasWorkspaceType(type, context = {}) {
  const resolved = resolvePermissionContext(context)
  return !type || resolved.workspaceType === normalizeWorkspaceType(type)
}

export function hasAppRole(role, context = {}) {
  const resolved = resolvePermissionContext(context)
  return !role || resolved.appRole === normalizeCanonicalAppRole(role, '')
}

export function hasOrgRole(role, context = {}) {
  const resolved = resolvePermissionContext(context)
  return !role || resolved.organisationRole === normalizeOrgRole(role, { appRole: resolved.appRole, workspaceType: resolved.workspaceType })
}

export function isWorkspaceOwner(context = {}) {
  const resolved = resolvePermissionContext(context)
  return [ORG_ROLES.owner, ORG_ROLES.principal, ORG_ROLES.director, ORG_ROLES.partner].includes(resolved.organisationRole)
}

export function isPlatformAdmin(context = {}) {
  const resolved = resolvePermissionContext(context)
  return resolved.systemRole === SYSTEM_ROLES.admin || resolved.systemRole === SYSTEM_ROLES.superAdmin || resolved.appRole === APP_ROLES.platformAdmin
}

export function createPermissionResolver(context = {}) {
  return {
    context: resolvePermissionContext(context),
    can: (permission) => can(permission, context),
    canAny: (permissions) => canAny(permissions, context),
    canAll: (permissions) => canAll(permissions, context),
    getPermissionScope: (permission) => getPermissionScope(permission, context),
    canAccessWorkspaceRecord: (permission, record) => canAccessWorkspaceRecord(permission, context, record),
    hasWorkspaceType: (type) => hasWorkspaceType(type, context),
    hasAppRole: (role) => hasAppRole(role, context),
    hasOrgRole: (role) => hasOrgRole(role, context),
    isWorkspaceOwner: () => isWorkspaceOwner(context),
    isPlatformAdmin: () => isPlatformAdmin(context),
  }
}

function pathMatches(pathname = '', prefix = '') {
  const path = normalizeText(pathname) || '/'
  const normalizedPrefix = normalizeText(prefix)
  return path === normalizedPrefix || path.startsWith(`${normalizedPrefix}/`)
}

export function getRouteAccessRequirement(pathname = '') {
  return routePermissionRules.find((rule) => pathMatches(pathname, rule.prefix)) || null
}

export function evaluateAccessRequirement(requirement = null, context = {}) {
  const resolved = resolvePermissionContext(context)
  if (!requirement) return { ok: true, reason: '', message: '' }
  if (FEATURE_FLAGS.disableRoleRestrictions && !import.meta.env.PROD) return { ok: true, reason: '', message: '' }
  if (
    requirement.appRole &&
    resolved.appRole !== normalizeCanonicalAppRole(requirement.appRole, '') &&
    (!requirement.workspaceType || resolved.workspaceType !== normalizeWorkspaceType(requirement.workspaceType))
  ) {
    return { ok: false, reason: 'wrong_app_role', message: 'Your Bridge role does not include access to this area.' }
  }
  if (requirement.workspaceType && resolved.systemRole !== SYSTEM_ROLES.client && resolved.appRole !== APP_ROLES.client && resolved.workspaceType !== normalizeWorkspaceType(requirement.workspaceType)) {
    return { ok: false, reason: 'wrong_workspace_type', message: 'This workspace does not include access to this area.' }
  }
  if (resolved.isBlocked) {
    return { ok: false, reason: 'membership_blocked', message: 'Your workspace access is suspended or unavailable.' }
  }
  if (requirement.permission && !can(requirement.permission, context)) {
    return { ok: false, reason: 'missing_permission', message: resolvePermissionDenialMessage(requirement.permission) }
  }
  return { ok: true, reason: '', message: '' }
}

export function filterNavigationItems(items = [], context = {}) {
  return (items || [])
    .map((item) => {
      const children = Array.isArray(item.children) ? filterNavigationItems(item.children, context) : []
      const permission = navPermissionByKey[item.key]
      const visible = !permission || can(permission, context) || children.length > 0
      if (!visible) return null
      return children.length ? { ...item, children } : { ...item, children: undefined }
    })
    .filter(Boolean)
}

export function resolvePermissionDenialMessage(permission = '') {
  const key = normalizePermissionKey(permission)
  const labels = {
    [PERMISSIONS.manageWorkspaceSettings]: 'You do not have permission to manage workspace settings.',
    [PERMISSIONS.inviteUsers]: 'You do not have permission to invite users.',
    [PERMISSIONS.manageUsers]: 'You do not have permission to manage users in this workspace.',
    [PERMISSIONS.manageBilling]: 'You do not have permission to manage billing.',
    [PERMISSIONS.viewReports]: 'You do not have permission to view reports.',
    [PERMISSIONS.exportReports]: 'You do not have permission to export reports.',
    [PERMISSIONS.manageBranches]: 'You do not have permission to manage branches.',
    [PERMISSIONS.deleteListings]: 'You do not have permission to delete listings.',
    [PERMISSIONS.deleteLeads]: 'You do not have permission to delete leads.',
    [PERMISSIONS.approveDocuments]: 'You do not have permission to approve documents.',
    [PERMISSIONS.publishClientDocuments]: 'You do not have permission to publish client documents.',
    [PERMISSIONS.submitToBanks]: 'You do not have permission to submit applications to banks.',
  }
  return labels[key] || 'You do not have permission to perform this action.'
}

export function assertPermission(permission, context = {}, message = '') {
  if (!can(permission, context)) {
    throw new Error(message || resolvePermissionDenialMessage(permission))
  }
  return true
}
