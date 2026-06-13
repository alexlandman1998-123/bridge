import { isMissingTableError } from './attorneyFirmServiceShared'
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'
import { ALL_BOND_ORGANISATION_SCOPE, BOND_ORGANISATION_LEVELS, resolveBondOrganisationScope } from './bondOrganisationScopeResolver'
import { BOND_ROUTING_METHODS, recordRoutingRuleUsed, resolveBondApplicationRouting } from './bondRoutingRulesService'
import { recordAuditEvent } from '../lib/activityAudit'
import { compareRoutingDecisions, universalPartnerRoutingResolver } from './universalPartnerRoutingService'
import { recordUniversalAssignmentEvent, UNIVERSAL_ASSIGNMENT_METHODS } from './universalAssignmentService'

export const BOND_APPLICATION_ASSIGNMENT_METHODS = Object.freeze({
  auto: 'AUTO',
  manual: 'MANUAL',
  partnerDefault: 'PARTNER_DEFAULT',
  workloadBalanced: 'WORKLOAD_BALANCED',
  reassigned: 'REASSIGNED',
})

export const BOND_APPLICATION_ROUTING_MODES = Object.freeze({
  partnerDefault: 'PARTNER_DEFAULT',
  developmentDefault: 'DEVELOPMENT_DEFAULT',
  manual: 'MANUAL',
  workloadBalanced: 'WORKLOAD_BALANCED',
})

export const BOND_APPLICATION_ASSIGNMENT_EVENTS = Object.freeze({
  assigned: 'APPLICATION_ASSIGNED',
  reassigned: 'APPLICATION_REASSIGNED',
  escalated: 'APPLICATION_ESCALATED',
  transferred: 'APPLICATION_TRANSFERRED',
})

export const BOND_CONSULTANT_CAPACITY_STATUSES = Object.freeze({
  light: 'Light',
  normal: 'Normal',
  busy: 'Busy',
  overloaded: 'Overloaded',
})

const LOCAL_APPLICATION_STORE = new Map()
const LOCAL_ASSIGNMENT_HISTORY_STORE = new Map()
const LOCAL_ASSIGNMENT_NOTIFICATION_STORE = new Map()
const INACTIVE_CONSULTANT_STATUSES = new Set(['inactive', 'leave', 'on_leave', 'suspended'])
const ACTIVE_APPLICATION_TERMS = ['active', 'new', 'intake', 'pre', 'document', 'submit', 'feedback', 'bank', 'quote', 'instruction', 'in_progress']
const SUBMITTED_APPLICATION_TERMS = ['submitted', 'bank', 'feedback', 'quote', 'approved', 'grant', 'instruction']
const PENDING_DOCUMENT_TERMS = ['document', 'docs', 'pending_docs', 'awaiting_documents', 'outstanding']

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase()
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : []
}

function isUuidLike(value = '') {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalizeText(value))
}

function getWorkspaceKey(workspaceId = '', context = {}, options = {}) {
  return normalizeText(workspaceId || context.workspaceId || context.currentWorkspace?.id || context.currentMembership?.organisation_id || options.workspaceId || 'default')
}

function getActorUserId(context = {}) {
  return normalizeText(context.userId || context.user_id || context.profile?.id || context.user?.id || context.currentMembership?.user_id)
}

function getApplicationId(row = {}) {
  return normalizeText(row.applicationId || row.application_id || row.transactionId || row.transaction_id || row.id || row.key)
}

function getConsultantId(row = {}) {
  return normalizeText(row.consultantId || row.consultant_id || row.userId || row.user_id || row.assignedUserId || row.assigned_user_id || row.id)
}

function getBranchId(row = {}) {
  return normalizeText(
    row.branchId ||
      row.branch_id ||
      row.assignedBranchId ||
      row.assigned_branch_id ||
      row.workspaceUnitId ||
      row.workspace_unit_id ||
      row.assignedWorkspaceUnitId ||
      row.assigned_workspace_unit_id,
  )
}

function getRegionId(row = {}) {
  return normalizeText(row.regionId || row.region_id || row.assignedRegionId || row.assigned_region_id || row.bondRegionId || row.bond_region_id)
}

function getApplicationConsultantId(row = {}) {
  return normalizeText(
    row.assignedConsultantId ||
      row.assigned_consultant_id ||
      row.assignedUserId ||
      row.assigned_user_id ||
      row.primaryBondConsultantUserId ||
      row.primary_bond_consultant_user_id ||
      row.owner_user_id,
  )
}

function getName(row = {}, fallback = 'Unassigned') {
  return normalizeText(
    row.name ||
      row.consultant ||
      row.branch ||
      row.region ||
      [row.firstName || row.first_name, row.lastName || row.last_name].map(normalizeText).filter(Boolean).join(' ') ||
      row.email,
  ) || fallback
}

function getBranchRegionId(branch = {}) {
  return normalizeText(branch.regionId || branch.region_id || branch.assignedRegionId || branch.assigned_region_id)
}

function getConsultantBranchId(consultant = {}) {
  return normalizeText(
    consultant.branchId ||
      consultant.branch_id ||
      consultant.workspaceUnitId ||
      consultant.workspace_unit_id ||
      consultant.primaryBranchId ||
      consultant.primary_branch_id,
  )
}

function getConsultantRegionId(consultant = {}) {
  return normalizeText(consultant.regionId || consultant.region_id || consultant.assignedRegionId || consultant.assigned_region_id)
}

function getApplicationSignal(row = {}) {
  return normalizeLower(`${row.status || ''} ${row.stage || ''} ${row.financeStageKey || ''} ${row.finance_stage_key || ''} ${row.financeStageLabel || ''} ${row.current_main_stage || ''}`)
}

