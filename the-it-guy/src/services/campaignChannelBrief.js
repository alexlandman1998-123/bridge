import { validateChannelContent } from './marketingCampaignTemplates'
import { metaCampaignObjective } from './campaignSetupModel'

const labels = {
  whatsapp: 'WhatsApp',
  meta: 'Meta ads',
  chatgpt: 'ChatGPT Ads',
  social: 'Organic social',
}
export function checkedChannelCopyPack(campaign, channel) {
  if (!Object.hasOwn(labels, channel))
    throw new Error('Choose WhatsApp, Meta ads, ChatGPT Ads or Organic social.')
  if (!campaign?.planned_channels?.includes(channel))
    throw new Error(
      `Add ${labels[channel]} to the saved campaign before preparing its draft.`,
    )
  const content = validateChannelContent(
    campaign.channel_content || {},
    campaign.planned_channels,
  )
  if (!content[channel]?.body?.trim())
    throw new Error(
      `Add a ${labels[channel]} message in Edit campaign, then save before preparing its draft.`,
    )
  return { campaign, content, copyOnly: true }
}
function imageReference(value) {
  if (!value) return ''
  try {
    const url = new URL(value)
    if (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !/\s/.test(value)
    )
      return url.href
  } catch {
    /* An unavailable image must not block exporting saved wording. */
  }
  return ''
}
export function campaignChannelBrief(campaign, channel) {
  if (!['meta', 'social', 'chatgpt'].includes(channel))
    throw new Error('Choose Meta ads, ChatGPT Ads or Organic social.')
  const { content } = checkedChannelCopyPack(campaign, channel)
  const copy = content[channel]
  // Deliberately omit recipients, builder snapshots, internal ownership and provider credentials.
  return {
    campaign: String(campaign.name || '').trim(),
    revision: campaign.revision,
    channel: labels[channel],
    headline: copy.title,
    message: copy.body,
    timing: copy.timing,
    objective: String(campaign.objective || ''),
    ...(channel === 'meta' ? { metaObjective: metaCampaignObjective(campaign) } : {}),
    target: String(campaign.campaign_setup?.target || ''),
    goal: String(campaign.campaign_setup?.customGoal || ''),
    placeId: String(campaign.campaign_setup?.placeId || ''),
    audience: String(campaign.audience || ''),
    offer: String(campaign.offer || ''),
    area: String(campaign.area || ''),
    startDate: campaign.start_date || '',
    endDate: campaign.end_date || '',
    plannedBudget:
      campaign.planned_budget == null || campaign.planned_budget === ''
        ? ''
        : `${campaign.budget_currency || 'ZAR'} ${campaign.planned_budget}`,
    imageUrl: imageReference(campaign.cover_url),
  }
}
export function campaignChannelBriefText(brief) {
  return [
    `${brief.channel} · ${brief.campaign}`,
    `Campaign revision: ${brief.revision}`,
    '',
    'HEADLINE',
    brief.headline || 'To be added',
    '',
    'MESSAGE',
    brief.message,
    '',
    'CAMPAIGN BRIEF',
    `Objective: ${brief.objective || 'To be defined'}`,
    ...(brief.metaObjective ? [`Meta objective: ${brief.metaObjective}`] : []),
    ...(brief.target ? [`Target: ${brief.target}`] : []),
    ...(brief.goal ? [`Business goal: ${brief.goal}`] : []),
    ...(brief.placeId ? [`Google place ID: ${brief.placeId}`] : []),
    `Audience: ${brief.audience || 'To be defined'}`,
    `Offer: ${brief.offer || 'To be defined'}`,
    `Area: ${brief.area || 'Any area'}`,
    `Dates: ${brief.startDate || 'To be confirmed'} — ${brief.endDate || 'Ongoing'}`,
    `Suggested timing: ${brief.timing || 'To be confirmed'}`,
    `Campaign planned budget: ${brief.plannedBudget || 'Not set'}`,
    `Image reference: ${brief.imageUrl || 'Choose artwork in the publishing tool'}`,
    '',
    'Prepare and publish in your channel tool. This export does not create an ad, spend budget, publish a post or connect results.',
  ].join('\n')
}
