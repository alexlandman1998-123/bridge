import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient.js'

export async function getRentalFinancialReconciliation(organisationId, { client = supabase } = {}) {
  if (!isSupabaseConfigured || !client) throw new Error('Rental financial reconciliation requires Supabase configuration.')
  if (!organisationId) return { metrics: {}, checks: [], overallocated_payments: [] }
  const result = await client.rpc('rental_get_financial_reconciliation', { p_org: organisationId })
  if (result.error) throw result.error
  return result.data || { metrics: {}, checks: [], overallocated_payments: [] }
}
