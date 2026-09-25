import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export const HISTORICAL_MANDATE_EXECUTION_CLASSIFICATIONS = [
  { value: 'grandfathered_valid', label: 'Grandfathered valid' },
  { value: 'wet_ink_reexecution_required', label: 'Wet-ink re-execution required' },
  { value: 'legal_review_required', label: 'Legal review required' },
  { value: 'not_applicable', label: 'Not applicable' },
]

function normalizeText(value) {
  return String(value ?? '').trim()
}

function requireUuid(value, label) {
  const normalized = normalizeText(value)
  if (!UUID_PATTERN.test(normalized)) throw new Error(`${label} is required.`)
  return normalized
}

function requireClient() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Sign in to review historical mandate executions.')
  }
  return supabase
}

export function mapHistoricalMandateExecutionReview(row = {}) {
  return {
    id: normalizeText(row.id),
    organisationId: normalizeText(row.organisationId || row.organisation_id),
    listingId: normalizeText(row.listingId || row.listing_id),
    signingSessionId: normalizeText(row.signingSessionId || row.signing_session_id),
    classification: normalizeText(row.classification) || 'legal_review_required',
    reviewStatus: normalizeText(row.reviewStatus || row.review_status) || 'pending',
    downstreamRelease: row.downstreamRelease === true || row.downstream_release === true,
    reviewReason: normalizeText(row.reviewReason || row.review_reason),
    sourceSnapshot: row.sourceSnapshot || row.source_snapshot || {},
    reviewedBy: normalizeText(row.reviewedBy || row.reviewed_by),
    reviewedAt: row.reviewedAt || row.reviewed_at || null,
    createdAt: row.createdAt || row.created_at || null,
    updatedAt: row.updatedAt || row.updated_at || null,
  }
}

export async function listHistoricalMandateExecutionReviews({ organisationId = '', listingId = '' } = {}) {
  const client = requireClient()
  const data = {
    p_organisation_id: requireUuid(organisationId, 'Organisation'),
  }
  if (normalizeText(listingId)) data.p_listing_id = requireUuid(listingId, 'Listing')

  const { data: response, error } = await client.rpc('bridge_list_historical_mandate_execution_reviews', data)
  if (error) throw error
  const reviews = Array.isArray(response?.reviews) ? response.reviews : []
  return reviews.map(mapHistoricalMandateExecutionReview)
}

export async function resolveHistoricalMandateExecutionReview({
  reviewId = '',
  classification = '',
  reviewReason = '',
  downstreamRelease = false,
} = {}) {
  const normalizedClassification = normalizeText(classification).toLowerCase()
  const normalizedReason = normalizeText(reviewReason)
  if (!HISTORICAL_MANDATE_EXECUTION_CLASSIFICATIONS.some((option) => option.value === normalizedClassification)) {
    throw new Error('Choose a valid historical execution classification.')
  }
  if (normalizedReason.length < 20) {
    throw new Error('Record a review reason of at least 20 characters.')
  }
  if (downstreamRelease && normalizedClassification !== 'grandfathered_valid') {
    throw new Error('Only a grandfathered-valid record can be released for downstream use.')
  }

  const { data, error } = await requireClient().rpc('bridge_resolve_historical_mandate_execution_review', {
    p_review_id: requireUuid(reviewId, 'Review'),
    p_classification: normalizedClassification,
    p_review_reason: normalizedReason,
    p_downstream_release: downstreamRelease === true,
  })
  if (error) throw error
  return mapHistoricalMandateExecutionReview(data?.review || {})
}
