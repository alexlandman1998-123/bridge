export const WORKSPACE_TYPES = Object.freeze({
  agency: 'agency',
  developerCompany: 'developer_company',
  attorneyFirm: 'attorney_firm',
  bondOriginator: 'bond_originator',
})

export const WORKSPACE_TYPE_VALUES = Object.freeze(Object.values(WORKSPACE_TYPES))

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
