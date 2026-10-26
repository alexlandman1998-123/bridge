import { cleanCampaignPlaybook, responseDestination, createCampaignPlaybook, playbookResponsePlaceholder } from './campaignPlaybookModel'
import { saveMarketingCampaign } from './marketingCampaignService'

export function campaignResponsePlaybook(campaign, link) {
  if (!link?.url || link.status !== 'active' || link.campaignRevision !== campaign.revision)
    throw new Error('Create or reload an active response link for this saved campaign revision.')
  responseDestination({ kind: 'url', value: link.url })
  const book = campaign.playbook
    ? cleanCampaignPlaybook(campaign.playbook, campaign.planned_channels)
    : createCampaignPlaybook(campaign)
  const previous = responseDestination(book.response)
  return {
    ...book, sourceRevision: campaign.revision + 1,
    response: { kind: 'url', value: link.url, label: ({ valuation: 'Request a valuation', seller: 'Discuss selling your property', buyer: 'Tell us what you are looking for', referral: 'Make your own property enquiry' })[link.purpose] || 'Get in touch' },
    steps: book.steps.map((step) => ({ ...step, body: (book.response.kind === 'reply' ? step.body : playbookResponsePlaceholder(step.body, previous, book.response.label)).replaceAll(`${book.response.label}: {response}`, '{response}') })),
  }
}

export async function applyCampaignResponseToPlaybook(campaign, link) {
  const input = { ...campaign, playbook: campaignResponsePlaybook(campaign, link) }
  if (input.campaign_setup == null) delete input.campaign_setup
  return saveMarketingCampaign(campaign.organisation_id, input, campaign)
}
