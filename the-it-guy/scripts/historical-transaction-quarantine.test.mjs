import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  __seedTransactionQuarantineTestUtils as utils,
  runSeedTransactionQuarantine,
} from './quarantine-seed-transactions.mjs'
import { HISTORICAL_TRANSACTION_CLASSIFIER_VERSION } from './lib/historicalTransactionClassifier.mjs'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const migrationPath = path.resolve(scriptDirectory, '../../supabase/migrations/20260831151015_quarantine_seed_transactions.sql')
const sql = fs.readFileSync(migrationPath, 'utf8')
const lifecycleGuardMigrationPath = path.resolve(scriptDirectory, '../../supabase/migrations/20260831151112_quarantine_seed_transactions_lifecycle_guard_fix.sql')
const lifecycleGuardSql = fs.readFileSync(lifecycleGuardMigrationPath, 'utf8')

assert.match(sql, /create table if not exists public\.transaction_quarantine_batches/i)
assert.match(sql, /create table if not exists public\.transaction_quarantine_records/i)
assert.match(sql, /alter table public\.transaction_quarantine_batches enable row level security/i)
assert.match(sql, /revoke all on table public\.transaction_quarantine_records from public, anon, authenticated/i)
assert.match(sql, /security invoker/i)
assert.match(sql, /grant execute on function public\.bridge_quarantine_seed_transactions[\s\S]*to service_role/i)
assert.match(sql, /row_data ->> 'classification' <> 'seed'/i)
assert.match(sql, /row_data ->> 'confidence' <> 'high'/i)
assert.match(sql, /\) >= 2/i)
assert.match(sql, /for update/i)
assert.match(sql, /set is_active = false,[\s\S]*is_demo_data = true,[\s\S]*lifecycle_state = 'archived'/i)
assert.match(sql, /update public\.client_portal_links[\s\S]*set is_active = false/i)
assert.match(sql, /update public\.client_portal_contexts[\s\S]*set status = 'revoked'/i)
assert.match(sql, /update public\.transaction_role_players[\s\S]*assignment_status = 'removed'/i)
assert.match(sql, /create or replace function public\.bridge_restore_quarantined_seed_transactions/i)
assert.doesNotMatch(sql, /\bdelete\s+from\b/i)
assert.doesNotMatch(sql, /\btruncate\b/i)
assert.match(lifecycleGuardSql, /new\.quarantine_batch_id is not null/i)
assert.match(lifecycleGuardSql, /batch\.status = 'processing'/i)
assert.match(lifecycleGuardSql, /bridge_is_transaction_closeout_state/i)
assert.doesNotMatch(lifecycleGuardSql, /\bdelete\s+from\b/i)

const baseRow = {
  transactionId: '10000000-0000-4000-8000-000000000001',
  classification: 'seed',
  confidence: 'high',
  proposedAction: 'quarantine_then_review_delete',
  issues: [{ code: 'missing_canonical_attorney_assignment' }],
  evidence: { seed: [{ code: 'buyer_nonproduction_email' }], real: [] },
  scope: { active: true },
}
const report = {
  classifierVersion: HISTORICAL_TRANSACTION_CLASSIFIER_VERSION,
  environment: 'production',
  mode: 'read_only',
  mutatedData: false,
  summary: { classification: { seed: 1, real: 0, ambiguous: 0 } },
  rows: [baseRow],
}

assert.equal(utils.validateReport(report), report)
assert.equal(utils.digestReport(report).length, 64)
assert.throws(
  () => utils.validateReport({ ...report, rows: [{ ...baseRow, classification: 'real' }] }),
  /only high-confidence seed/i,
)
assert.throws(() => utils.parseArgs(['--hard-delete']), /reversible soft operation/i)
assert.throws(
  () => utils.guardProduction({ VITE_SUPABASE_URL: 'https://wrong.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'secret' }),
  /canonical production/i,
)
assert.throws(
  () => utils.validateApplyConfirmation({ apply: true, confirmCount: 2, reason: 'Historical seed quarantine', operator: 'test' }, 1),
  /exactly match/i,
)

const calls = []
const mockClient = {
  from(table) {
    assert.equal(table, 'transactions')
    return {
      select() { return this },
      async in(_column, ids) {
        return {
          data: ids.map((id) => ({ id, is_active: true, is_demo_data: false, quarantined_at: null, quarantine_batch_id: null })),
          error: null,
        }
      },
    }
  },
  async rpc(name, params) {
    calls.push({ name, params })
    return { data: { batchId: 'batch-1', status: 'completed', quarantinedCount: 1 }, error: null }
  },
}

const dryRun = await runSeedTransactionQuarantine({
  client: mockClient,
  report,
  args: { apply: false },
})
assert.equal(dryRun.mode, 'dry_run')
assert.equal(dryRun.mutatedData, false)
assert.equal(dryRun.preflight.currentlyActiveCount, 1)
assert.equal(calls.length, 0)

const applied = await runSeedTransactionQuarantine({
  client: mockClient,
  report,
  args: {
    apply: true,
    confirmCount: 1,
    reason: 'Quarantine classified historical seed data',
    operator: 'test-change',
  },
})
assert.equal(applied.mode, 'apply')
assert.equal(applied.result.quarantinedCount, 1)
assert.equal(calls.length, 1)
assert.equal(calls[0].name, 'bridge_quarantine_seed_transactions')
assert.equal(calls[0].params.p_expected_count, 1)
assert.equal(calls[0].params.p_classification_rows[0].classification, 'seed')

console.log('historical transaction quarantine tests passed')
