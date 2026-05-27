import { BOND_SCOPE_LEVELS, WORKSPACE_UNIT_TYPES } from '../constants/workspaceUnits'
import { PERMISSIONS } from '../auth/permissions/permissionRegistry'
import { can, resolvePermissionContext } from '../auth/permissions/permissionResolver'
import { isMissingTableError } from './attorneyFirmServiceShared'
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'
import { fetchOrganisationSettings } from '../lib/settingsApi'
import { getWorkspaceHierarchy } from './bondWorkspaceHierarchyService'
import { getBondTransactionTrackerSnapshot } from './bondCommandCenterService'

export const BOND_ORGANISATION_STRUCTURE_TYPES = Object.freeze({
  independent: 'independent',
  smallTeam: 'small_team',
  branchBased: 'branch_based',
  regional: 'regional',
  enterprise: 'enterprise',
})

export const BOND_ORGANISATION_STRUCTURE_OPTIONS = Object.freeze([
  { value: BOND_ORGANISATION_STRUCTURE_TYPES.independent, label: 'Independent Consultant' },
  { value: BOND_ORGANISATION_STRUCTURE_TYPES.smallTeam, label: 'Small Team' },
  { value: BOND_ORGANISATION_STRUCTURE_TYPES.branchBased, label: 'Branch-Based Organisation' },
  { value: BOND_ORGANISATION_STRUCTURE_TYPES.regional, label: 'Regional / National Organisation' },
  { value: BOND_ORGANISATION_STRUCTURE_TYPES.enterprise, label: 'Enterprise / Franchise Network' },
])

const STRUCTURE_TYPE_VALUES = new Set(Object.values(BOND_ORGANISATION_STRUCTURE_TYPES))
const MANAGEMENT_SCOPE_LEVELS = new Set([
  BOND_SCOPE_LEVELS.workspaceHq,
  BOND_SCOPE_LEVELS.region,
  BOND_SCOPE_LEVELS.branch,
  BOND_SCOPE_LEVELS.team,
])

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase()
}

function normalizeStructureType(value, fallback = BOND_ORGANISATION_STRUCTURE_TYPES.independent) {
  const normalized = normalizeLower(value).replaceAll('-', '_')
  return STRUCTURE_TYPE_VALUES.has(normalized) ? normalized : fallback
}

function isActiveRecord(record = {}) {
  if (record.active === false || record.is_active === false) return false
  const status = normalizeLower(record.status)
  return !status || ['active', 'accepted'].includes(status)
}

function isReadRestrictedError(error = {}) {
  const message = normalizeLower(error.message || error.details || '')
  return (
    error.code === '42501' ||
    message.includes('permission denied') ||
    message.includes('row-level security') ||
    message.includes('rls')
  )
}

function getUserName(user = {}) {
  return normalizeText(
    user.name ||
      [user.first_name || user.firstName, user.last_name || user.lastName].map(normalizeText).filter(Boolean).join(' ') ||
      user.email,
  ) || 'Team member'
}

function getUnitType(unit = {}) {
  return normalizeLower(unit.unit_type || unit.unitType)
}

function getUnitId(unit = {}) {
  return normalizeText(unit.id || unit.workspace_unit_id || unit.workspaceUnitId)
}

function getUserUnitId(user = {}) {
  return normalizeText(
    user.workspace_unit_id ||
      user.workspaceUnitId ||
      user.branch_id ||
      user.branchId ||
      user.primary_branch_id ||
      user.primaryBranchId ||
      user.team_id ||
      user.teamId,
  )
}

function getUserRegionId(user = {}) {
  return normalizeText(user.region_id || user.regionId)
}

function getRowRegionId(row = {}) {
  return normalizeText(row.regionId || row.region_id)
}

function getRowUnitId(row = {}) {
  return normalizeText(row.workspaceUnitId || row.workspace_unit_id || row.branchId || row.branch_id || row.teamId || row.team_id)
}

function buildLookup(rows = []) {
  return new Map(rows.map((row) => [normalizeText(row.id), row]).filter(([id]) => id))
}

function inferStructureType({ explicitType = '', regions = [], branches = [], teams = [], users = [] } = {}) {
  const normalizedExplicit = normalizeStructureType(explicitType, '')
  if (normalizedExplicit) return normalizedExplicit
  if (regions.length) return BOND_ORGANISATION_STRUCTURE_TYPES.regional
  if (branches.length) return BOND_ORGANISATION_STRUCTURE_TYPES.branchBased
  if (teams.length || users.length > 1) return BOND_ORGANISATION_STRUCTURE_TYPES.smallTeam
  return BOND_ORGANISATION_STRUCTURE_TYPES.independent
}

