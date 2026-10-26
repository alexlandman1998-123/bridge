import { supabase } from '../lib/supabaseClient'

const clean = (value) => String(value || '').trim()
const normalizeEmail = (value) => clean(value).toLowerCase()

async function emailSetupError(error) {
  // Function HTTP failures carry the actionable message in their response body.
  // Keep it visible so an agency can resolve DNS, ownership or limit errors.
  try {
    const payload = await error.context?.clone().json()
    if (typeof payload?.error === 'string') return new Error(payload.error)
  } catch { /* Fall back to the original network error. */ }
  return error
}

function normalizeTags(tags = []) {
  return [...new Set((Array.isArray(tags) ? tags : String(tags).split(','))
    .map((tag) => clean(tag).toLowerCase())
    .filter(Boolean))]
}

function getClientRoleType(client = {}) {
  const candidates = [client.primaryRole, client.typeKeys?.[0], client.typeKey, client.role]
  const role = candidates.map((value) => clean(value).toLowerCase()).find(Boolean)
  return ['buyer', 'seller', 'investor', 'landlord', 'tenant', 'lead'].includes(role) ? role : 'lead'
}

export async function getClientMarketingWorkspace({ organisationId, email = '' }) {
  if (!organisationId) return { marketingContact: null, savedAudiences: [] }
  const normalizedEmail = normalizeEmail(email)
  const [contactResult, audiencesResult] = await Promise.all([
    normalizedEmail
      ? supabase.from('email_marketing_contacts').select('*').eq('organisation_id', organisationId).eq('email', normalizedEmail).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase.from('email_saved_audiences').select('*').eq('organisation_id', organisationId).is('archived_at', null).order('updated_at', { ascending: false }),
  ])
  if (contactResult.error) throw contactResult.error
  if (audiencesResult.error) throw audiencesResult.error
  return { marketingContact: contactResult.data || null, savedAudiences: audiencesResult.data || [] }
}

export async function getClientAudienceMemberships({ organisationId, marketingContact, savedAudiences = [] }) {
  if (!organisationId || !marketingContact || marketingContact.organisation_id !== organisationId) return []
  const audiences = savedAudiences.filter(audience => audience.organisation_id === organisationId && !audience.archived_at)
  const matches = await Promise.all(audiences.map(async audience => {
    const filter = audience.filter_json || {}
    // Delivery applies these legacy constraints alongside structured rules.
    for (const field of ['role_type', 'branch_id', 'assigned_user_id', 'lead_stage', 'area']) {
      if (filter[field] != null && String(marketingContact[field] ?? '') !== String(filter[field])) return false
    }
    if (filter.tag != null && !marketingContact.tags?.includes(filter.tag)) return false
    if (filter.contact_ids?.length && !filter.contact_ids.includes(marketingContact.id)) return false
    if (!Array.isArray(filter.rules)) return true
    // Evaluate this one persisted contact with the same matcher as audience previews.
    const { data, error } = await supabase.rpc('email_audience_rule_matches', { p_contact: marketingContact, p_rule: filter })
    if (error) throw error
    return data === true
  }))
  return audiences.filter((_, index) => matches[index])
}

export async function getSavedAudiences(organisationId) {
  if (!organisationId) return []
  const { data, error } = await supabase
    .from('email_saved_audiences')
    .select('*')
    .eq('organisation_id', organisationId)
    .is('archived_at', null)
    .order('updated_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function previewSavedAudience({ organisationId, rules, limit = 8, offset = 0 }) {
  if (!organisationId) return { count: 0, contacts: [] }
  const { data, error } = await supabase.rpc('email_audience_preview', {
    p_organisation_id: organisationId,
    p_rules: rules || {},
    p_limit: limit,
    p_offset: offset,
  })
  if (error) throw error
  return data || { count: 0, contacts: [] }
}

export async function getAudienceFilterOptions(organisationId) {
  const options = { lead_stage: [], preferred_area: [], tags: [] }
  if (!organisationId) return options
  const values = { lead_stage: new Set(), preferred_area: new Set(), tags: new Set() }
  // Read every page so choices are not limited to the campaign contact sample.
  const pageSize = 500
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase.from('email_marketing_contacts')
      .select('id,lead_stage,area,tags').eq('organisation_id', organisationId)
      .order('id').range(offset, offset + pageSize - 1)
    if (error) throw error
    for (const contact of data || []) {
      if (clean(contact.lead_stage)) values.lead_stage.add(clean(contact.lead_stage))
      if (clean(contact.area)) values.preferred_area.add(clean(contact.area))
      for (const tag of contact.tags || []) if (clean(tag)) values.tags.add(clean(tag))
    }
    if ((data || []).length < pageSize) break
  }
  for (const field of Object.keys(options)) {
    options[field] = [...values[field]].sort((a, b) => a.localeCompare(b))
  }
  return options
}

