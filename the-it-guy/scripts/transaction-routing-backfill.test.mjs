import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { resolveTransactionRoutingProfile } from '../src/services/transactionRoutingProfileService.js'
import {
  buildTransactionRoutingAudit,
  buildTransactionRoutingBackfillPlan,
  summarizeTransactionRoutingAudit,
} from '../src/services/transactionRoutingGovernanceService.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function assertIncludes(values, expected, message) {
  assert.equal(values.includes(expected), true, message)
}

const completeTransaction = {
  id: 'complete-missing-profile',
  finance_type: 'bond',
  transaction_type: 'private_sale',
  property_type: 'sectional title apartment',
  property_tenure: 'sectional_title',
  purchaser_type: 'company',
  seller_type: 'individual',
  seller_has_existing_bond: false,
  cancellation_required: false,
  vat_treatment: 'transfer_duty',
}

const readyProfile = resolveTransactionRoutingProfile({ transaction: completeTransaction })
const readyTransaction = {
  ...completeTransaction,
  id: 'ready-profile',
  routing_profile_json: readyProfile,
}

const staleTransaction = {
  ...completeTransaction,
  id: 'stale-profile',
  routing_profile_json: {
    ...readyProfile,
    version: 'old_profile_version',
    financeType: 'cash',
    requiredWorkflowKeys: ['sales_otp', 'finance_cash', 'attorney_transfer', 'registration'],
  },
}

const missingFactsTransaction = {
  id: 'missing-facts',
  property_type: 'house',
}

{
  const audit = buildTransactionRoutingAudit([
    completeTransaction,
    readyTransaction,
    staleTransaction,
    missingFactsTransaction,
  ])

  assert.equal(audit.summary.total, 4)
  assert.equal(audit.summary.ready, 1)
  assert.equal(audit.summary.needs_backfill, 2)
  assert.equal(audit.summary.needs_facts, 1)
  assert.equal(audit.summary.backfillable, 2)
  assertIncludes(
    audit.items.find((item) => item.transactionId === 'complete-missing-profile').reasonCodes,
    'missing_profile',
    'Missing profile should be detected.',
  )
  assertIncludes(
    audit.items.find((item) => item.transactionId === 'stale-profile').reasonCodes,
    'version_mismatch',
    'Stale profile version should be detected.',
  )
  assertIncludes(
    audit.items.find((item) => item.transactionId === 'stale-profile').reasonCodes,
    'profile_drift',
    'Stale profile content should be detected.',
  )
  assertIncludes(
    audit.items.find((item) => item.transactionId === 'missing-facts').reasonCodes,
    'missing_facts',
    'Incomplete transactions should require facts before backfill.',
  )
  assert.match(summarizeTransactionRoutingAudit(audit), /4 transactions checked/)
}

{
  const plan = buildTransactionRoutingBackfillPlan([
    completeTransaction,
    readyTransaction,
    staleTransaction,
    missingFactsTransaction,
  ])

  assert.equal(plan.dryRun, true)
  assert.equal(plan.summary.plannedUpdates, 2)
  assert.equal(plan.summary.destructiveOperations, 0)
  assert.equal(plan.operations.some((operation) => operation.transactionId === 'missing-facts'), false)
  assert.equal(plan.operations.every((operation) => operation.updatePayload.routing_profile_json), true)
}

{
  const apiSource = fs.readFileSync(path.join(root, 'src/lib/api.js'), 'utf8')
  assert.match(apiSource, /export async function runTransactionRoutingProfileBackfill/, 'API should expose the Phase 6 routing backfill runner.')
  assert.match(apiSource, /dryRun = true/, 'Routing backfill should default to dry-run.')
  assert.match(apiSource, /eventType: 'RoutingProfileBackfilled'/, 'Routing backfill should audit applied updates.')
  assert.match(apiSource, /reasonCode: 'routing_profile_backfilled'/, 'Routing backfill should trigger workflow recompute.')
}

{
  const packageSource = fs.readFileSync(path.join(root, 'package.json'), 'utf8')
  assert.match(
    packageSource,
    /"test:transaction-routing-backfill": "node scripts\/transaction-routing-backfill\.test\.mjs"/,
    'Package scripts should expose the Phase 6 routing backfill guard.',
  )
}

console.log('transaction-routing-backfill tests passed')
