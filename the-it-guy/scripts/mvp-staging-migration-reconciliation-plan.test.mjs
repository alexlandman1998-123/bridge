import assert from 'node:assert/strict'
import fs from 'node:fs'

const plan = JSON.parse(
  fs.readFileSync('docs/audits/mvp-staging-migration-reconciliation-plan-2026-07-19.json', 'utf8'),
)

assert.equal(plan.sourceBaseline.highestRepositoryMigrationVersion, '20260719130913')
assert.equal(plan.sourceBaseline.historicalMissingMigrationCount, 63)
assert.equal(plan.decision, 'append_only_reconciliation_required')
assert.equal(plan.reconciliationTarget.function, 'public.bridge_create_mvp_transaction(p_payload jsonb)')
assert.ok(plan.governingRules.some((rule) => rule.includes("Do not write directly to Supabase's migration ledger")))
assert.ok(plan.requiredPreflightBeforeAuthoring.some((step) => step.includes('transaction_participants(transaction_id, role_type, legal_role)')))
assert.ok(plan.authoringSequence.some((step) => step.includes('leave 202607180046 untouched')))
assert.match(plan.recoveryRule, /new forward correction migration/)

console.log('mvp-staging-migration-reconciliation-plan: passed')
