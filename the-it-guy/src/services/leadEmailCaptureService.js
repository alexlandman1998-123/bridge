import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'
import { createOrUpdateLeadFromEnquiry, normalizeLeadSource } from './leadIngestionService'

export const DEFAULT_LEAD_CAPTURE_DOMAIN = 'leads.arch9.co.za'
export const LEAD_CAPTURE_SOURCES = ['General', 'Property24', 'Private Property', 'Website', 'Facebook']
export const LOW_CONFIDENCE_REVIEW_THRESHOLD = 0.65
export const LEAD_CAPTURE_REVIEW_STATUSES = ['open', 'resolved', 'ignored']
export const LEAD_CAPTURE_CONFIDENCE_FILTERS = ['all', 'low', 'medium', 'high', 'unscored']
export const LEAD_CAPTURE_PRODUCTION_CHECKLIST = [
  {
    id: 'domain',
    label: 'Inbound domain verified',
    description: 'The capture domain is owned by Arch9 and ready to receive forwarded portal lead emails.',
  },
  {
    id: 'mx',
    label: 'MX routed to inbound provider',
    description: 'MX records point the lead capture domain to the chosen inbound email provider.',
  },
  {
    id: 'webhook',
    label: 'Webhook connected',
    description: 'The provider posts normalized inbound messages to the inbound-lead-email Edge Function.',
  },
  {
    id: 'secret',
    label: 'Webhook secret configured',
    description: 'INBOUND_LEAD_EMAIL_WEBHOOK_SECRET is set in Supabase and provider requests include it.',
  },
  {
    id: 'monitoring',
    label: 'Delivery monitoring live',
    description: 'Failed, unmatched, and low-confidence inbound emails are visible in the review queue.',
  },
]
export const LEAD_CAPTURE_PRODUCTION_ENV_VARS = [
  {
    name: 'INBOUND_LEAD_EMAIL_WEBHOOK_SECRET',
    required: true,
    purpose: 'Shared secret that every inbound email provider webhook must send as x-arch9-inbound-secret.',
  },
  {
    name: 'INBOUND_LEAD_EMAIL_REQUIRE_SECRET',
    required: true,
    purpose: 'Set to true in production so the Edge Function refuses unsigned webhook traffic.',
  },
  {
    name: 'INBOUND_LEAD_EMAIL_ALLOWED_PROVIDERS',
    required: false,
    purpose: 'Comma-separated allowlist such as mailgun,sendgrid,postmark,resend,amazon-ses.',
  },
]

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function normalizeText(value) {
  return String(value ?? '').trim()
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase()
}

function isUuidLike(value) {
  return UUID_PATTERN.test(normalizeText(value))
}

function requireClient() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is required before managing lead capture aliases.')
  }
  return supabase
}

export function normalizeCaptureEmail(value = '') {
  const text = normalizeText(value)
  const bracketMatch = text.match(/<([^>]+)>/)
  const candidate = normalizeLower(bracketMatch?.[1] || text).replace(/^mailto:/, '')
  const emailMatch = candidate.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i)
  return emailMatch?.[0] || candidate
}

export function slugifyCapturePart(value = '', fallback = 'lead') {
  const slug = normalizeLower(value || fallback)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || fallback
}

function stableHash(value = '') {
  let hash = 0
  const input = normalizeText(value)
  for (let index = 0; index < input.length; index += 1) {
    hash = ((hash << 5) - hash + input.charCodeAt(index)) | 0
  }
  return Math.abs(hash).toString(36).padStart(6, '0').slice(0, 8)
}

export function buildLeadCaptureAliasLocalPart({
  organisationId = '',
  agentUserId = '',
  branchId = '',
  listingId = '',
  source = 'General',
  routingLevel = 'agency',
} = {}) {
  const prefix = slugifyCapturePart(source, routingLevel)
  const token = stableHash([organisationId, agentUserId, branchId, listingId, source, routingLevel].join('|'))
  return `${prefix}-${token}`.slice(0, 64)
}

export function buildLeadCaptureEmail(params = {}) {
  const domain = normalizeLower(params.aliasDomain || params.domain || DEFAULT_LEAD_CAPTURE_DOMAIN)
  return `${buildLeadCaptureAliasLocalPart(params)}@${domain}`
}

export function buildDefaultLeadCaptureAliasRequests({
  organisationId = '',
  agentUserId = '',
  branchId = '',
  sources = LEAD_CAPTURE_SOURCES,
  aliasDomain = DEFAULT_LEAD_CAPTURE_DOMAIN,
} = {}) {
  const requests = [{
    organisationId,
    agentUserId: agentUserId || null,
    branchId: branchId || null,
    source: 'General',
    routingLevel: agentUserId ? 'agent' : 'agency',
    aliasDomain,
  }]

  for (const source of sources) {
    const normalizedSource = normalizeLeadSource(source)
    if (!normalizedSource || normalizedSource === 'Other' || normalizedSource === 'General') continue
    requests.push({
      organisationId,
      agentUserId: agentUserId || null,
      branchId: branchId || null,
      source: normalizedSource,
      routingLevel: agentUserId ? 'agent_source' : 'agency',
      aliasDomain,
    })
  }

  return requests
}

export function getLeadCaptureSetupStatus({ aliases = [], lastInboundEmail = null } = {}) {
  const activeAliases = (Array.isArray(aliases) ? aliases : []).filter((alias) => alias.status === 'active')
  if (lastInboundEmail?.leadId || lastInboundEmail?.status === 'processed') return 'active'
  if (lastInboundEmail?.emailId) return 'test_received'
  if (activeAliases.length) return 'addresses_generated'
  return 'not_started'
}

function mapAliasRow(row = {}) {
  return {
    aliasId: normalizeText(row.alias_id || row.aliasId),
    organisationId: normalizeText(row.organisation_id || row.organisationId),
    branchId: normalizeText(row.branch_id || row.branchId),
    agentUserId: normalizeText(row.agent_user_id || row.agentUserId),
    listingId: normalizeText(row.listing_id || row.listingId),
    source: normalizeText(row.source) || 'General',
    routingLevel: normalizeText(row.routing_level || row.routingLevel) || 'agency',
    aliasLocalPart: normalizeText(row.alias_local_part || row.aliasLocalPart),
    aliasDomain: normalizeText(row.alias_domain || row.aliasDomain) || DEFAULT_LEAD_CAPTURE_DOMAIN,
    emailAddress: normalizeCaptureEmail(row.email_address || row.emailAddress),
    status: normalizeText(row.status) || 'active',
    metadata: row.metadata_json || row.metadata || {},
    createdAt: row.created_at || row.createdAt,
    updatedAt: row.updated_at || row.updatedAt,
  }
}

