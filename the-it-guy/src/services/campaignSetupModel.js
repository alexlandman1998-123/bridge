export const CAMPAIGN_SETUP_VERSION = 1
export const CAMPAIGN_TONES = ['Warm and approachable', 'Professional and clear', 'Premium and understated']
export const CAMPAIGN_LANGUAGES = ['en-ZA', 'af-ZA', 'zu-ZA', 'xh-ZA', 'st-ZA', 'tn-ZA', 'nso-ZA', 'ts-ZA', 'ss-ZA', 've-ZA', 'nr-ZA']
export const CAMPAIGN_SERVICES = ['Sales', 'Rentals', 'Short-term rentals', 'Commercial property', 'Developments']
export const CAMPAIGN_STRENGTHS = ['Local knowledge', 'Personal service', 'First-time buyer support', 'Investment expertise', 'Luxury property', 'Rental expertise']
export const CAMPAIGN_OFFERS = ['Property valuation', 'Complimentary property valuation', 'Selling consultation']
export const CAMPAIGN_ROUTES = ['agent', 'agency', 'link']

const text = (value) => String(value ?? '').trim()
export const setupList = (value) => [...new Set((Array.isArray(value) ? value : text(value).split(/[,\n]/)).map(text).filter(Boolean))]
const sharedStrings = ['agencyName', 'logoUrl', 'primaryColor', 'secondaryColor', 'accentColor', 'agencyEmail', 'agencyPhone', 'website', 'about', 'language', 'tone', 'avoid', 'buyerDestination', 'sellerDestination', 'buyerUrl', 'sellerUrl', 'reviewUrl']
const sharedLists = ['services', 'serviceAreas', 'strengths', 'offers']
const agentStrings = ['name', 'title', 'photoUrl', 'email', 'phone', 'whatsapp', 'bio']
const agentLists = ['serviceAreas', 'specialties', 'languages']

export function cleanSetupPreferences(input = {}, kind = 'agency') {
  const strings = kind === 'agency' ? sharedStrings : agentStrings
  const lists = kind === 'agency' ? sharedLists : agentLists
  const result = Object.fromEntries(strings.map((key) => [key, text(input[key])]))
  for (const key of lists) result[key] = setupList(input[key])
  if (kind === 'agency') {
    for (const key of ['agencyConfirmed', 'styleConfirmed', 'routingConfirmed']) result[key] = input[key] === true
  } else result.detailsConfirmed = input.detailsConfirmed === true
  return result
}

