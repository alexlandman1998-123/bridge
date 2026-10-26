import { cleanCampaignPlaybook, playbookStepCopy } from './campaignPlaybookModel'
import { checkedChannelCopyPack, campaignChannelBrief } from './campaignChannelBrief'
import { propertyItems } from './listingCampaignContract'
import { checkedPropertyPack } from './propertyCampaignPackModel'
import { checkedGeneralPack } from './generalCampaignModel'
import { loadGeneralCampaignContext } from './generalCampaignService'
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'
import {
  loadJustListedChoices,
  loadJustListedSource,
  loadPropertyShowDays,
} from './justListedCampaignService'
import {
  campaignEmailDraft,
  campaignHandoffId,
  checkedCampaignPack,
  checkedEmailCopyPack,
} from './campaignPackModel'
import { linkMarketingActivity } from './marketingCampaignService'
import { saveEmailCampaign } from './emailCampaignService'
import { whatsappCampaignRequest } from './whatsappCampaignService'

async function confirmActor(userId) {
  const auth = await supabase.auth.getUser()
  if (auth.error || auth.data?.user?.id !== userId)
    throw new Error('Your account changed. Reopen campaigns.')
}

export async function loadCampaignPack(organisationId, userId, expected, channel = 'email', stepId = null) {
  if (!isSupabaseConfigured || !supabase || !organisationId || !userId)
    throw new Error('Choose a connected agency workspace.')
  const auth = await supabase.auth.getUser()
  if (auth.error || auth.data?.user?.id !== userId)
    throw new Error('Your account changed. Reopen campaigns.')
  let { data: campaign, error } = await supabase
    .from('marketing_campaigns')
    .select('*')
    .eq('organisation_id', organisationId)
    .eq('id', expected.id)
    .maybeSingle()
  if (error)
    throw new Error('The campaign could not be loaded. Refresh and try again.')
  if (!campaign || campaign.revision !== expected.revision)
    throw new Error(
      'This campaign changed or is no longer available. Reload it before continuing.',
    )
  if (campaign.created_by !== userId) {
    const permission = await supabase.rpc('email_campaign_can_send', {
      p_organisation_id: organisationId,
    })
    if (permission.error || permission.data !== true)
      throw new Error(
        'The campaign owner or an agency administrator must prepare these assets and channel drafts.',
      )
  }
  let playbookStep = null
  if (stepId) {
    const playbook = cleanCampaignPlaybook(campaign.playbook, campaign.planned_channels)
    if (playbook.sourceRevision !== campaign.revision) throw new Error('The campaign brief changed. Review and save its playbook before preparing this step.')
    playbookStep = playbook.steps.find((step) => step.id === stepId && step.channel === channel)
    if (!playbookStep) throw new Error('This playbook step changed or is unavailable. Reload the playbook.')
    campaign = { ...campaign, channel_content: { ...campaign.channel_content, [channel]: playbookStepCopy(playbook, playbookStep) } }
  }
  const complete = (pack) => playbookStep ? { ...pack, playbookStep } : pack
  if (!campaign.campaign_builder && !campaign.listing_builder) {
    if (channel !== 'email') return complete(checkedChannelCopyPack(campaign, channel))
    const agency = await supabase.from('organisations').select('name').eq('id', organisationId).maybeSingle()
    if (agency.error) throw new Error('The agency could not be loaded. Refresh before preparing the email draft.')
    return complete(checkedEmailCopyPack(campaign, agency.data?.name))
  }
  if (campaign.campaign_builder) {
    return complete(checkedGeneralPack(
      campaign,
      await loadGeneralCampaignContext(
        organisationId,
        userId,
        campaign.campaign_builder.template,
        campaign.campaign_builder.agentId,
        ...(campaign.campaign_builder.template === 'key-handover'
          ? [campaign.campaign_builder.details]
          : []),
      ),
    ))
  }
  if (campaign.listing_builder?.version === 2) {
    const family = campaign.listing_builder.template
    const choices = await loadJustListedChoices(organisationId, userId, family)
    const currents = await Promise.all(
      propertyItems(campaign.listing_builder).map((item) =>
        loadJustListedSource(
          organisationId,
          userId,
          item.listingId,
          choices,
          family,
        ),
      ),
    )
    const events = campaign.listing_builder.settings?.eventId
      ? await loadPropertyShowDays(organisationId)
      : []
    return complete(checkedPropertyPack(
      campaign,
      currents,
      events.find(
        (event) => event.id === campaign.listing_builder.settings.eventId,
      ),
    ))
  }
  const choices = await loadJustListedChoices(organisationId, userId)
  const current = await loadJustListedSource(
    organisationId,
    userId,
    campaign.listing_builder?.listingId,
    choices,
  )
  return complete(checkedCampaignPack(campaign, current))
}

