import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { writeNodeJsonResponse } from './hqMissionControlApi.js'
import { authenticateHqRequest } from './hqMissionControlSnapshotService.js'

let cachedRuntimeEnv = null

const DEMO_ENQUIRIES_TABLE = 'demo_enquiries'
const DEFAULT_NOTIFICATION_EMAIL = 'alexlandman1998@gmail.com'
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

function normalizeArray(value = []) {
  if (Array.isArray(value)) return value.map(normalizeText).filter(Boolean)
  const text = normalizeText(value)
  return text ? [text] : []
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

function validatePayload(payload = {}) {
  const errors = {}
  const email = normalizeEmail(payload.email)

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

  return errors
}

function mapPayloadToRow(payload = {}) {
  const context = safeObject(payload.context)
  const utm = safeObject(context.utm)

  return {
    status: 'new',
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
    biggest_frustration: normalizeText(payload.biggestFrustration),
    preferred_window: normalizeArray(payload.preferredWindow),
    source: normalizeText(payload.source) || 'arch9-book-demo-wizard',
    page_url: normalizeText(context.pageUrl),
    referrer: normalizeText(context.referrer),
    utm,
    user_agent: normalizeText(context.userAgent),
    raw_payload: payload,
    submitted_at: normalizeText(payload.submittedAt) || new Date().toISOString(),
  }
}

async function sendNotificationEmail(row, enquiryId) {
  const env = getRuntimeEnv()
  const supabaseUrl = normalizeText(env.SUPABASE_URL || env.VITE_SUPABASE_URL)
  const serviceRoleKey = normalizeText(env.SUPABASE_SERVICE_ROLE_KEY)
  const to = normalizeText(env.DEMO_ENQUIRY_NOTIFY_EMAIL || env.ARCH9_DEMO_NOTIFY_EMAIL || DEFAULT_NOTIFICATION_EMAIL)

  if (!supabaseUrl || !serviceRoleKey) {
    return { sent: false, skipped: true, reason: 'missing_send_email_configuration' }
  }
  if (!to) {
    return { sent: false, skipped: true, reason: 'missing_notification_recipient' }
  }

  const fullName = [row.first_name, row.last_name].filter(Boolean).join(' ')
  const adminUrl = `https://app.arch9.co.za/platform/demo-enquiries${enquiryId ? `?enquiry=${encodeURIComponent(enquiryId)}` : ''}`
  const response = await fetch(`${supabaseUrl.replace(/\/+$/, '')}/functions/v1/send-email`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      type: 'public_demo_enquiry',
      to,
      fullName,
      firstName: row.first_name,
      lastName: row.last_name,
      email: row.email,
      phone: row.phone,
      company: row.company,
      role: row.role,
      businessSize: row.business_size,
      monthlyVolume: row.monthly_volume,
      demoFocus: normalizeArray(row.demo_focus),
      preferredWindow: normalizeArray(row.preferred_window),
      biggestFrustration: row.biggest_frustration,
      pageUrl: row.page_url,
      adminUrl,
      submittedAt: row.submitted_at,
    }),
  })

  const data = await response.json().catch(() => ({}))
  if (!response.ok || data?.ok === false || data?.error) {
    return { sent: false, error: data?.message || data?.error || 'send_email_rejected', status: response.status }
  }

  return {
    sent: data?.sent !== false,
    provider: 'send-email',
    id: data?.providerResponse?.id || data?.emailId || null,
    result: data,
  }
}

async function updateNotificationStatus(client, enquiryId, notificationResult) {
  if (!enquiryId) return
  await client
    .from(DEMO_ENQUIRIES_TABLE)
    .update({
      notification_status: notificationResult?.sent ? 'sent' : notificationResult?.skipped ? 'skipped' : 'failed',
      notification_result: notificationResult || {},
      notified_at: notificationResult?.sent ? new Date().toISOString() : null,
    })
    .eq('id', enquiryId)
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
    const row = mapPayloadToRow(payload)
    const insertResult = await client
      .from(DEMO_ENQUIRIES_TABLE)
      .insert(row)
      .select('id, created_at')
      .single()

    if (insertResult.error) {
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
    const { serviceClient } = await authenticateHqRequest(headers)

    if (normalizedMethod === 'PATCH') {
      const payload = await readJsonBody(body)
      const id = normalizeText(payload.id)
      const status = normalizeText(payload.status)
      const allowedStatuses = new Set(['new', 'contacted', 'scheduled', 'closed', 'spam'])

      if (!id || !allowedStatuses.has(status)) {
        return buildJsonResponse(422, {
          error: 'validation_failed',
          message: 'A valid enquiry id and status are required.',
        })
      }

      const result = await serviceClient
        .from(DEMO_ENQUIRIES_TABLE)
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select('*')
        .single()

      if (result.error) throw result.error
      return buildJsonResponse(200, { enquiry: result.data })
    }

    const requestUrl = getRequestUrl(url, headers)
    const params = requestUrl.searchParams
    const limit = toPositiveInteger(params.get('limit'), 50, 100)
    const status = normalizeText(params.get('status'))
    const search = normalizeText(params.get('q'))

    let query = serviceClient
      .from(DEMO_ENQUIRIES_TABLE)
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .limit(limit)

    if (status && status !== 'all') query = query.eq('status', status)
    if (search) {
      const safeSearch = escapeSearchTerm(search)
      if (safeSearch) {
        const pattern = `%${safeSearch}%`
        query = query.or(`first_name.ilike.${pattern},last_name.ilike.${pattern},email.ilike.${pattern},company.ilike.${pattern},role.ilike.${pattern}`)
      }
    }

    const result = await query
    if (result.error) throw result.error

    return buildJsonResponse(200, {
      enquiries: result.data || [],
      count: result.count || 0,
    })
  } catch (error) {
    const status = Number(error?.status || error?.statusCode || 500)
    return buildJsonResponse(status, {
      error: error?.code || 'demo_enquiries_admin_failed',
      message: status >= 500 ? 'Demo enquiries could not be loaded.' : error?.message || 'Demo enquiries request failed.',
    })
  }
}

export { writeNodeJsonResponse }
