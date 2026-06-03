import { createAgencyCrmLeadActivity, createAgencyCrmLeadTask } from '../lib/agencyCrmRepository'
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export const LEAD_RECOMMENDATION_TYPES = [
  'contact_lead',
  'qualify_lead',
  'review_matches',
  'send_property',
  'confirm_viewing',
  'follow_up_viewing',
  'follow_up_offer',
  'find_alternatives',
  'transaction_handover',
  'general_follow_up',
]

export const LEAD_RECOMMENDATION_STATUSES = ['pending', 'accepted', 'completed', 'dismissed', 'expired']
export const LEAD_RECOMMENDATION_PRIORITIES = ['low', 'medium', 'high', 'urgent']

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

function normalizeType(value = 'general_follow_up') {
  const normalized = normalizeLower(value).replace(/[^a-z0-9]+/g, '_')
  return LEAD_RECOMMENDATION_TYPES.includes(normalized) ? normalized : 'general_follow_up'
}

function normalizeStatus(value = 'pending') {
  const normalized = normalizeLower(value).replace(/[^a-z0-9]+/g, '_')
  const aliases = {
    accept: 'accepted',
    complete: 'completed',
    dismiss: 'dismissed',
    expire: 'expired',
  }
  if (aliases[normalized]) return aliases[normalized]
  return LEAD_RECOMMENDATION_STATUSES.includes(normalized) ? normalized : 'pending'
}

function normalizePriority(value = 'medium') {
  const normalized = normalizeLower(value).replace(/[^a-z0-9]+/g, '_')
  return LEAD_RECOMMENDATION_PRIORITIES.includes(normalized) ? normalized : 'medium'
}

function requireClient() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is required before managing lead recommendations.')
  }
  return supabase
}

function isRecoverableReadError(error, tableName = '') {
  const code = normalizeLower(error?.code)
  const message = `${error?.message || ''} ${error?.details || ''}`.toLowerCase()
  return code === '42p01' || code === 'pgrst205' || code === 'pgrst204' || code === '42703' ||
    (tableName && message.includes(tableName.toLowerCase()) && (message.includes('does not exist') || message.includes('schema cache'))) ||
    message.includes('row-level security') || message.includes('permission denied')
}

function readId(row = {}, keys = []) {
  for (const key of keys) {
    const value = normalizeText(row?.[key])
    if (value) return value
  }
  return ''
}

function readDate(value = null) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function safeMetadata(value = {}) {
  if (!value) return {}
  if (typeof value === 'object') return value
  try {
    return JSON.parse(value)
  } catch {
    return {}
  }
}

function defaultTitleForType(type = 'general_follow_up') {
  const labels = {
    contact_lead: 'Contact Lead',
    qualify_lead: 'Qualify Lead',
    review_matches: 'Review Suggested Matches',
    send_property: 'Send Property To Buyer',
    confirm_viewing: 'Confirm Viewing',
    follow_up_viewing: 'Follow Up Buyer',
    follow_up_offer: 'Track Offer Outcome',
    find_alternatives: 'Find Alternative Listings',
    transaction_handover: 'Prepare Transaction Handover',
    general_follow_up: 'Follow Up Lead',
  }
  return labels[normalizeType(type)] || labels.general_follow_up
}

export function dueDateFromHours(hours = 24, base = new Date()) {
  const baseDate = base instanceof Date ? base : new Date(base || Date.now())
  const safeBase = Number.isNaN(baseDate.getTime()) ? new Date() : baseDate
  return new Date(safeBase.getTime() + Math.max(1, Number(hours || 24)) * 60 * 60 * 1000).toISOString()
}

export function mapLeadRecommendation(row = {}) {
  return {
    recommendationId: readId(row, ['recommendationId', 'recommendation_id', 'id']),
    organisationId: readId(row, ['organisationId', 'organisation_id']),
    leadId: readId(row, ['leadId', 'lead_id']),
    contactId: readId(row, ['contactId', 'contact_id']),
    assignedAgentId: readId(row, ['assignedAgentId', 'assigned_agent_id']),
    recommendationType: normalizeType(row.recommendationType || row.recommendation_type),
    title: normalizeText(row.title) || defaultTitleForType(row.recommendationType || row.recommendation_type),
    description: normalizeText(row.description),
    priority: normalizePriority(row.priority),
    status: normalizeStatus(row.status),
    sourceEvent: normalizeText(row.sourceEvent || row.source_event),
    dueDate: readDate(row.dueDate || row.due_date),
    taskId: readId(row, ['taskId', 'task_id']),
    createdAt: readDate(row.createdAt || row.created_at),
    completedAt: readDate(row.completedAt || row.completed_at),
    dismissedAt: readDate(row.dismissedAt || row.dismissed_at),
    metadata: safeMetadata(row.metadata),
    raw: row,
  }
}

