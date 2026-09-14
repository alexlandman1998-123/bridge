import { createClient } from '@supabase/supabase-js'

const ADMIN_ROLES = new Set(['principal', 'owner', 'director', 'admin', 'super_admin', 'agency_admin'])
const SCENARIOS = new Set(['map_parcel', 'property_snapshot', 'municipal_valuation'])
const STATUSES = new Set(['planned', 'running', 'passed', 'failed', 'cancelled'])
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function text(value, max = 1000) { return typeof value === 'string' ? value.trim().slice(0, max) : '' }
function header(headers, name) { const value = headers?.[name] || headers?.[name.toLowerCase()]; return Array.isArray(value) ? text(value[0], 20_000) : text(value, 20_000) }
function json(response, status, body) { response.status(status).setHeader('Content-Type', 'application/json; charset=utf-8'); response.setHeader('Cache-Control', 'no-store'); response.end(JSON.stringify(body)) }
function validUuid(value) { return UUID.test(text(value, 100)) }
function validPropertyId(value) { const id = text(String(value || ''), 30); return /^[1-9]\d{0,14}$/.test(id) && Number.isSafeInteger(Number(id)) ? Number(id) : null }

async function readBody(request) {
  if (request.body && typeof request.body === 'object' && !Buffer.isBuffer(request.body)) return request.body
  if (typeof request.body === 'string') return JSON.parse(request.body || '{}')
  const chunks = []; for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
}

function runtimeConfig() {
  const missing = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'].filter((key) => !text(process.env[key], 10_000))
  if (missing.length) { const error = new Error(`Missing private server configuration: ${missing.join(', ')}.`); error.status = 503; throw error }
  return { supabaseUrl: text(process.env.SUPABASE_URL, 2_000), serviceRoleKey: text(process.env.SUPABASE_SERVICE_ROLE_KEY, 10_000) }
}

function normalizeRole(value) { const role = text(value).toLowerCase(); if (role === 'administrator') return 'admin'; if (role === 'superadmin') return 'super_admin'; if (role === 'principal / owner') return 'principal'; return role }
async function authenticateAdministrator(request, db, organisationId) {
  const token = header(request.headers, 'authorization').replace(/^Bearer\s+/i, '')
  if (!token) { const error = new Error('Your browser did not provide an active sign-in token.'); error.status = 401; throw error }
  const { data: { user }, error: userError } = await db.auth.getUser(token)
  if (userError || !user?.id) { const error = new Error('Your sign-in token could not be verified. Please sign in again.'); error.status = 401; throw error }
  const { data: membership, error: membershipError } = await db.from('organisation_users').select('status, membership_status, role, workspace_role, organization_role, organisation_role').eq('organisation_id', organisationId).eq('user_id', user.id).maybeSingle()
  if (membershipError || !membership) { const error = new Error('You do not belong to this organisation.'); error.status = 403; throw error }
  const active = text(membership.membership_status || membership.status).toLowerCase() === 'active'
  const role = normalizeRole(membership.workspace_role || membership.organization_role || membership.organisation_role || membership.role)
  if (!active || !ADMIN_ROLES.has(role)) { const error = new Error('Only a principal-level administrator can manage the controlled UAT set.'); error.status = 403; throw error }
  return user.id
}

function validateCase(body) {
  const propertyId = validPropertyId(body.propertyId)
  const scenario = text(body.scenario, 80)
  const purpose = text(body.purpose, 500)
  const expectedOutcome = text(body.expectedOutcome, 1000)
  if (!propertyId) throw new Error('Enter a valid UAT property ID.')
  if (!SCENARIOS.has(scenario)) throw new Error('Select a supported UAT scenario.')
  if (purpose.length < 10) throw new Error('Provide a UAT purpose of at least 10 characters.')
  if (expectedOutcome.length < 10) throw new Error('Describe the expected outcome in at least 10 characters.')
  return { property_id: propertyId, scenario, request_purpose: purpose, expected_outcome: expectedOutcome }
}

