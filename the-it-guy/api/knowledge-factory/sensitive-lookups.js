import { createClient } from '@supabase/supabase-js'

const ADMIN_ROLES = new Set(['principal', 'owner', 'director', 'admin', 'super_admin', 'agency_admin'])
const LOOKUP_TYPES = new Set(['credit_check', 'bonds', 'transfers', 'avm', 'recent_sales'])
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function text(value, max = 500) { return typeof value === 'string' ? value.trim().slice(0, max) : '' }
function header(headers, name) { const value = headers?.[name] || headers?.[name.toLowerCase()]; return Array.isArray(value) ? text(value[0], 20_000) : text(value, 20_000) }
function validUuid(value) { return UUID.test(text(value, 100)) }
function send(response, status, body) { response.status(status).setHeader('Content-Type', 'application/json; charset=utf-8'); response.setHeader('Cache-Control', 'no-store'); response.end(JSON.stringify(body)) }
function role(value) { const normalized = text(value).toLowerCase(); if (normalized === 'administrator') return 'admin'; if (normalized === 'superadmin') return 'super_admin'; if (normalized === 'principal / owner') return 'principal'; return normalized }

async function readBody(request) {
  if (request.body && typeof request.body === 'object' && !Buffer.isBuffer(request.body)) return request.body
  if (typeof request.body === 'string') return JSON.parse(request.body || '{}')
  const chunks = []; for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
}

function config() {
  const missing = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'].filter((key) => !text(process.env[key], 10_000))
  if (missing.length) { const error = new Error(`Missing private server configuration: ${missing.join(', ')}.`); error.status = 503; throw error }
  return { url: text(process.env.SUPABASE_URL, 2_000), key: text(process.env.SUPABASE_SERVICE_ROLE_KEY, 10_000) }
}

async function actor(request, db, organisationId) {
  const token = header(request.headers, 'authorization').replace(/^Bearer\s+/i, '')
  if (!token) { const error = new Error('Your browser did not provide an active sign-in token.'); error.status = 401; throw error }
  const { data: { user }, error: userError } = await db.auth.getUser(token)
  if (userError || !user?.id) { const error = new Error('Your sign-in token could not be verified. Please sign in again.'); error.status = 401; throw error }
  const { data: membership, error: membershipError } = await db.from('organisation_users').select('status, membership_status, role, workspace_role, organization_role, organisation_role').eq('organisation_id', organisationId).eq('user_id', user.id).maybeSingle()
  const active = text(membership?.membership_status || membership?.status).toLowerCase() === 'active'
  if (membershipError || !membership || !active) { const error = new Error('You do not belong to this organisation.'); error.status = 403; throw error }
  const membershipRole = role(membership.workspace_role || membership.organization_role || membership.organisation_role || membership.role)
  return { userId: user.id, isAdmin: ADMIN_ROLES.has(membershipRole) }
}

function requestValues(body) {
  const lookupType = text(body.lookupType, 80); const subjectLabel = text(body.subjectLabel, 200); const businessPurpose = text(body.businessPurpose, 500); const consentVersion = text(body.consentVersion, 120)
  if (!LOOKUP_TYPES.has(lookupType)) throw new Error('Select a supported lookup type.')
  if (subjectLabel.length < 2) throw new Error('Enter a subject label.')
  if (businessPurpose.length < 10) throw new Error('Provide a specific business purpose.')
  if (body.consentCaptured !== true || !consentVersion) throw new Error('Record explicit consent and its version before requesting this lookup.')
  return { lookup_type: lookupType, subject_label: subjectLabel, business_purpose: businessPurpose, consent_version: consentVersion }
}

