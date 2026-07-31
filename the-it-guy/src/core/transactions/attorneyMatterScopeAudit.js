import { ATTORNEY_MATTER_SCOPE_LANES } from './attorneyMatterScope.js'

function normalizeLane(value = '') {
  const normalized = String(value || '').trim().toLowerCase().replace(/_attorney$/, '')
  if (normalized === 'bond-registration' || normalized === 'finance') return 'bond'
  if (normalized === 'bond-cancellation') return 'cancellation'
  return ATTORNEY_MATTER_SCOPE_LANES.includes(normalized) ? normalized : ''
}

function uniqueLaneKeys(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).map(normalizeLane).filter(Boolean))]
}

function getHiddenLaneKeys(requiredLaneKeys = [], visibleLaneKeys = []) {
  const visible = new Set(visibleLaneKeys)
  return requiredLaneKeys.filter((laneKey) => !visible.has(laneKey))
}

function getScopeKind(scope = {}) {
  if (!scope || !Array.isArray(scope.visibleLaneKeys)) return 'unknown'
  if (!scope.visibleLaneKeys.length) return 'denied'
  if (scope.isManagementUser) return 'management'
  if (scope.canSeeFullMatter) return 'coordinator'
  if (scope.visibleLaneKeys.length === 1) return `${scope.visibleLaneKeys[0]}_lane`
  return 'multi_lane'
}

export function buildAttorneyMatterScopeAudit(matterScope = null, options = {}) {
  const requiredLaneKeys = uniqueLaneKeys(matterScope?.requiredLaneKeys?.length ? matterScope.requiredLaneKeys : ATTORNEY_MATTER_SCOPE_LANES)
  const visibleLaneKeys = uniqueLaneKeys(matterScope?.visibleLaneKeys || [])
  const editableLaneKeys = uniqueLaneKeys(matterScope?.editableLaneKeys || [])
  const summaryLaneKeys = uniqueLaneKeys(matterScope?.summaryLaneKeys || [])
  const hiddenLaneKeys = getHiddenLaneKeys(requiredLaneKeys, visibleLaneKeys)
  const defaultLaneKey = normalizeLane(matterScope?.defaultLaneKey) || visibleLaneKeys[0] || requiredLaneKeys[0] || 'transfer'
  const requestedLaneKey = normalizeLane(options.requestedLaneKey || options.routeLaneKey || '')
  const requestedLaneVisible = requestedLaneKey ? visibleLaneKeys.includes(requestedLaneKey) : true
  const issues = []

  if (!visibleLaneKeys.length) {
    issues.push('no_visible_lanes')
  }
  if (editableLaneKeys.some((laneKey) => !visibleLaneKeys.includes(laneKey))) {
    issues.push('editable_lane_not_visible')
  }
  if (visibleLaneKeys.some((laneKey) => !requiredLaneKeys.includes(laneKey))) {
    issues.push('visible_lane_not_required')
  }
  if (requestedLaneKey && !requestedLaneVisible) {
    issues.push('requested_lane_not_visible')
  }

  return Object.freeze({
    version: 'attorney_matter_scope_audit_v1',
    transactionId: String(options.transactionId || '').trim() || null,
    routeKey: String(options.routeKey || '').trim() || null,
    requestedLaneKey: requestedLaneKey || null,
    requestedLaneVisible,
    scopeKind: getScopeKind({
      ...matterScope,
      visibleLaneKeys,
      canSeeFullMatter: Boolean(matterScope?.canSeeFullMatter),
      isManagementUser: Boolean(matterScope?.isManagementUser),
    }),
    matterRole: matterScope?.matterRole || 'unknown',
    defaultLaneKey,
    requiredLaneKeys: Object.freeze(requiredLaneKeys),
    visibleLaneKeys: Object.freeze(visibleLaneKeys),
    editableLaneKeys: Object.freeze(editableLaneKeys),
    summaryLaneKeys: Object.freeze(summaryLaneKeys),
    hiddenLaneKeys: Object.freeze(hiddenLaneKeys),
    canSeeFullMatter: Boolean(matterScope?.canSeeFullMatter),
    canSeeCoordinatorContext: Boolean(matterScope?.canSeeCoordinatorContext),
    canAssignLane: Boolean(matterScope?.canAssignLane),
    scoped: Boolean(matterScope?.scoped),
    healthy: issues.length === 0,
    issues: Object.freeze(issues),
  })
}