export default async function handler(request, response) {
  if (request.method !== 'POST') return json(response, 405, { error: 'Method not allowed.' })
  try {
    const body = await readBody(request); const organisationId = text(body.organisationId, 100); const action = text(body.action, 100)
    if (!validUuid(organisationId)) return json(response, 400, { error: 'A valid organisation is required.' })
    if (!['list_cases', 'create_case', 'update_case'].includes(action)) return json(response, 400, { error: 'Unsupported action.' })
    const config = runtimeConfig(); const db = createClient(config.supabaseUrl, config.serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } }); const actorId = await authenticateAdministrator(request, db, organisationId)
    if (action === 'list_cases') {
      const { data, error } = await db.from('knowledge_factory_uat_cases').select('id, property_id, scenario, request_purpose, expected_outcome, status, outcome_note, report_request_id, created_by, updated_by, started_at, completed_at, created_at, updated_at').eq('organisation_id', organisationId).order('created_at', { ascending: false }).limit(20)
      if (error) throw new Error('Controlled UAT cases could not be loaded.')
      return json(response, 200, { items: data || [], activeCaseLimit: 5 })
    }
    if (action === 'create_case') {
      const values = validateCase(body)
      const { count, error: countError } = await db.from('knowledge_factory_uat_cases').select('id', { count: 'exact', head: true }).eq('organisation_id', organisationId).in('status', ['planned', 'running'])
      if (countError) throw new Error('The UAT case limit could not be checked.')
      if ((count || 0) >= 5) return json(response, 409, { error: 'The controlled UAT set already has five active cases. Complete or cancel a case before adding another.' })
      const { data, error } = await db.from('knowledge_factory_uat_cases').insert({ organisation_id: organisationId, ...values, created_by: actorId, updated_by: actorId }).select('id, property_id, scenario, request_purpose, expected_outcome, status, outcome_note, report_request_id, started_at, completed_at, created_at, updated_at').single()
      if (error || !data) throw new Error('The controlled UAT case could not be created.')
      await db.from('knowledge_factory_uat_case_events').insert({ case_id: data.id, organisation_id: organisationId, actor_id: actorId, event_type: 'created' })
      return json(response, 201, { item: data })
    }
    const caseId = text(body.caseId, 100); const status = text(body.status, 80); const outcomeNote = text(body.outcomeNote, 1000); const reportRequestId = text(body.reportRequestId, 100)
    if (!validUuid(caseId) || !STATUSES.has(status)) return json(response, 400, { error: 'A valid UAT case and status are required.' })
    if (reportRequestId && !validUuid(reportRequestId)) return json(response, 400, { error: 'The linked report reference is invalid.' })
    if (reportRequestId) {
      const { data: report, error: reportError } = await db.from('knowledge_factory_report_requests').select('id').eq('id', reportRequestId).eq('organisation_id', organisationId).maybeSingle()
      if (reportError || !report) return json(response, 400, { error: 'The linked report must belong to this organisation.' })
    }
    if (['passed', 'failed', 'cancelled'].includes(status) && outcomeNote.length < 3) return json(response, 400, { error: 'Add a short outcome note before completing or cancelling a UAT case.' })
    const { data: current, error: currentError } = await db.from('knowledge_factory_uat_cases').select('id, status, started_at').eq('id', caseId).eq('organisation_id', organisationId).maybeSingle()
    if (currentError || !current) return json(response, 404, { error: 'The controlled UAT case could not be found.' })
    const timestamp = new Date().toISOString(); const complete = ['passed', 'failed', 'cancelled'].includes(status)
    const patch = { status, outcome_note: outcomeNote || null, report_request_id: reportRequestId || null, updated_by: actorId, updated_at: timestamp, started_at: status === 'planned' ? null : (current.started_at || timestamp), completed_at: complete ? timestamp : null }
    const { data, error } = await db.from('knowledge_factory_uat_cases').update(patch).eq('id', caseId).eq('organisation_id', organisationId).select('id, property_id, scenario, request_purpose, expected_outcome, status, outcome_note, report_request_id, started_at, completed_at, created_at, updated_at').single()
    if (error || !data) throw new Error('The controlled UAT case could not be updated.')
    const eventType = current.status === status ? 'note_updated' : status
    await db.from('knowledge_factory_uat_case_events').insert({ case_id: caseId, organisation_id: organisationId, actor_id: actorId, event_type: eventType, event_note: outcomeNote || null })
    return json(response, 200, { item: data })
  } catch (error) { json(response, Number(error?.status || 502), { error: error?.message || 'Knowledge Factory controlled UAT request failed.' }) }
}
