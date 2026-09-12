import { additionalMockProperties } from '@/lib/mock-properties'
import { getServerSupabase } from '@/lib/supabase-server'
import type { PublicPage, PublicProperty, ResolvedSite, WebsiteBlock, WebsiteTemplateKey } from '@/lib/types'

const demoSite: ResolvedSite = {
  id: '00000000-0000-0000-0000-000000000001',
  organisationId: '00000000-0000-0000-0000-000000000001',
  publishedRevisionId: '00000000-0000-0000-0000-000000000002',
  templateKey: 'home-seekers-v1',
  name: 'Arch9 Demo Realty',
  status: 'published',
  primaryColor: '#125b50',
  secondaryColor: '#e7bc71',
  accentColor: '#e7bc71',
  phone: '+27 12 000 0000',
  email: 'hello@example.arch9.co.za',
  preview: true,
  properties: [
    { id: 'demo-1', reference: 'PDP-001', title: 'Contemporary family home', transactionType: 'sale', propertyType: 'House', suburb: 'Waterkloof', province: 'Gauteng', price: 4850000, bedrooms: 4, bathrooms: 3, parkingBays: 2, floorSize: 315, description: 'A calm, contemporary family home with generous rooms and a garden designed for long summer afternoons.', features: ['Open-plan living', 'Study', 'Swimming pool', 'Secure garden'], amenities: ['Close to schools', 'Easy highway access'], media: [{ type: 'image', url: '/images/kingdom-showcase-house-v1.png', caption: 'Template preview property', order: 0 }] },
    { id: 'demo-2', reference: 'PDP-002', title: 'Light-filled garden apartment', transactionType: 'sale', propertyType: 'Apartment', suburb: 'Brooklyn', province: 'Gauteng', price: 1895000, bedrooms: 2, bathrooms: 2, parkingBays: 1, floorSize: 104, description: 'A beautifully finished apartment with leafy views, generous natural light and a practical lock-up-and-go layout.', features: ['Private balcony', 'Fibre ready', 'Secure parking'], amenities: ['Walkable neighbourhood', 'Near cafes'], media: [{ type: 'image', url: '/images/kingdom-showcase-apartment-v1.png', caption: 'Template preview property', order: 0 }] },
    { id: 'demo-3', reference: 'PDP-003', title: 'Secure townhouse with private garden', transactionType: 'rental', propertyType: 'Townhouse', suburb: 'Menlo Park', province: 'Gauteng', price: 18500, bedrooms: 3, bathrooms: 2, parkingBays: 2, floorSize: 156, description: 'A secure rental townhouse offering comfortable proportions, a private garden and easy access to daily essentials.', features: ['Pet friendly', 'Private garden', 'Double parking'], amenities: ['Security complex', 'Near public transport'], media: [{ type: 'image', url: '/images/kingdom-showcase-lynnwood-v1.png', caption: 'Template preview property', order: 0 }] },
    ...additionalMockProperties,
  ],
}

