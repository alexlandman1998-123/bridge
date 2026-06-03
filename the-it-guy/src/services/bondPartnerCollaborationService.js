import {
  ALL_BOND_ORGANISATION_SCOPE,
  BOND_ORGANISATION_LEVELS,
  resolveBondOrganisationScope,
} from './bondOrganisationScopeResolver'
import { getPartnerPortalOperationalRows } from './bondPartnerPortalService'

export const BOND_PARTNER_REQUEST_TYPES = Object.freeze({
  comment: 'comment',
  documentReview: 'document_review',
  supportTicket: 'support_ticket',
  escalation: 'escalation',
})

export const BOND_PARTNER_REQUEST_STATUSES = Object.freeze({
  new: 'new',
  assigned: 'assigned',
  inProgress: 'in_progress',
  waitingOnPartner: 'waiting_on_partner',
  resolved: 'resolved',
  closed: 'closed',
})

export const BOND_PARTNER_REQUEST_EVENTS = Object.freeze({
  created: 'PARTNER_REQUEST_CREATED',
  assigned: 'PARTNER_REQUEST_ASSIGNED',
  replied: 'PARTNER_REQUEST_REPLIED',
  documentAccepted: 'PARTNER_DOCUMENT_ACCEPTED',
  documentRejected: 'PARTNER_DOCUMENT_REJECTED',
  supportResolved: 'PARTNER_SUPPORT_RESOLVED',
  slaBreached: 'SLA_BREACHED',
  escalated: 'REQUEST_ESCALATED',
})

const LOCAL_REQUEST_STORE = new Map()
const LOCAL_REPLY_STORE = new Map()
const LOCAL_INTERNAL_NOTE_STORE = new Map()
const LOCAL_ACTIVITY_STORE = new Map()
const LOCAL_NOTIFICATION_STORE = new Map()
let localSequence = 0

const PRIORITY_WEIGHT = Object.freeze({ urgent: 4, high: 3, normal: 2, low: 1 })
const SLA_HOURS_BY_TYPE = Object.freeze({
  [BOND_PARTNER_REQUEST_TYPES.documentReview]: 8,
  [BOND_PARTNER_REQUEST_TYPES.escalation]: 4,
  complaint: 2,
  urgent: 2,
  high: 4,
  [BOND_PARTNER_REQUEST_TYPES.comment]: 24,
  [BOND_PARTNER_REQUEST_TYPES.supportTicket]: 24,
  general: 24,
})

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase()
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : []
}

function createId(prefix = 'partner-request') {
  localSequence += 1
  return `${prefix}-${Date.now().toString(36)}-${localSequence}`
}

function getWorkspaceKey(context = {}, options = {}) {
  return normalizeText(
    options.workspaceId ||
      context.workspaceId ||
      context.currentWorkspace?.id ||
      context.workspace?.id ||
      context.currentMembership?.workspaceId ||
      context.currentMembership?.organisation_id ||
      context.currentMembership?.organisationId ||
      'default',
  )
}

function getLocalRows(store, workspaceKey = '') {
  return [...(store.get(workspaceKey) || [])]
}

function setLocalRows(store, workspaceKey = '', rows = []) {
  store.set(workspaceKey, rows)
}

function getRowId(row = {}) {
  return normalizeText(row.id || row.applicationId || row.application_id || row.transactionId || row.transaction_id || row.key)
}

function getApplicationId(row = {}) {
  return getRowId(row)
}

function getApplicationPartnerId(row = {}) {
  return normalizeText(row.partnerId || row.partner_id || row.bondPartnerId || row.bond_partner_id || row.agencyId || row.agency_id || row.developmentId || row.development_id)
}

function getApplicationPartnerName(row = {}) {
  return normalizeText(row.partnerName || row.partner_name || row.agencyName || row.agency_name || row.developmentName || row.development_name)
}

function getApplicationBranchId(row = {}) {
  return normalizeText(row.assignedBranchId || row.assigned_branch_id || row.branchId || row.branch_id || row.workspaceUnitId || row.workspace_unit_id)
}

function getApplicationRegionId(row = {}) {
  return normalizeText(row.assignedRegionId || row.assigned_region_id || row.regionId || row.region_id)
}

function getApplicationConsultantId(row = {}) {
  return normalizeText(row.assignedConsultantId || row.assigned_consultant_id || row.assignedUserId || row.assigned_user_id || row.ownerUserId || row.owner_user_id)
}

function getApplicationReference(row = {}) {
  return normalizeText(row.applicationReference || row.application_reference || row.transactionReference || row.transaction_reference || getApplicationId(row)) || 'Application'
}

function getApplicationBuyer(row = {}) {
  return normalizeText(row.buyer || row.buyerName || row.client || row.clientName || row.buyer?.name) || 'Buyer pending'
}

