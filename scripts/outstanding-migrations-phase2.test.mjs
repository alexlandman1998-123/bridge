import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const [sql, report] = await Promise.all([
  readFile(new URL('../sql/outstanding-migrations-phase2-contract-checks.sql', import.meta.url), 'utf8'),
  readFile(new URL('../docs/outstanding-migrations-phase-2-contract-audit.md', import.meta.url), 'utf8'),
])

assert.doesNotMatch(sql, /\b(insert\s+into|update\s+public\.|delete\s+from|alter\s+table|create\s+(table|function|policy)|drop\s+(table|function|policy)|grant\s|revoke\s)\b/i)
assert.match(sql, /information_schema\.columns/)
assert.match(sql, /pg_policies/)
assert.match(sql, /information_schema\.role_table_grants/)
assert.match(sql, /bridge_commercial_can_access_record\(uuid,uuid,uuid,uuid,uuid\)/)

assert.match(report, /\| `EXACTLY_LIVE` \| 17 \|/)
assert.match(report, /\| `PARTIALLY_LIVE` \| 2 \|/)
assert.match(report, /private_listings_support_role_select/)
assert.match(report, /Anonymous table grants: 322/)
assert.match(report, /PHASE_2_COMPLETE_RECOVERY_BLOCKED/)

console.log('outstanding migrations Phase 2 contract-audit tests passed')
