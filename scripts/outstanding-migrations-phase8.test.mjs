import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'

const [gateSql, guardSource, report] = await Promise.all([
  readFile(new URL('../sql/outstanding-migrations-phase8-closure-gate.sql', import.meta.url), 'utf8'),
  readFile(new URL('./supabase-phase0-guard.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../docs/outstanding-migrations-phase-8-closure.md', import.meta.url), 'utf8'),
])

assert.doesNotMatch(
  gateSql,
  /\b(insert\s+into|update\s+public\.|delete\s+from|alter\s+table|create\s+(table|function|policy)|drop\s+(table|function|policy)|grant\s|revoke\s)\b/i,
)
assert.match(gateSql, /expected_reconciled_history_count/)
assert.match(gateSql, /exact_reconciled_history_count/)
assert.match(gateSql, /closure_complete/)
assert.match(gateSql, /202607070001/)
assert.match(gateSql, /202607140018/)

const collisionVersions = [...guardSource.matchAll(/'202606\d{6}'/g)].map((match) => match[0])
assert.ok(collisionVersions.length >= 17, 'guard must retain the verified timestamp-collision baseline')
assert.match(guardSource, /Pure local-only migrations: 0/)
assert.match(guardSource, /Pure remote-only migrations: 0/)
assert.match(guardSource, /timestamp-prefix collisions/)

const guardResult = spawnSync(
  process.execPath,
  [new URL('./supabase-phase0-guard.mjs', import.meta.url).pathname, 'db', 'push', '--linked', '--dry-run'],
  { encoding: 'utf8', env: { ...process.env, BRIDGE_SUPABASE_PHASE0_OVERRIDE: '' } },
)
assert.equal(guardResult.status, 2)
assert.match(guardResult.stderr, /Blocked by Supabase migration safety guard/)
assert.match(guardResult.stderr, /reconciliation is complete in the raw ledger/i)

assert.match(report, /Pure local-only rows \| 0/)
assert.match(report, /Pure remote-only rows \| 0/)
assert.match(report, /Exact reconciled raw-ledger rows \| 19\/19/)
assert.match(report, /PHASE_8_MIGRATION_RECONCILIATION_CLOSED/)

console.log('outstanding migrations Phase 8 closure tests passed')
