export const BUSINESS_WORKSPACES = Object.freeze({
  sales: 'sales',
  rentals: 'rentals',
})

export const BUSINESS_WORKSPACE_OPTIONS = Object.freeze([
  {
    id: BUSINESS_WORKSPACES.sales,
    label: 'Sales',
    description: 'Listings and transactions',
  },
  {
    id: BUSINESS_WORKSPACES.rentals,
    label: 'Rentals',
    description: 'Leads and tenancies',
  },
])

const BUSINESS_WORKSPACE_SET = new Set(Object.values(BUSINESS_WORKSPACES))

const MANAGEMENT_ROLES = new Set([
  'owner',
  'principal',
  'director',
  'partner',
  'admin',
  'admin_staff',
  'manager',
  'hq_manager',
  'branch_manager',
  'branch_admin',
  'regional_manager',
  'team_lead',
  'team_leader',
  'team_manager',
])

const SALES_ROLE_MARKERS = new Set([
  'sales',
  'sale',
  'sales_agent',
  'sales_manager',
  'residential_sales',
  'listing_agent',
  'estate_agent',
])

const RENTAL_ROLE_MARKERS = new Set([
  'rental',
  'rentals',
  'letting',
  'lettings',
  'leasing',
  'lease',
  'rental_agent',
  'rentals_agent',
  'letting_agent',
  'leasing_agent',
  'rental_manager',
  'rentals_manager',
  'property_manager',
])

function normalizeText(value = '') {
  return String(value || '').trim()
}

export function normalizeBusinessWorkspace(value = '', fallback = BUSINESS_WORKSPACES.sales) {
  const key = normalizeText(value).toLowerCase().replace(/[\s-]+/g, '_')
  if (['sale', 'sales', 'residential_sales'].includes(key)) return BUSINESS_WORKSPACES.sales
  if (['rental', 'rentals', 'rent', 'letting', 'lettings', 'leasing', 'lease', 'residential_rentals'].includes(key)) {
    return BUSINESS_WORKSPACES.rentals
  }
  return fallback
}

function normalizeKey(value = '') {
  return normalizeText(value).toLowerCase().replace(/[\s-]+/g, '_')
}

function normalizeIdentifier(value = '') {
  return normalizeText(value).toLowerCase()
}

function addIdentifier(target, value) {
  const normalized = normalizeIdentifier(value)
  if (!normalized) return
  target.add(normalized)
  target.add(normalizeKey(normalized))
}

function addIdentifiersFromObject(target, value = {}, keys = []) {
  if (!value || typeof value !== 'object') return
  keys.forEach((key) => addIdentifier(target, value[key]))
}

