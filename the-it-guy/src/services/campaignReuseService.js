import { supabase } from '../lib/supabaseClient'
import { loadAgencyAgentCardLink } from './agencyPublicIntakeLinkService'
import { campaignPayload } from './marketingCampaignService'
import { reusablePlaybook, responseDestination, cleanCampaignPlaybook, createCampaignPlaybook } from './campaignPlaybookModel'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
export async function loadCampaignAgentIdentity(organisationId, agentId) {
  const { link } = await loadAgencyAgentCardLink({ organisationId, agentUserId: agentId })
  if (!link || link.status !== 'active' || link.organisationId !== organisationId || link.defaultAssignedAgentId !== agentId) return null
  return { ...link.agentDigitalCard?.agent, areas: link.agentDigitalCard?.profile?.serviceAreas || [] }
}

export function personaliseCampaignForAgent(source, { name, area, agentName, response, sourceOwnerName = '', sourceOwnerEmail = '', startDate = '', endDate = '' }) {
  if (!agentName?.trim() || agentName.trim().length > 120 || !area?.trim()) throw new Error('Add the agent’s public name and service area.')
  const destination = responseDestination(response)
  const identity = source.campaign_builder?.source || source.listing_builder?.source || {}
  const replacements = new Map([
    [source.area, area.trim()], [source.campaign_builder?.details?.area, area.trim()],
    [identity.agentName || sourceOwnerName, agentName.trim()], [identity.agentEmail || sourceOwnerEmail, response.value], [identity.agentPhone, response.value], [identity.destination, destination],
    [source.playbook?.response?.value, destination],
    ['{agentName}', agentName.trim()], ['{area}', area.trim()],
  ].filter(([from]) => from))
  const adapt = (value = '') => {
    // Replace original values simultaneously so new area/name values are not replaced again.
    const keys = [...replacements.keys()].sort((a, b) => b.length - a.length)
    if (!keys.length) return value
    const pattern = keys.map((key) => key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
    return String(value).replace(new RegExp(`(?<![\\p{L}\\p{N}_])(?:${pattern})(?![\\p{L}\\p{N}_])`, 'gu'), (match) => replacements.get(match))
  }
  const sign = (body, includeDestination = true) => {
    const adapted = adapt(body)
    return [adapted, !adapted.includes(agentName.trim()) ? agentName.trim() : '', includeDestination && !adapted.includes(destination) ? destination : ''].filter(Boolean).join('\n\n')
  }
  const content = Object.fromEntries((source.planned_channels || []).map((channel) => [channel, { title: adapt(source.channel_content?.[channel]?.title || name), body: sign(source.channel_content?.[channel]?.body || source.offer || source.objective), timing: '' }]))
  const reusable = reusablePlaybook(source.playbook || createCampaignPlaybook(source), source.planned_channels)
  const playbook = reusable ? cleanCampaignPlaybook({ ...reusable, response: { ...response }, steps: reusable.steps.map((step) => ({ ...step, title: adapt(step.title), body: sign(step.body, false) })), followUp: reusable.followUp.map((item) => ({ ...item, title: adapt(item.title) })) }, source.planned_channels) : null
  const plan = campaignPayload({ name: name?.trim(), goal: source.goal, objective: adapt(source.objective), audience: adapt(source.audience), offer: adapt(source.offer), area: area.trim(), start_date: startDate || null, end_date: endDate || null, status: 'draft', planned_channels: source.planned_channels, channel_content: content, ...(playbook ? { playbook } : {}) })
  return Object.fromEntries(['name', 'objective', 'audience', 'offer', 'area', 'start_date', 'end_date', 'channel_content', ...(playbook ? ['playbook'] : [])].map((key) => [key, plan[key]]))
}

export async function copyCampaignToAgent({ organisationId, source, targetId, requestId, draft }, { client = supabase } = {}) {
  if (!client || ![organisationId, source?.id, targetId, requestId].every((id) => uuid.test(id || '')) || source.organisation_id !== organisationId || !Number.isInteger(source.revision)) throw new Error('Choose a saved campaign and an active agent in this agency.')
  const portable = Object.fromEntries(['name', 'objective', 'audience', 'offer', 'area', 'start_date', 'end_date', 'channel_content', 'playbook'].filter((key) => Object.hasOwn(draft, key)).map((key) => [key, draft[key]]))
  const plan = campaignPayload({ ...portable, goal: source.goal, planned_channels: source.planned_channels, status: 'draft' })
  const safe = Object.fromEntries(['name', 'objective', 'audience', 'offer', 'area', 'start_date', 'end_date', 'channel_content', ...(plan.playbook ? ['playbook'] : [])].map((key) => [key, plan[key]]))
  const { data, error } = await client.rpc('marketing_campaign_copy', { p_org: organisationId, p_source: source.id, p_revision: source.revision, p_target: targetId, p_id: requestId, p_draft: safe })
  if (error) {
    if (['PGRST202', '42883', '42703', 'PGRST204'].includes(error.code)) throw new Error('Copying campaigns to agents is not enabled in this workspace yet. Your reviewed copy is still here.')
    throw new Error(error.message || 'The campaign could not be copied. Keep this window open and try again.')
  }
  const saved = Array.isArray(data) ? data[0] : data
  if (!saved || saved.id !== requestId || saved.organisation_id !== organisationId || saved.created_by !== targetId || saved.copied_from_id !== source.id || saved.copied_from_revision !== source.revision) throw new Error('The copy could not be confirmed. Keep this window open and retry before starting another copy.')
  return saved
}
