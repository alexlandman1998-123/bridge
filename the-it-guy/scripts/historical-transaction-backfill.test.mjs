import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  __genuineTransactionBackfillTestUtils as utils,
  runGenuineTransactionBackfill,
} from './backfill-genuine-transactions.mjs'
import { HISTORICAL_TRANSACTION_CLASSIFIER_VERSION } from './lib/historicalTransactionClassifier.mjs'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const migrationPath = path.resolve(scriptDirectory, '../../supabase/migrations/20260831152147_backfill_genuine_transaction_handovers.sql')
const sql = fs.readFileSync(migrationPath, 'utf8')

assert.match(sql, /create table if not exists public\.transaction_handover_backfill_batches/i)
assert.match(sql, /create table if not exists public\.transaction_handover_backfill_records/i)
assert.match(sql, /enable row level security/i)
assert.match(sql, /revoke all on table public\.transaction_handover_backfill_records from public, anon, authenticated/i)
assert.match(sql, /security invoker/i)
assert.match(sql, /row_data ->> 'classification' <> 'real'/i)
assert.match(sql, /row_data ->> 'proposedAction' <> 'backfill_canonical_handover'/i)
assert.match(sql, /transaction_row\.quarantined_at is null/i)
assert.match(sql, /\) >= 2/i)
assert.match(sql, /for update/i)
assert.match(sql, /count\(distinct firm\.id\)[\s\S]*<> 1/i)
assert.match(sql, /competing active handover roleplayers require manual review/i)
assert.match(sql, /insert into public\.transaction_attorney_assignments/i)
assert.match(sql, /insert into public\.transaction_bond_applications/i)
assert.match(sql, /insert into public\.transaction_finance_workflows/i)
assert.match(sql, /'historical_genuine_backfill'/i)
assert.match(sql, /grant execute on function public\.bridge_backfill_genuine_transaction_handovers[\s\S]*to service_role/i)
assert.doesNotMatch(sql, /\bdelete\s+from\b/i)
assert.doesNotMatch(sql, /\btruncate\b/i)

const realRow = {
  transactionId: '20000000-0000-4000-8000-000000000001',
  classification: 'real',
  confidence: 'high',
  proposedAction: 'backfill_canonical_handover',
  issues: [{ code: 'missing_canonical_attorney_assignment', roleTypes: ['transfer_attorney'] }],
  evidence: { seed: [], real: [{ code: 'linked_live_organisation' }, { code: 'authenticated_creator_present' }] },
  scope: { active: true },
}
const report = {
  classifierVersion: HISTORICAL_TRANSACTION_CLASSIFIER_VERSION,
  environment: 'production',
  mode: 'read_only',
  mutatedData: false,
  summary: { classification: { real: 1, seed: 0, ambiguous: 0 } },
  rows: [realRow],
}

assert.equal(utils.validateReport(report), report)
assert.equal(utils.digestReport(report).length, 64)
assert.throws(
  () => utils.validateReport({ ...report, rows: [{ ...realRow, classification: 'seed' }] }),
  /only medium\/high-confidence real/i,
)
assert.throws(
  () => utils.guardProduction({ VITE_SUPABASE_URL: 'https://wrong.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'secret' }),
  /canonical production/i,
)
assert.throws(
  () => utils.validateApplyConfirmation({ apply: true, confirmCount: 2, reason: 'Backfill genuine handovers', operator: 'test' }, 1),
  /exactly match/i,
)

const calls = []
const mockClient = {
  from(table) {
    return {
      select() { return this },
      async in(_column, ids) {
        if (table === 'transactions') {
          return { data: ids.map((id) => ({ id, is_active: true, is_demo_data: false, quarantined_at: null, quarantine_batch_id: null })), error: null }
        }
        return { data: [], error: null }
      },
    }
  },
  async rpc(name, params) {
    calls.push({ name, params })
    return {
      data: {
        batchId: 'batch-2',
        status: 'completed',
        backfilledCount: 1,
        attorneyAssignmentCount: 1,
        bondApplicationCount: 0,
      },
      error: null,
    }
  },
}

const dryRun = await runGenuineTransactionBackfill({ client: mockClient, report, args: { apply: false } })
assert.equal(dryRun.mode, 'dry_run')
assert.equal(dryRun.preflight.classifiedCount, 1)
assert.equal(calls.length, 0)

const applied = await runGenuineTransactionBackfill({
  client: mockClient,
  report,
  args: {
    apply: true,
    confirmCount: 1,
    reason: 'Backfill independently verified genuine transaction handovers',
    operator: 'test-change',
  },
})
assert.equal(applied.mode, 'apply')
assert.equal(applied.result.attorneyAssignmentCount, 1)
assert.equal(calls.length, 1)
assert.equal(calls[0].name, 'bridge_backfill_genuine_transaction_handovers')
assert.equal(calls[0].params.p_classification_rows[0].classification, 'real')

const emptyReport = {
  ...report,
  summary: { classification: { real: 0, seed: 0, ambiguous: 0 } },
  rows: [],
}
const noOp = await runGenuineTransactionBackfill({ client: mockClient, report: emptyReport, args: { apply: true } })
assert.equal(noOp.mode, 'no_op')
assert.equal(noOp.mutatedData, false)
assert.equal(calls.length, 1)

console.log('historical transaction backfill tests passed')