function mapInboundEmailRow(row = {}) {
  return {
    emailId: normalizeText(row.email_id || row.emailId),
    organisationId: normalizeText(row.organisation_id || row.organisationId),
    captureAliasId: normalizeText(row.capture_alias_id || row.captureAliasId),
    provider: normalizeText(row.provider) || 'unknown',
    providerMessageId: normalizeText(row.provider_message_id || row.providerMessageId),
    fromEmail: normalizeCaptureEmail(row.from_email || row.fromEmail),
    fromName: normalizeText(row.from_name || row.fromName),
    subject: normalizeText(row.subject),
    source: normalizeText(row.source) || 'Other',
    externalReference: normalizeText(row.external_reference || row.externalReference),
    status: normalizeText(row.status) || 'received',
    leadId: normalizeText(row.lead_id || row.leadId),
    contactId: normalizeText(row.contact_id || row.contactId),
    error: normalizeText(row.error),
    parserName: normalizeText(row.parser_name || row.parserName),
    parseConfidence: row.parse_confidence === null || row.parse_confidence === undefined ? null : Number(row.parse_confidence),
    parseWarnings: Array.isArray(row.parse_warnings || row.parseWarnings) ? row.parse_warnings || row.parseWarnings : [],
    matchedFields: row.matched_fields || row.matchedFields || {},
    reviewStatus: normalizeText(row.review_status || row.reviewStatus),
    reviewedBy: normalizeText(row.reviewed_by || row.reviewedBy),
    reviewedAt: row.reviewed_at || row.reviewedAt,
    resolvedAt: row.resolved_at || row.resolvedAt,
    ignoredAt: row.ignored_at || row.ignoredAt,
    reviewNote: normalizeText(row.review_note || row.reviewNote),
    repairedPayload: row.repaired_payload || row.repairedPayload || {},
    repairedBy: normalizeText(row.repaired_by || row.repairedBy),
    repairedAt: row.repaired_at || row.repairedAt,
    leadIngestionLogId: normalizeText(row.lead_ingestion_log_id || row.leadIngestionLogId),
    receivedAt: row.received_at || row.receivedAt,
    processedAt: row.processed_at || row.processedAt,
    parsedAt: row.parsed_at || row.parsedAt,
  }
}

function mapParseFailureRow(row = {}) {
  return {
    failureId: normalizeText(row.failure_id || row.failureId),
    inboundEmailId: normalizeText(row.inbound_email_id || row.inboundEmailId),
    organisationId: normalizeText(row.organisation_id || row.organisationId),
    captureAliasId: normalizeText(row.capture_alias_id || row.captureAliasId),
    source: normalizeText(row.source) || 'Other',
    reason: normalizeText(row.reason),
    status: normalizeText(row.status) || 'open',
    parserName: normalizeText(row.parser_name || row.parserName),
    parseConfidence: row.parse_confidence === null || row.parse_confidence === undefined ? null : Number(row.parse_confidence),
    parseWarnings: Array.isArray(row.parse_warnings || row.parseWarnings) ? row.parse_warnings || row.parseWarnings : [],
    payload: row.payload || {},
    resolvedBy: normalizeText(row.resolved_by || row.resolvedBy),
    resolvedAt: row.resolved_at || row.resolvedAt,
    ignoredBy: normalizeText(row.ignored_by || row.ignoredBy),
    ignoredAt: row.ignored_at || row.ignoredAt,
    reviewNote: normalizeText(row.review_note || row.reviewNote),
    repairedPayload: row.repaired_payload || row.repairedPayload || {},
    repairedBy: normalizeText(row.repaired_by || row.repairedBy),
    repairedAt: row.repaired_at || row.repairedAt,
    leadIngestionLogId: normalizeText(row.lead_ingestion_log_id || row.leadIngestionLogId),
    createdAt: row.created_at || row.createdAt,
  }
}

