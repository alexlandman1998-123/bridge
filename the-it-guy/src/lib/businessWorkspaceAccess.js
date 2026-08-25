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
const DEFAULT_BUSINESS_WORKSPACE_ORDER = Object.freeze([BUSINESS_WORKSPACES.sales, BUSINESS_WORKSPACES.rentals])

const MANAGEMENT_ROLES = new Set([
  'owner',
  'principal',
  'agency_principal',
  'principal_owner',
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

function orderedWorkspaces(values = []) {
  const set = new Set(values)
  return DEFAULT_BUSINESS_WORKSPACE_ORDER.filter((id) => set.has(id))
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

function collectWorkspacesFromSources(...values) {
  const workspaces = new Set()
  values.forEach((value) => addWorkspacesFromValue(workspaces, value))
  return orderedWorkspaces(workspaces)
}

export function normalizeBusinessWorkspaceList(value = null, fallback = [BUSINESS_WORKSPACES.sales]) {
  const normalized = collectWorkspacesFromSources(value)
  if (normalized.length) return normalized
  if (!fallback) return []
  return collectWorkspacesFromSources(fallback)
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

function isWorkspaceDepartmentUnit(unit = {}) {
  const unitType = normalizeKey(unit?.unitType || unit?.unit_type || unit?.type)
  return ['department', 'hq_department', 'team', 'admin_team', 'processing_hub'].includes(unitType)
}

function collectUnitBusinessWorkspaces(unit = {}) {
  if (!unit || typeof unit !== 'object') return []
  const metadata = {
    ...asObject(unit.raw?.module_metadata),
    ...asObject(unit.raw?.moduleMetadata),
    ...asObject(unit.raw?.metadata_json),
    ...asObject(unit.raw?.metadataJson),
    ...asObject(unit.raw?.metadata),
    ...asObject(unit.module_metadata),
    ...asObject(unit.moduleMetadata),
    ...asObject(unit.metadata_json),
    ...asObject(unit.metadataJson),
    ...asObject(unit.metadata),
  }
  const workspaces = new Set()
  addWorkspacesFromValue(workspaces, unit.businessWorkspaces)
  addWorkspacesFromValue(workspaces, unit.business_workspaces)
  addWorkspacesFromValue(workspaces, unit.allowedBusinessWorkspaces)
  addWorkspacesFromValue(workspaces, unit.allowed_business_workspaces)
  addWorkspacesFromValue(workspaces, unit.workspaceAccess)
  addWorkspacesFromValue(workspaces, unit.workspace_access)
  addWorkspacesFromValue(workspaces, unit.businessLine)
  addWorkspacesFromValue(workspaces, unit.business_line)
  addWorkspacesFromValue(workspaces, unit.businessWorkspace)
  addWorkspacesFromValue(workspaces, unit.business_workspace)
  addWorkspacesFromValue(workspaces, metadata.businessWorkspaces)
  addWorkspacesFromValue(workspaces, metadata.business_workspaces)
  addWorkspacesFromValue(workspaces, metadata.allowedBusinessWorkspaces)
  addWorkspacesFromValue(workspaces, metadata.allowed_business_workspaces)
  addWorkspacesFromValue(workspaces, metadata.workspaceAccess)
  addWorkspacesFromValue(workspaces, metadata.workspace_access)
  addWorkspacesFromValue(workspaces, metadata.businessLine)
  addWorkspacesFromValue(workspaces, metadata.business_line)
  addWorkspacesFromValue(workspaces, metadata.businessWorkspace)
  addWorkspacesFromValue(workspaces, metadata.business_workspace)

  if (isWorkspaceDepartmentUnit(unit)) {
    addWorkspacesFromValue(workspaces, unit.code)
    addWorkspacesFromValue(workspaces, unit.unitCode)
    addWorkspacesFromValue(workspaces, unit.unit_code)
  }

  return orderedWorkspaces(workspaces)
}

export function resolveMembershipDepartmentBusinessWorkspaces(membership = {}) {
  const scopeMetadata = {
    ...asObject(membership?.raw?.scope_metadata),
    ...asObject(membership?.raw?.scopeMetadata),
    ...asObject(membership?.scope_metadata),
    ...asObject(membership?.scopeMetadata),
  }
  const moduleMetadata = {
    ...asObject(membership?.raw?.module_metadata),
    ...asObject(membership?.raw?.moduleMetadata),
    ...asObject(membership?.module_metadata),
    ...asObject(membership?.moduleMetadata),
  }
  return collectWorkspacesFromSources(
    membership.departmentBusinessWorkspaces,
    membership.department_business_workspaces,
    membership.teamBusinessWorkspaces,
    membership.team_business_workspaces,
    membership.workspaceUnitBusinessWorkspaces,
    membership.workspace_unit_business_workspaces,
    scopeMetadata.departmentBusinessWorkspaces,
    scopeMetadata.department_business_workspaces,
    scopeMetadata.teamBusinessWorkspaces,
    scopeMetadata.team_business_workspaces,
    scopeMetadata.workspaceUnitBusinessWorkspaces,
    scopeMetadata.workspace_unit_business_workspaces,
    moduleMetadata.departmentBusinessWorkspaces,
    moduleMetadata.department_business_workspaces,
    moduleMetadata.teamBusinessWorkspaces,
    moduleMetadata.team_business_workspaces,
    moduleMetadata.workspaceUnitBusinessWorkspaces,
    moduleMetadata.workspace_unit_business_workspaces,
    collectUnitBusinessWorkspaces(membership.department),
    collectUnitBusinessWorkspaces(membership.departmentUnit),
    collectUnitBusinessWorkspaces(membership.department_unit),
    collectUnitBusinessWorkspaces(membership.team),
    collectUnitBusinessWorkspaces(membership.teamUnit),
    collectUnitBusinessWorkspaces(membership.team_unit),
    collectUnitBusinessWorkspaces(membership.workspaceUnit),
    collectUnitBusinessWorkspaces(membership.workspace_unit),
  )
}

export function resolveOrganisationBusinessWorkspaces({ currentWorkspace = null, currentMembership = null } = {}) {
  const membership = currentMembership && typeof currentMembership === 'object' ? currentMembership : {}
  const workspace = currentWorkspace && typeof currentWorkspace === 'object'
    ? currentWorkspace
    : membership.workspace && typeof membership.workspace === 'object'
      ? membership.workspace
      : {}
  const rawWorkspace = {
    ...asObject(workspace.raw),
    ...asObject(membership.raw?.organisations),
    ...asObject(membership.raw?.organization),
    ...asObject(membership.raw?.workspace),
  }
  const workspaceSettings = {
    ...asObject(workspace.settingsJson),
    ...asObject(workspace.settings_json),
    ...asObject(workspace.settings),
    ...asObject(workspace.organisationSettings),
    ...asObject(workspace.organizationSettings),
    ...asObject(workspace.organisation_settings),
    ...asObject(workspace.organization_settings),
    ...asObject(rawWorkspace.settingsJson),
    ...asObject(rawWorkspace.settings_json),
    ...asObject(rawWorkspace.settings),
    ...asObject(rawWorkspace.organisationSettings),
    ...asObject(rawWorkspace.organizationSettings),
    ...asObject(rawWorkspace.organisation_settings),
    ...asObject(rawWorkspace.organization_settings),
  }
  const agencyInformation = {
    ...asObject(workspace.agencyInformation),
    ...asObject(workspace.agency_information),
    ...asObject(workspaceSettings.agencyInformation),
    ...asObject(workspaceSettings.agency_information),
    ...asObject(rawWorkspace.agencyInformation),
    ...asObject(rawWorkspace.agency_information),
  }

  return collectWorkspacesFromSources(
    workspace.businessLines,
    workspace.business_lines,
    workspace.businessWorkspaces,
    workspace.business_workspaces,
    workspace.businessFocus,
    workspace.business_focus,
    rawWorkspace.businessLines,
    rawWorkspace.business_lines,
    rawWorkspace.businessWorkspaces,
    rawWorkspace.business_workspaces,
    rawWorkspace.businessFocus,
    rawWorkspace.business_focus,
    workspaceSettings.businessLines,
    workspaceSettings.business_lines,
    workspaceSettings.businessWorkspaces,
    workspaceSettings.business_workspaces,
    workspaceSettings.businessFocus,
    workspaceSettings.business_focus,
    agencyInformation.businessLines,
    agencyInformation.business_lines,
    agencyInformation.businessWorkspaces,
    agencyInformation.business_workspaces,
    agencyInformation.businessFocus,
    agencyInformation.business_focus,
  )
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
  currentWorkspace = null,
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
  const departmentWorkspaces = resolveMembershipDepartmentBusinessWorkspaces(membership)
  const organisationWorkspaces = resolveOrganisationBusinessWorkspaces({ currentWorkspace, currentMembership })
  const allowedOrganisationWorkspaces = organisationWorkspaces.length
    ? organisationWorkspaces
    : DEFAULT_BUSINESS_WORKSPACE_ORDER

  if (MANAGEMENT_ROLES.has(role)) {
    return allowedOrganisationWorkspaces
  }

  if (explicitWorkspaces.size) {
    const explicitAllowed = allowedOrganisationWorkspaces.filter((id) => explicitWorkspaces.has(id))
    return explicitAllowed.length ? explicitAllowed : [allowedOrganisationWorkspaces[0] || BUSINESS_WORKSPACES.sales]
  }

  if (departmentWorkspaces.length) {
    const departmentAllowed = allowedOrganisationWorkspaces.filter((id) => departmentWorkspaces.includes(id))
    if (departmentAllowed.length) return departmentAllowed
  }

  if (normalizeKey(workspaceType) !== 'agency') return [BUSINESS_WORKSPACES.sales]
  if (organisationWorkspaces.length === 1) return organisationWorkspaces
  return [BUSINESS_WORKSPACES.sales]
}

export function resolveBusinessWorkspaceState({
  enabled = false,
  appRole = '',
  workspaceType = '',
  currentWorkspace = null,
  currentMembership = null,
  membershipRole = '',
  preferredWorkspace = BUSINESS_WORKSPACES.sales,
} = {}) {
  const availableWorkspaceIds = resolveAvailableBusinessWorkspaces({
    enabled,
    appRole,
    workspaceType,
    currentWorkspace,
    currentMembership,
    membershipRole,
  })
  const preferred = normalizeBusinessWorkspace(preferredWorkspace)
  const currentId = availableWorkspaceIds.includes(preferred) ? preferred : availableWorkspaceIds[0] || BUSINESS_WORKSPACES.sales
  const availableWorkspaces = BUSINESS_WORKSPACE_OPTIONS.filter((option) => availableWorkspaceIds.includes(option.id))
  const currentBusinessWorkspace = availableWorkspaces.find((option) => option.id === currentId) || BUSINESS_WORKSPACE_OPTIONS[0]

  return {
    enabled: Boolean(enabled && normalizeKey(appRole) === 'agent'),
    current: currentBusinessWorkspace,
    currentId,
    available: availableWorkspaces,
    availableIds: availableWorkspaceIds,
    showSwitcher: Boolean(enabled && normalizeKey(appRole) === 'agent' && availableWorkspaces.length > 1),
  }
}

function routeStartsWith(pathname = '', prefix = '') {
  const normalizedPathname = normalizeText(pathname) || '/'
  const normalizedPrefix = normalizeText(prefix)
  return normalizedPathname === normalizedPrefix || normalizedPathname.startsWith(`${normalizedPrefix}/`)
}

function appendRouteSuffix(pathname = '', search = '', hash = '', preserve = false) {
  if (!preserve) return pathname
  return `${pathname}${normalizeText(search)}${normalizeText(hash)}`
}

export function resolveBusinessWorkspaceRoute({
  pathname = '/',
  search = '',
  hash = '',
  targetWorkspace = BUSINESS_WORKSPACES.sales,
} = {}) {
  const path = normalizeText(pathname) || '/'
  const target = normalizeBusinessWorkspace(targetWorkspace, BUSINESS_WORKSPACES.sales)

  if (target === BUSINESS_WORKSPACES.rentals) {
    if (routeStartsWith(path, '/agent/rentals')) return appendRouteSuffix(path, search, hash, true)
    if (path === '/' || routeStartsWith(path, '/dashboard')) return '/agent/rentals/dashboard'
    if (routeStartsWith(path, '/transactions') || routeStartsWith(path, '/units')) return '/agent/rentals/tenancies'
    if (path === '/calendar' || routeStartsWith(path, '/pipeline/calendar')) return '/agent/rentals/pipeline/calendar'
    if (routeStartsWith(path, '/pipeline')) return '/agent/rentals/pipeline/leads'
    if (routeStartsWith(path, '/listings') || routeStartsWith(path, '/agent/listings')) return '/agent/rentals/listings'
    return appendRouteSuffix(path, search, hash, true)
  }

  if (!routeStartsWith(path, '/agent/rentals')) return appendRouteSuffix(path, search, hash, true)
  if (path === '/agent/rentals' || routeStartsWith(path, '/agent/rentals/dashboard')) return '/dashboard'
  if (routeStartsWith(path, '/agent/rentals/tenancies')) return '/transactions'
  if (routeStartsWith(path, '/agent/rentals/pipeline/calendar')) return '/pipeline/calendar'
  if (routeStartsWith(path, '/agent/rentals/pipeline')) return '/pipeline/leads'
  if (routeStartsWith(path, '/agent/rentals/listings')) return '/listings'
  return '/dashboard'
}