function isActiveApplication(row = {}) {
  const signal = getApplicationSignal(row)
  if (row.active === false || row.is_active === false) return false
  if (['archived', 'cancelled', 'canceled', 'completed', 'registered', 'declined', 'lost'].some((term) => signal.includes(term))) return false
  if (!signal) return true
  return ACTIVE_APPLICATION_TERMS.some((term) => signal.includes(term)) || !['inactive', 'closed'].some((term) => signal.includes(term))
}

function isSubmittedApplication(row = {}) {
  const signal = getApplicationSignal(row)
  return SUBMITTED_APPLICATION_TERMS.some((term) => signal.includes(term))
}

function isPendingDocuments(row = {}) {
  const signal = getApplicationSignal(row)
  return PENDING_DOCUMENT_TERMS.some((term) => signal.includes(term))
}

function normalizeApplication(row = {}) {
  const assignedConsultantId = getApplicationConsultantId(row)
  const assignedBranchId = getBranchId(row)
  const assignedRegionId = getRegionId(row)
  return {
    ...row,
    id: getApplicationId(row),
    applicationId: getApplicationId(row),
    assignedConsultantId,
    assigned_consultant_id: assignedConsultantId,
    assignedUserId: assignedConsultantId,
    assigned_user_id: assignedConsultantId,
    assignedBranchId,
    assigned_branch_id: assignedBranchId,
    branchId: assignedBranchId,
    workspaceUnitId: assignedBranchId,
    assignedRegionId,
    assigned_region_id: assignedRegionId,
    regionId: assignedRegionId,
    assignedAt: normalizeText(row.assignedAt || row.assigned_at || row.scope_metadata?.assignedAt),
    assignedBy: normalizeText(row.assignedBy || row.assigned_by || row.scope_metadata?.assignedBy),
    assignmentMethod: normalizeText(row.assignmentMethod || row.assignment_method || row.bond_assignment_method || row.scope_metadata?.method),
  }
}

function normalizeConsultant(row = {}) {
  const id = getConsultantId(row)
  return {
    ...row,
    id,
    userId: normalizeText(row.userId || row.user_id || id),
    name: getName(row, 'Consultant'),
    branchId: getConsultantBranchId(row),
    regionId: getConsultantRegionId(row),
    status: normalizeLower(row.status || (row.active === false || row.is_active === false ? 'inactive' : 'active')) || 'active',
  }
}

function normalizeBranch(row = {}) {
  return {
    ...row,
    id: getBranchId(row) || normalizeText(row.id),
    name: getName(row, 'Branch'),
    regionId: getBranchRegionId(row),
    managerUserId: normalizeText(row.managerUserId || row.manager_user_id),
  }
}

function normalizeRegion(row = {}) {
  return {
    ...row,
    id: getRegionId(row) || normalizeText(row.id),
    name: getName(row, 'Region'),
  }
}

function getLocalApplications(workspaceKey = '') {
  return LOCAL_APPLICATION_STORE.get(workspaceKey) || []
}

function setLocalApplications(workspaceKey = '', rows = []) {
  LOCAL_APPLICATION_STORE.set(workspaceKey, rows.map(normalizeApplication))
}

function getLocalHistory(workspaceKey = '') {
  return LOCAL_ASSIGNMENT_HISTORY_STORE.get(workspaceKey) || []
}

function setLocalHistory(workspaceKey = '', rows = []) {
  LOCAL_ASSIGNMENT_HISTORY_STORE.set(workspaceKey, rows)
}

function getLocalNotifications(workspaceKey = '') {
  return LOCAL_ASSIGNMENT_NOTIFICATION_STORE.get(workspaceKey) || []
}

function setLocalNotifications(workspaceKey = '', rows = []) {
  LOCAL_ASSIGNMENT_NOTIFICATION_STORE.set(workspaceKey, rows)
}

function getData(options = {}, workspaceKey = '') {
  const regions = normalizeArray(options.regions).map(normalizeRegion)
  const branches = normalizeArray(options.branches || options.units).map(normalizeBranch)
  const consultants = normalizeArray(options.consultants || options.users).map(normalizeConsultant)
  const optionApplications = normalizeArray(options.applications || options.rows).map(normalizeApplication)
  const applications = optionApplications.length ? optionApplications : getLocalApplications(workspaceKey)
  return { regions, branches, consultants, applications }
}

function findApplication(applicationId = '', applications = []) {
  const safeId = normalizeText(applicationId)
  return applications.find((row) => getApplicationId(row) === safeId)
}

function findConsultant(consultantId = '', consultants = []) {
  const safeId = normalizeText(consultantId)
  return consultants.find((row) => normalizeText(row.id) === safeId || normalizeText(row.userId) === safeId || getConsultantId(row) === safeId)
}

function findBranch(branchId = '', branches = []) {
  const safeId = normalizeText(branchId)
  return branches.find((row) => normalizeText(row.id) === safeId)
}

function findRegion(regionId = '', regions = []) {
  const safeId = normalizeText(regionId)
  return regions.find((row) => normalizeText(row.id) === safeId)
}

function getBranchConsultants(branchId = '', consultants = []) {
  const safeBranchId = normalizeText(branchId)
  return consultants.filter((consultant) => normalizeText(consultant.branchId) === safeBranchId)
}

function isConsultantAssignable(consultant = {}) {
  return !INACTIVE_CONSULTANT_STATUSES.has(normalizeLower(consultant.status))
}

