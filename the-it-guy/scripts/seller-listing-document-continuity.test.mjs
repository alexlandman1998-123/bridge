import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const repoRoot = resolve(import.meta.dirname, '..', '..')
const appRoot = resolve(import.meta.dirname, '..')

const migration = readFileSync(
  resolve(repoRoot, 'supabase/migrations/202606090003_private_listing_document_continuity.sql'),
  'utf8',
)
const sellerDocumentBridgeMigration = readFileSync(
  resolve(repoRoot, 'supabase/migrations/202606010002_seller_document_transaction_bridge.sql'),
  'utf8',
)
const sourceOfTruthContract = readFileSync(
  resolve(appRoot, 'docs/seller-lead-listing-source-of-truth.md'),
  'utf8',
)
const packageJson = JSON.parse(readFileSync(resolve(appRoot, 'package.json'), 'utf8'))

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

test('migration guards future listing mandate packet references', () => {
  assert.match(migration, /add constraint private_listings_mandate_packet_id_document_packets_fkey/i)
  assert.match(migration, /foreign key \(mandate_packet_id\)\s+references public\.document_packets\(id\)\s+on delete set null\s+not valid/i)
  assert.match(migration, /information_schema\.columns[\s\S]*table_name = 'private_listings'[\s\S]*column_name = 'mandate_packet_id'[\s\S]*udt_name = 'uuid'/i)
  assert.match(migration, /create index if not exists private_listings_mandate_packet_id_idx/i)
})

test('migration exposes service-only document continuity report', () => {
  assert.match(migration, /bridge_private_listing_document_continuity_report\(\)/i)
  assert.match(migration, /listing_mandate_packet_orphans/i)
  assert.match(migration, /lead_mandate_packet_orphans/i)
  assert.match(migration, /mandate_packet_listing_mismatches/i)
  assert.match(migration, /private_listing_document_requirement_mismatches/i)
  assert.match(migration, /private_listing_documents_missing_file_reference/i)
  assert.match(migration, /private_listing_documents_pending_transaction_promotion/i)
  assert.match(migration, /private_listing_document_promotion_orphans/i)
  assert.match(migration, /private_listing_document_promotion_mismatches/i)
  assert.match(migration, /duplicate_promoted_seller_documents/i)
  assert.match(migration, /required_private_listing_documents_missing_upload/i)
  assert.match(migration, /revoke all on function public\.bridge_private_listing_document_continuity_report\(\) from authenticated/i)
  assert.match(migration, /grant execute on function public\.bridge_private_listing_document_continuity_report\(\) to service_role/i)
})

test('document continuity report keeps seller upload promotion link semantics', () => {
  assert.match(sellerDocumentBridgeMigration, /source_document_id uuid/i)
  assert.match(sellerDocumentBridgeMigration, /source,\s*source_document_id/i)
  assert.match(sellerDocumentBridgeMigration, /'seller_portal'/i)
  assert.match(migration, /shared_doc\.source_document_id <> doc\.id/i)
  assert.match(migration, /shared_doc\.source = 'seller_portal'/i)
  assert.doesNotMatch(migration, /insert into public\.documents/i)
  assert.doesNotMatch(migration, /delete from public\.private_listing_documents/i)
})

test('source-of-truth contract documents document continuity behavior', () => {
  assert.match(sourceOfTruthContract, /## Document Continuity/)
  assert.match(sourceOfTruthContract, /Seller-uploaded documents remain listing-scoped/)
  assert.match(sourceOfTruthContract, /promoted idempotently into transaction `documents`/)
  assert.match(sourceOfTruthContract, /`source = 'seller_portal'` and `source_document_id`/)
  assert.match(sourceOfTruthContract, /The signed mandate PDF remains a legal packet in `document_packets`/)
  assert.match(sourceOfTruthContract, /bridge_private_listing_document_continuity_report\(\)/)
})

test('package exposes the document continuity test', () => {
  assert.equal(
    packageJson.scripts['test:seller-listing-document-continuity'],
    'node scripts/seller-listing-document-continuity.test.mjs',
  )
})

console.log('seller listing document continuity tests passed')
