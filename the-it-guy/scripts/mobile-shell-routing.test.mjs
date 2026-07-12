import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { resolveMobileAwareRedirect } from '../src/lib/resolveMobileAwareRedirect.js'
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
const mobileCreateSheetSource = readFileSync(new URL('../src/components/mobile-shell/MobileCreateSheet.jsx', import.meta.url), 'utf8')
const mobileModuleSource = readFileSync(new URL('../src/pages/mobile/MobileModulePage.jsx', import.meta.url), 'utf8')
const mobileHomeSource = readFileSync(new URL('../src/pages/mobile/MobileHome.jsx', import.meta.url), 'utf8')
const indexSource = readFileSync(new URL('../index.html', import.meta.url), 'utf8')

global.window = {
  localStorage: createLocalStorageMock(),
  sessionStorage: createLocalStorageMock(),
}

assert.equal(resolve('/dashboard'), '/mobile/home', 'mobile agents should land on mobile home from dashboard')
assert.equal(resolve('/transactions/tx-123'), '/mobile/transaction/tx-123', 'transaction deep links should map to mobile transaction workspaces')
assert.equal(resolve('/auth'), '/auth', 'public auth routes should not be forced into mobile shell')
assert.equal(
  resolve('/mobile/leads', { featureFlags: { enableMobileShell: false, enableMobileLoginRedirect: false } }),
  '/mobile/leads',
  'explicit mobile routes should render mobile pages even when automatic mobile redirects are disabled',
)
assert.equal(
  resolve('/mobile/listings', { user: { role: 'client' } }),
  '/dashboard',
  'client users should still be kept out of the internal mobile shell',
)
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
assert.match(mobileLayoutSource, /scrollRootRef\.current\?\.scrollTo/, 'mobile route changes should reset the shell scroll root')
assert.match(mobileHeaderSource, /data-mobile-header/, 'mobile header should expose a stable marker')
assert.match(mobileHeaderSource, /shrink-0/, 'mobile header should stay in the shell flow instead of sticking to the viewport')
assert.doesNotMatch(mobileHeaderSource, /sticky\s+top-0/, 'mobile header should not use sticky viewport positioning')
assert.match(mobileBottomNavSource, /data-mobile-bottom-nav/, 'mobile bottom nav should expose a stable marker')
assert.match(mobileBottomNavSource, /shrink-0/, 'mobile bottom nav should stay in the shell flow instead of overlaying content')
assert.doesNotMatch(mobileBottomNavSource, /fixed\s+inset-x-0\s+bottom-0/, 'mobile bottom nav should not use fixed viewport positioning')
assert.match(mobileBottomNavSource, /!createSheetOpen/, 'mobile bottom nav should be suppressed while a create sheet is open')
assert.match(mobileCreateSheetSource, /visualViewport/, 'mobile create sheets should track the visual viewport on mobile browsers')
assert.match(mobileCreateSheetSource, /--mobile-sheet-vvh/, 'mobile create sheets should use visual viewport height for safe sizing')
assert.match(mobileCreateSheetSource, /data-mobile-create-sheet/, 'mobile create sheets should expose a stable marker')
assert.match(mobileModuleSource, /max-w-\[44vw\]/, 'mobile module action buttons should stay within narrow viewport headers')
assert.match(mobileHomeSource, /data-mobile-home/, 'mobile home should expose a stable marker')
assert.match(indexSource, /viewport-fit=cover/, 'viewport metadata should expose iOS safe-area insets to the mobile shell')

console.log('mobile shell routing regression tests passed')
