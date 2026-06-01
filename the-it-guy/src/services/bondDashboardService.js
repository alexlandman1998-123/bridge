import { resolvePermissionContext } from '../auth/permissions/permissionResolver'
import { ORG_ROLES, normalizeOrgRole } from '../constants/orgRoles'
import { BOND_SCOPE_LEVELS, normalizeScopeLevel } from '../constants/workspaceUnits'
import {
  WORKSPACE_KINDS,
  inferWorkspaceKindFromWorkspaceType,
  normalizeWorkspaceKind,
} from '../constants/workspaceTypes'
import { resolveEffectiveBondAssignment } from './bondAssignmentService'
import { canViewFinanceWorkflow } from './bondFinanceWorkflowOwnershipService'
import { resolveBondOperationalQueues } from './bondOperationalQueueService'
import {
  getAccessibleBondRegions,
  getAccessibleBondUnits,
  getUserBondScope,
  getWorkspaceHierarchy,
  isAssignedOnlyBondUser,
  isBranchBondManager,
  isRegionalBondManager,
  isWorkspaceHqUser,
} from './bondWorkspaceHierarchyService'

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeBool(value) {
  return Boolean(value)
}

function normalizeWorkspaceId(transaction = {}) {
  return normalizeText(
    transaction.assigned_organisation_id ||
      transaction.assignedOrganisationId ||
      transaction.bond_workspace_id ||
      transaction.organisation_id ||
      transaction.workspace_id ||
      transaction.workspaceId,
  )
}

function normalizeRegionId(transaction = {}) {
  return normalizeText(transaction.assigned_region_id || transaction.assignedRegionId || transaction.bond_region_id || transaction.region_id || transaction.regionId)
}

function normalizeUnitId(transaction = {}) {
  return normalizeText(
    transaction.assigned_team_id ||
      transaction.assignedTeamId ||
      transaction.assigned_branch_id ||
      transaction.assignedBranchId ||
      transaction.assigned_workspace_unit_id ||
      transaction.assignedWorkspaceUnitId ||
      transaction.bond_workspace_unit_id ||
      transaction.workspace_unit_id ||
      transaction.workspaceUnitId ||
      transaction.branch_id ||
      transaction.branchId ||
      transaction.team_id ||
      transaction.teamId,
  )
}

function getWorkspaceKind(user = {}, resolved = {}) {
  const fromWorkspace = normalizeWorkspaceKind(
    user.workspaceKind ||
      user.workspace_kind ||
      user.currentWorkspace?.workspace_kind ||
      user.currentWorkspace?.workspaceKind ||
      resolved.workspace?.workspace_kind ||
      resolved.workspace?.workspaceKind,
  )
  if (fromWorkspace) return fromWorkspace
  return normalizeWorkspaceKind(
    inferWorkspaceKindFromWorkspaceType(resolved.workspaceType),
    WORKSPACE_KINDS.bondCompany,
  )
}

function getScopeFromMembership(scope = null, resolved = {}) {
  if (scope?.scopeLevel) {
    return normalizeScopeLevel(scope.scopeLevel, BOND_SCOPE_LEVELS.assigned)
  }
  return normalizeScopeLevel(
    resolved.scopeLevel || resolved.scopeLevelRaw,
    BOND_SCOPE_LEVELS.assigned,
  )
}

function getDashboardMode({ workspaceKind = '', workspaceRole = '' } = {}) {
  if (workspaceKind === WORKSPACE_KINDS.personalOriginator) return 'independent_originator'
  if ([ORG_ROLES.owner, ORG_ROLES.director].includes(workspaceRole)) return 'owner_director'
  if (workspaceRole === ORG_ROLES.hqManager) return 'hq_manager'
  if (workspaceRole === ORG_ROLES.regionalManager) return 'regional_manager'
  if ([ORG_ROLES.branchManager, ORG_ROLES.teamLead].includes(workspaceRole)) return 'branch_manager'
  if (workspaceRole === ORG_ROLES.processor) return 'processor'
  if (workspaceRole === ORG_ROLES.compliance) return 'compliance'
  if ([ORG_ROLES.consultant, ORG_ROLES.bondOriginator].includes(workspaceRole)) return 'consultant'
  if (workspaceRole === ORG_ROLES.adminStaff) return 'admin_staff'
  return 'consultant'
}

