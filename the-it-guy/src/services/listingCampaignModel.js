import {
  cleanPropertyBuilder,
  PROPERTY_CAMPAIGNS,
  propertyItems,
} from './listingCampaignContract'
import { justListedGaps, justListedPayload } from './justListedCampaignModel'
export function projectPropertySource(template, current, settings = {}) {
  const source = { ...current.source }
  const area = current.publicArea ?? source.location
  const af = source.language === 'af-ZA'
  if (template === 'coming-soon') {
    source.location = area
    if (!settings.revealTitle)
      source.title = `${af ? 'Binnekort in' : 'Coming soon to'} ${area}`
    if (!settings.revealPrice) source.price = ''
    if (!settings.revealFacts) {
      source.facts = ''
      source.description = ''
    }
    if (!settings.revealPhotos) source.imageId = ''
  }
  if (template === 'just-sold') {
    source.title = `${af ? 'Onlangs verkoop in' : 'Recently sold in'} ${area}`
    source.location = area
    source.price = ''
    source.facts = ''
    source.description = ''
  }
  return source
}
export function propertyCampaignGaps(builder, now = Date.now()) {
  const gaps = [],
    { template, settings = {} } = builder
  for (const item of propertyItems(builder)) {
    const source = { ...item.source }
    if (['coming-soon', 'just-sold'].includes(template))
      source.price ||= 'Not advertised'
    gaps.push(...justListedGaps(source))
  }
  if (template === 'property-collection' && propertyItems(builder).length < 3)
    gaps.push('Choose three to six properties for this collection.')
  if (template === 'show-day') {
    const validDate =
      /^\d{4}-\d{2}-\d{2}$/.test(settings.date || '') &&
      Number.isFinite(Date.parse(settings.date)) &&
      new Date(settings.date).toISOString().slice(0, 10) === settings.date
    const validTime =
      /^([01]\d|2[0-3]):[0-5]\d$/.test(settings.startTime || '') &&
      /^([01]\d|2[0-3]):[0-5]\d$/.test(settings.endTime || '') &&
      settings.endTime > settings.startTime
    if (
      !validDate ||
      !validTime ||
      Date.parse(`${settings.date}T${settings.endTime}:00+02:00`) <= now
    )
      gaps.push(
        'Choose a future show day with a valid start and end time (South African time).',
      )
  }
  if (
    template === 'price-reduced' &&
    (!settings.priceConfirmed || !/^R\s*\d/.test(builder.source.price))
  )
    gaps.push(
      'Confirm the reduced asking price already saved on the listing. No previous price or discount is invented.',
    )
  if (
    ['coming-soon', 'just-sold'].includes(template) &&
    !settings.publicationConfirmed
  )
    gaps.push(
      'Confirm permission to use the selected public details and photos for this campaign.',
    )
  return [...new Set(gaps)]
}
export function propertyCampaignCopy(builder) {
  const { source, settings = {}, template } = builder,
    config = PROPERTY_CAMPAIGNS[template],
    af = source.language === 'af-ZA'
  const labels = {
    'show-day': af ? 'Skoudag' : 'Show day',
    'property-spotlight': af ? 'Eiendom in fokus' : 'Property spotlight',
    'price-reduced': af ? 'Verlaagde prys' : 'Price reduced',
    'coming-soon': af ? 'Binnekort beskikbaar' : 'Coming soon',
    'property-collection': af ? 'Eiendomsversameling' : 'Property collection',
    'just-sold': af ? 'Pas verkoop' : 'Just sold nearby',
  }
  const title =
    template === 'property-collection'
      ? `${labels[template]} · ${propertyItems(builder).length} ${af ? 'eiendomme' : 'properties'}`
      : `${labels[template]}: ${source.title}`
  const action = `${af ? config.afAction : config.action}: ${source.destination}`
  const event =
    template === 'show-day'
      ? `${settings.date} · ${settings.startTime}–${settings.endTime} (SAST)`
      : ''
  const feature =
    template === 'property-spotlight'
      ? settings.feature || source.facts || source.description || ''
      : ''
  const details =
    template === 'property-collection'
      ? propertyItems(builder)
          .map(
            (item, index) =>
              `${index + 1}. ${item.source.title}\n${item.source.location} · ${item.source.price}\n${item.source.facts}\n${item.source.agentName}: ${item.source.destination}`,
          )
          .join('\n\n')
      : [
          source.location,
          source.price,
          event,
          feature,
          source.facts,
          source.description,
        ]
          .filter(Boolean)
          .join('\n\n')
  return Object.fromEntries(
    ['social', 'email', 'whatsapp'].map((channel) => [
      channel,
      {
        title: title.slice(0, 240),
        body: [
          title,
          channel === 'whatsapp'
            ? [source.location, source.price, event, feature.slice(0, 180)]
                .filter(Boolean)
                .join(' · ')
            : details,
          `${source.agentName} | ${source.agencyName}`,
          action,
        ].join('\n\n'),
        timing: af
          ? 'Konsep — hersien voor gebruik'
          : 'Draft — review before use',
      },
    ]),
  )
}
export function propertyCampaignPayload(input, content) {
  const builder = cleanPropertyBuilder(input),
    gaps = propertyCampaignGaps(builder)
  if (gaps.length) throw new Error(gaps.join(' '))
  // Reuse the existing campaign envelope without imposing an advertised price
  // on deliberately restricted teasers or sold-result campaigns.
  const base = justListedPayload(
    {
      version: 1,
      template: 'new-listing',
      listingId: builder.listingId,
      agentId: builder.agentId,
      source: {
        ...builder.source,
        price: builder.source.price || 'Not advertised',
      },
    },
    content,
  )
  return {
    ...base,
    goal: builder.template === 'just-sold' ? 'seller_leads' : 'promote_listing',
    audience:
      builder.template === 'just-sold'
        ? 'Homeowners near the sold property'
        : base.audience,
    name: `${PROPERTY_CAMPAIGNS[builder.template].title} · ${builder.template === 'property-collection' ? propertyItems(builder).length + ' properties' : builder.source.title}`.slice(
      0,
      120,
    ),
    objective: PROPERTY_CAMPAIGNS[builder.template].action,
    offer: PROPERTY_CAMPAIGNS[builder.template].action,
    listing_builder: builder,
  }
}
