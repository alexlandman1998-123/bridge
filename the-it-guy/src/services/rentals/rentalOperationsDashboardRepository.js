import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient.js'

const requireClient = (client = supabase) => { if (!isSupabaseConfigured || !client) throw new Error('Rental dashboard requires Supabase configuration.'); return client }

export async function getRentalOperationsDashboard({ client = supabase } = {}) {
  const result = await requireClient(client).rpc('rental_get_operations_dashboard')
  if (result.error) throw result.error
  return result.data || { version: 'arch9_rental_operations_dashboard_v2', metrics: {}, attention: [], upcoming: [] }
}

export async function getRentalManagementDashboard({
  organisationId,
  branchId = null,
  scope = 'company',
  rangeDays = 30,
  client = supabase,
} = {}) {
  if (!organisationId) throw new Error('A Rentals organisation is required before loading this dashboard.')
  const result = await requireClient(client).rpc('rental_get_management_dashboard', {
    p_organisation_id: organisationId,
    p_branch_id: branchId || null,
    p_scope: scope === 'agent' ? 'agent' : 'company',
    p_range_days: rangeDays,
  })
  if (result.error) throw result.error
  return result.data || { version: 'arch9_rental_management_dashboard_v1', metrics: {}, occupancy: {}, applications: [], mandate_overview: {}, rent_roll_overview: {} }
}

export async function getRentalManagementDashboardBottomHalf({
  organisationId,
  branchId = null,
  scope = 'company',
  rangeDays = 30,
  client = supabase,
} = {}) {
  if (!organisationId) throw new Error('A Rentals organisation is required before loading this dashboard.')
  const result = await requireClient(client).rpc('rental_get_management_dashboard_bottom_half', {
    p_organisation_id: organisationId,
    p_branch_id: branchId || null,
    p_scope: scope === 'agent' ? 'agent' : 'company',
    p_range_days: rangeDays,
  })
  if (result.error) throw result.error
  return result.data || { portfolio_health: {}, vacancy_letting: {}, renewals: {}, collections: {}, maintenance: {}, recent_activity: [] }
}
