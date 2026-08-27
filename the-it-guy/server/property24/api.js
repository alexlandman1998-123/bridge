import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { writeNodeJsonResponse } from '../services/hqMissionControlApi.js'
import {
  PROPERTY24_API_BASE_PATH,
  PROPERTY24_API_METHODS,
} from './apiContract.js'
import {
  PROPERTY24_EXDEV_BASE_URL,
  createProperty24Client,
  normalizeProperty24Text,
  summarizeProperty24Payload,
} from './client.js'
import {
  applyProperty24ListingPublish,
  buildProperty24RentalListingSubmitPlan,
  buildProperty24ListingSubmitPlan,
  createProperty24PublishReport,
  resolveProperty24ListingPublishConfiguration,
  resolveProperty24Environment,
} from './publishService.js'
import {
  applyControlledProperty24ListingPublish,
  applyControlledProperty24StatusUpdate,
  buildProperty24LifecycleState,
} from './workflowService.js'
import {
  fetchProperty24Leads,
  fetchProperty24ListingLeads,
} from './leadService.js'
import {
  runProperty24ReconciliationJob,
} from './reconciliationService.js'
import {
  importProperty24ListingLeadPayload,
  pullAndImportProperty24Leads,
} from './leadImportService.js'
import {
  recordProperty24ListingSync,
} from '../services/property24ListingSyncService.js'

const appRoot = fileURLToPath(new URL('../..', import.meta.url))
let cachedRuntimeEnv = null

function normalizeMethod(value = '') {
  return normalizeProperty24Text(value || 'GET').toUpperCase()
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
  const files = ['.env', '.env.local', '.env.production.local', '.env.staging.local', '.env.property24.local']
  const fromFiles = files.reduce((merged, file) => ({ ...merged, ...parseEnvFile(path.join(appRoot, file)) }), {})
  const processOverrides = Object.fromEntries(
    Object.entries(process.env).filter(([, value]) => normalizeProperty24Text(value)),
  )
  cachedRuntimeEnv = { ...fromFiles, ...processOverrides }
  return cachedRuntimeEnv
}

function getHeader(headers = {}, name = '') {
  const target = name.toLowerCase()
  const entry = Object.entries(headers || {}).find(([key]) => key.toLowerCase() === target)
  const value = entry?.[1]
  return Array.isArray(value) ? normalizeProperty24Text(value[0]) : normalizeProperty24Text(value)
}

function getRequestUrl(url = '', headers = {}) {
  const host = getHeader(headers, 'host') || 'app.arch9.co.za'
  const protocol = getHeader(headers, 'x-forwarded-proto') || 'https'
  const requestUrl = new URL(url || PROPERTY24_API_BASE_PATH, `${protocol}://${host}`)
  if (!requestUrl.pathname.startsWith(PROPERTY24_API_BASE_PATH)) {
    requestUrl.pathname = `${PROPERTY24_API_BASE_PATH}${requestUrl.pathname.startsWith('/') ? '' : '/'}${requestUrl.pathname}`
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
      'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Property24-Api-Token',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Cache-Control': 'no-store',
    },
    body: null,
  }
}

function toPositiveInteger(value, fallback, max = 50) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback
  return Math.min(Math.round(numeric), max)
}

function firstValue(...values) {
  return values.find((value) => normalizeProperty24Text(value))
}

function normalizeBoolean(value, fallback = false) {
  if (typeof value === 'boolean') return value
  const normalized = normalizeProperty24Text(value).toLowerCase()
  if (['true', '1', 'yes', 'y'].includes(normalized)) return true
  if (['false', '0', 'no', 'n'].includes(normalized)) return false
  return fallback
}

function matchProperty24Route(requestUrl, routeParams = {}) {
  const parts = requestUrl.pathname.split('/').filter(Boolean)
  const offset = parts[0] === 'api' && parts[1] === 'property24' ? 2 : 0
  const routeParts = parts.slice(offset)

  if (routeParts[0] === 'listings' && routeParts[2] === 'preview') {
    return { name: 'previewListing', listingId: normalizeProperty24Text(routeParams.listingId || routeParts[1]) }
  }
  if (routeParts[0] === 'rentals' && routeParts[2] === 'preview') {
    return { name: 'previewRentalListing', listingId: normalizeProperty24Text(routeParams.listingId || routeParts[1]) }
  }
  if (routeParts[0] === 'listings' && routeParts[2] === 'publish') {
    return { name: 'publishListing', listingId: normalizeProperty24Text(routeParams.listingId || routeParts[1]) }
  }
  if (routeParts[0] === 'listings' && routeParts[2] === 'lifecycle') {
    return { name: 'listingLifecycle', listingId: normalizeProperty24Text(routeParams.listingId || routeParts[1]) }
  }
  if (routeParts[0] === 'listings' && routeParts[2] === 'status') {
    return { name: 'listingStatus', listingId: normalizeProperty24Text(routeParams.listingId || routeParts[1]) }
  }
  if (routeParts[0] === 'listings' && routeParts[2] === 'status-update') {
    return { name: 'updateListingStatus', listingId: normalizeProperty24Text(routeParams.listingId || routeParts[1]) }
  }
  if (routeParts[0] === 'listings' && routeParts[2] === 'withdraw') {
    return { name: 'withdrawListing', listingId: normalizeProperty24Text(routeParams.listingId || routeParts[1]) }
  }
  if (routeParts[0] === 'listings' && routeParts[2] === 'leads') {
    return { name: 'listingLeads', listingId: normalizeProperty24Text(routeParams.listingId || routeParts[1]) }
  }
  if (routeParts[0] === 'leads' && routeParts[1] === 'pull') {
    return { name: 'pullLeads', listingId: '' }
  }
  if (routeParts[0] === 'reconciliation' && routeParts[1] === 'run') {
    return { name: 'runReconciliation', listingId: '' }
  }
  return null
}

