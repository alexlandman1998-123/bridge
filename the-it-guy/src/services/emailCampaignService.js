import { supabase } from '../lib/supabaseClient'

const clean = (value) => String(value || '').trim()

export async function getEmailCampaignWorkspace(organisationId) {
  if (!organisationId) return { campaigns: [], performance: [], identities: [], contacts: [], subscriptionTypes: [], deliverability: [], templates: [], savedAudiences: [], usage: [], billingProfile: null, dailyPerformance: [], categoryPerformance: [] }
  const [campaigns, performance, identities, contacts, subscriptionTypes, deliverability, templates, savedAudiences, usage, billingProfile, dailyPerformance, categoryPerformance] = await Promise.all([
    supabase.from('email_campaigns').select('*, email_sender_identities(display_name,from_email,reply_to_email)').eq('organisation_id', organisationId).order('updated_at', { ascending: false }),
    supabase.from('email_campaign_performance').select('*').eq('organisation_id', organisationId),
    supabase.from('email_sender_identities').select('*').eq('organisation_id', organisationId).order('verification_status'),
    supabase.from('email_marketing_contacts').select('*').eq('organisation_id', organisationId).eq('is_valid_email', true).order('created_at', { ascending: false }).limit(250),
    supabase.from('email_subscription_types').select('*').eq('organisation_id', organisationId).eq('is_active', true).order('display_order'),
    supabase.from('email_deliverability_health').select('*').eq('organisation_id', organisationId),
    supabase.from('email_templates').select('*').eq('organisation_id', organisationId).order('updated_at', { ascending: false }),
    supabase.from('email_saved_audiences').select('*').eq('organisation_id', organisationId).order('updated_at', { ascending: false }),
    supabase.from('email_usage_records').select('*').eq('organisation_id', organisationId).order('created_at', { ascending: false }).limit(100),
    supabase.from('email_billing_profiles').select('*').eq('organisation_id', organisationId).maybeSingle(),
    supabase.from('email_campaign_daily_performance').select('*').eq('organisation_id', organisationId).order('metric_date', { ascending: false }).limit(30),
    supabase.from('email_campaign_category_performance').select('*').eq('organisation_id', organisationId).order('recipients', { ascending: false }),
  ])
  for (const result of [campaigns, performance, identities, contacts, subscriptionTypes, deliverability, templates, savedAudiences, usage, billingProfile, dailyPerformance, categoryPerformance]) if (result.error) throw result.error
  return { campaigns: campaigns.data || [], performance: performance.data || [], identities: identities.data || [], contacts: contacts.data || [], subscriptionTypes: subscriptionTypes.data || [], deliverability: deliverability.data || [], templates: templates.data || [], savedAudiences: savedAudiences.data || [], usage: usage.data || [], billingProfile: billingProfile.data || null, dailyPerformance: dailyPerformance.data || [], categoryPerformance: categoryPerformance.data || [] }
}

export async function saveEmailCampaign({ campaign, organisationId, userId }) {
  const payload = {
    organisation_id: organisationId,
    name: clean(campaign.name), subject: clean(campaign.subject), preview_text: clean(campaign.previewText),
    sender_identity_id: campaign.senderIdentityId || null, reply_to_email: clean(campaign.replyToEmail) || null,
    subscription_type_id: campaign.subscriptionTypeId || null,
    audience_filter: campaign.audienceFilter || {}, content_json: campaign.contentJson || {}, html: campaign.html || '',
    updated_by: userId || null,
  }
  if (!payload.name || !payload.subject) throw new Error('Add a campaign name and subject before saving.')
  const query = campaign.id
    ? supabase.from('email_campaigns').update(payload).eq('id', campaign.id).select().single()
    : supabase.from('email_campaigns').insert({ ...payload, created_by: userId }).select().single()
  const { data, error } = await query
  if (error) throw error
  return data
}

export async function scheduleEmailCampaign(campaignId, scheduledFor) {
  const { data, error } = await supabase.rpc('email_campaign_prepare_dispatch', { p_campaign_id: campaignId, p_send_at: scheduledFor || new Date().toISOString() })
  if (error) throw error
  return data
}

