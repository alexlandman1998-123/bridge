import { createScopedSupabaseClient, isSupabaseConfigured, supabase } from '../lib/supabaseClient'

export const CLIENT_ACTIVITY_CATEGORIES = [
  ['all', 'All activity'], ['enquiry', 'Enquiries'], ['interaction', 'Interactions'],
  ['task', 'Tasks'], ['appointment', 'Appointments'], ['transaction', 'Transactions'],
  ['document', 'Documents'], ['offer', 'Offers'], ['portal', 'Client actions'], ['profile', 'Profile changes'],
]
export const CLIENT_INTERACTION_TYPES = ['call', 'note', 'email', 'message', 'meeting']
export const CLIENT_PORTAL_ACTIVITY_SECTIONS = new Set(['overview', 'progress', 'documents', 'offers', 'appointments', 'details', 'account', 'bond_application', 'handover', 'snags', 'settings', 'team', 'alterations', 'review', 'listing_marketing', 'document_access_requested'])
const unavailable = (error) => ['42P01', 'PGRST205', 'PGRST202', '42883'].includes(error?.code)

export async function loadClientActivity(client, { category = 'all', cursor = null, pageSize = 50 } = {}) {
  if (!client?.identityId || !isSupabaseConfigured || !supabase) return { available: false, events: [], nextCursor: null }
  if (!CLIENT_ACTIVITY_CATEGORIES.some(([key]) => key === category)) throw new Error('Choose a valid activity filter.')
  const size = Math.floor(Math.max(1, Math.min(100, Number(pageSize) || 50)))
  const { data, error } = await supabase.rpc('agency_client_activity_page', {
    p_client_id: client.identityId, p_category: category === 'all' ? null : category,
    p_before_at: cursor?.occurred_at || null, p_before_id: cursor?.id || null, p_limit: size + 1,
  })
  if (error) { if (unavailable(error)) return { available: false, events: [], nextCursor: null }; throw error }
  const events = (data || []).slice(0, size)
  const last = events.at(-1)
  return { available: true, events, nextCursor: data?.length > size ? { occurred_at: last.occurred_at, id: last.id } : null }
}

export async function loadLatestClientActivity(organisationId) {
  if (!isSupabaseConfigured || !supabase || !organisationId) return new Map()
  const latest = new Map()
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase.rpc('agency_client_activity_latest', { p_organisation_id: organisationId }).order('client_id').range(offset, offset + 499)
    if (error) { if (unavailable(error)) return new Map(); throw error }
    for (const row of data || []) latest.set(row.client_id, row.last_activity_at)
    if ((data || []).length < 500) return latest
  }
}

export async function logClientInteraction(client, { type, detail, occurredAt, requestId } = {}) {
  if (!client?.identityId) throw new Error('A permanent client profile is required.')
  const text = String(detail || '').trim()
  if (!CLIENT_INTERACTION_TYPES.includes(type) || !text || text.length > 4000 || !requestId || !Number.isFinite(Date.parse(occurredAt))) {
    throw new Error('Choose an interaction type and enter details and a valid time.')
  }
  const { data, error } = await supabase.rpc('agency_client_log_interaction', {
    p_client_id: client.identityId, p_request_id: requestId, p_type: type,
    p_detail: text, p_occurred_at: occurredAt,
  })
  if (error) throw error
  if (!data) throw new Error('The interaction save could not be confirmed. Retry the same entry.')
  return data
}

// Best-effort navigation telemetry never prevents a client from doing their work.
// Credential/session validation and client identity resolution happen server-side.
// No token, URL, form payload or document content enters the activity journal.
export async function recordClientPortalVisit({ token, sellerAccessToken = '', section, requestId }) {
  if (!isSupabaseConfigured || !token || !requestId || !CLIENT_PORTAL_ACTIVITY_SECTIONS.has(section)) return { recorded: false }
  const client = createScopedSupabaseClient({ 'x-bridge-client-portal-token': token, 'x-bridge-seller-portal-access-token': sellerAccessToken })
  if (!client) return { recorded: false }
  const { error } = await client.rpc('agency_client_record_portal_visit', {
    p_token: token, p_seller_access_token: sellerAccessToken || null, p_section: section, p_request_id: requestId,
  })
  if (error) return { recorded: false, unavailable: unavailable(error) }
  return { recorded: true }
}

export function clientActivityRecordPath(event) {
  if (event.source_kind === 'lead') return `/pipeline/leads/${event.source_id}`
  if (event.source_kind === 'listing_seller') return `/agent/listings/${event.source_id}`
  if (['transaction_buyer', 'transaction_seller'].includes(event.source_kind)) return `/transactions/${event.source_id}`
  return null
}
