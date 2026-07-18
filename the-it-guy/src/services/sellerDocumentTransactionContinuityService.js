import { buildSellerDocumentTransactionContinuityReport } from '../lib/sellerDocumentTransactionContinuity.js'
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient.js'

export async function getSellerDocumentTransactionContinuityReport({
  organisationId = '',
  listingId = '',
  transactionId = '',
  client = supabase,
} = {}) {
  if (!isSupabaseConfigured || !client) {
    return buildSellerDocumentTransactionContinuityReport([], { source: 'supabase_not_configured' })
  }
  let query = client.from('seller_document_transaction_continuity_v2').select('*')
  if (organisationId) query = query.eq('organisation_id', organisationId)
  if (listingId) query = query.eq('private_listing_id', listingId)
  if (transactionId) query = query.eq('transaction_id', transactionId)
  const result = await query
  if (result.error) {
    if (['42P01', 'PGRST205'].includes(String(result.error.code || '').toUpperCase())) {
      const report = buildSellerDocumentTransactionContinuityReport([], { source: 'p0_6_continuity_view_missing' })
      return {
        ...report,
        gate: {
          status: 'blocked',
          releaseRecommended: false,
          attorneyHandoffReady: false,
          reason: 'Deploy the P0-6 seller document transaction-continuity migration before handoff certification.',
        },
      }
    }
    throw result.error
  }
  return buildSellerDocumentTransactionContinuityReport(result.data || [])
}

export async function repairSellerDocumentTransactionContinuity({ listingId, client = supabase } = {}) {
  if (!isSupabaseConfigured || !client) throw new Error('Supabase is required for seller document continuity repair.')
  if (!listingId) throw new Error('Listing id is required for a scoped continuity repair.')
  const result = await client.rpc('bridge_promote_pending_private_listing_documents', {
    p_private_listing_id: listingId,
  })
  if (result.error) throw result.error
  return result.data
}