function resolveStructureTypeFromSettings(settings = {}) {
  const hierarchy = settings?.organisationHierarchy && typeof settings.organisationHierarchy === 'object'
    ? settings.organisationHierarchy
    : {}
  return normalizeText(
    hierarchy.organisation_structure_type ||
      hierarchy.organisationStructureType ||
      hierarchy.structureType ||
      settings.organisation_structure_type ||
      settings.organisationStructureType,
  )
}

function getStructureLabel(structureType = '') {
  return BOND_ORGANISATION_STRUCTURE_OPTIONS.find((option) => option.value === structureType)?.label || 'Organisation'
}

function getStructureExpectations(structureType = '') {
  return {
    expectsRegions: [BOND_ORGANISATION_STRUCTURE_TYPES.regional, BOND_ORGANISATION_STRUCTURE_TYPES.enterprise].includes(structureType),
    expectsBranches: [
      BOND_ORGANISATION_STRUCTURE_TYPES.branchBased,
      BOND_ORGANISATION_STRUCTURE_TYPES.regional,
      BOND_ORGANISATION_STRUCTURE_TYPES.enterprise,
    ].includes(structureType),
    expectsTeams: [
      BOND_ORGANISATION_STRUCTURE_TYPES.smallTeam,
      BOND_ORGANISATION_STRUCTURE_TYPES.branchBased,
      BOND_ORGANISATION_STRUCTURE_TYPES.regional,
      BOND_ORGANISATION_STRUCTURE_TYPES.enterprise,
    ].includes(structureType),
    expectsConsultants: structureType !== BOND_ORGANISATION_STRUCTURE_TYPES.independent,
  }
}

function resolveCapabilities(context = {}) {
  const resolved = resolvePermissionContext(context)
  const scopeLevel = normalizeLower(resolved.scopeLevel) || BOND_SCOPE_LEVELS.assigned
  const canSetUpStructure = (
    can(PERMISSIONS.manageBondWorkspace, context) ||
    can(PERMISSIONS.manageBondRegions, context) ||
    can(PERMISSIONS.manageBondBranches, context) ||
    can(PERMISSIONS.manageBondTeam, context) ||
    can(PERMISSIONS.manageUsers, context)
  )

  return {
    resolved,
    scopeLevel,
    canSetUpStructure,
    canViewRegions: scopeLevel === BOND_SCOPE_LEVELS.workspaceHq,
    canViewBranches: [BOND_SCOPE_LEVELS.workspaceHq, BOND_SCOPE_LEVELS.region, BOND_SCOPE_LEVELS.branch, BOND_SCOPE_LEVELS.team].includes(scopeLevel),
    canViewTeams: MANAGEMENT_SCOPE_LEVELS.has(scopeLevel),
    canViewConsultants: MANAGEMENT_SCOPE_LEVELS.has(scopeLevel),
    canViewApplications: can(PERMISSIONS.viewApplications, context),
  }
}

function scopeUsers(users = [], capabilities = {}) {
  const { resolved, scopeLevel } = capabilities
  if (scopeLevel === BOND_SCOPE_LEVELS.workspaceHq) return users
  if (scopeLevel === BOND_SCOPE_LEVELS.region) {
    return users.filter((user) => getUserRegionId(user) === normalizeText(resolved.regionId))
  }
  if ([BOND_SCOPE_LEVELS.branch, BOND_SCOPE_LEVELS.team].includes(scopeLevel)) {
    const unitId = normalizeText(resolved.workspaceUnitId)
    return users.filter((user) => getUserUnitId(user) === unitId || normalizeText(user.user_id || user.userId) === normalizeText(resolved.userId))
  }
  return users.filter((user) => normalizeText(user.user_id || user.userId) === normalizeText(resolved.userId))
}

function scopeRegions(regions = [], capabilities = {}) {
  const { resolved, scopeLevel } = capabilities
  if (scopeLevel === BOND_SCOPE_LEVELS.workspaceHq) return regions
  if (scopeLevel === BOND_SCOPE_LEVELS.region) return regions.filter((region) => normalizeText(region.id) === normalizeText(resolved.regionId))
  return []
}

