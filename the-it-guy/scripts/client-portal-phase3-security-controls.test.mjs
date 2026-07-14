import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

const migration = await fs.readFile(
  new URL('../../supabase/migrations/202607140006_seller_portal_security_controls.sql', import.meta.url),
  'utf8',
)
const privateListingService = await fs.readFile(new URL('../src/services/privateListingService.js', import.meta.url), 'utf8')
const clientPortalPage = await fs.readFile(new URL('../src/pages/ClientPortal.jsx', import.meta.url), 'utf8')
const listingDetail = await fs.readFile(new URL('../src/pages/AgentListingDetail.jsx', import.meta.url), 'utf8')

assert.match(migration, /seller_portal_failed_login_count integer not null default 0/, 'failed sign-ins need a persistent counter')
assert.match(migration, /seller_portal_locked_until timestamptz/, 'temporary lockout needs an explicit deadline')
assert.match(migration, /v_failed_count >= 5 then now\(\) \+ interval '15 minutes'/, 'five failures should start a 15-minute lockout')
assert.match(migration, /seller_portal_last_failed_login_at < now\(\) - interval '30 minutes'/, 'stale failed attempts should age out')
assert.match(migration, /'attemptsRemaining', greatest\(0, 5 - v_failed_count\)/, 'the password gate should receive attempts remaining')
assert.match(migration, /bridge_manage_private_listing_seller_portal/, 'agents need a server-side portal management operation')
for (const action of ['revoke', 'reactivate', 'revoke_sessions']) {
  assert.match(migration, new RegExp(`'${action}'`), `portal management must support ${action}`)
}
assert.match(migration, /seller_portal_access_token_hash = null/, 'revocation must invalidate active seller sessions')
assert.match(migration, /seller_portal_token/, 'operational controls must preserve the stable portal identifier')
assert.match(privateListingService, /seller_portal_temporarily_locked/, 'the service should classify temporary lockout')
assert.match(privateListingService, /Incorrect seller portal password\.[\s\S]*attempt/, 'the seller should see remaining attempts')
assert.match(privateListingService, /export async function manageSellerPortalAccess/, 'agent UI needs a typed service boundary for access management')
assert.match(clientPortalPage, /sellerPortalPasswordFeedback/, 'lockout and remaining-attempt messages should render inside the password gate')
assert.match(listingDetail, /Sign Out Sessions/, 'agents should be able to invalidate seller sessions')
assert.match(listingDetail, /Reactivate Portal[\s\S]*Revoke Portal/, 'agents should be able to revoke and reactivate portal access')
assert.match(listingDetail, /Portal Access/, 'the listing workspace should expose portal access state')

console.log('Client portal Phase 3 security control checks passed.')
