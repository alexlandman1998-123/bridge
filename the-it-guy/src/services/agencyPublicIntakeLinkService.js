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
const AGENT_DIGITAL_CARD_SURFACE = 'agent_digital_card'
const AGENT_DIGITAL_CARD_VERSION = 1
const AGENT_DIGITAL_CARD_LEAD_SOURCE = 'Agent Digital Card'
const VALID_STATUSES = new Set(['draft', 'active', 'disabled', 'archived'])
const SUBMISSION_STATUS_KEYS = Object.freeze(['received', 'processing', 'accepted', 'failed', 'spam', 'duplicate'])
const AGENT_DIGITAL_CARD_EVENT_TYPES = Object.freeze([
  'card_view',
  'call_click',
  'whatsapp_click',
  'email_click',
  'buyer_cta_click',
  'seller_cta_click',
  'listing_click',
  'vcf_download',
  'share_click',
  'copy_link',
  'website_click',
])
const LINK_SELECT_COLUMNS = 'id, organisation_id, slug, status, is_primary, heading, introduction, buyer_cta_label, seller_cta_label, enabled_intents, lead_source_label, source_channel, campaign_code, default_branch_id, default_assigned_agent_id, privacy_policy_version, consent_copy, metadata_json, disabled_at, created_at, updated_at'

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

function normalizeObject(value = {}) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
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

export function suggestAgencyAgentCardSlug(input = {}) {
  const organisationName = normalizeText(input.organisationName || input.organisation_name || input.agencyName || input.agency_name)
  const agentName = normalizeText(input.agentName || input.agent_name || input.fullName || input.full_name || input.name)
  const agentEmail = normalizeLower(input.agentEmail || input.agent_email || input.email)
  const emailName = agentEmail.includes('@') ? agentEmail.split('@')[0] : agentEmail
  const slug = normalizeSlug([organisationName, agentName || emailName].filter(Boolean).join('-'))
  if (slug.length >= 3) return slug
  return 'agent-card'
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
  const metadataJson = normalizeObject(row.metadata_json)
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
    metadataJson,
    isAgentDigitalCard: metadataJson.surface === AGENT_DIGITAL_CARD_SURFACE,
    agentDigitalCard: normalizeObject(metadataJson.agentDigitalCard),
    disabledAt: row.disabled_at || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    schemaReady: true,
  }
}