export async function listLeadCaptureAliases(organisationId) {
  const normalizedOrganisationId = normalizeText(organisationId)
  if (!isUuidLike(normalizedOrganisationId)) {
    throw new Error('A valid organisation id is required before listing lead capture aliases.')
  }
  const client = requireClient()
  const { data, error } = await client
    .from('lead_capture_aliases')
    .select('*')
    .eq('organisation_id', normalizedOrganisationId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return Array.isArray(data) ? data.map(mapAliasRow) : []
}

export async function listInboundLeadEmails(organisationId, { limit = 50 } = {}) {
  const normalizedOrganisationId = normalizeText(organisationId)
  if (!isUuidLike(normalizedOrganisationId)) {
    throw new Error('A valid organisation id is required before listing inbound lead emails.')
  }
  const client = requireClient()
  const { data, error } = await client
    .from('inbound_lead_emails')
    .select('email_id, organisation_id, capture_alias_id, provider, provider_message_id, from_email, from_name, subject, source, external_reference, status, lead_id, contact_id, error, parser_name, parse_confidence, parse_warnings, matched_fields, review_status, reviewed_by, reviewed_at, resolved_at, ignored_at, review_note, repaired_payload, repaired_by, repaired_at, lead_ingestion_log_id, received_at, parsed_at, processed_at')
    .eq('organisation_id', normalizedOrganisationId)
    .order('received_at', { ascending: false })
    .limit(Math.max(1, Math.min(Number(limit) || 50, 200)))
  if (error) throw error
  return Array.isArray(data) ? data.map(mapInboundEmailRow) : []
}

export async function listLeadParseFailures(organisationId, { limit = 50, status = 'open' } = {}) {
  const normalizedOrganisationId = normalizeText(organisationId)
  if (!isUuidLike(normalizedOrganisationId)) {
    throw new Error('A valid organisation id is required before listing lead parse failures.')
  }
  const client = requireClient()
  let query = client
    .from('lead_parse_failures')
    .select('failure_id, inbound_email_id, organisation_id, capture_alias_id, source, reason, status, payload, parser_name, parse_confidence, parse_warnings, resolved_by, resolved_at, ignored_by, ignored_at, review_note, repaired_payload, repaired_by, repaired_at, lead_ingestion_log_id, created_at')
    .eq('organisation_id', normalizedOrganisationId)
    .order('created_at', { ascending: false })
    .limit(Math.max(1, Math.min(Number(limit) || 50, 200)))
  if (normalizeText(status)) {
    query = query.eq('status', normalizeText(status))
  }
  const { data, error } = await query
  if (error) throw error
  return Array.isArray(data) ? data.map(mapParseFailureRow) : []
}

export async function createLeadCaptureAlias(params = {}) {
  const normalizedOrganisationId = normalizeText(params.organisationId || params.organisation_id)
  if (!isUuidLike(normalizedOrganisationId)) {
    throw new Error('A valid organisation id is required before creating a lead capture alias.')
  }
  const client = requireClient()
  const rpcParams = {
    p_organisation_id: normalizedOrganisationId,
    p_agent_user_id: isUuidLike(params.agentUserId || params.agent_user_id) ? normalizeText(params.agentUserId || params.agent_user_id) : null,
    p_branch_id: isUuidLike(params.branchId || params.branch_id) ? normalizeText(params.branchId || params.branch_id) : null,
    p_listing_id: isUuidLike(params.listingId || params.listing_id) ? normalizeText(params.listingId || params.listing_id) : null,
    p_source: normalizeText(params.source) || 'General',
    p_routing_level: normalizeText(params.routingLevel || params.routing_level) || 'agency',
    p_alias_domain: normalizeText(params.aliasDomain || params.alias_domain) || DEFAULT_LEAD_CAPTURE_DOMAIN,
    p_metadata: params.metadata || params.metadata_json || {},
  }
  const { data, error } = await client.rpc('bridge_create_lead_capture_alias', rpcParams)
  if (error) throw error
  return mapAliasRow(data)
}

export async function ensureDefaultLeadCaptureAliases(params = {}) {
  const requests = buildDefaultLeadCaptureAliasRequests(params)
  const aliases = []
  for (const request of requests) {
    aliases.push(await createLeadCaptureAlias(request))
  }
  return aliases
}

export async function ensureLeadCaptureAliasesForUsers({
  organisationId = '',
  users = [],
  aliasDomain = DEFAULT_LEAD_CAPTURE_DOMAIN,
  sources = LEAD_CAPTURE_SOURCES,
} = {}) {
  const normalizedOrganisationId = normalizeText(organisationId)
  if (!isUuidLike(normalizedOrganisationId)) {
    throw new Error('A valid organisation id is required before generating lead capture aliases.')
  }
  const aliases = []
  for (const user of Array.isArray(users) ? users : []) {
    const userId = normalizeText(user?.userId || user?.user_id || user?.id)
    if (!isUuidLike(userId)) continue
    const branchId = normalizeText(user?.branchId || user?.branch_id)
    const created = await ensureDefaultLeadCaptureAliases({
      organisationId: normalizedOrganisationId,
      agentUserId: userId,
      branchId: isUuidLike(branchId) ? branchId : '',
      aliasDomain,
      sources,
    })
    aliases.push(...created)
  }
  return aliases
}

export function buildLeadCaptureStatusRows({ aliases = [], inboundEmails = [], users = [] } = {}) {
  const aliasesByAgent = new Map()
  const aliasesById = new Map()
  for (const alias of Array.isArray(aliases) ? aliases : []) {
    const agentKey = alias.agentUserId || 'agency'
    if (!aliasesByAgent.has(agentKey)) aliasesByAgent.set(agentKey, [])
    aliasesByAgent.get(agentKey).push(alias)
    if (alias.aliasId) aliasesById.set(alias.aliasId, alias)
  }

  const latestEmailByAgent = new Map()
  for (const email of Array.isArray(inboundEmails) ? inboundEmails : []) {
    const alias = aliasesById.get(email.captureAliasId)
    const agentKey = alias?.agentUserId || 'agency'
    if (!latestEmailByAgent.has(agentKey)) latestEmailByAgent.set(agentKey, email)
  }

  const agentUsers = (Array.isArray(users) ? users : []).filter((user) => isUuidLike(user?.userId || user?.user_id || user?.id))
  const rows = agentUsers.map((user) => {
    const userId = normalizeText(user.userId || user.user_id || user.id)
    const userAliases = aliasesByAgent.get(userId) || []
    const lastInboundEmail = latestEmailByAgent.get(userId) || null
    return {
      userId,
      name: normalizeText(user.fullName || [user.firstName, user.lastName].filter(Boolean).join(' ')) || normalizeText(user.email) || 'Agent',
      email: normalizeCaptureEmail(user.email),
      role: normalizeText(user.role || user.membershipRole || user.workspaceRole),
      status: getLeadCaptureSetupStatus({ aliases: userAliases, lastInboundEmail }),
      aliases: userAliases,
      lastInboundEmail,
    }
  })

  const agencyAliases = aliasesByAgent.get('agency') || []
  if (agencyAliases.length) {
    rows.unshift({
      userId: '',
      name: 'Agency fallback',
      email: '',
      role: 'agency',
      status: getLeadCaptureSetupStatus({ aliases: agencyAliases, lastInboundEmail: latestEmailByAgent.get('agency') || null }),
      aliases: agencyAliases,
      lastInboundEmail: latestEmailByAgent.get('agency') || null,
    })
  }

  return rows
}

function getActorId(actor = null) {
  return normalizeText(actor?.id || actor?.userId || actor?.user_id || actor)
}

function getFailureMatchedFields(failure = {}) {
  return failure.matchedFields
    || failure.payload?.matchedFields
    || failure.payload?.rawPayload?.parser?.matchedFields
    || failure.payload?.raw_payload?.parser?.matchedFields
    || {}
}

function getReviewRawInbound(item = {}) {
  return item.raw?.rawPayload?.inboundEmail
    || item.raw?.raw_payload?.inboundEmail
    || item.raw?.payload?.rawPayload?.inboundEmail
    || item.raw?.payload?.raw_payload?.inboundEmail
    || item.raw?.payload?.inboundEmail
    || item.raw
    || {}
}

function getMatchedField(fields = {}, keys = []) {
  for (const key of keys) {
    const value = normalizeText(fields?.[key])
    if (value) return value
  }
  return ''
}

function shouldReviewInboundEmail(email = {}) {
  const reviewStatus = normalizeText(email.reviewStatus || email.review_status)
  if (reviewStatus) return true
  if (['failed', 'unmatched'].includes(normalizeText(email.status))) return true
  if (email.parseConfidence === null || email.parseConfidence === undefined) return false
  return Number(email.parseConfidence) < LOW_CONFIDENCE_REVIEW_THRESHOLD
}

function getInboundReviewReason(email = {}) {
  if (normalizeText(email.error)) return normalizeText(email.error)
  if (['failed', 'unmatched'].includes(normalizeText(email.status))) return 'Inbound email could not be processed.'
  if (email.parseConfidence !== null && email.parseConfidence !== undefined && Number(email.parseConfidence) < LOW_CONFIDENCE_REVIEW_THRESHOLD) {
    return 'Low parser confidence.'
  }
  return 'Review required.'
}

function matchesReviewFilter(row = {}, { status = 'open', source = '', search = '' } = {}) {
  const normalizedStatus = normalizeText(status)
  const normalizedSource = normalizeLower(source)
  const normalizedSearch = normalizeLower(search)
  if (normalizedStatus && normalizedStatus !== 'all' && row.status !== normalizedStatus) return false
  if (normalizedSource && normalizedSource !== 'all' && normalizeLower(row.source) !== normalizedSource) return false
  if (!normalizedSearch) return true
  return [
    row.reason,
    row.source,
    row.subject,
    row.fromEmail,
    row.parserName,
    row.assignedAgentId,
    row.inboundEmailId,
    row.failureId,
    ...Object.values(row.matchedFields || {}),
  ].some((value) => normalizeLower(value).includes(normalizedSearch))
}

function matchesConfidenceFilter(row = {}, confidence = 'all') {
  const normalizedConfidence = normalizeLower(confidence || 'all')
  const score = row.parseConfidence === null || row.parseConfidence === undefined ? null : Number(row.parseConfidence)
  if (normalizedConfidence === 'all') return true
  if (normalizedConfidence === 'unscored') return score === null || Number.isNaN(score)
  if (score === null || Number.isNaN(score)) return false
  if (normalizedConfidence === 'low') return score < LOW_CONFIDENCE_REVIEW_THRESHOLD
  if (normalizedConfidence === 'medium') return score >= LOW_CONFIDENCE_REVIEW_THRESHOLD && score < 0.85
  if (normalizedConfidence === 'high') return score >= 0.85
  return true
}

export function filterLeadCaptureReviewQueueRows(rows = [], filters = {}) {
  const assignedAgentId = normalizeText(filters.assignedAgentId || filters.assigned_agent_id)
  return (Array.isArray(rows) ? rows : []).filter((row) => {
    if (!matchesReviewFilter(row, filters)) return false
    if (!matchesConfidenceFilter(row, filters.confidence || 'all')) return false
    if (assignedAgentId === 'unassigned' && normalizeText(row.assignedAgentId)) return false
    if (assignedAgentId && !['all', 'unassigned'].includes(assignedAgentId) && normalizeText(row.assignedAgentId) !== assignedAgentId) return false
    return true
  })
}

export function buildLeadCaptureReviewQueueRows({
  failures = [],
  inboundEmails = [],
  status = 'open',
  source = '',
  search = '',
  confidence = 'all',
  assignedAgentId = '',
} = {}) {
  const rows = []
  const failureInboundIds = new Set()

  for (const failure of Array.isArray(failures) ? failures : []) {
    if (failure.inboundEmailId) failureInboundIds.add(failure.inboundEmailId)
    rows.push({
      id: `failure:${failure.failureId}`,
      kind: 'failure',
      failureId: failure.failureId,
      inboundEmailId: failure.inboundEmailId,
      organisationId: failure.organisationId,
      captureAliasId: failure.captureAliasId,
      source: failure.source || 'Other',
      subject: normalizeText(failure.payload?.subject || failure.payload?.rawPayload?.inboundEmail?.subject),
      fromEmail: normalizeCaptureEmail(failure.payload?.fromEmail || failure.payload?.email || failure.payload?.rawPayload?.inboundEmail?.fromEmail),
      reason: failure.reason || 'Parser review required.',
      status: failure.status || 'open',
      parserName: failure.parserName,
      parseConfidence: failure.parseConfidence,
      parseWarnings: failure.parseWarnings || [],
      matchedFields: getFailureMatchedFields(failure),
      assignedAgentId: normalizeText(failure.repairedPayload?.assignedAgentId || failure.payload?.assignedAgent?.id || failure.payload?.assignedAgent?.userId),
      reviewNote: failure.reviewNote,
      repairedPayload: failure.repairedPayload,
      repairedAt: failure.repairedAt,
      leadIngestionLogId: failure.leadIngestionLogId,
      receivedAt: failure.createdAt,
      createdAt: failure.createdAt,
      raw: failure,
    })
  }

  for (const email of Array.isArray(inboundEmails) ? inboundEmails : []) {
    if (!shouldReviewInboundEmail(email) || failureInboundIds.has(email.emailId)) continue
    rows.push({
      id: `email:${email.emailId}`,
      kind: 'email',
      failureId: '',
      inboundEmailId: email.emailId,
      organisationId: email.organisationId,
      captureAliasId: email.captureAliasId,
      source: email.source || 'Other',
      subject: email.subject,
      fromEmail: email.fromEmail,
      reason: getInboundReviewReason(email),
      status: email.reviewStatus || 'open',
      parserName: email.parserName,
      parseConfidence: email.parseConfidence,
      parseWarnings: email.parseWarnings || [],
      matchedFields: email.matchedFields || {},
      assignedAgentId: normalizeText(email.repairedPayload?.assignedAgentId),
      reviewNote: email.reviewNote,
      repairedPayload: email.repairedPayload,
      repairedAt: email.repairedAt,
      leadIngestionLogId: email.leadIngestionLogId,
      receivedAt: email.receivedAt,
      createdAt: email.receivedAt,
      raw: email,
    })
  }

  return rows
    .filter((row) => filterLeadCaptureReviewQueueRows([row], { status, source, search, confidence, assignedAgentId }).length > 0)
    .sort((a, b) => new Date(b.receivedAt || b.createdAt || 0).getTime() - new Date(a.receivedAt || a.createdAt || 0).getTime())
}

export async function listLeadCaptureReviewQueue(organisationId, {
  limit = 100,
  status = 'open',
  source = '',
  search = '',
  confidence = 'all',
  assignedAgentId = '',
} = {}) {
  const normalizedStatus = normalizeText(status)
  const [failures, inboundEmails] = await Promise.all([
    listLeadParseFailures(organisationId, {
      limit,
      status: normalizedStatus && normalizedStatus !== 'all' ? normalizedStatus : '',
    }),
    listInboundLeadEmails(organisationId, { limit }),
  ])
  return buildLeadCaptureReviewQueueRows({ failures, inboundEmails, status, source, search, confidence, assignedAgentId })
}

export function buildLeadCaptureWebhookUrl({
  supabaseProjectRef = '',
  supabaseFunctionsUrl = '',
  functionName = 'inbound-lead-email',
} = {}) {
  const directUrl = normalizeText(supabaseFunctionsUrl).replace(/\/+$/, '')
  if (directUrl) return `${directUrl}/${functionName}`
  const projectRef = normalizeText(supabaseProjectRef)
  if (projectRef) return `https://${projectRef}.functions.supabase.co/${functionName}`
  return `https://<supabase-project-ref>.functions.supabase.co/${functionName}`
}

export function buildLeadCaptureDnsChecklist({
  domain = DEFAULT_LEAD_CAPTURE_DOMAIN,
  provider = 'Inbound Provider',
} = {}) {
  const normalizedDomain = normalizeLower(domain || DEFAULT_LEAD_CAPTURE_DOMAIN)
  return [
    {
      type: 'MX',
      host: normalizedDomain,
      value: '<provider inbound MX host>',
      priority: '10',
      purpose: `${provider} receives lead emails for generated Arch9 aliases.`,
    },
    {
      type: 'TXT',
      host: normalizedDomain,
      value: '<provider SPF or domain verification token>',
      priority: '',
      purpose: 'Authorizes the provider and verifies the capture domain.',
    },
    {
      type: 'CNAME/TXT',
      host: `selector._domainkey.${normalizedDomain}`,
      value: '<provider DKIM target or token>',
      priority: '',
      purpose: 'Enables DKIM signing where the provider requires it.',
    },
    {
      type: 'TXT',
      host: `_dmarc.${normalizedDomain}`,
      value: 'v=DMARC1; p=none; rua=mailto:dmarc@arch9.co.za',
      priority: '',
      purpose: 'Starts DMARC reporting without blocking delivery during rollout.',
    },
  ]
}

async function updateLeadCaptureReviewItem(item = {}, {
  status = 'resolved',
  actor = null,
  note = '',
} = {}) {
  const client = requireClient()
  const actorId = getActorId(actor)
  const now = new Date().toISOString()
  const failureId = normalizeText(item.failureId || item.failure_id || (String(item.id || '').startsWith('failure:') ? String(item.id).slice(8) : ''))
  const inboundEmailId = normalizeText(item.inboundEmailId || item.inbound_email_id || item.emailId || item.email_id || (String(item.id || '').startsWith('email:') ? String(item.id).slice(6) : ''))
  const reviewNote = normalizeText(note || item.reviewNote || item.review_note)
  const reviewerPatch = isUuidLike(actorId) ? { reviewed_by: actorId } : {}
  const resolverPatch = isUuidLike(actorId) ? { resolved_by: actorId } : {}
  const ignorerPatch = isUuidLike(actorId) ? { ignored_by: actorId } : {}
  let failure = null
  let inboundEmail = null

  if (isUuidLike(failureId)) {
    const failurePatch = status === 'ignored'
      ? {
        status: 'ignored',
        ...ignorerPatch,
        ignored_at: now,
        review_note: reviewNote || null,
      }
      : {
        status: 'resolved',
        ...resolverPatch,
        resolved_at: now,
        review_note: reviewNote || null,
      }
    const { data, error } = await client
      .from('lead_parse_failures')
      .update(failurePatch)
      .eq('failure_id', failureId)
      .select('failure_id, inbound_email_id, organisation_id, capture_alias_id, source, reason, status, payload, parser_name, parse_confidence, parse_warnings, resolved_by, resolved_at, ignored_by, ignored_at, review_note, repaired_payload, repaired_by, repaired_at, lead_ingestion_log_id, created_at')
      .maybeSingle()
    if (error) throw error
    failure = data ? mapParseFailureRow(data) : null
  }

  if (isUuidLike(inboundEmailId)) {
    const emailPatch = status === 'ignored'
      ? {
        review_status: 'ignored',
        ...reviewerPatch,
        reviewed_at: now,
        ignored_at: now,
        review_note: reviewNote || null,
      }
      : {
        review_status: 'resolved',
        ...reviewerPatch,
        reviewed_at: now,
        resolved_at: now,
        review_note: reviewNote || null,
      }
    const { data, error } = await client
      .from('inbound_lead_emails')
      .update(emailPatch)
      .eq('email_id', inboundEmailId)
      .select('email_id, organisation_id, capture_alias_id, provider, provider_message_id, from_email, from_name, subject, source, external_reference, status, lead_id, contact_id, error, parser_name, parse_confidence, parse_warnings, matched_fields, review_status, reviewed_by, reviewed_at, resolved_at, ignored_at, review_note, repaired_payload, repaired_by, repaired_at, lead_ingestion_log_id, received_at, parsed_at, processed_at')
      .maybeSingle()
    if (error) throw error
    inboundEmail = data ? mapInboundEmailRow(data) : null
  }

  return { failure, inboundEmail }
}

export function resolveLeadCaptureReviewItem(item = {}, options = {}) {
  return updateLeadCaptureReviewItem(item, { ...options, status: 'resolved' })
}

export function ignoreLeadCaptureReviewItem(item = {}, options = {}) {
  return updateLeadCaptureReviewItem(item, { ...options, status: 'ignored' })
}

export function buildLeadCaptureRepairDraft(item = {}) {
  const matchedFields = item.matchedFields || getFailureMatchedFields(item.raw || item) || {}
  const rawInbound = getReviewRawInbound(item)
  const repairedPayload = item.repairedPayload && Object.keys(item.repairedPayload).length ? item.repairedPayload : {}
  return {
    organisationId: normalizeText(item.organisationId || item.raw?.organisationId || item.raw?.organisation_id),
    source: normalizeLeadSource(repairedPayload.source || item.source || matchedFields.source || item.raw?.source || 'Other'),
    name: normalizeText(repairedPayload.name || getMatchedField(matchedFields, ['name', 'fullName', 'contactName']) || item.raw?.fromName || rawInbound.fromName),
    email: normalizeCaptureEmail(repairedPayload.email || getMatchedField(matchedFields, ['email', 'emailAddress']) || item.fromEmail || rawInbound.fromEmail),
    phone: normalizeText(repairedPayload.phone || getMatchedField(matchedFields, ['phone', 'mobile', 'cellphone'])),
    message: normalizeText(repairedPayload.message || getMatchedField(matchedFields, ['message', 'notes', 'comment']) || item.raw?.payload?.message || rawInbound.textBody || rawInbound.body || item.subject),
    listingId: normalizeText(repairedPayload.listingId || item.raw?.listingId || item.raw?.listing_id || item.raw?.payload?.listingId || item.raw?.payload?.listing_id),
    listingReference: normalizeText(repairedPayload.listingReference || getMatchedField(matchedFields, ['listingReference', 'listingId', 'propertyReference']) || item.raw?.payload?.listingReference || item.raw?.payload?.listing_reference),
    budget: Number(repairedPayload.budget || matchedFields.budget || 0) || 0,
    areaInterest: normalizeText(repairedPayload.areaInterest || matchedFields.areaInterest || matchedFields.area),
    propertyType: normalizeText(repairedPayload.propertyType || matchedFields.propertyInterest || matchedFields.propertyType),
    externalReference: normalizeText(repairedPayload.externalReference || item.raw?.externalReference || item.raw?.external_reference || rawInbound.providerMessageId || item.inboundEmailId || item.failureId),
    assignedAgentId: normalizeText(repairedPayload.assignedAgentId || item.raw?.payload?.assignedAgent?.id || item.raw?.payload?.assignedAgent?.userId || item.raw?.payload?.assigned_agent_id),
    reviewNote: normalizeText(repairedPayload.reviewNote || item.reviewNote),
    leadId: normalizeText(repairedPayload.leadId || item.raw?.leadId || item.raw?.lead_id),
    contactId: normalizeText(repairedPayload.contactId || item.raw?.contactId || item.raw?.contact_id),
  }
}

function buildRepairedEnquiryPayload(item = {}, draft = {}) {
  const repairDraft = {
    ...buildLeadCaptureRepairDraft(item),
    ...draft,
  }
  return {
    organisationId: repairDraft.organisationId || item.organisationId,
    source: normalizeLeadSource(repairDraft.source || item.source),
    externalReference: repairDraft.externalReference || item.inboundEmailId || item.failureId,
    name: repairDraft.name,
    email: repairDraft.email,
    phone: repairDraft.phone,
    message: repairDraft.message,
    listingId: repairDraft.listingId,
    listingReference: repairDraft.listingReference,
    budget: Number(repairDraft.budget || 0) || 0,
    areaInterest: repairDraft.areaInterest,
    propertyType: repairDraft.propertyType,
    assignedAgent: repairDraft.assignedAgentId ? { id: repairDraft.assignedAgentId, userId: repairDraft.assignedAgentId } : null,
    rawPayload: {
      leadCaptureRepair: {
        itemId: item.id,
        failureId: item.failureId,
        inboundEmailId: item.inboundEmailId,
        previousMatchedFields: item.matchedFields || {},
        repairedFields: repairDraft,
      },
    },
  }
}

function compactPatch(patch = {}) {
  return Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined))
}

