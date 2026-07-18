import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createServer } from 'vite'

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' })
const { WORKSPACE_TYPES } = await vite.ssrLoadModule('/src/constants/workspaceTypes.js')
const {
  canGovernOrganisationRoleChange,
  getOrganisationRoleOptions,
  getOrganisationRolePermissionSummary,
} = await vite.ssrLoadModule('/src/lib/organisationRoleGovernance.js')

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')
const [migration, settingsApi, usersPage] = await Promise.all([
  read('../../supabase/migrations/202607170027_settings_role_permission_governance_phase3_2.sql'),
  read('../src/lib/settingsApi.js'),
  read('../src/pages/settings/SettingsUsersPage.jsx'),
])

for (const workspaceType of Object.values(WORKSPACE_TYPES).filter((value) => value !== 'client_portal')) {
  const options = getOrganisationRoleOptions(workspaceType)
  assert.ok(options.length >= 6, `${workspaceType} should expose a controlled role catalogue`)
  assert.equal(new Set(options.map((option) => option.value)).size, options.length, `${workspaceType} roles should be unique`)
  for (const option of options) {
    const summary = getOrganisationRolePermissionSummary(option.value, workspaceType)
    assert.equal(summary.roleLabel, option.label)
    assert.ok(summary.permissionCount > 0 || option.value === 'viewer', `${workspaceType}/${option.value} should map to real permissions`)
  }
}

const owner = { userId: 'owner-1', role: 'owner', email: 'owner@example.com' }
const principal = { userId: 'principal-1', role: 'principal', email: 'principal@example.com' }
const agent = { userId: 'agent-1', role: 'agent', email: 'agent@example.com' }
assert.equal(canGovernOrganisationRoleChange({ actor: owner, target: agent, nextRole: 'principal' }), true)
assert.equal(canGovernOrganisationRoleChange({ actor: principal, target: agent, nextRole: 'principal' }), false)
assert.equal(canGovernOrganisationRoleChange({ actor: principal, target: agent, nextRole: 'team_lead' }), true)
assert.equal(canGovernOrganisationRoleChange({ actor: owner, target: owner, nextRole: 'viewer' }), false)
assert.equal(canGovernOrganisationRoleChange({ actor: agent, target: principal, nextRole: 'viewer' }), false)

assert.match(migration, /bridge_guard_organisation_user_role_change/i)
assert.match(migration, /bridge_set_organisation_user_role/i)
assert.match(migration, /You cannot change your own organisation role/i)
assert.match(migration, /You cannot change the role of a peer or higher-authority member/i)
assert.match(migration, /You cannot assign a role at or above your own authority level/i)
assert.match(migration, /Owner role changes must use the ownership transfer flow/i)
assert.match(migration, /before update of role, workspace_role, organisation_role, organization_role/i)
assert.match(migration, /new\.role := v_next_role[\s\S]*new\.workspace_role := v_next_role[\s\S]*new\.organisation_role := v_next_role/i)

const updateRoleStart = settingsApi.indexOf('export async function updateOrganisationUserRole')
const updateRoleEnd = settingsApi.indexOf('export async function updateOrganisationUserJobTitle', updateRoleStart)
const updateRole = settingsApi.slice(updateRoleStart, updateRoleEnd)
assert.match(updateRole, /client\.rpc\('bridge_set_organisation_user_role'/)
assert.doesNotMatch(updateRole, /\.from\('organisation_users'\)[\s\S]*?\.update\(/, 'role changes should not write the table directly')
assert.match(updateRole, /Apply the Phase 3\.2 settings migration/)

assert.match(usersPage, /getOrganisationRoleOptions\(resolvedWorkspaceType\)/)
assert.match(usersPage, /getOrganisationRolePermissionSummary/)
assert.match(usersPage, /canGovernOrganisationRoleChange/)
assert.match(usersPage, /permissions · \{scopeText\}/)
assert.doesNotMatch(usersPage, /const ROLE_OPTIONS\s*=\s*\[/, 'users settings should not keep a decorative universal role list')

await vite.close()
console.log('settings role and permission governance phase 3.2 checks passed')
