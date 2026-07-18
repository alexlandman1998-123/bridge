import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')
const [migration, settingsApi, usersPage] = await Promise.all([
  read('../../supabase/migrations/202607170028_settings_ownership_transfer_phase3_3.sql'),
  read('../src/lib/settingsApi.js'),
  read('../src/pages/settings/SettingsUsersPage.jsx'),
])

assert.match(migration, /bridge_transfer_organisation_ownership/i)
assert.match(migration, /Only the active organisation owner can transfer ownership/i)
assert.match(migration, /pg_advisory_xact_lock/i, 'ownership transfers must be serialised per organisation')
assert.match(migration, /target\.organisation_id = v_actor\.organisation_id/i)
assert.match(migration, /v_target\.user_id is null[\s\S]*membership_status[\s\S]*<> 'active'/i)
assert.match(migration, /set_config\('bridge\.ownership_transfer', 'on', true\)/i)
assert.match(migration, /current_setting\('bridge\.ownership_transfer', true\) = 'on'/i)
assert.match(migration, /set role = 'owner'[\s\S]*is_primary_owner = true[\s\S]*job_title = 'organisation_owner'/i)
assert.match(migration, /set role = v_previous_owner_role[\s\S]*is_primary_owner = false[\s\S]*job_title = v_previous_owner_job_title/i)
assert.match(migration, /when 'developer_company' then 'director'/i)
assert.match(migration, /when 'attorney_firm' then 'partner'/i)
assert.match(migration, /when 'bond_originator' then 'hq_manager'/i)
assert.match(migration, /'ownership_transferred'/i, 'the atomic database command should retain an audit event')
assert.match(migration, /revoke all on function public\.bridge_transfer_organisation_ownership/i)
assert.match(migration, /grant execute on function public\.bridge_transfer_organisation_ownership\(uuid\) to authenticated/i)

const transferStart = settingsApi.indexOf('export async function transferOrganisationOwnership')
const transferEnd = settingsApi.indexOf('export async function deactivateOrganisationUser', transferStart)
const transferService = settingsApi.slice(transferStart, transferEnd)
assert.ok(transferStart >= 0 && transferEnd > transferStart, 'settings API should expose the transfer service')
assert.match(transferService, /normalizeOrganisationMembershipRole\(context\.membershipRole\) !== 'owner'/)
assert.match(transferService, /client\.rpc\('bridge_transfer_organisation_ownership'/)
assert.doesNotMatch(transferService, /\.from\('organisation_users'\)[\s\S]*?\.update\(/, 'the client must not perform a multi-step ownership transfer')
assert.match(transferService, /Apply the Phase 3\.3 settings migration/)
assert.match(transferService, /clearOrganisationRuntimeCache\(\)/)

assert.match(usersPage, /import ConfirmDialog/)
assert.match(usersPage, /isOrganisationOwner &&[\s\S]*!isCurrentUser[\s\S]*userRow\.status === 'active'[\s\S]*userRow\.role !== 'owner'/)
assert.match(usersPage, /Transfer organisation ownership\?/)
assert.match(usersPage, /This cannot be reversed from the normal role dropdown/)
assert.match(usersPage, /await transferOrganisationOwnership\(ownershipTransferTarget\.id\)/)
assert.match(usersPage, /retryWorkspaceBootstrap\?\.\(\)/)

console.log('settings ownership transfer phase 3.3 checks passed')
