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

function extractEmailAddress(text = '') {
  return normalizeCaptureEmail(pickFirstMatch(text, [
    /(?:email|e-mail)\s*[:\-]\s*([^\s<>,;]+@[^\s<>,;]+)/i,
    /([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/i,
  ]))
}

function extractPhone(text = '') {
  const labelled = pickFirstMatch(text, [
    /(?:phone|mobile|cell|telephone|contact number)\s*[:\-]\s*([+()0-9\s.-]{7,})/i,
  ])
  const fallback = labelled || pickFirstMatch(text, [
    /(\+?27[\s.-]?\d{2}[\s.-]?\d{3}[\s.-]?\d{4})/i,
    /(\b0\d{2}[\s.-]?\d{3}[\s.-]?\d{4}\b)/i,
  ])
  return fallback.replace(/[^\d+]/g, '')
}

function extractName(text = '', fromName = '') {
  const labelled = pickFirstMatch(text, [
    /(?:name|contact name|customer|enquirer|sender)\s*[:\-]\s*([^\n\r<]+)/i,
  ])
  const candidate = labelled || fromName
  return normalizeText(candidate).replace(/\s*<[^>]+>\s*/g, '')
}

function extractListingReference(text = '') {
  return pickFirstMatch(text, [
    /(?:listing|property|web)\s*(?:id|ref|reference|number)\s*[:#\-]\s*([a-z0-9/_-]+)/i,
    /(?:property24|private property)\s*(?:id|ref|reference)\s*[:#\-]\s*([a-z0-9/_-]+)/i,
  ])
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

export function parseInboundLeadEmail(input = {}, alias = {}) {
  const textBody = normalizeText(input.textBody || input.text_body || input.body)
  const htmlBody = stripHtml(input.htmlBody || input.html_body)
  const body = normalizeText(textBody || htmlBody)
  const fromName = normalizeText(input.fromName || input.from_name)
  const fromEmail = normalizeCaptureEmail(input.fromEmail || input.from_email || input.from)
  const subject = normalizeText(input.subject)
  const source = inferSourceFromEmail({ alias, fromEmail, subject, body })
  const name = extractName(body, fromName)
  const email = extractEmailAddress(body) || fromEmail
  const phone = extractPhone(body)
  const listingReference = extractListingReference(`${subject}\n${body}`)
  const message = body || subject
  const externalReference = normalizeText(input.providerMessageId || input.provider_message_id || input.messageId || input.message_id || input.externalReference)

  return {
    organisationId: normalizeText(alias.organisationId || alias.organisation_id || input.organisationId || input.organisation_id),
    source,
    externalReference,
    name,
    email,
    phone,
    message,
    listingId: normalizeText(alias.listingId || alias.listing_id),
    listingReference,
    assignedAgent: alias.agentUserId || alias.agent_user_id
      ? {
        id: normalizeText(alias.agentUserId || alias.agent_user_id),
        userId: normalizeText(alias.agentUserId || alias.agent_user_id),
      }
      : null,
    rawPayload: {
      inboundEmail: input,
      captureAlias: alias,
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
  buildDefaultLeadCaptureAliasRequests,
  buildLeadCaptureAliasLocalPart,
  buildLeadCaptureEmail,
  extractListingReference,
  normalizeCaptureEmail,
  parseInboundLeadEmail,
  slugifyCapturePart,
}
