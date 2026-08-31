import assert from 'node:assert/strict'
import {
  classifyHistoricalTransaction,
  findHistoricalHandoverIssues,
  summarizeHistoricalClassifications,
} from './lib/historicalTransactionClassifier.mjs'
import { __historicalTransactionClassificationRunnerTestUtils as runnerUtils } from './classify-historical-transaction-records.mjs'

const attorneyRoleplayer = {
  role_type: 'transfer_attorney',
  status: 'selected',
  assignment_status: 'selected',
  selection_source: 'preferred_partner',
}
const bondRoleplayer = {
  role_type: 'bond_originator',
  status: 'active',
  assignment_status: 'active',
  selection_source: 'preferred_partner',
}

const seed = classifyHistoricalTransaction({
  transaction: {
    id: 'seed-transaction',
    is_active: true,
    is_demo_data: false,
    finance_type: 'bond',
    organisation_id: 'organisation-1',
    buyer_id: 'buyer-1',
    created_at: '2026-04-08T10:00:00.000Z',
  },
  buyer: { id: 'buyer-1', email: 'buyer@demo.bridgefinance.co.za', is_demo_data: false },
  organisation: { id: 'organisation-1', name: 'OOBA', status: 'active', is_demo_data: false },
  rolePlayers: [attorneyRoleplayer, bondRoleplayer],
})
assert.equal(seed.classification, 'seed')
assert.equal(seed.proposedAction, 'quarantine_then_review_delete')
assert.equal(seed.issues.length, 2)
assert.ok(seed.evidence.seed.some((item) => item.code === 'buyer_nonproduction_email'))

const real = classifyHistoricalTransaction({
  transaction: {
    id: 'real-transaction',
    is_active: true,
    finance_type: 'cash',
    organisation_id: 'organisation-2',
    buyer_id: 'buyer-2',
    created_by: 'user-2',
    transaction_origin_source: 'developer',
  },
  buyer: { id: 'buyer-2', email: 'buyer@gmail.com', is_demo_data: false },
  organisation: { id: 'organisation-2', name: 'Live Developer', status: 'active', is_demo_data: false },
  rolePlayers: [attorneyRoleplayer],
})
assert.equal(real.classification, 'real')
assert.equal(real.proposedAction, 'backfill_canonical_handover')
assert.equal(real.confidence, 'high')

const ambiguous = classifyHistoricalTransaction({
  transaction: { id: 'ambiguous-transaction', is_active: true, finance_type: 'cash' },
  rolePlayers: [attorneyRoleplayer],
})
assert.equal(ambiguous.classification, 'ambiguous')
assert.equal(ambiguous.proposedAction, 'manual_review_no_change')

const explicitlyDemo = classifyHistoricalTransaction({
  transaction: { id: 'explicit-demo', is_active: true, is_demo_data: true, finance_type: 'cash' },
  organisation: { id: 'live-org', status: 'active', is_demo_data: false },
  buyer: { id: 'buyer', email: 'buyer@gmail.com', is_demo_data: false },
  rolePlayers: [attorneyRoleplayer],
})
assert.equal(explicitlyDemo.classification, 'seed')
assert.equal(explicitlyDemo.confidence, 'high')

assert.deepEqual(
  findHistoricalHandoverIssues({
    transaction: { finance_type: 'bond' },
    rolePlayers: [attorneyRoleplayer, bondRoleplayer],
    attorneyAssignments: [{ status: 'pending' }],
    bondApplications: [{ assignment_status: 'consultant_assigned' }],
  }),
  [],
)

const summary = summarizeHistoricalClassifications([seed, real, ambiguous, explicitlyDemo])
assert.deepEqual(summary.classification, { real: 1, seed: 2, ambiguous: 1 })
assert.equal(summary.issueCounts.missing_canonical_attorney_assignment, 4)
assert.equal(summary.issueCounts.missing_canonical_bond_application, 1)

assert.throws(() => runnerUtils.parseArgs(['--write']), /permanently read-only/i)
assert.throws(
  () => runnerUtils.guardProductionReadOnly(
    { VITE_SUPABASE_URL: 'https://vaszuxjeoajeuhlcnzzf.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'secret' },
    { confirmProductionReadOnly: true },
  ),
  /canonical production/i,
)
assert.throws(
  () => runnerUtils.guardProductionReadOnly(
    { VITE_SUPABASE_URL: 'https://isdowlnollckzvltkasn.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'secret' },
    { confirmProductionReadOnly: false },
  ),
  /confirm-production-read-only/i,
)

console.log('historical transaction classifier tests passed')
