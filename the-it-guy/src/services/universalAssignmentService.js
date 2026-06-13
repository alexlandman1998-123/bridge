import { readAuditEvents, recordAuditEvent } from '../lib/activityAudit'
import { recordSecurityAuditEvent } from './auditLogService'

export const UNIVERSAL_ASSIGNMENT_METHODS = Object.freeze({
  manual: 'manual',
  partnerRouting: 'partner_routing',
  queueAllocation: 'queue_allocation',
  systemGenerated: 'system_generated',
  workflowGenerated: 'workflow_generated',
  managerAssignment: 'manager_assignment',
  bulkAssignment: 'bulk_assignment',
  reassignment: 'reassignment',
  transfer: 'transfer',
  remove: 'remove',
  accept: 'accept',
  decline: 'decline',
})

export const UNIVERSAL_ASSIGNMENT_EVENT_TYPES = Object.freeze({
  created: 'assignment.created',
  reassigned: 'assignment.reassigned',
  transferred: 'assignment.transferred',
  removed: 'assignment.removed',
  returnedToQueue: 'assignment.returned_to_queue',
  queueAllocated: 'assignment.queue_allocated',
  accepted: 'assignment.accepted',
  declined: 'assignment.declined',
})

const LOCAL_ASSIGNMENT_EVENT_STORE = new Map()
const MAX_ASSIGNMENT_EVENTS = 250

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase()
}

function safeNowIso() {
  return new Date().toISOString()
}

function normalizeMethod(value = '') {
  const normalized = normalizeLower(value).replace(/[\s-]+/g, '_')
  if (!normalized) return UNIVERSAL_ASSIGNMENT_METHODS.manual
  if (Object.values(UNIVERSAL_ASSIGNMENT_METHODS).includes(normalized)) return normalized
  if (normalized === 'partner_default') return UNIVERSAL_ASSIGNMENT_METHODS.partnerRouting
  if (normalized.includes('partner')) return UNIVERSAL_ASSIGNMENT_METHODS.partnerRouting
  if (normalized === 'manual_agent' || normalized === 'manual_user') return UNIVERSAL_ASSIGNMENT_METHODS.manual
  if (normalized === 'manual_queue') return UNIVERSAL_ASSIGNMENT_METHODS.queueAllocation
  if (normalized === 'auto') return UNIVERSAL_ASSIGNMENT_METHODS.systemGenerated
  if (normalized === 'transaction_direct' || normalized === 'connected_partner' || normalized === 'direct') return UNIVERSAL_ASSIGNMENT_METHODS.workflowGenerated
  if (normalized === 'queue') return UNIVERSAL_ASSIGNMENT_METHODS.queueAllocation
  if (normalized === 'system') return UNIVERSAL_ASSIGNMENT_METHODS.systemGenerated
  if (normalized === 'workflow') return UNIVERSAL_ASSIGNMENT_METHODS.workflowGenerated
  if (normalized === 'manager') return UNIVERSAL_ASSIGNMENT_METHODS.managerAssignment
  if (normalized === 'bulk') return UNIVERSAL_ASSIGNMENT_METHODS.bulkAssignment
  return normalized
}

function normalizeEventType(value = '') {
  const normalized = normalizeLower(value).replace(/[\s-]+/g, '_')
  if (Object.values(UNIVERSAL_ASSIGNMENT_EVENT_TYPES).includes(normalized)) return normalized
  if (normalized === 'assigned') return UNIVERSAL_ASSIGNMENT_EVENT_TYPES.created
  if (normalized === 'updated') return UNIVERSAL_ASSIGNMENT_EVENT_TYPES.reassigned
  if (normalized === 'transferred') return UNIVERSAL_ASSIGNMENT_EVENT_TYPES.transferred
  if (normalized === 'removed') return UNIVERSAL_ASSIGNMENT_EVENT_TYPES.removed
  return normalized || UNIVERSAL_ASSIGNMENT_EVENT_TYPES.created
}

function normalizeAssignmentStatus(value = '') {
  const normalized = normalizeLower(value).replace(/[\s-]+/g, '_')
  if (['active', 'pending', 'removed', 'completed', 'declined', 'accepted'].includes(normalized)) return normalized
  return normalized || 'active'
}

function getWorkspaceKey(workspaceId = '', organizationId = '') {
  return normalizeText(workspaceId || organizationId || 'global')
}

