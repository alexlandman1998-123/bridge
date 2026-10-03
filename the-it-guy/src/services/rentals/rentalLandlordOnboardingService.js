import { supabase } from '../../lib/supabaseClient.js'
import { rentalLandlordDiscovery } from './rentalLandlordOnboardingModel.js'
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
  if (!response.ok)
    throw new Error(result.error || 'Unable to load landlord onboarding.')
  return result
}
export async function saveRentalLandlordDiscovery(
  lead,
  patch,
  expectedDiscovery,
) {
  const loaded = await requestRentalLandlordOnboarding(lead.id)
  const result = await requestRentalLandlordOnboarding(lead.id, 'PATCH', {
    version: loaded.onboarding.version,
    patch,
    expectedDiscovery:
      expectedDiscovery ||
      rentalLandlordDiscovery(
        lead.raw?.rawEnquiryPayload || lead.raw?.raw_enquiry_payload || {},
      ),
  })
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
