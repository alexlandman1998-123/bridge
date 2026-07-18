import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const settingsApi = await readFile(new URL('../src/lib/settingsApi.js', import.meta.url), 'utf8')
const profileApi = await readFile(new URL('../src/lib/profileApi.js', import.meta.url), 'utf8')

function extractFunction(source, name, nextExportName = '') {
  const start = source.indexOf(`export async function ${name}`)
  assert.notEqual(start, -1, `${name} should exist`)
  const end = nextExportName ? source.indexOf(`export async function ${nextExportName}`, start + 1) : source.length
  assert.notEqual(end, -1, `could not find boundary after ${name}`)
  return source.slice(start, end)
}

const updateAccountSettings = extractFunction(settingsApi, 'updateAccountSettings', 'uploadAccountAvatar')
const updateUserProfile = extractFunction(profileApi, 'updateUserProfile')

assert.match(updateAccountSettings, /\.from\('profiles'\)[\s\S]*?\.update\(payload\)[\s\S]*?\.eq\('id', user\.id\)/, 'account save should update only the authenticated profile')
assert.doesNotMatch(updateAccountSettings, /\.upsert\(/, 'account save must not trigger INSERT RLS through upsert')
assert.match(updateAccountSettings, /const verification = await client[\s\S]*?\.select\(ACCOUNT_PROFILE_SELECT_COLUMNS\)/, 'account save should re-read the stored profile before reporting success')
assert.match(updateAccountSettings, /Profile record was not found/, 'account save should fail clearly when no existing profile can be updated')

assert.match(updateUserProfile, /\.from\('profiles'\)[\s\S]*?\.update\(payload\)[\s\S]*?\.eq\('id', userId\)/, 'general profile updates should be update-only')
assert.doesNotMatch(updateUserProfile, /\.upsert\(/, 'general profile updates must not create records implicitly')
assert.match(profileApi, /createIfMissing[\s\S]*?\.insert\(payload\)/, 'profile creation should use an explicit insert path')
assert.match(profileApi, /persistProfileRecord\(client, activeUser, fallbackProfile, \{ createIfMissing: true \}\)/, 'only a confirmed missing profile should enter the creation path')

assert.match(settingsApi, /firstName: profileFirstName \|\| normalizeText\(row\?\.first_name\)/, 'organisation users should prefer the canonical profile first name')
assert.match(settingsApi, /profileFullName \|\|[\s\S]*?\[profileFirstName, profileLastName\]/, 'organisation users should prefer the canonical profile display name')

console.log('settings profile persistence phase 2.1 checks passed')
