import { templateIdentity } from './whatsappCampaign.js'

export const campaignResult = async (query) => {
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return data
}

// Shared by browser readiness checks and the service-only delivery worker.
export function createCampaignDelivery({ db, meta }) {
  async function sender(org, id) {
    const row = await campaignResult(db.from('organisation_communication_channels').select('*').eq('organisation_id', org).eq('id', id).eq('provider', 'meta').eq('channel_type', 'whatsapp').eq('connection_status', 'connected').single())
    if (row.owner_user_id) throw new Error('Bulk campaigns require an agency number. Agent numbers are for inbox conversations.')
    if (!(row.meta_access_token || row.token_ciphertext) || !/^\d+$/.test(row.waba_id) || !/^\d+$/.test(row.phone_number_id)) throw new Error('The sender needs its Meta access token, WhatsApp Business Account ID and Phone Number ID configured by an administrator.')
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
  async function deliver(row, leaseToken, { limit = 50, now = Date.now, budgetMs = 45000 } = {}) {
    const started = now()
    const connection = await sender(row.organisation_id, row.sender_id)
    if (connection.phone_number_id !== row.phone_number_id || connection.waba_id !== row.waba_id) throw new Error('The sender changed. Remaining messages have been paused.')
    const available = await templates(connection, row.template.name)
    const current = available.find((t) => t.id === row.template.id && t.language === row.template.language)
    if (current?.status !== 'APPROVED' || templateIdentity(current) !== templateIdentity(row.template)) throw new Error('The template changed or is no longer approved. Remaining messages have been paused.')
    const queued = await campaignResult(db.from('whatsapp_campaign_recipients').select('id').eq('organisation_id', row.organisation_id).eq('campaign_id', row.id).eq('status', 'queued').order('id').limit(limit))
    for (let offset = 0; offset < queued.length && now() - started < budgetMs; offset += 5) {
      await Promise.all(queued.slice(offset, offset + 5).map(async ({ id }) => {
        const claimed = await campaignResult(db.rpc('whatsapp_campaign_claim', { p_id: id, p_org: row.organisation_id, p_token: leaseToken }))
        const recipient = claimed?.[0]
        if (!recipient) return
        let response
        try {
          response = await meta(connection, `${connection.phone_number_id}/messages`, { ...recipient.payload, biz_opaque_callback_data: `arch9-wa:${recipient.id}` })
        } catch (error) {
          await campaignResult(db.from('whatsapp_campaign_recipients').update({ status: error.definitive ? 'failed' : 'unknown', error_message: error.definitive ? error.message : 'Meta response was not confirmed. Check delivery before sending another campaign to this recipient.', ...(error.definitive ? { failed_at: new Date().toISOString() } : {}), updated_at: new Date().toISOString() }).eq('id', recipient.id).eq('status', 'processing'))
          return
        }
        const messageId = response.messages?.[0]?.id
        if (!messageId) {
          await campaignResult(db.from('whatsapp_campaign_recipients').update({ status: 'unknown', error_message: 'Meta returned no message ID. Check delivery before sending again.' }).eq('id', recipient.id).eq('status', 'processing'))
          return
        }
        await campaignResult(db.rpc('whatsapp_campaign_status', { p_message_id: messageId, p_callback: `arch9-wa:${recipient.id}`, p_phone_id: connection.phone_number_id, p_waba_id: connection.waba_id, p_status: 'sent', p_at: new Date().toISOString(), p_error: null }))
      }))
    }
  }
  return { sender, templates, deliver }
}
