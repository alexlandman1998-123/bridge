import { reusablePlaybook } from './campaignPlaybookModel'
import { campaignShopTemplates } from './marketingCampaignCatalogue'

// Keep older starter links working, including the newsletter and milestone plans.
// Reusable plans contain draft content only, never recipients or delivery state.
export const campaignTemplates = [
  {
    id: 'sellers',
    title: 'Attract sellers',
    description: 'Turn homeowners into valuation requests.',
    angle: 'What is your home worth?',
    angleLabel: 'Valuation invitation',
    goal: 'seller_leads',
    name: 'Seller valuation campaign',
    objective: 'Generate valuation requests from local homeowners',
    audience: 'Homeowners in your area',
    offer: 'A complimentary property valuation',
    channels: ['meta', 'email', 'whatsapp'],
    mode: 'bounded',
    duration_days: 30,
  },
  {
    id: 'buyers',
    title: 'Find buyers',
    description: 'Build demand for your listings.',
    angle: 'Your next chapter starts here.',
    angleLabel: 'Property discovery',
    goal: 'buyer_leads',
    name: 'Find your next buyer',
    objective: 'Connect qualified buyers with available properties',
    audience: 'Buyers looking in your area',
    offer: 'Discover properties that match your needs',
    channels: ['email', 'whatsapp', 'meta'],
    mode: 'bounded',
    duration_days: 30,
  },
  {
    id: 'relationships',
    title: 'Stay connected',
    description: 'Keep past clients engaged.',
    angle: 'A little local insight. Just for you.',
    angleLabel: 'Client newsletter',
    goal: 'reengage',
    name: 'Clients for life',
    objective: 'Keep previous clients engaged and encourage referrals',
    audience: 'Previous buyers and sellers',
    offer: 'Helpful local market updates and personal check-ins',
    channels: ['email', 'whatsapp'],
    mode: 'ongoing',
  },
  {
    id: 'milestones',
    title: 'Celebrate milestones',
    description: 'Birthdays and home anniversaries.',
    angle: 'Another year. Still home.',
    angleLabel: 'A personal celebration',
    goal: 'reengage',
    name: 'Client milestones',
    objective:
      'Build lasting relationships through birthdays and home anniversaries',
    audience: 'Past clients with a recorded birthday or purchase anniversary',
    offer: 'A personal birthday or home anniversary message',
    channels: ['email', 'whatsapp'],
    mode: 'ongoing',
  },
  {
    id: 'new-listing',
    title: 'New listing launch',
    description: 'Introduce a property across your marketing channels.',
    angle: 'Just listed. Your next move?',
    angleLabel: 'Listing announcement',
    goal: 'promote_listing',
    name: 'New listing launch',
    objective:
      'Generate qualified enquiries and viewing requests for a new listing',
    audience: 'Buyers looking for a property like this listing',
    offer: 'Explore the property and book a viewing',
    channels: ['social', 'email', 'whatsapp'],
    mode: 'bounded',
    duration_days: 14,
    channel_content: {
      social: {
        title: 'Just listed: [property headline]',
        body: 'Discover [property address] in [suburb]. [Bedrooms] bedrooms · [bathrooms] bathrooms · [price].\n\n[One standout feature]. Explore the photos and arrange your viewing: [listing link]',
        timing:
          'Launch day; follow up with a property highlight later in the week',
      },
      email: {
        title: 'New listing in [suburb]: [property headline]',
        body: 'Hi [first name],\n\nA new property in [suburb] could be your next home.\n\n[property address]\n[Bedrooms] bedrooms · [bathrooms] bathrooms · [price]\n[Key features]\n\nView the listing and book a viewing: [listing link]\n\n[Agent name]',
        timing: 'Launch day, after selecting matching buyers in the email tool',
      },
      whatsapp: {
        title: 'New property introduction',
        body: 'Hi [first name], a new listing in [suburb] may interest you: [property headline], [price]. See the property here: [listing link]. Would you like to arrange a viewing? — [Agent name]',
        timing:
          'After launch, for selected contacts with permission to receive messages',
      },
    },
  },
]

