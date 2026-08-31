import { isSupabaseConfigured, supabase } from '../lib/supabaseClient.js'

function normalizeText(value = '') {
  return String(value || '').trim()
}

function formatReassignmentError(payload = {}) {
  if (payload.error === 'property24_target_agent_mapping_missing') {
    return 'Connect this agent to their Property24 profile before assigning a live listing to them.'
  }
  if (payload.error === 'arch9_agent_inactive') {
    return 'Reactivate this agent before assigning listings to them.'
  }
  if (payload.rollbackApplied) {
    return `${payload.message || 'Property24 could not update the listing agent.'} The Arch9 assignment was restored.`
  }
  return normalizeText(payload.message || payload.error) || 'Unable to reassign this listing.'
}

export async function reassignListingAgent(listingId, assignedAgentId, { listingType = 'sale' } = {}) {
  const normalizedListingId = normalizeText(listingId)
  const normalizedAgentId = normalizeText(assignedAgentId)
  if (!normalizedListingId) throw new Error('Listing ID is required.')
  if (!normalizedAgentId) throw new Error('Choose the new listing agent.')
  if (!isSupabaseConfigured || !supabase) throw new Error('Sign in before reassigning this listing.')

  const sessionResult = await supabase.auth.getSession()
  const accessToken = sessionResult.data?.session?.access_token
  if (!accessToken) throw new Error('Sign in again before reassigning this listing.')

  const routeType = normalizeText(listingType).toLowerCase() === 'rental' ? 'rentals' : 'listings'
  const response = await fetch(`/api/property24/${routeType}/${encodeURIComponent(normalizedListingId)}/reassign-agent`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ assignedAgentId: normalizedAgentId }),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(formatReassignmentError(payload))
    error.code = payload.error || 'listing_agent_reassignment_failed'
    error.details = payload
    throw error
  }
  return payload
}
