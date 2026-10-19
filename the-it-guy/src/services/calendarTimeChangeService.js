import { supabase, isSupabaseConfigured } from '../lib/supabaseClient'

function ready() {
  if (!isSupabaseConfigured || !supabase) throw new Error('A database connection is required for time changes.')
}
function verify(state, appointmentId) {
  if (state?.verified !== true || state.appointmentId !== appointmentId || !Number.isInteger(state.revision)
    || state.revision < 0 || typeof state.canManage !== 'boolean' || typeof state.canRequest !== 'boolean'
    || typeof state.supported !== 'boolean' || !Array.isArray(state.history) || !Array.isArray(state.events)
    || (state.active !== null && (!state.active?.id || state.active.appointment_id !== appointmentId
      || !['pending', 'proposed'].includes(state.active.status)))) {
    throw new Error('The time-change state could not be verified. Refresh the appointment.')
  }
  return state
}
function failure(error) {
  if (['PGRST202', '42883'].includes(error.code)) {
    return new Error('Time-change requests will be available after the calendar update is released.')
  }
  return error
}
export async function readCalendarTimeChange(appointmentId, { signal } = {}) {
  ready()
  signal?.throwIfAborted()
  let query = supabase.rpc('get_calendar_time_change', { p_appointment_id: appointmentId })
  if (signal && typeof query.abortSignal === 'function') query = query.abortSignal(signal)
  const result = await query
  signal?.throwIfAborted()
  if (result.error) throw failure(result.error)
  return verify(result.data, appointmentId)
}
export async function changeCalendarTime({ appointmentId, expectedRevision, commandId, action, requestId, preferredStart, reason }) {
  ready()
  if (!commandId || !Number.isInteger(expectedRevision)
    || !['request', 'propose', 'decline', 'withdraw', 'accept', 'decline_proposal'].includes(action)) {
    throw new Error('Refresh the appointment before changing its time.')
  }
  const result = await supabase.rpc('mutate_calendar_time_change', {
    p_appointment_id: appointmentId, p_expected_revision: expectedRevision, p_command_id: commandId,
    p_action: action, p_request_id: requestId || null, p_start: preferredStart || null, p_reason: reason?.trim() || null,
  })
  if (result.error) throw failure(result.error)
  if (result.data?.verified !== true || result.data.appointmentId !== appointmentId
    || result.data.revision !== result.data.state?.revision) {
    throw new Error('The time change could not be verified. Refresh before trying again.')
  }
  return verify(result.data.state, appointmentId)
}

function verifyInvitation(context) {
  if (context?.managed === false) return context
  if (context?.managed !== true || typeof context.proposal !== 'boolean' || typeof context.can_request_time_change !== 'boolean'
    || typeof context.rsvp_status !== 'string' || !context.appointment_id || !context.participant_id || !context.timezone
    || !Number.isFinite(Date.parse(context.date_time)) || !Number.isFinite(Date.parse(context.end_date_time))
    || (context.proposal && (!context.proposal_id || !Number.isInteger(context.proposal_revision)))) {
    throw new Error('This invitation could not be verified. Open the latest appointment email.')
  }
  return context
}
export async function readCalendarInvitation(token, { signal } = {}) {
  ready()
  signal?.throwIfAborted()
  let query = supabase.rpc('get_calendar_invitation_context', { p_token: token })
  if (signal && typeof query.abortSignal === 'function') query = query.abortSignal(signal)
  const result = await query
  signal?.throwIfAborted()
  if (result.error) throw failure(result.error)
  if (!result.data) throw new Error('This request or its temporary hold has expired, or the invitation was replaced. Open the latest email or ask the agent for a new invitation.')
  return verifyInvitation(result.data)
}
export async function requestCalendarTimeChangeByToken(token, { appointmentId, preferredStart = null, reason = null, withdrawRequestId = null }) {
  ready()
  const result = await supabase.rpc('request_calendar_time_change_by_token', {
    p_token: token, p_start: preferredStart, p_reason: reason?.trim() || null, p_withdraw_request_id: withdrawRequestId,
  })
  if (result.error) throw failure(result.error)
  if (result.data?.verified !== true || result.data.appointmentId !== appointmentId
    || result.data.context?.appointment_id !== appointmentId) throw new Error('The time-change response could not be verified. Refresh before trying again.')
  return verifyInvitation(result.data.context)
}
export async function respondCalendarTimeChangeByToken(token, { appointmentId, requestId, proposalRevision, commandId, status }) {
  ready()
  const result = await supabase.rpc('respond_calendar_time_change_by_token', {
    p_token: token, p_request_id: requestId, p_proposal_revision: proposalRevision, p_command_id: commandId, p_status: status,
  })
  if (result.error) throw failure(result.error)
  const receipt = result.data
  if (receipt?.verified !== true || receipt.appointmentId !== appointmentId || receipt.requestId !== requestId
    || receipt.proposalRevision !== proposalRevision || receipt.response !== status || !['confirmed', 'declined', 'pending', 'closed'].includes(receipt.outcome)
    || !Number.isFinite(Date.parse(receipt.dateTime)) || !(Date.parse(receipt.endDateTime) > Date.parse(receipt.dateTime))) throw new Error('Your response could not be verified. Refresh before trying again.')
  return receipt
}
