import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { ONLINE_SIGNING_DISABLED } from '../onlineSigningPolicy.js'
import {
  SELLER_PORTAL_SIGNING_ENABLED,
  assertSellerPortalSigningAvailable,
} from '../sellerPortalSigningPolicy.js'

test('new per-document portal route remains independent of the retired online signing route', () => {
  assert.equal(ONLINE_SIGNING_DISABLED, true)
  assert.equal(SELLER_PORTAL_SIGNING_ENABLED, true)
  for (const workflow of ['seller_disclosure', 'seller_fica_declaration', 'seller_mandate']) {
    assert.doesNotThrow(() => assertSellerPortalSigningAvailable(workflow))
  }
})

test('portal dispatch and signature evidence use a separate server-only boundary', async () => {
  const [server, migration] = await Promise.all([
    readFile(new URL('../../../../../supabase/functions/seller-portal-document-signing/index.ts', import.meta.url), 'utf8'),
    readFile(new URL('../../../../../supabase/migrations/20260927102934_seller_portal_document_signing_foundation.sql', import.meta.url), 'utf8'),
  ])
  assert.match(server, /SELLER_PORTAL_SIGNING_ENABLED/)
  assert.match(server, /bridge_listing_seller_actor_permission/)
  assert.match(server, /crypto\.subtle\.digest\("SHA-256"/)
  assert.match(server, /bridge_submit_seller_portal_document_signature/)
  assert.doesNotMatch(server, /private_listing_mandate_signing_sessions|listing-mandate-signing/)
  assert.match(migration, /private_listing_seller_portal_signature_evidence enable row level security/)
  assert.match(migration, /revoke all on table public\.private_listing_seller_portal_signing_recipients from public, anon, authenticated/)
  assert.match(migration, /Seller portal signature evidence is append-only/)
  assert.match(migration, /A reviewed seller signing version is immutable/)
})