function isApprovedTransaction(transaction = {}) {
  const financeStatus = normalizeText(transaction.finance_status || transaction.financeStatus).toLowerCase()
  const stage = normalizeText(transaction.stage || transaction.current_main_stage).toLowerCase()
  return financeStatus.includes('approved') || stage.includes('approved')
}

function isDeclinedOrBlockedTransaction(transaction = {}) {
  const financeStatus = normalizeText(transaction.finance_status || transaction.financeStatus).toLowerCase()
  const stage = normalizeText(transaction.stage || transaction.current_main_stage).toLowerCase()
  return (
    financeStatus.includes('declined') ||
    financeStatus.includes('rejected') ||
    financeStatus.includes('blocked') ||
    financeStatus.includes('stalled') ||
    stage.includes('declined') ||
    stage.includes('blocked')
  )
}

function uniqueSorted(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).filter(Boolean))].sort((left, right) =>
    String(left).localeCompare(String(right)),
  )
}

function makeResolvedMembership(user = {}, scope = null, resolvedWorkspaceId = '') {
  const currentMembership = user.currentMembership || {}
  if (!scope) return user
  return {
    ...user,
    currentMembership: {
      ...currentMembership,
      workspaceId: scope.workspaceId || currentMembership.workspaceId || resolvedWorkspaceId,
      organisation_id: scope.workspaceId || currentMembership.organisation_id || resolvedWorkspaceId,
      user_id: scope.userId || currentMembership.user_id || user.userId || user.id || null,
      workspaceRole: scope.workspaceRole || currentMembership.workspaceRole || currentMembership.workspace_role,
      workspace_role: scope.workspaceRole || currentMembership.workspace_role || currentMembership.workspaceRole,
      scopeLevel: scope.scopeLevel || currentMembership.scopeLevel || currentMembership.scope_level,
      scope_level: scope.scopeLevel || currentMembership.scope_level || currentMembership.scopeLevel,
      region_id: scope.regionId || currentMembership.region_id || null,
      workspace_unit_id: scope.workspaceUnitId || currentMembership.workspace_unit_id || null,
    },
  }
}

function transactionsFromOptions(options = {}, user = {}) {
  if (Array.isArray(options.transactions)) return options.transactions
  if (Array.isArray(user.transactions)) return user.transactions
  return []
}

function filterByWorkspace(transactions = [], workspaceId = '') {
  const safeWorkspaceId = normalizeText(workspaceId)
  if (!safeWorkspaceId) return Array.isArray(transactions) ? transactions : []
  return (Array.isArray(transactions) ? transactions : []).filter(
    (transaction) => normalizeWorkspaceId(transaction) === safeWorkspaceId,
  )
}

function filterVisibleTransactions(user = {}, transactions = []) {
  return (Array.isArray(transactions) ? transactions : []).filter((transaction) =>
    canViewFinanceWorkflow(user, transaction),
  )
}

function deriveHierarchyOptions(hierarchy = {}, visibleTransactions = []) {
  const regions = Array.isArray(hierarchy?.regions) ? hierarchy.regions : []
  const units = Array.isArray(hierarchy?.units) ? hierarchy.units : []

  const derivedRegionIds = uniqueSorted(visibleTransactions.map((transaction) => normalizeRegionId(transaction)))
  const derivedUnitIds = uniqueSorted(visibleTransactions.map((transaction) => normalizeUnitId(transaction)))

  const regionOptions = regions.length
    ? regions.map((region) => ({
        id: normalizeText(region.id),
        name: normalizeText(region.name) || normalizeText(region.code) || normalizeText(region.id),
      }))
    : derivedRegionIds.map((id) => ({ id, name: id }))

  const unitOptions = units.length
    ? units.map((unit) => ({
        id: normalizeText(unit.id),
        name: normalizeText(unit.name) || normalizeText(unit.code) || normalizeText(unit.id),
        regionId: normalizeText(unit.region_id || unit.regionId) || null,
        unitType: normalizeText(unit.unit_type || unit.unitType) || null,
      }))
    : derivedUnitIds.map((id) => ({ id, name: id, regionId: null, unitType: null }))

  return {
    regions: regionOptions,
    units: unitOptions,
  }
}