const demoPages: PublicPage[] = [
  {
    id: '00000000-0000-0000-0000-000000000012', slug: 'about', kind: 'about', title: 'About',
    seoTitle: 'About Arch9 Demo Realty',
    blocks: [
      { type: 'hero', eyebrow: 'ABOUT OUR AGENCY', heading: 'Good property advice starts with people.', body: 'A personal approach to buying, selling and renting. We help you make your next move with clarity and confidence.' },
      { type: 'rich_text', heading: 'Local understanding. A personal perspective.', body: 'Every home and every move is different. We take the time to understand what matters to you, combining local market knowledge with thoughtful presentation and practical guidance.' },
      { type: 'benefits', heading: 'A more considered property experience.', items: [
        { title: 'Local knowledge', body: 'Insight into the places and properties that make a neighbourhood feel like home.' },
        { title: 'Thoughtful presentation', body: 'An approach to marketing shaped around each property and its audience.' },
        { title: 'Personal guidance', body: 'A team to help you understand the options and navigate your next step.' },
      ] },
    ],
  },
  {
    id: '00000000-0000-0000-0000-000000000013', slug: 'contact', kind: 'contact', title: 'Contact',
    seoTitle: 'Contact Arch9 Demo Realty',
    blocks: [
      { type: 'hero', eyebrow: 'GET IN TOUCH', heading: 'Let’s talk property.', body: 'Buying, selling or finding your next rental? Tell us what you have in mind.' },
      { type: 'rich_text', heading: 'A conversation is a good place to start.', body: 'Reach out to the team or send a message. We’ll help you find the right person for your next move.' },
      { type: 'lead_form', heading: 'How can we help?', body: 'Share a few details and we’ll be in touch.', purpose: 'general_enquiry' },
    ],
  },
  {
    id: '00000000-0000-0000-0000-000000000010', slug: '', kind: 'home', title: 'Home',
    seoTitle: 'Arch9 Demo Realty | Property for sale and to rent', seoDescription: 'Explore property for sale and to rent with Arch9 Demo Realty.',
    blocks: [
      { type: 'hero', eyebrow: 'PROPERTY, SIMPLIFIED', heading: 'Find the place that feels like home.', body: 'Beautifully presented property, knowledgeable people and a simpler way to move.' },
      { type: 'property_collection', heading: 'Featured properties', maxItems: 3 },
      { type: 'rich_text', heading: 'Property advice that starts with people.', body: 'Talk to our local team about your next move.' },
      { type: 'cta', heading: 'What is your property worth?', body: 'Request a valuation from our local team.', ctaLabel: 'Request a valuation', ctaHref: '/valuation' },
      { type: 'lead_form', heading: 'Start your next move.', body: 'Tell us what you are looking for and our team will be in touch.', purpose: 'general_enquiry' },
    ],
  },
  {
    id: '00000000-0000-0000-0000-000000000011', slug: 'spring-viewing', kind: 'campaign', title: 'Spring viewing collection',
    seoTitle: 'Spring viewing collection | Arch9 Demo Realty', seoDescription: 'A curated collection of homes to view this spring.',
    blocks: [
      { type: 'hero', eyebrow: 'SPRING COLLECTION', heading: 'Find a home made for a fresh start.', body: 'Explore a considered selection of properties and arrange a private viewing with our local team.', ctaLabel: 'Browse homes', ctaHref: '/properties?type=sale' },
      { type: 'property_collection', heading: 'Homes to view this spring', maxItems: 3, transactionType: 'sale' },
      { type: 'benefits', heading: 'A more considered move', items: [{ title: 'Local guidance', body: 'Clear advice from people who know the area.' }, { title: 'Private viewings', body: 'Arrange a time that works around your day.' }, { title: 'One connected team', body: 'Your enquiry reaches the agency CRM directly.' }] },
      { type: 'lead_form', heading: 'Arrange a viewing', body: 'Tell us what you would like to see and we will be in touch.', purpose: 'campaign_enquiry' },
    ],
  },
]

// Showcase inventory is deliberately limited to preview domains. It makes an
// empty pilot feel like a real estate website while CRM-published listings
// remain the source of truth and automatically take precedence.
const homeSeekersShowcaseProperties: PublicProperty[] = [
  {
    id: 'kingdom-showcase-house', reference: 'KINGDOM-DEMO-001', title: 'Contemporary family residence', transactionType: 'sale', propertyType: 'House', suburb: 'Waterkloof Ridge', province: 'Gauteng', price: 8950000, bedrooms: 4, bathrooms: 4, parkingBays: 3,
    description: 'A considered family residence with generous entertaining spaces, a landscaped garden and a pool.', features: ['Swimming pool', 'Entertaining terrace', 'Study', 'Staff suite'], amenities: ['Close to leading schools', 'Secure access'], isShowcase: true,
    media: [{ type: 'image', url: '/images/kingdom-showcase-house-v1.png', caption: 'Kingdom showcase property', order: 0 }],
  },
  {
    id: 'kingdom-showcase-apartment', reference: 'KINGDOM-DEMO-002', title: 'Leafy terrace apartment', transactionType: 'sale', propertyType: 'Apartment', suburb: 'Brooklyn', province: 'Gauteng', price: 3250000, bedrooms: 2, bathrooms: 2, parkingBays: 2,
    description: 'An elegant apartment with a generous covered terrace and seamless indoor-outdoor living.', features: ['Covered terrace', 'Fibre ready', 'Two secure bays', '24-hour security'], amenities: ['Walkable to cafés', 'Easy access to the city'], isShowcase: true,
    media: [{ type: 'image', url: '/images/kingdom-showcase-apartment-v1.png', caption: 'Kingdom showcase property', order: 0 }],
  },
  {
    id: 'kingdom-showcase-lynnwood', reference: 'KINGDOM-DEMO-003', title: 'Architectural garden home', transactionType: 'sale', propertyType: 'House', suburb: 'Lynnwood', province: 'Gauteng', price: 4850000, bedrooms: 3, bathrooms: 2, parkingBays: 2,
    description: 'A warm contemporary home with textured stone, landscaped grounds and flexible family living.', features: ['Landscaped garden', 'Open-plan living', 'Double garage', 'Security'], amenities: ['Close to schools', 'Easy access to the city'], isShowcase: true,
    media: [{ type: 'image', url: '/images/kingdom-showcase-lynnwood-v1.png', caption: 'Kingdom showcase property', order: 0 }],
  },
  ...additionalMockProperties,
]