function asObject(value) {
  if (!value) return {}
  if (typeof value === 'object' && !Array.isArray(value)) return value
  if (typeof value !== 'string') return {}
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function addWorkspace(target, value) {
  const workspace = normalizeBusinessWorkspace(value, '')
  if (BUSINESS_WORKSPACE_SET.has(workspace)) target.add(workspace)
}

function addWorkspacesFromValue(target, value) {
  if (!value) return
  if (Array.isArray(value)) {
    value.forEach((item) => addWorkspacesFromValue(target, item))
    return
  }
  if (typeof value === 'object') {
    for (const [key, enabled] of Object.entries(value)) {
      if (enabled === false || enabled === null) continue
      if (typeof enabled === 'object') {
        if (enabled.enabled === false || enabled.access === false || enabled.status === 'disabled') continue
      }
      addWorkspace(target, key)
    }
    return
  }

  const key = normalizeKey(value)
  if (['both', 'all', 'sales_rentals', 'sales_and_rentals', 'residential'].includes(key)) {
    target.add(BUSINESS_WORKSPACES.sales)
    target.add(BUSINESS_WORKSPACES.rentals)
    return
  }
  addWorkspace(target, key)
}

function collectMetadataWorkspaces(membership = {}) {
  const metadata = {
    ...asObject(membership?.raw?.module_metadata),
    ...asObject(membership?.raw?.moduleMetadata),
    ...asObject(membership?.raw?.metadata),
    ...asObject(membership?.module_metadata),
    ...asObject(membership?.moduleMetadata),
    ...asObject(membership?.metadata),
  }
  const workspaces = new Set()
  addWorkspacesFromValue(workspaces, metadata.businessWorkspaces)
  addWorkspacesFromValue(workspaces, metadata.business_workspaces)
  addWorkspacesFromValue(workspaces, metadata.workspaceAccess)
  addWorkspacesFromValue(workspaces, metadata.workspace_access)
  addWorkspacesFromValue(workspaces, metadata.allowedBusinessWorkspaces)
  addWorkspacesFromValue(workspaces, metadata.allowed_business_workspaces)
  addWorkspacesFromValue(workspaces, metadata.departments)
  addWorkspacesFromValue(workspaces, metadata.department)
  addWorkspacesFromValue(workspaces, metadata.modules)
  addWorkspacesFromValue(workspaces, metadata.enabledModules)
  addWorkspacesFromValue(workspaces, metadata.enabled_modules)
  return workspaces
}

function collectMarkerWorkspaces(...values) {
  const workspaces = new Set()
  for (const value of values) {
    const key = normalizeKey(value)
    if (!key) continue
    if (SALES_ROLE_MARKERS.has(key) || key.includes('sales')) workspaces.add(BUSINESS_WORKSPACES.sales)
    if (RENTAL_ROLE_MARKERS.has(key) || key.includes('rental') || key.includes('letting') || key.includes('leasing')) {
      workspaces.add(BUSINESS_WORKSPACES.rentals)
    }
  }
  return workspaces
}

function mergeWorkspaceSets(...sets) {
  const workspaces = new Set()
  for (const set of sets) {
    for (const value of set || []) workspaces.add(value)
  }
  return workspaces
}

function hasIdentifierMatch(allowed = [], candidates = []) {
  const allowedSet = new Set()
  allowed.forEach((value) => addIdentifier(allowedSet, value))
  if (!allowedSet.size) return false
  return candidates.some((candidate) => allowedSet.has(candidate))
}

export function collectBusinessWorkspaceRolloutIdentifiers({
  currentWorkspace = null,
  currentMembership = null,
  profile = null,
  user = null,
} = {}) {
  const workspaceIdentifiers = new Set()
  const userIdentifiers = new Set()
  const workspaceKeys = [
    'id',
    'workspaceId',
    'workspace_id',
    'organisationId',
    'organisation_id',
    'organizationId',
    'organization_id',
    'firmId',
    'firm_id',
    'slug',
    'workspaceSlug',
    'workspace_slug',
    'organisationSlug',
    'organisation_slug',
    'organizationSlug',
    'organization_slug',
    'name',
    'workspaceName',
    'workspace_name',
    'organisationName',
    'organisation_name',
    'organizationName',
    'organization_name',
    'companyName',
    'company_name',
    'tradingName',
    'trading_name',
  ]
  const userKeys = ['id', 'userId', 'user_id', 'email', 'emailAddress', 'email_address']

  addIdentifiersFromObject(workspaceIdentifiers, currentWorkspace, workspaceKeys)
  addIdentifiersFromObject(workspaceIdentifiers, currentWorkspace?.raw, workspaceKeys)
  addIdentifiersFromObject(workspaceIdentifiers, currentMembership, workspaceKeys)
  addIdentifiersFromObject(workspaceIdentifiers, currentMembership?.workspace, workspaceKeys)
  addIdentifiersFromObject(workspaceIdentifiers, currentMembership?.organisation, workspaceKeys)
  addIdentifiersFromObject(workspaceIdentifiers, currentMembership?.organization, workspaceKeys)
  addIdentifiersFromObject(workspaceIdentifiers, currentMembership?.raw, workspaceKeys)
  addIdentifiersFromObject(workspaceIdentifiers, currentMembership?.raw?.workspace, workspaceKeys)
  addIdentifiersFromObject(workspaceIdentifiers, currentMembership?.raw?.organisation, workspaceKeys)
  addIdentifiersFromObject(workspaceIdentifiers, currentMembership?.raw?.organization, workspaceKeys)

  addIdentifiersFromObject(userIdentifiers, user, userKeys)
  addIdentifiersFromObject(userIdentifiers, profile, userKeys)
  addIdentifiersFromObject(userIdentifiers, currentMembership, userKeys)
  addIdentifiersFromObject(userIdentifiers, currentMembership?.raw, userKeys)

  return {
    workspaceIdentifiers: Array.from(workspaceIdentifiers),
    userIdentifiers: Array.from(userIdentifiers),
  }
}

export function resolveBusinessWorkspaceRolloutAccess({
  enabled = false,
  requiresAllowlist = false,
  allowedWorkspaceIdentifiers = [],
  allowedUserIdentifiers = [],
  currentWorkspace = null,
  currentMembership = null,
  profile = null,
  user = null,
} = {}) {
  if (!enabled) return { enabled: false, reason: 'feature_disabled' }
  if (!requiresAllowlist) return { enabled: true, reason: 'allowlist_not_required' }

  const identifiers = collectBusinessWorkspaceRolloutIdentifiers({
    currentWorkspace,
    currentMembership,
    profile,
    user,
  })
  const workspaceAllowed = hasIdentifierMatch(allowedWorkspaceIdentifiers, identifiers.workspaceIdentifiers)
  const userAllowed = hasIdentifierMatch(allowedUserIdentifiers, identifiers.userIdentifiers)

  return {
    enabled: workspaceAllowed || userAllowed,
    reason: workspaceAllowed ? 'workspace_allowlisted' : userAllowed ? 'user_allowlisted' : 'allowlist_miss',
    ...identifiers,
  }
}

export function resolveAvailableBusinessWorkspaces({
  enabled = false,
  appRole = '',
  workspaceType = '',
  currentMembership = null,
  membershipRole = '',
} = {}) {
  if (!enabled || normalizeKey(appRole) !== 'agent') return [BUSINESS_WORKSPACES.sales]

  const membership = currentMembership && typeof currentMembership === 'object' ? currentMembership : {}
  const role = normalizeKey(
    membershipRole ||
      membership.workspaceRole ||
      membership.workspace_role ||
      membership.organisationRole ||
      membership.organisation_role ||
      membership.role,
  )
  const moduleContextWorkspaces = collectMarkerWorkspaces(
    membership.moduleContext,
    membership.module_context,
    membership.raw?.module_context,
    membership.raw?.moduleContext,
  )
  const metadataWorkspaces = collectMetadataWorkspaces(membership)
  const markerWorkspaces = collectMarkerWorkspaces(
    role,
    membership.rawRole,
    membership.raw_role,
    membership.jobTitle,
    membership.job_title,
    membership.raw?.job_title,
    membership.raw?.jobTitle,
    membership.raw?.department,
    membership.raw?.department_name,
  )
  const explicitWorkspaces = mergeWorkspaceSets(moduleContextWorkspaces, metadataWorkspaces, markerWorkspaces)
  if (explicitWorkspaces.size) {
    return BUSINESS_WORKSPACE_OPTIONS
      .map((option) => option.id)
      .filter((id) => explicitWorkspaces.has(id))
  }

  if (MANAGEMENT_ROLES.has(role)) {
    return [BUSINESS_WORKSPACES.sales, BUSINESS_WORKSPACES.rentals]
  }

  if (normalizeKey(workspaceType) !== 'agency') return [BUSINESS_WORKSPACES.sales]
  return [BUSINESS_WORKSPACES.sales]
}

export function resolveBusinessWorkspaceState({
  enabled = false,
  appRole = '',
  workspaceType = '',
  currentMembership = null,
  membershipRole = '',
  preferredWorkspace = BUSINESS_WORKSPACES.sales,
} = {}) {
  const availableWorkspaceIds = resolveAvailableBusinessWorkspaces({
    enabled,
    appRole,
    workspaceType,
    currentMembership,
    membershipRole,
  })
  const preferred = normalizeBusinessWorkspace(preferredWorkspace)
  const currentId = availableWorkspaceIds.includes(preferred) ? preferred : availableWorkspaceIds[0] || BUSINESS_WORKSPACES.sales
  const availableWorkspaces = BUSINESS_WORKSPACE_OPTIONS.filter((option) => availableWorkspaceIds.includes(option.id))
  const currentWorkspace = availableWorkspaces.find((option) => option.id === currentId) || BUSINESS_WORKSPACE_OPTIONS[0]

  return {
    enabled: Boolean(enabled && normalizeKey(appRole) === 'agent'),
    current: currentWorkspace,
    currentId,
    available: availableWorkspaces,
    availableIds: availableWorkspaceIds,
    showSwitcher: Boolean(enabled && normalizeKey(appRole) === 'agent' && availableWorkspaces.length > 1),
  }
}
