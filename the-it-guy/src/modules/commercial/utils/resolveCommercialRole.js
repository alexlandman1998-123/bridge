export const COMMERCIAL_PLATFORM_ROLE = 'commercial'

export const COMMERCIAL_MODULE_MARKERS = new Set([
  'commercial',
  'commercial_brokerage',
  'commercial_agency',
])

export const COMMERCIAL_ROLES = Object.freeze({
  principal: 'commercial_principal',
  director: 'commercial_director',
  admin: 'commercial_admin',
  hqManager: 'commercial_hq_manager',
  branchManager: 'commercial_branch_manager',
  branchAdmin: 'commercial_branch_admin',
  teamLeader: 'commercial_team_leader',
  broker: 'commercial_broker',
  seniorBroker: 'senior_commercial_broker',
})

export const COMMERCIAL_ORGANISATION_SCOPE_ROLES = new Set([
  COMMERCIAL_ROLES.principal,
  COMMERCIAL_ROLES.director,
  COMMERCIAL_ROLES.admin,
  COMMERCIAL_ROLES.hqManager,
])

export const COMMERCIAL_BRANCH_SCOPE_ROLES = new Set([
  COMMERCIAL_ROLES.branchManager,
  COMMERCIAL_ROLES.branchAdmin,
])

export const COMMERCIAL_TEAM_SCOPE_ROLES = new Set([
  COMMERCIAL_ROLES.teamLeader,
])

export const COMMERCIAL_BROKER_SCOPE_ROLES = new Set([
  COMMERCIAL_ROLES.broker,
  COMMERCIAL_ROLES.seniorBroker,
])

export const COMMERCIAL_EXTERNAL_PORTAL_ROLES = new Set([
  'tenant',
  'landlord',
  'buyer',
  'seller',
  'investor',
  'property_manager',
  'corporate_contact',
])

const COMMERCIAL_SPECIFIC_ROLE_MAP = new Map([
  ['commercial_principal', COMMERCIAL_ROLES.principal],
  ['commercial_director', COMMERCIAL_ROLES.director],
  ['commercial_admin', COMMERCIAL_ROLES.admin],
  ['commercial_hq_admin', COMMERCIAL_ROLES.hqManager],
  ['commercial_hq_manager', COMMERCIAL_ROLES.hqManager],
  ['commercial_branch_manager', COMMERCIAL_ROLES.branchManager],
  ['commercial_branch_admin', COMMERCIAL_ROLES.branchAdmin],
  ['commercial_team_leader', COMMERCIAL_ROLES.teamLeader],
  ['commercial_broker', COMMERCIAL_ROLES.broker],
  ['senior_commercial_broker', COMMERCIAL_ROLES.seniorBroker],
])

const LEGACY_COMMERCIAL_ROLE_MAP = new Map([
  ['owner', COMMERCIAL_ROLES.principal],
  ['principal', COMMERCIAL_ROLES.principal],
  ['director', COMMERCIAL_ROLES.principal],
  ['partner', COMMERCIAL_ROLES.principal],
  ['admin', COMMERCIAL_ROLES.admin],
  ['super_admin', COMMERCIAL_ROLES.admin],
  ['admin_staff', COMMERCIAL_ROLES.admin],
  ['manager', COMMERCIAL_ROLES.hqManager],
  ['hq_manager', COMMERCIAL_ROLES.hqManager],
  ['branch_manager', COMMERCIAL_ROLES.branchManager],
  ['branch_admin', COMMERCIAL_ROLES.branchManager],
  ['regional_manager', COMMERCIAL_ROLES.branchManager],
  ['team_leader', COMMERCIAL_ROLES.teamLeader],
  ['team_manager', COMMERCIAL_ROLES.teamLeader],
  ['broker', COMMERCIAL_ROLES.broker],
  ['agent', COMMERCIAL_ROLES.broker],
  ['senior_agent', COMMERCIAL_ROLES.seniorBroker],
])

const ACCESS_REVIEWER_LEGACY_ROLES = new Set([
  'owner',
  'principal',
  'director',
  'partner',
  'admin',
  'super_admin',
])

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase()
}

