import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { resolveMobileAwareRedirect } from '../src/lib/resolveMobileAwareRedirect.js'
import { canAccessMobileMarketing, getMobileNavItems, getMobilePageMenuItems } from '../src/config/mobileShell.js'
import { mapDesktopRouteToMobile } from '../src/config/mobileRouteMappings.js'
import {
  MOBILE_DESKTOP_PREFERENCE_KEY,
  setPreferDesktopOnMobile,
  userPrefersDesktopOnMobile,
} from '../src/lib/mobilePreferences.js'

function createLocalStorageMock() {
  const entries = new Map()
  return {
    getItem: (key) => entries.has(key) ? entries.get(key) : null,
    setItem: (key, value) => entries.set(key, String(value)),
    removeItem: (key) => entries.delete(key),
    clear: () => entries.clear(),
  }
}

function resolve(path, overrides = {}) {
  return resolveMobileAwareRedirect({
    intendedPath: path,
    user: { role: 'agent' },
    deviceType: 'mobile',
    featureFlags: {
      enableMobileShell: true,
      enableMobileLoginRedirect: true,
    },
    userPreference: { preferDesktopOnMobile: false },
    ...overrides,
  })
}

const appSource = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')
const mobileLayoutSource = readFileSync(new URL('../src/components/mobile-shell/MobileLayout.jsx', import.meta.url), 'utf8')
const mobileHeaderSource = readFileSync(new URL('../src/components/mobile-shell/MobileHeader.jsx', import.meta.url), 'utf8')
const mobileBottomNavSource = readFileSync(new URL('../src/components/mobile-shell/MobileBottomNav.jsx', import.meta.url), 'utf8')
const mobileHomeSource = readFileSync(new URL('../src/pages/mobile/MobileHome.jsx', import.meta.url), 'utf8')

global.window = {
  localStorage: createLocalStorageMock(),
  sessionStorage: createLocalStorageMock(),
}

assert.equal(resolve('/dashboard'), '/mobile/home', 'mobile agents should land on mobile home from dashboard')
const developer = { role: 'developer' }
assert.equal(resolve('/dashboard', { user: developer }), '/mobile/home', 'mobile developers should use the same mobile home shell')
assert.equal(resolve('/developer/developments', { user: developer }), '/mobile/developments')
assert.equal(resolve('/developer/developments/project-1', { user: developer }), '/mobile/development/project-1')
assert.equal(resolve('/developer/leads/lead-1', { user: developer }), '/mobile/developer/leads/lead-1')
assert.equal(resolve('/transactions/tx-1', { user: developer }), '/mobile/transaction/tx-1')
assert.equal(resolve('/dashboard', { user: developer, deviceType: 'desktop' }), '/dashboard', 'desktop developers should keep their existing dashboard')
assert.equal(resolve('/dashboard', { user: developer, featureFlags: { enableMobileShell: false, enableMobileLoginRedirect: true } }), '/dashboard')
assert.equal(resolve('/buyer-portal/example', { user: developer }), '/buyer-portal/example', 'public portals must not be captured by developer mobile redirects')
assert.deepEqual(getMobileNavItems(developer).map((item) => item.key), ['home', 'transactions', 'create', 'leads', 'more'])
assert.equal(getMobileNavItems(developer).find((item) => item.key === 'leads').to, '/mobile/developer/leads')
assert.equal(resolve('/transactions/tx-123'), '/mobile/transaction/tx-123', 'transaction deep links should map to mobile transaction workspaces')
const marketingLink = '/marketing?section=campaigns&page=studio&view=channel-template-edit&id=draft-123&template=template-456&source=source-789&channelTemplate=channel-123&collection=channels&channel=email&listingId=listing-123&eventId=event-123&scheduleDate=2026-10-26&ai=1#preview'
assert.equal(resolve(marketingLink), marketingLink.replace('/marketing', '/mobile/marketing'), 'marketing drafts, templates and channel handoffs must retain their complete query and fragment')
assert.equal(resolve('/marketing'), '/mobile/marketing', 'mobile agents should be able to open the complete marketing workspace')
assert.equal(resolve('/marketing?section=email&view=create&id=email-1'), '/mobile/marketing?section=email&view=create&id=email-1')
assert.equal(resolve('/marketing?section=whatsapp&view=detail&id=message-1'), '/mobile/marketing?section=whatsapp&view=detail&id=message-1')
assert.equal(resolve('/marketing/invite/public-token?source=invite#review'), '/marketing/invite/public-token?source=invite#review', 'public marketing invitations must remain public')
assert.equal(resolve('/marketing/rsvp/public-token?guests=2'), '/marketing/rsvp/public-token?guests=2', 'public marketing RSVPs must remain public')
assert.equal(resolve('/agent/listings/listing-1?tab=marketing#campaign'), '/mobile/listings/listing-1?tab=marketing#campaign', 'marketing listing links should open their mobile listing workspace')
assert.equal(mapDesktopRouteToMobile('/mobile/marketing?section=campaigns&page=studio#preview'), '/mobile/marketing?section=campaigns&page=studio#preview')
assert.equal(resolve(marketingLink, { deviceType: 'desktop' }), marketingLink, 'desktop marketing links must remain unchanged')
assert.equal(resolve(marketingLink, { userPreference: { preferDesktopOnMobile: true } }), marketingLink)
assert.equal(resolve(marketingLink, { featureFlags: { enableMobileShell: false, enableMobileLoginRedirect: true } }), marketingLink)
const agentMarketingPages = getMobilePageMenuItems({ role: 'agent' }).filter(item => item.to.startsWith('/mobile/marketing'))
assert.deepEqual(agentMarketingPages.map(item => item.to), ['/mobile/marketing', '/mobile/marketing?section=campaigns', '/mobile/marketing?section=campaigns&page=studio'])
assert.equal(canAccessMobileMarketing({ role: 'agent', workspaceRole: 'principal' }), true, 'agency principals should have the agent marketing menu')
for (const role of ['developer', 'attorney', 'bond_originator', 'commercial', 'client']) {
  assert.equal(getMobilePageMenuItems({ role }).some(item => item.to.startsWith('/mobile/marketing')), false, `${role} should keep its existing mobile menu`)
}
assert.equal(canAccessMobileMarketing({ role: 'agent', businessWorkspaceId: 'rentals' }), false, 'rental workspaces should not advertise sales marketing')
assert.equal(canAccessMobileMarketing({ role: 'agent', businessWorkspaceId: 'short_term_rentals' }), false)
assert.equal(canAccessMobileMarketing({ role: 'agent', businessWorkspaceSplitEnabled: true, businessWorkspaceId: 'sales', availableBusinessWorkspaceIds: ['rentals'] }), false, 'marketing menu needs sales access when the workspace split is enabled')
assert.equal(canAccessMobileMarketing({ role: 'agent', businessWorkspaceSplitEnabled: true, businessWorkspaceId: 'sales', availableBusinessWorkspaceIds: ['sales', 'rentals'] }), true)
assert.equal(resolve('/auth'), '/auth', 'public auth routes should not be forced into mobile shell')
assert.equal(
  resolve('/dashboard', { deviceType: 'desktop' }),
  '/dashboard',
  'desktop viewports should keep desktop routes',
)
assert.equal(
  resolve('/dashboard', { userPreference: { preferDesktopOnMobile: true } }),
  '/dashboard',
  'an active desktop preference should temporarily preserve desktop route',
)

