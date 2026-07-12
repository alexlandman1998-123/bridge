import { APP_ROLES, normalizeCanonicalAppRole } from '../../constants/appRoles'
import { isActiveMembershipStatus, normalizeMembershipStatus } from '../../constants/membershipStatuses'
import { normalizeOrgRole, ORG_ROLES } from '../../constants/orgRoles'
import {
  BOND_SCOPE_LEVELS,
  BRANCH_SCOPES,
  canAccessWorkspaceRecord as canAccessScopedRecord,
  getDefaultBondScope,
  getDefaultBranchScope,
  mapLegacyScopeToBondScope,
  normalizeBranchScope,
  normalizeScopeLevel,
} from '../../constants/workspaceUnits'
import {
  WORKSPACE_TYPES,
  inferWorkspaceTypeFromAppRole,
  normalizeWorkspaceType,
} from '../../constants/workspaceTypes'
import { FEATURE_FLAGS } from '../../lib/featureFlags'
import { resolveSystemRole, resolveWorkspaceRole, SYSTEM_ROLES } from '../../services/roleResolutionService'
import {
  ACCESS_SCOPES,
  clientPermissions,
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

function normalizeTextOrNull(value) {
  return normalizeText(value) || null
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

function normalizeBondScopeLevel(membership = {}, workspaceType = '', workspaceRole = '', appRole = '') {
  if (workspaceType !== WORKSPACE_TYPES.bondOriginator) return ''
  const explicit = mapLegacyScopeToBondScope(normalizeText(membership?.scope_level || membership?.scopeLevel || membership?.scope))
  if (explicit) return normalizeScopeLevel(explicit, getDefaultBondScope(workspaceRole, { appRole, workspaceType }))
  return getDefaultBondScope(workspaceRole, { appRole, workspaceType })
}

function resolveBondRoleAlias(role = '', workspaceType = '', scopeLevel = '') {
  const normalized = normalizeOrgRole(role, { workspaceType })
  if (workspaceType !== WORKSPACE_TYPES.bondOriginator) return normalized
  if (normalized === ORG_ROLES.bondOriginator) return ORG_ROLES.consultant
  if (normalized === ORG_ROLES.principal) return ORG_ROLES.owner
  if (normalized === 'admin') return ORG_ROLES.adminStaff

  if (normalized === ORG_ROLES.manager) {
    if (scopeLevel === BOND_SCOPE_LEVELS.region) return ORG_ROLES.regionalManager
    if (scopeLevel === BOND_SCOPE_LEVELS.branch || scopeLevel === BOND_SCOPE_LEVELS.team) return ORG_ROLES.branchManager
    return ORG_ROLES.hqManager
  }

  return normalized
}

export function resolvePermissionContext(context = {}) {
  const profile = context.profile || context.authState?.profile || null
  const systemRole = resolveSystemRole(profile || context.authState?.profile || {})
  const appRole = normalizeCanonicalAppRole(context.appRole || context.role || context.authState?.appRole || profile?.role, '')
  const workspaceType = normalizeWorkspaceType(
    context.workspaceType ||
      context.currentWorkspace?.type ||
      context.authState?.workspaceType ||
      context.workspace_type ||
      context.currentMembership?.workspaceType ||
      context.currentMembership?.workspace?.type,
    inferWorkspaceTypeFromAppRole(appRole),
  )
  const currentMembership = activeMembershipFromContext(context.authState || context)
  const branchScope = normalizeBranchScope(
    context.branchScope || context.branch_scope || currentMembership?.branchScope || currentMembership?.branch_scope,
    getDefaultBranchScope(currentMembership?.workspaceRole || currentMembership?.workspace_role || context.organisationRole || context.membershipRole, {
      appRole,
      workspaceType,
    }),
  )
  const rawWorkspaceRole = resolveWorkspaceRole(
    {
      ...currentMembership,
      workspace_role: context.workspaceRole || context.organisationRole || currentMembership?.workspaceRole || currentMembership?.workspace_role,
      organisation_role: context.organisationRole || context.membershipRole || currentMembership?.organisationRole || currentMembership?.organisation_role,
      role: context.membershipRole || context.membership?.role || currentMembership?.role,
      app_role: appRole,
      workspace_type: workspaceType,
    },
    { appRole, workspaceType },
  )
  const workspaceRoleScope = normalizeBondScopeLevel(currentMembership, workspaceType, rawWorkspaceRole, appRole)
  const resolvedWorkspaceRole = resolveBondRoleAlias(rawWorkspaceRole, workspaceType, workspaceRoleScope)
  const membershipStatus = normalizeMembershipStatus(currentMembership?.status || context.membershipStatus || '')
  const userId = normalizeText(context.userId || context.authState?.user?.id || profile?.id)

  const primaryBranchId = normalizeTextOrNull(
    context.primaryBranchId ||
      context.primary_branch_id ||
      currentMembership?.primaryBranchId ||
      currentMembership?.primary_branch_id ||
      currentMembership?.branchId ||
      currentMembership?.branch_id,
  )
  const branchId = normalizeTextOrNull(context.branchId || currentMembership?.branchId || currentMembership?.branch_id || primaryBranchId)
  const departmentId = normalizeTextOrNull(context.departmentId || currentMembership?.departmentId)
  const teamId = normalizeTextOrNull(context.teamId || currentMembership?.teamId || currentMembership?.team_id)
  const workspaceId = normalizeText(context.currentWorkspace?.id || currentMembership?.organisationId || currentMembership?.organisation_id || context.workspaceId || '')

  return {
    profile,
    userId,
    appRole,
    systemRole,
    workspaceType,
    organisationRole: resolvedWorkspaceRole,
    workspaceRole: resolvedWorkspaceRole,
    membershipStatus,
    membership: currentMembership,
    workspace: context.currentWorkspace || context.authState?.currentWorkspace || currentMembership?.workspace || null,
    workspaceId,
    branchId,
    primaryBranchId,
    assignedBranchId: branchId || primaryBranchId || context.assignedBranchId || context.assigned_branch_id || context.departmentId || context.department_id,
    branchScope,
    departmentId,
    teamId,
    scopeLevel: workspaceType === WORKSPACE_TYPES.bondOriginator ? workspaceRoleScope : '',
    scopeLevelRaw: normalizeText(currentMembership?.scope_level || currentMembership?.scopeLevel || currentMembership?.scope || ''),
    regionId: normalizeTextOrNull(currentMembership?.region_id || currentMembership?.regionId || currentMembership?.region),
    workspaceUnitId: normalizeTextOrNull(
      currentMembership?.workspace_unit_id ||
        currentMembership?.workspaceUnitId ||
        context.workspaceUnitId ||
        context.workspace_unit_id ||
        currentMembership?.teamId ||
        currentMembership?.team_id ||
        currentMembership?.branchId ||
        currentMembership?.branch_id,
    ),
    scopeMetadata: currentMembership?.scope_metadata || currentMembership?.scopeMetadata || null,
    activeWorkspaceSelectedAt: currentMembership?.active_workspace_selected_at || currentMembership?.activeWorkspaceSelectedAt || null,
    hasActiveMembership: Boolean(currentMembership?.id && isActiveMembershipStatus(currentMembership.status)),
    isPending: ['pending', 'invited'].includes(normalizeMembershipStatus(context.currentMembership?.status || context.membershipStatus || '')),
    isBlocked: ['suspended', 'removed', 'deactivated'].includes(normalizeMembershipStatus(context.currentMembership?.status || context.membershipStatus || '')),
  }
}

function getRecordAssignedUserId(record = {}) {
  return normalizeText(
    record?.assigned_user_id ||
      record?.assignedUserId ||
      record?.assigned_bond_user_id ||
      record?.assignedBondUserId ||
      record?.assigned_bond_originator_user_id ||
      record?.assignedBondOriginatorUserId ||
      record?.primary_bond_consultant_user_id ||
      record?.primaryBondConsultantUserId ||
      record?.assigned_bond_processor_user_id ||
      record?.assignedBondProcessorUserId ||
      record?.assigned_bond_manager_user_id ||
      record?.assignedBondManagerUserId ||
      record?.assigned_bond_compliance_user_id ||
      record?.assignedBondComplianceUserId ||
      record?.owner_user_id ||
      record?.ownerUserId ||
      record?.created_by ||
      record?.createdBy ||
      record?.attorney_user_id ||
      record?.attorneyUserId,
  )
}

function getRecordWorkspaceUnitId(record = {}) {
  return normalizeText(
    record?.assigned_branch_id ||
      record?.assignedBranchId ||
      record?.assigned_team_id ||
      record?.assignedTeamId ||
      record?.assigned_workspace_unit_id ||
      record?.assignedWorkspaceUnitId ||
      record?.workspace_unit_id ||
      record?.workspaceUnitId ||
      record?.branch_id ||
      record?.branchId ||
      record?.assigned_branch_id ||
      record?.assignedBranchId ||
      record?.team_id ||
      record?.teamId,
  )
}

function getRecordRegionId(record = {}) {
  return normalizeText(record?.assigned_region_id || record?.assignedRegionId || record?.region_id || record?.regionId)
}

function normalizeBondAssignTarget(target = {}) {
  return {
    scopeLevel: normalizeScopeLevel(
      mapLegacyScopeToBondScope(
        normalizeText(target.scopeLevel || target.scope_level || target.scope || target.level || target.scopeType),
      ) || normalizeText(target.scopeLevel || target.scope_level || target.scope || target.level || target.scopeType),
      BOND_SCOPE_LEVELS.assigned,
    ),
    regionId: normalizeText(target.regionId || target.region_id || target.region),
    workspaceUnitId: normalizeText(
      target.workspaceUnitId ||
        target.workspace_unit_id ||
        target.assignedWorkspaceUnitId ||
        target.assigned_workspace_unit_id ||
        target.branchId ||
        target.branch_id ||
        target.assignedBranchId ||
        target.assigned_branch_id ||
        target.teamId ||
        target.team_id ||
        target.assignedTeamId ||
        target.assigned_team_id ||
        target.unitId ||
        target.unit_id,
    ),
    assignedUserId: normalizeText(target.assignedUserId || target.assigned_user_id || target.userId || target.user_id),
  }
}

export function canAssignBondWorkspace(context = {}) {
  const resolved = resolvePermissionContext(context)
  const role = resolved.organisationRole
  return [ORG_ROLES.owner, ORG_ROLES.director, ORG_ROLES.hqManager].includes(role)
}

export function canAssignBondRegion(context = {}, target = {}) {
  const resolved = resolvePermissionContext(context)
  const role = resolved.organisationRole
  const normalizedTarget = normalizeBondAssignTarget(target)
  if (canAssignBondWorkspace(context)) return true
  if (can(PERMISSIONS.manageBondRegions, context)) {
    if (!normalizedTarget.regionId || !resolved.regionId) return true
    return normalizedTarget.regionId === resolved.regionId
  }
  if (role === ORG_ROLES.regionalManager) {
    if (!normalizedTarget.regionId || !resolved.regionId) return true
    return normalizedTarget.regionId === resolved.regionId
  }
  return false
}

export function canAssignBondUnit(context = {}, target = {}) {
  const resolved = resolvePermissionContext(context)
  const role = resolved.organisationRole
  const normalizedTarget = normalizeBondAssignTarget(target)
  if (canAssignBondWorkspace(context)) return true
  if ([ORG_ROLES.branchManager, ORG_ROLES.teamLead].includes(role)) {
    return !normalizedTarget.workspaceUnitId || !resolved.workspaceUnitId || normalizedTarget.workspaceUnitId === resolved.workspaceUnitId
  }
  if (role === ORG_ROLES.adminStaff && can(PERMISSIONS.manageBondBranches, context)) {
    return !normalizedTarget.workspaceUnitId || !resolved.workspaceUnitId || normalizedTarget.workspaceUnitId === resolved.workspaceUnitId
  }
  if (role === ORG_ROLES.regionalManager && normalizedTarget.regionId && resolved.regionId) {
    return normalizedTarget.regionId === resolved.regionId
  }
  return false
}

export function canAssignPrimaryBondConsultant(context = {}, target = {}) {
  const resolved = resolvePermissionContext(context)
  const role = resolved.organisationRole
  const normalizedTarget = normalizeBondAssignTarget(target)
  if ([ORG_ROLES.owner, ORG_ROLES.director, ORG_ROLES.hqManager].includes(role)) return true
  if (canAssignBondRegion(context, target)) return true
  if (
    canAssignBondUnit(context, target) &&
    normalizedTarget.scopeLevel !== BOND_SCOPE_LEVELS.assigned
  ) {
    return true
  }
  return can(PERMISSIONS.assignBondConsultant, context)
}

export function canAssignBondProcessor(context = {}, target = {}) {
  const resolved = resolvePermissionContext(context)
  const role = resolved.organisationRole
  if (can(PERMISSIONS.assignBondProcessor, context)) return true
  if ([ORG_ROLES.owner, ORG_ROLES.director, ORG_ROLES.hqManager, ORG_ROLES.regionalManager].includes(role)) return true
  if ([ORG_ROLES.branchManager, ORG_ROLES.teamLead].includes(role) && canAssignBondUnit(context, target)) return true
  return false
}

export function canAssignBondManager(context = {}, target = {}) {
  const resolved = resolvePermissionContext(context)
  const role = resolved.organisationRole
  if (canAssignBondWorkspace(context)) return true
  if ([ORG_ROLES.manager, ORG_ROLES.hqManager, ORG_ROLES.director, ORG_ROLES.owner].includes(role)) return true
  if ([ORG_ROLES.regionalManager, ORG_ROLES.branchManager, ORG_ROLES.teamLead].includes(role)) return canAssignBondUnit(context, target)
  return false
}

export function canAssignBondComplianceReviewer(context = {}, target = {}) {
  const resolved = resolvePermissionContext(context)
  const role = resolved.organisationRole
  const normalizedTarget = normalizeBondAssignTarget(target)
  if (canAssignBondWorkspace(context)) return true
  if (role === ORG_ROLES.compliance) return true
  if (can(PERMISSIONS.manageBondReporting, context)) {
    if (!normalizedTarget.scopeLevel || [BOND_SCOPE_LEVELS.assigned, BOND_SCOPE_LEVELS.workspaceHq].includes(normalizedTarget.scopeLevel)) return true
    return canAssignBondRegion(context, target)
  }
  return false
}

export function can(permission, context = {}) {
  return getPermissionScope(permission, context) !== ACCESS_SCOPES.none
}

export function getPermissionScope(permission, context = {}) {
  const key = normalizePermissionKey(permission)
  if (!key) return ACCESS_SCOPES.none
  const map = getPermissionMap(context)
  return map[key] || ACCESS_SCOPES.none
}

function getPermissionMap(context = {}) {
  const resolved = resolvePermissionContext(context)
  if (FEATURE_FLAGS.disableRoleRestrictions && !import.meta.env.PROD) {
    return new Proxy({}, { get: () => ACCESS_SCOPES.allWorkspace })
  }
  if (resolved.systemRole === SYSTEM_ROLES.admin || resolved.systemRole === SYSTEM_ROLES.superAdmin || resolved.systemRole === SYSTEM_ROLES.founder || resolved.appRole === APP_ROLES.platformAdmin) return platformAdminPermissions
  if (resolved.systemRole === SYSTEM_ROLES.client || resolved.appRole === APP_ROLES.client) return clientPermissions
  if (!resolved.hasActiveMembership) return Object.freeze({})
  return permissionsByWorkspaceRole[resolved.workspaceType]?.[resolved.organisationRole] || Object.freeze({})
}

export function canAccessWorkspaceRecord(permission, context = {}, record = {}) {
  const permissionScope = getPermissionScope(permission, context)
  if (permissionScope === ACCESS_SCOPES.none) return false
  if (permissionScope === ACCESS_SCOPES.clientLinkOnly) return false

  const resolved = resolvePermissionContext(context)
  const isBondWorkspace = resolved.workspaceType === WORKSPACE_TYPES.bondOriginator
  const userId = resolved.userId
  const userRegionId = normalizeText(resolved.regionId)
  const userUnitId = normalizeText(resolved.workspaceUnitId)
  const recordRegionId = getRecordRegionId(record)
  const recordUnitId = getRecordWorkspaceUnitId(record)
  const assignedUserId = getRecordAssignedUserId(record)

  if (isBondWorkspace) {
    if (permissionScope === ACCESS_SCOPES.allWorkspace) return true
    if (resolved.scopeLevel === BOND_SCOPE_LEVELS.workspaceHq) return true

    if (resolved.scopeLevel === BOND_SCOPE_LEVELS.region && permissionScope === ACCESS_SCOPES.regionOnly) {
      return Boolean(userRegionId && recordRegionId && userRegionId === recordRegionId)
    }

    if ([BOND_SCOPE_LEVELS.branch, BOND_SCOPE_LEVELS.team].includes(resolved.scopeLevel) && [ACCESS_SCOPES.branchOnly, ACCESS_SCOPES.teamOnly].includes(permissionScope)) {
      return Boolean(userUnitId && recordUnitId && userUnitId === recordUnitId)
    }

    if (resolved.scopeLevel === BOND_SCOPE_LEVELS.assigned && permissionScope === ACCESS_SCOPES.assignedOnly) {
      return Boolean(userId && assignedUserId && userId === assignedUserId)
    }

    if (resolved.scopeLevel === BOND_SCOPE_LEVELS.workspaceHq) return true
    return false
  }

  return canAccessScopedRecord({
    branchScope: permissionScope === ACCESS_SCOPES.allWorkspace || resolved.branchScope === BRANCH_SCOPES.allBranches ? BRANCH_SCOPES.allBranches : resolved.branchScope,
    assignedBranchId: resolved.assignedBranchId || resolved.branchId || resolved.primaryBranchId || resolved.departmentId || resolved.teamId,
    userId,
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
  return resolved.systemRole === SYSTEM_ROLES.admin || resolved.systemRole === SYSTEM_ROLES.superAdmin || resolved.systemRole === SYSTEM_ROLES.founder || resolved.appRole === APP_ROLES.platformAdmin
}

export function createPermissionResolver(context = {}) {
  return {
    context: resolvePermissionContext(context),
    can: (permission) => can(permission, context),
    canAssignBondWorkspace: (target = {}) => canAssignBondWorkspace(context, target),
    canAssignBondRegion: (target = {}) => canAssignBondRegion(context, target),
    canAssignBondUnit: (target = {}) => canAssignBondUnit(context, target),
    canAssignPrimaryBondConsultant: (target = {}) => canAssignPrimaryBondConsultant(context, target),
    canAssignBondProcessor: (target = {}) => canAssignBondProcessor(context, target),
    canAssignBondManager: (target = {}) => canAssignBondManager(context, target),
    canAssignBondComplianceReviewer: (target = {}) => canAssignBondComplianceReviewer(context, target),
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
  if (Array.isArray(requirement.anyOf) && requirement.anyOf.length) {
    const results = requirement.anyOf.map((entry) => evaluateAccessRequirement(entry, context))
    const allowed = results.find((result) => result.ok)
    if (allowed) return allowed
    return results.find((result) => !['wrong_app_role', 'wrong_workspace_type'].includes(result.reason)) || results[0] || { ok: false, reason: 'missing_permission', message: 'You do not have permission to access this area.' }
  }
  if (
    requirement.appRole &&
    resolved.appRole !== normalizeCanonicalAppRole(requirement.appRole, '') &&
    (!requirement.workspaceType || resolved.workspaceType !== normalizeWorkspaceType(requirement.workspaceType))
  ) {
    return { ok: false, reason: 'wrong_app_role', message: 'Your Arch9 role does not include access to this area.' }
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
