import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')
const signingPage = read('../src/pages/ListingMandateSigning.jsx')
const edgeFunction = read('../../supabase/functions/listing-mandate-signing/index.ts')
const migration = read('../../supabase/migrations/20260920000100_fix_listing_signing_entity_fica_details.sql')

assert.match(signingPage, /Company legal name/)
assert.match(signingPage, /Trust registration number/)
assert.match(signingPage, /entityRegistrationNumber/)
assert.match(edgeFunction, /company registration number/)
assert.match(edgeFunction, /trust registration number/)
assert.match(edgeFunction, /companyRegisteredAddress/)
assert.match(migration, /v_is_entity boolean/)
assert.match(migration, /'companyName', v_entity_name/)
assert.match(migration, /'trustName', v_entity_name/)
assert.match(migration, /grant execute on function public\.bridge_update_listing_signing_seller_details\(uuid, jsonb\) to service_role/)

console.log('Seller signing entity FICA phase 1 checks passed.')