export function buildProperty24ApiConfig({ env = getRuntimeEnv(), requestUrl, payload = {}, route = {} } = {}) {
  const query = requestUrl?.searchParams || new URLSearchParams()
  const property24BaseUrl = normalizeProperty24Text(env.PROPERTY24_BASE_URL) || PROPERTY24_EXDEV_BASE_URL
  const environment = normalizeProperty24Text(env.PROPERTY24_ENVIRONMENT) || resolveProperty24Environment(property24BaseUrl)
  const explicitAgencyId = normalizeProperty24Text(firstValue(payload.agencyId, query.get('agencyId')))
  const explicitAgentId = normalizeProperty24Text(firstValue(payload.agentId, query.get('agentId')))
  const explicitAgentSourceReference = normalizeProperty24Text(firstValue(payload.agentSourceReference, query.get('agentSourceReference')))

  return {
    property24BaseUrl,
    property24Username: normalizeProperty24Text(env.PROPERTY24_BASIC_AUTH_USERNAME || env.PROPERTY24_USERNAME),
    property24Password: normalizeProperty24Text(env.PROPERTY24_BASIC_AUTH_PASSWORD || env.PROPERTY24_PASSWORD),
    property24UserGroupId: normalizeProperty24Text(env.PROPERTY24_USER_GROUP_ID),
    apiInternalToken: normalizeProperty24Text(env.PROPERTY24_API_INTERNAL_TOKEN),
    allowUnsafeLocalApi: normalizeBoolean(env.PROPERTY24_API_ALLOW_UNAUTHENTICATED_LOCAL, false),
    syndicationEnabled: normalizeBoolean(env.PROPERTY24_SYNDICATION_ENABLED, false),
    supabaseUrl: normalizeProperty24Text(env.SUPABASE_URL || env.VITE_SUPABASE_URL),
    serviceRoleKey: normalizeProperty24Text(env.SUPABASE_SERVICE_ROLE_KEY),
    listingId: normalizeProperty24Text(route.listingId || payload.listingId || query.get('listingId')),
    explicitAgencyId,
    explicitAgentId,
    explicitAgentSourceReference,
    agencyId: normalizeProperty24Text(firstValue(explicitAgencyId, env.PROPERTY24_DEFAULT_AGENCY_ID, '31382')),
    agentId: normalizeProperty24Text(firstValue(explicitAgentId, env.PROPERTY24_DEFAULT_AGENT_ID)),
    agentSourceReference: normalizeProperty24Text(firstValue(
      explicitAgentSourceReference,
      env.PROPERTY24_DEFAULT_AGENT_SOURCE_REFERENCE,
    )),
    suburbId: normalizeProperty24Text(firstValue(payload.suburbId, query.get('suburbId'), env.PROPERTY24_DEFAULT_SUBURB_ID)),
    propertyTypeId: normalizeProperty24Text(firstValue(
      payload.propertyTypeId,
      query.get('propertyTypeId'),
      env.PROPERTY24_DEFAULT_PROPERTY_TYPE_ID,
    )),
    expiryDate: normalizeProperty24Text(firstValue(payload.expiryDate, query.get('expiryDate'), env.PROPERTY24_DEFAULT_EXPIRY_DATE)),
    listingNumber: normalizeProperty24Text(firstValue(payload.listingNumber, query.get('listingNumber'))),
    status: normalizeProperty24Text(firstValue(payload.status, payload.listingStatus, query.get('status'), query.get('listingStatus'))),
    photosChanged: normalizeBoolean(payload.photosChanged ?? query.get('photosChanged'), true),
    property24ListingUrl: normalizeProperty24Text(payload.property24ListingUrl || query.get('property24ListingUrl')),
    actorUserId: normalizeProperty24Text(payload.actorUserId || query.get('actorUserId')),
    idempotencyKey: normalizeProperty24Text(payload.idempotencyKey || query.get('idempotencyKey')),
    maxImages: toPositiveInteger(payload.maxImages || query.get('maxImages'), 20, 50),
    limit: toPositiveInteger(payload.limit || query.get('limit'), 500, 1000),
    startDate: normalizeProperty24Text(payload.startDate || query.get('startDate')),
    endDate: normalizeProperty24Text(payload.endDate || query.get('endDate')),
    after: normalizeProperty24Text(payload.after || query.get('after')),
    fromDate: normalizeProperty24Text(payload.fromDate || query.get('fromDate')),
    includeLeads: normalizeBoolean(payload.includeLeads ?? query.get('includeLeads'), false),
    applyLeads: normalizeBoolean(payload.applyLeads ?? payload.apply ?? query.get('applyLeads') ?? query.get('apply'), false),
    includePortalChecks: normalizeBoolean(payload.includePortalChecks ?? query.get('includePortalChecks'), false),
    includeStatistics: normalizeBoolean(payload.includeStatistics ?? query.get('includeStatistics'), false),
    refresh: normalizeBoolean(payload.refresh ?? query.get('refresh'), false),
    environment,
  }
}

