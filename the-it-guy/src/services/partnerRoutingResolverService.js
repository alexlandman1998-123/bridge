import { PARTNER_ROUTING_MODES, PARTNER_ROUTING_ROLE_TYPES, PARTNER_ROUTING_SOURCE_TYPES, PARTNER_ROUTING_TARGET_TYPES } from '../constants/bondRoutingContract'
import { listOrganisationPartnerRoutingRules } from '../lib/settingsApi'
import { readAuditEvents, recordAuditEvent } from '../lib/activityAudit'
import { recordSecurityAuditEvent } from './auditLogService'
import { listPartnerConnections, partnerConnectionSupportsRoleType } from './partnerNetworkService'
import { getBondPartnerPeople } from './bondPartnerProfileService'

const DEFAULT_SCOPE_PRIORITY = [
  PARTNER_ROUTING_SOURCE_TYPES.user,
  PARTNER_ROUTING_SOURCE_TYPES.agent,
  PARTNER_ROUTING_SOURCE_TYPES.development,
  PARTNER_ROUTING_SOURCE_TYPES.team,
  PARTNER_ROUTING_SOURCE_TYPES.branch,
  PARTNER_ROUTING_SOURCE_TYPES.region,
  PARTNER_ROUTING_SOURCE_TYPES.organisation,
]

const SCOPE_PRIORITY_RANK = DEFAULT_SCOPE_PRIORITY.reduce((accumulator, scopeType, index) => {
  accumulator[scopeType] = index
  return accumulator
}, Object.create(null))

const ROLE_LABELS = Object.freeze({
  [PARTNER_ROUTING_ROLE_TYPES.agent]: 'Agent',
  [PARTNER_ROUTING_ROLE_TYPES.bondOriginator]: 'Bond Originator',
  [PARTNER_ROUTING_ROLE_TYPES.transferAttorney]: 'Transfer Attorney',
  [PARTNER_ROUTING_ROLE_TYPES.bondAttorney]: 'Bond Attorney',
  [PARTNER_ROUTING_ROLE_TYPES.cancellationAttorney]: 'Cancellation Attorney',
  [PARTNER_ROUTING_ROLE_TYPES.developer]: 'Developer',
  [PARTNER_ROUTING_ROLE_TYPES.developerContact]: 'Developer Contact',
})

const DIRECT_MODE_BY_ROLE = Object.freeze({
  [PARTNER_ROUTING_ROLE_TYPES.agent]: PARTNER_ROUTING_MODES.directAgent,
  [PARTNER_ROUTING_ROLE_TYPES.bondOriginator]: PARTNER_ROUTING_MODES.directConsultant,
  [PARTNER_ROUTING_ROLE_TYPES.transferAttorney]: PARTNER_ROUTING_MODES.directAttorney,
  [PARTNER_ROUTING_ROLE_TYPES.bondAttorney]: PARTNER_ROUTING_MODES.directAttorney,
  [PARTNER_ROUTING_ROLE_TYPES.cancellationAttorney]: PARTNER_ROUTING_MODES.directAttorney,
  [PARTNER_ROUTING_ROLE_TYPES.developer]: PARTNER_ROUTING_MODES.directConsultant,
  [PARTNER_ROUTING_ROLE_TYPES.developerContact]: PARTNER_ROUTING_MODES.directConsultant,
})

const LOCAL_ROUTING_EVENT_STORE = new Map()
const MAX_ROUTING_EVENTS = 250

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeLower(value = '') {
  return normalizeText(value).toLowerCase()
}

function normalizeRoleType(value = '') {
  const normalized = normalizeLower(value).replace(/[\s-]+/g, '_')
  if (Object.values(PARTNER_ROUTING_ROLE_TYPES).includes(normalized)) return normalized
  if (normalized === 'consultant') return PARTNER_ROUTING_ROLE_TYPES.bondOriginator
  if (normalized === 'attorney') return PARTNER_ROUTING_ROLE_TYPES.transferAttorney
  if (normalized === 'conveyancer') return PARTNER_ROUTING_ROLE_TYPES.transferAttorney
  if (normalized === 'developer_contact_person') return PARTNER_ROUTING_ROLE_TYPES.developerContact
  return normalized
}

function normalizeScopeType(value = '') {
  const normalized = normalizeLower(value)
  return Object.values(PARTNER_ROUTING_SOURCE_TYPES).includes(normalized) ? normalized : PARTNER_ROUTING_SOURCE_TYPES.organisation
}

function normalizeTargetScopeType(value = '') {
  const normalized = normalizeLower(value).replace(/[\s-]+/g, '_')
  if (normalized === 'user') return PARTNER_ROUTING_TARGET_TYPES.consultant
  if (Object.values(PARTNER_ROUTING_TARGET_TYPES).includes(normalized)) return normalized
  if (normalized === 'consultant') return PARTNER_ROUTING_TARGET_TYPES.consultant
  if (normalized === 'queue') return PARTNER_ROUTING_TARGET_TYPES.orgQueue
  return normalized || PARTNER_ROUTING_TARGET_TYPES.orgQueue
}

function normalizeAssignmentMode(value = '') {
  const normalized = normalizeLower(value)
  return normalized || PARTNER_ROUTING_MODES.manual
}

function normalizePartnerConnections(input = null) {
  if (!input) return { connections: [] }
  if (Array.isArray(input)) return { connections: input }
  if (typeof input === 'object') {
    return {
      ...input,
      connections: Array.isArray(input.connections) ? input.connections : [],
    }
  }
  return { connections: [] }
}

function hasLoadedPartnerConnections(input = null) {
  if (!input) return false
  if (Array.isArray(input)) return input.length > 0
  if (typeof input === 'object') {
    if (input.loaded === true || input.fetched === true) return true
    if (Array.isArray(input.connections) && input.connections.length > 0) return true
  }
  return false
}

