import { loadHandoverContext } from './handoverCampaignService'
import { loadCampaignSetup } from './campaignSetupService'
import { loadAgencyAgentCardLink } from './agencyPublicIntakeLinkService'
import {
  GENERAL_CAMPAIGNS,
  generalDefaults,
  generalSourceKeys,
} from './generalCampaignModel'

export async function loadGeneralCampaignContext(
  organisationId,
  userId,
  template,
  agentId = userId,
  details = {},
) {
  if (!GENERAL_CAMPAIGNS[template])
    throw new Error('Choose a supported campaign template.')
  const setup = await loadCampaignSetup(organisationId, { userId })
  const agency = setup.agency?.confirmed_preferences
  if (!agency)
    throw new Error('Finish Campaign Setup before building this campaign.')
  let agent = setup.agent?.confirmed_preferences
  if (agentId !== userId) {
    const { link } = await loadAgencyAgentCardLink({
      organisationId,
      agentUserId: agentId,
    })
    if (
      link?.status !== 'active' ||
      link.organisationId !== organisationId ||
      link.defaultAssignedAgentId !== agentId
    )
      throw new Error(
        'This agent’s public profile is no longer available in this agency.',
      )
    const person = link.agentDigitalCard?.agent || {}
    agent = {
      name: person.name,
      title: person.jobTitle,
      email: person.email,
      phone: person.phone,
      photoUrl: person.avatarUrl,
      serviceAreas: link.agentDigitalCard?.profile?.serviceAreas,
    }
  }
  if (!agent)
    throw new Error(
      'Confirm your public agent details in Campaign Setup first.',
    )
  const route = GENERAL_CAMPAIGNS[template].route
  const routing = route === 'agent' ? 'agent' : agency[`${route}Destination`]
  const destination =
    routing === 'link'
      ? agency[`${route}Url`]
      : routing === 'agency'
        ? [agency.agencyEmail, agency.agencyPhone].filter(Boolean).join(' · ')
        : [agent.email, agent.phone].filter(Boolean).join(' · ')
  const raw = {
    reviewUrl: agency.reviewUrl,
    agencyName: agency.agencyName,
    agentName: agent.name,
    agentTitle: agent.title,
    agentBio: agent.bio,
    destination,
    serviceAreas: [
      ...(agent.serviceAreas || []),
      ...(agency.serviceAreas || []),
    ]
      .filter((v, i, a) => a.indexOf(v) === i)
      .join(', '),
    language: agency.language,
    setupLanguage: agency.language,
    tone: agency.tone,
    primaryColor: agency.primaryColor,
    logoUrl: agency.logoUrl,
    photoUrl: GENERAL_CAMPAIGNS[template].portrait ? agent.photoUrl : '',
  }
  const handover =
    template === 'key-handover'
      ? await loadHandoverContext(organisationId, userId, details)
      : {}
  return {
    ...handover,
    agentId,
    source: Object.fromEntries(
      generalSourceKeys(template).map((key) => [
        key,
        String(raw[key] || '').trim(),
      ]),
    ),
    defaults: generalDefaults(template, agency, agent),
    areas: [
      ...new Set([
        ...(agent.serviceAreas || []),
        ...(agency.serviceAreas || []),
      ]),
    ],
  }
}
