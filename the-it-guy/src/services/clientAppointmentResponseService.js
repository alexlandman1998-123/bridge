import { appointmentStartIso } from '../core/appointments/attorneyCalendarModel.js'

const actions = { confirm: 'Accepted', accept: 'Accepted', accepted: 'Accepted',
  decline: 'Declined', declined: 'Declined', reschedule: 'Proposed New Time',
  reschedule_requested: 'Proposed New Time', request_reschedule: 'Proposed New Time' }

// One response RPC owns persistence and delivery. Keep its identity through a
// transport retry; never fall back to separate participant/appointment writes.
export async function respondToPortalAppointment(client, {
  token, appointmentId, action, expectedStart, preferredDateTime = null,
  notes = '', sellerPortalAccessToken = null, onLegacyResponse = null, commandId = crypto.randomUUID(),
} = {}) {
  const status = actions[String(action || '').trim().toLowerCase()]
  const savedStart = appointmentStartIso({ dateTime: expectedStart })
  const preferred = preferredDateTime ? appointmentStartIso({ dateTime: preferredDateTime }) : null
  if (!status || !appointmentId || !token || !savedStart) throw new Error('Refresh the appointment before responding.')
  if (status === 'Proposed New Time' && (!preferred || Date.parse(preferred) <= Date.now())) {
    throw new Error('Please choose a preferred date and time in the future.')
  }
  if (String(notes).length > 1000) throw new Error('Keep the response under 1,000 characters.')
  const args = { p_token: token, p_appointment_id: appointmentId, p_command_id: commandId,
    p_status: status, p_expected_start: savedStart, p_preferred_start: status === 'Proposed New Time' ? preferred : null,
    p_comment: status === 'Proposed New Time' ? String(notes).trim() || null : null,
    p_seller_access_token: sellerPortalAccessToken || null }
  for (let attempt = 0; attempt < 2; attempt++) {
    let result
    try { result = await client.rpc('bridge_respond_client_portal_appointment', args) }
    catch (error) { result = { error } }
    if (result.error) {
      const error = result.error
      const transient = ['57014','08006','08001','53300','40P01'].includes(error.code) ||
        (!error.code && /network|failed to fetch|timeout/i.test(error.message || ''))
      if (transient && attempt === 0) continue
      if (['PGRST202','42883'].includes(error.code)) throw new Error('Appointment responses require the latest database migration.')
      throw error
    }
    const receipt = result.data
    if (receipt?.appointmentId === appointmentId && receipt.transactionId && typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('itg:transaction-updated', {
      detail: { transactionId: receipt.transactionId, source: 'appointment_response' },
    }))
    if (receipt?.responseUnavailable) throw new Error('This appointment invitation is no longer active. Refresh your appointments.')
    if (receipt?.appointmentId !== appointmentId || !receipt.participantId || receipt.rsvpStatus !== status || !receipt.status) {
      throw new Error('Your response could not be confirmed. Retry the same response after refreshing.')
    }
    // Retain older appointments' existing delivery adapter after the save.
    // Managed attorney bookings are dispatched by the durable database queue.
    if (receipt.legacyDelivery === true && !receipt.replayed && onLegacyResponse) {
      void Promise.resolve().then(() => onLegacyResponse(receipt)).catch(() => {})
    }
    return { ...receipt, action, suggestedSlots: [] }
  }
}
