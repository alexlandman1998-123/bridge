import { createHash, randomUUID } from 'node:crypto'
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { resolveOnboardingBranding } from '../../src/lib/onboardingBranding.js'
import { writeNodeJsonResponse } from './hqMissionControlApi.js'

let cachedRuntimeEnv = null

const ALLOWED_SOURCE_CHANNELS = new Set([
  'instagram',
  'facebook',
  'linkedin',
  'website',
  'whatsapp',
  'card',
  'email',
  'qr',
  'referral',
  'manual',
  'other',
])
const ALLOWED_INTENTS = new Set(['buy', 'sell'])
const DEFAULT_PRIVACY_POLICY_VERSION = 'agency-public-intake-v1'
const MAX_SELECTED_LISTINGS = 24
const PUBLIC_INTAKE_AUTOMATION_KEY = 'agency_public_intake_received'
const LEGACY_AGENCY_PUBLIC_INTAKE_SLUG_ALIASES = Object.freeze({
  kingstons: 'kingstons-real-estate',
})
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const PUBLIC_INTAKE_OWNER_ROLE_PRIORITY = new Map([
  ['principal', 0],
  ['owner', 0],
  ['agency_principal', 0],
  ['principal_/_owner', 0],
  ['super_admin', 1],
  ['superadmin', 1],
  ['admin', 2],
  ['administrator', 2],
  ['branch_manager', 3],
  ['branch_admin', 3],
  ['agency_manager', 4],
  ['manager', 4],
])

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeLower(value = '') {
  return normalizeText(value).toLowerCase()
}

function normalizeEmail(value = '') {
  return normalizeLower(value)
}

function normalizePhoneDigits(value = '') {
  return normalizeText(value).replace(/[^0-9]+/g, '')
}

function safeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function normalizeArray(value = []) {
  if (Array.isArray(value)) return value.map(normalizeText).filter(Boolean)
  const text = normalizeText(value)
  if (!text) return []
  try {
    const parsed = JSON.parse(text)
    if (Array.isArray(parsed)) return normalizeArray(parsed)
  } catch {
    return text.split(',').map(normalizeText).filter(Boolean)
  }
  return []
}

function toFiniteNumber(value) {
  if (value === null || value === undefined || value === '') return null
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function isUuidLike(value = '') {
  return UUID_PATTERN.test(normalizeText(value))
}

function nullableUuid(value = '') {
  const normalized = normalizeText(value)
  return isUuidLike(normalized) ? normalized : null
}

function isMissingNotificationOutboxError(error = {}) {
  const code = normalizeText(error.code).toUpperCase()
  const message = normalizeText(error.message).toLowerCase()
  return code === '42P01' || message.includes('notification_events')
}

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {}
  return Object.fromEntries(
    fs
      .readFileSync(filePath, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const separatorIndex = line.indexOf('=')
        if (separatorIndex === -1) return [line, '']
        return [line.slice(0, separatorIndex), line.slice(separatorIndex + 1).replace(/^['"]|['"]$/g, '')]
      }),
  )
}

function getRuntimeEnv() {
  if (cachedRuntimeEnv) return cachedRuntimeEnv
  const rootEnvPath = new URL('../../.env', import.meta.url)
  const productionEnvPath = new URL('../../.env.production.local', import.meta.url)
  const stagingEnvPath = new URL('../../.env.staging.local', import.meta.url)
  const processEnvSource = globalThis?.process?.env || {}
  const processEnv = Object.fromEntries(Object.entries(processEnvSource).map(([key, value]) => [key, normalizeText(value)]))
  const merged = {
    ...parseEnvFile(rootEnvPath),
    ...parseEnvFile(productionEnvPath),
    ...parseEnvFile(stagingEnvPath),
    ...processEnv,
  }
  if (!merged.SUPABASE_URL && merged.VITE_SUPABASE_URL) merged.SUPABASE_URL = merged.VITE_SUPABASE_URL
  cachedRuntimeEnv = merged
  return cachedRuntimeEnv
}

function createServiceClient() {
  const env = getRuntimeEnv()
  const supabaseUrl = normalizeText(env.SUPABASE_URL || env.VITE_SUPABASE_URL)
  const serviceRoleKey = normalizeText(env.SUPABASE_SERVICE_ROLE_KEY)

  if (!supabaseUrl || !serviceRoleKey) {
    const error = new Error('Agency public intake backend is not configured.')
    error.code = 'agency_public_intake_backend_unconfigured'
    error.status = 503
    throw error
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  })
}

function getAppBaseUrl() {
  const env = getRuntimeEnv()
  return normalizeText(env.PUBLIC_APP_URL || env.CLIENT_APP_URL || env.APP_BASE_URL || env.VITE_PUBLIC_APP_URL || env.VITE_APP_BASE_URL) ||
    'https://app.arch9.co.za'
}

function buildLeadActionLink(leadId = '') {
  const normalizedLeadId = normalizeText(leadId)
  const baseUrl = getAppBaseUrl().replace(/\/+$/, '')
  return normalizedLeadId ? `${baseUrl}/agency/leads/${encodeURIComponent(normalizedLeadId)}` : `${baseUrl}/agency/leads`
}

function normalizeRoleKey(value = '') {
  return normalizeText(value).toLowerCase().replace(/[\s-]+/g, '_')
}

function isManagerRole(row = {}) {
  const role = normalizeRoleKey(row.workspace_role || row.organisation_role || row.role || row.app_role)
  return PUBLIC_INTAKE_OWNER_ROLE_PRIORITY.has(role)
}

export function selectPublicIntakeFallbackOwner(rows = [], { branchId = '' } = {}) {
  const scopedBranchId = normalizeText(branchId)
  return (Array.isArray(rows) ? rows : [])
    .map((row, index) => ({
      row,
      index,
      role: normalizeRoleKey(row?.workspace_role || row?.organisation_role || row?.role || row?.app_role),
      userId: normalizeText(row?.user_id || row?.id),
      branchId: normalizeText(row?.branch_id),
      status: normalizeLower(row?.status),
    }))
    .filter((item) => item.userId && isUuidLike(item.userId))
    .filter((item) => ['active', 'accepted'].includes(item.status || 'active'))
    .filter((item) => PUBLIC_INTAKE_OWNER_ROLE_PRIORITY.has(item.role))
    .sort((left, right) => {
      const roleDelta = PUBLIC_INTAKE_OWNER_ROLE_PRIORITY.get(left.role) - PUBLIC_INTAKE_OWNER_ROLE_PRIORITY.get(right.role)
      if (roleDelta) return roleDelta

      const branchRank = (item) => {
        if (!scopedBranchId) return 0
        if (item.branchId === scopedBranchId) return 0
        if (!item.branchId) return 1
        return 2
      }
      const branchDelta = branchRank(left) - branchRank(right)
      if (branchDelta) return branchDelta

      return left.index - right.index
    })[0]?.row || null
}

async function resolvePublicIntakeFallbackOwner(client, organisationId = '', branchId = '') {
  if (!organisationId) return null
  const query = await client
    .from('organisation_users')
    .select('user_id, first_name, last_name, name, full_name, email, role, workspace_role, organisation_role, app_role, branch_id, status')
    .eq('organisation_id', organisationId)
    .in('status', ['active', 'accepted'])
    .limit(100)
  if (query.error) throw query.error
  return selectPublicIntakeFallbackOwner(query.data || [], { branchId })
}

async function resolvePublicIntakeAssignmentLink(client, link = {}) {
  if (normalizeText(link.default_assigned_agent_id)) return link

  try {
    const fallbackOwner = await resolvePublicIntakeFallbackOwner(
      client,
      normalizeText(link.organisation_id),
      normalizeText(link.default_branch_id),
    )
    const fallbackOwnerId = normalizeText(fallbackOwner?.user_id)
    if (!fallbackOwnerId) return link

    return {
      ...link,
      default_assigned_agent_id: fallbackOwnerId,
      default_branch_id: normalizeText(link.default_branch_id) || normalizeText(fallbackOwner?.branch_id) || null,
      public_intake_assignment_source: 'fallback_owner',
    }
  } catch (error) {
    console.warn('[agency-public-intake] fallback owner lookup failed; lead will remain unassigned', {
      organisationId: normalizeText(link.organisation_id),
      message: normalizeText(error?.message),
    })
    return link
  }
}

function displayName(row = {}, fallback = '') {
  return normalizeText([row.first_name, row.last_name].filter(Boolean).join(' ')) ||
    normalizeText(row.name || row.full_name || row.email) ||
    fallback
}

function firstNameFromDisplayName(value = '') {
  return normalizeText(value).split(/\s+/).filter(Boolean)[0] || ''
}

function getAgentDigitalCardMetadata(link = {}) {
  return safeObject(safeObject(safeObject(link.metadata_json).agentDigitalCard).agent)
}

function buildAgentAcknowledgementContact({ agent = {}, link = {} } = {}) {
  const cardAgent = getAgentDigitalCardMetadata(link)
  const email = normalizeEmail(agent.email || cardAgent.email)
  const agentDisplayName = displayName(agent, '')
  const name = (agentDisplayName && agentDisplayName !== email ? agentDisplayName : '') || normalizeText(cardAgent.name) || agentDisplayName
  return {
    name,
    firstName: firstNameFromDisplayName(name),
    email,
    phone: normalizeText(agent.phone || agent.mobile_phone || agent.contact_phone || cardAgent.phone || cardAgent.whatsapp),
    jobTitle: normalizeText(agent.job_title || agent.jobTitle || agent.title || cardAgent.jobTitle) || 'Property Practitioner',
    avatarUrl: normalizeText(agent.avatar_url || agent.avatarUrl || cardAgent.avatarUrl),
  }
}

export function buildPublicIntakeSupervisorLeadOperationsPayload({ basePayload = {}, supervisor = {}, dedupeSeed = '' } = {}) {
  const supervisorId = normalizeText(supervisor.user_id || supervisor.id || basePayload.assignedUserId)
  const supervisorEmail = normalizeEmail(supervisor.email)
  return {
    ...basePayload,
    type: 'new_enquiry_unassigned_manager',
    to: supervisorEmail,
    recipientName: displayName(supervisor, 'Principal'),
    recipientRole: 'principal',
    assignedAgentName: '',
    assignedAgentEmail: '',
    subject: 'New lead needs assignment',
    message: `${normalizeText(basePayload.leadName) || 'A new public intake lead'} is ready for review. Please assign it to the right agent for follow-up.`,
    reason: 'Public intake fallback routed to principal for assignment.',
    idempotencyKey: `lead-ops:${normalizeText(dedupeSeed)}:fallback-supervisor:${supervisorId || supervisorEmail}`,
  }
}

async function fetchOrganisationUserById(client, organisationId = '', userId = '') {
  if (!organisationId || !userId) return null
  const query = await client
    .from('organisation_users')
    .select('user_id, first_name, last_name, name, full_name, email, role, workspace_role, organisation_role, app_role, branch_id, status')
    .eq('organisation_id', organisationId)
    .eq('user_id', userId)
    .in('status', ['active', 'accepted'])
    .limit(1)
    .maybeSingle()
  if (!query.error && query.data) return query.data
  return null
}

async function fetchLeadManagerRecipients(client, organisationId = '', branchId = '') {
  if (!organisationId) return []
  const query = await client
    .from('organisation_users')
    .select('user_id, first_name, last_name, name, full_name, email, role, workspace_role, organisation_role, app_role, branch_id, status')
    .eq('organisation_id', organisationId)
    .in('status', ['active', 'accepted'])
    .limit(50)
  if (query.error) return []
  const rows = Array.isArray(query.data) ? query.data : []
  const scoped = rows.filter((row) => {
    if (!normalizeEmail(row.email) || !isManagerRole(row)) return false
    const rowBranch = normalizeText(row.branch_id)
    return !branchId || !rowBranch || rowBranch === branchId
  })
  const managers = scoped.length ? scoped : rows.filter((row) => normalizeEmail(row.email) && isManagerRole(row))
  return managers.slice(0, 5)
}

async function invokeLeadOperationsEmail(payload = {}) {
  const env = getRuntimeEnv()
  const supabaseUrl = normalizeText(env.SUPABASE_URL || env.VITE_SUPABASE_URL)
  const serviceRoleKey = normalizeText(env.SUPABASE_SERVICE_ROLE_KEY)
  if (!supabaseUrl || !serviceRoleKey) return { sent: false, skipped: true, reason: 'missing_send_email_configuration' }

  const response = await fetch(`${supabaseUrl.replace(/\/+$/, '')}/functions/v1/send-email`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok || data?.ok === false || data?.error) {
    return { sent: false, error: data?.message || data?.error || 'send_email_rejected', status: response.status }
  }
  return { sent: data?.sent !== false, result: data }
}

export function buildAgencyPublicIntakeLeadAcknowledgementPayload({ rows = {}, submission = {}, normalized = {}, link = {}, agent = {}, basePayload = {}, dedupeSeed = '' } = {}) {
  const leadEmail = normalizeEmail(basePayload.leadEmail || normalized.contactEmail || submission.contact_email || rows.contactRow?.email)
  if (!leadEmail) return null

  const selectedListings = mergeListingSummaries(rows.selectedListings, submission.selected_listings_json, submission.payload_json?.selectedListings, normalized.selectedListings)
  const selectedListing = selectedListings[0] || {}
  const propertyLabel = normalizeText(basePayload.propertyLabel || selectedListing.title || selectedListing.slug || selectedListing.id || rows.leadRow?.property_interest)
  const agentContact = buildAgentAcknowledgementContact({ agent, link })
  const originalMessage = normalizeText(submission.payload_json?.message || normalized.message) ||
    (propertyLabel ? `Property enquiry: ${propertyLabel}` : '')
  const stableDedupeSeed = normalizeText(dedupeSeed || submission.id || submission.idempotency_key || rows.leadId)

  return {
    type: 'property_enquiry_acknowledgement',
    to: leadEmail,
    recipientName: normalizeText(basePayload.leadName || normalized.contactName || submission.contact_name),
    organisationId: rows.organisationId,
    leadId: rows.leadId,
    source: normalizeText(basePayload.leadSource || rows.leadSource || rows.leadRow?.lead_source || normalized.sourceChannel || submission.source_channel),
    originalMessage,
    agentName: agentContact.name,
    agentFirstName: agentContact.firstName,
    agentEmail: agentContact.email,
    agentPhone: agentContact.phone,
    agentJobTitle: agentContact.jobTitle,
    agentAvatarUrl: agentContact.avatarUrl,
    replyTo: agentContact.email || undefined,
    subject: 'Thanks for your property enquiry',
    idempotencyKey: `lead-ack:${stableDedupeSeed}:${leadEmail}`,
  }
}

function buildJsonResponse(status, body, headers = {}) {
  return {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Accept',
      ...headers,
    },
    body,
  }
}

