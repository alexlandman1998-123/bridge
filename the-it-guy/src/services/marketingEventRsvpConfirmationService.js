import { createCommunicationEvent } from './leadCommunicationService'
import { supabase } from '../lib/supabaseClient'

export async function queueMarketingEventRsvpConfirmation({ organisationId, eventId, rsvpId, leadId }) {
  const { data, error } = await supabase.from('marketing_event_rsvp_messages').upsert({ organisation_id: organisationId, event_id: eventId, rsvp_id: rsvpId, crm_lead_id: leadId || null, message_type: 'confirmation', channel: 'email', scheduled_for: new Date().toISOString(), idempotency_key: `marketing-event-rsvp:${rsvpId}:confirmation:email` }, { onConflict: 'rsvp_id,message_type,channel', ignoreDuplicates: false }).select('*').single()
  if (error) throw error
  return data
}

export async function dispatchMarketingEventRsvpConfirmation({ message, event, rsvp, actor = null }) {
  if (message.status === 'sent') return { ok: true, skipped: true }
  try {
    const isReminder = message.message_type === 'morning_reminder'
    const { data, error } = await supabase.functions.invoke('send-email', { body: { type: 'lead_acknowledgement', to: rsvp.email, recipientName: rsvp.full_name, organisationId: message.organisation_id, source: `${event.event_type === 'launch' ? 'Launch' : 'Show Day'} RSVP: ${event.title}`, originalMessage: isReminder ? `${event.title} is happening this morning.` : `You are registered for ${event.title} on ${event.starts_at || 'the scheduled date'}.`, customResponseText: isReminder ? `Good morning. We look forward to welcoming you today at ${event.address || event.location || 'the event venue'}.` : `Thank you for registering. We look forward to welcoming you at ${event.address || event.location || 'the event venue'}.`, idempotencyKey: message.idempotency_key } })
    if (error) throw error
    await supabase.from('marketing_event_rsvp_messages').update({ status: 'sent', sent_at: new Date().toISOString(), provider_message_id: data?.providerMessageId || data?.emailId || null, error_message: null }).eq('id', message.id)
    if (message.crm_lead_id) await createCommunicationEvent({ organisationId: message.organisation_id, leadId: message.crm_lead_id, communicationType: 'email', direction: 'outbound', subject: `${isReminder ? 'Event reminder' : 'RSVP confirmation'} — ${event.title}`, summary: `Automated ${isReminder ? 'event reminder' : 'RSVP confirmation'} sent.`, source: 'marketing_event_rsvp', externalReference: data?.providerMessageId || data?.emailId || message.id }, { actor })
    return { ok: true }
  } catch (error) {
    await supabase.from('marketing_event_rsvp_messages').update({ status: 'failed', error_message: error?.message || 'Confirmation delivery failed.' }).eq('id', message.id)
    return { ok: false, error }
  }
}

export async function dispatchDueMarketingEventRsvpMessages({ limit = 100, actor = null } = {}) {
  const { data, error } = await supabase.from('marketing_event_rsvp_messages').select('*, event:marketing_events(*), rsvp:marketing_event_rsvps(*)').eq('status', 'queued').lte('scheduled_for', new Date().toISOString()).order('scheduled_for', { ascending: true }).limit(Math.min(Math.max(Number(limit) || 100, 1), 100))
  if (error) throw error
  const results = []
  for (const message of data || []) results.push(await dispatchMarketingEventRsvpConfirmation({ message, event: message.event, rsvp: message.rsvp, actor }))
  return results
}
