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
  receiptId?: string
  leadId?: string
  notificationEventId?: string
  organisationId?: string
  recipientEmail?: string
  recipientName?: string
  eventKind?: string
  propertyLabel?: string
  leadName?: string
  leadEmail?: string
  leadPhone?: string
  leadCategory?: string
}

type NotificationTarget = {
  receiptId: string
  notificationEventId: string
  organisationId: string
  recipientEmail: string
  recipientName?: string
  eventKind: string
  propertyLabel?: string
  leadId: string
  leadName?: string
  leadEmail?: string
  leadPhone?: string
  leadCategory?: string
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

function errorText(value: unknown): string {
  if (value instanceof Error) return value.message.slice(0, 500)
  return text(value, 500) || 'Notification delivery failed.'
}

function providerMessageId(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null
  const body = payload as { providerResponse?: unknown }
  if (!body.providerResponse || typeof body.providerResponse !== 'object') return null
  return text((body.providerResponse as { id?: unknown }).id, 500) || null
}

async function sendNotification(target: NotificationTarget) {
  const url = process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) throw new Error('Notification service is not configured')
  const appUrl = String(process.env.ARCH9_APP_URL || 'https://app.arch9.co.za').replace(/\/$/, '')
  const response = await fetch(`${url.replace(/\/$/, '')}/functions/v1/send-email`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      type: target.eventKind,
      eventKind: target.eventKind,
      to: target.recipientEmail,
      recipientName: target.recipientName,
      organisationId: target.organisationId,
      leadId: target.leadId,
      leadName: target.leadName,
      leadEmail: target.leadEmail,
      leadPhone: target.leadPhone,
      leadSource: 'Website',
      leadCategory: target.leadCategory,
      leadStatus: 'New Lead',
      propertyLabel: target.propertyLabel,
      actionLink: `${appUrl}/pipeline/leads/${target.leadId}`,
      idempotencyKey: `website-lead:${target.receiptId}:${target.notificationEventId}`,
    }),
    signal: AbortSignal.timeout(8_000),
  })
  const payload = await response.json().catch(() => ({})) as { sent?: boolean; suppressed?: boolean; error?: unknown; providerResponse?: unknown }
  if (!response.ok) throw new Error(text(payload.error, 500) || `Notification service returned ${response.status}`)
  return { status: payload.sent === false || payload.suppressed ? 'skipped' : 'sent', providerMessageId: providerMessageId(payload) }
}

async function recordDelivery(
  supabase: ReturnType<typeof getServerSupabase>,
  target: Pick<NotificationTarget, 'receiptId' | 'notificationEventId'>,
  status: 'sent' | 'failed' | 'skipped',
  messageId?: string | null,
  error?: string | null,
) {
  await supabase.rpc('website_complete_lead_notification', {
    p_receipt_id: target.receiptId,
    p_notification_event_id: target.notificationEventId,
    p_delivery_status: status,
    p_provider_message_id: messageId || null,
    p_error_message: error || null,
  })
}

async function dispatchWithFallback(supabase: ReturnType<typeof getServerSupabase>, captured: CaptureResult) {
  if (!captured.receiptId || !captured.notificationEventId || !captured.organisationId || !captured.recipientEmail || !captured.eventKind || !captured.leadId) return
  const primary: NotificationTarget = {
    receiptId: captured.receiptId,
    notificationEventId: captured.notificationEventId,
    organisationId: captured.organisationId,
    recipientEmail: captured.recipientEmail,
    recipientName: captured.recipientName,
    eventKind: captured.eventKind,
    propertyLabel: captured.propertyLabel,
    leadId: captured.leadId,
    leadName: captured.leadName,
    leadEmail: captured.leadEmail,
    leadPhone: captured.leadPhone,
    leadCategory: captured.leadCategory,
  }
  try {
    const delivered = await sendNotification(primary)
    await recordDelivery(supabase, primary, delivered.status as 'sent' | 'skipped', delivered.providerMessageId)
  } catch (error) {
    const failure = errorText(error)
    const fallbackResult = await supabase.rpc('website_prepare_lead_notification_fallback', {
      p_receipt_id: primary.receiptId,
      p_error_message: failure,
    })
    const fallback = fallbackResult.data as { available?: boolean; notificationEventId?: string; recipientEmail?: string; recipientName?: string; eventKind?: string } | null
    if (fallbackResult.error || !fallback?.available || !fallback.notificationEventId || !fallback.recipientEmail) return
    const managerTarget: NotificationTarget = {
      ...primary,
      notificationEventId: fallback.notificationEventId,
      recipientEmail: fallback.recipientEmail,
      recipientName: fallback.recipientName,
      eventKind: fallback.eventKind || 'new_enquiry_unassigned_manager',
    }
    try {
      const delivered = await sendNotification(managerTarget)
      await recordDelivery(supabase, managerTarget, delivered.status as 'sent' | 'skipped', delivered.providerMessageId)
    } catch (fallbackError) {
      await recordDelivery(supabase, managerTarget, 'failed', null, errorText(fallbackError))
    }
  }
}

export async function POST(request: Request) {
  const declaredLength = Number(request.headers.get('content-length') || 0)
  if (declaredLength > MAX_BODY_BYTES) return NextResponse.json({ error: 'Request is too large.' }, { status: 413 })

  let body: LeadBody
  try {
    const raw = await request.text()
    if (Buffer.byteLength(raw, 'utf8') > MAX_BODY_BYTES) return NextResponse.json({ error: 'Request is too large.' }, { status: 413 })
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Body must be an object')
    body = parsed as LeadBody
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  // Honeypot submissions receive a neutral response and never reach CRM storage.
  if (text(body.companyWebsite, 256)) return NextResponse.json({ accepted: true }, { status: 202 })

  const host = normalizeHostname(request.headers.get('host'))
  const type = text(body.type, 48)
  const name = text(body.name, 160)
  const email = text(body.email, 254).toLowerCase()
  const phone = text(body.phone, 64)
  const idempotencyKey = text(body.idempotencyKey, 128)
  if (!host || !supportedTypes.has(type) || name.length < 2 || (!email && !phone) || (email && !emailPattern.test(email)) || body.privacyAccepted !== true || !idempotencyPattern.test(idempotencyKey)) {
    return NextResponse.json({ error: 'Please complete the required fields.' }, { status: 400 })
  }

  let supabase: ReturnType<typeof getServerSupabase>
  let fingerprint: string | null
  try {
    supabase = getServerSupabase()
    fingerprint = requestFingerprint(request, host)
  } catch {
    return NextResponse.json({ error: 'Enquiries are temporarily unavailable.' }, { status: 503 })
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
    return NextResponse.json({ error: status === 404 ? 'This enquiry destination is unavailable.' : status === 400 ? 'Please check the enquiry details.' : 'Unable to record enquiry.' }, { status })
  }

  const captured = capture.data as CaptureResult
  if (captured.rateLimited) return NextResponse.json({ error: 'Please wait before sending another enquiry.' }, { status: 429 })
  if (!captured.accepted && !captured.duplicate) return NextResponse.json({ error: 'Unable to record enquiry.' }, { status: 500 })
  if (!captured.duplicate) await dispatchWithFallback(supabase, captured)

  return NextResponse.json({ accepted: true, duplicate: captured.duplicate === true }, { status: captured.duplicate ? 202 : 201 })
}
