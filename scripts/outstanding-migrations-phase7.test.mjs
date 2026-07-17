import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const [gateSql, historicalMigration, successorMigration, report] = await Promise.all([
  readFile(new URL('../sql/outstanding-migrations-phase7-security-gate.sql', import.meta.url), 'utf8'),
  readFile(new URL('../supabase/migrations/202607070001_drop_demo_all_rls_grants.sql', import.meta.url), 'utf8'),
  readFile(new URL('../supabase/migrations/202607140018_legacy_demo_rls_scoped_replacement.sql', import.meta.url), 'utf8'),
  readFile(new URL('../docs/outstanding-migrations-phase-7-security-reconciliation.md', import.meta.url), 'utf8'),
])

assert.doesNotMatch(
  gateSql,
  /\b(insert\s+into|update\s+public\.|delete\s+from|alter\s+table|create\s+(table|function|policy)|drop\s+(table|function|policy)|grant\s|revoke\s)\b/i,
)

assert.match(gateSql, /relrowsecurity/)
assert.match(gateSql, /tables_without_policies/)
assert.match(gateSql, /expected_successor_policies/)
assert.match(gateSql, /exact_count = 28/)
assert.match(gateSql, /unrestricted_policy_count/)
assert.match(gateSql, /safe_to_reconcile_history/)
assert.match(gateSql, /202607070001/)
assert.match(gateSql, /202607140018/)

assert.match(historicalMigration, /revoke all privileges on table public\.%I from anon/i)
assert.match(historicalMigration, /revoke insert, update, delete, truncate/i)
assert.match(successorMigration, /deliberately preserves table grants/i)
assert.match(successorMigration, /requires both grants and RLS/i)
assert.match(successorMigration, /legacy_demo_rls_scoped_replacement|Replace legacy demo-wide RLS policies/i)

assert.match(report, /Live legacy tables \| 47\/47/)
assert.match(report, /Scoped successor policies \| 28\/28/)
assert.match(report, /Schema fingerprints changed \| No/)
assert.match(report, /Ledger repair \| Applied/)
assert.match(report, /PHASE_7_SECURITY_RECONCILIATION_COMPLETE/)

console.log('outstanding migrations Phase 7 security-reconciliation tests passed')
