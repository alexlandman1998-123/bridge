import { timingSafeEqual, createHash } from 'node:crypto'
import { runListingPublicationJobs } from '../../server/services/listingPublicationJobs.js'
import { writeNodeJsonResponse } from '../../server/services/hqMissionControlApi.js'
const digest = value => createHash('sha256').update(value).digest()
export default async function handler(request, response) {
  const reply = (status, body) => writeNodeJsonResponse(response, { status, body, headers: { 'Cache-Control': 'private, no-store' } })
  if (request.method !== 'GET') return reply(405, { error: 'method_not_allowed' })
  if (!process.env.CRON_SECRET || !timingSafeEqual(digest(String(request.headers.authorization || '')), digest(`Bearer ${process.env.CRON_SECRET}`))) return reply(401, { error: 'unauthorised' })
  try { return reply(200, { jobs: await runListingPublicationJobs() }) }
  catch { return reply(503, { error: 'publication_worker_interrupted' }) }
}
