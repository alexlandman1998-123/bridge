import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient.js'

const requireClient = (client = supabase) => { if (!isSupabaseConfigured || !client) throw new Error('Rental pilot readiness requires Supabase configuration.'); return client }

export async function getRentalPilotReadiness({ client = supabase } = {}) {
  const result = await requireClient(client).rpc('rental_get_pilot_readiness')
  if (result.error) throw result.error
  return result.data || { scope: {}, checks: [] }
}