async function markLeadCaptureItemRepaired(item = {}, {
  actor = null,
  repairedPayload = {},
  leadId = '',
  contactId = '',
  leadIngestionLogId = '',
  note = '',
} = {}) {
  const client = requireClient()
  const actorId = getActorId(actor)
  const now = new Date().toISOString()
  const failureId = normalizeText(item.failureId || item.failure_id || (String(item.id || '').startsWith('failure:') ? String(item.id).slice(8) : ''))
  const inboundEmailId = normalizeText(item.inboundEmailId || item.inbound_email_id || item.emailId || item.email_id || (String(item.id || '').startsWith('email:') ? String(item.id).slice(6) : ''))
  const reviewerPatch = isUuidLike(actorId) ? { reviewed_by: actorId, repaired_by: actorId } : {}
  const resolvedByPatch = isUuidLike(actorId) ? { resolved_by: actorId, repaired_by: actorId } : {}
  const normalizedLeadId = isUuidLike(leadId) ? leadId : null
  const normalizedContactId = isUuidLike(contactId) ? contactId : null
  const normalizedLogId = isUuidLike(leadIngestionLogId) ? leadIngestionLogId : null
  const reviewNote = normalizeText(note || repairedPayload.reviewNote || item.reviewNote) || null
  let failure = null
  let inboundEmail = null

  if (isUuidLike(failureId)) {
    const { data, error } = await client
      .from('lead_parse_failures')
      .update({
        status: 'resolved',
        ...resolvedByPatch,
        resolved_at: now,
        repaired_at: now,
        repaired_payload: repairedPayload,
        lead_ingestion_log_id: normalizedLogId,
        review_note: reviewNote,
      })
      .eq('failure_id', failureId)
      .select('failure_id, inbound_email_id, organisation_id, capture_alias_id, source, reason, status, payload, parser_name, parse_confidence, parse_warnings, resolved_by, resolved_at, ignored_by, ignored_at, review_note, repaired_payload, repaired_by, repaired_at, lead_ingestion_log_id, created_at')
      .maybeSingle()
    if (error) throw error
    failure = data ? mapParseFailureRow(data) : null
  }

  if (isUuidLike(inboundEmailId)) {
    const { data, error } = await client
      .from('inbound_lead_emails')
      .update(compactPatch({
        status: normalizedLeadId ? 'processed' : undefined,
        lead_id: normalizedLeadId,
        contact_id: normalizedContactId,
        review_status: 'resolved',
        ...reviewerPatch,
        reviewed_at: now,
        resolved_at: now,
        repaired_at: now,
        processed_at: normalizedLeadId ? now : undefined,
        repaired_payload: repairedPayload,
        lead_ingestion_log_id: normalizedLogId,
        review_note: reviewNote,
      }))
      .eq('email_id', inboundEmailId)
      .select('email_id, organisation_id, capture_alias_id, provider, provider_message_id, from_email, from_name, subject, source, external_reference, status, lead_id, contact_id, error, parser_name, parse_confidence, parse_warnings, matched_fields, review_status, reviewed_by, reviewed_at, resolved_at, ignored_at, review_note, repaired_payload, repaired_by, repaired_at, lead_ingestion_log_id, received_at, parsed_at, processed_at')
      .maybeSingle()
    if (error) throw error
    inboundEmail = data ? mapInboundEmailRow(data) : null
  }

  return { failure, inboundEmail }
}

