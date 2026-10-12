import { getHomeSeekersWebsiteConnection, homeSeekersPagePath, isHomeSeekersPageUrl } from '../../server/services/homeSeekersWebsiteBridge.js'
import { writeHomeSeekersJsonResponse as writeNodeJsonResponse } from '../../server/services/homeSeekersApiResponse.js'
import { isHomeSeekersPublicTraffic } from '../../src/pages/homeSeekersPublicTraffic.js'

async function readBody(request) {
  if (request.body && typeof request.body === 'object') return request.body
  if (typeof request.body === 'string') return JSON.parse(request.body || '{}')
  const chunks = []
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
}

export default async function handler(request, response) {
  const ignore = () => writeNodeJsonResponse(response, { status: 204, headers: { 'Cache-Control': 'no-store' }, body: null })
  if (process.env.VERCEL_ENV === 'preview') return ignore()
  if (request.method !== 'POST') return ignore()
  if (Number(request.headers['content-length'] || 0) > 1024) return ignore()
  const host = String(request.headers.host || '').toLowerCase().replace(/:\d+$/, '')
  let origin
  try { origin = new URL(String(request.headers.origin || '')) } catch { return ignore() }
  if (origin.hostname !== host) return ignore()
  const body = await readBody(request).catch(() => ({}))
  const eventType = String(body.eventType || '')
  const path = String(body.path || '')
  let refererSearch = ''
  try { refererSearch = new URL(String(request.headers.referer || '')).search } catch { /* Origin is checked above. */ }
  if (body.trackingVersion !== 1 || !isHomeSeekersPublicTraffic({ hostname: host, pathname: path, search: refererSearch }) ||
    /bot|crawler|spider|headless|playwright|puppeteer/i.test(String(request.headers['user-agent'] || '')) ||
    ['iframe', 'frame'].includes(String(request.headers['sec-fetch-dest'] || ''))) return ignore()
  const conversion = ['guarantee_opened', 'ppra_letter_opened'].includes(eventType)
  const listingId = String(body.listingId || '') || null
  if (!['site_visit', 'page_view', 'listing_view', 'guarantee_opened', 'ppra_letter_opened'].includes(eventType)
    || (conversion && homeSeekersPagePath(path) !== '/join')
    || !isHomeSeekersPageUrl(`${origin.origin}${path}`)
    || (eventType === 'listing_view' && !listingId)
    || (eventType !== 'listing_view' && listingId)) return ignore()
  try {
    const { client } = await getHomeSeekersWebsiteConnection()
    const { error } = await client.rpc('home_seekers_record_public_analytics_event', {
      p_hostname: host,
      p_event_type: eventType,
      // Conversion events retain the existing database's /join attribution
      // contract. Page and listing views record their actual public URL.
      p_page_path: path,
      p_listing_id: listingId,
    })
    if (error) throw error
  } catch (error) {
    console.error('[home-seekers-analytics] capture failed', { code: error?.code, message: String(error?.message || '').slice(0, 160) })
  }
  return ignore()
}
