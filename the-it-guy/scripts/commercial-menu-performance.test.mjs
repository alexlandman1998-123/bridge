import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { COMMERCIAL_NAV_ITEMS, isCommercialNavItemActive } from '../src/modules/commercial/commercialNavigation.js'

async function read(path) {
  return fs.readFile(new URL(path, import.meta.url), 'utf8')
}

const expectedMenuRoutes = [
  '/commercial/dashboard',
  '/commercial/clients',
  '/commercial/tenants',
  '/commercial/landlords',
  '/commercial/properties',
  '/commercial/vacancies',
  '/commercial/requirements',
  '/commercial/pipeline',
  '/commercial/deals',
  '/commercial/hot',
  '/commercial/leases',
  '/commercial/docs',
  '/commercial/reports',
  '/commercial/activity',
]

const menuRoutes = COMMERCIAL_NAV_ITEMS.map((item) => item.to)
for (const route of expectedMenuRoutes) {
  assert.ok(menuRoutes.includes(route), `Commercial menu should include direct route ${route}`)
}

assert.equal(isCommercialNavItemActive('/commercial/dashboard', { to: '/commercial/dashboard', exact: true }), true)
assert.equal(isCommercialNavItemActive('/commercial/dashboard#transactions', { to: '/commercial/dashboard', exact: true }), false)
assert.equal(isCommercialNavItemActive('/commercial/dashboard', { to: '/commercial/dashboard#transactions', exact: true }), false)
assert.equal(isCommercialNavItemActive('/commercial/dashboard#transactions', { to: '/commercial/dashboard#transactions', exact: true }), true)
assert.equal(isCommercialNavItemActive('/commercial/hot', { to: '/commercial/hot', activePaths: ['/commercial/hot', '/commercial/heads-of-terms'] }), true)
assert.equal(isCommercialNavItemActive('/commercial/heads-of-terms', { to: '/commercial/hot', activePaths: ['/commercial/hot', '/commercial/heads-of-terms'] }), true)
assert.equal(isCommercialNavItemActive('/commercial/docs', { to: '/commercial/docs', activePaths: ['/commercial/docs', '/commercial/documents'] }), true)
assert.equal(isCommercialNavItemActive('/commercial/documents', { to: '/commercial/docs', activePaths: ['/commercial/docs', '/commercial/documents'] }), true)
assert.equal(isCommercialNavItemActive('/commercial/deals/leasing', { to: '/commercial/deals' }), true)
assert.equal(isCommercialNavItemActive('/commercial/deals', { to: '/commercial/deals' }), true)
assert.equal(isCommercialNavItemActive('/commercial/deals', { to: '/commercial/deals-overview' }), false)

const appSource = await read('../src/App.jsx')
for (const marker of [
  'path="tenants" element={<CommercialClientsPage />}',
  'path="pipeline" element={<CommercialRequirementsPipelinePage />}',
  'path="deals" element={<CommercialDealsPage />}',
  'path="deals/pipeline" element={<CommercialDealsPipelinePage />}',
  'path="hot" element={<CommercialHeadsOfTermsPage />}',
  'path="docs" element={<CommercialDocumentsPage />}',
]) {
  assert.match(appSource, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `Commercial route should be direct: ${marker}`)
}

for (const redirect of [
  'path="tenants" element={<Navigate to="/commercial/clients" replace />}',
  'path="deals" element={<Navigate to="/commercial/deals/leasing" replace />}',
  'path="deals/pipeline" element={<Navigate to="/commercial/deals/leasing" replace />}',
]) {
  assert.doesNotMatch(appSource, new RegExp(redirect.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `Commercial menu route should not redirect: ${redirect}`)
}

const layoutSource = await read('../src/modules/commercial/components/CommercialLayout.jsx')
for (const marker of [
  'useMemo(',
  'mobileNavItems',
  'isCommercialNavItemActive',
  'overflow-x-hidden',
]) {
  assert.match(layoutSource, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `Commercial layout should include ${marker}`)
}

const sidebarSource = await read('../src/modules/commercial/components/CommercialSidebar.jsx')
for (const marker of [
  'memo(CommercialSidebar)',
  'isCommercialNavItemActive',
  'transition-colors duration-150',
]) {
  assert.match(sidebarSource, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `Commercial sidebar should include ${marker}`)
}
assert.doesNotMatch(sidebarSource, /scrollIntoView/, 'Commercial sidebar should not scroll itself during every navigation')
assert.doesNotMatch(sidebarSource, /requestAnimationFrame/, 'Commercial sidebar should not schedule navigation scroll work')

console.log('commercial menu performance tests passed')