function normalizeDecisionInput(input = {}) {
  return {
    sourceOrganisationId: normalizeText(input.sourceOrganisationId || input.source_organisation_id || input.organisationId || input.workspaceId),
    sourceUserId: normalizeText(input.sourceUserId || input.source_user_id || input.userId),
    sourceTeamId: normalizeText(input.sourceTeamId || input.source_team_id || input.teamId),
    sourceBranchId: normalizeText(input.sourceBranchId || input.source_branch_id || input.branchId),
    sourceRegionId: normalizeText(input.sourceRegionId || input.source_region_id || input.regionId),
    targetRoleType: normalizeRoleType(input.targetRoleType || input.target_role_type),
    transactionId: normalizeText(input.transactionId || input.transaction_id),
    developmentId: normalizeText(input.developmentId || input.development_id),
    transactionType: normalizeText(input.transactionType || input.transaction_type),
    module: normalizeText(input.module || input.moduleName || input.module_name),
    moduleContext: input.moduleContext && typeof input.moduleContext === 'object' ? input.moduleContext : {},
    transactionOverride: input.transactionOverride && typeof input.transactionOverride === 'object' ? input.transactionOverride : null,
    routingRules: Array.isArray(input.routingRules) ? input.routingRules : [],
    partnerConnections: normalizePartnerConnections(input.partnerConnections),
    partnerPeopleByRelationshipId: input.partnerPeopleByRelationshipId && typeof input.partnerPeopleByRelationshipId === 'object' ? input.partnerPeopleByRelationshipId : {},
    traceRouting: input.traceRouting !== false,
  }
}

function getScopeValue(rule = {}) {
  const sourceScopeType = normalizeScopeType(rule.sourceScopeType || rule.source_scope || rule.source_scope_type)
  if (sourceScopeType === PARTNER_ROUTING_SOURCE_TYPES.agent || sourceScopeType === PARTNER_ROUTING_SOURCE_TYPES.user) {
    return normalizeText(rule.sourceUserId || rule.source_user_id)
  }
  return normalizeText(rule.sourceScopeId || rule.source_context_id || rule.sourceContextId)
}

function ruleMatchesSourceScope(rule = {}, input = {}) {
  const sourceScopeType = normalizeScopeType(rule.sourceScopeType || rule.source_scope || rule.source_scope_type)
  const scopeValue = getScopeValue(rule)
  const sourceOrganisationId = normalizeText(rule.sourceOrganisationId || rule.source_organisation_id)

  if (sourceOrganisationId && sourceOrganisationId !== input.sourceOrganisationId) return false

  if (sourceScopeType === PARTNER_ROUTING_SOURCE_TYPES.agent || sourceScopeType === PARTNER_ROUTING_SOURCE_TYPES.user) {
    return Boolean(scopeValue && scopeValue === input.sourceUserId)
  }
  if (sourceScopeType === PARTNER_ROUTING_SOURCE_TYPES.team) {
    return Boolean(scopeValue && scopeValue === input.sourceTeamId)
  }
  if (sourceScopeType === PARTNER_ROUTING_SOURCE_TYPES.branch) {
    return Boolean(scopeValue && scopeValue === input.sourceBranchId)
  }
  if (sourceScopeType === PARTNER_ROUTING_SOURCE_TYPES.region) {
    return Boolean(scopeValue && scopeValue === input.sourceRegionId)
  }
  if (sourceScopeType === PARTNER_ROUTING_SOURCE_TYPES.development) {
    return Boolean(scopeValue && scopeValue === input.developmentId)
  }
  return true
}

function ruleMatchesTargetRole(rule = {}, targetRoleType = '') {
  const ruleTargetRoleType = normalizeRoleType(rule.targetRoleType || rule.target_role_type)
  if (!ruleTargetRoleType) return true
  return ruleTargetRoleType === targetRoleType
}

function sortRules(left = {}, right = {}) {
  const leftScopeRank = Number.isFinite(SCOPE_PRIORITY_RANK[normalizeScopeType(left.sourceScopeType || left.source_scope || left.source_scope_type)])
    ? SCOPE_PRIORITY_RANK[normalizeScopeType(left.sourceScopeType || left.source_scope || left.source_scope_type)]
    : Number.POSITIVE_INFINITY
  const rightScopeRank = Number.isFinite(SCOPE_PRIORITY_RANK[normalizeScopeType(right.sourceScopeType || right.source_scope || right.source_scope_type)])
    ? SCOPE_PRIORITY_RANK[normalizeScopeType(right.sourceScopeType || right.source_scope || right.source_scope_type)]
    : Number.POSITIVE_INFINITY
  if (leftScopeRank !== rightScopeRank) return leftScopeRank - rightScopeRank
  const leftDefault = Number(Boolean(left?.isDefault))
  const rightDefault = Number(Boolean(right?.isDefault))
  if (leftDefault !== rightDefault) return rightDefault - leftDefault
  const leftPriority = Number.isFinite(Number(left?.assignmentPriority)) ? Number(left.assignmentPriority) : Number.POSITIVE_INFINITY
  const rightPriority = Number.isFinite(Number(right?.assignmentPriority)) ? Number(right.assignmentPriority) : Number.POSITIVE_INFINITY
  if (leftPriority !== rightPriority) return leftPriority - rightPriority
  return String(left?.ruleName || '').localeCompare(String(right?.ruleName || ''))
}

function mapPartnerPeopleToLookup(peoplePayload = {}) {
  const groups = peoplePayload?.groups || {}
  const people = Object.values(groups).flatMap((group) => (Array.isArray(group) ? group : []))
  return people.reduce((accumulator, person) => {
    const key = normalizeText(person?.userId || person?.user_id || person?.id)
    if (key) accumulator.set(key, person)
    return accumulator
  }, new Map())
}

