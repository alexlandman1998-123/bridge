import { isSupabaseConfigured, supabase } from '../lib/supabaseClient.js'

function normalizeText(value = '') {
  return String(value || '').trim()
}

async function getAccessToken() {
  if (!isSupabaseConfigured || !supabase) throw new Error('Sign in before managing Property24 production cutover.')
  const sessionResult = await supabase.auth.getSession()
  const accessToken = sessionResult.data?.session?.access_token
  if (!accessToken) throw new Error('Sign in again before managing Property24 production cutover.')
  return accessToken
}

async function requestLiveCutover({ organisationId, method = 'GET', body = null } = {}) {
  const normalizedOrganisationId = normalizeText(organisationId)
  if (!normalizedOrganisationId) throw new Error('Organisation ID is required for Property24 production cutover.')
  const accessToken = await getAccessToken()
  const query = new URLSearchParams({ organisationId: normalizedOrganisationId })
  const response = await fetch(`/api/property24/settings/live-cutover?${query.toString()}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify({ organisationId: normalizedOrganisationId, ...body }) } : {}),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(payload.message || 'Property24 production cutover failed.')
    error.code = payload.error || 'property24_live_cutover_failed'
    error.details = payload
    throw error
  }
  return payload
}

export async function fetchProperty24LiveCutover({ organisationId } = {}) {
  const payload = await requestLiveCutover({ organisationId })
  return payload.cutover
}

export async function applyProperty24LiveCutoverAction({
  organisationId,
  action,
  reason,
  pilotListingLimit = 3,
} = {}) {
  const normalizedReason = normalizeText(reason)
  if (normalizedReason.length < 10) throw new Error('Add a reason of at least 10 characters for this production decision.')
  const payload = await requestLiveCutover({
    organisationId,
    method: 'POST',
    body: {
      action: normalizeText(action),
      reason: normalizedReason,
      pilotListingLimit: Math.min(Math.max(Number(pilotListingLimit || 3), 1), 3),
    },
  })
  return {
    cutover: payload.cutover,
    actionResult: payload.actionResult,
  }
}
