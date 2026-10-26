import { assertCampaignContacts, GENERAL_CONTACT_FIELDS } from './campaignContactProvenance.js'
import { isUuid, text } from './metaIntegrationCore.js'

// Mirrors the business builder's public contact routing using the actor's RLS
// client. Raw source values remain separate from explicit campaign overrides.
export async function assertFreshCampaignFacebookContacts(actor, organisationId, campaign) {
  const builder = campaign?.campaign_builder
  if (!actor?.userDb || !isUuid(builder?.agentId)) throw new Error('The current public campaign contacts could not be checked.')
  const agencyResult = await actor.userDb.from('marketing_campaign_setup').select('confirmed_preferences').eq('organisation_id', organisationId).maybeSingle()
  if (agencyResult.error || !agencyResult.data?.confirmed_preferences) throw new Error('Confirm the current agency Campaign Setup before posting.')
  const agency = agencyResult.data.confirmed_preferences
  let agent
  if (builder.agentId === actor.userId) {
    const result = await actor.userDb.from('marketing_campaign_agent_setup').select('confirmed_preferences').eq('organisation_id', organisationId).eq('user_id', actor.userId).maybeSingle()
    if (result.error || !result.data?.confirmed_preferences) throw new Error('Confirm the current public agent Campaign Setup before posting.')
    agent = result.data.confirmed_preferences
  } else {
    const result = await actor.userDb.from('agency_public_intake_links').select('organisation_id,status,default_assigned_agent_id,metadata_json').eq('organisation_id', organisationId).eq('is_primary', false).eq('default_assigned_agent_id', builder.agentId).contains('metadata_json', { surface: 'agent_digital_card' }).order('status', { ascending: true }).order('updated_at', { ascending: false }).limit(1)
    const card = result.data?.[0]
    if (result.error || card?.status !== 'active' || card.organisation_id !== organisationId || card.default_assigned_agent_id !== builder.agentId || card.metadata_json?.surface !== 'agent_digital_card') throw new Error('This agent’s active public profile could not be checked in this agency.')
    agent = card.metadata_json.agentDigitalCard?.agent || {}
  }
  const route = ['sellers', 'thinking-of-selling', 'buyer-demand'].includes(builder.template) ? 'seller' : ['buyers', 'first-time-buyer'].includes(builder.template) ? 'buyer' : 'agent'
  const routing = route === 'agent' ? 'agent' : agency[`${route}Destination`]
  const destination = routing === 'link' ? agency[`${route}Url`] : routing === 'agency' ? [agency.agencyEmail, agency.agencyPhone].filter(Boolean).join(' · ') : [agent.email, agent.phone].filter(Boolean).join(' · ')
  assertCampaignContacts(builder, { agentName: text(agent.name), destination: text(destination) }, GENERAL_CONTACT_FIELDS)
  if (text(builder.source?.agencyName) !== text(agency.agencyName)) throw new Error('The agency name changed. Refresh, review and save the campaign before posting.')
}
