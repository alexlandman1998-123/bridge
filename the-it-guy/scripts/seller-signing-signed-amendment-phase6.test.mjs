import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const read = (path) => readFileSync(resolve(root, path), 'utf8')
const migration = read('../supabase/migrations/20260920000200_prepare_listing_seller_signing_pack_atomically.sql')
const edge = read('../supabase/functions/listing-mandate-signing/index.ts')
const listing = read('src/pages/AgentListingDetail.jsx')

assert.match(migration, /v_source_signed_count > 0/)
assert.match(migration, /v_is_amendment := v_source_signed_count > 0/)
assert.match(migration, /where signing_group_id = p_superseded_signing_group_id and status = 'active'/)
assert.match(migration, /seller_signing_pack_amendment_prepared/)
assert.match(migration, /grant execute on function public\.bridge_prepare_listing_seller_signing_pack_atomically\(uuid, uuid, jsonb, uuid, text, uuid\) to service_role/)
assert.match(edge, /const isAmendment = preparedPack\.isAmendment === true/)
assert.match(edge, /signedSessionsRetained: Number\(preparedPack\.signedSessionsRetained \|\| 0\)/)
assert.match(edge, /signingGroupId,/)
assert.doesNotMatch(edge, /bridge_amend_listing_seller_signing_pack/)
assert.doesNotMatch(edge, /bridge_replace_listing_seller_signing_pack/)
assert.match(listing, /Correct or replace a signing pack/)
assert.match(listing, /Signed — create amendment/)
assert.match(listing, /keeps the original signed pack unchanged as audit evidence/)

console.log('Seller signing signed-amendment phase 6 checks passed.')
