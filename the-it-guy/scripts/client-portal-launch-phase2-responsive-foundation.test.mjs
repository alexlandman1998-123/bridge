import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const [manifest, foundation, buyerDemo, clientPortal, styles, phase0] = await Promise.all([
  readFile(new URL('config/client-portal-launch-phase2-responsive-foundation.json', root), 'utf8').then(JSON.parse),
  readFile(new URL('src/components/client-portal/ClientPortalResponsiveFoundation.jsx', root), 'utf8'),
  readFile(new URL('src/pages/ProspectBuyerDemo.jsx', root), 'utf8'),
  readFile(new URL('src/pages/ClientPortal.jsx', root), 'utf8'),
  readFile(new URL('src/App.css', root), 'utf8'),
  readFile(new URL('config/client-portal-launch-contract.json', root), 'utf8').then(JSON.parse),
])

test('Phase 2 certifies both personas and every launch viewport', () => {
  assert.deepEqual(manifest.personas, ['buyer', 'seller'])
  assert.deepEqual(manifest.viewports, Object.values(phase0.viewports))
  assert.equal(manifest.status, 'implemented')
})

test('buyer demo, production buyer and production seller share one responsive shell', () => {
  assert.match(buyerDemo, /<ClientPortalResponsiveShell persona="buyer"/)
  assert.match(clientPortal, /<ClientPortalResponsiveShell persona="buyer"/)
  assert.match(clientPortal, /<ClientPortalResponsiveShell persona="seller"/)
})

test('buyer and seller mobile navigation share safe-area and active-location behaviour', () => {
  assert.match(foundation, /aria-current=\{active \? 'page'/)
  assert.match(foundation, /Math\.max\(1, itemCount\)/)
  assert.match(styles, /client-portal-mobile-nav/)
  assert.match(styles, /env\(safe-area-inset-bottom\)/)
  assert.match(styles, /min-height: 56px/)
  assert.ok((clientPortal.match(/<ClientPortalBottomNavigation/g) || []).length >= 2)
})

test('shared state contract includes every recoverable portal state', () => {
  for (const state of ['loading', 'empty', 'error', 'offline', 'expired', 'unauthorised']) {
    assert.match(foundation, new RegExp(`${state}:`))
    assert.ok(manifest.states.includes(state))
  }
  assert.match(clientPortal, /<ClientPortalStatePanel state="loading"/)
  assert.match(clientPortal, /state=\{portalState\}/)
})

test('responsive foundation protects long content and 44px recovery targets', () => {
  assert.match(styles, /overflow-wrap: anywhere/)
  assert.match(styles, /client-portal-state-action[\s\S]*min-height: 44px/)
})

test('Phase 2 does not weaken Phase 0 navigation and viewport requirements', () => {
  assert.equal(phase0.principles.minimumTouchTargetPx, 44)
  assert.equal(phase0.principles.mobileFirstMinimumWidthPx, 360)
  assert.ok(manifest.responsiveGuarantees.length >= 6)
})
