export const ORG_ROLES = Object.freeze({
  owner: 'owner',
  principal: 'principal',
  director: 'director',
  partner: 'partner',
  branchManager: 'branch_manager',
  manager: 'manager',
  salesManager: 'sales_manager',
  developmentManager: 'development_manager',
  salesAgent: 'sales_agent',
  attorney: 'attorney',
  conveyancer: 'conveyancer',
  bondOriginator: 'bond_originator',
  consultant: 'consultant',
  processor: 'processor',
  agent: 'agent',
  adminStaff: 'admin_staff',
  paralegal: 'paralegal',
  viewer: 'viewer',
})

export const ORG_ROLE_VALUES = Object.freeze(Object.values(ORG_ROLES))

export function normalizeOrgRole(value, { appRole = '', workspaceType = '' } = {}) {
  const normalized = String(value || '').trim().toLowerCase()
  if (!normalized) return ORG_ROLES.viewer
  if (ORG_ROLE_VALUES.includes(normalized)) return normalized

  if (normalized === 'super_admin' || normalized === 'superadmin' || normalized === 'administrator') {
    return ORG_ROLES.owner
  }
  if (normalized === 'admin' || normalized === 'branch_admin') return ORG_ROLES.adminStaff
  if (normalized === 'principal / owner' || normalized === 'agency_owner') return ORG_ROLES.principal
  if (normalized === 'branch manager') return ORG_ROLES.branchManager
  if (normalized === 'firm_admin') return ORG_ROLES.owner
  if (normalized === 'director_partner') return ORG_ROLES.partner
  if (normalized === 'transfer_attorney' || normalized === 'bond_attorney' || normalized === 'candidate_attorney') {
    return ORG_ROLES.attorney
  }
  if (normalized === 'conveyancing_secretary' || normalized === 'reception_scheduling') {
    return ORG_ROLES.adminStaff
  }

  if (normalized === 'developer') {
    return appRole === 'developer' || workspaceType === 'developer_company' ? ORG_ROLES.owner : ORG_ROLES.manager
  }
  if (normalized === 'bond originator' || normalized === 'originator') return ORG_ROLES.bondOriginator

  return ORG_ROLES.viewer
}

export function isWorkspaceAuthorityRole(value) {
  const normalized = normalizeOrgRole(value)
  return [
    ORG_ROLES.owner,
    ORG_ROLES.principal,
    ORG_ROLES.director,
    ORG_ROLES.partner,
    ORG_ROLES.branchManager,
    ORG_ROLES.manager,
    ORG_ROLES.salesManager,
    ORG_ROLES.developmentManager,
  ].includes(normalized)
}