function normalizeMethod(value = '') {
  return normalizeText(value || 'GET').toUpperCase()
}

function getRequestUrl(url = '', headers = {}) {
  const host = normalizeText(headers.host || headers.Host) || 'app.arch9.co.za'
  const protocol = normalizeText(headers['x-forwarded-proto'] || headers['X-Forwarded-Proto']) || 'https'
  return new URL(url || '/api/public/agency-intake', `${protocol}://${host}`)
}

function getPublicHost(headers = {}) {
  const host = normalizeText(headers.host || headers.Host) || 'app.arch9.co.za'
  const protocol = normalizeText(headers['x-forwarded-proto'] || headers['X-Forwarded-Proto']) || 'https'
  if (host === 'app.arch9.co.za') return 'https://app.arch9.co.za'
  return `${protocol}://${host}`
}

export function normalizeAgencyIntakeSlug(value = '') {
  return normalizeLower(value)
}

export function resolveAgencyPublicIntakeSlugCandidates(slug = '') {
  const normalizedSlug = normalizeAgencyIntakeSlug(slug)
  if (!normalizedSlug) return []
  const aliasSlug = LEGACY_AGENCY_PUBLIC_INTAKE_SLUG_ALIASES[normalizedSlug]
  return Array.from(new Set([normalizedSlug, normalizeAgencyIntakeSlug(aliasSlug)].filter(Boolean)))
}

function normalizeSourceChannel(value = '', fallback = 'other') {
  const candidate = normalizeLower(value || fallback || 'other')
  return ALLOWED_SOURCE_CHANNELS.has(candidate) ? candidate : 'other'
}

function normalizeCampaignCode(value = '') {
  const code = normalizeLower(value)
  if (!code) return ''
  return /^[a-z0-9][a-z0-9._-]*$/.test(code) && code.length <= 80 ? code : ''
}

function normalizeEnabledIntents(value = []) {
  const intents = normalizeArray(value)
    .map(normalizeLower)
    .filter((intent) => ALLOWED_INTENTS.has(intent))
  return [...new Set(intents)].sort()
}

function getNestedObject(...sources) {
  for (const source of sources) {
    if (source && typeof source === 'object' && !Array.isArray(source)) return source
  }
  return {}
}

async function resolveStorageAssetUrl(client, { bucket = '', path = '', fallbackUrl = '' } = {}) {
  const normalizedBucket = normalizeText(bucket)
  const normalizedPath = normalizeText(path)
  if (normalizedBucket && normalizedPath) {
    const signed = await client.storage.from(normalizedBucket).createSignedUrl(normalizedPath, 60 * 60 * 24 * 7)
    if (!signed.error && signed.data?.signedUrl) return signed.data.signedUrl
  }
  return normalizeText(fallbackUrl)
}

