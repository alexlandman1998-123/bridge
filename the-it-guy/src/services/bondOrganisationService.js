import { BOND_SCOPE_LEVELS, WORKSPACE_UNIT_TYPES } from '../constants/workspaceUnits'
import { ENTITLEMENT_KEYS } from '../constants/workspaceEntitlements'
import { WORKSPACE_TYPES } from '../constants/workspaceTypes'
import { PERMISSIONS } from '../auth/permissions/permissionRegistry'
import { can, resolvePermissionContext } from '../auth/permissions/permissionResolver'
import { isMissingTableError } from './attorneyFirmServiceShared'
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'
import { fetchOrganisationSettings } from '../lib/settingsApi'
import { getWorkspaceHierarchy } from './bondWorkspaceHierarchyService'
import { filterDemoBondApplications, getBondTransactionTrackerSnapshot } from './bondCommandCenterService'
import { logBondOrganisationScope, resolveBondOrganisationScope } from './bondOrganisationScopeResolver'
import { getBranchCapacity, getRegionCapacity } from './bondApplicationAssignmentService'
import { getRoutingRules, getRoutingRulesDashboard } from './bondRoutingRulesService'
import {
  getBondPartnerActivityEvents,
  getAllBondPartnerRows,
  getBondPartnerWorkspaceRoute,
  getBondPartnerWorkspace,
  getBondPartners,
} from './bondPartnerManagementService'
import { assertWorkspaceEntitlementLimit } from './workspaceEntitlementsService'

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
const REGION_MANAGER_ROLES = new Set(['regional_manager', 'hq_manager', 'manager', 'director', 'owner'])
const BRANCH_MANAGER_ROLES = new Set(['branch_manager', 'team_lead', 'regional_manager', 'hq_manager', 'manager', 'director', 'owner'])
const CONSULTANT_ROLES = new Set(['consultant', 'bond_originator', 'processor', 'admin_staff'])
const REGION_STATUS_VALUES = new Set(['active', 'inactive'])
const LOCAL_REGION_STORE = new Map()
const LOCAL_BRANCH_STORE = new Map()
const LOCAL_CONSULTANT_STORE = new Map()
const LOCAL_ACTIVITY_STORE = new Map()
const LOCAL_APPLICATION_OWNERSHIP_STORE = new Map()

export const BOND_ORGANISATION_ACTIVITY_EVENTS = Object.freeze({
  regionCreated: 'REGION_CREATED',
  regionUpdated: 'REGION_UPDATED',
  regionManagerAssigned: 'REGION_MANAGER_ASSIGNED',
  branchCreated: 'BRANCH_CREATED',
  branchUpdated: 'BRANCH_UPDATED',
  branchManagerAssigned: 'BRANCH_MANAGER_ASSIGNED',
  branchMovedRegion: 'BRANCH_MOVED_REGION',
  consultantCreated: 'CONSULTANT_CREATED',
  consultantUpdated: 'CONSULTANT_UPDATED',
  consultantAssignedBranch: 'CONSULTANT_ASSIGNED_BRANCH',
  consultantDeactivated: 'CONSULTANT_DEACTIVATED',
  applicationReassigned: 'APPLICATION_REASSIGNED',
})

function normalizeText(value) {
  return String(value || '').trim()
}

function getContextWorkspaceKind(context = {}) {
  return normalizeText(
    context.workspaceKind ||
      context.workspace_kind ||
      context.currentWorkspace?.workspaceKind ||
      context.currentWorkspace?.workspace_kind ||
      context.currentWorkspace?.raw?.workspace_kind,
  )
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase()
}

function normalizeUpper(value) {
  return normalizeText(value).toUpperCase()
}

