import { normalizePhone } from './whatsappCampaign.js'

// Called only after the existing Meta HMAC verification. Replay is safe: the
// database merges delivery states monotonically and opt-outs are idempotent.
export async function applyWhatsAppCampaignWebhook(db, payload) {
  for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      const value = change.value || {}
      const phoneId = String(value.metadata?.phone_number_id || '')
      const wabaId = String(entry.id || '')
      if (!phoneId || !wabaId) continue
      for (const item of value.statuses || []) {
        if (!['sent', 'delivered', 'read', 'failed'].includes(item.status) || !item.id) continue
        const seconds = Number(item.timestamp)
        const at = Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000) : new Date()
        if (!Number.isFinite(at.getTime())) continue
        const error = item.errors?.[0]
        const saved = await db.rpc('whatsapp_campaign_status', {
          p_message_id: String(item.id), p_callback: String(item.biz_opaque_callback_data || ''),
          p_phone_id: phoneId, p_waba_id: wabaId, p_status: item.status, p_at: at.toISOString(),
          p_error: error ? `${error.code || ''}: ${error.error_data?.details || error.title || error.message || 'Delivery failed'}` : null,
        })
        if (saved.error) throw new Error('Unable to record campaign delivery callback.')
      }
      for (const message of value.messages || []) {
        const text = String(message.text?.body || message.button?.text || message.interactive?.button_reply?.title || '').trim().toLowerCase()
        if (!['stop', 'unsubscribe', 'opt out', 'opt-out'].includes(text)) continue
        const phone = normalizePhone(message.from)
        const seconds = Number(message.timestamp)
        const eventAt = new Date(seconds * 1000)
        if (!phone || !Number.isFinite(seconds) || seconds <= 0 || !Number.isFinite(eventAt.getTime())) continue
        const channels = await db.from('organisation_communication_channels').select('organisation_id').eq('phone_number_id', phoneId).eq('waba_id', wabaId).eq('provider', 'meta').eq('channel_type', 'whatsapp')
        if (channels.error) throw new Error('Unable to resolve campaign opt-out sender.')
        for (const channel of channels.data || []) {
          const saved = await db.from('whatsapp_marketing_contacts').update({ consent_status: 'opted_out', opted_out_at: eventAt.toISOString(), updated_at: new Date().toISOString(), updated_by: null }).eq('organisation_id', channel.organisation_id).eq('phone', phone).neq('consent_status', 'opted_out').or(`consent_at.is.null,consent_at.lte.${eventAt.toISOString()}`)
          if (saved.error) throw new Error('Unable to record WhatsApp opt-out.')
        }
      }
    }
  }
}