function getCapacityStatus(activeApplications = 0) {
  const count = Number(activeApplications || 0)
  if (count <= 10) return BOND_CONSULTANT_CAPACITY_STATUSES.light
  if (count <= 25) return BOND_CONSULTANT_CAPACITY_STATUSES.normal
  if (count <= 40) return BOND_CONSULTANT_CAPACITY_STATUSES.busy
  return BOND_CONSULTANT_CAPACITY_STATUSES.overloaded
}

function capacityWeight(status = '') {
  if (status === BOND_CONSULTANT_CAPACITY_STATUSES.light) return 1
  if (status === BOND_CONSULTANT_CAPACITY_STATUSES.normal) return 2
  if (status === BOND_CONSULTANT_CAPACITY_STATUSES.busy) return 3
  return 4
}

function buildAssignmentPatch({ application = {}, consultant = {}, branch = {}, region = {}, assignmentMethod = '', routingMode = '', routingSource = '', routingRuleId = '', actorUserId = '', now = new Date().toISOString() } = {}) {
  const consultantId = normalizeText(consultant.id || consultant.userId || getApplicationConsultantId(application))
  const branchId = normalizeText(branch.id || consultant.branchId || getBranchId(application))
  const regionId = normalizeText(region.id || branch.regionId || consultant.regionId || getRegionId(application))
  return {
    assignedConsultantId: consultantId,
    assigned_consultant_id: consultantId,
    assignedUserId: consultantId,
    assigned_user_id: consultantId,
    assignedUserEmail: consultant.email || application.assignedUserEmail || application.assigned_user_email || '',
    assignedBranchId: branchId,
    assigned_branch_id: branchId,
    assignedWorkspaceUnitId: branchId,
    assigned_workspace_unit_id: branchId,
    branchId,
    workspaceUnitId: branchId,
    workspace_unit_id: branchId,
    assignedRegionId: regionId,
    assigned_region_id: regionId,
    regionId,
    consultant: getName(consultant, application.consultant || 'Unassigned'),
    branch: getName(branch, application.branch || 'Unassigned'),
    region: getName(region, application.region || 'Unassigned'),
    assignedAt: now,
    assigned_at: now,
    assignedBy: actorUserId,
    assigned_by: actorUserId,
    assignmentMethod,
    assignment_method: assignmentMethod,
    bond_assignment_method: assignmentMethod,
    assignmentStatus: 'consultant_assigned',
    assignment_status: 'consultant_assigned',
    assignmentSource: routingMode || assignmentMethod,
    assignment_source: routingMode || assignmentMethod,
    routingMethod: routingMode || assignmentMethod,
    routing_method: routingMode || assignmentMethod,
    routingSource,
    routing_source: routingSource,
    routingRuleId,
    routing_rule_id: routingRuleId,
    scope_metadata: {
      ...(application.scope_metadata || {}),
      method: assignmentMethod,
      routingMode: routingMode || assignmentMethod,
      routingMethod: routingMode || assignmentMethod,
      routingSource,
      routingRuleId,
      assignedBy: actorUserId,
      assignedAt: now,
    },
  }
}

function replaceApplication(workspaceKey = '', application = {}, applications = []) {
  const safeId = getApplicationId(application)
  const sourceRows = applications.length ? applications : getLocalApplications(workspaceKey)
  const nextRows = sourceRows.some((row) => getApplicationId(row) === safeId)
    ? sourceRows.map((row) => (getApplicationId(row) === safeId ? normalizeApplication(application) : normalizeApplication(row)))
    : [...sourceRows.map(normalizeApplication), normalizeApplication(application)]
  setLocalApplications(workspaceKey, nextRows)
  return nextRows
}

function appendHistory(workspaceKey = '', event = {}) {
  const history = getLocalHistory(workspaceKey)
  const now = event.createdAt || new Date().toISOString()
  const row = {
    id: event.id || `history-${now}-${history.length + 1}`,
    eventType: event.eventType || BOND_APPLICATION_ASSIGNMENT_EVENTS.assigned,
    applicationId: normalizeText(event.applicationId),
    fromConsultantId: normalizeText(event.fromConsultantId),
    toConsultantId: normalizeText(event.toConsultantId || event.consultantId),
    consultantId: normalizeText(event.consultantId || event.toConsultantId),
    branchId: normalizeText(event.branchId),
    regionId: normalizeText(event.regionId),
    reason: normalizeText(event.reason),
    actorUserId: normalizeText(event.actorUserId),
    previousValue: event.previousValue || null,
    newValue: event.newValue || null,
    createdAt: now,
  }
  setLocalHistory(workspaceKey, [row, ...history])
  return row
}

function appendNotification(workspaceKey = '', notification = {}) {
  const notifications = getLocalNotifications(workspaceKey)
  const row = {
    id: notification.id || `notification-${Date.now()}-${notifications.length + 1}`,
    type: notification.type || 'bond_application_assignment',
    title: notification.title || 'New Bond Application Assigned',
    recipientUserId: normalizeText(notification.recipientUserId),
    applicationId: normalizeText(notification.applicationId),
    payload: notification.payload || {},
    createdAt: notification.createdAt || new Date().toISOString(),
  }
  if (row.recipientUserId) setLocalNotifications(workspaceKey, [row, ...notifications])
  return row
}

