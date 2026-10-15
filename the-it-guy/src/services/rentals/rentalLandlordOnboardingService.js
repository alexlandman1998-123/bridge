import { supabase } from '../../lib/supabaseClient.js'
import { rentalLandlordDiscovery, mergeRentalLandlordDiscovery } from './rentalLandlordOnboardingModel.js'
import { profileSignature } from './rentalLandlordProfileDraft.js'
export async function requestRentalLandlordOnboarding(
  leadId,
  method = 'GET',
  body = {},
) {
  const { data, error } = await supabase.auth.getSession()
  if (error || !data?.session?.access_token)
    throw new Error('Sign in to manage landlord onboarding.')
  const response = await fetch(
    `/api/rentals/landlord-onboarding${method === 'GET' ? `?leadId=${encodeURIComponent(leadId)}` : ''}`,
    {
      method,
      headers: {
        Authorization: `Bearer ${data.session.access_token}`,
        'Content-Type': 'application/json',
      },
      ...(method === 'GET'
        ? {}
        : { body: JSON.stringify({ ...body, leadId }) }),
    },
  )
  const result = await response.json()
  if (!response.ok) {
    const cause = new Error(result.error || 'Unable to load landlord onboarding.')
    cause.status = response.status
    throw cause
  }
  return result
}
export async function saveRentalLandlordDiscovery(
  lead,
  patch,
  expectedDiscovery,
) {
  const loaded = await requestRentalLandlordOnboarding(lead.id)
  if (patch.profile && !loaded.onboarding?.capabilities?.profileConsistency) throw new Error('Profile saving is temporarily unavailable. Your draft is retained; please retry later.')
  const expectedProfile = patch.profile ? mergeRentalLandlordDiscovery(loaded.onboarding.data, {profile:patch.profile}).profile : null
  if (patch.profile && !patch.portfolio && loaded.onboarding?.consistency?.synced && profileSignature(loaded.onboarding.data.profile) === profileSignature(expectedProfile)) return loaded
  const result = await requestRentalLandlordOnboarding(lead.id, 'PATCH', {
    version: loaded.onboarding.version,
    patch,
    expectedDiscovery:
      expectedDiscovery ||
      rentalLandlordDiscovery(
        lead.raw?.rawEnquiryPayload || lead.raw?.raw_enquiry_payload || {},
      ),
  })
  if (patch.profile && !patch.portfolio) {
    if (!result.consistency?.synced && !result.onboarding?.consistency?.synced) throw new Error('The profile save could not be confirmed. Your draft is retained; please retry.')
    if (!result.onboarding) {
      const confirmed = await requestRentalLandlordOnboarding(lead.id)
      if (!confirmed.onboarding?.consistency?.synced || profileSignature(confirmed.onboarding.data.profile) !== profileSignature(expectedProfile)) throw new Error('The saved profile readback could not be confirmed. Your draft is retained; retry to check it.')
      return confirmed
    }
    if (profileSignature(result.onboarding.data.profile) !== profileSignature(expectedProfile)) throw new Error('The saved profile could not be confirmed. Your draft is retained; retry to check it.')
  }
  return result
}

export async function linkRentalLandlordOnboardingProperty(
  lead,
  propertyId,
  links,
  expectedDiscovery,
) {
  const loaded = await requestRentalLandlordOnboarding(lead.id)
  return requestRentalLandlordOnboarding(lead.id, 'POST', {
    action: 'link_property',
    version: loaded.onboarding.version,
    patch: {
      propertyId,
      ...links,
      expectedDiscovery:
        expectedDiscovery ||
        rentalLandlordDiscovery(
          lead.raw?.rawEnquiryPayload || lead.raw?.raw_enquiry_payload || {},
        ),
    },
  })
}