export function normalizeHostname(host: string | null | undefined): string {
  return String(host || '').trim().toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '')
}

export function propertySlug(property: Pick<PublicProperty, 'id' | 'title' | 'reference'>): string {
  return referenceSlug(property.reference) || textSlug(property.title) || 'property'
}

function textSlug(value: string | null | undefined): string {
  return String(value || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

function referenceSlug(value: string | null | undefined): string {
  return textSlug(value)
}

function legacyTitleSlug(property: Pick<PublicProperty, 'id' | 'title' | 'legacyReference'>): string {
  const title = textSlug(property.title) || 'property'
  const reference = referenceSlug(property.legacyReference)
  return reference ? `${title}-${reference}` : title
}

function isDemoMode(hostname: string): boolean {
  if (process.env.WEBSITES_DEMO_MODE !== 'true') return false
  const configuredHosts = String(process.env.WEBSITES_DEMO_HOSTS || 'localhost,127.0.0.1')
    .split(',')
    .map(normalizeHostname)
    .filter(Boolean)
  return configuredHosts.includes(hostname)
}

export function websiteRuntimeEnvironment(): 'staging' | 'production' | null {
  const configured = String(process.env.WEBSITES_RUNTIME_ENV || '').trim().toLowerCase()
  return configured === 'staging' || configured === 'production' ? configured : null
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
    id: String(row.id), slug: String(row.slug), kind: (['home', 'about', 'contact', 'valuation', 'campaign'].includes(pageKind) ? pageKind : 'campaign') as PublicPage['kind'],
    title: String(row.title || 'Agency page'), seoTitle: row.seo_title ? String(row.seo_title) : undefined,
    seoDescription: row.seo_description ? String(row.seo_description) : undefined,
    socialImageUrl: row.social_image_url ? String(row.social_image_url) : undefined,
    blocks: blocks(row.content_blocks),
  }
}

function mapProperty(row: Record<string, unknown>, media: PublicProperty['media'] = []): PublicProperty {
  const legacyReference = String(row.listing_reference || row.reference || '')
  const arch9Reference = String(row.arch9_reference || '')
  return {
    id: String(row.listing_id),
    reference: arch9Reference || legacyReference,
    legacyReference: legacyReference || undefined,
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
  const propertyType = (query.propertyType || '').trim().toLowerCase()
  const area = (query.area || '').trim().toLowerCase()
  const priceRange = String(query.priceRange || '')
  const [rangeStart, rangeEnd] = priceRange.split('-')
  const minPrice = rangeStart === 'under' ? 0 : Number(query.minPrice || rangeStart || 0)
  const maxPrice = rangeStart === 'under' ? Number(rangeEnd || 0) : rangeEnd === 'plus' ? 0 : Number(query.maxPrice || rangeEnd || 0)
  const bedrooms = Number(query.bedrooms || 0)
  const featuredOnly = query.availability === 'featured'
  return properties.filter((property) => {
    const matchingSearch = !search || [property.title, property.suburb, property.province, property.propertyType].join(' ').toLowerCase().includes(search)
    const matchingType = !type || property.transactionType === type
    const matchingPropertyType = !propertyType || property.propertyType.toLowerCase() === propertyType
    const matchingArea = !area || property.suburb.toLowerCase() === area
    const matchingMin = !minPrice || (property.price || 0) >= minPrice
    const matchingMax = !maxPrice || (property.price || 0) <= maxPrice
    const matchingBedrooms = !bedrooms || (property.bedrooms || 0) >= bedrooms
    const matchingFeatured = !featuredOnly || property.isShowcase === true
    return matchingSearch && matchingType && matchingPropertyType && matchingArea && matchingMin && matchingMax && matchingBedrooms && matchingFeatured
  })
}

function mapSnapshotMedia(value: unknown): PublicProperty['media'] {
  if (!Array.isArray(value)) return []
  const allowed = new Set<PublicProperty['media'][number]['type']>(['image', 'floor_plan', 'video', 'virtual_tour'])
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const row = item as Record<string, unknown>
    const type = String(row.media_type || '') as PublicProperty['media'][number]['type']
    const url = String(row.file_url || '')
    if (!allowed.has(type) || !/^https:\/\/[^\s]+$/i.test(url)) return []
    return [{ type, url, caption: row.caption ? String(row.caption) : undefined, order: Number(row.sort_order || 0) }]
  })
}

