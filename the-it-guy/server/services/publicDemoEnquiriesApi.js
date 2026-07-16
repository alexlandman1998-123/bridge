import fs from 'node:fs'
import crypto from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { writeNodeJsonResponse } from './hqMissionControlApi.js'
import { authenticateHqRequest } from './hqMissionControlSnapshotService.js'

let cachedRuntimeEnv = null

const DEMO_ENQUIRIES_TABLE = 'demo_enquiries'
const ADMIN_LEAD_SELECT = [
  'id',
  'intake_kind',
  'form_key',
  'form_version',
  'status',
  'sales_stage',
  'priority',
  'assigned_to_user_id',
  'first_name',
  'last_name',
  'email',
  'phone',
  'company',
  'role',
  'business_size',
  'monthly_volume',
  'demo_focus',
  'services_interested',
  'preferred_window',
  'preferred_contact_method',
  'biggest_frustration',
  'source',
  'page_url',
  'utm',
  'popia_consent_given',
  'marketing_consent',
  'dedupe_status',
  'duplicate_of_enquiry_id',
  'next_action',
  'next_action_at',
  'contacted_at',
  'qualified_at',
  'closed_at',
  'lost_reason',
  'converted_organisation_id',
  'internal_notes',
  'notification_status',
  'notified_at',
  'submitted_at',
  'created_at',
  'updated_at',
].join(',')
const ADMIN_LEAD_STAGES = new Set(['new', 'contacted', 'qualified', 'demo_scheduled', 'proposal', 'won', 'lost', 'closed', 'spam'])
const ADMIN_LEAD_MUTABLE_STAGES = new Set(['new', 'contacted', 'qualified', 'demo_scheduled', 'proposal', 'won', 'lost', 'spam'])
const ADMIN_LEAD_PRIORITIES = new Set(['low', 'normal', 'high', 'urgent'])
const ADMIN_LEAD_PATCH_FIELDS = new Set(['salesStage', 'priority', 'assignedToUserId', 'nextAction', 'nextActionAt', 'lostReason', 'internalNotes'])
const ADMIN_STAFF_ROLE_TOKENS = new Set([
  'platform_admin', 'super_admin', 'internal_admin', 'executive', 'executive_level',
  'founder', 'hq_staff', 'manager', 'sales', 'sales_manager', 'support_agent',
  'customer_support', 'operations', 'operations_manager',
])
const ADMIN_LEAD_SORTS = new Map([
  ['newest', { column: 'created_at', ascending: false }],
  ['oldest', { column: 'created_at', ascending: true }],
  ['recently_updated', { column: 'updated_at', ascending: false }],
  ['next_action', { column: 'next_action_at', ascending: true, nullsFirst: false }],
])
const DEFAULT_NOTIFICATION_EMAIL = 'alexlandman1998@gmail.com'
const INTAKE_FORM_KEY = 'arch9-new-business-intake'
const INTAKE_FORM_VERSION = '2026-07-16'
const INTAKE_PRIVACY_VERSION = '2026-07-16'
const PUBLIC_INTAKE_RATE_LIMIT = 10
const ALLOWED_ORIGINS = new Set([
  'https://arch9.co.za',
  'https://www.arch9.co.za',
  'https://app.arch9.co.za',
  'https://admin.arch9.co.za',
  'http://localhost:5173',
  'http://localhost:5179',
])

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeEmail(value = '') {
  return normalizeText(value).toLowerCase()
}

function getBearerToken(headers = {}) {
  const authorization = headers?.authorization || headers?.Authorization || ''
  return normalizeText(String(authorization).match(/^Bearer\s+(.+)$/i)?.[1])
}

function normalizeRoleToken(value = '') {
  return normalizeText(value).toLowerCase().replace(/[\s-]+/g, '_')
}

function normalizeArray(value = []) {
  if (Array.isArray(value)) return value.map(normalizeText).filter(Boolean)
  const text = normalizeText(value)
  return text ? [text] : []
}

function normalizePhone(value = '') {
  return normalizeText(value).replace(/[^0-9]/g, '')
}

function safeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
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
  const stagingEnvPath = new URL('../../.env.staging.local', import.meta.url)
  const processEnvSource = globalThis?.process?.env || {}
  const processEnv = Object.fromEntries(Object.entries(processEnvSource).map(([key, value]) => [key, normalizeText(value)]))
  const merged = {
    ...parseEnvFile(rootEnvPath),
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
    const error = new Error('Demo enquiry backend is not configured.')
    error.code = 'demo_enquiry_backend_unconfigured'
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

function createAuthenticatedClient(accessToken) {
  const env = getRuntimeEnv()
  const supabaseUrl = normalizeText(env.SUPABASE_URL || env.VITE_SUPABASE_URL)
  const anonKey = normalizeText(env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY)
  if (!supabaseUrl || !anonKey || !accessToken) {
    const error = new Error('Authenticated lead workflow is not configured.')
    error.code = 'lead_workflow_unconfigured'
    error.status = 503
    throw error
  }
  return createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  })
}

async function listAdminLeadAssignees(serviceClient, currentUserId = '') {
  const result = await serviceClient
    .from('profiles')
    .select('id,email,full_name,first_name,last_name,system_role,department,role')
    .limit(250)
  if (result.error) throw result.error

  return (result.data || [])
    .filter((staff) => {
      if (staff.id === currentUserId) return true
      return [staff.system_role, staff.department, staff.role]
        .map(normalizeRoleToken)
        .some((token) => ADMIN_STAFF_ROLE_TOKENS.has(token))
    })
    .map((staff) => ({
      id: staff.id,
      name: normalizeText(staff.full_name) || [staff.first_name, staff.last_name].map(normalizeText).filter(Boolean).join(' ') || staff.email,
      email: staff.email,
      role: normalizeText(staff.system_role || staff.department || staff.role),
    }))
    .sort((left, right) => left.name.localeCompare(right.name))
}

function validateAdminLeadPatch(payload = {}) {
  const patch = payload?.patch && typeof payload.patch === 'object' && !Array.isArray(payload.patch) ? payload.patch : {}
  const unknownFields = Object.keys(patch).filter((key) => !ADMIN_LEAD_PATCH_FIELDS.has(key))
  if (unknownFields.length) return { error: `Unsupported lead fields: ${unknownFields.join(', ')}.` }
  if (!Object.keys(patch).length) return { error: 'At least one lead workflow field is required.' }

  const stage = normalizeText(patch.salesStage)
  const priority = normalizeText(patch.priority)
  if (Object.hasOwn(patch, 'salesStage') && !stage) return { error: 'Select a valid sales stage.' }
  if (Object.hasOwn(patch, 'priority') && !priority) return { error: 'Select a valid priority.' }
  if (stage && !ADMIN_LEAD_MUTABLE_STAGES.has(stage)) return { error: 'Select a valid sales stage.' }
  if (priority && !ADMIN_LEAD_PRIORITIES.has(priority)) return { error: 'Select a valid priority.' }
  if (stage === 'lost' && !normalizeText(patch.lostReason)) return { error: 'A lost reason is required when closing a lead as lost.' }
  if (patch.nextActionAt && Number.isNaN(new Date(patch.nextActionAt).getTime())) return { error: 'Enter a valid next-action date.' }
  if (normalizeText(patch.nextAction).length > 500) return { error: 'Next action must be 500 characters or fewer.' }
  if (normalizeText(patch.lostReason).length > 1000) return { error: 'Lost reason must be 1,000 characters or fewer.' }
  if (normalizeText(patch.internalNotes).length > 5000) return { error: 'Internal notes must be 5,000 characters or fewer.' }
  return { patch }
}

function getCorsOrigin(headers = {}) {
  const origin = normalizeText(headers.origin || headers.Origin)
  if (origin && ALLOWED_ORIGINS.has(origin)) return origin
  return 'https://www.arch9.co.za'
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

function getCorsHeaders(headers = {}) {
  return {
    'Access-Control-Allow-Origin': getCorsOrigin(headers),
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Accept',
    Vary: 'Origin',
  }
}

function buildRequestFingerprint(headers = {}) {
  const env = getRuntimeEnv()
  const forwarded = normalizeText(headers['x-forwarded-for'] || headers['X-Forwarded-For']).split(',')[0].trim()
  const remoteAddress = normalizeText(headers['x-real-ip'] || headers['X-Real-IP'])
  const userAgent = normalizeText(headers['user-agent'] || headers['User-Agent'])
  const source = forwarded || remoteAddress
  if (!source) return null
  const salt = normalizeText(env.INTAKE_FINGERPRINT_SALT || env.SUPABASE_SERVICE_ROLE_KEY)
  if (!salt) return null
  return crypto.createHash('sha256').update(`${salt}|${source}|${userAgent}`).digest('hex')
}

function getRequestUrl(url = '', headers = {}) {
  const host = normalizeText(headers.host || headers.Host) || 'app.arch9.co.za'
  const protocol = normalizeText(headers['x-forwarded-proto'] || headers['X-Forwarded-Proto']) || 'https'
  return new URL(url || '/api/admin/demo-enquiries', `${protocol}://${host}`)
}

function toPositiveInteger(value, fallback, max = 100) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback
  return Math.min(Math.round(numeric), max)
}

