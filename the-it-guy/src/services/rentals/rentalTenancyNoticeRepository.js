import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient.js'

const text = (value) => String(value ?? '').trim()
const requireClient = (client = supabase) => { if (!isSupabaseConfigured || !client) throw new Error('Tenancy notices require Supabase configuration.'); return client }

export async function getRentalTenancyNoticeStatus(tenancyId, { client = supabase } = {}) {
  const db = requireClient(client)
  const [result, notices] = await Promise.all([
    db.rpc('rental_get_tenancy_notice_status', { p_tenancy_id: text(tenancyId) }),
    db.from('rental_notices').select('id, source, notice_type, status, received_on, effective_on, evidence_link, note, acknowledged_at').eq('tenancy_id', text(tenancyId)).order('submitted_at', { ascending: false }).limit(1),
  ])
  if (result.error) throw result.error
  if (notices.error) throw notices.error
  return { ...(result.data || {}), latestNotice: notices.data?.[0] || null }
}

export async function captureRentalTenancyNotice({ tenancyId, source, noticeType, receivedOn, effectiveOn, evidenceLink, note } = {}, { client = supabase } = {}) {
  const result = await requireClient(client).rpc('rental_capture_notice', { p_tenancy_id: text(tenancyId), p_source: text(source), p_notice_type: text(noticeType), p_received_on: receivedOn, p_effective_on: effectiveOn, p_evidence_link: text(evidenceLink), p_note: text(note) || null })
  if (result.error) throw result.error
  return result.data
}

export async function acknowledgeRentalTenancyNotice(noticeId, { client = supabase } = {}) {
  const result = await requireClient(client).rpc('rental_acknowledge_notice', { p_notice_id: text(noticeId) })
  if (result.error) throw result.error
  return result.data
}
