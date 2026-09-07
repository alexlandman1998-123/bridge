export type PublicProperty = {
  id: string
  title: string
  reference: string
  transactionType: 'sale' | 'rental'
  propertyType: string
  suburb: string
  province?: string
  price?: number
  bedrooms?: number
  bathrooms?: number
  parkingBays?: number
  floorSize?: number
  description?: string
  features: string[]
  amenities: string[]
  isShowcase?: boolean
  media: Array<{ type: 'image' | 'floor_plan' | 'video' | 'virtual_tour'; url: string; caption?: string; order: number }>
}

export type WebsiteTemplateKey = 'property-standard-v1' | 'home-seekers-v1'

export type ResolvedSite = {
  id: string
  organisationId: string
  publishedRevisionId: string
  templateKey: WebsiteTemplateKey
  name: string
  status: 'draft' | 'published' | 'suspended'
  primaryColor: string
  secondaryColor: string
  accentColor: string
  logoUrl?: string
  logoLightUrl?: string
  logoDarkUrl?: string
  phone?: string
  email?: string
  website?: string
  whatsappNumber?: string
  preview: boolean
  properties: PublicProperty[]
}

export type WebsiteBlock =
  | { type: 'hero'; hidden?: boolean; heading: string; body?: string; eyebrow?: string; ctaLabel?: string; ctaHref?: string }
  | { type: 'rich_text'; hidden?: boolean; heading?: string; body: string; ctaLabel?: string; ctaHref?: string }
  | { type: 'benefits'; hidden?: boolean; heading?: string; items: Array<{ title: string; body: string }> }
  | { type: 'faq'; hidden?: boolean; heading?: string; items: Array<{ question: string; answer: string }> }
  | { type: 'property_collection'; hidden?: boolean; heading?: string; maxItems?: number; transactionType?: 'sale' | 'rental' }
  | { type: 'lead_form'; hidden?: boolean; heading?: string; body?: string; purpose?: 'general_enquiry' | 'valuation_request' | 'campaign_enquiry' }
  | { type: 'cta'; hidden?: boolean; heading: string; body?: string; ctaLabel: string; ctaHref: string }

export type PublicPage = {
  id: string
  slug: string
  kind: 'home' | 'about' | 'contact' | 'valuation' | 'campaign'
  title: string
  seoTitle?: string
  seoDescription?: string
  socialImageUrl?: string
  blocks: WebsiteBlock[]
}
