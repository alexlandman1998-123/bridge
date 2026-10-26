import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'
import { campaignPayload } from './marketingCampaignService'
import { validateChannelContent } from './marketingCampaignTemplates'

function scope(organisationId) {
  if (!organisationId || !isSupabaseConfigured || !supabase)
    throw new Error('Choose a connected agency workspace first.')
}
function failure(error) {
  if (['42P01', 'PGRST205', 'PGRST204'].includes(error?.code))
    return new Error(
      'Saved templates are not enabled in this environment yet. Ready-made templates are available; an administrator needs to enable template storage.',
    )
  return new Error(
    error?.message || 'Unable to save the template. Please try again.',
  )
}
export function campaignTemplatePayload(input) {
  const plan = campaignPayload({
    ...input,
    planned_channels: input.planned_channels || input.channels,
    start_date: null,
    end_date: null,
    status: 'draft',
  })
  const mode = input.run_mode || input.mode
  const visibility = input.visibility || 'personal'
  if (!['bounded', 'ongoing'].includes(mode))
    throw new Error('Choose a time-bound or ongoing template.')
  if (!['personal', 'agency'].includes(visibility))
    throw new Error('Choose who can use this template.')
  const duration = mode === 'bounded' ? Number(input.duration_days ?? 30) : null
  if (
    mode === 'bounded' &&
    (!Number.isInteger(duration) || duration < 1 || duration > 366)
  )
    throw new Error('Choose a duration between 1 and 366 days.')
  // An explicit allowlist prevents copying send state, recipients or campaign IDs.
  return Object.fromEntries([
    ...[
      'name',
      'goal',
      'objective',
      'audience',
      'offer',
      'area',
      'cover_url',
      'planned_channels',
    ].map((key) => [key, plan[key]]),
    ['run_mode', mode],
    ['duration_days', duration],
    ['visibility', visibility],
    [
      'channel_content',
      validateChannelContent(
        input.channel_content || {},
        plan.planned_channels,
      ),
    ],
  ])
}
export async function loadCampaignTemplates(organisationId) {
  scope(organisationId)
  const result = []
  for (let offset = 0; ; offset += 200) {
    const { data, error } = await supabase
      .from('marketing_campaign_templates')
      .select('*')
      .eq('organisation_id', organisationId)
      .order('updated_at', { ascending: false })
      .order('id')
      .range(offset, offset + 199)
    if (error) throw failure(error)
    result.push(...(data || []))
    if ((data || []).length < 200) return result
  }
}
export async function saveCampaignTemplate(organisationId, input, existing) {
  scope(organisationId)
  const payload = campaignTemplatePayload(input)
  const query = existing
    ? supabase
        .from('marketing_campaign_templates')
        .update({ ...payload, revision: existing.revision + 1 })
        .eq('organisation_id', organisationId)
        .eq('id', existing.id)
        .eq('revision', existing.revision)
    : supabase
        .from('marketing_campaign_templates')
        .insert({ ...payload, id: input.id, organisation_id: organisationId })
  const { data, error } = await query.select('*').maybeSingle()
  if (error) throw failure(error)
  if (!data)
    throw new Error(
      'This template changed or is no longer editable. Reload before saving again.',
    )
  return data
}
