import { createClient } from '@supabase/supabase-js'

const REPORT_QUOTES_PER_MINUTE = 6
const REPORT_REQUESTS_PER_HOUR = 8
const REPORT_QUOTE_TTL_MS = 15 * 60_000
const REPORT_TYPES = new Set(['property_summary', 'municipal_valuation'])
let supplierSession = null

function text(value, max = 500) { return typeof value === 'string' ? value.trim().slice(0, max) : '' }
function scalarText(value, max = 500) { return typeof value === 'string' || typeof value === 'number' ? String(value).trim().slice(0, max) : '' }
function number(value) { return typeof value === 'number' && Number.isFinite(value) ? value : null }
function header(headers, name) { const value = headers?.[name] || headers?.[name.toLowerCase()]; return Array.isArray(value) ? text(value[0], 20_000) : text(value, 20_000) }
function json(response, status, body) { response.status(status).setHeader('Content-Type', 'application/json; charset=utf-8'); response.setHeader('Cache-Control', 'no-store'); response.end(JSON.stringify(body)) }

async function readBody(request) {
  if (request.body && typeof request.body === 'object' && !Buffer.isBuffer(request.body)) return request.body
  if (typeof request.body === 'string') return JSON.parse(request.body || '{}')
  const chunks = []; for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
}

function runtimeConfig() {
  const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'KNOWLEDGE_FACTORY_GRAPHQL_ENDPOINT', 'KNOWLEDGE_FACTORY_EMAIL', 'KNOWLEDGE_FACTORY_PASSWORD']
  const missing = required.filter((key) => !text(process.env[key], 10_000))
  if (missing.length) { const error = new Error(`Missing private server configuration: ${missing.join(', ')}.`); error.status = 503; throw error }
  return { supabaseUrl: text(process.env.SUPABASE_URL, 2_000), serviceRoleKey: text(process.env.SUPABASE_SERVICE_ROLE_KEY, 10_000), endpoint: text(process.env.KNOWLEDGE_FACTORY_GRAPHQL_ENDPOINT, 2_000), email: text(process.env.KNOWLEDGE_FACTORY_EMAIL, 500), password: process.env.KNOWLEDGE_FACTORY_PASSWORD }
}

function validOrganisationId(value) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text(value, 100)) }
function normalizeRole(value) { const role = text(value).toLowerCase(); if (role === 'administrator') return 'admin'; if (role === 'superadmin') return 'super_admin'; if (role === 'branch manager') return 'branch_manager'; if (role === 'principal / owner') return 'principal'; return role }

async function authenticateActor(request, db, organisationId) {
  const token = header(request.headers, 'authorization').replace(/^Bearer\s+/i, '')
  if (!token) { const error = new Error('Your browser did not provide an active sign-in token.'); error.status = 401; throw error }
  const { data: { user }, error: userError } = await db.auth.getUser(token)
  if (userError || !user?.id) { const error = new Error('Your sign-in token could not be verified. Please sign in again.'); error.status = 401; throw error }
  const membership = await db.from('organisation_users').select('user_id, status, membership_status, role, workspace_role, organization_role, organisation_role').eq('organisation_id', organisationId).eq('user_id', user.id).maybeSingle()
  if (membership.error || !membership.data) { const error = new Error('You do not belong to this organisation.'); error.status = 403; throw error }
  const active = text(membership.data.membership_status || membership.data.status).toLowerCase() === 'active'
  const role = normalizeRole(membership.data.workspace_role || membership.data.organization_role || membership.data.organisation_role || membership.data.role)
  if (!active || !role) { const error = new Error('An active organisation membership is required.'); error.status = 403; throw error }
  return { userId: user.id }
}

