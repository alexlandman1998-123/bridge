import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { writeNodeJsonResponse } from '../services/hqMissionControlApi.js'
import {
  normalizePrivatePropertyText,
  summarizePrivatePropertySoapResponse,
} from '../services/privatePropertyClient.js'
import {
  buildPrivatePropertyGoLiveReadinessReport,
} from '../services/privatePropertyGoLiveReadinessService.js'
import {
  runPrivatePropertyControlledPublishRehearsal,
} from '../services/privatePropertyControlledPublishService.js'
import {
  runPrivatePropertyPostSubmitMonitor,
} from '../services/privatePropertyPostSubmitMonitorService.js'
import {
  PRIVATE_PROPERTY_API_BASE_PATH,
  PRIVATE_PROPERTY_API_METHODS,
} from './apiContract.js'

const appRoot = fileURLToPath(new URL('../..', import.meta.url))
let cachedRuntimeEnv = null

function normalizeMethod(value = '') {
  return normalizePrivatePropertyText(value || 'GET').toUpperCase()
}

function normalizeKey(value = '') {
  return normalizePrivatePropertyText(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function normalizeEnvironment(value = '') {
  return normalizeKey(value) === 'production' ? 'production' : 'sandbox'
}

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {}
  return Object.fromEntries(
    fs
      .readFileSync(filePath, 'utf8')
      .split(/\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const separator = line.indexOf('=')
        if (separator === -1) return [line, '']
        return [line.slice(0, separator), line.slice(separator + 1).replace(/^["']|["']$/g, '')]
      }),
  )
}

function getRuntimeEnv() {
  if (cachedRuntimeEnv) return cachedRuntimeEnv
  const files = ['.env', '.env.local', '.env.production.local', '.env.private-property.local']
  const fromFiles = files.reduce((merged, file) => ({ ...merged, ...parseEnvFile(path.join(appRoot, file)) }), {})
  const processOverrides = Object.fromEntries(
    Object.entries(process.env).filter(([, value]) => normalizePrivatePropertyText(value)),
  )
  cachedRuntimeEnv = { ...fromFiles, ...processOverrides }
  return cachedRuntimeEnv
}

function normalizeBoolean(value, fallback = false) {
  if (typeof value === 'boolean') return value
  const key = normalizeKey(value)
  if (['true', '1', 'yes', 'y', 'enabled'].includes(key)) return true
  if (['false', '0', 'no', 'n', 'disabled'].includes(key)) return false
  return fallback
}

function getHeader(headers = {}, name = '') {
  const target = name.toLowerCase()
  const entry = Object.entries(headers || {}).find(([key]) => key.toLowerCase() === target)
  const value = entry?.[1]
  return Array.isArray(value) ? normalizePrivatePropertyText(value[0]) : normalizePrivatePropertyText(value)
}

function getBearerToken(headers = {}) {
  const bearer = getHeader(headers, 'authorization')
  return bearer.startsWith('Bearer ') ? bearer.slice('Bearer '.length).trim() : ''
}

function getRequestUrl(url = '', headers = {}) {
  const host = getHeader(headers, 'host') || 'app.arch9.co.za'
  const protocol = getHeader(headers, 'x-forwarded-proto') || 'https'
  const requestUrl = new URL(url || PRIVATE_PROPERTY_API_BASE_PATH, `${protocol}://${host}`)
  if (!requestUrl.pathname.startsWith(PRIVATE_PROPERTY_API_BASE_PATH)) {
    requestUrl.pathname = `${PRIVATE_PROPERTY_API_BASE_PATH}${requestUrl.pathname.startsWith('/') ? '' : '/'}${requestUrl.pathname}`
  }
  return requestUrl
}

async function readJsonBody(body = null) {
  if (!body) return {}
  if (typeof body === 'object' && !Buffer.isBuffer(body)) return body
  const text = Buffer.isBuffer(body) ? body.toString('utf8') : String(body || '')
  if (!text.trim()) return {}
  try {
    return JSON.parse(text)
  } catch {
    const error = new Error('Request body must be valid JSON.')
    error.code = 'invalid_json'
    error.status = 400
    throw error
  }
}

function buildJsonResponse(status, body, headers = {}) {
  return {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...headers,
    },
    body,
  }
}

function buildOptionsResponse() {
  return {
    status: 204,
    headers: {
      'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Private-Property-Api-Token',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Cache-Control': 'no-store',
    },
    body: null,
  }
}

function firstValue(...values) {
  return values.find((value) => normalizePrivatePropertyText(value))
}

function matchPrivatePropertyRoute(requestUrl, routeParams = {}) {
  const parts = requestUrl.pathname.split('/').filter(Boolean)
  const offset = parts[0] === 'api' && parts[1] === 'private-property' ? 2 : 0
  const routeParts = parts.slice(offset)

  if (routeParts[0] === 'listings' && routeParts[2] === 'preview') {
    return { name: 'previewListing', listingId: normalizePrivatePropertyText(routeParams.listingId || routeParts[1]) }
  }
  if (routeParts[0] === 'listings' && routeParts[2] === 'publish') {
    return { name: 'publishListing', listingId: normalizePrivatePropertyText(routeParams.listingId || routeParts[1]) }
  }
  if (routeParts[0] === 'listings' && routeParts[2] === 'status') {
    return { name: 'listingStatus', listingId: normalizePrivatePropertyText(routeParams.listingId || routeParts[1]) }
  }
  return null
}

function buildPrivatePropertyApiConfig({ env = getRuntimeEnv(), requestUrl, payload = {}, route = {} } = {}) {
  const query = requestUrl?.searchParams || new URLSearchParams()
  return {
    apiInternalToken: normalizePrivatePropertyText(env.PRIVATE_PROPERTY_API_INTERNAL_TOKEN),
    allowUnsafeLocalApi: normalizeBoolean(env.PRIVATE_PROPERTY_API_ALLOW_UNAUTHENTICATED_LOCAL, false),
    supabaseUrl: normalizePrivatePropertyText(env.SUPABASE_URL || env.VITE_SUPABASE_URL),
    serviceRoleKey: normalizePrivatePropertyText(env.SUPABASE_SERVICE_ROLE_KEY),
    listingId: normalizePrivatePropertyText(route.listingId || payload.listingId || query.get('listingId')),
    environment: normalizeEnvironment(firstValue(payload.environment, query.get('environment'), env.PRIVATE_PROPERTY_ENVIRONMENT, env.PRIVATE_PROPERTY_ENV, 'sandbox')),
    continuationKey: normalizePrivatePropertyText(firstValue(payload.continuationKey, query.get('continuationKey'), '0')),
    startDateTime: normalizePrivatePropertyText(firstValue(payload.startDateTime, query.get('startDateTime'))),
    confirmation: normalizePrivatePropertyText(firstValue(payload.confirm, payload.confirmation, query.get('confirm'), query.get('confirmation'))),
    recordSync: normalizeBoolean(payload.recordSync ?? query.get('recordSync'), true),
    overrides: {
      agentIds: normalizePrivatePropertyText(firstValue(payload.agentIds, payload.agentId, query.get('agentIds'), query.get('agentId'))),
      propertyId: normalizePrivatePropertyText(firstValue(payload.propertyId, query.get('propertyId'))),
      suburbId: normalizePrivatePropertyText(firstValue(payload.suburbId, query.get('suburbId'), env.PRIVATE_PROPERTY_DEFAULT_SUBURB_ID)),
      streetName: normalizePrivatePropertyText(firstValue(payload.streetName, query.get('streetName'))),
      streetNumber: normalizePrivatePropertyText(firstValue(payload.streetNumber, query.get('streetNumber'))),
      complexName: normalizePrivatePropertyText(firstValue(payload.complexName, query.get('complexName'))),
      unitNumber: normalizePrivatePropertyText(firstValue(payload.unitNumber, query.get('unitNumber'))),
      town: normalizePrivatePropertyText(firstValue(payload.town, query.get('town'))),
      province: normalizePrivatePropertyText(firstValue(payload.province, query.get('province'))),
      category: normalizePrivatePropertyText(firstValue(payload.category, query.get('category'))),
      listingType: normalizePrivatePropertyText(firstValue(payload.listingType, query.get('listingType'))),
      mandateType: normalizePrivatePropertyText(firstValue(payload.mandateType, query.get('mandateType'))),
      price: normalizePrivatePropertyText(firstValue(payload.price, query.get('price'))),
      rentalPriceType: normalizePrivatePropertyText(firstValue(payload.rentalPriceType, query.get('rentalPriceType'))),
      availableFrom: normalizePrivatePropertyText(firstValue(payload.availableFrom, query.get('availableFrom'))),
      listingDate: normalizePrivatePropertyText(firstValue(payload.listingDate, query.get('listingDate'))),
      soleMandateExclusiveDays: normalizePrivatePropertyText(firstValue(payload.soleMandateExclusiveDays, payload.exclusiveDays, query.get('exclusiveDays'))),
      farmName: normalizePrivatePropertyText(firstValue(payload.farmName, query.get('farmName'))),
      showdayEvents: normalizePrivatePropertyText(firstValue(payload.showdayEvents, query.get('showdayEvents'))),
    },
  }
}

function getMissingConfiguration(config = {}, needs = {}) {
  const missing = []
  if (needs.apiToken && !config.apiInternalToken && !config.allowUnsafeLocalApi) missing.push('PRIVATE_PROPERTY_API_INTERNAL_TOKEN')
  if (needs.supabase && !config.supabaseUrl) missing.push('SUPABASE_URL or VITE_SUPABASE_URL')
  if (needs.supabase && !config.serviceRoleKey) missing.push('SUPABASE_SERVICE_ROLE_KEY')
  if (needs.listing && !config.listingId) missing.push('listingId')
  return missing
}

function canUseBrowserPrivatePropertyListingAuth({ headers = {}, config = {}, route = {} } = {}) {
  return ['previewListing', 'publishListing', 'listingStatus'].includes(route?.name) &&
    Boolean(getBearerToken(headers) && config.supabaseUrl && config.serviceRoleKey)
}

function hasInternalPrivatePropertyApiAuth({ headers = {}, config = {} } = {}) {
  if (config.allowUnsafeLocalApi && !config.apiInternalToken) return true
  if (!config.apiInternalToken) return false
  const bearer = getHeader(headers, 'authorization')
  const token = getHeader(headers, 'x-private-property-api-token')
  return bearer === `Bearer ${config.apiInternalToken}` || token === config.apiInternalToken
}

function getAuthFailure({ headers = {}, config = {}, route = {} } = {}) {
  if (hasInternalPrivatePropertyApiAuth({ headers, config })) return null
  if (canUseBrowserPrivatePropertyListingAuth({ headers, config, route })) return null

  if (!config.apiInternalToken) {
    return buildJsonResponse(503, {
      error: 'private_property_api_token_not_configured',
      message: 'Set PRIVATE_PROPERTY_API_INTERNAL_TOKEN before using the Private Property API routes.',
    })
  }

  return buildJsonResponse(401, {
    error: 'unauthorized',
    message: 'Private Property API token is missing or invalid.',
  })
}

function hasPrivatePropertyPublishRole(row = {}) {
  const role = normalizeKey(row.workspace_role || row.organisation_role || row.organization_role || row.role)
  const status = normalizeKey(row.membership_status || row.status)
  if (!['active', 'accepted', 'approved'].includes(status)) return false
  return ['principal', 'owner', 'admin', 'manager', 'branch_manager', 'agency_principal', 'agent', 'estate_agent', 'sales_agent'].includes(role)
}

function hasPrivatePropertyAdminPublishRole(row = {}) {
  const role = normalizeKey(row.workspace_role || row.organisation_role || row.organization_role || row.role)
  return ['principal', 'owner', 'admin', 'manager', 'branch_manager', 'agency_principal'].includes(role)
}

async function fetchMaybeSingle(query) {
  if (typeof query.maybeSingle === 'function') return query.maybeSingle()
  return query.single()
}

async function authenticateBrowserPrivatePropertyListingRequest({ supabase, headers = {}, config = {} } = {}) {
  if (hasInternalPrivatePropertyApiAuth({ headers, config })) return null

  const token = getBearerToken(headers)
  if (!token) {
    return buildJsonResponse(401, {
      error: 'unauthorized',
      message: 'Sign in before publishing to Private Property.',
    })
  }

  const userResult = await supabase.auth.getUser(token)
  const user = userResult.data?.user
  if (userResult.error || !user?.id) {
    return buildJsonResponse(401, {
      error: 'unauthorized',
      message: 'Your session could not be verified.',
    })
  }

  const listingResult = await fetchMaybeSingle(
    supabase
      .from('private_listings')
      .select('id, organisation_id, assigned_agent_id, assigned_agent_email, created_by')
      .eq('id', config.listingId),
  )
  if (listingResult.error && listingResult.error.code !== 'PGRST116') throw listingResult.error
  const listing = listingResult.data
  if (!listing?.organisation_id) {
    return buildJsonResponse(404, {
      error: 'listing_not_found',
      message: 'This listing could not be found for Private Property publishing.',
    })
  }

  const membership = await supabase
    .from('organisation_users')
    .select('id, user_id, email, role, workspace_role, organisation_role, organization_role, status, membership_status')
    .eq('organisation_id', listing.organisation_id)
    .or(`user_id.eq.${user.id},email.eq.${user.email || ''}`)
    .limit(5)

  if (membership.error) throw membership.error
  const memberships = membership.data || []
  const activeMembership = memberships.find(hasPrivatePropertyPublishRole)
  if (!activeMembership) {
    return buildJsonResponse(403, {
      error: 'forbidden',
      message: 'You need agency access before publishing this listing to Private Property.',
    })
  }

  const userEmail = normalizePrivatePropertyText(user.email || activeMembership.email).toLowerCase()
  const ownsListing = listing.assigned_agent_id === user.id ||
    listing.created_by === user.id ||
    normalizePrivatePropertyText(listing.assigned_agent_email).toLowerCase() === userEmail
  if (!ownsListing && !memberships.some(hasPrivatePropertyAdminPublishRole)) {
    return buildJsonResponse(403, {
      error: 'forbidden',
      message: 'Only the assigned agent or an agency admin can publish this listing to Private Property.',
    })
  }

  return null
}

function createSupabaseFromConfig(config = {}) {
  return createSupabaseClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  })
}

