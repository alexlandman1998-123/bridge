import { isSupabaseConfigured, supabase } from '../lib/supabaseClient.js'

export const AGENCY_PUBLIC_INTAKE_SOURCE_CHANNELS = Object.freeze([
  'instagram',
  'facebook',
  'linkedin',
  'website',
  'whatsapp',
  'email',
  'qr',
  'referral',
  'manual',
  'other',
])

const DEFAULT_PUBLIC_INTAKE_HOST = 'https://app.arch9.co.za'
const DEFAULT_ENABLED_INTENTS = Object.freeze(['buy', 'sell'])
const VALID_STATUSES = new Set(['draft', 'active', 'disabled', 'archived'])
const SUBMISSION_STATUS_KEYS = Object.freeze(['received', 'processing', 'accepted', 'failed', 'spam', 'duplicate'])

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeLower(value = '') {
  return normalizeText(value).toLowerCase()
}

function normalizeNullableText(value = '') {
  const text = normalizeText(value)
  return text || null
}

function normalizeSlug(value = '') {
  return normalizeLower(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '')
}

function createSlugFallback(value = '') {
  const slug = normalizeSlug(value)
  if (slug.length >= 3) return slug
  return 'agency-intake'
}

export function suggestAgencyPublicIntakeSlug(value = '') {
  return createSlugFallback(value)
}

function normalizeStatus(value = 'draft') {
  const status = normalizeLower(value) || 'draft'
  return VALID_STATUSES.has(status) ? status : 'draft'
}

function normalizeEnabledIntents(value = DEFAULT_ENABLED_INTENTS) {
  const intents = (Array.isArray(value) ? value : DEFAULT_ENABLED_INTENTS)
    .map(normalizeLower)
    .filter((intent) => DEFAULT_ENABLED_INTENTS.includes(intent))
  return [...new Set(intents)].slice(0, 2).length ? [...new Set(intents)].slice(0, 2) : [...DEFAULT_ENABLED_INTENTS]
}

function normalizeSourceChannel(value = 'other') {
  const channel = normalizeLower(value) || 'other'
  return AGENCY_PUBLIC_INTAKE_SOURCE_CHANNELS.includes(channel) ? channel : 'other'
}

function normalizeCampaignCode(value = '') {
  const normalized = normalizeLower(value).replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80)
  return normalized || null
}

function isMissingTableError(error, tableName = 'agency_public_intake_links') {
  const code = normalizeText(error?.code)
  const message = normalizeLower(`${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`)
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    (tableName && message.includes(tableName.toLowerCase()) && (message.includes('does not exist') || message.includes('schema cache'))) ||
    message.includes(`relation "public.${tableName}" does not exist`)
  )
}

function requireClient(client = null) {
  if (client) return client
  const resolvedClient = client || supabase
  if (!isSupabaseConfigured || !resolvedClient) {
    throw new Error('Supabase is required before managing agency public intake links.')
  }
  return resolvedClient
}

function normalizeLinkRow(row = null) {
  if (!row) return null
  return {
    id: normalizeText(row.id),
    organisationId: normalizeText(row.organisation_id),
    slug: normalizeText(row.slug),
    status: normalizeStatus(row.status),
    isPrimary: row.is_primary !== false,
    heading: normalizeText(row.heading),
    introduction: normalizeText(row.introduction),
    buyerCtaLabel: normalizeText(row.buyer_cta_label),
    sellerCtaLabel: normalizeText(row.seller_cta_label),
    enabledIntents: normalizeEnabledIntents(row.enabled_intents),
    leadSourceLabel: normalizeText(row.lead_source_label) || 'Public Intake',
    sourceChannel: normalizeSourceChannel(row.source_channel),
    campaignCode: normalizeText(row.campaign_code),
    defaultBranchId: normalizeText(row.default_branch_id),
    defaultAssignedAgentId: normalizeText(row.default_assigned_agent_id),
    privacyPolicyVersion: normalizeText(row.privacy_policy_version),
    consentCopy: normalizeText(row.consent_copy),
    disabledAt: row.disabled_at || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    schemaReady: true,
  }
}

function normalizeNumber(value = null) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function normalizeSubmissionRow(row = null) {
  if (!row) return null
  return {
    id: normalizeText(row.id),
    intakeLinkId: normalizeText(row.intake_link_id),
    organisationId: normalizeText(row.organisation_id),
    leadId: normalizeText(row.lead_id),
    intent: DEFAULT_ENABLED_INTENTS.includes(normalizeLower(row.intent)) ? normalizeLower(row.intent) : 'buy',
    status: SUBMISSION_STATUS_KEYS.includes(normalizeLower(row.status)) ? normalizeLower(row.status) : 'received',
    sourceChannel: normalizeSourceChannel(row.source_channel),
    campaignCode: normalizeText(row.campaign_code),
    contactName: normalizeText(row.contact_name),
    contactEmail: normalizeText(row.contact_email),
    contactPhone: normalizeText(row.contact_phone),
    budgetMin: normalizeNumber(row.budget_min),
    budgetMax: normalizeNumber(row.budget_max),
    selectedListings: Array.isArray(row.selected_listings_json) ? row.selected_listings_json : [],
    processingError: normalizeText(row.processing_error),
    processedAt: row.processed_at || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  }
}

