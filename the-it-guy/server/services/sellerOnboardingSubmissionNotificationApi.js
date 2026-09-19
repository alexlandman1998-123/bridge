import { createHash } from 'node:crypto'
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

let cachedRuntimeEnv = null

const COMPLETED_ONBOARDING_STATUSES = new Set(['completed', 'complete', 'submitted', 'under_review'])
const EMAIL_TIMEOUT_MS = 8_000

function text(value = '') {
  return String(value || '').trim()
}

function safeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {}
  return Object.fromEntries(
    fs.readFileSync(filePath, 'utf8').split(/\r?\n/).map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#')).map((line) => {
        const separator = line.indexOf('=')
        return separator === -1 ? [line, ''] : [line.slice(0, separator), line.slice(separator + 1).replace(/^['"]|['"]$/g, '')]
      }),
  )
}

function runtimeEnv() {
  if (cachedRuntimeEnv) return cachedRuntimeEnv
  const processEnv = Object.fromEntries(Object.entries(globalThis?.process?.env || {}).map(([key, value]) => [key, text(value)]))
  cachedRuntimeEnv = {
    ...parseEnvFile(new URL('../../.env', import.meta.url)),
    ...parseEnvFile(new URL('../../.env.production.local', import.meta.url)),
    ...parseEnvFile(new URL('../../.env.staging.local', import.meta.url)),
    ...processEnv,
  }
  if (!cachedRuntimeEnv.SUPABASE_URL && cachedRuntimeEnv.VITE_SUPABASE_URL) cachedRuntimeEnv.SUPABASE_URL = cachedRuntimeEnv.VITE_SUPABASE_URL
  return cachedRuntimeEnv
}

function serviceClient() {
  const env = runtimeEnv()
  const url = text(env.SUPABASE_URL || env.VITE_SUPABASE_URL)
  const serviceRoleKey = text(env.SUPABASE_SERVICE_ROLE_KEY)
  if (!url || !serviceRoleKey) {
    const error = new Error('Seller onboarding notification backend is not configured.')
    error.status = 503
    error.code = 'seller_onboarding_notification_unconfigured'
    throw error
  }
  return createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } })
}

function jsonResponse(status, body, headers = {}) {
  return {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Accept',
      ...headers,
    },
    body,
  }
}

async function readBody(body) {
  if (!body) return {}
  if (typeof body === 'object') return safeObject(body)
  try { return safeObject(JSON.parse(String(body))) } catch { return {} }
}

function tokenHash(token) {
  return createHash('sha256').update(token).digest('hex')
}

async function findOnboarding(client, token) {
  const columns = 'id, private_listing_id, token, seller_portal_token, seller_portal_invite_token_hash, status, submitted_at, form_data'
  for (const [column, value] of [
    ['token', token],
    ['seller_portal_token', token],
    ['seller_portal_invite_token_hash', tokenHash(token)],
  ]) {
    const result = await client.from('private_listing_seller_onboarding').select(columns).eq(column, value).maybeSingle()
    if (result.error) throw result.error
    if (result.data) return result.data
  }
  return null
}

function sellerName(formData = {}) {
  return text([formData.sellerFirstName || formData.firstName, formData.sellerSurname || formData.lastName].filter(Boolean).join(' ')) ||
    text(formData.sellerName || formData.fullName) || 'The seller'
}

function propertyLabel(listing = {}, formData = {}) {
  return text(listing.title || formData.propertyAddress || formData.addressLine1 || listing.address_line_1) || 'the property'
}

function appBaseUrl() {
  const env = runtimeEnv()
  return text(env.PUBLIC_APP_URL || env.CLIENT_APP_URL || env.APP_BASE_URL || env.VITE_PUBLIC_APP_URL || env.VITE_APP_BASE_URL || 'https://app.arch9.co.za').replace(/\/+$/, '')
}