export async function handoffCampaignDraft(
  organisationId,
  userId,
  expected,
  channel,
  stepId = null,
) {
  if (!['email', 'whatsapp'].includes(channel))
    throw new Error('Choose email or WhatsApp.')
  const pack = await loadCampaignPack(organisationId, userId, expected, channel, stepId)
  const id = await campaignHandoffId(
    organisationId,
    pack.campaign.id,
    pack.campaign.revision,
    stepId ? `${channel}:playbook:${stepId}` : channel,
  )
  await confirmActor(userId)
  // A deterministic ID makes a retry safe even if draft creation succeeded but
  // linking was interrupted. Never overwrite a draft someone has since edited.
  let saved
  if (channel === 'email') {
    const existing = await supabase
      .from('email_campaigns')
      .select('*')
      .eq('organisation_id', organisationId)
      .eq('id', id)
      .maybeSingle()
    if (existing.error)
      throw new Error('Unable to check the existing email draft. Try again.')
    saved = existing.data
    if (!saved) {
      try {
        saved = await saveEmailCampaign({
          organisationId,
          userId,
          campaign: { ...campaignEmailDraft(pack), clientId: id },
        })
      } catch (error) {
        if (error.code !== '23505') throw error
        const recovered = await supabase
          .from('email_campaigns')
          .select('*')
          .eq('organisation_id', organisationId)
          .eq('id', id)
          .maybeSingle()
        if (recovered.error || !recovered.data) throw error
        saved = recovered.data
      }
    }
    if (
      saved.content_json?.arch9_campaign?.id !== pack.campaign.id ||
      saved.content_json?.arch9_campaign?.revision !== pack.campaign.revision ||
      (stepId && saved.content_json?.arch9_campaign?.playbook_step !== stepId)
    )
      throw new Error(
        'The existing email draft could not be matched to this campaign.',
      )
  } else {
    const workspace = await whatsappCampaignRequest(organisationId, 'workspace')
    saved = workspace.campaigns?.find((row) => row.id === id)
    if (!saved) {
      const result = await whatsappCampaignRequest(organisationId, 'save', {
        campaign: {
          client_id: id,
          name: pack.campaign.name.slice(0, 100),
          sender_id: '',
          template: {},
          contact_ids: [],
          parameter_values: {
            __arch9_campaign: {
              id: pack.campaign.id,
              revision: pack.campaign.revision,
              wording: pack.content.whatsapp.body,
              ...(stepId ? { playbook_step: stepId } : {}),
            },
          },
        },
      })
      saved = result.campaign
    }
    if (
      saved?.parameter_values?.__arch9_campaign?.id !== pack.campaign.id ||
      saved?.parameter_values?.__arch9_campaign?.revision !==
        pack.campaign.revision ||
      (stepId && saved?.parameter_values?.__arch9_campaign?.playbook_step !== stepId)
    )
      throw new Error(
        'The existing WhatsApp draft could not be matched to this campaign.',
      )
  }
  // Recheck the campaign revision after channel creation. If it changed, keep
  // the channel draft for recovery without linking a stale revision silently.
  const latest = await supabase
    .from('marketing_campaigns')
    .select('revision')
    .eq('organisation_id', organisationId)
    .eq('id', pack.campaign.id)
    .maybeSingle()
  if (latest.error || latest.data?.revision !== pack.campaign.revision)
    throw new Error(
      'The campaign changed while its channel draft was created. Your channel draft is saved; reload the campaign before linking it.',
    )
  const field = `${channel}_campaign_id`
  await confirmActor(userId)
  const existingLink = await supabase
    .from('marketing_campaign_activities')
    .select('*')
    .eq('organisation_id', organisationId)
    .eq(field, saved.id)
    .maybeSingle()
  if (existingLink.error)
    throw new Error(
      'The channel draft is saved, but its link could not be checked. Retry to finish linking it.',
    )
  if (existingLink.data && existingLink.data.campaign_id !== pack.campaign.id)
    throw new Error('This channel draft is linked to another campaign.')
  if (!existingLink.data) {
    try {
      await linkMarketingActivity(
        organisationId,
        pack.campaign.id,
        channel,
        saved.id,
      )
    } catch {
      const recovered = await supabase
        .from('marketing_campaign_activities')
        .select('campaign_id')
        .eq('organisation_id', organisationId)
        .eq(field, saved.id)
        .maybeSingle()
      if (recovered.error || recovered.data?.campaign_id !== pack.campaign.id)
        throw new Error(
          'The channel draft is saved, but linking did not finish. Retry to finish linking the same draft.',
        )
    }
  }
  return { id: saved.id, status: saved.status || 'draft' }
}

export async function loadCampaignChannelBrief(organisationId, userId, expected, channel, stepId = null) {
  if (!['meta', 'social', 'chatgpt'].includes(channel)) throw new Error('Choose Meta ads, ChatGPT Ads or Organic social.')
  const pack = await loadCampaignPack(organisationId, userId, expected, channel, stepId)
  await confirmActor(userId)
  return campaignChannelBrief(pack.campaign, channel)
}
