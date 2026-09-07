#!/usr/bin/env node

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const [settingsApi, usersPage, appRoutes] = await Promise.all([
  readFile(path.join(appRoot, 'src/lib/settingsApi.js'), 'utf8'),
  readFile(path.join(appRoot, 'src/pages/settings/SettingsUsersPage.jsx'), 'utf8'),
  readFile(path.join(appRoot, 'src/App.jsx'), 'utf8'),
])

assert.match(settingsApi, /export async function getOrganisationOwnershipRemediationReport/)
assert.match(settingsApi, /bridge_organisation_ownership_remediation_report/)
assert.match(settingsApi, /export async function applySafeOrganisationOwnershipRemediation/)
assert.match(settingsApi, /bridge_apply_safe_organisation_ownership_remediation/)
assert.match(usersPage, /isPlatformAdmin/)
assert.match(usersPage, /Apply safe repair/)
assert.match(usersPage, /Manual review required/)
assert.match(usersPage, /Only unambiguous legacy principal-to-owner repairs can be applied here/)
assert.match(usersPage, /Apply safe ownership repair/)
assert.match(appRoutes, /path="users"[\s\S]{0,240}platform_admin/)

console.log('organisation ownership remediation phase 6 UI: passed')
