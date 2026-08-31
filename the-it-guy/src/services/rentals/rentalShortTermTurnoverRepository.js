import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient.js'

const SELECT_FIELDS = 'id, organisation_id, branch_id, property_id, unit_id, booking_id, status, due_at, completed_at, notes, rental_properties(name), rental_units(unit_label), rental_short_term_bookings(guest_name, check_out_at)'
const text = (value) => String(value ?? '').trim()
const required = (client = supabase) => { if (!isSupabaseConfigured || !client) throw new Error('Short-Term turnovers require Supabase configuration.'); return client }
const failure = (error = {}) => new Error(['42P01', 'PGRST204', 'PGRST205'].includes(String(error.code || '').toUpperCase()) ? 'Short-Term turnover operations are not yet applied to this environment.' : (error.message || 'Short-Term turnover request failed.'))
const map = (row = {}) => ({ id: text(row.id), status: text(row.status), dueAt: row.due_at || null, completedAt: row.completed_at || null, notes: text(row.notes), propertyName: text(row.rental_properties?.name) || 'Property', unitLabel: text(row.rental_units?.unit_label) || 'Unit', guestName: text(row.rental_short_term_bookings?.guest_name) || 'Guest' })

export async function listShortTermTurnovers({ organisationId = '', branchId = '' } = {}, { client = supabase } = {}) {
  if (!text(organisationId)) return []
  let query = required(client).from('rental_short_term_turnovers').select(SELECT_FIELDS).eq('organisation_id', text(organisationId)).order('due_at').limit(200)
  if (text(branchId)) query = query.eq('branch_id', text(branchId))
  const result = await query
  if (result.error) throw failure(result.error)
  return (result.data || []).map(map)
}

export async function updateShortTermTurnoverStatus(turnoverId = '', status = '', { client = supabase } = {}) {
  if (!text(turnoverId)) throw new Error('Turnover id is required.')
  const result = await required(client).from('rental_short_term_turnovers').update({ status: text(status) }).eq('id', text(turnoverId)).select(SELECT_FIELDS).single()
  if (result.error) throw failure(result.error)
  return map(result.data)
}
