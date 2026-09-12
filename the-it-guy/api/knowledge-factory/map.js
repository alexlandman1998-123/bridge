import { createClient } from '@supabase/supabase-js'

const SOUTH_AFRICA = { west: 16.45, south: -34.833, east: 32.95, north: -22.125 }
const MAX_BOUNDS_WIDTH = 0.5
const MAX_BOUNDS_HEIGHT = 0.5
const MAP_PAGE_SIZE = 25
const MAP_REQUESTS_PER_MINUTE = 12
let supplierSession = null

function text(value, max = 500) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function number(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function header(headers, name) {
  const value = headers?.[name] || headers?.[name.toLowerCase()]
  // Session credentials can be longer than the ordinary short-header limit.
  // Do not silently truncate a bearer token before it reaches Supabase.
  return Array.isArray(value) ? text(value[0], 20_000) : text(value, 20_000)
}

function decodeSessionToken(value) {
  const encoded = text(value, 20_000)
  if (!encoded || !/^[A-Za-z0-9_-]+$/.test(encoded)) return ''
  try {
    const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/')
    return Buffer.from(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='), 'base64').toString('utf8').trim()
  } catch {
    return ''
  }
}

function json(response, status, body) {
  response.status(status).setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Cache-Control', 'no-store')
  response.end(JSON.stringify(body))
}

async function readBody(request) {
  if (request.body && typeof request.body === 'object' && !Buffer.isBuffer(request.body)) return request.body
  if (typeof request.body === 'string') return JSON.parse(request.body || '{}')
  const chunks = []
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
}

function runtimeConfig() {
  const required = [
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'KNOWLEDGE_FACTORY_GRAPHQL_ENDPOINT',
    'KNOWLEDGE_FACTORY_EMAIL',
    'KNOWLEDGE_FACTORY_PASSWORD',
  ]
  const missing = required.filter((key) => !text(process.env[key], 10_000))
  if (missing.length) {
    const error = new Error(`Missing private server configuration: ${missing.join(', ')}.`)
    error.status = 503
    throw error
  }
  return {
    supabaseUrl: text(process.env.SUPABASE_URL, 2_000),
    serviceRoleKey: text(process.env.SUPABASE_SERVICE_ROLE_KEY, 10_000),
    endpoint: text(process.env.KNOWLEDGE_FACTORY_GRAPHQL_ENDPOINT, 2_000),
    email: text(process.env.KNOWLEDGE_FACTORY_EMAIL, 500),
    password: process.env.KNOWLEDGE_FACTORY_PASSWORD,
  }
}

function validOrganisationId(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text(value, 100))
}

function normalizeRole(value) {
  const role = text(value).toLowerCase()
  if (role === 'administrator') return 'admin'
  if (role === 'superadmin') return 'super_admin'
  if (role === 'branch manager') return 'branch_manager'
  if (role === 'principal / owner') return 'principal'
  return role
}

async function authenticateActor(request, db, organisationId) {
  // This same-origin endpoint deliberately uses a dedicated header. Some
  // platform/proxy layers reserve or rewrite Authorization before a Vercel
  // Function receives it, which can corrupt an otherwise valid JWT.
  const token = decodeSessionToken(header(request.headers, 'x-arch9-session-token-encoded')) || header(request.headers, 'x-arch9-session-token') || header(request.headers, 'authorization').replace(/^Bearer\s+/i, '')
  if (!token) {
    const error = new Error('Your browser did not provide an active sign-in token.')
    error.status = 401
    throw error
  }
  const { data: { user }, error: userError } = await db.auth.getUser(token)
  if (userError || !user?.id) {
    // Keep the actual Supabase rejection reason in private Vercel logs. Do not
    // log the bearer token (or any portion of it): it is a credential.
    console.error('Knowledge Factory map actor authentication failed', {
      message: text(userError?.message, 300) || 'Supabase returned no user.',
      code: text(userError?.code, 100) || null,
      status: Number(userError?.status) || null,
      tokenLength: token.length,
      tokenSegments: token.split('.').length,
    })
    const error = new Error('Your sign-in token could not be verified. Please sign in again.')
    error.status = 401
    throw error
  }
  const membership = await db
    .from('organisation_users')
    .select('user_id, status, membership_status, role, workspace_role, organization_role, organisation_role')
    .eq('organisation_id', organisationId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (membership.error || !membership.data) {
    const error = new Error('You do not belong to this organisation.')
    error.status = 403
    throw error
  }
  const active = text(membership.data.membership_status || membership.data.status).toLowerCase() === 'active'
  const role = normalizeRole(membership.data.workspace_role || membership.data.organization_role || membership.data.organisation_role || membership.data.role)
  if (!active || !role) {
    const error = new Error('An active organisation membership is required.')
    error.status = 403
    throw error
  }
  return { userId: user.id }
}

async function hasMapAccess(db, organisationId, userId) {
  const [access, permission] = await Promise.all([
    db.from('knowledge_factory_organisation_access').select('enabled, allowed_operations, suspended_at').eq('organisation_id', organisationId).maybeSingle(),
    db.from('knowledge_factory_user_permissions').select('allowed_operations, revoked_at').eq('organisation_id', organisationId).eq('user_id', userId).maybeSingle(),
  ])
  if (access.error || permission.error) throw new Error('Knowledge Factory access could not be checked.')
  const organisationAllowed = access.data?.enabled === true && !access.data.suspended_at && Array.isArray(access.data.allowed_operations) && access.data.allowed_operations.includes('map_properties')
  const userAllowed = !permission.data?.revoked_at && Array.isArray(permission.data?.allowed_operations) && permission.data.allowed_operations.includes('map_properties')
  return organisationAllowed && userAllowed
}

async function writeAudit(db, event) {
  const { error } = await db.from('knowledge_factory_audit_log').insert(event)
  if (error) console.error('Knowledge Factory audit write failed', error.code)
}

function validateBounds(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('A map bounding box is required.')
  const west = number(value.west), east = number(value.east), south = number(value.south), north = number(value.north)
  if ([west, east, south, north].some((item) => item === null)) throw new Error('Map bounds must be finite numbers.')
  if (west >= east || south >= north) throw new Error('Map bounds are invalid.')
  if (west < SOUTH_AFRICA.west || east > SOUTH_AFRICA.east || south < SOUTH_AFRICA.south || north > SOUTH_AFRICA.north) throw new Error('Map searches must remain within South Africa.')
  if (east - west > MAX_BOUNDS_WIDTH || north - south > MAX_BOUNDS_HEIGHT) throw new Error('Zoom in before searching this area.')
  return { west, east, south, north }
}

async function assertRateLimit(db, organisationId, userId) {
  const since = new Date(Date.now() - 60_000).toISOString()
  const { count, error } = await db
    .from('knowledge_factory_audit_log')
    .select('id', { count: 'exact', head: true })
    .eq('organisation_id', organisationId)
    .eq('actor_id', userId)
    .eq('operation', 'map_properties')
    .gte('created_at', since)
  if (error) throw new Error('Knowledge Factory rate limit could not be checked.')
  if ((count || 0) >= MAP_REQUESTS_PER_MINUTE) {
    const error = new Error('Map lookup limit reached. Please wait a minute before searching again.')
    error.status = 429
    throw error
  }
}

function vendorError(body, fallback) {
  const first = Array.isArray(body?.errors) ? body.errors[0] : null
  const message = text(first?.message, 300)
  return message ? `${fallback}: ${message}` : fallback
}

async function supplierToken(config) {
  if (supplierSession?.expiresAt > Date.now() + 10_000) return supplierSession.token
  const response = await fetch(config.endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      operationName: 'KnowledgeFactoryLogin',
      query: 'mutation KnowledgeFactoryLogin($input: LoginInput!) { login(login: $input) { tokenPayload { expiresUtc token } errors { ... on ArgumentError { message paramName } ... on ArgumentNullError { message paramName } ... on Error { message } } } }',
      variables: { input: { email: config.email, password: config.password } },
    }),
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(vendorError(body, `Knowledge Factory login request failed (HTTP ${response.status}).`))
  const graphqlMessage = text(Array.isArray(body.errors) ? body.errors[0]?.message : '', 300)
  if (graphqlMessage) throw new Error(`Knowledge Factory login request failed: ${graphqlMessage}`)
  const payload = body?.data?.login?.tokenPayload || {}
  const token = text(payload.token, 10_000)
  const expiresAt = Date.parse(text(payload.expiresUtc))
  if (!token || !Number.isFinite(expiresAt)) {
    const message = text(Array.isArray(body?.data?.login?.errors) ? body.data.login.errors[0]?.message : '', 300)
    throw new Error(message ? `Knowledge Factory login was rejected: ${message}` : 'Knowledge Factory login response did not include a usable token.')
  }
  supplierSession = { token, expiresAt }
  return token
}

function parseWktPolygon(value) {
  const match = /^POLYGON\s*\(\(\s*([^()]+?)\s*\)\)$/i.exec(text(value, 50_000))
  if (!match) return []
  return match[1].split(',').flatMap((pair) => {
    const [longitude, latitude] = pair.trim().split(/\s+/).map(Number)
    return Number.isFinite(latitude) && Number.isFinite(longitude) ? [{ latitude, longitude }] : []
  }).slice(0, 500)
}

function costs(body) {
  const extension = body?.extensions && typeof body.extensions === 'object' ? body.extensions : {}
  const cost = extension.cost && typeof extension.cost === 'object' ? extension.cost : extension
  const metric = (value) => {
    const parsed = typeof value === 'number' ? value : Number(value)
    return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : null
  }
  return { fieldCost: metric(cost.fieldCost || cost.field_cost), typeCost: metric(cost.typeCost || cost.type_cost), surcharge: metric(cost.priceSurcharge || cost.price_surcharge), credits: metric(cost.creditsConsumed || cost.credits_consumed) }
}

async function searchMap(config, bounds) {
  const response = await fetch(config.endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${await supplierToken(config)}`, 'GraphQL-Cost': 'report' },
    body: JSON.stringify({
      operationName: 'MapProperties',
      query: 'query MapProperties($minX: Decimal!, $maxX: Decimal!, $minY: Decimal!, $maxY: Decimal!) { properties(where: { x: { gt: $minX, lt: $maxX }, y: { gt: $minY, lt: $maxY } }, first: 25) { nodes { propertyId wkt erf portion suburb { suburbId } } } }',
      variables: { minX: bounds.west, maxX: bounds.east, minY: bounds.south, maxY: bounds.north },
    }),
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok || (Array.isArray(body.errors) && body.errors.length)) throw new Error(vendorError(body, 'Knowledge Factory could not return map properties.'))
  const nodes = Array.isArray(body?.data?.properties?.nodes) ? body.data.properties.nodes : []
  const items = nodes.flatMap((node) => {
    const propertyId = text(String(node?.propertyId || ''), 100)
    const polygon = parseWktPolygon(node?.wkt)
    if (!propertyId || polygon.length < 3) return []
    return [{ id: propertyId, propertyId, erf: number(node.erf), portion: number(node.portion), suburbId: text(String(node?.suburb?.suburbId || ''), 100) || null, polygon }]
  })
  return { items, costs: costs(body), vendorRequestId: text(response.headers.get('x-request-id'), 200) || null }
}

export default async function handler(request, response) {
  if (request.method !== 'POST') return json(response, 405, { error: 'Method not allowed.' })
  try {
    const body = await readBody(request)
    const organisationId = text(body.organisationId, 100)
    if (!validOrganisationId(organisationId)) return json(response, 400, { error: 'A valid organisation is required.' })
    const config = runtimeConfig()
    const db = createClient(config.supabaseUrl, config.serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })
    const actor = await authenticateActor(request, db, organisationId)
    const allowed = await hasMapAccess(db, organisationId, actor.userId)
    if (body.action === 'status') {
      return json(response, 200, {
        phase: 'reports',
        mapSearchEnabled: allowed,
        livePropertySearchEnabled: allowed,
        reportSearchEnabled: false,
        message: allowed ? 'Map parcel search is available. Property reports require their own named-user permission.' : 'Map parcel search requires an approved organisation and named-user permission.',
      })
    }
    if (body.action !== 'map_properties') return json(response, 400, { error: 'Unsupported action.' })
    const purpose = text(body.purpose, 500)
    if (purpose.length < 10) return json(response, 400, { error: 'Provide a lookup purpose of at least 10 characters.' })
    const bounds = validateBounds(body.bounds)
    if (!allowed) {
      await writeAudit(db, { organisation_id: organisationId, actor_id: actor.userId, operation: 'map_properties', request_purpose: purpose, request_metadata: { mode: 'map', bounds }, outcome: 'denied', error_code: 'access_not_granted' })
      return json(response, 403, { error: 'Knowledge Factory map access has not been granted.' })
    }
    await assertRateLimit(db, organisationId, actor.userId)
    try {
      const result = await searchMap(config, bounds)
      await writeAudit(db, { organisation_id: organisationId, actor_id: actor.userId, operation: 'map_properties', request_purpose: purpose, request_metadata: { mode: 'map', bounds, page_size: MAP_PAGE_SIZE, returned_count: result.items.length }, outcome: 'completed', vendor_request_id: result.vendorRequestId, field_cost: result.costs.fieldCost, type_cost: result.costs.typeCost, price_surcharge: result.costs.surcharge, credits_consumed: result.costs.credits })
      return json(response, 200, { items: result.items, count: result.items.length, pageSize: MAP_PAGE_SIZE, costs: result.costs })
    } catch (error) {
      await writeAudit(db, { organisation_id: organisationId, actor_id: actor.userId, operation: 'map_properties', request_purpose: purpose, request_metadata: { mode: 'map', bounds, page_size: MAP_PAGE_SIZE, failure_reason: text(error?.message, 300) }, outcome: 'failed', error_code: 'supplier_map_query_failed' })
      throw error
    }
  } catch (error) {
    json(response, Number(error?.status || 502), { error: error?.message || 'Knowledge Factory request failed.' })
  }
}