function scopeUnits(units = [], capabilities = {}) {
  const { resolved, scopeLevel } = capabilities
  if (scopeLevel === BOND_SCOPE_LEVELS.workspaceHq) return units
  if (scopeLevel === BOND_SCOPE_LEVELS.region) return units.filter((unit) => normalizeText(unit.region_id || unit.regionId) === normalizeText(resolved.regionId))
  if ([BOND_SCOPE_LEVELS.branch, BOND_SCOPE_LEVELS.team].includes(scopeLevel)) {
    const unitId = normalizeText(resolved.workspaceUnitId)
    return units.filter((unit) => getUnitId(unit) === unitId || normalizeText(unit.parent_unit_id || unit.parentUnitId) === unitId)
  }
  return []
}

function scopeApplicationRows(rows = [], capabilities = {}) {
  const { resolved, scopeLevel } = capabilities
  if (scopeLevel === BOND_SCOPE_LEVELS.workspaceHq) return rows
  if (scopeLevel === BOND_SCOPE_LEVELS.region) {
    const scopedRows = rows.filter((row) => getRowRegionId(row) === normalizeText(resolved.regionId))
    return rows.some((row) => getRowRegionId(row)) ? scopedRows : rows
  }
  if ([BOND_SCOPE_LEVELS.branch, BOND_SCOPE_LEVELS.team].includes(scopeLevel)) {
    const scopedRows = rows.filter((row) => getRowUnitId(row) === normalizeText(resolved.workspaceUnitId))
    return rows.some((row) => getRowUnitId(row)) ? scopedRows : rows
  }
  return rows
}

function enrichApplicationRows(rows = [], { regions = [], branches = [], teams = [] } = {}) {
  const regionById = buildLookup(regions)
  const unitById = buildLookup([...branches, ...teams])

  return rows.map((row) => {
    const regionId = getRowRegionId(row)
    const unitId = getRowUnitId(row)
    const unit = unitById.get(unitId)
    const region = regionById.get(regionId || normalizeText(unit?.region_id || unit?.regionId))
    return {
      ...row,
      regionId: regionId || normalizeText(region?.id),
      region: normalizeText(row.region || region?.name) || 'Unassigned',
      branchId: getUnitType(unit) === WORKSPACE_UNIT_TYPES.branch ? unitId : normalizeText(row.branchId || row.branch_id),
      branch: normalizeText(row.branch || (getUnitType(unit) === WORKSPACE_UNIT_TYPES.branch ? unit?.name : '')) || 'Unassigned',
      teamId: getUnitType(unit) === WORKSPACE_UNIT_TYPES.team ? unitId : normalizeText(row.teamId || row.team_id),
      team: normalizeText(row.team || (getUnitType(unit) === WORKSPACE_UNIT_TYPES.team ? unit?.name : '')) || 'Unassigned',
    }
  })
}

function buildTabs({
  structureType = '',
  hasRegions = false,
  hasBranches = false,
  hasTeams = false,
  hasMultipleUsers = false,
  capabilities = {},
} = {}) {
  const expectations = getStructureExpectations(structureType)
  const canShowSetupTabs = Boolean(capabilities.canSetUpStructure)
  const tabs = [
    { key: 'overview', label: 'Overview', alwaysShow: true },
    {
      key: 'regions',
      label: 'Regions',
      showIf: capabilities.canViewRegions && (hasRegions || (canShowSetupTabs && expectations.expectsRegions)),
    },
    {
      key: 'branches',
      label: capabilities.scopeLevel === BOND_SCOPE_LEVELS.branch ? 'My Branch' : 'Branches',
      showIf: capabilities.canViewBranches && (hasBranches || (canShowSetupTabs && expectations.expectsBranches)),
    },
    {
      key: 'consultants',
      label: 'Consultants',
      showIf: capabilities.canViewConsultants && (hasMultipleUsers || (canShowSetupTabs && expectations.expectsConsultants)),
    },
    {
      key: 'teams',
      label: 'Teams',
      showIf: capabilities.canViewTeams && (hasTeams || (canShowSetupTabs && expectations.expectsTeams && structureType !== BOND_ORGANISATION_STRUCTURE_TYPES.independent)),
    },
    { key: 'applications', label: 'Applications', alwaysShow: true },
  ]

  return tabs.filter((tab) => tab.alwaysShow || tab.showIf)
}

async function fetchOrganisationUsers(workspaceId = '') {
  const safeWorkspaceId = normalizeText(workspaceId)
  if (!isSupabaseConfigured || !supabase || !safeWorkspaceId) return []

  const { data, error } = await supabase
    .from('organisation_users')
    .select('id, organisation_id, user_id, first_name, last_name, email, role, workspace_role, organisation_role, status, region_id, workspace_unit_id, branch_id, primary_branch_id, created_at, updated_at')
    .eq('organisation_id', safeWorkspaceId)

  if (error) {
    if (isMissingTableError(error, 'organisation_users') || isReadRestrictedError(error)) return []
    throw error
  }
  return (data || []).filter(isActiveRecord)
}