function parseObject(value) {
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

export function getCommercialMetadata(userOrMembership = {}) {
  const source = userOrMembership && typeof userOrMembership === 'object' ? userOrMembership : {}
  return parseObject(
    source.module_metadata ||
      source.moduleMetadata ||
      source.metadata ||
      source.metadata_json ||
      source.metadataJson,
  )
}

function normalizeExplicitCommercialRole(value) {
  const normalized = normalizeLower(value).replace(/\s+/g, '_')
  if (!normalized) return null
  if (normalized === 'broker') return COMMERCIAL_ROLES.broker
  return COMMERCIAL_SPECIFIC_ROLE_MAP.get(normalized) || null
}

export function mapLegacyCommercialRole(value) {
  const normalized = normalizeLower(value).replace(/\s+/g, '_')
  if (!normalized) return null
  return normalizeExplicitCommercialRole(normalized) || LEGACY_COMMERCIAL_ROLE_MAP.get(normalized) || null
}

export function hasCommercialAccessMarker(userOrMembership = {}) {
  if (typeof userOrMembership === 'string') return Boolean(mapLegacyCommercialRole(userOrMembership))
  const source = userOrMembership && typeof userOrMembership === 'object' ? userOrMembership : {}
  const metadata = getCommercialMetadata(source)
  const moduleValue = normalizeLower(
    source.module_context ||
      source.moduleContext ||
      source.module ||
      source.module_type ||
      source.moduleType ||
      metadata.module ||
      metadata.module_context ||
      metadata.moduleContext ||
      metadata.workspace_module,
  )
  if (COMMERCIAL_MODULE_MARKERS.has(moduleValue)) return true

  const workspaceType = normalizeLower(source.workspace_type || source.workspaceType)
  if (COMMERCIAL_MODULE_MARKERS.has(workspaceType)) return true

  const platformRole = normalizeLower(source.platform_role || source.platformRole || metadata.platform_role || metadata.platformRole)
  if (platformRole === COMMERCIAL_PLATFORM_ROLE) return true

  const explicitRole = normalizeExplicitCommercialRole(
    source.commercial_role ||
      source.commercialRole ||
      metadata.commercial_role ||
      metadata.commercialRole ||
      metadata.broker_role ||
      metadata.brokerRole,
  )
  if (explicitRole) return true

  const roleValues = [
    source.workspace_role,
    source.workspaceRole,
    source.organisation_role,
    source.organisationRole,
    source.role,
    metadata.workspace_role,
    metadata.organisation_role,
    metadata.role,
  ]
  return roleValues.some((role) => Boolean(normalizeExplicitCommercialRole(role)))
}

export function resolveCommercialRole(userOrMembership = null) {
  if (!userOrMembership) return null
  if (typeof userOrMembership === 'string') return mapLegacyCommercialRole(userOrMembership)

  const source = userOrMembership && typeof userOrMembership === 'object' ? userOrMembership : {}
  const metadata = getCommercialMetadata(source)
  const explicitRole = normalizeExplicitCommercialRole(
    source.commercial_role ||
      source.commercialRole ||
      metadata.commercial_role ||
      metadata.commercialRole ||
      metadata.broker_role ||
      metadata.brokerRole,
  )
  if (explicitRole) return explicitRole

  const commercialSpecificWorkspaceRole = normalizeExplicitCommercialRole(source.workspace_role || source.workspaceRole)
  if (commercialSpecificWorkspaceRole) return commercialSpecificWorkspaceRole

  const commercialSpecificOrganisationRole = normalizeExplicitCommercialRole(source.organisation_role || source.organisationRole)
  if (commercialSpecificOrganisationRole) return commercialSpecificOrganisationRole

  const commercialSpecificRole = normalizeExplicitCommercialRole(source.role || metadata.role)
  if (commercialSpecificRole) return commercialSpecificRole

  const hasMarker = hasCommercialAccessMarker(source)
  if (!hasMarker) return null

  const roleValues = [
    source.workspace_role,
    source.workspaceRole,
    source.organisation_role,
    source.organisationRole,
    source.role,
    metadata.workspace_role,
    metadata.workspaceRole,
    metadata.organisation_role,
    metadata.organisationRole,
    metadata.role,
  ]
  for (const role of roleValues) {
    const mapped = mapLegacyCommercialRole(role)
    if (mapped) return mapped
  }

  return null
}

export function getCommercialScopeLevel(userOrMembership = null) {
  const role = resolveCommercialRole(userOrMembership)
  if (!role) return null
  if (COMMERCIAL_ORGANISATION_SCOPE_ROLES.has(role)) return 'organisation'
  if (COMMERCIAL_BRANCH_SCOPE_ROLES.has(role)) return 'branch'
  if (COMMERCIAL_TEAM_SCOPE_ROLES.has(role)) return 'team'
  if (COMMERCIAL_BROKER_SCOPE_ROLES.has(role)) return 'broker'
  return null
}

export function hasCommercialOrganisationScope(userOrMembership = null) {
  return getCommercialScopeLevel(userOrMembership) === 'organisation'
}

export function hasCommercialBranchScope(userOrMembership = null) {
  return getCommercialScopeLevel(userOrMembership) === 'branch'
}

export function hasCommercialTeamScope(userOrMembership = null) {
  return getCommercialScopeLevel(userOrMembership) === 'team'
}

export function isCommercialBroker(userOrMembership = null) {
  return getCommercialScopeLevel(userOrMembership) === 'broker'
}

export function isCommercialManager(userOrMembership = null) {
  return ['organisation', 'branch', 'team'].includes(getCommercialScopeLevel(userOrMembership))
}

export function canManageCommercialBrokerage(userOrMembership = null) {
  return isCommercialManager(userOrMembership)
}

export function isCommercialAccessReviewer(userOrMembership = null) {
  if (!userOrMembership) return false
  if (typeof userOrMembership === 'string') return ACCESS_REVIEWER_LEGACY_ROLES.has(normalizeLower(userOrMembership))
  const source = userOrMembership && typeof userOrMembership === 'object' ? userOrMembership : {}
  const role = resolveCommercialRole(source)
  if ([COMMERCIAL_ROLES.principal, COMMERCIAL_ROLES.director, COMMERCIAL_ROLES.admin].includes(role)) return true
  return [
    source.membershipRole,
    source.workspace_role,
    source.workspaceRole,
    source.organisation_role,
    source.organisationRole,
    source.role,
  ].some((legacyRole) => ACCESS_REVIEWER_LEGACY_ROLES.has(normalizeLower(legacyRole)))
}

export function buildCommercialRolePatch(userOrMembership = {}, fallback = COMMERCIAL_ROLES.broker) {
  return {
    platform_role: COMMERCIAL_PLATFORM_ROLE,
    commercial_role: resolveCommercialRole(userOrMembership) || fallback,
  }
}
