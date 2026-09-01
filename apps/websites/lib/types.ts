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
  media: Array<{ type: 'image' | 'floor_plan' | 'video' | 'virtual_tour'; url: string; caption?: string; order: number }>
}

export type ResolvedSite = {
  id: string
  organisationId: string
  name: string
  status: 'draft' | 'published' | 'suspended'
  primaryColor: string
  secondaryColor: string
  phone?: string
  email?: string
  preview: boolean
  properties: PublicProperty[]
}

export type WebsiteBlock =
  | { type: 'hero'; heading: string; body?: string; eyebrow?: string; ctaLabel?: string; ctaHref?: string }
  | { type: 'rich_text'; heading?: string; body: string; ctaLabel?: string; ctaHref?: string }
  | { type: 'benefits'; heading?: string; items: Array<{ title: string; body: string }> }
  | { type: 'faq'; heading?: string; items: Array<{ question: string; answer: string }> }
  | { type: 'property_collection'; heading?: string; maxItems?: number; transactionType?: 'sale' | 'rental' }
  | { type: 'lead_form'; heading?: string; body?: string; purpose?: 'general_enquiry' | 'valuation_request' | 'campaign_enquiry' }
  | { type: 'cta'; heading: string; body?: string; ctaLabel: string; ctaHref: string }

export type PublicPage = {
  id: string
  slug: string
  kind: 'about' | 'contact' | 'valuation' | 'campaign'
  title: string
  seoTitle?: string
  seoDescription?: string
  blocks: WebsiteBlock[]
}