function getApplicationProperty(row = {}) {
  return normalizeText(row.property || row.propertyAddress || row.property_address || row.address) || 'Property pending'
}

function getActorId(context = {}) {
  return normalizeText(context.userId || context.user?.id || context.profile?.id || context.currentMembership?.userId || context.currentMembership?.user_id)
}

function getActorName(context = {}) {
  return normalizeText(context.name || context.user?.name || context.profile?.full_name || context.profile?.email || context.email || getActorId(context)) || 'Internal user'
}

function resolveScope(context = {}, data = {}) {
  return resolveBondOrganisationScope(context, {
    regions: data.regions || [],
    branches: data.branches || data.units || [],
    consultants: data.consultants || data.users || [],
    applications: data.applications || [],
  })
}

function valueInScope(value = '', scopedIds) {
  if (scopedIds === ALL_BOND_ORGANISATION_SCOPE) return true
  return normalizeArray(scopedIds).includes(normalizeText(value))
}

function findPartnerForApplication(application = {}, rows = {}) {
  const partnerId = getApplicationPartnerId(application)
  const partnerName = normalizeLower(getApplicationPartnerName(application))
  return normalizeArray(rows.partners).find((row) => (
    (partnerId && normalizeText(row.id) === partnerId) ||
    (partnerName && normalizeLower(row.name) === partnerName)
  )) || null
}

function findApplication(applicationId = '', rows = {}) {
  const id = normalizeText(applicationId)
  return normalizeArray(rows.applications).find((row) => getApplicationId(row) === id) || {}
}

function addHours(dateValue = '', hours = 24) {
  const date = dateValue ? new Date(dateValue) : new Date()
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date
  return new Date(safeDate.getTime() + Number(hours || 0) * 60 * 60 * 1000).toISOString()
}

function getSlaHours(input = {}) {
  const type = normalizeLower(input.requestType || input.type)
  const priority = normalizeLower(input.priority)
  const supportType = normalizeLower(input.supportType)
  return SLA_HOURS_BY_TYPE[priority] || SLA_HOURS_BY_TYPE[supportType] || SLA_HOURS_BY_TYPE[type] || 24
}

function calculateDueAt(source = {}, createdAt = '') {
  return addHours(createdAt || source.createdAt || source.created_at || source.uploadedAt || source.uploaded_at, getSlaHours(source))
}

function normalizeRequest(row = {}, rows = {}) {
  const application = row.application || findApplication(row.applicationId, rows)
  const partner = row.partner || findPartnerForApplication(application, rows) || normalizeArray(rows.partners).find((candidate) => normalizeText(candidate.id) === normalizeText(row.partnerId)) || {}
  const createdAt = normalizeText(row.createdAt || row.created_at) || new Date().toISOString()
  const requestType = normalizeLower(row.requestType || row.request_type || row.type) || BOND_PARTNER_REQUEST_TYPES.supportTicket
  const priority = normalizeLower(row.priority) || 'normal'
  const dueAt = normalizeText(row.dueAt || row.due_at) || calculateDueAt({ ...row, requestType, priority }, createdAt)
  return {
    ...row,
    id: normalizeText(row.id) || createId('partner-request'),
    organisationId: normalizeText(row.organisationId || row.organisation_id),
    partnerId: normalizeText(row.partnerId || row.partner_id || partner.id),
    partnerName: normalizeText(row.partnerName || row.partner_name || partner.name) || 'Partner',
    applicationId: normalizeText(row.applicationId || row.application_id || getApplicationId(application)),
    applicationReference: normalizeText(row.applicationReference || row.application_reference || getApplicationReference(application)),
    applicationBuyer: normalizeText(row.applicationBuyer || row.application_buyer || getApplicationBuyer(application)),
    applicationProperty: normalizeText(row.applicationProperty || row.application_property || getApplicationProperty(application)),
    regionId: normalizeText(row.regionId || row.region_id || getApplicationRegionId(application)),
    branchId: normalizeText(row.branchId || row.branch_id || getApplicationBranchId(application)),
    ownerConsultantId: normalizeText(row.ownerConsultantId || row.owner_consultant_id || getApplicationConsultantId(application)),
    ownerName: normalizeText(row.ownerName || row.owner_name || application.consultant || application.consultantName || application.assignedConsultantName) || 'Unassigned',
    requestType,
    category: normalizeText(row.category) || getRequestCategory(requestType, row),
    title: normalizeText(row.title || row.subject) || getRequestTitle(requestType, row),
    message: normalizeText(row.message || row.description),
    priority,
    status: normalizeLower(row.status) || BOND_PARTNER_REQUEST_STATUSES.new,
    sourceKey: normalizeText(row.sourceKey || row.source_key),
    sourceId: normalizeText(row.sourceId || row.source_id),
    documentId: normalizeText(row.documentId || row.document_id),
    supportTicketId: normalizeText(row.supportTicketId || row.support_ticket_id),
    assignedAt: normalizeText(row.assignedAt || row.assigned_at),
    dueAt,
    escalated: Boolean(row.escalated),
    createdAt,
    updatedAt: normalizeText(row.updatedAt || row.updated_at) || createdAt,
    resolvedAt: normalizeText(row.resolvedAt || row.resolved_at),
  }
}

