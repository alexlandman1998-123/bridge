import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'

export const UNAVAILABLE_SYNDICATION_CHANNELS = Object.freeze({
  property24: { available: false, reason: 'connection_not_configured' },
  private_property: { available: false, reason: 'connection_not_configured' },
  agency_website: { available: false, reason: 'website_not_configured' },
})

export async function getSyndicationChannelAvailability(organisationId = '') {
  const safeOrganisationId = String(organisationId || '').trim()
  if (!safeOrganisationId || !isSupabaseConfigured || !supabase) return { ...UNAVAILABLE_SYNDICATION_CHANNELS }
  const sessionResult = await supabase.auth.getSession()
  const token = sessionResult.data?.session?.access_token
  if (!token) throw new Error('Sign in again to check publishing destinations.')
  const query = new URLSearchParams({ organisationId: safeOrganisationId })
  const result = await fetch(`/api/listings/syndication-availability?${query.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const payload = await result.json().catch(() => ({}))
  if (!result.ok) throw new Error(payload.message || 'Unable to check publishing destinations.')
  return { ...UNAVAILABLE_SYNDICATION_CHANNELS, ...(payload.channels || {}) }
}
