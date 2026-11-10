import { SCREENING_VERSION, validateScreeningContext } from '../_shared/whatsappScreening.js'
import { screeningTemplate } from '../_shared/whatsappScreeningTemplate.js'
import { templateIdentity } from '../_shared/whatsappCampaign.js'
import { isUuid } from '../_shared/metaIntegrationCore.js'
const result = async query => { const { data, error } = await query; if (error) throw new Error(error.message); return data }

export async function handleScreening({ db, actor, org, action, payload, channel, graph, senderToken }) {
  const operation = action.replace('screening_', '')
  if (['save', 'enable', 'disable', 'list', 'listings'].includes(operation) && !actor.isAdmin) throw new Error('Agency management must configure screening.')
  if (!actor.userDb) throw new Error('Sign in again to open screening.')
  if (operation === 'listings') {
    const listings = await result(actor.userDb.from('private_listings').select('id,title,suburb,city,asking_price,listing_category').eq('organisation_id', org).eq('is_active', true).order('title').limit(200))
    return { listings: listings || [] }
  }
  if (payload.leadId) {
    if (!isUuid(payload.leadId)) throw new Error('Choose a saved lead.')
    const lead = await result(actor.userDb.from('leads').select('lead_id').eq('organisation_id', org).eq('lead_id', payload.leadId).maybeSingle())
    if (!lead) throw new Error('This lead is not available in your scope.')
  }
  if (payload.conversationId) {
    if (!isUuid(payload.conversationId)) throw new Error('Choose a saved conversation.')
    await result(db.rpc('whatsapp_inbox_request', { p_org: org, p_actor: actor.userId, p_action: 'access', p_conversation: payload.conversationId }))
  }
  const fields = { p_org: org, p_actor: actor.userId, p_action: operation, p_id: payload.id || null, p_version: payload.version ?? null, p_lead: payload.leadId || null, p_conversation: payload.conversationId || null }
  if (fields.p_id && !isUuid(fields.p_id)) throw new Error('Choose saved screening settings.')
  if (operation === 'enable' && payload.confirmed !== true) throw new Error('Confirm automatic screening for future enquiries about this property.')
  if (operation === 'save') {
    const draft = payload.profile || {}
    const deliveryMode = draft.deliveryMode === 'live' ? 'live' : 'test'
    const testPhone = String(draft.testPhone || '').replace(/[\s()+-]/g, '')
    if (deliveryMode === 'test' && !/^[1-9]\d{7,14}$/.test(testPhone)) throw new Error('Add the test recipient in international format before saving test-only screening.')
    if (!isUuid(draft.listingId)) throw new Error('Choose a saved listing.')
    const listing = await result(actor.userDb.from('private_listings').select('id,title,suburb,city,asking_price,listing_category').eq('organisation_id', org).eq('id', draft.listingId).maybeSingle())
    if (!listing) throw new Error('The property is not available in this workspace.')
    const rental = listing.listing_category === 'rental'
    if ((draft.kind === 'tenant') !== rental) throw new Error('Use tenant screening for rental listings and buyer screening for sales listings.')
    const sender = await channel(org, draft.senderId)
    if (sender.owner_user_id || sender.connection_status !== 'connected') throw new Error('Screening requires a connected shared company number.')
    let template, after = ''
    for (let page = 0; page < 10; page++) {
      const response = await graph(await senderToken(sender), `${sender.waba_id}/message_templates?fields=id,name,language,status,category,components,parameter_format&limit=100${after ? `&after=${encodeURIComponent(after)}` : ''}`)
      template = response.data?.find(row => row.id === draft.template?.id)
      if (template || !response.paging?.next) break
      const next = String(response.paging?.cursors?.after || '')
      if (!next || next === after || next.length > 1000) break
      after = next
    }
    if (!template || template.status !== 'APPROVED' || templateIdentity(template) !== templateIdentity(draft.template)) throw new Error('The opening template changed. Reload templates before saving.')
    const context = validateScreeningContext(draft.kind, { ...draft.context, propertyLabel: listing.title, location: [listing.suburb, listing.city].filter(Boolean).join(', '), price: listing.asking_price })
    const config = { flowVersion: SCREENING_VERSION, deliveryMode, testPhone: deliveryMode === 'test' ? testPhone : null, listingId: listing.id, kind: draft.kind, senderId: sender.id, context, template, values: draft.values || {} }
    screeningTemplate(config, { phone: '27820000000', full_name: 'Example Applicant' })
    fields.p_config = config
  }
  return result(db.rpc('whatsapp_screening_command', fields))
}
