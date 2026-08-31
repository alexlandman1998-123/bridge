import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()
const apiSource = readFileSync(resolve(root, 'src/lib/api.js'), 'utf8')
const helperSource = readFileSync(resolve(root, 'src/lib/targetedMissingColumnRetry.js'), 'utf8')

const functionStart = apiSource.indexOf('export async function createTransactionFromWizard')
assert.notEqual(functionStart, -1, 'createTransactionFromWizard must exist')
const nextFunction = apiSource.indexOf('\nexport async function ', functionStart + 1)
const creationSource = apiSource.slice(functionStart, nextFunction === -1 ? apiSource.length : nextFunction)

assert.match(apiSource, /retryMutationWithoutReportedMissingColumns/)
assert.match(apiSource, /const MAX_TARGETED_MISSING_COLUMN_RETRIES = 8/)
assert.match(apiSource, /canRemoveColumn: \(column\) => !TRANSACTION_RLS_INSERT_GUARD_COLUMNS\.has/)
assert.equal(
  (creationSource.match(/executeTransactionMutationWithTargetedColumnRetry\(\{/g) || []).length,
  2,
  'new inserts and existing-unit updates must share the targeted retry',
)

assert.doesNotMatch(creationSource, /minimalTransactionPayload/)
assert.doesNotMatch(creationSource, /delete fallbackPayload\.(?:transaction_type|purchaser_type|finance_managed_by)/)
assert.doesNotMatch(creationSource, /delete fallbackPayload\.(?:purchase_price|cash_amount|bond_amount|deposit_amount)/)
assert.doesNotMatch(creationSource, /delete fallbackPayload\.(?:sale_route|sale_channel|seller_party_type|lead_owner|ownership_model|source_agency_org_id)/)

assert.match(helperSource, /MISSING_COLUMN_ERROR_CODES = new Set\(\['42703', 'PGRST204'\]\)/)
assert.match(helperSource, /const sources = \[String\(error\.message \|\| ''\), String\(error\.details \|\| ''\)\]/)
assert.doesNotMatch(helperSource, /error\.hint/, 'suggested columns must never be removed from a payload')
assert.match(helperSource, /attempts < attemptLimit/)

console.log('transaction targeted missing-column retry contract passed')
