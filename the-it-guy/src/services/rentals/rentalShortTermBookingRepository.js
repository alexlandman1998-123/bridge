import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient.js'
import { createShortTermBookingPayload, mapShortTermBooking } from './rentalShortTermBookingModel.js'

const SELECT_FIELDS = 'id, organisation_id, branch_id, property_id, unit_id, status, guest_name, guest_email, guest_phone, source, check_in_at, check_out_at, adults, children, notes, created_at, rental_properties(name, metadata_json), rental_units(unit_label)'
const text = (value) => String(value ?? '').trim()
const required = (client = supabase) => { if (!isSupabaseConfigured || !client) throw new Error('Short-Term bookings require Supabase configuration.'); return client }
const failure = (error = {}) => new Error(['42P01', 'PGRST204', 'PGRST205'].includes(String(error.code || '').toUpperCase()) ? 'Short-Term bookings are not yet applied to this environment.' : (error.message || 'Short-Term booking request failed.'))

export async function listShortTermBookings({ organisationId = '', branchId = '', from = '' } = {}, { client = supabase } = {}) {
  if (!text(organisationId)) return []
  let query = required(client).from('rental_short_term_bookings').select(SELECT_FIELDS).eq('organisation_id', text(organisationId)).order('check_in_at').limit(200)
  if (text(branchId)) query = query.eq('branch_id', text(branchId))
  if (text(from)) query = query.gte('check_out_at', text(from))
  const result = await query
  if (result.error) throw failure(result.error)
  return (result.data || []).map(mapShortTermBooking)
}

export async function createShortTermBooking(values = {}, { client = supabase } = {}) {
  const result = await required(client).from('rental_short_term_bookings').insert(createShortTermBookingPayload(values)).select(SELECT_FIELDS).single()
  if (result.error) throw failure(result.error)
  return mapShortTermBooking(result.data)
}

export async function updateShortTermBookingStatus(bookingId = '', status = '', { client = supabase } = {}) {
  if (!text(bookingId)) throw new Error('Booking id is required.')
  const result = await required(client).from('rental_short_term_bookings').update({ status: text(status) }).eq('id', text(bookingId)).select(SELECT_FIELDS).single()
  if (result.error) throw failure(result.error)
  return mapShortTermBooking(result.data)
}
