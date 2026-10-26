import { supabase } from '../lib/supabaseClient'
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
export const AUDIENCE_FIELDS = { role: 'Contact / lead type', stage: 'Lead stage', area: 'Area', owner: 'Responsible agent', tags: 'Tags', budget: 'Budget' }
export const emptyAudienceDefinition = () => ({ match: 'all', rules: [{ field: 'role', operator: 'in', values: ['buyer'] }], excludeClosed: true, quietDays: 0 })
export function validateAudienceDefinition(definition) {
  if (!definition || !['all', 'any'].includes(definition.match) || typeof definition.excludeClosed !== 'boolean' || !Number.isInteger(definition.quietDays) || definition.quietDays < 0 || definition.quietDays > 365 || !Array.isArray(definition.rules) || !definition.rules.length || definition.rules.length > 12) throw new Error('Complete the audience rules and choose a quiet period from 0 to 365 days.')
  for (const rule of definition.rules) {
    if (!Object.hasOwn(AUDIENCE_FIELDS, rule.field) || !Array.isArray(rule.values) || !rule.values.length || rule.values.length > 10 || rule.values.some((value) => typeof value !== 'string' || !value.trim() || value.length > 120)) throw new Error('Choose a field and at least one value for every rule.')
    if (rule.field === 'budget' ? !['gte', 'lte'].includes(rule.operator) || rule.values.length !== 1 || !/^\d{1,15}(\.\d{1,2})?$/.test(rule.values[0]) : !['in', 'not_in', 'contains'].includes(rule.operator)) throw new Error('Choose a valid comparison and value.')
    if (rule.field === 'owner' && (!['in', 'not_in'].includes(rule.operator) || rule.values.some((value) => !['me', 'unassigned'].includes(value) && !uuid.test(value)))) throw new Error('Choose Me, Unassigned or an agent from the directory.')
  }
  return definition
}
function scope(org, client) { if (!client || !uuid.test(org || '')) throw new Error('Choose an agency workspace first.') }
function failure(error) {
  if (['42P01', 'PGRST205', 'PGRST202', '42883'].includes(error?.code)) return new Error('Shared CRM audiences are not enabled in this workspace yet.')
  return new Error(error?.message || 'The audience could not be loaded. Please try again.')
}
async function result(query) { const response = await query; if (response.error) throw failure(response.error); return response.data }
export async function loadMarketingAudiences(org, search = '', offset = 0, { client = supabase } = {}) {
  scope(org, client)
  return result(client.rpc('marketing_audience_library', { p_org: org, p_search: search.trim().slice(0, 120), p_offset: offset }))
}
export async function saveMarketingAudience(org, draft, { client = supabase } = {}) {
  scope(org, client); validateAudienceDefinition(draft.definition)
  const name = String(draft.name || '').trim(), description = String(draft.description || '').trim()
  if (!name || name.length > 120 || description.length > 600 || !['personal', 'agency'].includes(draft.visibility)) throw new Error('Add an audience name, description of up to 600 characters and visibility.')
  const payload = { name, description, definition: draft.definition, visibility: draft.visibility }
  const data = await result(draft.id ? client.from('marketing_audiences').update({ ...payload, revision: draft.revision + 1 }).eq('organisation_id', org).eq('id', draft.id).eq('revision', draft.revision).is('archived_at', null).select().maybeSingle() : client.from('marketing_audiences').insert({ ...payload, organisation_id: org }).select().single())
  if (!data?.id) throw new Error('This audience changed or is no longer editable. Refresh before saving.')
  return data
}
export async function archiveMarketingAudience(org, audience, { client = supabase } = {}) {
  scope(org, client)
  const data = await result(client.from('marketing_audiences').update({ archived_at: new Date().toISOString(), revision: audience.revision + 1 }).eq('organisation_id', org).eq('id', audience.id).eq('revision', audience.revision).select('id').maybeSingle())
  if (!data?.id) throw new Error('This audience changed. Refresh before archiving.')
}
export async function previewMarketingAudience({ organisationId, audience, definition, channel = 'crm', subscriptionId = null, offset = 0, resolve = false, reviewHash = null }, { client = supabase } = {}) {
  scope(organisationId, client)
  if (!audience) validateAudienceDefinition(definition)
  if (resolve && (!audience?.id || !reviewHash || channel === 'crm')) throw new Error('Preview and review a saved audience first.')
  const data = await result(client.rpc('marketing_audience_preview', { p_org: organisationId, p_audience: audience?.id || null, p_definition: audience ? null : definition, p_channel: channel, p_subscription: subscriptionId || null, p_offset: offset, p_revision: resolve ? audience?.revision || null : null, p_review_hash: reviewHash, p_resolve: resolve }))
  if (resolve && (!Array.isArray(data?.recipientIds) || !data.recipientIds.length || data.recipientIds.some((id) => !uuid.test(id)) || data.audienceId !== audience.id || data.revision !== audience.revision)) throw new Error('The reviewed recipient selection could not be confirmed. Refresh the audience.')
  return data
}
export async function loadCampaignAudience(org, campaignId, { client = supabase } = {}) {
  scope(org, client)
  const link = await result(client.from('marketing_campaign_audiences').select('audience_id').eq('organisation_id', org).eq('campaign_id', campaignId).maybeSingle())
  if (!link) return null
  const audience = await result(client.from('marketing_audiences').select('*').eq('organisation_id', org).eq('id', link.audience_id).maybeSingle())
  return audience ? { ...audience, archived: Boolean(audience.archived_at) } : null
}
export async function attachCampaignAudience(org, campaignId, audienceId, { client = supabase } = {}) {
  scope(org, client)
  if (!uuid.test(campaignId) || (audienceId && !uuid.test(audienceId))) throw new Error('Choose a saved campaign and audience.')
  if (!audienceId) { await result(client.from('marketing_campaign_audiences').delete().eq('organisation_id', org).eq('campaign_id', campaignId)); return }
  const existing = await result(client.from('marketing_campaign_audiences').select('audience_id').eq('organisation_id', org).eq('campaign_id', campaignId).maybeSingle())
  const query = existing
    ? client.from('marketing_campaign_audiences').update({ audience_id: audienceId, updated_at: new Date().toISOString() }).eq('organisation_id', org).eq('campaign_id', campaignId).eq('audience_id', existing.audience_id).select('audience_id').maybeSingle()
    : client.from('marketing_campaign_audiences').insert({ organisation_id: org, campaign_id: campaignId, audience_id: audienceId }).select('audience_id').single()
  const data = await result(query)
  if (data?.audience_id !== audienceId) throw new Error('The campaign audience could not be confirmed.')
}
