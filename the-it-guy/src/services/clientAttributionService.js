import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'

const unavailable = (error) => ['42P01', 'PGRST205', 'PGRST202', '42883'].includes(error?.code)
export async function loadClientAttribution(client, { cursor = null, pageSize = 25, includeSummary = true } = {}) {
  if (!client?.identityId || !isSupabaseConfigured || !supabase) return { available: false, touches: [], nextCursor: null, summary: null }
  const size = Math.floor(Math.max(1, Math.min(100, Number(pageSize) || 25)))
  const [page, summary] = await Promise.all([
    supabase.rpc('agency_client_attribution_page', { p_client_id: client.identityId, p_before_at: cursor?.occurred_at || null, p_before_id: cursor?.id || null, p_limit: size + 1 }),
    includeSummary ? supabase.rpc('agency_client_attribution_summary', { p_client_id: client.identityId }) : Promise.resolve({ data: null }),
  ])
  for (const result of [page, summary]) {
    if (result.error) {
      if (unavailable(result.error)) return { available: false, touches: [], nextCursor: null, summary: null }
      throw result.error
    }
  }
  if (includeSummary && !summary.data) throw new Error('This client profile is unavailable or you no longer have access. Reload the client directory.')
  const touches = (page.data || []).slice(0, size)
  const last = touches.at(-1)
  return { available: true, touches, summary: summary.data, nextCursor: page.data?.length > size ? { occurred_at: last.occurred_at, id: last.id } : null }
}

export function attributionSourceLabel(touch) {
  return touch?.utm_source || touch?.source_channel || 'Source not captured'
}
