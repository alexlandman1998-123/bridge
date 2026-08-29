import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient.js'
import { buildRentalPropertyListQuery, createRentalPropertyPayload, mapRentalProperty } from './rentalPropertyModel.js'

const SELECT_FIELDS = 'id, organisation_id, branch_id, assigned_manager_id, name, property_type, status, address_line_1, address_line_2, suburb, city, province, postal_code, address_normalized, metadata_json, created_by, created_at, updated_at'

function requireClient(client = supabase) {
  if (!isSupabaseConfigured || !client) throw new Error('Rental properties require Supabase configuration.')
  return client
}
function text(value) { return String(value ?? '').trim() }
function missingSchema(error = {}) { return ['42P01', 'PGRST204', 'PGRST205'].includes(String(error.code || '').toUpperCase()) }
function unavailable(error) { return new Error(missingSchema(error) ? 'Rental property foundation is not yet applied to this environment.' : (error?.message || 'Rental property request failed.')) }

export async function listRentalProperties(input = {}, { client = supabase } = {}) {
  const queryOptions = buildRentalPropertyListQuery(input)
  if (!queryOptions.organisationId) return []
  let query = requireClient(client).from('rental_properties').select(SELECT_FIELDS).eq('organisation_id', queryOptions.organisationId).order('updated_at', { ascending: false }).limit(queryOptions.limit)
  if (queryOptions.branchId) query = query.eq('branch_id', queryOptions.branchId)
  if (queryOptions.status && queryOptions.status !== 'all') query = query.eq('status', queryOptions.status)
  if (queryOptions.search) query = query.or(`name.ilike.%${queryOptions.search}%,address_line_1.ilike.%${queryOptions.search}%,city.ilike.%${queryOptions.search}%`)
  const result = await query
  if (result.error) throw unavailable(result.error)
  return (result.data || []).map(mapRentalProperty)
}

export async function getRentalProperty(propertyId = '', { client = supabase } = {}) {
  if (!text(propertyId)) return null
  const result = await requireClient(client).from('rental_properties').select(SELECT_FIELDS).eq('id', text(propertyId)).maybeSingle()
  if (result.error) throw unavailable(result.error)
  return result.data ? mapRentalProperty(result.data) : null
}

export async function createRentalProperty(values = {}, { client = supabase } = {}) {
  const result = await requireClient(client).from('rental_properties').insert(createRentalPropertyPayload(values)).select(SELECT_FIELDS).single()
  if (result.error) throw unavailable(result.error)
  return mapRentalProperty(result.data)
}

export async function updateRentalProperty(propertyId = '', values = {}, { client = supabase } = {}) {
  if (!text(propertyId)) throw new Error('Rental property id is required.')
  const payload = createRentalPropertyPayload(values)
  delete payload.organisation_id
  delete payload.created_by
  const result = await requireClient(client).from('rental_properties').update(payload).eq('id', text(propertyId)).select(SELECT_FIELDS).single()
  if (result.error) throw unavailable(result.error)
  return mapRentalProperty(result.data)
}
