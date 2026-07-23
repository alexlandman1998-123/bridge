import { createHash } from 'node:crypto'
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { resolveOnboardingBranding } from '../../src/lib/onboardingBranding.js'

let cachedRuntimeEnv = null

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

function createServiceClient() {
  const env = getRuntimeEnv()
  const supabaseUrl = normalizeText(env.SUPABASE_URL || env.VITE_SUPABASE_URL)
  const serviceRoleKey = normalizeText(env.SUPABASE_SERVICE_ROLE_KEY)

  if (!supabaseUrl || !serviceRoleKey) {
    const error = new Error('Seller onboarding branding backend is not configured.')
    error.code = 'seller_onboarding_branding_unconfigured'
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
  return new URL(url || '/api/public/seller-onboarding-branding', `${protocol}://${host}`)
}

function sha256Hex(value = '') {
  return createHash('sha256').update(value).digest('hex')
}

function sellerPortalLinkIsActive(onboarding = {}, listing = {}) {
  const linkActive = onboarding.seller_portal_link_active !== false
  if (!linkActive) return false

  const expiresAt = Date.parse(normalizeText(onboarding.seller_portal_link_expires_at))
  if (Number.isFinite(expiresAt) && expiresAt <= Date.now()) return false

  if (normalizeText(listing.deleted_at)) return false

  const listingStatus = normalizeText(listing.listing_status || listing.status).toLowerCase()
  if (['withdrawn', 'cancelled', 'canceled', 'deleted', 'archived', 'closed'].includes(listingStatus)) return false

  const listingVisibility = normalizeText(listing.listing_visibility).toLowerCase()
  if (['withdrawn', 'deleted', 'archived'].includes(listingVisibility)) return false

  return true
}

async function findOnboardingByPortalToken(client, token = '') {
  const normalizedToken = normalizeText(token)
  if (!normalizedToken) return null

  const tokenHash = sha256Hex(normalizedToken)
  const candidateQueries = [
    client
      .from('private_listing_seller_onboarding')
      .select('*')
      .eq('seller_portal_token', normalizedToken)
      .maybeSingle(),
    client
      .from('private_listing_seller_onboarding')
      .select('*')
      .eq('token', normalizedToken)
      .maybeSingle(),
    client
      .from('private_listing_seller_onboarding')
      .select('*')
      .eq('seller_portal_invite_token_hash', tokenHash)
      .maybeSingle(),
  ]

  for (const query of candidateQueries) {
    const { data, error } = await query
    if (error) throw error
    if (!data) continue
    if (data.seller_portal_invite_token_hash === tokenHash) {
      const inviteExpiresAt = Date.parse(normalizeText(data.seller_portal_invite_expires_at))
      if (data.seller_portal_invite_consumed_at) return null
      if (!Number.isFinite(inviteExpiresAt) || inviteExpiresAt <= Date.now()) return null
    }
    return data
  }

  return null
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

async function resolveSellerBranding(client, organisationId = '') {
  const normalizedOrganisationId = normalizeText(organisationId)
  if (!normalizedOrganisationId) return null

  const [organisationResult, settingsResult] = await Promise.all([
    client
      .from('organisations')
      .select('id, name, display_name, logo_url')
      .eq('id', normalizedOrganisationId)
      .maybeSingle(),
    client
      .from('organisation_settings')
      .select('settings_json')
      .eq('organisation_id', normalizedOrganisationId)
      .maybeSingle(),
  ])

  if (organisationResult.error) throw organisationResult.error
  if (settingsResult.error) throw settingsResult.error

  const organisation = organisationResult.data || {}
  const settings = settingsResult.data?.settings_json && typeof settingsResult.data.settings_json === 'object'
    ? settingsResult.data.settings_json
    : {}
  const onboarding = settings.agencyOnboarding && typeof settings.agencyOnboarding === 'object'
    ? settings.agencyOnboarding
    : {}
  const agencyInformation = onboarding.agencyInformation && typeof onboarding.agencyInformation === 'object'
    ? onboarding.agencyInformation
    : {}
  const branding = onboarding.branding && typeof onboarding.branding === 'object' ? onboarding.branding : {}
  const settingsBranding = settings.branding && typeof settings.branding === 'object' ? settings.branding : {}
  const resolved = resolveOnboardingBranding(
    branding,
    settingsBranding,
    {
      organisationName: normalizeText(agencyInformation.tradingName || agencyInformation.agencyName),
    },
    organisation,
  )

  const logoLightUrl = await resolveStorageAssetUrl(client, {
    bucket: branding.logoLightBucket,
    path: branding.logoLightPath,
    fallbackUrl: resolved.logoLightUrl,
  })
  const logoDarkUrl = await resolveStorageAssetUrl(client, {
    bucket: branding.logoDarkBucket,
    path: branding.logoDarkPath,
    fallbackUrl: resolved.logoDarkUrl,
  })
  const logoIconUrl = await resolveStorageAssetUrl(client, {
    bucket: branding.logoIconBucket || branding.portalIconBucket || branding.mobileIconBucket,
    path: branding.logoIconPath || branding.portalIconPath || branding.mobileIconPath,
    fallbackUrl: resolved.logoIconUrl,
  })
  const logoUrl = normalizeText(logoDarkUrl || logoLightUrl || logoIconUrl)
  const organisationName = normalizeText(
    resolved.organisationName ||
      agencyInformation.tradingName ||
      agencyInformation.agencyName ||
      organisation.display_name ||
      organisation.name,
  )

  if (!organisationName && !logoUrl) return null

  return {
    organisationId: normalizedOrganisationId,
    organisationName,
    agencyName: organisationName,
    logoUrl,
    logoDarkUrl,
    logoLightUrl,
    logoIconUrl,
    logoDark: logoDarkUrl,
    logoLight: logoLightUrl,
    primaryColour: resolved.primaryColour,
    secondaryColour: resolved.secondaryColour,
    accentColour: resolved.accentColour,
  }
}

export async function createSellerOnboardingBrandingResponse({ method = 'GET', url = '', headers = {} } = {}) {
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
  if (normalizedMethod !== 'GET' && !isHeadRequest) {
    return buildJsonResponse(405, {
      error: 'method_not_allowed',
      message: 'Seller onboarding branding only supports GET.',
    })
  }

  try {
    const requestUrl = getRequestUrl(url, headers)
    const token = normalizeText(requestUrl.searchParams.get('token'))
    if (!token) {
      return buildJsonResponse(400, {
        error: 'token_required',
        message: 'Seller onboarding token is required.',
      })
    }

    const client = createServiceClient()
    const onboarding = await findOnboardingByPortalToken(client, token)
    if (!onboarding?.private_listing_id) {
      return buildJsonResponse(404, {
        error: 'seller_onboarding_not_found',
        message: 'Seller onboarding link is invalid or inactive.',
      })
    }

    const listingResult = await client
      .from('private_listings')
      .select('id, organisation_id, listing_status, status, listing_visibility, seller_lead_id, deleted_at')
      .eq('id', onboarding.private_listing_id)
      .maybeSingle()
    if (listingResult.error) throw listingResult.error
    if (!listingResult.data || !sellerPortalLinkIsActive(onboarding, listingResult.data)) {
      return buildJsonResponse(404, {
        error: 'seller_onboarding_not_found',
        message: 'Seller onboarding link is invalid or inactive.',
      })
    }

    const branding = await resolveSellerBranding(client, listingResult.data.organisation_id)
    if (!branding) {
      return buildJsonResponse(404, {
        error: 'seller_onboarding_branding_not_found',
        message: 'Seller onboarding branding is not configured.',
      })
    }

    return buildJsonResponse(200, isHeadRequest ? null : { branding })
  } catch (error) {
    const status = Number(error?.status || error?.statusCode || 500)
    return buildJsonResponse(status, {
      error: error?.code || 'seller_onboarding_branding_error',
      message: status >= 500 ? 'Seller onboarding branding could not be loaded.' : error?.message || 'Seller onboarding branding request failed.',
    })
  }
}

