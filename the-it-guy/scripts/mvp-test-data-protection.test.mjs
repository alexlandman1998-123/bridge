import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
  assessMvpTestDataProtection,
  assertMvpTestDataProtection,
  MVP_TEST_DATA_PROTECTION_ERROR,
} from '../src/core/transactions/mvpTestDataProtection.js'

const production = assessMvpTestDataProtection({ payload: { buyerName: 'Jane Buyer', buyerEmail: 'jane@example.com' } })
assert.equal(production.isTestData, false)

const marked = assessMvpTestDataProtection({ payload: { buyerName: 'TEST — DO NOT ACTION Buyer', buyerEmail: 'test.buyer@arch9.invalid' } })
assert.equal(marked.isTestData, true)
assert.throws(
  () => assertMvpTestDataProtection(marked),
  (error) => error.code === MVP_TEST_DATA_PROTECTION_ERROR,
)
assert.doesNotThrow(() => assertMvpTestDataProtection(marked, { testMode: true, controlledTestRoleSet: 'mvp_pilot_v1' }))

const persisted = assessMvpTestDataProtection({
  transaction: { routing_profile_json: { testDataProtection: { isTestData: true, controlledTestRoleSet: 'mvp_pilot_v1' } } },
})
assert.equal(persisted.externalDeliveryAllowed, false)

const outboxMetadata = assessMvpTestDataProtection({
  metadata: { testDataProtection: { isTestData: true } },
})
assert.equal(outboxMetadata.externalDeliveryAllowed, false)

const lifecycle = fs.readFileSync('src/lib/transactionLifecycleService.js', 'utf8')
const edgeGuard = fs.readFileSync('../supabase/functions/send-email/utils/controlledTestRecipient.ts', 'utf8')
assert.match(lifecycle, /assertMvpTestDataProtection/)
assert.match(lifecycle, /testDataProtection/)
assert.ok(
  lifecycle.indexOf('assertMvpTestDataProtection(testDataProtection') < lifecycle.lastIndexOf('prepareMvpTransactionCreationCommand({'),
  'test-data protection must be checked before the atomic creation command is prepared',
)
assert.match(edgeGuard, /testDataProtection\.isTestData/)
console.log('mvp-test-data-protection: passed')