async function hasReportAccess(db, organisationId, userId) {
  const [access, permission] = await Promise.all([
    db.from('knowledge_factory_organisation_access').select('enabled, allowed_operations, suspended_at').eq('organisation_id', organisationId).maybeSingle(),
    db.from('knowledge_factory_user_permissions').select('allowed_operations, revoked_at').eq('organisation_id', organisationId).eq('user_id', userId).maybeSingle(),
  ])
  if (access.error || permission.error) throw new Error('Knowledge Factory access could not be checked.')
  return access.data?.enabled === true && !access.data.suspended_at && Array.isArray(access.data.allowed_operations) && access.data.allowed_operations.includes('property_report') && !permission.data?.revoked_at && Array.isArray(permission.data?.allowed_operations) && permission.data.allowed_operations.includes('property_report')
}

async function commercialPolicy(db, organisationId) {
  const { data, error } = await db.from('knowledge_factory_commercial_policies').select('allowed_report_types, per_report_credit_cap, monthly_credit_cap, rollout_stage, supplier_contract_version').eq('organisation_id', organisationId).maybeSingle()
  if (error || !data) { const failure = new Error('Knowledge Factory commercial policy is not configured for this organisation.'); failure.status = 403; throw failure }
  if (data.rollout_stage === 'production' && process.env.KNOWLEDGE_FACTORY_PRODUCTION_ENABLED !== 'true') { const failure = new Error('Knowledge Factory production policy is locked by the private server gate.'); failure.status = 409; throw failure }
  return data
}

function assertReportTypesAllowed(policy, reportTypes) {
  if (!Array.isArray(policy.allowed_report_types) || reportTypes.some((type) => !policy.allowed_report_types.includes(type))) { const failure = new Error('This report section is not included in the organisation commercial package.'); failure.status = 403; throw failure }
}

async function assertCreditCaps(db, organisationId, policy, estimatedCredits) {
  if (!Number.isFinite(Number(estimatedCredits))) { const failure = new Error('The supplier did not return a usable credit estimate.'); failure.status = 409; throw failure }
  if (Number(estimatedCredits) > Number(policy.per_report_credit_cap)) { const failure = new Error('This quote exceeds the organisation per-report credit cap.'); failure.status = 409; throw failure }
  const monthStart = new Date(); monthStart.setUTCDate(1); monthStart.setUTCHours(0, 0, 0, 0)
  const { data, error } = await db.from('knowledge_factory_audit_log').select('credits_consumed').eq('organisation_id', organisationId).eq('outcome', 'completed').gte('created_at', monthStart.toISOString())
  if (error) throw new Error('Knowledge Factory monthly credit usage could not be checked.')
  const used = (data || []).reduce((sum, item) => sum + (Number(item.credits_consumed) || 0), 0)
  if (used + Number(estimatedCredits) > Number(policy.monthly_credit_cap)) { const failure = new Error('This quote exceeds the remaining monthly credit cap.'); failure.status = 409; throw failure }
}

async function writeAudit(db, event) { const { error } = await db.from('knowledge_factory_audit_log').insert(event); if (error) console.error('Knowledge Factory audit write failed', error.code) }
async function assertRateLimit(db, organisationId, userId, mode) {
  const since = new Date(Date.now() - (mode === 'quote' ? 60_000 : 60 * 60_000)).toISOString()
  let query = db.from('knowledge_factory_audit_log').select('id', { count: 'exact', head: true }).eq('organisation_id', organisationId).eq('actor_id', userId).eq('operation', 'property_report').gte('created_at', since)
  if (mode === 'request') query = query.eq('outcome', 'completed')
  const { count, error } = await query
  if (error) throw new Error('Knowledge Factory report limit could not be checked.')
  const limit = mode === 'quote' ? REPORT_QUOTES_PER_MINUTE : REPORT_REQUESTS_PER_HOUR
  if ((count || 0) >= limit) { const error = new Error(mode === 'quote' ? 'Report quote limit reached. Please wait a minute before requesting another quote.' : 'Report request limit reached. Please contact an administrator if another report is required.'); error.status = 429; throw error }
}

