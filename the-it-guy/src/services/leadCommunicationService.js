import { createAgencyCrmLeadActivity } from '../lib/agencyCrmRepository'
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export const LEAD_COMMUNICATION_TYPES = ['call', 'email', 'whatsapp', 'sms', 'meeting', 'note', 'system']
export const LEAD_COMMUNICATION_DIRECTIONS = ['outbound', 'inbound', 'internal', 'system']

const ACTIVITY_OUTCOME_MARKER = 'communication_event'

function normalizeText(value) {
  return String(value ?? '').trim()
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase()
}

function isUuidLike(value) {
  return UUID_PATTERN.test(normalizeText(value))
}

function nullableUuid(value) {
  const normalized = normalizeText(value)
  return isUuidLike(normalized) ? normalized : null
}

function normalizeType(value = 'note') {
  const normalized = normalizeLower(value).replace(/\s+/g, '_')
  return LEAD_COMMUNICATION_TYPES.includes(normalized) ? normalized : 'note'
}

function normalizeDirection(value = 'internal') {
  const normalized = normalizeLower(value).replace(/\s+/g, '_')
  return LEAD_COMMUNICATION_DIRECTIONS.includes(normalized) ? normalized : 'internal'
}

function normalizeNumber(value) {
  if (normalizeText(value) === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function validDateOrNow(value) {
  const date = value ? new Date(value) : new Date()
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString()
}

function readId(row = {}, keys = []) {
  for (const key of keys) {
    const value = normalizeText(row?.[key])
    if (value) return value
  }
  return ''
}

function readDate(row = {}, keys = []) {
  for (const key of keys) {
    const value = row?.[key]
    if (!value) continue
    const date = new Date(value)
    if (!Number.isNaN(date.getTime())) return date.toISOString()
  }
  return null
}

function requireClient() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is required before managing lead communication events.')
  }
  return supabase
}

function actorId(actor = null) {
  return nullableUuid(actor?.id || actor?.user_id || actor?.userId)
}