function createAssignmentNotifications(workspaceKey = '', { application = {}, consultant = {}, branch = {}, previousConsultant = null, eventType = BOND_APPLICATION_ASSIGNMENT_EVENTS.assigned } = {}) {
  const applicationId = getApplicationId(application)
  const payload = {
    buyer: application.buyer || application.buyerName || application.clientName || 'Buyer',
    property: application.property || application.propertyAddress || application.property_address_line_1 || 'Property',
    application: application.applicationReference || application.transactionReference || applicationId,
    consultant: getName(consultant, 'Consultant'),
    branch: getName(branch, 'Branch'),
  }
  if (previousConsultant) {
    appendNotification(workspaceKey, {
      title: 'Bond Application Reassigned',
      recipientUserId: previousConsultant.id || previousConsultant.userId,
      applicationId,
      payload: { ...payload, role: 'previous_consultant', eventType },
    })
  }
  appendNotification(workspaceKey, {
    title: eventType === BOND_APPLICATION_ASSIGNMENT_EVENTS.reassigned ? 'Bond Application Reassigned' : 'New Bond Application Assigned',
    recipientUserId: consultant.id || consultant.userId,
    applicationId,
    payload: { ...payload, role: 'assigned_consultant', eventType },
  })
  appendNotification(workspaceKey, {
    title: eventType === BOND_APPLICATION_ASSIGNMENT_EVENTS.reassigned ? 'Branch Application Reassigned' : 'New Branch Application Assigned',
    recipientUserId: branch.managerUserId,
    applicationId,
    payload: { ...payload, role: 'branch_manager', eventType },
  })
}

async function persistRemoteAssignment(application = {}, patch = {}, workspaceKey = '', options = {}) {
  if (!isSupabaseConfigured || !supabase || options.forceLocal || options.persistRemote === false) return null
  const applicationId = getApplicationId(application)
  if (!applicationId) return null
  const payload = {
    assigned_region_id: patch.assignedRegionId || null,
    assigned_branch_id: patch.assignedBranchId || null,
    assigned_workspace_unit_id: patch.assignedBranchId || null,
    assigned_user_id: patch.assignedConsultantId || null,
    bond_assignment_method: patch.assignmentMethod || null,
    assignment_status: patch.assignmentStatus || 'consultant_assigned',
    assignment_source: patch.assignmentSource || patch.assignmentMethod || null,
    scope_metadata: patch.scope_metadata || {},
    updated_at: new Date().toISOString(),
  }
  const { data, error } = await supabase
    .from('transaction_bond_applications')
    .update(payload)
    .eq('id', applicationId)
    .eq('assigned_organisation_id', workspaceKey)
    .select('id, assigned_region_id, assigned_branch_id, assigned_workspace_unit_id, assigned_user_id, bond_assignment_method, assignment_status, assignment_source, scope_metadata, updated_at')
    .maybeSingle()
  if (error && !isMissingTableError(error, 'transaction_bond_applications')) throw error
  return data
}

async function persistRemoteHistory(workspaceKey = '', event = {}, options = {}) {
  if (!isSupabaseConfigured || !supabase || options.forceLocal || options.persistRemote === false || !isUuidLike(workspaceKey)) return null
  const applicationId = normalizeText(event.applicationId)
  const payload = {
    organisation_id: workspaceKey,
    bond_application_id: isUuidLike(applicationId) ? applicationId : null,
    transaction_id: isUuidLike(event.previousValue?.transactionId || event.previousValue?.transaction_id || event.newValue?.transactionId || event.newValue?.transaction_id)
      ? normalizeText(event.previousValue?.transactionId || event.previousValue?.transaction_id || event.newValue?.transactionId || event.newValue?.transaction_id)
      : null,
    application_reference: applicationId,
    event_type: event.eventType,
    from_consultant_id: isUuidLike(event.fromConsultantId) ? event.fromConsultantId : null,
    to_consultant_id: isUuidLike(event.toConsultantId) ? event.toConsultantId : null,
    consultant_id: isUuidLike(event.consultantId) ? event.consultantId : null,
    branch_id: isUuidLike(event.branchId) ? event.branchId : null,
    region_id: isUuidLike(event.regionId) ? event.regionId : null,
    reason: event.reason || null,
    actor_user_id: isUuidLike(event.actorUserId) ? event.actorUserId : null,
    previous_value: event.previousValue || null,
    new_value: event.newValue || null,
    created_at: event.createdAt || new Date().toISOString(),
  }
  const { data, error } = await supabase
    .from('bond_application_ownership_history')
    .insert(payload)
    .select('id, event_type, application_reference, created_at')
    .maybeSingle()
  if (error && !isMissingTableError(error, 'bond_application_ownership_history')) throw error
  return data
}

function assertApplicationExists(application, applicationId = '') {
  if (!application) throw new Error(`Bond application ${normalizeText(applicationId) || 'record'} could not be found.`)
}

function assertAssignableBranch(branch, branchId = '') {
  if (!branch) throw new Error(`Branch ${normalizeText(branchId) || 'record'} could not be found for assignment.`)
}

function assertAssignableConsultant(consultant, consultantId = '') {
  if (!consultant) throw new Error(`Consultant ${normalizeText(consultantId) || 'record'} could not be found for assignment.`)
  if (!isConsultantAssignable(consultant)) throw new Error('Selected consultant is not available for assignment.')
}

function canManageAssignmentForScope(scope = {}, application = {}) {
  const scopeLevel = normalizeLower(scope.scopeLevel)
  if (scopeLevel === BOND_ORGANISATION_LEVELS.hq) return true
  if (scopeLevel === BOND_ORGANISATION_LEVELS.region) {
    return scope.regionIds === ALL_BOND_ORGANISATION_SCOPE || normalizeArray(scope.regionIds).includes(getRegionId(application))
  }
  if (scopeLevel === BOND_ORGANISATION_LEVELS.branch) {
    return scope.branchIds === ALL_BOND_ORGANISATION_SCOPE || normalizeArray(scope.branchIds).includes(getBranchId(application))
  }
  return false
}

