import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  CLIENT_PORTAL_NAVIGATION_MODES,
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

test('canonical profile exposes distinct navigation modes for portal presentation', () => {
  const developerProfile = resolveClientPortalProfile({
    workspace: 'buying',
    transaction: {
      transaction_type: 'developer_sale',
      sale_route: 'internal_developer_sale',
      development_id: 'dev-1',
    },
  })
  const agencyDevelopmentProfile = resolveClientPortalProfile({
    workspace: 'buying',
    transaction: {
      transaction_type: 'developer_sale',
      sale_route: 'external_agency_sale',
      source_agency_org_id: 'agency-1',
      development_id: 'dev-1',
    },
  })
  const resaleProfile = resolveClientPortalProfile({
    workspace: 'buying',
    transaction: {
      transaction_type: 'private_property',
      sale_route: 'private_property_sale',
    },
  })

  assert.equal(developerProfile.navigationMode, CLIENT_PORTAL_NAVIGATION_MODES.DEVELOPER_DEVELOPMENT)
  assert.equal(agencyDevelopmentProfile.navigationMode, CLIENT_PORTAL_NAVIGATION_MODES.AGENCY_DEVELOPMENT)
  assert.equal(resaleProfile.navigationMode, CLIENT_PORTAL_NAVIGATION_MODES.AGENCY_RESALE)
})

test('client portal has profile-aware presentation labels for each buyer portal mode', () => {
  assert.match(clientPortalSource, /const BUYER_PORTAL_PRESENTATION_BY_MODE = Object\.freeze/)
  assert.match(clientPortalSource, /developer_development: Object\.freeze/)
  assert.match(clientPortalSource, /agency_development: Object\.freeze/)
  assert.match(clientPortalSource, /agency_resale: Object\.freeze/)
  assert.match(clientPortalSource, /Developer Handover/)
  assert.match(clientPortalSource, /Agency & Developer Team/)
  assert.match(clientPortalSource, /Sale Documents/)
  assert.match(clientPortalSource, /Transfer Journey/)
})

test('desktop buyer navigation maps base items into profile labels before filtering', () => {
  assert.match(clientPortalSource, /const buyerPortalPresentation = resolveBuyerPortalPresentation/)
  assert.match(clientPortalSource, /const buyerPortalNavigationLabels = buyerPortalPresentation\.navigationLabels \|\| \{\}/)
  assert.match(clientPortalSource, /const buyerPortalMenuItems = CLIENT_PORTAL_MENU\.map/)
  assert.match(clientPortalSource, /label: resolveBuyerPortalLabel\(item\.key, item\.label\)/)
  assert.match(clientPortalSource, /label: buyerPortalGroupLabels\[group\.label\] \|\| group\.label/)
})

test('overview actions and metric cards use profile labels and disabled-section guards', () => {
  assert.match(clientPortalSource, /const primaryOverviewActionTo = sectionEnabled\[rawPrimaryOverviewActionTo\] === false \? 'documents' : rawPrimaryOverviewActionTo/)
  assert.match(clientPortalSource, /label: resolveBuyerPortalLabel\('handover', 'Keys'\)/)
  assert.match(clientPortalSource, /\.filter\(\(action\) => sectionEnabled\[action\.to\] !== false\)/)
  assert.match(clientPortalSource, /label: buyerPortalMetricLabels\.documents \|\| resolveBuyerPortalLabel\('documents', 'Documents'\)/)
  assert.match(clientPortalSource, /label: buyerPortalMetricLabels\.handover \|\| resolveBuyerPortalLabel\('handover', 'Keys'\)/)
  assert.match(clientPortalSource, /label: buyerPortalMetricLabels\.snags \|\| resolveBuyerPortalLabel\('snags', 'Issues'\)/)
})

test('mobile buyer navigation receives the same profile labels as desktop', () => {
  assert.match(clientPortalSource, /portalNavigationLabels = \{\}/)
  assert.match(clientPortalSource, /label: portalNavigationLabels\.documents \|\| 'Documents'/)
  assert.match(clientPortalSource, /label: portalNavigationLabels\.team \|\| 'Team'/)
  assert.match(clientPortalSource, /portalNavigationLabels=\{buyerPortalNavigationLabels\}/)
})
