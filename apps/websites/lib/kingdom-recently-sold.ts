import 'server-only'
import { getServerSupabase } from './supabase-server'
import type { PublicProperty, ResolvedSite } from './types'

export const KINGDOM_SOLD_SITE_ID = '0160e45a-2268-4875-91d7-275c43f574d0'
export const KINGDOM_SOLD_ORGANISATION_ID = '13c6b79f-1d8b-4886-aabf-42ea49565ef5'
const I_SELL_ORGANISATION_ID = '6cb5b65b-51cb-4fba-aef4-75b6201f9c21'

export type SoldProperty = PublicProperty & { sourceAgency: string; lastUpdated: string }

export function isKingdomSoldSite(site: Pick<ResolvedSite, 'id' | 'organisationId'>) {
  return site.id === KINGDOM_SOLD_SITE_ID && site.organisationId === KINGDOM_SOLD_ORGANISATION_ID
}

/** Read public property facts only. CRM status is authoritative, not an old advert. */
export async function getKingdomRecentlySold(site: ResolvedSite, client = getServerSupabase): Promise<SoldProperty[]> {
  if (!isKingdomSoldSite(site)) return []
  const supabase = client()
  const grants = await supabase.from('website_partner_listing_grants')
    .select('id, source_organisation_id').eq('website_site_id', site.id)
    .eq('source_organisation_id', I_SELL_ORGANISATION_ID).eq('enabled', true)
  if (grants.error && !['42P01', 'PGRST205'].includes(grants.error.code)) throw grants.error
  const grantIds = (grants.data || []).map(grant => String(grant.id))
  const sources = grantIds.length ? [site.organisationId, I_SELL_ORGANISATION_ID] : [site.organisationId]
  const sold: SoldProperty[] = []
  const batchSize = 200
  for (let offset = 0; ; offset += batchSize) {
    const listings = await supabase.from('private_listings')
      .select('id, organisation_id, arch9_reference, title, suburb, province, property_type, asking_price, bedrooms, bathrooms, floor_size_sqm, updated_at')
      .in('organisation_id', sources).eq('listing_status', 'sold').eq('listing_category', 'private_sale')
      .or('is_demo_data.is.null,is_demo_data.eq.false')
      .order('updated_at', { ascending: false }).order('id').range(offset, offset + batchSize - 1)
    if (listings.error) throw listings.error
    if (!listings.data?.length) break
    const ids = listings.data.map(row => String(row.id))
    const [projections, ownMedia, partnerMedia] = await Promise.all([
      supabase.from('listing_publication_data').select('listing_id, parking_bays, asking_price').in('listing_id', ids),
      supabase.from('website_listing_publications').select('listing_id, media_json').eq('website_site_id', site.id).in('listing_id', ids),
      grantIds.length ? supabase.from('website_partner_listing_publications').select('listing_id, media_json')
        .eq('website_site_id', site.id).in('grant_id', grantIds).in('listing_id', ids) : Promise.resolve({ data: [], error: null }),
    ])
    for (const result of [projections, ownMedia, partnerMedia]) if (result.error) throw result.error
    const facts = new Map((projections.data || []).map(row => [String(row.listing_id), row]))
    const ownImages = new Map((ownMedia.data || []).map(row => [String(row.listing_id), row.media_json]))
    const partnerImages = new Map((partnerMedia.data || []).map(row => [String(row.listing_id), row.media_json]))
    for (const row of listings.data) {
      const id = String(row.id)
      const own = String(row.organisation_id) === site.organisationId
      const projection = facts.get(id)
      const snapshotMedia: unknown = (own ? ownImages : partnerImages).get(id)
      const media: PublicProperty['media'] = Array.isArray(snapshotMedia) ? snapshotMedia.flatMap(item => {
        if (!item || item.media_type !== 'image') return []
        try {
          const url = new URL(String(item.file_url))
          // Reuse only copied public website photos; never sign private CRM files.
          const prefix = `/storage/v1/object/public/listing-media/organisations/${row.organisation_id}/websites/${site.id}/listings/${id}/`
          if (url.protocol !== 'https:' || url.search || !url.pathname.startsWith(prefix)) return []
          return [{ type: 'image' as const, url: url.href, order: Number(item.sort_order || 0) }]
        } catch { return [] }
      }).sort((a, b) => a.order - b.order) : []
      sold.push({
        id, reference: String(row.arch9_reference || id), title: String(row.title || 'Sold property'),
        transactionType: 'sale', listingStatus: 'sold', propertyType: String(row.property_type || 'Property'),
        suburb: String(row.suburb || ''), province: row.province || undefined,
        price: Number(projection ? projection.asking_price : row.asking_price) || undefined,
        bedrooms: Number(row.bedrooms) || undefined, bathrooms: Number(row.bathrooms) || undefined,
        parkingBays: Number(projection?.parking_bays) || undefined, floorSize: Number(row.floor_size_sqm) || undefined,
        partnerListing: !own, sourceAgency: own ? 'Kingdom Real Estate' : 'I Sell Properties',
        lastUpdated: String(row.updated_at), features: [], amenities: [], media,
      })
    }
    if (listings.data.length < batchSize) break
  }
  return sold
}