function personMatchesTargetRole(person = {}, targetRoleType = '') {
  const role = normalizeRoleType(person.role || person.organisationRole)
  if (!targetRoleType) return true
  if (targetRoleType === PARTNER_ROUTING_ROLE_TYPES.transferAttorney) {
    return ['transfer_attorney', 'attorney', 'conveyancer'].includes(role)
  }
  if (targetRoleType === PARTNER_ROUTING_ROLE_TYPES.bondAttorney) {
    return ['bond_attorney', 'attorney'].includes(role)
  }
  if (targetRoleType === PARTNER_ROUTING_ROLE_TYPES.cancellationAttorney) {
    return ['cancellation_attorney', 'attorney'].includes(role)
  }
  if (targetRoleType === PARTNER_ROUTING_ROLE_TYPES.bondOriginator) {
    return [
      'bond_originator',
      'consultant',
      'bond_consultant',
      'processor',
      'bond_processor',
      'principal',
      'branch_manager',
      'regional_manager',
      'hq_manager',
      'manager',
      'admin_staff',
    ].includes(role)
  }
  if (targetRoleType === PARTNER_ROUTING_ROLE_TYPES.agent) {
    return role === 'agent'
  }
  if (targetRoleType === PARTNER_ROUTING_ROLE_TYPES.developer || targetRoleType === PARTNER_ROUTING_ROLE_TYPES.developerContact) {
    return ['developer', 'developer_contact'].includes(role)
  }
  return true
}

function getRoutingModeForRole(targetRoleType = '') {
  return DIRECT_MODE_BY_ROLE[normalizeRoleType(targetRoleType)] || PARTNER_ROUTING_MODES.directConsultant
}

function buildQueueDecision({ rule = null, input = {}, resolutionScope = 'organisation', fallbackReason = '' } = {}) {
  const fallbackMode = normalizeAssignmentMode(rule?.assignmentMode || rule?.assignment_mode || getRoutingModeForRole(input.targetRoleType))
  const queueMode =
    fallbackMode === PARTNER_ROUTING_MODES.branchQueue ||
    fallbackMode === PARTNER_ROUTING_MODES.teamQueue ||
    fallbackMode === PARTNER_ROUTING_MODES.organisationQueue
      ? fallbackMode
      : PARTNER_ROUTING_MODES.organisationQueue
  return {
    targetOrganisationId: normalizeText(rule?.targetOrganisationId || rule?.target_organisation_id || ''),
    targetRegionId: normalizeText(rule?.targetRegionId || rule?.target_region_id || ''),
    targetBranchId: normalizeText(rule?.targetWorkspaceUnitId || rule?.target_workspace_unit_id || rule?.targetBranchId || rule?.target_branch_id || ''),
    targetTeamId: normalizeText(rule?.targetWorkspaceUnitId || rule?.target_workspace_unit_id || rule?.targetTeamId || rule?.target_team_id || ''),
    targetUserId: null,
    assignmentMode: queueMode,
    resolutionScope,
    routingRuleId: normalizeText(rule?.id || ''),
    relationshipId: normalizeText(rule?.relationshipId || ''),
    confidence: rule ? 0.72 : 0.4,
    fallbackReason: fallbackReason || (rule ? '' : 'No matching partner routing rule found.'),
    targetRoleType: input.targetRoleType,
    fallbackUsed: true,
    resolutionReason: fallbackReason || (rule ? 'Resolved to partner queue.' : 'No matching partner routing rule found.'),
  }
}

function getTargetIdentifiers(rule = {}) {
  const targetScopeType = normalizeTargetScopeType(rule.targetScopeType || rule.target_scope || rule.target_scope_type)
  const targetOrganisationId = normalizeText(rule.targetOrganisationId || rule.target_organisation_id || '')
  const targetRegionId = normalizeText(rule.targetRegionId || rule.target_region_id || (targetScopeType === PARTNER_ROUTING_SOURCE_TYPES.region ? rule.targetScopeId || rule.target_scope_id : ''))
  const targetBranchId = normalizeText(rule.targetBranchId || rule.target_branch_id || rule.targetWorkspaceUnitId || rule.target_workspace_unit_id || (targetScopeType === PARTNER_ROUTING_SOURCE_TYPES.branch ? rule.targetScopeId || rule.target_scope_id : ''))
  const targetTeamId = normalizeText(rule.targetTeamId || rule.target_team_id || rule.targetWorkspaceUnitId || rule.target_workspace_unit_id || (targetScopeType === PARTNER_ROUTING_SOURCE_TYPES.team ? rule.targetScopeId || rule.target_scope_id : ''))
  const targetUserId = normalizeText(rule.targetUserId || rule.target_user_id || rule.targetConsultantUserId || rule.target_consultant_user_id || (targetScopeType === PARTNER_ROUTING_TARGET_TYPES.consultant ? rule.targetScopeId || rule.target_scope_id : ''))
  return {
    targetScopeType,
    targetOrganisationId,
    targetRegionId,
    targetBranchId,
    targetTeamId,
    targetUserId,
  }
}

function getResolutionScopeForRule(rule = {}) {
  return normalizeScopeType(rule.sourceScopeType || rule.source_scope || rule.source_scope_type)
}

function getFallbackResolutionScope(input = {}) {
  return input.targetRoleType ? 'system_fallback' : 'system_fallback'
}

