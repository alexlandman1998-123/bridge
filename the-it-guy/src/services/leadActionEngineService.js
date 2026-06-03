import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'
import {
  completeRecommendation as completeLeadRecommendation,
  convertRecommendationToTask,
  createRecommendation,
  dismissRecommendation as dismissLeadRecommendation,
  dueDateFromHours,
  listLeadRecommendations,
} from './leadRecommendationService'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function normalizeText(value) {
  return String(value ?? '').trim()
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase()
}

function nullableUuid(value) {
  const normalized = normalizeText(value)
  return UUID_PATTERN.test(normalized) ? normalized : null
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

function isRecoverableReadError(error, tableName = '') {
  const code = normalizeLower(error?.code)
  const message = `${error?.message || ''} ${error?.details || ''}`.toLowerCase()
  return code === '42p01' || code === 'pgrst205' || code === 'pgrst204' || code === '42703' ||
    (tableName && message.includes(tableName.toLowerCase()) && (message.includes('does not exist') || message.includes('schema cache'))) ||
    message.includes('row-level security') || message.includes('permission denied')
}

async function safeRead(table = '', select = '*', configure = null) {
  if (!isSupabaseConfigured || !supabase) return []
  let query = supabase.from(table).select(select)
  if (typeof configure === 'function') query = configure(query)
  const { data, error } = await query
  if (error) {
    if (isRecoverableReadError(error, table)) return []
    throw error
  }
  return Array.isArray(data) ? data : []
}

function getLeadContext(payload = {}) {
  const lead = payload.lead && typeof payload.lead === 'object' ? payload.lead : {}
  return {
    organisationId: nullableUuid(payload.organisationId || payload.organisation_id || lead.organisationId || lead.organisation_id),
    leadId: nullableUuid(payload.leadId || payload.lead_id || lead.leadId || lead.lead_id || lead.id),
    contactId: nullableUuid(payload.contactId || payload.contact_id || lead.contactId || lead.contact_id),
    assignedAgentId: nullableUuid(payload.assignedAgentId || payload.assigned_agent_id || lead.assignedAgentId || lead.assigned_agent_id || lead.assignedUserId || lead.assigned_user_id),
    lead,
  }
}

function eventIdFor(payload = {}, fallback = '') {
  return normalizeText(payload.eventId || payload.event_id || payload.sourceEvent || payload.source_event || fallback)
}

function buildEventRecommendation(payload = {}, rule = {}) {
  const context = getLeadContext(payload)
  if (!context.organisationId || !context.leadId) return null
  const eventId = eventIdFor(payload, rule.sourceEvent || rule.type)
  return {
    organisationId: context.organisationId,
    leadId: context.leadId,
    contactId: context.contactId,
    assignedAgentId: context.assignedAgentId,
    recommendationType: rule.type,
    title: rule.title,
    description: rule.description,
    priority: rule.priority || 'medium',
    sourceEvent: eventId,
    dueDate: payload.dueDate || payload.due_date || rule.dueDate || dueDateFromHours(rule.dueInHours || 24),
    metadata: {
      ...(payload.metadata && typeof payload.metadata === 'object' ? payload.metadata : {}),
      eventType: normalizeText(payload.eventType || payload.event_type || rule.eventType),
      eventId,
    },
  }
}

export function getRecommendationRuleForEvent(eventType = '') {
  const normalized = normalizeLower(eventType).replace(/[^a-z0-9]+/g, '_')
  const rules = {
    new_lead: {
      type: 'contact_lead',
      title: 'Contact Lead',
      description: 'A new lead needs first contact from the assigned agent.',
      priority: 'high',
      dueInHours: 2,
    },
    first_contact_logged: {
      type: 'qualify_lead',
      title: 'Qualify Lead',
      description: 'First contact has been logged. Capture or confirm requirements and readiness.',
      priority: 'medium',
      dueInHours: 24,
    },
    requirement_created: {
      type: 'review_matches',
      title: 'Review Suggested Matches',
      description: 'A structured requirement is available. Review suggested listings before moving the lead forward.',
      priority: 'medium',
      dueInHours: 24,
    },
    suggestion_accepted: {
      type: 'send_property',
      title: 'Send Property To Buyer',
      description: 'A suggestion was accepted. Agent should decide whether and how to share the property.',
      priority: 'high',
      dueInHours: 24,
    },
    viewing_scheduled: {
      type: 'confirm_viewing',
      title: 'Confirm Viewing',
      description: 'A viewing has been scheduled. Confirm attendance and viewing logistics.',
      priority: 'medium',
      dueInHours: 24,
    },
    viewing_completed: {
      type: 'follow_up_viewing',
      title: 'Follow Up Buyer',
      description: 'A viewing was completed. Follow up with the buyer and capture next steps.',
      priority: 'high',
      dueInHours: 24,
    },
    offer_submitted: {
      type: 'follow_up_offer',
      title: 'Track Offer Outcome',
      description: 'An offer has been submitted. Track the outcome and keep the lead record current.',
      priority: 'high',
      dueInHours: 24,
    },
    offer_rejected: {
      type: 'find_alternatives',
      title: 'Find Alternative Listings',
      description: 'An offer was rejected. Review requirements and find alternative listings.',
      priority: 'medium',
      dueInHours: 48,
    },
    offer_accepted: {
      type: 'transaction_handover',
      title: 'Prepare Transaction Handover',
      description: 'An offer was accepted. Prepare the existing transaction handover path.',
      priority: 'urgent',
      dueInHours: 24,
    },
  }
  return rules[normalized] || null
}

export async function processLeadEvent(payload = {}, options = {}) {
  const eventType = normalizeText(payload.eventType || payload.event_type || payload.type || 'new_lead')
  const rule = getRecommendationRuleForEvent(eventType)
  if (!rule) return null
  const recommendationPayload = buildEventRecommendation(payload, { ...rule, eventType })
  if (!recommendationPayload) return null
  return createRecommendation(recommendationPayload, options)
}

export function processViewingEvent(payload = {}, options = {}) {
  const status = normalizeLower(payload.status || payload.viewingStatus || payload.viewing_status || payload.eventType)
  const eventType = status.includes('complete') || status.includes('viewed') ? 'viewing_completed' : 'viewing_scheduled'
  return processLeadEvent({ ...payload, eventType, sourceEvent: eventIdFor(payload, `${eventType}:${readId(payload, ['appointmentId', 'appointment_id', 'id']) || 'manual'}`) }, options)
}

export function processSuggestionEvent(payload = {}, options = {}) {
  const status = normalizeLower(payload.status || payload.suggestionStatus || payload.suggestion_status || payload.eventType)
  const eventType = status.includes('accept') ? 'suggestion_accepted' : 'requirement_created'
  return processLeadEvent({ ...payload, eventType, sourceEvent: eventIdFor(payload, `${eventType}:${readId(payload, ['suggestionId', 'suggestion_id', 'id']) || 'manual'}`) }, options)
}

export function processOfferEvent(payload = {}, options = {}) {
  const status = normalizeLower(payload.status || payload.offerStatus || payload.offer_status || payload.eventType)
  const eventType = status.includes('accept')
    ? 'offer_accepted'
    : status.includes('reject') || status.includes('declin')
      ? 'offer_rejected'
      : 'offer_submitted'
  return processLeadEvent({ ...payload, eventType, sourceEvent: eventIdFor(payload, `${eventType}:${readId(payload, ['offerId', 'offer_id', 'id']) || 'manual'}`) }, options)
}

export function processCommunicationEvent(payload = {}, options = {}) {
  const type = normalizeLower(payload.communicationType || payload.communication_type || payload.type)
  if (type === 'system') return null
  const leadId = readId(payload, ['leadId', 'lead_id'])
  return processLeadEvent({
    ...payload,
    eventType: 'first_contact_logged',
    sourceEvent: eventIdFor({ ...payload, sourceEvent: `first_contact_logged:${leadId || 'manual'}` }),
  }, options)
}

export function createRecommendedTask(payload = {}, options = {}) {
  return convertRecommendationToTask(payload, options)
}

export function dismissRecommendation(payload = {}, options = {}) {
  return dismissLeadRecommendation(payload, options)
}

export function completeRecommendation(payload = {}, options = {}) {
  return completeLeadRecommendation(payload, options)
}

export { listLeadRecommendations }

function latestDateForLead(rows = [], leadId = '') {
  return rows
    .filter((row) => readId(row, ['lead_id', 'leadId']) === leadId)
    .map((row) => readDate(row, ['occurred_at', 'occurredAt', 'activity_date', 'activityDate', 'created_at', 'createdAt', 'updated_at', 'updatedAt']))
    .filter(Boolean)
    .sort()
    .at(-1) || null
}

function olderThan(dateValue = '', hours = 24, now = new Date()) {
  const date = new Date(dateValue || 0)
  const nowDate = now instanceof Date ? now : new Date(now)
  if (Number.isNaN(date.getTime()) || Number.isNaN(nowDate.getTime())) return false
  return nowDate.getTime() - date.getTime() >= hours * 60 * 60 * 1000
}

export async function processInactivityChecks({ organisationId = '', now = new Date() } = {}, options = {}) {
  const normalizedOrgId = nullableUuid(organisationId)
  if (!normalizedOrgId) return []
  const [leads, activities, communications, suggestions, appointments] = await Promise.all([
    safeRead('leads', 'lead_id, organisation_id, contact_id, assigned_agent_id, assigned_user_id, assigned_at, first_contacted_at, created_at, updated_at', (query) => query.eq('organisation_id', normalizedOrgId).limit(2000)),
    safeRead('lead_activities', 'lead_id, activity_date, created_at', (query) => query.eq('organisation_id', normalizedOrgId).limit(5000)),
    safeRead('lead_communication_events', 'lead_id, occurred_at, created_at', (query) => query.eq('organisation_id', normalizedOrgId).limit(5000)),
    safeRead('lead_listing_suggestions', 'suggestion_id, organisation_id, lead_id, requirement_id, listing_id, status, generated_at', (query) => query.eq('organisation_id', normalizedOrgId).eq('status', 'pending').limit(2000)),
    safeRead('appointments', 'appointment_id, id, organisation_id, lead_id, contact_id, listing_id, status, start_time, end_time, appointment_date, created_at, updated_at', (query) => query.eq('organisation_id', normalizedOrgId).limit(2000)),
  ])
  const created = []
  for (const lead of leads) {
    const leadId = readId(lead, ['lead_id', 'leadId'])
    const assignedAgentId = readId(lead, ['assigned_agent_id', 'assignedAgentId', 'assigned_user_id', 'assignedUserId'])
    const assignedAt = readDate(lead, ['assigned_at', 'assignedAt', 'created_at', 'createdAt'])
    if (!lead.first_contacted_at && assignedAt && olderThan(assignedAt, 24, now)) {
      created.push(await processLeadEvent({
        organisationId: normalizedOrgId,
        leadId,
        contactId: readId(lead, ['contact_id', 'contactId']),
        assignedAgentId,
        eventType: 'new_lead',
        sourceEvent: `inactivity:not_contacted:${leadId}`,
        dueDate: dueDateFromHours(4, now),
        metadata: { reason: 'Lead assigned for 24h without first contact.' },
      }, options))
    }
    const latest = latestDateForLead([...activities, ...communications], leadId) || readDate(lead, ['updated_at', 'updatedAt', 'created_at', 'createdAt'])
    if (latest && olderThan(latest, 7 * 24, now)) {
      created.push(await createRecommendation({
        organisationId: normalizedOrgId,
        leadId,
        contactId: readId(lead, ['contact_id', 'contactId']),
        assignedAgentId,
        recommendationType: 'general_follow_up',
        title: 'Follow Up Lead',
        description: 'No lead activity has been logged for 7 days.',
        priority: 'medium',
        sourceEvent: `inactivity:no_activity_7d:${leadId}`,
        dueDate: dueDateFromHours(24, now),
        metadata: { latestActivityAt: latest },
      }, options))
    }
  }
  for (const suggestion of suggestions) {
    if (!olderThan(suggestion.generated_at, 14 * 24, now)) continue
    created.push(await createRecommendation({
      organisationId: normalizedOrgId,
      leadId: readId(suggestion, ['lead_id', 'leadId']),
      recommendationType: 'review_matches',
      title: 'Review Suggestions',
      description: 'Suggested listings have been pending for 14 days.',
      priority: 'medium',
      sourceEvent: `inactivity:suggestion_ignored:${readId(suggestion, ['suggestion_id', 'suggestionId'])}`,
      dueDate: dueDateFromHours(24, now),
      metadata: { suggestionId: readId(suggestion, ['suggestion_id', 'suggestionId']) },
    }, options))
  }
  for (const appointment of appointments) {
    const status = normalizeLower(appointment.status)
    if (!status.includes('complete') && !status.includes('viewed')) continue
    const eventDate = readDate(appointment, ['end_time', 'start_time', 'appointment_date', 'updated_at', 'created_at'])
    if (!olderThan(eventDate, 48, now)) continue
    created.push(await processViewingEvent({
      organisationId: normalizedOrgId,
      leadId: readId(appointment, ['lead_id', 'leadId']),
      contactId: readId(appointment, ['contact_id', 'contactId']),
      eventType: 'viewing_completed',
      status: 'completed',
      sourceEvent: `inactivity:viewing_follow_up:${readId(appointment, ['appointment_id', 'id'])}`,
      metadata: { appointmentId: readId(appointment, ['appointment_id', 'id']), listingId: readId(appointment, ['listing_id', 'listingId']) },
    }, options))
  }
  return created.filter(Boolean)
}

export const __leadActionEngineServiceTestUtils = {
  buildEventRecommendation,
  getRecommendationRuleForEvent,
  latestDateForLead,
  olderThan,
}
