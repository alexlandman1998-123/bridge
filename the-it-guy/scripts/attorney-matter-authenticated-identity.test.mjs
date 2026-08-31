import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const transactionDetailSource = readFileSync(
  new URL('../src/pages/AttorneyTransactionDetail.jsx', import.meta.url),
  'utf8',
)
const attorneyPermissionsSource = readFileSync(
  new URL('../src/lib/attorneyPermissions.js', import.meta.url),
  'utf8',
)

assert.match(
  transactionDetailSource,
  /canAccessAttorneyMatter\(\s*transactionId,\s*attorneyPermissionState\.firmId,\s*\/\/[\s\S]*?\snull,\s*\{ membership:/,
  'Matter access must resolve the actor from the authenticated session instead of potentially stale workspace profile state.',
)
assert.match(
  attorneyPermissionsSource,
  /async function resolveAuthenticatedUserId\([\s\S]*?await getAuthenticatedUser\(client\)[\s\S]*?authenticatedUserId[\s\S]*?return authenticatedUserId/,
  'Attorney permission checks must prefer the authenticated Supabase user over caller-supplied profile state.',
)

console.log('Attorney matter authenticated identity checks passed.')