function buildDirectDecision({ rule = null, input = {}, relationshipId = '', resolvedPerson = null } = {}) {
  const {
    targetScopeType,
    targetOrganisationId,
    targetRegionId,
    targetBranchId,
    targetTeamId,
    targetUserId,
  } = getTargetIdentifiers(rule || {})
  const resolutionScope = getResolutionScopeForRule(rule || {})
  const assignmentMode = normalizeAssignmentMode(rule?.assignmentMode || rule?.assignment_mode || getRoutingModeForRole(input.targetRoleType))
  const targetUser = targetUserId ? resolvedPerson || null : null
  return {
    targetOrganisationId,
    targetRegionId,
    targetBranchId,
    targetTeamId,
    targetUserId,
    assignmentMode,
    resolutionScope,
    routingRuleId: normalizeText(rule?.id || ''),
    relationshipId: normalizeText(relationshipId || rule?.relationshipId || ''),
    confidence: targetUserId ? 1 : 0.92,
    fallbackUsed: false,
    resolutionReason: targetUserId
      ? 'Preferred partner found.'
      : targetScopeType === PARTNER_ROUTING_TARGET_TYPES.orgQueue
        ? 'Organisation default resolved to the partner queue.'
        : 'Partner default resolved.',
    targetRoleType: input.targetRoleType,
    targetUser,
  }
}

function buildFallbackDecision({ rule = null, input = {}, resolutionScope = 'system_fallback', fallbackReason = '' } = {}) {
  const queueDecision = buildQueueDecision({ rule, input, resolutionScope, fallbackReason })
  return {
    ...queueDecision,
    targetOrganisationId: queueDecision.targetOrganisationId || normalizeText(rule?.targetOrganisationId || rule?.target_organisation_id || ''),
    targetRegionId: normalizeText(rule?.targetRegionId || rule?.target_region_id || ''),
    targetBranchId: normalizeText(rule?.targetBranchId || rule?.target_branch_id || rule?.targetWorkspaceUnitId || rule?.target_workspace_unit_id || ''),
    targetTeamId: normalizeText(rule?.targetTeamId || rule?.target_team_id || rule?.targetWorkspaceUnitId || rule?.target_workspace_unit_id || ''),
    fallbackUsed: true,
    resolutionReason: fallbackReason || queueDecision.resolutionReason,
  }
}

function buildSystemFallbackDecision({ input = {}, fallbackReason = 'No route available.' } = {}) {
  return {
    targetOrganisationId: '',
    targetRegionId: '',
    targetBranchId: '',
    targetTeamId: '',
    targetUserId: null,
    assignmentMode: PARTNER_ROUTING_MODES.manual,
    resolutionScope: getFallbackResolutionScope(input),
    routingRuleId: '',
    relationshipId: '',
    confidence: 0,
    fallbackUsed: true,
    resolutionReason: fallbackReason,
    targetRoleType: input.targetRoleType,
  }
}

function getRoutingEventWorkspaceId(input = {}, decision = {}) {
  return normalizeText(input.sourceOrganisationId || decision.targetOrganisationId || '')
}

function appendLocalRoutingEvent(workspaceId = '', event = {}) {
  const safeWorkspaceId = normalizeText(workspaceId || 'global')
  const rows = LOCAL_ROUTING_EVENT_STORE.get(safeWorkspaceId) || []
  const next = {
    id: event.id || `routing-event-${Date.now()}-${rows.length + 1}`,
    workspaceId: safeWorkspaceId,
    createdAt: event.createdAt || new Date().toISOString(),
    ...event,
  }
  LOCAL_ROUTING_EVENT_STORE.set(safeWorkspaceId, [next, ...rows].slice(0, MAX_ROUTING_EVENTS))
  return next
}

export function getUniversalPartnerRoutingEvents(workspaceId = '') {
  const safeWorkspaceId = normalizeText(workspaceId || 'global')
  return [...(LOCAL_ROUTING_EVENT_STORE.get(safeWorkspaceId) || [])]
}

export function clearUniversalPartnerRoutingEvents(workspaceId = '') {
  const safeWorkspaceId = normalizeText(workspaceId || 'global')
  LOCAL_ROUTING_EVENT_STORE.delete(safeWorkspaceId)
}

export function compareRoutingDecisions(legacyDecision = {}, universalDecision = {}) {
  const legacySummary = {
    targetOrganisationId: normalizeText(legacyDecision.targetOrganisationId || legacyDecision.organisationId || legacyDecision.partnerOrganisationId || ''),
    targetRegionId: normalizeText(legacyDecision.targetRegionId || legacyDecision.regionId || ''),
    targetBranchId: normalizeText(legacyDecision.targetBranchId || legacyDecision.branchId || ''),
    targetTeamId: normalizeText(legacyDecision.targetTeamId || legacyDecision.teamId || ''),
    targetUserId: normalizeText(legacyDecision.targetUserId || legacyDecision.userId || legacyDecision.consultantId || ''),
    assignmentMode: normalizeAssignmentMode(legacyDecision.assignmentMode || legacyDecision.assignment_method || legacyDecision.method || legacyDecision.routingMethod),
    resolutionScope: normalizeText(legacyDecision.resolutionScope || legacyDecision.scope || legacyDecision.routingMethod || ''),
  }
  const universalSummary = {
    targetOrganisationId: normalizeText(universalDecision.targetOrganisationId || ''),
    targetRegionId: normalizeText(universalDecision.targetRegionId || ''),
    targetBranchId: normalizeText(universalDecision.targetBranchId || ''),
    targetTeamId: normalizeText(universalDecision.targetTeamId || ''),
    targetUserId: normalizeText(universalDecision.targetUserId || ''),
    assignmentMode: normalizeAssignmentMode(universalDecision.assignmentMode || ''),
    resolutionScope: normalizeText(universalDecision.resolutionScope || ''),
  }
  const differences = Object.entries(legacySummary).reduce((accumulator, [key, value]) => {
    if (value !== universalSummary[key]) {
      accumulator[key] = { legacy: value, universal: universalSummary[key] }
    }
    return accumulator
  }, {})
  return {
    status: Object.keys(differences).length ? 'mismatch' : 'match',
    differences,
    legacy: legacySummary,
    universal: universalSummary,
  }
}

