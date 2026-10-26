import { httpsUrl, isUuid, text } from './metaIntegrationCore.js'
import { assertCampaignContacts, GENERAL_CONTACT_FIELDS } from './campaignContactProvenance.js'

const families = new Set(['sellers', 'thinking-of-selling', 'buyer-demand', 'buyers', 'first-time-buyer', 'meet-your-agent', 'client-success', 'key-handover', 'referral-request', 'client-check-in', 'market-update'])
const permissionFamilies = new Set(['buyer-demand', 'client-success', 'key-handover'])
const unresolved = /\{\{[^}]+\}\}|\{response\}|\[(?:first[ _]name|agent[ _]name|area|enquiry[ _]link|property[ _]links?|listing[ _]link|suburb)\]/i
const realDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value

// This boundary only projects reviewed public campaign fields. It does not
// generate copy, publish photos, load contacts or infer performance claims.
export function campaignFacebookSource(campaign, now = Date.now()) {
  const builder = campaign?.campaign_builder
  if (!isUuid(campaign?.id) || !Number.isSafeInteger(campaign.revision) || campaign.revision < 1 || campaign.status !== 'draft' || !families.has(builder?.template))
    throw new Error('Open a saved business campaign draft before posting to Facebook.')
  if (!campaign.planned_channels?.includes('social')) throw new Error('Add Social to this campaign before posting to Facebook.')
  assertCampaignContacts(builder, null, GENERAL_CONTACT_FIELDS)
  if (builder.reviewed !== true || !isUuid(builder.agentId) || !text(builder.source?.agencyName) || !text(builder.source?.agentName) || !text(builder.details?.area))
    throw new Error('Review and save the public business campaign details before posting.')
  if (permissionFamilies.has(builder.template) && builder.permission !== true)
    throw new Error('Confirm permission for this campaign’s public facts before posting.')
  if (builder.template === 'buyer-demand' && (!realDate(builder.details?.briefExpires) || Date.parse(`${builder.details.briefExpires}T23:59:59+02:00`) <= now))
    throw new Error('This buyer search expired. Refresh, review and save it before posting.')
  if (builder.template === 'market-update' && (!realDate(builder.details?.reportDate) || Date.parse(`${builder.details.reportDate}T00:00:00+02:00`) > now || !text(builder.details?.reportSource)))
    throw new Error('Review the market report source and publication date before posting.')
  const social = campaign.channel_content?.social
  const title = typeof social?.title === 'string' ? social.title : '', body = typeof social?.body === 'string' ? social.body : ''
  const includesHeadline = body === title || body.startsWith(`${title}\n\n`) || body.startsWith(`${title}\r\n\r\n`)
  const caption = includesHeadline ? body : `${title}\n\n${body}`
  if (!text(title) || !text(body) || caption.length > 5000 || unresolved.test(caption))
    throw new Error('Complete the saved Social wording, replace its placeholders and keep the Facebook post within 5,000 characters.')
  const destinations = []
  const response = campaign.playbook?.response
  if (response?.kind === 'url' && httpsUrl(response.value)) destinations.push({ key: 'response', label: text(response.label) || 'Campaign response link', url: httpsUrl(response.value) })
  const destination = httpsUrl(builder.source?.destination)
  if (destination) destinations.push({ key: 'campaign', label: 'Saved campaign destination', url: destination })
  return { caption, destinations, campaignRevision: campaign.revision }
}

export function publicCampaignFacebookPost(campaign, input = {}, now = Date.now()) {
  const source = campaignFacebookSource(campaign, now)
  const mode = input.mode || (source.destinations.length ? 'link' : 'text')
  if (!['text', 'link'].includes(mode)) throw new Error('Choose a text post or a saved campaign link.')
  const destination = mode === 'link' ? source.destinations.find(item => item.key === (input.destination || source.destinations[0]?.key)) : null
  if (mode === 'link' && !destination) throw new Error('Save a public HTTPS campaign destination or response link before choosing a link post.')
  return {
    campaignId: campaign.id, campaignRevision: campaign.revision,
    campaignName: text(campaign.name), template: campaign.campaign_builder.template,
    caption: source.caption, mode, link: destination?.url || '', destination: destination?.key || '',
    sourceUpdatedAt: text(campaign.updated_at),
  }
}
