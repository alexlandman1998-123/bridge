import {
  LISTING_SOURCE_FIELDS,
  cleanPropertyBuilder,
} from './listingCampaignContract'
import { buildListingAdvertPreview } from './listings/listingAdvertPreviewModel'
import { assertCampaignContacts, cleanContactProvenance } from './campaignContactProvenance'

const text = (value) => String(value ?? '').trim()
export const JUST_LISTED_SOURCE_FIELDS = LISTING_SOURCE_FIELDS

export function safeCampaignUrl(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !/\s/.test(value) &&
      value.length <= 2048
      ? value
      : ''
  } catch {
    return ''
  }
}
export function cleanListingBuilder(input) {
  if (input?.version === 2) return cleanPropertyBuilder(input)
  if (
    !input ||
    input.version !== 1 ||
    input.template !== 'new-listing' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      input.listingId || '',
    ) ||
    (input.agentId &&
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        input.agentId,
      ))
  )
    throw new Error('Reopen the Just Listed builder before saving.')
  const source = Object.fromEntries(
    JUST_LISTED_SOURCE_FIELDS.map((key) => [key, text(input.source?.[key])]),
  )
  if (
    Object.values(source).some((value) => value.length > 6000) ||
    JSON.stringify(source).length > 24000
  )
    throw new Error('Shorten the campaign details before saving.')
  return {
    version: 1,
    template: 'new-listing',
    listingId: input.listingId,
    agentId: input.agentId || '',
    source,
    ...(input.contactProvenance !== undefined ? { contactProvenance: cleanContactProvenance(input.contactProvenance, source) } : {}),
  }
}

