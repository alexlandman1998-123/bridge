import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'
import { createOrUpdateLeadFromEnquiry, normalizeLeadSource } from './leadIngestionService'

export const DEFAULT_LEAD_CAPTURE_DOMAIN = 'leads.arch9.co.za'
export const LEAD_CAPTURE_SOURCES = ['General', 'Property24', 'Private Property', 'Website', 'Facebook']

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
  return normalizeLower(bracketMatch?.[1] || text).replace(/^mailto:/, '')
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
    .select('email_id, organisation_id, capture_alias_id, provider, provider_message_id, from_email, from_name, subject, source, external_reference, status, lead_id, contact_id, error, received_at, parsed_at, processed_at')
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
    .select('failure_id, inbound_email_id, organisation_id, capture_alias_id, source, reason, status, created_at')
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

function readLabelValue(text = '', labels = []) {
  const safeLabels = labels.map((label) => String(label).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  if (!safeLabels.length) return ''
  const pattern = new RegExp(`(?:^|\\n)\\s*(?:${safeLabels.join('|')})\\s*[:\\-]\\s*([^\\n\\r]+)`, 'i')
  return normalizeText(text.match(pattern)?.[1] || '')
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
  return normalizeText(candidate).replace(/\s*<[^>]+>\s*/g, '')
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
  const matchedFields = {
    ...base,
    ...fields,
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