function getMissingConfiguration(config = {}, needs = {}) {
  const missing = []
  const allowMissingAgentMapping = Boolean(needs.allowMissingAgentMapping)
  if (needs.apiToken && !config.apiInternalToken && !config.allowUnsafeLocalApi) missing.push('PROPERTY24_API_INTERNAL_TOKEN')
  if (needs.enabled && !config.syndicationEnabled) missing.push('PROPERTY24_SYNDICATION_ENABLED=true')
  if (needs.supabase && !config.supabaseUrl) missing.push('SUPABASE_URL or VITE_SUPABASE_URL')
  if (needs.supabase && !config.serviceRoleKey) missing.push('SUPABASE_SERVICE_ROLE_KEY')
  if (needs.property24 && !config.property24Username) missing.push('PROPERTY24_BASIC_AUTH_USERNAME')
  if (needs.property24 && !config.property24Password) missing.push('PROPERTY24_BASIC_AUTH_PASSWORD')
  if (needs.listing && !config.listingId) missing.push('listingId')
  if (needs.mapping && !config.agencyId) missing.push('PROPERTY24_DEFAULT_AGENCY_ID or agencyId')
  if (needs.mapping && !allowMissingAgentMapping && !config.agentId) missing.push('PROPERTY24_DEFAULT_AGENT_ID or agentId')
  if (needs.mapping && !allowMissingAgentMapping && !config.agentSourceReference) missing.push('PROPERTY24_DEFAULT_AGENT_SOURCE_REFERENCE or agentSourceReference')
  if (needs.mapping && !config.suburbId) missing.push('PROPERTY24_DEFAULT_SUBURB_ID or suburbId')
  return missing
}

function canUseSandboxProperty24PayloadTest(config = {}) {
  return normalizeProperty24Text(config.environment).toLowerCase() === 'exdev'
}

function getBearerToken(headers = {}) {
  const bearer = getHeader(headers, 'authorization')
  return bearer.startsWith('Bearer ') ? bearer.slice('Bearer '.length).trim() : ''
}

function canUseBrowserProperty24ListingAuth({ headers = {}, config = {}, route = {} } = {}) {
  return ['previewListing', 'previewRentalListing', 'publishListing', 'listingLifecycle', 'listingStatus', 'updateListingStatus', 'withdrawListing', 'listingLeads'].includes(route?.name) &&
    Boolean(getBearerToken(headers) && config.supabaseUrl && config.serviceRoleKey)
}

function hasInternalProperty24ApiAuth({ headers = {}, config = {} } = {}) {
  if (config.allowUnsafeLocalApi && !config.apiInternalToken) return true
  if (!config.apiInternalToken) return false
  const bearer = getHeader(headers, 'authorization')
  const token = getHeader(headers, 'x-property24-api-token')
  return bearer === `Bearer ${config.apiInternalToken}` || token === config.apiInternalToken
}

function getAuthFailure({ headers = {}, config = {}, route = {} } = {}) {
  if (hasInternalProperty24ApiAuth({ headers, config })) return null

  if (canUseBrowserProperty24ListingAuth({ headers, config, route })) return null

  if (!config.apiInternalToken) {
    return buildJsonResponse(503, {
      error: 'property24_api_token_not_configured',
      message: 'Set PROPERTY24_API_INTERNAL_TOKEN before using the Property24 API routes.',
    })
  }

  return buildJsonResponse(401, {
    error: 'unauthorized',
    message: 'Property24 API token is missing or invalid.',
  })
}

