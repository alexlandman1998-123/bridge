import { createAgencyCrmLeadActivity } from '../lib/agencyCrmRepository'
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'
import { createOrUpdateLeadFromEnquiry, normalizeLeadSource } from './leadIngestionService'
import { listSearchablePrivateListings, upsertLeadListingInterest } from './leadListingInterestService'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i

const REVIEW_STATUSES = ['needs_review', 'reviewed', 'resolved', 'duplicate']
const INGESTION_STATUSES = ['new', 'assigned', 'processed', 'duplicate', 'failed']

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

function requireClient() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is required before reviewing lead ingestion logs.')
  }
  return supabase
}

function getPayloadValue(payload = {}, keys = []) {
  for (const key of keys) {
    const value = normalizeText(payload?.[key])
    if (value) return value
  }
  return ''
}

export function getEnquiryPayloadSummary(payload = {}) {
  const contact = payload.contact && typeof payload.contact === 'object' ? payload.contact : {}
  const lead = payload.lead && typeof payload.lead === 'object' ? payload.lead : {}
  const firstName = getPayloadValue(contact, ['firstName', 'first_name'])
  const lastName = getPayloadValue(contact, ['lastName', 'last_name'])
  const name = normalizeText(
    payload.name ||
    payload.fullName ||
    contact.name ||
    contact.fullName ||
    [firstName, lastName].filter(Boolean).join(' '),
  )
  return {
    name: name || 'Unknown contact',
    email: normalizeLower(payload.email || contact.email || payload.fromEmail),
    phone: normalizeText(payload.phone || contact.phone || payload.mobile || payload.fromPhone),
    message: normalizeText(payload.message || payload.notes || payload.body || payload.comment || lead.notes),
    listingReference: normalizeText(
      payload.listingReference ||
      payload.listing_reference ||
      payload.externalListingReference ||
      payload.external_listing_reference ||
      payload.property24ListingId ||
      payload.privatePropertyListingId ||
      payload.listingId ||
      payload.listing_id ||
      lead.listingId ||
      lead.listing_id,
    ),
  }
}

function deriveReviewStatus(row = {}, payloadSummary = {}) {
  const explicit = normalizeLower(row.review_status || row.reviewStatus)
  if (explicit) return explicit
  const status = normalizeLower(row.status)
  const error = normalizeLower(row.error)
  if (status === 'duplicate') return 'duplicate'
  if (status === 'failed' || error || (payloadSummary.listingReference && !row.listing_id && !row.listingId)) return 'needs_review'
  return ''
}

export function normalizeLeadIngestionLog(row = {}) {
  const payload = row.payload && typeof row.payload === 'object' ? row.payload : {}
  const payloadSummary = getEnquiryPayloadSummary(payload)
  const status = normalizeLower(row.status) || 'new'
  const reviewStatus = deriveReviewStatus(row, payloadSummary)
  const error = normalizeText(row.error)
  const listingId = normalizeText(row.listing_id || row.listingId)
  const hasUnresolvedListing = Boolean(payloadSummary.listingReference && !listingId && normalizeLower(error).includes('listing'))
  return {
    logId: normalizeText(row.log_id || row.logId || row.id),
    organisationId: normalizeText(row.organisation_id || row.organisationId),
    source: normalizeLeadSource(row.source),
    externalReference: normalizeText(row.external_reference || row.externalReference),
    payload,
    payloadSummary,
    status,
    reviewStatus,
    leadId: normalizeText(row.lead_id || row.leadId),
    contactId: normalizeText(row.contact_id || row.contactId),
    listingId,
    assignedAgentId: normalizeText(row.assigned_agent_id || row.assignedAgentId),
    error,
    duplicateOfLogId: normalizeText(row.duplicate_of_log_id || row.duplicateOfLogId),
    retryCount: Number(row.retry_count || row.retryCount || 0),
    reviewedBy: normalizeText(row.reviewed_by || row.reviewedBy),
    reviewedAt: row.reviewed_at || row.reviewedAt || null,
    resolvedAt: row.resolved_at || row.resolvedAt || null,
    lastRetryAt: row.last_retry_at || row.lastRetryAt || null,
    createdAt: row.created_at || row.createdAt || null,
    processedAt: row.processed_at || row.processedAt || null,
    hasUnresolvedListing,
    raw: row,
  }
}

