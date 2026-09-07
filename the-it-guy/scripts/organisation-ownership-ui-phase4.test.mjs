#!/usr/bin/env node

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const [settingsApi, usersPage, membershipResolution] = await Promise.all([
  readFile(path.join(appRoot, 'src/lib/settingsApi.js'), 'utf8'),
  readFile(path.join(appRoot, 'src/pages/settings/SettingsUsersPage.jsx'), 'utf8'),
  readFile(path.join(appRoot, 'src/lib/organisationMembershipResolution.js'), 'utf8'),
])

assert.match(membershipResolution, /export function isPrimaryOrganisationOwnerMembership/)
assert.match(settingsApi, /export async function grantOrganisationOwnership/)
assert.match(settingsApi, /bridge_grant_organisation_owner/)
assert.match(settingsApi, /is_primary_owner/)
assert.match(settingsApi, /Only the primary organisation owner can grant owner access/)
assert.match(settingsApi, /Only the primary organisation owner can reassign primary ownership/)
assert.match(usersPage, /Grant owner/)
assert.match(usersPage, /Make primary owner/)
assert.match(usersPage, /Primary owner/)
assert.match(usersPage, /You remain an organisation owner/)
assert.doesNotMatch(usersPage, /You will move to the senior management role/)

console.log('organisation ownership UI phase 4: passed')
