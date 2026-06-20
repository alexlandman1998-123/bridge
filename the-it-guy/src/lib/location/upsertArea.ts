import type { AddressAutocompleteValue } from '../../components/location/AddressAutocomplete'
import { isSupabaseConfigured, supabase } from '../supabaseClient'

type UpsertAreaOptions = {
  incrementListingCount?: boolean
}

function normalizeText(value: unknown) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

export function normalizeAreaKey(value: unknown) {
  return normalizeText(value).toLowerCase()
}

export async function upsertAreaByName(
  name: string,
  {
    city = '',
    province = '',
    country = 'South Africa',
    incrementListingCount = false,
  }: UpsertAreaOptions & { city?: string; province?: string; country?: string } = {},
) {
  const normalizedName = normalizeText(name)
  if (!normalizedName || !isSupabaseConfigured || !supabase) return null

  const { data, error } = await supabase.rpc('arch9_upsert_area', {
    p_name: normalizedName,
    p_city: normalizeText(city) || null,
    p_province: normalizeText(province) || null,
    p_country: normalizeText(country) || 'South Africa',
    p_google_place_id: null,
    p_latitude: null,
    p_longitude: null,
    p_increment_listing_count: Boolean(incrementListingCount),
  })

  if (error) {
    console.warn('[areas] Area upsert skipped.', error)
    return null
  }

  return data
}

export async function upsertAreaFromAddress(
  address: AddressAutocompleteValue | null | undefined,
  { incrementListingCount = false }: UpsertAreaOptions = {},
) {
  const name = normalizeText(address?.suburb)
  if (!name || !isSupabaseConfigured || !supabase) return null

  const { data, error } = await supabase.rpc('arch9_upsert_area', {
    p_name: name,
    p_city: normalizeText(address?.city) || null,
    p_province: normalizeText(address?.province) || null,
    p_country: normalizeText(address?.country) || 'South Africa',
    p_google_place_id: normalizeText(address?.placeId) || null,
    p_latitude: typeof address?.latitude === 'number' ? address.latitude : null,
    p_longitude: typeof address?.longitude === 'number' ? address.longitude : null,
    p_increment_listing_count: Boolean(incrementListingCount),
  })

  if (error) {
    console.warn('[areas] Area upsert skipped.', error)
    return null
  }

  return data
}