function getRequestCategory(requestType = '', row = {}) {
  if (requestType === BOND_PARTNER_REQUEST_TYPES.documentReview) return 'Documents Uploaded'
  if (requestType === BOND_PARTNER_REQUEST_TYPES.comment) return 'Awaiting Response'
  if (requestType === BOND_PARTNER_REQUEST_TYPES.escalation || normalizeLower(row.priority) === 'urgent') return 'Escalations'
  return 'Support Tickets'
}

function getRequestTitle(requestType = '', row = {}) {
  if (requestType === BOND_PARTNER_REQUEST_TYPES.documentReview) return `${normalizeText(row.documentName || row.name) || 'Document'} review required`
  if (requestType === BOND_PARTNER_REQUEST_TYPES.comment) return 'Partner comment awaiting response'
  return normalizeText(row.subject || row.type) || 'Partner support request'
}

function recordActivity(workspaceKey = '', event = {}) {
  const row = {
    id: event.id || createId('partner-request-activity'),
    eventType: normalizeText(event.eventType),
    requestId: normalizeText(event.requestId),
    partnerId: normalizeText(event.partnerId),
    applicationId: normalizeText(event.applicationId),
    actorUserId: normalizeText(event.actorUserId),
    previousValue: event.previousValue || null,
    newValue: event.newValue || null,
    createdAt: event.createdAt || new Date().toISOString(),
  }
  setLocalRows(LOCAL_ACTIVITY_STORE, workspaceKey, [row, ...getLocalRows(LOCAL_ACTIVITY_STORE, workspaceKey)])
  return row
}

function recordNotification(workspaceKey = '', notification = {}) {
  const row = {
    id: createId('partner-request-notification'),
    requestId: normalizeText(notification.requestId),
    recipientUserId: normalizeText(notification.recipientUserId),
    recipientRole: normalizeText(notification.recipientRole),
    type: normalizeText(notification.type),
    title: normalizeText(notification.title),
    createdAt: new Date().toISOString(),
  }
  setLocalRows(LOCAL_NOTIFICATION_STORE, workspaceKey, [row, ...getLocalRows(LOCAL_NOTIFICATION_STORE, workspaceKey)])
  return row
}

function upsertRequest(workspaceKey = '', request = {}, rows = {}) {
  const existingRows = getLocalRows(LOCAL_REQUEST_STORE, workspaceKey)
  const sourceKey = normalizeText(request.sourceKey)
  const existing = sourceKey ? existingRows.find((row) => normalizeText(row.sourceKey) === sourceKey) : null
  if (existing) return normalizeRequest(existing, rows)
  const normalized = normalizeRequest(request, rows)
  setLocalRows(LOCAL_REQUEST_STORE, workspaceKey, [normalized, ...existingRows])
  recordActivity(workspaceKey, {
    eventType: BOND_PARTNER_REQUEST_EVENTS.created,
    requestId: normalized.id,
    partnerId: normalized.partnerId,
    applicationId: normalized.applicationId,
    newValue: normalized,
  })
  recordNotification(workspaceKey, {
    requestId: normalized.id,
    recipientUserId: normalized.ownerConsultantId,
    recipientRole: 'consultant',
    type: BOND_PARTNER_REQUEST_EVENTS.created,
    title: `${normalized.partnerName}: ${normalized.title}`,
  })
  return normalized
}

