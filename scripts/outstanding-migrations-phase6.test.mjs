import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const [assuranceSql, migrationSql, report] = await Promise.all([
  readFile(new URL('../sql/outstanding-migrations-phase6-bond-assurance.sql', import.meta.url), 'utf8'),
  readFile(new URL('../supabase/migrations/202607050001_bond_grant_workflow_milestones.sql', import.meta.url), 'utf8'),
  readFile(new URL('../docs/outstanding-migrations-phase-6-bond-assurance.md', import.meta.url), 'utf8'),
])

assert.doesNotMatch(
  assuranceSql,
  /\b(insert\s+into|update\s+public\.|delete\s+from|alter\s+table|create\s+(table|function|policy)|drop\s+(table|function|policy)|grant\s|revoke\s)\b/i,
)

for (const column of [
  'grant_received',
  'grant_received_at',
  'grant_received_by',
  'grant_document_id',
  'grant_signed',
  'grant_signed_at',
  'grant_signed_by',
  'signed_grant_document_id',
  'grant_submitted',
  'grant_submitted_at',
  'grant_submitted_by',
]) {
  assert.match(assuranceSql, new RegExp(`['"]${column}['"]`))
  assert.match(migrationSql, new RegExp(`\\b${column}\\b`))
}

for (const contract of [
  'transaction_bond_instructions_grant_received_idx',
  'transaction_bond_instructions_grant_submitted_idx',
  'transaction_finance_workflows_stage_check',
  'transaction_finance_workflow_events_to_stage_check',
  'transaction_finance_workflow_events_from_stage_check',
  'transaction_finance_workflow_events_type_check',
]) {
  assert.match(assuranceSql, new RegExp(contract))
  assert.match(migrationSql, new RegExp(contract))
}

assert.match(assuranceSql, /signed_before_received/)
assert.match(assuranceSql, /submitted_before_signed/)
assert.match(assuranceSql, /schema_contract_complete/)
assert.match(assuranceSql, /202607050001/)

assert.match(report, /Schema contract complete \| Yes/)
assert.match(report, /Data integrity anomalies \| 0/)
assert.match(report, /6 focused application suites \| Passed/)
assert.match(report, /PHASE_6_BOND_ASSURANCE_COMPLETE/)

console.log('outstanding migrations Phase 6 bond-assurance tests passed')
