import { cleanCampaignPlaybook } from './campaignPlaybookModel'
import { CAMPAIGN_OBJECTIVES, cleanCampaignSetup } from './campaignSetupModel'
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'
import { validateChannelContent } from './marketingCampaignTemplates'
import { cleanListingBuilder } from './justListedCampaignModel'
import {
  cleanGeneralBuilder,
  generalCampaignGaps,
  generalTemplate,
} from './generalCampaignModel'

export const CAMPAIGN_GOALS = {
  seller_leads: 'Generate seller leads',
  buyer_leads: 'Generate buyer leads',
  promote_listing: 'Promote a listing',
  reengage: 'Reconnect with your database',
  custom: 'Custom goal',
}
export const CAMPAIGN_CHANNELS = {
  email: 'Email',
  whatsapp: 'WhatsApp',
  meta: 'Meta',
  chatgpt: 'ChatGPT Ads',
  social: 'Organic social',
}
export const CAMPAIGN_STATUSES = {
  draft: 'Draft',
  scheduled: 'Scheduled',
  active: 'Active',
  completed: 'Completed',
}
const PAGE_SIZE = 500

function requireScope(organisationId) {
  if (!organisationId) throw new Error('Choose an agency workspace first.')
  if (!isSupabaseConfigured || !supabase)
    throw new Error('Campaigns require a connected workspace.')
}
function failure(error) {
  if (error?.code === '23514' && /marketing_campaign_channels_valid/.test(error.message || '')) return new Error('Campaign channel storage needs its database update before ChatGPT Ads can be saved. Your draft is still here.')
  if (['42703', 'PGRST204'].includes(error?.code) && /campaign_setup/.test(error.message || '')) return new Error('Campaign setup storage needs its database update before these choices can be saved.')
  if (error?.code === 'PGRST204' && /playbook/.test(error.message || '')) return new Error('Playbook storage is not enabled in this workspace yet. Your changes have not been saved.')
  if (
    error?.code === 'PGRST204' &&
    /campaign_builder/.test(error.message || '')
  )
    return new Error(
      'Buyer, seller and brand campaign storage is not enabled in this environment yet. Your edits are still here.',
    )
  if (error?.code === 'PGRST204' && /listing_builder/.test(error.message || ''))
    return new Error(
      'The Just Listed builder is not enabled in this environment yet. Your draft has not been saved.',
    )
  if (
    error?.code === 'PGRST204' &&
    /planned_budget|budget_currency/.test(error.message || '')
  )
    return new Error(
      'Manual campaign budgets are not enabled in this environment yet. Your changes have not been saved.',
    )
  if (error?.code === 'PGRST204' && /channel_content/.test(error.message || ''))
    return new Error(
      'Campaign draft content is not enabled in this environment yet. An administrator needs to enable template storage.',
    )
  if (['42P01', 'PGRST205', 'PGRST204'].includes(error?.code))
    return new Error(
      'The campaign workspace has not been enabled in this environment yet.',
    )
  if (error?.code === '23505')
    return new Error(
      'This activity is already linked to a campaign. Refresh the page to see its current assignment.',
    )
  return new Error(
    error?.message || 'Unable to save this campaign. Please try again.',
  )
}
async function rows(query) {
  const all = []
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const result = await query().range(offset, offset + PAGE_SIZE - 1)
    if (result.error) throw failure(result.error)
    all.push(...(result.data || []))
    if ((result.data || []).length < PAGE_SIZE) return all
  }
}
export function campaignPayload(input) {
  const payload = Object.fromEntries(
    ['name', 'goal', 'objective', 'audience', 'offer', 'area', 'cover_url'].map(
      (key) => [key, String(input[key] || '').trim()],
    ),
  )
  payload.start_date = input.start_date || null
  payload.end_date = input.end_date || null
  payload.status = input.status || 'draft'
  payload.planned_channels = [...new Set(input.planned_channels || [])]
  if (Object.hasOwn(input, 'campaign_setup')) {
    payload.campaign_setup = cleanCampaignSetup(input.campaign_setup)
    if (payload.campaign_setup.metaObjective) payload.objective = CAMPAIGN_OBJECTIVES[payload.campaign_setup.metaObjective].label
    if (payload.goal === 'custom' && !payload.campaign_setup.customGoal) throw new Error('Describe your custom goal.')
  }
  if (!payload.name || payload.name.length > 120)
    throw new Error('Give your campaign a name of up to 120 characters.')
  if (
    !Object.hasOwn(CAMPAIGN_GOALS, payload.goal) ||
    !payload.objective ||
    payload.objective.length > 240
  )
    throw new Error(
      'Choose a goal and describe the objective in up to 240 characters.',
    )
  if (!Object.hasOwn(CAMPAIGN_STATUSES, payload.status))
    throw new Error('Choose a campaign status.')
  if (
    !payload.planned_channels.length ||
    payload.planned_channels.some(
      (channel) => !Object.hasOwn(CAMPAIGN_CHANNELS, channel),
    )
  )
    throw new Error('Choose at least one channel.')
  if (
    payload.audience.length > 600 ||
    payload.offer.length > 600 ||
    payload.area.length > 120
  )
    throw new Error('Shorten the audience, offer or area before saving.')
  for (const date of [payload.start_date, payload.end_date]) {
    if (
      date &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        !Number.isFinite(Date.parse(date)) ||
        new Date(date).toISOString().slice(0, 10) !== date)
    )
      throw new Error('Choose valid campaign dates.')
  }
  if (
    payload.start_date &&
    payload.end_date &&
    payload.end_date < payload.start_date
  )
    throw new Error('The end date must be on or after the start date.')
  if (payload.status === 'scheduled' && !payload.start_date)
    throw new Error(
      'Add a start date before marking this campaign as scheduled.',
    )
  if (payload.cover_url) {
    let url
    try {
      url = new URL(payload.cover_url)
    } catch {
      throw new Error('Use a valid HTTPS image URL.')
    }
    if (
      url.protocol !== 'https:' ||
      /\s/.test(payload.cover_url) ||
      url.username ||
      url.password ||
      payload.cover_url.length > 2048
    )
      throw new Error('Use a valid HTTPS image URL.')
  }
  if (Object.hasOwn(input, 'planned_budget')) {
    const raw = input.planned_budget
    const empty = raw === '' || raw === null || raw === undefined
    if (!empty && !/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/.test(String(raw)))
      throw new Error(
        'Enter a planned budget from 0 to 9,999,999,999.99 with up to two decimal places.',
      )
    if (input.budget_currency && input.budget_currency !== 'ZAR')
      throw new Error('Manual campaign budgets currently use ZAR.')
    payload.planned_budget = empty ? null : Number(raw)
    payload.budget_currency = 'ZAR'
  }
  if (
    Object.hasOwn(input, 'channel_content') &&
    input.channel_content !== undefined
  )
    payload.channel_content = validateChannelContent(
      input.channel_content,
      payload.planned_channels,
    )
  if (Object.hasOwn(input, 'playbook') && input.playbook === null) payload.playbook = null
  if (input.playbook != null) payload.playbook = cleanCampaignPlaybook(input.playbook, payload.planned_channels)
  if (input.listing_builder != null) {
    payload.listing_builder = cleanListingBuilder(input.listing_builder)
    if (
      payload.status !== 'draft' ||
      payload.goal !==
        (payload.listing_builder.template === 'just-sold'
          ? 'seller_leads'
          : 'promote_listing')
    )
      throw new Error(
        'Property campaigns must be saved as drafts with the matching objective.',
      )
  }
  if (input.campaign_builder != null) {
    payload.campaign_builder = cleanGeneralBuilder(input.campaign_builder)
    const gaps = generalCampaignGaps(payload.campaign_builder)
    if (gaps.length) throw new Error(gaps.join(' '))
    if (
      payload.status !== 'draft' ||
      payload.goal !==
        generalTemplate(payload.campaign_builder.template).goal ||
      input.listing_builder
    )
      throw new Error(
        'Save this campaign as a draft with its matching objective and without a listing builder.',
      )
  }
  return payload
}
export async function loadMarketingCampaigns(organisationId) {
  requireScope(organisationId)
  const auth = await supabase.auth.getUser()
  if (auth.error || !auth.data?.user)
    throw new Error('Sign in again to open campaigns.')
  const scoped =
    (table, select = '*', order = 'id') =>
    () =>
      supabase
        .from(table)
        .select(select)
        .eq('organisation_id', organisationId)
        .order(order)
  const [campaigns, activities, permission, email, whatsapp] =
    await Promise.all([
      rows(scoped('marketing_campaigns')),
      rows(scoped('marketing_campaign_activities')),
      supabase.rpc('email_campaign_can_send', {
        p_organisation_id: organisationId,
      }),
      rows(
        scoped(
          'email_campaigns',
          'id,name,status,subject,scheduled_for,sent_at,created_at,updated_at,ai_listing_id:content_json->ai_campaign->>listing_id,ai_objective:content_json->ai_campaign->>objective,ai_event_id:content_json->ai_campaign->event->>id',
        ),
      )
        .then((data) => ({ data }))
        .catch((error) => ({ data: [], error: error.message })),
      rows(
        scoped(
          'whatsapp_campaign_performance',
          'id,name,status,display_status,scheduled_at,sent_at,created_at,recipients,delivered,read,failed',
        ),
      )
        .then((data) => ({ data }))
        .catch((error) => ({ data: [], error: error.message })),
    ])
  // Read metrics only for sends that are visible under the channel's own permissions.
  const emailMetrics = []
  let metricsError = null
  try {
    for (let index = 0; index < email.data.length; index += 100) {
      const ids = email.data.slice(index, index + 100).map((row) => row.id)
      emailMetrics.push(
        ...(await rows(() =>
          supabase
            .from('email_campaign_performance')
            .select('campaign_id,recipients,delivered,opened,clicked')
            .eq('organisation_id', organisationId)
            .in('campaign_id', ids)
            .order('campaign_id'),
        )),
      )
    }
  } catch {
    metricsError = 'Email results are currently unavailable.'
  }
  return {
    campaigns: campaigns.sort((a, b) =>
      b.updated_at.localeCompare(a.updated_at),
    ),
    activities,
    userId: auth.data.user.id,
    canManage: !permission.error && permission.data === true,
    channels: {
      email: {
        ...email,
        metricsError,
        data: email.data.map((row) => ({
          ...row,
          ...emailMetrics.find((metric) => metric.campaign_id === row.id),
        })),
      },
      whatsapp,
    },
  }
}
export async function saveMarketingCampaign(organisationId, input, existing) {
  requireScope(organisationId)
  const payload = campaignPayload(input)
  const query = existing
    ? supabase
        .from('marketing_campaigns')
        .update({ ...payload, revision: existing.revision + 1 })
        .eq('organisation_id', organisationId)
        .eq('id', existing.id)
        .eq('revision', existing.revision)
    : supabase.from('marketing_campaigns').insert({
        ...payload,
        ...(input.id ? { id: input.id } : {}),
        organisation_id: organisationId,
      })
  const result = await query.select('*').maybeSingle()
  if (!existing && input.id && result.error?.code === '23505') {
    const recovered = await supabase
      .from('marketing_campaigns')
      .select('*')
      .eq('organisation_id', organisationId)
      .eq('id', input.id)
      .maybeSingle()
    if (recovered.data) {
      if (payload.campaign_setup && canonicalCampaignJson(recovered.data.campaign_setup) !== canonicalCampaignJson(payload.campaign_setup)) throw new Error('This draft was already saved with a different setup. Reopen it before changing its objective or audience.')
      if (
        payload.campaign_builder &&
        (canonicalCampaignJson(recovered.data.campaign_builder) !==
          canonicalCampaignJson(payload.campaign_builder) ||
          canonicalCampaignJson(recovered.data.channel_content) !==
            canonicalCampaignJson(payload.channel_content))
      )
        throw new Error(
          'This draft was already saved. Reopen it from campaigns before making more changes.',
        )
      if (payload.listing_builder) {
        const savedBuilder = recovered.data.listing_builder
        const sameSource =
          canonicalCampaignJson(savedBuilder?.settings || {}) ===
            canonicalCampaignJson(payload.listing_builder.settings || {}) &&
          canonicalCampaignJson(savedBuilder?.additionalListings || []) ===
            canonicalCampaignJson(
              payload.listing_builder.additionalListings || [],
            ) &&
          savedBuilder?.template === payload.listing_builder.template &&
          savedBuilder?.listingId === payload.listing_builder.listingId &&
          savedBuilder?.agentId === payload.listing_builder.agentId &&
          Object.entries(payload.listing_builder.source).every(
            ([key, value]) => savedBuilder.source?.[key] === value,
          )
        const sameCopy = Object.entries(payload.channel_content || {}).every(
          ([channel, copy]) =>
            Object.entries(copy).every(
              ([key, value]) =>
                recovered.data.channel_content?.[channel]?.[key] === value,
            ),
        )
        if (!sameSource || !sameCopy)
          throw new Error(
            'This draft was already saved. Reopen it from campaigns to review your saved wording before making more changes.',
          )
      }
      return recovered.data
    }
  }
  if (result.error) throw failure(result.error)
  if (!result.data)
    throw new Error(
      'This campaign changed or is no longer editable. Reload before saving again.',
    )
  return result.data
}
export async function linkMarketingActivity(
  organisationId,
  campaignId,
  channel,
  activityId,
) {
  requireScope(organisationId)
  if (!['email', 'whatsapp'].includes(channel) || !activityId)
    throw new Error('Choose an email or WhatsApp campaign to link.')
  const result = await supabase.from('marketing_campaign_activities').insert({
    organisation_id: organisationId,
    campaign_id: campaignId,
    channel,
    [`${channel}_campaign_id`]: activityId,
  })
  if (result.error) throw failure(result.error)
}
export async function unlinkMarketingActivity(organisationId, campaignId, id) {
  requireScope(organisationId)
  const result = await supabase
    .from('marketing_campaign_activities')
    .delete()
    .eq('organisation_id', organisationId)
    .eq('campaign_id', campaignId)
    .eq('id', id)
    .select('id')
  if (result.error) throw failure(result.error)
  if (!result.data?.length)
    throw new Error(
      'This link changed or is no longer editable. Refresh and try again.',
    )
}
export function linkedActivities(workspace, campaign, channel) {
  return workspace.activities
    .filter((row) => row.campaign_id === campaign.id && row.channel === channel)
    .map((link) => ({
      link,
      activity: workspace.channels[channel]?.data.find(
        (row) => row.id === link[`${channel}_campaign_id`],
      ),
    }))
}
export function channelProgress(workspace, campaign, channel) {
  if (['meta', 'social', 'chatgpt'].includes(channel)) return 'Planned'
  const linked = linkedActivities(workspace, campaign, channel)
  if (!linked.length) return 'Planned'
  if (workspace.channels[channel]?.error || linked.some((row) => !row.activity))
    return 'Unavailable'
  const statuses = linked.map(
    (row) => row.activity.display_status || row.activity.status,
  )
  if (
    statuses.some((status) =>
      [
        'failed',
        'partially_failed',
        'partial',
        'needs_attention',
        'uncertain',
      ].includes(status),
    )
  )
    return 'Needs attention'
  if (statuses.includes('sending')) return 'Sending'
  if (statuses.includes('scheduled')) return 'Scheduled'
  if (statuses.includes('draft')) return 'Draft'
  if (statuses.every((status) => status === 'sent')) return 'Sent'
  return 'Inactive'
}

function canonicalCampaignJson(value) {
  return JSON.stringify(value, (_, item) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(
          Object.entries(item).sort(([a], [b]) => a.localeCompare(b)),
        )
      : item,
  )
}
