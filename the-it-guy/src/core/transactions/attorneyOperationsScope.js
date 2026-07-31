const MANAGEMENT_ROLES = new Set(['firm_admin', 'director_partner'])

export const ATTORNEY_OPERATION_LANES = Object.freeze(['transfer', 'bond', 'cancellation'])

function toLower(value) {
  return String(value || '').trim().toLowerCase()
}

function normalizeOperationLane(value = '') {
  const normalized = toLower(value).replace(/_attorney$/, '')
  if (ATTORNEY_OPERATION_LANES.includes(normalized)) return normalized
  if (normalized === 'bond-registration' || normalized === 'finance') return 'bond'
  if (normalized === 'bond-cancellation') return 'cancellation'
  return ''
}

function normalizePracticeQualifications(values = []) {
  const candidates = Array.isArray(values) ? values : String(values || '').split(',')
  return [...new Set(candidates.map(normalizeOperationLane).filter(Boolean))]
}

function inferOperationLaneKeys({ role = '', permissions = {}, practiceQualifications = [] } = {}) {
  const normalizedRole = toLower(role)
  const qualifications = normalizePracticeQualifications(practiceQualifications)
  if (normalizedRole === 'bond_attorney') return ['bond']
  if (normalizedRole === 'cancellation_attorney') return ['cancellation']
  if (normalizedRole === 'transfer_attorney') return ['transfer']
  if (qualifications.length) return ATTORNEY_OPERATION_LANES.filter((laneKey) => qualifications.includes(laneKey))
  if (permissions.can_view_bond_matters && !permissions.can_view_transfer_matters) return ['bond']
  if (permissions.can_view_transfer_matters && !permissions.can_view_bond_matters) return ['transfer']
  return ['transfer']
}

export function buildAttorneyOperationsScope({ currentUser = {}, permissions = {} } = {}) {
  const role = toLower(currentUser.professionalRole || currentUser.role)
  const canViewAllOperationalQueues = MANAGEMENT_ROLES.has(role) || Boolean(permissions.can_view_all_firm_matters)
  const listLaneKeys = canViewAllOperationalQueues
    ? [...ATTORNEY_OPERATION_LANES]
    : inferOperationLaneKeys({
        role,
        permissions,
        practiceQualifications: currentUser.practiceQualifications || currentUser.practice_qualifications || [],
      })

  return Object.freeze({
    canViewAllOperationalQueues,
    listLaneKeys: Object.freeze(listLaneKeys),
    defaultLaneKey: canViewAllOperationalQueues ? 'all' : listLaneKeys[0] || 'transfer',
  })
}

function getMatterTypeKeysForOperations(row = {}) {
  const label = toLower(row.matterType)
  const keys = new Set()
  const assignmentType = toLower(row.assignmentType || row.assignment_type)
  const attorneyRole = toLower(row.attorneyRole || row.attorney_role)

  if (!label || label.includes('transfer') || assignmentType === 'transfer' || assignmentType === 'transfer_and_bond' || attorneyRole === 'transfer_attorney') {
    keys.add('transfer')
  }
  if (label.includes('bond') || assignmentType === 'bond' || assignmentType === 'transfer_and_bond' || attorneyRole === 'bond_attorney') {
    keys.add('bond')
  }
  if (label.includes('cancellation') || assignmentType === 'cancellation' || attorneyRole === 'cancellation_attorney') {
    keys.add('cancellation')
  }
  return [...keys]
}

export function applyAttorneyOperationsScope(rows = [], scope = buildAttorneyOperationsScope()) {
  if (scope.canViewAllOperationalQueues) return rows
  const visibleLanes = new Set(scope.listLaneKeys || [])
  if (!visibleLanes.size) return []
  return (rows || []).filter((row) => getMatterTypeKeysForOperations(row).some((laneKey) => visibleLanes.has(laneKey)))
}
