import { additionalMockProperties } from '@/lib/mock-properties'
import { applyBlogMediaAssets, visiblePublishedBlogPosts } from '@/lib/blog-publication'
import { resolveListingTransactionType } from '@/lib/listing-transaction-type'
import { legacyPropertySlug, matchesPropertySlug, propertySlug } from '@/lib/property-urls'
import { getServerSupabase } from '@/lib/supabase-server'
import type { PublicBlogPost, PublicPage, PublicProperty, ResolvedSite, WebsiteBlock, WebsiteTemplateKey } from '@/lib/types'

const demoSite: ResolvedSite = {
  id: '00000000-0000-0000-0000-000000000001',
  organisationId: '00000000-0000-0000-0000-000000000001',
  publishedRevisionId: '00000000-0000-0000-0000-000000000002',
  templateKey: 'home-seekers-v1',
  experienceKey: 'standard',
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

export function normalizeHostname(host: string | null | undefined): string {
  return String(host || '').trim().toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '')
}

export { legacyPropertySlug, propertySlug }

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

function mapProperty(row: Record<string, unknown>, media: PublicProperty['media'] = []): PublicProperty | null {
  const transactionType = resolveListingTransactionType(row.listing_type)
  if (!transactionType) return null
  const consultantName = String(row.consultant_name || '').trim()
  return {
    id: String(row.listing_id),
    reference: String(row.arch9_reference || row.listing_id),
    title: String(row.title || 'Property listing'),
    transactionType,
    propertyType: String(row.property_type || 'Property'),
    suburb: String(row.suburb || ''),
    province: row.province ? String(row.province) : undefined,
    price: typeof row.asking_price === 'number' ? row.asking_price : Number(row.asking_price || 0) || undefined,
    bedrooms: typeof row.bedrooms === 'number' ? row.bedrooms : Number(row.bedrooms || 0) || undefined,
    bathrooms: typeof row.bathrooms === 'number' ? row.bathrooms : Number(row.bathrooms || 0) || undefined,
    parkingBays: typeof row.parking_bays === 'number' ? row.parking_bays : Number(row.parking_bays || 0) || undefined,
    floorSize: typeof row.floor_size === 'number' ? row.floor_size : Number(row.floor_size || 0) || undefined,
    description: row.description ? String(row.description) : undefined,
    consultant: consultantName ? { name: consultantName, email: row.consultant_email ? String(row.consultant_email) : undefined, phone: row.consultant_phone ? String(row.consultant_phone) : undefined, avatarUrl: row.consultant_avatar_url ? String(row.consultant_avatar_url) : undefined } : undefined,
    features: strings(row.features),
    amenities: strings(row.amenities),
    media,
  }
}