// Plain-text starting copy. Placeholders are intentionally left for review.
const readyMadeCopy = {
  sellers: {
    meta: {
      title: 'What is your home worth?',
      body: 'Thinking of selling in [area]? Get a complimentary valuation and clear advice on your next move. Request your valuation: [enquiry link]',
      timing: 'During the campaign period; review audience and budget in Meta',
    },
    email: {
      title: 'Thinking about selling in [area]?',
      body: 'Hi [first name],\n\nWondering what your home could achieve in today’s market? I can help with a complimentary valuation and practical advice.\n\nRequest a valuation: [enquiry link]\n\n[Agent name]',
      timing: 'Weekly, after reviewing the audience in the email tool',
    },
    whatsapp: {
      title: 'Valuation invitation',
      body: 'Hi [first name], if you are considering a move in [area], I would be happy to arrange a complimentary valuation. Interested? [Agent name] · [enquiry link]',
      timing: 'For selected contacts with permission to receive messages',
    },
  },
  buyers: {
    email: {
      title: 'Your next home in [area]',
      body: 'Hi [first name],\n\nExplore our latest properties in [area]: [property links]\n\nTell me what you are looking for and I will help you arrange a viewing.\n\n[Agent name]',
      timing: 'After selecting matching buyers',
    },
    whatsapp: {
      title: 'Property match',
      body: 'Hi [first name], this property in [area] may suit your search: [listing link]. Would you like more details or a viewing? [Agent name]',
      timing: 'When a suitable property becomes available; send after review',
    },
    meta: {
      title: 'Your next chapter starts here',
      body: 'Find a place to call home in [area]. Explore [property highlight] and arrange a viewing: [listing link]',
      timing: 'During the campaign period; review audience and budget in Meta',
    },
  },
  relationships: {
    email: {
      title: 'A little local insight from [area]',
      body: 'Hi [first name],\n\nHere is what is happening in your local property market: [market update]\n\nIf you or someone you know needs property advice, I am here to help.\n\n[Agent name]',
      timing: 'Quarterly; create and schedule each update in the email tool',
    },
    whatsapp: {
      title: 'Personal check-in',
      body: 'Hi [first name], I hope you are enjoying your home. Just checking in — is there anything property-related I can help with? [Agent name]',
      timing: 'An occasional personal check-in, after reviewing the contact',
    },
  },
  milestones: {
    email: {
      title: 'A little celebration, [first name]',
      body: 'Hi [first name],\n\nWishing you a wonderful [birthday / home anniversary]. I hope the year ahead brings plenty of happy moments.\n\nWarm wishes,\n[Agent name]',
      timing:
        'On the milestone date; review and schedule manually until triggers are available',
    },
    whatsapp: {
      title: 'Birthday or home anniversary',
      body: 'Hi [first name], happy [birthday / home anniversary]! Wishing you a wonderful day. Warm wishes, [Agent name]',
      timing:
        'On the milestone date, for contacts with permission to receive messages',
    },
  },
}
for (const template of campaignTemplates) {
  if (readyMadeCopy[template.id])
    template.channel_content = readyMadeCopy[template.id]
}

// New routes use the launch catalogue; the first four starters remain available
// on the existing overview. Reuse their stable IDs rather than duplicating cards.
for (const template of campaignShopTemplates) {
  const existing = campaignTemplates.find((item) => item.id === template.id)
  if (existing) {
    const title = existing.title
    Object.assign(existing, template, { title })
  } else campaignTemplates.push(template)
}

export function validateChannelContent(
  content = {},
  channels = ['email', 'whatsapp', 'meta', 'social', 'chatgpt'],
) {
  if (!content || typeof content !== 'object' || Array.isArray(content))
    throw new Error('Use valid channel draft content.')
  const clean = {}
  for (const [channel, value] of Object.entries(content)) {
    if (
      !channels.includes(channel) ||
      !value ||
      typeof value !== 'object' ||
      Array.isArray(value)
    )
      throw new Error('Draft content must belong to a planned channel.')
    const draft = {}
    for (const [key, limit] of [
      ['title', 240],
      ['body', 12000],
      ['timing', 240],
    ]) {
      if (value[key] != null && typeof value[key] !== 'string')
        throw new Error('Draft content must be text.')
      draft[key] = String(value[key] || '').trim()
      if (draft[key].length > limit)
        throw new Error(`Shorten the channel ${key} before saving.`)
    }
    clean[channel] = draft
  }
  if (new TextEncoder().encode(JSON.stringify(clean)).length > 59000)
    throw new Error('Shorten the total draft content before saving.')
  return clean
}

export function templateFromCampaign(campaign) {
  const mode = campaign.end_date
    ? 'bounded'
    : campaign.start_date
      ? 'ongoing'
      : 'bounded'
  const duration =
    campaign.start_date && campaign.end_date
      ? Math.round(
          (new Date(`${campaign.end_date}T12:00:00Z`) -
            new Date(`${campaign.start_date}T12:00:00Z`)) /
            86400000,
        )
      : 30
  return {
    ...(campaign.playbook ? { playbook: reusablePlaybook(campaign.playbook, campaign.planned_channels) } : {}),
    name: campaign.name,
    goal: campaign.goal,
    objective: campaign.objective,
    ...(campaign.campaign_setup ? { campaign_setup: { ...campaign.campaign_setup, audienceId: '' } } : {}),
    audience: campaign.audience || '',
    offer: campaign.offer || '',
    area: campaign.area || '',
    cover_url: campaign.cover_url || '',
    channels: [...campaign.planned_channels],
    mode,
    duration_days: mode === 'bounded' ? Math.max(1, duration) : null,
    channel_content: validateChannelContent(
      campaign.channel_content || {},
      campaign.planned_channels,
    ),
  }
}
export function displayTemplate(record) {
  return {
    ...record,
    title: record.name,
    description: record.objective,
    channels: record.planned_channels,
    mode: record.run_mode,
  }
}
