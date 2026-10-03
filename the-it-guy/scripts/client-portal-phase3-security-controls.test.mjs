import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { getStoredSellerPortalAccessToken, clearSellerPortalAccessToken } from '../src/lib/sellerPortalApi.js'
import { sellerContactEmail } from '../src/core/clientPortal/sellerContactDetails.js'

const migration = await fs.readFile(
  new URL('../../supabase/migrations/202607140006_seller_portal_security_controls.sql', import.meta.url),
  'utf8',
)
const listingGuard = await fs.readFile(new URL('../../supabase/migrations/20261003145000_seller_portal_management_listing_access.sql', import.meta.url), 'utf8')
assert.match(listingGuard, /not coalesce\(public.bridge_can_access_private_listing\(v_listing_id\), false\)/)
assert.match(listingGuard, /using errcode = '42501'/)
for (const name of ['bridge_manage_private_listing_seller_portal', 'bridge_reset_private_listing_seller_portal_password', 'bridge_private_listing_seller_portal_diagnostics']) assert.ok(listingGuard.includes(name))
const privateListingService = await fs.readFile(new URL('../src/services/privateListingService.js', import.meta.url), 'utf8')
const clientPortalPage = await fs.readFile(new URL('../src/pages/ClientPortal.jsx', import.meta.url), 'utf8')
const accessControls = await fs.readFile(new URL('../src/components/client-portal/SellerPortalAccessControls.jsx', import.meta.url), 'utf8')
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
assert.match(accessControls, /Sign Out Sessions/, 'agents should be able to invalidate seller sessions')
assert.match(accessControls, /Revoke Portal[\s\S]*Reactivate Portal/, 'agents should be able to revoke and reactivate portal access')
assert.match(accessControls, /Portal Access/, 'the listing workspace should expose portal access state')

assert.match(listingDetail, /<SellerPortalAccessControls token=\{resolveSellerPortalTokenFromListing\(listingRecord\)\}/, 'controls must use the current listing token')

// Run the actual sign-out callback, including the fence against late loads.
const signOutBody = clientPortalPage.match(/const handleSellerDeviceSignOut = useCallback\(\(\) => \{([\s\S]*?)\n  }, \[token\]\)/)?.[1]
assert.ok(signOutBody)
const states = {}
const requestRef = { current: 7 }
let removedToken
const setters = ['setSellerPortalAccessToken', 'setPortal', 'setWorkspaceData', 'setSellerOverviewStats', 'setMyDetailsDraft',
  'setCommentDraft', 'setSellerPortalPasswordForm', 'setSellerPortalPasswordFeedback', 'setSellerPortalRecoveryNotice',
  'setSellerPortalAuth', 'setLoading', 'setHydratingPortal']
const context = { token: 'seller-only-realty', portalLoadRequestRef: requestRef,
  clearSellerPortalAccessToken: token => { removedToken = token },
  ...Object.fromEntries(setters.map(key => [key, value => { states[key] = value }])),
}
new Function('context', `const { ${Object.keys(context).join(', ')} } = context; ${signOutBody}`)(context)
assert.equal(removedToken, 'seller-only-realty')
assert.notEqual(requestRef.current, 7, 'a response started before sign-out must fail the request guard')
assert.equal(states.setPortal, null)
assert.equal(states.setWorkspaceData, null)
assert.equal(states.setSellerOverviewStats, null)
assert.equal(states.setSellerPortalAccessToken, '')
assert.deepEqual(states.setSellerPortalPasswordForm, { password: '', confirmPassword: '', termsAccepted: false })
assert.deepEqual(states.setSellerPortalAuth, { authRequired: true, passwordSet: true })
assert.match(clientPortalPage, /window.addEventListener\('storage', onStorageChange\)/, 'other open portal tabs must observe device sign-out')

const previousWindow = globalThis.window
const storage = new Map()
try {
  globalThis.window = { localStorage: { getItem: key => storage.get(key), removeItem: key => storage.delete(key) } }
  const key = 'bridge:seller-portal-access:seller-only-realty'
  const otherKey = 'bridge:seller-portal-access:other-link'
  storage.set(otherKey, JSON.stringify({ accessToken: 'other-session' }))
  for (const expiry of ['2020-01-01', 'invalid-date']) {
    storage.set(key, JSON.stringify({ accessToken: 'session', expiresAt: expiry }))
    assert.equal(getStoredSellerPortalAccessToken('seller-only-realty'), '')
    assert.equal(storage.has(key), false)
  }
  storage.set(key, JSON.stringify({ accessToken: 'session', expiresAt: '2099-01-01' }))
  assert.equal(getStoredSellerPortalAccessToken('seller-only-realty'), 'session')
  clearSellerPortalAccessToken('seller-only-realty')
  assert.equal(storage.has(key), false)
  assert.equal(storage.has(otherKey), true, 'sign-out must not clear other accounts or links')
  Object.defineProperty(globalThis.window, 'localStorage', { get() { throw new Error('Storage disabled') } })
  assert.equal(getStoredSellerPortalAccessToken('seller-only-realty'), '')
  assert.doesNotThrow(() => clearSellerPortalAccessToken('seller-only-realty'))
} finally {
  if (previousWindow === undefined) delete globalThis.window
  else globalThis.window = previousWindow
}
assert.equal(sellerContactEmail('agent@onlyrealty.co.za'), 'agent@onlyrealty.co.za')
for (const email of ['agent@agency.test', 'agent@example.com', 'not-an-email', 'agent@example.invalid', 'agent@agency.test?subject=x']) {
  assert.equal(sellerContactEmail(email), '', 'placeholder or malformed contacts must not be offered as working links')
}

console.log('Client portal Phase 3 security control checks passed.')
