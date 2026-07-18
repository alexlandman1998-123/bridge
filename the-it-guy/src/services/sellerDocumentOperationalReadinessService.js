import { buildSellerDocumentOperationalReadinessReport } from '../lib/sellerDocumentOperationalReadiness.js'
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient.js'

const READINESS_SELECT = [
  'private_listing_id',
  'organisation_id',
  'listing_status',
  'seller_onboarding_status',
  'required_count',
  'satisfied_count',
  'received_pending_approval_count',
  'missing_count',
  'rejected_count',
  'overdue_count',
  'unissued_request_count',
  'false_completion_count',
  'cross_listing_link_count',
  'canonical_mismatch_count',
  'blocking_issue_count',
  'attention_issue_count',
  'lifecycle_health',
  'lifecycle_issue',
  'required_action',
  'last_requirement_activity_at',
].join(',')

function isMissingRelation(error = {}) {
  return ['42P01', 'PGRST205'].includes(String(error?.code || '').toUpperCase())
}

export async function getSellerDocumentOperationalReadinessReport({ organisationId = '', client = supabase } = {}) {
  if (!isSupabaseConfigured || !client) {
    return buildSellerDocumentOperationalReadinessReport([], { source: 'supabase_not_configured' })
  }
  let query = client.from('private_listing_seller_document_operational_readiness_v1').select(READINESS_SELECT)
  if (organisationId) query = query.eq('organisation_id', organisationId)
  const result = await query
  if (result.error) {
    if (isMissingRelation(result.error)) {
      const report = buildSellerDocumentOperationalReadinessReport([], { source: 'p0_5_readiness_view_missing' })
      return {
        ...report,
        gate: {
          status: 'blocked',
          releaseRecommended: false,
          reason: 'Deploy the P0-5 seller document operational readiness migration before release certification.',
        },
      }
    }
    throw result.error
  }
  return buildSellerDocumentOperationalReadinessReport(result.data || [])
}

export async function reconcileSellerDocumentOperationalReadiness({
  organisationId = '',
  listingId = '',
  apply = false,
  reason = 'p0_5_operational_reconciliation',
  client = supabase,
} = {}) {
  if (!isSupabaseConfigured || !client) throw new Error('Supabase is required for seller document reconciliation.')
  const result = await client.rpc('bridge_reconcile_seller_document_operations_p0_5', {
    p_organisation_id: organisationId || null,
    p_listing_id: listingId || null,
    p_apply: Boolean(apply),
    p_reason: reason,
  })
  if (result.error) throw result.error
  return result.data
}