export function buildRecommendationPayload(payload = {}) {
  const organisationId = nullableUuid(payload.organisationId || payload.organisation_id)
  const leadId = nullableUuid(payload.leadId || payload.lead_id)
  if (!organisationId || !leadId) {
    throw new Error('Valid organisation and lead ids are required for lead recommendations.')
  }
  const recommendationType = normalizeType(payload.recommendationType || payload.recommendation_type || payload.type)
  return {
    organisation_id: organisationId,
    lead_id: leadId,
    contact_id: nullableUuid(payload.contactId || payload.contact_id),
    assigned_agent_id: nullableUuid(payload.assignedAgentId || payload.assigned_agent_id),
    recommendation_type: recommendationType,
    title: normalizeText(payload.title) || defaultTitleForType(recommendationType),
    description: normalizeText(payload.description) || null,
    priority: normalizePriority(payload.priority),
    status: normalizeStatus(payload.status),
    source_event: normalizeText(payload.sourceEvent || payload.source_event) || null,
    due_date: readDate(payload.dueDate || payload.due_date) || null,
    task_id: nullableUuid(payload.taskId || payload.task_id),
    metadata: payload.metadata && typeof payload.metadata === 'object' ? payload.metadata : {},
  }
}

async function findOpenDuplicate(payload = {}) {
  const client = requireClient()
  let query = client
    .from('lead_recommendations')
    .select('*')
    .eq('organisation_id', payload.organisation_id)
    .eq('lead_id', payload.lead_id)
    .eq('recommendation_type', payload.recommendation_type)
    .in('status', ['pending', 'accepted'])
    .limit(1)
  if (payload.source_event) query = query.eq('source_event', payload.source_event)
  const { data, error } = await query.maybeSingle()
  if (error) {
    if (isRecoverableReadError(error, 'lead_recommendations')) return null
    throw error
  }
  return data ? mapLeadRecommendation(data) : null
}

async function logRecommendationActivity(recommendation = {}, action = 'created', actor = null) {
  try {
    await createAgencyCrmLeadActivity(
      recommendation.organisationId,
      recommendation.leadId,
      {
        activityType: 'Recommendation',
        activityNote: `${recommendation.title} ${action}.`,
        outcome: `recommendation_${action}`,
      },
      { actor },
    )
  } catch (error) {
    console.warn('[leadRecommendationService] activity mirror skipped', error)
  }
}

