import { archiveMarketingAudience, saveMarketingAudience } from './marketingAudienceService'
import { supabase } from '../lib/supabaseClient'

const clean = (value) => String(value || '').trim()
const normalizeEmail = (value) => clean(value).toLowerCase()

async function emailSetupError(error, fallback = '') {
  // Function HTTP failures carry the actionable message in their response body.
  // Keep it visible so an agency can resolve DNS, ownership or limit errors.
  try {
    const payload = await error.context?.clone().json()
    const message = [payload?.error, payload?.message, payload?.error?.message].find(value => typeof value === 'string' && value.trim())
    if (message) return new Error(message, { cause: error })
  } catch { /* Fall back to the original network error. */ }
  return fallback ? new Error(fallback, { cause: error }) : error
}

function normalizeTags(tags = []) {
  return [...new Set((Array.isArray(tags) ? tags : String(tags).split(','))
    .map((tag) => clean(tag).toLowerCase())
    .filter(Boolean))]
}

export async function getClientMarketingWorkspace({ organisationId, email = '', clientId = '' }) {
  if (!organisationId) return { marketingContact: null, marketingContacts: [], savedAudiences: [] }
  let snapshot = null
  if (clientId) {
    const { data, error } = await supabase.rpc('client_tag_workspace', { p_organisation_id: organisationId, p_client_id: clientId })
    if (error) throw error
    snapshot = data
  }
  const emails = snapshot?.emails || [normalizeEmail(email)].filter(Boolean)
  const contacts = []
  // Bound the REST URL even when years of source edits retain many aliases.
  for (let first = 0; first < emails.length; first += 100) {
    const aliases = emails.slice(first, first + 100)
    const { data, error } = await supabase.from('email_marketing_contacts').select('*').eq('organisation_id', organisationId).in('email', aliases).order('id').limit(100)
    if (error) throw error
    contacts.push(...(data || []))
  }
  const { data: savedAudiences, error } = await supabase.from('email_saved_audiences').select('*').eq('organisation_id', organisationId).is('archived_at', null).order('updated_at', { ascending: false })
  if (error) throw error
  const marketingContacts = contacts.map(contact => snapshot ? { ...contact, tags: snapshot.tags } : contact)
  return { ...snapshot, marketingContact: marketingContacts.find(contact => contact.email === normalizeEmail(email)) || marketingContacts[0] || null, marketingContacts, savedAudiences: savedAudiences || [] }
}