function syncPortalRowsToRequests(context = {}, workspaceKey = '', options = {}) {
  const rows = getPartnerPortalOperationalRows(context, { ...options, workspaceId: workspaceKey })

  rows.documents.forEach((document) => {
    const applicationId = normalizeText(document.applicationId || document.application_id)
    const application = findApplication(applicationId, rows)
    const partner = findPartnerForApplication(application, rows)
    const createdAt = normalizeText(document.uploadedAt || document.uploaded_at || document.createdAt || document.created_at) || new Date().toISOString()
    upsertRequest(workspaceKey, {
      partnerId: partner?.id,
      partnerName: partner?.name,
      applicationId,
      requestType: BOND_PARTNER_REQUEST_TYPES.documentReview,
      category: 'Documents Uploaded',
      title: `${normalizeText(document.name || document.documentName || document.fileName) || 'Document'} review required`,
      message: 'Partner uploaded a document that needs internal review.',
      priority: 'normal',
      status: BOND_PARTNER_REQUEST_STATUSES.assigned,
      sourceKey: `document:${normalizeText(document.id)}`,
      sourceId: normalizeText(document.id),
      documentId: normalizeText(document.id),
      createdAt,
      dueAt: addHours(createdAt, 8),
    }, rows)
  })

  rows.comments.forEach((comment) => {
    const applicationId = normalizeText(comment.applicationId || comment.application_id)
    const application = findApplication(applicationId, rows)
    const partner = rows.partners.find((candidate) => normalizeText(candidate.id) === normalizeText(comment.partnerId || comment.partner_id)) || findPartnerForApplication(application, rows)
    const createdAt = normalizeText(comment.createdAt || comment.created_at) || new Date().toISOString()
    upsertRequest(workspaceKey, {
      partnerId: partner?.id,
      partnerName: partner?.name,
      applicationId,
      requestType: BOND_PARTNER_REQUEST_TYPES.comment,
      category: 'Awaiting Response',
      title: 'Partner comment awaiting response',
      message: normalizeText(comment.message),
      priority: 'normal',
      status: BOND_PARTNER_REQUEST_STATUSES.assigned,
      sourceKey: `comment:${normalizeText(comment.id)}`,
      sourceId: normalizeText(comment.id),
      createdAt,
      dueAt: addHours(createdAt, 24),
    }, rows)
  })

  rows.supportTickets.forEach((ticket) => {
    const applicationId = normalizeText(ticket.applicationId || ticket.application_id)
    const application = findApplication(applicationId, rows)
    const partner = rows.partners.find((candidate) => normalizeText(candidate.id) === normalizeText(ticket.partnerId || ticket.partner_id)) || findPartnerForApplication(application, rows)
    const supportType = normalizeLower(ticket.type)
    const priority = supportType.includes('complaint') || supportType.includes('escalation') ? 'urgent' : 'normal'
    const requestType = supportType.includes('escalation') ? BOND_PARTNER_REQUEST_TYPES.escalation : BOND_PARTNER_REQUEST_TYPES.supportTicket
    const createdAt = normalizeText(ticket.createdAt || ticket.created_at) || new Date().toISOString()
    upsertRequest(workspaceKey, {
      partnerId: partner?.id,
      partnerName: partner?.name,
      applicationId,
      requestType,
      category: requestType === BOND_PARTNER_REQUEST_TYPES.escalation ? 'Escalations' : 'Support Tickets',
      title: normalizeText(ticket.subject || ticket.type) || 'Support ticket',
      message: normalizeText(ticket.message || ticket.description),
      priority,
      status: BOND_PARTNER_REQUEST_STATUSES.assigned,
      supportType,
      sourceKey: `support:${normalizeText(ticket.id)}`,
      sourceId: normalizeText(ticket.id),
      supportTicketId: normalizeText(ticket.id),
      createdAt,
      dueAt: addHours(createdAt, getSlaHours({ requestType, priority, supportType })),
    }, rows)
  })

  return rows
}

function getSyncedData(context = {}, options = {}) {
  const workspaceKey = getWorkspaceKey(context, options)
  const rows = syncPortalRowsToRequests(context, workspaceKey, options)
  return { workspaceKey, rows }
}

function isRequestVisible(request = {}, scope = {}) {
  if (scope.scopeLevel === BOND_ORGANISATION_LEVELS.hq) return true
  if (scope.scopeLevel === BOND_ORGANISATION_LEVELS.region) return valueInScope(request.regionId, scope.regionIds)
  if (scope.scopeLevel === BOND_ORGANISATION_LEVELS.branch) return valueInScope(request.branchId, scope.branchIds)
  return normalizeText(request.ownerConsultantId) === normalizeText(scope.userId) || valueInScope(request.ownerConsultantId, scope.consultantIds)
}

function sortRequests(left = {}, right = {}) {
  const priorityDelta = (PRIORITY_WEIGHT[right.priority] || 0) - (PRIORITY_WEIGHT[left.priority] || 0)
  if (priorityDelta) return priorityDelta
  const dueDelta = new Date(left.dueAt).getTime() - new Date(right.dueAt).getTime()
  if (dueDelta) return dueDelta
  return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
}

function enrichRequest(request = {}, now = new Date()) {
  return {
    ...request,
    sla: calculatePartnerSLA(request, now),
  }
}

