import { getHomeSeekersWebsiteConnection, isHomeSeekersPageUrl } from '../../server/services/homeSeekersWebsiteBridge.js'
import { writeNodeJsonResponse } from '../../server/services/hqMissionControlApi.js'

async function readBody(request) {
  if (request.body && typeof request.body === 'object') return request.body
  if (typeof request.body === 'string') return JSON.parse(request.body || '{}')
  const chunks = []
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
}

export default async function handler(request, response) {
  const ignore = () => writeNodeJsonResponse(response, { status: 204, headers: { 'Cache-Control': 'no-store' }, body: null })
  if (request.method !== 'POST') return ignore()
  if (Number(request.headers['content-length'] || 0) > 1024) return ignore()
  const host = String(request.headers.host || '').toLowerCase().replace(/:\d+$/, '')
  let origin
  try { origin = new URL(String(request.headers.origin || '')) } catch { return ignore() }
  if (origin.hostname !== host) return ignore()
  const body = await readBody(request).catch(() => ({}))
  const eventType = String(body.eventType || '')
  const path = String(body.path || '')
  const listingId = String(body.listingId || '') || null
  if (!['site_visit', 'page_view', 'listing_view'].includes(eventType)
    || !isHomeSeekersPageUrl(`${origin.origin}${path}`)
    || (eventType === 'listing_view' && !listingId)
    || (eventType !== 'listing_view' && listingId)) return ignore()
  try {
    const { client, hostname } = await getHomeSeekersWebsiteConnection()
    const { error } = await client.rpc('website_record_analytics_event', {
      p_hostname: hostname,
      p_event_type: eventType,
      p_page_path: path,
      p_listing_id: listingId,
    })
    if (error) throw error
  } catch (error) {
    console.error('[home-seekers-analytics] capture failed', { code: error?.code, message: String(error?.message || '').slice(0, 160) })
  }
  return ignore()
}
