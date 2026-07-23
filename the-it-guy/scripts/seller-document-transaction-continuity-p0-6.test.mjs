import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { buildSellerDocumentTransactionContinuityReport } from '../src/lib/sellerDocumentTransactionContinuity.js'

const healthy = {
  private_listing_document_id: 'source-1',
  private_listing_id: 'listing-1',
  transaction_id: 'transaction-1',
  promoted_transaction_id: 'transaction-1',
  promoted_document_id: 'shared-1',
  source_status: 'approved',
  promoted_status: 'approved',
  continuity_health: 'healthy',
}
const pending = {
  ...healthy,
  private_listing_document_id: 'source-2',
  transaction_id: null,
  promoted_transaction_id: null,
  promoted_document_id: null,
  source_status: 'uploaded',
  continuity_health: 'pending',
  continuity_issue: 'transaction_not_created',
  required_action: 'wait_for_transaction_creation',
}
const blocked = {
  ...healthy,
  private_listing_document_id: 'source-3',
  promoted_document_id: null,
  continuity_health: 'blocked',
  continuity_issue: 'promotion_missing',
  required_action: 'promote_seller_document',
}

const pass = buildSellerDocumentTransactionContinuityReport([healthy], { generatedAt: '2026-07-17T12:00:00Z' })
assert.equal(pass.version, 'seller_document_transaction_continuity_p0_6_v1')
assert.equal(pass.gate.status, 'pass')
assert.equal(pass.gate.attorneyHandoffReady, true)
assert.equal(pass.summary.approvedSourceCount, 1)

const warning = buildSellerDocumentTransactionContinuityReport([healthy, pending])
assert.equal(warning.gate.status, 'warning')
assert.deepEqual(warning.pendingDocumentIds, ['source-2'])

const failure = buildSellerDocumentTransactionContinuityReport([healthy, blocked])
assert.equal(failure.gate.status, 'blocked')
assert.equal(failure.gate.attorneyHandoffReady, false)
assert.deepEqual(failure.blockingDocumentIds, ['source-3'])
assert.deepEqual(failure.affectedTransactionIds, ['transaction-1'])

const migration = await readFile(
  new URL('../../supabase/migrations/202607170012_seller_document_transaction_continuity_p0_6.sql', import.meta.url),
  'utf8',
)
for (const marker of [
  'source_canonical_requirement_instance_id',
  'seller_document_transaction_continuity_v2',
  'bridge_sync_seller_document_transaction_continuity_p0_6',
  'bridge_promote_listing_documents_from_transaction_p0_6',
  'bridge_satisfy_new_transaction_seller_request_p0_6',
  'bridge_satisfy_new_transaction_required_document_p0_6',
  'bridge_upload_private_listing_seller_document_p0_4',
  "'promotion', v_promotion",
  "array['attorney_instruction_ready']",
  'transaction_requirement_instance_id',
  'source_approval_status',
  'promoted_status_mismatch',
  'approved_requirement_not_satisfied_in_transaction',
  'approved_document_re_requested',
  'on conflict (transaction_id, source, source_document_id) do update',
]) {
  assert.ok(migration.toLowerCase().includes(marker.toLowerCase()), `P0-6 migration must include ${marker}`)
}

const cli = await readFile(new URL('./audit-seller-document-transaction-continuity.mjs', import.meta.url), 'utf8')
assert.match(cli, /--confirm-repair/)
assert.match(cli, /--listing-id=<uuid>/)
assert.match(cli, /--strict/)
assert.match(cli, /SUPABASE_STAGING_URL/)
assert.match(cli, /Refusing seller-document staging audit/)

const runbook = await readFile(new URL('../docs/seller-document-transaction-continuity-p0-6.md', import.meta.url), 'utf8')
assert.match(runbook, /does not satisfy attorney readiness/)
assert.match(runbook, /cannot be requested again/)
assert.match(runbook, /never duplicates the underlying uploaded file/)

const packageSource = await readFile(new URL('../package.json', import.meta.url), 'utf8')
assert.match(packageSource, /test:seller-document-continuity-p0-6/)
assert.match(packageSource, /audit:seller-document-continuity/)

console.log('seller document transaction continuity P0-6 tests passed')
