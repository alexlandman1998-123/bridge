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
    userEmail: normalizeLower(context.email || context.user?.email || context.authState?.user?.email || context.profile?.email),
    userName: normalizeLower(
      context.name ||
        context.fullName ||
        context.profile?.full_name ||
        context.profile?.fullName ||
        [context.firstName || context.first_name || context.profile?.first_name, context.lastName || context.last_name || context.profile?.last_name]
          .map(normalizeText)
          .filter(Boolean)
          .join(' '),
    ),
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
  const scopedUserId = normalizeText(resolved.userId)
  const scopedEmail = normalizeLower(capabilities.userEmail)
  const scopedName = normalizeLower(capabilities.userName)
  const scopedRows = rows.filter((row) => {
    const assignedUserId = normalizeText(row.assignedUserId || row.assigned_user_id)
    const assignedEmail = normalizeLower(row.assignedUserEmail || row.assigned_user_email || row.assignedBondOriginatorEmail)
    const consultant = normalizeLower(row.consultant)
    return (
      (scopedUserId && assignedUserId === scopedUserId) ||
      (scopedEmail && assignedEmail === scopedEmail) ||
      (scopedName && consultant === scopedName)
    )
  })
  return scopedRows
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

function buildDerivedBranchesFromApplications(applications = [], regions = []) {
  if (!applications.length) return []
  const region = regions[0] || null
  const branchesByName = new Map()
  applications.forEach((row) => {
    const branchName = normalizeText(row.branch && row.branch !== 'Unassigned' ? row.branch : '')
    const key = normalizeLower(branchName || 'National Bond Desk')
    if (!branchesByName.has(key)) {
      branchesByName.set(key, {
        id: `derived-branch-${key.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'national-desk'}`,
        name: branchName || 'National Bond Desk',
        region_id: normalizeText(row.regionId || region?.id),
        regionId: normalizeText(row.regionId || region?.id),
        region: normalizeText(row.region && row.region !== 'Unassigned' ? row.region : region?.name) || 'Visible Scope',
        manager_user_id: '',
        active: true,
        derived: true,
      })
    }
  })
  return [...branchesByName.values()]
}

function buildDerivedRegionsFromScope(branches = [], applications = []) {
  const regionRows = []
  branches.forEach((branch) => {
    regionRows.push({
      id: normalizeText(branch.regionId || branch.region_id),
      name: normalizeText(branch.region),
    })
  })
  applications.forEach((row) => {
    regionRows.push({
      id: normalizeText(row.regionId || row.region_id),
      name: normalizeText(row.region),
    })
  })

  const regionsByKey = new Map()
  regionRows.forEach((row) => {
    const name = normalizeText(row.name && row.name !== 'Unassigned' ? row.name : '')
    const id = normalizeText(row.id)
    const key = normalizeLower(id || name)
    if (!key || regionsByKey.has(key)) return
    regionsByKey.set(key, {
      id: id || `derived-region-${key.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'visible-scope'}`,
      name: name || 'Visible Scope',
      code: '',
      manager_user_id: '',
      active: true,
      derived: true,
    })
  })

  return [...regionsByKey.values()]
}

function buildDerivedConsultantsFromApplications(applications = [], branches = []) {
  if (!applications.length) return []
  const defaultBranch = branches[0] || null
  const consultantsByKey = new Map()
  applications.forEach((row) => {
    const name = normalizeText(row.consultant) || 'Bond Consultant'
    const email = normalizeText(row.assignedUserEmail)
    const key = normalizeLower(row.assignedUserId || email || name)
    if (!key || consultantsByKey.has(key)) return
    const branch = branches.find((item) => (
      normalizeText(item.id) === normalizeText(row.branchId || row.workspaceUnitId) ||
      normalizeText(item.name) === normalizeText(row.branch)
    )) || defaultBranch
    consultantsByKey.set(key, {
      id: row.assignedUserId || `derived-consultant-${key.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`,
      user_id: row.assignedUserId || '',
      userId: row.assignedUserId || '',
      name,
      email,
      workspaceRole: 'consultant',
      role: 'consultant',
      status: 'active',
      regionId: normalizeText(row.regionId || branch?.regionId || branch?.region_id),
      workspaceUnitId: normalizeText(row.branchId || row.workspaceUnitId || branch?.id),
      derived: true,
    })
  })
  return [...consultantsByKey.values()]
}

