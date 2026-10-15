import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient.js'

const text = value => String(value ?? '').trim()
function client(db) {
  if (!isSupabaseConfigured || !db) throw new Error('Rental inventory requires a configured connection.')
  return db
}
function failure(error) {
  return new Error(['42883', 'PGRST202', 'PGRST204'].includes(error?.code)
    ? 'Rental listing and vacancy linking is not yet available in this environment.'
    : error?.message || 'Unable to connect the rental inventory.')
}
export async function getRentalListingInventory(listingId, organisationId, { client: db = supabase } = {}) {
  if (!text(listingId) || !text(organisationId)) throw new Error('A saved rental listing and organisation are required.')
  const { data, error } = await client(db).from('private_listings')
    .select('id,organisation_id,rental_property_id,rental_unit_id,rental_vacancy_id')
    .eq('id', listingId).eq('organisation_id', organisationId).eq('listing_category', 'rental').maybeSingle()
  if (error) throw failure(error)
  if (!data) throw new Error('This rental listing is unavailable in your workspace.')
  return { listingId: data.id, propertyId: data.rental_property_id || '', unitId: data.rental_unit_id || '', vacancyId: data.rental_vacancy_id || '' }
}
export async function ensureRentalListingVacancy(listingId, organisationId, { client: db = supabase } = {}) {
  if (!text(listingId) || !text(organisationId)) throw new Error('A saved rental listing and organisation are required.')
  const { data, error } = await client(db).rpc('rental_ensure_listing_vacancy', { p_listing_id: listingId, p_organisation_id: organisationId })
  if (error) throw failure(error)
  if (!data || data.listingId !== listingId || (data.applicable !== false && (!data.propertyId || !data.unitId || !data.vacancyId)))
    throw new Error('The rental inventory connection could not be confirmed. Reopen this listing before retrying.')
  return data
}
