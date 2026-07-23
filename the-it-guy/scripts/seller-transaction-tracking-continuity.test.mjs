import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createServer } from 'vite'

const workspaceSource = await readFile(new URL('../src/services/clientPortalWorkspaceService.js', import.meta.url), 'utf8')
const privateListingSource = await readFile(new URL('../src/services/privateListingService.js', import.meta.url), 'utf8')
const apiSource = await readFile(new URL('../src/lib/api.js', import.meta.url), 'utf8')
const migration = await readFile(
  new URL('../../supabase/migrations/202607230002_seller_transaction_tracking_continuity.sql', import.meta.url),
  'utf8',
)
const phase4CompatibilityMigration = await readFile(
  new URL('../../supabase/migrations/202607230003_seller_transaction_tracking_phase4_compatibility.sql', import.meta.url),
  'utf8',
)

assert.match(workspaceSource, /export function buildSellerTransactionTrackingProjection/, 'seller workspace needs a transaction-first projection')
assert.match(workspaceSource, /transaction: context\?\.transaction/, 'seller workspace must consume the secure RPC transaction projection')
assert.match(privateListingSource, /transaction: mapSellerPortalTransactionTracking\(payload\?\.transaction\)/, 'seller payload mapper must retain the RPC transaction projection')
assert.doesNotMatch(
  privateListingSource.match(/function buildSellerClientPortalContextPayload[\s\S]*?\n}\n\nfunction buildSellerPortalDocumentsEmailPayload/)?.[0] || '',
  /transaction_id:\s*null/,
  'seller context refreshes must not erase an existing transaction link',
)
assert.match(apiSource, /const linkedPrivateListingId = transactionType === 'private_property'/, 'agent-created private transactions must resolve their listing link')
assert.match(apiSource, /listing_id: linkedPrivateListingId/, 'agent-created private transactions must persist listing_id')

for (const marker of [
  'bridge_sync_seller_portal_transaction_context',
  'trg_sync_seller_portal_transaction_context',
  'trg_sync_seller_portal_transaction_context_from_portal_context',
  "'transaction', v_transaction",
  "'current_main_stage', tx.current_main_stage",
  "'lifecycle_state', tx.lifecycle_state",
  "'updated_at', tx.updated_at",
  "coalesce(v_result ->> 'authRequired', 'false') <> 'true'",
  "revoke all on function public.bridge_private_listing_seller_portal_payload(text, text, boolean)",
]) {
  assert.ok(migration.includes(marker), `seller transaction continuity migration must include ${marker}`)
}
assert.doesNotMatch(migration, /to_jsonb\(v_transaction\)/, 'seller RPC must not expose a raw transaction row')
assert.doesNotMatch(migration, /'next_action',\s*tx\.next_action/, 'seller RPC must not expose internal next actions')
assert.doesNotMatch(migration, /'purchase_price',\s*tx\.purchase_price/, 'seller RPC must not expose financial transaction fields')
assert.match(
  phase4CompatibilityMigration,
  /create or replace function public\.bridge_is_seller_portal_final_artifact_document_phase4[\s\S]*?create or replace function public\.bridge_sanitize_seller_portal_final_artifact_payload_phase4[\s\S]*?return public\.bridge_sanitize_seller_portal_final_artifact_payload_phase4\(v_result\)/,
  'seller tracking must restore the Phase 4 sanitizer before returning an allowlisted transaction projection',
)

const server = await createServer({
  root: process.cwd(),
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const { buildSellerTransactionTrackingProjection } = await server.ssrLoadModule('/src/services/clientPortalWorkspaceService.js')
  const linked = buildSellerTransactionTrackingProjection({
    listing: {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      listingStatus: 'offer_accepted',
      updated_at: '2026-07-23T08:00:00.000Z',
    },
    transaction: {
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      stage: 'FICA Verification',
      current_main_stage: 'ATTY',
      updated_at: '2026-07-23T10:00:00.000Z',
    },
    sellerPortalStage: 'offer_accepted',
  })
  assert.equal(linked.transaction.id, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')
  assert.equal(linked.transaction.stage, 'FICA Verification')
  assert.equal(linked.transaction.current_main_stage, 'ATTY')
  assert.equal(linked.stage, 'FICA Verification')
  assert.equal(linked.mainStage, 'ATTY')
  assert.equal(linked.lastUpdated, '2026-07-23T10:00:00.000Z')

  const preSale = buildSellerTransactionTrackingProjection({
    listing: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', updated_at: '2026-07-23T08:00:00.000Z' },
    sellerPortalStage: 'listed',
  })
  assert.equal(preSale.transaction.id, null, 'a listing ID must never be used as a transaction ID')
  assert.equal(preSale.stage, 'listed')
  assert.equal(preSale.mainStage, 'listed')
} finally {
  await server.close()
}

console.log('seller transaction tracking continuity tests passed')
