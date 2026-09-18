import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const [migration, edge] = await Promise.all([
  readFile(new URL('../../supabase/migrations/20260918120301_listing_seller_portal_recipient_invites_phase3.sql', import.meta.url), 'utf8'),
  readFile(new URL('../../supabase/functions/listing-mandate-signing/index.ts', import.meta.url), 'utf8'),
])

assert.match(migration, /create table if not exists public\.private_listing_seller_portal_recipient_invites/)
assert.match(migration, /unique \(signing_session_id\)/)
assert.match(migration, /'recipient_invite'/)
assert.match(migration, /bridge_list_completed_listing_seller_portal_recipients/)
assert.match(migration, /bridge_prepare_listing_seller_portal_recipient_invite/)
assert.match(migration, /to service_role/)
assert.match(edge, /async function issueSellerPortalRecipientInvites/)
assert.match(edge, /completion\.groupComplete === true/)
assert.match(edge, /sellerPortalInvitations: portalInvitations/)

console.log('listing seller portal recipient invites phase 3 checks passed.')
