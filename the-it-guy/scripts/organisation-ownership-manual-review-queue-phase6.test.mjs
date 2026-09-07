#!/usr/bin/env node

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = path.resolve(appRoot, '..')
const migration = await readFile(
  path.join(repoRoot, 'supabase/migrations/20260907155942_organisation_ownership_manual_review_queue_phase6.sql'),
  'utf8',
)
const settingsApi = await readFile(path.join(appRoot, 'src/lib/settingsApi.js'), 'utf8')
const usersPage = await readFile(path.join(appRoot, 'src/pages/settings/SettingsUsersPage.jsx'), 'utf8')

assert.match(migration, /bridge_organisation_ownership_manual_review_queue/)
assert.match(migration, /security definer/)
assert.match(migration, /Only platform administrators can inspect the ownership manual-review queue/i)
assert.match(migration, /manual_review_multiple_primary_owners/)
assert.match(migration, /manual_review_no_active_owner/)
assert.match(migration, /manual_review_primary_role_mismatch/)
assert.match(migration, /manual_review_no_primary_owner/)
assert.match(migration, /'roleFieldsComplete'/)
assert.match(migration, /'roleFieldsConsistent'/)
assert.match(migration, /revoke all on function public\.bridge_organisation_ownership_manual_review_queue\(\) from public/i)
assert.match(migration, /grant execute on function public\.bridge_organisation_ownership_manual_review_queue\(\) to authenticated/i)
assert.doesNotMatch(migration, /\b(update|insert into|delete from)\s+public\.organisation_users\b/i)

assert.match(settingsApi, /export async function getOrganisationOwnershipManualReviewQueue/)
assert.match(settingsApi, /bridge_organisation_ownership_manual_review_queue/)
assert.match(usersPage, /getOrganisationOwnershipManualReviewQueue/)
assert.match(usersPage, /Review: \{manualReview\.members\.map/)

console.log('organisation ownership manual-review queue phase 6: passed')