function buildAgentDigitalCardMetadata(input = {}, defaults = {}) {
  const previousMetadata = {
    ...normalizeObject(defaults.metadataJson || defaults.metadata_json),
    ...normalizeObject(input.metadataJson || input.metadata_json),
  }
  const previousCard = normalizeObject(previousMetadata.agentDigitalCard)
  const agent = normalizeObject(input.agent || input.agentProfile || defaults.agent || previousCard.agent)
  const agentUserId = normalizeText(input.agentUserId || input.agent_user_id || input.defaultAssignedAgentId || input.default_assigned_agent_id || defaults.agentUserId || defaults.defaultAssignedAgentId)
  const agentEmail = normalizeText(input.agentEmail || input.agent_email || agent.email || previousCard.agent?.email)
  const agentName = normalizeText(input.agentName || input.agent_name || agent.fullName || agent.full_name || agent.name || previousCard.agent?.name)
  const agentPhone = normalizeText(input.agentPhone || input.agent_phone || agent.phone || agent.phoneNumber || agent.phone_number || previousCard.agent?.phone)
  const agentWhatsApp = normalizeText(input.agentWhatsApp || input.agent_whatsapp || agent.whatsapp || agent.whatsApp || previousCard.agent?.whatsapp)
  const agentJobTitle = normalizeText(input.agentJobTitle || input.agent_job_title || agent.jobTitle || agent.job_title || previousCard.agent?.jobTitle)
  const agentAvatarUrl = normalizeText(input.agentAvatarUrl || input.agent_avatar_url || agent.avatarUrl || agent.avatar_url || previousCard.agent?.avatarUrl)

  return {
    ...previousMetadata,
    surface: AGENT_DIGITAL_CARD_SURFACE,
    version: AGENT_DIGITAL_CARD_VERSION,
    agentDigitalCard: {
      ...previousCard,
      agent: {
        ...normalizeObject(previousCard.agent),
        userId: agentUserId || normalizeText(previousCard.agent?.userId),
        name: agentName || normalizeText(previousCard.agent?.name),
        email: agentEmail || normalizeText(previousCard.agent?.email),
        phone: agentPhone || normalizeText(previousCard.agent?.phone),
        whatsapp: agentWhatsApp || normalizeText(previousCard.agent?.whatsapp),
        jobTitle: agentJobTitle || normalizeText(previousCard.agent?.jobTitle),
        avatarUrl: agentAvatarUrl || normalizeText(previousCard.agent?.avatarUrl),
      },
      features: {
        vcf: input.vcfEnabled ?? previousCard.features?.vcf ?? true,
        qr: input.qrEnabled ?? previousCard.features?.qr ?? true,
        listings: input.listingsEnabled ?? previousCard.features?.listings ?? true,
        leadCapture: input.leadCaptureEnabled ?? previousCard.features?.leadCapture ?? true,
      },
    },
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

function normalizeAgentCardEventType(value = '') {
  const type = normalizeLower(value)
  return AGENT_DIGITAL_CARD_EVENT_TYPES.includes(type) ? type : ''
}

function normalizeAgentCardEventRow(row = null) {
  if (!row) return null
  const eventType = normalizeAgentCardEventType(row.event_type)
  if (!eventType) return null
  return {
    id: normalizeText(row.id),
    intakeLinkId: normalizeText(row.intake_link_id),
    organisationId: normalizeText(row.organisation_id),
    agentUserId: normalizeText(row.agent_user_id),
    slug: normalizeText(row.slug),
    eventType,
    sourceChannel: normalizeSourceChannel(row.source_channel),
    listingId: normalizeText(row.listing_id),
    listingSlug: normalizeText(row.listing_slug),
    metadataJson: normalizeObject(row.metadata_json),
    createdAt: row.created_at || null,
  }
}

function createEmptyAgentCardInsightSummary() {
  return {
    eventTotal: 0,
    views: 0,
    contactClicks: 0,
    callClicks: 0,
    whatsappClicks: 0,
    emailClicks: 0,
    buyerCtaClicks: 0,
    sellerCtaClicks: 0,
    listingClicks: 0,
    vcfDownloads: 0,
    shareClicks: 0,
    copyLinkClicks: 0,
    websiteClicks: 0,
    totalLeads: 0,
    buyerLeads: 0,
    sellerLeads: 0,
    linkedLeads: 0,
    byEventType: Object.fromEntries(AGENT_DIGITAL_CARD_EVENT_TYPES.map((type) => [type, 0])),
    byIntakeLink: {},
  }
}

function applyAgentCardEventToSummary(summary, event) {
  if (!event) return summary
  const type = event.eventType
  summary.eventTotal += 1
  summary.byEventType[type] = (summary.byEventType[type] || 0) + 1

  if (type === 'card_view') summary.views += 1
  if (type === 'call_click') {
    summary.callClicks += 1
    summary.contactClicks += 1
  }
  if (type === 'whatsapp_click') {
    summary.whatsappClicks += 1
    summary.contactClicks += 1
  }
  if (type === 'email_click') {
    summary.emailClicks += 1
    summary.contactClicks += 1
  }
  if (type === 'buyer_cta_click') summary.buyerCtaClicks += 1
  if (type === 'seller_cta_click') summary.sellerCtaClicks += 1
  if (type === 'listing_click') summary.listingClicks += 1
  if (type === 'vcf_download') summary.vcfDownloads += 1
  if (type === 'share_click') summary.shareClicks += 1
  if (type === 'copy_link') summary.copyLinkClicks += 1
  if (type === 'website_click') summary.websiteClicks += 1
  return summary
}

function applyAgentCardLeadToSummary(summary, submission) {
  if (!submission) return summary
  summary.totalLeads += 1
  if (submission.intent === 'buy') summary.buyerLeads += 1
  if (submission.intent === 'sell') summary.sellerLeads += 1
  if (submission.leadId) summary.linkedLeads += 1
  return summary
}

function createAgentCardInsightsSummary(events = [], submissions = []) {
  const summary = createEmptyAgentCardInsightSummary()
  const ensureLinkSummary = (intakeLinkId = '') => {
    const key = normalizeText(intakeLinkId) || 'unknown'
    if (!summary.byIntakeLink[key]) summary.byIntakeLink[key] = createEmptyAgentCardInsightSummary()
    return summary.byIntakeLink[key]
  }

  for (const event of events) {
    applyAgentCardEventToSummary(summary, event)
    applyAgentCardEventToSummary(ensureLinkSummary(event.intakeLinkId), event)
  }

  for (const submission of submissions) {
    applyAgentCardLeadToSummary(summary, submission)
    applyAgentCardLeadToSummary(ensureLinkSummary(submission.intakeLinkId), submission)
  }

  return summary
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
  const metadataJson = normalizeObject(input.metadataJson ?? input.metadata_json ?? defaults.metadataJson ?? defaults.metadata_json)
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
    metadata_json: metadataJson,
    disabled_at: status === 'disabled' || status === 'archived' ? (input.disabledAt || defaults.disabledAt || new Date().toISOString()) : null,
  }
}

function buildAgentCardPayload(input = {}, defaults = {}) {
  const organisationName = normalizeText(input.organisationName || defaults.organisationName)
  const agentUserId = normalizeText(input.agentUserId || input.agent_user_id || input.defaultAssignedAgentId || defaults.agentUserId || defaults.defaultAssignedAgentId)
  if (!agentUserId) throw new Error('Agent user is required before saving an agent digital card.')
  const metadataJson = buildAgentDigitalCardMetadata({
    ...defaults,
    ...input,
    agentUserId,
  }, defaults)
  const agentName = normalizeText(input.agentName || input.agent_name || metadataJson.agentDigitalCard?.agent?.name)
  return buildPayload({
    ...input,
    slug: input.slug || defaults.slug || suggestAgencyAgentCardSlug({
      organisationName,
      agentName,
      agentEmail: input.agentEmail || input.agent_email || metadataJson.agentDigitalCard?.agent?.email,
    }),
    isPrimary: false,
    defaultAssignedAgentId: agentUserId,
    leadSourceLabel: input.leadSourceLabel || defaults.leadSourceLabel || AGENT_DIGITAL_CARD_LEAD_SOURCE,
    sourceChannel: input.sourceChannel || defaults.sourceChannel || 'qr',
    metadataJson,
  }, {
    ...defaults,
    isPrimary: false,
    defaultAssignedAgentId: agentUserId,
    leadSourceLabel: defaults.leadSourceLabel || AGENT_DIGITAL_CARD_LEAD_SOURCE,
    sourceChannel: defaults.sourceChannel || 'qr',
    metadataJson,
  })
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

export function buildAgencyAgentCardUrls({ slug = '', host = DEFAULT_PUBLIC_INTAKE_HOST } = {}) {
  const safeSlug = normalizeSlug(slug)
  const baseHost = normalizeText(host).replace(/\/+$/g, '') || DEFAULT_PUBLIC_INTAKE_HOST
  if (!safeSlug) {
    return {
      cardUrl: '',
      intakeUrl: '',
      buyerUrl: '',
      sellerUrl: '',
      listingsUrl: '',
    }
  }
  const intakeUrl = `${baseHost}/intake/${encodeURIComponent(safeSlug)}`
  return {
    cardUrl: `${baseHost}/card/${encodeURIComponent(safeSlug)}`,
    intakeUrl,
    buyerUrl: `${intakeUrl}?intent=buy&source=card`,
    sellerUrl: `${intakeUrl}?intent=sell&source=card`,
    listingsUrl: `${baseHost}/api/public/listings?cardSlug=${encodeURIComponent(safeSlug)}`,
  }
}

export async function loadAgencyPublicIntakeLink(options = {}) {
  const organisationId = normalizeText(options.organisationId || options.organisation_id)
  if (!organisationId) throw new Error('Organisation is required before loading agency public intake links.')
  const client = requireClient(options.client)
  const result = await client
    .from('agency_public_intake_links')
    .select(LINK_SELECT_COLUMNS)
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
      .select(LINK_SELECT_COLUMNS)
      .single()
    : await client
      .from('agency_public_intake_links')
      .insert(payload)
      .select(LINK_SELECT_COLUMNS)
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

export async function loadAgencyAgentCardLink(options = {}) {
  const organisationId = normalizeText(options.organisationId || options.organisation_id)
  const agentUserId = normalizeText(options.agentUserId || options.agent_user_id || options.defaultAssignedAgentId)
  if (!organisationId) throw new Error('Organisation is required before loading an agent digital card.')
  if (!agentUserId) throw new Error('Agent user is required before loading an agent digital card.')
  const client = requireClient(options.client)
  let query = client
    .from('agency_public_intake_links')
    .select(LINK_SELECT_COLUMNS)
    .eq('organisation_id', organisationId)
    .eq('is_primary', false)
    .eq('default_assigned_agent_id', agentUserId)

  if (typeof query.contains === 'function') {
    query = query.contains('metadata_json', { surface: AGENT_DIGITAL_CARD_SURFACE })
  }

  const result = await query
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

export async function saveAgencyAgentCardLink(input = {}, options = {}) {
  const client = requireClient(options.client)
  const organisationId = normalizeText(input.organisationId || input.organisation_id || options.organisationId)
  const agentUserId = normalizeText(input.agentUserId || input.agent_user_id || input.defaultAssignedAgentId || options.agentUserId)
  if (!organisationId) throw new Error('Organisation is required before saving an agent digital card.')
  if (!agentUserId) throw new Error('Agent user is required before saving an agent digital card.')
  const existing = input.id
    ? input
    : (await loadAgencyAgentCardLink({ client, organisationId, agentUserId })).link
  const payload = buildAgentCardPayload(input, {
    ...existing,
    organisationId,
    organisationName: options.organisationName,
    agentUserId,
  })

  const result = existing?.id
    ? await client
      .from('agency_public_intake_links')
      .update(payload)
      .eq('id', existing.id)
      .eq('organisation_id', organisationId)
      .select(LINK_SELECT_COLUMNS)
      .single()
    : await client
      .from('agency_public_intake_links')
      .insert(payload)
      .select(LINK_SELECT_COLUMNS)
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

export async function listAgencyAgentCardLinks(options = {}) {
  const organisationId = normalizeText(options.organisationId || options.organisation_id)
  if (!organisationId) throw new Error('Organisation is required before loading agent digital cards.')
  const client = requireClient(options.client)
  const limit = Math.min(500, Math.max(1, Math.round(Number(options.limit || 100) || 100)))
  let query = client
    .from('agency_public_intake_links')
    .select(LINK_SELECT_COLUMNS)
    .eq('organisation_id', organisationId)
    .eq('is_primary', false)

  if (typeof query.contains === 'function') {
    query = query.contains('metadata_json', { surface: AGENT_DIGITAL_CARD_SURFACE })
  }

  const status = normalizeText(options.status)
  if (status && status !== 'all') {
    query = query.eq('status', normalizeStatus(status))
  }

  const result = await query
    .order('updated_at', { ascending: false })
    .limit(limit)

  if (result.error) {
    if (isMissingTableError(result.error)) {
      return { links: [], schemaReady: false, missingSchema: true }
    }
    throw result.error
  }

  return {
    links: (result.data || []).map(normalizeLinkRow).filter(Boolean),
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

export async function loadAgencyAgentCardInsights(options = {}) {
  const organisationId = normalizeText(options.organisationId || options.organisation_id)
  if (!organisationId) throw new Error('Organisation is required before loading agent digital card insights.')
  const client = requireClient(options.client)
  const windowDays = Math.min(365, Math.max(1, Math.round(Number(options.windowDays || 30) || 30)))
  const limit = Math.min(1000, Math.max(1, Math.round(Number(options.limit || 500) || 500)))
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString()

  let eventsQuery = client
    .from('agency_agent_card_events')
    .select('id, intake_link_id, organisation_id, agent_user_id, slug, event_type, source_channel, listing_id, listing_slug, metadata_json, created_at')
    .eq('organisation_id', organisationId)
    .gte('created_at', since)

  const intakeLinkId = normalizeText(options.intakeLinkId || options.intake_link_id)
  if (intakeLinkId) {
    eventsQuery = eventsQuery.eq('intake_link_id', intakeLinkId)
  }

  eventsQuery = eventsQuery
    .order('created_at', { ascending: false })
    .limit(limit)

  const eventsResult = await eventsQuery
  if (eventsResult.error) {
    if (isMissingTableError(eventsResult.error, 'agency_agent_card_events')) {
      return {
        events: [],
        submissions: [],
        summary: createAgentCardInsightsSummary([], []),
        schemaReady: false,
        missingSchema: true,
        windowDays,
      }
    }
    throw eventsResult.error
  }

  let submissions = []
  let submissionsMissingSchema = false
  let submissionsQuery = client
    .from('agency_public_intake_submissions')
    .select('id, intake_link_id, organisation_id, lead_id, intent, status, source_channel, campaign_code, contact_name, contact_email, contact_phone, budget_min, budget_max, selected_listings_json, processing_error, processed_at, created_at, updated_at')
    .eq('organisation_id', organisationId)
    .gte('created_at', since)

  if (intakeLinkId) {
    submissionsQuery = submissionsQuery.eq('intake_link_id', intakeLinkId)
  }

  submissionsQuery = submissionsQuery
    .order('created_at', { ascending: false })
    .limit(limit)

  const submissionsResult = await submissionsQuery
  if (submissionsResult.error) {
    if (isMissingTableError(submissionsResult.error, 'agency_public_intake_submissions')) {
      submissionsMissingSchema = true
    } else {
      throw submissionsResult.error
    }
  } else {
    submissions = (submissionsResult.data || []).map(normalizeSubmissionRow).filter(Boolean)
  }

  const events = (eventsResult.data || []).map(normalizeAgentCardEventRow).filter(Boolean)
  return {
    events,
    submissions,
    summary: createAgentCardInsightsSummary(events, submissions),
    schemaReady: !submissionsMissingSchema,
    missingSchema: submissionsMissingSchema,
    windowDays,
  }
}

export const __agencyPublicIntakeLinkServiceTestUtils = Object.freeze({
  AGENT_DIGITAL_CARD_SURFACE,
  AGENT_DIGITAL_CARD_EVENT_TYPES,
  AGENT_DIGITAL_CARD_VERSION,
  buildAgentCardPayload,
  buildAgentDigitalCardMetadata,
  buildPayload,
  createAgentCardInsightsSummary,
  createPerformanceSummary,
  createSlugFallback,
  isMissingTableError,
  normalizeAgentCardEventRow,
  normalizeEnabledIntents,
  normalizeLinkRow,
  normalizeSlug,
  normalizeSubmissionRow,
})