function mapPublishedProperties(listings: Array<{ row: Record<string, unknown>; media: PublicProperty['media'] }>): PublicProperty[] {
  return listings.flatMap(({ row, media }) => {
    const property = mapProperty(row, media)
    if (property) return [property]
    console.warn('[website-listing] Excluded listing with an unrecognised transaction type.', { listingId: row.listing_id, listingType: row.listing_type })
    return []
  })
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
    // LWP's public feed often stores a 304px thumbnail URL. Strip only the
    // thumbnail transform so Next Image can optimise the original asset for
    // the card's actual display size instead of enlarging a soft preview.
    const url = String(row.file_url || '').replace(/_t_c(?:_[a-z]+_\d+)+(?=\.[a-z0-9]+$)/i, '')
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
    .select('listing_id, private_listings!inner(organisation_id, arch9_reference, assigned_agent_id)')
    .in('listing_id', listingIds)
    .eq('status', 'Published')
    .eq('private_listings.organisation_id', site.organisationId)
  if (eligibilityResult.error) throw eligibilityResult.error
  const eligibleListings = new Map((eligibilityResult.data || []).flatMap((row) => {
    const listing = Array.isArray(row.private_listings) ? row.private_listings[0] : row.private_listings
    if (!listing || typeof listing !== 'object') return []
    const privateListing = listing as Record<string, unknown>
    const reference = String(privateListing.arch9_reference || '')
    const assignedAgentId = String(privateListing.assigned_agent_id || '')
    return reference ? [[String(row.listing_id), { reference, assignedAgentId }] as const] : []
  }))

  const assignedAgentIds = [...new Set([...eligibleListings.values()].map((listing) => listing.assignedAgentId).filter(Boolean))]
  const consultants = new Map<string, { name: string; email?: string; phone?: string; avatarUrl?: string }>()
  if (assignedAgentIds.length) {
    const { data: members, error: membersError } = await supabase.from('organisation_users').select('user_id, first_name, last_name, email').eq('organisation_id', site.organisationId).in('user_id', assignedAgentIds)
    if (membersError) throw membersError
    const { data: profiles, error: profilesError } = await supabase.from('profiles').select('id, full_name, first_name, last_name, phone_number, avatar_url').in('id', assignedAgentIds)
    if (profilesError) throw profilesError
    const profilesById = new Map((profiles || []).map((profile) => [String(profile.id), profile]))
    for (const member of members || []) {
      const profile = profilesById.get(String(member.user_id))
      const name = [profile?.first_name || member.first_name, profile?.last_name || member.last_name].filter(Boolean).join(' ') || String(profile?.full_name || '').trim()
      if (name) consultants.set(String(member.user_id), { name, email: String(member.email || '').trim() || undefined, phone: String(profile?.phone_number || '').trim() || undefined, avatarUrl: String(profile?.avatar_url || '').trim() || undefined })
    }
  }

  return (channelResult.data || []).flatMap((channel) => {
    const listingId = String(channel.listing_id)
    const listing = eligibleListings.get(listingId)
    if (!listing || !channel.publication_json || typeof channel.publication_json !== 'object' || Array.isArray(channel.publication_json)) return []
    const snapshot = channel.publication_json as Record<string, unknown>
    const consultant = consultants.get(listing.assignedAgentId)
    // Some imported agency listings belong to public-directory agents who do not
    // have a platform login/profile. Preserve the verified public consultant
    // snapshot in that case instead of dropping the agent from the website.
    const snapshotConsultant = {
      name: String(snapshot.consultant_name || '').trim() || undefined,
      email: String(snapshot.consultant_email || '').trim() || undefined,
      phone: String(snapshot.consultant_phone || '').trim() || undefined,
      avatarUrl: String(snapshot.consultant_avatar_url || '').trim() || undefined,
    }
    return [{
      row: {
        ...snapshot,
        listing_id: listingId,
        arch9_reference: listing.reference,
        consultant_name: consultant?.name || snapshotConsultant.name,
        consultant_email: consultant?.email || snapshotConsultant.email,
        consultant_phone: consultant?.phone || snapshotConsultant.phone,
        consultant_avatar_url: consultant?.avatarUrl || snapshotConsultant.avatarUrl,
      },
      media: mapSnapshotMedia(channel.media_json),
    }]
  })
}

export async function getPublicProperties(site: ResolvedSite, query: Record<string, string | undefined> = {}): Promise<PublicProperty[]> {
  if (site.preview && site.id === demoSite.id) return filterProperties(site.properties, query)
  const supabase = getServerSupabase()
  const listings = await getPublishedWebsiteListings(supabase, site)
  const publishedProperties = mapPublishedProperties(listings)
  return filterProperties(publishedProperties, query)
}

