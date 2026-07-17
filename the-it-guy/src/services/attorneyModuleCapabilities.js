import { PERMISSIONS } from '../auth/permissions/permissionRegistry.js'
import { ATTORNEY_FIRM_MODULE_KEYS, normalizeAttorneyFirmModuleKey } from '../constants/attorneyFirmModules.js'
import { resolveAttorneyFirmModuleCapabilities } from './attorneyFirmModulesService.js'

function createPermissionCheck(check) {
  return typeof check === 'function' ? check : () => false
}

function normalizeText(value) {
  return String(value || '').trim()
}

function getMembershipWorkspaceType(membership = null) {
  return normalizeText(
    membership?.workspaceType ||
    membership?.workspace_type ||
    membership?.workspace?.type,
  ).toLowerCase()
}

function getMembershipWorkspaceId(membership = null) {
  return normalizeText(
    membership?.workspaceId ||
    membership?.workspace_id ||
    membership?.workspace?.id,
  )
}

export function resolveAttorneyModulesFirmId(workspaceContext = {}) {
  const currentMembership = workspaceContext.currentMembership || null
  if (getMembershipWorkspaceType(currentMembership) === 'attorney_firm') {
    const currentMembershipId = getMembershipWorkspaceId(currentMembership)
    if (currentMembershipId) return currentMembershipId
  }

  const currentWorkspaceType = normalizeText(
    workspaceContext.currentWorkspace?.type || workspaceContext.workspaceType,
  ).toLowerCase()
  if (currentWorkspaceType === 'attorney_firm') {
    const currentWorkspaceId = normalizeText(workspaceContext.currentWorkspace?.id || workspaceContext.workspace?.id)
    if (currentWorkspaceId) return currentWorkspaceId
  }

  const activeAttorneyMembership = (workspaceContext.activeMemberships || []).find(
    (membership) => getMembershipWorkspaceType(membership) === 'attorney_firm',
  )
  const activeMembershipId = getMembershipWorkspaceId(activeAttorneyMembership)
  if (activeMembershipId) return activeMembershipId

  return normalizeText(
    workspaceContext.profile?.primaryAttorneyFirmId ||
    workspaceContext.profile?.primary_attorney_firm_id,
  )
}

function resolveLaneAuthority(moduleKey, hasAttorneyPermission) {
  const canViewAll = hasAttorneyPermission('can_view_all_firm_matters')
  if (canViewAll) return true

  const canViewAssigned = hasAttorneyPermission('can_view_assigned_matters')
  const canViewTransfer = hasAttorneyPermission('can_view_transfer_matters')
  const canViewBond = hasAttorneyPermission('can_view_bond_matters')
  const hasExplicitLaneRole = canViewTransfer || canViewBond

  if (moduleKey === 'transfer') return canViewTransfer || (!hasExplicitLaneRole && canViewAssigned)
  if (moduleKey === 'bond') return canViewBond || (!hasExplicitLaneRole && canViewAssigned)

  // The legacy attorney role model has no cancellation-specific permission.
  // Cancellation work currently follows transfer authority, while general
  // assigned-matter roles retain access to matters explicitly assigned to them.
  return canViewTransfer || (!hasExplicitLaneRole && canViewAssigned)
}

function resolveLaneEditAuthority(moduleKey, hasAttorneyPermission) {
  if (hasAttorneyPermission('can_view_all_firm_matters')) return true
  if (moduleKey === 'bond') return hasAttorneyPermission('can_edit_bond_workflow')
  if (moduleKey === 'transfer' || moduleKey === 'cancellation') {
    return hasAttorneyPermission('can_edit_transfer_workflow')
  }
  return false
}

export function resolveAttorneyUserModuleCapabilities({
  firmCapabilities = null,
  membershipActive = false,
  hasAttorneyPermission: attorneyPermissionCheck = null,
  hasWorkspacePermission: workspacePermissionCheck = null,
} = {}) {
  const resolvedFirmCapabilities = firmCapabilities || resolveAttorneyFirmModuleCapabilities([])
  const hasAttorneyPermission = createPermissionCheck(attorneyPermissionCheck)
  const hasWorkspacePermission = createPermissionCheck(workspacePermissionCheck)
  const activeMembership = Boolean(membershipActive)
  const workspaceCanView = hasWorkspacePermission(PERMISSIONS.viewMatters)
  const workspaceCanCreate = hasWorkspacePermission(PERMISSIONS.createMatters)
  const workspaceCanEdit = hasWorkspacePermission(PERMISSIONS.editMatters)
  const workspaceCanManageSettings = hasWorkspacePermission(PERMISSIONS.manageWorkspaceSettings)
  const workspaceCanManageTeam = hasWorkspacePermission(PERMISSIONS.manageAttorneyTeam)
  const canManageFirm = hasAttorneyPermission('can_manage_firm_settings') || workspaceCanManageSettings
  const canRouteInstructions = (
    canManageFirm ||
    workspaceCanManageTeam ||
    hasAttorneyPermission('can_create_attorney_assignments') ||
    hasAttorneyPermission('can_update_attorney_assignments')
  )

  const canViewHistorical = {}
  const canView = {}
  const canCreate = {}
  const canReceive = {}
  const canEdit = {}

  for (const moduleKey of ATTORNEY_FIRM_MODULE_KEYS) {
    const laneAuthority = resolveLaneAuthority(moduleKey, hasAttorneyPermission)
    const operational = Boolean(resolvedFirmCapabilities.isOperational[moduleKey])
    const acceptsNewWork = Boolean(resolvedFirmCapabilities.acceptsNewWork[moduleKey])
    canViewHistorical[moduleKey] = activeMembership && workspaceCanView && laneAuthority
    canView[moduleKey] = canViewHistorical[moduleKey] && operational
    canCreate[moduleKey] = canView[moduleKey] && workspaceCanCreate && acceptsNewWork
    canReceive[moduleKey] = activeMembership && acceptsNewWork && canRouteInstructions
    canEdit[moduleKey] = (
      canView[moduleKey] &&
      workspaceCanEdit &&
      (
        resolveLaneEditAuthority(moduleKey, hasAttorneyPermission) ||
        (!hasAttorneyPermission('can_view_transfer_matters') &&
          !hasAttorneyPermission('can_view_bond_matters') &&
          hasAttorneyPermission('can_view_assigned_matters'))
      )
    )
  }

  function readCapability(map, moduleKey) {
    return Boolean(map[normalizeAttorneyFirmModuleKey(moduleKey)])
  }

  return {
    membershipActive: activeMembership,
    canManageFirmModules: activeMembership && canManageFirm,
    canViewHistorical,
    canView,
    canCreate,
    canReceive,
    canEdit,
    canViewHistoricalModule: (moduleKey) => readCapability(canViewHistorical, moduleKey),
    canViewModule: (moduleKey) => readCapability(canView, moduleKey),
    canCreateMatter: (moduleKey) => readCapability(canCreate, moduleKey),
    canReceiveInstruction: (moduleKey) => readCapability(canReceive, moduleKey),
    canEditWorkflow: (moduleKey) => readCapability(canEdit, moduleKey),
  }
}
