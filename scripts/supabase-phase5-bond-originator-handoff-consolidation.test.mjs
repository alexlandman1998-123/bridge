import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const migration = await readFile(
  new URL('../supabase/migrations/20260827160000_canonical_bond_originator_handoff_repair.sql', import.meta.url),
  'utf8',
)

assert.match(migration, /^begin;/)
assert.match(migration, /Phase 5 canonical bond-originator handoff repair/)
assert.match(migration, /canonical_bond_originator_handoff_repair/)
assert.match(migration, /20260827133506_repair_missing_roleplayer_bond_handoffs\.sql/)
assert.match(migration, /20260827133739_repair_missing_roleplayer_bond_handoffs_execution\.sql/)
assert.match(migration, /insert into public\.transaction_finance_workflows/)
assert.match(migration, /insert into public\.transaction_bond_applications/)
assert.match(migration, /application_scope as \(/)
assert.match(migration, /update public\.transactions t/)
assert.match(migration, /bond_assignment_source = coalesce\(t\.bond_assignment_source, 'canonical_bond_originator_handoff_repair'\)/)
assert.match(migration, /jsonb_build_array\(\s*'20260827133506_repair_missing_roleplayer_bond_handoffs\.sql'/)
assert.match(migration, /'20260827133739_repair_missing_roleplayer_bond_handoffs_execution\.sql'/)
assert.match(migration, /commit;\s*$/)

console.log('Bond-originator handoff consolidation migration contract passed.')