export async function getPublicTeamMembers(site: ResolvedSite) {
  const supabase = getServerSupabase()
  const [{ data: members, error: membersError }, directoryResult] = await Promise.all([
    supabase
      .from('organisation_users')
      .select('user_id, first_name, last_name, job_title, workspace_role, status')
      .eq('organisation_id', site.organisationId)
      .eq('status', 'active')
      .limit(100),
    supabase
      .from('agency_public_agents')
      .select('id, first_name, last_name, full_name, job_title, avatar_url, sort_order')
      .eq('organisation_id', site.organisationId)
      .eq('is_public', true)
      .eq('status', 'active')
      .order('sort_order', { ascending: true })
      .order('full_name', { ascending: true }),
  ])
  if (membersError) throw membersError

  // Sites deployed before the directory migration remain usable while their
  // database is upgraded. The directory becomes the primary source once it
  // exists, and intentionally does not imply a CRM login or membership.
  const directoryUnavailable = directoryResult.error?.code === '42P01' || directoryResult.error?.code === 'PGRST205'
  if (directoryResult.error && !directoryUnavailable) throw directoryResult.error
  const directory = directoryResult.data || []

  const ids = (members || []).map((member) => String(member.user_id)).filter(Boolean)
  const profilesResult = ids.length
    ? await supabase.from('profiles').select('id, full_name, first_name, last_name, avatar_url').in('id', ids)
    : { data: [], error: null }
  if (profilesResult.error) throw profilesResult.error

  const profilesById = new Map((profilesResult.data || []).map((profile) => [String(profile.id), profile]))
  const accountMembers = (members || []).flatMap((member) => {
    const profile = profilesById.get(String(member.user_id))
    const name = [profile?.first_name || member.first_name, profile?.last_name || member.last_name].filter(Boolean).join(' ') || String(profile?.full_name || '').trim()
    if (!name) return []
    return [{ id: String(member.user_id), name, role: String(member.job_title || member.workspace_role || 'Property consultant'), avatarUrl: String(profile?.avatar_url || '').trim() || undefined }]
  })
  const directoryMembers = directory.map((agent) => ({
    id: String(agent.id),
    name: String(agent.full_name || [agent.first_name, agent.last_name].filter(Boolean).join(' ')).trim(),
    role: String(agent.job_title || 'Property practitioner'),
    avatarUrl: String(agent.avatar_url || '').trim() || undefined,
  })).filter((agent) => agent.name)
  const directoryNames = new Set(directoryMembers.map((agent) => agent.name.toLowerCase()))
  return [...directoryMembers, ...accountMembers.filter((agent) => !directoryNames.has(agent.name.toLowerCase()))]
}

export async function getPublicProperty(site: ResolvedSite, slug: string): Promise<PublicProperty | null> {
  const properties = await getPublicProperties(site)
  return properties.find((property) => matchesPropertySlug(property, slug)) || null
}

export async function getPublicBlogPosts(site: ResolvedSite): Promise<PublicBlogPost[]> {
  if (site.preview && site.id === demoSite.id) return []
  const supabase = getServerSupabase()
  const { data, error } = await supabase.from('website_blog_posts')
    // Keep the public site readable until optional authoring migrations have
    // reached the remote database. The base blog schema is enough to render
    // published articles; structured blocks are added when available.
    .select('id, organisation_id, website_site_id, revision_id, title, slug, summary, cover_image_url, cover_image_alt, body, content_blocks, author_name, status, lifecycle_status, scheduled_for, published_at, seo_title, seo_description')
    .eq('website_site_id', site.id)
    .eq('organisation_id', site.organisationId)
    .eq('revision_id', site.publishedRevisionId)
    .eq('status', 'published')
    .lte('published_at', new Date().toISOString())
    .order('published_at', { ascending: false })
  if (error) throw error
  const posts = visiblePublishedBlogPosts((data || []) as Record<string, unknown>[], site.id, site.organisationId, site.publishedRevisionId)
  const assetIds = [...new Set(posts.flatMap((post) => post.contentBlocks.map((block) => block.assetId).filter(Boolean) as string[]))]
  if (!assetIds.length) return posts
  const { data: assets, error: assetsError } = await supabase.from('website_media_assets')
    .select('id, public_url, alt_text')
    .eq('website_site_id', site.id)
    .eq('organisation_id', site.organisationId)
    .in('id', assetIds)
  if (assetsError) throw assetsError
  return applyBlogMediaAssets(posts, assets || [])
}