export async function resolveAgencyPublicBranding(client, organisation = {}, settings = {}, linkBranding = {}) {
  const onboarding = getNestedObject(settings.agencyOnboarding, settings.agency_onboarding)
  const agencyInformation = getNestedObject(onboarding.agencyInformation, onboarding.agency_information, settings.agencyInformation, settings.agency_information)
  const onboardingBranding = getNestedObject(onboarding.branding, onboarding.onboardingBranding)
  const settingsBranding = getNestedObject(settings.branding, settings.portalBranding)
  const linkBrandingConfig = safeObject(linkBranding)
  const resolved = resolveOnboardingBranding(
    linkBrandingConfig,
    onboardingBranding,
    settingsBranding,
    {
      organisationName: normalizeText(agencyInformation.tradingName || agencyInformation.agencyName),
    },
    organisation,
  )

  const logoLightUrl = await resolveStorageAssetUrl(client, {
    bucket: linkBrandingConfig.logoLightBucket || onboardingBranding.logoLightBucket,
    path: linkBrandingConfig.logoLightPath || onboardingBranding.logoLightPath,
    fallbackUrl: resolved.logoLightUrl,
  })
  const logoDarkUrl = await resolveStorageAssetUrl(client, {
    bucket: linkBrandingConfig.logoDarkBucket || onboardingBranding.logoDarkBucket,
    path: linkBrandingConfig.logoDarkPath || onboardingBranding.logoDarkPath,
    fallbackUrl: resolved.logoDarkUrl,
  })
  const logoIconUrl = await resolveStorageAssetUrl(client, {
    bucket: linkBrandingConfig.logoIconBucket || onboardingBranding.logoIconBucket || onboardingBranding.portalIconBucket || onboardingBranding.mobileIconBucket,
    path: linkBrandingConfig.logoIconPath || onboardingBranding.logoIconPath || onboardingBranding.portalIconPath || onboardingBranding.mobileIconPath,
    fallbackUrl: resolved.logoIconUrl,
  })

  const publicIdentity = getNestedObject(
    linkBrandingConfig.publicIdentity,
    linkBrandingConfig.public_identity,
    settingsBranding.publicIdentity,
    settingsBranding.public_identity,
    settings.publicIdentity,
    settings.public_identity,
  )
  const organisationName = normalizeText(
    resolved.organisationName ||
      agencyInformation.tradingName ||
      agencyInformation.agencyName ||
      organisation.display_name ||
      organisation.name,
  )

  return {
    agencyName: organisationName,
    organisationName,
    logoUrl: normalizeText(logoDarkUrl || logoLightUrl || logoIconUrl || organisation.logo_url),
    logoDarkUrl,
    logoLightUrl,
    logoIconUrl,
    primaryColour: resolved.primaryColour,
    secondaryColour: resolved.secondaryColour,
    accentColour: resolved.accentColour,
    website: normalizeText(publicIdentity.website || organisation.website),
    contactEmail: normalizeEmail(publicIdentity.supportEmail || publicIdentity.email || organisation.support_email || organisation.company_email),
    contactPhone: normalizeText(publicIdentity.supportPhone || publicIdentity.phone || organisation.support_phone || organisation.company_phone),
    social: {
      facebook: normalizeText(publicIdentity.facebook),
      instagram: normalizeText(publicIdentity.instagram),
      linkedIn: normalizeText(publicIdentity.linkedIn || publicIdentity.linkedin),
    },
  }
}

export function buildAgencyPublicIntakeContract({ link = {}, organisation = {}, branding = {}, host = '' } = {}) {
  const slug = normalizeAgencyIntakeSlug(link.slug)
  const enabledIntents = normalizeEnabledIntents(link.enabled_intents)
  const intakeUrl = `${normalizeText(host).replace(/\/+$/g, '') || 'https://app.arch9.co.za'}/intake/${encodeURIComponent(slug)}`
  const metadata = safeObject(link.metadata_json)
  const agentDigitalCard = safeObject(metadata.agentDigitalCard)
  const agentCardAgent = safeObject(agentDigitalCard.agent)
  const isAgentDigitalCard = metadata.surface === 'agent_digital_card'

  return {
    slug,
    status: 'active',
    intakeUrl,
    cardUrl: `${normalizeText(host).replace(/\/+$/g, '') || 'https://app.arch9.co.za'}/card/${encodeURIComponent(slug)}`,
    card: {
      enabled: isAgentDigitalCard,
      surface: normalizeText(metadata.surface),
      version: Number(metadata.version || 0) || null,
      agent: {
        userId: normalizeText(agentCardAgent.userId),
        name: normalizeText(agentCardAgent.name),
        email: normalizeText(agentCardAgent.email),
        phone: normalizeText(agentCardAgent.phone),
        whatsapp: normalizeText(agentCardAgent.whatsapp),
        jobTitle: normalizeText(agentCardAgent.jobTitle),
        avatarUrl: normalizeText(agentCardAgent.avatarUrl),
      },
      features: safeObject(agentDigitalCard.features),
    },
    agency: {
      name: normalizeText(branding.agencyName || branding.organisationName || organisation.display_name || organisation.name),
      logoUrl: normalizeText(branding.logoUrl),
      logoDarkUrl: normalizeText(branding.logoDarkUrl),
      logoLightUrl: normalizeText(branding.logoLightUrl),
      logoIconUrl: normalizeText(branding.logoIconUrl),
      primaryColour: normalizeText(branding.primaryColour),
      secondaryColour: normalizeText(branding.secondaryColour),
      accentColour: normalizeText(branding.accentColour),
      website: normalizeText(branding.website),
      contactEmail: normalizeText(branding.contactEmail),
      contactPhone: normalizeText(branding.contactPhone),
      social: safeObject(branding.social),
    },
    intake: {
      heading: normalizeText(link.heading),
      introduction: normalizeText(link.introduction),
      buyerCtaLabel: normalizeText(link.buyer_cta_label) || 'I am looking to buy',
      sellerCtaLabel: normalizeText(link.seller_cta_label) || 'I am looking to sell',
      enabledIntents: enabledIntents.length ? enabledIntents : ['buy', 'sell'],
      privacyPolicyVersion: normalizeText(link.privacy_policy_version) || DEFAULT_PRIVACY_POLICY_VERSION,
      consentCopy: normalizeText(link.consent_copy),
    },
    config: {
      buyer: safeObject(link.buyer_config_json),
      seller: safeObject(link.seller_config_json),
      listingMatch: safeObject(link.listing_match_config_json),
      attribution: safeObject(link.attribution_config_json),
    },
    updatedAt: normalizeText(link.updated_at),
  }
}

export async function resolveAgencyPublicIntake(client, slug = '', { host = '' } = {}) {
  const slugCandidates = resolveAgencyPublicIntakeSlugCandidates(slug)
  if (!slugCandidates.length) return null

  const linkResult = await client
    .from('agency_public_intake_links')
    .select([
      'id',
      'organisation_id',
      'slug',
      'status',
      'heading',
      'introduction',
      'buyer_cta_label',
      'seller_cta_label',
      'enabled_intents',
      'lead_source_label',
      'source_channel',
      'campaign_code',
      'default_branch_id',
      'default_assigned_agent_id',
      'privacy_policy_version',
      'consent_copy',
      'branding_config_json',
      'buyer_config_json',
      'seller_config_json',
      'listing_match_config_json',
      'routing_config_json',
      'attribution_config_json',
      'metadata_json',
      'updated_at',
    ].join(', '))
    .in('slug', slugCandidates)
    .eq('status', 'active')
    .is('disabled_at', null)

  if (linkResult.error) throw linkResult.error
  const linkRows = Array.isArray(linkResult.data) ? linkResult.data : linkResult.data ? [linkResult.data] : []
  const link = slugCandidates
    .map((candidate) => linkRows.find((row) => normalizeAgencyIntakeSlug(row?.slug) === candidate))
    .find(Boolean)
  if (!link) return null

  const [organisationResult, settingsResult] = await Promise.all([
    client
      .from('organisations')
      .select('id, name, display_name, logo_url, website, company_email, company_phone, support_email, support_phone, status')
      .eq('id', link.organisation_id)
      .maybeSingle(),
    client
      .from('organisation_settings')
      .select('settings_json')
      .eq('organisation_id', link.organisation_id)
      .maybeSingle(),
  ])

  if (organisationResult.error) throw organisationResult.error
  if (settingsResult.error) throw settingsResult.error
  if (!organisationResult.data || normalizeLower(organisationResult.data.status) !== 'active') return null

  const settings = safeObject(settingsResult.data?.settings_json)
  const branding = await resolveAgencyPublicBranding(client, organisationResult.data, settings, safeObject(link.branding_config_json))

  return {
    link,
    organisation: organisationResult.data,
    publicIntake: buildAgencyPublicIntakeContract({
      link,
      organisation: organisationResult.data,
      branding,
      host,
    }),
  }
}

function normalizeSelectedListings(payload = {}) {
  const raw = payload.selectedListings || payload.selected_listings || payload.listings || payload.selectedListingIds || payload.selected_listing_ids
  const items = Array.isArray(raw) ? raw : normalizeArray(raw)
  return items
    .map((item) => {
      if (item && typeof item === 'object') {
        return {
          id: normalizeText(item.id),
          slug: normalizeText(item.slug),
          title: normalizeText(item.title),
          askingPrice: toFiniteNumber(item.askingPrice || item.asking_price),
        }
      }
      const text = normalizeText(item)
      if (!text) return null
      return isUuidLike(text)
        ? { id: text }
        : { slug: text }
    })
    .filter(Boolean)
    .slice(0, MAX_SELECTED_LISTINGS)
}

function normalizeListingSummary(item = {}) {
  if (!item || typeof item !== 'object') return null
  const id = normalizeText(item.id)
  const slug = normalizeText(item.slug)
  if (!id && !slug) return null
  return {
    id,
    slug,
    title: normalizeText(item.title),
    askingPrice: toFiniteNumber(item.askingPrice ?? item.asking_price),
  }
}

