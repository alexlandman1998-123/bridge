import { resolvePermissionContext } from '../auth/permissions/permissionResolver'
import { BOND_SCOPE_LEVELS } from '../constants/workspaceUnits'

export const BOND_ORGANISATION_LEVELS = Object.freeze({
  hq: 'hq',
  region: 'region',
  branch: 'branch',
  consultant: 'consultant',
})

export const ALL_BOND_ORGANISATION_SCOPE = 'ALL'

const BRANCH_SCOPE_LEVELS = new Set([BOND_SCOPE_LEVELS.branch, BOND_SCOPE_LEVELS.team])

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase()
}

function unique(values = []) {
  return [...new Set(values.map(normalizeText).filter(Boolean))]
}

function getUnitId(unit = {}) {
  return normalizeText(unit.id || unit.workspace_unit_id || unit.workspaceUnitId || unit.branch_id || unit.branchId)
}

function getUnitRegionId(unit = {}) {
  return normalizeText(unit.region_id || unit.regionId)
}

function getUserId(user = {}) {
  return normalizeText(user.user_id || user.userId || user.id)
}

function getUserRegionId(user = {}) {
  return normalizeText(user.region_id || user.regionId)
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

function getApplicationRegionId(row = {}) {
  return normalizeText(row.regionId || row.region_id || row.assigned_region_id || row.assignedRegionId || row.bond_region_id)
}

function getApplicationUnitId(row = {}) {
  return normalizeText(
    row.workspaceUnitId ||
      row.workspace_unit_id ||
      row.branchId ||
      row.branch_id ||
      row.assigned_branch_id ||
      row.assignedBranchId ||
      row.assigned_workspace_unit_id ||
      row.assignedWorkspaceUnitId ||
      row.teamId ||
      row.team_id,
  )
}

function getApplicationConsultantId(row = {}) {
  return normalizeText(
    row.assignedUserId ||
      row.assigned_user_id ||
      row.primary_bond_consultant_user_id ||
      row.primaryBondConsultantUserId ||
      row.owner_user_id ||
      row.ownerUserId,
  )
}

function toCanonicalScopeLevel(internalScopeLevel = '') {
  const normalized = normalizeLower(internalScopeLevel)
  if (normalized === BOND_SCOPE_LEVELS.workspaceHq) return BOND_ORGANISATION_LEVELS.hq
  if (normalized === BOND_SCOPE_LEVELS.region) return BOND_ORGANISATION_LEVELS.region
  if (BRANCH_SCOPE_LEVELS.has(normalized)) return BOND_ORGANISATION_LEVELS.branch
  return BOND_ORGANISATION_LEVELS.consultant
}

function toPermissionScopeLevel(canonicalScopeLevel = '') {
  const normalized = normalizeLower(canonicalScopeLevel)
  if (normalized === BOND_ORGANISATION_LEVELS.hq) return BOND_SCOPE_LEVELS.workspaceHq
  if (normalized === BOND_ORGANISATION_LEVELS.region) return BOND_SCOPE_LEVELS.region
  if (normalized === BOND_ORGANISATION_LEVELS.branch) return BOND_SCOPE_LEVELS.branch
  return BOND_SCOPE_LEVELS.assigned
}

function resolveAllBranchIds({ branches = [], applications = [] } = {}) {
  return unique([
    ...branches.map(getUnitId),
    ...applications.map(getApplicationUnitId),
  ])
}

function resolveBranchIdsForRegion(regionId = '', { branches = [], applications = [] } = {}) {
  const safeRegionId = normalizeText(regionId)
  if (!safeRegionId) return []
  return unique([
    ...branches.filter((branch) => getUnitRegionId(branch) === safeRegionId).map(getUnitId),
    ...applications.filter((row) => getApplicationRegionId(row) === safeRegionId).map(getApplicationUnitId),
  ])
}

function resolveConsultantIdsForRegion(regionId = '', branchIds = [], { consultants = [], applications = [] } = {}) {
  const safeRegionId = normalizeText(regionId)
  const branchSet = new Set(branchIds.map(normalizeText).filter(Boolean))
  if (!safeRegionId && !branchSet.size) return []
  return unique([
    ...consultants
      .filter((consultant) => getUserRegionId(consultant) === safeRegionId || branchSet.has(getUserUnitId(consultant)))
      .map(getUserId),
    ...applications
      .filter((row) => getApplicationRegionId(row) === safeRegionId || branchSet.has(getApplicationUnitId(row)))
      .map(getApplicationConsultantId),
  ])
}

function resolveConsultantIdsForBranch(branchId = '', { consultants = [], applications = [] } = {}) {
  const safeBranchId = normalizeText(branchId)
  if (!safeBranchId) return []
  return unique([
    ...consultants.filter((consultant) => getUserUnitId(consultant) === safeBranchId).map(getUserId),
    ...applications.filter((row) => getApplicationUnitId(row) === safeBranchId).map(getApplicationConsultantId),
  ])
}

export function resolveBondOrganisationScope(context = {}, data = {}) {
  const resolved = context.resolvedPermissionContext || resolvePermissionContext(context)
  const permissionScopeLevel = normalizeLower(resolved.scopeLevel || resolved.scopeLevelRaw) || BOND_SCOPE_LEVELS.assigned
  const scopeLevel = toCanonicalScopeLevel(permissionScopeLevel)
  const userId = normalizeText(resolved.userId)
  const regionId = normalizeText(resolved.regionId)
  const branchId = normalizeText(resolved.workspaceUnitId || resolved.branchId || resolved.assignedBranchId)
  const workspaceId = normalizeText(resolved.workspaceId || context.workspaceId || context.currentWorkspace?.id)
  const regions = data.regions || []
  const branches = data.branches || data.units || []
  const consultants = data.consultants || data.users || []
  const applications = data.applications || []

  if (scopeLevel === BOND_ORGANISATION_LEVELS.hq) {
    return {
      scopeLevel,
      organisationLevel: scopeLevel,
      permissionScopeLevel: BOND_SCOPE_LEVELS.workspaceHq,
      workspaceId,
      userId,
      role: resolved.workspaceRole || resolved.organisationRole || '',
      regionIds: ALL_BOND_ORGANISATION_SCOPE,
      branchIds: ALL_BOND_ORGANISATION_SCOPE,
      consultantIds: ALL_BOND_ORGANISATION_SCOPE,
      canViewRegions: true,
      canViewBranches: true,
      canViewConsultants: true,
      canViewPartners: true,
      canViewReports: true,
      canViewApplications: true,
      resolved,
    }
  }

  if (scopeLevel === BOND_ORGANISATION_LEVELS.region) {
    const branchIds = resolveBranchIdsForRegion(regionId, { branches, applications })
    return {
      scopeLevel,
      organisationLevel: scopeLevel,
      permissionScopeLevel: BOND_SCOPE_LEVELS.region,
      workspaceId,
      userId,
      role: resolved.workspaceRole || resolved.organisationRole || '',
      regionIds: regionId ? [regionId] : [],
      branchIds,
      consultantIds: resolveConsultantIdsForRegion(regionId, branchIds, { consultants, applications }),
      canViewRegions: true,
      canViewBranches: true,
      canViewConsultants: true,
      canViewPartners: false,
      canViewReports: false,
      canViewApplications: true,
      resolved,
    }
  }

  if (scopeLevel === BOND_ORGANISATION_LEVELS.branch) {
    return {
      scopeLevel,
      organisationLevel: scopeLevel,
      permissionScopeLevel: BRANCH_SCOPE_LEVELS.has(permissionScopeLevel) ? permissionScopeLevel : BOND_SCOPE_LEVELS.branch,
      workspaceId,
      userId,
      role: resolved.workspaceRole || resolved.organisationRole || '',
      regionIds: regionId ? [regionId] : [],
      branchIds: branchId ? [branchId] : [],
      consultantIds: unique([
        ...resolveConsultantIdsForBranch(branchId, { consultants, applications }),
        userId,
      ]),
      canViewRegions: false,
      canViewBranches: true,
      canViewConsultants: true,
      canViewPartners: false,
      canViewReports: false,
      canViewApplications: true,
      resolved,
    }
  }

  return {
    scopeLevel: BOND_ORGANISATION_LEVELS.consultant,
    organisationLevel: BOND_ORGANISATION_LEVELS.consultant,
    permissionScopeLevel: toPermissionScopeLevel(BOND_ORGANISATION_LEVELS.consultant),
    workspaceId,
    userId,
    role: resolved.workspaceRole || resolved.organisationRole || '',
    regionIds: regionId ? [regionId] : [],
    branchIds: branchId ? [branchId] : [],
    consultantIds: userId ? [userId] : [],
    canViewRegions: false,
    canViewBranches: false,
    canViewConsultants: false,
    canViewPartners: false,
    canViewReports: false,
    canViewApplications: true,
    resolved,
  }
}

export function logBondOrganisationScope(scope = {}, context = {}) {
  if (!import.meta.env.DEV) return
  const user = normalizeText(context.email || context.user?.email || context.profile?.email || scope.userId) || 'Unknown'
  const role = normalizeText(scope.role || context.workspaceRole || context.currentMembership?.workspaceRole || context.currentMembership?.workspace_role) || 'Unknown'
  console.info(
    [
      'Bond Organisation Scope',
      '-----------------------',
      `User: ${user}`,
      `Role: ${role}`,
      `Scope: ${scope.scopeLevel || 'consultant'}`,
      `Regions: ${Array.isArray(scope.regionIds) ? scope.regionIds.join(', ') || 'none' : scope.regionIds}`,
      `Branches: ${Array.isArray(scope.branchIds) ? scope.branchIds.join(', ') || 'none' : scope.branchIds}`,
      `Consultants: ${Array.isArray(scope.consultantIds) ? scope.consultantIds.join(', ') || 'none' : scope.consultantIds}`,
    ].join('\n'),
  )
}

export const __bondOrganisationScopeResolverTestUtils = Object.freeze({
  toCanonicalScopeLevel,
  toPermissionScopeLevel,
  resolveAllBranchIds,
  resolveBranchIdsForRegion,
  resolveConsultantIdsForRegion,
  resolveConsultantIdsForBranch,
})
