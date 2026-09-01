import { createAgencyCrmLeadTask } from '../lib/agencyCrmRepository'
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'
import { createOrUpdateLeadFromEnquiry } from './leadIngestionService'
import { dispatchMarketingEventRsvpConfirmation, queueMarketingEventRsvpConfirmation } from './marketingEventRsvpConfirmationService'

export async function processMarketingEventRsvpHandoff(handoff, { actor = null } = {}) {
  if (!isSupabaseConfigured || !supabase) throw new Error('CRM handoff requires the workspace database connection.')
  const { data: record, error } = await supabase.from('marketing_event_rsvp_handoffs').select('*, event:marketing_events(*), rsvp:marketing_event_rsvps(*)').eq('id', handoff.id).single()
  if (error) throw error
  if (record.status === 'processed') return record
  await supabase.from('marketing_event_rsvp_handoffs').update({ status: 'processing', attempts: Number(record.attempts || 0) + 1 }).eq('id', record.id)
  try {
    const event = record.event || {}; const rsvp = record.rsvp || {}
    const source = event.event_type === 'launch' ? 'Launch RSVP' : 'Show Day RSVP'
    const ingestion = await createOrUpdateLeadFromEnquiry({ organisationId: record.organisation_id, source, externalReference: `marketing-event-rsvp:${record.rsvp_id}`, enquiryTimestamp: rsvp.submitted_at, name: rsvp.full_name, email: rsvp.email, phone: rsvp.mobile, listingId: event.subject_type === 'listing' ? event.subject_id : null, message: [`Registered for ${event.title}.`, rsvp.note, `Guests: ${rsvp.guest_count || 1}.`].filter(Boolean).join('\n'), leadCategory: 'buyer', lead: { leadCategory: 'buyer', leadDirection: 'Inbound', leadSource: source, stage: 'New Lead', status: 'New Lead', priority: 'High', sourceReferenceId: `marketing-event-rsvp:${record.rsvp_id}` } }, { actor, createInitialTask: false, createLeadRecommendation: true })
    if (!ingestion?.ok || !ingestion?.leadId) throw new Error(ingestion?.error || 'CRM lead creation failed.')
    await createAgencyCrmLeadTask(record.organisation_id, ingestion.leadId, { title: `Follow up after ${event.title}`, description: `RSVP received for ${event.event_type === 'launch' ? 'launch' : 'show day'}. Confirm attendance and interest after the event.`, dueDate: event.starts_at ? new Date(event.starts_at).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10), status: 'Pending', priority: 'High', assignedAgent: actor }, { actor })
    await supabase.from('marketing_event_rsvps').update({ crm_lead_id: ingestion.leadId, crm_contact_id: ingestion.contactId || null, crm_processed_at: new Date().toISOString(), crm_error: null }).eq('id', record.rsvp_id)
    const confirmation = await queueMarketingEventRsvpConfirmation({ organisationId: record.organisation_id, eventId: record.event_id, rsvpId: record.rsvp_id, leadId: ingestion.leadId })
    await dispatchMarketingEventRsvpConfirmation({ message: confirmation, event, rsvp, actor })
    await supabase.from('marketing_event_rsvp_handoffs').update({ status: 'processed', processed_at: new Date().toISOString(), last_error: null }).eq('id', record.id)
    return { ...record, status: 'processed', leadId: ingestion.leadId }
  } catch (handoffError) {
    const message = handoffError?.message || 'CRM handoff failed.'
    await supabase.from('marketing_event_rsvp_handoffs').update({ status: 'failed', last_error: message }).eq('id', record.id)
    await supabase.from('marketing_event_rsvps').update({ crm_error: message }).eq('id', record.rsvp_id)
    throw handoffError
  }
}
