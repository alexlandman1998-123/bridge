import { createHmac } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9._:-]{16,128}$/
const SUPPORTED_TYPES = new Set(['general_enquiry', 'valuation_request'])

function text(value = '', maximum = 4000) {
  return String(value || '').trim().slice(0, maximum)
}

function response(status, body) {
  return {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
    body,
  }
}

function fingerprint(headers, hostname) {
  const secret = text(process.env.WEBSITES_LEAD_FINGERPRINT_SECRET, 256)
  if (secret.length < 32) throw new Error('Lead fingerprint secret is unavailable.')
  const forwarded = text(headers['x-forwarded-for'] || headers['X-Forwarded-For'], 512)
  const address = forwarded.split(',')[0]?.trim() || text(headers['x-real-ip'] || headers['X-Real-IP'], 128)
  return address ? createHmac('sha256', secret).update(`${hostname}:${address}`).digest('hex') : null
}

function siteUrl(value) {
  try {
    const parsed = new URL(text(value, 2048))
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed : null
  } catch {
    return null
  }
}

export async function createHomeSeekersLeadCaptureResponse({ method = 'POST', headers = {}, body = {} } = {}) {
  if (String(method).toUpperCase() === 'OPTIONS') {
    return { status: 204, headers: { 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' }, body: null }
  }
  if (String(method).toUpperCase() !== 'POST') return response(405, { error: 'method_not_allowed' })

  const payload = body && typeof body === 'object' ? body : {}
  if (text(payload.companyWebsite, 256)) return response(202, { accepted: true })

  const hostname = text(headers.host || headers.Host, 255).toLowerCase().replace(/:\d+$/, '')
  const type = text(payload.type, 48)
  const name = text(payload.name, 160)
  const email = text(payload.email, 254).toLowerCase()
  const phone = text(payload.phone, 64)
  const idempotencyKey = text(payload.idempotencyKey, 128)
  if (!hostname || !SUPPORTED_TYPES.has(type) || name.length < 2 || (!email && !phone) || (email && !EMAIL_PATTERN.test(email)) || payload.privacyAccepted !== true || !IDEMPOTENCY_PATTERN.test(idempotencyKey)) {
    return response(400, { error: 'Please complete the required fields.' })
  }

  const supabaseUrl = text(process.env.SUPABASE_URL, 2048)
  const serviceRoleKey = text(process.env.SUPABASE_SERVICE_ROLE_KEY, 4096)
  if (!supabaseUrl || !serviceRoleKey) return response(503, { error: 'Enquiries are temporarily unavailable.' })

  try {
    const page = siteUrl(payload.pageUrl)
    const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })
    const capture = await supabase.rpc('website_capture_lead_submission', {
      p_hostname: hostname,
      p_submission_type: type,
      p_listing_id: null,
      p_page_id: null,
      p_name: name,
      p_email: email || null,
      p_phone: phone || null,
      p_message: text(payload.message, 4000) || null,
      p_privacy_accepted: true,
      p_marketing_consent: payload.marketingConsent === true,
      p_idempotency_key: idempotencyKey,
      p_request_fingerprint: fingerprint(headers, hostname),
      p_attribution: {
        pagePath: page?.host.toLowerCase() === hostname ? page.pathname : undefined,
        userAgent: text(headers['user-agent'] || headers['User-Agent'], 512),
        leadIntent: type === 'valuation_request' ? 'sell' : undefined,
      },
    })
    if (capture.error) throw capture.error
    const result = capture.data || {}
    if (result.rateLimited) return response(429, { error: 'Please wait before sending another enquiry.' })
    if (!result.accepted && !result.duplicate) throw new Error('Lead was not accepted.')
    return response(result.duplicate ? 202 : 201, { accepted: true, duplicate: result.duplicate === true })
  } catch (error) {
    console.error('[home-seekers-leads] capture failed', { code: error?.code, message: text(error?.message, 160) })
    return response(error?.code === 'P0002' ? 404 : 500, { error: 'Unable to record enquiry.' })
  }
}
