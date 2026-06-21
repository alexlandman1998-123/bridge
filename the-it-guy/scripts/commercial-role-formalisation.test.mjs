import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import {
  COMMERCIAL_EXTERNAL_PORTAL_ROLES,
  canManageCommercialBrokerage,
  hasCommercialBranchScope,
  hasCommercialOrganisationScope,
  hasCommercialTeamScope,
  isCommercialBroker,
  isCommercialManager,
  resolveCommercialRole,
} from '../src/modules/commercial/utils/resolveCommercialRole.js'
import { COMMERCIAL_NAV_SECTIONS, isCommercialNavItemAvailable } from '../src/modules/commercial/commercialNavigation.js'

async function read(path) {
  return fs.readFile(new URL(path, import.meta.url), 'utf8')
}

assert.equal(
  resolveCommercialRole({ module_context: 'commercial', role: 'agent' }),
  'commercial_broker',
  'legacy commercial agents should resolve to commercial_broker',
)
assert.equal(resolveCommercialRole({ module_context: 'commercial', role: 'senior_agent' }), 'senior_commercial_broker')
assert.equal(resolveCommercialRole({ module_context: 'commercial', role: 'principal' }), 'commercial_principal')
assert.equal(resolveCommercialRole({ module_context: 'commercial', role: 'admin' }), 'commercial_admin')
assert.equal(resolveCommercialRole({ module_context: 'commercial', role: 'branch_manager' }), 'commercial_branch_manager')
assert.equal(resolveCommercialRole({ module_context: 'commercial', role: 'team_leader' }), 'commercial_team_leader')
assert.equal(
  resolveCommercialRole({ commercial_role: 'commercial_broker', workspace_role: 'principal', module_context: 'commercial' }),
  'commercial_broker',
  'explicit commercial_role should have priority over legacy workspace roles',
)
assert.equal(resolveCommercialRole({ role: 'agent' }), null, 'generic residential agents should not become commercial brokers without a commercial marker')

assert.equal(isCommercialBroker({ commercial_role: 'commercial_broker' }), true)
assert.equal(canManageCommercialBrokerage({ commercial_role: 'commercial_broker' }), false)
assert.equal(canManageCommercialBrokerage({ commercial_role: 'commercial_hq_manager' }), true)
assert.equal(isCommercialManager({ commercial_role: 'commercial_branch_manager' }), true)
assert.equal(hasCommercialOrganisationScope({ commercial_role: 'commercial_principal' }), true)
assert.equal(hasCommercialBranchScope({ commercial_role: 'commercial_branch_admin' }), true)
assert.equal(hasCommercialTeamScope({ commercial_role: 'commercial_team_leader' }), true)

const agencySection = COMMERCIAL_NAV_SECTIONS.find((section) => section.id === 'agency')
assert.ok(agencySection, 'agency navigation should exist')
assert.equal(isCommercialNavItemAvailable(agencySection.items[0], { commercial_role: 'commercial_broker' }), false, 'brokers should not see branch management')
assert.equal(isCommercialNavItemAvailable(agencySection.items[1], { commercial_role: 'commercial_principal' }), true, 'managers should see broker management')

for (const portalRole of ['tenant', 'landlord', 'buyer', 'seller', 'investor', 'property_manager', 'corporate_contact']) {
  assert.equal(COMMERCIAL_EXTERNAL_PORTAL_ROLES.has(portalRole), true, `external portal role should remain unchanged: ${portalRole}`)
}

const commercialApi = await read('../src/modules/commercial/services/commercialApi.js')
for (const marker of [
  "platform_role: COMMERCIAL_PLATFORM_ROLE",
  'commercial_role: requestedCommercialRole',
  'buildCommercialRolePatch',
  'resolveCommercialRole(member)',
  'canManageCommercialBrokerage',
  'isCommercialAccessReviewer(context)',
]) {
  assert.match(commercialApi, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `commercialApi should include ${marker}`)
}

const brokersPage = await read('../src/modules/commercial/pages/CommercialBrokersPage.jsx')
assert.match(brokersPage, /platform_role: 'commercial'/, 'broker invites should dual-write platform_role in metadata')
assert.match(brokersPage, /commercial_role: inviteDraft\.role/, 'broker invites should keep commercial_role in metadata')

const migration = await read('../../supabase/migrations/202606210004_commercial_role_formalisation_phase1.sql')
for (const marker of [
  'add column if not exists platform_role text',
  'add column if not exists commercial_role text',
  'organisation_users_commercial_role_idx',
  'commercial_access_requests_role_idx',
  'bridge_commercial_user_scope',
  'bridge_apply_commercial_invite_membership_marker',
  "platform_role = 'commercial'",
  "'senior_commercial_broker'",
]) {
  assert.match(migration, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `migration should include ${marker}`)
}
assert.doesNotMatch(migration, /platform_role text\s+not null/i, 'platform_role should remain nullable in phase 1')
assert.doesNotMatch(migration, /commercial_role text\s+not null/i, 'commercial_role should remain nullable in phase 1')

console.log('commercial role formalisation diagnostics passed')
