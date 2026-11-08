import { createClient } from '@supabase/supabase-js'

export async function queueHomeSeekersJoinFollowUp({ env, key, contact, fingerprint, client }) {
  const db = client || createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  const params = { p_key: key, p_contact: contact, p_fingerprint: fingerprint }
  const queued = await db.rpc('home_seekers_queue_join_follow_up', params)
  if (queued.error) throw new Error('Join delivery queue unavailable')
  if (!queued.data?.accepted || !queued.data.deliveryQueued) return queued.data || {}
  // The scheduled worker retains responsibility if this immediate attempt fails.
  // It freezes each message and retries with the same provider idempotency key.
  await db.functions.invoke('recruitment-contact-dispatcher', { body: {} }).catch(() => null)
  const status = await db.rpc('home_seekers_queue_join_follow_up', params)
  if (status.error) return queued.data
  return status.data || queued.data
}
