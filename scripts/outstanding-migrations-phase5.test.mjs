import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const [gateSql, report] = await Promise.all([
  readFile(new URL('../sql/outstanding-migrations-phase5-completion-gate.sql', import.meta.url), 'utf8'),
  readFile(new URL('../docs/outstanding-migrations-phase-5-partial-completion.md', import.meta.url), 'utf8'),
])

assert.doesNotMatch(gateSql, /\b(insert\s+into|update\s+public\.|delete\s+from|alter\s+table|create\s+(table|function|policy)|drop\s+(table|function|policy)|grant\s|revoke\s)\b/i)
assert.match(gateSql, /supabase_migrations\.schema_migrations/)
assert.match(gateSql, /resolved_history_complete/)
assert.match(gateSql, /security_migration_isolated/)
assert.match(gateSql, /202607070001/)

assert.match(report, /Expected resolved history rows \| 18/)
assert.match(report, /Non-security partial migrations \| 0/)
assert.match(report, /17 split-display rows/)
assert.match(report, /PHASE_5_COMPLETE_NO_NON_SECURITY_PARTIALS/)

console.log('outstanding migrations Phase 5 completion-gate tests passed')