function hasProperty24PublishRole(row = {}) {
  const role = normalizeProperty24Text(row.workspace_role || row.organisation_role || row.organization_role || row.role).toLowerCase()
  const status = normalizeProperty24Text(row.membership_status || row.status).toLowerCase()
  if (!['active', 'accepted', 'approved'].includes(status)) return false
  return ['principal', 'owner', 'admin', 'manager', 'branch_manager', 'agency_principal', 'agent', 'estate_agent', 'sales_agent'].includes(role)
}

function hasProperty24AdminPublishRole(row = {}) {
  const role = normalizeProperty24Text(row.workspace_role || row.organisation_role || row.organization_role || row.role).toLowerCase()
  return ['principal', 'owner', 'admin', 'manager', 'branch_manager', 'agency_principal'].includes(role)
}

async function authenticateBrowserProperty24ListingRequest({ supabase, headers = {}, config = {} } = {}) {
  if (hasInternalProperty24ApiAuth({ headers, config })) return null

  const token = getBearerToken(headers)
  if (!token) {
    return buildJsonResponse(401, {
      error: 'unauthorized',
      message: 'Sign in before publishing to Property24.',
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
      message: 'This listing could not be found for Property24 publishing.',
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
  const activeMembership = memberships.find(hasProperty24PublishRole)
  if (!activeMembership) {
    return buildJsonResponse(403, {
      error: 'forbidden',
      message: 'You need agency access before publishing this listing to Property24.',
    })
  }

  const userEmail = normalizeProperty24Text(user.email || activeMembership.email).toLowerCase()
  const ownsListing = listing.assigned_agent_id === user.id ||
    listing.created_by === user.id ||
    normalizeProperty24Text(listing.assigned_agent_email).toLowerCase() === userEmail
  if (!ownsListing && !memberships.some(hasProperty24AdminPublishRole)) {
    return buildJsonResponse(403, {
      error: 'forbidden',
      message: 'Only the assigned agent or an agency admin can publish this listing to Property24.',
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

function createProperty24FromConfig(config = {}) {
  return createProperty24Client({
    baseUrl: config.property24BaseUrl,
    username: config.property24Username,
    password: config.property24Password,
    userGroupId: config.property24UserGroupId,
  })
}

function toPublicPreview(preview = {}) {
  return {
    canSubmit: Boolean(preview.canSubmit),
    dataBlockers: preview.dataBlockers || [],
    technicalBlockers: preview.technicalBlockers || [],
    summary: preview.summary || {},
    imageByteLoad: preview.imageByteLoad || null,
  }
}

async function fetchMaybeSingle(query) {
  if (typeof query.maybeSingle === 'function') return query.maybeSingle()
  return query.single()
}

async function fetchProperty24Sync({ supabase, listingId, environment } = {}) {
  const { data, error } = await fetchMaybeSingle(
    supabase
      .from('property24_listing_syncs')
      .select('*')
      .eq('private_listing_id', listingId)
      .eq('environment', environment),
  )
  if (error && error.code !== 'PGRST116') throw error
  return data || null
}

async function defaultFetchListingStatus({ supabase, property24, config } = {}) {
  const [listingResult, sync] = await Promise.all([
    fetchMaybeSingle(
      supabase
        .from('private_listings')
        .select('id, listing_status, is_active, property24_reference, property24_status, property24_listing_url, property24_publish_without_mandate, property24_publish_without_mandate_reason, property24_publish_without_mandate_at, updated_at')
        .eq('id', config.listingId),
    ),
    fetchProperty24Sync({ supabase, listingId: config.listingId, environment: config.environment }),
  ])
  if (listingResult.error && listingResult.error.code !== 'PGRST116') throw listingResult.error

  let portalCheck = null
  let currentListing = listingResult.data || null
  let currentSync = sync
  const listingNumber = config.listingNumber || sync?.listing_number || listingResult.data?.property24_reference
  if (config.refresh && property24 && listingNumber) {
    const result = await property24.checkListingOnPortal(listingNumber)
    const isOnPortal = Boolean(result.data)
    portalCheck = {
      httpStatus: result.status,
      durationMs: result.durationMs,
      isOnPortal,
      summary: summarizeProperty24Payload(result.data),
    }
    if (supabase && (config.agencyId || sync?.agency_id)) {
      const syncRecord = await recordProperty24ListingSync({
        client: supabase,
        listingId: config.listingId,
        agencyId: config.agencyId || sync?.agency_id,
        listingNumber,
        environment: config.environment,
        isOnPortal,
        externalStatus: isOnPortal ? 'on_portal' : 'not_on_portal',
        responseSummary: portalCheck.summary,
        payloadSummary: {
          action: 'checkListingOnPortal',
          listingNumber: Number(listingNumber),
        },
        property24ListingUrl: listingResult.data?.property24_listing_url || config.property24ListingUrl,
      })
      currentListing = syncRecord.listing || currentListing
      currentSync = syncRecord.sync || currentSync
      portalCheck.databaseWrite = {
        table: 'property24_listing_syncs',
        listingNumber: syncRecord.sync?.listing_number || Number(listingNumber),
        property24Status: syncRecord.listing?.property24_status || null,
        property24Reference: syncRecord.listing?.property24_reference || null,
        ...(syncRecord.syncWarning ? { syncWarning: syncRecord.syncWarning } : {}),
        ...(syncRecord.statusUpdateWarning ? { statusUpdateWarning: syncRecord.statusUpdateWarning } : {}),
        ...(syncRecord.externalLinkWarning ? { externalLinkWarning: syncRecord.externalLinkWarning } : {}),
      }
    }
  }

  return {
    listing: currentListing,
    sync: currentSync,
    listingNumber: listingNumber || null,
    environment: config.environment,
    portalCheck,
    lifecycle: buildProperty24LifecycleState({
      listing: currentListing,
      sync: currentSync,
      listingNumber,
      portalCheck,
      environment: config.environment,
    }),
  }
}

async function resolveProperty24StatusActionConfig({ supabase, resolvedConfig, fallbackStatus = '' } = {}) {
  const sync = resolvedConfig.listingNumber && resolvedConfig.agencyId
    ? null
    : await fetchProperty24Sync({
        supabase,
        listingId: resolvedConfig.listingId,
        environment: resolvedConfig.environment,
      })
  const listingReferenceResult = resolvedConfig.listingNumber || sync?.listing_number
    ? null
    : await fetchMaybeSingle(
        supabase
          .from('private_listings')
          .select('id, property24_reference, property24_listing_url')
          .eq('id', resolvedConfig.listingId),
      )
  if (listingReferenceResult?.error && listingReferenceResult.error.code !== 'PGRST116') throw listingReferenceResult.error
  const listingReference = listingReferenceResult?.data || null
  return {
    ...resolvedConfig,
    status: resolvedConfig.status || fallbackStatus,
    listingNumber: resolvedConfig.listingNumber || sync?.listing_number || listingReference?.property24_reference,
    agencyId: resolvedConfig.agencyId || sync?.agency_id,
    property24ListingUrl: resolvedConfig.property24ListingUrl || listingReference?.property24_listing_url,
  }
}

async function defaultFetchListingLeads({ supabase, property24, config } = {}) {
  const [sync, listingResult] = await Promise.all([
    fetchProperty24Sync({ supabase, listingId: config.listingId, environment: config.environment }),
    fetchMaybeSingle(
      supabase
        .from('private_listings')
        .select('id, organisation_id, assigned_agent_id, assigned_agent_email, title, property24_reference')
        .eq('id', config.listingId),
    ),
  ])
  if (listingResult.error && listingResult.error.code !== 'PGRST116') throw listingResult.error
  const listingNumber = config.listingNumber || sync?.listing_number
  if (!listingNumber) {
    const error = new Error('This listing has no Property24 listing number yet.')
    error.code = 'property24_listing_number_missing'
    error.status = 404
    throw error
  }

  const result = await fetchProperty24ListingLeads({
    property24,
    listingNumber,
    startDate: config.startDate,
    endDate: config.endDate,
  })
  return {
    listingNumber,
    httpStatus: result.status,
    durationMs: result.durationMs,
    summary: result.summary,
    data: result.data,
    ...(config.applyLeads
      ? {
          import: await importProperty24ListingLeadPayload({
            supabase,
            payload: result.data,
            listing: listingResult.data || { id: config.listingId },
            sync,
          }).then((response) => response.import),
        }
      : {}),
  }
}

async function defaultFetchAllLeads({ property24, config } = {}) {
  const result = await fetchProperty24Leads({ property24, after: config.after })
  return {
    httpStatus: result.status,
    durationMs: result.durationMs,
    summary: result.summary,
    data: result.data,
  }
}

function buildErrorResponse(error, fallbackCode = 'property24_api_error') {
  const status = Number(error?.status || 500)
  return buildJsonResponse(status, {
    error: error?.code || fallbackCode,
    message: error?.message || 'Property24 API request failed.',
    httpStatus: error?.status || null,
    response: error?.responseBody ? summarizeProperty24Payload(error.responseBody) : null,
  })
}

export async function createProperty24ApiResponse({
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
  const route = matchProperty24Route(requestUrl, routeParams)
  if (!route) {
    return buildJsonResponse(404, {
      error: 'not_found',
      message: 'Property24 API route was not found.',
    })
  }

  const expectedMethod = PROPERTY24_API_METHODS[route.name]
  if (normalizedMethod !== expectedMethod) {
    return buildJsonResponse(405, {
      error: 'method_not_allowed',
      message: `${route.name} only supports ${expectedMethod}.`,
    })
  }

  try {
    const payload = await readJsonBody(body)
    const config = buildProperty24ApiConfig({ env: env || getRuntimeEnv(), requestUrl, payload, route })
    const authFailure = getAuthFailure({ headers, config, route })
    if (authFailure) return authFailure

    const createSupabase = dependencies.createSupabase || createSupabaseFromConfig
    const createProperty24 = dependencies.createProperty24 || createProperty24FromConfig
    const buildSubmitPlan = dependencies.buildSubmitPlan || buildProperty24ListingSubmitPlan
    const buildRentalSubmitPlan = dependencies.buildRentalSubmitPlan || buildProperty24RentalListingSubmitPlan
    const resolvePublishConfig = dependencies.resolvePublishConfig || resolveProperty24ListingPublishConfiguration
    const applyPublish = dependencies.applyPublish || applyProperty24ListingPublish
    const applyControlledPublish = dependencies.applyControlledPublish || applyControlledProperty24ListingPublish
    const applyStatusUpdate = dependencies.applyStatusUpdate || applyControlledProperty24StatusUpdate
    const fetchListingStatus = dependencies.fetchListingStatus || defaultFetchListingStatus
    const fetchListingLeads = dependencies.fetchListingLeads || defaultFetchListingLeads
    const fetchAllLeads = dependencies.fetchAllLeads || defaultFetchAllLeads
    const pullAndImportLeads = dependencies.pullAndImportLeads || pullAndImportProperty24Leads
    const runReconciliation = dependencies.runReconciliation || runProperty24ReconciliationJob

    if (route.name === 'previewListing') {
      const missing = getMissingConfiguration(config, {
        apiToken: !canUseBrowserProperty24ListingAuth({ headers, config, route }),
        supabase: true,
        listing: true,
      })
      if (missing.length) return buildJsonResponse(400, { error: 'missing_configuration', missingConfiguration: missing })
      const supabase = createSupabase(config)
      const browserAuthFailure = await authenticateBrowserProperty24ListingRequest({ supabase, headers, config })
      if (browserAuthFailure) return browserAuthFailure
      const resolvedConfig = await resolvePublishConfig({ supabase, config, listingId: config.listingId })
      const sandboxPayloadTestMode = canUseSandboxProperty24PayloadTest(resolvedConfig)
      const resolvedMissing = getMissingConfiguration(resolvedConfig, {
        mapping: true,
        allowMissingAgentMapping: sandboxPayloadTestMode,
      })
      if (resolvedMissing.length) {
        return buildJsonResponse(400, {
          error: 'missing_configuration',
          missingConfiguration: resolvedMissing,
          mapping: resolvedConfig.property24ResolvedMapping || null,
        })
      }
      const preview = await buildSubmitPlan({
        supabase,
        listingId: resolvedConfig.listingId,
        agencyId: resolvedConfig.agencyId,
        agentId: resolvedConfig.agentId,
        agentSourceReference: resolvedConfig.agentSourceReference,
        environment: resolvedConfig.environment,
        sandboxPayloadTestMode,
        suburbId: resolvedConfig.suburbId,
        propertyTypeId: resolvedConfig.propertyTypeId,
        expiryDate: resolvedConfig.expiryDate,
        listingNumber: resolvedConfig.listingNumber,
        storageBaseUrl: resolvedConfig.supabaseUrl,
        maxImages: resolvedConfig.maxImages,
        photosChanged: resolvedConfig.photosChanged,
        convertImagesToJpeg: true,
        loadImageBytes: false,
      })
      const report = createProperty24PublishReport({ config: resolvedConfig, preview, apply: false })
      return buildJsonResponse(200, {
        route: route.name,
        status: report.status,
        listingId: resolvedConfig.listingId,
        mapping: resolvedConfig.property24ResolvedMapping || null,
        preview: toPublicPreview(preview),
        report,
      })
    }

    if (route.name === 'previewRentalListing') {
      const missing = getMissingConfiguration(config, {
        apiToken: !canUseBrowserProperty24ListingAuth({ headers, config, route }),
        supabase: true,
        listing: true,
      })
      if (missing.length) return buildJsonResponse(400, { error: 'missing_configuration', missingConfiguration: missing })
      const supabase = createSupabase(config)
      const browserAuthFailure = await authenticateBrowserProperty24ListingRequest({ supabase, headers, config })
      if (browserAuthFailure) return browserAuthFailure
      const resolvedConfig = await resolvePublishConfig({ supabase, config, listingId: config.listingId })
      const sandboxPayloadTestMode = canUseSandboxProperty24PayloadTest(resolvedConfig)
      const resolvedMissing = []
      if (!resolvedConfig.agencyId) resolvedMissing.push('PROPERTY24_DEFAULT_AGENCY_ID or agencyId')
      if (!sandboxPayloadTestMode && !resolvedConfig.agentId) resolvedMissing.push('PROPERTY24_DEFAULT_AGENT_ID or agentId')
      if (!sandboxPayloadTestMode && !resolvedConfig.agentSourceReference) resolvedMissing.push('PROPERTY24_DEFAULT_AGENT_SOURCE_REFERENCE or agentSourceReference')
      if (resolvedMissing.length) {
        return buildJsonResponse(400, {
          error: 'missing_configuration',
          missingConfiguration: resolvedMissing,
          mapping: resolvedConfig.property24ResolvedMapping || null,
        })
      }
      const preview = await buildRentalSubmitPlan({
        supabase,
        listingId: resolvedConfig.listingId,
        agencyId: resolvedConfig.agencyId,
        agentId: resolvedConfig.agentId,
        agentSourceReference: resolvedConfig.agentSourceReference,
        environment: resolvedConfig.environment,
        sandboxPayloadTestMode,
        suburbId: resolvedConfig.suburbId,
        propertyTypeId: resolvedConfig.propertyTypeId,
        expiryDate: resolvedConfig.expiryDate,
        listingNumber: resolvedConfig.listingNumber,
        storageBaseUrl: resolvedConfig.supabaseUrl,
        maxImages: resolvedConfig.maxImages,
        photosChanged: resolvedConfig.photosChanged,
        convertImagesToJpeg: true,
        loadImageBytes: false,
      })
      const report = createProperty24PublishReport({ config: resolvedConfig, preview, apply: false })
      return buildJsonResponse(200, {
        route: route.name,
        status: report.status,
        listingId: resolvedConfig.listingId,
        mapping: resolvedConfig.property24ResolvedMapping || null,
        preview: toPublicPreview(preview),
        report,
      })
    }

    if (route.name === 'publishListing') {
      const missing = getMissingConfiguration(config, {
        apiToken: !canUseBrowserProperty24ListingAuth({ headers, config, route }),
        supabase: true,
        property24: true,
        listing: true,
      })
      if (missing.length) return buildJsonResponse(400, { error: 'missing_configuration', missingConfiguration: missing })
      const supabase = createSupabase(config)
      const browserAuthFailure = await authenticateBrowserProperty24ListingRequest({ supabase, headers, config })
      if (browserAuthFailure) return browserAuthFailure
      const resolvedConfig = await resolvePublishConfig({ supabase, config, listingId: config.listingId })
      const resolvedMissing = getMissingConfiguration(resolvedConfig, {
        enabled: true,
        mapping: true,
      })
      if (resolvedMissing.length) {
        return buildJsonResponse(400, {
          error: 'missing_configuration',
          missingConfiguration: resolvedMissing,
          mapping: resolvedConfig.property24ResolvedMapping || null,
        })
      }
      const property24 = createProperty24(resolvedConfig)
      const preview = await buildSubmitPlan({
        supabase,
        listingId: resolvedConfig.listingId,
        agencyId: resolvedConfig.agencyId,
        agentId: resolvedConfig.agentId,
        agentSourceReference: resolvedConfig.agentSourceReference,
        environment: resolvedConfig.environment,
        suburbId: resolvedConfig.suburbId,
        propertyTypeId: resolvedConfig.propertyTypeId,
        expiryDate: resolvedConfig.expiryDate,
        listingNumber: resolvedConfig.listingNumber,
        storageBaseUrl: resolvedConfig.supabaseUrl,
        maxImages: resolvedConfig.maxImages,
        photosChanged: resolvedConfig.photosChanged,
        convertImagesToJpeg: true,
      })
      let report = createProperty24PublishReport({ config: resolvedConfig, preview, apply: true })
      if (!preview.canSubmit) {
        report = await applyControlledPublish({
          supabase,
          property24,
          config: resolvedConfig,
          preview,
          report,
          applyPublish,
          allowPublishWithoutMandate: true,
          publishWithoutMandateReason: 'Property24 API publish accepted before mandate evidence upload.',
        })
        return buildJsonResponse(422, {
          route: route.name,
          status: report.status,
          listingId: resolvedConfig.listingId,
          mapping: resolvedConfig.property24ResolvedMapping || null,
          preview: toPublicPreview(preview),
          report,
        })
      }
      report = await applyControlledPublish({
        supabase,
        property24,
        config: resolvedConfig,
        preview,
        report,
        applyPublish,
        allowPublishWithoutMandate: true,
        publishWithoutMandateReason: 'Property24 API publish accepted before mandate evidence upload.',
      })
      return buildJsonResponse(report.status === 'FAILED' ? 502 : 200, {
        route: route.name,
        status: report.status,
        listingId: resolvedConfig.listingId,
        mapping: resolvedConfig.property24ResolvedMapping || null,
        report,
      })
    }

    if (route.name === 'listingStatus' || route.name === 'listingLifecycle') {
      const needsProperty24 = buildProperty24ApiConfig({ env: env || getRuntimeEnv(), requestUrl, payload: {}, route }).refresh
      const missing = getMissingConfiguration(config, {
        apiToken: !canUseBrowserProperty24ListingAuth({ headers, config, route }),
        supabase: true,
        property24: needsProperty24,
        listing: true,
      })
      if (missing.length) return buildJsonResponse(400, { error: 'missing_configuration', missingConfiguration: missing })
      const supabase = createSupabase(config)
      const browserAuthFailure = await authenticateBrowserProperty24ListingRequest({ supabase, headers, config })
      if (browserAuthFailure) return browserAuthFailure
      const property24 = config.refresh ? createProperty24(config) : null
      const status = await fetchListingStatus({ supabase, property24, config })
      return buildJsonResponse(200, { route: route.name, status, lifecycle: status.lifecycle })
    }

    if (route.name === 'updateListingStatus' || route.name === 'withdrawListing') {
      const missing = getMissingConfiguration(config, {
        apiToken: !canUseBrowserProperty24ListingAuth({ headers, config, route }),
        supabase: true,
        property24: true,
        listing: true,
      })
      if (route.name === 'updateListingStatus' && !config.status) missing.push('status or listingStatus')
      if (missing.length) return buildJsonResponse(400, { error: 'missing_configuration', missingConfiguration: missing })
      const supabase = createSupabase(config)
      const browserAuthFailure = await authenticateBrowserProperty24ListingRequest({ supabase, headers, config })
      if (browserAuthFailure) return browserAuthFailure
      const resolvedConfig = await resolvePublishConfig({ supabase, config, listingId: config.listingId })
      const statusConfig = await resolveProperty24StatusActionConfig({
        supabase,
        resolvedConfig,
        fallbackStatus: route.name === 'withdrawListing' ? 'Withdrawn' : '',
      })
      const resolvedMissing = getMissingConfiguration(statusConfig, { enabled: true })
      if (!statusConfig.agencyId) resolvedMissing.push('PROPERTY24_DEFAULT_AGENCY_ID or agencyId')
      if (!statusConfig.listingNumber) resolvedMissing.push('listingNumber')
      if (resolvedMissing.length) {
        return buildJsonResponse(400, {
          error: 'missing_configuration',
          missingConfiguration: resolvedMissing,
          mapping: statusConfig.property24ResolvedMapping || null,
        })
      }
      const property24 = createProperty24(statusConfig)
      const report = await applyStatusUpdate({
        supabase,
        property24,
        config: statusConfig,
        listingNumber: statusConfig.listingNumber,
        listingStatus: statusConfig.status,
      })
      return buildJsonResponse(report.status === 'FAILED' ? 502 : 200, {
        route: route.name,
        status: report.status,
        lifecycle: report.lifecycle || null,
        listingId: statusConfig.listingId,
        mapping: statusConfig.property24ResolvedMapping || null,
        report,
      })
    }

    if (route.name === 'listingLeads') {
      const missing = getMissingConfiguration(config, {
        apiToken: !canUseBrowserProperty24ListingAuth({ headers, config, route }),
        supabase: true,
        property24: true,
        listing: true,
      })
      if (missing.length) return buildJsonResponse(400, { error: 'missing_configuration', missingConfiguration: missing })
      const supabase = createSupabase(config)
      const browserAuthFailure = await authenticateBrowserProperty24ListingRequest({ supabase, headers, config })
      if (browserAuthFailure) return browserAuthFailure
      const property24 = createProperty24(config)
      const leads = await fetchListingLeads({ supabase, property24, config })
      return buildJsonResponse(200, { route: route.name, leads })
    }

    if (route.name === 'pullLeads') {
      const missing = getMissingConfiguration(config, { apiToken: true, enabled: true, property24: true, supabase: true })
      if (missing.length) return buildJsonResponse(400, { error: 'missing_configuration', missingConfiguration: missing })
      const supabase = createSupabase(config)
      const property24 = createProperty24(config)
      const leads = await (dependencies.fetchAllLeads
        ? fetchAllLeads({ property24, config, supabase })
        : pullAndImportLeads({ supabase, property24, config }))
      return buildJsonResponse(200, { route: route.name, leads })
    }

    if (route.name === 'runReconciliation') {
      const missing = getMissingConfiguration(config, {
        apiToken: true,
        enabled: true,
        supabase: true,
        property24: true,
      })
      if (missing.length) return buildJsonResponse(400, { error: 'missing_configuration', missingConfiguration: missing })
      const supabase = createSupabase(config)
      const property24 = createProperty24(config)
      const report = await runReconciliation({ supabase, property24, config })
      return buildJsonResponse(report.status === 'OK' ? 200 : 409, {
        route: route.name,
        status: report.status,
        report,
      })
    }

    return buildJsonResponse(404, { error: 'not_found', message: 'Property24 API route was not found.' })
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

export async function handleProperty24NodeRequest(request, response, routeParams = {}) {
  const body = await readNodeRequestBody(request)
  const payload = await createProperty24ApiResponse({
    method: request.method,
    url: request.url,
    headers: request.headers,
    body,
    routeParams,
  })
  writeNodeJsonResponse(response, payload)
}

export { writeNodeJsonResponse }
