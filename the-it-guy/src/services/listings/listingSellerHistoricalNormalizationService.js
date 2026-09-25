import { supabase } from '../../lib/supabaseClient.js'
import { buildListingSellerHistoricalNormalization } from './listingSellerHistoricalNormalizationModel.js'

function isMissingHistoricalAuditRpc(error) {
  const message = String(error?.message || '').toLowerCase()
  return error?.code === 'PGRST202' || message.includes('bridge_get_listing_seller_historical_audit')
}

export async function getListingSellerHistoricalNormalization(listingId, client = supabase) {
  const normalizedId = String(listingId || '').trim()
  if (!client || !normalizedId) return null
  const { data, error } = await client.rpc('bridge_get_listing_seller_historical_audit', {
    p_listing_id: normalizedId,
  })
  if (error) {
    // The app remains compatible while the new migration is awaiting deployment.
    if (isMissingHistoricalAuditRpc(error)) return null
    throw error
  }
  return buildListingSellerHistoricalNormalization(data)
}

export async function previewListingSellerHistoricalNormalization(listingIds, client = supabase) {
  if (!client) return { applied: false, results: [] }
  const ids = [...new Set((Array.isArray(listingIds) ? listingIds : [listingIds]).map((id) => String(id || '').trim()).filter(Boolean))]
  if (!ids.length) return { applied: false, results: [] }
  const { data, error } = await client.rpc('bridge_apply_safe_listing_seller_normalization', {
    p_listing_ids: ids,
    p_apply: false,
  })
  if (error) throw error
  return data || { applied: false, results: [] }
}

export async function auditOrganisationSellerHistory(organisationId, options = {}, client = supabase) {
  const normalizedId = String(organisationId || '').trim()
  if (!client || !normalizedId) return { count: 0, summary: {}, records: [] }
  const { data, error } = await client.rpc('bridge_audit_listing_seller_history', {
    p_organisation_id: normalizedId,
    p_limit: Math.min(500, Math.max(1, Number(options.limit || 250))),
    p_offset: Math.max(0, Number(options.offset || 0)),
  })
  if (error) throw error
  return data || { count: 0, summary: {}, records: [] }
}