function getScopedRequests(context = {}, options = {}) {
  const { workspaceKey, rows } = getSyncedData(context, options)
  const scope = resolveScope(context, rows)
  const now = options.now ? new Date(options.now) : new Date()
  const storedRows = getLocalRows(LOCAL_REQUEST_STORE, workspaceKey)
  let changedForSla = false
  const slaCheckedRows = storedRows.map((row) => {
    const normalized = normalizeRequest(row, rows)
    const sla = calculatePartnerSLA(normalized, now)
    if (!sla.breached || normalized.slaBreachRecordedAt) return row
    changedForSla = true
    const breached = {
      ...normalized,
      escalated: true,
      priority: 'urgent',
      status: normalized.status === BOND_PARTNER_REQUEST_STATUSES.new ? BOND_PARTNER_REQUEST_STATUSES.assigned : normalized.status,
      slaBreachRecordedAt: now.toISOString(),
      escalationReason: normalized.escalationReason || 'SLA breached',
      updatedAt: now.toISOString(),
    }
    recordActivity(workspaceKey, {
      eventType: BOND_PARTNER_REQUEST_EVENTS.slaBreached,
      requestId: breached.id,
      partnerId: breached.partnerId,
      applicationId: breached.applicationId,
      newValue: { dueAt: breached.dueAt, elapsedTime: sla.elapsedTime },
      createdAt: now.toISOString(),
    })
    recordActivity(workspaceKey, {
      eventType: BOND_PARTNER_REQUEST_EVENTS.escalated,
      requestId: breached.id,
      partnerId: breached.partnerId,
      applicationId: breached.applicationId,
      newValue: { reason: breached.escalationReason },
      createdAt: now.toISOString(),
    })
    recordNotification(workspaceKey, {
      requestId: breached.id,
      recipientRole: 'manager',
      type: BOND_PARTNER_REQUEST_EVENTS.slaBreached,
      title: `${breached.partnerName} request breached SLA`,
    })
    return breached
  })
  if (changedForSla) setLocalRows(LOCAL_REQUEST_STORE, workspaceKey, slaCheckedRows)
  const requests = getLocalRows(LOCAL_REQUEST_STORE, workspaceKey)
    .map((row) => normalizeRequest(row, rows))
    .filter((row) => isRequestVisible(row, scope))
    .map((row) => enrichRequest(row, now))
    .sort(sortRequests)
  return { workspaceKey, rows, scope, requests }
}

function updateRequest(workspaceKey = '', requestId = '', updater = () => null, rows = {}) {
  let updated = null
  const nextRows = getLocalRows(LOCAL_REQUEST_STORE, workspaceKey).map((row) => {
    if (normalizeText(row.id) !== normalizeText(requestId)) return row
    updated = normalizeRequest({ ...row, ...updater(row), updatedAt: new Date().toISOString() }, rows)
    return updated
  })
  if (!updated) {
    const error = new Error('Partner request not found.')
    error.code = 'not_found'
    throw error
  }
  setLocalRows(LOCAL_REQUEST_STORE, workspaceKey, nextRows)
  return updated
}

function assertRequestAccess(request = {}, context = {}, rows = {}) {
  const scope = resolveScope(context, rows)
  if (!isRequestVisible(request, scope)) {
    const error = new Error('You do not have permission to access this partner request.')
    error.code = 'permission_denied'
    throw error
  }
  return scope
}

export function calculatePartnerSLA(request = {}, now = new Date()) {
  const createdAt = new Date(request.createdAt || request.created_at || Date.now())
  const dueAt = new Date(request.dueAt || request.due_at || calculateDueAt(request))
  const safeNow = now instanceof Date ? now : new Date(now)
  const elapsedHours = Number.isNaN(createdAt.getTime()) ? 0 : Math.max(0, (safeNow.getTime() - createdAt.getTime()) / (60 * 60 * 1000))
  const remainingHours = Number.isNaN(dueAt.getTime()) ? 0 : (dueAt.getTime() - safeNow.getTime()) / (60 * 60 * 1000)
  const breached = ![BOND_PARTNER_REQUEST_STATUSES.resolved, BOND_PARTNER_REQUEST_STATUSES.closed].includes(normalizeLower(request.status)) && remainingHours < 0
  return {
    slaTarget: getSlaHours(request),
    elapsedTime: Math.round(elapsedHours * 10) / 10,
    remainingTime: Math.round(remainingHours * 10) / 10,
    dueAt: dueAt.toISOString(),
    breached,
    statusLabel: breached ? 'Breached' : remainingHours <= 2 ? 'At Risk' : 'On Track',
  }
}

export function getPartnerRequests(context = {}, options = {}) {
  return getScopedRequests(context, options).requests
}

