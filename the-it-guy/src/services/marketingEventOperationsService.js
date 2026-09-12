import { supabase } from '../lib/supabaseClient'
import { createAgencyCrmLeadTask } from '../lib/agencyCrmRepository'

export async function getMarketingEventOperations(eventId) {
  const [summaryResult, handoffsResult, messagesResult] = await Promise.all([
    supabase.from('marketing_event_operations_summary').select('*').eq('event_id', eventId).maybeSingle(),
    supabase.from('marketing_event_rsvp_handoffs').select('id,status,attempts,last_error,failed_at,rsvp:marketing_event_rsvps(full_name,email)').eq('event_id', eventId).eq('status', 'failed').order('failed_at', { ascending: false }),
    supabase.from('marketing_event_rsvp_messages').select('id,status,dispatch_attempts,error_message,failed_at,message_type,rsvp:marketing_event_rsvps(full_name,email)').eq('event_id', eventId).eq('status', 'failed').order('failed_at', { ascending: false }),
  ])
  if (summaryResult.error) throw summaryResult.error
  if (handoffsResult.error) throw handoffsResult.error
  if (messagesResult.error) throw messagesResult.error
  return { summary: summaryResult.data || {}, failedHandoffs: handoffsResult.data || [], failedMessages: messagesResult.data || [] }
}

export async function retryMarketingEventOperation(kind, id) {
  const table = kind === 'handoff' ? 'marketing_event_rsvp_handoffs' : 'marketing_event_rsvp_messages'
  const patch = kind === 'handoff'
    ? { status: 'queued', next_attempt_at: new Date().toISOString(), failed_at: null, last_error: null, updated_at: new Date().toISOString() }
    : { status: 'queued', next_attempt_at: new Date().toISOString(), failed_at: null, error_message: null }
  const { error } = await supabase.from(table).update(patch).eq('id', id).eq('status', 'failed')
  if (error) throw error
}

export async function listMarketingEventRsvps(eventId) {
  const { data, error } = await supabase.from('marketing_event_rsvps').select('*').eq('event_id', eventId).order('submitted_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function checkInMarketingEventRsvp(rsvpId, checkedIn) {
  const { data: authData } = await supabase.auth.getUser()
  const { error } = await supabase.from('marketing_event_rsvps').update({ checked_in_at: checkedIn ? new Date().toISOString() : null, checked_in_by: checkedIn ? authData?.user?.id || null : null }).eq('id', rsvpId)
  if (error) throw error
}

export async function updateMarketingEventRsvpInterest(rsvpId, interestLevel) {
  const { error } = await supabase.from('marketing_event_rsvps').update({ interest_level: interestLevel || null }).eq('id', rsvpId)
  if (error) throw error
}

export async function processMarketingEventConversion({ rsvp, event, organisationId, outcome, actor = null }) {
  const followUpCopy = {
    attended_interested: { title: `Priority follow-up: ${event.title}`, detail: 'Attended and expressed strong interest. Contact promptly to arrange the next step.', priority: 'High' },
    attended_follow_up: { title: `Follow up after ${event.title}`, detail: 'Attended the event. Confirm feedback and next steps.', priority: 'High' },
    no_show: { title: `Reconnect after missed ${event.title}`, detail: 'Registered but did not attend. Offer a private viewing or alternative time.', priority: 'Medium' },
    cancelled: { title: `Re-engage cancelled RSVP`, detail: 'Cancelled attendance. Ask whether another viewing or event would suit.', priority: 'Low' },
    not_a_fit: { title: `Close event follow-up`, detail: 'Event feedback indicates this opportunity was not a fit.', priority: 'Low' },
  }[outcome]
  let taskId = rsvp.conversion_task_id || null
  if (!taskId && rsvp.crm_lead_id && followUpCopy) {
    const nextDay = event.startsAt ? new Date(new Date(event.startsAt).valueOf() + 86400000) : new Date()
    const task = await createAgencyCrmLeadTask(organisationId, rsvp.crm_lead_id, { title: followUpCopy.title, description: followUpCopy.detail, dueDate: nextDay.toISOString().slice(0, 10), status: 'Pending', priority: followUpCopy.priority, assignedAgent: actor }, { actor })
    taskId = task?.taskId || task?.id || null
  }
  const { error } = await supabase.from('marketing_event_rsvps').update({ conversion_outcome: outcome, conversion_task_id: taskId, conversion_processed_at: new Date().toISOString() }).eq('id', rsvp.id)
  if (error) throw error
}
