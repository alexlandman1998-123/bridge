import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const apiSource = fs.readFileSync(path.join(root, 'src/lib/api.js'), 'utf8')
const privateListingServiceSource = fs.readFileSync(
  path.join(root, 'src/services/privateListingService.js'),
  'utf8',
)
const migrationSource = fs.readFileSync(
  path.join(root, '../supabase/migrations/202606010002_seller_document_transaction_bridge.sql'),
  'utf8',
)

assert.equal(
  packageJson.scripts['test:seller-document-propagation'],
  'node scripts/seller-document-propagation.test.mjs',
  'package script should expose seller document propagation checks',
)

assert.match(
  migrationSource,
  /add column if not exists source_document_id uuid/i,
  'shared documents should retain a source document linkage for seller promotions',
)
assert.match(
  migrationSource,
  /add column if not exists uploaded_by_party text/i,
  'shared documents should capture the uploading party for seller promotions',
)
assert.match(
  migrationSource,
  /add column if not exists pending_transaction_promotion boolean/i,
  'private listing documents should retain pending promotion state',
)
assert.match(
  migrationSource,
  /create unique index if not exists documents_transaction_source_document_unique_idx/i,
  'seller promotions should be idempotent on transaction + source document',
)
assert.doesNotMatch(
  migrationSource,
  /documents_transaction_source_document_unique_idx[\s\S]*?\bwhere source is not null and source_document_id is not null/i,
  'seller promotion idempotency index must not be partial because the ON CONFLICT clause targets the column list directly',
)
assert.match(
  migrationSource,
  /create or replace function public\.bridge_promote_private_listing_document_row/i,
  'migration should expose a promotion helper for individual seller uploads',
)
assert.match(
  migrationSource,
  /create or replace function public\.bridge_promote_pending_private_listing_documents/i,
  'migration should expose a catch-up promotion helper for pending seller uploads',
)
assert.match(
  migrationSource,
  /on conflict \(transaction_id, source, source_document_id\) do update/i,
  'promotion should upsert instead of duplicating shared document rows',
)
assert.match(
  migrationSource,
  /insert into public\.transaction_notifications[\s\S]*?on conflict do nothing/i,
  'seller upload notifications should use generic conflict suppression because staging dedupe relies on a partial unique index',
)
assert.match(
  migrationSource,
  /transaction_required_documents/i,
  'promotion should update transaction-level required document status',
)
assert.match(
  migrationSource,
  /document_requests/i,
  'promotion should update transaction document requests when uploads satisfy them',
)
assert.match(
  migrationSource,
  /transaction_notifications/i,
  'promotion should be able to notify internal roleplayers',
)
assert.match(
  migrationSource,
  /perform public\.bridge_promote_pending_private_listing_documents\(v_listing\.id\)/i,
  'seller portal payload should backfill pending promotions when the listing is reopened',
)

assert.match(
  privateListingServiceSource,
  /p_canonical_requirement_instance_id:\s*canonicalRequirementInstanceId \|\| null/i,
  'seller upload client should pass canonical requirement linkage into the scoped RPC',
)
assert.match(
  privateListingServiceSource,
  /p_category:\s*category \|\| 'Seller Document'/i,
  'seller upload client should pass the requested seller document category into the scoped RPC',
)
assert.match(
  privateListingServiceSource,
  /pendingTransactionPromotion/i,
  'seller upload result should expose pending transaction promotion state',
)
assert.match(
  privateListingServiceSource,
  /sharedDocumentId/i,
  'seller upload result should expose the promoted shared document id when available',
)

assert.match(
  apiSource,
  /function normalizeDocumentViewerRole/i,
  'shared document visibility filtering should normalize external role viewers safely',
)
assert.match(
  apiSource,
  /bridge_promote_pending_private_listing_documents/i,
  'internal transaction workspaces should attempt pending seller document promotion',
)
assert.match(
  apiSource,
  /viewerRole:\s*access\.role/i,
  'external workspace document loading should respect the external access role',
)
assert.match(
  apiSource,
  /source_document_id, file_bucket/i,
  'shared document fetches should retain file bucket metadata for promoted seller documents',
)

console.log('seller-document-propagation tests passed')