function buildAssigneeOptions(visibleTransactions = []) {
  const consultants = []
  const processors = []
  const managers = []
  const complianceReviewers = []

  for (const transaction of visibleTransactions) {
    const assignment = resolveEffectiveBondAssignment(transaction)
    if (assignment.primaryConsultantUserId) {
      consultants.push(assignment.primaryConsultantUserId)
    }
    if (assignment.processorUserId) {
      processors.push(assignment.processorUserId)
    }
    if (assignment.managerUserId) {
      managers.push(assignment.managerUserId)
    }
    if (assignment.complianceUserId) {
      complianceReviewers.push(assignment.complianceUserId)
    }
  }

  const toOptions = (ids = []) => uniqueSorted(ids).map((id) => ({ id, label: id }))
  return {
    consultants: toOptions(consultants),
    processors: toOptions(processors),
    managers: toOptions(managers),
    complianceReviewers: toOptions(complianceReviewers),
  }
}

function buildScopeFilterVisibility(scopeLevel = BOND_SCOPE_LEVELS.assigned) {
  if (scopeLevel === BOND_SCOPE_LEVELS.workspaceHq) {
    return {
      region: true,
      unit: true,
      consultant: true,
      processor: true,
      manager: true,
      complianceReviewer: true,
    }
  }
  if (scopeLevel === BOND_SCOPE_LEVELS.region) {
    return {
      region: true,
      unit: true,
      consultant: true,
      processor: true,
      manager: true,
      complianceReviewer: true,
    }
  }
  if ([BOND_SCOPE_LEVELS.branch, BOND_SCOPE_LEVELS.team].includes(scopeLevel)) {
    return {
      region: false,
      unit: true,
      consultant: true,
      processor: true,
      manager: true,
      complianceReviewer: true,
    }
  }
  return {
    region: false,
    unit: false,
    consultant: false,
    processor: false,
    manager: false,
    complianceReviewer: false,
  }
}

async function resolveTransactions(user = {}, workspaceId = '', options = {}) {
  if (typeof options.fetchTransactions === 'function') {
    const rows = await options.fetchTransactions({ user, workspaceId })
    return filterByWorkspace(rows, workspaceId)
  }
  return filterByWorkspace(transactionsFromOptions(options, user), workspaceId)
}

export async function getBondDashboardReportingScope(user = {}, workspaceId = '', options = {}) {
  const resolved = resolvePermissionContext(user || {})
  const resolvedWorkspaceId =
    normalizeText(workspaceId) ||
    normalizeText(resolved.workspaceId) ||
    normalizeText(user.workspaceId || user.currentWorkspace?.id || '')
  const scope = options.scope || (await getUserBondScope(user, resolvedWorkspaceId))
  const workspaceRole = normalizeOrgRole(
    scope?.workspaceRole || resolved.workspaceRole,
    { workspaceType: resolved.workspaceType, appRole: resolved.appRole },
  )
  const scopeLevel = getScopeFromMembership(scope, resolved)
  const workspaceKind = getWorkspaceKind(user, resolved)
  const resolvedUser = makeResolvedMembership(user, scope, resolvedWorkspaceId)

  return {
    workspaceId: resolvedWorkspaceId,
    workspaceKind,
    workspaceRole,
    scopeLevel,
    regionId: normalizeText(scope?.regionId || resolved.regionId) || null,
    workspaceUnitId: normalizeText(scope?.workspaceUnitId || resolved.workspaceUnitId) || null,
    accessibleRegionIds: getAccessibleBondRegions(resolvedUser, resolvedWorkspaceId),
    accessibleUnitIds: getAccessibleBondUnits(resolvedUser, resolvedWorkspaceId),
    isWorkspaceHq: isWorkspaceHqUser(resolvedUser, resolvedWorkspaceId),
    isRegionalManager: isRegionalBondManager(
      resolvedUser,
      resolvedWorkspaceId,
      normalizeText(scope?.regionId || resolved.regionId),
    ),
    isBranchManager: isBranchBondManager(
      resolvedUser,
      resolvedWorkspaceId,
      normalizeText(scope?.workspaceUnitId || resolved.workspaceUnitId),
    ),
    isAssignedOnly: isAssignedOnlyBondUser(resolvedUser, resolvedWorkspaceId),
    dashboardMode: getDashboardMode({ workspaceKind, workspaceRole }),
  }
}

