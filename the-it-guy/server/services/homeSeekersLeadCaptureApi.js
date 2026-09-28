import { createHmac } from 'node:crypto'
import { HOME_SEEKERS_PUBLIC_PATH, getHomeSeekersWebsiteConnection, isHomeSeekersPageUrl } from './homeSeekersWebsiteBridge.js'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9._:-]{16,128}$/
const SUPPORTED_TYPES = new Set(['general_enquiry', 'valuation_request', 'property_enquiry'])
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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

export async function createHomeSeekersLeadCaptureResponse({ method = 'POST', headers = {}, body = {}, getConnection = getHomeSeekersWebsiteConnection } = {}) {
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
  const listingId = text(payload.listingId, 64)
  const leadIntent = text(payload.leadIntent, 16).toLowerCase()
  const page = siteUrl(payload.pageUrl)
  if (!hostname || !page || page.hostname.toLowerCase() !== hostname || !isHomeSeekersPageUrl(page.href)
    || !SUPPORTED_TYPES.has(type) || (type === 'property_enquiry' && !UUID_PATTERN.test(listingId))
    || name.length < 2 || (!email && !phone) || (email && !EMAIL_PATTERN.test(email)) || payload.privacyAccepted !== true || !IDEMPOTENCY_PATTERN.test(idempotencyKey)) {
    return response(400, { error: 'Please complete the required fields.' })
  }

  try {
    const { client, site, hostname: websiteHostname } = await getConnection()
    let pageId = null
    if (type !== 'property_enquiry') {
      const pageKind = type === 'valuation_request' ? 'valuation'
        : page.pathname === `${HOME_SEEKERS_PUBLIC_PATH}/contact` ? 'contact'
          : page.pathname === `${HOME_SEEKERS_PUBLIC_PATH}/about` ? 'about' : 'home'
      const { data: publishedPage, error: pageError } = await client.from('website_pages')
        .select('id')
        .eq('website_site_id', site.id)
        .eq('revision_id', site.published_revision_id)
        .eq('page_kind', pageKind)
        .maybeSingle()
      if (pageError) throw pageError
      if (!publishedPage?.id) throw new Error('The enquiry page is not published.')
      pageId = publishedPage.id
    }
    const capture = await client.rpc('website_capture_lead_submission', {
      p_hostname: websiteHostname,
      p_submission_type: type,
      p_listing_id: type === 'property_enquiry' ? listingId : null,
      p_page_id: pageId,
      p_name: name,
      p_email: email || null,
      p_phone: phone || null,
      p_message: text(payload.message, 4000) || null,
      p_privacy_accepted: true,
      p_marketing_consent: payload.marketingConsent === true,
      p_idempotency_key: idempotencyKey,
      p_request_fingerprint: fingerprint(headers, hostname),
      p_attribution: {
        pagePath: page.pathname,
        userAgent: text(headers['user-agent'] || headers['User-Agent'], 512),
        leadIntent: type === 'valuation_request' ? 'sell'
          : type === 'general_enquiry' && ['buy', 'sell', 'rent', 'other'].includes(leadIntent) ? leadIntent : undefined,
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
