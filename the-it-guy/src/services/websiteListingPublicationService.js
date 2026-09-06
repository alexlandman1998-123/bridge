import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'

function requirePublicationClient(listingId) {
  if (!isSupabaseConfigured || !supabase) throw new Error('Supabase is not configured for website publication.')
  if (!String(listingId || '').trim()) throw new Error('A saved listing is required for website publication.')
  return supabase
}

export async function getWebsiteListingPublicationStatus(listingId) {
  const client = requirePublicationClient(listingId)
  const { data, error } = await client.rpc('website_get_listing_publication_status', {
    p_listing_id: listingId,
  })
  if (error) throw error
  return data && typeof data === 'object' ? data : {}
}

export async function setWebsiteListingPublication(listingId, action) {
  const client = requirePublicationClient(listingId)
  const safeAction = String(action || '').trim().toLowerCase()
  if (!['publish', 'update', 'unpublish'].includes(safeAction)) throw new Error('Choose a valid website publication action.')
  const { data, error } = await client.functions.invoke('website-listing-publication', {
    body: { listingId, action: safeAction },
  })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data?.publication && typeof data.publication === 'object'
    ? { ...data.publication, mediaCleanupPending: Number(data?.media?.pending || 0) }
    : {}
}
