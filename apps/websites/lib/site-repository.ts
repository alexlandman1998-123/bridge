import { getServerSupabase } from '@/lib/supabase-server'
import type { PublicPage, PublicProperty, ResolvedSite, WebsiteBlock } from '@/lib/types'

const demoSite: ResolvedSite = {
  id: '00000000-0000-0000-0000-000000000001',
  organisationId: '00000000-0000-0000-0000-000000000001',
  name: 'PropData Demo Realty',
  status: 'published',
  primaryColor: '#125b50',
  secondaryColor: '#e7bc71',
  phone: '+27 12 000 0000',
  email: 'hello@example.propdata.co.za',
  preview: true,
  properties: [
    { id: 'demo-1', reference: 'PDP-001', title: 'Contemporary family home', transactionType: 'sale', propertyType: 'House', suburb: 'Waterkloof', province: 'Gauteng', price: 4850000, bedrooms: 4, bathrooms: 3, parkingBays: 2, floorSize: 315, description: 'A calm, contemporary family home with generous rooms and a garden designed for long summer afternoons.', features: ['Open-plan living', 'Study', 'Swimming pool', 'Secure garden'], amenities: ['Close to schools', 'Easy highway access'], media: [] },
    { id: 'demo-2', reference: 'PDP-002', title: 'Light-filled garden apartment', transactionType: 'sale', propertyType: 'Apartment', suburb: 'Brooklyn', province: 'Gauteng', price: 1895000, bedrooms: 2, bathrooms: 2, parkingBays: 1, floorSize: 104, description: 'A beautifully finished apartment with leafy views, generous natural light and a practical lock-up-and-go layout.', features: ['Private balcony', 'Fibre ready', 'Secure parking'], amenities: ['Walkable neighbourhood', 'Near cafes'], media: [] },
    { id: 'demo-3', reference: 'PDP-003', title: 'Secure townhouse with private garden', transactionType: 'rental', propertyType: 'Townhouse', suburb: 'Menlo Park', province: 'Gauteng', price: 18500, bedrooms: 3, bathrooms: 2, parkingBays: 2, floorSize: 156, description: 'A secure rental townhouse offering comfortable proportions, a private garden and easy access to daily essentials.', features: ['Pet friendly', 'Private garden', 'Double parking'], amenities: ['Security complex', 'Near public transport'], media: [] },
  ],
}

const demoPages: PublicPage[] = [
  {
    id: '00000000-0000-0000-0000-000000000011', slug: 'spring-viewing', kind: 'campaign', title: 'Spring viewing collection',
    seoTitle: 'Spring viewing collection | PropData Demo Realty', seoDescription: 'A curated collection of homes to view this spring.',
    blocks: [
      { type: 'hero', eyebrow: 'SPRING COLLECTION', heading: 'Find a home made for a fresh start.', body: 'Explore a considered selection of properties and arrange a private viewing with our local team.', ctaLabel: 'Browse homes', ctaHref: '/properties?type=sale' },
      { type: 'property_collection', heading: 'Homes to view this spring', maxItems: 3, transactionType: 'sale' },
      { type: 'benefits', heading: 'A more considered move', items: [{ title: 'Local guidance', body: 'Clear advice from people who know the area.' }, { title: 'Private viewings', body: 'Arrange a time that works around your day.' }, { title: 'One connected team', body: 'Your enquiry reaches the agency CRM directly.' }] },
      { type: 'lead_form', heading: 'Arrange a viewing', body: 'Tell us what you would like to see and we will be in touch.', purpose: 'campaign_enquiry' },
    ],
  },
]

export function normalizeHostname(host: string | null | undefined): string {
  return String(host || '').trim().toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '')
}

export function propertySlug(property: Pick<PublicProperty, 'id' | 'title'>): string {
  const title = property.title.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'property'
  return `${title}-${property.id}`
}

function isDemoMode(hostname: string): boolean {
  if (process.env.WEBSITES_DEMO_MODE !== 'true') return false
  const configuredHosts = String(process.env.WEBSITES_DEMO_HOSTS || 'localhost,127.0.0.1')
    .split(',')
    .map(normalizeHostname)
    .filter(Boolean)
  return configuredHosts.includes(hostname)
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : []
}

