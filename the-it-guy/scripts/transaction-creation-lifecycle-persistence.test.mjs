import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()
const apiSource = readFileSync(resolve(root, 'src/lib/api.js'), 'utf8')
const migrationSource = readFileSync(
  resolve(root, '../supabase/migrations/20260831070625_add_transaction_creation_lifecycle.sql'),
  'utf8',
)

const functionStart = apiSource.indexOf('export async function createTransactionFromWizard')
assert.notEqual(functionStart, -1, 'createTransactionFromWizard must exist')
const nextFunction = apiSource.indexOf('\nexport async function ', functionStart + 1)
const creationSource = apiSource.slice(functionStart, nextFunction === -1 ? apiSource.length : nextFunction)

for (const column of [
  'creation_status',
  'creation_started_at',
  'creation_completed_at',
  'creation_incomplete_at',
  'creation_steps',
  'creation_error',
]) {
  assert.match(apiSource, new RegExp(`['"]${column}['"]`), `${column} must be protected from schema fallback`)
  assert.match(migrationSource, new RegExp(`add column if not exists ${column}`))
}

assert.match(creationSource, /status: 'initializing'/)
assert.match(creationSource, /\.\.\.initialCreationLifecyclePatch/)
assert.match(creationSource, /expectedAttorneyAssignments/)
assert.match(creationSource, /propagationResult\.attorneyAssignments\.length < expectedAttorneyAssignments\.length/)
assert.match(creationSource, /if \(!onboardingRecord\?\.token\)/)
assert.match(creationSource, /if \(!onboardingSnapshot \|\| typeof onboardingSnapshot !== 'object'\)/)
assert.match(creationSource, /if \(!requiredDocumentRows\.length\)/)
assert.match(creationSource, /sellerHandoffRequired:\s*transactionType === 'private_property'/)
assert.match(creationSource, /bridge_verify_private_transaction_seller_handoff/)
assert.match(creationSource, /'seller_handoff'/)
assert.match(creationSource, /if \(!clientPortalLink\?\.token\)/)
assert.match(creationSource, /status: 'complete'/)
assert.match(creationSource, /status: 'incomplete'/)
assert.match(creationSource, /TRANSACTION_CREATION_STATUS_PERSISTENCE_FAILED/)
assert.match(creationSource, /TransactionCreationIncompleteError/)
assert.doesNotMatch(creationSource, /requiredDocsGenerated:\s*true/)

assert.match(migrationSource, /creation_status in \('initializing', 'complete', 'incomplete'\)/)
assert.match(migrationSource, /creation_status = 'complete' and creation_completed_at is not null/)
assert.match(migrationSource, /creation_status = 'incomplete' and creation_incomplete_at is not null/)
assert.match(migrationSource, /alter column creation_status set default 'initializing'/)
assert.match(migrationSource, /creation_status = 'complete' or coalesce\(is_active, false\) = false/)

console.log('transaction creation lifecycle persistence contract passed')
