import { createClient } from '@supabase/supabase-js'
import { buildSellerDocumentReviewSlaReport } from '../src/lib/sellerDocumentReviewSla.js'

const args = process.argv.slice(2)
const flags = new Set(args)
const strict = flags.has('--strict')
const refresh = flags.has('--refresh')
const confirmed = flags.has('--confirm-refresh')
const dryRun = !refresh
const organisationId = (args.find((arg) => arg.startsWith('--organisation-id=')) || '').split('=').slice(1).join('=').trim()
const listingId = (args.find((arg) => arg.startsWith('--listing-id=')) || '').split('=').slice(1).join('=').trim()
const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || ''
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

if (!url || !key) {
  console.error('SUPABASE_SERVICE_ROLE_KEY and a Supabase URL are required.')
  process.exit(2)
}
if (refresh && !confirmed) {
  console.error('Refresh mode queues SLA alerts and requires --confirm-refresh.')
  process.exit(2)
}
if (refresh && !organisationId && !listingId) {
  console.error('Refresh mode requires --organisation-id or --listing-id to prevent an unscoped manual mutation.')
  process.exit(2)
}

const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
const refreshResult = await client.rpc('bridge_refresh_seller_document_review_sla_p1_9', {
  p_limit: 1000,
  p_now: new Date().toISOString(),
  p_dry_run: dryRun,
  p_organisation_id: organisationId || null,
  p_listing_id: listingId || null,
})
if (refreshResult.error) {
  console.error(`Seller document review SLA refresh failed: ${refreshResult.error.message}`)
  process.exit(2)
}

let query = client.from('seller_document_review_sla_v1').select('*').order('review_due_at', { ascending: true })
if (organisationId) query = query.eq('organisation_id', organisationId)
if (listingId) query = query.eq('private_listing_id', listingId)
const result = await query
if (result.error) {
  console.error(`Seller document review SLA audit failed: ${result.error.message}`)
  process.exit(2)
}

const report = buildSellerDocumentReviewSlaReport(result.data || [], { source: 'remote_security_invoker_view' })
console.log(JSON.stringify({ refresh: refreshResult.data, report }, null, 2))
if (report.gate.status === 'blocked' || (strict && report.gate.status !== 'pass')) process.exitCode = 1