function buildTabs({
  capabilities = {},
} = {}) {
  const tabs = [
    { key: 'overview', label: 'Overview', alwaysShow: true },
    { key: 'regions', label: 'Regions', showIf: capabilities.canViewRegions },
    { key: 'branches', label: capabilities.scopeLevel === BOND_SCOPE_LEVELS.branch ? 'My Branch' : 'Branches', showIf: capabilities.canViewBranches },
    { key: 'consultants', label: 'Consultants', showIf: capabilities.canViewConsultants },
    { key: 'applications', label: 'Applications', alwaysShow: true },
    { key: 'permissions', label: 'Permissions', showIf: capabilities.canSetUpStructure },
    { key: 'settings', label: 'Settings', showIf: capabilities.scopeLevel === BOND_SCOPE_LEVELS.workspaceHq && capabilities.canSetUpStructure },
  ]

  return tabs.filter((tab) => tab.alwaysShow || tab.showIf)
}

function getDaysBetween(start, end) {
  const startDate = start ? new Date(start) : null
  const endDate = end ? new Date(end) : null
  if (!startDate || !endDate || Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return 0
  return Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000)))
}

function getApplicationLeadDays(row = {}) {
  return Number(row.velocity?.expectedCompletionDays || row.velocity?.expectedApprovalDays || 0) || getDaysBetween(row.createdAt || row.created_at, row.lastActivityAt)
}

function getApplicationBottleneck(row = {}) {
  const stage = normalizeLower(row.financeStageKey || row.financeStageLabel || row.nextAction)
  const risk = normalizeLower(row.riskStatus || '')
  if (stage.includes('doc') || risk.includes('document') || risk.includes('docs')) return 'Docs Collection'
  if (stage.includes('feedback') || stage.includes('bank')) return 'Bank Feedback'
  if (stage.includes('pre')) return 'Pre-Approval'
  if (stage.includes('submit')) return 'Submission'
  if (stage.includes('approved') || stage.includes('grant')) return 'Approval'
  return row.financeStageLabel || 'Pipeline Review'
}

function isApplicationApproved(row = {}) {
  const signal = normalizeLower(`${row.status || ''} ${row.financeStageKey || ''} ${row.financeStageLabel || ''} ${row.registrationStatus || ''}`)
  return signal.includes('approved') || signal.includes('registered') || signal.includes('grant')
}

function isPendingDocs(row = {}) {
  const signal = normalizeLower(`${row.financeStageKey || ''} ${row.financeStageLabel || ''} ${row.riskStatus || ''} ${row.nextAction || ''}`)
  return signal.includes('doc') || signal.includes('payslip') || signal.includes('statement')
}

function averageNumber(values = []) {
  const safeValues = values.map(Number).filter((value) => Number.isFinite(value) && value > 0)
  if (!safeValues.length) return 0
  return Math.round((safeValues.reduce((sum, value) => sum + value, 0) / safeValues.length) * 10) / 10
}

function percent(part = 0, total = 0) {
  return total ? Math.round((Number(part || 0) / total) * 100) : 0
}

function getBranchApplicationRows(branch = {}, applications = []) {
  const branchId = normalizeText(branch.id)
  return applications.filter((row) => normalizeText(row.branchId || row.workspaceUnitId) === branchId || normalizeText(row.branch) === normalizeText(branch.name))
}

function getConsultantApplicationRows(consultant = {}, applications = []) {
  const name = normalizeLower(consultant.name)
  const userId = normalizeText(consultant.user_id || consultant.userId)
  return applications.filter((row) => normalizeLower(row.consultant) === name || normalizeText(row.assignedUserId || row.assigned_user_id) === userId)
}

function getStatusFromPressure({ activeApplications = 0, pendingDocs = 0, avgLeadTime = 0, lastActivityAt = '' } = {}) {
  const inactiveDays = getDaysBetween(lastActivityAt, new Date().toISOString())
  if (lastActivityAt && inactiveDays >= 7) return 'Inactive'
  if (pendingDocs >= 10 || avgLeadTime >= 5) return 'Needs Attention'
  if (activeApplications >= 30) return 'Overloaded'
  return 'Healthy'
}

