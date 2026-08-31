import { isSupabaseConfigured, supabase } from '../lib/supabaseClient.js'

function normalizeText(value = '') {
  return String(value || '').trim()
}

function formatLifecycleError(payload = {}) {
  if (payload.error === 'agent_deactivation_listings_remaining') {
    return payload.message || 'Reassign this agent’s active listings before deactivation.'
  }
  if (payload.error === 'property24_mapped_agent_not_found') {
    return 'The mapped Property24 agent could not be found. Refresh the Property24 agent mappings before deactivating this agent.'
  }
  return normalizeText(payload.message || payload.error) || 'Unable to synchronize the Property24 agent status.'
}

export async function syncProperty24AgentLifecycleStatus({ organisationId, arch9UserId, status } = {}) {
  const normalizedOrganisationId = normalizeText(organisationId)
  const normalizedUserId = normalizeText(arch9UserId)
  const normalizedStatus = normalizeText(status).toLowerCase()
  if (!normalizedOrganisationId) throw new Error('Organisation ID is required before changing agent status.')
  if (!normalizedUserId) throw new Error('Arch9 agent ID is required before changing agent status.')
  if (!['active', 'inactive'].includes(normalizedStatus)) throw new Error('Agent status must be active or inactive.')
  if (!isSupabaseConfigured || !supabase) throw new Error('Sign in before changing agent status.')

  const sessionResult = await supabase.auth.getSession()
  const accessToken = sessionResult.data?.session?.access_token
  if (!accessToken) throw new Error('Sign in again before changing agent status.')
  const response = await fetch('/api/property24/settings/agent-status', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ organisationId: normalizedOrganisationId, arch9UserId: normalizedUserId, status: normalizedStatus }),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(formatLifecycleError(payload))
    error.code = payload.error || 'property24_agent_status_failed'
    error.details = payload
    throw error
  }
  return payload
}