async function fetchSettings() {
  try {
    return await fetchOrganisationSettings()
  } catch (error) {
    console.warn('[BondOrganisation] organisation settings unavailable', error)
    return { organisationSettings: {}, organisation: null, persisted: false }
  }
}

async function fetchHierarchy(workspaceId = '') {
  try {
    return await getWorkspaceHierarchy(workspaceId)
  } catch (error) {
    if (isReadRestrictedError(error)) {
      return { workspaceId, regions: [], units: [] }
    }
    throw error
  }
}

export async function getBondOrganisationSnapshot(context = {}, workspaceId = '', options = {}) {
  const safeWorkspaceId = normalizeText(workspaceId)
  const capabilities = resolveCapabilities({ ...context, workspaceId: safeWorkspaceId })
  const [settingsContext, hierarchy, users, applicationSnapshot] = await Promise.all([
    fetchSettings(),
    fetchHierarchy(safeWorkspaceId),
    fetchOrganisationUsers(safeWorkspaceId),
    getBondTransactionTrackerSnapshot(context, safeWorkspaceId, {
      ...options,
      status: 'all',
      developmentId: options.developmentId || 'all',
    }),
  ])

  const allRegions = (hierarchy.regions || []).filter(isActiveRecord)
  const allUnits = (hierarchy.units || []).filter(isActiveRecord)
  const allBranches = allUnits.filter((unit) => getUnitType(unit) === WORKSPACE_UNIT_TYPES.branch)
  const allTeams = allUnits.filter((unit) => getUnitType(unit) === WORKSPACE_UNIT_TYPES.team || !getUnitType(unit))
  const scopedRegions = scopeRegions(allRegions, capabilities)
  const scopedUnits = scopeUnits(allUnits, capabilities)
  const scopedBranches = scopedUnits.filter((unit) => getUnitType(unit) === WORKSPACE_UNIT_TYPES.branch)
  const scopedTeams = scopedUnits.filter((unit) => getUnitType(unit) === WORKSPACE_UNIT_TYPES.team || !getUnitType(unit))
  const scopedUsers = scopeUsers(users, capabilities).map((user) => ({
    ...user,
    name: getUserName(user),
    workspaceRole: normalizeText(user.workspace_role || user.workspaceRole || user.organisation_role || user.organisationRole || user.role),
    regionId: getUserRegionId(user),
    workspaceUnitId: getUserUnitId(user),
  }))

  const explicitStructureType = resolveStructureTypeFromSettings(settingsContext.organisationSettings)
  const structureType = inferStructureType({
    explicitType: explicitStructureType,
    regions: allRegions,
    branches: allBranches,
    teams: allTeams,
    users,
  })
  const enrichedApplicationRows = enrichApplicationRows(applicationSnapshot.rows || [], {
    regions: allRegions,
    branches: allBranches,
    teams: allTeams,
  })
  const scopedApplications = scopeApplicationRows(enrichedApplicationRows, capabilities)
  const hasMultipleUsers = scopedUsers.length > 1 || users.length > 1
  const tabs = buildTabs({
    structureType,
    hasRegions: scopedRegions.length > 0,
    hasBranches: scopedBranches.length > 0,
    hasTeams: scopedTeams.length > 0,
    hasMultipleUsers,
    capabilities,
  })

  return {
    workspaceId: safeWorkspaceId,
    organisation: settingsContext.organisation || context.currentWorkspace || context.workspace || null,
    structureType,
    structureLabel: getStructureLabel(structureType),
    isIndependentWorkspace: structureType === BOND_ORGANISATION_STRUCTURE_TYPES.independent && !hasMultipleUsers,
    capabilities,
    tabs,
    regions: scopedRegions,
    branches: scopedBranches,
    teams: scopedTeams,
    consultants: scopedUsers,
    applications: scopedApplications,
    applicationSnapshot: {
      ...applicationSnapshot,
      rows: scopedApplications,
    },
    counts: {
      regions: scopedRegions.length,
      branches: scopedBranches.length,
      teams: scopedTeams.length,
      consultants: scopedUsers.length,
      applications: scopedApplications.length,
    },
    showRegionColumn: allRegions.length > 0,
    showBranchColumn: allBranches.length > 0,
  }
}

export function getBondOrganisationRouteForTab(tabKey = 'overview') {
  return tabKey === 'applications' ? '/bond/organisation/applications' : `/bond/organisation?tab=${encodeURIComponent(tabKey || 'overview')}`
}