function toPublicPreview(preview = {}) {
  return {
    canPreview: Boolean(preview.canPreview),
    canSubmit: Boolean(preview.canPreview),
    dataBlockers: preview.dataBlockers || [],
    technicalBlockers: preview.technicalBlockers || [],
    summary: preview.summary || {},
    payloadPreview: preview.payloadPreview || null,
  }
}

function buildErrorResponse(error, fallbackCode = 'private_property_api_error') {
  const status = Number(error?.status || 500)
  return buildJsonResponse(status, {
    error: error?.code || fallbackCode,
    message: error?.message || 'Private Property API request failed.',
    httpStatus: error?.status || null,
    response: error?.responseBody ? summarizePrivatePropertySoapResponse(error.method || 'PrivatePropertyApi', error.responseBody) : null,
  })
}

export async function createPrivatePropertyApiResponse({
  method = 'GET',
  url = '',
  headers = {},
  body = null,
  routeParams = {},
  env,
  dependencies = {},
} = {}) {
  const normalizedMethod = normalizeMethod(method)
  if (normalizedMethod === 'OPTIONS') return buildOptionsResponse()

  const requestUrl = getRequestUrl(url, headers)
  const route = matchPrivatePropertyRoute(requestUrl, routeParams)
  if (!route) {
    return buildJsonResponse(404, {
      error: 'not_found',
      message: 'Private Property API route was not found.',
    })
  }

  const expectedMethod = PRIVATE_PROPERTY_API_METHODS[route.name]
  if (normalizedMethod !== expectedMethod) {
    return buildJsonResponse(405, {
      error: 'method_not_allowed',
      message: `${route.name} only supports ${expectedMethod}.`,
    })
  }

  try {
    const payload = await readJsonBody(body)
    const config = buildPrivatePropertyApiConfig({ env: env || getRuntimeEnv(), requestUrl, payload, route })
    const authFailure = getAuthFailure({ headers, config, route })
    if (authFailure) return authFailure

    const missing = getMissingConfiguration(config, {
      apiToken: !canUseBrowserPrivatePropertyListingAuth({ headers, config, route }),
      supabase: true,
      listing: true,
    })
    if (missing.length) return buildJsonResponse(400, { error: 'missing_configuration', missingConfiguration: missing })

    const createSupabase = dependencies.createSupabase || createSupabaseFromConfig
    const buildReadiness = dependencies.buildReadiness || buildPrivatePropertyGoLiveReadinessReport
    const runControlledPublish = dependencies.runControlledPublish || runPrivatePropertyControlledPublishRehearsal
    const runPostSubmitMonitor = dependencies.runPostSubmitMonitor || runPrivatePropertyPostSubmitMonitor
    const supabase = createSupabase(config)
    const browserAuthFailure = await authenticateBrowserPrivatePropertyListingRequest({ supabase, headers, config })
    if (browserAuthFailure) return browserAuthFailure

    if (route.name === 'previewListing') {
      const readiness = await buildReadiness({
        client: supabase,
        listingId: config.listingId,
        environment: config.environment,
        secrets: env || getRuntimeEnv(),
        overrides: config.overrides,
      })
      return buildJsonResponse(200, {
        route: route.name,
        status: readiness.status,
        ready: readiness.ready,
        listingId: config.listingId,
        preview: toPublicPreview(readiness.preview),
        readiness,
        report: readiness,
      })
    }

    if (route.name === 'publishListing') {
      const report = await runControlledPublish({
        client: supabase,
        listingId: config.listingId,
        environment: config.environment,
        secrets: env || getRuntimeEnv(),
        overrides: config.overrides,
        apply: true,
        recordSync: true,
        confirmation: config.confirmation,
      })
      return buildJsonResponse(report.status === 'BLOCKED' ? 422 : 200, {
        route: route.name,
        status: report.status,
        listingId: config.listingId,
        report,
      })
    }

    if (route.name === 'listingStatus') {
      const monitor = await runPostSubmitMonitor({
        client: supabase,
        listingId: config.listingId,
        environment: config.environment,
        secrets: env || getRuntimeEnv(),
        overrides: config.overrides,
        continuationKey: config.continuationKey,
        startDateTime: config.startDateTime,
        recordSync: config.recordSync,
      })
      return buildJsonResponse(monitor.status === 'BLOCKED' ? 422 : 200, {
        route: route.name,
        status: monitor.status,
        listingId: config.listingId,
        monitor,
        report: monitor,
      })
    }

    return buildJsonResponse(404, { error: 'not_found', message: 'Private Property API route was not found.' })
  } catch (error) {
    return buildErrorResponse(error)
  }
}

export async function readNodeRequestBody(request) {
  const method = normalizeMethod(request.method)
  if (!['POST', 'PUT', 'PATCH'].includes(method)) return null
  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
  return chunks.length ? Buffer.concat(chunks).toString('utf8') : null
}

export async function handlePrivatePropertyNodeRequest(request, response, routeParams = {}) {
  const body = await readNodeRequestBody(request)
  const payload = await createPrivatePropertyApiResponse({
    method: request.method,
    url: request.url,
    headers: request.headers,
    body,
    routeParams,
  })
  writeNodeJsonResponse(response, payload)
}

export { buildPrivatePropertyApiConfig, writeNodeJsonResponse }