window.localStorage.setItem(MOBILE_DESKTOP_PREFERENCE_KEY, 'true')
assert.equal(userPrefersDesktopOnMobile(), false, 'legacy permanent desktop preference should be migrated away')
assert.equal(window.localStorage.getItem(MOBILE_DESKTOP_PREFERENCE_KEY), null, 'legacy desktop preference should be removed')

setPreferDesktopOnMobile(true, { ttlMs: 5 * 60 * 1000 })
assert.equal(userPrefersDesktopOnMobile(), true, 'new desktop preference should be honored before expiry')
const storedPreference = JSON.parse(window.localStorage.getItem(MOBILE_DESKTOP_PREFERENCE_KEY))
assert.equal(storedPreference.preferDesktop, true, 'new desktop preference should be structured')
assert.ok(storedPreference.expiresAt > Date.now(), 'new desktop preference should have an expiry')

window.localStorage.setItem(
  MOBILE_DESKTOP_PREFERENCE_KEY,
  JSON.stringify({ preferDesktop: true, createdAt: Date.now() - 10_000, expiresAt: Date.now() - 1 }),
)
assert.equal(userPrefersDesktopOnMobile(), false, 'expired desktop preference should not block mobile redirect')
assert.equal(window.localStorage.getItem(MOBILE_DESKTOP_PREFERENCE_KEY), null, 'expired desktop preference should be removed')

setPreferDesktopOnMobile(false)
assert.equal(window.localStorage.getItem(MOBILE_DESKTOP_PREFERENCE_KEY), null, 'clearing desktop preference should remove storage key')

assert.equal((appSource.match(/<MobileProtectedLayout/g) || []).length, 1, 'protected mobile shell should be mounted once')
assert.match(mobileLayoutSource, /data-mobile-shell/, 'mobile layout should expose a single shell marker')
assert.match(mobileLayoutSource, /data-mobile-scroll-root/, 'mobile layout should expose the dedicated scroll root')
assert.match(mobileLayoutSource, /h-\[100dvh\]/, 'mobile shell should be constrained to the dynamic viewport height')
assert.match(mobileLayoutSource, /overflow-hidden/, 'mobile shell should prevent document-level overflow duplication')
assert.match(mobileLayoutSource, /overflow-y-auto/, 'mobile content should scroll inside the shell')
assert.match(mobileLayoutSource, /overscroll-contain/, 'mobile content should contain overscroll on iOS Safari')
assert.match(mobileLayoutSource, /useNavigationType/, 'mobile history navigation should restore the shell scroll position')
assert.match(mobileHeaderSource, /data-mobile-header/, 'mobile header should expose a stable marker')
assert.match(mobileBottomNavSource, /data-mobile-bottom-nav/, 'mobile bottom nav should expose a stable marker')
assert.match(mobileHomeSource, /data-mobile-home/, 'mobile home should expose a stable marker')

console.log('mobile shell routing regression tests passed')