export async function getPublicBlogPost(site: ResolvedSite, slug: string): Promise<PublicBlogPost | null> {
  const posts = await getPublicBlogPosts(site)
  return posts.find((post) => post.slug === slug) || null
}

export async function getPublicBlogRedirect(site: ResolvedSite, slug: string): Promise<string | null> {
  if (site.preview && site.id === demoSite.id) return null
  const supabase = getServerSupabase()
  const { data, error } = await supabase.from('website_blog_slug_redirects')
    .select('to_slug')
    .eq('website_site_id', site.id)
    .eq('organisation_id', site.organisationId)
    .eq('revision_id', site.publishedRevisionId)
    .eq('from_slug', slug)
    .maybeSingle()
  // Redirect history is an optional release feature. A missing table must not
  // turn an otherwise valid public 404 into a server error before migration.
  if (error) {
    if (error.code === '42P01' || error.code === 'PGRST205') return null
    throw error
  }
  const target = String(data?.to_slug || '')
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(target) ? target : null
}

export async function hasPublishedBlogPosts(site: ResolvedSite): Promise<boolean> {
  if (site.preview && site.id === demoSite.id) return false
  const supabase = getServerSupabase()
  const { data, error } = await supabase.from('website_blog_posts')
    .select('id')
    .eq('website_site_id', site.id)
    .eq('organisation_id', site.organisationId)
    .eq('revision_id', site.publishedRevisionId)
    .eq('status', 'published')
    .lte('published_at', new Date().toISOString())
    .limit(1)
  if (error) throw error
  return (data || []).length > 0
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
  // This is intentionally development-only. It lets the website team review a
  // site's current draft with its real branding before a preview hostname has
  // been activated. It is ignored in all deployed environments.
  const localPreviewSiteId = process.env.NODE_ENV === 'development'
    ? String(process.env.WEBSITES_LOCAL_SITE_ID || '').trim()
    : ''
  if (localPreviewSiteId) return resolveLocalSitePreview(localPreviewSiteId)
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
      // Production is now tenant-enrolled rather than limited to a single
      // manually approved release. Keep this scoped to the resolved
      // organisation: an active enrolment never grants another tenant access.
      supabase
        .from('website_pilot_enrolments')
        .select('status')
        .eq('organisation_id', site.organisation_id)
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

  const [revisionResult, organisationBrandingResult, ...releaseGateResults] = await Promise.all([
    supabase
      .from('website_site_revisions')
      .select('brand_json')
      .eq('id', site.published_revision_id)
      .eq('website_site_id', site.id)
      .eq('status', 'published')
      .maybeSingle(),
    supabase
      .from('organisation_branding')
      .select('logo_icon_url')
      .eq('organisation_id', site.organisation_id)
      .maybeSingle(),
    ...releaseGates,
  ])

  if (revisionResult.error) throw revisionResult.error
  if (organisationBrandingResult.error) throw organisationBrandingResult.error
  const releaseGateError = releaseGateResults.find((result) => result.error)?.error
  if (releaseGateError) throw releaseGateError
  const gateOpen = runtimeEnvironment === 'production'
    ? Boolean(releaseGateResults[2]?.data) || (domain.domain_kind === 'custom' ? Boolean(releaseGateResults[0]?.data) : Boolean(releaseGateResults[1]?.data))
    : Boolean(releaseGateResults[0]?.data)
  if (!revisionResult.data || !gateOpen) return null

  const brand = (revisionResult.data?.brand_json || {}) as Record<string, unknown>
  const organisationIconUrl = organisationBrandingResult.data?.logo_icon_url
  const properties = await getPublishedWebsiteListings(supabase, { id: site.id, organisationId: site.organisation_id }, 12)
  const publishedProperties = mapPublishedProperties(properties)
  return {
    id: site.id,
    organisationId: site.organisation_id,
    publishedRevisionId: site.published_revision_id,
    templateKey: site.template_key === 'home-seekers-v1' ? 'home-seekers-v1' : 'property-standard-v1',
    experienceKey: brand.experienceKey === 'editorial-property-v1' ? 'editorial-property-v1' : 'standard',
    name: String(brand.name || 'Property'),
    status: site.status,
    primaryColor: String(brand.primaryColor || '#125b50'),
    secondaryColor: String(brand.secondaryColor || '#e7bc71'),
    accentColor: String(brand.accentColor || brand.secondaryColor || '#e7bc71'),
    logoUrl: brand.logoUrl ? String(brand.logoUrl) : undefined,
    logoLightUrl: brand.logoLightUrl ? String(brand.logoLightUrl) : undefined,
    logoDarkUrl: brand.logoDarkUrl ? String(brand.logoDarkUrl) : undefined,
    // The icon logo is shared organisation branding, so all sites belonging to
    // the same business receive its current browser/app icon immediately.
    logoIconUrl: brand.logoIconUrl ? String(brand.logoIconUrl) : organisationIconUrl ? String(organisationIconUrl) : undefined,
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
    properties: publishedProperties,
  }
}