function blocks(value: unknown): WebsiteBlock[] {
  if (!Array.isArray(value)) return []
  const supported = new Set<WebsiteBlock['type']>(['hero', 'rich_text', 'benefits', 'faq', 'property_collection', 'lead_form', 'cta'])
  return value.filter((item): item is WebsiteBlock => Boolean(item) && typeof item === 'object' && supported.has((item as { type?: WebsiteBlock['type'] }).type || '' as WebsiteBlock['type']))
}

function mapPage(row: Record<string, unknown>): PublicPage {
  const pageKind = String(row.page_kind)
  return {
    id: String(row.id), slug: String(row.slug), kind: (['about', 'contact', 'valuation', 'campaign'].includes(pageKind) ? pageKind : 'campaign') as PublicPage['kind'],
    title: String(row.title || 'Agency page'), seoTitle: row.seo_title ? String(row.seo_title) : undefined,
    seoDescription: row.seo_description ? String(row.seo_description) : undefined, blocks: blocks(row.content_blocks),
  }
}

function mapProperty(row: Record<string, unknown>, media: PublicProperty['media'] = []): PublicProperty {
  return {
    id: String(row.listing_id),
    reference: String(row.listing_id),
    title: String(row.title || 'Property listing'),
    transactionType: String(row.listing_type).toLowerCase() === 'rental' ? 'rental' : 'sale',
    propertyType: String(row.property_type || 'Property'),
    suburb: String(row.suburb || ''),
    province: row.province ? String(row.province) : undefined,
    price: typeof row.asking_price === 'number' ? row.asking_price : Number(row.asking_price || 0) || undefined,
    bedrooms: typeof row.bedrooms === 'number' ? row.bedrooms : Number(row.bedrooms || 0) || undefined,
    bathrooms: typeof row.bathrooms === 'number' ? row.bathrooms : Number(row.bathrooms || 0) || undefined,
    parkingBays: typeof row.parking_bays === 'number' ? row.parking_bays : Number(row.parking_bays || 0) || undefined,
    floorSize: typeof row.floor_size === 'number' ? row.floor_size : Number(row.floor_size || 0) || undefined,
    description: row.description ? String(row.description) : undefined,
    features: strings(row.features),
    amenities: strings(row.amenities),
    media,
  }
}

function filterProperties(properties: PublicProperty[], query: Record<string, string | undefined> = {}): PublicProperty[] {
  const search = (query.q || '').trim().toLowerCase()
  const type = (query.type || '').toLowerCase()
  const minPrice = Number(query.minPrice || 0)
  const maxPrice = Number(query.maxPrice || 0)
  const bedrooms = Number(query.bedrooms || 0)
  return properties.filter((property) => {
    const matchingSearch = !search || [property.title, property.suburb, property.province, property.propertyType].join(' ').toLowerCase().includes(search)
    const matchingType = !type || property.transactionType === type
    const matchingMin = !minPrice || (property.price || 0) >= minPrice
    const matchingMax = !maxPrice || (property.price || 0) <= maxPrice
    const matchingBedrooms = !bedrooms || (property.bedrooms || 0) >= bedrooms
    return matchingSearch && matchingType && matchingMin && matchingMax && matchingBedrooms
  })
}

export async function getPublicProperties(site: ResolvedSite, query: Record<string, string | undefined> = {}): Promise<PublicProperty[]> {
  if (site.preview && site.id === demoSite.id) return filterProperties(site.properties, query)
  const supabase = getServerSupabase()
  const { data, error } = await supabase.from('listing_publication_data')
    .select('listing_id, title, suburb, province, property_type, listing_type, asking_price, bedrooms, bathrooms, parking_bays, floor_size, description, features, amenities, private_listings!inner(organisation_id)')
    .eq('status', 'Published').eq('private_listings.organisation_id', site.organisationId).order('updated_at', { ascending: false }).limit(100)
  if (error) throw error
  const ids = (data || []).map((row) => String(row.listing_id))
  const mediaResult = ids.length ? await supabase.from('listing_media').select('listing_id, media_type, file_url, caption, sort_order').in('listing_id', ids).order('sort_order') : { data: [], error: null }
  if (mediaResult.error) throw mediaResult.error
  const mediaByListing = new Map<string, PublicProperty['media']>()
  for (const item of mediaResult.data || []) {
    const allowed = ['image', 'floor_plan', 'video', 'virtual_tour'] as const
    if (!allowed.includes(item.media_type as typeof allowed[number])) continue
    const collection = mediaByListing.get(String(item.listing_id)) || []
    collection.push({ type: item.media_type as PublicProperty['media'][number]['type'], url: item.file_url, caption: item.caption || undefined, order: item.sort_order || 0 })
    mediaByListing.set(String(item.listing_id), collection)
  }
  return filterProperties((data || []).map((row) => mapProperty(row as Record<string, unknown>, mediaByListing.get(String(row.listing_id)) || [])), query)
}

