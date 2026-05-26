export const WORKSPACE_TYPES = Object.freeze({
  agency: 'agency',
  developerCompany: 'developer_company',
  attorneyFirm: 'attorney_firm',
  bondOriginator: 'bond_originator',
})

export const WORKSPACE_KINDS = Object.freeze({
  personalOriginator: 'personal_originator',
  bondCompany: 'bond_company',
})

export const WORKSPACE_TYPE_VALUES = Object.freeze(Object.values(WORKSPACE_TYPES))
export const WORKSPACE_KIND_VALUES = Object.freeze(Object.values(WORKSPACE_KINDS))

export function normalizeWorkspaceKind(value, fallback = '') {
  const normalized = String(value || '').trim().toLowerCase()
  if (WORKSPACE_KIND_VALUES.includes(normalized)) return normalized
  if (normalized === 'personal') return WORKSPACE_KINDS.personalOriginator
  if (normalized === 'bond') return WORKSPACE_KINDS.bondCompany
  if (normalized === 'bondoriginator' || normalized === 'bond_originator') return WORKSPACE_KINDS.bondCompany
  return fallback
}

export function inferWorkspaceKindFromWorkspaceType(type = '') {
  const normalizedType = normalizeWorkspaceType(type)
  if (normalizedType === WORKSPACE_TYPES.bondOriginator) return WORKSPACE_KINDS.bondCompany
  return ''
}

export function normalizeWorkspaceType(value, fallback = '') {
  const normalized = String(value || '').trim().toLowerCase()
  if (WORKSPACE_TYPE_VALUES.includes(normalized)) return normalized
  if (normalized === 'developer') return WORKSPACE_TYPES.developerCompany
  if (normalized === 'attorney') return WORKSPACE_TYPES.attorneyFirm
  if (normalized === 'bond') return WORKSPACE_TYPES.bondOriginator
  return fallback
}

export function inferWorkspaceTypeFromAppRole(appRole = '') {
  const normalized = String(appRole || '').trim().toLowerCase()
  if (normalized === 'agent') return WORKSPACE_TYPES.agency
  if (normalized === 'developer') return WORKSPACE_TYPES.developerCompany
  if (normalized === 'attorney') return WORKSPACE_TYPES.attorneyFirm
  if (normalized === 'bond_originator') return WORKSPACE_TYPES.bondOriginator
  return ''
}