export default async function handler(request, response) {
  if (request.method !== 'POST') return send(response, 405, { error: 'Method not allowed.' })
  try {
    const body = await readBody(request); const organisationId = text(body.organisationId, 100); const action = text(body.action, 40)
    if (!validUuid(organisationId) || !['list_cases', 'create_case', 'review_case'].includes(action)) return send(response, 400, { error: 'A valid organisation and action are required.' })
    const runtime = config(); const db = createClient(runtime.url, runtime.key, { auth: { autoRefreshToken: false, persistSession: false } }); const currentActor = await actor(request, db, organisationId)
    if (action === 'list_cases') {
      let query = db.from('knowledge_factory_sensitive_lookup_cases').select('id, lookup_type, subject_label, business_purpose, consent_captured_at, consent_version, status, reviewed_by, reviewed_at, review_note, provider_status, created_at').eq('organisation_id', organisationId).order('created_at', { ascending: false }).limit(50)
      if (!currentActor.isAdmin) query = query.eq('created_by', currentActor.userId)
      const { data, error } = await query
      if (error) throw new Error('Sensitive lookup cases could not be loaded.')
      return send(response, 200, { items: data || [], providerExecutionEnabled: false })
    }
    if (action === 'create_case') {
      const values = requestValues(body); const prospectId = validUuid(body.prospectId) ? text(body.prospectId, 100) : null
      const { data, error } = await db.from('knowledge_factory_sensitive_lookup_cases').insert({ organisation_id: organisationId, prospect_id: prospectId, created_by: currentActor.userId, consent_captured_at: new Date().toISOString(), consent_captured_by: currentActor.userId, ...values, status: 'pending_approval', provider_status: 'not_configured' }).select('id, lookup_type, subject_label, business_purpose, consent_captured_at, consent_version, status, provider_status, created_at').single()
      if (error || !data) throw new Error('Sensitive lookup case could not be created.')
      await db.from('knowledge_factory_sensitive_lookup_events').insert({ case_id: data.id, organisation_id: organisationId, actor_user_id: currentActor.userId, event_type: 'requested' })
      return send(response, 201, { item: data, providerExecutionEnabled: false })
    }
    if (!currentActor.isAdmin) { const error = new Error('Only an organisation administrator can review a sensitive lookup request.'); error.status = 403; throw error }
    const caseId = text(body.caseId, 100); const decision = text(body.decision, 30); const reviewNote = text(body.reviewNote, 500)
    if (!validUuid(caseId) || !['approved', 'rejected'].includes(decision) || reviewNote.length < 3) return send(response, 400, { error: 'Choose an approval decision and add a short review note.' })
    const { data: current, error: currentError } = await db.from('knowledge_factory_sensitive_lookup_cases').select('id, status').eq('id', caseId).eq('organisation_id', organisationId).maybeSingle()
    if (currentError || !current) return send(response, 404, { error: 'Sensitive lookup case could not be found.' })
    if (current.status !== 'pending_approval') return send(response, 409, { error: 'Only pending lookup cases can be reviewed.' })
    const status = decision === 'approved' ? 'approved_for_quote' : 'rejected'; const timestamp = new Date().toISOString()
    const { data, error } = await db.from('knowledge_factory_sensitive_lookup_cases').update({ status, approved_by: decision === 'approved' ? currentActor.userId : null, approved_at: decision === 'approved' ? timestamp : null, reviewed_by: currentActor.userId, reviewed_at: timestamp, review_note: reviewNote, updated_at: timestamp }).eq('id', caseId).eq('organisation_id', organisationId).select('id, lookup_type, subject_label, business_purpose, consent_captured_at, consent_version, status, reviewed_by, reviewed_at, review_note, provider_status, created_at').single()
    if (error || !data) throw new Error('Sensitive lookup case could not be reviewed.')
    await db.from('knowledge_factory_sensitive_lookup_events').insert({ case_id: caseId, organisation_id: organisationId, actor_user_id: currentActor.userId, event_type: decision, event_note: reviewNote })
    return send(response, 200, { item: data, providerExecutionEnabled: false })
  } catch (error) { send(response, Number(error?.status || 502), { error: error?.message || 'Sensitive lookup workflow is unavailable.' }) }
}
