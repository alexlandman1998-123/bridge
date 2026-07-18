import { buildSellerDocumentReleaseReadinessReport } from '../lib/sellerDocumentReleaseReadiness.js'
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient.js'

export async function getSellerDocumentReleaseReadiness({ organisationId, listingId = '', client = supabase } = {}) {
  if (!organisationId) throw new Error('organisationId is required for seller-document release certification.')
  if (!isSupabaseConfigured || !client) {
    return buildSellerDocumentReleaseReadinessReport({ organisation_id: organisationId, listing_id: listingId, dependencies_ready: false })
  }
  const result = await client.rpc('bridge_seller_document_release_snapshot_p1_10', {
    p_organisation_id: organisationId,
    p_listing_id: listingId || null,
  })
  if (result.error) throw result.error
  return buildSellerDocumentReleaseReadinessReport(result.data || {})
}

export async function certifySellerDocumentCanary({ organisationId, listingId, expectedRevision, client = supabase } = {}) {
  if (!organisationId || !listingId) throw new Error('organisationId and listingId are required for canary certification.')
  const result = await client.rpc('bridge_certify_seller_document_canary_p1_10', {
    p_organisation_id: organisationId,
    p_listing_id: listingId,
    p_expected_revision: Number(expectedRevision),
  })
  if (result.error) throw result.error
  return result.data
}

export async function setSellerDocumentRollout({ organisationId, mode, canaryListingId = '', reason, expectedRevision, client = supabase } = {}) {
  if (!organisationId || !reason) throw new Error('organisationId and reason are required to change seller-document rollout.')
  const result = await client.rpc('bridge_set_seller_document_rollout_p1_10', {
    p_organisation_id: organisationId,
    p_mode: mode,
    p_canary_listing_id: canaryListingId || null,
    p_reason: reason,
    p_expected_revision: Number(expectedRevision),
  })
  if (result.error) throw result.error
  return result.data
}