export async function recordUniversalPartnerRoutingEvent({
  input = {},
  decision = {},
  legacyDecision = null,
  module = '',
  actorUserId = '',
  workspaceId = '',
  shadow = null,
} = {}) {
  const safeWorkspaceId = normalizeText(workspaceId || getRoutingEventWorkspaceId(input, decision))
  const event = appendLocalRoutingEvent(safeWorkspaceId, {
    module: normalizeText(module || input.module || input.moduleContext?.module || ''),
    actorUserId: normalizeText(actorUserId || input.sourceUserId || ''),
    sourceOrganisationId: normalizeText(input.sourceOrganisationId || ''),
    sourceUserId: normalizeText(input.sourceUserId || ''),
    sourceBranchId: normalizeText(input.sourceBranchId || ''),
    sourceTeamId: normalizeText(input.sourceTeamId || ''),
    sourceRegionId: normalizeText(input.sourceRegionId || ''),
    targetRoleType: normalizeText(input.targetRoleType || ''),
    targetOrganisationId: normalizeText(decision.targetOrganisationId || ''),
    targetRegionId: normalizeText(decision.targetRegionId || ''),
    targetBranchId: normalizeText(decision.targetBranchId || ''),
    targetTeamId: normalizeText(decision.targetTeamId || ''),
    targetUserId: normalizeText(decision.targetUserId || ''),
    routingRuleId: normalizeText(decision.routingRuleId || ''),
    resolutionScope: normalizeText(decision.resolutionScope || ''),
    assignmentMode: normalizeText(decision.assignmentMode || ''),
    fallbackUsed: Boolean(decision.fallbackUsed),
    resolutionReason: normalizeText(decision.resolutionReason || decision.fallbackReason || ''),
    shadow: shadow || (legacyDecision ? compareRoutingDecisions(legacyDecision, decision) : null),
  })

  recordAuditEvent('partner.routing.resolved', {
    workspaceId: safeWorkspaceId,
    module: event.module,
    targetRoleType: event.targetRoleType,
    targetOrganisationId: event.targetOrganisationId,
    targetUserId: event.targetUserId,
    routingRuleId: event.routingRuleId,
    resolutionScope: event.resolutionScope,
    assignmentMode: event.assignmentMode,
    fallbackUsed: event.fallbackUsed,
    resolutionReason: event.resolutionReason,
    shadow: event.shadow,
  })

  void recordSecurityAuditEvent({
    userId: event.actorUserId,
    workspaceId: safeWorkspaceId,
    action: 'partner_routing_resolved',
    targetType: 'partner_routing',
    targetId: event.routingRuleId || event.targetUserId || event.targetOrganisationId || '',
    metadata: {
      module: event.module,
      targetRoleType: event.targetRoleType,
      targetOrganisationId: event.targetOrganisationId,
      targetRegionId: event.targetRegionId,
      targetBranchId: event.targetBranchId,
      targetTeamId: event.targetTeamId,
      targetUserId: event.targetUserId,
      resolutionScope: event.resolutionScope,
      assignmentMode: event.assignmentMode,
      fallbackUsed: event.fallbackUsed,
      resolutionReason: event.resolutionReason,
      shadow: event.shadow,
    },
  }).catch(() => {})

  return event
}

export async function getUniversalPartnerRoutingDiagnosticsSnapshot({
  workspaceId = '',
  routingRules = [],
  since = null,
} = {}) {
  const safeWorkspaceId = normalizeText(workspaceId || 'global')
  const auditEvents = readAuditEvents()
    .filter((event) => {
      const type = normalizeText(event?.type || event?.eventType || '')
      if (type !== 'partner.routing.resolved' && type !== 'partner.routing.shadow') return false
      const eventWorkspaceId = normalizeText(event?.payload?.workspaceId || event?.payload?.workspace_id || '')
      return !safeWorkspaceId || !eventWorkspaceId || eventWorkspaceId === safeWorkspaceId
    })
    .map((event, index) => ({
      id: event?.payload?.id || event?.id || `audit-routing-event-${index}`,
      createdAt: event?.at || event?.createdAt || new Date().toISOString(),
      workspaceId: normalizeText(event?.payload?.workspaceId || event?.payload?.workspace_id || ''),
      ...normalizeText(event?.type || event?.eventType || '') ? { type: normalizeText(event?.type || event?.eventType || '') } : {},
      ...(event?.payload && typeof event.payload === 'object' ? event.payload : {}),
      fallbackUsed: Boolean(event?.payload?.fallbackUsed ?? event?.payload?.fallback_used),
    }))
  const localEvents = getUniversalPartnerRoutingEvents(safeWorkspaceId)
  const events = [...auditEvents, ...localEvents]
  const filteredEvents = since
    ? events.filter((event) => !since || (event.createdAt && new Date(event.createdAt).getTime() >= new Date(since).getTime()))
    : events
  const orderedEvents = [...filteredEvents].sort((left, right) => new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime())
  const activeRules = Array.isArray(routingRules) ? routingRules.filter((rule) => rule && rule.isActive !== false) : []
  const totalRoutes = orderedEvents.length
  const fallbackRoutes = orderedEvents.filter((event) => event.fallbackUsed).length
  const failedRoutes = orderedEvents.filter((event) => !event.targetOrganisationId && !event.targetUserId).length
  const successfulRoutes = totalRoutes - failedRoutes
  const countsByRule = orderedEvents.reduce((accumulator, event) => {
    const ruleId = normalizeText(event.routingRuleId || '')
    if (!ruleId) return accumulator
    accumulator[ruleId] = (accumulator[ruleId] || 0) + 1
    return accumulator
  }, {})
  const mostUsedRules = Object.entries(countsByRule)
    .map(([ruleId, count]) => ({
      ruleId,
      count,
      ruleName: activeRules.find((rule) => normalizeText(rule.id) === ruleId)?.ruleName || activeRules.find((rule) => normalizeText(rule.id) === ruleId)?.rule_name || '',
    }))
    .sort((left, right) => right.count - left.count)
    .slice(0, 5)
  const inactiveRules = activeRules.filter((rule) => rule.isActive === false).length
  const brokenRules = orderedEvents.filter((event) => /inactive|disconnected|unavailable|no route/i.test(event.resolutionReason || '')).length
  return {
    workspaceId: safeWorkspaceId,
    generatedAt: new Date().toISOString(),
    totals: {
      totalRoutes,
      successfulRoutes,
      fallbackRoutes,
      failedRoutes,
      inactiveRules,
      brokenRules,
    },
    mostUsedRules,
    recentEvents: orderedEvents.slice(0, 10),
  }
}

