import { buildSellerDocumentReviewSlaReport } from '../lib/sellerDocumentReviewSla.js'
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient.js'

function missingRelation(error = {}) {
  return ['42P01', 'PGRST205'].includes(String(error?.code || '').toUpperCase())
}

export async function getSellerDocumentReviewSlaReport({ organisationId = '', listingId = '', client = supabase } = {}) {
  if (!isSupabaseConfigured || !client) return buildSellerDocumentReviewSlaReport([], { source: 'supabase_not_configured' })
  let query = client.from('seller_document_review_sla_v1').select('*')
  if (organisationId) query = query.eq('organisation_id', organisationId)
  if (listingId) query = query.eq('private_listing_id', listingId)
  const result = await query.order('review_due_at', { ascending: true })
  if (result.error) {
    if (missingRelation(result.error)) {
      const report = buildSellerDocumentReviewSlaReport([], { source: 'p1_9_sla_view_missing' })
      return { ...report, gate: { status: 'blocked', releaseRecommended: false, reason: 'Deploy the P1-9 seller document review SLA migration.' } }
    }
    throw result.error
  }
  return buildSellerDocumentReviewSlaReport(result.data || [], { source: 'remote_security_invoker_view' })
}

export async function refreshSellerDocumentReviewSla({
  organisationId = '',
  listingId = '',
  dryRun = true,
  limit = 250,
  now = new Date(),
  client = supabase,
} = {}) {
  if (!isSupabaseConfigured || !client) throw new Error('Supabase is required to refresh seller document review SLAs.')
  const result = await client.rpc('bridge_refresh_seller_document_review_sla_p1_9', {
    p_limit: Math.max(1, Math.min(Number(limit) || 250, 1000)),
    p_now: now instanceof Date ? now.toISOString() : new Date(now).toISOString(),
    p_dry_run: Boolean(dryRun),
    p_organisation_id: organisationId || null,
    p_listing_id: listingId || null,
  })
  if (result.error) throw result.error
  return result.data
}