function escapeSearchTerm(value = '') {
  return normalizeText(value)
    .replace(/[,%()]/g, ' ')
    .replace(/\s+/g, ' ')
    .slice(0, 100)
}

function getAdminErrorStatus(error = {}) {
  const explicit = Number(error?.status || error?.statusCode || 0)
  if (explicit >= 400) return explicit
  if (error?.code === '22023' || error?.code === '23514' || error?.code === '23503') return 422
  if (error?.code === '42501') return 403
  if (error?.code === 'P0002') return 404
  return 500
}

function validatePayload(payload = {}) {
  const errors = {}
  const email = normalizeEmail(payload.email)
  const intakeKind = normalizeText(payload.intakeKind) || 'demo_request'

  if (!normalizeText(payload.role)) errors.role = 'Role is required.'
  if (!normalizeText(payload.firstName)) errors.firstName = 'First name is required.'
  if (!normalizeText(payload.lastName)) errors.lastName = 'Last name is required.'
  if (!email) {
    errors.email = 'Email is required.'
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = 'Enter a valid email address.'
  }
  if (!normalizeText(payload.phone)) errors.phone = 'Phone number is required.'
  if (!normalizeText(payload.company)) errors.company = 'Company is required.'
  if (!normalizeArray(payload.preferredWindow).length) errors.preferredWindow = 'Preferred window is required.'
  if (intakeKind === 'new_business_partner') {
    if (normalizeText(payload.formKey) !== INTAKE_FORM_KEY) errors.formKey = 'Unsupported intake form.'
    if (normalizeText(payload.formVersion) !== INTAKE_FORM_VERSION) errors.formVersion = 'Unsupported intake form version.'
    if (!normalizeText(payload.submissionKey)) errors.submissionKey = 'A submission key is required.'
    if (!normalizeText(payload.preferredContactMethod)) errors.preferredContactMethod = 'Choose a preferred contact method.'
    if (!normalizeArray(payload.servicesInterested).length) errors.servicesInterested = 'Choose at least one area of interest.'
    if (payload.popiaConsentGiven !== true) errors.popiaConsentGiven = 'Consent to process this enquiry is required.'
    if (!normalizeText(payload.popiaConsentAt)) errors.popiaConsentAt = 'Consent evidence is required.'
    if (normalizeText(payload.popiaConsentAt) && Number.isNaN(new Date(payload.popiaConsentAt).getTime())) errors.popiaConsentAt = 'Consent evidence is invalid.'
    if (normalizeText(payload.privacyPolicyVersion) !== INTAKE_PRIVACY_VERSION) errors.privacyPolicyVersion = 'The privacy notice version is invalid.'
  }

  for (const [field, limit] of Object.entries({ firstName: 100, lastName: 100, email: 254, phone: 50, company: 200, role: 100, biggestFrustration: 3000, submissionKey: 160 })) {
    if (normalizeText(payload[field]).length > limit) errors[field] = `${field} is too long.`
  }

  return errors
}