async function getPublishedWebsiteListings(
  supabase: ReturnType<typeof getServerSupabase>,
  site: Pick<ResolvedSite, 'id' | 'organisationId'>,
  limit = 100,
) {
  const channelResult = await supabase
    .from('website_listing_publications')
    .select('listing_id, publication_json, media_json')
    .eq('website_site_id', site.id)
    .eq('status', 'published')
    .order('last_synced_at', { ascending: false })
    .limit(limit)
  if (channelResult.error) throw channelResult.error
  const listingIds = (channelResult.data || []).map((row) => String(row.listing_id)).filter(Boolean)
  if (!listingIds.length) return []

  const eligibilityResult = await supabase
    .from('listing_publication_data')
    .select('listing_id, private_listings!inner(organisation_id, listing_reference, arch9_reference)')
    .in('listing_id', listingIds)
    .eq('status', 'Published')
    .eq('private_listings.organisation_id', site.organisationId)
  if (eligibilityResult.error) throw eligibilityResult.error
  const eligibleListings = new Map((eligibilityResult.data || []).map((row) => {
    const listing = Array.isArray(row.private_listings) ? row.private_listings[0] : row.private_listings
    const privateListing = listing as { listing_reference?: string; arch9_reference?: string } | null
    return [String(row.listing_id), {
      listingReference: String(privateListing?.listing_reference || ''),
      arch9Reference: String(privateListing?.arch9_reference || ''),
    }]
  }))

  return (channelResult.data || []).flatMap((channel) => {
    const listingId = String(channel.listing_id)
    if (!eligibleListings.has(listingId) || !channel.publication_json || typeof channel.publication_json !== 'object' || Array.isArray(channel.publication_json)) return []
    const references = eligibleListings.get(listingId)
    return [{
      row: { ...(channel.publication_json as Record<string, unknown>), listing_id: listingId, listing_reference: references?.listingReference, arch9_reference: references?.arch9Reference },
      media: mapSnapshotMedia(channel.media_json),
    }]
  })
}

export async function getPublicProperties(site: ResolvedSite, query: Record<string, string | undefined> = {}): Promise<PublicProperty[]> {
  if (site.preview && site.id === demoSite.id) return filterProperties(site.properties, query)
  const supabase = getServerSupabase()
  const listings = await getPublishedWebsiteListings(supabase, site)
  const publishedProperties = listings.map(({ row, media }) => mapProperty(row, media))
  const properties = publishedProperties.length || !site.preview || site.templateKey !== 'home-seekers-v1'
    ? publishedProperties
    : homeSeekersShowcaseProperties
  return filterProperties(properties, query)
}

export async function getPublicProperty(site: ResolvedSite, slug: string): Promise<PublicProperty | null> {
  const properties = await getPublicProperties(site)
  const requestedSlug = textSlug(slug)
  return properties.find((property) => (
    propertySlug(property) === requestedSlug
    || referenceSlug(property.legacyReference) === requestedSlug
    || legacyTitleSlug(property) === requestedSlug
    || `${textSlug(property.title)}-${property.id}` === requestedSlug
  )) || null
}

export async function getPublicPage(site: ResolvedSite, slug: string): Promise<PublicPage | null> {
  if (site.preview && site.id === demoSite.id) return demoPages.find((page) => page.slug === slug) || null
  const supabase = getServerSupabase()
  const { data, error } = await supabase.from('website_pages')
    .select('id, slug, page_kind, title, seo_title, seo_description, social_image_url, content_blocks')
    .eq('website_site_id', site.id).eq('revision_id', site.publishedRevisionId).eq('slug', slug).maybeSingle()
  if (error) throw error
  return data ? mapPage(data as Record<string, unknown>) : null
}

