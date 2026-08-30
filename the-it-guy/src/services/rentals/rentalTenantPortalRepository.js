import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient.js'

const text = (value) => String(value ?? '').trim()
const requireClient = (client = supabase) => {
  if (!isSupabaseConfigured || !client) throw new Error('Tenant portal requires Supabase configuration.')
  return client
}

export async function listRentalTenantPortalAccess({ client = supabase } = {}) {
  const result = await requireClient(client).from('rental_tenant_portal_access').select('id, tenancy_id, status, granted_at').eq('status', 'active').order('granted_at', { ascending: false })
  if (result.error) throw result.error
  return result.data || []
}

export async function listRentalTenantPortalActions(tenancyId, { client = supabase } = {}) {
  const result = await requireClient(client).from('rental_tenant_portal_actions').select('id, action_type, payload, canonical_record_id, status, created_at').eq('tenancy_id', text(tenancyId)).order('created_at', { ascending: false }).limit(50)
  if (result.error) throw result.error
  return result.data || []
}

export async function submitRentalTenantPortalAction({ tenancyId, actionType, payload = {}, clientRequestId = crypto.randomUUID() } = {}, { client = supabase } = {}) {
  const result = await requireClient(client).rpc('rental_submit_tenant_portal_action', {
    p_tenancy_id: text(tenancyId),
    p_action_type: text(actionType),
    p_client_request_id: clientRequestId,
    p_payload: payload && typeof payload === 'object' ? payload : {},
  })
  if (result.error) throw result.error
  return { ...(result.data || {}), clientRequestId }
}

export async function submitRentalTenantNotice({ tenancyId, noticeType, effectiveOn, evidenceLink, note = '' } = {}, { client = supabase } = {}) {
  const result = await requireClient(client).rpc('rental_submit_portal_notice', { p_tenancy_id: text(tenancyId), p_notice_type: text(noticeType), p_effective_on: effectiveOn || null, p_evidence_link: text(evidenceLink), p_note: text(note) || null })
  if (result.error) throw result.error
  return result.data
}