function getManagerName(managerId = '', users = []) {
  const manager = users.find((user) => normalizeText(user.user_id || user.userId || user.id) === normalizeText(managerId))
  return manager?.name || 'Unassigned'
}

function getScopedRegionBranchRows(region = {}, branches = []) {
  const regionId = normalizeText(region.id || region.regionId || region.region_id)
  const regionName = normalizeText(region.name)
  return (branches || []).filter((branch) => (
    normalizeText(branch.regionId || branch.region_id) === regionId ||
    normalizeText(branch.region) === regionName
  ))
}

export function getVisibleOrganisationScope({ capabilities = {}, regions = [], branches = [], consultants = [], applications = [] } = {}) {
  const scopeLevel = capabilities.scopeLevel || BOND_SCOPE_LEVELS.assigned
  return {
    scopeLevel,
    label: scopeLevel === BOND_SCOPE_LEVELS.workspaceHq
      ? 'National HQ'
      : scopeLevel === BOND_SCOPE_LEVELS.region
        ? 'Regional command'
        : scopeLevel === BOND_SCOPE_LEVELS.branch
          ? 'Branch command'
          : 'Consultant workspace',
    canManageOrganisation: Boolean(capabilities.canSetUpStructure && scopeLevel !== BOND_SCOPE_LEVELS.assigned),
    canViewNetwork: scopeLevel !== BOND_SCOPE_LEVELS.assigned,
    regions,
    branches,
    consultants,
    applications,
  }
}

export function getBranchPerformance(scope = {}) {
  return (scope.branches || []).map((branch) => {
    const rows = getBranchApplicationRows(branch, scope.applications)
    const approved = rows.filter(isApplicationApproved).length
    const pendingDocs = rows.filter(isPendingDocs).length
    const leadTime = averageNumber(rows.map(getApplicationLeadDays))
    const bottleneck = getMostCommon(rows.map(getApplicationBottleneck)) || 'Clear'
    return {
      id: branch.id,
      branch: branch.name,
      regionId: normalizeText(branch.region_id || branch.regionId),
      region: branch.region || 'Unassigned',
      manager: normalizeText(branch.manager_name || branch.managerName) || getManagerName(branch.manager_user_id || branch.managerUserId, scope.consultants),
      consultants: (scope.consultants || []).filter((user) => getUserUnitId(user) === normalizeText(branch.id)).length,
      activeApplications: rows.length,
      pendingDocs,
      avgLeadTime: leadTime,
      approvalRate: percent(approved, rows.length),
      bottleneck,
      status: getStatusFromPressure({ activeApplications: rows.length, pendingDocs, avgLeadTime: leadTime, lastActivityAt: rows[0]?.lastActivityAt }),
    }
  })
}

export function getRegionPerformance(scope = {}, branchPerformance = []) {
  const effectiveBranchPerformance = branchPerformance.length ? branchPerformance : getBranchPerformance(scope)
  return (scope.regions || []).map((region) => {
    const regionBranches = getScopedRegionBranchRows(region, scope.branches)
    const regionBranchIds = new Set(regionBranches.map((branch) => normalizeText(branch.id)).filter(Boolean))
    const regionRows = (scope.applications || []).filter((row) => (
      normalizeText(row.regionId || row.region_id) === normalizeText(region.id) ||
      regionBranchIds.has(normalizeText(row.branchId || row.workspaceUnitId))
    ))
    const approved = regionRows.filter(isApplicationApproved).length
    const pendingDocs = regionRows.filter(isPendingDocs).length
    const leadTime = averageNumber(regionRows.map(getApplicationLeadDays))
    const consultants = (scope.consultants || []).filter((user) => (
      normalizeText(user.regionId || user.region_id) === normalizeText(region.id) ||
      regionBranchIds.has(getUserUnitId(user))
    )).length
    return {
      id: region.id,
      region: region.name,
      manager: normalizeText(region.manager_name || region.managerName) || getManagerName(region.manager_user_id || region.managerUserId, scope.consultants),
      branches: regionBranches.length,
      consultants,
      activeApplications: regionRows.length,
      pendingDocs,
      avgLeadTime: leadTime,
      approvalRate: percent(approved, regionRows.length),
      bottleneck:
        getMostCommon(regionRows.map(getApplicationBottleneck)) ||
        effectiveBranchPerformance.find((branch) => normalizeText(branch.regionId) === normalizeText(region.id))?.bottleneck ||
        'Clear',
      status: getStatusFromPressure({ activeApplications: regionRows.length, pendingDocs, avgLeadTime: leadTime, lastActivityAt: regionRows[0]?.lastActivityAt }),
    }
  })
}