function createPerformanceSummary(rows = []) {
  const summary = {
    total: rows.length,
    accepted: 0,
    failed: 0,
    needsReview: 0,
    duplicate: 0,
    spam: 0,
    buyer: 0,
    seller: 0,
    linkedLeads: 0,
    bySource: {},
  }
  for (const row of rows) {
    if (row.intent === 'sell') summary.seller += 1
    else summary.buyer += 1
    if (row.status === 'accepted') summary.accepted += 1
    if (row.status === 'failed') summary.failed += 1
    if (row.status === 'duplicate') summary.duplicate += 1
    if (row.status === 'spam') summary.spam += 1
    if (['received', 'processing', 'failed'].includes(row.status)) summary.needsReview += 1
    if (row.leadId) summary.linkedLeads += 1
    summary.bySource[row.sourceChannel] = (summary.bySource[row.sourceChannel] || 0) + 1
  }
  return summary
}

function buildPayload(input = {}, defaults = {}) {
  const status = normalizeStatus(input.status || defaults.status)
  const organisationId = normalizeText(input.organisationId || input.organisation_id || defaults.organisationId)
  const slug = createSlugFallback(input.slug || defaults.slug || input.organisationName || defaults.organisationName)
  const enabledIntents = normalizeEnabledIntents(input.enabledIntents || input.enabled_intents || defaults.enabledIntents)
  return {
    organisation_id: organisationId,
    slug,
    status,
    is_primary: input.isPrimary ?? input.is_primary ?? defaults.isPrimary ?? true,
    heading: normalizeNullableText(input.heading ?? defaults.heading),
    introduction: normalizeNullableText(input.introduction ?? defaults.introduction),
    buyer_cta_label: normalizeNullableText(input.buyerCtaLabel ?? defaults.buyerCtaLabel ?? 'I am looking to buy'),
    seller_cta_label: normalizeNullableText(input.sellerCtaLabel ?? defaults.sellerCtaLabel ?? 'I am looking to sell'),
    enabled_intents: enabledIntents,
    lead_source_label: normalizeText(input.leadSourceLabel ?? defaults.leadSourceLabel) || 'Public Intake',
    source_channel: normalizeSourceChannel(input.sourceChannel ?? defaults.sourceChannel),
    campaign_code: normalizeCampaignCode(input.campaignCode ?? defaults.campaignCode),
    default_branch_id: normalizeNullableText(input.defaultBranchId ?? defaults.defaultBranchId),
    default_assigned_agent_id: normalizeNullableText(input.defaultAssignedAgentId ?? defaults.defaultAssignedAgentId),
    privacy_policy_version: normalizeNullableText(input.privacyPolicyVersion ?? defaults.privacyPolicyVersion),
    consent_copy: normalizeNullableText(input.consentCopy ?? defaults.consentCopy),
    disabled_at: status === 'disabled' || status === 'archived' ? (input.disabledAt || defaults.disabledAt || new Date().toISOString()) : null,
  }
}

export function buildAgencyPublicIntakeUrls({ slug = '', host = DEFAULT_PUBLIC_INTAKE_HOST } = {}) {
  const safeSlug = normalizeSlug(slug)
  const baseHost = normalizeText(host).replace(/\/+$/g, '') || DEFAULT_PUBLIC_INTAKE_HOST
  if (!safeSlug) {
    return {
      intakeUrl: '',
      buyerUrl: '',
      sellerUrl: '',
      listingsUrl: '',
      facebookUrl: '',
      instagramUrl: '',
      linkedinUrl: '',
      whatsappUrl: '',
    }
  }
  const intakeUrl = `${baseHost}/intake/${encodeURIComponent(safeSlug)}`
  const buyerUrl = `${intakeUrl}?intent=buy&source=social`
  const sellerUrl = `${intakeUrl}?intent=sell&source=social`
  return {
    intakeUrl,
    buyerUrl,
    sellerUrl,
    listingsUrl: `${baseHost}/bridge/buy?agencySlug=${encodeURIComponent(safeSlug)}`,
    facebookUrl: `${intakeUrl}?source=facebook`,
    instagramUrl: `${intakeUrl}?source=instagram`,
    linkedinUrl: `${intakeUrl}?source=linkedin`,
    whatsappUrl: `${intakeUrl}?source=whatsapp`,
  }
}

