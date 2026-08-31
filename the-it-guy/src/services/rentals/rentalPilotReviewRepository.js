import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient.js'

function client(value = supabase) {
  if (!isSupabaseConfigured || !value) throw new Error('Pilot reviews require Supabase configuration.')
  return value
}

export async function getRentalPilotReviews(organisationId, { db = supabase } = {}) {
  if (!organisationId) return { reviews: [], gate: {} }
  const result = await client(db).rpc('rental_get_pilot_reviews', { p_org: organisationId })
  if (result.error) throw result.error
  return result.data || { reviews: [], gate: {} }
}

export async function recordRentalPilotReview(input = {}, { db = supabase } = {}) {
  const result = await client(db).rpc('rental_record_pilot_review', {
    p_org: input.organisationId,
    p_recommendation: input.recommendation,
    p_risk_level: input.riskLevel,
    p_summary: input.summary,
    p_next_review_on: input.nextReviewOn || null,
    p_idempotency_key: input.idempotencyKey,
  })
  if (result.error) throw result.error
  return result.data
}
