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

// Only stock-card enrichment uses batches. Mutation routing always performs a
// fresh single-listing read through getWebsiteListingPublicationStatus below.
export async function getWebsiteListingPublicationStatuses(listingIds, { includePartner = true } = {}) {
  const ids = [...new Set((Array.isArray(listingIds) ? listingIds : []).map((id) => String(id || '').trim()).filter(Boolean))]
  if (!ids.length) return {}
  if (ids.length > 100 || ids.some((id) => !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id))) {
    throw new Error('Request at most 100 saved listing IDs for website status.')
  }
  const client = requirePublicationClient(ids[0])
  const statuses = Object.fromEntries(ids.map((id) => [id, null]))
  const { data, error } = await client.rpc('website_get_listing_publication_statuses', {
    p_listing_ids: ids, p_include_partner: includePartner,
  })
  if (error) {
    // Rolling releases can briefly reach a database without the additive RPC.
    // Preserve the old guarded path only for a missing function, not a denial
    // or network failure (which would multiply already failing requests).
    if (!['PGRST202', '42883'].includes(error.code)) throw error
    let cursor = 0
    async function worker() {
      while (cursor < ids.length) {
        const id = ids[cursor++]
        try { statuses[id] = await getWebsiteListingPublicationStatus(id, { includePartner }) }
        catch { statuses[id] = null }
      }
    }
    await Promise.all(Array.from({ length: Math.min(4, ids.length) }, worker))
    return statuses
  }
  for (const row of Array.isArray(data) ? data : []) {
    if (!Object.hasOwn(statuses, row?.listing_id) || !row.publication || typeof row.publication !== 'object' || Array.isArray(row.publication)) continue
    if (row.partner === true && (!includePartner || row.publication.available !== true || !row.publication.websiteSiteId)) continue
    statuses[row.listing_id] = describePublication(row.publication, row.partner === true)
  }
  return statuses
}

export async function setWebsiteListingPublication(listingId, action, { includePartner = true } = {}) {
  const client = requirePublicationClient(listingId)
  const safeAction = String(action || '').trim().toLowerCase()
  if (!['publish', 'update', 'unpublish'].includes(safeAction)) throw new Error('Choose a valid website publication action.')
  const destination = await getWebsiteListingPublicationStatus(listingId, { includePartner })
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
