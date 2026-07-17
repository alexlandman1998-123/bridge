import {
  ATTORNEY_FIRM_MODULE_KEYS,
  normalizeAttorneyFirmModuleKey,
} from '../constants/attorneyFirmModules.js'

function normalize(value) {
  return String(value || '').trim().toLowerCase().replace(/[_-]+/g, ' ')
}

export function normalizeAttorneyModuleScope(moduleKeys = []) {
  return [...new Set(
    (Array.isArray(moduleKeys) ? moduleKeys : [])
      .map((moduleKey) => normalizeAttorneyFirmModuleKey(moduleKey))
      .filter(Boolean),
  )]
}

export function getAttorneyRecordModuleKeys(record = {}) {
  const explicitKeys = [
    ...(Array.isArray(record.moduleKeys) ? record.moduleKeys : []),
    ...(Array.isArray(record.matterTypeKeys) ? record.matterTypeKeys : []),
    ...(Array.isArray(record.roleList) ? record.roleList : []),
    ...(record.roles instanceof Set ? [...record.roles] : []),
  ]
    .map((key) => normalizeAttorneyFirmModuleKey(key))
    .filter(Boolean)
  if (explicitKeys.length) return [...new Set(explicitKeys)]

  const assignmentType = normalize(record.assignmentType || record.assignment_type)
  const attorneyRole = normalize(record.attorneyRole || record.attorney_role)
  const matterType = normalize(record.matterType || record.matter_type)
  const signal = `${assignmentType} ${attorneyRole} ${matterType}`
  const keys = new Set()

  if (signal.includes('transfer')) keys.add('transfer')
  if (signal.includes('cancellation') || signal.includes('cancel bond') || signal.includes('bond cancel')) {
    keys.add('cancellation')
  }
  if (
    signal.includes('bond') &&
    !(
      !signal.includes('transfer') &&
      (signal.includes('cancellation') || signal.includes('cancel bond') || signal.includes('bond cancel'))
    )
  ) {
    keys.add('bond')
  }

  if (!keys.size && record.transaction) {
    return getAttorneyRecordModuleKeys(record.transaction)
  }
  return [...keys]
}

export function recordMatchesAttorneyModuleScope(record, moduleKeys = []) {
  const scope = new Set(normalizeAttorneyModuleScope(moduleKeys))
  if (!scope.size) return false
  return getAttorneyRecordModuleKeys(record).some((moduleKey) => scope.has(moduleKey))
}

export function filterAttorneyRecordsByModules(records = [], moduleKeys = []) {
  return (Array.isArray(records) ? records : []).filter((record) => (
    recordMatchesAttorneyModuleScope(record, moduleKeys)
  ))
}

export function scopeAttorneyMatterRoleSummaries(summaries = [], moduleKeys = []) {
  const scope = new Set(normalizeAttorneyModuleScope(moduleKeys))
  if (!scope.size) return []

  return (Array.isArray(summaries) ? summaries : []).flatMap((summary) => {
    const visibleRoles = getAttorneyRecordModuleKeys(summary).filter((role) => scope.has(role))
    if (!visibleRoles.length) return []
    const roles = new Set(visibleRoles)
    return [{
      ...summary,
      roles,
      roleList: visibleRoles,
      isShared: roles.size > 1,
      isFullService: ATTORNEY_FIRM_MODULE_KEYS.every((role) => roles.has(role)),
    }]
  })
}

