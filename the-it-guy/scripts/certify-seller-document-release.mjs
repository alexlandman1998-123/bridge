import { createClient } from '@supabase/supabase-js'
import { buildSellerDocumentReleaseReadinessReport } from '../src/lib/sellerDocumentReleaseReadiness.js'

const args = process.argv.slice(2)
const flags = new Set(args)
const value = (name) => (args.find((arg) => arg.startsWith(`${name}=`)) || '').split('=').slice(1).join('=').trim()
const organisationId = value('--organisation-id')
const listingId = value('--listing-id')
const setMode = value('--set-mode')
const reason = value('--reason')
const expectedRevision = Number(value('--expected-revision'))
const certifyCanary = flags.has('--certify-canary')
const confirmMutation = flags.has('--confirm-rollout-change')
const strict = flags.has('--strict')
const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || ''
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

if (!url || !key) {
  console.error('SUPABASE_SERVICE_ROLE_KEY and a Supabase URL are required.')
  process.exit(2)
}
if (!organisationId) {
  console.error('--organisation-id is required; unscoped release certification is prohibited.')
  process.exit(2)
}
if ((setMode || certifyCanary) && !confirmMutation) {
  console.error('Mutating rollout state requires --confirm-rollout-change.')
  process.exit(2)
}
if ((setMode || certifyCanary) && !Number.isInteger(expectedRevision)) {
  console.error('Mutating rollout state requires --expected-revision=<integer>.')
  process.exit(2)
}
if (setMode && !['paused', 'canary', 'enabled'].includes(setMode)) {
  console.error('--set-mode must be paused, canary, or enabled.')
  process.exit(2)
}
if (setMode && !reason) {
  console.error('--reason is required for every rollout state change.')
  process.exit(2)
}
if ((setMode === 'canary' || certifyCanary) && !listingId) {
  console.error('--listing-id is required for canary mode and certification.')
  process.exit(2)
}

const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
const snapshotResult = await client.rpc('bridge_seller_document_release_snapshot_p1_10', {
  p_organisation_id: organisationId,
  p_listing_id: listingId || null,
})
if (snapshotResult.error) {
  console.error(`Seller-document release snapshot failed: ${snapshotResult.error.message}`)
  process.exit(2)
}

const report = buildSellerDocumentReleaseReadinessReport(snapshotResult.data || {})
let mutation = null
if (setMode) {
  const result = await client.rpc('bridge_set_seller_document_rollout_p1_10', {
    p_organisation_id: organisationId,
    p_mode: setMode,
    p_canary_listing_id: listingId || null,
    p_reason: reason,
    p_expected_revision: expectedRevision,
  })
  if (result.error) {
    console.error(`Seller-document rollout change failed: ${result.error.message}`)
    process.exit(2)
  }
  mutation = result.data
}
if (certifyCanary) {
  const result = await client.rpc('bridge_certify_seller_document_canary_p1_10', {
    p_organisation_id: organisationId,
    p_listing_id: listingId,
    p_expected_revision: expectedRevision,
  })
  if (result.error) {
    console.error(`Seller-document canary certification failed: ${result.error.message}`)
    process.exit(2)
  }
  mutation = result.data
}

console.log(JSON.stringify({ report, mutation }, null, 2))
if (report.gate.status === 'blocked' || (strict && report.gate.status !== 'pass') || mutation?.success === false) process.exitCode = 1