export async function repairLeadCaptureReviewItem(item = {}, draft = {}, { actor = null } = {}) {
  const repairedPayload = buildRepairedEnquiryPayload(item, draft)
  const result = await createOrUpdateLeadFromEnquiry(repairedPayload, { actor })
  if (!result?.ok) {
    throw new Error(result?.error || 'Lead capture repair could not create a lead.')
  }
  const repair = await markLeadCaptureItemRepaired(item, {
    actor,
    repairedPayload,
    leadId: result.leadId,
    contactId: result.contactId,
    leadIngestionLogId: result.log?.log_id,
    note: draft.reviewNote || 'Lead created from lead capture review.',
  })
  return { ...repair, result }
}

export async function linkLeadCaptureReviewItem(item = {}, draft = {}, { actor = null } = {}) {
  const leadId = normalizeText(draft.leadId || draft.lead_id)
  if (!isUuidLike(leadId)) throw new Error('A valid lead id is required before linking this review item.')
  const contactId = normalizeText(draft.contactId || draft.contact_id)
  const repairedPayload = {
    ...buildLeadCaptureRepairDraft(item),
    ...draft,
    leadId,
    contactId,
    linkOnly: true,
  }
  return markLeadCaptureItemRepaired(item, {
    actor,
    repairedPayload,
    leadId,
    contactId,
    note: draft.reviewNote || 'Linked to an existing lead from lead capture review.',
  })
}

