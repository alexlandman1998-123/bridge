import { createHmac } from 'crypto'
import { NextResponse } from 'next/server'
import { normalizeHostname } from '@/lib/site-repository'
import { getServerSupabase } from '@/lib/supabase-server'

export const runtime = 'nodejs'

const MAX_BODY_BYTES = 16 * 1024
const supportedTypes = new Set(['property_enquiry', 'general_enquiry', 'valuation_request', 'campaign_enquiry'])
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const idempotencyPattern = /^[A-Za-z0-9._:-]{16,128}$/

type LeadBody = {
  type?: unknown
  propertyId?: unknown
  pageId?: unknown
  name?: unknown
  email?: unknown
  phone?: unknown
  message?: unknown
  privacyAccepted?: unknown
  marketingConsent?: unknown
  pageUrl?: unknown
  referrer?: unknown
  idempotencyKey?: unknown
  companyWebsite?: unknown
}

type CaptureResult = {
  accepted?: boolean
  duplicate?: boolean
  rateLimited?: boolean
  notificationEventId?: string
  receiptId?: string
  leadId?: string
}

type LeadLog = {
  requestId: string
  event: string
  host?: string
  status: number
  code?: string
  submissionType?: string
  receiptId?: string
  leadId?: string
  durationMs: number
}

function logLeadEvent(entry: LeadLog) {
  // Intentionally excludes names, email addresses, phone numbers, messages, IPs and fingerprints.
  console.info(JSON.stringify({ service: 'public-websites', route: '/api/leads', ...entry }))
}

function text(value: unknown, maximum = 500): string {
  return typeof value === 'string' ? value.trim().slice(0, maximum) : ''
}

function safeUrl(value: unknown): URL | null {
  try {
    const candidate = new URL(text(value, 2048))
    return candidate.protocol === 'https:' || candidate.protocol === 'http:' ? candidate : null
  } catch {
    return null
  }
}

function attribution(request: Request, body: LeadBody, host: string) {
  const page = safeUrl(body.pageUrl)
  const referrer = safeUrl(body.referrer)
  const pageMatchesSite = page && normalizeHostname(page.host) === host
  return {
    pagePath: pageMatchesSite ? page.pathname.slice(0, 2048) : undefined,
    referrer: referrer ? `${referrer.origin}${referrer.pathname}`.slice(0, 2048) : undefined,
    utmSource: pageMatchesSite ? text(page.searchParams.get('utm_source'), 160) : undefined,
    utmMedium: pageMatchesSite ? text(page.searchParams.get('utm_medium'), 160) : undefined,
    utmCampaign: pageMatchesSite ? text(page.searchParams.get('utm_campaign'), 160) : undefined,
    utmTerm: pageMatchesSite ? text(page.searchParams.get('utm_term'), 160) : undefined,
    utmContent: pageMatchesSite ? text(page.searchParams.get('utm_content'), 160) : undefined,
    userAgent: text(request.headers.get('user-agent'), 512),
  }
}

function requestFingerprint(request: Request, host: string): string | null {
  const secret = process.env.WEBSITES_LEAD_FINGERPRINT_SECRET
  if (!secret || secret.length < 32) throw new Error('WEBSITES_LEAD_FINGERPRINT_SECRET is not configured securely')
  const forwarded = text(request.headers.get('x-forwarded-for'), 512).split(',')[0]?.trim()
  const address = forwarded || text(request.headers.get('x-real-ip'), 128)
  if (!address) return null
  return createHmac('sha256', secret).update(`${host}:${address}`).digest('hex')
}

async function dispatchQueuedNotification(notificationEventId: string | undefined) {
  if (!notificationEventId) return
  const url = process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) return
  await fetch(`${url.replace(/\/$/, '')}/functions/v1/website-lead-dispatcher`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ eventId: notificationEventId }),
    signal: AbortSignal.timeout(4_000),
  }).catch(() => null)
}

