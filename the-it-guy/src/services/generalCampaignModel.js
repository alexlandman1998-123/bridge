import { campaignShopTemplates } from './marketingCampaignCatalogue'
import { validateChannelContent } from './marketingCampaignTemplates'
import { assertCampaignContacts, cleanContactProvenance, contactProvenanceReview, GENERAL_CONTACT_FIELDS } from './campaignContactProvenance'

const field = (key, label, max = 2000, options = {}) => ({
  key,
  label,
  max,
  ...options,
})
export const RELATIONSHIP_CAMPAIGNS = [
  'key-handover',
  'review-request',
  'referral-request',
  'client-check-in',
]
export const generalChannels = (template) =>
  template === 'review-request'
    ? ['email', 'whatsapp']
    : ['social', 'email', 'whatsapp']
const selling =
  'List the information you have about your property.\nNote features you would like buyers to know about.\nPrepare questions about marketing and viewings.\nDiscuss your preferred timing with your agent.\nAgree the next steps with your agent.'
const buying =
  'List your preferred areas.\nSeparate must-have features from nice-to-haves.\nPrepare questions to ask at viewings.\nDiscuss your next steps with your agent.\nConfirm costs and processes with the professionals involved.'
export const GENERAL_CAMPAIGNS = {
  sellers: {
    carousel: 4,
    stories: 2,
    route: 'seller',
    fields: [field('offer', 'Valuation offer and terms', 600)],
  },
  'thinking-of-selling': {
    carousel: 5,
    stories: 1,
    route: 'seller',
    fields: [field('checklist', 'Home preparation checklist')],
  },
  'buyer-demand': {
    carousel: 0,
    stories: 1,
    route: 'seller',
    fields: [
      field('brief', 'Approved public buyer requirements'),
      field('briefExpires', 'Buyer brief valid until', 10),
    ],
    permission:
      'I confirm this buyer search is current and these public requirements are approved. Do not include buyer names or private financial details.',
  },
  buyers: { carousel: 4, stories: 2, route: 'buyer', fields: [] },
  'first-time-buyer': {
    carousel: 5,
    stories: 1,
    route: 'buyer',
    fields: [field('checklist', 'Buyer checklist')],
  },
  'meet-your-agent': {
    carousel: 4,
    stories: 2,
    route: 'agent',
    fields: [field('bio', 'Public agent biography')],
    portrait: true,
  },
  'client-success': {
    carousel: 4,
    stories: 1,
    route: 'agent',
    fields: [
      field('quote', 'Approved testimonial'),
      field('attribution', 'Approved public attribution', 120),
      field('context', 'Verified story context'),
    ],
    permission:
      'I confirm permission to publish this exact testimonial, attribution and context.',
  },
  'key-handover': {
    carousel: 0,
    stories: 1,
    route: 'agent',
    fields: [
      field('transactionId', 'Completed transaction', 36, { hidden: true }),
      field('variant', 'Celebration for', 6, {
        options: [
          ['buyer', 'Buyer'],
          ['seller', 'Seller'],
        ],
      }),
      field('publicName', 'Approved public celebration name (optional)', 120, {
        type: 'text',
        optional: true,
      }),
      field('imageId', 'Approved listing photo', 2048, {
        optional: true,
        hidden: true,
      }),
    ],
    permission:
      'I confirm the keys have been handed over and permission has been given to share the selected public name, area and photo.',
  },
  'review-request': {
    carousel: 0,
    stories: 0,
    route: 'agent',
    fields: [field('reviewUrl', 'Review link', 240, { type: 'url' })],
  },
  'referral-request': { carousel: 0, stories: 1, route: 'agent', fields: [] },
  'client-check-in': { carousel: 0, stories: 1, route: 'agent', fields: [] },
  'market-update': {
    carousel: 5,
    stories: 2,
    route: 'agent',
    fields: [
      field('summary', 'Reviewed market summary'),
      field('period', 'Reporting period', 120),
      field('reportSource', 'Report source or public link', 600),
      field('reportDate', 'Report publication date', 10),
    ],
  },
}
export const generalTemplate = (id) =>
  campaignShopTemplates.find((item) => item.id === id)
