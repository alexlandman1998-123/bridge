import { invokeEdgeFunction, supabase } from '../../lib/supabaseClient'
import { buildNewLeadAgentNotification } from './newLeadAgentNotificationModel.js'

export { buildNewLeadAgentNotification } from './newLeadAgentNotificationModel.js'

const text = (value) => String(value ?? '').trim()
const email = (value) => text(value).toLowerCase()

export async function notifyNewLeadAssignedAgent(input, { client = supabase, send = invokeEdgeFunction } = {}) {
  try {
    const lead = { ...input.lead }
    const ownerId = text(lead.assignedUserId || lead.assigned_user_id || lead.assignedAgentId || lead.assigned_agent_id)
    if (!email(lead.assignedAgentEmail || lead.assigned_agent_email) && ownerId && client) {
      const result = await client.from('organisation_users').select('user_id, email, first_name, last_name')
        .eq('organisation_id', input.organisationId).eq('user_id', ownerId).in('status', ['active', 'accepted']).limit(1).maybeSingle()
      if (result.error) return { data: null, error: result.error }
      lead.assignedAgentEmail = email(result.data?.email)
      lead.assignedAgentName = text([result.data?.first_name, result.data?.last_name].filter(Boolean).join(' '))
    }
    const payload = buildNewLeadAgentNotification({ ...input, lead })
    if (!payload) return { data: { skipped: true, reason: 'missing_agent_email' }, error: null }
    const result = await send('send-email', { body: payload, client })
    if (result.error || result.data?.error || result.data?.ok === false) return { data: result.data, error: result.error || new Error('Agent notification delivery failed.') }
    return result
  } catch (error) {
    return { data: null, error }
  }
}
