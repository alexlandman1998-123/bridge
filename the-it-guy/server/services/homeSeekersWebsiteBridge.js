import { createClient } from '@supabase/supabase-js'

export const HOME_SEEKERS_ORGANISATION_ID = '2958d402-368e-43c9-b728-0098e10505f1'
export const HOME_SEEKERS_PUBLIC_PATH = '/demo/homeseekers'

export function homeSeekersPagePath(pathname) {
  const path = pathname === HOME_SEEKERS_PUBLIC_PATH || pathname.startsWith(`${HOME_SEEKERS_PUBLIC_PATH}/`)
    ? pathname.slice(HOME_SEEKERS_PUBLIC_PATH.length) || '/'
    : pathname
  return path.replace(/\/$/, '') || '/'
}

function adminClient() {
  const url = String(process.env.SUPABASE_URL || '').trim()
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  if (!url || !key) throw new Error('The website connection is unavailable.')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export function isHomeSeekersPageUrl(value) {
  try {
    const path = new URL(String(value)).pathname
    return path === HOME_SEEKERS_PUBLIC_PATH || path.startsWith(`${HOME_SEEKERS_PUBLIC_PATH}/`)
      || /^\/(?:$|(?:guarantee|about|contact|selling|buying|renting|join)\/?$|(?:buying|properties)\/[0-9a-f-]{36}\/?$)/i.test(path)
  } catch {
    return false
  }
}

export async function getHomeSeekersWebsiteConnection(client = adminClient()) {
  const { data: site, error: siteError } = await client.from('website_sites')
    .select('id, organisation_id, status, published_revision_id')
    .eq('organisation_id', HOME_SEEKERS_ORGANISATION_ID)
    .eq('status', 'published')
    .maybeSingle()
  if (siteError) throw siteError
  if (!site?.published_revision_id) throw new Error('The Home Seekers website is not published.')

  const { data: domains, error: domainError } = await client.from('website_domains')
    .select('hostname, status, domain_kind, is_primary')
    .eq('website_site_id', site.id)
    .eq('status', 'active')
  if (domainError) throw domainError
  const domain = (domains || []).find((item) => item.domain_kind === 'custom' && item.is_primary)
    || (domains || []).find((item) => item.hostname === 'home-seekers-website-alpha.vercel.app')
    || (domains || []).find((item) => item.domain_kind === 'custom')
    || (domains || []).find((item) => item.hostname?.endsWith('.vercel.app'))
  if (!domain) throw new Error('The Home Seekers website has no active delivery domain.')
  return { client, site, hostname: domain.hostname }
}

function publicListing(channel) {
  const row = channel.publication_json
  if (!row || typeof row !== 'object' || Array.isArray(row)) return null
  const media = Array.isArray(channel.media_json) ? channel.media_json : []
  const images = media.filter((item) => item?.media_type === 'image' && /^https:\/\//i.test(String(item.file_url || '')))
    .sort((left, right) => Number(left.sort_order || 0) - Number(right.sort_order || 0))
    .map((item) => String(item.file_url))
  const sourceType = String(row.listing_type || row.transaction_type || '').trim().toLowerCase()
  const transactionType = ['sale', 'for sale', 'for-sale'].includes(sourceType) ? 'sale'
    : ['rental', 'rent', 'to rent', 'to-rent', 'to let', 'to-let', 'let'].includes(sourceType) ? 'rental' : null
  if (!transactionType) return null
  return {
    id: String(channel.listing_id),
    title: String(row.title || 'Property listing'),
    address: [row.address, row.suburb, row.city].filter(Boolean).map(String).join(', '),
    suburb: String(row.suburb || ''),
    type: String(row.property_type || 'Property'),
    transactionType,
    price: Number(row.asking_price || 0),
    bedrooms: Number(row.bedrooms || 0),
    bathrooms: Number(row.bathrooms || 0),
    parkingBays: Number(row.parking_bays || 0),
    description: String(row.description || ''),
    image: images[0] || '',
    images,
  }
}

export async function getHomeSeekersPublishedListings(connection) {
  const { client, site } = connection
  const { data: channels, error: channelsError } = await client.from('website_listing_publications')
    .select('listing_id, publication_json, media_json')
    .eq('website_site_id', site.id)
    .eq('status', 'published')
    .order('last_synced_at', { ascending: false })
    .limit(100)
  if (channelsError) throw channelsError
  const ids = (channels || []).map((item) => item.listing_id).filter(Boolean)
  if (!ids.length) return []

  const { data: eligible, error: eligibilityError } = await client.from('listing_publication_data')
    .select('listing_id, private_listings!inner(organisation_id)')
    .in('listing_id', ids)
    .eq('status', 'Published')
    .eq('private_listings.organisation_id', HOME_SEEKERS_ORGANISATION_ID)
  if (eligibilityError) throw eligibilityError
  const eligibleIds = new Set((eligible || []).map((item) => String(item.listing_id)))
  return (channels || []).filter((item) => eligibleIds.has(String(item.listing_id))).map(publicListing).filter(Boolean)
}
