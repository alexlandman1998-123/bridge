import { cleanContactProvenance } from './campaignContactProvenance'

export const LISTING_SOURCE_FIELDS = [
  'title',
  'price',
  'location',
  'facts',
  'description',
  'agencyName',
  'agentName',
  'agentEmail',
  'agentPhone',
  'destination',
  'language',
  'tone',
  'primaryColor',
  'imageId',
  'listingUpdatedAt',
]
export const PROPERTY_CAMPAIGNS = {
  'show-day': {
    title: 'Show Day / Open House',
    carousel: 4,
    stories: 2,
    action: 'Enquire about attending',
    afAction: 'Doen navraag oor bywoning',
  },
  'property-spotlight': {
    title: 'Property Spotlight',
    carousel: 5,
    stories: 2,
    action: 'Arrange a viewing',
    afAction: 'Reël ’n besigtiging',
  },
  'price-reduced': {
    title: 'Price Reduced',
    carousel: 3,
    stories: 1,
    action: 'Book a viewing',
    afAction: 'Bespreek ’n besigtiging',
  },
  'coming-soon': {
    title: 'Coming Soon',
    carousel: 0,
    stories: 2,
    action: 'Register your interest',
    afAction: 'Registreer jou belangstelling',
  },
  'property-collection': {
    title: 'Property Collection',
    carousel: 0,
    stories: 0,
    action: 'Enquire about these properties',
    afAction: 'Doen navraag oor hierdie eiendomme',
  },
  'just-sold': {
    title: 'Just Sold Nearby',
    carousel: 4,
    stories: 1,
    action: 'Discuss selling your property',
    afAction: 'Bespreek die verkoop van jou eiendom',
  },
}
export const uuid = (value) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value || '',
  )
const strings = ['eventId', 'date', 'startTime', 'endTime', 'feature']
const booleans = [
  'priceConfirmed',
  'publicationConfirmed',
  'revealTitle',
  'revealPrice',
  'revealFacts',
  'revealPhotos',
]
export function cleanPropertyItem(input) {
  if (!uuid(input?.listingId) || (input.agentId && !uuid(input.agentId)))
    throw new Error('Choose a valid listing and assigned agent.')
  const source = Object.fromEntries(
    LISTING_SOURCE_FIELDS.map((key) => [
      key,
      String(input.source?.[key] ?? '').trim(),
    ]),
  )
  if (Object.values(source).some((value) => value.length > 6000))
    throw new Error('Shorten the listing campaign details before saving.')
  const contactProvenance = cleanContactProvenance(input.contactProvenance, source)
  return { listingId: input.listingId, agentId: input.agentId || '', source, ...(contactProvenance ? { contactProvenance } : {}) }
}
export function cleanPropertyBuilder(input) {
  if (
    input?.version !== 2 ||
    !Object.hasOwn(PROPERTY_CAMPAIGNS, input.template)
  )
    throw new Error('Reopen this property campaign in the latest builder.')
  const primary = cleanPropertyItem(input)
  const additionalListings = (
    Array.isArray(input.additionalListings) ? input.additionalListings : []
  ).map(cleanPropertyItem)
  const items = [primary, ...additionalListings]
  if (
    items.length > 6 ||
    new Set(items.map((item) => item.listingId)).size !== items.length ||
    (input.template !== 'property-collection' && additionalListings.length)
  )
    throw new Error('Choose distinct listings, up to six for a collection.')
  const settings = Object.fromEntries(
    strings.map((key) => [key, String(input.settings?.[key] || '').trim()]),
  )
  for (const key of booleans) settings[key] = input.settings?.[key] === true
  if (input.template !== 'property-spotlight') settings.feature = ''
  if (input.template !== 'show-day')
    for (const key of ['eventId', 'date', 'startTime', 'endTime'])
      settings[key] = ''
  if (
    settings.feature.length > 600 ||
    Object.values(settings).some(
      (value) => typeof value === 'string' && value.length > 600,
    ) ||
    (settings.eventId && !uuid(settings.eventId))
  )
    throw new Error('Check the event and feature details.')
  const result = {
    version: 2,
    template: input.template,
    ...primary,
    additionalListings,
    settings,
  }
  if (JSON.stringify(result).length > 140000)
    throw new Error('Shorten the collection details before saving.')
  if (input.template === 'coming-soon') {
    if (
      (!settings.revealPhotos && primary.source.imageId) ||
      (!settings.revealPrice && primary.source.price) ||
      (!settings.revealFacts &&
        (primary.source.description || primary.source.facts))
    )
      throw new Error('Remove unapproved teaser details before saving.')
  }
  if (
    input.template === 'just-sold' &&
    (primary.source.price || primary.source.description || primary.source.facts)
  )
    throw new Error(
      'Sold campaigns do not include price or unverified result details.',
    )
  return result
}
export const propertyItems = (builder) => [
  {
    listingId: builder.listingId,
    agentId: builder.agentId,
    source: builder.source,
    ...(builder.contactProvenance ? { contactProvenance: builder.contactProvenance } : {}),
  },
  ...(builder.additionalListings || []),
]
