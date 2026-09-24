import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const repositoryRoot = new URL('../../../../', import.meta.url)

async function read(relativePath) {
  return readFile(new URL(relativePath, repositoryRoot), 'utf8')
}

test('seller signing completion uses one immutable idempotency key for pack and legacy writes', async () => {
  const migration = await read('supabase/migrations/20260920194502_make_listing_seller_signing_writes_idempotent.sql')

  assert.match(migration, /unique index if not exists private_listing_documents_signing_session_document_unique[\s\S]*\(signing_session_id, document_type\)/i)
  assert.equal((migration.match(/on conflict \(signing_session_id, document_type\)/gi) || []).length, 2)
  assert.ok((migration.match(/'idempotentReplay', true/g) || []).length >= 2)
  assert.equal((migration.match(/where not exists \([\s\S]*?activity\.metadata ->> 'signingSessionId'/g) || []).length, 2)
  assert.match(migration, /Never overwrite signed legal content/i)
  assert.match(migration, /existing signed % document does not match this signing submission/i)
})

test('seller signing endpoint recovers committed submissions instead of rejecting them as used links', async () => {
  const edgeFunction = await read('supabase/functions/listing-mandate-signing/index.ts')
  const signingPage = await read('the-it-guy/src/pages/ListingMandateSigning.jsx')

  assert.match(edgeFunction, /action === "resolve" && session\.status === "signed"/)
  assert.match(edgeFunction, /const committedSigningReplay = session\.status === "signed" &&[\s\S]{0,160}action === "sign-pack"[\s\S]{0,80}action === "sign"/)
  assert.match(edgeFunction, /if \(session\.status === "signed"\) \{[\s\S]*complete_private_listing_seller_signing_pack/)
  assert.match(edgeFunction, /idempotentReplay: true/)
  assert.doesNotMatch(edgeFunction, /if \(progress\[documentKey\]\) return response\(409/)
  assert.match(signingPage, /result\.data\?\.complete\) setComplete\(\{ groupComplete:/)
})

test('seller signing pack preparation keeps document selection JSONB while preserving branding lineage', async () => {
  const migration = await read('supabase/migrations/20260921060312_restore_jsonb_listing_seller_signing_pack_selection.sql')

  assert.match(migration, /v_selected_documents jsonb;/)
  assert.match(migration, /coalesce\(existing\.selected_documents, '\[\]'::jsonb\) \?\| v_selected_document_keys/)
  assert.doesNotMatch(migration, /coalesce\(existing\.selected_documents, '\{\}'::text\[\]\)/)
  assert.match(migration, /arch9-seller-signing-branding-snapshot-v1/)
  assert.match(migration, /branding_snapshot, branding_digest,[\s\S]*branding_frozen_at/)
  assert.match(migration, /grant execute on function public\.bridge_prepare_listing_seller_signing_pack_atomically[\s\S]*to service_role;/)
})