export function buildSellerOnboardingSubmittedNotification({ onboarding = {}, listing = {} } = {}) {
  const formData = safeObject(onboarding.form_data)
  const listingId = text(listing.id || onboarding.private_listing_id)
  const leadId = text(listing.seller_lead_id || listing.originating_crm_lead_id || listing.lead_id)
  const agentId = text(listing.assigned_agent_id)
  const submittedAt = text(onboarding.submitted_at || onboarding.updated_at || onboarding.created_at) || 'submitted'
  const agentEmail = text(listing.assigned_agent_email).toLowerCase()
  const agentName = text(listing.assigned_agent_name || listing.assigned_agent) || 'Agent'
  const name = sellerName(formData)
  const property = propertyLabel(listing, formData)
  const actionPath = leadId ? `/pipeline/leads/${encodeURIComponent(leadId)}?tab=documents` : listingId ? `/listings/${encodeURIComponent(listingId)}` : '/pipeline/leads'
  const actionLink = `${appBaseUrl()}${actionPath}`
  const dedupeKey = `seller-onboarding-submitted:${onboarding.id || listingId}:${submittedAt}`

  return {
    listingId,
    leadId,
    agentId,
    agentEmail,
    notification: agentId ? {
      transaction_id: null,
      user_id: agentId,
      role_type: 'agent',
      // Existing allowed types/events are used deliberately; the bell classifies
      // this as a lead arrival from its title and lead metadata.
      notification_type: 'readiness_updated',
      title: 'Seller onboarding received',
      message: `${name} submitted seller onboarding for ${property}. Review the details and prepare the mandate.`,
      is_read: false,
      read_at: null,
      dedupe_key: dedupeKey,
      event_type: 'TransactionUpdated',
      event_data: { source: 'seller_onboarding_submitted', type: 'seller_lead_onboarding_submitted', trigger: 'seller_onboarding_submitted', leadId: leadId || null, listingId, actionLink },
    } : null,
    email: {
      type: 'seller_onboarding_submitted',
      to: agentEmail || undefined,
      agentName,
      sellerName: name,
      sellerEmail: text(formData.email || formData.sellerEmail).toLowerCase() || undefined,
      sellerPortalInvitePolicy: 'after_mandate_signed',
      deferSellerPortalLinkUntilMandateSigned: true,
      propertyTitle: property,
      transactionReference: text(listing.transaction_reference || listing.listing_reference),
      organisationId: text(listing.organisation_id) || undefined,
      leadId: leadId || undefined,
      listingId: listingId || undefined,
      assignedAgentId: agentId || undefined,
      actionLink,
      // Resend consumes this as its delivery idempotency key when supported.
      idempotencyKey: dedupeKey,
    },
  }
}

async function insertBellNotification(client, notification) {
  if (!notification) return { created: false, skipped: true, reason: 'no_assigned_agent' }
  const existing = await client.from('transaction_notifications').select('id').eq('user_id', notification.user_id).eq('dedupe_key', notification.dedupe_key).maybeSingle()
  if (existing.error) throw existing.error
  if (existing.data?.id) return { created: false, duplicate: true, id: existing.data.id }
  const inserted = await client.from('transaction_notifications').insert(notification).select('id').single()
  if (inserted.error) throw inserted.error
  return { created: true, id: inserted.data?.id || null }
}

async function invokeEmail(payload) {
  const env = runtimeEnv()
  const url = text(env.SUPABASE_URL || env.VITE_SUPABASE_URL)
  const serviceRoleKey = text(env.SUPABASE_SERVICE_ROLE_KEY)
  if (!url || !serviceRoleKey) return { sent: false, skipped: true, reason: 'missing_send_email_configuration' }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), EMAIL_TIMEOUT_MS)
  try {
    const response = await fetch(`${url.replace(/\/+$/, '')}/functions/v1/send-email`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${serviceRoleKey}`, apikey: serviceRoleKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
    const data = await response.json().catch(() => ({}))
    return response.ok && data?.ok !== false && !data?.error
      ? { sent: data?.sent !== false, result: data }
      : { sent: false, error: data?.message || data?.error || 'send_email_rejected', status: response.status }
  } finally {
    clearTimeout(timer)
  }
}

export async function createSellerOnboardingSubmissionNotificationResponse({ method = 'POST', body = null, client = null, sendEmail = invokeEmail } = {}) {
  if (text(method).toUpperCase() === 'OPTIONS') return { status: 204, headers: jsonResponse(204, null).headers, body: null }
  if (text(method).toUpperCase() !== 'POST') return jsonResponse(405, { error: 'method_not_allowed', message: 'Only POST is supported.' })
  try {
    const payload = await readBody(body)
    const token = text(payload.token)
    if (!token) return jsonResponse(400, { error: 'missing_token', message: 'Seller onboarding token is required.' })
    const db = client || serviceClient()
    const onboarding = await findOnboarding(db, token)
    if (!onboarding) return jsonResponse(404, { error: 'seller_onboarding_not_found', message: 'Seller onboarding link is invalid.' })
    if (!COMPLETED_ONBOARDING_STATUSES.has(text(onboarding.status).toLowerCase()) || !onboarding.submitted_at) {
      return jsonResponse(409, { error: 'seller_onboarding_not_submitted', message: 'Seller onboarding has not been submitted.' })
    }
    const listingResult = await db.from('private_listings').select('*').eq('id', onboarding.private_listing_id).maybeSingle()
    if (listingResult.error) throw listingResult.error
    if (!listingResult.data) return jsonResponse(404, { error: 'listing_not_found', message: 'Seller listing was not found.' })

    const handoff = buildSellerOnboardingSubmittedNotification({ onboarding, listing: listingResult.data })
    const bell = await insertBellNotification(db, handoff.notification)
    const email = bell.created
      ? await sendEmail(handoff.email)
      : { sent: false, skipped: true, reason: bell.duplicate ? 'duplicate_submission' : 'no_assigned_agent' }
    return jsonResponse(200, { ok: true, bell, email: { sent: Boolean(email.sent), skipped: Boolean(email.skipped), reason: email.reason || null } })
  } catch (error) {
    return jsonResponse(Number(error?.status || 500), { error: error?.code || 'seller_onboarding_notification_error', message: 'The agent notification could not be prepared.' })
  }
}
