export const ORG_ROLES = Object.freeze({
  owner: 'owner',
  principal: 'principal',
  director: 'director',
  partner: 'partner',
  branchManager: 'branch_manager',
  hqManager: 'hq_manager',
  regionalManager: 'regional_manager',
  teamLead: 'team_lead',
  manager: 'manager',
  salesManager: 'sales_manager',
  developmentManager: 'development_manager',
  salesAgent: 'sales_agent',
  attorney: 'attorney',
  conveyancer: 'conveyancer',
  bondOriginator: 'bond_originator',
  consultant: 'consultant',
  processor: 'processor',
  compliance: 'compliance',
  agent: 'agent',
  adminStaff: 'admin_staff',
  paralegal: 'paralegal',
  viewer: 'viewer',
})

export const ORG_ROLE_VALUES = Object.freeze(Object.values(ORG_ROLES))

export const BOND_CANONICAL_ROLES = Object.freeze([
  ORG_ROLES.owner,
  ORG_ROLES.director,
  ORG_ROLES.hqManager,
  ORG_ROLES.regionalManager,
  ORG_ROLES.branchManager,
  ORG_ROLES.teamLead,
  ORG_ROLES.consultant,
  ORG_ROLES.processor,
  ORG_ROLES.compliance,
  ORG_ROLES.adminStaff,
])

const BOND_CANONICAL_ROLE_VALUES = Object.freeze(new Set(BOND_CANONICAL_ROLES))

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
  if (normalized === 'hq manager') return ORG_ROLES.hqManager
  if (normalized === 'regional manager') return ORG_ROLES.regionalManager
  if (normalized === 'team lead') return ORG_ROLES.teamLead
  if (normalized === 'bond_hq_admin' || normalized === 'bond hq admin' || normalized === 'national_admin') return ORG_ROLES.hqManager
  if (normalized === 'bond_hq_manager' || normalized === 'bond hq manager' || normalized === 'national_manager') return ORG_ROLES.hqManager
  if (normalized === 'bond_regional_manager' || normalized === 'bond regional manager') return ORG_ROLES.regionalManager
  if (normalized === 'bond_branch_manager' || normalized === 'bond branch manager') return ORG_ROLES.branchManager
  if (normalized === 'bond_team_lead' || normalized === 'bond team lead') return ORG_ROLES.teamLead
  if (normalized === 'bond_consultant' || normalized === 'bond consultant') return ORG_ROLES.consultant
  if (normalized === 'bond_processor' || normalized === 'bond processor') return ORG_ROLES.processor
  if (normalized === 'bond_independent_consultant' || normalized === 'independent_consultant' || normalized === 'independent originator') return ORG_ROLES.consultant
  if (normalized === 'firm_admin') return ORG_ROLES.owner
  if (normalized === 'director_partner') return ORG_ROLES.partner
  if (normalized === 'compliance') return ORG_ROLES.compliance
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
    ORG_ROLES.hqManager,
    ORG_ROLES.regionalManager,
    ORG_ROLES.teamLead,
    ORG_ROLES.manager,
    ORG_ROLES.salesManager,
    ORG_ROLES.developmentManager,
  ].includes(normalized)
}

export function isBondCanonicalRole(value) {
  return BOND_CANONICAL_ROLE_VALUES.has(normalizeOrgRole(value))
}