export function getConsultantPerformance(scope = {}) {
  return (scope.consultants || []).map((consultant) => {
    const rows = getConsultantApplicationRows(consultant, scope.applications)
    const approved = rows.filter(isApplicationApproved).length
    const pendingDocs = rows.filter(isPendingDocs).length
    const leadTime = averageNumber(rows.map(getApplicationLeadDays))
    const newThisMonth = rows.filter((row) => {
      const date = new Date(row.lastActivityAt || '')
      const now = new Date()
      return !Number.isNaN(date.getTime()) && date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth()
    }).length
    const branch = (scope.branches || []).find((item) => normalizeText(item.id) === getUserUnitId(consultant))
    return {
      id: consultant.id || consultant.user_id || consultant.email,
      consultant: consultant.name,
      email: consultant.email,
      regionId: normalizeText(consultant.regionId || consultant.region_id || branch?.regionId || branch?.region_id),
      region: branch?.region || consultant.region || 'Unassigned',
      branchId: normalizeText(branch?.id || consultant.workspaceUnitId || consultant.workspace_unit_id),
      branch: branch?.name || consultant.branch || 'Unassigned',
      activeApplications: rows.length,
      newThisMonth,
      pendingDocs,
      avgLeadTime: leadTime,
      approvalRate: percent(approved, rows.length),
      lastActivity: rows[0]?.lastActivityLabel || 'No recent activity',
      status: getStatusFromPressure({ activeApplications: rows.length, pendingDocs, avgLeadTime: leadTime, lastActivityAt: rows[0]?.lastActivityAt }),
      role: consultant.workspaceRole,
      scope: consultant.scope_level || consultant.scopeLevel || '',
    }
  })
}

function getMostCommon(values = []) {
  const counts = values.filter(Boolean).reduce((map, value) => map.set(value, (map.get(value) || 0) + 1), new Map())
  return [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] || ''
}

export function getOrganisationKpis(scope = {}) {
  const applications = scope.applications || []
  const approved = applications.filter(isApplicationApproved).length
  return {
    regions: scope.regions?.length || 0,
    branches: scope.branches?.length || 0,
    consultants: scope.consultants?.length || 0,
    activeApplications: applications.length,
    approvalRate: percent(approved, applications.length),
    avgLeadTime: averageNumber(applications.map(getApplicationLeadDays)),
  }
}

export function getHierarchyTree(scope = {}) {
  const consultantsByUnit = new Map()
  ;(scope.consultants || []).forEach((consultant) => {
    const unitId = getUserUnitId(consultant) || 'unassigned'
    consultantsByUnit.set(unitId, [...(consultantsByUnit.get(unitId) || []), consultant])
  })
  const branchesByRegion = new Map()
  ;(scope.branches || []).forEach((branch) => {
    const regionId = normalizeText(branch.region_id || branch.regionId) || 'unassigned'
    branchesByRegion.set(regionId, [...(branchesByRegion.get(regionId) || []), branch])
  })

  const makeConsultantNode = (consultant) => {
    const rows = getConsultantApplicationRows(consultant, scope.applications)
    return buildHierarchyNode({
      id: consultant.id || consultant.user_id || consultant.email,
      name: consultant.name,
      type: 'Consultant',
      rows,
    })
  }
  const makeBranchNode = (branch) => {
    const rows = getBranchApplicationRows(branch, scope.applications)
    return buildHierarchyNode({
      id: branch.id,
      name: branch.name,
      type: 'Branch',
      rows,
      children: (consultantsByUnit.get(normalizeText(branch.id)) || []).map(makeConsultantNode),
    })
  }
  const visibleRegionIds = new Set((scope.regions || []).map((region) => normalizeText(region.id)).filter(Boolean))
  const regionNodes = (scope.regions || []).map((region) => {
    const branches = branchesByRegion.get(normalizeText(region.id)) || []
    const rows = (scope.applications || []).filter((row) => normalizeText(row.regionId) === normalizeText(region.id))
    return buildHierarchyNode({
      id: region.id,
      name: region.name,
      type: 'Region',
      rows,
      children: branches.map(makeBranchNode),
    })
  })
  const directBranches = (scope.branches || [])
    .filter((branch) => {
      const regionId = normalizeText(branch.region_id || branch.regionId) || 'unassigned'
      return regionId === 'unassigned' || !visibleRegionIds.has(regionId)
    })
    .map(makeBranchNode)
  return buildHierarchyNode({
    id: 'hq',
    name: scope.label || 'National HQ',
    type: scope.scopeLevel === BOND_SCOPE_LEVELS.assigned ? 'Consultant' : 'HQ',
    rows: scope.applications || [],
    children: [...regionNodes, ...directBranches],
  })
}