export async function getPublicPages(site: ResolvedSite): Promise<PublicPage[]> {
  if (site.preview && site.id === demoSite.id) return demoPages
  const supabase = getServerSupabase()
  const { data, error } = await supabase.from('website_pages')
    .select('id, slug, page_kind, title, seo_title, seo_description, social_image_url, content_blocks')
    .eq('website_site_id', site.id).eq('revision_id', site.publishedRevisionId).neq('page_kind', 'home').order('slug')
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
    .select('website_site_id, domain_kind, website_sites!inner(id, organisation_id, status, published_revision_id, template_key)')
    .eq('hostname', hostname)
    .eq('status', 'active')
    .maybeSingle()

  if (domainError) throw domainError
  if (!domain?.website_sites || Array.isArray(domain.website_sites)) return null

  const site = domain.website_sites as { id: string; organisation_id: string; status: ResolvedSite['status']; published_revision_id: string | null; template_key: WebsiteTemplateKey }
  if (site.status !== 'published' || !site.published_revision_id) return null

  const runtimeEnvironment = websiteRuntimeEnvironment()
  if (!runtimeEnvironment) return null
  const releaseGates = runtimeEnvironment === 'production'
    ? [
      supabase
        .from('website_production_releases')
        .select('status')
        .eq('organisation_id', site.organisation_id)
        .eq('target_hostname', hostname)
        .eq('status', 'active')
        .maybeSingle(),
      supabase
        .from('website_production_dark_launches')
        .select('status')
        .eq('organisation_id', site.organisation_id)
        .eq('website_site_id', site.id)
        .eq('preview_hostname', hostname)
        .eq('status', 'active')
        .maybeSingle(),
    ]
    : [
      supabase
        .from('website_pilot_enrolments')
        .select('status')
        .eq('organisation_id', site.organisation_id)
        .eq('status', 'active')
        .maybeSingle(),
    ]

  const [revisionResult, ...releaseGateResults] = await Promise.all([
    supabase
      .from('website_site_revisions')
      .select('brand_json')
      .eq('id', site.published_revision_id)
      .eq('website_site_id', site.id)
      .eq('status', 'published')
      .maybeSingle(),
    ...releaseGates,
  ])

  if (revisionResult.error) throw revisionResult.error
  const releaseGateError = releaseGateResults.find((result) => result.error)?.error
  if (releaseGateError) throw releaseGateError
  const gateOpen = runtimeEnvironment === 'production'
    ? (domain.domain_kind === 'custom' ? Boolean(releaseGateResults[0]?.data) : Boolean(releaseGateResults[1]?.data))
    : Boolean(releaseGateResults[0]?.data)
  if (!revisionResult.data || !gateOpen) return null

  const brand = (revisionResult.data?.brand_json || {}) as Record<string, unknown>
  const properties = await getPublishedWebsiteListings(supabase, { id: site.id, organisationId: site.organisation_id }, 12)
  const publishedProperties = properties.map(({ row, media }) => mapProperty(row, media))
  const previewProperties = publishedProperties.length || domain.domain_kind !== 'preview' || site.template_key !== 'home-seekers-v1'
    ? publishedProperties
    : homeSeekersShowcaseProperties
  return {
    id: site.id,
    organisationId: site.organisation_id,
    publishedRevisionId: site.published_revision_id,
    templateKey: site.template_key === 'home-seekers-v1' ? 'home-seekers-v1' : 'property-standard-v1',
    name: String(brand.name || 'Property'),
    status: site.status,
    primaryColor: String(brand.primaryColor || '#125b50'),
    secondaryColor: String(brand.secondaryColor || '#e7bc71'),
    accentColor: String(brand.accentColor || brand.secondaryColor || '#e7bc71'),
    logoUrl: brand.logoUrl ? String(brand.logoUrl) : undefined,
    logoLightUrl: brand.logoLightUrl ? String(brand.logoLightUrl) : undefined,
    logoDarkUrl: brand.logoDarkUrl ? String(brand.logoDarkUrl) : undefined,
    phone: brand.phone ? String(brand.phone) : undefined,
    email: brand.email ? String(brand.email) : undefined,
    website: brand.website ? String(brand.website) : undefined,
    whatsappNumber: brand.whatsappNumber ? String(brand.whatsappNumber) : undefined,
    tagline: brand.tagline ? String(brand.tagline) : undefined,
    contactImageUrl: brand.contactImageUrl ? String(brand.contactImageUrl) : undefined,
    privacyPolicyUrl: brand.privacyPolicyUrl ? String(brand.privacyPolicyUrl) : undefined,
    termsUrl: brand.termsUrl ? String(brand.termsUrl) : undefined,
    socialLinks: brand.socialLinks && typeof brand.socialLinks === 'object' && !Array.isArray(brand.socialLinks)
      ? Object.fromEntries(Object.entries(brand.socialLinks as Record<string, unknown>).filter(([key, value]) => ['instagram', 'facebook', 'linkedin'].includes(key) && typeof value === 'string' && value.startsWith('https://'))) as ResolvedSite['socialLinks']
      : undefined,
    preview: domain.domain_kind === 'preview',
    properties: previewProperties,
  }
}
