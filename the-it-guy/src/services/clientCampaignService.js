import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'

export const CLIENT_CAMPAIGN_RESPONSE_TYPES = [
  ['email_reply', 'Email reply'], ['phone_reply', 'Phone response'], ['enquiry', 'Enquiry'], ['rsvp', 'RSVP'], ['other', 'Other response'],
]
const unavailable = error => ['42P01', 'PGRST205', 'PGRST202', '42883'].includes(error?.code)
export async function loadClientCampaigns(client, { cursor = null, pageSize = 25, includeSummary = true } = {}) {
  if (!client?.identityId || !isSupabaseConfigured || !supabase) return { available: false, campaigns: [], summary: null, nextCursor: null }
  const size = Math.floor(Math.max(1, Math.min(100, Number(pageSize) || 25)))
  const [page, summary] = await Promise.all([
    supabase.rpc('agency_client_campaign_page', { p_client_id: client.identityId, p_before_at: cursor?.created_at || null, p_before_id: cursor?.id || null, p_limit: size + 1 }),
    includeSummary ? supabase.rpc('agency_client_campaign_summary', { p_client_id: client.identityId }) : Promise.resolve({ data: null }),
  ])
  for (const result of [page, summary]) {
    if (result.error) {
      if (unavailable(result.error)) return { available: false, campaigns: [], summary: null, nextCursor: null }
      throw result.error
    }
  }
  if (includeSummary && !summary.data) throw new Error('This client profile is unavailable or you no longer have access. Reload the client directory.')
  const campaigns = (page.data || []).slice(0, size)
  const last = campaigns.at(-1)
  return { available: true, campaigns, summary: summary.data, nextCursor: page.data?.length > size ? { created_at: last.created_at, id: last.id } : null }
}
export async function logClientCampaignResponse(client, { recipientId, requestId, kind, detail, occurredAt } = {}) {
  if (!client?.identityId || !isSupabaseConfigured || !supabase) throw new Error('A permanent client profile and database connection are required.')
  const text = String(detail || '').trim()
  if (!recipientId || !requestId || !CLIENT_CAMPAIGN_RESPONSE_TYPES.some(([key]) => key === kind) || !text || text.length > 4000 || !Number.isFinite(Date.parse(occurredAt))) throw new Error('Choose a response type and enter details and a valid time.')
  const { data, error } = await supabase.rpc('agency_client_log_campaign_response', { p_client_id: client.identityId, p_recipient_id: recipientId, p_request_id: requestId, p_kind: kind, p_detail: text, p_occurred_at: occurredAt })
  if (error) throw error
  if (!data) throw new Error('The response save could not be confirmed. Retry the same entry.')
  return data
}
export function campaignResponseLabel(kind) {
  return CLIENT_CAMPAIGN_RESPONSE_TYPES.find(([key]) => key === kind)?.[1] || 'Response'
}