export async function saveClientMarketingTags({ organisationId, client, tags }) {
  const email = normalizeEmail(client?.email)
  if (!organisationId) throw new Error('Select an organisation before updating client tags.')
  if (!email) throw new Error('Add an email address before assigning marketing tags.')
  const nextTags = normalizeTags(tags)
  const { data: existing, error: lookupError } = await supabase
    .from('email_marketing_contacts')
    .select('id')
    .eq('organisation_id', organisationId)
    .eq('email', email)
    .maybeSingle()
  if (lookupError) throw lookupError

  const query = existing?.id
    ? supabase.from('email_marketing_contacts').update({ tags: nextTags }).eq('id', existing.id).select().single()
    : supabase.from('email_marketing_contacts').insert({
      organisation_id: organisationId,
      source_type: 'crm',
      email,
      full_name: clean(client?.name) || null,
      role_type: getClientRoleType(client),
      tags: nextTags,
      is_valid_email: true,
    }).select().single()
  const { data, error } = await query
  if (error) throw error
  return data
}

export async function getEmailCampaignWorkspace(organisationId) {
  if (!organisationId) return { campaigns: [], performance: [], identities: [], domains: [], contacts: [], subscriptionTypes: [], deliverability: [], templates: [], savedAudiences: [], usage: [], billingProfile: null, dailyPerformance: [], categoryPerformance: [] }
  const [campaigns, performance, identities, domains, contacts, subscriptionTypes, deliverability, templates, savedAudiences, usage, billingProfile, dailyPerformance, categoryPerformance] = await Promise.all([
    supabase.from('email_campaigns').select('*, email_sender_identities(display_name,from_email,reply_to_email)').eq('organisation_id', organisationId).order('updated_at', { ascending: false }),
    supabase.from('email_campaign_performance').select('*').eq('organisation_id', organisationId),
    supabase.from('email_sender_identities').select('*').eq('organisation_id', organisationId).order('verification_status'),
    supabase.from('email_sending_domains').select('*').eq('organisation_id', organisationId).order('created_at', { ascending: false }),
    supabase.from('email_marketing_contacts').select('*').eq('organisation_id', organisationId).eq('is_valid_email', true).order('created_at', { ascending: false }).limit(250),
    supabase.from('email_subscription_types').select('*').eq('organisation_id', organisationId).eq('is_active', true).order('display_order'),
    supabase.from('email_deliverability_health').select('*').eq('organisation_id', organisationId),
    supabase.from('email_templates').select('*').eq('organisation_id', organisationId).order('updated_at', { ascending: false }),
    supabase.from('email_saved_audiences').select('*').eq('organisation_id', organisationId).is('archived_at', null).order('updated_at', { ascending: false }),
    supabase.from('email_usage_records').select('*').eq('organisation_id', organisationId).order('created_at', { ascending: false }).limit(100),
    supabase.from('email_billing_profiles').select('*').eq('organisation_id', organisationId).maybeSingle(),
    supabase.from('email_campaign_daily_performance').select('*').eq('organisation_id', organisationId).order('metric_date', { ascending: false }).limit(30),
    supabase.from('email_campaign_category_performance').select('*').eq('organisation_id', organisationId).order('recipients', { ascending: false }),
  ])
  for (const result of [campaigns, performance, identities, domains, contacts, subscriptionTypes, deliverability, templates, savedAudiences, usage, billingProfile, dailyPerformance, categoryPerformance]) if (result.error) throw result.error
  // Structured audiences are referenced by ID, so campaign delivery resolves
  // their latest membership at schedule time instead of flattening their rules.
  const campaignAudiences = (savedAudiences.data || []).map((audience) => (
    Array.isArray(audience?.filter_json?.rules)
      ? { ...audience, filter_json: { saved_audience_id: audience.id } }
      : audience
  ))
  return { campaigns: campaigns.data || [], performance: performance.data || [], identities: identities.data || [], domains: domains.data || [], contacts: contacts.data || [], subscriptionTypes: subscriptionTypes.data || [], deliverability: deliverability.data || [], templates: templates.data || [], savedAudiences: campaignAudiences, usage: usage.data || [], billingProfile: billingProfile.data || null, dailyPerformance: dailyPerformance.data || [], categoryPerformance: categoryPerformance.data || [] }
}

