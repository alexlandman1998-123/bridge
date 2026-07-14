import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

const migration = await fs.readFile(
  new URL('../../supabase/migrations/202607140005_seller_portal_stable_links_and_invites.sql', import.meta.url),
  'utf8',
)
const privateListingService = await fs.readFile(new URL('../src/services/privateListingService.js', import.meta.url), 'utf8')
const clientPortalPage = await fs.readFile(new URL('../src/pages/ClientPortal.jsx', import.meta.url), 'utf8')
const listingDetail = await fs.readFile(new URL('../src/pages/AgentListingDetail.jsx', import.meta.url), 'utf8')
const leadsPage = await fs.readFile(new URL('../src/pages/AgentLeadsPage.jsx', import.meta.url), 'utf8')

assert.match(migration, /seller_portal_token text/, 'seller portals need a stable identifier independent of onboarding')
assert.match(migration, /seller_portal_invite_token_hash text/, 'one-time invite tokens must be stored as hashes')
assert.match(migration, /seller_portal_invite_expires_at timestamptz/, 'one-time invite tokens need an explicit expiry')
assert.match(migration, /p_ttl_hours integer default 72/, 'seller portal invitations should default to 72 hours')
assert.match(migration, /greatest\(1, least\(coalesce\(p_ttl_hours, 72\), 168\)\)/, 'invitation lifetime must be bounded')
assert.match(migration, /seller_portal_invite_consumed_at is null[\s\S]*seller_portal_invite_expires_at > now\(\)/, 'invite resolution must reject consumed and expired tokens')
assert.match(migration, /seller_portal_invite_consumed_at = now\(\)/, 'successful authentication must consume the invitation')
assert.match(migration, /when onboarding\.seller_portal_token = input\.token then 'stable'[\s\S]*when onboarding\.token = input\.token then 'legacy'[\s\S]*else 'invite'/, 'stable, legacy, and invitation URLs must resolve concurrently')
assert.match(migration, /rename to bridge_private_listing_seller_portal_payload_phase1/, 'Phase 2 must preserve Phase 1 behavior behind a compatibility wrapper')
assert.match(migration, /- 'seller_portal_invite_token_hash'/, 'token-scoped responses must never expose the invite hash')
assert.match(privateListingService, /bridge_issue_private_listing_seller_portal_invite/, 'the frontend must issue a fresh invitation through the database')
assert.match(privateListingService, /legacyFallback: true/, 'the application must remain deployable before the Phase 2 RPC reaches an environment')
assert.match(privateListingService, /storeSellerPortalAccessToken\(stablePortalToken, data\)/, 'the authenticated session must migrate to the stable URL')
assert.match(clientPortalPage, /navigate\(stablePortalPath, \{ replace: true \}\)/, 'invitation and legacy URLs must redirect to the stable portal URL after authentication')
assert.match(listingDetail, /issueSellerPortalInvite\(token\)/, 'listing-level resends must rotate the one-time invitation')
assert.match(leadsPage, /issueSellerPortalInvite\(sellerPortalToken\)/, 'lead-level resends must rotate the one-time invitation')

console.log('Client portal Phase 2 stable link and invitation checks passed.')