export function inferUniversalPartnerRoutingRoleTypes(moduleContext = {}) {
  const role = normalizeLower(moduleContext.role || moduleContext.appRole || moduleContext.workspaceRole || moduleContext.organisationRole)
  if (role === 'agent') {
    return [
      PARTNER_ROUTING_ROLE_TYPES.bondOriginator,
      PARTNER_ROUTING_ROLE_TYPES.transferAttorney,
      PARTNER_ROUTING_ROLE_TYPES.bondAttorney,
      PARTNER_ROUTING_ROLE_TYPES.cancellationAttorney,
    ]
  }
  if (role === 'bond_originator') {
    return [
      PARTNER_ROUTING_ROLE_TYPES.agent,
      PARTNER_ROUTING_ROLE_TYPES.transferAttorney,
      PARTNER_ROUTING_ROLE_TYPES.bondAttorney,
      PARTNER_ROUTING_ROLE_TYPES.cancellationAttorney,
    ]
  }
  if (role === 'attorney') {
    return [
      PARTNER_ROUTING_ROLE_TYPES.agent,
      PARTNER_ROUTING_ROLE_TYPES.bondOriginator,
      PARTNER_ROUTING_ROLE_TYPES.bondAttorney,
      PARTNER_ROUTING_ROLE_TYPES.cancellationAttorney,
    ]
  }
  return [
    PARTNER_ROUTING_ROLE_TYPES.bondOriginator,
    PARTNER_ROUTING_ROLE_TYPES.transferAttorney,
  ]
}

export function inferPartnerRoutingRoleTypesForTransaction({
  financeType = '',
} = {}) {
  const normalizedFinanceType = normalizeLower(financeType).replace(/[\s-]+/g, '_')
  const roleTypes = [PARTNER_ROUTING_ROLE_TYPES.transferAttorney]

  if (['bond', 'combination', 'hybrid'].includes(normalizedFinanceType)) {
    roleTypes.push(PARTNER_ROUTING_ROLE_TYPES.bondOriginator)
  }

  return [...new Set(roleTypes)]
}

