#!/usr/bin/env node

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const usersPage = await readFile(path.join(appRoot, 'src/pages/settings/SettingsUsersPage.jsx'), 'utf8')

assert.match(usersPage, /getOrganisationOwnershipHealth/)
assert.match(usersPage, /Ownership recovery is required/)
assert.match(usersPage, /platform administrator must run the ownership remediation/i)
assert.match(usersPage, /Ownership health is valid/)

console.log('organisation ownership health phase 5 UI: passed')
