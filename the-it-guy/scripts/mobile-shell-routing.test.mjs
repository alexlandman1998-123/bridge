import assert from 'node:assert/strict'

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

global.window = {
  localStorage: createLocalStorageMock(),
  sessionStorage: createLocalStorageMock(),
}

assert.equal(resolve('/dashboard'), '/mobile/home', 'mobile agents should land on mobile home from dashboard')
assert.equal(resolve('/transactions/tx-123'), '/mobile/transaction/tx-123', 'transaction deep links should map to mobile transaction workspaces')
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

console.log('mobile shell routing regression tests passed')
