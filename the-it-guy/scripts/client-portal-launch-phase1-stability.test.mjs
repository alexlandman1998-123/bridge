import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const [clientPortal, buyerDemo, responsiveFoundation, appStyles, phase0Contract] = await Promise.all([
  readFile(new URL('src/pages/ClientPortal.jsx', root), 'utf8'),
  readFile(new URL('src/pages/ProspectBuyerDemo.jsx', root), 'utf8'),
  readFile(new URL('src/components/client-portal/ClientPortalResponsiveFoundation.jsx', root), 'utf8'),
  readFile(new URL('src/App.css', root), 'utf8'),
  readFile(new URL('config/client-portal-launch-contract.json', root), 'utf8').then(JSON.parse),
])

test('seller journey tracker is imported before the routed seller portal renders it', () => {
  assert.match(clientPortal, /import TransactionJourneyTracker from '\.\.\/components\/transaction\/TransactionJourneyTracker'/)
  assert.match(clientPortal, /function SellerProgressJourney/)
  assert.match(clientPortal, /<TransactionJourneyTracker/)
})

test('buyer mobile menu is an operable two-level navigation surface', () => {
  assert.match(buyerDemo, /const \[menuOpen, setMenuOpen\] = useState\(false\)/)
  assert.match(buyerDemo, /onClick=\{onOpenMenu\}/)
  assert.match(buyerDemo, /function MobilePortalMenu/)
  assert.match(buyerDemo, /role="dialog" aria-modal="true" aria-label="Portal navigation"/)
  assert.match(buyerDemo, /ariaLabel: 'Open more portal sections'/)
  assert.match(responsiveFoundation, /aria-label=\{secondaryAction\.ariaLabel\}/)
  assert.match(buyerDemo, /DEMO_NAV\.map/)
  assert.doesNotMatch(buyerDemo, /const MOBILE_DEMO_NAV = DEMO_NAV\.filter\(\(item\) => item\.key !== 'messages'\)/)
})

test('Messages remains distinct from Team on mobile', () => {
  assert.doesNotMatch(buyerDemo, /activeSection === 'messages' \? 'team' : activeSection/)
  assert.match(buyerDemo, /mobileSection === 'messages' \? <MobileMessages/)
  assert.match(buyerDemo, /function MobileMessages/)
  assert.match(buyerDemo, /Message your team/)
  assert.match(buyerDemo, /Send message/)
  assert.match(buyerDemo, /mobileSection === 'team' \? <MobileTeam/)
})

test('mobile finance and bond application avoid hidden wide-only navigation', () => {
  assert.match(buyerDemo, /<BondJourneyTracker brand=\{brand\} currentStageIndex=\{model\.currentStageIndex\} compact/)
  assert.match(buyerDemo, /aria-label="Bond application progress"/)
  assert.match(buyerDemo, /compact \? 'grid min-w-0 gap-2 sm:grid-cols-2'/)
  assert.match(buyerDemo, /compact \? 'w-full min-w-0'/)
  assert.doesNotMatch(buyerDemo, /compact \? 'flex w-max gap-3'/)
  assert.equal(phase0Contract.principles.mobileFirstMinimumWidthPx, 360)
})

test('Phase 1 preserves the Phase 0 navigation and touch contracts', () => {
  assert.ok(phase0Contract.responsiveRules.some((rule) => /no more than two interactions/i.test(rule)))
  assert.ok(phase0Contract.principles.minimumTouchTargetPx >= 44)
  assert.match(buyerDemo, /h-11 w-11[^\n]*aria-label="Open menu"/)
  assert.match(appStyles, /client-portal-mobile-nav__item[\s\S]*min-height: 56px/)
  assert.match(buyerDemo, /ariaLabel: 'Open more portal sections'/)
})
