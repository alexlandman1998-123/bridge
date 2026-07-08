import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const settingsApiSource = readFileSync(new URL('../src/lib/settingsApi.js', import.meta.url), 'utf8')

assert.match(
  settingsApiSource,
  /function isUniqueConstraintError\(error\)[\s\S]*code === '23505'/,
  'settings API must detect duplicate-key errors.',
)

assert.match(
  settingsApiSource,
  /if \(isUniqueConstraintError\(insertSettings\.error\)\)[\s\S]*const existingSettings = await client[\s\S]*\.from\('organisation_settings'\)[\s\S]*\.eq\('organisation_id', organisation\.id\)[\s\S]*\.maybeSingle\(\)/,
  'organisation settings insert fallback must re-read existing settings when the unique organisation row already exists.',
)

assert.match(
  settingsApiSource,
  /safeJson\(existingSettings\.data\.settings_json, DEFAULT_ORGANISATION_SETTINGS\)/,
  'duplicate organisation settings recovery must use the existing settings payload.',
)

assert.match(
  settingsApiSource,
  /buildOrganisationContextResult\(\{[\s\S]*membershipBranchId:[\s\S]*membershipPrimaryBranchId:[\s\S]*membershipBranchScope:/,
  'organisation context fallback should preserve membership branch metadata consistently.',
)

console.log('organisation settings idempotency contract passed')
