import { createHash } from 'node:crypto'
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

let cachedRuntimeEnv = null
const SUPABASE_FETCH_TIMEOUT_MS = 5000
const ONBOARDING_CORE_COLUMNS = [
  'id',
  'private_listing_id',
  'token',
  'token_expires_at',
  'seller_portal_token',
  'seller_portal_link_active',
  'seller_portal_link_expires_at',
  'seller_portal_invite_token_hash',
  'seller_portal_invite_created_at',
  'seller_portal_invite_expires_at',
  'seller_portal_invite_consumed_at',
  'seller_portal_activation_source',
  'seller_portal_status',
  'seller_portal_invitation_sent_at',
  'seller_portal_invitation_last_sent_at',
  'seller_portal_invitation_cancelled_at',
  'seller_portal_activated_at',
  'seller_portal_terms_accepted_at',
  'seller_portal_terms_version',
  'seller_portal_terms_acceptance_id',
  'seller_portal_password_hash',
  'seller_portal_access_token_hash',
  'seller_portal_access_token_expires_at',
  'seller_portal_recovery_token_hash',
  'seller_type',
  'ownership_structure',
  'marital_regime',
  'form_data',
  'status',
  'submitted_at',
  'created_at',
  'updated_at',
].join(', ')

function normalizeText(value = '') {
  return String(value || '').trim()
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

function createTimedFetch(timeoutMs = SUPABASE_FETCH_TIMEOUT_MS) {
  return async function timedFetch(input, init = {}) {
    const controller = new AbortController()
    const upstreamSignal = init?.signal
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    const abortFromUpstream = () => controller.abort(upstreamSignal.reason)
    if (upstreamSignal) {
      if (upstreamSignal.aborted) controller.abort(upstreamSignal.reason)
      else upstreamSignal.addEventListener('abort', abortFromUpstream, { once: true })
    }

    try {
      return await fetch(input, {
        ...init,
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timeout)
      if (upstreamSignal) upstreamSignal.removeEventListener('abort', abortFromUpstream)
    }
  }
}

function createServiceClient() {
  const env = getRuntimeEnv()
  const supabaseUrl = normalizeText(env.SUPABASE_URL || env.VITE_SUPABASE_URL)
  const serviceRoleKey = normalizeText(env.SUPABASE_SERVICE_ROLE_KEY)

  if (!supabaseUrl || !serviceRoleKey) {
    const error = new Error('Seller onboarding core backend is not configured.')
    error.code = 'seller_onboarding_core_unconfigured'
    error.status = 503
    throw error
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    global: {
      fetch: createTimedFetch(),
    },
  })
}

function buildJsonResponse(status, body, headers = {}) {
  return {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
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
  return new URL(url || '/api/public/seller-onboarding-core', `${protocol}://${host}`)
}

function sha256Hex(value = '') {
  return createHash('sha256').update(value).digest('hex')
}

function isActiveSellerPortalLink(onboarding = {}, listing = {}) {
  if (onboarding.seller_portal_link_active === false) return false

  const linkExpiresAt = Date.parse(normalizeText(onboarding.seller_portal_link_expires_at))
  if (Number.isFinite(linkExpiresAt) && linkExpiresAt <= Date.now()) return false

  if (normalizeText(listing.deleted_at)) return false

  const listingStatus = normalizeText(listing.listing_status || listing.status).toLowerCase()
  if (['withdrawn', 'cancelled', 'canceled', 'deleted', 'archived', 'closed'].includes(listingStatus)) return false

  const listingVisibility = normalizeText(listing.listing_visibility).toLowerCase()
  if (['withdrawn', 'deleted', 'archived'].includes(listingVisibility)) return false

  return true
}

function publicOnboardingRow(row = null) {
  if (!row || typeof row !== 'object') return null
  const {
    seller_portal_password_hash: _passwordHash,
    seller_portal_access_token_hash: _accessTokenHash,
    seller_portal_invite_token_hash: _inviteTokenHash,
    seller_portal_recovery_token_hash: _recoveryTokenHash,
    ...safeRow
  } = row
  return safeRow
}

function hasPreferredTransferAttorney(formData = {}) {
  const source = formData && typeof formData === 'object' ? formData : {}
  const attorney = source.preferredTransferAttorney && typeof source.preferredTransferAttorney === 'object'
    ? source.preferredTransferAttorney
    : source.preferred_transfer_attorney && typeof source.preferred_transfer_attorney === 'object'
      ? source.preferred_transfer_attorney
      : null
  if (!attorney) return false
  return Boolean(
    normalizeText(attorney.preferredPartnerId || attorney.preferred_partner_id || attorney.partnerRelationshipId || attorney.partner_relationship_id || attorney.id) ||
      normalizeText(attorney.companyName || attorney.company_name || attorney.name),
  )
}

function getOrganisationContactEmail(organisation = {}) {
  const settings = organisation.settings_json && typeof organisation.settings_json === 'object' ? organisation.settings_json : {}
  return normalizeText(
    organisation.contact_email ||
      organisation.contactEmail ||
      settings.contactEmail ||
      settings.contact_email ||
      settings.email ||
      settings.inviteEmail,
  ).toLowerCase()
}

function mapPreferredPartnerAttorney(row = null) {
  if (!row?.id) return null
  const companyName = normalizeText(row.company_name || row.companyName || row.name)
  if (!companyName) return null
  return {
    preferredPartnerId: normalizeText(row.id),
    preferred_partner_id: normalizeText(row.id),
    partnerRelationshipId: normalizeText(row.partner_relationship_id || row.partnerRelationshipId || row.id),
    partner_relationship_id: normalizeText(row.partner_relationship_id || row.partnerRelationshipId || row.id),
    partnerOrganisationId: normalizeText(row.partner_organisation_id || row.partnerOrganisationId),
    partner_organisation_id: normalizeText(row.partner_organisation_id || row.partnerOrganisationId),
    companyName,
    company_name: companyName,
    contactPerson: normalizeText(row.contact_person || row.contactPerson || companyName),
    contact_person: normalizeText(row.contact_person || row.contactPerson || companyName),
    email: normalizeText(row.email_address || row.emailAddress || row.email).toLowerCase(),
    phone: normalizeText(row.phone_number || row.phoneNumber || row.phone),
    selectionSource: 'agency_recommended',
    selection_source: 'agency_recommended',
  }
}

function relationshipIsAccepted(row = {}) {
  const statuses = [row.relationship_status, row.status, row.relationship_type].map((value) => normalizeText(value).toLowerCase())
  return statuses.includes('accepted') || statuses.includes('approved') || statuses.includes('connected')
}

function relationshipLooksLikeTransferAttorney(row = {}) {
  const tokens = [row.partner_type, row.relationship_type, row.role_type, row.role].map((value) => normalizeText(value).toLowerCase())
  if (!tokens.some(Boolean)) return true
  return tokens.some((token) => token.includes('attorney') || token.includes('convey') || token.includes('transfer'))
}

async function resolveConnectedTransferAttorney(client, organisationId = '') {
  const scopedOrganisationId = normalizeText(organisationId)
  if (!scopedOrganisationId) return null

  const relationships = await client
    .from('organisation_partners')
    .select('id, organisation_id, partner_organisation_id, partner_type, status, relationship_status, relationship_type, preferred')
    .or(`organisation_id.eq.${scopedOrganisationId},partner_organisation_id.eq.${scopedOrganisationId}`)
    .limit(20)

  if (relationships.error) {
    if (['42P01', '42703'].includes(String(relationships.error.code || ''))) return null
    throw relationships.error
  }

  const relationship = (relationships.data || [])
    .filter((row) => relationshipIsAccepted(row) && relationshipLooksLikeTransferAttorney(row))
    .sort((left, right) => Number(Boolean(right.preferred)) - Number(Boolean(left.preferred)))[0]
  if (!relationship?.id) return null

  const ownerOrganisationId = normalizeText(relationship.organisation_id)
  const partnerOrganisationId = normalizeText(relationship.partner_organisation_id)
  const attorneyOrganisationId = ownerOrganisationId === scopedOrganisationId ? partnerOrganisationId : ownerOrganisationId
  if (!attorneyOrganisationId || attorneyOrganisationId === scopedOrganisationId) return null

  const organisation = await maybeSingle(
    client,
    'organisations',
    'id, name, display_name, legal_name, settings_json',
    'id',
    attorneyOrganisationId,
  ).catch((error) => {
    if (['42P01', '42703'].includes(String(error?.code || ''))) return null
    throw error
  })
  const companyName = normalizeText(organisation?.display_name || organisation?.name || organisation?.legal_name)
  if (!companyName) return null

  return {
    preferredPartnerId: normalizeText(relationship.id),
    preferred_partner_id: normalizeText(relationship.id),
    partnerRelationshipId: normalizeText(relationship.id),
    partner_relationship_id: normalizeText(relationship.id),
    partnerOrganisationId: attorneyOrganisationId,
    partner_organisation_id: attorneyOrganisationId,
    companyName,
    company_name: companyName,
    contactPerson: companyName,
    contact_person: companyName,
    email: getOrganisationContactEmail(organisation),
    phone: '',
    selectionSource: 'connected_partner',
    selection_source: 'connected_partner',
  }
}

async function resolveTokenScopedPreferredTransferAttorney(client, listing = {}) {
  const organisationId = normalizeText(listing.organisation_id || listing.organisationId)
  if (!organisationId) return null

  const preferred = await client
    .from('organisation_preferred_partners')
    .select('id, partner_organisation_id, company_name, contact_person, email_address, phone_number, is_preferred_default')
    .eq('organisation_id', organisationId)
    .eq('partner_type', 'transfer_attorney')
    .eq('is_active', true)
    .order('is_preferred_default', { ascending: false })
    .order('company_name', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (preferred.error && !['42P01', '42703', 'PGRST116'].includes(String(preferred.error.code || ''))) {
    throw preferred.error
  }
  const preferredPartnerAttorney = mapPreferredPartnerAttorney(preferred.data)
  if (preferredPartnerAttorney) return preferredPartnerAttorney

  return resolveConnectedTransferAttorney(client, organisationId)
}

async function enrichOnboardingPreferredTransferAttorney(client, onboarding = {}, listing = {}) {
  if (!onboarding?.id) return onboarding
  const formData = onboarding.form_data && typeof onboarding.form_data === 'object' ? onboarding.form_data : {}
  if (hasPreferredTransferAttorney(formData)) return onboarding

  const preferredTransferAttorney = await resolveTokenScopedPreferredTransferAttorney(client, listing)
  if (!preferredTransferAttorney) return onboarding

  return {
    ...onboarding,
    form_data: {
      ...formData,
      transferAttorneyChoice: normalizeText(formData.transferAttorneyChoice || formData.transfer_attorney_choice || 'preferred') || 'preferred',
      transfer_attorney_choice: normalizeText(formData.transfer_attorney_choice || formData.transferAttorneyChoice || 'preferred') || 'preferred',
      preferredTransferAttorney,
      preferred_transfer_attorney: preferredTransferAttorney,
      preferredTransferAttorneyAccepted: false,
      preferredTransferAttorneyAcceptance: null,
    },
  }
}

async function maybeSingle(client, table, select, column, value) {
  const normalizedValue = normalizeText(value)
  if (!normalizedValue) return null
  const { data, error } = await client.from(table).select(select).eq(column, normalizedValue).maybeSingle()
  if (error) throw error
  return data || null
}

function tokenMatchesOnboarding(onboarding = {}, token = '') {
  const normalizedToken = normalizeText(token)
  if (!normalizedToken) return false
  return (
    normalizeText(onboarding.token) === normalizedToken ||
    normalizeText(onboarding.seller_portal_token) === normalizedToken ||
    normalizeText(onboarding.seller_portal_invite_token_hash) === sha256Hex(normalizedToken)
  )
}

function resolveTokenKind(onboarding = {}, token = '') {
  const normalizedToken = normalizeText(token)
  if (normalizeText(onboarding.token) === normalizedToken) return 'legacy'
  if (normalizeText(onboarding.seller_portal_token) === normalizedToken) return 'stable'
  if (normalizeText(onboarding.seller_portal_invite_token_hash) === sha256Hex(normalizedToken)) return 'invite'
  return 'unknown'
}

function isTokenValid(onboarding = {}, tokenKind = 'unknown') {
  if (tokenKind !== 'invite') return tokenKind === 'legacy' || tokenKind === 'stable'
  const inviteExpiresAt = Date.parse(normalizeText(onboarding.seller_portal_invite_expires_at))
  return !onboarding.seller_portal_invite_consumed_at && Number.isFinite(inviteExpiresAt) && inviteExpiresAt > Date.now()
}

async function resolveSellerOnboarding(client, token = '', { onboardingId = '', listingId = '' } = {}) {
  const normalizedToken = normalizeText(token)
  const normalizedOnboardingId = normalizeText(onboardingId)
  const normalizedListingId = normalizeText(listingId)
  if (!normalizedToken) return null

  if (normalizedOnboardingId) {
    const onboarding = await maybeSingle(
      client,
      'private_listing_seller_onboarding',
      ONBOARDING_CORE_COLUMNS,
      'id',
      normalizedOnboardingId,
    )
    if (!onboarding || !tokenMatchesOnboarding(onboarding, normalizedToken)) return null
    if (normalizedListingId && normalizeText(onboarding.private_listing_id) !== normalizedListingId) return null
    const tokenKind = resolveTokenKind(onboarding, normalizedToken)
    return { onboarding, tokenKind, tokenValid: isTokenValid(onboarding, tokenKind) }
  }

  const legacy = await maybeSingle(client, 'private_listing_seller_onboarding', ONBOARDING_CORE_COLUMNS, 'token', normalizedToken)
  if (legacy) return { onboarding: legacy, tokenKind: 'legacy', tokenValid: true }

  const stable = await maybeSingle(client, 'private_listing_seller_onboarding', ONBOARDING_CORE_COLUMNS, 'seller_portal_token', normalizedToken)
  if (stable) return { onboarding: stable, tokenKind: 'stable', tokenValid: true }

  const invite = await maybeSingle(
    client,
    'private_listing_seller_onboarding',
    ONBOARDING_CORE_COLUMNS,
    'seller_portal_invite_token_hash',
    sha256Hex(normalizedToken),
  )
  if (!invite) return null

  return { onboarding: invite, tokenKind: 'invite', tokenValid: isTokenValid(invite, 'invite') }
}

async function resolveTransaction(client, listing = {}) {
  const listingId = normalizeText(listing.id)
  if (!listingId) return null

  const direct = await maybeSingle(
    client,
    'transactions',
    'id, listing_id, stage, current_main_stage, lifecycle_state, finance_type, attorney, assigned_attorney_email, bond_originator, assigned_bond_originator_email, assigned_agent, assigned_agent_email, created_at, updated_at, completed_at, registered_at, registration_date',
    'listing_id',
    listingId,
  ).catch(() => null)
  if (direct) return direct

  const linkedId = normalizeText(listing.transaction_id || listing.transactionId)
  if (!linkedId) return null
  return maybeSingle(
    client,
    'transactions',
    'id, listing_id, stage, current_main_stage, lifecycle_state, finance_type, attorney, assigned_attorney_email, bond_originator, assigned_bond_originator_email, assigned_agent, assigned_agent_email, created_at, updated_at, completed_at, registered_at, registration_date',
    'id',
    linkedId,
  ).catch(() => null)
}

export async function createSellerOnboardingCoreResponse({ method = 'GET', url = '', headers = {} } = {}) {
  const normalizedMethod = normalizeMethod(method)

  if (normalizedMethod === 'OPTIONS') {
    return {
      status: 204,
      headers: {
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
      },
      body: null,
    }
  }

  const isHeadRequest = normalizedMethod === 'HEAD'
  if (!['GET', 'HEAD'].includes(normalizedMethod)) {
    return buildJsonResponse(405, {
      error: 'method_not_allowed',
      message: 'Seller onboarding core only supports GET.',
    })
  }

  try {
    const requestUrl = getRequestUrl(url, headers)
    const token = normalizeText(requestUrl.searchParams.get('token'))
    const onboardingId = normalizeText(requestUrl.searchParams.get('onboardingId'))
    const listingId = normalizeText(requestUrl.searchParams.get('listingId'))
    if (!token) {
      return buildJsonResponse(400, {
        error: 'missing_token',
        message: 'Seller onboarding token is required.',
      })
    }

    const client = createServiceClient()
    const resolution = await resolveSellerOnboarding(client, token, { onboardingId, listingId })
    if (!resolution?.onboarding || !resolution.tokenValid) {
      return buildJsonResponse(404, {
        error: 'seller_onboarding_not_found',
        message: 'Seller onboarding link is invalid or inactive.',
      })
    }

    const onboarding = resolution.onboarding
    const listing = await maybeSingle(client, 'private_listings', '*', 'id', onboarding.private_listing_id)
    if (!listing || !isActiveSellerPortalLink(onboarding, listing)) {
      return buildJsonResponse(404, {
        error: 'seller_onboarding_inactive',
        message: 'Seller onboarding link is invalid or inactive.',
      })
    }

    const enrichedOnboarding = await enrichOnboardingPreferredTransferAttorney(client, onboarding, listing)
    const transaction = await resolveTransaction(client, listing)
    const body = {
      listing,
      onboarding: publicOnboardingRow(enrichedOnboarding),
      transaction,
      requirements: [],
      documents: [],
      appointments: [],
      mandatePacket: null,
      corePayload: true,
      tokenKind: resolution.tokenKind,
      stablePortalToken: enrichedOnboarding.seller_portal_token || null,
      stablePortalPath: enrichedOnboarding.seller_portal_token ? `/client/${enrichedOnboarding.seller_portal_token}/selling` : null,
      portalAccess: {
        passwordSet: Boolean(enrichedOnboarding.seller_portal_password_hash),
        accessGranted: true,
        expiresAt: enrichedOnboarding.seller_portal_access_token_expires_at || null,
        portalLinkExpiresAt: enrichedOnboarding.seller_portal_link_expires_at || null,
        tokenKind: resolution.tokenKind,
        stablePortalToken: enrichedOnboarding.seller_portal_token || null,
        stablePortalPath: enrichedOnboarding.seller_portal_token ? `/client/${enrichedOnboarding.seller_portal_token}/selling` : null,
      },
    }

    return buildJsonResponse(200, isHeadRequest ? null : body)
  } catch (error) {
    const status = Number(error?.status || 500)
    return buildJsonResponse(status, {
      error: error?.code || 'seller_onboarding_core_error',
      message: status >= 500 ? 'Seller onboarding could not be loaded.' : error?.message || 'Seller onboarding access failed.',
    })
  }
}
