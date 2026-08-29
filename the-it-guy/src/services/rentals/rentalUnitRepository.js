import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient.js'
import { createRentalUnitPayload, mapRentalUnit } from './rentalUnitModel.js'

const SELECT_FIELDS = 'id, organisation_id, property_id, branch_id, unit_label, bedrooms, bathrooms, parking_count, floor_area_sqm, target_rent, deposit_amount, available_from, status, active_tenancy_id, metadata_json, created_at, updated_at'
const text = (value) => String(value ?? '').trim()
function requireClient(client = supabase) { if (!isSupabaseConfigured || !client) throw new Error('Rental units require Supabase configuration.'); return client }
function unavailable(error = {}) { const missing = ['42P01', 'PGRST204', 'PGRST205'].includes(String(error.code || '').toUpperCase()); return new Error(missing ? 'Rental unit foundation is not yet applied to this environment.' : (error.message || 'Rental unit request failed.')) }

export async function listRentalUnits({ propertyId = '', limit = 100 } = {}, { client = supabase } = {}) {
  if (!text(propertyId)) return []
  const result = await requireClient(client).from('rental_units').select(SELECT_FIELDS).eq('property_id', text(propertyId)).order('unit_label').limit(Math.min(Math.max(Number(limit) || 100, 1), 200))
  if (result.error) throw unavailable(result.error)
  return (result.data || []).map(mapRentalUnit)
}
export async function createRentalUnit(values = {}, { client = supabase } = {}) {
  const result = await requireClient(client).from('rental_units').insert(createRentalUnitPayload(values)).select(SELECT_FIELDS).single()
  if (result.error) throw unavailable(result.error)
  return mapRentalUnit(result.data)
}
export async function updateRentalUnitFacts(unitId = '', values = {}, { client = supabase } = {}) {
  if (!text(unitId)) throw new Error('Rental unit id is required.')
  const payload = createRentalUnitPayload(values)
  delete payload.organisation_id; delete payload.property_id; delete payload.branch_id; delete payload.status; delete payload.created_by
  const result = await requireClient(client).from('rental_units').update(payload).eq('id', text(unitId)).select(SELECT_FIELDS).single()
  if (result.error) throw unavailable(result.error)
  return mapRentalUnit(result.data)
}