function mapPayloadToRow(payload = {}, headers = {}) {
  const context = safeObject(payload.context)
  const utm = safeObject(context.utm)
  const intakeKind = normalizeText(payload.intakeKind) || 'demo_request'
  const consentAt = normalizeText(payload.popiaConsentAt)

  return {
    status: 'new',
    sales_stage: 'new',
    intake_kind: intakeKind,
    form_key: normalizeText(payload.formKey) || 'arch9-book-demo-wizard',
    form_version: normalizeText(payload.formVersion) || null,
    submission_key: normalizeText(payload.submissionKey).toLowerCase() || null,
    role: normalizeText(payload.role),
    first_name: normalizeText(payload.firstName),
    last_name: normalizeText(payload.lastName),
    email: normalizeEmail(payload.email),
    phone: normalizeText(payload.phone),
    company: normalizeText(payload.company),
    business_size: normalizeText(payload.businessSize),
    monthly_volume: normalizeText(payload.monthlyVolume),
    role_specific_answers: safeObject(payload.roleSpecificAnswers),
    demo_focus: normalizeArray(payload.demoFocus),
    services_interested: normalizeArray(payload.servicesInterested),
    biggest_frustration: normalizeText(payload.biggestFrustration),
    preferred_window: normalizeArray(payload.preferredWindow),
    preferred_contact_method: normalizeText(payload.preferredContactMethod) || null,
    popia_consent_given: payload.popiaConsentGiven === true,
    popia_consent_at: consentAt || null,
    privacy_policy_version: normalizeText(payload.privacyPolicyVersion) || null,
    marketing_consent: payload.marketingConsent === true,
    request_fingerprint: buildRequestFingerprint(headers),
    source: normalizeText(payload.source) || 'arch9-book-demo-wizard',
    page_url: normalizeText(context.pageUrl),
    referrer: normalizeText(context.referrer),
    utm,
    user_agent: normalizeText(context.userAgent),
    raw_payload: payload,
    submitted_at: normalizeText(payload.submittedAt) || new Date().toISOString(),
  }
}

async function findExistingSubmission(client, submissionKey) {
  if (!submissionKey) return null
  const result = await client
    .from(DEMO_ENQUIRIES_TABLE)
    .select('id,created_at')
    .eq('submission_key', submissionKey)
    .maybeSingle()
  if (result.error) throw result.error
  return result.data || null
}

async function enforcePublicIntakeRateLimit(client, requestFingerprint) {
  if (!requestFingerprint) return
  const threshold = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const result = await client
    .from(DEMO_ENQUIRIES_TABLE)
    .select('id', { count: 'exact', head: true })
    .eq('request_fingerprint', requestFingerprint)
    .gte('created_at', threshold)
  if (result.error) throw result.error
  if ((result.count || 0) >= PUBLIC_INTAKE_RATE_LIMIT) {
    const error = new Error('Too many enquiries were submitted. Please try again later.')
    error.code = 'intake_rate_limited'
    error.status = 429
    throw error
  }
}

async function hasMatchingLead(client, row = {}) {
  const email = normalizeEmail(row.email)
  const phone = normalizePhone(row.phone)
  if (!email && !phone) return false
  const filters = []
  if (email) filters.push(`normalized_email.eq.${email}`)
  if (phone) filters.push(`normalized_phone.eq.${phone}`)
  const result = await client.from(DEMO_ENQUIRIES_TABLE).select('id').or(filters.join(',')).limit(1)
  if (result.error) throw result.error
  return Boolean(result.data?.length)
}