const canonicalEmailIntent = (value) => JSON.stringify(value, (_key, entry) => entry && typeof entry === 'object' && !Array.isArray(entry) ? Object.fromEntries(Object.keys(entry).sort().map((key) => [key, entry[key]])) : entry)
const emailCampaignConflict = () => Object.assign(new Error('This email draft changed in another session or is no longer editable. Reload the saved draft before saving again. Your current edits have not been saved.'), { code: 'EMAIL_CAMPAIGN_CONFLICT' })
export async function saveEmailCampaign({ campaign, organisationId, userId }) {
  const payload = {
    organisation_id: organisationId,
    name: clean(campaign.name), subject: clean(campaign.subject), preview_text: clean(campaign.previewText),
    sender_identity_id: campaign.senderIdentityId || null, reply_to_email: clean(campaign.replyToEmail) || null,
    subscription_type_id: campaign.subscriptionTypeId || null,
    audience_filter: campaign.audienceFilter || {}, content_json: { ...(campaign.contentJson || {}), ...(campaign.developmentContext ? { arch9_context: campaign.developmentContext } : {}) }, html: campaign.html || '',
    updated_by: userId || null,
  }
  if (!payload.name) throw new Error('Add a campaign name before saving.')
  const expectedUpdatedAt = campaign.updatedAt || campaign.updated_at
  if (campaign.id && (typeof expectedUpdatedAt !== 'string' || !Number.isFinite(Date.parse(expectedUpdatedAt)))) throw emailCampaignConflict()
  const query = campaign.id
    ? supabase.from('email_campaigns').update(payload).eq('organisation_id', organisationId).eq('status', 'draft').eq('id', campaign.id).eq('updated_at', expectedUpdatedAt).select().single()
    : supabase.from('email_campaigns').insert({ ...payload, ...(campaign.clientId ? { id: campaign.clientId } : {}), created_by: userId }).select().single()
  let outcome
  try { outcome = await query } catch (error) { outcome = { error } }
  const { data, error } = outcome
  if (!campaign.id && campaign.clientId && (error || !data)) {
    const originalError = error || new Error('The email draft save could not be confirmed. Retry the same draft before creating another one.')
    let recovered
    try {
      recovered = await supabase.from('email_campaigns')
        .select('id,organisation_id,name,subject,preview_text,sender_identity_id,reply_to_email,subscription_type_id,audience_filter,content_json,html,updated_by,created_by,status,updated_at')
        .eq('organisation_id', organisationId).eq('id', campaign.clientId).eq('created_by', userId).maybeSingle()
    } catch { throw originalError }
    if (recovered.error || !recovered.data) throw originalError
    const expected = { ...payload, created_by: userId }
    const actual = Object.fromEntries(Object.keys(expected).map((key) => [key, recovered.data[key]]))
    if (recovered.data.id === campaign.clientId && recovered.data.organisation_id === organisationId && recovered.data.created_by === userId && recovered.data.status === 'draft' && canonicalEmailIntent(expected) === canonicalEmailIntent(actual)) return recovered.data
    throw Object.assign(new Error('This draft identity already has saved work. Reopen the saved draft before continuing; your current changes have not replaced it.'), { code: error?.code || 'EMAIL_CAMPAIGN_CREATE_CONFLICT' })
  }
  if (campaign.id && ((!error && !data) || error?.code === 'PGRST116')) throw emailCampaignConflict()
  if (error) throw error
  return data
}

