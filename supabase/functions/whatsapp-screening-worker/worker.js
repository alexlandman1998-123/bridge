import { advanceScreening } from '../_shared/whatsappScreening.js'
import { screeningTemplate } from '../_shared/whatsappScreeningTemplate.js'
import { templateIdentity } from '../_shared/whatsappCampaign.js'
const result = async query => { const { data, error } = await query; if (error) throw new Error('Screening storage unavailable', { cause: error }); return data }

async function currentTemplate(meta, sender, saved) {
  let after = ''
  for (let page = 0; page < 10; page++) {
    const response = await meta(sender, `${sender.waba_id}/message_templates?fields=id,name,language,status,category,components,parameter_format&limit=100${after ? `&after=${encodeURIComponent(after)}` : ''}`)
    const row = response.data?.find(item => item.id === saved.id)
    if (row) {
      if (row.status !== 'APPROVED' || templateIdentity(row) !== templateIdentity(saved)) throw new Error('Opening template changed')
      return row
    }
    if (!response.paging?.next) break
    const next = String(response.paging?.cursors?.after || '')
    if (!next || next === after || next.length > 1000) break
    after = next
  }
  throw new Error('Approved opening template unavailable')
}

export function createScreeningWorker({ db, meta, now = Date.now, limit = 10 }) {
  return async () => {
    let processed = 0
    const started = now()
    while (processed < Math.min(limit, 20) && now() - started < 45000) {
      const packet = await result(db.rpc('whatsapp_screening_next', {}))
      if (!packet) break
      processed++
      if (packet.skipped) continue
      const { job, session, sender, thread, profile, incoming } = packet
      const rpc = (name, extra = {}) => result(db.rpc(name, { p_id: job.id, p_token: job.lease_token, ...extra }))
      let dispatched = false
      try {
        if (profile.config.deliveryMode !== 'live' && (!profile.config.testPhone || profile.config.testPhone !== session.phone)) throw new Error('Contact outside test screening scope')
        let state
        if (job.kind === 'opening') state = { status: 'awaiting_start', answers: {}, current_key: null }
        else if (job.kind === 'resume') state = { status: 'paused', answers: session.answers, current_key: session.current_key, body: 'Your screening is saved. Reply RESUME to continue, AGENT for help, or STOP to stop.' }
        else {
          if (!['text', 'button', 'interactive'].includes(incoming?.message_type)) {
            state = { status: 'handoff', answers: session.answers, current_key: session.current_key, body: 'Your agent will help with this reply. Please use the secure upload facility for identity documents.' }
          } else state = advanceScreening(session, incoming.body_text)
        }
        let payload, template = null
        const lastInbound = Date.parse(thread.last_inbound_at || '')
        const inWindow = Number.isFinite(lastInbound) && lastInbound > now() - 86400000 && lastInbound < now() + 60000
        if (job.kind === 'opening' || state.body && !inWindow && !['completed', 'handoff', 'stopped'].includes(state.status)) {
          template = await currentTemplate(meta, sender, profile.config.template)
          const opening = screeningTemplate({ ...profile.config, template }, { phone: session.phone, full_name: packet.name })
          payload = opening.payload
          state.body = opening.body
          if (job.kind !== 'opening') state.status = 'paused'
        } else if (state.body && !inWindow) {
          // Save the answer/handoff without trying an invalid free-text send.
          state.body = null
        } else if (state.body) payload = { messaging_product: 'whatsapp', to: session.phone, type: 'text', text: { body: state.body } }
        if (state.body && state.body.length > 4096) throw new Error('Question is too long for WhatsApp')
        const claim = await rpc('whatsapp_screening_dispatch', { p_state: state, p_template: template })
        if (!claim.ready) continue
        dispatched = true
        const sent = await meta(sender, `${sender.phone_number_id}/messages`, { ...payload, biz_opaque_callback_data: `arch9-inbox:${claim.messageId}` })
        const providerId = String(sent.messages?.[0]?.id || '')
        if (!providerId) throw new Error('Missing provider acceptance')
        await rpc('whatsapp_screening_finish', { p_status: 'sent', p_provider_id: providerId })
      } catch (error) {
        await rpc('whatsapp_screening_finish', { p_status: dispatched && !error.definitive ? 'unknown' : 'failed' })
      }
    }
    return { processed }
  }
}
