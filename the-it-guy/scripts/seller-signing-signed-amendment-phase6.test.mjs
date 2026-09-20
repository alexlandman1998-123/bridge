import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const read = (path) => readFileSync(resolve(root, path), 'utf8')
const migration = read('../supabase/migrations/20260919194807_listing_seller_signing_signed_pack_amendment_phase6.sql')
const edge = read('../supabase/functions/listing-mandate-signing/index.ts')
const listing = read('src/pages/AgentListingDetail.jsx')

assert.match(migration, /bridge_amend_listing_seller_signing_pack/)
assert.match(migration, /v_signed_count = 0/)
assert.match(migration, /seller_signing_pack_amendment_prepared/)
assert.match(migration, /grant execute on function public\.bridge_amend_listing_seller_signing_pack\(uuid, uuid, uuid, text, uuid\) to service_role/)
assert.match(edge, /hasSignedSource/)
assert.match(edge, /bridge_amend_listing_seller_signing_pack/)
assert.match(edge, /bridge_replace_listing_seller_signing_pack/)
assert.match(listing, /Correct or replace a signing pack/)
assert.match(listing, /Signed — create amendment/)
assert.match(listing, /keeps the original signed pack unchanged as audit evidence/)

console.log('Seller signing signed-amendment phase 6 checks passed.')