function buildHierarchyNode({ id = '', name = '', type = '', rows = [], children = [] } = {}) {
  const approved = rows.filter(isApplicationApproved).length
  return {
    id,
    name,
    type,
    activeApplications: rows.length,
    approvalRate: percent(approved, rows.length),
    avgLeadTime: averageNumber(rows.map(getApplicationLeadDays)),
    bottleneck: getMostCommon(rows.map(getApplicationBottleneck)) || 'Clear',
    status: getStatusFromPressure({ activeApplications: rows.length, pendingDocs: rows.filter(isPendingDocs).length, avgLeadTime: averageNumber(rows.map(getApplicationLeadDays)), lastActivityAt: rows[0]?.lastActivityAt }),
    children,
  }
}

export function getOperationalHealth(scope = {}, branchPerformance = []) {
  const branches = branchPerformance.length ? branchPerformance : getBranchPerformance(scope)
  const pressure = [...branches].sort((left, right) => right.pendingDocs - left.pendingDocs || right.activeApplications - left.activeApplications)[0]
  const slowest = [...branches].sort((left, right) => right.avgLeadTime - left.avgLeadTime)[0]
  const best = [...branches].sort((left, right) => right.approvalRate - left.approvalRate)[0]
  const inactiveConsultants = getConsultantPerformance(scope).filter((row) => row.status === 'Inactive').length
  return [
    { key: 'pressure', label: 'Highest Pressure', title: pressure?.branch || 'No branch pressure', detail: pressure ? `${pressure.bottleneck} • ${pressure.pendingDocs} pending files` : 'No bottleneck detected', tone: 'amber' },
    { key: 'slowest', label: 'Slowest Lead Time', title: slowest?.branch || 'Lead time clear', detail: slowest?.avgLeadTime ? `${slowest.avgLeadTime} days average` : 'No lead time data yet', tone: 'blue' },
    { key: 'best', label: 'Best Performing', title: best?.branch || 'Performance building', detail: best ? `${best.approvalRate}% approval rate` : 'Approval data will appear soon', tone: 'green' },
    { key: 'attention', label: 'Needs Attention', title: `${inactiveConsultants} consultants`, detail: 'No activity in 7 days', tone: inactiveConsultants ? 'amber' : 'green' },
  ]
}

export function getRecentOrganisationActivity(scope = {}) {
  return (scope.applications || []).slice(0, 8).map((row, index) => ({
    id: row.key || `${row.client}-${index}`,
    timestamp: row.lastActivityLabel || 'Recently',
    actor: row.consultant || 'Bond desk',
    branch: row.branch || 'Unassigned branch',
    region: row.region || 'Unassigned region',
    type: row.financeStageLabel || 'Application movement',
    description: `${row.client || 'A client'} moved to ${row.financeStageLabel || 'the next stage'}`,
    href: row.transactionId ? `/bond/files/${row.transactionId}` : '/bond/applications',
  }))
}

