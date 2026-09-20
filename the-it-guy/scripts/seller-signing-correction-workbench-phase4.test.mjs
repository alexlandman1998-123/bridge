import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')
const migration = read('../../supabase/migrations/20260920100953_record_listing_seller_signing_correction_resolution.sql')
const signing = read('../../supabase/functions/listing-mandate-signing/index.ts')
const agent = read('../src/pages/AgentListingDetail.jsx')

assert.match(migration, /create or replace function public\.bridge_record_listing_seller_signing_correction_resolution/)
assert.match(migration, /seller_signing_pack_correction_actioned/)
assert.match(migration, /sourceRequestActivityId/)
assert.match(migration, /revoke all on function public\.bridge_record_listing_seller_signing_correction_resolution/)
assert.match(migration, /grant execute on function public\.bridge_record_listing_seller_signing_correction_resolution\(uuid, uuid, uuid, uuid\) to service_role/)

assert.match(signing, /correctionRequestActivityId/)
assert.match(signing, /bridge_record_listing_seller_signing_correction_resolution/)
assert.match(signing, /correctionResolutionRecorded/)
assert.match(signing, /correctionActivities/)
assert.match(signing, /seller_signing_pack_post_signature_correction_requested/)
assert.match(signing, /seller_signing_pack_correction_actioned/)

assert.match(agent, /sellerSigningCorrectionActivities/)
assert.match(agent, /pendingSigningCorrections/)
assert.match(agent, /Seller correction requests/)
assert.match(agent, /Prepare replacement pack/)
assert.match(agent, /sellerDocumentCorrectionRequestActivityId/)
assert.match(agent, /digital replacement pack/)

console.log('Seller signing correction workbench phase 4 checks passed.')