function stripHtml(value = '') {
  return normalizeText(value)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+\n/g, '\n')
    .replace(/\n\s+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
}

function pickFirstMatch(text = '', patterns = []) {
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match?.[1]) return normalizeText(match[1])
  }
  return ''
}

function normalizeBodyText(value = '') {
  return normalizeText(value)
    .replace(/\r/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
}

const KNOWN_LEAD_EMAIL_LABELS = [
  'name',
  'full name',
  'contact name',
  'customer',
  'customer name',
  'enquirer',
  'sender',
  'email address',
  'email',
  'e-mail',
  'phone',
  'mobile',
  'cell',
  'cellphone',
  'telephone',
  'contact number',
  'message',
  'comments',
  'comment',
  'enquiry',
  'enquiry message',
  'buyer message',
  'notes',
  'listing reference',
  'listing ref',
  'listing id',
  'listing number',
  'property reference',
  'property ref',
  'property id',
  'property number',
  'web reference',
  'web ref',
  'web id',
  'budget',
  'max budget',
  'price',
  'asking price',
  'area',
  'suburb',
  'location',
  'property type',
  'property interest',
]

function trimAtNextKnownLabel(value = '') {
  const safeLabels = KNOWN_LEAD_EMAIL_LABELS.map((label) => String(label).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const nextLabelPattern = new RegExp(`\\s+(?:legend\\s+)?(?:${safeLabels.join('|')})\\s*[:\\-]`, 'i')
  const match = normalizeText(value).match(nextLabelPattern)
  return normalizeText(match?.index === undefined ? value : value.slice(0, match.index))
}

function readLabelValue(text = '', labels = []) {
  const safeLabels = labels.map((label) => String(label).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  if (!safeLabels.length) return ''
  const pattern = new RegExp(`(?:^|\\n)\\s*(?:${safeLabels.join('|')})\\s*[:\\-]\\s*([^\\n\\r]+)`, 'i')
  const raw = normalizeText(text.match(pattern)?.[1] || '')
    .replace(/\s*\(\s*mailto:[^)]+\)/gi, ' ')
    .replace(/\bmailto:/gi, '')
  return trimAtNextKnownLabel(raw)
}

function extractEmailAddress(text = '') {
  return normalizeCaptureEmail(readLabelValue(text, ['email address', 'email', 'e-mail']) || pickFirstMatch(text, [
    /(?:email|e-mail)\s*[:\-]\s*([^\s<>,;]+@[^\s<>,;]+)/i,
    /([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/i,
  ]))
}

function extractPhone(text = '') {
  const labelled = readLabelValue(text, ['phone', 'mobile', 'cell', 'cellphone', 'telephone', 'contact number'])
  const fallback = labelled || pickFirstMatch(text, [
    /(\+?27[\s.-]?\d{2}[\s.-]?\d{3}[\s.-]?\d{4})/i,
    /(\b0\d{2}[\s.-]?\d{3}[\s.-]?\d{4}\b)/i,
  ])
  return fallback.replace(/[^\d+]/g, '')
}

function extractName(text = '', fromName = '') {
  const labelled = readLabelValue(text, ['name', 'full name', 'contact name', 'customer', 'customer name', 'enquirer', 'sender'])
  const candidate = labelled || fromName
  return normalizeText(candidate)
    .replace(/\s*<[^>]+>\s*/g, '')
    .replace(/\s+\b(?:legend|fieldset|label)\b\s*$/i, '')
}

function extractListingReference(text = '') {
  return readLabelValue(text, [
    'listing reference',
    'listing ref',
    'listing id',
    'listing number',
    'property reference',
    'property ref',
    'property id',
    'property number',
    'web reference',
    'web ref',
    'web id',
    'property24 reference',
    'property24 listing id',
    'private property reference',
    'private property listing id',
  ]) || pickFirstMatch(text, [
    /(?:listing|property|web)\s*(?:id|ref|reference|number)\s*[:#\-]\s*([a-z0-9/_-]+)/i,
    /(?:property24|private property)\s*(?:id|ref|reference)\s*[:#\-]\s*([a-z0-9/_-]+)/i,
    /property24\.com\/(?:[^/\s]+\/)*(\d{5,})/i,
    /privateproperty\.co\.za\/(?:[^/\s]+\/)*([a-z0-9-]*\d{5,}[a-z0-9-]*)/i,
  ])
}

function extractMessage(text = '') {
  const labelled = readLabelValue(text, ['message', 'comments', 'comment', 'enquiry', 'enquiry message', 'buyer message', 'notes'])
  if (labelled) return labelled
  const lines = normalizeBodyText(text)
    .split('\n')
    .map((line) => normalizeText(line))
    .filter(Boolean)
  const messageStart = lines.findIndex((line) => /^(message|comments|comment|enquiry|notes)\s*[:\-]?$/i.test(line))
  if (messageStart >= 0) return lines.slice(messageStart + 1, messageStart + 4).join('\n')
  return ''
}

function extractBudget(text = '') {
  const raw = readLabelValue(text, ['budget', 'max budget', 'price', 'asking price'])
  const amount = Number(String(raw).replace(/[^0-9.]/g, ''))
  return Number.isFinite(amount) && amount > 0 ? amount : 0
}

function calculateParseConfidence(fields = {}, warnings = []) {
  let score = 0
  if (fields.source && fields.source !== 'Other') score += 0.15
  if (fields.name) score += 0.15
  if (fields.email) score += 0.2
  if (fields.phone) score += 0.2
  if (fields.listingReference || fields.listingId) score += 0.15
  if (fields.message) score += 0.1
  if (fields.parserName && fields.parserName !== 'generic_email') score += 0.05
  score -= Math.min(warnings.length * 0.08, 0.24)
  return Math.max(0, Math.min(1, Number(score.toFixed(2))))
}

function inferSourceFromEmail({ alias = {}, fromEmail = '', subject = '', body = '' } = {}) {
  if (alias.source && alias.source !== 'General') return normalizeLeadSource(alias.source)
  const haystack = `${fromEmail} ${subject} ${body}`.toLowerCase()
  if (haystack.includes('property24') || haystack.includes('property 24')) return 'Property24'
  if (haystack.includes('privateproperty') || haystack.includes('private property')) return 'Private Property'
  if (haystack.includes('facebook') || haystack.includes('fb lead')) return 'Facebook'
  if (haystack.includes('website') || haystack.includes('web enquiry')) return 'Website'
  return 'Other'
}

function buildParseResult({
  parserName = 'generic_email',
  source = 'Other',
  subject = '',
  body = '',
  fromName = '',
  fromEmail = '',
  alias = {},
  input = {},
  fields = {},
} = {}) {
  const base = {
    name: extractName(body, fromName),
    email: extractEmailAddress(body) || fromEmail,
    phone: extractPhone(body),
    listingReference: extractListingReference(`${subject}\n${body}`),
    message: extractMessage(body) || body || subject,
    budget: extractBudget(body),
    areaInterest: readLabelValue(body, ['area', 'suburb', 'location']),
    propertyInterest: readLabelValue(body, ['property type', 'property interest']),
  }
  const cleanFields = Object.fromEntries(Object.entries(fields).filter(([, value]) => {
    if (typeof value === 'number') return value > 0
    return normalizeText(value)
  }))
  const matchedFields = {
    ...base,
    ...cleanFields,
    parserName,
    source,
  }
  const warnings = []
  if (!matchedFields.email && !matchedFields.phone) warnings.push('missing_contact_details')
  if (!matchedFields.name) warnings.push('missing_contact_name')
  if (!matchedFields.listingReference && !alias.listingId && !alias.listing_id) warnings.push('missing_listing_reference')
  return {
    parserName,
    source,
    fields: matchedFields,
    confidence: calculateParseConfidence(matchedFields, warnings),
    warnings,
    raw: input,
  }
}

function parseProperty24Email(context = {}) {
  const { body = '' } = context
  return buildParseResult({
    ...context,
    parserName: 'property24_email',
    source: 'Property24',
    fields: {
      name: readLabelValue(body, ['name', 'contact name', 'customer name']) || extractName(body, context.fromName),
      email: normalizeCaptureEmail(readLabelValue(body, ['email', 'email address'])),
      phone: (readLabelValue(body, ['telephone', 'phone', 'mobile', 'contact number']) || extractPhone(body)).replace(/[^\d+]/g, ''),
      listingReference: extractListingReference(`${context.subject}\n${body}`),
      message: readLabelValue(body, ['message', 'comments', 'enquiry']) || extractMessage(body),
      areaInterest: readLabelValue(body, ['suburb', 'area']),
      propertyInterest: readLabelValue(body, ['property type']),
      budget: extractBudget(body),
    },
  })
}

function parsePrivatePropertyEmail(context = {}) {
  const { body = '' } = context
  return buildParseResult({
    ...context,
    parserName: 'private_property_email',
    source: 'Private Property',
    fields: {
      name: readLabelValue(body, ['name', 'contact name', 'customer name', 'enquirer']) || extractName(body, context.fromName),
      email: normalizeCaptureEmail(readLabelValue(body, ['email', 'email address'])),
      phone: (readLabelValue(body, ['cellphone', 'cell', 'phone', 'mobile', 'contact number']) || extractPhone(body)).replace(/[^\d+]/g, ''),
      listingReference: extractListingReference(`${context.subject}\n${body}`),
      message: readLabelValue(body, ['message', 'enquiry', 'comment']) || extractMessage(body),
      areaInterest: readLabelValue(body, ['suburb', 'area']),
      propertyInterest: readLabelValue(body, ['property type']),
      budget: extractBudget(body),
    },
  })
}

function parseWebsiteEmail(context = {}) {
  const { body = '' } = context
  const firstName = readLabelValue(body, ['first name'])
  const lastName = readLabelValue(body, ['last name', 'surname'])
  return buildParseResult({
    ...context,
    parserName: 'website_email',
    source: 'Website',
    fields: {
      name: [firstName, lastName].filter(Boolean).join(' ') || extractName(body, context.fromName),
      email: normalizeCaptureEmail(readLabelValue(body, ['email', 'email address'])),
      phone: (readLabelValue(body, ['phone', 'mobile', 'cell', 'contact number']) || extractPhone(body)).replace(/[^\d+]/g, ''),
      listingReference: extractListingReference(`${context.subject}\n${body}`),
      message: readLabelValue(body, ['message', 'comments', 'enquiry', 'notes']) || extractMessage(body),
      areaInterest: readLabelValue(body, ['area', 'suburb', 'location']),
      propertyInterest: readLabelValue(body, ['property type', 'property interest']),
      budget: extractBudget(body),
    },
  })
}

export function parseLeadEmailBySource(context = {}) {
  const source = normalizeLeadSource(context.source || inferSourceFromEmail(context))
  if (source === 'Property24') return parseProperty24Email(context)
  if (source === 'Private Property') return parsePrivatePropertyEmail(context)
  if (source === 'Website') return parseWebsiteEmail(context)
  return buildParseResult({ ...context, parserName: 'generic_email', source })
}

export function parseInboundLeadEmail(input = {}, alias = {}) {
  const textBody = normalizeText(input.textBody || input.text_body || input.body)
  const htmlBody = stripHtml(input.htmlBody || input.html_body)
  const body = normalizeBodyText(textBody || htmlBody)
  const fromName = normalizeText(input.fromName || input.from_name)
  const fromEmail = normalizeCaptureEmail(input.fromEmail || input.from_email || input.from)
  const subject = normalizeText(input.subject)
  const source = inferSourceFromEmail({ alias, fromEmail, subject, body })
  const parseResult = parseLeadEmailBySource({ alias, fromEmail, fromName, subject, body, source, input })
  const parsedFields = parseResult.fields || {}
  const externalReference = normalizeText(input.providerMessageId || input.provider_message_id || input.messageId || input.message_id || input.externalReference)

  return {
    organisationId: normalizeText(alias.organisationId || alias.organisation_id || input.organisationId || input.organisation_id),
    source: parseResult.source || source,
    externalReference,
    name: parsedFields.name,
    email: parsedFields.email,
    phone: parsedFields.phone,
    message: parsedFields.message || body || subject,
    listingId: normalizeText(alias.listingId || alias.listing_id),
    listingReference: parsedFields.listingReference,
    budget: parsedFields.budget,
    area: parsedFields.areaInterest,
    areaInterest: parsedFields.areaInterest,
    propertyType: parsedFields.propertyInterest,
    assignedAgent: alias.agentUserId || alias.agent_user_id
      ? {
        id: normalizeText(alias.agentUserId || alias.agent_user_id),
        userId: normalizeText(alias.agentUserId || alias.agent_user_id),
      }
      : null,
    rawPayload: {
      inboundEmail: input,
      captureAlias: alias,
      parser: {
        name: parseResult.parserName,
        confidence: parseResult.confidence,
        warnings: parseResult.warnings,
        matchedFields: parsedFields,
      },
    },
  }
}

export async function findLeadCaptureAliasByEmail(emailAddress) {
  const normalizedEmail = normalizeCaptureEmail(emailAddress)
  if (!normalizedEmail) return null
  const client = requireClient()
  const { data, error } = await client
    .from('lead_capture_aliases')
    .select('*')
    .ilike('email_address', normalizedEmail)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data ? mapAliasRow(data) : null
}

export async function processInboundLeadEmail(input = {}, { actor = null } = {}) {
  const recipient = normalizeCaptureEmail(input.recipient || input.to || input.toAddress || input.to_address)
  const alias = input.alias || await findLeadCaptureAliasByEmail(recipient)
  if (!alias) {
    return { ok: false, status: 'unmatched', error: 'No active lead capture alias matched this email recipient.' }
  }
  const payload = parseInboundLeadEmail(input, alias)
  return createOrUpdateLeadFromEnquiry(payload, { actor })
}

export const __leadEmailCaptureServiceTestUtils = {
  buildLeadCaptureStatusRows,
  buildLeadCaptureReviewQueueRows,
  buildLeadCaptureRepairDraft,
  buildLeadCaptureDnsChecklist,
  buildLeadCaptureWebhookUrl,
  filterLeadCaptureReviewQueueRows,
  buildDefaultLeadCaptureAliasRequests,
  buildLeadCaptureAliasLocalPart,
  buildLeadCaptureEmail,
  extractListingReference,
  getLeadCaptureSetupStatus,
  normalizeCaptureEmail,
  parseLeadEmailBySource,
  parseInboundLeadEmail,
  slugifyCapturePart,
}
