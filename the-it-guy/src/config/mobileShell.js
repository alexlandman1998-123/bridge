const MOBILE_NAV_ITEMS = Object.freeze({
  home: { key: 'home', label: 'Home', to: '/mobile/home' },
  transactions: { key: 'transactions', label: 'Transactions', to: '/mobile/transactions' },
  leads: { key: 'leads', label: 'Leads', to: '/mobile/leads' },
  notifications: { key: 'notifications', label: 'Notifications', to: '/mobile/notifications' },
  more: { key: 'more', label: 'More', to: '/mobile/more' },
  reports: { key: 'reports', label: 'Reports', to: '/mobile/reports' },
  matters: { key: 'matters', label: 'Matters', to: '/mobile/matters' },
  documents: { key: 'documents', label: 'Documents', to: '/mobile/documents' },
  applications: { key: 'applications', label: 'Applications', to: '/mobile/applications' },
  pipeline: { key: 'pipeline', label: 'Pipeline', to: '/mobile/pipeline' },
  listings: { key: 'listings', label: 'Listings', to: '/mobile/listings' },
  deals: { key: 'deals', label: 'Deals', to: '/mobile/deals' },
})

const MOBILE_NAV_BY_CATEGORY = Object.freeze({
  agent: ['home', 'transactions', 'leads', 'notifications', 'more'],
  principal: ['home', 'transactions', 'leads', 'reports', 'more'],
  attorney: ['home', 'matters', 'documents', 'notifications', 'more'],
  bond_originator: ['home', 'applications', 'documents', 'notifications', 'more'],
  commercial: ['home', 'pipeline', 'listings', 'deals', 'more'],
  default: ['home', 'transactions', 'leads', 'notifications', 'more'],
})

const PRINCIPAL_ROLE_MARKERS = new Set([
  'owner',
  'principal',
  'agency_principal',
  'branch_principal',
  'director',
  'manager',
  'admin',
  'administrator',
])

function normalize(value = '') {
  return String(value || '').trim().toLowerCase()
}

function readMembershipRole(workspace = {}) {
  const membership = workspace.currentMembership || {}
  const raw = membership.raw && typeof membership.raw === 'object' ? membership.raw : {}
  return normalize(
    workspace.workspaceRole ||
      membership.workspaceRole ||
      membership.workspace_role ||
      membership.organisationRole ||
      membership.organisation_role ||
      membership.role ||
      raw.workspace_role ||
      raw.organisation_role ||
      raw.role,
  )
}

function hasCommercialMarker(workspace = {}) {
  const role = normalize(workspace.role || workspace.baseRole)
  if (role.startsWith('commercial_') || role === 'commercial') return true

  const membership = workspace.currentMembership || {}
  const raw = membership.raw && typeof membership.raw === 'object' ? membership.raw : {}
  const metadata =
    (raw.module_metadata && typeof raw.module_metadata === 'object' ? raw.module_metadata : null) ||
    (raw.moduleMetadata && typeof raw.moduleMetadata === 'object' ? raw.moduleMetadata : null) ||
    (raw.metadata && typeof raw.metadata === 'object' ? raw.metadata : null) ||
    (membership.module_metadata && typeof membership.module_metadata === 'object' ? membership.module_metadata : null) ||
    (membership.moduleMetadata && typeof membership.moduleMetadata === 'object' ? membership.moduleMetadata : null) ||
    (membership.metadata && typeof membership.metadata === 'object' ? membership.metadata : {}) ||
    {}
  const marker = normalize(
    workspace.workspaceType ||
      membership.workspaceType ||
      membership.workspace_type ||
      raw.workspace_type ||
      raw.module_context ||
      raw.module ||
      metadata.module_context ||
      metadata.module ||
      metadata.commercial_role ||
      metadata.broker_role,
  )
  return marker.includes('commercial') || marker.includes('broker')
}

export function resolveMobileRoleCategory(workspace = {}) {
  const role = normalize(workspace.role || workspace.baseRole)
  if (hasCommercialMarker(workspace)) return 'commercial'
  if (role === 'attorney') return 'attorney'
  if (role === 'bond_originator') return 'bond_originator'
  if (role === 'agent') {
    const membershipRole = readMembershipRole(workspace)
    if (PRINCIPAL_ROLE_MARKERS.has(membershipRole) || normalize(workspace.agencyWorkflowMode) === 'principal') {
      return 'principal'
    }
    return 'agent'
  }
  return MOBILE_NAV_BY_CATEGORY[role] ? role : 'default'
}

export function getMobileNavItems(workspace = {}) {
  const category = resolveMobileRoleCategory(workspace)
  return (MOBILE_NAV_BY_CATEGORY[category] || MOBILE_NAV_BY_CATEGORY.default).map((key) => MOBILE_NAV_ITEMS[key])
}

export function getMobileWorkLabel(workspace = {}) {
  const category = resolveMobileRoleCategory(workspace)
  if (category === 'attorney') return 'Matters'
  if (category === 'bond_originator') return 'Applications'
  if (category === 'commercial') return 'Deals'
  return 'Transactions'
}

export function getMobileRouteTitle(pathname = '', workspace = {}) {
  const normalizedPath = normalize(pathname).replace(/\/+$/, '') || '/mobile/home'
  if (normalizedPath === '/mobile') return 'Home'
  if (normalizedPath === '/mobile/home') return 'Home'
  if (normalizedPath === '/mobile/search') return 'Search'
  if (normalizedPath === '/mobile/inbox') return 'Inbox'
  if (normalizedPath.includes('/onboarding')) return 'Onboarding'

  const navItem = Object.values(MOBILE_NAV_ITEMS).find((item) => item.to === normalizedPath)
  if (navItem) return navItem.label

  if (normalizedPath.includes('/matters')) return 'Matters'
  if (normalizedPath.includes('/applications')) return 'Applications'
  if (normalizedPath.includes('/deals')) return 'Deals'
  return getMobileWorkLabel(workspace)
}