export async function listRecommendations({
  organisationId = '',
  leadId = '',
  assignedAgentId = '',
  status = 'all',
  recommendationType = '',
  dueBefore = '',
  limit = 500,
} = {}) {
  const normalizedOrgId = nullableUuid(organisationId)
  if (!normalizedOrgId) return []
  const client = requireClient()
  let query = client
    .from('lead_recommendations')
    .select('*')
    .eq('organisation_id', normalizedOrgId)
    .order('due_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(Math.max(1, Math.min(Number(limit) || 500, 2000)))
  if (nullableUuid(leadId)) query = query.eq('lead_id', nullableUuid(leadId))
  if (nullableUuid(assignedAgentId)) query = query.eq('assigned_agent_id', nullableUuid(assignedAgentId))
  if (status && status !== 'all') query = query.eq('status', normalizeStatus(status))
  if (recommendationType && recommendationType !== 'all') query = query.eq('recommendation_type', normalizeType(recommendationType))
  if (dueBefore) query = query.lte('due_date', new Date(dueBefore).toISOString())

  const { data, error } = await query
  if (error) {
    if (isRecoverableReadError(error, 'lead_recommendations')) return []
    throw error
  }
  return (Array.isArray(data) ? data : []).map(mapLeadRecommendation)
}

export function listLeadRecommendations({ organisationId = '', leadId = '', status = 'all' } = {}) {
  return listRecommendations({ organisationId, leadId, status })
}

export async function createRecommendation(payload = {}, { actor = null, dedupe = true } = {}) {
  const client = requireClient()
  const insertPayload = buildRecommendationPayload(payload)
  if (dedupe) {
    const existing = await findOpenDuplicate(insertPayload)
    if (existing) return existing
  }
  const { data, error } = await client
    .from('lead_recommendations')
    .insert(insertPayload)
    .select('*')
    .single()
  if (error) {
    if (error.code === '23505') {
      const existing = await findOpenDuplicate(insertPayload)
      if (existing) return existing
    }
    throw error
  }
  const recommendation = mapLeadRecommendation(data)
  await logRecommendationActivity(recommendation, 'created', actor)
  return recommendation
}

async function updateRecommendationStatus({ recommendationId = '', status = '', patch = {} } = {}, { actor = null } = {}) {
  const client = requireClient()
  const normalizedId = nullableUuid(recommendationId)
  if (!normalizedId) throw new Error('Recommendation id is required.')
  const normalizedStatus = normalizeStatus(status)
  const now = new Date().toISOString()
  const statusPatch = {
    status: normalizedStatus,
    ...patch,
  }
  if (normalizedStatus === 'completed') statusPatch.completed_at = now
  if (normalizedStatus === 'dismissed') statusPatch.dismissed_at = now
  const { data, error } = await client
    .from('lead_recommendations')
    .update(statusPatch)
    .eq('recommendation_id', normalizedId)
    .select('*')
    .single()
  if (error) throw error
  const recommendation = mapLeadRecommendation(data)
  await logRecommendationActivity(recommendation, normalizedStatus, actor)
  return recommendation
}

export function acceptRecommendation({ recommendationId = '' } = {}, options = {}) {
  return updateRecommendationStatus({ recommendationId, status: 'accepted' }, options)
}

export function dismissRecommendation({ recommendationId = '', reason = '' } = {}, options = {}) {
  return updateRecommendationStatus({
    recommendationId,
    status: 'dismissed',
    patch: { metadata: { reason: normalizeText(reason) || 'Dismissed by agent.' } },
  }, options)
}

export function completeRecommendation({ recommendationId = '' } = {}, options = {}) {
  return updateRecommendationStatus({ recommendationId, status: 'completed' }, options)
}

export function expireRecommendation({ recommendationId = '', reason = 'Recommendation expired.' } = {}, options = {}) {
  return updateRecommendationStatus({
    recommendationId,
    status: 'expired',
    patch: { metadata: { reason: normalizeText(reason) } },
  }, options)
}

async function readRecommendation(recommendationId = '') {
  const client = requireClient()
  const normalizedId = nullableUuid(recommendationId)
  if (!normalizedId) throw new Error('Recommendation id is required.')
  const { data, error } = await client
    .from('lead_recommendations')
    .select('*')
    .eq('recommendation_id', normalizedId)
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error('Recommendation not found.')
  return mapLeadRecommendation(data)
}

export async function convertRecommendationToTask({ recommendationId = '' } = {}, { actor = null } = {}) {
  const recommendation = await readRecommendation(recommendationId)
  if (recommendation.taskId) return recommendation
  const task = await createAgencyCrmLeadTask(
    recommendation.organisationId,
    recommendation.leadId,
    {
      title: recommendation.title,
      description: recommendation.description,
      dueDate: recommendation.dueDate,
      status: 'Pending',
      priority: recommendation.priority,
      assignedAgent: recommendation.assignedAgentId ? { id: recommendation.assignedAgentId } : null,
    },
    { actor },
  )
  const taskId = readId(task || {}, ['taskId', 'task_id', 'id'])
  return updateRecommendationStatus({
    recommendationId,
    status: 'accepted',
    patch: { task_id: nullableUuid(taskId), metadata: { ...recommendation.metadata, convertedToTaskAt: new Date().toISOString() } },
  }, { actor })
}

export function createRecommendedTask(payload = {}, options = {}) {
  return createRecommendation(payload, options)
}

export function getRecommendationAgeDays(recommendation = {}, now = new Date()) {
  const created = new Date(recommendation.createdAt || recommendation.created_at || Date.now())
  const nowDate = now instanceof Date ? now : new Date(now)
  if (Number.isNaN(created.getTime()) || Number.isNaN(nowDate.getTime())) return 0
  return Math.max(0, Math.floor((nowDate.getTime() - created.getTime()) / 86_400_000))
}

export function isRecommendationOverdue(recommendation = {}, now = new Date()) {
  if (!['pending', 'accepted'].includes(normalizeStatus(recommendation.status))) return false
  const dueDate = recommendation.dueDate || recommendation.due_date
  if (!dueDate) return false
  const dueMs = new Date(dueDate).getTime()
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime()
  return !Number.isNaN(dueMs) && !Number.isNaN(nowMs) && dueMs < nowMs
}

export function getRecommendationMetrics(rows = [], now = new Date()) {
  const recommendations = rows.map(mapLeadRecommendation)
  const completedDurations = recommendations
    .filter((row) => row.completedAt && row.createdAt)
    .map((row) => Math.max(0, new Date(row.completedAt).getTime() - new Date(row.createdAt).getTime()) / 3_600_000)
  const averageCompletionHours = completedDurations.length
    ? Math.round((completedDurations.reduce((sum, value) => sum + value, 0) / completedDurations.length) * 10) / 10
    : 0
  const convertedToTasks = recommendations.filter((row) => row.taskId).length
  return {
    created: recommendations.length,
    pending: recommendations.filter((row) => row.status === 'pending').length,
    accepted: recommendations.filter((row) => row.status === 'accepted').length,
    completed: recommendations.filter((row) => row.status === 'completed').length,
    dismissed: recommendations.filter((row) => row.status === 'dismissed').length,
    expired: recommendations.filter((row) => row.status === 'expired').length,
    overdue: recommendations.filter((row) => isRecommendationOverdue(row, now)).length,
    urgent: recommendations.filter((row) => row.priority === 'urgent').length,
    taskConversionRate: recommendations.length ? Math.round((convertedToTasks / recommendations.length) * 1000) / 10 : 0,
    averageCompletionHours,
  }
}

export const __leadRecommendationServiceTestUtils = {
  buildRecommendationPayload,
  defaultTitleForType,
  dueDateFromHours,
  getRecommendationAgeDays,
  getRecommendationMetrics,
  isRecommendationOverdue,
  mapLeadRecommendation,
  normalizePriority,
  normalizeStatus,
  normalizeType,
}