export function filterLeadIngestionLogsClientSide(rows = [], filters = {}) {
  const search = normalizeLower(filters.search)
  const issue = normalizeLower(filters.issue || 'all')
  return rows.filter((row) => {
    if (search) {
      const haystack = [
        row.source,
        row.externalReference,
        row.payloadSummary?.name,
        row.payloadSummary?.email,
        row.payloadSummary?.phone,
        row.payloadSummary?.listingReference,
        row.error,
      ].map(normalizeLower).join(' ')
      if (!haystack.includes(search)) return false
    }
    if (filters.hasLead === true && !row.leadId) return false
    if (filters.hasLead === false && row.leadId) return false
    if (filters.hasContact === true && !row.contactId) return false
    if (filters.hasContact === false && row.contactId) return false
    if (filters.hasError === true && !row.error) return false
    if (filters.hasError === false && row.error) return false
    if (filters.unresolvedListing === true && !row.hasUnresolvedListing) return false
    if (filters.duplicate === true && row.status !== 'duplicate' && row.reviewStatus !== 'duplicate') return false
    if (filters.failed === true && row.status !== 'failed') return false
    if (issue === 'failed' && row.status !== 'failed') return false
    if (issue === 'duplicate' && row.status !== 'duplicate' && row.reviewStatus !== 'duplicate') return false
    if (issue === 'unresolved_listing' && !row.hasUnresolvedListing) return false
    if (issue === 'needs_review' && row.reviewStatus !== 'needs_review') return false
    if (issue === 'has_error' && !row.error) return false
    return true
  })
}

function applyLogFilters(query, filters = {}) {
  const status = normalizeLower(filters.status || 'all')
  const reviewStatus = normalizeLower(filters.reviewStatus || 'all')
  const source = normalizeText(filters.source || 'all')
  if (INGESTION_STATUSES.includes(status)) query = query.eq('status', status)
  if (REVIEW_STATUSES.includes(reviewStatus)) query = query.eq('review_status', reviewStatus)
  if (source && source !== 'all') query = query.ilike('source', normalizeLeadSource(source))
  if (filters.createdFrom) query = query.gte('created_at', filters.createdFrom)
  if (filters.createdTo) query = query.lte('created_at', filters.createdTo)
  if (filters.hasLead === true) query = query.not('lead_id', 'is', null)
  if (filters.hasLead === false) query = query.is('lead_id', null)
  if (filters.hasContact === true) query = query.not('contact_id', 'is', null)
  if (filters.hasContact === false) query = query.is('contact_id', null)
  if (filters.hasError === true) query = query.not('error', 'is', null)
  if (filters.hasError === false) query = query.is('error', null)
  return query
}

export async function listLeadIngestionLogs(filters = {}) {
  const client = requireClient()
  const organisationId = nullableUuid(filters.organisationId || filters.organisation_id)
  if (!organisationId) return []
  let query = client
    .from('lead_ingestion_logs')
    .select('*')
    .eq('organisation_id', organisationId)
    .order('created_at', { ascending: false })
    .limit(Number(filters.limit || 500))
  query = applyLogFilters(query, filters)
  const { data, error } = await query
  if (error) throw error
  return filterLeadIngestionLogsClientSide((data || []).map(normalizeLeadIngestionLog), filters)
}

export async function getLeadIngestionLog(logId) {
  const client = requireClient()
  const normalizedLogId = nullableUuid(logId)
  if (!normalizedLogId) throw new Error('A valid ingestion log id is required.')
  const { data, error } = await client
    .from('lead_ingestion_logs')
    .select('*')
    .eq('log_id', normalizedLogId)
    .maybeSingle()
  if (error) throw error
  return data ? normalizeLeadIngestionLog(data) : null
}

async function updateLog(logId, patch = {}) {
  const client = requireClient()
  const normalizedLogId = nullableUuid(logId)
  if (!normalizedLogId) throw new Error('A valid ingestion log id is required.')
  const { data, error } = await client
    .from('lead_ingestion_logs')
    .update(patch)
    .eq('log_id', normalizedLogId)
    .select('*')
    .single()
  if (error) throw error
  return normalizeLeadIngestionLog(data)
}

function actorId(actor = null) {
  return nullableUuid(actor?.id || actor?.user_id || actor?.userId)
}

export function markLogReviewed(logId, { actor = null } = {}) {
  return updateLog(logId, {
    review_status: 'reviewed',
    reviewed_by: actorId(actor),
    reviewed_at: new Date().toISOString(),
  })
}

export function markLogDuplicate(logId, { duplicateOfLogId = '', actor = null } = {}) {
  return updateLog(logId, {
    status: 'duplicate',
    review_status: 'duplicate',
    duplicate_of_log_id: nullableUuid(duplicateOfLogId),
    reviewed_by: actorId(actor),
    reviewed_at: new Date().toISOString(),
  })
}

export function markLogResolved(logId, { actor = null } = {}) {
  const now = new Date().toISOString()
  return updateLog(logId, {
    review_status: 'resolved',
    reviewed_by: actorId(actor),
    reviewed_at: now,
    resolved_at: now,
  })
}

