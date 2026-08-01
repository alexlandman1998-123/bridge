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

    const transaction = await resolveTransaction(client, listing)
    const body = {
      listing,
      onboarding: publicOnboardingRow(onboarding),
      transaction,
      requirements: [],
      documents: [],
      appointments: [],
      mandatePacket: null,
      corePayload: true,
      tokenKind: resolution.tokenKind,
      stablePortalToken: onboarding.seller_portal_token || null,
      stablePortalPath: onboarding.seller_portal_token ? `/client/${onboarding.seller_portal_token}/selling` : null,
      portalAccess: {
        passwordSet: Boolean(onboarding.seller_portal_password_hash),
        accessGranted: true,
        expiresAt: onboarding.seller_portal_access_token_expires_at || null,
        portalLinkExpiresAt: onboarding.seller_portal_link_expires_at || null,
        tokenKind: resolution.tokenKind,
        stablePortalToken: onboarding.seller_portal_token || null,
        stablePortalPath: onboarding.seller_portal_token ? `/client/${onboarding.seller_portal_token}/selling` : null,
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