export async function loadAgencyPublicIntakeLink(options = {}) {
  const organisationId = normalizeText(options.organisationId || options.organisation_id)
  if (!organisationId) throw new Error('Organisation is required before loading agency public intake links.')
  const client = requireClient(options.client)
  const result = await client
    .from('agency_public_intake_links')
    .select('id, organisation_id, slug, status, is_primary, heading, introduction, buyer_cta_label, seller_cta_label, enabled_intents, lead_source_label, source_channel, campaign_code, default_branch_id, default_assigned_agent_id, privacy_policy_version, consent_copy, disabled_at, created_at, updated_at')
    .eq('organisation_id', organisationId)
    .eq('is_primary', true)
    .order('status', { ascending: true })
    .order('updated_at', { ascending: false })
    .limit(1)

  if (result.error) {
    if (isMissingTableError(result.error)) {
      return { link: null, schemaReady: false, missingSchema: true }
    }
    throw result.error
  }

  return {
    link: normalizeLinkRow(result.data?.[0] || null),
    schemaReady: true,
    missingSchema: false,
  }
}

export async function saveAgencyPublicIntakeLink(input = {}, options = {}) {
  const client = requireClient(options.client)
  const organisationId = normalizeText(input.organisationId || input.organisation_id || options.organisationId)
  if (!organisationId) throw new Error('Organisation is required before saving the public intake link.')
  const existing = input.id
    ? input
    : (await loadAgencyPublicIntakeLink({ client, organisationId })).link
  const payload = buildPayload(input, {
    ...existing,
    organisationId,
    organisationName: options.organisationName,
  })

  const result = existing?.id
    ? await client
      .from('agency_public_intake_links')
      .update(payload)
      .eq('id', existing.id)
      .eq('organisation_id', organisationId)
      .select('id, organisation_id, slug, status, is_primary, heading, introduction, buyer_cta_label, seller_cta_label, enabled_intents, lead_source_label, source_channel, campaign_code, default_branch_id, default_assigned_agent_id, privacy_policy_version, consent_copy, disabled_at, created_at, updated_at')
      .single()
    : await client
      .from('agency_public_intake_links')
      .insert(payload)
      .select('id, organisation_id, slug, status, is_primary, heading, introduction, buyer_cta_label, seller_cta_label, enabled_intents, lead_source_label, source_channel, campaign_code, default_branch_id, default_assigned_agent_id, privacy_policy_version, consent_copy, disabled_at, created_at, updated_at')
      .single()

  if (result.error) {
    if (isMissingTableError(result.error)) {
      return { link: null, schemaReady: false, missingSchema: true }
    }
    throw result.error
  }

  return {
    link: normalizeLinkRow(result.data),
    schemaReady: true,
    missingSchema: false,
  }
}

export async function loadAgencyPublicIntakePerformance(options = {}) {
  const organisationId = normalizeText(options.organisationId || options.organisation_id)
  if (!organisationId) throw new Error('Organisation is required before loading public intake performance.')
  const client = requireClient(options.client)
  const windowDays = Math.min(365, Math.max(1, Math.round(Number(options.windowDays || 30) || 30)))
  const limit = Math.min(200, Math.max(1, Math.round(Number(options.limit || 24) || 24)))
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString()

  let query = client
    .from('agency_public_intake_submissions')
    .select('id, intake_link_id, organisation_id, lead_id, intent, status, source_channel, campaign_code, contact_name, contact_email, contact_phone, budget_min, budget_max, selected_listings_json, processing_error, processed_at, created_at, updated_at')
    .eq('organisation_id', organisationId)
    .gte('created_at', since)

  const intakeLinkId = normalizeText(options.intakeLinkId || options.intake_link_id)
  if (intakeLinkId) {
    query = query.eq('intake_link_id', intakeLinkId)
  }

  query = query
    .order('created_at', { ascending: false })
    .limit(limit)

  const result = await query
  if (result.error) {
    if (isMissingTableError(result.error, 'agency_public_intake_submissions')) {
      return {
        submissions: [],
        summary: createPerformanceSummary([]),
        schemaReady: false,
        missingSchema: true,
        windowDays,
      }
    }
    throw result.error
  }

  const submissions = (result.data || []).map(normalizeSubmissionRow).filter(Boolean)
  return {
    submissions,
    summary: createPerformanceSummary(submissions),
    schemaReady: true,
    missingSchema: false,
    windowDays,
  }
}

export const __agencyPublicIntakeLinkServiceTestUtils = Object.freeze({
  buildPayload,
  createPerformanceSummary,
  createSlugFallback,
  isMissingTableError,
  normalizeEnabledIntents,
  normalizeLinkRow,
  normalizeSlug,
  normalizeSubmissionRow,
})