function assertCanManageAssignment(context = {}, application = {}, data = {}) {
  const scope = resolveBondOrganisationScope(context, data)
  if (!canManageAssignmentForScope(scope, application)) {
    throw new Error('You do not have permission to manage application ownership.')
  }
  return scope
}

function resolveDefaultRule(application = {}, defaults = [], keys = []) {
  const normalizedDefaults = normalizeArray(defaults)
  return normalizedDefaults.find((rule) => keys.some((key) => normalizeText(rule[key]) && normalizeText(rule[key]) === normalizeText(application[key])))
}

function resolveRoutingTarget(application = {}, data = {}, options = {}) {
  const hasPhaseSevenRules = normalizeArray(options.routingRules).length || options.useRoutingRules
  if (hasPhaseSevenRules) {
    const route = resolveBondApplicationRouting(application, options.context || {}, options.workspaceId || '', { ...options, ...data })
    const shadowInput = {
      sourceOrganisationId: normalizeText(options.context?.organisationId || options.context?.workspaceId || options.workspaceId || ''),
      sourceUserId: normalizeText(options.context?.userId || options.context?.actorUserId || options.context?.profile?.id || ''),
      sourceTeamId: normalizeText(options.context?.teamId || ''),
      sourceBranchId: normalizeText(options.context?.branchId || ''),
      sourceRegionId: normalizeText(options.context?.regionId || ''),
      developmentId: normalizeText(application.developmentId || application.development_id || options.developmentId || ''),
      module: 'bond',
      moduleContext: {
        role: normalizeText(options.context?.role || options.context?.appRole || options.context?.workspaceRole || 'bond_originator'),
        module: 'bond',
      },
      targetRoleType: PARTNER_ROUTING_ROLE_TYPES.bondOriginator,
      routingRules: Array.isArray(options.routingRules) ? options.routingRules : [],
      partnerConnections: options.partnerConnections || null,
      partnerPeopleByRelationshipId: options.partnerPeopleByRelationshipId || {},
      traceRouting: false,
    }
    void universalPartnerRoutingResolver(shadowInput)
      .then((shadowDecision) => {
        const legacyDecision = {
          targetOrganisationId: normalizeText(route.branch?.organisationId || options.context?.organisationId || ''),
          targetRegionId: normalizeText(route.region?.id || route.regionId || ''),
          targetBranchId: normalizeText(route.branch?.id || route.branchId || ''),
          targetTeamId: '',
          targetUserId: normalizeText(route.consultant?.id || route.consultantId || ''),
          assignmentMode: route.routingMethod || '',
          resolutionScope: route.routingMethod || '',
        }
        const comparison = compareRoutingDecisions(legacyDecision, shadowDecision)
        recordAuditEvent('partner.routing.shadow', {
          workspaceId: options.workspaceId || options.context?.workspaceId || options.context?.organisationId || '',
          module: 'bond',
          comparison,
          legacy: legacyDecision,
          universal: shadowDecision,
          route: route.routingMethod || '',
          routeId: route.routingRuleId || '',
        })
      })
      .catch(() => {})
    const assignmentMethod = route.routingMethod === BOND_ROUTING_METHODS.agencyDefault || route.routingMethod === BOND_ROUTING_METHODS.agencyConsultantDefault
      ? BOND_APPLICATION_ASSIGNMENT_METHODS.partnerDefault
      : route.routingMethod === BOND_ROUTING_METHODS.workloadBalanced
        ? BOND_APPLICATION_ASSIGNMENT_METHODS.workloadBalanced
        : route.routingMethod === BOND_ROUTING_METHODS.manualOverride
          ? BOND_APPLICATION_ASSIGNMENT_METHODS.manual
          : BOND_APPLICATION_ASSIGNMENT_METHODS.auto
    return {
      routingMode: route.routingMethod,
      assignmentMethod,
      consultant: route.consultant,
      branch: route.branch,
      region: route.region,
      fixedConsultant: Boolean(route.consultantId),
      reason: route.explanation,
      routingSource: route.routingSource,
      routingRuleId: route.routingRuleId,
      route,
    }
  }

  const manualConsultantId = normalizeText(options.consultantId || options.assignedConsultantId || application.manualConsultantId || application.selectedConsultantId)
  if (manualConsultantId) {
    const consultant = findConsultant(manualConsultantId, data.consultants)
    const branch = findBranch(consultant?.branchId || options.branchId || application.selectedBranchId || getBranchId(application), data.branches)
    const region = findRegion(consultant?.regionId || branch?.regionId || options.regionId || getRegionId(application), data.regions)
    return {
      routingMode: BOND_APPLICATION_ROUTING_MODES.manual,
      assignmentMethod: BOND_APPLICATION_ASSIGNMENT_METHODS.manual,
      consultant,
      branch,
      region,
      fixedConsultant: true,
      reason: 'Manual consultant selection',
    }
  }

  const partnerRule = resolveDefaultRule(application, options.partnerDefaults, ['partnerId', 'partnerName', 'partnerSlug'])
  const partnerBranchId = normalizeText(partnerRule?.branchId || partnerRule?.assignedBranchId || application.defaultBondBranchId || application.partnerDefaultBranchId)
  if (partnerBranchId) {
    const branch = findBranch(partnerBranchId, data.branches)
    const region = findRegion(partnerRule?.regionId || branch?.regionId || getRegionId(application), data.regions)
    return {
      routingMode: BOND_APPLICATION_ROUTING_MODES.partnerDefault,
      assignmentMethod: BOND_APPLICATION_ASSIGNMENT_METHODS.partnerDefault,
      branch,
      region,
      reason: 'Partner default branch',
    }
  }

  const developmentRule = resolveDefaultRule(application, options.developmentDefaults, ['developmentId', 'developmentName', 'developmentSlug'])
  const developmentBranchId = normalizeText(developmentRule?.branchId || developmentRule?.assignedBranchId || application.defaultBranchId || application.developmentDefaultBranchId)
  const developmentRegionId = normalizeText(developmentRule?.regionId || developmentRule?.assignedRegionId || application.defaultRegionId || application.developmentDefaultRegionId)
  if (developmentBranchId || developmentRegionId) {
    const branch = findBranch(developmentBranchId, data.branches) || data.branches.find((row) => row.regionId === developmentRegionId)
    const region = findRegion(developmentRegionId || branch?.regionId, data.regions)
    return {
      routingMode: BOND_APPLICATION_ROUTING_MODES.developmentDefault,
      assignmentMethod: BOND_APPLICATION_ASSIGNMENT_METHODS.auto,
      branch,
      region,
      reason: 'Development default route',
    }
  }

  const existingBranchId = getBranchId(application) || normalizeText(options.branchId)
  const existingRegionId = getRegionId(application) || normalizeText(options.regionId)
  const branch = findBranch(existingBranchId, data.branches) || (existingRegionId ? data.branches.find((row) => row.regionId === existingRegionId) : data.branches[0])
  const region = findRegion(existingRegionId || branch?.regionId, data.regions)
  return {
    routingMode: BOND_APPLICATION_ROUTING_MODES.workloadBalanced,
    assignmentMethod: BOND_APPLICATION_ASSIGNMENT_METHODS.workloadBalanced,
    branch,
    region,
    reason: 'Workload balanced within branch',
  }
}