export function getPartnerInbox(context = {}, options = {}) {
  const { requests, scope } = getScopedRequests(context, options)
  const isOpen = (row) => ![BOND_PARTNER_REQUEST_STATUSES.resolved, BOND_PARTNER_REQUEST_STATUSES.closed].includes(row.status)
  return {
    scope,
    rows: requests,
    categories: {
      unread: requests.filter((row) => row.status === BOND_PARTNER_REQUEST_STATUSES.new),
      awaitingResponse: requests.filter((row) => isOpen(row) && [BOND_PARTNER_REQUEST_TYPES.comment, BOND_PARTNER_REQUEST_TYPES.supportTicket].includes(row.requestType)),
      documentsUploaded: requests.filter((row) => isOpen(row) && row.requestType === BOND_PARTNER_REQUEST_TYPES.documentReview),
      supportTickets: requests.filter((row) => isOpen(row) && row.requestType === BOND_PARTNER_REQUEST_TYPES.supportTicket),
      escalations: requests.filter((row) => isOpen(row) && (row.escalated || row.priority === 'urgent' || row.sla.breached)),
      resolved: requests.filter((row) => [BOND_PARTNER_REQUEST_STATUSES.resolved, BOND_PARTNER_REQUEST_STATUSES.closed].includes(row.status)),
    },
  }
}

export function getPartnerActivityQueue(context = {}, options = {}) {
  return getPartnerRequests(context, options)
}

export function assignPartnerRequest(requestId = '', ownerConsultantId = '', context = {}, options = {}) {
  const { workspaceKey, rows } = getSyncedData(context, options)
  const current = normalizeRequest(getLocalRows(LOCAL_REQUEST_STORE, workspaceKey).find((row) => normalizeText(row.id) === normalizeText(requestId)), rows)
  assertRequestAccess(current, context, rows)
  const previousValue = { ownerConsultantId: current.ownerConsultantId, status: current.status }
  const updated = updateRequest(workspaceKey, requestId, () => ({
    ownerConsultantId: normalizeText(ownerConsultantId),
    ownerName: normalizeText(options.ownerName) || normalizeText(ownerConsultantId) || 'Assigned consultant',
    status: BOND_PARTNER_REQUEST_STATUSES.assigned,
    assignedAt: new Date().toISOString(),
  }), rows)
  recordActivity(workspaceKey, {
    eventType: BOND_PARTNER_REQUEST_EVENTS.assigned,
    requestId,
    partnerId: updated.partnerId,
    applicationId: updated.applicationId,
    actorUserId: getActorId(context),
    previousValue,
    newValue: { ownerConsultantId: updated.ownerConsultantId, status: updated.status },
  })
  recordNotification(workspaceKey, {
    requestId,
    recipientUserId: updated.ownerConsultantId,
    recipientRole: 'consultant',
    type: BOND_PARTNER_REQUEST_EVENTS.assigned,
    title: `${updated.title} assigned`,
  })
  return updated
}

export function replyToPartnerRequest(requestId = '', payload = {}, context = {}, options = {}) {
  const { workspaceKey, rows } = getSyncedData(context, options)
  const current = normalizeRequest(getLocalRows(LOCAL_REQUEST_STORE, workspaceKey).find((row) => normalizeText(row.id) === normalizeText(requestId)), rows)
  assertRequestAccess(current, context, rows)
  const reply = {
    id: createId('partner-request-reply'),
    requestId: current.id,
    applicationId: current.applicationId,
    partnerId: current.partnerId,
    actorUserId: getActorId(context),
    actorName: getActorName(context),
    message: normalizeText(payload.message || payload.reply),
    attachments: normalizeArray(payload.attachments),
    visibleToPartner: payload.visibleToPartner !== false,
    createdAt: new Date().toISOString(),
  }
  if (!reply.message) throw new Error('Reply message is required.')
  setLocalRows(LOCAL_REPLY_STORE, workspaceKey, [reply, ...getLocalRows(LOCAL_REPLY_STORE, workspaceKey)])
  const updated = updateRequest(workspaceKey, requestId, () => ({
    status: normalizeLower(payload.nextStatus) || BOND_PARTNER_REQUEST_STATUSES.waitingOnPartner,
  }), rows)
  recordActivity(workspaceKey, {
    eventType: BOND_PARTNER_REQUEST_EVENTS.replied,
    requestId,
    partnerId: current.partnerId,
    applicationId: current.applicationId,
    actorUserId: getActorId(context),
    newValue: reply,
  })
  recordNotification(workspaceKey, {
    requestId,
    recipientRole: 'partner',
    type: BOND_PARTNER_REQUEST_EVENTS.replied,
    title: `Response sent to ${current.partnerName}`,
  })
  return { request: updated, reply }
}

export function addInternalNote(requestId = '', payload = {}, context = {}, options = {}) {
  const { workspaceKey, rows } = getSyncedData(context, options)
  const current = normalizeRequest(getLocalRows(LOCAL_REQUEST_STORE, workspaceKey).find((row) => normalizeText(row.id) === normalizeText(requestId)), rows)
  assertRequestAccess(current, context, rows)
  const note = {
    id: createId('partner-internal-note'),
    requestId: current.id,
    applicationId: current.applicationId,
    partnerId: current.partnerId,
    actorUserId: getActorId(context),
    actorName: getActorName(context),
    note: normalizeText(payload.note || payload.message),
    visibleToPartner: false,
    createdAt: new Date().toISOString(),
  }
  if (!note.note) throw new Error('Internal note is required.')
  setLocalRows(LOCAL_INTERNAL_NOTE_STORE, workspaceKey, [note, ...getLocalRows(LOCAL_INTERNAL_NOTE_STORE, workspaceKey)])
  return note
}

