import { normalizeAttorneyLaneRole } from '../../constants/attorneyRoleCatalog.js'

export const ATTORNEY_MATTER_SCOPE_LANES = Object.freeze(['transfer', 'bond', 'cancellation'])

const LANE_TO_ATTORNEY_ROLE = Object.freeze({
  transfer: 'transfer_attorney',
  bond: 'bond_attorney',
  cancellation: 'cancellation_attorney',
})

function normalizeLane(value = '') {
  const normalized = normalizeAttorneyLaneRole(value, '')
  return ATTORNEY_MATTER_SCOPE_LANES.includes(normalized) ? normalized : ''
}

function uniqueLanes(values = []) {
  return [...new Set((values || []).map(normalizeLane).filter(Boolean))]
}

function normalizeRequiredLanes(requiredLaneKeys = []) {
  if (Array.isArray(requiredLaneKeys) && requiredLaneKeys.length === 0) return []
  const lanes = uniqueLanes(requiredLaneKeys)
  return lanes.length ? lanes : [...ATTORNEY_MATTER_SCOPE_LANES]
}

function laneAccessFor(laneAccessContexts = {}, laneKey = '') {
  const lane = normalizeLane(laneKey)
  if (!lane) return {}
  return laneAccessContexts[lane] || laneAccessContexts[LANE_TO_ATTORNEY_ROLE[lane]] || {}
}

function getScopedAssignedLaneKeys(laneAccessContexts = {}, requiredLaneKeys = []) {
  return requiredLaneKeys.filter((laneKey) => {
    const context = laneAccessFor(laneAccessContexts, laneKey)
    return Boolean(context.isAssignedAttorney || context.isAssignedParticipant)
  })
}

function getScopedEditableLaneKeys(laneAccessContexts = {}, requiredLaneKeys = []) {
  return requiredLaneKeys.filter((laneKey) => {
    const context = laneAccessFor(laneAccessContexts, laneKey)
    return Boolean(context.canActAsAttorney || context.canUpdateLane)
  })
}

function getManagementLaneKeys(laneAccessContexts = {}, requiredLaneKeys = []) {
  return requiredLaneKeys.filter((laneKey) => {
    const context = laneAccessFor(laneAccessContexts, laneKey)
    return Boolean(context.canViewMatter || context.canManageMatter)
  })
}

function chooseDefaultLane({ visibleLaneKeys = [], editableLaneKeys = [], requiredLaneKeys = [], canSeeFullMatter = false }) {
  if (canSeeFullMatter && requiredLaneKeys.includes('transfer')) return 'transfer'
  return editableLaneKeys[0] || visibleLaneKeys[0] || requiredLaneKeys[0] || 'transfer'
}

function chooseMatterRole({ canSeeFullMatter = false, isManagementUser = false, defaultLaneKey = '', visibleLaneKeys = [] }) {
  if (isManagementUser) return 'management'
  if (canSeeFullMatter) return 'transfer'
  if (visibleLaneKeys.includes(defaultLaneKey)) return defaultLaneKey
  return visibleLaneKeys[0] || 'none'
}

export function buildAttorneyMatterScope({
  laneAccessContexts = {},
  requiredLaneKeys = ATTORNEY_MATTER_SCOPE_LANES,
} = {}) {
  const requiredLanes = normalizeRequiredLanes(requiredLaneKeys)
  const assignedLaneKeys = getScopedAssignedLaneKeys(laneAccessContexts, requiredLanes)
  const editableLaneKeys = getScopedEditableLaneKeys(laneAccessContexts, requiredLanes)
  const managementLaneKeys = getManagementLaneKeys(laneAccessContexts, requiredLanes)
  const isManagementUser = requiredLanes.some((laneKey) => Boolean(laneAccessFor(laneAccessContexts, laneKey).isManagementUser))
  const canManageMatter = requiredLanes.some((laneKey) => Boolean(laneAccessFor(laneAccessContexts, laneKey).canManageMatter))
  const canAssignLane = requiredLanes.some((laneKey) => Boolean(laneAccessFor(laneAccessContexts, laneKey).canAssignLane))
  const hasTransferAssignment = assignedLaneKeys.includes('transfer')
  const canSeeFullMatter = Boolean(isManagementUser || canManageMatter || hasTransferAssignment)
  const visibleLaneKeys = canSeeFullMatter ? requiredLanes : assignedLaneKeys
  const summaryLaneKeys = canSeeFullMatter
    ? []
    : requiredLanes.filter((laneKey) => !visibleLaneKeys.includes(laneKey))
  const defaultLaneKey = chooseDefaultLane({
    visibleLaneKeys,
    editableLaneKeys,
    requiredLaneKeys: requiredLanes,
    canSeeFullMatter,
  })
  const matterRole = chooseMatterRole({
    canSeeFullMatter,
    isManagementUser,
    defaultLaneKey,
    visibleLaneKeys,
  })

  const laneScopes = Object.freeze(Object.fromEntries(requiredLanes.map((laneKey) => [
    laneKey,
    Object.freeze({
      laneKey,
      attorneyRole: LANE_TO_ATTORNEY_ROLE[laneKey],
      detailVisible: visibleLaneKeys.includes(laneKey),
      summaryVisible: summaryLaneKeys.includes(laneKey),
      editable: editableLaneKeys.includes(laneKey),
      assigned: assignedLaneKeys.includes(laneKey),
      managementVisible: managementLaneKeys.includes(laneKey),
    }),
  ])))

  return Object.freeze({
    requiredLaneKeys: Object.freeze(requiredLanes),
    visibleLaneKeys: Object.freeze(visibleLaneKeys),
    editableLaneKeys: Object.freeze(editableLaneKeys),
    summaryLaneKeys: Object.freeze(summaryLaneKeys),
    assignedLaneKeys: Object.freeze(assignedLaneKeys),
    defaultLaneKey,
    matterRole,
    canSeeFullMatter,
    canSeeCoordinatorContext: canSeeFullMatter,
    canAssignLane,
    isManagementUser,
    laneScopes,
  })
}