export function calculateConsultantCapacity(consultantId = '', applications = [], options = {}) {
  const safeConsultantId = normalizeText(consultantId)
  const rows = normalizeArray(applications).map(normalizeApplication)
  const ownedRows = rows.filter((row) => getApplicationConsultantId(row) === safeConsultantId)
  const activeRows = ownedRows.filter(isActiveApplication)
  const submittedRows = ownedRows.filter(isSubmittedApplication)
  const pendingRows = ownedRows.filter(isPendingDocuments)
  const activeApplications = Number(options.activeApplications ?? activeRows.length)
  return {
    consultantId: safeConsultantId,
    activeApplications,
    pendingDocuments: pendingRows.length,
    submittedApplications: submittedRows.length,
    capacityStatus: getCapacityStatus(activeApplications),
  }
}

export function autoAssignConsultant({ branchId = '', consultants = [], applications = [] } = {}) {
  const safeBranchId = normalizeText(branchId)
  const candidateRows = normalizeArray(consultants)
    .map(normalizeConsultant)
    .filter((consultant) => consultant.branchId === safeBranchId && isConsultantAssignable(consultant))
    .map((consultant) => ({
      consultant,
      capacity: calculateConsultantCapacity(consultant.id, applications),
    }))
  if (!candidateRows.length) throw new Error('No active consultants are available in this branch.')
  const nonOverloaded = candidateRows.filter((row) => row.capacity.capacityStatus !== BOND_CONSULTANT_CAPACITY_STATUSES.overloaded)
  const sortedRows = (nonOverloaded.length ? nonOverloaded : candidateRows).sort((a, b) => (
    a.capacity.activeApplications - b.capacity.activeApplications ||
    a.capacity.pendingDocuments - b.capacity.pendingDocuments ||
    capacityWeight(a.capacity.capacityStatus) - capacityWeight(b.capacity.capacityStatus) ||
    a.consultant.name.localeCompare(b.consultant.name)
  ))
  return {
    consultant: sortedRows[0].consultant,
    capacity: sortedRows[0].capacity,
    candidates: candidateRows,
  }
}

export function previewApplicationAssignment(applicationId = '', context = {}, workspaceId = '', options = {}) {
  const workspaceKey = getWorkspaceKey(workspaceId, context, options)
  const data = getData(options, workspaceKey)
  const application = normalizeApplication(findApplication(applicationId, data.applications) || options.application || {})
  assertApplicationExists(application.id ? application : null, applicationId)
  const route = resolveRoutingTarget(application, data, { ...options, context, workspaceId })
  assertAssignableBranch(route.branch, getBranchId(application))
  let consultant = route.consultant
  let capacity = consultant ? calculateConsultantCapacity(consultant.id, data.applications) : null
  let assignmentMethod = route.assignmentMethod
  if (!consultant) {
    const selected = autoAssignConsultant({ branchId: route.branch.id, consultants: data.consultants, applications: data.applications })
    consultant = selected.consultant
    capacity = selected.capacity
    if (assignmentMethod === BOND_APPLICATION_ASSIGNMENT_METHODS.auto) assignmentMethod = BOND_APPLICATION_ASSIGNMENT_METHODS.workloadBalanced
  }
  assertAssignableConsultant(consultant)
  const region = route.region || findRegion(route.branch.regionId || consultant.regionId, data.regions)
  return {
    applicationId: application.id,
    region,
    branch: route.branch,
    consultant,
    currentWorkload: capacity.activeApplications,
    capacity,
    assignmentMethod,
    routingMode: route.routingMode,
    routingSource: route.routingSource || route.reason,
    routingRuleId: route.routingRuleId || '',
    route: route.route || null,
    reason: route.reason,
  }
}

