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
  buildProperty24ListingSubmitPlan,
  createProperty24PublishReport,
  resolveProperty24Environment,
} from './publishService.js'
import {
  applyControlledProperty24ListingPublish,
  applyControlledProperty24StatusUpdate,
} from './workflowService.js'
import {
  fetchProperty24Leads,
  fetchProperty24ListingLeads,
} from './leadService.js'
import {
  createProperty24LeadImportPlan,
  runProperty24ReconciliationJob,
} from './reconciliationService.js'

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
  if (routeParts[0] === 'listings' && routeParts[2] === 'publish') {
    return { name: 'publishListing', listingId: normalizeProperty24Text(routeParams.listingId || routeParts[1]) }
  }
  if (routeParts[0] === 'listings' && routeParts[2] === 'status') {
    return { name: 'listingStatus', listingId: normalizeProperty24Text(routeParams.listingId || routeParts[1]) }
  }
  if (routeParts[0] === 'listings' && routeParts[2] === 'status-update') {
    return { name: 'updateListingStatus', listingId: normalizeProperty24Text(routeParams.listingId || routeParts[1]) }
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
    agencyId: normalizeProperty24Text(firstValue(payload.agencyId, query.get('agencyId'), env.PROPERTY24_DEFAULT_AGENCY_ID, '31382')),
    agentId: normalizeProperty24Text(firstValue(payload.agentId, query.get('agentId'), env.PROPERTY24_DEFAULT_AGENT_ID)),
    agentSourceReference: normalizeProperty24Text(firstValue(
      payload.agentSourceReference,
      query.get('agentSourceReference'),
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
    startDate: normalizeProperty24Text(payload.startDate || query.get('startDate')),
    endDate: normalizeProperty24Text(payload.endDate || query.get('endDate')),
    after: normalizeProperty24Text(payload.after || query.get('after')),
    fromDate: normalizeProperty24Text(payload.fromDate || query.get('fromDate')),
    includeLeads: normalizeBoolean(payload.includeLeads ?? query.get('includeLeads'), false),
    includePortalChecks: normalizeBoolean(payload.includePortalChecks ?? query.get('includePortalChecks'), false),
    includeStatistics: normalizeBoolean(payload.includeStatistics ?? query.get('includeStatistics'), false),
    refresh: normalizeBoolean(payload.refresh ?? query.get('refresh'), false),
    environment,
  }
}

function getMissingConfiguration(config = {}, needs = {}) {
  const missing = []
  if (needs.apiToken && !config.apiInternalToken && !config.allowUnsafeLocalApi) missing.push('PROPERTY24_API_INTERNAL_TOKEN')
  if (needs.enabled && !config.syndicationEnabled) missing.push('PROPERTY24_SYNDICATION_ENABLED=true')
  if (needs.supabase && !config.supabaseUrl) missing.push('SUPABASE_URL or VITE_SUPABASE_URL')
  if (needs.supabase && !config.serviceRoleKey) missing.push('SUPABASE_SERVICE_ROLE_KEY')
  if (needs.property24 && !config.property24Username) missing.push('PROPERTY24_BASIC_AUTH_USERNAME')
  if (needs.property24 && !config.property24Password) missing.push('PROPERTY24_BASIC_AUTH_PASSWORD')
  if (needs.listing && !config.listingId) missing.push('listingId')
  if (needs.mapping && !config.agencyId) missing.push('PROPERTY24_DEFAULT_AGENCY_ID or agencyId')
  if (needs.mapping && !config.agentId) missing.push('PROPERTY24_DEFAULT_AGENT_ID or agentId')
  if (needs.mapping && !config.agentSourceReference) missing.push('PROPERTY24_DEFAULT_AGENT_SOURCE_REFERENCE or agentSourceReference')
  if (needs.mapping && !config.suburbId) missing.push('PROPERTY24_DEFAULT_SUBURB_ID or suburbId')
  return missing
}

function getAuthFailure({ headers = {}, config = {} } = {}) {
  if (config.allowUnsafeLocalApi && !config.apiInternalToken) return null
  if (!config.apiInternalToken) {
    return buildJsonResponse(503, {
      error: 'property24_api_token_not_configured',
      message: 'Set PROPERTY24_API_INTERNAL_TOKEN before using the Property24 API routes.',
    })
  }

  const bearer = getHeader(headers, 'authorization')
  const token = getHeader(headers, 'x-property24-api-token')
  if (bearer === `Bearer ${config.apiInternalToken}` || token === config.apiInternalToken) return null
  return buildJsonResponse(401, {
    error: 'unauthorized',
    message: 'Property24 API token is missing or invalid.',
  })
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
  const listingNumber = config.listingNumber || sync?.listing_number || listingResult.data?.property24_reference
  if (config.refresh && property24 && listingNumber) {
    const result = await property24.checkListingOnPortal(listingNumber)
    portalCheck = {
      httpStatus: result.status,
      durationMs: result.durationMs,
      isOnPortal: Boolean(result.data),
      summary: summarizeProperty24Payload(result.data),
    }
  }

  return {
    listing: listingResult.data || null,
    sync,
    listingNumber: listingNumber || null,
    environment: config.environment,
    portalCheck,
  }
}

async function defaultFetchListingLeads({ supabase, property24, config } = {}) {
  const sync = await fetchProperty24Sync({ supabase, listingId: config.listingId, environment: config.environment })
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
    const authFailure = getAuthFailure({ headers, config })
    if (authFailure) return authFailure

    const createSupabase = dependencies.createSupabase || createSupabaseFromConfig
    const createProperty24 = dependencies.createProperty24 || createProperty24FromConfig
    const buildSubmitPlan = dependencies.buildSubmitPlan || buildProperty24ListingSubmitPlan
    const applyPublish = dependencies.applyPublish || applyProperty24ListingPublish
    const applyControlledPublish = dependencies.applyControlledPublish || applyControlledProperty24ListingPublish
    const applyStatusUpdate = dependencies.applyStatusUpdate || applyControlledProperty24StatusUpdate
    const fetchListingStatus = dependencies.fetchListingStatus || defaultFetchListingStatus
    const fetchListingLeads = dependencies.fetchListingLeads || defaultFetchListingLeads
    const fetchAllLeads = dependencies.fetchAllLeads || defaultFetchAllLeads
    const runReconciliation = dependencies.runReconciliation || runProperty24ReconciliationJob

    if (route.name === 'previewListing') {
      const missing = getMissingConfiguration(config, { apiToken: true, supabase: true, listing: true, mapping: true })
      if (missing.length) return buildJsonResponse(400, { error: 'missing_configuration', missingConfiguration: missing })
      const supabase = createSupabase(config)
      const preview = await buildSubmitPlan({
        supabase,
        listingId: config.listingId,
        agencyId: config.agencyId,
        agentId: config.agentId,
        agentSourceReference: config.agentSourceReference,
        suburbId: config.suburbId,
        propertyTypeId: config.propertyTypeId,
        expiryDate: config.expiryDate,
        listingNumber: config.listingNumber,
        storageBaseUrl: config.supabaseUrl,
        maxImages: config.maxImages,
        photosChanged: config.photosChanged,
        convertImagesToJpeg: true,
      })
      const report = createProperty24PublishReport({ config, preview, apply: false })
      return buildJsonResponse(200, {
        route: route.name,
        status: report.status,
        listingId: config.listingId,
        preview: toPublicPreview(preview),
        report,
      })
    }

    if (route.name === 'publishListing') {
      const missing = getMissingConfiguration(config, {
        apiToken: true,
        enabled: true,
        supabase: true,
        property24: true,
        listing: true,
        mapping: true,
      })
      if (missing.length) return buildJsonResponse(400, { error: 'missing_configuration', missingConfiguration: missing })
      const supabase = createSupabase(config)
      const property24 = createProperty24(config)
      const preview = await buildSubmitPlan({
        supabase,
        listingId: config.listingId,
        agencyId: config.agencyId,
        agentId: config.agentId,
        agentSourceReference: config.agentSourceReference,
        suburbId: config.suburbId,
        propertyTypeId: config.propertyTypeId,
        expiryDate: config.expiryDate,
        listingNumber: config.listingNumber,
        storageBaseUrl: config.supabaseUrl,
        maxImages: config.maxImages,
        photosChanged: config.photosChanged,
        convertImagesToJpeg: true,
      })
      let report = createProperty24PublishReport({ config, preview, apply: true })
      if (!preview.canSubmit) {
        report = await applyControlledPublish({
          supabase,
          property24,
          config,
          preview,
          report,
          applyPublish,
          allowPublishWithoutMandate: true,
          publishWithoutMandateReason: 'Property24 API publish accepted before mandate evidence upload.',
        })
        return buildJsonResponse(422, { route: route.name, status: report.status, listingId: config.listingId, preview: toPublicPreview(preview), report })
      }
      report = await applyControlledPublish({
        supabase,
        property24,
        config,
        preview,
        report,
        applyPublish,
        allowPublishWithoutMandate: true,
        publishWithoutMandateReason: 'Property24 API publish accepted before mandate evidence upload.',
      })
      return buildJsonResponse(report.status === 'FAILED' ? 502 : 200, {
        route: route.name,
        status: report.status,
        listingId: config.listingId,
        report,
      })
    }

    if (route.name === 'listingStatus') {
      const needsProperty24 = buildProperty24ApiConfig({ env: env || getRuntimeEnv(), requestUrl, payload: {}, route }).refresh
      const missing = getMissingConfiguration(config, {
        apiToken: true,
        supabase: true,
        property24: needsProperty24,
        listing: true,
      })
      if (missing.length) return buildJsonResponse(400, { error: 'missing_configuration', missingConfiguration: missing })
      const supabase = createSupabase(config)
      const property24 = config.refresh ? createProperty24(config) : null
      const status = await fetchListingStatus({ supabase, property24, config })
      return buildJsonResponse(200, { route: route.name, status })
    }

    if (route.name === 'updateListingStatus') {
      const missing = getMissingConfiguration(config, {
        apiToken: true,
        enabled: true,
        supabase: true,
        property24: true,
        listing: true,
      })
      if (!config.agencyId) missing.push('PROPERTY24_DEFAULT_AGENCY_ID or agencyId')
      if (!config.listingNumber) missing.push('listingNumber')
      if (!config.status) missing.push('status or listingStatus')
      if (missing.length) return buildJsonResponse(400, { error: 'missing_configuration', missingConfiguration: missing })
      const supabase = createSupabase(config)
      const property24 = createProperty24(config)
      const report = await applyStatusUpdate({
        supabase,
        property24,
        config,
        listingNumber: config.listingNumber,
        listingStatus: config.status,
      })
      return buildJsonResponse(report.status === 'FAILED' ? 502 : 200, {
        route: route.name,
        status: report.status,
        listingId: config.listingId,
        report,
      })
    }

    if (route.name === 'listingLeads') {
      const missing = getMissingConfiguration(config, {
        apiToken: true,
        supabase: true,
        property24: true,
        listing: true,
      })
      if (missing.length) return buildJsonResponse(400, { error: 'missing_configuration', missingConfiguration: missing })
      const supabase = createSupabase(config)
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
        : createProperty24LeadImportPlan({ supabase, property24, config }))
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
