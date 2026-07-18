import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  getOrganisationJobTitleLabel,
  normalizeOrganisationJobTitle,
  ORGANISATION_JOB_TITLE_OPTIONS,
} from '../src/lib/organisationJobTitles.js'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')
const [migration, settingsApi, usersPage, accountPage, workspaceResolution] = await Promise.all([
  read('../../supabase/migrations/202607170026_settings_job_title_governance_phase3_1.sql'),
  read('../src/lib/settingsApi.js'),
  read('../src/pages/settings/SettingsUsersPage.jsx'),
  read('../src/pages/settings/SettingsAccountPage.jsx'),
  read('../src/services/workspaceResolutionService.js'),
])

assert.ok(ORGANISATION_JOB_TITLE_OPTIONS.length > 10, 'job titles should come from a meaningful controlled catalogue')
assert.equal(normalizeOrganisationJobTitle('Branch Manager'), 'branch_manager')
assert.equal(normalizeOrganisationJobTitle('invented title'), '')
assert.equal(getOrganisationJobTitleLabel('property_practitioner'), 'Property Practitioner')

for (const option of ORGANISATION_JOB_TITLE_OPTIONS.filter((item) => item.value)) {
  assert.match(migration, new RegExp(`'${option.value}'`), `database constraint should allow ${option.value}`)
  assert.match(migration, new RegExp(`then '${option.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`, 'i'), `database label mapping should include ${option.label}`)
}

assert.match(migration, /add column if not exists job_title text/i)
assert.match(migration, /organisation_users_job_title_check/i)
assert.match(migration, /bridge_set_organisation_user_job_title/i)
assert.match(migration, /bridge_guard_organisation_user_job_title/i)
assert.match(migration, /lower\(trim\(coalesce\(actor\.workspace_role, actor\.organisation_role, actor\.role, ''\)\)\) = 'owner'/i)
assert.match(migration, /Only the organisation owner can change job titles/i)
assert.match(migration, /bridge_sync_organisation_user_job_title_to_profile/i)
assert.match(migration, /update public\.profiles[\s\S]*set title = public\.bridge_job_title_label/i)

assert.match(settingsApi, /export async function updateOrganisationUserJobTitle/)
assert.match(settingsApi, /client\.rpc\('bridge_set_organisation_user_job_title'/)
assert.match(settingsApi, /normalizeOrganisationMembershipRole\(context\.membershipRole\) !== 'owner'/)
assert.match(settingsApi, /jobTitle: normalizeOrganisationJobTitle\(row\?\.job_title/)

const updateAccountStart = settingsApi.indexOf('export async function updateAccountSettings')
const updateAccountEnd = settingsApi.indexOf('export async function uploadAccountAvatar', updateAccountStart)
const updateAccountSettings = settingsApi.slice(updateAccountStart, updateAccountEnd)
assert.doesNotMatch(updateAccountSettings, /title:\s*normalizeNullableText\(input\.title\)/, 'users must not self-edit organisation-managed titles')

assert.match(usersPage, /isOrganisationOwner \? \(/)
assert.match(usersPage, /ORGANISATION_JOB_TITLE_OPTIONS\.map/)
assert.match(usersPage, /updateOrganisationUserJobTitle/)
assert.doesNotMatch(usersPage, /type=["']text["'][^>]*job.?title/i, 'job title must not be a free-text input')
assert.match(accountPage, /getOrganisationJobTitleLabel/)
assert.match(accountPage, /Managed by your organisation/)
assert.match(workspaceResolution, /jobTitle: row\.job_title/)
assert.match(workspaceResolution, /job_title: normalizeText\(jobTitle\)/)

console.log('settings job-title governance phase 3.1 checks passed')
