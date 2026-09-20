import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')
const migration = read('../../supabase/migrations/20260920100208_rotate_listing_seller_signing_link_for_delivery_recovery.sql')
const signing = read('../../supabase/functions/listing-mandate-signing/index.ts')
const agent = read('../src/pages/AgentListingDetail.jsx')
const signer = read('../src/pages/ListingMandateSigning.jsx')

assert.match(migration, /create or replace function public\.bridge_rotate_listing_seller_signing_link/)
assert.match(migration, /where id = v_session\.id/)
assert.match(migration, /seller_signing_link_reissued/)
assert.match(migration, /revoke all on function public\.bridge_rotate_listing_seller_signing_link/)
assert.match(migration, /grant execute on function public\.bridge_rotate_listing_seller_signing_link\(uuid, text, timestamptz, uuid\) to service_role/)

assert.match(signing, /action === "resend"/)
assert.match(signing, /bridge_rotate_listing_seller_signing_link/)
assert.match(signing, /previousLinkInvalidated: true/)
assert.match(signing, /action === "request-correction"/)
assert.match(signing, /seller_signing_pack_post_signature_correction_requested/)
assert.doesNotMatch(signing.match(/if \(action === "request-correction"\)[\s\S]{0,1800}/)?.[0] || '', /status: "revoked"/)

assert.match(agent, /resendSellerDocumentSigningSession/)
assert.match(agent, /Send fresh link/)
assert.match(agent, /Copy link/)
assert.match(agent, /previous link has been invalidated/)
assert.match(signer, /requestPostSignatureCorrection/)
assert.match(signer, /Need a correction\?/) 
assert.match(signer, /signed record will remain unchanged/) 

console.log('Seller signing recovery phase 3 checks passed.')