export async function universalPartnerRoutingResolver(input = {}) {
  const normalizedInput = normalizeDecisionInput(input)

  if (normalizedInput.transactionOverride && typeof normalizedInput.transactionOverride === 'object') {
    const override = normalizedInput.transactionOverride
    const decision = {
      targetOrganisationId: normalizeText(override.targetOrganisationId || override.target_organisation_id || ''),
      targetRegionId: normalizeText(override.targetRegionId || override.target_region_id || ''),
      targetBranchId: normalizeText(override.targetBranchId || override.target_branch_id || ''),
      targetTeamId: normalizeText(override.targetTeamId || override.target_team_id || ''),
      targetUserId: normalizeText(override.targetUserId || override.target_user_id || ''),
      assignmentMode: normalizeAssignmentMode(override.assignmentMode || override.assignment_mode || getRoutingModeForRole(normalizedInput.targetRoleType)),
      resolutionScope: 'transaction_override',
      routingRuleId: normalizeText(override.routingRuleId || override.routing_rule_id || ''),
      relationshipId: normalizeText(override.relationshipId || override.relationship_id || ''),
      confidence: 1,
      fallbackUsed: false,
      resolutionReason: 'Transaction override selected.',
      targetRoleType: normalizedInput.targetRoleType,
    }
    await recordUniversalPartnerRoutingEvent({
      input: normalizedInput,
      decision,
      module: normalizedInput.module,
      actorUserId: normalizedInput.sourceUserId,
    })
    return decision
  }

  const targetRoleType = normalizedInput.targetRoleType || PARTNER_ROUTING_ROLE_TYPES.bondOriginator
  const routingRules = Array.isArray(normalizedInput.routingRules) && normalizedInput.routingRules.length
    ? normalizedInput.routingRules
    : await listOrganisationPartnerRoutingRules().catch(() => [])
  const activeRules = routingRules.filter((rule) => rule && rule.isActive !== false)

  const sourceRules = activeRules
    .filter((rule) => ruleMatchesTargetRole(rule, targetRoleType))
    .filter((rule) => ruleMatchesSourceScope(rule, normalizedInput))
    .sort(sortRules)

  const partnerConnections = normalizedInput.partnerConnections && typeof normalizedInput.partnerConnections === 'object'
    ? normalizedInput.partnerConnections
    : normalizedInput.sourceOrganisationId
      ? await listPartnerConnections(normalizedInput.sourceOrganisationId).catch(() => ({ connections: [] }))
      : { connections: [] }
  const connections = Array.isArray(partnerConnections?.connections) ? partnerConnections.connections : []
  const hasConnectionData = hasLoadedPartnerConnections(partnerConnections)
  const connectionByOrganisationId = new Map()
  connections
    .filter((connection) => connection.status === 'connected')
    .forEach((connection) => {
      const organisationId = normalizeText(connection.partnerOrganizationId || connection.partnerOrganisationId)
      if (!organisationId || connectionByOrganisationId.has(organisationId)) return
      connectionByOrganisationId.set(organisationId, connection)
    })

  let connectionFailureReason = ''
  for (const rule of sourceRules) {
    const targetIdentifiers = getTargetIdentifiers(rule)
    if (!targetIdentifiers.targetOrganisationId) continue
    const connection = connectionByOrganisationId.get(targetIdentifiers.targetOrganisationId)
    if (!connection && hasConnectionData) {
      connectionFailureReason = 'This organisation is not connected as a partner yet.'
      continue
    }
    if (connection && !partnerConnectionSupportsRoleType(connection, targetRoleType)) {
      connectionFailureReason = 'This connected partner does not offer the requested service.'
      continue
    }

    const peopleCache = normalizedInput.partnerPeopleByRelationshipId || {}
    const relationshipId = normalizeText(connection?.id || connection?.relationshipId || rule?.relationshipId || rule?.relationship_id || '')
    const peoplePayload =
      relationshipId
        ? peopleCache[relationshipId] ||
          (await getBondPartnerPeople(relationshipId).catch(() => null))
        : null
    const peopleLookup = peoplePayload ? mapPartnerPeopleToLookup(peoplePayload) : new Map()
    const resolvedPerson = targetIdentifiers.targetUserId ? peopleLookup.get(targetIdentifiers.targetUserId) || null : null
    const canUseTargetPerson =
      targetIdentifiers.targetUserId &&
      resolvedPerson &&
      resolvedPerson.isActive !== false &&
      personMatchesTargetRole(resolvedPerson, targetRoleType)
    const scopeName = getResolutionScopeForRule(rule)

    if (canUseTargetPerson) {
      const decision = {
        ...buildDirectDecision({ rule, input: normalizedInput, relationshipId, resolvedPerson }),
        targetOrganisationId: targetIdentifiers.targetOrganisationId,
        targetRegionId: normalizeText(resolvedPerson?.regionId || targetIdentifiers.targetRegionId || ''),
        targetBranchId: normalizeText(resolvedPerson?.branchId || targetIdentifiers.targetBranchId || ''),
        targetTeamId: normalizeText(resolvedPerson?.teamId || targetIdentifiers.targetTeamId || ''),
        targetUserId: targetIdentifiers.targetUserId,
        resolutionScope: scopeName,
        fallbackUsed: false,
        resolutionReason: `${scopeName.replace(/_/g, ' ')} preferred partner found.`,
        targetRoleType,
        targetOrganisationName: normalizeText(
          connection?.partnerName ||
          connection?.companyName ||
          rule?.targetOrganisationName ||
          rule?.target_organisation_name,
        ),
        targetUserLabel: normalizeText(
          resolvedPerson?.fullName ||
          resolvedPerson?.label ||
          rule?.targetScopeName ||
          rule?.target_scope_name,
        ),
        confidence: resolvedPerson ? 1 : 0.88,
      }
      await recordUniversalPartnerRoutingEvent({
        input: normalizedInput,
        decision,
        module: normalizedInput.module,
        actorUserId: normalizedInput.sourceUserId,
      })
      return decision
    }

    const fallbackReason = targetIdentifiers.targetUserId
      ? 'Preferred person could not be validated as active for this service, so the work falls back to the partner organisation queue.'
      : 'No preferred person selected, so the work falls back to the partner organisation queue.'
    const decision = {
      ...buildFallbackDecision({
        rule: {
          ...rule,
          targetOrganisationId: targetIdentifiers.targetOrganisationId,
          targetRegionId: targetIdentifiers.targetRegionId,
          targetBranchId: targetIdentifiers.targetBranchId,
          targetTeamId: targetIdentifiers.targetTeamId,
          relationshipId,
        },
        input: normalizedInput,
        resolutionScope: scopeName,
        fallbackReason,
      }),
      targetOrganisationId: targetIdentifiers.targetOrganisationId,
      targetRegionId: targetIdentifiers.targetRegionId,
      targetBranchId: targetIdentifiers.targetBranchId,
      targetTeamId: targetIdentifiers.targetTeamId,
      resolutionScope: scopeName,
      routingRuleId: normalizeText(rule.id),
      relationshipId,
      confidence: 0.8,
      fallbackUsed: true,
      resolutionReason: fallbackReason,
      targetRoleType,
      targetOrganisationName: normalizeText(
        connection?.partnerName ||
        connection?.companyName ||
        rule?.targetOrganisationName ||
        rule?.target_organisation_name,
      ),
      targetUserLabel: normalizeText(rule?.targetScopeName || rule?.target_scope_name),
    }
    await recordUniversalPartnerRoutingEvent({
      input: normalizedInput,
      decision,
      module: normalizedInput.module,
      actorUserId: normalizedInput.sourceUserId,
    })
    return decision
  }

  const systemFallbackDecision = buildSystemFallbackDecision({
    input: normalizedInput,
    fallbackReason: connectionFailureReason || 'No matching partner routing rule found.',
  })
  await recordUniversalPartnerRoutingEvent({
    input: normalizedInput,
    decision: systemFallbackDecision,
    module: normalizedInput.module,
    actorUserId: normalizedInput.sourceUserId,
  })
  return {
    ...systemFallbackDecision,
    targetRoleType,
  }
}

