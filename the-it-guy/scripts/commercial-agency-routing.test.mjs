import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { COMMERCIAL_NAV_SECTIONS, COMMERCIAL_NAV_ITEMS, isCommercialNavItemActive, isCommercialNavItemAvailable } from '../src/modules/commercial/commercialNavigation.js'

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
assert.equal(isCommercialNavItemAvailable(agencySection.items[0], { canManageBrokerage: false }), false, 'Broker scope should not see Commercial Agency Branches.')
assert.equal(isCommercialNavItemAvailable(agencySection.items[1], { canManageBrokerage: false }), false, 'Broker scope should not see Commercial Agency Brokers.')
assert.equal(isCommercialNavItemAvailable(agencySection.items[1], { canManageBrokerage: true }), true, 'Commercial managers should still see Commercial Agency Brokers.')

const appSource = await read('../src/App.jsx')
for (const marker of [
  'commercial_broker',
  'commercial_admin',
  'commercial_principal',
  'WORKSPACE_SWITCHER_STORAGE_KEY',
  "preferredWorkspaceMode !== 'residential'",
  'hasCommercialMembershipMarker',
  'CommercialManagerRouteGate',
  'path="agency" element={<CommercialManagerRouteGate><CommercialBrokerBranchesPage /></CommercialManagerRouteGate>}',
  'path="agency/branches" element={<CommercialManagerRouteGate><CommercialBrokerBranchesPage /></CommercialManagerRouteGate>}',
  'path="agency/brokers" element={<CommercialManagerRouteGate><CommercialBrokersPage /></CommercialManagerRouteGate>}',
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
const commercialRoleResolver = await read('../src/modules/commercial/utils/resolveCommercialRole.js')
for (const role of ['commercial_principal', 'commercial_admin', 'commercial_branch_manager', 'commercial_broker']) {
  assert.match(commercialRoleResolver, new RegExp(role), `Commercial role resolver should know ${role}.`)
}
for (const marker of [
  'resolveCommercialMembershipRole',
  'resolveCommercialRole(member)',
  'buildCommercialRolePatch',
  'canManageCommercialBrokerage',
  "scope.scopeLevel === 'broker'",
  'applyCommercialScope(supabase',
]) {
  assert.match(commercialApi, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `Commercial API should include broker-safe scoping marker: ${marker}`)
}

const managerGate = await read('../src/modules/commercial/components/CommercialManagerRouteGate.jsx')
for (const marker of [
  'resolveCommercialAccessContext',
  'scope?.canManageBrokerage === true',
  'Broker accounts do not have agency management access.',
  'to="/commercial"',
]) {
  assert.match(managerGate, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `Commercial manager route gate should include ${marker}`)
}

const dashboardApi = await read('../src/modules/commercial/services/commercialDashboardApi.js')
for (const marker of [
  'filterBrokerDirectoryForScope',
  "scope?.scopeLevel === 'broker'",
  'buildCommercialViewerBrokerIds',
  'viewerScope',
]) {
  assert.match(dashboardApi, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `Commercial dashboard should scope broker metadata: ${marker}`)
}

const workspaceResolution = await read('../src/services/workspaceResolutionService.js')
for (const marker of [
  'module_context, module_metadata',
  'moduleContext: row.module_context',
  'moduleMetadata: row.module_metadata',
  'module_context: normalizeText(moduleContext)',
  'module_metadata: moduleMetadata',
]) {
  assert.match(workspaceResolution, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `Workspace resolution should carry commercial membership markers: ${marker}`)
}

const commercialInviteMigration = await read('../../supabase/migrations/202606170004_commercial_invite_membership_marker.sql')
for (const marker of [
  'bridge_apply_commercial_invite_membership_marker',
  "module_context = 'commercial'",
  'accepted_from_invite_at',
  'workspace_invite_backfill',
  "target_workspace_role",
]) {
  assert.match(commercialInviteMigration, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `Commercial invite migration should preserve module-aware memberships: ${marker}`)
}

const brokersPage = await read('../src/modules/commercial/pages/CommercialBrokersPage.jsx')
for (const marker of [
  'Invite Broker',
  'Add Broker',
  'createWorkspaceUserInvite',
  'listWorkspaceUserInvites',
  'revokeWorkspaceUserInvite',
  'Broker Directory',
  'Card view',
  'Delete invite',
  'Broker invite deleted. The invite link is no longer valid.',
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

const commercialSidebar = await read('../src/modules/commercial/components/CommercialSidebar.jsx')
for (const marker of [
  'childActiveItemClass',
  'childInactiveItemClass',
  'pl-7',
]) {
  assert.match(commercialSidebar, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `Commercial sidebar should include compact submenu styling marker ${marker}`)
}
assert.doesNotMatch(
  commercialSidebar,
  /border-l border-slate-200 pl-3/,
  'Commercial sidebar submenu should not render the old vertical rail with oversized child pills.',
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