function escapeHtml(value = '') {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function buildNotificationContent(row, enquiryId = '') {
  const fullName = [row.first_name, row.last_name].filter(Boolean).join(' ')
  const adminUrl = `https://admin.arch9.co.za/platform/leads${enquiryId ? `?lead=${encodeURIComponent(enquiryId)}` : ''}`
  const focus = normalizeArray(row.demo_focus).join(', ')
  const preferredWindow = normalizeArray(row.preferred_window).join(', ')

  const text = [
    `New Arch9 business enquiry: ${fullName || row.company || 'Website lead'}`,
    '',
    `Role: ${row.role}`,
    `Company: ${row.company}`,
    `Email: ${row.email}`,
    `Phone: ${row.phone}`,
    row.business_size ? `Business size: ${row.business_size}` : '',
    row.monthly_volume ? `Monthly volume: ${row.monthly_volume}` : '',
    focus ? `Demo focus: ${focus}` : '',
    preferredWindow ? `Preferred window: ${preferredWindow}` : '',
    row.biggest_frustration ? `Frustration: ${row.biggest_frustration}` : '',
    row.page_url ? `Source page: ${row.page_url}` : '',
    `Admin: ${adminUrl}`,
  ].filter(Boolean).join('\n')

  const html = `
    <div style="font-family:Inter,Arial,sans-serif;line-height:1.6;color:#10231d">
      <h1 style="font-size:22px;margin:0 0 16px">New Arch9 business enquiry</h1>
      <p style="margin:0 0 18px;color:#51645d">A new partnership or demo enquiry was submitted from the Arch9 website.</p>
      <table style="border-collapse:collapse;width:100%;max-width:640px">
        ${[
          ['Name', fullName],
          ['Role', row.role],
          ['Company', row.company],
          ['Email', row.email],
          ['Phone', row.phone],
          ['Business size', row.business_size],
          ['Monthly volume', row.monthly_volume],
          ['Demo focus', focus],
          ['Preferred window', preferredWindow],
          ['Biggest frustration', row.biggest_frustration],
          ['Source page', row.page_url],
        ]
          .filter(([, value]) => normalizeText(value))
          .map(([label, value]) => `
            <tr>
              <td style="border-bottom:1px solid #e6eee9;padding:8px 12px 8px 0;font-weight:700;color:#0a4d3d">${escapeHtml(label)}</td>
              <td style="border-bottom:1px solid #e6eee9;padding:8px 0">${escapeHtml(value)}</td>
            </tr>
          `).join('')}
      </table>
      <p style="margin:22px 0 0">
        <a href="${escapeHtml(adminUrl)}" style="display:inline-block;border-radius:999px;background:#064537;color:#fff;padding:12px 18px;text-decoration:none;font-weight:700">Open in Arch9 admin</a>
      </p>
    </div>
  `

  return { html, text, adminUrl }
}

async function sendNotificationEmail(row, enquiryId) {
  const env = getRuntimeEnv()
  const apiKey = normalizeText(env.RESEND_API_KEY)
  const to = normalizeText(env.DEMO_ENQUIRY_NOTIFY_EMAIL || env.ARCH9_DEMO_NOTIFY_EMAIL || DEFAULT_NOTIFICATION_EMAIL)

  if (!apiKey) {
    return { sent: false, skipped: true, reason: 'missing_resend_api_key' }
  }
  if (!to) {
    return { sent: false, skipped: true, reason: 'missing_notification_recipient' }
  }

  const from = normalizeText(env.ARCH9_RESEND_FROM_EMAIL || env.RESEND_FROM_EMAIL) || 'Arch9 <onboarding@resend.dev>'
  const replyTo = row.email || undefined
  const { html, text } = buildNotificationContent(row, enquiryId)
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to,
      subject: `New Arch9 business enquiry: ${row.company || row.email}`,
      html,
      text,
      reply_to: replyTo,
    }),
  })

  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    return { sent: false, error: data?.message || data?.error || 'resend_rejected_email', status: response.status }
  }

  return { sent: true, provider: 'resend', id: data?.id || null }
}

async function updateNotificationStatus(client, enquiryId, notificationResult) {
  if (!enquiryId) return
  const result = await client
    .from(DEMO_ENQUIRIES_TABLE)
    .update({
      notification_status: notificationResult?.sent ? 'sent' : notificationResult?.skipped ? 'skipped' : 'failed',
      notification_result: notificationResult || {},
      notified_at: notificationResult?.sent ? new Date().toISOString() : null,
    })
    .eq('id', enquiryId)
  if (result.error) throw result.error
}

async function readJsonBody(body) {
  if (!body) return {}
  if (typeof body === 'object') return body
  if (typeof body === 'string') return JSON.parse(body || '{}')
  return {}
}

