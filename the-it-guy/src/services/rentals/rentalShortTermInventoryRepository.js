import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient.js'
import { createShortTermUnitModePayload, mapShortTermUnitInventory } from './rentalShortTermInventoryModel.js'

const SELECT_FIELDS = 'id, organisation_id, property_id, branch_id, unit_label, bedrooms, bathrooms, status, rental_properties!inner(id, name), rental_unit_operating_modes(id, operating_mode, status, effective_from, effective_to, configuration), rental_unit_occupancy_blocks(id, status, starts_at, ends_at, source_type)'
const text = (value) => String(value ?? '').trim()
const clientRequired = (client = supabase) => { if (!isSupabaseConfigured || !client) throw new Error('Short-Term inventory requires Supabase configuration.'); return client }
const failure = (error = {}) => new Error(['42P01', 'PGRST204', 'PGRST205'].includes(String(error.code || '').toUpperCase()) ? 'Short-Term inventory foundation is not yet applied to this environment.' : (error.message || 'Short-Term inventory request failed.'))

export async function listShortTermUnitInventory({ organisationId = '', branchId = '' } = {}, { client = supabase } = {}) {
  if (!text(organisationId)) return []
  let query = clientRequired(client).from('rental_units').select(SELECT_FIELDS).eq('organisation_id', text(organisationId)).order('unit_label').limit(250)
  if (text(branchId)) query = query.eq('branch_id', text(branchId))
  const result = await query
  if (result.error) throw failure(result.error)
  return (result.data || []).map(mapShortTermUnitInventory)
}

export async function enableUnitForShortTerm(values = {}, { client = supabase } = {}) {
  const result = await clientRequired(client).from('rental_unit_operating_modes').insert(createShortTermUnitModePayload(values)).select().single()
  if (result.error) throw failure(result.error)
  return result.data
}
