import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient.js'

function client(value = supabase) {
  if (!isSupabaseConfigured || !value) throw new Error('Pilot launch controls require Supabase configuration.')
  return value
}

export async function getRentalPilotLaunchGate(organisationId, { db = supabase } = {}) {
  if (!organisationId) return {}
  const result = await client(db).rpc('rental_get_pilot_launch_gate', { p_org: organisationId })
  if (result.error) throw result.error
  return result.data || {}
}

export async function recordRentalPilotReleaseDecision(input = {}, { db = supabase } = {}) {
  const result = await client(db).rpc('rental_record_pilot_release_decision', {
    p_org: input.organisationId,
    p_decision: input.decision,
    p_cohort_label: input.cohortLabel,
    p_max_active_tenancies: Number(input.maxActiveTenancies),
    p_note: input.note,
    p_idempotency_key: input.idempotencyKey,
  })
  if (result.error) throw result.error
  return result.data
}