export function reviewPartnerDocument(requestId = '', decision = 'accepted', context = {}, options = {}) {
  const { workspaceKey, rows } = getSyncedData(context, options)
  const current = normalizeRequest(getLocalRows(LOCAL_REQUEST_STORE, workspaceKey).find((row) => normalizeText(row.id) === normalizeText(requestId)), rows)
  assertRequestAccess(current, context, rows)
  if (current.requestType !== BOND_PARTNER_REQUEST_TYPES.documentReview) throw new Error('Only document review requests can be reviewed.')
  const normalizedDecision = normalizeLower(decision)
  const accepted = normalizedDecision === 'accepted' || normalizedDecision === 'accept'
  const replacementRequested = normalizedDecision.includes('replacement')
  const status = accepted ? BOND_PARTNER_REQUEST_STATUSES.resolved : replacementRequested ? BOND_PARTNER_REQUEST_STATUSES.waitingOnPartner : BOND_PARTNER_REQUEST_STATUSES.waitingOnPartner
  const updated = updateRequest(workspaceKey, requestId, () => ({
    status,
    documentReviewStatus: accepted ? 'accepted' : replacementRequested ? 'replacement_requested' : 'rejected',
    resolvedAt: accepted ? new Date().toISOString() : '',
  }), rows)
  recordActivity(workspaceKey, {
    eventType: accepted ? BOND_PARTNER_REQUEST_EVENTS.documentAccepted : BOND_PARTNER_REQUEST_EVENTS.documentRejected,
    requestId,
    partnerId: current.partnerId,
    applicationId: current.applicationId,
    actorUserId: getActorId(context),
    newValue: { decision: normalizedDecision },
  })
  return updated
}

export function resolveSupportTicket(requestId = '', payload = {}, context = {}, options = {}) {
  const { workspaceKey, rows } = getSyncedData(context, options)
  const current = normalizeRequest(getLocalRows(LOCAL_REQUEST_STORE, workspaceKey).find((row) => normalizeText(row.id) === normalizeText(requestId)), rows)
  assertRequestAccess(current, context, rows)
  const updated = updateRequest(workspaceKey, requestId, () => ({
    status: BOND_PARTNER_REQUEST_STATUSES.resolved,
    resolution: normalizeText(payload.resolution || payload.message),
    resolvedAt: new Date().toISOString(),
  }), rows)
  recordActivity(workspaceKey, {
    eventType: BOND_PARTNER_REQUEST_EVENTS.supportResolved,
    requestId,
    partnerId: current.partnerId,
    applicationId: current.applicationId,
    actorUserId: getActorId(context),
    newValue: { resolution: updated.resolution },
  })
  return updated
}

export function escalatePartnerRequest(requestId = '', payload = {}, context = {}, options = {}) {
  const { workspaceKey, rows } = getSyncedData(context, options)
  const current = normalizeRequest(getLocalRows(LOCAL_REQUEST_STORE, workspaceKey).find((row) => normalizeText(row.id) === normalizeText(requestId)), rows)
  assertRequestAccess(current, context, rows)
  const updated = updateRequest(workspaceKey, requestId, () => ({
    escalated: true,
    priority: 'urgent',
    status: BOND_PARTNER_REQUEST_STATUSES.inProgress,
    escalationReason: normalizeText(payload.reason || payload.message || 'SLA or operational escalation'),
  }), rows)
  recordActivity(workspaceKey, {
    eventType: BOND_PARTNER_REQUEST_EVENTS.escalated,
    requestId,
    partnerId: current.partnerId,
    applicationId: current.applicationId,
    actorUserId: getActorId(context),
    newValue: { reason: updated.escalationReason },
  })
  recordNotification(workspaceKey, {
    requestId,
    recipientRole: 'manager',
    type: BOND_PARTNER_REQUEST_EVENTS.escalated,
    title: `${updated.partnerName} request escalated`,
  })
  return updated
}

function average(values = []) {
  const safe = values.map(Number).filter((value) => Number.isFinite(value))
  if (!safe.length) return 0
  return Math.round((safe.reduce((sum, value) => sum + value, 0) / safe.length) * 10) / 10
}

function percent(part = 0, total = 0) {
  return total ? Math.round((Number(part || 0) / Number(total || 0)) * 100) : 0
}