export async function getBondDashboardQueues(user = {}, workspaceId = '', options = {}) {
  const resolved = resolvePermissionContext(user || {})
  const resolvedWorkspaceId =
    normalizeText(workspaceId) ||
    normalizeText(resolved.workspaceId) ||
    normalizeText(user.workspaceId || user.currentWorkspace?.id || '')
  const rows = await resolveTransactions(user, resolvedWorkspaceId, options)
  return resolveBondOperationalQueues(user, rows)
}

export async function getBondDashboardSummary(user = {}, workspaceId = '', options = {}) {
  const resolved = resolvePermissionContext(user || {})
  const resolvedWorkspaceId =
    normalizeText(workspaceId) ||
    normalizeText(resolved.workspaceId) ||
    normalizeText(user.workspaceId || user.currentWorkspace?.id || '')
  const rows = await resolveTransactions(user, resolvedWorkspaceId, options)
  const visibleTransactions = filterVisibleTransactions(user, rows)
  const queues = options.queues || resolveBondOperationalQueues(user, rows)

  const assignments = visibleTransactions.map((transaction) =>
    resolveEffectiveBondAssignment(transaction),
  )
  const canonicalAssignmentRecords = assignments.filter(
    (assignment) => assignment.source === 'canonical',
  ).length
  const participantFallbackRecords = assignments.filter(
    (assignment) => assignment.source === 'participant',
  ).length
  const rolePlayerFallbackRecords = assignments.filter(
    (assignment) => assignment.source === 'role_player',
  ).length
  const legacyEmailFallbackRecords = assignments.filter(
    (assignment) => assignment.source === 'legacy_email',
  ).length
  const legacyTextFallbackRecords = assignments.filter(
    (assignment) => assignment.source === 'legacy_text',
  ).length
  const unresolvedAssignmentRecords = assignments.filter(
    (assignment) => assignment.source === 'none',
  ).length

  return {
    totalApplications: visibleTransactions.length,
    myApplications: queues.my_applications.length,
    processingQueue: queues.processing_queue.length,
    missingDocuments: queues.missing_documents.length,
    bankFeedbackPending: queues.bank_feedback.length,
    submissionReady: queues.submission_readiness.length,
    overdueApplications: queues.overdue_applications.length,
    complianceReview: queues.compliance_review.length,
    managerEscalations: queues.manager_escalations.length,
    approvedApplications: visibleTransactions.filter((transaction) => isApprovedTransaction(transaction)).length,
    declinedOrBlockedApplications: visibleTransactions.filter((transaction) => isDeclinedOrBlockedTransaction(transaction)).length,
    canonicalAssignmentRecords,
    participantFallbackRecords,
    rolePlayerFallbackRecords,
    legacyEmailFallbackRecords,
    legacyTextFallbackRecords,
    legacyFallbackRecords:
      participantFallbackRecords + rolePlayerFallbackRecords + legacyEmailFallbackRecords + legacyTextFallbackRecords,
    unresolvedAssignmentRecords,
  }
}

