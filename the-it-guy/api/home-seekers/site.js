import { getHomeSeekersPublishedListings, getHomeSeekersWebsiteConnection } from '../../server/services/homeSeekersWebsiteBridge.js'
import { writeHomeSeekersJsonResponse as writeNodeJsonResponse } from '../../server/services/homeSeekersApiResponse.js'

export default async function handler(request, response) {
  if (request.method !== 'GET') {
    writeNodeJsonResponse(response, { status: 405, headers: { Allow: 'GET' }, body: { error: 'method_not_allowed' } })
    return
  }
  try {
    const connection = await getHomeSeekersWebsiteConnection()
    const listings = await getHomeSeekersPublishedListings(connection)
    writeNodeJsonResponse(response, {
      status: 200,
      headers: { 'Cache-Control': 'public, max-age=0, s-maxage=60' },
      body: { listings },
    })
  } catch (error) {
    console.error('[home-seekers-site] read failed', { code: error?.code, message: String(error?.message || '').slice(0, 160) })
    writeNodeJsonResponse(response, { status: 503, headers: { 'Cache-Control': 'no-store' }, body: { error: 'Website listings are temporarily unavailable.' } })
  }
}