export async function resolvePartnerRoutingSelections(input = {}) {
  const normalizedInput = normalizeDecisionInput(input)
  const moduleContext = normalizedInput.moduleContext || {}
  const targetRoleTypes = Array.isArray(input.targetRoleTypes) && input.targetRoleTypes.length
    ? input.targetRoleTypes.map(normalizeRoleType).filter(Boolean)
    : inferUniversalPartnerRoutingRoleTypes(moduleContext)

  const selections = []
  for (const targetRoleType of targetRoleTypes) {
    const decision = await universalPartnerRoutingResolver({ ...normalizedInput, targetRoleType })
    if (!decision?.targetOrganisationId && !decision?.targetUserId) continue
    selections.push({
      roleType: targetRoleType,
      source: 'partner_routing_rule',
      selectionSource: 'partner_routing_rule',
      assignmentStatus: decision.targetUserId ? 'assigned' : 'pending_assignment',
      relationshipId: decision.relationshipId || null,
      partnerRelationshipId: decision.relationshipId || null,
      organisationId: decision.targetOrganisationId || null,
      partnerOrganisationId: decision.targetOrganisationId || null,
      regionId: decision.targetRegionId || null,
      targetRegionId: decision.targetRegionId || null,
      userId: decision.targetUserId || null,
      targetUserId: decision.targetUserId || null,
      branchId: decision.targetBranchId || null,
      targetBranchId: decision.targetBranchId || null,
      teamId: decision.targetTeamId || null,
      targetTeamId: decision.targetTeamId || null,
      assignmentMode: decision.assignmentMode || getRoutingModeForRole(targetRoleType),
      resolutionScope: decision.resolutionScope || 'organisation',
      routingRuleId: decision.routingRuleId || null,
      confidence: Number(decision.confidence || 0),
      fallbackUsed: Boolean(decision.fallbackUsed),
      resolutionReason: decision.resolutionReason || decision.fallbackReason || '',
      fallbackReason: decision.resolutionReason || decision.fallbackReason || '',
      companyName: decision.targetOrganisationName || ROLE_LABELS[targetRoleType] || targetRoleType,
      contactPerson:
        decision.targetUser?.fullName ||
        decision.targetUserLabel ||
        decision.targetOrganisationName ||
        ROLE_LABELS[targetRoleType] ||
        targetRoleType,
      email: decision.targetUser?.email || '',
      phone: decision.targetUser?.phone || '',
      snapshot: {
        source: 'partner_routing_rule',
        resolutionScope: decision.resolutionScope || 'organisation',
        routingRuleId: decision.routingRuleId || null,
        confidence: Number(decision.confidence || 0),
        fallbackUsed: Boolean(decision.fallbackUsed),
        resolutionReason: decision.resolutionReason || decision.fallbackReason || '',
        targetOrganisationName: decision.targetOrganisationName || '',
        targetUserLabel: decision.targetUser?.fullName || decision.targetUserLabel || '',
      },
    })
  }
  return selections
}

export async function resolvePartnerRoutingForTransaction(input = {}) {
  const decision = await universalPartnerRoutingResolver({
    ...input,
    targetRoleType: input.targetRoleType,
    module: input.module || 'agent_transaction_creation',
    moduleContext: {
      ...(input.moduleContext && typeof input.moduleContext === 'object' ? input.moduleContext : {}),
      dealType: input.dealType || input.transactionType || '',
      financeType: input.financeType || '',
      propertyType: input.propertyType || '',
    },
  })

  return {
    roleType: normalizeRoleType(input.targetRoleType),
    targetOrganisationId: normalizeText(decision?.targetOrganisationId || ''),
    targetUserId: normalizeText(decision?.targetUserId || ''),
    resolutionSource: normalizeText(decision?.resolutionScope || decision?.assignmentMode || ''),
    confidence: Number(decision?.confidence || 0),
    requiresManualSelection: Boolean(!decision?.targetOrganisationId && !decision?.targetUserId),
    routingRuleId: normalizeText(decision?.routingRuleId || ''),
    assignmentMode: normalizeText(decision?.assignmentMode || ''),
    relationshipId: normalizeText(decision?.relationshipId || ''),
    fallbackUsed: Boolean(decision?.fallbackUsed),
    resolutionReason: normalizeText(decision?.resolutionReason || decision?.fallbackReason || ''),
    targetOrganisationName: normalizeText(decision?.targetOrganisationName || ''),
    targetUserLabel: normalizeText(decision?.targetUser?.fullName || decision?.targetUserLabel || ''),
    targetUserEmail: normalizeText(decision?.targetUser?.email || ''),
    targetUserPhone: normalizeText(decision?.targetUser?.phone || ''),
    targetBranchId: normalizeText(decision?.targetBranchId || ''),
    targetTeamId: normalizeText(decision?.targetTeamId || ''),
    targetRegionId: normalizeText(decision?.targetRegionId || ''),
  }
}

export const universalPreferredPartnerResolver = universalPartnerRoutingResolver

export const UniversalPartnerRoutingService = Object.freeze({
  universalPartnerRoutingResolver,
  resolvePartnerRoutingSelections,
  inferUniversalPartnerRoutingRoleTypes,
  inferPartnerRoutingRoleTypesForTransaction,
  resolvePartnerRoutingForTransaction,
  compareRoutingDecisions,
  recordUniversalPartnerRoutingEvent,
  getUniversalPartnerRoutingDiagnosticsSnapshot,
  getUniversalPartnerRoutingEvents,
  clearUniversalPartnerRoutingEvents,
})

export const __partnerRoutingResolverServiceTestUtils = Object.freeze({
  DEFAULT_SCOPE_PRIORITY,
  DIRECT_MODE_BY_ROLE,
  getRoutingModeForRole,
  mapPartnerPeopleToLookup,
  normalizeAssignmentMode,
  normalizeDecisionInput,
  normalizeRoleType,
  normalizeScopeType,
  normalizePartnerConnections,
  personMatchesTargetRole,
  ruleMatchesSourceScope,
  ruleMatchesTargetRole,
  sortRules,
  getTargetIdentifiers,
  buildSystemFallbackDecision,
})
