import { supabase, isSupabaseConfigured, invokeEdgeFunction, getEdgeFunctionInvokeError } from '../lib/supabaseClient'

const supported = provider => provider === 'google' || provider === 'outlook'
async function rpc(name, args) {
  if (!isSupabaseConfigured || !supabase) throw new Error('Calendar connections are not available in this workspace.')
  const result = await supabase.rpc(name, args)
  if (result.error) throw new Error(result.error.message || 'Calendar connection could not be verified. Retry.')
  if (!result.data || typeof result.data !== 'object') throw new Error('Calendar connection could not be verified. Retry.')
  return result.data
}
export async function readCalendarProviderStatus(organisationId, appointmentId = null) {
  const data = await rpc('read_calendar_provider_status', { p_organisation_id: organisationId, p_appointment_id: appointmentId })
  if (data.verified !== true || !Array.isArray(data.connections) || !Array.isArray(data.events)) throw new Error('Calendar connection status could not be verified. Retry.')
  return data
}
export async function startCalendarProviderConnection(organisationId, provider, returnPath) {
  if (!supported(provider)) throw new Error('Choose Google or Outlook.')
  const result = await invokeEdgeFunction('calendar-provider-connection', { body: { action: 'connect', organisationId, provider, returnPath } })
  const error = getEdgeFunctionInvokeError(result)
  if (error) throw new Error(error.message || 'Calendar authorization could not start.')
  let url
  try { url = new URL(result.data?.authorizationUrl) } catch { throw new Error('Calendar authorization could not be verified.') }
  const host = provider === 'google' ? 'accounts.google.com' : 'login.microsoftonline.com'
  if (url.protocol !== 'https:' || url.hostname !== host || url.username || url.password || url.port) throw new Error('Calendar authorization could not be verified.')
  return url.href
}
export async function disconnectCalendarProvider(connectionId) {
  const result = await rpc('disconnect_calendar_provider', { p_connection_id: connectionId })
  if (result.verified !== true || result.status !== 'disconnected') throw new Error('Calendar disconnect could not be verified.')
  return result
}
export async function actOnCalendarProviderEvent({ organisationId, appointmentId, provider, action = 'sync', reviewToken = null }) {
  if (!organisationId || !appointmentId || !supported(provider)) throw new Error('Choose a saved appointment and connected calendar.')
  const result = await rpc('calendar_provider_event_action', { p_org: organisationId, p_appointment: appointmentId, p_provider: provider, p_action: action, p_review_token: reviewToken })
  if (result.verified !== true || !Array.isArray(result.events)) throw new Error('Calendar action could not be verified.')
  return result
}
