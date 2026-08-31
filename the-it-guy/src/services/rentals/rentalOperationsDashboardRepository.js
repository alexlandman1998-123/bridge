import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient.js'

const requireClient = (client = supabase) => { if (!isSupabaseConfigured || !client) throw new Error('Rental dashboard requires Supabase configuration.'); return client }

export async function getRentalOperationsDashboard({ client = supabase } = {}) {
  const result = await requireClient(client).rpc('rental_get_operations_dashboard')
  if (result.error) throw result.error
  return result.data || { version: 'arch9_rental_operations_dashboard_v2', metrics: {}, attention: [], upcoming: [] }
}
