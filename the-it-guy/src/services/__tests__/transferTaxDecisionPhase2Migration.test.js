import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const migrationPath = path.resolve(
  process.cwd(),
  '../supabase/migrations/20260910080011_transfer_tax_decision_phase2_reconciliation.sql',
)

test('phase 2 tax reconciliation preserves operational workflow state', () => {
  const sql = fs.readFileSync(migrationPath, 'utf8')

  assert.match(sql, /update public\.transactions/i)
  assert.match(sql, /transferTaxDecision/)
  assert.match(sql, /needs_confirmation/)
  assert.match(sql, /legacySource/)
  assert.doesNotMatch(sql, /transaction_subprocesses/i)
  assert.doesNotMatch(sql, /transaction_workflow_stage_progress/i)
})

test('phase 2 migration maps known legacy values without entity-type inference', () => {
  const sql = fs.readFileSync(migrationPath, 'utf8')

  assert.match(sql, /when 'transfer_duty' then 'transfer_duty'/)
  assert.match(sql, /when 'vat' then 'vat'/)
  assert.match(sql, /zero_rated_going_concern/)
  assert.doesNotMatch(sql, /seller_type/i)
  assert.doesNotMatch(sql, /buyer_entity_type/i)
})