export async function createPublicDemoEnquiriesResponse({ method = 'POST', headers = {}, body = null } = {}) {
  const corsHeaders = getCorsHeaders(headers)
  const normalizedMethod = normalizeText(method || 'POST').toUpperCase()

  if (normalizedMethod === 'OPTIONS') {
    return {
      status: 204,
      headers: corsHeaders,
      body: null,
    }
  }

  if (normalizedMethod !== 'POST') {
    return buildJsonResponse(405, {
      error: 'method_not_allowed',
      message: 'Demo enquiries only supports POST.',
    }, corsHeaders)
  }

  try {
    const payload = await readJsonBody(body)
    if (normalizeText(payload.website)) {
      return buildJsonResponse(200, { ok: true, skipped: true }, corsHeaders)
    }

    const errors = validatePayload(payload)
    if (Object.keys(errors).length) {
      return buildJsonResponse(422, {
        error: 'validation_failed',
        message: 'Please complete the required fields.',
        errors,
      }, corsHeaders)
    }

    const client = createServiceClient()
    const row = mapPayloadToRow(payload, headers)
    const existingSubmission = await findExistingSubmission(client, row.submission_key)
    if (existingSubmission) {
      return buildJsonResponse(200, {
        ok: true,
        duplicate: true,
        enquiry: { id: existingSubmission.id, createdAt: existingSubmission.created_at },
      }, corsHeaders)
    }
    await enforcePublicIntakeRateLimit(client, row.request_fingerprint)
    if (await hasMatchingLead(client, row)) row.dedupe_status = 'possible_duplicate'
    const insertResult = await client
      .from(DEMO_ENQUIRIES_TABLE)
      .insert(row)
      .select('id, created_at')
      .single()

    if (insertResult.error) {
      if (insertResult.error.code === '23505' && row.submission_key) {
        const racedSubmission = await findExistingSubmission(client, row.submission_key)
        if (racedSubmission) {
          return buildJsonResponse(200, {
            ok: true,
            duplicate: true,
            enquiry: { id: racedSubmission.id, createdAt: racedSubmission.created_at },
          }, corsHeaders)
        }
      }
      throw insertResult.error
    }

    const notification = await sendNotificationEmail(row, insertResult.data?.id)
    await updateNotificationStatus(client, insertResult.data?.id, notification)

    return buildJsonResponse(201, {
      ok: true,
      enquiry: {
        id: insertResult.data?.id,
        createdAt: insertResult.data?.created_at,
      },
      notification,
    }, corsHeaders)
  } catch (error) {
    const status = Number(error?.status || error?.statusCode || 500)
    return buildJsonResponse(status, {
      error: error?.code || 'demo_enquiry_submit_failed',
      message: status >= 500 ? 'Demo enquiry could not be saved.' : error?.message || 'Demo enquiry request failed.',
    }, corsHeaders)
  }
}

