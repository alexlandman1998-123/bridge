const TEMPLATE_TYPES = ['property_match', 'new_listing', 'price_reduction', 'follow_up']

const TEMPLATES = {
  property_match: {
    key: 'property_match',
    label: 'Property Match',
    subject: 'Property option for you',
    intro: 'We found a property that may interest you.',
  },
  new_listing: {
    key: 'new_listing',
    label: 'New Listing',
    subject: 'New property matching your preferences',
    intro: 'A new property matching your preferences is available.',
  },
  price_reduction: {
    key: 'price_reduction',
    label: 'Price Reduction',
    subject: 'Property price update',
    intro: 'A property you viewed has changed price.',
  },
  follow_up: {
    key: 'follow_up',
    label: 'Follow-Up',
    subject: 'Property follow-up',
    intro: 'Just checking whether you would like more options.',
  },
}

function normalizeText(value) {
  return String(value ?? '').trim()
}

function normalizeType(value = 'property_match') {
  const normalized = normalizeText(value).toLowerCase().replace(/[-\s]+/g, '_')
  return TEMPLATE_TYPES.includes(normalized) ? normalized : 'property_match'
}

function formatCurrency(value) {
  const number = Number(value || 0)
  if (!number) return ''
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(number)
}

function leadName(lead = {}) {
  return normalizeText(lead.name || [lead.firstName || lead.first_name, lead.lastName || lead.last_name].map(normalizeText).filter(Boolean).join(' ')) || 'there'
}

function listingTitle(listing = {}) {
  return normalizeText(listing.title || listing.listingTitle || listing.propertyAddress || listing.property_address || listing.address || listing.suburb) || 'Listing details pending'
}

function listingLocation(listing = {}) {
  return [listing.address, listing.propertyAddress, listing.suburb, listing.city].map(normalizeText).filter(Boolean).slice(0, 3).join(', ')
}

function listingLine(listing = {}) {
  const specs = [
    listing.propertyType || listing.property_type,
    listing.bedrooms ? `${listing.bedrooms} bed` : '',
    listing.bathrooms ? `${listing.bathrooms} bath` : '',
    listing.garages ? `${listing.garages} garage` : '',
  ].map(normalizeText).filter(Boolean)
  return [
    listingTitle(listing),
    listingLocation(listing),
    formatCurrency(listing.price || listing.askingPrice || listing.asking_price),
    specs.join(' · '),
  ].filter(Boolean).join(' | ')
}

export function listLeadCommunicationTemplates() {
  return TEMPLATE_TYPES.map((type) => TEMPLATES[type])
}

export function getLeadCommunicationTemplate(type = 'property_match') {
  return TEMPLATES[normalizeType(type)]
}

export function renderLeadCommunicationTemplate(type = 'property_match', context = {}) {
  const template = getLeadCommunicationTemplate(type)
  const listings = Array.isArray(context.listings) ? context.listings : [context.listing].filter(Boolean)
  const note = normalizeText(context.note)
  const requirementSummary = normalizeText(context.requirementSummary)
  const lines = [
    `Hi ${leadName(context.lead)},`,
    '',
    template.intro,
    requirementSummary ? `Preference: ${requirementSummary}` : '',
    '',
    ...listings.map((listing, index) => `${index + 1}. ${listingLine(listing)}`),
    note ? '' : '',
    note ? `Agent note: ${note}` : '',
    '',
    'Please let me know if you would like more details or a viewing.',
  ].filter((line, index, all) => line || all[index - 1] !== '')
  return {
    type: template.key,
    label: template.label,
    subject: normalizeText(context.subject) || template.subject,
    message: lines.join('\n').trim(),
  }
}

export function buildPropertyMessage({
  templateType = 'property_match',
  lead = {},
  listings = [],
  listing = null,
  requirement = null,
  requirementSummary = '',
  note = '',
} = {}) {
  return renderLeadCommunicationTemplate(templateType, {
    lead,
    listings: listings.length ? listings : [listing].filter(Boolean),
    requirementSummary: requirementSummary || requirement?.summary,
    note,
  })
}

export const __leadCommunicationTemplateServiceTestUtils = {
  buildPropertyMessage,
  getLeadCommunicationTemplate,
  listingLine,
  listLeadCommunicationTemplates,
  renderLeadCommunicationTemplate,
}