function normalizeWorkspaceRole(value) {
  const normalized = normalizeLower(value).replaceAll(' ', '_')
  if (normalized === 'bond_branch_manager') return 'branch_manager'
  if (normalized === 'bond_team_lead') return 'team_lead'
  if (normalized === 'bond_hq_manager' || normalized === 'bond_hq_admin') return 'hq_manager'
  if (normalized === 'bond_regional_manager') return 'regional_manager'
  if (normalized === 'bond_independent_consultant') return 'consultant'
  if (normalized === 'bond_consultant') return 'consultant'
  if (normalized === 'bond_processor') return 'processor'
  return normalized
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

function isInactiveRecord(record = {}) {
  if (record.active === false || record.is_active === false) return true
  return normalizeLower(record.status) === 'inactive'
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

function getUserId(user = {}) {
  return normalizeText(user.user_id || user.userId || user.id)
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
  return normalizeText(row.assignedRegionId || row.assigned_region_id || row.regionId || row.region_id)
}

function getRowUnitId(row = {}) {
  return normalizeText(row.assignedBranchId || row.assigned_branch_id || row.workspaceUnitId || row.workspace_unit_id || row.branchId || row.branch_id || row.teamId || row.team_id)
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

function resolveCapabilities(context = {}, organisationScope = null) {
  const resolved = resolvePermissionContext(context)
  const scope = organisationScope || resolveBondOrganisationScope({ ...context, resolvedPermissionContext: resolved })
  const scopeLevel = normalizeLower(scope.permissionScopeLevel) || BOND_SCOPE_LEVELS.assigned
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
    organisationLevel: scope.scopeLevel,
    organisationScope: scope,
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
    canViewRegions: Boolean(scope.canViewRegions),
    canViewBranches: Boolean(scope.canViewBranches),
    canViewTeams: MANAGEMENT_SCOPE_LEVELS.has(scopeLevel),
    canViewConsultants: Boolean(scope.canViewConsultants),
    canViewPartners: ['hq', 'region', 'branch', 'consultant'].includes(scope.scopeLevel) || Boolean(scope.canViewPartners),
    canViewRoutingRules: ['hq', 'region', 'branch', 'consultant'].includes(scope.scopeLevel),
    canViewReports: Boolean(scope.canViewReports),
    canViewApplications: Boolean(scope.canViewApplications && can(PERMISSIONS.viewApplications, context)),
    canManageRegions: scope.scopeLevel === 'hq' && canSetUpStructure,
    canManageBranches: ['hq', 'region'].includes(scope.scopeLevel),
    canMoveBranches: scope.scopeLevel === 'hq',
    canManageConsultants: ['hq', 'region', 'branch'].includes(scope.scopeLevel),
    canReassignApplications: ['hq', 'region', 'branch'].includes(scope.scopeLevel),
    canManagePartners: scope.scopeLevel === 'hq' && canSetUpStructure,
    canManageRoutingRules: scope.scopeLevel === 'hq' && canSetUpStructure,
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
    const assignedUserId = normalizeText(row.assignedConsultantId || row.assigned_consultant_id || row.assignedUserId || row.assigned_user_id)
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
    const branchId = getUnitType(unit) === WORKSPACE_UNIT_TYPES.branch ? unitId : normalizeText(row.assignedBranchId || row.assigned_branch_id || row.branchId || row.branch_id)
    const resolvedRegionId = regionId || normalizeText(region?.id)
    const assignedConsultantId = normalizeText(row.assignedConsultantId || row.assigned_consultant_id || row.assignedUserId || row.assigned_user_id)
    return {
      ...row,
      assignedConsultantId,
      assigned_consultant_id: assignedConsultantId,
      assignedBranchId: branchId,
      assigned_branch_id: branchId,
      assignedRegionId: resolvedRegionId,
      assigned_region_id: resolvedRegionId,
      regionId: resolvedRegionId,
      region: normalizeText(row.region || region?.name) || 'Unassigned',
      branchId,
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
    { key: 'partners', label: 'Partners', showIf: capabilities.canViewPartners },
    { key: 'routing-rules', label: 'Routing Rules', showIf: capabilities.canViewRoutingRules },
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
  const userId = getUserId(consultant)
  const email = normalizeLower(consultant.email)
  return applications.filter((row) => (
    normalizeLower(row.consultant) === name ||
    normalizeText(row.assignedConsultantId || row.assigned_consultant_id || row.assignedUserId || row.assigned_user_id) === userId ||
    normalizeLower(row.assignedUserEmail || row.assigned_user_email || row.assignedBondOriginatorEmail) === email
  ))
}

function getStatusFromPressure({ activeApplications = 0, pendingDocs = 0, avgLeadTime = 0, lastActivityAt = '' } = {}) {
  const inactiveDays = getDaysBetween(lastActivityAt, new Date().toISOString())
  if (lastActivityAt && inactiveDays >= 7) return 'Inactive'
  if (pendingDocs >= 10 || avgLeadTime >= 5) return 'Needs Attention'
  if (activeApplications >= 30) return 'Overloaded'
  return 'Healthy'
}

function isBranchOverloaded(row = {}) {
  const activeApplications = Number(row.activeApplications || 0)
  const consultants = Number(row.consultants || row.consultantCount || 0)
  if (!activeApplications) return false
  if (!consultants) return true
  return activeApplications / consultants >= 20 || activeApplications >= 30
}

function getBranchSlaStatus(row = {}) {
  const avgLeadTime = Number(row.averageTurnaround || row.avgLeadTime || 0)
  const pendingDocs = Number(row.pendingDocuments || row.pendingDocs || 0)
  if (!Number(row.activeApplications || 0)) return 'Not enough data'
  if (avgLeadTime >= 5 || pendingDocs >= 10) return 'Below SLA'
  return 'Within SLA'
}

function getBranchRiskLevel(row = {}) {
  if (normalizeLower(row.status) === 'inactive') return 'Inactive'
  if (!normalizeText(row.regionId || row.region_id || row.region) || normalizeLower(row.region) === 'unassigned') return 'Needs Attention'
  if (!normalizeText(row.managerUserId || row.manager_user_id || row.manager) || normalizeLower(row.manager) === 'unassigned') return 'Needs Attention'
  if (!Number(row.consultants || row.consultantCount || 0)) return 'Needs Attention'
  if (isBranchOverloaded(row)) return 'Overloaded'
  if (getBranchSlaStatus(row) === 'Below SLA') return 'Below SLA'
  return 'Healthy'
}

function getManagerName(managerId = '', users = []) {
  const manager = users.find((user) => normalizeText(user.user_id || user.userId || user.id) === normalizeText(managerId))
  return manager?.name || 'Unassigned'
}

function getUserRole(user = {}) {
  return normalizeWorkspaceRole(user.workspace_role || user.workspaceRole || user.organisation_role || user.organisationRole || user.role)
}

function getRegionManagerId(region = {}) {
  return normalizeText(region.manager_user_id || region.managerUserId || region.manager_id || region.managerId)
}

function getRegionOrganisationId(region = {}) {
  return normalizeText(region.organisationId || region.organisation_id || region.workspace_id || region.workspaceId)
}

function getRegionStatus(region = {}) {
  if (isInactiveRecord(region)) return 'inactive'
  const status = normalizeLower(region.status)
  return REGION_STATUS_VALUES.has(status) ? status : 'active'
}

function getBranchManagerId(branch = {}) {
  return normalizeText(branch.manager_user_id || branch.managerUserId || branch.manager_id || branch.managerId)
}

function getBranchRegionId(branch = {}) {
  return normalizeText(branch.region_id || branch.regionId)
}

function getBranchOrganisationId(branch = {}) {
  return normalizeText(branch.organisationId || branch.organisation_id || branch.workspace_id || branch.workspaceId)
}

function getBranchStatus(branch = {}) {
  if (isInactiveRecord(branch)) return 'inactive'
  const status = normalizeLower(branch.status)
  return REGION_STATUS_VALUES.has(status) ? status : 'active'
}

function getConsultantStatus(consultant = {}) {
  if (isInactiveRecord(consultant)) return 'inactive'
  const status = normalizeLower(consultant.status)
  return REGION_STATUS_VALUES.has(status) ? status : 'active'
}

function getConsultantRole(consultant = {}) {
  const role = normalizeLower(consultant.role || consultant.workspace_role || consultant.workspaceRole || consultant.organisation_role || consultant.organisationRole)
  return CONSULTANT_ROLES.has(role) ? role : 'consultant'
}

function getConsultantBranchId(consultant = {}) {
  return normalizeText(
    consultant.workspace_unit_id ||
      consultant.workspaceUnitId ||
      consultant.branch_id ||
      consultant.branchId ||
      consultant.primary_branch_id ||
      consultant.primaryBranchId,
  )
}

function getConsultantRegionId(consultant = {}) {
  return normalizeText(consultant.region_id || consultant.regionId)
}

function normalizeBranchRow(branch = {}, fallbackWorkspaceId = '') {
  const branchId = normalizeText(branch.id || branch.branch_id || branch.branchId || branch.workspace_unit_id || branch.workspaceUnitId)
  const status = getBranchStatus(branch)
  return {
    ...branch,
    id: branchId,
    organisationId: getBranchOrganisationId(branch) || normalizeText(fallbackWorkspaceId),
    organisation_id: getBranchOrganisationId(branch) || normalizeText(fallbackWorkspaceId),
    workspace_id: getBranchOrganisationId(branch) || normalizeText(fallbackWorkspaceId),
    regionId: getBranchRegionId(branch),
    region_id: getBranchRegionId(branch),
    unit_type: WORKSPACE_UNIT_TYPES.branch,
    unitType: WORKSPACE_UNIT_TYPES.branch,
    name: normalizeText(branch.name || branch.branch) || 'Branch',
    code: normalizeUpper(branch.code || branch.branch_code || branch.branchCode),
    managerUserId: getBranchManagerId(branch),
    manager_user_id: getBranchManagerId(branch),
    officeLocation: normalizeText(branch.officeLocation || branch.office_location || branch.location),
    office_location: normalizeText(branch.office_location || branch.officeLocation || branch.location),
    contactEmail: normalizeText(branch.contactEmail || branch.contact_email),
    contact_email: normalizeText(branch.contact_email || branch.contactEmail),
    contactNumber: normalizeText(branch.contactNumber || branch.contact_number || branch.phone || branch.phone_number),
    contact_number: normalizeText(branch.contact_number || branch.contactNumber || branch.phone || branch.phone_number),
    status,
    active: status === 'active',
    notes: normalizeText(branch.notes || branch.description),
    description: normalizeText(branch.description || branch.notes),
    createdAt: branch.createdAt || branch.created_at || '',
    created_at: branch.created_at || branch.createdAt || '',
    updatedAt: branch.updatedAt || branch.updated_at || '',
    updated_at: branch.updated_at || branch.updatedAt || '',
  }
}

function normalizeRegionRow(region = {}, fallbackWorkspaceId = '') {
  const regionId = normalizeText(region.id || region.region_id || region.regionId)
  const status = getRegionStatus(region)
  return {
    ...region,
    id: regionId,
    organisationId: getRegionOrganisationId(region) || normalizeText(fallbackWorkspaceId),
    organisation_id: getRegionOrganisationId(region) || normalizeText(fallbackWorkspaceId),
    name: normalizeText(region.name || region.region) || 'Region',
    code: normalizeUpper(region.code || region.region_code || region.regionCode),
    managerUserId: getRegionManagerId(region),
    manager_user_id: getRegionManagerId(region),
    status,
    active: status === 'active',
    notes: normalizeText(region.notes || region.description),
    description: normalizeText(region.description || region.notes),
    createdAt: region.createdAt || region.created_at || '',
    created_at: region.created_at || region.createdAt || '',
    updatedAt: region.updatedAt || region.updated_at || '',
    updated_at: region.updated_at || region.updatedAt || '',
  }
}

function normalizeConsultantRow(consultant = {}, fallbackWorkspaceId = '') {
  const userId = getUserId(consultant)
  const id = normalizeText(consultant.id || userId || consultant.email)
  const status = getConsultantStatus(consultant)
  const role = getConsultantRole(consultant)
  const firstName = normalizeText(consultant.firstName || consultant.first_name)
  const lastName = normalizeText(consultant.lastName || consultant.last_name)
  const name = getUserName({
    ...consultant,
    firstName,
    first_name: firstName,
    lastName,
    last_name: lastName,
  })
  const branchId = getConsultantBranchId(consultant)
  const regionId = getConsultantRegionId(consultant)
  return {
    ...consultant,
    id,
    organisationId: normalizeText(consultant.organisationId || consultant.organisation_id || consultant.workspace_id || fallbackWorkspaceId),
    organisation_id: normalizeText(consultant.organisation_id || consultant.organisationId || consultant.workspace_id || fallbackWorkspaceId),
    userId: userId || id,
    user_id: userId || id,
    firstName,
    first_name: firstName,
    lastName,
    last_name: lastName,
    name,
    email: normalizeLower(consultant.email),
    mobileNumber: normalizeText(consultant.mobileNumber || consultant.mobile_number || consultant.phone || consultant.phone_number),
    mobile_number: normalizeText(consultant.mobile_number || consultant.mobileNumber || consultant.phone || consultant.phone_number),
    role,
    workspaceRole: role,
    workspace_role: role,
    organisationRole: role,
    organisation_role: role,
    branchId,
    branch_id: branchId,
    workspaceUnitId: branchId,
    workspace_unit_id: branchId,
    regionId,
    region_id: regionId,
    employeeNumber: normalizeText(consultant.employeeNumber || consultant.employee_number),
    employee_number: normalizeText(consultant.employee_number || consultant.employeeNumber),
    status,
    active: status === 'active',
    createdAt: consultant.createdAt || consultant.created_at || '',
    created_at: consultant.created_at || consultant.createdAt || '',
    updatedAt: consultant.updatedAt || consultant.updated_at || '',
    updated_at: consultant.updated_at || consultant.updatedAt || '',
  }
}

function normalizeOrganisationUserRow(user = {}, fallbackWorkspaceId = '') {
  const userId = getUserId(user)
  const id = normalizeText(user.id || userId || user.email)
  const role = getUserRole(user)
  const firstName = normalizeText(user.firstName || user.first_name)
  const lastName = normalizeText(user.lastName || user.last_name)
  const branchId = getUserUnitId(user)
  const regionId = getUserRegionId(user)
  return {
    ...user,
    id,
    organisationId: normalizeText(user.organisationId || user.organisation_id || user.workspace_id || fallbackWorkspaceId),
    organisation_id: normalizeText(user.organisation_id || user.organisationId || user.workspace_id || fallbackWorkspaceId),
    userId: userId || id,
    user_id: userId || id,
    firstName,
    first_name: firstName,
    lastName,
    last_name: lastName,
    name: getUserName({ ...user, firstName, first_name: firstName, lastName, last_name: lastName }),
    email: normalizeLower(user.email),
    role,
    workspaceRole: role,
    workspace_role: role,
    organisationRole: role,
    organisation_role: role,
    regionId,
    region_id: regionId,
    branchId,
    branch_id: branchId,
    workspaceUnitId: branchId,
    workspace_unit_id: branchId,
    status: getConsultantStatus(user),
  }
}

function buildEligibleManagerRows(users = [], roles = new Set()) {
  return users
    .filter((user) => {
      const userId = normalizeText(user.user_id || user.userId || user.id)
      return userId && roles.has(getUserRole(user))
    })
    .map((user) => ({
      id: normalizeText(user.user_id || user.userId || user.id),
      userId: normalizeText(user.user_id || user.userId || user.id),
      user_id: normalizeText(user.user_id || user.userId || user.id),
      name: getUserName(user),
      email: normalizeLower(user.email),
      role: getUserRole(user),
      workspaceRole: getUserRole(user),
      workspace_role: getUserRole(user),
      regionId: getUserRegionId(user),
      region_id: getUserRegionId(user),
      workspaceUnitId: getUserUnitId(user),
      workspace_unit_id: getUserUnitId(user),
    }))
}

function getLocalRegions(workspaceId = '') {
  return [...(LOCAL_REGION_STORE.get(normalizeText(workspaceId)) || [])]
}

function setLocalRegions(workspaceId = '', rows = []) {
  LOCAL_REGION_STORE.set(normalizeText(workspaceId), rows.map((row) => normalizeRegionRow(row, workspaceId)))
}

function getLocalBranches(workspaceId = '') {
  return [...(LOCAL_BRANCH_STORE.get(normalizeText(workspaceId)) || [])]
}

function setLocalBranches(workspaceId = '', rows = []) {
  LOCAL_BRANCH_STORE.set(normalizeText(workspaceId), rows.map((row) => normalizeBranchRow(row, workspaceId)))
}

function getLocalConsultants(workspaceId = '') {
  return [...(LOCAL_CONSULTANT_STORE.get(normalizeText(workspaceId)) || [])]
}

function setLocalConsultants(workspaceId = '', rows = []) {
  LOCAL_CONSULTANT_STORE.set(normalizeText(workspaceId), rows.map((row) => normalizeConsultantRow(row, workspaceId)))
}

function getLocalApplicationOwnership(workspaceId = '') {
  return LOCAL_APPLICATION_OWNERSHIP_STORE.get(normalizeText(workspaceId)) || new Map()
}

function setLocalApplicationOwnership(workspaceId = '', key = '', patch = {}) {
  const safeWorkspaceId = normalizeText(workspaceId)
  const safeKey = normalizeText(key)
  if (!safeWorkspaceId || !safeKey) return
  const ownership = new Map(getLocalApplicationOwnership(safeWorkspaceId))
  ownership.set(safeKey, { ...(ownership.get(safeKey) || {}), ...patch })
  LOCAL_APPLICATION_OWNERSHIP_STORE.set(safeWorkspaceId, ownership)
}

function getApplicationKey(row = {}) {
  return normalizeText(row.key || row.id || row.applicationId || row.application_id || row.transactionId || row.transaction_id || row.transaction?.id)
}

function applyLocalApplicationOwnership(workspaceId = '', rows = []) {
  const ownership = getLocalApplicationOwnership(workspaceId)
  if (!ownership.size) return rows
  return rows.map((row) => {
    const patch = ownership.get(getApplicationKey(row))
    return patch ? { ...row, ...patch } : row
  })
}

function getLocalActivity(workspaceId = '') {
  return [...(LOCAL_ACTIVITY_STORE.get(normalizeText(workspaceId)) || [])]
}

function setLocalActivity(workspaceId = '', rows = []) {
  LOCAL_ACTIVITY_STORE.set(normalizeText(workspaceId), rows)
}

function createLocalRegionId(name = '') {
  const slug = normalizeLower(name).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'region'
  return `region-${slug}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

function createLocalBranchId(name = '') {
  const slug = normalizeLower(name).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'branch'
  return `branch-${slug}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

function createLocalConsultantId(email = '', name = '') {
  const slug = normalizeLower(email || name).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'consultant'
  return `consultant-${slug}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

function createValidationError(message = 'Validation failed', fieldErrors = {}) {
  const error = new Error(message)
  error.code = 'validation_error'
  error.fieldErrors = fieldErrors
  return error
}

function createPermissionError() {
  const error = new Error('You do not have permission to manage regions.')
  error.code = 'permission_denied'
  return error
}

function createBranchPermissionError() {
  const error = new Error('You do not have permission to manage branches.')
  error.code = 'permission_denied'
  return error
}

function createConsultantPermissionError() {
  const error = new Error('You do not have permission to manage consultants.')
  error.code = 'permission_denied'
  return error
}

function assertCanManageRegions(context = {}, data = {}) {
  const scope = resolveBondOrganisationScope(context, data)
  if (scope.scopeLevel !== 'hq') throw createPermissionError()
  return scope
}

function assertCanManageBranch(context = {}, data = {}, branch = null, targetRegionId = '') {
  const scope = resolveBondOrganisationScope(context, data)
  if (scope.scopeLevel === 'hq') return scope
  const safeRegionId = normalizeText(targetRegionId || getBranchRegionId(branch || {}))
  if (scope.scopeLevel === 'region' && (scope.regionIds || []).map(normalizeText).includes(safeRegionId)) return scope
  throw createBranchPermissionError()
}

function assertCanCreateBranch(context = {}, data = {}, regionId = '') {
  return assertCanManageBranch(context, data, null, regionId)
}

function assertCanMoveBranch(context = {}, data = {}) {
  const scope = resolveBondOrganisationScope(context, data)
  if (scope.scopeLevel !== 'hq') throw createBranchPermissionError()
  return scope
}

function assertCanManageConsultant(context = {}, data = {}, consultant = null, targetBranchId = '') {
  const scope = resolveBondOrganisationScope(context, data)
  if (scope.scopeLevel === 'hq') return scope
  const branchId = normalizeText(targetBranchId || getConsultantBranchId(consultant || {}))
  const branch = (data.branches || []).find((row) => normalizeText(row.id) === branchId)
  const regionId = normalizeText(targetBranchId ? getBranchRegionId(branch || {}) : getConsultantRegionId(consultant || {}) || getBranchRegionId(branch || {}))
  if (scope.scopeLevel === 'region' && (scope.regionIds || []).map(normalizeText).includes(regionId)) return scope
  if (scope.scopeLevel === 'branch' && (scope.branchIds || []).map(normalizeText).includes(branchId)) return scope
  throw createConsultantPermissionError()
}

function canViewRegion(regionId = '', scope = {}) {
  if (scope.scopeLevel === 'hq') return true
  if (scope.scopeLevel === 'region') return (scope.regionIds || []).map(normalizeText).includes(normalizeText(regionId))
  return false
}

function canViewBranch(branchId = '', scope = {}) {
  if (scope.scopeLevel === 'hq') return true
  if (scope.branchIds === 'ALL') return true
  if (scope.scopeLevel === 'region' || scope.scopeLevel === 'branch') return (scope.branchIds || []).map(normalizeText).includes(normalizeText(branchId))
  return false
}

function canViewConsultant(consultant = {}, scope = {}) {
  const consultantId = getUserId(consultant)
  if (scope.scopeLevel === 'hq') return true
  if (scope.consultantIds === 'ALL') return true
  if (scope.scopeLevel === 'region') return (scope.regionIds || []).map(normalizeText).includes(getConsultantRegionId(consultant))
  if (scope.scopeLevel === 'branch') return (scope.branchIds || []).map(normalizeText).includes(getConsultantBranchId(consultant))
  return (scope.consultantIds || []).map(normalizeText).includes(consultantId)
}

function validateRegionPayload(payload = {}, existingRegions = [], options = {}) {
  const fieldErrors = {}
  const name = normalizeText(payload.name || payload.regionName)
  const code = normalizeUpper(payload.code || payload.regionCode)
  const status = normalizeLower(payload.status || 'active')
  const managerUserId = normalizeText(payload.managerUserId || payload.manager_user_id)
  const editingRegionId = normalizeText(options.regionId)

  if (!name) fieldErrors.name = 'Region name is required.'
  if (name && name.length < 2) fieldErrors.name = 'Region name must be at least 2 characters.'
  if (code) {
    const duplicate = existingRegions.find((region) => (
      normalizeText(region.id) !== editingRegionId &&
      normalizeUpper(region.code || region.region_code || region.regionCode) === code
    ))
    if (duplicate) fieldErrors.code = 'Region code must be unique within this organisation.'
  }
  if (!REGION_STATUS_VALUES.has(status)) fieldErrors.status = 'Status must be Active or Inactive.'
  if (managerUserId && options.users) {
    const manager = options.users.find((user) => normalizeText(user.user_id || user.userId || user.id) === managerUserId)
    if (!manager) {
      fieldErrors.managerUserId = 'Regional manager must be a valid user in this organisation.'
    } else if (!REGION_MANAGER_ROLES.has(getUserRole(manager))) {
      fieldErrors.managerUserId = 'Selected user does not have a compatible region manager role.'
    }
  }

  if (Object.keys(fieldErrors).length) {
    throw createValidationError('Region validation failed.', fieldErrors)
  }

  return {
    name,
    code,
    managerUserId,
    notes: normalizeText(payload.notes || payload.description),
    status,
  }
}

function validateEmail(value = '') {
  const safeValue = normalizeText(value)
  return !safeValue || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(safeValue)
}

function validatePhone(value = '') {
  const safeValue = normalizeText(value)
  return !safeValue || /^[+()\d\s.-]{7,24}$/.test(safeValue)
}

function validateBranchPayload(payload = {}, existingBranches = [], options = {}) {
  const fieldErrors = {}
  const name = normalizeText(payload.name || payload.branchName)
  const code = normalizeUpper(payload.code || payload.branchCode)
  const regionId = normalizeText(payload.regionId || payload.region_id)
  const status = normalizeLower(payload.status || 'active')
  const managerUserId = normalizeText(payload.managerUserId || payload.manager_user_id)
  const editingBranchId = normalizeText(options.branchId)

  if (!name) fieldErrors.name = 'Branch name is required.'
  if (name && name.length < 2) fieldErrors.name = 'Branch name must be at least 2 characters.'
  if (!regionId) fieldErrors.regionId = 'Region is required.'
  if (regionId && options.regions && !options.regions.some((region) => normalizeText(region.id) === regionId)) {
    fieldErrors.regionId = 'Selected region does not exist.'
  }
  if (code) {
    const duplicate = existingBranches.find((branch) => (
      normalizeText(branch.id) !== editingBranchId &&
      normalizeUpper(branch.code || branch.branch_code || branch.branchCode) === code
    ))
    if (duplicate) fieldErrors.code = 'Branch code must be unique within this organisation.'
  }
  if (!REGION_STATUS_VALUES.has(status)) fieldErrors.status = 'Status must be Active or Inactive.'
  if (!validateEmail(payload.contactEmail || payload.contact_email)) fieldErrors.contactEmail = 'Enter a valid contact email.'
  if (!validatePhone(payload.contactNumber || payload.contact_number)) fieldErrors.contactNumber = 'Enter a valid contact number.'
  if (managerUserId && options.users) {
    const manager = options.users.find((user) => normalizeText(user.user_id || user.userId || user.id) === managerUserId)
    if (!manager) {
      fieldErrors.managerUserId = 'Branch manager must be a valid user in this organisation.'
    } else if (!BRANCH_MANAGER_ROLES.has(getUserRole(manager))) {
      fieldErrors.managerUserId = 'Selected user does not have a compatible branch manager role.'
    }
  }

  if (Object.keys(fieldErrors).length) {
    throw createValidationError('Branch validation failed.', fieldErrors)
  }

  return {
    name,
    regionId,
    code,
    managerUserId,
    officeLocation: normalizeText(payload.officeLocation || payload.office_location),
    contactEmail: normalizeText(payload.contactEmail || payload.contact_email),
    contactNumber: normalizeText(payload.contactNumber || payload.contact_number),
    notes: normalizeText(payload.notes || payload.description),
    status,
  }
}

function validateConsultantPayload(payload = {}, existingConsultants = [], options = {}) {
  const fieldErrors = {}
  const firstName = normalizeText(payload.firstName || payload.first_name)
  const lastName = normalizeText(payload.lastName || payload.last_name)
  const email = normalizeLower(payload.email)
  const mobileNumber = normalizeText(payload.mobileNumber || payload.mobile_number || payload.phone)
  const role = normalizeLower(payload.role || payload.workspaceRole || payload.workspace_role || 'consultant')
  const branchId = normalizeText(payload.branchId || payload.branch_id || payload.workspaceUnitId || payload.workspace_unit_id)
  const employeeNumber = normalizeText(payload.employeeNumber || payload.employee_number)
  const status = normalizeLower(payload.status || 'active')
  const editingConsultantId = normalizeText(options.consultantId)

  if (!firstName) fieldErrors.firstName = 'First name is required.'
  if (!lastName) fieldErrors.lastName = 'Last name is required.'
  if (!email) fieldErrors.email = 'Email is required.'
  if (email && !validateEmail(email)) fieldErrors.email = 'Enter a valid email.'
  if (email) {
    const duplicate = existingConsultants.find((consultant) => (
      normalizeText(consultant.id) !== editingConsultantId &&
      getUserId(consultant) !== editingConsultantId &&
      normalizeLower(consultant.email) === email
    ))
    if (duplicate) fieldErrors.email = 'Email must be unique within this organisation.'
  }
  if (mobileNumber && !validatePhone(mobileNumber)) fieldErrors.mobileNumber = 'Enter a valid mobile number.'
  if (!CONSULTANT_ROLES.has(role)) fieldErrors.role = 'Role must be a valid consultant role.'
  if (!branchId) fieldErrors.branchId = 'Branch is required.'
  const branch = (options.branches || []).find((row) => normalizeText(row.id) === branchId)
  if (branchId && !branch) fieldErrors.branchId = 'Selected branch does not exist.'
  if (!REGION_STATUS_VALUES.has(status)) fieldErrors.status = 'Status must be Active or Inactive.'

  if (Object.keys(fieldErrors).length) {
    throw createValidationError('Consultant validation failed.', fieldErrors)
  }

  return {
    firstName,
    lastName,
    name: [firstName, lastName].filter(Boolean).join(' '),
    email,
    mobileNumber,
    role,
    branchId,
    regionId: normalizeText(branch?.regionId || branch?.region_id),
    employeeNumber,
    status,
  }
}

function mapRegionToPersistencePayload(region = {}, workspaceId = '') {
  return {
    workspace_id: normalizeText(workspaceId),
    name: region.name,
    code: region.code || null,
    manager_user_id: region.managerUserId || null,
    description: region.notes || null,
    active: region.status !== 'inactive',
  }
}

function mapBranchToPersistencePayload(branch = {}, workspaceId = '') {
  return {
    workspace_id: normalizeText(workspaceId),
    region_id: normalizeText(branch.regionId),
    parent_unit_id: null,
    unit_type: WORKSPACE_UNIT_TYPES.branch,
    name: branch.name,
    code: branch.code || null,
    manager_user_id: branch.managerUserId || null,
    description: [
      branch.notes,
      branch.officeLocation ? `Office: ${branch.officeLocation}` : '',
      branch.contactEmail ? `Email: ${branch.contactEmail}` : '',
      branch.contactNumber ? `Phone: ${branch.contactNumber}` : '',
    ].filter(Boolean).join('\n') || null,
    active: branch.status !== 'inactive',
  }
}

function mapConsultantToPersistencePayload(consultant = {}, workspaceId = '') {
  return {
    organisation_id: normalizeText(workspaceId),
    user_id: normalizeText(consultant.userId || consultant.user_id) || null,
    first_name: consultant.firstName,
    last_name: consultant.lastName,
    email: consultant.email,
    role: consultant.role,
    workspace_role: consultant.role,
    organisation_role: consultant.role,
    status: consultant.status,
    scope_level: BOND_SCOPE_LEVELS.assigned,
    region_id: consultant.regionId || null,
    workspace_unit_id: consultant.branchId || null,
    branch_id: consultant.branchId || null,
    updated_at: new Date().toISOString(),
  }
}

function mapRegionActivity(event = {}, workspaceId = '') {
  const createdAt = event.createdAt || event.created_at || new Date().toISOString()
  return {
    id: normalizeText(event.id) || `activity-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    organisationId: normalizeText(event.organisationId || event.organisation_id || workspaceId),
    organisation_id: normalizeText(event.organisation_id || event.organisationId || workspaceId),
    eventType: normalizeText(event.eventType || event.event_type),
    event_type: normalizeText(event.event_type || event.eventType),
    regionId: normalizeText(event.regionId || event.region_id),
    region_id: normalizeText(event.region_id || event.regionId),
    branchId: normalizeText(event.branchId || event.branch_id),
    branch_id: normalizeText(event.branch_id || event.branchId),
    consultantId: normalizeText(event.consultantId || event.consultant_id),
    consultant_id: normalizeText(event.consultant_id || event.consultantId),
    applicationIds: Array.isArray(event.applicationIds || event.application_ids) ? event.applicationIds || event.application_ids : [],
    application_ids: Array.isArray(event.application_ids || event.applicationIds) ? event.application_ids || event.applicationIds : [],
    actorUserId: normalizeText(event.actorUserId || event.actor_user_id),
    actor_user_id: normalizeText(event.actor_user_id || event.actorUserId),
    previousValue: event.previousValue ?? event.previous_value ?? null,
    previous_value: event.previous_value ?? event.previousValue ?? null,
    newValue: event.newValue ?? event.new_value ?? null,
    new_value: event.new_value ?? event.newValue ?? null,
    createdAt,
    created_at: createdAt,
  }
}

function getActivityLabel(eventType = '') {
  if (eventType === BOND_ORGANISATION_ACTIVITY_EVENTS.regionCreated) return 'Region created'
  if (eventType === BOND_ORGANISATION_ACTIVITY_EVENTS.regionUpdated) return 'Region updated'
  if (eventType === BOND_ORGANISATION_ACTIVITY_EVENTS.regionManagerAssigned) return 'Regional manager assigned'
  if (eventType === BOND_ORGANISATION_ACTIVITY_EVENTS.branchCreated) return 'Branch created'
  if (eventType === BOND_ORGANISATION_ACTIVITY_EVENTS.branchUpdated) return 'Branch updated'
  if (eventType === BOND_ORGANISATION_ACTIVITY_EVENTS.branchManagerAssigned) return 'Branch manager assigned'
  if (eventType === BOND_ORGANISATION_ACTIVITY_EVENTS.branchMovedRegion) return 'Branch moved region'
  if (eventType === BOND_ORGANISATION_ACTIVITY_EVENTS.consultantCreated) return 'Consultant created'
  if (eventType === BOND_ORGANISATION_ACTIVITY_EVENTS.consultantUpdated) return 'Consultant updated'
  if (eventType === BOND_ORGANISATION_ACTIVITY_EVENTS.consultantAssignedBranch) return 'Consultant assigned branch'
  if (eventType === BOND_ORGANISATION_ACTIVITY_EVENTS.consultantDeactivated) return 'Consultant deactivated'
  if (eventType === BOND_ORGANISATION_ACTIVITY_EVENTS.applicationReassigned) return 'Application reassigned'
  if (normalizeText(eventType).startsWith('PARTNER_')) return 'Partner updated'
  return 'Organisation updated'
}

function getActivityDescription(event = {}, regions = [], users = [], branches = []) {
  const region = regions.find((item) => normalizeText(item.id) === normalizeText(event.regionId || event.region_id))
  const regionName = normalizeText(region?.name || event.newValue?.name || event.previousValue?.name) || 'Region'
  const branch = branches.find((item) => normalizeText(item.id) === normalizeText(event.branchId || event.branch_id))
  const branchName = normalizeText(branch?.name || event.newValue?.name || event.previousValue?.name) || 'Branch'
  const consultant = users.find((user) => getUserId(user) === normalizeText(event.consultantId || event.consultant_id || event.newValue?.id || event.newValue?.userId || event.newValue?.user_id))
  const consultantName = normalizeText(consultant?.name || event.newValue?.name || event.previousValue?.name) || 'Consultant'
  const partnerName = normalizeText(event.newValue?.partner?.name || event.newValue?.name || event.previousValue?.name || event.source)
  if (event.eventType === BOND_ORGANISATION_ACTIVITY_EVENTS.regionManagerAssigned) {
    const managerId = normalizeText(event.newValue?.managerUserId || event.newValue?.manager_user_id)
    const manager = users.find((user) => normalizeText(user.user_id || user.userId || user.id) === managerId)
    return `${getUserName(manager || {})} assigned as regional manager for ${regionName}`
  }
  if (event.eventType === BOND_ORGANISATION_ACTIVITY_EVENTS.regionCreated) return `${regionName} region created`
  if (event.eventType === BOND_ORGANISATION_ACTIVITY_EVENTS.regionUpdated) return `${regionName} region updated`
  if (event.eventType === BOND_ORGANISATION_ACTIVITY_EVENTS.branchManagerAssigned) {
    const managerId = normalizeText(event.newValue?.managerUserId || event.newValue?.manager_user_id)
    const manager = users.find((user) => normalizeText(user.user_id || user.userId || user.id) === managerId)
    return `${getUserName(manager || {})} assigned as branch manager for ${branchName}`
  }
  if (event.eventType === BOND_ORGANISATION_ACTIVITY_EVENTS.branchMovedRegion) {
    const toRegion = regions.find((item) => normalizeText(item.id) === normalizeText(event.newValue?.regionId || event.newValue?.region_id))
    return `${branchName} moved to ${toRegion?.name || 'another region'}`
  }
  if (event.eventType === BOND_ORGANISATION_ACTIVITY_EVENTS.branchCreated) return `${branchName} branch created`
  if (event.eventType === BOND_ORGANISATION_ACTIVITY_EVENTS.branchUpdated) return `${branchName} branch updated`
  if (event.eventType === BOND_ORGANISATION_ACTIVITY_EVENTS.consultantCreated) return `${consultantName} added as a consultant`
  if (event.eventType === BOND_ORGANISATION_ACTIVITY_EVENTS.consultantUpdated) return `${consultantName} consultant record updated`
  if (event.eventType === BOND_ORGANISATION_ACTIVITY_EVENTS.consultantAssignedBranch) return `${consultantName} assigned to ${branchName}`
  if (event.eventType === BOND_ORGANISATION_ACTIVITY_EVENTS.consultantDeactivated) return `${consultantName} deactivated`
  if (event.eventType === BOND_ORGANISATION_ACTIVITY_EVENTS.applicationReassigned) {
    const count = Number(event.newValue?.applicationCount || event.applicationIds?.length || 0)
    return `${count || 'Applications'} reassigned from ${event.previousValue?.name || 'one consultant'} to ${event.newValue?.name || consultantName}`
  }
  if (normalizeText(event.eventType).startsWith('PARTNER_')) {
    if (event.eventType === 'PARTNER_INVITED') return `${partnerName || 'Partner'} invited`
    if (event.eventType === 'PARTNER_ACCEPTED') return `${partnerName || 'Partner'} accepted the partnership`
    if (event.eventType === 'PARTNER_ROUTING_DEFAULT_UPDATED') return `${partnerName || 'Partner'} routing default updated`
    if (event.eventType === 'PARTNER_DISABLED') return `${partnerName || 'Partner'} disabled`
    return `${partnerName || 'Partner'} partner record updated`
  }
  return `${regionName} organisation record updated`
}

function getScopedRegionBranchRows(region = {}, branches = []) {
  const regionId = normalizeText(region.id || region.regionId || region.region_id)
  const regionName = normalizeText(region.name)
  return (branches || []).filter((branch) => (
    normalizeText(branch.regionId || branch.region_id) === regionId ||
    normalizeText(branch.region) === regionName
  ))
}

export function getVisibleOrganisationScope({ capabilities = {}, regions = [], branches = [], consultants = [], applications = [], activityEvents = [] } = {}) {
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
    activityEvents,
  }
}

export function getBranchPerformance(scope = {}) {
  return (scope.branches || []).map((branch) => {
    const rows = getBranchApplicationRows(branch, scope.applications)
    const approved = rows.filter(isApplicationApproved).length
    const pendingDocs = rows.filter(isPendingDocs).length
    const leadTime = averageNumber(rows.map(getApplicationLeadDays))
    const bottleneck = getMostCommon(rows.map(getApplicationBottleneck)) || 'Clear'
    const branchId = normalizeText(branch.id)
    const submittedApplications = rows.filter(isApplicationSubmitted).length
    const unassignedApplications = rows.filter(isApplicationUnassigned).length
    return {
      id: branchId,
      branch: branch.name,
      name: branch.name,
      code: normalizeUpper(branch.code),
      regionId: getBranchRegionId(branch),
      region: branch.region || 'Unassigned',
      managerUserId: getBranchManagerId(branch),
      manager: normalizeText(branch.manager_name || branch.managerName) || getManagerName(branch.manager_user_id || branch.managerUserId, scope.consultants),
      officeLocation: normalizeText(branch.officeLocation || branch.office_location),
      contactEmail: normalizeText(branch.contactEmail || branch.contact_email),
      contactNumber: normalizeText(branch.contactNumber || branch.contact_number),
      notes: normalizeText(branch.notes || branch.description),
      consultants: (scope.consultants || []).filter((user) => getUserUnitId(user) === branchId).length,
      consultantCount: (scope.consultants || []).filter((user) => getUserUnitId(user) === branchId).length,
      activeApplications: rows.length,
      submittedApplications,
      pendingDocs,
      pendingDocuments: pendingDocs,
      unassignedApplications,
      avgLeadTime: leadTime,
      averageTurnaround: leadTime,
      approvalRate: percent(approved, rows.length),
      bottleneck,
      status: getBranchStatus(branch),
      healthStatus: getStatusFromPressure({ activeApplications: rows.length, pendingDocs, avgLeadTime: leadTime, lastActivityAt: rows[0]?.lastActivityAt }),
      createdAt: branch.createdAt || branch.created_at || '',
      updatedAt: branch.updatedAt || branch.updated_at || '',
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
    const managerUserId = getRegionManagerId(region)
    const consultants = (scope.consultants || []).filter((user) => (
      normalizeText(user.regionId || user.region_id) === normalizeText(region.id) ||
      regionBranchIds.has(getUserUnitId(user)) ||
      normalizeText(user.user_id || user.userId || user.id) === managerUserId
    )).length
    const submittedApplications = regionRows.filter(isApplicationSubmitted).length
    return {
      id: region.id,
      region: region.name,
      name: region.name,
      code: normalizeUpper(region.code),
      notes: normalizeText(region.notes || region.description),
      managerUserId,
      manager: normalizeText(region.manager_name || region.managerName) || getManagerName(region.manager_user_id || region.managerUserId, scope.consultants),
      branches: regionBranches.length,
      consultants,
      activeApplications: regionRows.length,
      submittedApplications,
      pendingDocs,
      pendingDocuments: pendingDocs,
      avgLeadTime: leadTime,
      averageTurnaround: leadTime,
      approvalRate: percent(approved, regionRows.length),
      bottleneck:
        getMostCommon(regionRows.map(getApplicationBottleneck)) ||
        effectiveBranchPerformance.find((branch) => normalizeText(branch.regionId) === normalizeText(region.id))?.bottleneck ||
        'Clear',
      status: getRegionStatus(region),
      healthStatus: getStatusFromPressure({ activeApplications: regionRows.length, pendingDocs, avgLeadTime: leadTime, lastActivityAt: regionRows[0]?.lastActivityAt }),
    }
  })
}

export function getConsultantPerformance(scope = {}) {
  return (scope.consultants || []).map((consultant) => {
    const rows = getConsultantApplicationRows(consultant, scope.applications)
    const approved = rows.filter(isApplicationApproved).length
    const pendingDocs = rows.filter(isPendingDocs).length
    const readyForReview = rows.filter(isApplicationReadyForReview).length
    const submittedApplications = rows.filter(isApplicationSubmitted).length
    const leadTime = averageNumber(rows.map(getApplicationLeadDays))
    const staleApplications = rows.filter((row) => {
      const lastActivityAt = row.lastActivityAt || row.updatedAt || row.updated_at || row.createdAt || row.created_at
      return lastActivityAt && getDaysBetween(lastActivityAt, new Date().toISOString()) >= 7
    }).length
    const newThisMonth = rows.filter((row) => {
      const date = new Date(row.lastActivityAt || '')
      const now = new Date()
      return !Number.isNaN(date.getTime()) && date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth()
    }).length
    const branch = (scope.branches || []).find((item) => normalizeText(item.id) === getUserUnitId(consultant))
    const activeApplications = rows.length
    return {
      id: consultant.id || consultant.user_id || consultant.email,
      consultant: consultant.name,
      name: consultant.name,
      email: consultant.email,
      regionId: normalizeText(consultant.regionId || consultant.region_id || branch?.regionId || branch?.region_id),
      region: branch?.region || consultant.region || 'Unassigned',
      branchId: normalizeText(branch?.id || consultant.workspaceUnitId || consultant.workspace_unit_id),
      branch: branch?.name || consultant.branch || 'Unassigned',
      role: consultant.workspaceRole || consultant.role || 'consultant',
      status: getConsultantStatus(consultant),
      activeApplications,
      submittedApplications,
      readyForReview,
      newThisMonth,
      pendingDocs,
      pendingDocuments: pendingDocs,
      awaitingDocs: pendingDocs,
      staleApplications,
      avgLeadTime: leadTime,
      averageTurnaround: leadTime,
      approvalRate: percent(approved, activeApplications),
      lastActivity: rows[0]?.lastActivityLabel || 'No recent activity',
      lastActivityAt: rows[0]?.lastActivityAt || consultant.updatedAt || consultant.updated_at || consultant.createdAt || consultant.created_at || '',
      healthStatus: getStatusFromPressure({ activeApplications, pendingDocs, avgLeadTime: leadTime, lastActivityAt: rows[0]?.lastActivityAt }),
      capacityStatus: getConsultantCapacity(activeApplications),
      capacityPercent: getConsultantCapacityPercent(activeApplications),
      scope: consultant.scope_level || consultant.scopeLevel || '',
      createdAt: consultant.createdAt || consultant.created_at || '',
      updatedAt: consultant.updatedAt || consultant.updated_at || '',
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

function isApplicationSubmitted(row = {}) {
  const signal = normalizeLower(`${row.status || ''} ${row.financeStageKey || ''} ${row.financeStageLabel || ''} ${row.registrationStatus || ''} ${row.nextAction || ''}`)
  return signal.includes('submitted') || signal.includes('submission') || signal.includes('bank feedback') || signal.includes('approved') || signal.includes('grant')
}

function isApplicationReadyForReview(row = {}) {
  const signal = normalizeLower(`${row.status || ''} ${row.financeStageKey || ''} ${row.financeStageLabel || ''} ${row.registrationStatus || ''} ${row.nextAction || ''}`)
  return signal.includes('ready for review') || signal.includes('review ready') || signal.includes('quality review')
}

function isApplicationUnassigned(row = {}) {
  const assignedUserId = normalizeText(row.assignedConsultantId || row.assigned_consultant_id || row.assignedUserId || row.assigned_user_id)
  const consultant = normalizeLower(row.consultant)
  return !assignedUserId && (!consultant || consultant === 'unassigned' || consultant === 'unassigned consultant')
}

function getBranchRowsForRegion(region = {}, branchPerformance = []) {
  const regionId = normalizeText(region.id)
  const regionName = normalizeText(region.name || region.region)
  return branchPerformance.filter((branch) => (
    normalizeText(branch.regionId) === regionId ||
    normalizeText(branch.region) === regionName
  ))
}

function getOverviewSetupState(scope = {}) {
  if (!(scope.regions || []).length) {
    return {
      key: 'regions',
      title: 'Set up your organisation structure',
      description: 'Start by creating your first region. After that, you can add branches, assign managers, and add consultants.',
      actionLabel: 'Add Region',
      actionIntent: 'add-bond-region',
    }
  }
  if (!(scope.branches || []).length) {
    return {
      key: 'branches',
      title: 'Add your first branch',
      description: 'Branches sit inside regions and hold consultants and applications.',
      actionLabel: 'Add Branch',
      actionIntent: 'add-bond-branch',
    }
  }
  if (!(scope.consultants || []).length) {
    return {
      key: 'consultants',
      title: 'Add consultants',
      description: 'Consultants own applications and manage buyer finance progress.',
      actionLabel: 'Add Consultant',
      actionIntent: 'invite-bond-user',
    }
  }
  return null
}

function getApplicationStatusLabel(row = {}) {
  const signal = normalizeLower(`${row.financeStageLabel || ''} ${row.status || ''} ${row.registrationStatus || ''}`)
  if (signal.includes('approved') || signal.includes('grant')) return 'Approved'
  if (signal.includes('submitted')) return 'Submitted'
  if (signal.includes('document') || signal.includes('doc')) return 'Pending Documents'
  if (signal.includes('feedback') || signal.includes('bank')) return 'Bank Feedback'
  if (signal.includes('declined') || signal.includes('rejected')) return 'Declined'
  return normalizeText(row.financeStageLabel || row.status) || 'In Progress'
}

export function getOrganisationOverview({
  scope = {},
  branchPerformance = [],
  regionPerformance = [],
  consultantPerformance = [],
  recentActivity = [],
} = {}) {
  const applications = scope.applications || []
  const activeApplications = applications.length
  const submittedApplications = applications.filter(isApplicationSubmitted).length
  const pendingDocumentApplications = applications.filter(isPendingDocs).length
  const unassignedApplications = applications.filter(isApplicationUnassigned).length
  const approvedApplications = applications.filter(isApplicationApproved).length
  const approvalRate = percent(approvedApplications, applications.length)
  const averageTurnaround = averageNumber(applications.map(getApplicationLeadDays))
  const totalRegions = scope.regions?.length || 0
  const totalBranches = scope.branches?.length || 0
  const totalConsultants = scope.consultants?.length || 0
  const setupState = getOverviewSetupState(scope)

  const branchRows = (scope.branches || []).map((branch) => {
    const performance = branchPerformance.find((row) => normalizeText(row.id) === normalizeText(branch.id)) || {}
    const branchId = normalizeText(branch.id)
    const managerUserId = getBranchManagerId(branch) || normalizeText(performance.managerUserId)
    const managerName = normalizeText(branch.manager_name || branch.managerName || performance.manager)
    const regionId = normalizeText(branch.region_id || branch.regionId || performance.regionId)
    const regionName = normalizeText(branch.region || performance.region) || 'Unassigned'
    const consultants = Number(performance.consultants || performance.consultantCount || (scope.consultants || []).filter((consultant) => getUserUnitId(consultant) === branchId).length || 0)
    const activeApplicationsForBranch = Number(performance.activeApplications || 0)
    const submittedApplicationsForBranch = Number(performance.submittedApplications || 0)
    const pendingDocumentsForBranch = Number(performance.pendingDocuments || performance.pendingDocs || 0)
    const averageTurnaroundForBranch = Number(performance.averageTurnaround || performance.avgLeadTime || 0)
    const hasManager = Boolean(managerUserId || (managerName && normalizeLower(managerName) !== 'unassigned'))
    const status = performance.status || getBranchStatus(branch)
    const baseRow = {
      id: branchId,
      name: normalizeText(branch.name || branch.branch || performance.branch || performance.name) || 'Branch',
      branch: normalizeText(branch.name || branch.branch || performance.branch || performance.name) || 'Branch',
      code: normalizeUpper(branch.code || performance.code),
      regionId,
      region: regionName,
      managerUserId,
      manager: managerName || 'Unassigned',
      hasManager,
      consultants,
      consultantCount: consultants,
      activeApplications: activeApplicationsForBranch,
      submittedApplications: submittedApplicationsForBranch,
      pendingDocuments: pendingDocumentsForBranch,
      pendingDocs: pendingDocumentsForBranch,
      approvalRate: performance.approvalRate || 0,
      avgLeadTime: averageTurnaroundForBranch,
      averageTurnaround: averageTurnaroundForBranch,
      status,
      createdAt: branch.createdAt || branch.created_at || performance.createdAt || '',
      updatedAt: branch.updatedAt || branch.updated_at || performance.updatedAt || '',
      href: getBondBranchWorkspaceRoute(branchId),
    }
    return {
      ...baseRow,
      slaStatus: getBranchSlaStatus(baseRow),
      riskLevel: getBranchRiskLevel(baseRow),
      risk: getBranchRiskLevel(baseRow),
      utilisationLabel: consultants ? `${Math.round(activeApplicationsForBranch / consultants)} files / consultant` : activeApplicationsForBranch ? 'No consultants' : 'No workload',
    }
  })
  const branchesWithoutManagers = branchRows.filter((branch) => !branch.hasManager).length
  const regionsWithoutBranches = (scope.regions || []).filter((region) => {
    const regionId = normalizeText(region.id)
    const regionName = normalizeText(region.name || region.region)
    return !branchRows.some((branch) => normalizeText(branch.regionId) === regionId || normalizeText(branch.region) === regionName)
  }).length
  const consultantsWithoutBranch = (scope.consultants || []).filter((consultant) => !getUserUnitId(consultant)).length

  const structure = {
    regions: (scope.regions || []).map((region) => {
      const rows = getBranchRowsForRegion(region, branchPerformance)
      const regionBranches = branchRows.filter((branch) => (
        normalizeText(branch.regionId) === normalizeText(region.id) ||
        normalizeText(branch.region) === normalizeText(region.name || region.region)
      ))
      const performance = regionPerformance.find((row) => normalizeText(row.id) === normalizeText(region.id)) || {}
      return {
        id: normalizeText(region.id),
        name: normalizeText(region.name || region.region) || 'Region',
        consultants: performance.consultants || regionBranches.reduce((sum, branch) => sum + Number(branch.consultants || 0), 0),
        activeApplications: performance.activeApplications || rows.reduce((sum, row) => sum + Number(row.activeApplications || 0), 0),
        branches: regionBranches,
        href: getBondRegionWorkspaceRoute(normalizeText(region.id)),
      }
    }),
    directBranches: branchRows.filter((branch) => !normalizeText(branch.regionId)),
  }

  const alerts = []
  ;(scope.regions || []).forEach((region) => {
    const regionBranches = branchRows.filter((branch) => normalizeText(branch.regionId) === normalizeText(region.id))
    if (!regionBranches.length) {
      alerts.push({
        key: `region-no-branches-${region.id}`,
        title: normalizeText(region.name) || 'Region',
        description: 'No branches have been created in this region.',
        actionLabel: 'Add Branch',
        actionIntent: 'add-bond-branch',
        href: getBondRegionWorkspaceRoute(region.id),
      })
    }
  })
  branchRows.forEach((branch) => {
    if (!branch.hasManager) {
      alerts.push({
        key: `branch-no-manager-${branch.id}`,
        title: branch.name,
        description: 'No branch manager assigned.',
        actionLabel: 'Assign Manager',
        actionIntent: 'assign-bond-branch-manager',
        href: branch.href,
      })
    }
    if (!branch.consultants) {
      alerts.push({
        key: `branch-no-consultants-${branch.id}`,
        title: branch.name,
        description: 'No consultants assigned to this branch.',
        actionLabel: 'Add Consultant',
        actionIntent: 'invite-bond-user',
        href: branch.href,
      })
    }
  })
  consultantPerformance.forEach((consultant) => {
    if (Number(consultant.activeApplications || 0) >= 25) {
      alerts.push({
        key: `consultant-overloaded-${consultant.id}`,
        title: consultant.consultant,
        description: `${consultant.activeApplications} active applications need workload review.`,
        actionLabel: 'Review Workload',
        actionIntent: 'review-bond-scopes',
        href: getBondOrganisationRouteForTab('consultants', { consultantId: consultant.id }),
      })
    }
  })
  if (pendingDocumentApplications) {
    alerts.push({
      key: 'pending-documents',
      title: 'Applications waiting for documents',
      description: `${pendingDocumentApplications} applications are blocked on buyer documents.`,
      actionLabel: 'Review Documents',
      actionIntent: '',
      href: '/bond/applications?view=awaiting-docs',
    })
  }
  if (unassignedApplications) {
    alerts.push({
      key: 'unassigned-applications',
      title: 'Applications with no consultant assigned',
      description: `${unassignedApplications} applications need consultant ownership.`,
      actionLabel: 'Assign Consultant',
      actionIntent: 'assign-bond-user-branch',
      href: '/bond/applications',
    })
  }

  const applicationsByStatus = [...applications.reduce((map, row) => {
    const status = getApplicationStatusLabel(row)
    map.set(status, (map.get(status) || 0) + 1)
    return map
  }, new Map()).entries()].map(([label, value]) => ({ label, value }))

  const sortedBranches = [...branchPerformance].sort((left, right) => Number(right.approvalRate || 0) - Number(left.approvalRate || 0))
  const workloadValues = consultantPerformance.map((row) => Number(row.activeApplications || 0))
  const workloadSpread = workloadValues.length
    ? `${Math.min(...workloadValues)}-${Math.max(...workloadValues)} active files`
    : 'No workload yet'
  const overloadedConsultants = consultantPerformance.filter((consultant) => normalizeLower(consultant.capacityStatus) === 'overloaded' || Number(consultant.activeApplications || 0) > 40).length
  const consultantCapacity = consultantPerformance.map((consultant) => {
    const sourceConsultant = (scope.consultants || []).find((row) => (
      normalizeText(row.id) === normalizeText(consultant.id) ||
      getUserId(row) === normalizeText(consultant.id) ||
      normalizeLower(row.email) === normalizeLower(consultant.email) ||
      normalizeLower(getUserName(row)) === normalizeLower(consultant.consultant)
    )) || {}
    const consultantKeys = new Set([
      normalizeText(consultant.id),
      getUserId(sourceConsultant),
      normalizeLower(consultant.email),
      normalizeLower(sourceConsultant.email),
      normalizeLower(consultant.consultant),
    ].filter(Boolean))
    const rows = applications.filter((row) => (
      consultantKeys.has(normalizeText(row.assignedUserId || row.assigned_user_id || row.primaryBondConsultantUserId || row.primary_bond_consultant_user_id)) ||
      consultantKeys.has(normalizeLower(row.assignedUserEmail || row.assigned_user_email)) ||
      consultantKeys.has(normalizeLower(row.consultant))
    ))
    return {
      id: consultant.id,
      consultant: consultant.consultant || consultant.name || 'Consultant',
      branch: consultant.branch || 'Unassigned',
      activeFiles: consultant.activeApplications || 0,
      readyForReview: rows.filter(isApplicationReadyForReview).length,
      awaitingDocs: consultant.pendingDocuments || rows.filter(isPendingDocs).length,
      capacityStatus: !normalizeText(consultant.branchId) ? 'Unassigned' : normalizeLower(consultant.capacityStatus) === 'overloaded' ? 'Overloaded' : normalizeLower(consultant.capacityStatus) === 'busy' ? 'Busy' : 'Healthy',
    }
  })
  const sortedBranchDirectory = [...branchRows].sort((left, right) => (
    Number(right.activeApplications || 0) - Number(left.activeApplications || 0) ||
    new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime() ||
    normalizeText(left.name).localeCompare(normalizeText(right.name))
  ))
  const branchManagers = new Set(branchRows.map((branch) => normalizeText(branch.managerUserId)).filter(Boolean))
  const branchesWithNoConsultants = branchRows.filter((branch) => !Number(branch.consultants || 0)).length
  const overloadedBranches = branchRows.filter(isBranchOverloaded).length
  const branchesBelowSla = branchRows.filter((branch) => getBranchSlaStatus(branch) === 'Below SLA').length
  const branchHealthCards = [
    {
      key: 'branches-without-managers',
      label: 'Branches Without Managers',
      count: branchesWithoutManagers,
      description: branchesWithoutManagers ? 'Assign manager ownership to keep branch routing clear.' : 'Every branch has manager ownership.',
      href: getBondOrganisationRouteForTab('branches'),
      actionLabel: branchesWithoutManagers ? 'Fix' : 'View',
    },
    {
      key: 'branches-with-no-consultants',
      label: 'Branches With No Consultants',
      count: branchesWithNoConsultants,
      description: branchesWithNoConsultants ? 'Add consultants or consolidate inactive branches.' : 'Every branch has consultant coverage.',
      href: getBondOrganisationRouteForTab('consultants'),
      actionLabel: branchesWithNoConsultants ? 'Fix' : 'View',
    },
    {
      key: 'overloaded-branches',
      label: 'Overloaded Branches',
      count: overloadedBranches,
      description: overloadedBranches ? 'Workload is high relative to consultant capacity.' : 'Branch workloads are within capacity.',
      href: getBondOrganisationRouteForTab('branches'),
      actionLabel: overloadedBranches ? 'Review' : 'View',
    },
    {
      key: 'branches-below-sla',
      label: 'Branches Below SLA',
      count: branchesBelowSla,
      description: branchesBelowSla ? 'Turnaround or document blockers need attention.' : 'Branch SLA indicators look healthy.',
      href: getBondOrganisationRouteForTab('branches'),
      actionLabel: branchesBelowSla ? 'Review' : 'View',
    },
  ]
  const branchCapacity = {
    highestWorkload: sortedBranchDirectory
      .filter((branch) => Number(branch.activeApplications || 0) > 0)
      .slice(0, 6),
    lowestWorkload: [...branchRows]
      .sort((left, right) => (
        Number(left.activeApplications || 0) - Number(right.activeApplications || 0) ||
        Number(left.consultants || 0) - Number(right.consultants || 0) ||
        normalizeText(left.name).localeCompare(normalizeText(right.name))
      ))
      .slice(0, 6),
  }
  const branchStructure = {
    regions: (scope.regions || []).map((region) => {
      const regionId = normalizeText(region.id)
      const regionName = normalizeText(region.name || region.region) || 'Region'
      return {
        id: regionId,
        name: regionName,
        branches: branchRows.filter((branch) => (
          normalizeText(branch.regionId) === regionId ||
          normalizeLower(branch.region) === normalizeLower(regionName)
        )),
        href: getBondRegionWorkspaceRoute(regionId),
      }
    }),
    directBranches: branchRows.filter((branch) => !normalizeText(branch.regionId) || normalizeLower(branch.region) === 'unassigned'),
  }
  const branchActivityTypes = new Set([
    BOND_ORGANISATION_ACTIVITY_EVENTS.branchCreated,
    BOND_ORGANISATION_ACTIVITY_EVENTS.branchUpdated,
    BOND_ORGANISATION_ACTIVITY_EVENTS.branchManagerAssigned,
    BOND_ORGANISATION_ACTIVITY_EVENTS.branchMovedRegion,
    BOND_ORGANISATION_ACTIVITY_EVENTS.consultantAssignedBranch,
    BOND_ORGANISATION_ACTIVITY_EVENTS.applicationReassigned,
  ])
  const recentBranchActivity = recentActivity.filter((event) => branchActivityTypes.has(event.eventType || event.event_type)).slice(0, 9)
  const consultantRows = consultantPerformance.map((consultant) => ({
    id: normalizeText(consultant.id),
    consultant: consultant.consultant || consultant.name || 'Consultant',
    name: consultant.consultant || consultant.name || 'Consultant',
    email: normalizeLower(consultant.email),
    role: normalizeText(consultant.role) || 'consultant',
    status: normalizeLower(consultant.status || 'active'),
    regionId: normalizeText(consultant.regionId),
    region: consultant.region || 'Unassigned',
    branchId: normalizeText(consultant.branchId),
    branch: consultant.branch || 'Unassigned',
    activeApplications: Number(consultant.activeApplications || 0),
    readyForReview: Number(consultant.readyForReview || 0),
    awaitingDocs: Number(consultant.awaitingDocs || consultant.pendingDocuments || consultant.pendingDocs || 0),
    submittedApplications: Number(consultant.submittedApplications || 0),
    approvalRate: Number(consultant.approvalRate || 0),
    averageTurnaround: Number(consultant.averageTurnaround || consultant.avgLeadTime || 0),
    capacityStatus: consultant.capacityStatus || getConsultantCapacity(consultant.activeApplications),
    capacityPercent: Number(consultant.capacityPercent || getConsultantCapacityPercent(consultant.activeApplications)),
    staleApplications: Number(consultant.staleApplications || 0),
    lastActivity: consultant.lastActivity || 'No recent activity',
    lastActivityAt: consultant.lastActivityAt || '',
    createdAt: consultant.createdAt || '',
    updatedAt: consultant.updatedAt || '',
    href: getBondConsultantWorkspaceRoute(consultant.id),
  }))
  const sortedConsultantDirectory = [...consultantRows].sort((left, right) => (
    Number(right.activeApplications || 0) - Number(left.activeApplications || 0) ||
    new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime() ||
    normalizeText(left.consultant).localeCompare(normalizeText(right.consultant))
  ))
  const consultantCommandWithoutBranch = consultantRows.filter((consultant) => !normalizeText(consultant.branchId) || normalizeLower(consultant.branch) === 'unassigned').length
  const consultantsWithoutActiveFiles = consultantRows.filter((consultant) => !Number(consultant.activeApplications || 0)).length
  const overloadedConsultantRows = consultantRows.filter((consultant) => normalizeLower(consultant.capacityStatus) === 'overloaded')
  const inactiveConsultantKeys = new Set(consultantRows
    .filter((consultant) => normalizeLower(consultant.status) === 'inactive')
    .flatMap((consultant) => [normalizeText(consultant.id), normalizeLower(consultant.email), normalizeLower(consultant.consultant)])
    .filter(Boolean))
  const applicationsAssignedToInactiveConsultant = applications.filter((row) => (
    inactiveConsultantKeys.has(normalizeText(row.assignedUserId || row.assigned_user_id || row.primaryBondConsultantUserId || row.primary_bond_consultant_user_id)) ||
    inactiveConsultantKeys.has(normalizeLower(row.assignedUserEmail || row.assigned_user_email)) ||
    inactiveConsultantKeys.has(normalizeLower(row.consultant))
  )).length
  const consultantHealthCards = [
    {
      key: 'consultants-without-branch',
      label: 'Consultants Without Branch',
      count: consultantCommandWithoutBranch,
      description: consultantCommandWithoutBranch ? 'Assign these consultants to a branch for routing and reporting.' : 'All consultants are linked to branches.',
      href: getBondOrganisationRouteForTab('consultants'),
      actionLabel: consultantCommandWithoutBranch ? 'Fix' : 'View',
    },
    {
      key: 'consultants-without-active-files',
      label: 'Consultants Without Active Files',
      count: consultantsWithoutActiveFiles,
      description: consultantsWithoutActiveFiles ? 'Review spare capacity or inactive roster members.' : 'Every consultant has active workload.',
      href: getBondOrganisationRouteForTab('consultants'),
      actionLabel: consultantsWithoutActiveFiles ? 'Review' : 'View',
    },
    {
      key: 'overloaded-consultants',
      label: 'Overloaded Consultants',
      count: overloadedConsultantRows.length,
      description: overloadedConsultantRows.length ? 'Redistribute applications from overloaded consultants.' : 'Consultant workload is within capacity.',
      href: getBondOrganisationRouteForTab('consultants'),
      actionLabel: overloadedConsultantRows.length ? 'Review' : 'View',
    },
    {
      key: 'applications-without-consultant',
      label: 'Applications Without Consultant',
      count: unassignedApplications,
      description: unassignedApplications ? 'Assign owners to prevent files from stalling.' : 'Application ownership is clear.',
      href: '/bond/applications',
      actionLabel: unassignedApplications ? 'Fix' : 'View',
    },
  ]
  const byApprovalRate = consultantRows.filter((consultant) => Number(consultant.activeApplications || 0) > 0).sort((left, right) => Number(right.approvalRate || 0) - Number(left.approvalRate || 0))
  const byTurnaround = consultantRows.filter((consultant) => Number(consultant.averageTurnaround || 0) > 0).sort((left, right) => Number(left.averageTurnaround || 0) - Number(right.averageTurnaround || 0))
  const bySubmitted = [...consultantRows].sort((left, right) => Number(right.submittedApplications || 0) - Number(left.submittedApplications || 0))
  const byReadyForReview = [...consultantRows].sort((left, right) => Number(right.readyForReview || 0) - Number(left.readyForReview || 0))
  const byStale = [...consultantRows].sort((left, right) => Number(right.staleApplications || 0) - Number(left.staleApplications || 0))
  const consultantActivityTypes = new Set([
    BOND_ORGANISATION_ACTIVITY_EVENTS.consultantCreated,
    BOND_ORGANISATION_ACTIVITY_EVENTS.consultantUpdated,
    BOND_ORGANISATION_ACTIVITY_EVENTS.consultantAssignedBranch,
    BOND_ORGANISATION_ACTIVITY_EVENTS.consultantDeactivated,
    BOND_ORGANISATION_ACTIVITY_EVENTS.applicationReassigned,
  ])
  const recentConsultantActivity = recentActivity.filter((event) => consultantActivityTypes.has(event.eventType || event.event_type)).slice(0, 9)

  return {
    metrics: {
      totalRegions,
      totalBranches,
      totalConsultants,
      activeApplications,
      submittedApplications,
      pendingDocumentApplications,
      unassignedApplications,
      approvalRate,
      averageTurnaround,
    },
    snapshotCards: [
      { key: 'regions', label: 'Regions', value: totalRegions, description: totalRegions ? 'Active regional groups' : 'No regions created yet', statusLine: totalRegions ? 'Configured network regions' : 'Create your first region' },
      { key: 'branches', label: 'Branches', value: totalBranches, description: totalBranches && totalRegions ? `Across ${totalRegions} active regions` : 'No branches created yet', statusLine: totalBranches ? 'Branch coverage configured' : 'Add your first branch' },
      { key: 'consultants', label: 'Consultants', value: totalConsultants, description: totalConsultants ? 'Active consultant roster' : 'No consultants added yet', statusLine: totalConsultants ? 'Consultant capacity tracked' : 'Add your first consultant' },
      { key: 'activeApplications', label: 'Active Applications', value: activeApplications, description: activeApplications ? 'Scoped application workload' : 'No active applications yet', statusLine: `${unassignedApplications} without owners` },
    ],
    setupState,
    summaryCards: [
      { key: 'regions', label: 'Regions', value: totalRegions, description: totalRegions ? 'Active regional groups' : 'No regions created yet', trend: 'Trend coming soon' },
      { key: 'branches', label: 'Branches', value: totalBranches, description: totalBranches && totalRegions ? `Across ${totalRegions} active regions` : 'No branches created yet', trend: 'Trend coming soon' },
      { key: 'consultants', label: 'Consultants', value: totalConsultants, description: totalConsultants ? 'Active consultant roster' : 'No consultants added yet', trend: 'Trend coming soon' },
      { key: 'activeApplications', label: 'Active Applications', value: activeApplications, description: activeApplications ? 'Scoped application workload' : 'No active applications yet', trend: 'Trend coming soon' },
      { key: 'submittedApplications', label: 'Applications Submitted', value: submittedApplications, description: submittedApplications ? 'Files submitted or beyond' : 'No submissions yet', trend: 'Trend coming soon' },
      { key: 'approvalRate', label: 'Approval Rate', value: `${approvalRate}%`, description: applications.length ? 'Approved applications in scope' : 'Awaiting approvals', trend: 'Trend coming soon' },
      { key: 'averageTurnaround', label: 'Average Turnaround', value: averageTurnaround ? `${averageTurnaround} days` : 'Tracking', description: averageTurnaround ? 'Average file movement time' : 'No turnaround data yet', trend: 'Trend coming soon' },
      { key: 'pendingDocuments', label: 'Pending Documents', value: pendingDocumentApplications, description: pendingDocumentApplications ? 'Applications blocked on docs' : 'No document blockers', trend: 'Trend coming soon' },
    ],
    structure,
    healthCards: [
      { key: 'branches-without-managers', label: 'Branches Without Managers', count: branchesWithoutManagers, description: 'Branches that need clear management ownership.', href: getBondOrganisationRouteForTab('branches'), actionLabel: branchesWithoutManagers ? 'Fix' : 'View' },
      { key: 'regions-without-branches', label: 'Regions Without Branches', count: regionsWithoutBranches, description: 'Regions created without branch coverage.', href: getBondOrganisationRouteForTab('regions'), actionLabel: regionsWithoutBranches ? 'Fix' : 'View' },
      { key: 'applications-without-owners', label: 'Applications Without Owners', count: unassignedApplications, description: 'Applications that need consultant ownership.', href: '/bond/applications', actionLabel: unassignedApplications ? 'Fix' : 'View' },
      { key: 'consultants-without-branch', label: 'Consultants Without Branch', count: consultantsWithoutBranch, description: 'Consultants not assigned to a branch.', href: getBondOrganisationRouteForTab('consultants'), actionLabel: consultantsWithoutBranch ? 'Fix' : 'View' },
      { key: 'overloaded-consultants', label: 'Overloaded Consultants', count: overloadedConsultants, description: 'Consultants above healthy active file capacity.', href: getBondOrganisationRouteForTab('consultants'), actionLabel: overloadedConsultants ? 'Fix' : 'View' },
    ],
    branchPerformance: branchPerformance.map((branch) => ({
      id: branch.id,
      branch: branch.branch || branch.name || 'Branch',
      name: branch.branch || branch.name || 'Branch',
      code: branch.code || '',
      regionId: branch.regionId || '',
      region: branch.region || 'Unassigned',
      managerUserId: branch.managerUserId || '',
      manager: branch.manager || 'Unassigned',
      activeApplications: branch.activeApplications || 0,
      submittedApplications: branch.submittedApplications || 0,
      pendingDocuments: branch.pendingDocuments || branch.pendingDocs || 0,
      consultants: branch.consultants || 0,
      approvalRate: branch.approvalRate || 0,
      averageTurnaround: branch.averageTurnaround || branch.avgLeadTime || 0,
      slaStatus: getBranchSlaStatus(branch),
      risk: getBranchRiskLevel(branch),
      riskLevel: getBranchRiskLevel(branch),
      status: branch.status || 'active',
      createdAt: branch.createdAt || '',
      updatedAt: branch.updatedAt || '',
      href: getBondBranchWorkspaceRoute(branch.id),
    })),
    consultantCapacity,
    branchCommandCentre: {
      snapshotCards: [
        { key: 'branches', label: 'Branches', value: totalBranches, description: totalBranches ? 'Configured national branch network' : 'No branches created yet', statusLine: totalBranches ? `${totalRegions} regions in scope` : 'Add first branch' },
        { key: 'branchManagers', label: 'Branch Managers', value: branchManagers.size, description: branchManagers.size ? 'Assigned branch owners' : 'No branch managers assigned', statusLine: branchesWithoutManagers ? `${branchesWithoutManagers} missing` : 'All assigned' },
        { key: 'consultants', label: 'Consultants', value: totalConsultants, description: totalConsultants ? 'Consultants in branch scope' : 'No consultants assigned yet', statusLine: branchesWithNoConsultants ? `${branchesWithNoConsultants} branches uncovered` : 'Coverage active' },
        { key: 'activeApplications', label: 'Active Applications', value: activeApplications, description: activeApplications ? 'Applications currently carried by branches' : 'No active branch workload', statusLine: unassignedApplications ? `${unassignedApplications} without owners` : 'Ownership clear' },
      ],
      healthCards: branchHealthCards,
      directory: sortedBranchDirectory,
      capacity: branchCapacity,
      structure: branchStructure,
      recentActivity: recentBranchActivity,
    },
    consultantCommandCentre: {
      snapshotCards: [
        { key: 'consultants', label: 'Consultants', value: totalConsultants, description: totalConsultants ? 'National consultant roster' : 'No consultants added yet', statusLine: totalConsultants ? 'Roster active' : 'Add first consultant' },
        { key: 'activeApplications', label: 'Active Applications', value: activeApplications, description: activeApplications ? 'Applications owned in consultant scope' : 'No active consultant workload', statusLine: unassignedApplications ? `${unassignedApplications} unassigned` : 'Ownership clear' },
        { key: 'readyForReview', label: 'Ready For Review', value: consultantRows.reduce((sum, consultant) => sum + Number(consultant.readyForReview || 0), 0), description: 'Files waiting for quality or submission review', statusLine: 'Review queue' },
        { key: 'overloadedConsultants', label: 'Overloaded Consultants', value: overloadedConsultantRows.length, description: overloadedConsultantRows.length ? 'Consultants above capacity threshold' : 'No overload detected', statusLine: overloadedConsultantRows.length ? 'Action needed' : 'Healthy' },
      ],
      healthCards: consultantHealthCards,
      directory: sortedConsultantDirectory,
      capacity: {
        highestWorkload: sortedConsultantDirectory.filter((consultant) => Number(consultant.activeApplications || 0) > 0).slice(0, 6),
        underutilised: [...consultantRows]
          .sort((left, right) => (
            Number(left.activeApplications || 0) - Number(right.activeApplications || 0) ||
            normalizeText(left.consultant).localeCompare(normalizeText(right.consultant))
          ))
          .slice(0, 6),
      },
      performance: [
        { key: 'top-approval-rate', label: 'Top Approval Rate', consultant: byApprovalRate[0]?.consultant || 'Not enough data', value: byApprovalRate[0] ? `${byApprovalRate[0].approvalRate}%` : 'Not enough data', href: byApprovalRate[0]?.href || '' },
        { key: 'fastest-turnaround', label: 'Fastest Turnaround', consultant: byTurnaround[0]?.consultant || 'Not enough data', value: byTurnaround[0] ? `${byTurnaround[0].averageTurnaround} days` : 'Not enough data', href: byTurnaround[0]?.href || '' },
        { key: 'most-submitted', label: 'Most Submitted Applications', consultant: bySubmitted[0]?.consultant || 'Not enough data', value: bySubmitted[0]?.submittedApplications || 'Not enough data', href: bySubmitted[0]?.href || '' },
        { key: 'most-ready', label: 'Most Ready For Review', consultant: byReadyForReview[0]?.consultant || 'Not enough data', value: byReadyForReview[0]?.readyForReview || 'Not enough data', href: byReadyForReview[0]?.href || '' },
        { key: 'highest-stale', label: 'Highest Stale File Count', consultant: byStale[0]?.consultant || 'Not enough data', value: byStale[0]?.staleApplications || 'Not enough data', href: byStale[0]?.href || '' },
      ],
      assignmentGaps: [
        { key: 'consultants-without-branch', label: 'Consultants not linked to branch', count: consultantCommandWithoutBranch, description: 'Consultants need branch allocation for routing.', href: getBondOrganisationRouteForTab('consultants'), actionLabel: consultantCommandWithoutBranch ? 'Assign' : 'View' },
        { key: 'branches-without-consultants', label: 'Branches without consultants', count: branchesWithNoConsultants, description: 'Branches need consultant coverage.', href: getBondOrganisationRouteForTab('branches'), actionLabel: branchesWithNoConsultants ? 'Fix' : 'View' },
        { key: 'applications-without-consultant', label: 'Applications without consultant', count: unassignedApplications, description: 'Applications need consultant ownership.', href: '/bond/applications', actionLabel: unassignedApplications ? 'Assign' : 'View' },
        { key: 'inactive-consultant-applications', label: 'Applications assigned to inactive consultant', count: applicationsAssignedToInactiveConsultant, description: 'Move files away from inactive users.', href: getBondOrganisationRouteForTab('consultants'), actionLabel: applicationsAssignedToInactiveConsultant ? 'Reassign' : 'View' },
      ],
      recentActivity: recentConsultantActivity,
    },
    alerts: alerts.slice(0, 8),
    performance: {
      applicationsByStatus,
      topPerformingBranch: sortedBranches[0] || null,
      lowestPerformingBranch: sortedBranches.length ? sortedBranches[sortedBranches.length - 1] : null,
      consultantWorkloadSpread: workloadSpread,
      averageApprovalRate: approvalRate,
      averageTurnaround,
    },
    recentActivity,
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
  const regionEvents = (scope.activityEvents || []).map((event) => {
    const mapped = mapRegionActivity(event)
    const actor = (scope.consultants || []).find((user) => normalizeText(user.user_id || user.userId || user.id) === normalizeText(mapped.actorUserId))
    const region = (scope.regions || []).find((item) => normalizeText(item.id) === normalizeText(mapped.regionId))
    const branch = (scope.branches || []).find((item) => normalizeText(item.id) === normalizeText(mapped.branchId))
    const consultant = (scope.consultants || []).find((item) => getUserId(item) === normalizeText(mapped.consultantId || mapped.consultant_id) || normalizeText(item.id) === normalizeText(mapped.consultantId || mapped.consultant_id))
    const isBranchEvent = normalizeText(mapped.branchId)
    const isConsultantEvent = normalizeText(mapped.consultantId || mapped.consultant_id)
    return {
      id: mapped.id,
      timestamp: mapped.createdAt ? new Date(mapped.createdAt).toLocaleDateString('en-ZA', { month: 'short', day: 'numeric' }) : 'Recently',
      actor: actor ? getUserName(actor) : 'HQ',
      branch: normalizeText(branch?.name || consultant?.branch) || (isBranchEvent ? 'Branch' : 'Organisation'),
      region: normalizeText(region?.name || mapped.newValue?.region || mapped.previousValue?.region || mapped.newValue?.name || mapped.previousValue?.name) || 'Region',
      type: getActivityLabel(mapped.eventType),
      description: getActivityDescription(mapped, scope.regions || [], scope.consultants || [], scope.branches || []),
      href: isConsultantEvent ? getBondConsultantWorkspaceRoute(isConsultantEvent) : isBranchEvent ? getBondBranchWorkspaceRoute(mapped.branchId || branch?.id) : getBondRegionWorkspaceRoute(mapped.regionId || region?.id),
      createdAt: mapped.createdAt,
    }
  })
  const applicationEvents = (scope.applications || []).map((row, index) => ({
    id: row.key || `${row.client}-${index}`,
    timestamp: row.lastActivityLabel || 'Recently',
    actor: row.consultant || 'Bond desk',
    branch: row.branch || 'Unassigned branch',
    region: row.region || 'Unassigned region',
    type: row.financeStageLabel || 'Application movement',
    description: `${row.client || 'A client'} moved to ${row.financeStageLabel || 'the next stage'}`,
    href: row.transactionId ? `/bond/files/${row.transactionId}` : '/bond/applications',
    createdAt: row.lastActivityAt || row.createdAt || '',
  }))
  return [...regionEvents, ...applicationEvents]
    .sort((left, right) => new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime())
    .slice(0, 8)
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

async function fetchConsultantRows(workspaceId = '') {
  const safeWorkspaceId = normalizeText(workspaceId)
  const localRows = getLocalConsultants(safeWorkspaceId)
  const users = await fetchOrganisationUsers(safeWorkspaceId)
  const persistedRows = users
    .filter((user) => CONSULTANT_ROLES.has(getConsultantRole(user)) || getConsultantBranchId(user))
    .map((row) => normalizeConsultantRow(row, safeWorkspaceId))
  const persistedIds = new Set(persistedRows.map((row) => normalizeText(row.id)))
  return [...persistedRows, ...localRows.filter((row) => !persistedIds.has(normalizeText(row.id)))]
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

async function fetchRegionRows(workspaceId = '') {
  const safeWorkspaceId = normalizeText(workspaceId)
  const localRows = getLocalRegions(safeWorkspaceId)
  if (!isSupabaseConfigured || !supabase || !safeWorkspaceId) return localRows

  const { data, error } = await supabase
    .from('workspace_regions')
    .select('id, workspace_id, name, code, manager_user_id, description, active, created_at, updated_at')
    .eq('workspace_id', safeWorkspaceId)

  if (error) {
    if (isMissingTableError(error, 'workspace_regions') || isReadRestrictedError(error)) return localRows
    throw error
  }
  const persistedRows = (data || []).map((row) => normalizeRegionRow(row, safeWorkspaceId))
  const persistedIds = new Set(persistedRows.map((row) => normalizeText(row.id)))
  return [...persistedRows, ...localRows.filter((row) => !persistedIds.has(normalizeText(row.id)))]
}

async function fetchBranchRows(workspaceId = '') {
  const safeWorkspaceId = normalizeText(workspaceId)
  const localRows = getLocalBranches(safeWorkspaceId)
  if (!isSupabaseConfigured || !supabase || !safeWorkspaceId) return localRows

  const { data, error } = await supabase
    .from('workspace_units')
    .select('id, workspace_id, region_id, parent_unit_id, unit_type, name, code, description, manager_user_id, active, created_at, updated_at')
    .eq('workspace_id', safeWorkspaceId)
    .eq('unit_type', WORKSPACE_UNIT_TYPES.branch)

  if (error) {
    if (isMissingTableError(error, 'workspace_units') || isReadRestrictedError(error)) return localRows
    throw error
  }
  const persistedRows = (data || []).map((row) => normalizeBranchRow(row, safeWorkspaceId))
  const persistedIds = new Set(persistedRows.map((row) => normalizeText(row.id)))
  return [...persistedRows, ...localRows.filter((row) => !persistedIds.has(normalizeText(row.id)))]
}

async function fetchActivityRows(workspaceId = '') {
  return getLocalActivity(workspaceId)
}

async function fetchManagerUsers(workspaceId = '', options = {}) {
  if (Array.isArray(options.users)) return options.users
  return fetchOrganisationUsers(workspaceId)
}

async function getAllRegionRows(workspaceId = '', options = {}) {
  const safeWorkspaceId = normalizeText(workspaceId)
  if (Array.isArray(options.regions)) return options.regions.map((row) => normalizeRegionRow(row, safeWorkspaceId))
  if (options.forceLocal) return getLocalRegions(safeWorkspaceId)
  return fetchRegionRows(safeWorkspaceId)
}

async function getAllBranchRows(workspaceId = '', options = {}) {
  const safeWorkspaceId = normalizeText(workspaceId)
  if (Array.isArray(options.branches)) return options.branches.map((row) => normalizeBranchRow(row, safeWorkspaceId))
  if (options.forceLocal) return getLocalBranches(safeWorkspaceId)
  return fetchBranchRows(safeWorkspaceId)
}

async function getAllConsultantRows(workspaceId = '', options = {}) {
  const safeWorkspaceId = normalizeText(workspaceId)
  if (Array.isArray(options.consultants) || Array.isArray(options.users)) {
    const optionRows = (options.consultants || options.users || []).map((row) => normalizeConsultantRow(row, safeWorkspaceId))
    const optionIds = new Set(optionRows.map((row) => normalizeText(row.id)))
    return [...optionRows, ...getLocalConsultants(safeWorkspaceId).filter((row) => !optionIds.has(normalizeText(row.id)))]
  }
  if (options.forceLocal) return getLocalConsultants(safeWorkspaceId)
  return fetchConsultantRows(safeWorkspaceId)
}

async function persistRegionActivity(workspaceId = '', event = {}) {
  const mapped = mapRegionActivity(event, workspaceId)
  setLocalActivity(workspaceId, [mapped, ...getLocalActivity(workspaceId)])
  return mapped
}

async function updateBranchManagerScope(workspaceId = '', userId = '', branchId = '', regionId = '') {
  const safeWorkspaceId = normalizeText(workspaceId)
  const safeUserId = normalizeText(userId)
  if (!isSupabaseConfigured || !supabase || !safeWorkspaceId || !safeUserId) return null
  const { data, error } = await supabase
    .from('organisation_users')
    .update({
      workspace_role: 'branch_manager',
      role: 'branch_manager',
      scope_level: BOND_SCOPE_LEVELS.branch,
      region_id: normalizeText(regionId),
      workspace_unit_id: normalizeText(branchId),
      updated_at: new Date().toISOString(),
    })
    .eq('organisation_id', safeWorkspaceId)
    .eq('user_id', safeUserId)
    .select('id, organisation_id, user_id, role, workspace_role, scope_level, region_id, workspace_unit_id')
    .maybeSingle()

  if (error && !isMissingTableError(error, 'organisation_users') && !isReadRestrictedError(error)) throw error
  return data || null
}

async function updateRegionalManagerScope(workspaceId = '', userId = '', regionId = '') {
  const safeWorkspaceId = normalizeText(workspaceId)
  const safeUserId = normalizeText(userId)
  if (!isSupabaseConfigured || !supabase || !safeWorkspaceId || !safeUserId) return null
  const { data, error } = await supabase
    .from('organisation_users')
    .update({
      workspace_role: 'regional_manager',
      role: 'regional_manager',
      scope_level: BOND_SCOPE_LEVELS.region,
      region_id: normalizeText(regionId),
      updated_at: new Date().toISOString(),
    })
    .eq('organisation_id', safeWorkspaceId)
    .eq('user_id', safeUserId)
    .select('id, organisation_id, user_id, role, workspace_role, scope_level, region_id')
    .maybeSingle()

  if (error && !isMissingTableError(error, 'organisation_users') && !isReadRestrictedError(error)) throw error
  return data || null
}

async function updateConsultantScope(workspaceId = '', userId = '', branchId = '', regionId = '', role = 'consultant') {
  const safeWorkspaceId = normalizeText(workspaceId)
  const safeUserId = normalizeText(userId)
  if (!isSupabaseConfigured || !supabase || !safeWorkspaceId || !safeUserId) return null
  const { data, error } = await supabase
    .from('organisation_users')
    .update({
      workspace_role: role,
      role,
      scope_level: BOND_SCOPE_LEVELS.assigned,
      region_id: normalizeText(regionId),
      workspace_unit_id: normalizeText(branchId),
      branch_id: normalizeText(branchId),
      updated_at: new Date().toISOString(),
    })
    .eq('organisation_id', safeWorkspaceId)
    .eq('user_id', safeUserId)
    .select('id, organisation_id, user_id, role, workspace_role, scope_level, region_id, workspace_unit_id, branch_id')
    .maybeSingle()

  if (error && !isMissingTableError(error, 'organisation_users') && !isReadRestrictedError(error)) throw error
  return data || null
}

export async function getBondRegions(context = {}, workspaceId = '', options = {}) {
  const safeWorkspaceId = normalizeText(workspaceId || context.workspaceId || context.currentWorkspace?.id)
  const [regions, users, hierarchy, applicationSnapshot] = await Promise.all([
    getAllRegionRows(safeWorkspaceId, options),
    fetchManagerUsers(safeWorkspaceId, options),
    options.hierarchy ? Promise.resolve(options.hierarchy) : fetchHierarchy(safeWorkspaceId),
    options.applicationSnapshot ? Promise.resolve(options.applicationSnapshot) : getBondTransactionTrackerSnapshot(context, safeWorkspaceId, { ...options, status: 'all' }),
  ])
  const branches = (options.branches || hierarchy.units || []).filter((unit) => getUnitType(unit) === WORKSPACE_UNIT_TYPES.branch)
  const applications = filterDemoBondApplications(applicationSnapshot.rows || options.applications || [], { includeDemoRows: options.includeDemoRows !== false })
  const organisationScope = resolveBondOrganisationScope({ ...context, workspaceId: safeWorkspaceId }, {
    regions,
    branches,
    consultants: users,
    applications,
  })
  const capabilities = resolveCapabilities({ ...context, workspaceId: safeWorkspaceId }, organisationScope)
  const visibleRegions = scopeRegions(regions, capabilities)
  const visibleScope = getVisibleOrganisationScope({
    capabilities,
    regions: visibleRegions,
    branches,
    consultants: users.map((user) => ({ ...user, name: getUserName(user) })),
    applications,
  })
  return getRegionPerformance(visibleScope, getBranchPerformance(visibleScope))
}

export async function createBondRegion(payload = {}, context = {}, workspaceId = '', options = {}) {
  const safeWorkspaceId = normalizeText(workspaceId || context.workspaceId || context.currentWorkspace?.id)
  const existingRegions = await getAllRegionRows(safeWorkspaceId, options)
  const users = await fetchManagerUsers(safeWorkspaceId, options)
  assertCanManageRegions({ ...context, workspaceId: safeWorkspaceId }, { regions: existingRegions, consultants: users })
  const validated = validateRegionPayload(payload, existingRegions, { users })
  const now = new Date().toISOString()

  if (isSupabaseConfigured && supabase && safeWorkspaceId && !options.forceLocal) {
    const { data, error } = await supabase
      .from('workspace_regions')
      .insert(mapRegionToPersistencePayload(validated, safeWorkspaceId))
      .select('id, workspace_id, name, code, manager_user_id, description, active, created_at, updated_at')
      .single()
    if (error && !isMissingTableError(error, 'workspace_regions')) throw error
    if (data) {
      const region = normalizeRegionRow(data, safeWorkspaceId)
      await persistRegionActivity(safeWorkspaceId, {
        eventType: BOND_ORGANISATION_ACTIVITY_EVENTS.regionCreated,
        regionId: region.id,
        actorUserId: context.userId || context.profile?.id || context.currentMembership?.user_id,
        previousValue: null,
        newValue: region,
      })
      return region
    }
  }

  const region = normalizeRegionRow({
    id: payload.id || createLocalRegionId(validated.name),
    organisationId: safeWorkspaceId,
    ...validated,
    manager_user_id: validated.managerUserId,
    active: validated.status !== 'inactive',
    createdAt: now,
    updatedAt: now,
  }, safeWorkspaceId)
  setLocalRegions(safeWorkspaceId, [...existingRegions, region])
  await persistRegionActivity(safeWorkspaceId, {
    eventType: BOND_ORGANISATION_ACTIVITY_EVENTS.regionCreated,
    regionId: region.id,
    actorUserId: context.userId || context.profile?.id || context.currentMembership?.user_id,
    previousValue: null,
    newValue: region,
  })
  return region
}

export async function updateBondRegion(regionId = '', payload = {}, context = {}, workspaceId = '', options = {}) {
  const safeWorkspaceId = normalizeText(workspaceId || context.workspaceId || context.currentWorkspace?.id)
  const safeRegionId = normalizeText(regionId)
  const existingRegions = await getAllRegionRows(safeWorkspaceId, options)
  const users = await fetchManagerUsers(safeWorkspaceId, options)
  assertCanManageRegions({ ...context, workspaceId: safeWorkspaceId }, { regions: existingRegions, consultants: users })
  const previous = existingRegions.find((region) => normalizeText(region.id) === safeRegionId)
  if (!previous) throw createValidationError('Region not found.', { regionId: 'Region could not be found.' })
  const validated = validateRegionPayload({ ...previous, ...payload }, existingRegions, { users, regionId: safeRegionId })
  const updated = normalizeRegionRow({
    ...previous,
    ...validated,
    manager_user_id: validated.managerUserId,
    active: validated.status !== 'inactive',
    updatedAt: new Date().toISOString(),
  }, safeWorkspaceId)

  if (isSupabaseConfigured && supabase && !options.forceLocal) {
    const { data, error } = await supabase
      .from('workspace_regions')
      .update(mapRegionToPersistencePayload(updated, safeWorkspaceId))
      .eq('id', safeRegionId)
      .eq('workspace_id', safeWorkspaceId)
      .select('id, workspace_id, name, code, manager_user_id, description, active, created_at, updated_at')
      .single()
    if (error && !isMissingTableError(error, 'workspace_regions')) throw error
    if (data) {
      const region = normalizeRegionRow(data, safeWorkspaceId)
      await persistRegionActivity(safeWorkspaceId, {
        eventType: BOND_ORGANISATION_ACTIVITY_EVENTS.regionUpdated,
        regionId: region.id,
        actorUserId: context.userId || context.profile?.id || context.currentMembership?.user_id,
        previousValue: previous,
        newValue: region,
      })
      return region
    }
  }

  setLocalRegions(safeWorkspaceId, existingRegions.map((region) => (normalizeText(region.id) === safeRegionId ? updated : region)))
  await persistRegionActivity(safeWorkspaceId, {
    eventType: BOND_ORGANISATION_ACTIVITY_EVENTS.regionUpdated,
    regionId: updated.id,
    actorUserId: context.userId || context.profile?.id || context.currentMembership?.user_id,
    previousValue: previous,
    newValue: updated,
  })
  return updated
}

export async function assignBondRegionManager(regionId = '', userId = '', context = {}, workspaceId = '', options = {}) {
  const safeUserId = normalizeText(userId)
  const users = await fetchManagerUsers(workspaceId || context.workspaceId || context.currentWorkspace?.id, options)
  const manager = users.find((user) => normalizeText(user.user_id || user.userId || user.id) === safeUserId)
  if (!manager) throw createValidationError('Region validation failed.', { managerUserId: 'Regional manager must be a valid user in this organisation.' })
  if (!REGION_MANAGER_ROLES.has(getUserRole(manager))) {
    throw createValidationError('Region validation failed.', { managerUserId: 'Selected user does not have a compatible region manager role.' })
  }
  const region = await updateBondRegion(regionId, { managerUserId: safeUserId }, context, workspaceId, options)
  if (!options.forceLocal) {
    await updateRegionalManagerScope(workspaceId || context.workspaceId || context.currentWorkspace?.id, safeUserId, regionId)
  }
  await persistRegionActivity(workspaceId || context.workspaceId || context.currentWorkspace?.id, {
    eventType: BOND_ORGANISATION_ACTIVITY_EVENTS.regionManagerAssigned,
    regionId,
    actorUserId: context.userId || context.profile?.id || context.currentMembership?.user_id,
    previousValue: null,
    newValue: { managerUserId: safeUserId },
  })
  return region
}

export function getBondRegionWorkspace(regionId = '', scope = {}) {
  const safeRegionId = normalizeText(regionId)
  const organisationScope = scope.organisationScope || scope.scope || {}
  if (organisationScope.scopeLevel && !canViewRegion(safeRegionId, organisationScope)) {
    throw createPermissionError()
  }
  const regions = scope.regions || []
  const region = regions.find((row) => normalizeText(row.id) === safeRegionId)
  if (!region) return null
  const managerName = getManagerName(getRegionManagerId(region), scope.consultants || [])
  const visibleScope = {
    ...scope,
    regions: [region],
    branches: (scope.branches || []).filter((branch) => normalizeText(branch.region_id || branch.regionId) === safeRegionId),
    consultants: scope.consultants || [],
    applications: (scope.applications || []).filter((row) => normalizeText(row.regionId || row.region_id) === safeRegionId),
  }
  const branchPerformance = getBranchPerformance(visibleScope)
  const row = getRegionPerformance(visibleScope, branchPerformance)[0] || {}
  const regionCapacity = getRegionCapacity(safeRegionId, {}, '', {
    regions: scope.regions || [],
    branches: scope.branches || [],
    consultants: scope.consultants || [],
    applications: scope.applications || [],
  })
  return {
    id: safeRegionId,
    region: {
      ...region,
      manager: managerName,
      managerName,
    },
    metrics: {
      branches: row.branches || 0,
      consultants: row.consultants || 0,
      activeApplications: row.activeApplications || 0,
      submittedApplications: row.submittedApplications || 0,
      pendingDocuments: row.pendingDocuments || 0,
      approvalRate: row.approvalRate || 0,
      averageTurnaround: row.averageTurnaround || 0,
    },
    branchPerformance,
    regionCapacity,
    tabs: ['Overview', 'Branches', 'Consultants', 'Applications', 'Performance', 'Settings'],
  }
}

export function getBondRegionWorkspaceRoute(regionId = '') {
  return `/bond/organisation/regions/${encodeURIComponent(normalizeText(regionId))}`
}

export async function getBondBranches(context = {}, workspaceId = '', options = {}) {
  const safeWorkspaceId = normalizeText(workspaceId || context.workspaceId || context.currentWorkspace?.id)
  const [regions, branches, users, applicationSnapshot] = await Promise.all([
    getAllRegionRows(safeWorkspaceId, options),
    getAllBranchRows(safeWorkspaceId, options),
    fetchManagerUsers(safeWorkspaceId, options),
    options.applicationSnapshot ? Promise.resolve(options.applicationSnapshot) : getBondTransactionTrackerSnapshot(context, safeWorkspaceId, { ...options, status: 'all' }),
  ])
  const applications = filterDemoBondApplications(applicationSnapshot.rows || options.applications || [], { includeDemoRows: options.includeDemoRows !== false })
  const organisationScope = resolveBondOrganisationScope({ ...context, workspaceId: safeWorkspaceId }, {
    regions,
    branches,
    consultants: users,
    applications,
  })
  const capabilities = resolveCapabilities({ ...context, workspaceId: safeWorkspaceId }, organisationScope)
  const regionById = buildLookup(regions)
  const visibleBranches = scopeUnits(branches, capabilities).map((branch) => ({
    ...branch,
    region: regionById.get(getBranchRegionId(branch))?.name || branch.region || 'Unassigned',
  }))
  const visibleScope = getVisibleOrganisationScope({
    capabilities,
    regions: scopeRegions(regions, capabilities),
    branches: visibleBranches,
    consultants: scopeUsers(users, capabilities).map((user) => ({ ...user, name: getUserName(user) })),
    applications: scopeApplicationRows(applications, capabilities),
  })
  return getBranchPerformance(visibleScope)
}

export async function createBondBranch(payload = {}, context = {}, workspaceId = '', options = {}) {
  const safeWorkspaceId = normalizeText(workspaceId || context.workspaceId || context.currentWorkspace?.id)
  const [regions, existingBranches, users] = await Promise.all([
    getAllRegionRows(safeWorkspaceId, options),
    getAllBranchRows(safeWorkspaceId, options),
    fetchManagerUsers(safeWorkspaceId, options),
  ])
  const regionId = normalizeText(payload.regionId || payload.region_id)
  assertCanCreateBranch({ ...context, workspaceId: safeWorkspaceId }, { regions, branches: existingBranches, consultants: users }, regionId)
  await assertWorkspaceEntitlementLimit({
    workspaceId: safeWorkspaceId,
    workspaceType: WORKSPACE_TYPES.bondOriginator,
    workspaceKind: getContextWorkspaceKind(context),
    entitlementKey: ENTITLEMENT_KEYS.maxBranches,
  })
  const validated = validateBranchPayload(payload, existingBranches, { regions, users })
  const now = new Date().toISOString()

  if (isSupabaseConfigured && supabase && safeWorkspaceId && !options.forceLocal) {
    const { data, error } = await supabase
      .from('workspace_units')
      .insert(mapBranchToPersistencePayload(validated, safeWorkspaceId))
      .select('id, workspace_id, region_id, parent_unit_id, unit_type, name, code, description, manager_user_id, active, created_at, updated_at')
      .single()
    if (error && !isMissingTableError(error, 'workspace_units')) throw error
    if (data) {
      const branch = normalizeBranchRow(data, safeWorkspaceId)
      await persistRegionActivity(safeWorkspaceId, {
        eventType: BOND_ORGANISATION_ACTIVITY_EVENTS.branchCreated,
        regionId: branch.regionId,
        branchId: branch.id,
        actorUserId: context.userId || context.profile?.id || context.currentMembership?.user_id,
        previousValue: null,
        newValue: branch,
      })
      return branch
    }
  }

  const branch = normalizeBranchRow({
    id: payload.id || createLocalBranchId(validated.name),
    organisationId: safeWorkspaceId,
    workspace_id: safeWorkspaceId,
    ...validated,
    region_id: validated.regionId,
    manager_user_id: validated.managerUserId,
    active: validated.status !== 'inactive',
    createdAt: now,
    updatedAt: now,
  }, safeWorkspaceId)
  setLocalBranches(safeWorkspaceId, [...existingBranches, branch])
  await persistRegionActivity(safeWorkspaceId, {
    eventType: BOND_ORGANISATION_ACTIVITY_EVENTS.branchCreated,
    regionId: branch.regionId,
    branchId: branch.id,
    actorUserId: context.userId || context.profile?.id || context.currentMembership?.user_id,
    previousValue: null,
    newValue: branch,
  })
  return branch
}

export async function updateBondBranch(branchId = '', payload = {}, context = {}, workspaceId = '', options = {}) {
  const safeWorkspaceId = normalizeText(workspaceId || context.workspaceId || context.currentWorkspace?.id)
  const safeBranchId = normalizeText(branchId)
  const [regions, existingBranches, users] = await Promise.all([
    getAllRegionRows(safeWorkspaceId, options),
    getAllBranchRows(safeWorkspaceId, options),
    fetchManagerUsers(safeWorkspaceId, options),
  ])
  const previous = existingBranches.find((branch) => normalizeText(branch.id) === safeBranchId)
  if (!previous) throw createValidationError('Branch not found.', { branchId: 'Branch could not be found.' })
  assertCanManageBranch({ ...context, workspaceId: safeWorkspaceId }, { regions, branches: existingBranches, consultants: users }, previous, payload.regionId || previous.regionId)
  const validated = validateBranchPayload({ ...previous, ...payload }, existingBranches, { regions, users, branchId: safeBranchId })
  const updated = normalizeBranchRow({
    ...previous,
    ...validated,
    region_id: validated.regionId,
    manager_user_id: validated.managerUserId,
    active: validated.status !== 'inactive',
    updatedAt: new Date().toISOString(),
  }, safeWorkspaceId)

  if (isSupabaseConfigured && supabase && !options.forceLocal) {
    const { data, error } = await supabase
      .from('workspace_units')
      .update(mapBranchToPersistencePayload(updated, safeWorkspaceId))
      .eq('id', safeBranchId)
      .eq('workspace_id', safeWorkspaceId)
      .select('id, workspace_id, region_id, parent_unit_id, unit_type, name, code, description, manager_user_id, active, created_at, updated_at')
      .single()
    if (error && !isMissingTableError(error, 'workspace_units')) throw error
    if (data) {
      const branch = normalizeBranchRow(data, safeWorkspaceId)
      await persistRegionActivity(safeWorkspaceId, {
        eventType: BOND_ORGANISATION_ACTIVITY_EVENTS.branchUpdated,
        regionId: branch.regionId,
        branchId: branch.id,
        actorUserId: context.userId || context.profile?.id || context.currentMembership?.user_id,
        previousValue: previous,
        newValue: branch,
      })
      return branch
    }
  }

  setLocalBranches(safeWorkspaceId, existingBranches.map((branch) => (normalizeText(branch.id) === safeBranchId ? updated : branch)))
  await persistRegionActivity(safeWorkspaceId, {
    eventType: BOND_ORGANISATION_ACTIVITY_EVENTS.branchUpdated,
    regionId: updated.regionId,
    branchId: updated.id,
    actorUserId: context.userId || context.profile?.id || context.currentMembership?.user_id,
    previousValue: previous,
    newValue: updated,
  })
  return updated
}

export async function assignBondBranchManager(branchId = '', userId = '', context = {}, workspaceId = '', options = {}) {
  const safeWorkspaceId = normalizeText(workspaceId || context.workspaceId || context.currentWorkspace?.id)
  const safeUserId = normalizeText(userId)
  const users = await fetchManagerUsers(safeWorkspaceId, options)
  const manager = users.find((user) => normalizeText(user.user_id || user.userId || user.id) === safeUserId)
  if (!manager) throw createValidationError('Branch validation failed.', { managerUserId: 'Branch manager must be a valid user in this organisation.' })
  if (!BRANCH_MANAGER_ROLES.has(getUserRole(manager))) {
    throw createValidationError('Branch validation failed.', { managerUserId: 'Selected user does not have a compatible branch manager role.' })
  }
  const branch = await updateBondBranch(branchId, { managerUserId: safeUserId }, context, safeWorkspaceId, options)
  if (!options.forceLocal) {
    await updateBranchManagerScope(safeWorkspaceId, safeUserId, branchId, branch.regionId)
  }
  await persistRegionActivity(safeWorkspaceId, {
    eventType: BOND_ORGANISATION_ACTIVITY_EVENTS.branchManagerAssigned,
    regionId: branch.regionId,
    branchId,
    actorUserId: context.userId || context.profile?.id || context.currentMembership?.user_id,
    previousValue: null,
    newValue: { managerUserId: safeUserId },
  })
  return branch
}

export async function moveBondBranchToRegion(branchId = '', regionId = '', context = {}, workspaceId = '', options = {}) {
  const safeWorkspaceId = normalizeText(workspaceId || context.workspaceId || context.currentWorkspace?.id)
  const [regions, existingBranches, users] = await Promise.all([
    getAllRegionRows(safeWorkspaceId, options),
    getAllBranchRows(safeWorkspaceId, options),
    fetchManagerUsers(safeWorkspaceId, options),
  ])
  const safeRegionId = normalizeText(regionId)
  const previous = existingBranches.find((branch) => normalizeText(branch.id) === normalizeText(branchId))
  if (!previous) throw createValidationError('Branch not found.', { branchId: 'Branch could not be found.' })
  assertCanMoveBranch({ ...context, workspaceId: safeWorkspaceId }, { regions, branches: existingBranches, consultants: users })
  if (!regions.some((region) => normalizeText(region.id) === safeRegionId)) {
    throw createValidationError('Branch validation failed.', { regionId: 'Selected region does not exist.' })
  }
  const branch = await updateBondBranch(branchId, { regionId: safeRegionId }, context, safeWorkspaceId, { ...options, users, regions })
  await persistRegionActivity(safeWorkspaceId, {
    eventType: BOND_ORGANISATION_ACTIVITY_EVENTS.branchMovedRegion,
    regionId: safeRegionId,
    branchId,
    actorUserId: context.userId || context.profile?.id || context.currentMembership?.user_id,
    previousValue: previous,
    newValue: branch,
  })
  return branch
}

export function getBondBranchWorkspace(branchId = '', scope = {}) {
  const safeBranchId = normalizeText(branchId)
  const organisationScope = scope.organisationScope || scope.scope || {}
  if (organisationScope.scopeLevel && !canViewBranch(safeBranchId, organisationScope)) {
    throw createBranchPermissionError()
  }
  const branch = (scope.branches || []).find((row) => normalizeText(row.id) === safeBranchId)
  if (!branch) return null
  const branchRows = getBranchApplicationRows(branch, scope.applications || [])
  const performance = getBranchPerformance({ ...scope, branches: [branch], applications: branchRows })[0] || {}
  const region = (scope.regions || []).find((row) => normalizeText(row.id) === getBranchRegionId(branch))
  const activityEvents = (scope.activityEvents || []).filter((event) => normalizeText(event.branchId || event.branch_id) === safeBranchId)
  const branchCapacity = getBranchCapacity(safeBranchId, {}, '', {
    regions: scope.regions || [],
    branches: scope.branches || [],
    consultants: scope.consultants || [],
    applications: scope.applications || [],
  })
  return {
    id: safeBranchId,
    branch: {
      ...branch,
      region: region?.name || branch.region || 'Unassigned',
      manager: performance.manager || getManagerName(getBranchManagerId(branch), scope.consultants || []),
    },
    metrics: {
      consultants: performance.consultants || 0,
      activeApplications: performance.activeApplications || 0,
      submittedApplications: performance.submittedApplications || 0,
      pendingDocuments: performance.pendingDocuments || 0,
      approvalRate: performance.approvalRate || 0,
      averageTurnaround: performance.averageTurnaround || 0,
      unassignedApplications: performance.unassignedApplications || 0,
      applicationsWaitingForDocuments: performance.pendingDocuments || 0,
      applicationsWithoutConsultant: performance.unassignedApplications || 0,
      applicationsSubmittedThisMonth: branchRows.filter((row) => {
        const date = new Date(row.lastActivityAt || row.createdAt || '')
        const now = new Date()
        return isApplicationSubmitted(row) && !Number.isNaN(date.getTime()) && date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth()
      }).length,
      branchHealth: performance.healthStatus || 'Healthy',
    },
    branchCapacity,
    recentActivity: getRecentOrganisationActivity({ ...scope, applications: branchRows, activityEvents }).slice(0, 6),
    tabs: ['Overview', 'Consultants', 'Applications', 'Performance', 'Settings'],
  }
}

export function getBondBranchWorkspaceRoute(branchId = '') {
  return `/bond/organisation/branches/${encodeURIComponent(normalizeText(branchId))}`
}

function getConsultantCapacity(activeApplications = 0) {
  const count = Number(activeApplications || 0)
  if (count <= 10) return 'Light'
  if (count <= 25) return 'Normal'
  if (count <= 40) return 'Busy'
  return 'Overloaded'
}

function getConsultantCapacityPercent(activeApplications = 0) {
  return Math.min(100, Math.round((Number(activeApplications || 0) / 40) * 100))
}

function getConsultantWorkloadBreakdown(rows = []) {
  const labels = [
    { key: 'newApplications', label: 'New Applications', match: (signal) => signal.includes('new') || signal.includes('intake') || signal.includes('pre') },
    { key: 'documentsReceived', label: 'Documents Received', match: (signal) => signal.includes('document') || signal.includes('docs') },
    { key: 'applicationsSubmitted', label: 'Applications Submitted', match: (signal) => signal.includes('submit') },
    { key: 'feedbackReceived', label: 'Feedback Received', match: (signal) => signal.includes('feedback') || signal.includes('bank') },
    { key: 'quoteApproved', label: 'Quote Approved', match: (signal) => signal.includes('quote') || signal.includes('approved') || signal.includes('grant') },
    { key: 'instructionSent', label: 'Instruction Sent', match: (signal) => signal.includes('instruction') || signal.includes('instruct') },
  ]
  return labels.map((item) => ({
    key: item.key,
    label: item.label,
    value: rows.filter((row) => item.match(normalizeLower(`${row.financeStageKey || ''} ${row.financeStageLabel || ''} ${row.status || ''} ${row.nextAction || ''}`))).length,
  }))
}

function getConsultantPerformanceMetrics(rows = []) {
  const approved = rows.filter(isApplicationApproved).length
  const declined = rows.filter((row) => normalizeLower(`${row.status || ''} ${row.financeStageKey || ''} ${row.financeStageLabel || ''}`).includes('declin')).length
  const submitted = rows.filter(isApplicationSubmitted).length
  const pendingDocs = rows.filter(isPendingDocs).length
  return {
    activeApplications: rows.length,
    submittedApplications: submitted,
    approvalRate: percent(approved, rows.length),
    declineRate: percent(declined, rows.length),
    averageTurnaround: averageNumber(rows.map(getApplicationLeadDays)),
    pendingDocuments: pendingDocs,
    averageBankResponseTime: averageNumber(rows.filter((row) => normalizeLower(row.financeStageKey || row.financeStageLabel).includes('bank')).map(getApplicationLeadDays)),
    quoteAcceptanceRate: percent(approved, submitted || rows.length),
    lastActivity: rows[0]?.lastActivityLabel || 'No recent activity',
  }
}

async function getConsultantServiceData(context = {}, workspaceId = '', options = {}) {
  const safeWorkspaceId = normalizeText(workspaceId || context.workspaceId || context.currentWorkspace?.id)
  const [regions, branches, consultants, applicationSnapshot] = await Promise.all([
    getAllRegionRows(safeWorkspaceId, options),
    getAllBranchRows(safeWorkspaceId, options),
    getAllConsultantRows(safeWorkspaceId, options),
    options.applicationSnapshot
      ? Promise.resolve(options.applicationSnapshot)
      : options.forceLocal
        ? Promise.resolve({ rows: options.applications || [] })
        : getBondTransactionTrackerSnapshot(context, safeWorkspaceId, { ...options, status: 'all' }),
  ])
  const rawRows = filterDemoBondApplications(applicationSnapshot.rows || options.applications || [], { includeDemoRows: options.includeDemoRows !== false })
  const applications = enrichApplicationRows(applyLocalApplicationOwnership(safeWorkspaceId, rawRows), { regions, branches })
  return { safeWorkspaceId, regions, branches, consultants, applications }
}

export async function getBondConsultants(context = {}, workspaceId = '', options = {}) {
  const { safeWorkspaceId, regions, branches, consultants, applications } = await getConsultantServiceData(context, workspaceId, options)
  const organisationScope = resolveBondOrganisationScope({ ...context, workspaceId: safeWorkspaceId }, { regions, branches, consultants, applications })
  const capabilities = resolveCapabilities({ ...context, workspaceId: safeWorkspaceId }, organisationScope)
  const regionById = buildLookup(regions)
  const visibleBranches = scopeUnits(branches, capabilities).map((branch) => ({
    ...branch,
    region: regionById.get(getBranchRegionId(branch))?.name || branch.region || 'Unassigned',
  }))
  const visibleScope = getVisibleOrganisationScope({
    capabilities,
    regions: scopeRegions(regions, capabilities),
    branches: visibleBranches,
    consultants: scopeUsers(consultants, capabilities).map((user) => normalizeConsultantRow({ ...user, name: getUserName(user) }, safeWorkspaceId)),
    applications: scopeApplicationRows(applications, capabilities),
  })
  return getConsultantPerformance(visibleScope)
}

export async function createBondConsultant(payload = {}, context = {}, workspaceId = '', options = {}) {
  const { safeWorkspaceId, regions, branches, consultants } = await getConsultantServiceData(context, workspaceId, options)
  const validated = validateConsultantPayload(payload, consultants, { branches })
  assertCanManageConsultant({ ...context, workspaceId: safeWorkspaceId }, { regions, branches, consultants }, null, validated.branchId)
  const existingSeat = consultants.find((consultant) =>
    normalizeLower(consultant.email) === normalizeLower(validated.email) &&
    ['active', 'invited', 'pending'].includes(normalizeLower(consultant.status || (consultant.active === false ? 'inactive' : 'active'))),
  )
  if (!existingSeat) {
    await assertWorkspaceEntitlementLimit({
      workspaceId: safeWorkspaceId,
      workspaceType: WORKSPACE_TYPES.bondOriginator,
      workspaceKind: getContextWorkspaceKind(context),
      entitlementKey: ENTITLEMENT_KEYS.maxUsers,
    })
  }
  const now = new Date().toISOString()
  const consultant = normalizeConsultantRow({
    id: payload.id || payload.userId || payload.user_id || createLocalConsultantId(validated.email, validated.name),
    organisationId: safeWorkspaceId,
    user_id: payload.userId || payload.user_id || payload.id || '',
    ...validated,
    workspace_unit_id: validated.branchId,
    region_id: validated.regionId,
    active: validated.status !== 'inactive',
    createdAt: now,
    updatedAt: now,
  }, safeWorkspaceId)

  if (isSupabaseConfigured && supabase && safeWorkspaceId && !options.forceLocal && normalizeText(consultant.userId)) {
    const { data, error } = await supabase
      .from('organisation_users')
      .upsert(mapConsultantToPersistencePayload(consultant, safeWorkspaceId), { onConflict: 'organisation_id,email' })
      .select('id, organisation_id, user_id, first_name, last_name, email, role, workspace_role, organisation_role, status, scope_level, region_id, workspace_unit_id, branch_id, primary_branch_id, created_at, updated_at')
      .single()
    if (error && !isMissingTableError(error, 'organisation_users')) throw error
    if (data) {
      const persisted = normalizeConsultantRow(data, safeWorkspaceId)
      await persistRegionActivity(safeWorkspaceId, {
        eventType: BOND_ORGANISATION_ACTIVITY_EVENTS.consultantCreated,
        regionId: persisted.regionId,
        branchId: persisted.branchId,
        consultantId: persisted.id,
        actorUserId: context.userId || context.profile?.id || context.currentMembership?.user_id,
        previousValue: null,
        newValue: persisted,
      })
      return persisted
    }
  }

  const existingWithoutDuplicate = consultants.filter((row) => normalizeText(row.id) !== consultant.id && normalizeLower(row.email) !== consultant.email)
  setLocalConsultants(safeWorkspaceId, [...existingWithoutDuplicate, consultant])
  await persistRegionActivity(safeWorkspaceId, {
    eventType: BOND_ORGANISATION_ACTIVITY_EVENTS.consultantCreated,
    regionId: consultant.regionId,
    branchId: consultant.branchId,
    consultantId: consultant.id,
    actorUserId: context.userId || context.profile?.id || context.currentMembership?.user_id,
    previousValue: null,
    newValue: consultant,
  })
  return consultant
}

export async function updateBondConsultant(consultantId = '', payload = {}, context = {}, workspaceId = '', options = {}) {
  const { safeWorkspaceId, regions, branches, consultants } = await getConsultantServiceData(context, workspaceId, options)
  const safeConsultantId = normalizeText(consultantId)
  const previous = consultants.find((consultant) => normalizeText(consultant.id) === safeConsultantId || getUserId(consultant) === safeConsultantId)
  if (!previous) throw createValidationError('Consultant not found.', { consultantId: 'Consultant could not be found.' })
  const validated = validateConsultantPayload({ ...previous, ...payload }, consultants, { branches, consultantId: safeConsultantId })
  assertCanManageConsultant({ ...context, workspaceId: safeWorkspaceId }, { regions, branches, consultants }, previous, validated.branchId)
  const updated = normalizeConsultantRow({
    ...previous,
    ...validated,
    workspace_unit_id: validated.branchId,
    branch_id: validated.branchId,
    region_id: validated.regionId,
    active: validated.status !== 'inactive',
    updatedAt: new Date().toISOString(),
  }, safeWorkspaceId)

  if (isSupabaseConfigured && supabase && !options.forceLocal && normalizeText(updated.userId)) {
    const { data, error } = await supabase
      .from('organisation_users')
      .update(mapConsultantToPersistencePayload(updated, safeWorkspaceId))
      .eq('organisation_id', safeWorkspaceId)
      .eq('user_id', normalizeText(updated.userId))
      .select('id, organisation_id, user_id, first_name, last_name, email, role, workspace_role, organisation_role, status, scope_level, region_id, workspace_unit_id, branch_id, primary_branch_id, created_at, updated_at')
      .maybeSingle()
    if (error && !isMissingTableError(error, 'organisation_users')) throw error
    if (data) {
      const persisted = normalizeConsultantRow(data, safeWorkspaceId)
      await persistRegionActivity(safeWorkspaceId, {
        eventType: BOND_ORGANISATION_ACTIVITY_EVENTS.consultantUpdated,
        regionId: persisted.regionId,
        branchId: persisted.branchId,
        consultantId: persisted.id,
        actorUserId: context.userId || context.profile?.id || context.currentMembership?.user_id,
        previousValue: previous,
        newValue: persisted,
      })
      return persisted
    }
  }

  setLocalConsultants(safeWorkspaceId, consultants.map((row) => (normalizeText(row.id) === safeConsultantId || getUserId(row) === safeConsultantId ? updated : row)))
  await persistRegionActivity(safeWorkspaceId, {
    eventType: BOND_ORGANISATION_ACTIVITY_EVENTS.consultantUpdated,
    regionId: updated.regionId,
    branchId: updated.branchId,
    consultantId: updated.id,
    actorUserId: context.userId || context.profile?.id || context.currentMembership?.user_id,
    previousValue: previous,
    newValue: updated,
  })
  return updated
}

export async function assignConsultantToBranch(consultantId = '', branchId = '', context = {}, workspaceId = '', options = {}) {
  const { safeWorkspaceId, regions, branches, consultants } = await getConsultantServiceData(context, workspaceId, options)
  const safeBranchId = normalizeText(branchId)
  const branch = branches.find((row) => normalizeText(row.id) === safeBranchId)
  if (!branch) throw createValidationError('Consultant validation failed.', { branchId: 'Selected branch does not exist.' })
  const previous = consultants.find((consultant) => normalizeText(consultant.id) === normalizeText(consultantId) || getUserId(consultant) === normalizeText(consultantId))
  if (!previous) throw createValidationError('Consultant not found.', { consultantId: 'Consultant could not be found.' })
  assertCanManageConsultant({ ...context, workspaceId: safeWorkspaceId }, { regions, branches, consultants }, previous, safeBranchId)
  const updated = await updateBondConsultant(consultantId, { branchId: safeBranchId }, context, safeWorkspaceId, { ...options, regions, branches, consultants })
  if (!options.forceLocal) {
    await updateConsultantScope(safeWorkspaceId, getUserId(updated), safeBranchId, getBranchRegionId(branch), updated.role)
  }
  await persistRegionActivity(safeWorkspaceId, {
    eventType: BOND_ORGANISATION_ACTIVITY_EVENTS.consultantAssignedBranch,
    regionId: getBranchRegionId(branch),
    branchId: safeBranchId,
    consultantId: updated.id,
    actorUserId: context.userId || context.profile?.id || context.currentMembership?.user_id,
    previousValue: previous,
    newValue: updated,
  })
  return updated
}

export async function reassignApplications(fromId = '', toId = '', applicationIds = [], context = {}, workspaceId = '', options = {}) {
  const { safeWorkspaceId, regions, branches, consultants, applications } = await getConsultantServiceData(context, workspaceId, options)
  const fromConsultant = consultants.find((consultant) => normalizeText(consultant.id) === normalizeText(fromId) || getUserId(consultant) === normalizeText(fromId))
  const toConsultant = consultants.find((consultant) => normalizeText(consultant.id) === normalizeText(toId) || getUserId(consultant) === normalizeText(toId))
  if (!fromConsultant) throw createValidationError('Consultant not found.', { fromId: 'Source consultant could not be found.' })
  if (!toConsultant) throw createValidationError('Consultant not found.', { toId: 'Target consultant could not be found.' })
  assertCanManageConsultant({ ...context, workspaceId: safeWorkspaceId }, { regions, branches, consultants }, fromConsultant)
  assertCanManageConsultant({ ...context, workspaceId: safeWorkspaceId }, { regions, branches, consultants }, toConsultant)
  const selectedIds = new Set((applicationIds || []).map(normalizeText).filter(Boolean))
  const fromRows = getConsultantApplicationRows(fromConsultant, applications)
  const selectedRows = selectedIds.size ? fromRows.filter((row) => selectedIds.has(getApplicationKey(row))) : fromRows
  const toBranch = branches.find((branch) => normalizeText(branch.id) === getConsultantBranchId(toConsultant))
  const patch = {
    assignedConsultantId: getUserId(toConsultant),
    assigned_consultant_id: getUserId(toConsultant),
    assignedUserId: getUserId(toConsultant),
    assigned_user_id: getUserId(toConsultant),
    assignedUserEmail: toConsultant.email,
    assigned_user_email: toConsultant.email,
    consultant: toConsultant.name,
    assignedBranchId: getConsultantBranchId(toConsultant),
    assigned_branch_id: getConsultantBranchId(toConsultant),
    branchId: getConsultantBranchId(toConsultant),
    workspaceUnitId: getConsultantBranchId(toConsultant),
    workspace_unit_id: getConsultantBranchId(toConsultant),
    branch: toBranch?.name || toConsultant.branch || 'Unassigned',
    assignedRegionId: getConsultantRegionId(toConsultant) || getBranchRegionId(toBranch),
    assigned_region_id: getConsultantRegionId(toConsultant) || getBranchRegionId(toBranch),
    regionId: getConsultantRegionId(toConsultant) || getBranchRegionId(toBranch),
  }
  selectedRows.forEach((row) => setLocalApplicationOwnership(safeWorkspaceId, getApplicationKey(row), patch))
  await persistRegionActivity(safeWorkspaceId, {
    eventType: BOND_ORGANISATION_ACTIVITY_EVENTS.applicationReassigned,
    regionId: patch.regionId,
    branchId: patch.branchId,
    consultantId: getUserId(toConsultant),
    applicationIds: selectedRows.map(getApplicationKey),
    actorUserId: context.userId || context.profile?.id || context.currentMembership?.user_id,
    previousValue: { id: getUserId(fromConsultant), name: fromConsultant.name },
    newValue: { id: getUserId(toConsultant), name: toConsultant.name, applicationCount: selectedRows.length },
  })
  return selectedRows.map((row) => ({ ...row, ...patch }))
}

export async function deactivateConsultant(consultantId = '', context = {}, workspaceId = '', options = {}) {
  const { safeWorkspaceId, regions, branches, consultants, applications } = await getConsultantServiceData(context, workspaceId, options)
  const consultant = consultants.find((row) => normalizeText(row.id) === normalizeText(consultantId) || getUserId(row) === normalizeText(consultantId))
  if (!consultant) throw createValidationError('Consultant not found.', { consultantId: 'Consultant could not be found.' })
  assertCanManageConsultant({ ...context, workspaceId: safeWorkspaceId }, { regions, branches, consultants }, consultant)
  const activeRows = getConsultantApplicationRows(consultant, applications)
  if (activeRows.length) {
    throw createValidationError(`This consultant owns ${activeRows.length} active applications. Reassign before deactivation.`, {
      activeApplications: 'Reassign active applications before deactivation.',
    })
  }
  const updated = await updateBondConsultant(consultantId, { status: 'inactive' }, context, safeWorkspaceId, { ...options, regions, branches, consultants })
  await persistRegionActivity(safeWorkspaceId, {
    eventType: BOND_ORGANISATION_ACTIVITY_EVENTS.consultantDeactivated,
    regionId: updated.regionId,
    branchId: updated.branchId,
    consultantId: updated.id,
    actorUserId: context.userId || context.profile?.id || context.currentMembership?.user_id,
    previousValue: consultant,
    newValue: updated,
  })
  return updated
}

export function getBondConsultantWorkspace(consultantId = '', scope = {}) {
  const safeConsultantId = normalizeText(consultantId)
  const consultant = (scope.consultants || []).find((row) => normalizeText(row.id) === safeConsultantId || getUserId(row) === safeConsultantId)
  if (!consultant) return null
  const organisationScope = scope.organisationScope || scope.scope || {}
  if (organisationScope.scopeLevel && !canViewConsultant(consultant, organisationScope)) {
    throw createConsultantPermissionError()
  }
  const branch = (scope.branches || []).find((row) => normalizeText(row.id) === getConsultantBranchId(consultant))
  const region = (scope.regions || []).find((row) => normalizeText(row.id) === (getConsultantRegionId(consultant) || getBranchRegionId(branch)))
  const applicationRows = getConsultantApplicationRows(consultant, scope.applications || [])
  const metrics = getConsultantPerformanceMetrics(applicationRows)
  const activityEvents = (scope.activityEvents || []).filter((event) => normalizeText(event.consultantId || event.consultant_id) === safeConsultantId || normalizeText(event.consultantId || event.consultant_id) === getUserId(consultant))
  return {
    id: safeConsultantId,
    consultant: {
      ...consultant,
      branch: branch?.name || consultant.branch || 'Unassigned',
      region: region?.name || consultant.region || 'Unassigned',
    },
    metrics: {
      ...metrics,
      capacityStatus: getConsultantCapacity(metrics.activeApplications),
    },
    workloadBreakdown: getConsultantWorkloadBreakdown(applicationRows),
    applications: applicationRows,
    recentActivity: getRecentOrganisationActivity({ ...scope, applications: applicationRows, activityEvents }).slice(0, 6),
    tabs: ['Overview', 'Applications', 'Activity', 'Performance', 'Settings'],
  }
}

export function getBondConsultantWorkspaceRoute(consultantId = '') {
  return `/bond/organisation/consultants/${encodeURIComponent(normalizeText(consultantId))}`
}

export function buildBondOrganisationSnapshot({
  context = {},
  workspaceId = '',
  settingsContext = {},
  hierarchy = {},
  users = [],
  applicationSnapshot = {},
  options = {},
} = {}) {
  const safeWorkspaceId = normalizeText(workspaceId)
  const includeDemoRows = options.includeDemoRows !== false

  const allRegions = (options.regions || hierarchy.regions || []).map((region) => normalizeRegionRow(region, safeWorkspaceId))
  const allOrganisationUsers = (options.organisationUsers || users || [])
    .filter(isActiveRecord)
    .map((user) => normalizeOrganisationUserRow(user, safeWorkspaceId))
  const allConsultants = (options.consultants || users || []).map((user) => normalizeConsultantRow(user, safeWorkspaceId))
  const hierarchyUnits = hierarchy.units || []
  const sourceBranches = (options.branches || hierarchyUnits.filter((unit) => getUnitType(unit) === WORKSPACE_UNIT_TYPES.branch))
    .map((branch) => normalizeBranchRow(branch, safeWorkspaceId))
  const branchIds = new Set(sourceBranches.map((branch) => normalizeText(branch.id)))
  const allUnits = [
    ...sourceBranches,
    ...hierarchyUnits
      .filter((unit) => getUnitType(unit) !== WORKSPACE_UNIT_TYPES.branch && !branchIds.has(normalizeText(unit.id)))
      .filter(isActiveRecord),
  ]
  const allBranches = allUnits.filter((unit) => getUnitType(unit) === WORKSPACE_UNIT_TYPES.branch)
  const allTeams = allUnits.filter((unit) => getUnitType(unit) === WORKSPACE_UNIT_TYPES.team || !getUnitType(unit))

  const explicitStructureType = resolveStructureTypeFromSettings(settingsContext.organisationSettings)
  const structureType = inferStructureType({
    explicitType: explicitStructureType,
    regions: allRegions,
    branches: allBranches,
    teams: allTeams,
    users: allConsultants,
  })
  const filteredApplicationRows = applyLocalApplicationOwnership(safeWorkspaceId, filterDemoBondApplications(applicationSnapshot.rows || [], {
    includeDemoRows,
  }))
  const enrichedApplicationRows = enrichApplicationRows(filteredApplicationRows, {
    regions: allRegions,
    branches: allBranches,
    teams: allTeams,
  })
  const organisationScope = resolveBondOrganisationScope(
    { ...context, workspaceId: safeWorkspaceId },
    {
      regions: allRegions,
      branches: allBranches,
      consultants: allConsultants,
      applications: enrichedApplicationRows,
    },
  )
  logBondOrganisationScope(organisationScope, context)
  const capabilities = resolveCapabilities({ ...context, workspaceId: safeWorkspaceId }, organisationScope)
  const scopedRegions = scopeRegions(allRegions, capabilities)
  const scopedUnits = scopeUnits(allUnits, capabilities)
  const scopedBranches = scopedUnits.filter((unit) => getUnitType(unit) === WORKSPACE_UNIT_TYPES.branch)
  const scopedTeams = scopedUnits.filter((unit) => getUnitType(unit) === WORKSPACE_UNIT_TYPES.team || !getUnitType(unit))
  const scopedUsers = scopeUsers(allConsultants, capabilities).map((user) => ({
    ...user,
    name: getUserName(user),
    workspaceRole: normalizeText(user.workspace_role || user.workspaceRole || user.organisation_role || user.organisationRole || user.role),
    regionId: getUserRegionId(user),
    workspaceUnitId: getUserUnitId(user),
  }))
  const scopedOrganisationUsers = scopeUsers(allOrganisationUsers, capabilities)
  let scopedApplications = scopeApplicationRows(enrichedApplicationRows, capabilities)
  const regionById = buildLookup(allRegions)
  const usedDerivedBranches = !scopedBranches.length && scopedApplications.length && capabilities.canViewBranches
  let scopedBranchesWithRegions = scopedBranches.map((branch) => ({
    ...branch,
    region: normalizeText(branch.region || regionById.get(normalizeText(branch.region_id || branch.regionId))?.name) || 'Unassigned',
  }))
  if (usedDerivedBranches) {
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
  const usedDerivedRegions = !scopedRegions.length && capabilities.canViewRegions
  let visibleRegions = scopedRegions
  if (usedDerivedRegions) {
    visibleRegions = buildDerivedRegionsFromScope(scopedBranchesWithRegions, scopedApplications)
  }
  const usedDerivedConsultants = !scopedUsers.length && scopedApplications.length && capabilities.canViewConsultants
  let visibleConsultants = scopedUsers
  if (usedDerivedConsultants) {
    visibleConsultants = buildDerivedConsultantsFromApplications(scopedApplications, scopedBranchesWithRegions)
  }
  const hasMultipleUsers = scopedUsers.length > 1 || allConsultants.length > 1
  const tabs = buildTabs({ capabilities })
  const partnerActivityEvents = getBondPartnerActivityEvents(context, safeWorkspaceId, options)
  const combinedActivityEvents = [
    ...(options.activityEvents || []),
    ...partnerActivityEvents,
  ]
  const visibleScope = getVisibleOrganisationScope({
    capabilities,
    regions: visibleRegions,
    branches: scopedBranchesWithRegions,
    consultants: visibleConsultants,
    applications: scopedApplications,
    activityEvents: combinedActivityEvents,
  })
  const branchPerformance = getBranchPerformance(visibleScope)
  const regionPerformance = getRegionPerformance(visibleScope, branchPerformance)
  const consultantPerformance = getConsultantPerformance(visibleScope)
  const hierarchyTree = getHierarchyTree(visibleScope)
  const operationalHealth = getOperationalHealth(visibleScope, branchPerformance)
  const recentActivity = getRecentOrganisationActivity(visibleScope)
  const regionWorkspaces = Object.fromEntries(
    visibleRegions.map((region) => [
      normalizeText(region.id),
      getBondRegionWorkspace(normalizeText(region.id), {
        ...visibleScope,
        organisationScope,
      }),
    ]),
  )
  const branchWorkspaces = Object.fromEntries(
    scopedBranchesWithRegions.map((branch) => [
      normalizeText(branch.id),
      getBondBranchWorkspace(normalizeText(branch.id), {
        ...visibleScope,
        organisationScope,
      }),
    ]),
  )
  const consultantWorkspaces = Object.fromEntries(
    visibleConsultants.map((consultant) => [
      normalizeText(consultant.id || consultant.user_id || consultant.userId),
      getBondConsultantWorkspace(normalizeText(consultant.id || consultant.user_id || consultant.userId), {
        ...visibleScope,
        organisationScope,
      }),
    ]),
  )
  const partners = capabilities.canViewPartners ? getBondPartners(context, safeWorkspaceId, {
    ...options,
    organisationScope,
    regions: visibleRegions,
    branches: scopedBranchesWithRegions,
    consultants: visibleConsultants,
    applications: scopedApplications,
    routingRules: options.routingRules || [],
  }) : []
  const partnerWorkspaces = Object.fromEntries(
    partners.map((partner) => [
      normalizeText(partner.id),
      getBondPartnerWorkspace(normalizeText(partner.id), context, safeWorkspaceId, {
        ...options,
        organisationScope,
        regions: visibleRegions,
        branches: scopedBranchesWithRegions,
        consultants: visibleConsultants,
        applications: scopedApplications,
        routingRules: options.routingRules || [],
      }),
    ]),
  )
  const overview = getOrganisationOverview({
    scope: visibleScope,
    branchPerformance,
    regionPerformance,
    regionWorkspaces,
    branchWorkspaces,
    consultantWorkspaces,
    consultantPerformance,
    recentActivity,
  })
  const kpis = getOrganisationKpis(visibleScope)
  const routingDashboard = getRoutingRulesDashboard(context, safeWorkspaceId, {
    ...options,
    regions: visibleRegions,
    branches: scopedBranchesWithRegions,
    consultants: visibleConsultants,
    partners,
    applications: scopedApplications,
    routingRules: options.routingRules || [],
  })

  return {
    workspaceId: safeWorkspaceId,
    organisation: settingsContext.organisation || context.currentWorkspace || context.workspace || null,
    structureType,
    structureLabel: getStructureLabel(structureType),
    isIndependentWorkspace: structureType === BOND_ORGANISATION_STRUCTURE_TYPES.independent && !hasMultipleUsers,
    organisationScope,
    capabilities,
    tabs,
    regions: visibleRegions,
    branches: scopedBranchesWithRegions,
    teams: scopedTeams,
    consultants: visibleConsultants,
    eligibleRegionManagers: buildEligibleManagerRows(scopedOrganisationUsers, REGION_MANAGER_ROLES),
    eligibleBranchManagers: buildEligibleManagerRows(scopedOrganisationUsers, BRANCH_MANAGER_ROLES),
    applications: scopedApplications,
    visibleScope,
    kpis,
    regionPerformance,
    hierarchyTree,
    overview,
    branchPerformance,
    consultantWorkspaces,
    partnerWorkspaces,
    consultantPerformance,
    partnerPerformance: partners,
    operationalHealth,
    recentActivity,
    routingDashboard,
    applicationSnapshot: {
      ...applicationSnapshot,
      rows: scopedApplications,
    },
    counts: {
      regions: visibleRegions.length,
      branches: scopedBranchesWithRegions.length,
      teams: scopedTeams.length,
      consultants: visibleConsultants.length,
      partners: partners.length,
      applications: scopedApplications.length,
    },
    derivedSources: {
      regions: usedDerivedRegions && visibleRegions.length > 0,
      branches: usedDerivedBranches && scopedBranchesWithRegions.length > 0,
      consultants: usedDerivedConsultants && visibleConsultants.length > 0,
    },
    showRegionColumn: allRegions.length > 0 || visibleRegions.length > 0,
    showBranchColumn: allBranches.length > 0 || scopedBranchesWithRegions.length > 0,
  }
}

export async function getBondOrganisationSnapshot(context = {}, workspaceId = '', options = {}) {
  const safeWorkspaceId = normalizeText(workspaceId)
  const [settingsContext, hierarchy, users, consultantRows, applicationSnapshot, regions, branches, partners, activityEvents, routingRules] = await Promise.all([
    fetchSettings(),
    fetchHierarchy(safeWorkspaceId),
    fetchOrganisationUsers(safeWorkspaceId),
    getAllConsultantRows(safeWorkspaceId, options),
    getBondTransactionTrackerSnapshot(context, safeWorkspaceId, {
      ...options,
      status: 'all',
      developmentId: options.developmentId || 'all',
    }),
    getAllRegionRows(safeWorkspaceId, options),
    getAllBranchRows(safeWorkspaceId, options),
    getAllBondPartnerRows(safeWorkspaceId, options),
    fetchActivityRows(safeWorkspaceId),
    getRoutingRules(context, safeWorkspaceId, options),
  ])

  return buildBondOrganisationSnapshot({
    context,
    workspaceId: safeWorkspaceId,
    settingsContext,
    hierarchy,
    users,
    applicationSnapshot,
    options: {
      ...options,
      regions,
      branches,
      partners,
      organisationUsers: users,
      consultants: consultantRows.length ? consultantRows : options.consultants,
      activityEvents: options.activityEvents || activityEvents,
      routingRules,
    },
  })
}

export function getBondOrganisationRouteForTab(tabKey = 'overview', options = {}) {
  if (tabKey === 'applications') return '/bond/organisation/applications'
  if (tabKey === 'consultants' && normalizeText(options.consultantId)) return getBondConsultantWorkspaceRoute(options.consultantId)
  if (tabKey === 'partners' && normalizeText(options.partnerId)) return getBondPartnerWorkspaceRoute(options.partnerId)

  const params = new URLSearchParams()
  params.set('view', normalizeText(tabKey || 'overview'))
  if (normalizeText(options.regionId)) params.set('regionId', normalizeText(options.regionId))
  if (normalizeText(options.branchId)) params.set('branchId', normalizeText(options.branchId))
  if (normalizeText(options.consultantId)) params.set('consultantId', normalizeText(options.consultantId))
  if (normalizeText(options.partnerId)) params.set('partnerId', normalizeText(options.partnerId))

  return `/bond/organisation?${params.toString()}`
}

export const __bondOrganisationServiceTestUtils = Object.freeze({
  clearRegionStores() {
    LOCAL_REGION_STORE.clear()
    LOCAL_BRANCH_STORE.clear()
    LOCAL_CONSULTANT_STORE.clear()
    LOCAL_ACTIVITY_STORE.clear()
    LOCAL_APPLICATION_OWNERSHIP_STORE.clear()
  },
  getActivityRows(workspaceId = '') {
    return getLocalActivity(workspaceId)
  },
  getRegionRows(workspaceId = '') {
    return getLocalRegions(workspaceId)
  },
  getBranchRows(workspaceId = '') {
    return getLocalBranches(workspaceId)
  },
  getConsultantRows(workspaceId = '') {
    return getLocalConsultants(workspaceId)
  },
  getApplicationOwnershipRows(workspaceId = '') {
    return [...getLocalApplicationOwnership(workspaceId).entries()]
  },
})
