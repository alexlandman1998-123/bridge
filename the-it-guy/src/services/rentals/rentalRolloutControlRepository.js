import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient.js'

function client(value = supabase) {
  if (!isSupabaseConfigured || !value) throw new Error('Rental rollout controls require Supabase configuration.')
  return value
}

export async function getRentalRolloutControls(organisationId, { db = supabase } = {}) {
  if (!organisationId) return { controls: [], recent_events: [] }
  const result = await client(db).rpc('rental_get_rollout_controls', { p_org: organisationId })
  if (result.error) throw result.error
  return result.data || { controls: [], recent_events: [] }
}

export async function setRentalRolloutControl(input = {}, { db = supabase } = {}) {
  const result = await client(db).rpc('rental_set_rollout_control', {
    p_org: input.organisationId,
    p_capability_key: input.capabilityKey,
    p_status: input.status,
    p_cohort_label: input.cohortLabel || null,
    p_max_active_tenancies: input.maxActiveTenancies === '' || input.maxActiveTenancies == null ? null : Number(input.maxActiveTenancies),
    p_reason: input.reason || null,
    p_idempotency_key: input.idempotencyKey,
  })
  if (result.error) throw result.error
  return result.data
}
