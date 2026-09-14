import { supabase, isSupabaseConfigured } from '../../lib/supabaseClient.js'

const text = (value) => String(value ?? '').trim()
const requireClient = (client = supabase) => {
  if (!client || (!isSupabaseConfigured && client === supabase)) throw new Error('Rental move-in requires Supabase configuration.')
  return client
}

export async function getRentalTenancyMoveInWorkspace(tenancyId, { client = supabase } = {}) {
  const db = requireClient(client)
  const [summary, readiness] = await Promise.all([
    db.rpc('rental_get_tenancy_workspace_summary', { p_tenancy_id: text(tenancyId) }),
    db.from('rental_move_in_readiness_items').select('id, obligation_type, required_amount, received_amount, status, evidence_link, exception_reason, reviewed_at').eq('tenancy_id', text(tenancyId)).order('obligation_type'),
  ])
  if (summary.error) throw summary.error
  if (readiness.error) throw readiness.error
  return { ...(summary.data || {}), readinessItems: readiness.data || [] }
}

export async function recordRentalMoveInReadiness({ readinessItemId, status, receivedAmount, evidenceLink, exceptionReason } = {}, { client = supabase } = {}) {
  const result = await requireClient(client).rpc('rental_record_move_in_readiness', { p_readiness_item_id: text(readinessItemId), p_status: text(status), p_received_amount: receivedAmount === '' || receivedAmount == null ? null : Number(receivedAmount), p_evidence_link: text(evidenceLink) || null, p_exception_reason: text(exceptionReason) || null })
  if (result.error) throw result.error
  return result.data
}

export async function startRentalIncomingInspection(tenancyId, scheduledFor = null, { client = supabase } = {}) {
  const result = await requireClient(client).rpc('rental_start_incoming_inspection', { p_tenancy_id: text(tenancyId), p_scheduled_for: scheduledFor || null })
  if (result.error) throw result.error
  return result.data
}

export async function activateRentalTenancy(tenancyId, { client = supabase } = {}) {
  const result = await requireClient(client).rpc('rental_activate_tenancy', { p_tenancy_id: text(tenancyId) })
  if (result.error) throw result.error
  return result.data
}
