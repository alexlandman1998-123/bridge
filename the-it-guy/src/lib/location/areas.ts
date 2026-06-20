import { isSupabaseConfigured, supabase } from '../supabaseClient'

export type Arch9Area = {
  id: string
  name: string
  city?: string
  province?: string
  country?: string
  googlePlaceId?: string
  latitude?: number | null
  longitude?: number | null
  listingCount?: number
  matchSource?: string
}

function normalizeText(value: unknown) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function mapArea(row: any = {}): Arch9Area {
  return {
    id: normalizeText(row.id),
    name: normalizeText(row.name),
    city: normalizeText(row.city),
    province: normalizeText(row.province),
    country: normalizeText(row.country) || 'South Africa',
    googlePlaceId: normalizeText(row.google_place_id),
    latitude: row.latitude === null || row.latitude === undefined ? null : Number(row.latitude),
    longitude: row.longitude === null || row.longitude === undefined ? null : Number(row.longitude),
    listingCount: Number(row.listing_count || 0) || 0,
    matchSource: normalizeText(row.match_source),
  }
}

export function formatAreaLabel(area: Partial<Arch9Area> | null | undefined) {
  const name = normalizeText(area?.name)
  if (!name) return ''
  return [name, normalizeText(area?.city), normalizeText(area?.province)].filter(Boolean).join(', ')
}

export async function searchArch9Areas(query: string, { limit = 8 } = {}) {
  const searchTerm = normalizeText(query)
  if (!searchTerm || !isSupabaseConfigured || !supabase) return []

  const rpcResult = await supabase.rpc('arch9_search_areas', {
    p_query: searchTerm,
    p_limit: limit,
  })

  if (!rpcResult.error) {
    return (Array.isArray(rpcResult.data) ? rpcResult.data : []).map(mapArea).filter((area) => area.id && area.name)
  }

  const filteredResult = await supabase
    .from('areas')
    .select('id, name, city, province, country, google_place_id, latitude, longitude, listing_count, canonical_area_id')
    .ilike('name', `%${searchTerm}%`)
    .is('canonical_area_id', null)
    .order('listing_count', { ascending: false })
    .order('name', { ascending: true })
    .limit(limit)

  if (!filteredResult.error) {
    return (Array.isArray(filteredResult.data) ? filteredResult.data : []).map(mapArea).filter((area) => area.id && area.name)
  }

  const legacyResult = await supabase
    .from('areas')
    .select('id, name, city, province, country, google_place_id, latitude, longitude, listing_count')
    .ilike('name', `%${searchTerm}%`)
    .order('listing_count', { ascending: false })
    .order('name', { ascending: true })
    .limit(limit)

  if (legacyResult.error) {
    console.warn('[areas] Area search unavailable.', legacyResult.error || filteredResult.error || rpcResult.error)
    return []
  }

  return (Array.isArray(legacyResult.data) ? legacyResult.data : []).map(mapArea).filter((area) => area.id && area.name)
}
