import { replyPlan } from '../_shared/whatsappAudience.js'
import { campaignResult as result, createCampaignDelivery } from '../_shared/whatsappCampaignDelivery.js'

import { buildTemplateMessage, clean, MAX_CAMPAIGN_RECIPIENTS, normalizePhone, templateIdentity } from '../_shared/whatsappCampaign.js'

const uuid = (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clean(v))
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
  const { sender: loadSender, templates } = createCampaignDelivery({ db, meta })
  const sender = async (org, id) => {
    if (!uuid(id)) throw new Error('Choose a connected WhatsApp sender.')
    return loadSender(org, id)
  }
  async function campaign(org, id, actor) {
    if (!uuid(id)) throw new Error('Choose a campaign.')
    if(actor?.userDb){const accessible=await result(actor.userDb.from('whatsapp_campaigns').select('id').eq('organisation_id',org).eq('id',id).maybeSingle());if(!accessible)throw new Error('Campaign not found in your current workspace access.')}
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
    const authorizationResult = await authorize(authorization, org)
    const actor = typeof authorizationResult === 'string' ? {userId:authorizationResult} : authorizationResult
    if (!actor?.userId) throw new Error('Sign in with an active membership of this organisation.')
    switch (payload.action) {
      case 'workspace': {
        const [campaigns, contacts, senders] = await Promise.all([
          allRows(() => db.from('whatsapp_campaign_performance').select('*').eq('organisation_id', org).order('created_at', { ascending: false }).order('id')),
          allRows(() => db.from('whatsapp_marketing_contacts').select('*').eq('organisation_id', org).order('full_name').order('id')),
          result(db.from('organisation_communication_channels').select(safeSenderFields).eq('organisation_id', org).eq('provider', 'meta').eq('channel_type', 'whatsapp').is('owner_user_id', null).order('created_at')),
        ])
        const access=await result(db.rpc('whatsapp_campaign_plan_request',{p_org:org,p_actor:actor.userId,p_action:'list'}))
        const visible=new Map(access.campaigns.map(row=>[row.id,row.plan]))
        return { campaigns:campaigns.filter(row=>visible.has(row.id)).map(row=>({...row,audience_plan:visible.get(row.id)})),contacts,senders }
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
        const row = { organisation_id: org, full_name: name, phone, consent_status: consent ? 'opted_in' : 'unknown', consent_source: consent ? source : null, consent_at: consent ? at.toISOString() : null, opted_out_at: null, updated_by: actor.userId, updated_at: new Date().toISOString() }
        // Existing permissions can only be replaced by an explicit new opt-in.
        const existing = await result(db.from('whatsapp_marketing_contacts').select('id').eq('organisation_id', org).eq('phone', phone).maybeSingle())
        if (existing && !consent) throw new Error('This phone is already recorded. Use its opt-out action or record a new opt-in.')
        return { contact: await result(db.from('whatsapp_marketing_contacts').upsert(row, { onConflict: 'organisation_id,phone' }).select().single()) }
      }
      case 'opt_out': {
        if (!uuid(payload.contactId)) throw new Error('Choose a contact.')
        return { contact: await result(db.from('whatsapp_marketing_contacts').update({ consent_status: 'opted_out', opted_out_at: new Date().toISOString(), updated_at: new Date().toISOString(), updated_by: actor.userId }).eq('organisation_id', org).eq('id', payload.contactId).select().single()) }
      }
      case 'save': {
        const draft = payload.campaign || {}
        const name = clean(draft.name)
        if (!name || name.length > 100) throw new Error('Add a campaign name of up to 100 characters.')
        if (draft.sender_id) await sender(org, draft.sender_id)
        const ids = [...new Set(draft.contact_ids || [])]
        if (ids.length > MAX_CAMPAIGN_RECIPIENTS || ids.some((id) => !uuid(id))) throw new Error(`Select up to ${MAX_CAMPAIGN_RECIPIENTS} contacts.`)
        const scheduledAt = draft.scheduled_at ? new Date(draft.scheduled_at) : null
        if (scheduledAt && (!Number.isFinite(scheduledAt.getTime()) || scheduledAt.getTime() <= Date.now())) throw new Error('Choose a future sending time.')
        const fields = { scheduled_at: scheduledAt?.toISOString() || null, name, sender_id: draft.sender_id || null, template: draft.template || {}, parameter_values: draft.parameter_values || {}, contact_ids: ids, updated_at: new Date().toISOString() }
        if(draft.id&&(!uuid(draft.id)||!Number.isInteger(draft.revision)))throw new Error('Reload the draft before saving.')
        if(!draft.id&&!uuid(draft.client_id))throw new Error('A draft identifier is required.')
        delete fields.updated_at
        return result(db.rpc('whatsapp_campaign_plan_request',{p_org:org,p_actor:actor.userId,p_action:'save',p_id:draft.id||draft.client_id,p_version:draft.revision??null,p_existing:Boolean(draft.id),p_fields:fields,p_plan:replyPlan(draft.audience_plan)}))
      }
      case 'preflight': {
        const row = await campaign(org, payload.campaignId, actor)
        if (row.status !== 'draft') throw new Error('This campaign has already started.')
        if (payload.revision !== row.revision) throw new Error('This draft changed. Reopen it before reviewing and sending.')
        if (row.scheduled_at && new Date(row.scheduled_at).getTime() <= Date.now()) throw new Error('Choose a future sending time.')
        if(actor.userDb)await result(db.rpc('whatsapp_campaign_plan_request',{p_org:org,p_actor:actor.userId,p_action:'validate',p_id:row.id}))
        const validated = await validateCampaign(org, row)
        return { recipients: validated.messages.length, revision: row.revision }
      }
      case 'prepare': {
        const row = await campaign(org, payload.campaignId, actor)
        if (row.status !== 'draft') return { campaignId: row.id }
        if (payload.revision !== row.revision) throw new Error('This draft changed. Review it again before sending.')
        if(actor.userDb)await result(db.rpc('whatsapp_campaign_plan_request',{p_org:org,p_actor:actor.userId,p_action:'validate',p_id:row.id}))
        const { template, messages } = await validateCampaign(org, row)
        await result(db.rpc('whatsapp_campaign_enqueue', { p_id: row.id, p_org: org, p_revision: row.revision, p_template: template, p_messages: messages }))
        return { campaignId: row.id }
      }
      // Older clients may still ask to dispatch. They now enqueue a legacy
      // unfinished campaign; only the service worker can send its messages.
      case 'dispatch':
      case 'resume':
      case 'pause':
      case 'cancel': {
        const row = await campaign(org, payload.campaignId, actor)
        await result(db.rpc('whatsapp_campaign_job_control', { p_id: row.id, p_org: org, p_action: payload.action === 'dispatch' ? 'resume' : payload.action }))
        // Stop cached clients from polling their old synchronous send loop.
        if (payload.action === 'dispatch') throw new Error('Sending now runs in the background. Reopen campaign results to see progress.')
        return { campaign: await result(db.from('whatsapp_campaign_performance').select('*').eq('organisation_id', org).eq('id', row.id).single()) }
      }
      case 'detail': {
        const row = await campaign(org, payload.campaignId, actor)
        return { campaign: await result(db.from('whatsapp_campaign_performance').select('*').eq('organisation_id', org).eq('id', row.id).single()), recipients: await allRows(() => db.from('whatsapp_campaign_recipients').select('id,full_name,phone,status,error_message,attempted_at,sent_at,delivered_at,read_at').eq('organisation_id', org).eq('campaign_id', row.id).order('id')) }
      }
      default: throw new Error('Unknown WhatsApp campaign action.')
    }
  }
}