function safeJson(value, fallback = {}) {
  if (!value) return fallback
  if (typeof value === 'object') return value
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

export function normalizeCommunicationEvent(row = {}) {
  return {
    communicationId: readId(row, ['communication_id', 'communicationId', 'id']),
    organisationId: readId(row, ['organisation_id', 'organisationId']),
    leadId: readId(row, ['lead_id', 'leadId']),
    contactId: readId(row, ['contact_id', 'contactId']),
    agentId: readId(row, ['agent_id', 'agentId']),
    communicationType: normalizeType(row.communication_type || row.communicationType),
    direction: normalizeDirection(row.direction || (normalizeType(row.communication_type || row.communicationType) === 'system' ? 'system' : 'internal')),
    subject: normalizeText(row.subject),
    message: normalizeText(row.message),
    summary: normalizeText(row.summary),
    externalReference: normalizeText(row.external_reference || row.externalReference),
    source: normalizeText(row.source),
    durationSeconds: normalizeNumber(row.duration_seconds ?? row.durationSeconds),
    status: normalizeText(row.status) || 'logged',
    occurredAt: readDate(row, ['occurred_at', 'occurredAt']) || validDateOrNow(),
    createdAt: readDate(row, ['created_at', 'createdAt']) || null,
    metadata: safeJson(row.metadata, {}),
    raw: row,
  }
}

export function buildCommunicationPayload(payload = {}, { actor = null } = {}) {
  const communicationType = normalizeType(payload.communicationType || payload.communication_type || payload.type)
  const direction = normalizeDirection(payload.direction || (communicationType === 'system' ? 'system' : communicationType === 'note' ? 'internal' : 'outbound'))
  const organisationId = nullableUuid(payload.organisationId || payload.organisation_id)
  const leadId = nullableUuid(payload.leadId || payload.lead_id)
  const durationSeconds = normalizeNumber(payload.durationSeconds ?? payload.duration_seconds ?? (payload.durationMinutes ? Number(payload.durationMinutes) * 60 : null))
  if (!organisationId || !leadId) throw new Error('Valid organisation and lead ids are required for communication events.')

  return {
    organisation_id: organisationId,
    lead_id: leadId,
    contact_id: nullableUuid(payload.contactId || payload.contact_id),
    agent_id: nullableUuid(payload.agentId || payload.agent_id) || actorId(actor),
    communication_type: communicationType,
    direction,
    subject: normalizeText(payload.subject) || null,
    message: normalizeText(payload.message) || null,
    summary: normalizeText(payload.summary || payload.activityNote) || null,
    external_reference: normalizeText(payload.externalReference || payload.external_reference) || null,
    source: normalizeText(payload.source) || null,
    duration_seconds: durationSeconds,
    status: normalizeText(payload.status) || 'logged',
    occurred_at: validDateOrNow(payload.occurredAt || payload.occurred_at),
    metadata: {
      ...(payload.metadata && typeof payload.metadata === 'object' ? payload.metadata : {}),
      ...(payload.outcome ? { outcome: normalizeText(payload.outcome) } : {}),
      ...(payload.followUpRequired !== undefined ? { followUpRequired: Boolean(payload.followUpRequired) } : {}),
      ...(payload.nextAction ? { nextAction: normalizeText(payload.nextAction) } : {}),
      ...(payload.hasAttachments !== undefined ? { hasAttachments: Boolean(payload.hasAttachments) } : {}),
      ...(payload.isPrivate !== undefined ? { isPrivate: Boolean(payload.isPrivate) } : {}),
    },
  }
}

function toActivityType(type = 'note') {
  const labels = {
    call: 'Call logged',
    email: 'Email logged',
    whatsapp: 'WhatsApp logged',
    sms: 'SMS logged',
    meeting: 'Meeting logged',
    note: 'Note logged',
    system: 'System event logged',
  }
  return labels[normalizeType(type)] || 'Communication logged'
}

async function mirrorCommunicationActivity(event = {}, actor = null) {
  try {
    return await createAgencyCrmLeadActivity(
      event.organisationId,
      event.leadId,
      {
        activityType: toActivityType(event.communicationType),
        activityNote: event.summary || event.subject || event.message || toActivityType(event.communicationType),
        activityDate: event.occurredAt,
        outcome: ACTIVITY_OUTCOME_MARKER,
      },
      { actor },
    )
  } catch (error) {
    console.warn('[leadCommunicationService] activity mirror skipped', error)
    return null
  }
}

export async function createCommunicationEvent(payload = {}, { actor = null, mirrorActivity = true } = {}) {
  const client = requireClient()
  const insertPayload = buildCommunicationPayload(payload, { actor })
  const { data, error } = await client
    .from('lead_communication_events')
    .insert(insertPayload)
    .select('*')
    .single()
  if (error) throw error
  const event = normalizeCommunicationEvent(data)
  if (mirrorActivity) await mirrorCommunicationActivity(event, actor)
  void import('./leadActionEngineService')
    .then(({ processCommunicationEvent }) => processCommunicationEvent({
      organisationId: event.organisationId,
      leadId: event.leadId,
      contactId: event.contactId,
      assignedAgentId: event.agentId,
      communicationType: event.communicationType,
      communicationId: event.communicationId,
      sourceEvent: `first_contact_logged:${event.leadId}`,
      metadata: { communicationId: event.communicationId, communicationType: event.communicationType },
    }, { actor }))
    .catch((recommendationError) => console.warn('[leadCommunicationService] recommendation generation skipped', recommendationError))
  return event
}

export async function listLeadCommunications({
  organisationId = '',
  leadId = '',
  contactId = '',
  agentId = '',
  communicationType = '',
  direction = '',
  dateFrom = '',
  dateTo = '',
  search = '',
  limit = 250,
} = {}) {
  const normalizedOrgId = nullableUuid(organisationId)
  if (!normalizedOrgId) return []
  const client = requireClient()
  let query = client
    .from('lead_communication_events')
    .select('*')
    .eq('organisation_id', normalizedOrgId)
    .order('occurred_at', { ascending: false })
    .limit(Math.max(1, Math.min(Number(limit) || 250, 1000)))

  if (nullableUuid(leadId)) query = query.eq('lead_id', nullableUuid(leadId))
  if (nullableUuid(contactId)) query = query.eq('contact_id', nullableUuid(contactId))
  if (nullableUuid(agentId)) query = query.eq('agent_id', nullableUuid(agentId))
  if (communicationType && communicationType !== 'all') query = query.eq('communication_type', normalizeType(communicationType))
  if (direction && direction !== 'all') query = query.eq('direction', normalizeDirection(direction))
  if (dateFrom) query = query.gte('occurred_at', new Date(dateFrom).toISOString())
  if (dateTo) query = query.lte('occurred_at', new Date(`${dateTo}T23:59:59`).toISOString())

  const { data, error } = await query
  if (error) throw error

  const events = (Array.isArray(data) ? data : []).map(normalizeCommunicationEvent)
  const keyword = normalizeLower(search)
  if (!keyword) return events
  return events.filter((event) => [event.subject, event.summary, event.message, event.source, event.externalReference].map(normalizeLower).join(' ').includes(keyword))
}

export function logCall(payload = {}, options = {}) {
  return createCommunicationEvent({
    ...payload,
    communicationType: 'call',
    direction: payload.direction || 'outbound',
    metadata: {
      ...(payload.metadata || {}),
      outcome: normalizeText(payload.outcome),
      followUpRequired: Boolean(payload.followUpRequired),
      nextAction: normalizeText(payload.nextAction),
    },
  }, options)
}

export function logEmail(payload = {}, options = {}) {
  return createCommunicationEvent({
    ...payload,
    communicationType: 'email',
    direction: payload.direction || 'outbound',
  }, options)
}

export function logWhatsApp(payload = {}, options = {}) {
  return createCommunicationEvent({
    ...payload,
    communicationType: 'whatsapp',
    direction: payload.direction || 'outbound',
  }, options)
}

export function logMeeting(payload = {}, options = {}) {
  return createCommunicationEvent({
    ...payload,
    communicationType: 'meeting',
    direction: payload.direction || 'outbound',
  }, options)
}

export function logNote(payload = {}, options = {}) {
  return createCommunicationEvent({
    ...payload,
    communicationType: 'note',
    direction: payload.direction || 'internal',
  }, options)
}

export function createSystemEvent(payload = {}, options = {}) {
  return createCommunicationEvent({
    ...payload,
    communicationType: 'system',
    direction: 'system',
  }, options)
}

function formatTimelineType(value = '') {
  return normalizeText(value).replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function titleForCommunication(event = {}) {
  if (event.communicationType === 'system') return event.subject || event.summary || 'System Event'
  const direction = event.direction && !['internal', 'system'].includes(event.direction) ? `${formatTimelineType(event.direction)} ` : ''
  return `${direction}${formatTimelineType(event.communicationType)}`
}

function timelineItem(base = {}) {
  return {
    id: base.id,
    kind: base.kind || 'system',
    communicationType: base.communicationType || base.kind || 'system',
    direction: base.direction || 'system',
    title: base.title || 'Timeline event',
    subject: base.subject || '',
    summary: base.summary || '',
    message: base.message || '',
    status: base.status || '',
    source: base.source || '',
    agentId: base.agentId || '',
    occurredAt: base.occurredAt || new Date(0).toISOString(),
    metadata: base.metadata || {},
    raw: base.raw || null,
  }
}

function fromCommunication(event = {}) {
  const normalized = normalizeCommunicationEvent(event)
  return timelineItem({
    id: `communication:${normalized.communicationId || normalized.occurredAt}`,
    kind: 'communication',
    communicationType: normalized.communicationType,
    direction: normalized.direction,
    title: titleForCommunication(normalized),
    subject: normalized.subject,
    summary: normalized.summary,
    message: normalized.message,
    status: normalized.status,
    source: normalized.source,
    agentId: normalized.agentId,
    occurredAt: normalized.occurredAt,
    metadata: {
      ...normalized.metadata,
      durationSeconds: normalized.durationSeconds,
      externalReference: normalized.externalReference,
    },
    raw: event,
  })
}

function fromActivity(activity = {}) {
  if (normalizeLower(activity.outcome) === ACTIVITY_OUTCOME_MARKER) return null
  const activityType = normalizeText(activity.activityType || activity.activity_type) || 'Lead Activity'
  const activityNote = normalizeText(activity.activityNote || activity.activity_note || activity.outcome)
  return timelineItem({
    id: `activity:${readId(activity, ['activityId', 'activity_id', 'id']) || `${activityType}:${activityNote}`}`,
    kind: 'activity',
    communicationType: 'system',
    direction: 'system',
    title: activityType,
    summary: activityNote,
    status: normalizeText(activity.outcome),
    agentId: readId(activity, ['agentId', 'agent_id']),
    occurredAt: readDate(activity, ['activityDate', 'activity_date', 'createdAt', 'created_at']) || new Date(0).toISOString(),
    raw: activity,
  })
}

function fromAssignment(item = {}) {
  const reason = normalizeText(item.reason) || 'Lead assignment updated'
  const previousOwner = normalizeText(item.previousAgentId || item.previous_agent_id || item.previousQueueId || item.previous_queue_id || 'none')
  const newOwner = normalizeText(item.newAgentId || item.new_agent_id || item.newQueueId || item.new_queue_id || 'none')
  return timelineItem({
    id: `assignment:${readId(item, ['assignmentId', 'assignment_id', 'id']) || `${reason}:${newOwner}`}`,
    kind: 'assignment',
    communicationType: 'system',
    direction: 'system',
    title: previousOwner === 'none' ? 'Lead Assigned' : 'Lead Reassigned',
    summary: `${reason}. ${previousOwner} -> ${newOwner}`,
    agentId: readId(item, ['assignedBy', 'assigned_by']),
    occurredAt: readDate(item, ['createdAt', 'created_at']) || new Date(0).toISOString(),
    raw: item,
  })
}

function fromTask(task = {}) {
  return timelineItem({
    id: `task:${readId(task, ['taskId', 'task_id', 'id']) || normalizeText(task.title)}`,
    kind: 'task',
    communicationType: 'system',
    direction: 'system',
    title: `Task: ${normalizeText(task.title) || 'Follow-up'}`,
    summary: normalizeText(task.description || task.notes) || `Status: ${normalizeText(task.status) || 'Pending'}`,
    status: normalizeText(task.status) || 'Pending',
    agentId: readId(task, ['assignedTo', 'assigned_to', 'agentId', 'agent_id']),
    occurredAt: readDate(task, ['dueDate', 'due_date', 'createdAt', 'created_at']) || new Date(0).toISOString(),
    raw: task,
  })
}

function fromAppointment(appointment = {}) {
  return timelineItem({
    id: `appointment:${readId(appointment, ['appointmentId', 'appointment_id', 'id']) || normalizeText(appointment.title)}`,
    kind: 'appointment',
    communicationType: 'meeting',
    direction: 'system',
    title: normalizeText(appointment.title || appointment.appointmentType || appointment.appointment_type) || 'Viewing Scheduled',
    summary: normalizeText(appointment.location || appointment.locationAddress || appointment.location_address || appointment.notes),
    status: normalizeText(appointment.status) || 'scheduled',
    occurredAt: readDate(appointment, ['startTime', 'start_time', 'date', 'createdAt', 'created_at']) || new Date(0).toISOString(),
    raw: appointment,
  })
}

function fromOffer(offer = {}) {
  const status = normalizeLower(offer.status)
  return timelineItem({
    id: `offer:${readId(offer, ['id', 'offerId', 'offer_id']) || normalizeText(offer.status)}`,
    kind: 'offer',
    communicationType: 'system',
    direction: 'system',
    title: status.includes('accepted')
      ? 'Offer Accepted'
      : status.includes('counter')
        ? 'Offer Countered'
        : status.includes('reject')
          ? 'Offer Rejected'
          : status.includes('converted')
            ? 'Offer Converted To Transaction'
            : status.includes('submitted')
              ? 'Offer Submitted'
              : 'Offer Updated',
    summary: normalizeText(offer.status) || 'Offer linked to lead',
    status: normalizeText(offer.status),
    occurredAt: readDate(offer, ['acceptedAt', 'accepted_at', 'counteredAt', 'countered_at', 'rejectedAt', 'rejected_at', 'submittedAt', 'submitted_at', 'updatedAt', 'updated_at', 'createdAt', 'created_at']) || new Date(0).toISOString(),
    raw: offer,
  })
}

function fromTransaction(transaction = {}) {
  const onboardingStatus = normalizeLower(transaction.onboardingStatus || transaction.onboarding_status)
  const currentMainStage = normalizeText(transaction.currentMainStage || transaction.current_main_stage)
  return timelineItem({
    id: `transaction:${readId(transaction, ['id', 'transactionId', 'transaction_id']) || normalizeText(transaction.status)}`,
    kind: 'transaction',
    communicationType: 'system',
    direction: 'system',
    title: onboardingStatus === 'signed_otp_received'
      ? 'Signed OTP Received'
      : onboardingStatus === 'awaiting_signed_otp'
        ? 'Buyer Onboarding Completed'
        : 'Transaction Linked',
    summary: onboardingStatus === 'signed_otp_received'
      ? 'The signed OTP has been received and the transaction can move into the next handoff.'
      : onboardingStatus === 'awaiting_signed_otp'
        ? 'Buyer onboarding is complete and the transaction is waiting for the signed OTP.'
        : normalizeText(transaction.status || transaction.stage || transaction.current_stage || currentMainStage) || 'Lead converted through existing transaction flow',
    status: normalizeText(transaction.status || transaction.stage || transaction.current_stage || currentMainStage),
    occurredAt: readDate(transaction, ['onboardingCompletedAt', 'onboarding_completed_at', 'updatedAt', 'updated_at', 'createdAt', 'created_at']) || new Date(0).toISOString(),
    raw: transaction,
  })
}

function fromDelivery(delivery = {}) {
  const status = normalizeLower(delivery.status)
  const openedAt = readDate(delivery, ['openedAt', 'opened_at'])
  const labels = {
    prepared: 'Communication Prepared',
    queued: 'Communication Queued',
    sent: 'Communication Sent',
    delivered: 'Communication Delivered',
    failed: 'Communication Failed',
  }
  return timelineItem({
    id: `delivery:${readId(delivery, ['id', 'deliveryId', 'delivery_id']) || normalizeText(delivery.provider_message_id || delivery.providerMessageId) || normalizeText(delivery.created_at || delivery.createdAt)}`,
    kind: 'communication_delivery',
    communicationType: normalizeType(delivery.channel || delivery.communication_type || delivery.communicationType),
    direction: 'outbound',
    title: openedAt ? 'Communication Opened' : labels[status] || 'Communication Delivery Updated',
    subject: normalizeText(delivery.subject),
    summary: normalizeText(delivery.error_message || delivery.errorMessage || delivery.message_preview || delivery.messagePreview),
    message: normalizeText(delivery.message_preview || delivery.messagePreview),
    status: status || 'prepared',
    source: 'communication_delivery',
    agentId: readId(delivery, ['sent_by', 'sentBy', 'prepared_by', 'preparedBy', 'agent_id', 'agentId']),
    occurredAt: openedAt || readDate(delivery, ['delivered_at', 'deliveredAt', 'sent_at', 'sentAt', 'failed_at', 'failedAt', 'prepared_at', 'preparedAt', 'created_at', 'createdAt']) || new Date(0).toISOString(),
    metadata: {
      deliveryId: readId(delivery, ['id', 'deliveryId', 'delivery_id']),
      openedAt,
      provider: normalizeText(delivery.provider),
      providerMessageId: normalizeText(delivery.provider_message_id || delivery.providerMessageId),
      listingId: readId(delivery, ['listing_id', 'listingId']),
      recipient: normalizeText(delivery.recipient),
      recipientRole: normalizeText(delivery.recipient_role || delivery.recipientRole),
    },
    raw: delivery,
  })
}

export function buildCommunicationTimeline({
  communications = [],
  communicationDeliveries = [],
  leadActivities = [],
  activities = [],
  assignmentHistory = [],
  tasks = [],
  appointments = [],
  offers = [],
  transactions = [],
} = {}) {
  const items = [
    ...communications.map(fromCommunication),
    ...communicationDeliveries.map(fromDelivery),
    ...[...leadActivities, ...activities].map(fromActivity).filter(Boolean),
    ...assignmentHistory.map(fromAssignment),
    ...tasks.map(fromTask),
    ...appointments.map(fromAppointment),
    ...offers.map(fromOffer),
    ...transactions.map(fromTransaction),
  ]
  const seen = new Set()
  return items
    .filter((item) => {
      const key = item.id || `${item.title}:${item.occurredAt}:${item.summary}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .sort((left, right) => new Date(right.occurredAt || 0).getTime() - new Date(left.occurredAt || 0).getTime())
}

export function filterCommunicationTimeline(items = [], filters = {}) {
  const keyword = normalizeLower(filters.search || filters.keyword)
  const communicationType = normalizeLower(filters.communicationType || filters.type)
  const direction = normalizeLower(filters.direction)
  const agentId = normalizeText(filters.agentId)
  const fromMs = filters.dateFrom ? new Date(filters.dateFrom).getTime() : null
  const toMs = filters.dateTo ? new Date(`${filters.dateTo}T23:59:59`).getTime() : null

  return items.filter((item) => {
    const occurredMs = new Date(item.occurredAt || 0).getTime()
    if (keyword) {
      const haystack = [item.title, item.subject, item.summary, item.message, item.status, item.source].map(normalizeLower).join(' ')
      if (!haystack.includes(keyword)) return false
    }
    if (communicationType && communicationType !== 'all' && normalizeLower(item.communicationType) !== communicationType && normalizeLower(item.kind) !== communicationType) return false
    if (direction && direction !== 'all' && normalizeLower(item.direction) !== direction) return false
    if (agentId && normalizeText(item.agentId) !== agentId) return false
    if (fromMs && (!occurredMs || occurredMs < fromMs)) return false
    if (toMs && (!occurredMs || occurredMs > toMs)) return false
    return true
  })
}

export const __leadCommunicationServiceTestUtils = {
  ACTIVITY_OUTCOME_MARKER,
  buildCommunicationPayload,
  buildCommunicationTimeline,
  filterCommunicationTimeline,
  normalizeCommunicationEvent,
  normalizeDirection,
  normalizeType,
}
