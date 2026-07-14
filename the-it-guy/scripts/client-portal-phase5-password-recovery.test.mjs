import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

const migration = await fs.readFile(
  new URL('../../supabase/migrations/202607140008_seller_portal_password_recovery.sql', import.meta.url),
  'utf8',
)
const edgeFunction = await fs.readFile(
  new URL('../../supabase/functions/seller-portal-password-recovery/index.ts', import.meta.url),
  'utf8',
)
const privateListingService = await fs.readFile(new URL('../src/services/privateListingService.js', import.meta.url), 'utf8')
const clientPortalPage = await fs.readFile(new URL('../src/pages/ClientPortal.jsx', import.meta.url), 'utf8')
const listingDetail = await fs.readFile(new URL('../src/pages/AgentListingDetail.jsx', import.meta.url), 'utf8')

assert.match(migration, /seller_portal_recovery_token_hash text/, 'recovery tokens must be stored as hashes')
assert.match(migration, /seller_portal_recovery_expires_at timestamptz/, 'recovery tokens need an explicit expiry')
assert.match(migration, /interval '30 minutes'/, 'recovery links should expire after 30 minutes')
assert.match(migration, /seller_portal_recovery_consumed_at is null[\s\S]*seller_portal_recovery_expires_at > now\(\)/, 'recovery resolution must reject expired and consumed links')
assert.match(migration, /interval '2 minutes'/, 'recovery requests need a resend cooldown')
assert.match(migration, /v_window_count >= 3/, 'recovery requests must be rate limited per hour')
assert.match(migration, /auth\.role\(\) <> 'service_role'/, 'recovery issuance must be service-role only')
assert.match(migration, /seller_portal_recovery_consumed_at = now\(\)/, 'successful recovery must consume the token')
assert.match(migration, /seller_portal_access_token_hash = v_access_hash/, 'successful recovery must rotate the active session')
assert.match(migration, /'password_recovery_completed'/, 'successful recovery must be audited')
assert.match(edgeFunction, /If this portal can be recovered, a password reset email will arrive shortly/, 'the request response must resist account enumeration')
assert.match(edgeFunction, /bridge_request_private_listing_seller_portal_recovery/, 'the Edge Function must issue recovery through the service-role RPC')
assert.doesNotMatch(edgeFunction, /jsonResponse\([^)]*sellerEmail/, 'the Edge Function must not return the seller email')
assert.match(privateListingService, /requestSellerPortalPasswordRecovery/, 'the client needs a recovery request service')
assert.match(privateListingService, /completeSellerPortalPasswordRecovery/, 'the client needs a recovery completion service')
assert.match(clientPortalPage, /Forgot your password\?/, 'the password gate should expose self-service recovery')
assert.match(clientPortalPage, /tokenKind === 'recovery'/, 'recovery links should render password reset mode')
assert.match(clientPortalPage, /Reset password and continue/, 'recovery mode should clearly describe its action')
assert.match(listingDetail, /label="Recovery"/, 'agents should see recovery lifecycle status')

console.log('Client portal Phase 5 password recovery checks passed.')
