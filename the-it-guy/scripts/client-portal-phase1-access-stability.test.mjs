import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

const migration = await fs.readFile(
  new URL('../../supabase/migrations/202607140004_client_portal_phase1_access_stability.sql', import.meta.url),
  'utf8',
)
const privateListingService = await fs.readFile(new URL('../src/services/privateListingService.js', import.meta.url), 'utf8')
const workspaceService = await fs.readFile(new URL('../src/services/clientPortalWorkspaceService.js', import.meta.url), 'utf8')
const clientPortalPage = await fs.readFile(new URL('../src/pages/ClientPortal.jsx', import.meta.url), 'utf8')
const api = await fs.readFile(new URL('../src/lib/api.js', import.meta.url), 'utf8')

const payloadFunction = migration.match(
  /create or replace function public\.bridge_private_listing_seller_portal_payload\([\s\S]*?\n\$\$;/,
)?.[0] || ''
const accessStateFunction = migration.match(
  /create or replace function public\.bridge_private_listing_seller_portal_access_state\(p_token text\)[\s\S]*?\n\$\$;/,
)?.[0] || ''

assert.match(migration, /seller_portal_link_active boolean not null default true/, 'seller portal needs an explicit revocation control independent of onboarding expiry')
assert.match(migration, /seller_portal_link_expires_at timestamptz/, 'seller portal needs an optional lifecycle expiry independent of onboarding expiry')
assert.match(migration, /bridge_private_listing_seller_portal_link_is_active/, 'seller portal RPCs should share one lifecycle eligibility check')
assert.match(migration, /client_portal_access_events/, 'Phase 1 should persist privacy-safe portal access outcomes')
assert.match(migration, /encode\(digest\(v_token, 'sha256'\), 'hex'\)/, 'monitoring must fingerprint rather than persist raw portal tokens')
assert.doesNotMatch(payloadFunction, /token_expires_at is null or token_expires_at > now\(\)/, 'seller portal payload must not reuse onboarding invitation expiry')
assert.doesNotMatch(accessStateFunction, /token_expires_at is null or token_expires_at > now\(\)/, 'seller portal access state must not reuse onboarding invitation expiry')
assert.match(payloadFunction, /'sessionExpired', v_session_expired/, 'expired seller sessions should return an authentication challenge instead of invalid-link state')
assert.match(privateListingService, /if \(accessToken\) clearSellerPortalAccessToken\(normalizedToken\)/, 'stale seller sessions should be cleared before password reauthentication')
assert.match(privateListingService, /isSellerPortalSessionExpiredError/, 'seller portal mutations should expose an explicit session-expiry classifier')
assert.match(clientPortalPage, /Your secure session ended\.[\s\S]*your portal link is still active\./, 'session expiry copy should distinguish reauthentication from link expiry')
assert.match(clientPortalPage, /isSellerPortalSessionExpiredError\(uploadError\)[\s\S]*setSellerPortalAuth\(\{[\s\S]*sessionExpired: true/, 'an expired upload session should return the seller to password reauthentication')
assert.doesNotMatch(workspaceService, /getCanonicalRequirementsForContext/, 'public portals must not query protected canonical requirement tables directly')
assert.match(workspaceService, /requirements already returned by their[\s\S]*token-scoped payload/, 'public portal requirements should come from the token-scoped payload')
assert.match(api, /\.from\('client_portal_links'\)[\s\S]*?\.eq\('is_active', true\)/, 'buyer portal links should remain controlled by explicit activation rather than a time expiry')

console.log('Client portal Phase 1 access stability checks passed.')
