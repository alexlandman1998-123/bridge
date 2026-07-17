import { normalizeAttorneyTransactionRole } from '../../constants/attorneyPermissions.js'

export const ATTORNEY_MATTER_LANES = [
  {
    laneKey: 'transfer',
    attorneyRole: 'transfer_attorney',
    label: 'Transfer',
  },
  {
    laneKey: 'bond',
    attorneyRole: 'bond_attorney',
    label: 'Bond Registration',
  },
  {
    laneKey: 'cancellation',
    attorneyRole: 'cancellation_attorney',
    label: 'Bond Cancellation',
  },
]

const LANE_BY_ROLE = new Map(ATTORNEY_MATTER_LANES.map((lane) => [lane.attorneyRole, lane]))
const LANE_BY_KEY = new Map(ATTORNEY_MATTER_LANES.map((lane) => [lane.laneKey, lane]))

function normalizeLaneKey(value = '') {
  const normalized = String(value || '').trim().toLowerCase().replace(/-/g, '_')
  if (normalized === 'bond_registration' || normalized === 'bond_attorney') return 'bond'
  if (normalized === 'bond_cancellation' || normalized === 'cancellation_attorney') return 'cancellation'
  if (normalized === 'transfer_attorney') return 'transfer'
  return LANE_BY_KEY.has(normalized) ? normalized : ''
}

function getStrictCapabilities(context = {}) {
  const strict = context.assignmentScopedCapabilities || context.strictLaneCapabilities || {}
  return {
    canEdit: Boolean(strict.canEdit ?? strict.canUpdateLane),
    canRequestDocuments: Boolean(strict.canRequestDocuments),
    canUploadDocuments: Boolean(strict.canUploadDocuments),
    canReviewDocuments: Boolean(strict.canReviewDocuments),
    canManageSigning: Boolean(strict.canManageSigning),
    canAddInternalNote: Boolean(strict.canAddInternalNote),
    canAddSharedUpdate: Boolean(strict.canAddSharedUpdate),
    canPublishClientVisibleUpdate: Boolean(strict.canPublishClientVisibleUpdate),
  }
}

function resolveMatterRole({ assignedRoles, isManager }) {
  if (assignedRoles.length > 1) return 'multi_role'
  if (assignedRoles.length === 1) return assignedRoles[0]
  if (isManager) return 'manager'
  return 'viewer'
}

export function buildAttorneyMatterCapabilityProfile({
  userId = null,
  appRole = null,
  requiredLaneKeys = [],
  lanePermissionContexts = {},
} = {}) {
  const requiredLanes = new Set(requiredLaneKeys.map(normalizeLaneKey).filter(Boolean))

  const lanes = ATTORNEY_MATTER_LANES.reduce((result, lane) => {
    const context = lanePermissionContexts[lane.laneKey] || lanePermissionContexts[lane.attorneyRole] || {}
    const capabilities = getStrictCapabilities(context)
    const isAssigned = Boolean(context.isAssignedAttorney)
    const isManagementUser = Boolean(context.isFirmManagement || context.isManagementUser)
    const isManagementOverride = Boolean(
      !isAssigned &&
      isManagementUser &&
      context.managementOverrideEnabled &&
      capabilities.canEdit,
    )

    result[lane.laneKey] = {
      laneKey: lane.laneKey,
      attorneyRole: lane.attorneyRole,
      label: lane.label,
      required: requiredLanes.has(lane.laneKey),
      canView: Boolean(context.canViewLane ?? context.canViewLegalWorkspace ?? context.canViewMatter),
      ...capabilities,
      isAssigned,
      isManagementUser,
      isManagementOverride,
      assignmentId: context.assignment?.id || null,
      firmId: context.firmId || null,
      accessReason: isAssigned
        ? 'assigned_attorney'
        : isManagementOverride
          ? 'management_override'
          : context.viewReason || context.reason || 'view_only',
    }
    return result
  }, {})

  const assignedLaneKeys = ATTORNEY_MATTER_LANES
    .filter((lane) => lanes[lane.laneKey].isAssigned)
    .map((lane) => lane.laneKey)
  const assignedRoles = assignedLaneKeys.map((laneKey) => lanes[laneKey].attorneyRole)
  const editableLaneKeys = ATTORNEY_MATTER_LANES
    .filter((lane) => lanes[lane.laneKey].canEdit)
    .map((lane) => lane.laneKey)
  const viewableLaneKeys = ATTORNEY_MATTER_LANES
    .filter((lane) => lanes[lane.laneKey].canView)
    .map((lane) => lane.laneKey)
  const isManager = ATTORNEY_MATTER_LANES.some((lane) => lanes[lane.laneKey].isManagementUser)
  const defaultLaneKey =
    assignedLaneKeys.find((laneKey) => requiredLanes.has(laneKey)) ||
    assignedLaneKeys[0] ||
    editableLaneKeys.find((laneKey) => requiredLanes.has(laneKey)) ||
    (isManager ? ATTORNEY_MATTER_LANES.find((lane) => requiredLanes.has(lane.laneKey))?.laneKey : null) ||
    null

  return {
    userId,
    appRole,
    matterRole: resolveMatterRole({ assignedRoles, isManager }),
    primaryAttorneyRole: assignedRoles.length === 1 ? normalizeAttorneyTransactionRole(assignedRoles[0]) : null,
    defaultLaneKey,
    assignedRoles,
    assignedLaneKeys,
    editableLaneKeys,
    viewableLaneKeys,
    isMultiRole: assignedRoles.length > 1,
    isManager,
    hasManagementOverride: ATTORNEY_MATTER_LANES.some((lane) => lanes[lane.laneKey].isManagementOverride),
    lanes,
  }
}

export function getAttorneyMatterLaneForRole(attorneyRole) {
  return LANE_BY_ROLE.get(normalizeAttorneyTransactionRole(attorneyRole)) || null
}