function getPartnerHealth(requests = []) {
  const total = requests.length
  const breaches = requests.filter((row) => row.sla?.breached || row.escalated).length
  const resolved = requests.filter((row) => row.status === BOND_PARTNER_REQUEST_STATUSES.resolved).length
  const score = Math.max(0, 100 - breaches * 18 + resolved * 4 - Math.max(0, total - resolved) * 3)
  return {
    responsiveness: percent(resolved, total),
    documentCompletionRate: percent(requests.filter((row) => row.requestType === BOND_PARTNER_REQUEST_TYPES.documentReview && row.status === BOND_PARTNER_REQUEST_STATUSES.resolved).length, requests.filter((row) => row.requestType === BOND_PARTNER_REQUEST_TYPES.documentReview).length),
    averageResponseTime: average(requests.map((row) => row.sla?.elapsedTime || 0)),
    supportVolume: total,
    escalationRate: percent(breaches, total),
    health: score >= 85 ? 'Excellent' : score >= 70 ? 'Healthy' : score >= 45 ? 'At Risk' : 'Critical',
  }
}

function getBreakdown(rows = [], key = '', fallback = 'Unassigned') {
  const grouped = new Map()
  rows.forEach((row) => {
    const value = normalizeText(row[key]) || fallback
    const current = grouped.get(value) || []
    grouped.set(value, [...current, row])
  })
  return [...grouped.entries()].map(([id, requests]) => ({
    id,
    name: id,
    openRequests: requests.filter((row) => ![BOND_PARTNER_REQUEST_STATUSES.resolved, BOND_PARTNER_REQUEST_STATUSES.closed].includes(row.status)).length,
    breaches: requests.filter((row) => row.sla?.breached || row.escalated).length,
    responseTime: average(requests.map((row) => row.sla?.elapsedTime || 0)),
    partnerHealth: getPartnerHealth(requests).health,
  }))
}

export function getPartnerOperationsDashboard(context = {}, options = {}) {
  const { requests, scope } = getScopedRequests(context, options)
  const openRequests = requests.filter((row) => ![BOND_PARTNER_REQUEST_STATUSES.resolved, BOND_PARTNER_REQUEST_STATUSES.closed].includes(row.status))
  const breaches = requests.filter((row) => row.sla?.breached || row.escalated)
  return {
    scope,
    metrics: {
      openRequests: openRequests.length,
      waitingDocuments: openRequests.filter((row) => row.requestType === BOND_PARTNER_REQUEST_TYPES.documentReview).length,
      slaBreaches: breaches.length,
      averageResponseTime: average(openRequests.map((row) => row.sla?.elapsedTime || 0)),
      resolvedToday: requests.filter((row) => row.status === BOND_PARTNER_REQUEST_STATUSES.resolved && normalizeText(row.resolvedAt).slice(0, 10) === new Date().toISOString().slice(0, 10)).length,
      escalations: requests.filter((row) => row.escalated || row.priority === 'urgent').length,
    },
    consultants: getBreakdown(requests, 'ownerConsultantId', 'Unassigned consultant'),
    branches: getBreakdown(requests, 'branchId', 'Unassigned branch'),
    regions: getBreakdown(requests, 'regionId', 'Unassigned region'),
    partners: getBreakdown(requests, 'partnerName', 'Partner'),
    health: getPartnerHealth(requests),
  }
}

export const __bondPartnerCollaborationServiceTestUtils = Object.freeze({
  clearStores() {
    LOCAL_REQUEST_STORE.clear()
    LOCAL_REPLY_STORE.clear()
    LOCAL_INTERNAL_NOTE_STORE.clear()
    LOCAL_ACTIVITY_STORE.clear()
    LOCAL_NOTIFICATION_STORE.clear()
    localSequence = 0
  },
  seedRequests(workspaceId = '', rows = []) {
    setLocalRows(LOCAL_REQUEST_STORE, normalizeText(workspaceId || 'default'), rows.map((row) => normalizeRequest(row)))
  },
  getRequests(workspaceId = '') {
    return getLocalRows(LOCAL_REQUEST_STORE, normalizeText(workspaceId || 'default'))
  },
  getReplies(workspaceId = '') {
    return getLocalRows(LOCAL_REPLY_STORE, normalizeText(workspaceId || 'default'))
  },
  getInternalNotes(workspaceId = '') {
    return getLocalRows(LOCAL_INTERNAL_NOTE_STORE, normalizeText(workspaceId || 'default'))
  },
  getActivity(workspaceId = '') {
    return getLocalRows(LOCAL_ACTIVITY_STORE, normalizeText(workspaceId || 'default'))
  },
  getNotifications(workspaceId = '') {
    return getLocalRows(LOCAL_NOTIFICATION_STORE, normalizeText(workspaceId || 'default'))
  },
})
