import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'
import { buildAgencyPublicIntakeUrls } from './agencyPublicIntakeLinkService'

const purposes = new Set(['valuation', 'seller', 'buyer', 'referral'])
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const intentFor = { valuation: 'sell', seller: 'sell', buyer: 'buy' }
const notice = 'Creating a response link makes this form available to anyone with the link. Enquiries prepare a CRM follow-up; future marketing permission remains separate. Nothing is sent by creating or copying a link.'
function failure(error) {
  if (['42P01', 'PGRST205', 'PGRST202', '42883'].includes(error?.code)) return new Error('Campaign response links are not enabled in this workspace yet. Your campaign remains saved.')
  return new Error(error?.message || 'The campaign response link could not be confirmed. Try again.')
}
async function actor(org, userId, campaign) {
  if (!isSupabaseConfigured || !supabase || !uuid.test(org || '') || !uuid.test(userId || '') || campaign?.organisation_id !== org || !uuid.test(campaign?.id || '') || !Number.isInteger(campaign?.revision)) throw new Error('Open a saved campaign in your current agency workspace.')
  const auth = await supabase.auth.getUser()
  if (auth.error || auth.data?.user?.id !== userId) throw new Error('Your account changed. Reopen this campaign before managing response links.')
  const current = await supabase.from('marketing_campaigns').select('id,organisation_id,revision,created_by,campaign_builder,listing_builder').eq('organisation_id', org).eq('id', campaign.id).maybeSingle()
  if (current.error) throw failure(current.error)
  if (!current.data || current.data.organisation_id !== org || current.data.revision !== campaign.revision) throw new Error('The campaign changed or is unavailable. Reload it before managing response links.')
  return current.data
}
function display(row, slug, intakeActive = true) {
  const disabledAt = row.disabled_at || null
  const url = new URL(buildAgencyPublicIntakeUrls({ slug }).intakeUrl)
  url.searchParams.set('campaignResponse', row.token)
  url.searchParams.set('source', 'campaign')
  if (intentFor[row.purpose]) url.searchParams.set('intent', intentFor[row.purpose])
  return { id: row.id, purpose: row.purpose, status: disabledAt ? 'disabled' : intakeActive ? 'active' : 'unavailable', url: url.href, campaignRevision: row.campaign_revision, followUpDays: row.follow_up_days, createdAt: row.created_at, disabledAt }
}

export async function loadCampaignResponseLinks(org, userId, campaign) {
  const current = await actor(org, userId, campaign)
  const owner = current.campaign_builder?.agentId || current.listing_builder?.agentId || current.created_by
  const [intakes, responses] = await Promise.all([
    supabase.from('agency_public_intake_links').select('id,organisation_id,slug,heading,status,disabled_at,enabled_intents,default_assigned_agent_id,metadata_json').eq('organisation_id', org).eq('status', 'active').is('disabled_at', null).order('updated_at', { ascending: false }).limit(100),
    supabase.from('marketing_campaign_response_links').select('*').eq('organisation_id', org).eq('campaign_id', campaign.id).order('created_at', { ascending: false }).limit(50),
  ])
  if (intakes.error || responses.error) throw failure(intakes.error || responses.error)
  const intakeLinks = (intakes.data || []).filter((row) => row.organisation_id === org && (row.metadata_json?.surface !== 'agent_digital_card' || row.default_assigned_agent_id === owner)).map((row) => ({ id: row.id, slug: row.slug, label: row.metadata_json?.surface === 'agent_digital_card' ? row.metadata_json.agentDigitalCard?.agent?.name || row.heading || row.slug : row.heading || row.slug, assignedAgentId: row.default_assigned_agent_id || '', enabledIntents: (row.enabled_intents || []).filter((value) => ['buy', 'sell'].includes(value)) }))
  const byIntake = new Map((intakes.data || []).map((row) => [row.id, row]))
  const missing = [...new Set((responses.data || []).filter((row) => row.organisation_id === org && row.campaign_id === campaign.id && !byIntake.has(row.intake_link_id)).map((row) => row.intake_link_id))]
  if (missing.length) {
    const old = await supabase.from('agency_public_intake_links').select('id,organisation_id,slug,status,disabled_at').eq('organisation_id', org).in('id', missing).limit(50)
    if (old.error) throw failure(old.error)
    for (const row of old.data || []) if (row.organisation_id === org) byIntake.set(row.id, row)
  }
  const links = []
  for (const row of responses.data || []) {
    if (row.organisation_id !== org || row.campaign_id !== campaign.id) continue
    const intake = byIntake.get(row.intake_link_id)
    if (intake?.slug) links.push(display(row, intake.slug, intake.status === 'active' && !intake.disabled_at))
  }
  await actor(org, userId, campaign)
  return { intakeLinks, links, notice: notice + (links.some((link) => link.status === 'unavailable') ? ' A previously created link has an unavailable public form; enable or replace that form before sharing it.' : '') }
}

export async function createCampaignResponseLink(org, userId, campaign, { intakeLinkId, purpose, followUpDays = 1 } = {}) {
  await actor(org, userId, campaign)
  if (!uuid.test(intakeLinkId || '') || !purposes.has(purpose) || !Number.isInteger(followUpDays) || followUpDays < 0 || followUpDays > 14) throw new Error('Choose an active intake link, a supported response purpose and follow-up delay from 0 to 14 days.')
  const result = await supabase.rpc('marketing_campaign_create_response_link', { p_org: org, p_campaign: campaign.id, p_revision: campaign.revision, p_intake: intakeLinkId, p_purpose: purpose, p_followup_days: followUpDays })
  if (result.error) throw failure(result.error)
  if (!result.data?.id || result.data.organisation_id !== org || result.data.campaign_id !== campaign.id || result.data.campaign_revision !== campaign.revision || !uuid.test(result.data.token || '') || !result.data.slug) throw new Error('The response link could not be matched to this campaign. Refresh before sharing it.')
  await actor(org, userId, campaign)
  return display(result.data, result.data.slug)
}

export async function revokeCampaignResponseLink(org, userId, campaign, link) {
  await actor(org, userId, campaign)
  if (!uuid.test(link?.id || '')) throw new Error('Choose a saved campaign response link.')
  const result = await supabase.from('marketing_campaign_response_links').update({ disabled_at: new Date().toISOString() }).eq('organisation_id', org).eq('campaign_id', campaign.id).eq('id', link.id).select('id,disabled_at').maybeSingle()
  if (result.error) throw failure(result.error)
  if (result.data?.id !== link.id || !result.data.disabled_at) throw new Error('The response link could not be revoked. Refresh and try again.')
  await actor(org, userId, campaign)
  return { ...link, status: 'disabled', disabledAt: result.data.disabled_at }
}
