const COMMERCIAL_PLATFORM_ROLE = 'commercial'

export const COMMERCIAL_MODULE_MARKERS = Object.freeze([
  'commercial',
  'commercial_brokerage',
  'commercial_agency',
])

const COMMERCIAL_MODULE_MARKER_SET = new Set(COMMERCIAL_MODULE_MARKERS)

const COMMERCIAL_MANAGER_ROLES = new Set([
  'commercial_principal',
  'commercial_director',
  'commercial_admin',
  'commercial_hq_admin',
  'commercial_hq_manager',
  'commercial_branch_manager',
  'commercial_branch_admin',
  'commercial_team_leader',
  'owner',
  'principal',
  'director',
  'partner',
  'admin',
  'super_admin',
  'admin_staff',
  'manager',
  'hq_manager',
  'branch_manager',
  'branch_admin',
  'regional_manager',
  'team_leader',
  'team_manager',
])

const COMMERCIAL_BROKER_ROLES = new Set([
  'commercial_broker',
  'senior_commercial_broker',
  'broker',
  'agent',
  'senior_agent',
])

function normalizeKey(value = '') {
  return String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_')
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

function firstObject(...values) {
  for (const value of values) {
    const parsed = parseObject(value)
    if (Object.keys(parsed).length > 0) return parsed
  }
  return {}
}

export function getCommercialMetadata(source = {}) {
  const safeSource = source && typeof source === 'object' ? source : {}
  const raw = safeSource.raw && typeof safeSource.raw === 'object' ? safeSource.raw : {}
  return firstObject(
    raw.module_metadata,
    raw.moduleMetadata,
    raw.metadata,
    safeSource.module_metadata,
    safeSource.moduleMetadata,
    safeSource.metadata,
    safeSource.metadata_json,
    safeSource.metadataJson,
  )
}

function commercialModuleValue(source = {}, metadata = {}) {
  const safeSource = source && typeof source === 'object' ? source : {}
  const raw = safeSource.raw && typeof safeSource.raw === 'object' ? safeSource.raw : {}
  return normalizeKey(
    safeSource.module_context ||
      safeSource.moduleContext ||
      safeSource.module ||
      safeSource.module_type ||
      safeSource.moduleType ||
      raw.module_context ||
      raw.moduleContext ||
      raw.module ||
      raw.module_type ||
      raw.moduleType ||
      metadata.module ||
      metadata.module_context ||
      metadata.moduleContext ||
      metadata.module_type ||
      metadata.moduleType ||
      metadata.workspace_module,
  )
}

function commercialWorkspaceType(source = {}) {
  const safeSource = source && typeof source === 'object' ? source : {}
  const raw = safeSource.raw && typeof safeSource.raw === 'object' ? safeSource.raw : {}
  return normalizeKey(
    safeSource.workspace_type ||
      safeSource.workspaceType ||
      safeSource.workspace?.type ||
      raw.workspace_type ||
      raw.workspaceType ||
      raw.workspace?.type,
  )
}

function commercialPlatformRole(source = {}, metadata = {}) {
  const safeSource = source && typeof source === 'object' ? source : {}
  const raw = safeSource.raw && typeof safeSource.raw === 'object' ? safeSource.raw : {}
  return normalizeKey(
    safeSource.platform_role ||
      safeSource.platformRole ||
      raw.platform_role ||
      raw.platformRole ||
      metadata.platform_role ||
      metadata.platformRole,
  )
}

function explicitCommercialRoleValues(source = {}, metadata = {}) {
  const safeSource = source && typeof source === 'object' ? source : {}
  const raw = safeSource.raw && typeof safeSource.raw === 'object' ? safeSource.raw : {}
  return [
    safeSource.commercial_role,
    safeSource.commercialRole,
    raw.commercial_role,
    raw.commercialRole,
    metadata.commercial_role,
    metadata.commercialRole,
    metadata.broker_role,
    metadata.brokerRole,
    metadata.role_label,
    metadata.roleLabel,
  ].map(normalizeKey).filter(Boolean)
}

function workspaceRoleValues(source = {}, metadata = {}) {
  const safeSource = source && typeof source === 'object' ? source : {}
  const raw = safeSource.raw && typeof safeSource.raw === 'object' ? safeSource.raw : {}
  return [
    safeSource.workspace_role,
    safeSource.workspaceRole,
    safeSource.organisation_role,
    safeSource.organisationRole,
    safeSource.role,
    safeSource.rawRole,
    raw.workspace_role,
    raw.workspaceRole,
    raw.organisation_role,
    raw.organisationRole,
    raw.role,
    metadata.workspace_role,
    metadata.workspaceRole,
    metadata.organisation_role,
    metadata.organisationRole,
    metadata.role,
  ].map(normalizeKey).filter(Boolean)
}

function hasCommercialRoleMarker(role = '') {
  return role.startsWith('commercial_') || role.includes('commercial_broker')
}

function isBrokerRole(role = '') {
  return COMMERCIAL_BROKER_ROLES.has(role) || role.includes('broker')
}

function isManagerRole(role = '') {
  return COMMERCIAL_MANAGER_ROLES.has(role)
}

function commercialRoleKind(source = {}) {
  if (typeof source === 'string') {
    const role = normalizeKey(source)
    if (isBrokerRole(role)) return 'broker'
    if (isManagerRole(role)) return 'manager'
    return ''
  }

  const safeSource = source && typeof source === 'object' ? source : {}
  const metadata = getCommercialMetadata(safeSource)
  const explicitRoles = explicitCommercialRoleValues(safeSource, metadata)
  for (const role of explicitRoles) {
    if (isBrokerRole(role)) return 'broker'
    if (isManagerRole(role)) return 'manager'
  }

  if (!hasCommercialAccessMarker(safeSource)) return ''
  for (const role of workspaceRoleValues(safeSource, metadata)) {
    if (isBrokerRole(role)) return 'broker'
    if (isManagerRole(role)) return 'manager'
  }
  return ''
}

export function hasCommercialAccessMarker(source = {}) {
  if (typeof source === 'string') {
    const role = normalizeKey(source)
    return isBrokerRole(role) || isManagerRole(role)
  }

  const safeSource = source && typeof source === 'object' ? source : {}
  const metadata = getCommercialMetadata(safeSource)
  if (COMMERCIAL_MODULE_MARKER_SET.has(commercialModuleValue(safeSource, metadata))) return true
  if (COMMERCIAL_MODULE_MARKER_SET.has(commercialWorkspaceType(safeSource))) return true
  if (commercialPlatformRole(safeSource, metadata) === COMMERCIAL_PLATFORM_ROLE) return true
  if (explicitCommercialRoleValues(safeSource, metadata).some((role) => isBrokerRole(role) || isManagerRole(role) || hasCommercialRoleMarker(role))) return true
  return workspaceRoleValues(safeSource, metadata).some(hasCommercialRoleMarker)
}

export function isCommercialBrokerMember(source = {}) {
  return commercialRoleKind(source) === 'broker'
}

export function isCommercialManagerMember(source = {}) {
  return commercialRoleKind(source) === 'manager'
}

export function isCommercialProfessionalMember(source = {}) {
  return hasCommercialAccessMarker(source) && Boolean(commercialRoleKind(source))
}