export async function assignApplication(applicationId = '', context = {}, workspaceId = '', options = {}) {
  const workspaceKey = getWorkspaceKey(workspaceId, context, options)
  const data = getData(options, workspaceKey)
  const application = normalizeApplication(findApplication(applicationId, data.applications) || options.application || {})
  assertApplicationExists(application.id ? application : null, applicationId)
  const preview = previewApplicationAssignment(application.id, context, workspaceKey, { ...options, ...data, applications: data.applications })
  const now = options.now || new Date().toISOString()
  const actorUserId = normalizeText(options.assignedBy || options.actorUserId || getActorUserId(context))
  const patch = buildAssignmentPatch({
    application,
    consultant: preview.consultant,
    branch: preview.branch,
    region: preview.region,
    assignmentMethod: preview.assignmentMethod,
    routingMode: preview.routingMode,
    routingSource: preview.routingSource,
    routingRuleId: preview.routingRuleId,
    actorUserId,
    now,
  })
  const updated = normalizeApplication({ ...application, ...patch })
  replaceApplication(workspaceKey, updated, data.applications)
  await persistRemoteAssignment(application, patch, workspaceKey, options)
  const historyEvent = appendHistory(workspaceKey, {
    eventType: BOND_APPLICATION_ASSIGNMENT_EVENTS.assigned,
    applicationId: updated.id,
    consultantId: updated.assignedConsultantId,
    branchId: updated.assignedBranchId,
    regionId: updated.assignedRegionId,
    actorUserId,
    reason: preview.reason,
    previousValue: application,
    newValue: updated,
    createdAt: now,
  })
  await persistRemoteHistory(workspaceKey, historyEvent, options)
  if (preview.route?.routingRuleId) {
    await recordRoutingRuleUsed(preview.route, updated, context, workspaceKey, options)
  }
  try {
    await recordUniversalAssignmentEvent(preview.route?.fallbackUsed ? 'assignment.reassigned' : 'assignment.created', {
      itemType: 'bond_application',
      itemId: updated.id,
      transactionId: updated.applicationId || updated.id,
      organisationId: updated.assignedRegionId || updated.regionId || null,
      regionId: updated.assignedRegionId || null,
      branchId: updated.assignedBranchId || null,
      assignedUserId: updated.assignedConsultantId || null,
      previousOwnerId: application.assignedConsultantId || null,
      assignmentMethod: preview.assignmentMethod || UNIVERSAL_ASSIGNMENT_METHODS.partnerRouting,
      sourceModule: 'bond',
      sourceEvent: 'assign_application',
      reason: preview.reason,
      routingRuleId: preview.routingRuleId || null,
      metadata: {
        routingMode: preview.routingMode,
        routingSource: preview.routingSource,
        capacity: preview.capacity || null,
      },
    }, application)
  } catch (error) {
    console.warn('[bondApplicationAssignmentService] universal assignment event skipped', error)
  }
  createAssignmentNotifications(workspaceKey, {
    application: updated,
    consultant: preview.consultant,
    branch: preview.branch,
    eventType: BOND_APPLICATION_ASSIGNMENT_EVENTS.assigned,
  })
  return {
    ...preview,
    application: updated,
    ownership: getApplicationOwnership(updated.id, context, workspaceKey, { ...options, ...data, applications: getLocalApplications(workspaceKey) }),
  }
}

export async function reassignApplication(applicationId = '', toConsultantId = '', reason = '', context = {}, workspaceId = '', options = {}) {
  const workspaceKey = getWorkspaceKey(workspaceId, context, options)
  const data = getData(options, workspaceKey)
  const application = normalizeApplication(findApplication(applicationId, data.applications) || options.application || {})
  assertApplicationExists(application.id ? application : null, applicationId)
  assertCanManageAssignment(context, application, data)
  const toConsultant = findConsultant(toConsultantId, data.consultants)
  assertAssignableConsultant(toConsultant, toConsultantId)
  const branch = findBranch(toConsultant.branchId || getBranchId(application), data.branches)
  assertAssignableBranch(branch, toConsultant.branchId)
  const region = findRegion(toConsultant.regionId || branch.regionId || getRegionId(application), data.regions)
  const previousConsultant = findConsultant(getApplicationConsultantId(application), data.consultants)
  const now = options.now || new Date().toISOString()
  const actorUserId = normalizeText(options.assignedBy || options.actorUserId || getActorUserId(context))
  const patch = buildAssignmentPatch({
    application,
    consultant: toConsultant,
    branch,
    region,
    assignmentMethod: BOND_APPLICATION_ASSIGNMENT_METHODS.reassigned,
    routingMode: BOND_APPLICATION_ASSIGNMENT_METHODS.reassigned,
    actorUserId,
    now,
  })
  const updated = normalizeApplication({ ...application, ...patch })
  replaceApplication(workspaceKey, updated, data.applications)
  await persistRemoteAssignment(application, patch, workspaceKey, options)
  const historyEvent = appendHistory(workspaceKey, {
    eventType: BOND_APPLICATION_ASSIGNMENT_EVENTS.reassigned,
    applicationId: updated.id,
    fromConsultantId: getApplicationConsultantId(application),
    toConsultantId: updated.assignedConsultantId,
    branchId: updated.assignedBranchId,
    regionId: updated.assignedRegionId,
    actorUserId,
    reason,
    previousValue: application,
    newValue: updated,
    createdAt: now,
  })
  await persistRemoteHistory(workspaceKey, historyEvent, options)
  try {
    await recordUniversalAssignmentEvent('assignment.reassigned', {
      itemType: 'bond_application',
      itemId: updated.id,
      transactionId: updated.applicationId || updated.id,
      organisationId: updated.assignedRegionId || updated.regionId || null,
      regionId: updated.assignedRegionId || null,
      branchId: updated.assignedBranchId || null,
      assignedUserId: updated.assignedConsultantId || null,
      previousOwnerId: previousConsultant?.id || application.assignedConsultantId || null,
      assignmentMethod: UNIVERSAL_ASSIGNMENT_METHODS.managerAssignment,
      sourceModule: 'bond',
      sourceEvent: 'reassign_application',
      reason,
      metadata: {
        previousConsultantId: previousConsultant?.id || null,
        assignmentMethod: preview.assignmentMethod,
      },
    }, application)
  } catch (error) {
    console.warn('[bondApplicationAssignmentService] universal reassignment event skipped', error)
  }
  createAssignmentNotifications(workspaceKey, {
    application: updated,
    consultant: toConsultant,
    branch,
    previousConsultant,
    eventType: BOND_APPLICATION_ASSIGNMENT_EVENTS.reassigned,
  })
  return {
    application: updated,
    ownership: getApplicationOwnership(updated.id, context, workspaceKey, { ...options, ...data, applications: getLocalApplications(workspaceKey) }),
    history: getAssignmentHistory(updated.id, context, workspaceKey),
  }
}