function appendLocalEvent(event = {}) {
  const key = getWorkspaceKey(event.workspaceId, event.organizationId)
  const existing = LOCAL_ASSIGNMENT_EVENT_STORE.get(key) || []
  const next = [event, ...existing].slice(0, MAX_ASSIGNMENT_EVENTS)
  LOCAL_ASSIGNMENT_EVENT_STORE.set(key, next)
  return event
}

function normalizeAssignmentRequest(input = {}) {
  const organisationId = normalizeText(
    input.organisationId ||
      input.organisation_id ||
      input.sourceOrganisationId ||
      input.source_organisation_id ||
      input.workspaceId ||
      input.workspace_id,
  )
  const regionId = normalizeText(input.regionId || input.region_id || input.sourceRegionId || input.source_region_id)
  const branchId = normalizeText(input.branchId || input.branch_id || input.sourceBranchId || input.source_branch_id)
  const teamId = normalizeText(input.teamId || input.team_id || input.sourceTeamId || input.source_team_id)
  const itemType = normalizeText(input.itemType || input.item_type || input.sourceItemType || input.source_item_type)
  const itemId = normalizeText(input.itemId || input.item_id || input.sourceItemId || input.source_item_id)
  const assignedUserId = normalizeText(input.assignedUserId || input.assigned_user_id || input.targetUserId || input.target_user_id)
  const previousOwnerId = normalizeText(input.previousOwnerId || input.previous_owner_id || input.previousAssignedUserId || input.previous_assigned_user_id)
  const assignedQueueId = normalizeText(input.assignedQueueId || input.assigned_queue_id || input.queueId || input.queue_id)
  const targetOrganisationId = normalizeText(input.targetOrganisationId || input.target_organisation_id || organisationId)
  const targetRegionId = normalizeText(input.targetRegionId || input.target_region_id || '')
  const targetBranchId = normalizeText(input.targetBranchId || input.target_branch_id || '')
  const targetTeamId = normalizeText(input.targetTeamId || input.target_team_id || '')
  const routingRuleId = normalizeText(input.routingRuleId || input.routing_rule_id || input.ruleId || input.rule_id)
  const transactionId = normalizeText(input.transactionId || input.transaction_id)
  const developmentId = normalizeText(input.developmentId || input.development_id)
  const sourceModule = normalizeText(input.sourceModule || input.source_module || input.module)
  const sourceEvent = normalizeText(input.sourceEvent || input.source_event || input.eventType)
  const reason = normalizeText(input.reason || input.assignmentReason || input.assignment_reason)
  const assignmentMethod = normalizeMethod(input.assignmentMethod || input.assignment_method)
  const assignmentStatus = normalizeAssignmentStatus(input.assignmentStatus || input.assignment_status)
  const fallbackUsed = input.fallbackUsed === true || input.fallback_used === true
  const resolutionScope = normalizeText(input.resolutionScope || input.resolution_scope)
  const confidence = Number.isFinite(Number(input.confidence)) ? Number(input.confidence) : null
  const actorUserId = normalizeText(input.actorUserId || input.actor_user_id || input.assignedBy || input.assigned_by)
  const sourceWorkspaceId = normalizeText(input.workspaceId || input.workspace_id)
  const metadata = input.metadata && typeof input.metadata === 'object' && !Array.isArray(input.metadata) ? input.metadata : {}

  return {
    itemType,
    itemId,
    organisationId,
    regionId,
    branchId,
    teamId,
    assignedUserId,
    previousOwnerId,
    assignedQueueId,
    targetOrganisationId,
    targetRegionId,
    targetBranchId,
    targetTeamId,
    routingRuleId,
    transactionId,
    developmentId,
    sourceModule,
    sourceEvent,
    reason,
    assignmentMethod,
    assignmentStatus,
    fallbackUsed,
    resolutionScope,
    confidence,
    actorUserId,
    workspaceId: sourceWorkspaceId || organisationId,
    metadata,
  }
}

