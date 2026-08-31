import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient.js'

function client(value = supabase) {
  if (!isSupabaseConfigured || !value) throw new Error('Pilot execution monitoring requires Supabase configuration.')
  return value
}

export async function getRentalPilotExecutionMonitor(organisationId, { db = supabase } = {}) {
  if (!organisationId) return { metrics: {}, alerts: [], gate: {} }
  const result = await client(db).rpc('rental_get_pilot_execution_monitor', { p_org: organisationId })
  if (result.error) throw result.error
  return result.data || { metrics: {}, alerts: [], gate: {} }
}