// This is a marketing-only projection: no seller facts, identity numbers,
// financial details, auth metadata or delivery credentials enter the snapshot.
export function buildCampaignSetupSources({ organisationId, organisationContext, workspace = {}, profile = {}, sources = {} }) {
  const context = organisationContext || {}
  const scoped = text(context.organisation?.organisationId || context.organisation?.id) === organisationId
  const organisation = scoped ? context.organisation || {} : {}
  const settings = scoped ? context.organisationSettings || {} : {}
  const onboarding = scoped ? context.onboarding || settings.agencyOnboarding || {} : {}
  const info = onboarding.agencyInformation || {}
  const branding = onboarding.branding || {}
  const colours = branding.brandColours || {}
  const savedProfile = { ...profile, ...Object.fromEntries(Object.entries(sources.profile || {}).filter(([, value]) => value !== null && value !== undefined && value !== '')) }
  const card = sources.card?.status === 'active' ? sources.card.agentDigitalCard || {} : {}
  const agent = card.agent || {}
  const cardProfile = card.profile || {}
  const extras = sources.organisation || {}
  const agencyAreas = setupList(extras.active_areas).length ? extras.active_areas : organisation.activeAreas
  const serviceAreas = setupList(agencyAreas).length ? agencyAreas : cardProfile.serviceAreas
  const services = []
  const lines = setupList(info.businessLines || info.businessFocus)
  if (lines.some((line) => ['sales', 'sales_rentals'].includes(line))) services.push('Sales')
  if (lines.some((line) => ['rentals', 'sales_rentals'].includes(line))) services.push('Rentals')
  if (lines.includes('short_term_rentals')) services.push('Short-term rentals')
  if (['commercial', 'mixed'].includes(info.agencyType)) services.push('Commercial property')
  const shared = cleanSetupPreferences({
    agencyName: info.tradingName || info.agencyName || organisation.displayName || organisation.name || workspace.name,
    logoUrl: context.branding?.logoUrl && scoped ? context.branding.logoUrl : branding.logoLight || branding.logoDark || organisation.logoUrl,
    primaryColor: colours.primary,
    secondaryColor: colours.secondary,
    accentColor: colours.accent,
    agencyEmail: info.mainEmailAddress || organisation.companyEmail,
    agencyPhone: info.mainOfficeNumber || organisation.companyPhone,
    website: info.website || organisation.website,
    about: settings.partnerProfileContent?.agency?.aboutCompany || organisation.settingsJson?.partnerProfileContent?.agency?.aboutCompany || settings.partnerProfileContent?.agency?.serviceDelivery || organisation.settingsJson?.partnerProfileContent?.agency?.serviceDelivery,
    services,
    serviceAreas,
    strengths: setupList(setupList(extras.specialties).length ? extras.specialties : organisation.specialties).slice(0, 3),
    language: CAMPAIGN_LANGUAGES.includes(savedProfile.language) ? savedProfile.language : ({ en: 'en-ZA', af: 'af-ZA' }[savedProfile.language] || ''),
    buyerDestination: sources.intake?.status === 'active' && sources.intake.enabledIntents?.includes('buy') ? 'link' : 'agent',
    sellerDestination: sources.intake?.status === 'active' && sources.intake.enabledIntents?.includes('sell') ? 'link' : 'agent',
    buyerUrl: sources.buyerUrl,
    sellerUrl: sources.sellerUrl,
  })
  const personal = cleanSetupPreferences({
    name: agent.name || savedProfile.full_name || savedProfile.fullName || [savedProfile.first_name || savedProfile.firstName, savedProfile.last_name || savedProfile.lastName].filter(Boolean).join(' '),
    title: agent.jobTitle || savedProfile.title,
    photoUrl: agent.avatarUrl || savedProfile.avatar_url || savedProfile.avatarUrl,
    email: agent.email || savedProfile.email,
    phone: agent.phone || savedProfile.phone_number || savedProfile.phoneNumber,
    // A phone number is not proof of a WhatsApp account.
    whatsapp: agent.whatsapp,
    bio: savedProfile.bio,
    specialties: cardProfile.specialties,
    serviceAreas: cardProfile.serviceAreas,
    languages: cardProfile.languages,
  }, 'agent')
  // Older profiles may contain incomplete links or long biographies. Present
  // usable public excerpts and ask for invalid/missing links instead of making
  // an unrelated old field prevent saving the campaign setup snapshot.
  for (const preferences of [shared, personal]) {
    for (const key of Object.keys(preferences)) {
      const value = preferences[key]
      if (typeof value === 'string') preferences[key] = value.slice(0, ['about', 'bio', 'avoid'].includes(key) ? 2000 : 2048)
      if (Array.isArray(value)) preferences[key] = value.slice(0, key === 'serviceAreas' ? 100 : 20).map((item) => item.slice(0, 120))
    }
    for (const key of ['logoUrl', 'website', 'buyerUrl', 'sellerUrl', 'reviewUrl', 'photoUrl']) {
      if (!preferences[key]) continue
      try { const url = new URL(preferences[key]); if (url.protocol !== 'https:' || url.username || url.password) preferences[key] = '' }
      catch { preferences[key] = '' }
    }
    for (const key of ['primaryColor', 'secondaryColor', 'accentColor']) if (preferences[key] && !/^#[0-9a-f]{6}$/i.test(preferences[key])) preferences[key] = ''
    for (const key of ['agencyEmail', 'email']) if (preferences[key] && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(preferences[key])) preferences[key] = ''
  }
  return {
    agency: shared,
    agent: personal,
    labels: {
      agency: scoped ? 'Saved agency settings — confirm any suggested defaults' : 'Active workspace — confirm these details',
      serviceAreas: setupList(agencyAreas).length ? 'Saved agency service areas' : 'Suggested from your agent digital card',
      language: savedProfile.language ? 'Suggested from your account language' : 'Choose a campaign language',
      agent: card.agent ? 'Your saved digital card and account profile' : 'Your saved account profile',
    },
  }
}

function sourceIdentity(value) {
    if (typeof value !== 'string') return JSON.stringify(value ?? '')
    try {
      const url = new URL(value)
      if (url.pathname.includes('/storage/v1/object/sign/')) return url.origin + url.pathname
    } catch { /* Ordinary text fields are compared as text. */ }
    return JSON.stringify(value)
}

export function prefillCampaignSetup(record, source = {}, kind = 'agency') {
  const preferences = { ...source, ...(record?.preferences || {}) }
  for (const key of kind === 'agency' ? ['logoUrl'] : ['photoUrl']) {
    const savedSource = record?.source_snapshot?.[key]
    if (savedSource && source[key] && sourceIdentity(preferences[key]) === sourceIdentity(savedSource) && sourceIdentity(source[key]) === sourceIdentity(savedSource)) preferences[key] = source[key]
  }
  return preferences
}

export function changedSetupSources(record, current) {
  if (!record?.source_snapshot) return []
  return Object.keys(current).filter((key) => !key.endsWith('Confirmed') &&
    sourceIdentity(record.source_snapshot[key]) !== sourceIdentity(current[key]))
}

export function validateCampaignSetup(input, { kind = 'agency', complete = false } = {}) {
  const p = cleanSetupPreferences(input, kind)
  const errors = []
  for (const [key, value] of Object.entries(p)) {
    if (typeof value === 'string' && value.length > (['about', 'bio', 'avoid'].includes(key) ? 2000 : 2048)) errors.push(`Shorten ${key}.`)
    if (Array.isArray(value) && (value.length > (key === 'serviceAreas' ? 100 : 20) || value.some((item) => item.length > 120))) errors.push(`Shorten ${key}.`)
  }
  for (const key of kind === 'agency' ? ['logoUrl', 'website', 'buyerUrl', 'sellerUrl', 'reviewUrl'] : ['photoUrl']) {
    if (p[key]) {
      try {
        const url = new URL(p[key])
        if (url.protocol !== 'https:' || url.username || url.password) throw new Error()
      } catch { errors.push(`Use a valid HTTPS link for ${key}.`) }
    }
  }
  for (const key of kind === 'agency' ? ['agencyEmail'] : ['email']) {
    if (p[key] && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p[key])) errors.push('Use a valid email address.')
  }
  if (kind === 'agency') {
    for (const key of ['primaryColor', 'secondaryColor', 'accentColor']) {
      if (p[key] && !/^#[0-9a-f]{6}$/i.test(p[key])) errors.push('Use six-digit hex brand colours, such as #274C69.')
    }
    if (p.services.some((v) => !CAMPAIGN_SERVICES.includes(v))) errors.push('Choose supported services.')
    if (p.offers.some((v) => !CAMPAIGN_OFFERS.includes(v))) errors.push('Choose supported offers.')
    if (p.strengths.length > 3) errors.push('Choose up to three agency strengths.')
    if (p.language && !CAMPAIGN_LANGUAGES.includes(p.language)) errors.push('Choose a campaign language.')
    if (p.tone && !CAMPAIGN_TONES.includes(p.tone)) errors.push('Choose a campaign tone.')
    for (const prefix of ['buyer', 'seller']) {
      const route = p[`${prefix}Destination`]
      if (route && !CAMPAIGN_ROUTES.includes(route)) errors.push('Choose a supported enquiry destination.')
      if (complete && route === 'link' && !p[`${prefix}Url`]) errors.push(`Add the ${prefix} enquiry link.`)
      if (complete && route === 'agency' && !p.agencyEmail && !p.agencyPhone) errors.push('Add an agency email or phone number for agency enquiries.')
    }
    if (complete) {
      if (!p.agencyName) errors.push('Add the public agency name.')
      if (!p.services.length) errors.push('Confirm the agency services.')
      if (!p.serviceAreas.length) errors.push('Add at least one service area.')
      if (!p.language || !p.tone) errors.push('Choose the campaign language and tone.')
      if (!p.buyerDestination || !p.sellerDestination) errors.push('Choose the buyer and seller enquiry destinations.')
      if (!p.agencyConfirmed || !p.styleConfirmed || !p.routingConfirmed) errors.push('Confirm each setup section.')
    }
  } else if (complete) {
    if (!p.name) errors.push('Add your public name.')
    if (!p.email && !p.phone) errors.push('Add a public email or phone number.')
    if (!p.detailsConfirmed) errors.push('Confirm your public agent details.')
  }
  return errors
}

export function setupCaption(preferences, agent = {}) {
  const area = preferences.serviceAreas?.[0] || 'your area'
  const name = agent.name || 'Your agency team'
  const opening = preferences.language === 'af-ZA'
    ? `Beplan jy jou volgende eiendomskuif in ${area}?`
    : preferences.language === 'en-ZA'
      ? `${preferences.tone === 'Premium and understated' ? 'A considered approach to your next move' : preferences.tone === 'Professional and clear' ? 'Plan your next property move' : 'Let’s find your next chapter'} in ${area}.`
      : ''
  return opening ? `${opening}\n${name} · ${preferences.agencyName || 'Your agency'}\n${preferences.language === 'af-ZA' ? 'Kontak ons om jou planne te bespreek.' : 'Get in touch to discuss your plans.'}` : 'A branded example will use your selected language when campaign content generation is connected.'
}