export async function cancelEmailCampaign(campaignId) {
  const { error } = await supabase.rpc('email_campaign_cancel', { p_campaign_id: campaignId })
  if (error) throw error
}

export async function preflightEmailCampaign(campaignId) {
  const { data, error } = await supabase.rpc('email_campaign_preflight', { p_campaign_id: campaignId })
  if (error) throw error
  return data
}

export async function duplicateEmailCampaign(campaignId, name) {
  const { data, error } = await supabase.rpc('email_campaign_duplicate', { p_campaign_id: campaignId, p_name: clean(name) || null })
  if (error) throw error
  return data
}

export async function archiveEmailCampaign(campaignId) {
  const { error } = await supabase.rpc('email_campaign_archive', { p_campaign_id: campaignId })
  if (error) throw error
}

export async function quoteEmailCampaignUsage(campaignId, recipientCount) {
  const { data, error } = await supabase.rpc('email_campaign_quote_usage', { p_campaign_id: campaignId, p_recipient_count: Number.isFinite(Number(recipientCount)) ? Number(recipientCount) : null })
  if (error) throw error
  return data
}

export async function sendEmailCampaignTest(payload) {
  const { data, error } = await supabase.functions.invoke('email-campaign-test', { body: payload })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data
}

export async function refreshEmailSenderVerification(organisationId) {
  const { data, error } = await supabase.functions.invoke('email-sender-verification', { body: { organisationId } })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data
}

export async function saveEmailTemplate({ organisationId, userId, template }) {
  const payload = {
    organisation_id: organisationId,
    name: clean(template.name),
    category: clean(template.category) || 'custom',
    html: template.html || '',
    design_json: template.designJson || { source: 'html_upload', schema_version: 1 },
    created_by: userId || null,
  }
  if (!payload.name) throw new Error('Name this template before saving it.')
  if (!payload.html.trim()) throw new Error('Add HTML before saving this template.')
  const query = template.id
    ? supabase.from('email_templates').update(payload).eq('id', template.id).select().single()
    : supabase.from('email_templates').insert(payload).select().single()
  const { data, error } = await query
  if (error) throw error
  return data
}

export async function previewEmailAudience({ organisationId, subscriptionTypeId, audienceFilter }) {
  if (!organisationId || !subscriptionTypeId) return 0
  const { data, error } = await supabase.rpc('email_campaign_preview_audience', { p_organisation_id: organisationId, p_subscription_type_id: subscriptionTypeId, p_filter: audienceFilter || {} })
  if (error) throw error
  return Number(data || 0)
}

export async function saveEmailAudience({ organisationId, userId, audience }) {
  const payload = { organisation_id: organisationId, name: clean(audience.name), description: clean(audience.description), filter_json: audience.filterJson || {}, created_by: userId || null }
  if (!payload.name) throw new Error('Name this audience before saving it.')
  const query = audience.id ? supabase.from('email_saved_audiences').update(payload).eq('id', audience.id).select().single() : supabase.from('email_saved_audiences').insert(payload).select().single()
  const { data, error } = await query
  if (error) throw error
  return data
}

export async function getEmailCampaignAnalytics(campaignId) {
  if (!campaignId) return { recipients: [], events: [], links: [], audit: [] }
  const [recipients, events, links, audit] = await Promise.all([
    supabase.from('email_campaign_recipients').select('id,email,recipient_snapshot,status,error_reason,sent_at,delivered_at,opened_at,clicked_at,bounced_at').eq('campaign_id', campaignId).order('created_at', { ascending: false }),
    supabase.from('email_events').select('id,recipient_id,event_type,url,occurred_at').eq('campaign_id', campaignId).order('occurred_at', { ascending: false }).limit(500),
    supabase.from('email_campaign_link_performance').select('*').eq('campaign_id', campaignId).order('unique_clickers', { ascending: false }),
    supabase.from('email_campaign_audit_events').select('*').eq('campaign_id', campaignId).order('created_at', { ascending: false }).limit(30),
  ])
  for (const result of [recipients, events, links, audit]) if (result.error) throw result.error
  return { recipients: recipients.data || [], events: events.data || [], links: links.data || [], audit: audit.data || [] }
}