function mergeListingSummaries(...groups) {
  const seen = new Set()
  return groups
    .flat()
    .map(normalizeListingSummary)
    .filter((listing) => {
      const key = normalizeText(listing?.id || listing?.slug)
      if (!key || seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, MAX_SELECTED_LISTINGS)
}

function buildRequirementAutomationPayload(requirement = {}, normalized = {}) {
  const propertyTypes = normalizeArray(requirement.propertyTypes || requirement.property_types || requirement.propertyType || requirement.property_type)
  return {
    budgetMin: normalized.budgetMin ?? toFiniteNumber(requirement.budgetMin ?? requirement.budget_min),
    budgetMax: normalized.budgetMax ?? toFiniteNumber(requirement.budgetMax ?? requirement.budget_max ?? requirement.budget),
    areas: normalizeTextList(requirement.areas || requirement.area || requirement.suburbs || requirement.suburb),
    propertyType: normalizeText(propertyTypes[0] || requirement.propertyType || requirement.property_type),
    bedroomsMin: toFiniteNumber(requirement.bedroomsMin ?? requirement.bedrooms_min),
    bathroomsMin: toFiniteNumber(requirement.bathroomsMin ?? requirement.bathrooms_min),
    financeStatus: normalizeFinanceStatus(requirement.financeStatus || requirement.finance_status) || null,
    timeline: normalizeRequirementTimeline(requirement.timeline) || normalizeText(requirement.timeline) || null,
  }
}

function buildSellerAutomationPayload(seller = {}) {
  return {
    propertyAddress: normalizeText(seller.propertyAddress || seller.property_address),
    suburb: normalizeText(seller.suburb),
    propertyType: normalizeText(seller.propertyType || seller.property_type),
    estimatedValue: toFiniteNumber(seller.estimatedValue ?? seller.estimated_value),
    timeline: normalizeRequirementTimeline(seller.timeline) || normalizeText(seller.timeline) || null,
  }
}

export function normalizeAgencyIntakeSubmissionPayload(payload = {}, link = {}) {
  const contact = safeObject(payload.contact)
  const requirement = safeObject(payload.requirement)
  const seller = safeObject(payload.seller)
  const intent = normalizeLower(payload.intent || payload.type || payload.leadCategory || payload.lead_category)
  const firstName = normalizeText(contact.firstName || contact.first_name || payload.firstName || payload.first_name)
  const lastName = normalizeText(contact.lastName || contact.last_name || payload.lastName || payload.last_name)
  const fullName = normalizeText(contact.name || contact.fullName || contact.full_name || payload.name || payload.fullName || [firstName, lastName].filter(Boolean).join(' '))
  const budgetMin = toFiniteNumber(requirement.budgetMin ?? requirement.budget_min ?? payload.budgetMin ?? payload.budget_min)
  const budgetMax = toFiniteNumber(requirement.budgetMax ?? requirement.budget_max ?? payload.budgetMax ?? payload.budget_max ?? payload.budget)

  return {
    slug: normalizeAgencyIntakeSlug(payload.slug || link.slug),
    intent,
    idempotencyKey: normalizeText(payload.idempotencyKey || payload.idempotency_key || payload.requestId || payload.request_id),
    contactName: fullName,
    contactEmail: normalizeEmail(contact.email || payload.email),
    contactPhone: normalizeText(contact.phone || payload.phone),
    phoneDigits: normalizePhoneDigits(contact.phone || payload.phone),
    budgetMin,
    budgetMax,
    selectedListings: normalizeSelectedListings(payload),
    sourceChannel: normalizeSourceChannel(payload.sourceChannel || payload.source_channel, link.source_channel),
    campaignCode: normalizeCampaignCode(payload.campaignCode || payload.campaign_code || link.campaign_code),
    utm: safeObject(payload.utm || payload.utm_json || safeObject(payload.context).utm),
    metadata: safeObject(payload.context || payload.requestMetadata || payload.request_metadata),
    privacyConsent: payload.privacyConsent === true || payload.privacy_consent === true,
    privacyPolicyVersion: normalizeText(payload.privacyPolicyVersion || payload.privacy_policy_version || link.privacy_policy_version) || DEFAULT_PRIVACY_POLICY_VERSION,
    seller,
    requirement,
  }
}

export function validateAgencyIntakeSubmission(payload = {}, link = {}) {
  const normalized = normalizeAgencyIntakeSubmissionPayload(payload, link)
  const errors = {}
  const enabledIntents = normalizeEnabledIntents(link.enabled_intents)

  if (!ALLOWED_INTENTS.has(normalized.intent)) errors.intent = 'Choose whether this is a buyer or seller enquiry.'
  if (enabledIntents.length && !enabledIntents.includes(normalized.intent)) errors.intent = 'This enquiry type is not available for this agency link.'
  if (!normalized.idempotencyKey || normalized.idempotencyKey.length < 16 || normalized.idempotencyKey.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(normalized.idempotencyKey)) {
    errors.idempotencyKey = 'A valid idempotency key is required.'
  }
  if (!normalized.contactName) errors.contactName = 'Name is required.'
  if (!normalized.contactEmail && !normalized.phoneDigits) errors.contact = 'Email or phone number is required.'
  if (normalized.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized.contactEmail)) errors.email = 'Enter a valid email address.'
  if (normalized.phoneDigits && (normalized.phoneDigits.length < 7 || normalized.phoneDigits.length > 20)) errors.phone = 'Enter a valid phone number.'
  if (normalized.budgetMin !== null && normalized.budgetMin < 0) errors.budgetMin = 'Minimum budget must be zero or more.'
  if (normalized.budgetMax !== null && normalized.budgetMax < 0) errors.budgetMax = 'Maximum budget must be zero or more.'
  if (normalized.budgetMin !== null && normalized.budgetMax !== null && normalized.budgetMin > normalized.budgetMax) errors.budget = 'Minimum budget cannot be greater than maximum budget.'
  if (!normalized.privacyConsent) errors.privacyConsent = 'Privacy consent is required.'
  if (!normalized.privacyPolicyVersion || normalized.privacyPolicyVersion.length > 80) errors.privacyPolicyVersion = 'A valid privacy policy version is required.'

  return { errors, normalized }
}

function splitContactName(name = '') {
  const parts = normalizeText(name).split(/\s+/).filter(Boolean)
  if (!parts.length) return { firstName: '', lastName: '' }
  if (parts.length === 1) return { firstName: parts[0], lastName: '' }
  return {
    firstName: parts.slice(0, -1).join(' '),
    lastName: parts[parts.length - 1],
  }
}

function normalizeRequirementTimeline(value = '') {
  const token = normalizeLower(value)
  if (['now', 'immediate', 'immediately'].includes(token)) return 'immediately'
  if (['1_3_months', '0_3_months', '1-3 months', '0-3 months'].includes(token)) return '0_3_months'
  if (['3_6_months', '3-6 months'].includes(token)) return '3_6_months'
  if (['6_plus_months', '6_12_months', '6+ months'].includes(token)) return '6_12_months'
  if (['not_sure', 'not sure', 'unknown'].includes(token)) return 'not_sure'
  return ''
}

function normalizeFinanceStatus(value = '') {
  const token = normalizeLower(value)
  return ['unknown', 'cash', 'bond_needed', 'pre_approved', 'bond_in_progress', 'not_ready'].includes(token) ? token : ''
}

function normalizeTextList(value = '') {
  return normalizeArray(value)
    .flatMap((item) => String(item).split(','))
    .map(normalizeText)
    .filter(Boolean)
}

export function buildAgencyPublicIntakeCrmRows({ link = {}, submission = {}, normalized = {}, nowIso = new Date().toISOString() } = {}) {
  const organisationId = normalizeText(link.organisation_id || submission.organisation_id)
  const contactId = normalizeText(submission.contact_id) || randomUUID()
  const leadId = normalizeText(submission.lead_id) || randomUUID()
  const { firstName, lastName } = splitContactName(normalized.contactName || submission.contact_name)
  const leadSource = normalizeText(link.lead_source_label) || 'Public Intake'
  const intent = normalized.intent || submission.intent
  const isSeller = intent === 'sell'
  const requirement = safeObject(normalized.requirement)
  const seller = safeObject(normalized.seller)
  const areas = normalizeTextList(requirement.areas || requirement.area || submission.payload_json?.requirement?.areas)
  const propertyTypes = normalizeTextList(requirement.propertyTypes || requirement.property_types || requirement.propertyType || requirement.property_type)
  const propertyTypeText = normalizeText(propertyTypes[0] || requirement.propertyType || seller.propertyType)
  const sellerAddress = normalizeText(seller.propertyAddress || seller.property_address || requirement.propertyAddress || submission.payload_json?.seller?.propertyAddress)
  const sellerSuburb = normalizeText(seller.suburb || submission.payload_json?.seller?.suburb)
  const sellerEstimatedValue = toFiniteNumber(seller.estimatedValue ?? seller.estimated_value)
  const buyerBudgetMax = normalized.budgetMax ?? toFiniteNumber(submission.budget_max)
  const buyerBudgetMin = normalized.budgetMin ?? toFiniteNumber(submission.budget_min)
  const leadNotes = [
    normalizeText(submission.payload_json?.message || normalized.message),
    isSeller && sellerAddress ? `Property: ${sellerAddress}` : '',
    !isSeller && areas.length ? `Areas: ${areas.join(', ')}` : '',
  ].filter(Boolean).join('\n')

  const selectedListingIds = [
    ...(Array.isArray(normalized.selectedListings) ? normalized.selectedListings : []),
    ...(Array.isArray(submission.selected_listings_json) ? submission.selected_listings_json : []),
  ]
    .map((item) => normalizeText(item?.id || item))
    .filter(isUuidLike)
  const selectedListings = mergeListingSummaries(normalized.selectedListings, submission.selected_listings_json, submission.payload_json?.selectedListings)
  const primaryListingId = selectedListingIds[0] || ''

  const leadRow = {
    lead_id: leadId,
    organisation_id: organisationId,
    branch_id: normalizeText(link.default_branch_id) || null,
    assigned_user_id: normalizeText(link.default_assigned_agent_id) || null,
    assigned_agent_id: normalizeText(link.default_assigned_agent_id) || null,
    contact_id: contactId,
    lead_domain: 'agency',
    lead_category: isSeller ? 'seller' : 'buyer',
    lead_direction: 'Inbound',
    lead_source: leadSource,
    source_channel: normalizeSourceChannel(normalized.sourceChannel || submission.source_channel, link.source_channel),
    campaign_code: normalizeCampaignCode(normalized.campaignCode || submission.campaign_code) || null,
    stage: 'New Lead',
    status: 'New Lead',
    priority: 'High',
    budget: isSeller ? sellerEstimatedValue || 0 : buyerBudgetMax || 0,
    area_interest: isSeller ? sellerSuburb || null : areas.join(', ') || null,
    property_interest: propertyTypeText || null,
    seller_property_address: isSeller ? sellerAddress || null : null,
    estimated_value: isSeller ? sellerEstimatedValue || 0 : 0,
    listing_id: primaryListingId || null,
    enquired_listing_id: primaryListingId || null,
    source_reference_id: normalizeText(submission.idempotency_key || normalized.idempotencyKey),
    raw_enquiry_payload: safeObject(submission.payload_json),
    notes: leadNotes || null,
    updated_at: nowIso,
  }

  const contactRow = {
    contact_id: contactId,
    organisation_id: organisationId,
    assigned_agent_id: normalizeText(link.default_assigned_agent_id) || null,
    first_name: firstName || normalized.contactName,
    last_name: lastName,
    phone: normalizeText(normalized.contactPhone || submission.contact_phone) || null,
    email: normalizeEmail(normalized.contactEmail || submission.contact_email) || null,
    contact_type: 'Lead',
    notes: leadNotes || null,
    updated_at: nowIso,
  }

  const requirementRow = !isSeller ? {
    organisation_id: organisationId,
    lead_id: leadId,
    contact_id: contactId,
    title: `${leadSource} buyer requirement`,
    intent_type: 'buy',
    property_types: propertyTypes.length ? propertyTypes : null,
    areas: areas.length ? areas : null,
    suburbs: normalizeTextList(requirement.suburbs || requirement.suburb).length ? normalizeTextList(requirement.suburbs || requirement.suburb) : null,
    city: normalizeText(requirement.city) || null,
    province: normalizeText(requirement.province) || null,
    budget_min: buyerBudgetMin,
    budget_max: buyerBudgetMax,
    bedrooms_min: toFiniteNumber(requirement.bedroomsMin ?? requirement.bedrooms_min),
    bathrooms_min: toFiniteNumber(requirement.bathroomsMin ?? requirement.bathrooms_min),
    finance_status: normalizeFinanceStatus(requirement.financeStatus || requirement.finance_status) || null,
    timeline: normalizeRequirementTimeline(requirement.timeline) || null,
    consent_to_receive_matches: true,
    notes: normalizeText(submission.payload_json?.message || normalized.message) || null,
    status: 'active',
    is_primary: true,
  } : null

  return {
    organisationId,
    contactId,
    leadId,
    leadSource,
    intent,
    contactRow,
    leadRow,
    requirementRow,
    selectedListings,
    selectedListingIds,
  }
}

async function findExistingContact(client, { organisationId = '', email = '', phone = '' } = {}) {
  const normalizedEmail = normalizeEmail(email)
  const normalizedPhone = normalizeText(phone)
  if (normalizedEmail) {
    const result = await client
      .from('contacts')
      .select('contact_id, first_name, last_name, email, phone')
      .eq('organisation_id', organisationId)
      .eq('email', normalizedEmail)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    if (result.error) throw result.error
    if (result.data) return result.data
  }
  if (normalizedPhone) {
    const result = await client
      .from('contacts')
      .select('contact_id, first_name, last_name, email, phone')
      .eq('organisation_id', organisationId)
      .eq('phone', normalizedPhone)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    if (result.error) throw result.error
    if (result.data) return result.data
  }
  return null
}

async function persistContact(client, rows) {
  const existingContact = await findExistingContact(client, {
    organisationId: rows.organisationId,
    email: rows.contactRow.email,
    phone: rows.contactRow.phone,
  })
  const contactRow = existingContact?.contact_id
    ? {
        ...rows.contactRow,
        contact_id: existingContact.contact_id,
        first_name: normalizeText(existingContact.first_name) || rows.contactRow.first_name,
        last_name: normalizeText(existingContact.last_name) || rows.contactRow.last_name,
        email: normalizeEmail(existingContact.email) || rows.contactRow.email,
        phone: normalizeText(existingContact.phone) || rows.contactRow.phone,
      }
    : rows.contactRow

  const result = await client
    .from('contacts')
    .upsert(contactRow, { onConflict: 'contact_id' })
    .select('contact_id')
    .single()
  if (result.error) throw result.error
  return {
    ...rows,
    contactId: normalizeText(result.data?.contact_id || contactRow.contact_id),
    contactRow,
    reusedContact: Boolean(existingContact),
  }
}

async function persistLead(client, rows) {
  const leadRow = {
    ...rows.leadRow,
    contact_id: rows.contactId,
  }
  const result = await client
    .from('leads')
    .upsert(leadRow, { onConflict: 'lead_id' })
    .select('lead_id')
    .single()
  if (result.error) throw result.error
  return {
    ...rows,
    leadId: normalizeText(result.data?.lead_id || leadRow.lead_id),
    leadRow,
  }
}

async function persistRequirement(client, rows) {
  if (!rows.requirementRow) return { ...rows, requirement: null }
  const result = await client
    .from('lead_requirements')
    .insert({
      ...rows.requirementRow,
      lead_id: rows.leadId,
      contact_id: rows.contactId,
    })
    .select('requirement_id')
    .single()

  if (result.error) {
    if (result.error.code === '23505') return { ...rows, requirement: null }
    throw result.error
  }
  return { ...rows, requirement: result.data || null }
}

async function persistListingInterests(client, rows) {
  if (!rows.selectedListingIds.length) return { ...rows, listingInterests: [] }
  const listingResult = await client
    .from('private_listings')
    .select('id')
    .eq('organisation_id', rows.organisationId)
    .in('id', rows.selectedListingIds)
  if (listingResult.error) throw listingResult.error
  const allowedListingIds = new Set((listingResult.data || []).map((row) => normalizeText(row.id)).filter(Boolean))
  const interestRows = rows.selectedListingIds.filter((listingId) => allowedListingIds.has(listingId)).map((listingId, index) => ({
    organisation_id: rows.organisationId,
    lead_id: rows.leadId,
    contact_id: rows.contactId,
    listing_id: listingId,
    requirement_id: rows.requirement?.requirement_id || null,
    source: rows.leadSource,
    status: 'interested',
    is_original_enquiry: index === 0,
    is_agent_selected: true,
    is_system_suggested: false,
    notes: 'Selected from public agency intake.',
  }))
  if (!interestRows.length) return { ...rows, listingInterests: [] }
  const result = await client
    .from('lead_listing_interests')
    .upsert(interestRows, { onConflict: 'lead_id,listing_id' })
    .select('interest_id, listing_id')
  if (result.error) throw result.error
  return { ...rows, listingInterests: result.data || [] }
}

async function persistLeadActivityAndTask(client, rows, submission = {}) {
  const nowIso = new Date().toISOString()
  const dueDate = nowIso.slice(0, 10)
  const selectedListings = mergeListingSummaries(rows.selectedListings, submission.selected_listings_json, submission.payload_json?.selectedListings)
  const selectedListingLine = selectedListings.length
    ? `${selectedListings.length} selected listing${selectedListings.length === 1 ? '' : 's'}: ${selectedListings.map((listing) => listing.title || listing.slug || listing.id).filter(Boolean).slice(0, 4).join(', ')}${selectedListings.length > 4 ? ` and ${selectedListings.length - 4} more` : ''}.`
    : ''
  const followUpDescription = [
    'Public intake follow-up.',
    selectedListingLine,
    rows.intent === 'buy' && rows.requirementRow?.areas?.length ? `Areas: ${rows.requirementRow.areas.join(', ')}.` : '',
    rows.intent === 'buy' && (rows.requirementRow?.budget_min !== null || rows.requirementRow?.budget_max !== null)
      ? `Budget: ${rows.requirementRow.budget_min ?? 0}${rows.requirementRow.budget_max !== null ? `-${rows.requirementRow.budget_max}` : '+'}.`
      : '',
  ].filter(Boolean).join('\n')
  const [activityResult, taskResult] = await Promise.all([
    client
      .from('lead_activities')
      .insert({
        organisation_id: rows.organisationId,
        lead_id: rows.leadId,
        agent_id: rows.leadRow.assigned_agent_id || null,
        activity_type: 'Public intake received',
        activity_note: [
          `${rows.intent === 'sell' ? 'Seller' : 'Buyer'} public intake submitted.`,
          selectedListingLine,
          submission.idempotency_key ? `Reference: ${submission.idempotency_key}` : '',
        ].filter(Boolean).join('\n'),
        activity_date: nowIso,
        outcome: 'New Lead',
      })
      .select('activity_id')
      .single(),
    client
      .from('tasks')
      .insert({
        organisation_id: rows.organisationId,
        lead_id: rows.leadId,
        assigned_agent_id: rows.leadRow.assigned_agent_id || null,
        title: 'Contact Lead',
        description: followUpDescription,
        due_date: dueDate,
        status: 'Pending',
        priority: 'High',
        updated_at: nowIso,
      })
      .select('task_id')
      .single(),
  ])
  if (activityResult.error) throw activityResult.error
  if (taskResult.error) throw taskResult.error
  return { ...rows, activity: activityResult.data || null, task: taskResult.data || null }
}

function buildPublicIntakeAutomationPreview({ rows = {}, normalized = {}, submission = {} } = {}) {
  const intentLabel = rows.intent === 'sell' ? 'Seller' : 'Buyer'
  const contactName = normalizeText(normalized.contactName || submission.contact_name || [
    rows.contactRow?.first_name,
    rows.contactRow?.last_name,
  ].filter(Boolean).join(' ')) || 'Public lead'
  const sourceChannel = normalizeSourceChannel(normalized.sourceChannel || submission.source_channel || rows.leadRow?.source_channel)
  const campaignCode = normalizeCampaignCode(normalized.campaignCode || submission.campaign_code || rows.leadRow?.campaign_code)
  const selectedListings = mergeListingSummaries(rows.selectedListings, submission.selected_listings_json, submission.payload_json?.selectedListings, normalized.selectedListings)
  const selectedCount = selectedListings.length || (Array.isArray(rows.selectedListingIds) ? rows.selectedListingIds.length : 0)
  const budgetMin = normalized.budgetMin ?? toFiniteNumber(submission.budget_min)
  const budgetMax = normalized.budgetMax ?? toFiniteNumber(submission.budget_max)
  const selectedTitles = selectedListings.map((listing) => listing.title || listing.slug || listing.id).filter(Boolean).slice(0, 2).join(', ')
  const previewParts = [
    `${intentLabel} public intake from ${contactName}.`,
    sourceChannel ? `Source: ${sourceChannel}.` : '',
    campaignCode ? `Campaign: ${campaignCode}.` : '',
    rows.intent === 'buy' && (budgetMin !== null || budgetMax !== null)
      ? `Budget: ${budgetMin ?? 0}${budgetMax !== null ? `-${budgetMax}` : '+'}.`
      : '',
    selectedCount ? `${selectedCount} listing${selectedCount === 1 ? '' : 's'} selected${selectedTitles ? `: ${selectedTitles}` : ''}.` : '',
  ]
  return previewParts.filter(Boolean).join(' ').slice(0, 320)
}

export function buildAgencyPublicIntakeAutomationEvent({ rows = {}, submission = {}, normalized = {} } = {}) {
  const organisationId = nullableUuid(rows.organisationId || rows.leadRow?.organisation_id)
  if (!organisationId) return null

  const intent = normalizeLower(rows.intent || normalized.intent || submission.intent)
  const intentLabel = intent === 'sell' ? 'Seller' : 'Buyer'
  const taskId = normalizeText(rows.task?.task_id)
  const activityId = normalizeText(rows.activity?.activity_id)
  const listingInterestIds = Array.isArray(rows.listingInterests)
    ? rows.listingInterests.map((item) => normalizeText(item?.interest_id)).filter(Boolean)
    : []
  const primaryListingId = nullableUuid(rows.leadRow?.enquired_listing_id || rows.leadRow?.listing_id || rows.selectedListingIds?.[0])
  const submissionId = normalizeText(submission.id)
  const idempotencyKey = normalizeText(submission.idempotency_key || normalized.idempotencyKey || rows.leadRow?.source_reference_id)
  const dedupeId = submissionId || idempotencyKey || rows.leadId
  const payloadMessage = normalizeText(submission.payload_json?.message || normalized.message)
  const selectedListings = mergeListingSummaries(rows.selectedListings, submission.selected_listings_json, submission.payload_json?.selectedListings, normalized.selectedListings)
  const requirement = {
    ...safeObject(rows.requirementRow),
    ...safeObject(submission.payload_json?.requirement),
    ...safeObject(normalized.requirement),
  }
  const seller = {
    ...safeObject(submission.payload_json?.seller),
    ...safeObject(normalized.seller),
  }
  const buyerRequirement = buildRequirementAutomationPayload(requirement, normalized)
  const sellerDetails = buildSellerAutomationPayload(seller)
  const pageUrl = normalizeText(submission.request_metadata_json?.pageUrl || submission.payload_json?.context?.pageUrl || normalized.metadata?.pageUrl)
  const referrer = normalizeText(submission.request_metadata_json?.referrer || submission.payload_json?.context?.referrer || normalized.metadata?.referrer)

  return {
    automation_key: PUBLIC_INTAKE_AUTOMATION_KEY,
    organisation_id: organisationId,
    branch_id: nullableUuid(rows.leadRow?.branch_id),
    assigned_user_id: nullableUuid(rows.leadRow?.assigned_agent_id || rows.leadRow?.assigned_user_id),
    lead_id: nullableUuid(rows.leadId || rows.leadRow?.lead_id),
    listing_id: primaryListingId,
    event_key: PUBLIC_INTAKE_AUTOMATION_KEY,
    category: 'notification',
    trigger_type: 'system_event',
    channel: 'in_app',
    status: 'prepared',
    recipient_email: null,
    recipient_role: 'agent',
    subject: `${intentLabel} public intake received`,
    message_preview: buildPublicIntakeAutomationPreview({ rows, normalized, submission }),
    source: 'agency_public_intake',
    dedupe_key: `agency_public_intake:${dedupeId}:agent_handoff`,
    payload_json: {
      communicationType: PUBLIC_INTAKE_AUTOMATION_KEY,
      intent,
      leadCategory: rows.leadRow?.lead_category || intent,
      leadSource: rows.leadSource || rows.leadRow?.lead_source || 'Public Intake',
      sourceChannel: normalizeSourceChannel(normalized.sourceChannel || submission.source_channel || rows.leadRow?.source_channel),
      campaignCode: normalizeCampaignCode(normalized.campaignCode || submission.campaign_code || rows.leadRow?.campaign_code) || null,
      contactName: normalizeText(normalized.contactName || submission.contact_name),
      contactEmail: normalizeEmail(normalized.contactEmail || submission.contact_email),
      contactPhone: normalizeText(normalized.contactPhone || submission.contact_phone),
      budgetMin: normalized.budgetMin ?? toFiniteNumber(submission.budget_min),
      budgetMax: normalized.budgetMax ?? toFiniteNumber(submission.budget_max),
      selectedListingIds: Array.isArray(rows.selectedListingIds) ? rows.selectedListingIds : [],
      selectedListings,
      listingInterestIds,
      buyerRequirement: intent === 'buy' ? buyerRequirement : null,
      sellerDetails: intent === 'sell' ? sellerDetails : null,
      message: payloadMessage,
      submissionId: submissionId || null,
      idempotencyKey: idempotencyKey || null,
      taskId: taskId || null,
      activityId: activityId || null,
      requirementId: normalizeText(rows.requirement?.requirement_id) || null,
      pageUrl: pageUrl || null,
      referrer: referrer || null,
    },
    metadata_json: {
      publicIntake: true,
      outbox: true,
      handoffRequired: true,
      notificationMode: 'agent_handoff',
      phase: 'agency_public_intake_phase8',
      taskId: taskId || null,
      activityId: activityId || null,
      requirementId: normalizeText(rows.requirement?.requirement_id) || null,
      listingInterestIds,
      submissionId: submissionId || null,
      idempotencyKey: idempotencyKey || null,
    },
  }
}

async function persistAgencyPublicIntakeAutomation(client, rows, submission = {}, normalized = {}) {
  const payload = buildAgencyPublicIntakeAutomationEvent({ rows, submission, normalized })
  if (!payload) {
    return {
      ...rows,
      automation: {
        created: false,
        skipped: true,
        reason: 'missing_organisation',
      },
    }
  }

  const existing = await client
    .from('notification_events')
    .select('id, status, created_at')
    .eq('organisation_id', payload.organisation_id)
    .eq('dedupe_key', payload.dedupe_key)
    .maybeSingle()

  if (existing.error) {
    if (isMissingNotificationOutboxError(existing.error)) {
      return {
        ...rows,
        automation: {
          created: false,
          skipped: true,
          reason: 'notification_outbox_unavailable',
        },
      }
    }
    return {
      ...rows,
      automation: {
        created: false,
        skipped: true,
        reason: 'notification_outbox_lookup_failed',
        error: normalizeText(existing.error.message),
      },
    }
  }

  if (existing.data?.id) {
    return {
      ...rows,
      automation: {
        created: false,
        duplicate: true,
        eventId: existing.data.id,
        status: existing.data.status,
      },
    }
  }

  let result = await client
    .from('notification_events')
    .insert(payload)
    .select('id, status, created_at')
    .single()

  if (result.error?.code === '23503' && normalizeText(result.error.message).toLowerCase().includes('notification_automation')) {
    const fallbackPayload = {
      ...payload,
      automation_key: null,
      metadata_json: {
        ...payload.metadata_json,
        automationDefinitionMissing: true,
      },
    }
    result = await client
      .from('notification_events')
      .insert(fallbackPayload)
      .select('id, status, created_at')
      .single()
  }

  if (result.error) {
    if (isMissingNotificationOutboxError(result.error)) {
      return {
        ...rows,
        automation: {
          created: false,
          skipped: true,
          reason: 'notification_outbox_unavailable',
        },
      }
    }
    return {
      ...rows,
      automation: {
        created: false,
        skipped: true,
        reason: 'notification_outbox_insert_failed',
        error: normalizeText(result.error.message),
      },
    }
  }

  return {
    ...rows,
    automation: {
      created: true,
      eventId: result.data?.id || null,
      status: result.data?.status || payload.status,
    },
  }
}

function buildLeadOperationBasePayload(rows = {}, submission = {}, normalized = {}) {
  const selectedListings = mergeListingSummaries(rows.selectedListings, submission.selected_listings_json, submission.payload_json?.selectedListings, normalized.selectedListings)
  const selectedListing = selectedListings[0] || {}
  const leadName = normalizeText(normalized.contactName || submission.contact_name || [
    rows.contactRow?.first_name,
    rows.contactRow?.last_name,
  ].filter(Boolean).join(' '))
  const budgetMin = normalized.budgetMin ?? toFiniteNumber(submission.budget_min)
  const budgetMax = normalized.budgetMax ?? toFiniteNumber(submission.budget_max)
  const budgetLabel = budgetMin !== null || budgetMax !== null
    ? `${budgetMin ?? 0}${budgetMax !== null ? `-${budgetMax}` : '+'}`
    : ''
  return {
    organisationId: rows.organisationId,
    leadId: rows.leadId,
    branchId: normalizeText(rows.leadRow?.branch_id),
    assignedUserId: normalizeText(rows.leadRow?.assigned_agent_id || rows.leadRow?.assigned_user_id),
    leadName,
    leadEmail: normalizeEmail(normalized.contactEmail || submission.contact_email || rows.contactRow?.email),
    leadPhone: normalizeText(normalized.contactPhone || submission.contact_phone || rows.contactRow?.phone),
    leadSource: normalizeText(rows.leadSource || rows.leadRow?.lead_source || 'Public Intake'),
    leadCategory: normalizeText(rows.leadRow?.lead_category || rows.intent),
    leadStatus: normalizeText(rows.leadRow?.status || rows.leadRow?.stage || 'New Lead'),
    propertyLabel: normalizeText(selectedListing.title || selectedListing.address || rows.leadRow?.seller_property_address || rows.leadRow?.property_interest),
    budgetLabel,
    actionLink: buildLeadActionLink(rows.leadId),
    source: 'agency_public_intake',
    metadata: {
      submissionId: normalizeText(submission.id) || null,
      idempotencyKey: normalizeText(submission.idempotency_key || normalized.idempotencyKey) || null,
      taskId: normalizeText(rows.task?.task_id) || null,
      activityId: normalizeText(rows.activity?.activity_id) || null,
    },
  }
}

async function dispatchAgencyPublicIntakeLeadAcknowledgementEmail({ rows = {}, submission = {}, normalized = {}, link = {}, agent = {}, basePayload = {}, dedupeSeed = '' } = {}) {
  const payload = buildAgencyPublicIntakeLeadAcknowledgementPayload({
    rows,
    submission,
    normalized,
    link,
    agent,
    basePayload,
    dedupeSeed,
  })
  if (!payload) return { attempted: false, skipped: true, reason: 'missing_lead_email' }
  return {
    attempted: true,
    result: await invokeLeadOperationsEmail(payload),
  }
}

async function dispatchAgencyPublicIntakeLeadOperationsEmail(client, rows, submission = {}, normalized = {}, link = {}) {
  const basePayload = buildLeadOperationBasePayload(rows, submission, normalized)
  const assignedUserId = normalizeText(basePayload.assignedUserId)
  const fallbackSupervisorAssignment = normalizeText(rows.assignmentSource) === 'fallback_owner'
  const dedupeSeed = normalizeText(submission.id || submission.idempotency_key || rows.leadId)
  const results = []
  let assignedAgent = null

  if (assignedUserId) {
    assignedAgent = await fetchOrganisationUserById(client, rows.organisationId, assignedUserId)
    const agentEmail = normalizeEmail(assignedAgent?.email)
    if (agentEmail) {
      const payload = fallbackSupervisorAssignment
        ? buildPublicIntakeSupervisorLeadOperationsPayload({
            basePayload,
            supervisor: assignedAgent,
            dedupeSeed,
          })
        : {
            ...basePayload,
            type: 'new_enquiry_assigned_agent',
            to: agentEmail,
            recipientName: displayName(assignedAgent, 'Agent'),
            recipientRole: 'agent',
            assignedAgentName: displayName(assignedAgent, ''),
            assignedAgentEmail: agentEmail,
            subject: 'New enquiry assigned to you',
            idempotencyKey: `lead-ops:${dedupeSeed}:assigned-agent:${assignedUserId}`,
          }
      results.push(await invokeLeadOperationsEmail(payload))
    }
    const acknowledgement = await dispatchAgencyPublicIntakeLeadAcknowledgementEmail({
      rows,
      submission,
      normalized,
      link,
      agent: assignedAgent,
      basePayload,
      dedupeSeed,
    })
    return { attempted: results.length > 0 || Boolean(acknowledgement?.attempted), results, acknowledgement }
  }

  const managers = await fetchLeadManagerRecipients(client, rows.organisationId, normalizeText(rows.leadRow?.branch_id))
  for (const manager of managers) {
    const managerEmail = normalizeEmail(manager.email)
    if (!managerEmail) continue
    results.push(await invokeLeadOperationsEmail({
      ...basePayload,
      type: 'new_enquiry_unassigned_manager',
      to: managerEmail,
      recipientName: displayName(manager, 'Manager'),
      recipientRole: 'manager',
      subject: 'New enquiry needs assignment',
      idempotencyKey: `lead-ops:${dedupeSeed}:unassigned-manager:${normalizeText(manager.user_id || managerEmail)}`,
    }))
  }
  const acknowledgement = await dispatchAgencyPublicIntakeLeadAcknowledgementEmail({
    rows,
    submission,
    normalized,
    link,
    basePayload,
    dedupeSeed,
  })
  return { attempted: results.length > 0 || Boolean(acknowledgement?.attempted), results, acknowledgement }
}

async function persistIngestionLog(client, rows, submission = {}) {
  const result = await client
    .from('lead_ingestion_logs')
    .insert({
      organisation_id: rows.organisationId,
      source: rows.leadSource,
      external_reference: submission.idempotency_key,
      payload: submission.payload_json || {},
      status: 'processed',
      lead_id: rows.leadId,
      contact_id: rows.contactId,
    })
    .select('log_id')
    .single()

  if (result.error) {
    if (result.error.code === '23505') return { ...rows, log: null }
    throw result.error
  }
  return { ...rows, log: result.data || null }
}

async function updateSubmissionProcessingState(client, submissionId = '', patch = {}) {
  if (!submissionId) return null
  const result = await client
    .from('agency_public_intake_submissions')
    .update({
      ...patch,
      updated_at: new Date().toISOString(),
    })
    .eq('id', submissionId)
    .select('id, status, lead_id, created_at, processed_at')
    .single()
  if (result.error) throw result.error
  return result.data || null
}

function summarizePublicSubmission(submission = {}) {
  if (!submission) return null
  return {
    id: normalizeText(submission.id),
    status: normalizeText(submission.status),
    createdAt: normalizeText(submission.created_at),
    processedAt: normalizeText(submission.processed_at),
  }
}

function summarizeAutomationHandoff(rows = {}) {
  const automation = rows.automation || {}
  const prepared = Boolean(automation.created || automation.duplicate)
  return {
    prepared,
    created: Boolean(automation.created),
    duplicate: Boolean(automation.duplicate),
    skipped: Boolean(automation.skipped),
    status: normalizeText(automation.status),
    reason: normalizeText(automation.reason),
    taskCreated: Boolean(rows.task?.task_id),
    activityCreated: Boolean(rows.activity?.activity_id),
    listingInterestCount: Array.isArray(rows.listingInterests) ? rows.listingInterests.length : 0,
  }
}

async function hydrateAgencyPublicIntakeSubmission(client, { link = {}, submission = {}, normalized = {} } = {}) {
  if (submission.lead_id) {
    return {
      accepted: true,
      duplicate: false,
      submission: summarizePublicSubmission(submission),
      lead: { created: true },
    }
  }

  await updateSubmissionProcessingState(client, submission.id, { status: 'processing' })

  try {
    const assignmentLink = await resolvePublicIntakeAssignmentLink(client, link)
    let rows = {
      ...buildAgencyPublicIntakeCrmRows({ link: assignmentLink, submission, normalized }),
      assignmentSource: normalizeText(assignmentLink.public_intake_assignment_source),
    }
    rows = await persistContact(client, rows)
    rows = await persistLead(client, rows)
    rows = await persistRequirement(client, rows)
    rows = await persistListingInterests(client, rows)
    rows = await persistLeadActivityAndTask(client, rows, submission)
    rows = await persistAgencyPublicIntakeAutomation(client, rows, submission, normalized)
    try {
      rows = {
        ...rows,
        leadOperationsEmail: await dispatchAgencyPublicIntakeLeadOperationsEmail(client, rows, submission, normalized, assignmentLink),
      }
    } catch (notificationError) {
      rows = {
        ...rows,
        leadOperationsEmail: {
          attempted: false,
          error: normalizeText(notificationError?.message || 'Lead operations notification failed.'),
        },
      }
    }
    rows = await persistIngestionLog(client, rows, submission)

    const processedSubmission = await updateSubmissionProcessingState(client, submission.id, {
      status: 'accepted',
      lead_id: rows.leadId,
      processing_error: null,
      processed_at: new Date().toISOString(),
    })

    return {
      accepted: true,
      duplicate: false,
      submission: summarizePublicSubmission(processedSubmission),
      lead: {
        category: rows.leadRow.lead_category,
        created: true,
        followUpPrepared: Boolean(rows.automation?.created || rows.automation?.duplicate),
        automation: summarizeAutomationHandoff(rows),
        leadOperationsEmail: rows.leadOperationsEmail || null,
      },
    }
  } catch (error) {
    await updateSubmissionProcessingState(client, submission.id, {
      status: 'failed',
      processing_error: normalizeText(error?.message || 'CRM lead creation failed.').slice(0, 2000),
      processed_at: new Date().toISOString(),
    }).catch(() => null)
    throw error
  }
}

async function readJsonBody(body) {
  if (!body) return {}
  if (typeof body === 'object') return body
  if (typeof body === 'string') return JSON.parse(body || '{}')
  return {}
}

function getRequestIp(headers = {}) {
  const forwarded = normalizeText(headers['x-forwarded-for'] || headers['X-Forwarded-For'])
  if (forwarded) return normalizeText(forwarded.split(',')[0])
  return normalizeText(headers['cf-connecting-ip'] || headers['CF-Connecting-IP'] || headers['x-real-ip'] || headers['X-Real-IP'])
}

function hashIpAddress(ip = '') {
  const normalizedIp = normalizeText(ip)
  if (!normalizedIp) return ''
  const env = getRuntimeEnv()
  const salt = normalizeText(env.PUBLIC_INTAKE_IP_HASH_SALT || env.SUPABASE_SERVICE_ROLE_KEY || 'agency-public-intake')
  return createHash('sha256').update(`${salt}:${normalizedIp}`).digest('hex')
}

async function assertRateLimit(client, { intakeLinkId = '', ipHash = '' } = {}) {
  if (!intakeLinkId || !ipHash) return
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const result = await client
    .from('agency_public_intake_submissions')
    .select('created_at')
    .eq('intake_link_id', intakeLinkId)
    .eq('ip_hash', ipHash)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(16)

  if (result.error) throw result.error
  const rows = result.data || []
  const tenMinutesAgo = Date.now() - 10 * 60 * 1000
  const shortWindowCount = rows.filter((row) => Date.parse(row.created_at) >= tenMinutesAgo).length
  if (shortWindowCount >= 5 || rows.length >= 15) {
    const error = new Error('Too many intake submissions. Please try again later.')
    error.code = 'agency_public_intake_rate_limited'
    error.status = 429
    throw error
  }
}

async function findDuplicateSubmission(client, { intakeLinkId = '', idempotencyKey = '' } = {}) {
  const result = await client
    .from('agency_public_intake_submissions')
    .select('*')
    .eq('intake_link_id', intakeLinkId)
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle()
  if (result.error) throw result.error
  return result.data || null
}

async function submitAgencyPublicIntake(client, { link = {}, payload = {}, headers = {} } = {}) {
  const { errors, normalized } = validateAgencyIntakeSubmission(payload, link)
  if (Object.keys(errors).length) {
    const error = new Error('Please complete the required intake fields.')
    error.code = 'validation_failed'
    error.status = 422
    error.errors = errors
    throw error
  }

  const ipHash = hashIpAddress(getRequestIp(headers))
  await assertRateLimit(client, { intakeLinkId: link.id, ipHash })

  const row = {
    intake_link_id: link.id,
    organisation_id: link.organisation_id,
    idempotency_key: normalized.idempotencyKey,
    intent: normalized.intent,
    status: 'received',
    source_channel: normalized.sourceChannel,
    campaign_code: normalized.campaignCode || null,
    utm_json: normalized.utm,
    ip_hash: ipHash || null,
    request_metadata_json: {
      ...normalized.metadata,
      userAgent: normalizeText(headers['user-agent'] || headers['User-Agent']),
      origin: normalizeText(headers.origin || headers.Origin),
    },
    privacy_consent: true,
    privacy_consented_at: new Date().toISOString(),
    privacy_policy_version: normalized.privacyPolicyVersion,
    contact_name: normalized.contactName,
    contact_email: normalized.contactEmail || null,
    contact_phone: normalized.contactPhone || null,
    budget_min: normalized.budgetMin,
    budget_max: normalized.budgetMax,
    selected_listings_json: normalized.selectedListings,
    payload_json: payload,
  }

  const insertResult = await client
    .from('agency_public_intake_submissions')
    .insert(row)
    .select('id, status, created_at')
    .single()

  if (insertResult.error) {
    if (insertResult.error.code === '23505') {
      const duplicate = await findDuplicateSubmission(client, { intakeLinkId: link.id, idempotencyKey: normalized.idempotencyKey })
      if (duplicate && !duplicate.lead_id && duplicate.status !== 'processing') {
        const hydratedDuplicate = await hydrateAgencyPublicIntakeSubmission(client, {
          link,
          submission: duplicate,
          normalized,
        })
        return { ...hydratedDuplicate, duplicate: true }
      }
      return {
        accepted: true,
        duplicate: true,
        submission: summarizePublicSubmission(duplicate),
        lead: duplicate?.lead_id ? { created: true } : null,
      }
    }
    throw insertResult.error
  }

  const hydrated = await hydrateAgencyPublicIntakeSubmission(client, {
    link,
    submission: {
      ...row,
      ...insertResult.data,
    },
    normalized,
  })

  return hydrated
}

export async function createPublicAgencyIntakeResponse({ method = 'GET', url = '', headers = {}, body = null } = {}) {
  const normalizedMethod = normalizeMethod(method)

  if (normalizedMethod === 'OPTIONS') {
    return {
      status: 204,
      headers: {
        'Access-Control-Allow-Headers': 'Content-Type, Accept',
        'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
      },
      body: null,
    }
  }

  const isHeadRequest = normalizedMethod === 'HEAD'
  if (!['GET', 'HEAD', 'POST'].includes(normalizedMethod)) {
    return buildJsonResponse(405, {
      error: 'method_not_allowed',
      message: 'Agency public intake only supports GET and POST.',
    })
  }

  try {
    const requestUrl = getRequestUrl(url, headers)
    const payload = normalizedMethod === 'POST' ? await readJsonBody(body) : {}

    if (normalizedMethod === 'POST' && normalizeText(payload.website)) {
      return buildJsonResponse(200, { accepted: true, skipped: true })
    }

    const slug = normalizeAgencyIntakeSlug(requestUrl.searchParams.get('slug') || payload.slug)
    if (!slug) {
      return buildJsonResponse(400, {
        error: 'slug_required',
        message: 'Agency intake slug is required.',
      })
    }
    const cardOnly = normalizedMethod !== 'POST' && normalizeLower(requestUrl.searchParams.get('surface')) === 'agent_digital_card'

    const client = createServiceClient()
    const resolved = await resolveAgencyPublicIntake(client, slug, { host: getPublicHost(headers) })
    if (!resolved) {
      return buildJsonResponse(404, {
        error: 'agency_public_intake_not_found',
        message: 'This agency intake link is not available.',
      })
    }
    if (cardOnly && !resolved.publicIntake?.card?.enabled) {
      return buildJsonResponse(404, {
        error: 'agent_digital_card_not_found',
        message: 'This digital card is not available.',
      })
    }

    if (normalizedMethod === 'POST') {
      const result = await submitAgencyPublicIntake(client, {
        link: resolved.link,
        payload: {
          ...payload,
          slug,
        },
        headers,
      })
      return buildJsonResponse(result.duplicate ? 200 : 202, result)
    }

    return buildJsonResponse(200, isHeadRequest ? null : { intake: resolved.publicIntake })
  } catch (error) {
    const status = Number(error?.status || error?.statusCode || 500)
    return buildJsonResponse(status, {
      error: error?.code || 'agency_public_intake_error',
      message: status >= 500 ? 'Agency public intake could not be loaded.' : error?.message || 'Agency public intake request failed.',
      ...(error?.errors ? { errors: error.errors } : {}),
    })
  }
}

export { writeNodeJsonResponse }
