import { aiCampaignAction } from './aiCampaignService'

export function crmFollowUpAction(organisationId, action, input, options = {}) {
  if (!['brief', 'check', 'generate'].includes(action)) throw new Error('Choose a supported follow-up action.')
  return aiCampaignAction(organisationId, `crm_follow_up_${action}`, input, options)
}
