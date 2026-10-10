import { createClient } from '@supabase/supabase-js'
import { waitUntil } from '@vercel/functions'
import { readExternalWebsiteBody } from '../../server/services/externalWebsiteApi.js'
import { runListingPublicationJobs, publicationJobClient } from '../../server/services/listingPublicationJobs.js'
import { writeNodeJsonResponse } from '../../server/services/hqMissionControlApi.js'

export default async function handler(request, response, env = process.env) {
  const reply = (status, body) => writeNodeJsonResponse(response, { status, body, headers: { 'Cache-Control': 'private, no-store' } })
  if (request.method !== 'POST') return reply(405, { message: 'Use POST to submit a publishing request.' })
  const token = String(request.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!token) return reply(401, { message: 'Sign in before publishing.' })
  try {
    const admin = publicationJobClient(env)
    const user = await admin.auth.getUser(token)
    if (user.error || !user.data?.user?.id) return reply(401, { message: 'Sign in again before publishing.' })
    const payload = await readExternalWebsiteBody(request)
    const client = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${token}` } },
    })
    const updating = payload.action === 'update'
    const { data, error } = await client.rpc(updating ? 'enqueue_listing_publication_update' : 'enqueue_listing_publication', { p_listing_id: payload.listingId, p_channels: payload.channels, ...(updating ? { p_request_key: payload.requestKey } : {}) })
    if (error) return reply(error.code === '42501' ? 403 : 422, { message: error.message })
    // The durable row is committed before acknowledgement. Cron also picks it
    // up if this invocation ends before the worker starts.
    waitUntil(runListingPublicationJobs({ client: admin, listingId: payload.listingId, env }).catch(() => console.warn('[listing-publication] worker interrupted; check persisted job status')))
    return reply(202, { jobs: data })
  } catch { return reply(503, { message: 'Publishing could not be queued. Your saved listing is safe; retry to check the same request.' }) }
}