function buildAssignmentEvent(eventType = '', payload = {}, previousAssignment = null) {
  const normalizedPayload = normalizeAssignmentRequest(payload)
  const now = safeNowIso()
  const event = {
    id: `${normalizeEventType(eventType)}:${normalizedPayload.itemType || 'assignment'}:${normalizedPayload.itemId || now}:${now}`,
    type: normalizeEventType(eventType),
    at: now,
    workspaceId: normalizedPayload.workspaceId || normalizedPayload.organisationId || null,
    organizationId: normalizedPayload.organisationId || null,
    payload: {
      ...normalizedPayload,
      previousOwnerId: normalizedPayload.previousOwnerId || normalizeText(previousAssignment?.assignedUserId || previousAssignment?.ownerId),
      previousQueueId: normalizeText(previousAssignment?.assignedQueueId || previousAssignment?.queueId),
    },
  }
  return event
}

export function compareAssignmentDecisions(legacyDecision = {}, universalDecision = {}) {
  const keys = ['itemType', 'itemId', 'assignedUserId', 'assignedQueueId', 'assignmentMethod', 'organisationId', 'regionId', 'branchId', 'teamId', 'resolutionScope']
  const differences = keys.reduce((accumulator, key) => {
    const legacyValue = legacyDecision?.[key] ?? null
    const universalValue = universalDecision?.[key] ?? null
    if (normalizeText(legacyValue) !== normalizeText(universalValue)) {
      accumulator[key] = { legacy: legacyValue ?? null, universal: universalValue ?? null }
    }
    return accumulator
  }, {})

  return {
    status: Object.keys(differences).length ? 'mismatch' : 'match',
    differences,
  }
}

export function getUniversalAssignmentEvents({ workspaceId = '', organizationId = '', itemType = '', itemId = '' } = {}) {
  const key = getWorkspaceKey(workspaceId, organizationId)
  const list = LOCAL_ASSIGNMENT_EVENT_STORE.get(key) || []
  return list.filter((event) => {
    if (itemType && normalizeText(event.payload?.itemType) !== normalizeText(itemType)) return false
    if (itemId && normalizeText(event.payload?.itemId) !== normalizeText(itemId)) return false
    return true
  })
}

export function clearUniversalAssignmentEvents({ workspaceId = '', organizationId = '' } = {}) {
  const key = getWorkspaceKey(workspaceId, organizationId)
  LOCAL_ASSIGNMENT_EVENT_STORE.delete(key)
}

export async function recordUniversalAssignmentEvent(eventType = '', payload = {}, previousAssignment = null) {
  const normalizedType = normalizeEventType(eventType)
  if (!normalizedType) return null
  const event = appendLocalEvent(buildAssignmentEvent(normalizedType, payload, previousAssignment))
  recordAuditEvent(normalizedType, event.payload)
  try {
    await recordSecurityAuditEvent({
      userId: event.payload.actorUserId || event.payload.assignedBy || '',
      workspaceId: event.workspaceId || '',
      action: normalizedType,
      targetType: event.payload.itemType || 'assignment',
      targetId: event.payload.itemId || '',
      metadata: {
        ...event.payload,
        previousOwnerId: event.payload.previousOwnerId || null,
        previousQueueId: event.payload.previousQueueId || null,
      },
    })
  } catch (error) {
    console.warn('[universalAssignmentService] security audit skipped', error)
  }
  return event
}

export function normalizeUniversalAssignmentHistory(event = {}) {
  return {
    id: normalizeText(event.id),
    type: normalizeText(event.type),
    at: normalizeText(event.at),
    workspaceId: normalizeText(event.workspaceId),
    organizationId: normalizeText(event.organizationId),
    payload: event.payload && typeof event.payload === 'object' ? event.payload : {},
  }
}