async function resolveLocalSitePreview(siteId: string): Promise<ResolvedSite | null> {
  const supabase = getServerSupabase()
  const { data: site, error: siteError } = await supabase
    .from('website_sites')
    .select('id, organisation_id, status, template_key')
    .eq('id', siteId)
    .maybeSingle()

  if (siteError) throw siteError
  if (!site) return null

  const [revisionResult, organisationBrandingResult] = await Promise.all([
    supabase
      .from('website_site_revisions')
      .select('id, brand_json')
      .eq('website_site_id', site.id)
      // Local review should prefer an editable draft, but remain available
      // after that draft has been published.
      .in('status', ['draft', 'published'])
      .order('status', { ascending: true })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('organisation_branding')
      .select('logo_icon_url')
      .eq('organisation_id', site.organisation_id)
      .maybeSingle(),
  ])

  if (revisionResult.error) throw revisionResult.error
  if (organisationBrandingResult.error) throw organisationBrandingResult.error
  if (!revisionResult.data) return null

  const brand = (revisionResult.data.brand_json || {}) as Record<string, unknown>
  const properties = await getPublishedWebsiteListings(supabase, { id: site.id, organisationId: site.organisation_id }, 12)
  return {
    id: String(site.id),
    organisationId: String(site.organisation_id),
    publishedRevisionId: String(revisionResult.data.id),
    templateKey: site.template_key === 'home-seekers-v1' ? 'home-seekers-v1' : 'property-standard-v1',
    experienceKey: brand.experienceKey === 'editorial-property-v1' ? 'editorial-property-v1' : 'standard',
    name: String(brand.name || 'Property'),
    status: site.status === 'published' ? 'published' : 'draft',
    primaryColor: String(brand.primaryColor || '#161616'),
    secondaryColor: String(brand.secondaryColor || '#5f5f5f'),
    accentColor: String(brand.accentColor || '#e2232b'),
    logoUrl: brand.logoUrl ? String(brand.logoUrl) : undefined,
    logoLightUrl: brand.logoLightUrl ? String(brand.logoLightUrl) : undefined,
    logoDarkUrl: brand.logoDarkUrl ? String(brand.logoDarkUrl) : undefined,
    logoIconUrl: brand.logoIconUrl ? String(brand.logoIconUrl) : organisationBrandingResult.data?.logo_icon_url ? String(organisationBrandingResult.data.logo_icon_url) : undefined,
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
    preview: true,
    properties: mapPublishedProperties(properties),
  }
}
