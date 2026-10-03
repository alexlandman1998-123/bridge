import { createHmac } from 'node:crypto'
import { getHomeSeekersWebsiteConnection } from './homeSeekersWebsiteBridge.js'

const reply = (status, body) => ({ status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, body })
const clean = (value, limit) => typeof value === 'string' ? value.trim().slice(0, limit) : ''
export async function createHomeSeekersRecruitmentResponse({ method = 'POST', headers = {}, body = {}, getConnection = getHomeSeekersWebsiteConnection, env = process.env } = {}) {
  if (method !== 'POST') return reply(405, { error: 'method_not_allowed' })
  if (!body || typeof body !== 'object' || Array.isArray(body)) return reply(400, { error: 'Please complete the required fields.' })
  const host = clean(headers.host || headers.Host, 255).toLowerCase()
  let page
  try { page = new URL(body.pageUrl) } catch { return reply(400, { error: 'Invalid application page.' }) }
  if (!['http:', 'https:'].includes(page.protocol) || page.host.toLowerCase() !== host || page.pathname !== '/demo/homeseekers/join') return reply(400, { error: 'Invalid application page.' })
  if (clean(body.companyWebsite, 256)) return reply(202, { accepted: true, duplicate: true })
  const payload = { name: clean(body.name, 120), email: clean(body.email, 254).toLowerCase(), phone: clean(body.phone, 30), area: clean(body.area, 120), message: clean(body.message, 3000), sales: body.sales, privacyAccepted: body.privacyAccepted === true, pagePath: page.pathname }
  if (payload.name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email) || payload.phone.replace(/\D/g, '').length < 9 || payload.area.length < 2 || !Number.isInteger(payload.sales) || payload.sales < 0 || payload.sales > 10000 || !payload.message || !payload.privacyAccepted || !/^[A-Za-z0-9._:-]{16,128}$/.test(body.idempotencyKey || '')) return reply(400, { error: 'Please complete the required fields with a valid email, mobile number and sales count.' })
  const secret = clean(env.WEBSITES_LEAD_FINGERPRINT_SECRET, 256)
  if (secret.length < 32) return reply(503, { error: 'Applications are temporarily unavailable. Please try again later.' })
  const address = clean(headers['x-forwarded-for'] || headers['x-real-ip'] || 'local', 512).split(',')[0].trim()
  const fingerprint = createHmac('sha256', secret).update(`recruitment:${host}:${address}`).digest('hex')
  try {
    const { client, site, hostname } = await getConnection()
    const { data, error } = await client.rpc('home_seekers_capture_application', { p_site_id: site.id, p_hostname: hostname, p_payload: payload, p_idempotency_key: body.idempotencyKey, p_fingerprint: fingerprint })
    if (error) throw error
    if (data?.rateLimited) return reply(429, { error: 'Please wait before sending another application.' })
    if (data?.accepted !== true) throw new Error('Application not accepted')
    return reply(data.duplicate ? 202 : 201, { accepted: true, duplicate: data.duplicate === true })
  } catch (error) {
    // Log codes only: never application data, addresses or database error details.
    console.error('[home-seekers-recruitment] capture failed', { code: error?.code || 'capture_failed' })
    return reply(503, { error: 'Your application could not be recorded. Your answers are still here. Please try again.' })
  }
}