function vendorError(body, fallback) { const message = text(Array.isArray(body?.errors) ? body.errors[0]?.message : '', 300); return message ? `${fallback}: ${message}` : fallback }
async function supplierToken(config) {
  if (supplierSession?.expiresAt > Date.now() + 10_000) return supplierSession.token
  const response = await fetch(config.endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: 'mutation ($input: LoginInput!) { login(login: $input) { tokenPayload { expiresUtc token } errors { ... on ArgumentError { message paramName } ... on ArgumentNullError { message paramName } ... on Error { message } } } }', variables: { input: { email: config.email, password: config.password } } }) })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(vendorError(body, `Knowledge Factory login request failed (HTTP ${response.status}).`))
  const graphqlMessage = text(Array.isArray(body.errors) ? body.errors[0]?.message : '', 300)
  if (graphqlMessage) throw new Error(`Knowledge Factory login request failed: ${graphqlMessage}`)
  const payload = body?.data?.login?.tokenPayload || {}; const token = text(payload.token, 10_000); const expiresAt = Date.parse(text(payload.expiresUtc))
  if (!token || !Number.isFinite(expiresAt)) { const message = text(Array.isArray(body?.data?.login?.errors) ? body.data.login.errors[0]?.message : '', 300); throw new Error(message ? `Knowledge Factory login was rejected: ${message}` : 'Knowledge Factory login response did not include a usable token.') }
  supplierSession = { token, expiresAt }; return token
}