export async function POST(request: Request) {
  const startedAt = performance.now()
  const requestId = text(request.headers.get('x-vercel-id'), 160) || crypto.randomUUID()
  const host = normalizeHostname(request.headers.get('host'))
  const respond = (body: Record<string, unknown>, status: number, event: string, extra: Partial<LeadLog> = {}) => {
    logLeadEvent({ requestId, event, host: host || undefined, status, durationMs: Math.round(performance.now() - startedAt), ...extra })
    return NextResponse.json(body, { status })
  }
  const declaredLength = Number(request.headers.get('content-length') || 0)
  if (declaredLength > MAX_BODY_BYTES) return respond({ error: 'Request is too large.' }, 413, 'lead.rejected', { code: 'body_too_large' })

  let body: LeadBody
  try {
    const raw = await request.text()
    if (Buffer.byteLength(raw, 'utf8') > MAX_BODY_BYTES) return respond({ error: 'Request is too large.' }, 413, 'lead.rejected', { code: 'body_too_large' })
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Body must be an object')
    body = parsed as LeadBody
  } catch {
    return respond({ error: 'Invalid request body.' }, 400, 'lead.rejected', { code: 'invalid_json' })
  }

  // Honeypot submissions receive a neutral response and never reach CRM storage.
  if (text(body.companyWebsite, 256)) return respond({ accepted: true }, 202, 'lead.honeypot')

  const type = text(body.type, 48)
  const name = text(body.name, 160)
  const email = text(body.email, 254).toLowerCase()
  const phone = text(body.phone, 64)
  const idempotencyKey = text(body.idempotencyKey, 128)
  if (!host || !supportedTypes.has(type) || name.length < 2 || (!email && !phone) || (email && !emailPattern.test(email)) || body.privacyAccepted !== true || !idempotencyPattern.test(idempotencyKey)) {
    return respond({ error: 'Please complete the required fields.' }, 400, 'lead.rejected', { code: 'invalid_fields', submissionType: type || undefined })
  }

  let supabase: ReturnType<typeof getServerSupabase>
  let fingerprint: string | null
  try {
    supabase = getServerSupabase()
    fingerprint = requestFingerprint(request, host)
  } catch {
    return respond({ error: 'Enquiries are temporarily unavailable.' }, 503, 'lead.failed', { code: 'configuration', submissionType: type })
  }

  const capture = await supabase.rpc('website_capture_lead_submission', {
    p_hostname: host,
    p_submission_type: type,
    p_listing_id: text(body.propertyId, 64) || null,
    p_page_id: text(body.pageId, 64) || null,
    p_name: name,
    p_email: email || null,
    p_phone: phone || null,
    p_message: text(body.message, 4000) || null,
    p_privacy_accepted: true,
    p_marketing_consent: body.marketingConsent === true,
    p_idempotency_key: idempotencyKey,
    p_request_fingerprint: fingerprint,
    p_attribution: attribution(request, body, host),
  })

  if (capture.error) {
    const status = capture.error.code === 'P0002' ? 404 : ['22023', '22P02'].includes(capture.error.code || '') ? 400 : 500
    return respond({ error: status === 404 ? 'This enquiry destination is unavailable.' : status === 400 ? 'Please check the enquiry details.' : 'Unable to record enquiry.' }, status, 'lead.failed', { code: capture.error.code || 'capture_error', submissionType: type })
  }

  const captured = capture.data as CaptureResult
  if (captured.rateLimited) return respond({ error: 'Please wait before sending another enquiry.' }, 429, 'lead.rate_limited', { submissionType: type })
  if (!captured.accepted && !captured.duplicate) return respond({ error: 'Unable to record enquiry.' }, 500, 'lead.failed', { code: 'not_accepted', submissionType: type })
  if (!captured.duplicate) await dispatchQueuedNotification(captured.notificationEventId)

  return respond({ accepted: true, duplicate: captured.duplicate === true }, captured.duplicate ? 202 : 201, captured.duplicate ? 'lead.duplicate' : 'lead.accepted', {
    submissionType: type,
    receiptId: captured.receiptId,
    leadId: captured.leadId,
  })
}
