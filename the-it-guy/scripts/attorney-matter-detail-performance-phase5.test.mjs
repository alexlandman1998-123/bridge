import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const [apiSource, permissionsSource, detailSource] = await Promise.all([
  readFile(new URL('../src/lib/api.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/lib/attorneyPermissions.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/pages/AttorneyTransactionDetail.jsx', import.meta.url), 'utf8'),
])

assert.match(apiSource, /async function buildTransactionWorkspaceShellFromTransaction/)
assert.match(apiSource, /const transaction = await fetchTransactionRowById\(client, normalizedTransactionId\)/)
assert.match(apiSource, /return buildTransactionWorkspaceShellFromTransaction\(client, transaction, \{ cacheKey: normalizedTransactionId \}\)/)
assert.doesNotMatch(apiSource, /const coreDetail = await fetchUnitWorkspaceShell\(transactionId\)/)

assert.match(permissionsSource, /\{ membership: suppliedMembership = null \} = \{\}/)
assert.match(permissionsSource, /const suppliedMembershipIsUsable = Boolean\(/)
assert.match(permissionsSource, /const missingFirmIds = scopedFirmIds\.filter/)

assert.match(detailSource, /\{ membership: attorneyPermissionState\.membership \}/)
assert.match(detailSource, /\['today', 'tasks', 'transfer'\]\.includes\(activeWorkspaceMenu\)[\s\S]{0,220}?['"]workflow['"]/)
assert.doesNotMatch(detailSource, /if \(workflowOperations && workflowOperationsTransactionId === transaction\.id\) return/)

console.log('Attorney matter detail Phase 5 performance contract checks passed.')
