import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  CLIENT_PORTAL_KINDS,
  resolveClientPortalProfile,
} from '../src/core/clientPortal/clientPortalProfile.js'

const clientPortalSource = readFileSync(
  new URL('../src/pages/ClientPortal.jsx', import.meta.url),
  'utf8',
)

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

test('canonical profile disables development-only sections for agency resale buyer portals', () => {
  const profile = resolveClientPortalProfile({
    workspace: 'buying',
    transaction: {
      transaction_type: 'private_property',
      sale_route: 'private_property_sale',
    },
    settings: {
      snag_reporting_enabled: true,
      alteration_requests_enabled: true,
      service_reviews_enabled: true,
    },
  })

  assert.equal(profile.portalKind, CLIENT_PORTAL_KINDS.AGENCY_RESALE_BUYER)
  assert.equal(profile.enabledSections.handover, false)
  assert.equal(profile.enabledSections.snags, false)
  assert.equal(profile.enabledSections.alterations, false)
  assert.equal(profile.enabledSections.review, false)
})

test('client portal section gates are sourced from the canonical portal profile', () => {
  assert.match(clientPortalSource, /const portalProfile = workspaceData\?\.portalProfile \|\| portal\?\.portalProfile \|\| portal\?\.__portalProfile/)
  assert.match(clientPortalSource, /const portalProfileEnabledSections =/)
  assert.match(clientPortalSource, /const resolvePortalSectionEnabled = \(sectionKey, fallback\)/)
  assert.match(clientPortalSource, /handover: resolvePortalSectionEnabled\('handover', true\)/)
  assert.match(clientPortalSource, /snags: resolvePortalSectionEnabled\('snags', Boolean\(portal\?\.settings\?\.snag_reporting_enabled\)\)/)
  assert.match(clientPortalSource, /alterations: resolvePortalSectionEnabled\('alterations', Boolean\(portal\?\.settings\?\.alteration_requests_enabled\)\)/)
  assert.match(clientPortalSource, /review: resolvePortalSectionEnabled\('review', Boolean\(portal\?\.settings\?\.service_reviews_enabled\)\)/)
})

test('navigation and overview cards filter disabled sections', () => {
  assert.match(clientPortalSource, /if \(sectionEnabled\[item\.key\] === false\) return false/)
  assert.match(clientPortalSource, /const visibleBuyerMenuItemKeys = new Set\(visibleMenuItems\.map\(\(item\) => item\.key\)\)/)
  assert.match(clientPortalSource, /\.filter\(\(card\) => sectionEnabled\[card\.to\] !== false\)/)
})

test('documents shortcuts and handover checklist use resolved gates', () => {
  assert.match(clientPortalSource, /isHandover \|\| isBondApplication \|\| !sectionEnabled\.handover/)
  assert.match(clientPortalSource, /description: sectionEnabled\.snags/)
  assert.match(clientPortalSource, /complete: !sectionEnabled\.snags \|\| snagOpenCount === 0/)
  assert.match(clientPortalSource, /actionTo: sectionEnabled\.snags \? 'snags' : null/)
})
