import { supabase } from '../../lib/supabaseClient'
import { readSellerOnboardingDraftComparison } from '../../core/documents/sellerOnboardingDraftComparison.js'

export async function acceptSellerOnboardingDraftAnswer({ listing, key }, { client = supabase } = {}) {
  const source = listing?.sourceListing || listing
  const comparison = readSellerOnboardingDraftComparison(source)
  if (!client || !source?.id || !comparison.onboardingId || !comparison.updatedAt) {
    throw new Error('Load the latest seller details before reviewing this difference.')
  }
  const { data, error } = await client.rpc('accept_seller_onboarding_draft_answer', {
    p_listing_id: source.id,
    p_field: key,
    p_expected_updated_at: comparison.updatedAt,
  })
  if (error) throw error
  if (!data?.id || !data.draft_comparison_json) throw new Error('The review could not be confirmed. Reload the seller details.')
  return data
}