async function fetchOrganisationUsers(workspaceId = '') {
  const safeWorkspaceId = normalizeText(workspaceId)
  if (!isSupabaseConfigured || !supabase || !safeWorkspaceId) return []

  const { data, error } = await supabase
    .from('organisation_users')
    .select('id, organisation_id, user_id, first_name, last_name, email, role, workspace_role, organisation_role, status, scope_level, region_id, workspace_unit_id, branch_id, primary_branch_id, scope_metadata, created_at, updated_at')
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
  let scopedApplications = scopeApplicationRows(enrichedApplicationRows, capabilities)
  const regionById = buildLookup(allRegions)
  let scopedBranchesWithRegions = scopedBranches.map((branch) => ({
    ...branch,
    region: normalizeText(branch.region || regionById.get(normalizeText(branch.region_id || branch.regionId))?.name) || 'Unassigned',
  }))
  if (!scopedBranchesWithRegions.length && scopedApplications.length && capabilities.canViewBranches) {
    scopedBranchesWithRegions = buildDerivedBranchesFromApplications(scopedApplications, scopedRegions)
    scopedApplications = scopedApplications.map((row) => {
      if (normalizeText(row.branchId || row.workspaceUnitId) || normalizeText(row.branch) !== 'Unassigned') return row
      const fallbackBranch = scopedBranchesWithRegions[0]
      return {
        ...row,
        branchId: fallbackBranch?.id || row.branchId,
        workspaceUnitId: fallbackBranch?.id || row.workspaceUnitId,
        branch: fallbackBranch?.name || row.branch,
        regionId: fallbackBranch?.regionId || row.regionId,
        region: fallbackBranch?.region || row.region,
      }
    })
  }
  let visibleRegions = scopedRegions
  if (!visibleRegions.length && capabilities.canViewRegions) {
    visibleRegions = buildDerivedRegionsFromScope(scopedBranchesWithRegions, scopedApplications)
  }
  let visibleConsultants = scopedUsers
  if (!visibleConsultants.length && scopedApplications.length && capabilities.canViewConsultants) {
    visibleConsultants = buildDerivedConsultantsFromApplications(scopedApplications, scopedBranchesWithRegions)
  }
  const hasMultipleUsers = scopedUsers.length > 1 || users.length > 1
  const tabs = buildTabs({ capabilities })
  const visibleScope = getVisibleOrganisationScope({
    capabilities,
    regions: visibleRegions,
    branches: scopedBranchesWithRegions,
    consultants: visibleConsultants,
    applications: scopedApplications,
  })
  const branchPerformance = getBranchPerformance(visibleScope)
  const regionPerformance = getRegionPerformance(visibleScope, branchPerformance)
  const consultantPerformance = getConsultantPerformance(visibleScope)
  const hierarchyTree = getHierarchyTree(visibleScope)
  const operationalHealth = getOperationalHealth(visibleScope, branchPerformance)
  const recentActivity = getRecentOrganisationActivity(visibleScope)
  const kpis = getOrganisationKpis(visibleScope)

  return {
    workspaceId: safeWorkspaceId,
    organisation: settingsContext.organisation || context.currentWorkspace || context.workspace || null,
    structureType,
    structureLabel: getStructureLabel(structureType),
    isIndependentWorkspace: structureType === BOND_ORGANISATION_STRUCTURE_TYPES.independent && !hasMultipleUsers,
    capabilities,
    tabs,
    regions: visibleRegions,
    branches: scopedBranchesWithRegions,
    teams: scopedTeams,
    consultants: visibleConsultants,
    applications: scopedApplications,
    visibleScope,
    kpis,
    regionPerformance,
    hierarchyTree,
    branchPerformance,
    consultantPerformance,
    operationalHealth,
    recentActivity,
    applicationSnapshot: {
      ...applicationSnapshot,
      rows: scopedApplications,
    },
    counts: {
      regions: visibleRegions.length,
      branches: scopedBranchesWithRegions.length,
      teams: scopedTeams.length,
      consultants: visibleConsultants.length,
      applications: scopedApplications.length,
    },
    showRegionColumn: allRegions.length > 0 || visibleRegions.length > 0,
    showBranchColumn: allBranches.length > 0 || scopedBranchesWithRegions.length > 0,
  }
}

export function getBondOrganisationRouteForTab(tabKey = 'overview', options = {}) {
  if (tabKey === 'applications') return '/bond/organisation/applications'

  const params = new URLSearchParams()
  params.set('view', normalizeText(tabKey || 'overview'))
  if (normalizeText(options.regionId)) params.set('regionId', normalizeText(options.regionId))
  if (normalizeText(options.branchId)) params.set('branchId', normalizeText(options.branchId))

  return `/bond/organisation?${params.toString()}`
}
