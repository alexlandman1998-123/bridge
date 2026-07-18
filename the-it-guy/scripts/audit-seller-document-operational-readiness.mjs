import { createClient } from '@supabase/supabase-js'
import { buildSellerDocumentOperationalReadinessReport } from '../src/lib/sellerDocumentOperationalReadiness.js'

const args = process.argv.slice(2)
const flags = new Set(args)
const strict = flags.has('--strict')
const apply = flags.has('--apply')
const confirmed = flags.has('--confirm-apply')
const organisationId = (args.find((arg) => arg.startsWith('--organisation-id=')) || '').split('=').slice(1).join('=').trim()
const listingId = (args.find((arg) => arg.startsWith('--listing-id=')) || '').split('=').slice(1).join('=').trim()
const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || ''
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || ''
const accessToken = process.env.SELLER_DOCUMENT_AUDIT_ACCESS_TOKEN || ''

if (!url || !key) {
  console.error('Supabase URL and a service-role or authenticated key are required.')
  process.exit(2)
}
if (apply && !confirmed) {
  console.error('Apply mode requires --confirm-apply. Run without --apply first and review the dry-run report.')
  process.exit(2)
}
if (apply && !organisationId && !listingId) {
  console.error('Apply mode requires --organisation-id or --listing-id to prevent an unscoped repair.')
  process.exit(2)
}

const client = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: accessToken ? { headers: { Authorization: `Bearer ${accessToken}` } } : undefined,
})

if (apply) {
  const repair = await client.rpc('bridge_reconcile_seller_document_operations_p0_5', {
    p_organisation_id: organisationId || null,
    p_listing_id: listingId || null,
    p_apply: true,
    p_reason: 'operator_confirmed_p0_5_reconciliation',
  })
  if (repair.error) {
    console.error(`Seller document reconciliation failed: ${repair.error.message}`)
    process.exit(2)
  }
  console.log(JSON.stringify(repair.data, null, 2))
  process.exit(0)
}

let query = client
  .from('private_listing_seller_document_operational_readiness_v1')
  .select('*')
  .order('lifecycle_health', { ascending: true })
  .order('private_listing_id', { ascending: true })
if (organisationId) query = query.eq('organisation_id', organisationId)
if (listingId) query = query.eq('private_listing_id', listingId)
const result = await query
if (result.error) {
  console.error(`Seller document readiness audit failed: ${result.error.message}`)
  process.exit(2)
}

const report = buildSellerDocumentOperationalReadinessReport(result.data || [], {
  source: 'remote_security_invoker_view',
})
console.log(JSON.stringify(report, null, 2))
if (report.gate.status === 'blocked' || (strict && report.gate.status !== 'pass')) process.exitCode = 1