export function getApplicationOwnership(applicationId = '', context = {}, workspaceId = '', options = {}) {
  const workspaceKey = getWorkspaceKey(workspaceId, context, options)
  const data = getData(options, workspaceKey)
  const application = normalizeApplication(findApplication(applicationId, data.applications) || options.application || {})
  if (!application.id) return null
  const consultant = findConsultant(application.assignedConsultantId, data.consultants)
  const branch = findBranch(application.assignedBranchId, data.branches)
  const region = findRegion(application.assignedRegionId || branch?.regionId, data.regions)
  return {
    applicationId: application.id,
    consultantId: application.assignedConsultantId,
    consultant: getName(consultant, application.consultant || 'Unassigned'),
    branchId: application.assignedBranchId,
    branch: getName(branch, application.branch || 'Unassigned'),
    regionId: application.assignedRegionId,
    region: getName(region, application.region || 'Unassigned'),
    assignedAt: application.assignedAt || application.assigned_at,
    assignmentMethod: application.assignmentMethod || application.assignment_method || application.bond_assignment_method || 'Unassigned',
    routingMethod: application.routingMethod || application.routing_method || application.scope_metadata?.routingMethod || application.assignmentSource || application.assignment_source || 'Unassigned',
    routingSource: application.routingSource || application.routing_source || application.scope_metadata?.routingSource || 'Unassigned',
    routingRuleId: application.routingRuleId || application.routing_rule_id || application.scope_metadata?.routingRuleId || '',
    assignedBy: application.assignedBy || application.assigned_by,
  }
}

export function getAssignmentHistory(applicationId = '', context = {}, workspaceId = '') {
  const workspaceKey = getWorkspaceKey(workspaceId, context)
  const safeId = normalizeText(applicationId)
  return getLocalHistory(workspaceKey).filter((row) => row.applicationId === safeId)
}

export function getBranchCapacity(branchId = '', context = {}, workspaceId = '', options = {}) {
  const workspaceKey = getWorkspaceKey(workspaceId, context, options)
  const data = getData(options, workspaceKey)
  const safeBranchId = normalizeText(branchId)
  const consultants = getBranchConsultants(safeBranchId, data.consultants)
  const rows = consultants.map((consultant) => ({
    consultantId: consultant.id,
    consultant: consultant.name,
    status: consultant.status,
    ...calculateConsultantCapacity(consultant.id, data.applications),
  }))
  const activeApplications = rows.reduce((sum, row) => sum + row.activeApplications, 0)
  return {
    branchId: safeBranchId,
    consultants: rows,
    activeApplications,
    averageCapacity: rows.length ? Math.round(activeApplications / rows.length) : 0,
    capacityStatus: getCapacityStatus(rows.length ? Math.round(activeApplications / rows.length) : 0),
  }
}

export function getRegionCapacity(regionId = '', context = {}, workspaceId = '', options = {}) {
  const workspaceKey = getWorkspaceKey(workspaceId, context, options)
  const data = getData(options, workspaceKey)
  const safeRegionId = normalizeText(regionId)
  const branches = data.branches.filter((branch) => branch.regionId === safeRegionId)
  const branchRows = branches.map((branch) => {
    const capacity = getBranchCapacity(branch.id, context, workspaceKey, { ...options, ...data })
    return {
      branchId: branch.id,
      branch: branch.name,
      applications: capacity.activeApplications,
      consultants: capacity.consultants.length,
      averageCapacity: capacity.averageCapacity,
      capacityStatus: capacity.capacityStatus,
    }
  })
  const activeApplications = branchRows.reduce((sum, row) => sum + row.applications, 0)
  const consultants = branchRows.reduce((sum, row) => sum + row.consultants, 0)
  return {
    regionId: safeRegionId,
    branches: branchRows,
    activeApplications,
    consultants,
    averageCapacity: consultants ? Math.round(activeApplications / consultants) : 0,
    capacityStatus: getCapacityStatus(consultants ? Math.round(activeApplications / consultants) : 0),
  }
}

export const __bondApplicationAssignmentServiceTestUtils = Object.freeze({
  clearStores() {
    LOCAL_APPLICATION_STORE.clear()
    LOCAL_ASSIGNMENT_HISTORY_STORE.clear()
    LOCAL_ASSIGNMENT_NOTIFICATION_STORE.clear()
  },
  seedApplications(workspaceId = '', applications = []) {
    setLocalApplications(normalizeText(workspaceId || 'default'), applications)
  },
  getApplications(workspaceId = '') {
    return getLocalApplications(normalizeText(workspaceId || 'default'))
  },
  getHistory(workspaceId = '') {
    return getLocalHistory(normalizeText(workspaceId || 'default'))
  },
  getNotifications(workspaceId = '') {
    return getLocalNotifications(normalizeText(workspaceId || 'default'))
  },
})