function metric(value) { const parsed = typeof value === 'number' ? value : Number(value); return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : null }
function costs(body) { const extension = body?.extensions && typeof body.extensions === 'object' ? body.extensions : {}; const cost = extension.cost && typeof extension.cost === 'object' ? extension.cost : extension; return { fieldCost: metric(cost.fieldCost || cost.field_cost), typeCost: metric(cost.typeCost || cost.type_cost), surcharge: metric(cost.priceSurcharge || cost.price_surcharge), credits: metric(cost.creditsConsumed || cost.credits_consumed) } }
function validatePropertyId(value) { const id = scalarText(value, 30); if (!/^[1-9]\d{0,14}$/.test(id) || !Number.isSafeInteger(Number(id))) throw new Error('A valid property is required.'); return Number(id) }
function validateReportTypes(value) { const types = [...new Set((Array.isArray(value) ? value : []).map((item) => text(item, 80)).filter(Boolean))]; if (!types.length || types.some((type) => !REPORT_TYPES.has(type))) throw new Error('Select one or more supported property report sections.'); return types }
function reportQuery() { return 'query PropertyReport($id: Int!) { propertyById(id: $id) { propertyId erf extent propertyType propertyName propertyNumber propertyYear valuationDate valuationMunicipality valuationValue valuationZoning streetAddress { address isMaster streetName streetNumber streetType x y } suburb { postCode suburbId suburbName town province { provinceName } } } }' }
async function supplierReport(config, propertyId, costMode) {
  const response = await fetch(config.endpoint, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${await supplierToken(config)}`, 'GraphQL-Cost': costMode }, body: JSON.stringify({ operationName: 'PropertyReport', query: reportQuery(), variables: { id: propertyId } }) })
  const body = await response.json().catch(() => ({}))
  if (!response.ok || (Array.isArray(body.errors) && body.errors.length)) throw new Error(vendorError(body, costMode === 'validate' ? 'Knowledge Factory could not validate this property report.' : 'Knowledge Factory could not return this property report.'))
  return { body, costs: costs(body), vendorRequestId: text(response.headers.get('x-request-id'), 200) || null }
}
function reportSummary(body, requestedTypes) {
  const property = body?.data?.propertyById || {}; const addresses = Array.isArray(property.streetAddress) ? property.streetAddress : []; const street = addresses.find((item) => item?.isMaster === true) || addresses[0] || {}; const suburb = property.suburb || {}; const province = suburb.province || {}
  const address = text(street.address, 500) || [text(street.streetNumber, 40), text(street.streetName, 200), text(street.streetType, 80)].filter(Boolean).join(' ')
  return { propertyId: scalarText(property.propertyId, 100), address: address || null, erf: number(property.erf), extent: number(property.extent), propertyType: text(property.propertyType, 120) || null, propertyName: text(property.propertyName, 250) || null, suburb: text(suburb.suburbName, 160) || null, town: text(suburb.town, 160) || null, province: text(province.provinceName, 160) || null, postalCode: text(suburb.postCode, 30) || null, municipalValuation: requestedTypes.includes('municipal_valuation') ? { value: number(property.valuationValue), date: text(property.valuationDate, 80) || null, municipality: text(property.valuationMunicipality, 200) || null, zoning: text(property.valuationZoning, 160) || null } : null }
}

export default async function handler(request, response) {
  if (request.method !== 'POST') return json(response, 405, { error: 'Method not allowed.' })
  try {
    const body = await readBody(request); const organisationId = text(body.organisationId, 100); const action = text(body.action, 100)
    if (!validOrganisationId(organisationId)) return json(response, 400, { error: 'A valid organisation is required.' })
    if (!['status', 'quote_property_report', 'request_property_report', 'list_property_reports'].includes(action)) return json(response, 400, { error: 'Unsupported action.' })
    const config = runtimeConfig(); const db = createClient(config.supabaseUrl, config.serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } }); const actor = await authenticateActor(request, db, organisationId)
    const allowed = await hasReportAccess(db, organisationId, actor.userId)
    const policy = await commercialPolicy(db, organisationId)
    if (action === 'status') return json(response, 200, {
      mode: 'controlled_uat', propertyReportEnabled: allowed,
      commercialPolicy: { packageCode: 'canvassing_core', allowedReportTypes: policy.allowed_report_types, perReportCreditCap: policy.per_report_credit_cap, monthlyCreditCap: policy.monthly_credit_cap, rolloutStage: policy.rollout_stage, supplierContractVersion: policy.supplier_contract_version },
      message: allowed ? 'Property reports are available in this controlled UAT workspace.' : 'Property reports require a separate approved organisation and named-user permission.',
    })
    if (!allowed) { const purpose = text(body.purpose, 500) || 'Property report access check'; await writeAudit(db, { organisation_id: organisationId, actor_id: actor.userId, operation: 'property_report', request_purpose: purpose, request_metadata: { mode: action }, outcome: 'denied', error_code: 'access_not_granted' }); return json(response, 403, { error: 'Knowledge Factory property report access has not been granted.' }) }
    if (action === 'list_property_reports') { const { data, error } = await db.from('knowledge_factory_report_requests').select('id, property_id, requested_report_types, request_purpose, status, quote_expires_at, confirmed_at, field_cost, type_cost, price_surcharge, credits_consumed, report_summary, error_code, created_at, updated_at').eq('organisation_id', organisationId).order('created_at', { ascending: false }).limit(50); if (error) throw new Error('Property reports could not be loaded.'); return json(response, 200, { items: data || [] }) }
    const purpose = text(body.purpose, 500); if (purpose.length < 10) return json(response, 400, { error: 'Provide a report purpose of at least 10 characters.' })
    if (action === 'quote_property_report') {
      const propertyId = validatePropertyId(body.propertyId); const reportTypes = validateReportTypes(body.reportTypes); assertReportTypesAllowed(policy, reportTypes); await assertRateLimit(db, organisationId, actor.userId, 'quote')
      try { const result = await supplierReport(config, propertyId, 'validate'); await assertCreditCaps(db, organisationId, policy, result.costs.credits); const expiresAt = new Date(Date.now() + REPORT_QUOTE_TTL_MS).toISOString(); const { data, error } = await db.from('knowledge_factory_report_requests').insert({ organisation_id: organisationId, actor_id: actor.userId, property_id: propertyId, requested_report_types: reportTypes, request_purpose: purpose, quote_expires_at: expiresAt, field_cost: result.costs.fieldCost, type_cost: result.costs.typeCost, price_surcharge: result.costs.surcharge, credits_consumed: result.costs.credits }).select('id, property_id, requested_report_types, quote_expires_at, field_cost, type_cost, price_surcharge, credits_consumed').single(); if (error || !data) throw new Error('The report quote could not be saved.'); await writeAudit(db, { organisation_id: organisationId, actor_id: actor.userId, operation: 'property_report', request_purpose: purpose, request_metadata: { mode: 'quote', property_id: propertyId, report_types: reportTypes }, outcome: 'validated', vendor_request_id: result.vendorRequestId, field_cost: result.costs.fieldCost, type_cost: result.costs.typeCost, price_surcharge: result.costs.surcharge, credits_consumed: result.costs.credits }); return json(response, 200, { quote: data }) }
      catch (error) { await writeAudit(db, { organisation_id: organisationId, actor_id: actor.userId, operation: 'property_report', request_purpose: purpose, request_metadata: { mode: 'quote', property_id: propertyId, report_types: reportTypes }, outcome: 'failed', error_code: 'supplier_report_quote_failed' }); throw error }
    }
    const quoteId = text(body.quoteId, 100); if (!validOrganisationId(quoteId)) return json(response, 400, { error: 'A valid property report quote is required.' })
    const { data: quote, error: quoteError } = await db.from('knowledge_factory_report_requests').select('id, property_id, requested_report_types, request_purpose, status, quote_expires_at, credits_consumed').eq('id', quoteId).eq('organisation_id', organisationId).eq('actor_id', actor.userId).maybeSingle()
    if (quoteError || !quote) return json(response, 404, { error: 'The property report quote could not be found.' })
    if (quote.status !== 'quoted' || new Date(quote.quote_expires_at).getTime() < Date.now()) { await db.from('knowledge_factory_report_requests').update({ status: 'expired', updated_at: new Date().toISOString() }).eq('id', quote.id).eq('status', 'quoted'); return json(response, 409, { error: 'This quote has expired. Request a new cost estimate.' }) }
    if (quote.request_purpose !== purpose) return json(response, 409, { error: 'The confirmed purpose must match the quoted purpose.' })
    await assertReportTypesAllowed(policy, Array.isArray(quote.requested_report_types) ? quote.requested_report_types : []); await assertCreditCaps(db, organisationId, policy, quote.credits_consumed)
    await assertRateLimit(db, organisationId, actor.userId, 'request'); const { error: submitError } = await db.from('knowledge_factory_report_requests').update({ status: 'submitted', confirmed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', quote.id).eq('status', 'quoted'); if (submitError) throw new Error('The property report could not be submitted.')
    try { const result = await supplierReport(config, Number(quote.property_id), 'report'); const summary = reportSummary(result.body, Array.isArray(quote.requested_report_types) ? quote.requested_report_types : []); const { error: readyError } = await db.from('knowledge_factory_report_requests').update({ status: 'ready', updated_at: new Date().toISOString(), report_summary: summary, vendor_request_id: result.vendorRequestId, field_cost: result.costs.fieldCost, type_cost: result.costs.typeCost, price_surcharge: result.costs.surcharge, credits_consumed: result.costs.credits }).eq('id', quote.id); if (readyError) throw new Error('The property report result could not be saved.'); await writeAudit(db, { organisation_id: organisationId, actor_id: actor.userId, operation: 'property_report', request_purpose: purpose, property_reference: String(quote.property_id), request_metadata: { mode: 'report', report_request_id: quote.id, report_types: quote.requested_report_types }, outcome: 'completed', vendor_request_id: result.vendorRequestId, field_cost: result.costs.fieldCost, type_cost: result.costs.typeCost, price_surcharge: result.costs.surcharge, credits_consumed: result.costs.credits }); return json(response, 200, { report: { id: quote.id, status: 'ready', propertyId: quote.property_id, requestedReportTypes: quote.requested_report_types, summary } }) }
    catch (error) { await db.from('knowledge_factory_report_requests').update({ status: 'failed', updated_at: new Date().toISOString(), error_code: 'supplier_report_failed' }).eq('id', quote.id); await writeAudit(db, { organisation_id: organisationId, actor_id: actor.userId, operation: 'property_report', request_purpose: purpose, property_reference: String(quote.property_id), request_metadata: { mode: 'report', report_request_id: quote.id }, outcome: 'failed', error_code: 'supplier_report_failed' }); throw error }
  } catch (error) { json(response, Number(error?.status || 502), { error: error?.message || 'Knowledge Factory request failed.' }) }
}
