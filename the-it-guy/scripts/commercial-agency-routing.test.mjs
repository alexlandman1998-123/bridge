import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { COMMERCIAL_NAV_SECTIONS, COMMERCIAL_NAV_ITEMS, isCommercialNavItemActive } from '../src/modules/commercial/commercialNavigation.js'

async function read(path) {
  return fs.readFile(new URL(path, import.meta.url), 'utf8')
}

const agencySection = COMMERCIAL_NAV_SECTIONS.find((section) => section.id === 'agency')
assert.ok(agencySection, 'Commercial navigation should expose an Agency section.')
assert.equal(agencySection.label, 'Agency')
assert.deepEqual(agencySection.items.map((item) => item.label), ['Branches', 'Brokers'])
assert.ok(COMMERCIAL_NAV_ITEMS.some((item) => item.to === '/commercial/agency/branches'), 'Branches should route through Commercial Agency.')
assert.ok(COMMERCIAL_NAV_ITEMS.some((item) => item.to === '/commercial/agency/brokers'), 'Brokers should route through Commercial Agency.')
assert.equal(isCommercialNavItemActive('/commercial/performance/branches', agencySection.items[0]), true, 'Legacy performance branch route should still activate Branches.')
assert.equal(isCommercialNavItemActive('/commercial/brokers', agencySection.items[1]), true, 'Legacy brokers route should still activate Brokers.')

const appSource = await read('../src/App.jsx')
for (const marker of [
  'commercial_broker',
  'commercial_admin',
  'commercial_principal',
  'hasCommercialMembershipMarker',
  'path="agency" element={<CommercialBrokerBranchesPage />}',
  'path="agency/branches" element={<CommercialBrokerBranchesPage />}',
  'path="agency/brokers" element={<CommercialBrokersPage />}',
  'path="performance" element={<Navigate to="/commercial/agency" replace />}',
  'path="performance/brokers" element={<Navigate to="/commercial/agency/brokers" replace />}',
  'path="brokers" element={<Navigate to="/commercial/agency/brokers" replace />}',
  'function LegacyCommercialBrokerRedirect()',
]) {
  assert.match(appSource, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `App routing should include ${marker}`)
}

const permissionRegistry = await read('../src/auth/permissions/permissionRegistry.js')
assert.match(permissionRegistry, /\{ prefix: '\/commercial' \}/, 'Commercial route registry should delegate module authorization to CommercialLayout.')
assert.doesNotMatch(permissionRegistry, /\{ prefix: '\/commercial', appRole: APP_ROLES\.agent, workspaceType: WORKSPACE_TYPES\.agency/, 'Commercial should not use the residential agent workspace guard.')

const commercialApi = await read('../src/modules/commercial/services/commercialApi.js')
for (const role of ['commercial_principal', 'commercial_admin', 'commercial_branch_manager', 'commercial_broker']) {
  assert.match(commercialApi, new RegExp(role), `Commercial access resolver should know ${role}.`)
}

const brokersPage = await read('../src/modules/commercial/pages/CommercialBrokersPage.jsx')
for (const marker of [
  'Invite Broker',
  'Add Broker',
  'createWorkspaceUserInvite',
  'listWorkspaceUserInvites',
  'Broker Directory',
  'Card view',
  'repeat(auto-fit,minmax(min(100%,300px),1fr))',
  'optimistic-commercial-broker',
  'You can keep working while Bridge handles the email.',
  'The form has been reopened with the details preserved.',
  "role: 'commercial_broker'",
  "module_context: 'commercial'",
]) {
  assert.match(brokersPage, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `Brokers page should include ${marker}`)
}
assert.doesNotMatch(
  brokersPage,
  /grid-cols-\[minmax\(260px,1\.35fr\)/,
  'Commercial Brokers page should not use the old fixed-width table grid that overflows the shell.',
)

const branchesPage = await read('../src/modules/commercial/pages/CommercialBrokerBranchesPage.jsx')
for (const marker of [
  'Add Commercial Branch',
  'Add your first branch to start organising brokers, listings and deals.',
  'createBranch',
  "module_context: 'commercial'",
]) {
  assert.match(branchesPage, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `Branches page should include ${marker}`)
}

console.log('commercial agency routing tests passed')