export async function getBondDashboardFilters(user = {}, workspaceId = '', options = {}) {
  const resolved = resolvePermissionContext(user || {})
  const resolvedWorkspaceId =
    normalizeText(workspaceId) ||
    normalizeText(resolved.workspaceId) ||
    normalizeText(user.workspaceId || user.currentWorkspace?.id || '')
  const rows = await resolveTransactions(user, resolvedWorkspaceId, options)
  const visibleTransactions = filterVisibleTransactions(user, rows)
  const reportingScope = options.reportingScope || (await getBondDashboardReportingScope(user, resolvedWorkspaceId, options))
  const hierarchy = options.hierarchy || (await getWorkspaceHierarchy(resolvedWorkspaceId))
  const hierarchyOptions = deriveHierarchyOptions(hierarchy, visibleTransactions)
  const assigneeOptions = buildAssigneeOptions(visibleTransactions)

  const stageOptions = uniqueSorted(
    visibleTransactions.map((transaction) =>
      normalizeText(transaction.current_main_stage || transaction.main_stage || transaction.stage),
    ),
  ).map((value) => ({ value, label: value }))
  const financeStatusOptions = uniqueSorted(
    visibleTransactions.map((transaction) =>
      normalizeText(transaction.finance_status || transaction.financeStatus || transaction.current_sub_stage_summary),
    ),
  ).map((value) => ({ value, label: value }))

  const scopeVisibility = buildScopeFilterVisibility(reportingScope.scopeLevel)

  return {
    defaults: {
      workspaceId: resolvedWorkspaceId || null,
      scopeLevel: reportingScope.scopeLevel,
      regionId: reportingScope.regionId || null,
      workspaceUnitId: reportingScope.workspaceUnitId || null,
      overdueOnly: false,
      dateRange: null,
    },
    visibleFilters: {
      workspace: true,
      region: scopeVisibility.region,
      unit: scopeVisibility.unit,
      consultant: scopeVisibility.consultant,
      processor: scopeVisibility.processor,
      manager: scopeVisibility.manager,
      complianceReviewer: scopeVisibility.complianceReviewer,
      stage: true,
      financeStatus: true,
      bankFeedbackStatus: true,
      overdue: true,
      dateRange: true,
    },
    options: {
      regions: hierarchyOptions.regions,
      units: hierarchyOptions.units,
      consultants: assigneeOptions.consultants,
      processors: assigneeOptions.processors,
      managers: assigneeOptions.managers,
      complianceReviewers: assigneeOptions.complianceReviewers,
      stages: stageOptions,
      financeStatuses: financeStatusOptions,
      overdue: [
        { value: 'all', label: 'All' },
        { value: 'overdue', label: 'Overdue only' },
      ],
    },
  }
}

export async function getBondDashboardContext(user = {}, workspaceId = '', options = {}) {
  const resolved = resolvePermissionContext(user || {})
  const resolvedWorkspaceId =
    normalizeText(workspaceId) ||
    normalizeText(resolved.workspaceId) ||
    normalizeText(user.workspaceId || user.currentWorkspace?.id || '')
  const reportingScope = await getBondDashboardReportingScope(user, resolvedWorkspaceId, options)
  const filters = await getBondDashboardFilters(user, resolvedWorkspaceId, {
    ...options,
    reportingScope,
  })
  return {
    workspaceId: reportingScope.workspaceId,
    workspaceKind: reportingScope.workspaceKind,
    workspaceRole: reportingScope.workspaceRole,
    scopeLevel: reportingScope.scopeLevel,
    regionId: reportingScope.regionId,
    workspaceUnitId: reportingScope.workspaceUnitId,
    dashboardMode: reportingScope.dashboardMode,
    reportingScope,
    filters,
    isIndependentOriginator: reportingScope.workspaceKind === WORKSPACE_KINDS.personalOriginator,
    isWorkspaceScoped: reportingScope.scopeLevel === BOND_SCOPE_LEVELS.workspaceHq,
    hasHierarchy: normalizeBool(filters.options.regions.length || filters.options.units.length),
  }
}
