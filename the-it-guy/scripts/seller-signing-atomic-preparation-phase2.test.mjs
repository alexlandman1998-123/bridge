import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')
const edge = read('../../supabase/functions/listing-mandate-signing/index.ts')
const migration = read('../../supabase/migrations/20260920000200_prepare_listing_seller_signing_pack_atomically.sql')
const correctiveMigration = read('../../supabase/migrations/20260920140000_fix_listing_seller_signing_pack_document_types.sql')

assert.match(edge, /bridge_prepare_listing_seller_signing_pack_atomically/)
assert.doesNotMatch(edge, /bridge_amend_listing_seller_signing_pack/)
assert.doesNotMatch(edge, /bridge_replace_listing_seller_signing_pack/)
assert.match(edge, /Email is intentionally post-transaction/)
assert.match(migration, /create or replace function public\.bridge_prepare_listing_seller_signing_pack_atomically/)
assert.match(migration, /insert into public\.private_listing_signing_pack_replacements/)
assert.match(migration, /insert into public\.private_listing_mandate_signing_sessions/)
assert.match(migration, /revoke all on function public\.bridge_prepare_listing_seller_signing_pack_atomically/)
assert.match(migration, /grant execute on function public\.bridge_prepare_listing_seller_signing_pack_atomically\(uuid, uuid, jsonb, uuid, text, uuid\) to service_role/)
assert.match(correctiveMigration, /v_selected_documents jsonb/)
assert.match(correctiveMigration, /v_selected_document_keys text\[\]/)
assert.match(correctiveMigration, /coalesce\(existing\.selected_documents, '\[\]'::jsonb\) \?\| v_selected_document_keys/)
assert.doesNotMatch(correctiveMigration, /coalesce\(existing\.selected_documents, '\{\}'::text\[\]\)/)
assert.match(correctiveMigration, /trim\(v_session->>'tokenHash'\).*v_selected_documents/s)

console.log('Seller signing atomic preparation phase 2 checks passed.')