export async function scheduleEmailCampaign(campaignId, scheduledFor) {
  const contentCheck = await checkEmailCampaignContent(campaignId)
  if (!contentCheck.ready) throw new Error(contentCheck.errors?.[0] || 'Resolve the campaign content issues before scheduling.')
  const { data, error } = await supabase.rpc('email_campaign_prepare_dispatch', { p_campaign_id: campaignId, p_send_at: scheduledFor || new Date().toISOString() })
  if (error) throw error
  return data
}

export async function cancelEmailCampaign(campaignId) {
  const { error } = await supabase.rpc('email_campaign_cancel', { p_campaign_id: campaignId })
  if (error) throw error
}

export async function preflightEmailCampaign(campaignId) {
  const contentCheck = await checkEmailCampaignContent(campaignId)
  const { data, error } = await supabase.rpc('email_campaign_preflight', { p_campaign_id: campaignId })
  if (error) throw error
  return { ...data, ready: Boolean(data?.ready && contentCheck.ready), contentCheck, checks: [...(data?.checks || []), { key: 'content', ok: contentCheck.ready }] }
}

export async function checkEmailCampaignContent(campaignId) {
  const { data, error } = await supabase.functions.invoke('email-campaign-content-check', { body: { campaignId } })
  if (error) throw new Error('Email content checking is unavailable. Ask your workspace administrator to enable it, then try again.')
  if (data?.error) throw new Error(data.error)
  if (!data || typeof data.ready !== 'boolean' || !Array.isArray(data.errors) || !Array.isArray(data.warnings)) throw new Error('The email content check could not be confirmed. Try again before sending.')
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
  if (error) throw await emailSetupError(error)
  if (data?.error) throw new Error(data.error)
  return data
}

export async function refreshEmailSenderVerification(organisationId) {
  const { data, error } = await supabase.functions.invoke('email-sender-verification', { body: { organisationId } })
  if (error) throw await emailSetupError(error)
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

export async function archiveEmailAudience({ organisationId, audienceId }) {
  const { error } = await supabase
    .from('email_saved_audiences')
    .update({ archived_at: new Date().toISOString() })
    .eq('organisation_id', organisationId)
    .eq('id', audienceId)
  if (error) throw error
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

export async function getEmailDraft(organisationId, id) {
  const { data, error } = await supabase.from('email_campaigns').select('*').eq('organisation_id', organisationId).eq('id', id).eq('status', 'draft').single()
  if (error) throw error
  return data
}
export async function getEmailRevisions(organisationId, id) {
  const { data, error } = await supabase.from('email_campaign_revisions').select('*').eq('organisation_id', organisationId).eq('campaign_id', id).order('created_at', { ascending: false }).limit(30)
  if (error) throw error
  return data
}
export async function createEmailSendingDomain({ organisationId, domain }) {
  const { data, error } = await supabase.functions.invoke('email-sending-domain-create', { body: { organisationId, domain } })
  if (error) throw await emailSetupError(error)
  if (data?.error) throw new Error(data.error)
  return data
}

export async function verifyEmailSendingDomain({ organisationId, domainId }) {
  const { data, error } = await supabase.functions.invoke('email-sending-domain-verify', { body: { organisationId, domainId } })
  if (error) throw await emailSetupError(error)
  if (data?.error) throw new Error(data.error)
  return data
}

export async function getEmailSendingPolicy(organisationId) {
  const { data, error } = await supabase.from('email_sending_policies')
    .select('approved_at,paused_at,pause_reason,daily_recipient_limit,self_service_blocked')
    .eq('organisation_id', organisationId).maybeSingle()
  if (error) throw error
  return data
}

export async function createEmailSender({ organisationId, displayName, email, sendingDomainId, replyToEmail, makeDefault = true, identityId = null }) {
  const { data, error } = await supabase.rpc('email_save_sender', {
    p_organisation_id: organisationId, p_domain_id: sendingDomainId,
    p_display_name: clean(displayName), p_email: normalizeEmail(email),
    p_reply_to: normalizeEmail(replyToEmail || email), p_default: makeDefault, p_identity_id: identityId,
  })
  if (error) throw error
  return data
}