export const GENERAL_SOURCE_KEYS = [
  'agencyName',
  'agentName',
  'agentTitle',
  'agentBio',
  'destination',
  'serviceAreas',
  'language',
  'setupLanguage',
  'tone',
  'primaryColor',
  'logoUrl',
  'photoUrl',
]
export const generalSourceKeys = (template) => [
  ...GENERAL_SOURCE_KEYS,
  ...(template === 'review-request' ? ['reviewUrl'] : []),
]
const uuid = (value) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
const https = (value) => {
  try {
    const url = new URL(value)
    return (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !/\s/.test(value)
    )
  } catch {
    return false
  }
}
export function cleanGeneralBuilder(input) {
  if (
    !input ||
    input.version !== 1 ||
    !Object.hasOwn(GENERAL_CAMPAIGNS, input.template) ||
    !uuid(input.agentId)
  )
    throw new Error('Open a supported campaign template.')
  const source = Object.fromEntries(
    generalSourceKeys(input.template).map((key) => [
      key,
      String(input.source?.[key] || '').trim(),
    ]),
  )
  if (Object.values(source).some((value) => value.length > 2048))
    throw new Error('Shorten public profile details to 2,048 characters.')
  for (const key of ['logoUrl', 'photoUrl'])
    if (source[key] && !https(source[key]))
      throw new Error('Use a valid HTTPS public profile image.')
  if (
    source.reviewUrl &&
    (!https(source.reviewUrl) || source.reviewUrl.length > 240)
  )
    throw new Error('Update the public review link in Campaign Setup.')
  const config = GENERAL_CAMPAIGNS[input.template]
  const details = { area: String(input.details?.area || '').trim() }
  if (details.area.length > 120)
    throw new Error('Shorten the campaign area to 120 characters.')
  for (const { key, max } of config.fields) {
    details[key] = String(input.details?.[key] || '').trim()
    if (details[key].length > max)
      throw new Error(`Shorten ${key} before saving.`)
  }
  return {
    version: 1,
    template: input.template,
    agentId: input.agentId,
    source,
    ...(input.contactProvenance !== undefined ? { contactProvenance: cleanContactProvenance(input.contactProvenance, source, GENERAL_CONTACT_FIELDS) } : {}),
    details,
    reviewed: input.reviewed === true,
    permission: config.permission ? input.permission === true : false,
  }
}
const realDate = (value) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value || '') &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString().slice(0, 10) === value
export function generalCampaignGaps(builder, now = Date.now()) {
  const gaps = [],
    { source, details } = builder,
    config = GENERAL_CAMPAIGNS[builder.template]
  const contacts = contactProvenanceReview(builder, null, GENERAL_CONTACT_FIELDS)
  if (!contacts.ready) gaps.push(contacts.message)
  for (const [key, label] of [
    ['agencyName', 'agency name'],
    ['agentName', 'public agent name'],
    ['destination', 'public enquiry contact'],
  ])
    if (!source[key]?.trim()) gaps.push(`Add the missing ${label}.`)
  if (!details.area) gaps.push('Confirm the campaign area.')
  if (
    source.destination &&
    !https(source.destination) &&
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
  if ((source.destination || '').length > 240)
    gaps.push(
      'Choose a shorter public enquiry contact or link (up to 240 characters) in Campaign Setup.',
    )
  if (!['en-ZA', 'af-ZA'].includes(source.language))
    gaps.push('Choose English or Afrikaans for this draft.')
  for (const { key, label, optional } of config.fields)
    if (!optional && !details[key]) gaps.push(`Add ${label.toLowerCase()}.`)
  if (
    builder.template === 'buyer-demand' &&
    (!realDate(details.briefExpires) ||
      Date.parse(`${details.briefExpires}T23:59:59+02:00`) <= now)
  )
    gaps.push(
      'Choose a future expiry date for the confirmed buyer search (South African time).',
    )
  if (
    builder.template === 'market-update' &&
    (!realDate(details.reportDate) ||
      Date.parse(`${details.reportDate}T00:00:00+02:00`) > now)
  )
    gaps.push('Use a real report publication date that is not in the future.')
  if (
    builder.template === 'review-request' &&
    (!https(details.reviewUrl) || details.reviewUrl.length > 240)
  )
    gaps.push('Use a valid public HTTPS review link of up to 240 characters.')
  if (
    builder.template === 'key-handover' &&
    (!uuid(details.transactionId || '') ||
      !['buyer', 'seller'].includes(details.variant))
  )
    gaps.push(
      'Choose a permitted completed transaction and a buyer or seller celebration.',
    )
  if (config.portrait && !source.photoUrl)
    gaps.push(
      'Add a public portrait in Campaign Setup for this agent introduction.',
    )
  if (config.permission && !builder.permission)
    gaps.push('Confirm permission for the campaign-specific facts.')
  if (!builder.reviewed)
    gaps.push('Confirm the public campaign details before previewing.')
  return gaps
}
export function generalDefaults(
  template,
  agency,
  agent,
  language = agency.language,
) {
  const af = language === 'af-ZA'
  const defaults = {
    ...Object.fromEntries(
      GENERAL_CAMPAIGNS[template].fields.map(({ key }) => [key, '']),
    ),
    area: agent.serviceAreas?.[0] || agency.serviceAreas?.[0] || '',
  }
  if (template === 'sellers')
    defaults.offer =
      agency.offers?.find((value) => /valuation/i.test(value)) || ''
  if (template === 'thinking-of-selling')
    defaults.checklist = af
      ? 'Versamel die eiendomsinligting wat jy het.\nLys kenmerke wat kopers behoort te ken.\nBerei vrae oor bemarking en besigtigings voor.\nBespreek jou tydsberekening met jou agent.\nStem saam oor die volgende stappe.'
      : selling
  if (template === 'first-time-buyer')
    defaults.checklist = af
      ? 'Lys jou voorkeurgebiede.\nOnderskei noodsaaklike kenmerke van voorkeure.\nBerei vrae vir besigtigings voor.\nBespreek volgende stappe met jou agent.\nBevestig koste en prosesse met die betrokke professionele persone.'
      : buying
  if (template === 'meet-your-agent') defaults.bio = agent.bio || ''
  if (template === 'review-request') defaults.reviewUrl = agency.reviewUrl || ''
  if (template === 'key-handover') defaults.variant = 'buyer'
  return defaults
}
function sections(builder) {
  const { source: s, details: d, template } = builder,
    af = s.language === 'af-ZA'
  const intro = {
    'key-handover':
      d.variant === 'seller'
        ? af
          ? `Geluk met jou volgende hoofstuk${d.publicName ? ', ' + d.publicName : ''}.`
          : `Congratulations on your next chapter${d.publicName ? ', ' + d.publicName : ''}.`
        : af
          ? `Welkom tuis${d.publicName ? ', ' + d.publicName : ''}.`
          : `Welcome home${d.publicName ? ', ' + d.publicName : ''}.`,
    'review-request': af ? 'Hoe was jou ervaring?' : 'How was your experience?',
    'client-check-in': af ? 'Hoe gaan dit met jou eiendomsplanne?' : 'How are your property plans taking shape?',
    'referral-request': af
      ? 'Ken jy iemand wat wil trek?'
      : 'Know someone making a move?',
    sellers: af
      ? `Wat is jou huis in ${d.area} werd?`
      : `What is your home in ${d.area} worth?`,
    'thinking-of-selling': af
      ? `Dink jy daaraan om in ${d.area} te verkoop?`
      : `Thinking of selling in ${d.area}?`,
    'buyer-demand': af
      ? `Kan jou eiendom in ${d.area} 'n pasmaat wees?`
      : `Could your property in ${d.area} be a match?`,
    buyers: af
      ? `Kom ons vind jou volgende huis in ${d.area}.`
      : `Let’s find your next home in ${d.area}.`,
    'first-time-buyer': af
      ? 'Jou eerste huis begin met voorbereiding.'
      : 'Your first home starts with preparation.',
    'meet-your-agent': af ? `Ontmoet ${s.agentName}.` : `Meet ${s.agentName}.`,
    'client-success': af
      ? 'In ons kliënt se eie woorde.'
      : 'In our client’s own words.',
    'market-update': af
      ? `${d.area}: jou plaaslike markopdatering.`
      : `${d.area}: your local market update.`,
  }[template]
  const action = af
    ? {
        sellers: 'Vra oor ’n waardasie',
        'thinking-of-selling': 'Bespreek jou verkoopplan',
        'buyer-demand': 'Kontak die agent',
        buyers: 'Deel jou eiendomswenslys',
        'first-time-buyer': 'Bespreek jou volgende stappe',
        'meet-your-agent': 'Kom ons gesels oor eiendom',
        'client-success': 'Bespreek jou volgende skuif',
        'market-update': 'Vra oor jou plaaslike mark',
        'key-handover': 'Antwoord jou agent',
        'review-request': 'Laat ’n resensie',
        'referral-request': 'Stel ons voor',
        'client-check-in': 'Gesels met jou agent',
      }[template]
    : generalTemplate(template).cta
  let points = []
  if (template === 'sellers')
    points = [
      d.offer,
      af
        ? 'Bespreek jou eiendom en tydsberekening met jou agent.'
        : 'Discuss your property and timing with your agent.',
      af
        ? 'Vra oor die waardasieproses en enige voorwaardes.'
        : 'Ask about the valuation process and any applicable terms.',
    ]
  if (['thinking-of-selling', 'first-time-buyer'].includes(template))
    points = d.checklist.split('\n').filter(Boolean)
  if (template === 'buyer-demand')
    points = [
      d.brief,
      `${af ? 'Bevestigde soektog geldig tot' : 'Confirmed search valid until'} ${d.briefExpires}`,
    ]
  if (template === 'buyers')
    points = af
      ? [
          'Deel jou voorkeurgebiede.',
          'Vertel ons jou begrotingsreeks.',
          'Lys jou noodsaaklike kenmerke.',
          'Bespreek geskikte eiendomme met jou agent.',
        ]
      : [
          'Share your preferred areas.',
          'Tell us your budget range.',
          'List your must-have features.',
          'Discuss suitable properties with your agent.',
        ]
  if (template === 'meet-your-agent')
    points = [
      s.agentTitle,
      d.bio,
      d.area,
      `${s.agentName} · ${s.agencyName}`,
    ].filter(Boolean)
  if (template === 'client-success')
    points = [
      `“${d.quote}”`,
      `— ${d.attribution}`,
      d.context,
      af ? 'Beplan jy jou volgende skuif?' : 'Planning your next move?',
    ]
  if (template === 'market-update')
    points = [
      d.period,
      ...d.summary.split('\n').filter(Boolean),
      `${af ? 'Bron' : 'Source'}: ${d.reportSource} · ${d.reportDate}`,
    ]
  if (template === 'key-handover')
    points = af
      ? [
          'Op jou volgende hoofstuk.',
          'Dankie dat ons deel van jou eiendomsreis kon wees.',
        ]
      : [
          'Here’s to your next chapter.',
          'Thank you for letting us be part of your property journey.',
        ]
  if (template === 'review-request')
    points = af
      ? [
          'Dankie dat jy ons gekies het. Ons waardeer jou eerlike terugvoer.',
          'Deel gerus jou ervaring, wat ook al jou mening is.',
        ]
      : [
          'Thank you for choosing us. We would appreciate your honest feedback.',
          'You are welcome to share your experience, whatever your opinion.',
        ]
  if (template === 'client-check-in')
    points = af ? ['Ons loer net in om te hoor of jou planne of eiendomsvrae verander het.', 'As jy hulp nodig het, antwoord gerus wanneer dit jou pas. Geen druk om nou op te tree nie.'] : ['Checking in to ask whether your plans or property questions have changed.', 'If you need a hand, reply when it suits you. There is no pressure to make a move.']
  if (template === 'referral-request')
    points = af
      ? [
          `Ken jy iemand wat in ${d.area} wil koop of verkoop?`,
          'Deel gerus ons kontakbesonderhede, of stel ons voor met die persoon se toestemming.',
        ]
      : [
          `Know someone thinking of buying or selling in ${d.area}?`,
          'Please share our contact details or make an introduction with their permission.',
        ]
  return { intro, action, points }
}
export function generalCampaignCopy(builder) {
  const { intro, action, points } = sections(builder),
    s = builder.source,
    af = s.language === 'af-ZA'
  const destination =
    builder.template === 'review-request'
      ? builder.details.reviewUrl
      : s.destination
  const body = [
    intro,
    ...points,
    `${action}: ${destination}`,
    `${s.agentName} | ${s.agencyName}`,
  ].join('\n\n')
  const short = [
    intro,
    points[0]?.slice(0, 250),
    ...(builder.template === 'referral-request' ? [points[1]] : []),
    `${action}: ${destination}`,
  ]
    .filter(Boolean)
    .join('\n\n')
  return Object.fromEntries(
    generalChannels(builder.template).map((channel) => [
      channel,
      {
        title: intro.slice(0, 240),
        body:
          channel === 'whatsapp'
            ? short
            : channel === 'email' && s.tone !== 'Premium and understated'
              ? `${af ? (s.tone === 'Warm and approachable' ? 'Hallo,' : 'Goeiedag,') : s.tone === 'Warm and approachable' ? 'Hi there,' : 'Good day,'}\n\n${body}`
              : body,
        timing: af
          ? 'Konsep — hersien voor gebruik'
          : 'Draft — review before use',
      },
    ]),
  )
}
export function generalCampaignPayload(input, content) {
  const builder = cleanGeneralBuilder(input),
    gaps = generalCampaignGaps(builder)
  if (gaps.length) throw new Error(gaps.join(' '))
  const t = generalTemplate(builder.template)
  return {
    name: `${t.title} · ${builder.details.area}`.slice(0, 120),
    goal: t.goal,
    objective: t.objective,
    audience: t.audience,
    offer: sections(builder).action,
    area: builder.details.area,
    status: 'draft',
    planned_channels: generalChannels(builder.template),
    cover_url: '',
    channel_content: validateChannelContent(
      content,
      generalChannels(builder.template),
    ),
    campaign_builder: builder,
  }
}
const imageIdentity = (value) => {
  try {
    const u = new URL(value)
    return u.origin + u.pathname
  } catch {
    return value || ''
  }
}
export function checkedGeneralPack(campaign, current) {
  if (campaign.status !== 'draft')
    throw new Error('Open a saved campaign draft.')
  const builder = cleanGeneralBuilder(campaign.campaign_builder),
    gaps = generalCampaignGaps(builder)
  if (gaps.length) throw new Error(gaps.join(' '))
  assertCampaignContacts(builder, current.source, GENERAL_CONTACT_FIELDS)
  if (
    current.agentId !== builder.agentId ||
    generalSourceKeys(builder.template).some((key) => {
      if (GENERAL_CONTACT_FIELDS.includes(key)) return false
      if (
        key === 'language' &&
        !['en-ZA', 'af-ZA'].includes(current.source.language)
      )
        return false
      return ['photoUrl', 'logoUrl'].includes(key)
        ? imageIdentity(current.source[key]) !==
            imageIdentity(builder.source[key])
        : (current.source[key] || '') !== builder.source[key]
    })
  )
    throw new Error(
      'Saved agency or agent details changed. Edit, refresh and save this campaign before continuing.',
    )
  const channels = generalChannels(builder.template)
  const content = validateChannelContent(campaign.channel_content, channels)
  if (
    channels.some(
      (key) => !content[key]?.title?.trim() || !content[key]?.body?.trim(),
    )
  )
    throw new Error(
      'Complete the channel wording before preparing this campaign.',
    )
  const { intro, action, points } = sections(builder),
    config = GENERAL_CAMPAIGNS[builder.template],
    af = builder.source.language === 'af-ZA'
  if (builder.template === 'key-handover') {
    if (
      !current.transaction ||
      current.transaction.id !== builder.details.transactionId
    )
      throw new Error(
        'The completed transaction changed or is no longer available. Choose a permitted completed transaction again.',
      )
    if (
      current.transaction.area &&
      current.transaction.area !== builder.details.area
    )
      throw new Error(
        'The transaction area changed. Refresh and save the campaign.',
      )
    if (
      builder.details.imageId &&
      !current.images?.some((image) => image.id === builder.details.imageId)
    )
      throw new Error(
        'The selected handover photo is no longer available. Choose agency branding or an approved photo again.',
      )
  }
  const source = {
    ...builder.source,
    ...(builder.template === 'review-request'
      ? { destination: builder.details.reviewUrl }
      : {}),
    title: intro,
    location: builder.details.area,
    description: points.join('\n'),
    facts: '',
    price: '',
  }
  const image = config.portrait ? current.source.photoUrl : ''
  const heroTitle = content.social?.title || intro
  const d = builder.details
  const quote = `“${d.quote}”`
  const heroBody = builder.template === 'client-success' ? quote : points[0]
  let frames = points.map((point, index) => ({
    heading: `${af ? 'Stap' : 'Step'} ${index + 1}`,
    body: point,
  }))
  if (builder.template === 'market-update')
    frames = [
      { heading: heroTitle, body: d.period },
      {
        heading: af ? 'Gerapporteerde aktiwiteit' : 'Reported activity',
        body: d.summary,
      },
      {
        heading: af ? 'Die verslagbron' : 'The report source',
        body: `${d.reportSource} · ${d.reportDate}`,
      },
      {
        heading: af ? 'Jou eiendom, jou vrae' : 'Your property, your questions',
        body: af
          ? 'Vra jou agent hoe die verslag verband hou met die eiendom of gebied wat jy oorweeg.'
          : 'Ask your agent how the report relates to the property or area you have in mind.',
      },
      { heading: action, body: source.destination },
    ]
  else if (builder.template === 'client-success')
    frames = [
      { heading: heroTitle, body: quote },
      { heading: af ? 'Die storie' : 'The story', body: d.context },
      {
        heading: af ? 'Jou volgende skuif' : 'Your next move',
        body: af
          ? 'Bespreek jou eiendomsvrae en volgende stappe met ons.'
          : 'Discuss your property questions and next steps with us.',
      },
      { heading: action, body: source.destination },
    ]
  else if (builder.template === 'meet-your-agent')
    frames = [
      { heading: heroTitle, body: source.agentTitle },
      { heading: af ? 'Leer my ken' : 'Get to know me', body: d.bio },
      { heading: af ? 'Gebiede wat ek bedien' : 'Areas I serve', body: d.area },
      { heading: action, body: source.destination },
    ]
  else if (builder.template === 'sellers')
    frames = [
      { heading: heroTitle, body: d.offer },
      {
        heading: af
          ? 'Kom ons bespreek jou planne'
          : 'Let’s discuss your plans',
        body: points[1],
      },
      {
        heading: af ? 'Die aanbod en voorwaardes' : 'The offer and terms',
        body: d.offer,
      },
      { heading: action, body: source.destination },
    ]
  const designs = [
    {
      id: 'hero-post',
      label: 'Campaign post',
      heading: heroTitle,
      body: heroBody,
    },
  ]
  for (let i = 0; i < config.carousel; i++)
    designs.push({
      id: `carousel-${i + 1}`,
      label: `Carousel ${i + 1} of ${config.carousel}`,
      ...(frames[i] || { heading: action, body: source.destination }),
    })
  for (let i = 0; i < config.stories; i++)
    designs.push({
      id: `story-${i + 1}`,
      label: `Story ${i + 1} of ${config.stories}`,
      heading: i ? action : heroTitle,
      body: i ? source.destination : heroBody,
      height: 1920,
    })
  if (builder.template === 'buyer-demand')
    designs.push({
      id: 'neighbourhood-flyer',
      label: 'Digital square neighbourhood flyer',
      heading: intro,
      body: points.join('\n'),
    })
  const note =
    builder.template === 'market-update'
      ? `${af ? 'Bron' : 'Source'}: ${builder.details.reportDate} · ${builder.details.reportSource}`
      : builder.template === 'buyer-demand'
        ? `${af ? 'Soektog geldig tot' : 'Search valid until'} ${builder.details.briefExpires} (SAST)`
        : ''
  const textFiles = {
    ...(content.social ? { 'social-caption.txt': content.social.body } : {}),
    'email-copy.txt': `${content.email.title}\n\n${content.email.body}`,
    'whatsapp-message.txt': content.whatsapp.body,
    'enquiry-reply.txt': `${af ? 'Dankie vir jou belangstelling.' : 'Thank you for your interest.'}\n${action}: ${source.destination}`,
  }
  if (builder.template === 'sellers')
    textFiles['valuation-acknowledgement.txt'] =
      `${af ? 'Dankie vir jou waardasienavraag. Kontak ons om die aanbod, voorwaardes en volgende stappe te bespreek.' : 'Thank you for your valuation enquiry. Get in touch to discuss the offer, terms and next steps.'}\n\n${d.offer}\n${source.destination}`
  if (builder.template === 'thinking-of-selling')
    textFiles['consultation-follow-up.txt'] =
      `${af ? 'Ons volg op oor jou belangstelling om te verkoop. Laat weet ons as jy vrae oor voorbereiding of tydsberekening het.' : 'Following up on your interest in selling. Let us know if you have questions about preparation or timing.'}\n\n${action}: ${source.destination}`
  if (builder.template === 'buyers')
    textFiles['welcome-reply.txt'] =
      `${af ? 'Dankie dat jy kontak gemaak het. Deel jou voorkeurgebiede, begrotingsreeks en noodsaaklike kenmerke sodat ons geskikte opsies kan bespreek.' : 'Thanks for getting in touch. Share your preferred areas, budget range and must-have features so we can discuss suitable options.'}\n\n${source.destination}`
  if (builder.template === 'buyer-demand')
    textFiles['homeowner-reply.txt'] =
      `${af ? 'Dankie dat jy op hierdie eiendomsoektog gereageer het. Kontak die agent om te bespreek of jou eiendom kan pas.' : 'Thank you for responding to this property search. Contact the agent to discuss whether your property could be a match.'}\n${af ? 'Soektog geldig tot' : 'Search valid until'} ${d.briefExpires} (SAST)\n${source.destination}`
  if (builder.template === 'meet-your-agent')
    textFiles['agent-biography.txt'] = builder.details.bio
  if (builder.details.checklist)
    textFiles['checklist.txt'] =
      `${intro}\n\n${builder.details.checklist}\n\n${action}: ${source.destination}`
  if (builder.template === 'first-time-buyer')
    textFiles['checklist-delivery.txt'] =
      `${af ? 'Hier is jou kontrolelys.' : 'Here is your checklist.'}\n\n${textFiles['checklist.txt']}`
  if (builder.template === 'first-time-buyer')
    textFiles['follow-up-invitation.txt'] = `${action}: ${source.destination}`
  if (builder.template === 'key-handover') {
    const name = builder.details.publicName
    designs.push(
      {
        id: 'buyer-celebration',
        label: 'Buyer celebration variant',
        heading: af
          ? `Welkom tuis${name && d.variant === 'buyer' ? ', ' + name : ''}.`
          : `Welcome home${name && d.variant === 'buyer' ? ', ' + name : ''}.`,
        body: points[0],
      },
      {
        id: 'seller-celebration',
        label: 'Seller celebration variant',
        heading: af
          ? `Geluk met jou volgende hoofstuk${name && d.variant === 'seller' ? ', ' + name : ''}.`
          : `Congratulations on your next chapter${name && d.variant === 'seller' ? ', ' + name : ''}.`,
        body: points[1],
      },
    )
    textFiles['private-buyer-congratulations.txt'] =
      `${af ? 'Geluk met jou nuwe huis. Mag dit baie gelukkige oomblikke bring.' : 'Congratulations on your new home. Wishing you many happy moments ahead.'}\n${source.agentName}`
    textFiles['private-seller-congratulations.txt'] =
      `${af ? 'Geluk met jou verkoop. Alles van die beste met jou volgende hoofstuk.' : 'Congratulations on your sale. Wishing you all the best for your next chapter.'}\n${source.agentName}`
    textFiles['thank-you.txt'] =
      `${af ? 'Dankie vir jou vertroue. Dit was ’n voorreg om deel van jou eiendomsreis te wees.' : 'Thank you for your trust. It was a privilege to be part of your property journey.'}\n${source.agentName}`
  }
  if (builder.template === 'review-request') {
    textFiles['gentle-reminder.txt'] =
      `${af ? 'Net ’n vriendelike uitnodiging om jou ervaring te deel, as jy wil. As jy reeds terugvoer gegee het, dankie.' : 'A gentle invitation to share your experience, if you would like to. If you have already shared feedback, thank you.'}\n${builder.details.reviewUrl}`
    textFiles['review-thank-you.txt'] = af
      ? 'Dankie dat jy tyd gemaak het om jou eerlike terugvoer te deel.'
      : 'Thank you for taking the time to share your honest feedback.'
  }
  if (builder.template === 'referral-request')
    textFiles['introduction-thank-you.txt'] =
      `${af ? 'Dankie vir die bekendstelling en vir jou vertroue in ons. Maak asseblief seker die persoon het ingestem voordat kontakbesonderhede gedeel word.' : 'Thank you for the introduction and for your trust in us. Please make sure the person has agreed before sharing contact details.'}\n${source.agentName}`
  const completedDesigns = designs.map((d) => ({
    width: 1080,
    height: 1080,
    kind: 'intro',
    photo: 0,
    ...d,
    note:
      builder.template === 'client-success' &&
      ['hero-post', 'carousel-1', 'story-1'].includes(d.id)
        ? `— ${builder.details.attribution}`
        : note,
  }))
  textFiles['READ-ME.txt'] =
    `${generalTemplate(builder.template).title}\n${completedDesigns.map((d) => `${d.label} (${d.width} × ${d.height})`).join('\n')}\n\nReview before sharing. Artwork may shorten text; complete wording is in the text files. Checklists are downloadable text files. No messages sent or scheduled.\nCampaign: ${campaign.name}\nRevision: ${campaign.revision}`
  return {
    campaign,
    builder,
    source,
    content,
    designs: completedDesigns,
    images:
      builder.template === 'key-handover' && builder.details.imageId
        ? current.images.filter((image) => image.id === builder.details.imageId)
        : image
          ? [{ id: 'portrait', url: image }]
          : [],
    logoUrl: current.source.logoUrl,
    allowNoPhoto:
      !config.portrait &&
      !(builder.template === 'key-handover' && builder.details.imageId),
    label: generalTemplate(builder.template).title,
    action,
    textFiles,
    general: true,
  }
}
