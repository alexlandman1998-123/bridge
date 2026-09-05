import assert from 'node:assert/strict'
import fs from 'node:fs'

const migration = fs.readFileSync('../supabase/migrations/20260905090353_document_trust_phase1_seller_atomic_link.sql', 'utf8')
const sellerService = fs.readFileSync('src/services/privateListingService.js', 'utf8')
const docs = fs.readFileSync('docs/document-trust-phase1-atomic-linking.md', 'utf8')
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'))

assert.equal(packageJson.scripts['test:document-trust-phase1'], 'node scripts/document-trust-phase1-atomic-linking.test.mjs')
assert.match(migration, /document_trust_state', 'pending_transaction_link'/)
assert.match(migration, /document_trust_state', 'canonically_linked'/)
assert.match(migration, /canonical_requirement_instance_id is null/)
assert.match(migration, /raise exception 'Seller upload could not be linked to the canonical transaction document requirement.'/)
assert.match(migration, /bridge_promote_private_listing_document_row/)
assert.match(sellerService, /removePrivateListingDocumentObject/)
assert.match(sellerService, /seller_document_canonical_link_failed/)
assert.match(sellerService, /Your document was not linked to the transaction file/)
assert.match(sellerService, /document_trust_state/)
assert.match(sellerService, /canonically_linked/)
assert.match(sellerService, /pending_transaction_link/)
assert.doesNotMatch(sellerService, /const usedFallbackUpload/)
assert.match(docs, /legacy-only records/)
assert.match(docs, /pending_transaction_link/)

console.log('document trust Phase 1 atomic-linking tests passed')
