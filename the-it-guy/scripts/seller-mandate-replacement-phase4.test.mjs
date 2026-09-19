import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')
const migration = read('../../supabase/migrations/20260918202110_listing_seller_signing_pack_replacement_phase4.sql')
const signing = read('../../supabase/functions/listing-mandate-signing/index.ts')
const agent = read('../src/pages/AgentListingDetail.jsx')

assert.match(migration, /private_listing_signing_pack_replacements/)
assert.match(migration, /bool_and\(status = 'signed'\)/)
assert.match(migration, /set status = 'revoked'/)
assert.match(migration, /revoke all on function public\.bridge_replace_listing_seller_signing_pack/)
assert.match(signing, /supersededSigningGroupId/)
assert.match(signing, /bridge_replace_listing_seller_signing_pack/)
assert.match(signing, /replacementReason\.length < 5/)
assert.match(agent, /Replace an active signing pack/)
assert.match(agent, /Reason for replacement/)

console.log('seller mandate replacement phase 4 checks passed')
