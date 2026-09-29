import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'

function clientFor(listingId) {
  if (!isSupabaseConfigured || !supabase) throw new Error('Sign in before managing Kingdom website publication.')
  if (!String(listingId || '').trim()) throw new Error('Save the listing before managing Kingdom website publication.')
  return supabase
}

export async function getKingdomWebsitePublicationStatus(listingId) {
  const client = clientFor(listingId)
  const { data, error } = await client.rpc('website_get_partner_listing_status', { p_listing_id: listingId })
  if (error) throw error
  return data && typeof data === 'object' ? data : { available: false }
}

export async function setKingdomWebsitePublication(listingId, action) {
  const client = clientFor(listingId)
  if (!['publish', 'update', 'unpublish'].includes(action)) throw new Error('Choose a valid Kingdom website action.')
  const { data, error } = await client.functions.invoke('website-partner-listing-publication', {
    body: { listingId, action },
  })
  if (error) {
    let message = error.message || 'Kingdom website publication failed.'
    if (error.context && typeof error.context.json === 'function') {
      try {
        const payload = await (typeof error.context.clone === 'function' ? error.context.clone() : error.context).json()
        message = String(payload?.error || message).trim() || message
      } catch {
        // The transport error still explains the failed request.
      }
    }
    throw new Error(message)
  }
  if (data?.error) throw new Error(data.error)
  return data?.publication && typeof data.publication === 'object' ? data.publication : { available: false }
}