export async function getClientAudienceMemberships({ organisationId, marketingContact, savedAudiences = [] }) {
  if (!organisationId || !marketingContact || marketingContact.is_valid_email === false || marketingContact.organisation_id !== organisationId) return []
  const audiences = savedAudiences.filter(audience => audience.organisation_id === organisationId && !audience.archived_at)
  const matches = await Promise.all(audiences.map(async audience => {
    if (audience.definition || audience.filter_json?.shared_audience_id) {
      const { data, error } = await supabase.rpc('marketing_audience_has_email_contact', { p_org: organisationId, p_audience: audience.id, p_contact: marketingContact.id })
      if (error) throw error
      return data === true
    }
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

export async function saveClientMarketingTags({ organisationId, client, tags, tagVersion }) {
  if (!organisationId) throw new Error('Select an organisation before updating client tags.')
  if (!client?.identityId) throw new Error('Refresh this client to load its shared profile before assigning tags.')
  if (tagVersion == null) throw new Error('Refresh client tags before saving.')
  const nextTags = normalizeTags(tags)
  if (nextTags.length > 100 || nextTags.some(tag => tag.length > 60)) throw new Error('Use up to 100 tags, each 1–60 characters.')
  const { data, error } = await supabase.rpc('client_tags_save', {
    p_organisation_id: organisationId, p_client_id: client.identityId,
    p_expected_version: tagVersion, p_tags: nextTags,
  })
  if (error) throw error
  return data
}

export async function loadEmailContactChoices(organisationId) {
  const contacts=[]
  if(!organisationId)return {data:contacts,error:null}
  for(let offset=0;;offset+=500){
    const result=await supabase.from('email_marketing_contacts').select('*').eq('organisation_id',organisationId).eq('is_valid_email',true).order('id').range(offset,offset+499)
    if(result.error)return {data:null,error:result.error}
    contacts.push(...(result.data||[]))
    if((result.data||[]).length<500)return {data:contacts,error:null}
  }
}

export async function getEmailCampaignWorkspace(organisationId) {
  if (!organisationId) return { campaigns: [], performance: [], identities: [], domains: [], contacts: [], subscriptionTypes: [], deliverability: [], templates: [], savedAudiences: [], usage: [], billingProfile: null, dailyPerformance: [], categoryPerformance: [] }
  const [campaigns, performance, identities, domains, contacts, subscriptionTypes, deliverability, templates, savedAudiences, usage, billingProfile, dailyPerformance, categoryPerformance] = await Promise.all([
    supabase.from('email_campaigns').select('*, email_sender_identities(display_name,from_email,reply_to_email)').eq('organisation_id', organisationId).order('updated_at', { ascending: false }),
    supabase.from('email_campaign_performance').select('*').eq('organisation_id', organisationId),
    supabase.from('email_sender_identities').select('*').eq('organisation_id', organisationId).order('verification_status'),
    supabase.from('email_sending_domains').select('*').eq('organisation_id', organisationId).order('created_at', { ascending: false }),
    loadEmailContactChoices(organisationId),
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
  const platformStatus = await supabase.rpc('email_campaign_platform_sender_status', { p_organisation_id: organisationId })
  const platformSender = platformStatus.error ? { ready: false, available: false } : { ...platformStatus.data, available: true }
  // Saved selections keep their common ID and reviewed criteria revision.
  // Membership stays live; a criteria change requires choosing the audience again.
  const campaignAudiences = (savedAudiences.data || []).map((audience) => (
    audience.id
      ? { ...audience, filter_json: { saved_audience_id: audience.id, ...(Number.isInteger(audience.revision) ? { audience_revision: audience.revision } : {}) } }
      : audience
  ))
  return { platformSender, campaigns: campaigns.data || [], performance: performance.data || [], identities: identities.data || [], domains: domains.data || [], contacts: contacts.data || [], subscriptionTypes: subscriptionTypes.data || [], deliverability: deliverability.data || [], templates: templates.data || [], savedAudiences: campaignAudiences, usage: usage.data || [], billingProfile: billingProfile.data || null, dailyPerformance: dailyPerformance.data || [], categoryPerformance: categoryPerformance.data || [] }
}

const canonicalEmailIntent = (value) => JSON.stringify(value, (_key, entry) => entry && typeof entry === 'object' && !Array.isArray(entry) ? Object.fromEntries(Object.keys(entry).sort().map((key) => [key, entry[key]])) : entry)
const emailCampaignConflict = () => Object.assign(new Error('This email draft changed in another session or is no longer editable. Reload the saved draft before saving again. Your current edits have not been saved.'), { code: 'EMAIL_CAMPAIGN_CONFLICT' })
export async function saveEmailCampaign({ campaign, organisationId, userId }) {
  const contentJson = { ...(campaign.contentJson || {}) }
  if (Object.hasOwn(campaign, 'developmentContext')) {
    delete contentJson.arch9_context
    if (campaign.developmentContext) contentJson.arch9_context = campaign.developmentContext
  }
  const payload = {
    organisation_id: organisationId,
    name: clean(campaign.name), subject: clean(campaign.subject), preview_text: clean(campaign.previewText),
    sender_identity_id: campaign.senderIdentityId || null, reply_to_email: clean(campaign.replyToEmail) || null,
    subscription_type_id: campaign.subscriptionTypeId || null,
    audience_filter: campaign.audienceFilter || {}, content_json: contentJson, html: campaign.html || '',
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
  if (typeof data?.ready !== 'boolean' || !Array.isArray(data.checks) || !data.checks.length || data.checks.some(check => typeof check?.ok !== 'boolean')) {
    throw new Error('Sending readiness could not be confirmed. Refresh the campaign and try again.')
  }
  const messages = {
    sender: 'Choose a verified, active sender and check its sending domain in Email settings.',
    subscription: 'Choose an active email subscription category.',
    policy: 'Organisation sending is paused or not approved. Check the sending controls in Email settings.',
    audience: 'There are no eligible recipients. Check the selected audience, consent and subscription category.',
    account: 'Arch9 sending capacity is unavailable. Check Email settings or contact your workspace administrator.',
  }
  const failed = data.checks.filter(check => !check.ok)
  const issues = [...new Set([...contentCheck.errors, ...failed.map(check => messages[check.key] || 'A sending readiness check failed. Refresh the campaign and try again.')])]
  return { ...data, ready: data.ready && contentCheck.ready && !failed.length, issues, contentCheck, checks: [...data.checks, { key: 'content', ok: contentCheck.ready }] }
}

export async function checkEmailCampaignContent(campaignId) {
  const { data, error } = await supabase.functions.invoke('email-campaign-content-check', { body: { campaignId } })
  if (error) throw await emailSetupError(error, 'Email content checking is unavailable. Ask your workspace administrator to enable it, then try again.')
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

function canonicalTestIntent(value) {
  if (Array.isArray(value)) return value.map(canonicalTestIntent)
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().filter(key => value[key] !== undefined).map(key => [key, canonicalTestIntent(value[key])]))
  return value
}

export async function sendEmailCampaignTest(payload) {
  const { testGeneration = 'initial', ...intent } = payload
  // Keys contain no contact details or message text.
  const bytes = new TextEncoder().encode(JSON.stringify(canonicalTestIntent({ ...intent, testGeneration })))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  const requestId = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
  let result
  try { result = await supabase.functions.invoke('email-campaign-test', { body: { ...intent, requestId } }) }
  catch { throw Object.assign(new Error('Test acceptance could not be confirmed. Check the recipient inbox before starting another test.'), { deliveryUncertain: true }) }
  const { data, error } = result || {}
  if (error) {
    const failure = await emailSetupError(error)
    const status = error.context?.status
    let details = null
    try { details = await error.context?.clone?.().json() } catch { /* Some SDK/network responses have already consumed their body. */ }
    failure.deliveryUncertain = typeof details?.deliveryUncertain === 'boolean' ? details.deliveryUncertain : !(status >= 400 && status < 500 && status !== 408)
    throw failure
  }
  if (data?.error) throw Object.assign(new Error(data.error), { deliveryUncertain: true })
  if (typeof data?.providerMessageId !== 'string' || !data.providerMessageId.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data?.deliveredTo || '') || (payload.recipientEmail && normalizeEmail(data.deliveredTo) !== normalizeEmail(payload.recipientEmail))) throw Object.assign(new Error('Test acceptance could not be confirmed. Check the recipient inbox before starting another test.'), { deliveryUncertain: true })
  return data
}

export async function refreshEmailSenderVerification(organisationId) {
  const { data, error } = await supabase.functions.invoke('email-sender-verification', { body: { organisationId } })
  if (error) throw await emailSetupError(error)
  if (data?.error) throw new Error(data.error)
  return data
}

export async function saveEmailTemplate({ organisationId, userId, template }) {
  if (!clean(organisationId)) throw new Error('Choose an organisation before saving this template.')
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
    ? supabase.from('email_templates').update(payload).eq('organisation_id', organisationId).eq('id', template.id).select().single()
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
  if (!organisationId || !clean(audience.name)) throw new Error('Choose an organisation and name this audience.')
  const capability = await supabase.rpc('marketing_audience_validate', { p_definition: { emailFilter: {} } })
  if (capability.error && !['PGRST202', '42883'].includes(capability.error.code)) throw capability.error
  if (capability.data === true) {
    if (audience.id && !Number.isInteger(audience.revision)) throw new Error('Refresh this audience before saving.')
    return saveMarketingAudience(organisationId, { ...audience, visibility: audience.visibility || 'personal', definition: { emailFilter: audience.filterJson || {} } })
  }
  // A read-only capability probe selects the legacy path before any write.
  // Never fall back after a save failure, which might have committed remotely.
  const payload = {organisation_id: organisationId, name: clean(audience.name), description: clean(audience.description), filter_json: audience.filterJson || {}, created_by: userId || null}
  const query = audience.id ? supabase.from('email_saved_audiences').update(payload).eq('organisation_id', organisationId).eq('id', audience.id).select().single() : supabase.from('email_saved_audiences').insert(payload).select().single()
  const {data,error} = await query
  if (error) throw error
  return data
}

export async function archiveEmailAudience({ organisationId, audienceId, revision }) {
  if (!Number.isInteger(revision)) throw new Error('Refresh this audience before archiving.')
  return archiveMarketingAudience(organisationId, { id: audienceId, revision })
}

export async function getClientSharedAudienceMemberships({ organisationId, clientId }) {
  if (!organisationId || !clientId) return []
  const { data, error } = await supabase.rpc('client_audience_memberships', { p_org: organisationId, p_client: clientId })
  if (error) throw error
  return data || []
}

export async function getEmailCampaignAnalytics(campaignId) {
  if (!campaignId) return { recipients: [], events: [], links: [], audit: [], delivery: null }
  const [recipients, events, links, audit, delivery] = await Promise.all([
    supabase.from('email_campaign_recipients').select('id,email,recipient_snapshot,status,error_reason,sent_at,delivered_at,opened_at,clicked_at,bounced_at').eq('campaign_id', campaignId).order('created_at', { ascending: false }),
    supabase.from('email_events').select('id,recipient_id,event_type,url,occurred_at').eq('campaign_id', campaignId).order('occurred_at', { ascending: false }).limit(500),
    supabase.from('email_campaign_link_performance').select('*').eq('campaign_id', campaignId).order('unique_clickers', { ascending: false }),
    supabase.from('email_campaign_audit_events').select('*').eq('campaign_id', campaignId).order('created_at', { ascending: false }).limit(30),
    supabase.rpc('email_campaign_delivery_status', { p_campaign_id: campaignId }),
  ])
  for (const result of [recipients, events, links, audit]) if (result.error) throw result.error
  return { recipients: recipients.data || [], events: events.data || [], links: links.data || [], audit: audit.data || [], delivery: delivery?.error || typeof delivery?.data?.state !== 'string' ? null : delivery.data }
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
    .select('approved_at,paused_at,pause_reason,daily_recipient_limit,self_service_blocked,organisation_daily_limit,manual_paused_at')
    .eq('organisation_id', organisationId).maybeSingle()
  if (error) throw error
  if (!data) return null
  const status = await supabase.rpc('email_campaign_controls_status', { p_organisation_id: organisationId })
  if (status.error) throw status.error
  return { ...data, ...status.data }
}

export async function setEmailSendingControls({ organisationId, paused, dailyLimit }) {
  const { error } = await supabase.rpc('email_campaign_set_controls', {
    p_organisation_id: organisationId, p_paused: paused, p_daily_limit: Number(dailyLimit),
  })
  if (error) throw error
}

export async function createEmailSender({ organisationId, displayName, email, sendingDomainId, replyToEmail, makeDefault = true, identityId = null, senderMode = 'custom' }) {
  if (senderMode === 'arch9') {
    const { data, error } = await supabase.rpc('email_save_platform_sender', {
      p_organisation_id: organisationId, p_display_name: clean(displayName), p_reply_to: normalizeEmail(replyToEmail),
      p_default: makeDefault, p_identity_id: identityId,
    })
    if (error) throw error
    return data
  }
  if (senderMode !== 'custom') throw new Error('Choose a valid sending option.')
  const { data, error } = await supabase.rpc('email_save_sender', {
    p_organisation_id: organisationId, p_domain_id: sendingDomainId,
    p_display_name: clean(displayName), p_email: normalizeEmail(email),
    p_reply_to: normalizeEmail(replyToEmail || email), p_default: makeDefault, p_identity_id: identityId,
  })
  if (error) throw error
  return data
}
