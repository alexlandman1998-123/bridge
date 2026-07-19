import assert from 'node:assert/strict'
import fs from 'node:fs'

const migration = fs.readFileSync('../supabase/migrations/202607180046_mvp_atomic_transaction_creation_phase2a.sql', 'utf8')
const evidence = JSON.parse(
  fs.readFileSync('docs/audits/mvp-atomic-migration-creation-contract-2026-07-19.json', 'utf8'),
)

for (const column of evidence.createsOrDefines.transactionsColumns) {
  assert.match(migration, new RegExp(`add column if not exists ${column}\\b`))
}
assert.match(migration, /create unique index if not exists transactions_mvp_creation_idempotency_uidx/)
assert.match(migration, /create table if not exists public\.transaction_participant_requirements/)
assert.match(migration, /create or replace function public\.bridge_seed_mvp_transaction_participants/)
assert.match(migration, /create or replace function public\.bridge_seed_mvp_transaction_documents/)
assert.match(migration, /create or replace function public\.bridge_seed_mvp_transaction_workflow_lanes/)
assert.match(migration, /create or replace function public\.bridge_create_mvp_transaction\(p_payload jsonb\)/)
assert.match(migration, /grant execute on function public\.bridge_create_mvp_transaction\(jsonb\) to authenticated/)
assert.doesNotMatch(migration, /add column if not exists mandate_packet_id/)
assert.doesNotMatch(migration, /enable row level security[\s\S]*transaction_participant_requirements/)
assert.equal(evidence.decision, 'historical_contract_confirmed_but_incomplete_for_staging')

console.log('mvp-atomic-migration-creation-contract: passed')