// Project only public advert fields. Never persist the private listing/onboarding object.
export function justListedSource(listing, agency, agent = {}) {
  const details = listing.propertyDetails || {}
  const property = listing.sellerCanonicalFacts?.property || {}
  const onboarding = listing.sellerOnboarding?.formData || {}
  const gallery = listing.marketing?.imageGallery || listing.images || []
  const coverId = listing.marketing?.coverImageId || listing.coverImageId
  const preview = buildListingAdvertPreview({
    listingTitle: listing.title,
    listingDescription:
      listing.marketing?.description ||
      listing.description ||
      details.description,
    listingPrice: listing.askingPrice ?? details.price,
    priceOnApplication:
      listing.priceOnApplication ||
      property.priceOnApplication ||
      property.price_on_application,
    propertyType: listing.propertyType || details.propertyType,
    propertyCategory: listing.propertyCategory || property.propertyCategory,
    suburb: listing.suburb || details.suburb,
    city: listing.city || details.city,
    // Resolve visibility using the same precedence as the listing editor.
    exactAddressVisibility:
      listing.exactAddressVisibility ||
      details.exactAddressVisibility ||
      onboarding.exactAddressVisibility ||
      property.exactAddressVisibility ||
      'hide_street_address',
    propertyAddress: listing.formattedAddress || listing.addressLine1,
    streetName: listing.streetName || property.streetName,
    streetNumber: listing.streetNumber || property.streetNumber,
    complexName: listing.complexName || property.complexName,
    bedrooms: listing.bedrooms ?? details.bedrooms ?? property.bedrooms,
    bathrooms: listing.bathrooms ?? details.bathrooms ?? property.bathrooms,
    floorSize: listing.floorSize ?? details.floorSize ?? property.floorSize,
    erfSize: listing.erfSize ?? details.erfSize ?? property.erfSize,
    listingImages: gallery,
    coverImageId: coverId,
  })
  const contact =
    agency.buyerDestination === 'agency'
      ? { email: agency.agencyEmail, phone: agency.agencyPhone }
      : agent
  const destination =
    agency.buyerDestination === 'link'
      ? safeCampaignUrl(agency.buyerUrl)
      : [contact.email, contact.phone].map(text).filter(Boolean).join(' · ')
  return {
    source: Object.fromEntries(
      Object.entries({
        title: text(listing.title),
        price: preview.price.startsWith('Add ') ? '' : preview.price,
        location: preview.location.startsWith('Add ') ? '' : preview.location,
        facts: preview.facts
          .map((fact) => `${fact.value} ${fact.label.toLowerCase()}`)
          .join(' · '),
        description: preview.description,
        agencyName: agency.agencyName,
        agentName: agent.name,
        agentEmail: agent.email,
        agentPhone: agent.phone,
        destination,
        language: agency.language,
        tone: agency.tone,
        primaryColor: agency.primaryColor,
        imageId: (gallery.find((image) => image.id === coverId) || gallery[0])
          ?.id,
        listingUpdatedAt: listing.updatedAt,
      }).map(([key, value]) => [key, text(value)]),
    ),
    coverUrl: safeCampaignUrl(preview.coverUrl),
    logoUrl: safeCampaignUrl(agency.logoUrl),
    images: gallery
      .map((image) => ({
        id: text(image.id),
        url: safeCampaignUrl(image.url || image.signedUrl || image.publicUrl),
      }))
      .filter((image) => image.id && image.url),
  }
}
export function justListedGaps(source) {
  const gaps = []
  if (!source.agencyName)
    gaps.push('Confirm the agency name in Campaign Setup.')
  if (!source.title || !source.location || !source.price)
    gaps.push(
      'Add the listing headline, public area and asking price in the listing editor.',
    )
  if (!source.agentName) gaps.push('Add the assigned agent’s public name.')
  if (!source.destination)
    gaps.push(
      'Add a public enquiry email or phone, or finish enquiry routing in Campaign Setup.',
    )
  else if (
    !safeCampaignUrl(source.destination) &&
    !source.destination
      .split(' · ')
      .some(
        (part) =>
          /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(part) ||
          (/^[+()\d .-]+$/.test(part) &&
            part.replace(/\D/g, '').length >= 7 &&
            part.replace(/\D/g, '').length <= 20),
      )
  )
    gaps.push('Use a valid public enquiry email, phone number or HTTPS link.')
  if (!['en-ZA', 'af-ZA'].includes(source.language))
    gaps.push(
      'Choose English or Afrikaans for this draft. More campaign languages will be supported later.',
    )
  return gaps
}
export function justListedCopy(source) {
  const af = source.language === 'af-ZA'
  const title = `${af ? 'Pas gelys' : 'Just listed'}: ${source.title}`
  const location = `${source.location} · ${source.price}`
  const signature = `${source.agentName} | ${source.agencyName}`
  const action = `${af ? 'Bespreek ’n besigtiging' : 'Book a viewing'}: ${source.destination}`
  const opening =
    source.tone === 'Professional and clear'
      ? af
        ? 'Eiendomsbesonderhede vir u oorweging.'
        : 'Property details for your consideration.'
      : source.tone === 'Premium and understated'
        ? af
          ? 'Ons stel hierdie eiendom bekend.'
          : 'Introducing this property.'
        : af
          ? 'Kyk gerus na hierdie nuwe eiendom.'
          : 'Take a closer look at this new listing.'
  const bodies = {
    social: [
      title,
      location,
      source.facts,
      source.description,
      signature,
      action,
    ],
    email: [
      opening,
      source.title,
      location,
      source.facts,
      source.description,
      action,
      signature,
    ],
    whatsapp: [title, location, source.facts, action, signature],
  }
  return Object.fromEntries(
    ['social', 'email', 'whatsapp'].map((channel) => [
      channel,
      {
        title,
        body: bodies[channel].filter(Boolean).join('\n\n'),
        timing: af
          ? 'Konsep — hersien voor gebruik'
          : 'Draft — review before use',
      },
    ]),
  )
}
export function justListedPayload(builder, content) {
  const data = cleanListingBuilder(builder)
  assertCampaignContacts(data)
  const gaps = justListedGaps(data.source)
  if (gaps.length) throw new Error(gaps.join(' '))
  return {
    name: `Just Listed · ${data.source.title}`.slice(0, 120),
    goal: 'promote_listing',
    objective: 'Introduce this listing and invite buyers to book a viewing.',
    audience: 'Prospective buyers',
    offer: 'Book a viewing',
    area: data.source.location.slice(0, 120),
    status: 'draft',
    planned_channels: ['social', 'email', 'whatsapp'],
    cover_url: '',
    channel_content: content,
    listing_builder: data,
  }
}
