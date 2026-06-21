import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

async function read(path) {
  return fs.readFile(new URL(path, import.meta.url), 'utf8')
}

function includes(source, marker, message) {
  assert.ok(source.includes(marker), message || `Expected source to include ${marker}`)
}

function excludes(source, marker, message) {
  assert.ok(!source.includes(marker), message || `Expected source not to include ${marker}`)
}

const commercialApi = await read('../src/modules/commercial/services/commercialApi.js')
const commercialRoleResolver = await read('../src/modules/commercial/utils/resolveCommercialRole.js')
for (const marker of [
  'export function isCommercialMembershipRow',
  'module_context',
  'hasCommercialAccess',
  "scopeLevel: isPlatformAdmin ? 'organisation' : hasCommercialAccess ? resolveScopeLevel(role) : 'none'",
  'Commercial workspace access is required.',
  'commercial_documents',
  'commercial_activity',
  "['commercial',",
]) {
  includes(commercialApi, marker, `Commercial API should enforce explicit commercial module context: ${marker}`)
}
includes(commercialRoleResolver, 'COMMERCIAL_MODULE_MARKERS', 'Commercial role resolver should own commercial module markers.')
excludes(commercialApi, "return BROKER_ROLES.has(normalizeLower(member.role))", 'Commercial access must not be granted from a generic residential broker/agent role alone.')

const brokerageApi = await read('../src/modules/commercial/services/commercialBrokerageApi.js')
for (const marker of [
  'isCommercialMembershipRow',
  '.filter(isCommercialMembershipRow)',
  'module_context',
]) {
  includes(brokerageApi, marker, `Commercial brokerage user lists should filter explicit commercial members: ${marker}`)
}

const appRoutes = await read('../src/App.jsx')
includes(appRoutes, 'path="/commercial" element={<RoleRoute allowedRoles={[\'agent\', \'commercial_broker\', \'commercial_admin\', \'commercial_principal\', \'platform_admin\']}', 'Commercial routes should be wrapped in RoleRoute with commercial-safe roles.')
includes(appRoutes, 'hasCommercialMembershipMarker', 'Commercial users should be routed from the generic dashboard into the Commercial workspace.')

const permissionRegistry = await read('../src/auth/permissions/permissionRegistry.js')
includes(permissionRegistry, "{ prefix: '/commercial' }", 'Commercial route registry should delegate module-specific authorization to CommercialLayout.')
excludes(permissionRegistry, "{ prefix: '/commercial', appRole: APP_ROLES.agent, workspaceType: WORKSPACE_TYPES.agency", 'Commercial should not use the residential agent workspace guard.')

const commercialLayout = await read('../src/modules/commercial/components/CommercialLayout.jsx')
for (const marker of [
  'resolveCommercialAccessContext',
  'Commercial workspace access could not be verified.',
  'Checking Commercial access',
  'hasCommercialAccess',
]) {
  includes(commercialLayout, marker, `Commercial layout should verify explicit commercial access: ${marker}`)
}

const quickCreate = await read('../src/components/QuickCreateDropdown.jsx')
includes(quickCreate, "type: 'commercial-appointment'", 'Commercial appointment quick-create item should still be represented.')
includes(quickCreate, "to: '/commercial/viewings'", 'Commercial appointment quick-create should route to Commercial viewings.')
excludes(quickCreate, "initialForm: { appointmentType: 'Lease Meeting', title: 'Commercial Appointment' }", 'Commercial appointment must not open the residential appointment modal.')

const hierarchyMigration = await read('../../supabase/migrations/202606080001_commercial_brokerage_hierarchy.sql')
for (const marker of [
  'add column if not exists module_context text',
  'organisation_users_commercial_module_idx',
  "coalesce(ou.module_context, '') in ('commercial', 'commercial_brokerage', 'commercial_agency')",
  "coalesce(ou.workspace_role, ou.organisation_role, ou.role, '') like 'commercial_%'",
  'alter table public.commercial_teams enable row level security',
  'commercial_teams_brokerage_access',
]) {
  includes(hierarchyMigration, marker, `Commercial hierarchy migration should enforce module-scoped RLS: ${marker}`)
}

const commercialSeed = await read('../../supabase/seed/seed-commercial-demo-data.sql')
for (const marker of [
  "module_context = 'commercial'",
  "workspace_role = coalesce(workspace_role, 'commercial_hq_admin')",
]) {
  includes(commercialSeed, marker, `Commercial seed should explicitly assign commercial module context: ${marker}`)
}

const privateListings = await read('../src/services/privateListingService.js')
for (const marker of [
  ".from('private_listings')",
  ".from('private_listing_documents')",
  ".from('private_listing_activity')",
  'private-listings/',
]) {
  includes(privateListings, marker, `Residential/private listing service should stay on residential tables/storage: ${marker}`)
}

console.log('commercial module isolation diagnostics passed')