export async function createAdminDemoEnquiriesResponse({ method = 'GET', url = '', headers = {}, body = null } = {}) {
  const normalizedMethod = normalizeText(method || 'GET').toUpperCase()

  if (normalizedMethod === 'OPTIONS') {
    return {
      status: 204,
      headers: {
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        'Access-Control-Allow-Methods': 'GET, PATCH, OPTIONS',
        'Cache-Control': 'no-store',
      },
      body: null,
    }
  }

  if (!['GET', 'PATCH'].includes(normalizedMethod)) {
    return buildJsonResponse(405, {
      error: 'method_not_allowed',
      message: 'Demo enquiry admin only supports GET and PATCH.',
    })
  }

  try {
    const { serviceClient, user } = await authenticateHqRequest(headers)

    if (normalizedMethod === 'PATCH') {
      const payload = await readJsonBody(body)
      const id = normalizeText(payload.id)
      const action = normalizeText(payload.action)

      if (action === 'retry_notification') {
        if (!id) return buildJsonResponse(422, { error: 'validation_failed', message: 'A valid lead id is required.' })
        const currentResult = await serviceClient.from(DEMO_ENQUIRIES_TABLE).select(ADMIN_LEAD_SELECT).eq('id', id).single()
        if (currentResult.error) throw currentResult.error
        if (currentResult.data.notification_status === 'sent') {
          return buildJsonResponse(200, { enquiry: currentResult.data, notification: { sent: true, alreadySent: true } })
        }

        const auditResult = await serviceClient.from('demo_enquiry_activity_events').insert({
          enquiry_id: id,
          actor_user_id: user.id,
          event_type: 'notification_retried',
          changed_fields: ['notificationStatus'],
          before_state: { notificationStatus: currentResult.data.notification_status },
          after_state: { retryRequestedAt: new Date().toISOString() },
        })
        if (auditResult.error) throw auditResult.error

        const notification = await sendNotificationEmail(currentResult.data, id)
        await updateNotificationStatus(serviceClient, id, notification)
        const refreshed = await serviceClient.from(DEMO_ENQUIRIES_TABLE).select(ADMIN_LEAD_SELECT).eq('id', id).single()
        if (refreshed.error) throw refreshed.error
        return buildJsonResponse(200, { enquiry: refreshed.data, notification })
      }

      if (action === 'review_duplicate') {
        if (!id) {
          return buildJsonResponse(422, { error: 'validation_failed', message: 'A valid lead id is required.' })
        }
        const authenticatedClient = createAuthenticatedClient(getBearerToken(headers))
        const reviewResult = await authenticatedClient.rpc('arch9_admin_review_intake_lead_duplicate_v1', {
          p_enquiry_id: id,
          p_dedupe_status: normalizeText(payload.dedupeStatus),
          p_duplicate_of_enquiry_id: normalizeText(payload.duplicateOfEnquiryId) || null,
        })
        if (reviewResult.error) throw reviewResult.error
        const refreshed = await serviceClient.from(DEMO_ENQUIRIES_TABLE).select(ADMIN_LEAD_SELECT).eq('id', id).single()
        if (refreshed.error) throw refreshed.error
        return buildJsonResponse(200, { enquiry: refreshed.data, review: reviewResult.data })
      }

      if (action === 'convert_lead') {
        if (!id) return buildJsonResponse(422, { error: 'validation_failed', message: 'A valid lead id is required.' })
        const mode = normalizeText(payload.mode).toLowerCase()
        if (!['create', 'link'].includes(mode)) {
          return buildJsonResponse(422, { error: 'validation_failed', message: 'Choose whether to create or link an organisation.' })
        }
        if (mode === 'link' && !normalizeText(payload.existingOrganisationId)) {
          return buildJsonResponse(422, { error: 'validation_failed', message: 'Select an existing organisation to link.' })
        }

        const authenticatedClient = createAuthenticatedClient(getBearerToken(headers))
        const conversionResult = await authenticatedClient.rpc('arch9_admin_convert_intake_lead_v1', {
          p_enquiry_id: id,
          p_mode: mode,
          p_organisation: safeObject(payload.organisation),
          p_existing_organisation_id: normalizeText(payload.existingOrganisationId) || null,
        })
        if (conversionResult.error) throw conversionResult.error
        const refreshed = await serviceClient.from(DEMO_ENQUIRIES_TABLE).select(ADMIN_LEAD_SELECT).eq('id', id).single()
        if (refreshed.error) throw refreshed.error
        return buildJsonResponse(200, { enquiry: refreshed.data, conversion: conversionResult.data })
      }

      const legacyStageByStatus = {
        new: 'new',
        contacted: 'contacted',
        scheduled: 'demo_scheduled',
        closed: 'closed',
        spam: 'spam',
      }
      const patchPayload = payload.patch
        ? payload
        : { patch: { salesStage: legacyStageByStatus[normalizeText(payload.status)] } }
      const validation = validateAdminLeadPatch(patchPayload)
      if (!id || validation.error) {
        return buildJsonResponse(422, {
          error: 'validation_failed',
          message: validation.error || 'A valid lead id is required.',
        })
      }

      const authenticatedClient = createAuthenticatedClient(getBearerToken(headers))
      const updateResult = await authenticatedClient.rpc('arch9_admin_update_demo_enquiry_v1', {
        p_enquiry_id: id,
        p_patch: validation.patch,
      })
      if (updateResult.error) throw updateResult.error

      const refreshed = await serviceClient.from(DEMO_ENQUIRIES_TABLE).select(ADMIN_LEAD_SELECT).eq('id', id).single()
      if (refreshed.error) throw refreshed.error
      return buildJsonResponse(200, { enquiry: refreshed.data })
    }

    const requestUrl = getRequestUrl(url, headers)
    const params = requestUrl.searchParams
    const leadContextId = normalizeText(params.get('leadContext'))
    if (leadContextId) {
      const authenticatedClient = createAuthenticatedClient(getBearerToken(headers))
      const contextResult = await authenticatedClient.rpc('arch9_admin_intake_lead_context_v1', {
        p_enquiry_id: leadContextId,
      })
      if (contextResult.error) throw contextResult.error
      return buildJsonResponse(200, { context: contextResult.data })
    }

    const conversionContextId = normalizeText(params.get('conversionContext'))
    if (conversionContextId) {
      const authenticatedClient = createAuthenticatedClient(getBearerToken(headers))
      const contextResult = await authenticatedClient.rpc('arch9_admin_intake_conversion_context_v1', {
        p_enquiry_id: conversionContextId,
      })
      if (contextResult.error) throw contextResult.error
      return buildJsonResponse(200, { context: contextResult.data })
    }

    const limit = toPositiveInteger(params.get('limit'), 25, 100)
    const page = toPositiveInteger(params.get('page'), 1, 10000)
    const offset = (page - 1) * limit
    const requestedStage = normalizeText(params.get('stage') || params.get('status'))
    const stage = ADMIN_LEAD_STAGES.has(requestedStage) ? requestedStage : ''
    const requestedPriority = normalizeText(params.get('priority'))
    const priority = ADMIN_LEAD_PRIORITIES.has(requestedPriority) ? requestedPriority : ''
    const source = escapeSearchTerm(params.get('source')).slice(0, 80)
    const intakeKind = escapeSearchTerm(params.get('intakeKind')).slice(0, 80)
    const assignment = normalizeText(params.get('assignment'))
    const sort = ADMIN_LEAD_SORTS.get(normalizeText(params.get('sort'))) || ADMIN_LEAD_SORTS.get('newest')
    const search = normalizeText(params.get('q'))

    let query = serviceClient
      .from(DEMO_ENQUIRIES_TABLE)
      .select(ADMIN_LEAD_SELECT, { count: 'exact' })

    if (stage) query = query.eq('sales_stage', stage)
    if (priority) query = query.eq('priority', priority)
    if (source) query = query.eq('source', source)
    if (intakeKind) query = query.eq('intake_kind', intakeKind)
    if (assignment === 'assigned') query = query.not('assigned_to_user_id', 'is', null)
    if (assignment === 'unassigned') query = query.is('assigned_to_user_id', null)
    if (search) {
      const safeSearch = escapeSearchTerm(search)
      if (safeSearch) {
        const pattern = `%${safeSearch}%`
        query = query.or(`first_name.ilike.${pattern},last_name.ilike.${pattern},email.ilike.${pattern},phone.ilike.${pattern},company.ilike.${pattern},role.ilike.${pattern}`)
      }
    }

    query = query
      .order(sort.column, { ascending: sort.ascending, nullsFirst: sort.nullsFirst })
      .range(offset, offset + limit - 1)

    const activeStages = ['won', 'lost', 'closed', 'spam']
    const now = new Date().toISOString()
    const authenticatedClient = createAuthenticatedClient(getBearerToken(headers))
    const [result, totalResult, newResult, unassignedResult, overdueResult, assignees, healthResult] = await Promise.all([
      query,
      serviceClient.from(DEMO_ENQUIRIES_TABLE).select('id', { count: 'exact', head: true }),
      serviceClient.from(DEMO_ENQUIRIES_TABLE).select('id', { count: 'exact', head: true }).eq('sales_stage', 'new'),
      serviceClient.from(DEMO_ENQUIRIES_TABLE).select('id', { count: 'exact', head: true }).is('assigned_to_user_id', null).not('sales_stage', 'in', `(${activeStages.join(',')})`),
      serviceClient.from(DEMO_ENQUIRIES_TABLE).select('id', { count: 'exact', head: true }).lt('next_action_at', now).not('sales_stage', 'in', `(${activeStages.join(',')})`),
      listAdminLeadAssignees(serviceClient, user.id),
      authenticatedClient.rpc('arch9_admin_intake_pipeline_health_v1'),
    ])
    if (result.error) throw result.error
    const summaryError = [totalResult, newResult, unassignedResult, overdueResult, healthResult].find((item) => item.error)?.error
    if (summaryError) throw summaryError

    return buildJsonResponse(200, {
      enquiries: result.data || [],
      count: result.count || 0,
      page,
      pageSize: limit,
      pageCount: Math.max(1, Math.ceil((result.count || 0) / limit)),
      summary: {
        total: totalResult.count || 0,
        new: newResult.count || 0,
        unassigned: unassignedResult.count || 0,
        overdue: overdueResult.count || 0,
      },
      assignees,
      health: healthResult.data || null,
    })
  } catch (error) {
    const status = getAdminErrorStatus(error)
    return buildJsonResponse(status, {
      error: error?.code || 'demo_enquiries_admin_failed',
      message: status >= 500 ? 'Demo enquiries could not be loaded.' : error?.message || 'Demo enquiries request failed.',
    })
  }
}

export { writeNodeJsonResponse }