export function linkLogToLead({ logId, leadId }) {
  const normalizedLeadId = nullableUuid(leadId)
  if (!normalizedLeadId) throw new Error('A valid lead id is required.')
  return updateLog(logId, { lead_id: normalizedLeadId })
}

export function linkLogToContact({ logId, contactId }) {
  const normalizedContactId = nullableUuid(contactId)
  if (!normalizedContactId) throw new Error('A valid contact id is required.')
  return updateLog(logId, { contact_id: normalizedContactId })
}

export async function linkLogToListing({ logId, listingId }, { actor = null } = {}) {
  const normalizedListingId = nullableUuid(listingId)
  if (!normalizedListingId) throw new Error('A valid listing id is required.')
  const log = await getLeadIngestionLog(logId)
  if (!log) throw new Error('Ingestion log not found.')
  const updatedLog = await updateLog(logId, {
    listing_id: normalizedListingId,
    review_status: log.reviewStatus === 'needs_review' ? 'reviewed' : log.reviewStatus || null,
    reviewed_by: actorId(actor),
    reviewed_at: new Date().toISOString(),
  })
  let listingInterest = null
  if (log.organisationId && log.leadId) {
    listingInterest = await upsertLeadListingInterest(
      {
        organisationId: log.organisationId,
        leadId: log.leadId,
        contactId: log.contactId,
        listingId: normalizedListingId,
        source: log.source,
        status: 'interested',
        isOriginalEnquiry: true,
        isAgentSelected: false,
        notes: [
          log.payloadSummary?.message,
          log.externalReference ? `External reference: ${log.externalReference}` : '',
          'Linked during enquiry review.',
        ].filter(Boolean).join('\n'),
        createdBy: actorId(actor),
      },
      { actor },
    )
    await createAgencyCrmLeadActivity(
      log.organisationId,
      log.leadId,
      {
        activityType: 'Original enquiry listing linked',
        activityNote: `Listing linked from ${log.source} enquiry review${log.externalReference ? ` (${log.externalReference})` : ''}.`,
        outcome: 'listing_linked',
      },
      { actor },
    ).catch(() => null)
  }
  return { log: updatedLog, listingInterest }
}

export function buildRetryLeadIngestionPayload(log = {}, overrides = {}) {
  const payload = log.payload && typeof log.payload === 'object' ? { ...log.payload } : {}
  const source = normalizeLeadSource(overrides.source || payload.source || log.source)
  const listingId = normalizeText(overrides.listingId || overrides.listing_id || log.listingId || payload.listingId || payload.listing_id)
  return {
    ...payload,
    source,
    organisationId: overrides.organisationId || overrides.organisation_id || log.organisationId || payload.organisationId || payload.organisation_id,
    externalReference: normalizeText(overrides.externalReference || overrides.external_reference || log.externalReference || payload.externalReference || payload.external_reference),
    name: normalizeText(overrides.name || payload.name || payload.fullName),
    email: normalizeLower(overrides.email || payload.email),
    phone: normalizeText(overrides.phone || payload.phone || payload.mobile),
    message: normalizeText(overrides.message || payload.message || payload.notes),
    listingId: listingId || undefined,
    assignedAgent: overrides.assignedAgentId || overrides.assigned_agent_id
      ? { id: normalizeText(overrides.assignedAgentId || overrides.assigned_agent_id) }
      : payload.assignedAgent,
  }
}

export async function retryLeadIngestionLog({ logId, overrides = {} }, { actor = null } = {}) {
  const log = await getLeadIngestionLog(logId)
  if (!log) throw new Error('Ingestion log not found.')
  const retryPayload = buildRetryLeadIngestionPayload(log, overrides)
  const result = await createOrUpdateLeadFromEnquiry(retryPayload, { actor })
  const now = new Date().toISOString()
  const updatedLog = await updateLog(logId, {
    retry_count: Number(log.retryCount || 0) + 1,
    last_retry_at: now,
    review_status: result?.ok ? 'resolved' : 'needs_review',
    resolved_at: result?.ok ? now : log.resolvedAt,
    error: result?.ok ? log.error || null : result?.error || log.error || 'Retry failed.',
    lead_id: result?.leadId || log.leadId || null,
    contact_id: result?.contactId || log.contactId || null,
    listing_id: nullableUuid(result?.listing?.id || overrides.listingId || overrides.listing_id || log.listingId),
    processed_at: result?.ok ? now : log.processedAt,
  })
  return { log: updatedLog, result }
}

export function listReviewPrivateListings({ organisationId = '', search = '', status = 'all' } = {}) {
  return listSearchablePrivateListings({ organisationId, search, status })
}

export const __leadIngestionReviewServiceTestUtils = {
  buildRetryLeadIngestionPayload,
  filterLeadIngestionLogsClientSide,
  getEnquiryPayloadSummary,
  normalizeLeadIngestionLog,
}
