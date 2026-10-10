import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'
import { getKingdomWebsitePublicationStatus, setKingdomWebsitePublication } from './kingdomWebsitePublicationService'

const KINGDOM_SITE_ID = '0160e45a-2268-4875-91d7-275c43f574d0'
const describePublication = (publication, partner = false) => ({
  ...publication,
  websiteChannel: partner ? 'kingdom_website' : 'agency_website',
  websiteLabel: publication?.websiteSiteId === KINGDOM_SITE_ID ? 'Kingdom Real Estate Website' : partner ? 'Partner Website' : 'Agency Website',
})

function requirePublicationClient(listingId) {
  if (!isSupabaseConfigured || !supabase) throw new Error('Supabase is not configured for website publication.')
  if (!String(listingId || '').trim()) throw new Error('A saved listing is required for website publication.')
  return supabase
}

export async function getWebsiteListingPublicationStatus(listingId, { includePartner = true } = {}) {
  const client = requirePublicationClient(listingId)
  const { data, error } = await client.rpc('website_get_listing_publication_status', {
    p_listing_id: listingId,
  })
  if (error) throw error
  const publication = data && typeof data === 'object' ? data : {}
  // A shared destination is authorised by the existing membership-guarded RPC.
  // Never infer publishing access from an organisation name or a listing field.
  if (includePartner && !publication.websiteSiteId) {
    const partner = await getKingdomWebsitePublicationStatus(listingId)
    if (partner.available === true && partner.websiteSiteId) return describePublication(partner, true)
  }
  return describePublication(publication)
}

export async function setWebsiteListingPublication(listingId, action) {
  const client = requirePublicationClient(listingId)
  const safeAction = String(action || '').trim().toLowerCase()
  if (!['publish', 'update', 'unpublish'].includes(safeAction)) throw new Error('Choose a valid website publication action.')
  const destination = await getWebsiteListingPublicationStatus(listingId)
  if (destination.websiteChannel === 'kingdom_website') {
    return describePublication(await setKingdomWebsitePublication(listingId, safeAction), true)
  }
  const { data, error } = await client.functions.invoke('website-listing-publication', {
    body: { listingId, action: safeAction },
  })
  if (error) {
    let message = error?.message || 'The agency website publication request failed.'
    const response = error?.context
    if (response && typeof response.json === 'function') {
      try {
        const payload = await (typeof response.clone === 'function' ? response.clone() : response).json()
        message = String(payload?.error || payload?.message || message).trim() || message
      } catch {
        // Preserve the transport error when the Edge Function did not return JSON.
      }
    }
    throw new Error(message)
  }
  if (data?.error) throw new Error(data.error)
  return data?.publication && typeof data.publication === 'object'
    ? describePublication({ ...data.publication, mediaCleanupPending: Number(data?.media?.pending || 0) })
    : {}
}