export function getUniversalAssignmentDiagnosticsSnapshot({ workspaceId = '', organizationId = '', itemType = '', itemId = '' } = {}) {
  const events = getUniversalAssignmentEvents({ workspaceId, organizationId, itemType, itemId }).map(normalizeUniversalAssignmentHistory)
  const totals = events.reduce(
    (accumulator, event) => {
      accumulator.totalEvents += 1
      accumulator.byType[event.type] = (accumulator.byType[event.type] || 0) + 1
      accumulator.byMethod[event.payload?.assignmentMethod || 'manual'] = (accumulator.byMethod[event.payload?.assignmentMethod || 'manual'] || 0) + 1
      if (event.payload?.assignedUserId) accumulator.assignedToUser += 1
      if (event.payload?.assignedQueueId) accumulator.assignedToQueue += 1
      if (event.payload?.fallbackUsed) accumulator.fallbacks += 1
      return accumulator
    },
    {
      totalEvents: 0,
      byType: {},
      byMethod: {},
      assignedToUser: 0,
      assignedToQueue: 0,
      fallbacks: 0,
    },
  )

  const latestByItem = events.reduce((accumulator, event) => {
    const key = `${event.payload?.itemType || 'assignment'}:${event.payload?.itemId || 'unknown'}`
    const existing = accumulator[key]
    if (!existing || existing.at <= event.at) {
      accumulator[key] = event
    }
    return accumulator
  }, {})

  return {
    workspaceId: normalizeText(workspaceId || organizationId),
    totals,
    latestAssignments: Object.values(latestByItem),
    recentEvents: [...events].sort((left, right) => String(right.at).localeCompare(String(left.at))).slice(0, 20),
    auditEvents: readAuditEvents().slice(0, 20),
  }
}

export async function createUniversalAssignment(request = {}, options = {}) {
  const normalizedRequest = normalizeAssignmentRequest(request)
  const eventType = options.eventType || (normalizedRequest.previousOwnerId || normalizedRequest.previousQueueId ? UNIVERSAL_ASSIGNMENT_EVENT_TYPES.reassigned : UNIVERSAL_ASSIGNMENT_EVENT_TYPES.created)
  const event = await recordUniversalAssignmentEvent(eventType, {
    ...normalizedRequest,
    sourceModule: options.sourceModule || normalizedRequest.sourceModule,
    sourceEvent: options.sourceEvent || normalizedRequest.sourceEvent,
    metadata: {
      ...normalizedRequest.metadata,
      ...(options.metadata && typeof options.metadata === 'object' ? options.metadata : {}),
    },
  }, options.previousAssignment || null)

  return {
    assignment: {
      ...normalizedRequest,
      assignedAt: event?.at || safeNowIso(),
      currentOwnerId: normalizedRequest.assignedUserId || normalizedRequest.assignedQueueId || normalizedRequest.targetOrganisationId || null,
      assignmentEventId: event?.id || null,
    },
    event,
  }
}

export async function reassignUniversalAssignment(request = {}, options = {}) {
  return createUniversalAssignment(
    {
      ...request,
      assignmentMethod: request.assignmentMethod || UNIVERSAL_ASSIGNMENT_METHODS.reassignment,
    },
    {
      ...options,
      eventType: UNIVERSAL_ASSIGNMENT_EVENT_TYPES.reassigned,
    },
  )
}

export async function transferUniversalAssignment(request = {}, options = {}) {
  return createUniversalAssignment(
    {
      ...request,
      assignmentMethod: request.assignmentMethod || UNIVERSAL_ASSIGNMENT_METHODS.transfer,
    },
    {
      ...options,
      eventType: UNIVERSAL_ASSIGNMENT_EVENT_TYPES.transferred,
    },
  )
}

export async function removeUniversalAssignment(request = {}, options = {}) {
  return createUniversalAssignment(
    {
      ...request,
      assignmentMethod: request.assignmentMethod || UNIVERSAL_ASSIGNMENT_METHODS.remove,
      assignedUserId: null,
      assignedQueueId: null,
    },
    {
      ...options,
      eventType: UNIVERSAL_ASSIGNMENT_EVENT_TYPES.removed,
    },
  )
}

export async function returnUniversalAssignmentToQueue(request = {}, options = {}) {
  return createUniversalAssignment(
    {
      ...request,
      assignmentMethod: request.assignmentMethod || UNIVERSAL_ASSIGNMENT_METHODS.queueAllocation,
    },
    {
      ...options,
      eventType: UNIVERSAL_ASSIGNMENT_EVENT_TYPES.returnedToQueue,
    },
  )
}

export const UniversalAssignmentService = {
  compareAssignmentDecisions,
  createUniversalAssignment,
  clearUniversalAssignmentEvents,
  getUniversalAssignmentDiagnosticsSnapshot,
  getUniversalAssignmentEvents,
  normalizeAssignmentRequest,
  recordUniversalAssignmentEvent,
  reassignUniversalAssignment,
  removeUniversalAssignment,
  returnUniversalAssignmentToQueue,
  transferUniversalAssignment,
}

export default UniversalAssignmentService