export async function getPublicProperty(site: ResolvedSite, slug: string): Promise<PublicProperty | null> {
  const properties = await getPublicProperties(site)
  return properties.find((property) => propertySlug(property) === slug) || null
}

export async function getPublicPage(site: ResolvedSite, slug: string): Promise<PublicPage | null> {
  if (site.preview && site.id === demoSite.id) return demoPages.find((page) => page.slug === slug) || null
  const supabase = getServerSupabase()
  const { data, error } = await supabase.from('website_pages')
    .select('id, slug, page_kind, title, seo_title, seo_description, content_blocks, website_site_revisions!inner(status)')
    .eq('website_site_id', site.id).eq('slug', slug).eq('website_site_revisions.status', 'published').maybeSingle()
  if (error) throw error
  return data ? mapPage(data as Record<string, unknown>) : null
}

export async function getPublicPages(site: ResolvedSite): Promise<PublicPage[]> {
  if (site.preview && site.id === demoSite.id) return demoPages
  const supabase = getServerSupabase()
  const { data, error } = await supabase.from('website_pages')
    .select('id, slug, page_kind, title, seo_title, seo_description, content_blocks, website_site_revisions!inner(status)')
    .eq('website_site_id', site.id).eq('website_site_revisions.status', 'published').neq('page_kind', 'home').order('slug')
  if (error) throw error
  return (data || []).map((page) => mapPage(page as Record<string, unknown>))
}

export async function resolveSite(host: string | null | undefined): Promise<ResolvedSite | null> {
  const hostname = normalizeHostname(host)
  if (isDemoMode(hostname)) return demoSite
  if (!hostname) return null

  const supabase = getServerSupabase()
  const { data: domain, error: domainError } = await supabase
    .from('website_domains')
    .select('website_site_id, domain_kind, website_sites!inner(id, organisation_id, status)')
    .eq('hostname', hostname)
    .eq('status', 'active')
    .maybeSingle()

  if (domainError) throw domainError
  if (!domain?.website_sites || Array.isArray(domain.website_sites)) return null

  const site = domain.website_sites as { id: string; organisation_id: string; status: ResolvedSite['status'] }
  if (site.status !== 'published') return null

  const [revisionResult, propertiesResult] = await Promise.all([
    supabase
      .from('website_site_revisions')
      .select('brand_json')
      .eq('website_site_id', site.id)
      .eq('status', 'published')
      .maybeSingle(),
    supabase
      .from('listing_publication_data')
      .select('listing_id, title, suburb, province, property_type, listing_type, asking_price, bedrooms, bathrooms, parking_bays, floor_size, description, private_listings!inner(organisation_id)')
      .eq('status', 'Published')
      .eq('private_listings.organisation_id', site.organisation_id)
      .order('updated_at', { ascending: false })
      .limit(12),
  ])

  if (revisionResult.error) throw revisionResult.error
  if (propertiesResult.error) throw propertiesResult.error

  const brand = (revisionResult.data?.brand_json || {}) as Record<string, unknown>
  return {
    id: site.id,
    organisationId: site.organisation_id,
    name: String(brand.name || 'PropData Property'),
    status: site.status,
    primaryColor: String(brand.primaryColor || '#125b50'),
    secondaryColor: String(brand.secondaryColor || '#e7bc71'),
    phone: brand.phone ? String(brand.phone) : undefined,
    email: brand.email ? String(brand.email) : undefined,
    preview: domain.domain_kind === 'preview',
    properties: (propertiesResult.data || []).map((row) => mapProperty(row as Record<string, unknown>)),
  }
}
