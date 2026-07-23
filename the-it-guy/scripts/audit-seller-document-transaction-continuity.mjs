import { createClient } from '@supabase/supabase-js'
import { buildSellerDocumentTransactionContinuityReport } from '../src/lib/sellerDocumentTransactionContinuity.js'

const args = process.argv.slice(2)
const flags = new Set(args)
const strict = flags.has('--strict')
const repair = flags.has('--repair')
const confirmed = flags.has('--confirm-repair')
const organisationId = (args.find((arg) => arg.startsWith('--organisation-id=')) || '').split('=').slice(1).join('=').trim()
const listingId = (args.find((arg) => arg.startsWith('--listing-id=')) || '').split('=').slice(1).join('=').trim()
const transactionId = (args.find((arg) => arg.startsWith('--transaction-id=')) || '').split('=').slice(1).join('=').trim()
const stagingProjectRef = (process.env.SUPABASE_STAGING_PROJECT_REF || '').trim()
const url = process.env.SUPABASE_STAGING_URL || process.env.VITE_SUPABASE_STAGING_URL || process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || ''
const key = process.env.SUPABASE_STAGING_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || ''
const accessToken = process.env.SELLER_DOCUMENT_AUDIT_ACCESS_TOKEN || ''

if (!url || !key) {
  console.error('Supabase URL and a service-role or authenticated key are required.')
  process.exit(2)
}
if (stagingProjectRef) {
  let configuredProjectRef = ''
  try {
    configuredProjectRef = new URL(url).hostname.split('.')[0] || ''
  } catch {
    console.error('The configured Supabase URL is invalid.')
    process.exit(2)
  }
  if (configuredProjectRef !== stagingProjectRef) {
    console.error(`Refusing seller-document staging audit: URL targets ${configuredProjectRef || 'an unknown project'}, expected staging project ${stagingProjectRef}. Set SUPABASE_STAGING_URL and SUPABASE_STAGING_SERVICE_ROLE_KEY before retrying.`)
    process.exit(2)
  }
}
if (repair && (!confirmed || !listingId)) {
  console.error('Repair mode requires both --listing-id=<uuid> and --confirm-repair.')
  process.exit(2)
}

const client = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: accessToken ? { headers: { Authorization: `Bearer ${accessToken}` } } : undefined,
})

if (repair) {
  const result = await client.rpc('bridge_promote_pending_private_listing_documents', {
    p_private_listing_id: listingId,
  })
  if (result.error) {
    console.error(`Seller document continuity repair failed: ${result.error.message}`)
    process.exit(2)
  }
  console.log(JSON.stringify(result.data, null, 2))
  process.exit(0)
}

let query = client.from('seller_document_transaction_continuity_v2').select('*')
if (organisationId) query = query.eq('organisation_id', organisationId)
if (listingId) query = query.eq('private_listing_id', listingId)
if (transactionId) query = query.eq('transaction_id', transactionId)
const result = await query
if (result.error) {
  console.error(`Seller document transaction-continuity audit failed: ${result.error.message}`)
  process.exit(2)
}
const report = buildSellerDocumentTransactionContinuityReport(result.data || [], {
  source: 'remote_security_invoker_view',
})
console.log(JSON.stringify(report, null, 2))
if (report.gate.status === 'blocked' || (strict && report.gate.status !== 'pass')) process.exitCode = 1
