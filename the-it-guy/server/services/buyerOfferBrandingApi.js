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
  const vercelProductionEnvPath = new URL('../../.vercel/.env.production.local', import.meta.url)
  const processEnvSource = globalThis?.process?.env || {}
  const processEnv = Object.fromEntries(Object.entries(processEnvSource).map(([key, value]) => [key, normalizeText(value)]))
  const merged = {
    ...parseEnvFile(rootEnvPath),
    ...parseEnvFile(productionEnvPath),
    ...parseEnvFile(stagingEnvPath),
    ...parseEnvFile(vercelProductionEnvPath),
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
    const error = new Error('Buyer offer branding backend is not configured.')
    error.code = 'buyer_offer_branding_unconfigured'
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
  return new URL(url || '/api/public/buyer-offer-branding', `${protocol}://${host}`)
}

function isUuidLike(value = '') {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalizeText(value))
}

function buyerOfferLinkIsActive(offer = {}) {
  const status = normalizeText(offer.status).toLowerCase()
  if (['expired', 'withdrawn', 'rejected', 'converted_to_transaction', 'cancelled', 'canceled', 'deleted'].includes(status)) return false

  const expiresAt = Date.parse(normalizeText(offer.expiry_date || offer.expires_at))
  if (Number.isFinite(expiresAt) && expiresAt <= Date.now()) return false

  return Boolean(normalizeText(offer.organisation_id))
}

function isMissingColumnError(error, columnName = '') {
  if (!error) return false
  const message = normalizeText(error.message).toLowerCase()
  return (
    error.code === '42703' ||
    error.code === 'PGRST204' ||
    (message.includes('column') && message.includes(normalizeText(columnName).toLowerCase()))
  )
}

async function findOfferByToken(client, token = '') {
  const normalizedToken = normalizeText(token)
  if (!normalizedToken) return null

  let query = client
    .from('offers')
    .select('id, organisation_id, offer_token, status, expiry_date, conditions_json')

  if (isUuidLike(normalizedToken)) {
    query = query.or(`id.eq.${normalizedToken},offer_token.eq.${normalizedToken}`)
  } else {
    query = query.eq('offer_token', normalizedToken)
  }

  const { data, error } = await query.maybeSingle()
  if (error) throw error
  return data || null
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

async function fetchOrganisationBrandingRow(client, organisationId = '') {
  const normalizedOrganisationId = normalizeText(organisationId)
  if (!normalizedOrganisationId) return {}

  let brandingQuery = await client
    .from('organisation_branding')
    .select('organisation_id, organisation_display_name, logo_light_url, logo_dark_url, logo_icon_url, primary_brand_color, secondary_brand_color, accent_brand_color')
    .eq('organisation_id', normalizedOrganisationId)
    .maybeSingle()

  if (
    brandingQuery.error &&
    (
      isMissingColumnError(brandingQuery.error, 'organisation_display_name') ||
      isMissingColumnError(brandingQuery.error, 'logo_icon_url') ||
      isMissingColumnError(brandingQuery.error, 'primary_brand_color') ||
      isMissingColumnError(brandingQuery.error, 'secondary_brand_color') ||
      isMissingColumnError(brandingQuery.error, 'accent_brand_color')
    )
  ) {
    brandingQuery = await client
      .from('organisation_branding')
      .select('organisation_id, logo_light_url, logo_dark_url, primary_color, secondary_color, metadata_json')
      .eq('organisation_id', normalizedOrganisationId)
      .maybeSingle()
  }

  if (brandingQuery.error) throw brandingQuery.error
  return brandingQuery.data || {}
}

async function resolveBuyerOfferBranding(client, organisationId = '', offer = {}) {
  const normalizedOrganisationId = normalizeText(organisationId)
  if (!normalizedOrganisationId) return null

  const [organisationResult, settingsResult, organisationBranding] = await Promise.all([
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
    fetchOrganisationBrandingRow(client, normalizedOrganisationId).catch(() => ({})),
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
    organisationBranding,
    settingsBranding,
    settings,
    {
      organisationName: normalizeText(agencyInformation.tradingName || agencyInformation.agencyName),
    },
    organisation,
    offer?.conditions_json || {},
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

  if (!organisationName && !logoUrl && !resolved.primaryColour && !resolved.accentColour) return null

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

export async function createBuyerOfferBrandingResponse({ method = 'GET', url = '', headers = {} } = {}) {
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
      message: 'Buyer offer branding only supports GET.',
    })
  }

  try {
    const requestUrl = getRequestUrl(url, headers)
    const token = normalizeText(requestUrl.searchParams.get('token'))
    if (!token) {
      return buildJsonResponse(400, {
        error: 'token_required',
        message: 'Buyer offer token is required.',
      })
    }

    const client = createServiceClient()
    const offer = await findOfferByToken(client, token)
    if (!offer || !buyerOfferLinkIsActive(offer)) {
      return buildJsonResponse(404, {
        error: 'buyer_offer_not_found',
        message: 'Buyer offer link is invalid or inactive.',
      })
    }

    const branding = await resolveBuyerOfferBranding(client, offer.organisation_id, offer)
    if (!branding) {
      return buildJsonResponse(404, {
        error: 'buyer_offer_branding_not_found',
        message: 'Buyer offer branding is not configured.',
      })
    }

    return buildJsonResponse(200, isHeadRequest ? null : { branding })
  } catch (error) {
    const status = Number(error?.status || error?.statusCode || 500)
    return buildJsonResponse(status, {
      error: error?.code || 'buyer_offer_branding_error',
      message: status >= 500 ? 'Buyer offer branding could not be loaded.' : error?.message || 'Buyer offer branding request failed.',
    })
  }
}
