import { buildTemplateMessage, canonicalJson, clean, MAX_CAMPAIGN_RECIPIENTS, normalizePhone, templateIdentity } from '../_shared/whatsappCampaign.js'

const uuid = (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clean(v))
const result = async (query) => { const { data, error } = await query; if (error) throw new Error(error.message); return data }
async function allRows(query) {
  const rows = []
  for (let offset = 0; ; offset += 500) {
    const page = await result(query().range(offset, offset + 499))
    rows.push(...page)
    if (page.length < 500) return rows
  }
}
const safeSenderFields = 'id,organisation_id,business_display_name,display_phone_number,connection_status,verification_status,waba_id,phone_number_id'

export function createCampaignHandler({ db, authorize, meta }) {
  async function sender(org, id) {
    if (!uuid(id)) throw new Error('Choose a connected WhatsApp sender.')
    const row = await result(db.from('organisation_communication_channels').select('*').eq('organisation_id', org).eq('id', id).eq('provider', 'meta').eq('channel_type', 'whatsapp').eq('connection_status', 'connected').single())
    if (!row.meta_access_token || !/^\d+$/.test(row.waba_id) || !/^\d+$/.test(row.phone_number_id)) throw new Error('The sender needs its Meta access token, WhatsApp Business Account ID and Phone Number ID configured by an administrator.')
    return row
  }
  async function templates(connection, name = '') {
    const rows = []
    let after = ''
    for (let page = 0; page < 100; page++) {
      const query = new URLSearchParams({ fields: 'id,name,status,category,language,components,parameter_format', limit: '100', ...(after ? { after } : {}), ...(name ? { name } : {}) })
      const body = await meta(connection, `${connection.waba_id}/message_templates?${query}`)
      rows.push(...(body.data || []))
      if (!body.paging?.next) return rows
      after = body.paging.cursors?.after
      if (!after) throw new Error('Meta returned incomplete template pagination. Please try again.')
    }
    throw new Error('Too many templates to load. Please narrow the selection in WhatsApp Manager.')
  }
  async function campaign(org, id) {
    if (!uuid(id)) throw new Error('Choose a campaign.')
    return result(db.from('whatsapp_campaigns').select('*').eq('organisation_id', org).eq('id', id).single())
  }
  async function validateCampaign(org, row) {
    const connection = await sender(org, row.sender_id)
    const available = await templates(connection, row.template?.name)
    const template = available.find((t) => t.id === row.template?.id && t.language === row.template?.language)
    if (!template || template.status !== 'APPROVED') throw new Error('The selected template is no longer approved for this sender. Choose an approved template.')
    if (templateIdentity(template) !== templateIdentity(row.template)) throw new Error('Meta changed this template. Reload it and review your message before sending.')
    if (!row.contact_ids?.length || row.contact_ids.length > MAX_CAMPAIGN_RECIPIENTS) throw new Error(`Choose between 1 and ${MAX_CAMPAIGN_RECIPIENTS} recipients.`)
    const contacts = await result(db.from('whatsapp_marketing_contacts').select('*').eq('organisation_id', org).in('id', row.contact_ids))
    if (contacts.length !== row.contact_ids.length || contacts.some((c) => c.consent_status !== 'opted_in' || c.opted_out_at)) throw new Error('Some recipients no longer have opt-in permission. Review your audience.')
    const messages = contacts.map((contact) => ({ contact_id: contact.id, payload: buildTemplateMessage(template, row.parameter_values, contact) }))
    return { connection, template, messages }
  }
  return async function handle(payload, authorization) {
    // No service-role or anonymous caller bypass: every browser operation requires
    // a real user and the established active-organisation membership predicate.
    const org = clean(payload.organisationId)
    if (!uuid(org)) throw new Error('Select an organisation workspace.')
    const actor = await authorize(authorization, org)
    if (!actor) throw new Error('Sign in with an active membership of this organisation.')
    switch (payload.action) {
      case 'workspace': {
        const [campaigns, contacts, senders] = await Promise.all([
          allRows(() => db.from('whatsapp_campaign_performance').select('*').eq('organisation_id', org).order('created_at', { ascending: false }).order('id')),
          allRows(() => db.from('whatsapp_marketing_contacts').select('*').eq('organisation_id', org).order('full_name').order('id')),
          result(db.from('organisation_communication_channels').select(safeSenderFields).eq('organisation_id', org).eq('provider', 'meta').eq('channel_type', 'whatsapp').order('created_at')),
        ])
        return { campaigns, contacts, senders }
      }
      case 'crm_contacts': return { contacts: await allRows(() => db.from('contacts').select('contact_id,first_name,last_name,phone').eq('organisation_id', org).order('contact_id')) }
      case 'templates': return { templates: await templates(await sender(org, payload.senderId)) }
      case 'save_contact': {
        const contact = payload.contact || {}
        const phone = normalizePhone(contact.phone)
        const name = clean(contact.full_name)
        if (!phone || !name || name.length > 200) throw new Error('Add a name and a valid international phone number (or a South African local number).')
        const consent = contact.consent_status === 'opted_in'
        const source = clean(contact.consent_source)
        const at = new Date(contact.consent_at)
        if (consent && (contact.confirmed !== true || !source || source.length > 1000 || !Number.isFinite(at.getTime()) || at.getTime() > Date.now())) throw new Error('Record when and how the recipient opted in, and confirm that the permission covers your WhatsApp messages.')
        const row = { organisation_id: org, full_name: name, phone, consent_status: consent ? 'opted_in' : 'unknown', consent_source: consent ? source : null, consent_at: consent ? at.toISOString() : null, opted_out_at: null, updated_by: actor, updated_at: new Date().toISOString() }
        // Existing permissions can only be replaced by an explicit new opt-in.
        const existing = await result(db.from('whatsapp_marketing_contacts').select('id').eq('organisation_id', org).eq('phone', phone).maybeSingle())
        if (existing && !consent) throw new Error('This phone is already recorded. Use its opt-out action or record a new opt-in.')
        return { contact: await result(db.from('whatsapp_marketing_contacts').upsert(row, { onConflict: 'organisation_id,phone' }).select().single()) }
      }
      case 'opt_out': {
        if (!uuid(payload.contactId)) throw new Error('Choose a contact.')
        return { contact: await result(db.from('whatsapp_marketing_contacts').update({ consent_status: 'opted_out', opted_out_at: new Date().toISOString(), updated_at: new Date().toISOString(), updated_by: actor }).eq('organisation_id', org).eq('id', payload.contactId).select().single()) }
      }
      case 'save': {
        const draft = payload.campaign || {}
        const name = clean(draft.name)
        if (!name || name.length > 100) throw new Error('Add a campaign name of up to 100 characters.')
        if (draft.sender_id) await sender(org, draft.sender_id)
        const ids = [...new Set(draft.contact_ids || [])]
        if (ids.length > MAX_CAMPAIGN_RECIPIENTS || ids.some((id) => !uuid(id))) throw new Error(`Select up to ${MAX_CAMPAIGN_RECIPIENTS} contacts.`)
        const fields = { name, sender_id: draft.sender_id || null, template: draft.template || {}, parameter_values: draft.parameter_values || {}, contact_ids: ids, updated_at: new Date().toISOString() }
        if (draft.id) {
          if (!uuid(draft.id) || !Number.isInteger(draft.revision)) throw new Error('Reload the draft before saving.')
          return { campaign: await result(db.from('whatsapp_campaigns').update({ ...fields, revision: draft.revision + 1 }).eq('organisation_id', org).eq('id', draft.id).eq('status', 'draft').eq('revision', draft.revision).select().single()) }
        }
        if (!uuid(draft.client_id)) throw new Error('A draft identifier is required.')
        // Stable client ID means a lost save response cannot create two drafts.
        const existing = await result(db.from('whatsapp_campaigns').select('*').eq('organisation_id', org).eq('id', draft.client_id).maybeSingle())
        if (existing) {
          const savedFields = Object.fromEntries(Object.keys(fields).filter((key) => key !== 'updated_at').map((key) => [key, existing[key]]))
          const requestedFields = { ...fields }; delete requestedFields.updated_at
          if (existing.status !== 'draft' || canonicalJson(savedFields) !== canonicalJson(requestedFields)) throw new Error('This draft was already saved with different details. Reopen it from the campaign list before making further changes.')
          return { campaign: existing }
        }
        return { campaign: await result(db.from('whatsapp_campaigns').insert({ ...fields, id: draft.client_id, organisation_id: org, created_by: actor }).select().single()) }
      }
      case 'preflight': {
        const row = await campaign(org, payload.campaignId)
        if (row.status !== 'draft') throw new Error('This campaign has already started.')
        if (payload.revision !== row.revision) throw new Error('This draft changed. Reopen it before reviewing and sending.')
        const validated = await validateCampaign(org, row)
        return { recipients: validated.messages.length, revision: row.revision }
      }
      case 'prepare': {
        const row = await campaign(org, payload.campaignId)
        if (row.status !== 'draft') return { campaignId: row.id }
        if (payload.revision !== row.revision) throw new Error('This draft changed. Review it again before sending.')
        const { template, messages } = await validateCampaign(org, row)
        await result(db.rpc('whatsapp_campaign_prepare', { p_id: row.id, p_org: org, p_revision: row.revision, p_template: template, p_messages: messages }))
        return { campaignId: row.id }
      }
      case 'dispatch': {
        const row = await campaign(org, payload.campaignId)
        if (row.status !== 'sending') throw new Error('Review and confirm the campaign before sending.')
        const connection = await sender(org, row.sender_id)
        if (connection.phone_number_id !== row.phone_number_id || connection.waba_id !== row.waba_id) throw new Error('The sender changed. Remaining messages have been paused.')
        const available = await templates(connection, row.template.name)
        const current = available.find((t) => t.id === row.template.id && t.language === row.template.language)
        if (current?.status !== 'APPROVED' || templateIdentity(current) !== templateIdentity(row.template)) throw new Error('The template changed or is no longer approved. Remaining messages have been paused.')
        const queued = await result(db.from('whatsapp_campaign_recipients').select('id').eq('organisation_id', org).eq('campaign_id', row.id).eq('status', 'queued').order('id').limit(5))
        await Promise.all(queued.map(async ({ id }) => {
          const claimed = await result(db.rpc('whatsapp_campaign_claim', { p_id: id, p_org: org }))
          const recipient = claimed?.[0]
          if (!recipient) return
          let response
          try {
            response = await meta(connection, `${connection.phone_number_id}/messages`, { ...recipient.payload, biz_opaque_callback_data: `arch9-wa:${recipient.id}` })
          } catch (error) {
            await result(db.from('whatsapp_campaign_recipients').update({ status: error.definitive ? 'failed' : 'unknown', error_message: error.definitive ? error.message : 'Meta response was not confirmed. Check delivery before sending another campaign to this recipient.', ...(error.definitive ? { failed_at: new Date().toISOString() } : {}), updated_at: new Date().toISOString() }).eq('id', recipient.id).eq('status', 'processing'))
            return
          }
          const messageId = response.messages?.[0]?.id
          if (!messageId) {
            await result(db.from('whatsapp_campaign_recipients').update({ status: 'unknown', error_message: 'Meta returned no message ID. Check delivery before sending again.' }).eq('id', recipient.id).eq('status', 'processing'))
            return
          }
          await result(db.rpc('whatsapp_campaign_status', { p_message_id: messageId, p_callback: `arch9-wa:${recipient.id}`, p_phone_id: connection.phone_number_id, p_waba_id: connection.waba_id, p_status: 'sent', p_at: new Date().toISOString(), p_error: null }))
        }))
        return { campaign: await result(db.from('whatsapp_campaign_performance').select('*').eq('organisation_id', org).eq('id', row.id).single()) }
      }
      case 'detail': {
        const row = await campaign(org, payload.campaignId)
        return { campaign: row, recipients: await allRows(() => db.from('whatsapp_campaign_recipients').select('id,full_name,phone,status,error_message,attempted_at,sent_at,delivered_at,read_at').eq('organisation_id', org).eq('campaign_id', row.id).order('id')) }
      }
      default: throw new Error('Unknown WhatsApp campaign action.')
    }
  }
}
