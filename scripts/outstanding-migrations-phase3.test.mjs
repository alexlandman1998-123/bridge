import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const [fingerprintSql, report] = await Promise.all([
  readFile(new URL('../sql/outstanding-migrations-phase3-schema-fingerprint.sql', import.meta.url), 'utf8'),
  readFile(new URL('../docs/outstanding-migrations-phase-3-ledger-repair.md', import.meta.url), 'utf8'),
])

assert.doesNotMatch(fingerprintSql, /\b(insert\s+into|update\s+public\.|delete\s+from|alter\s+table|create\s+(table|function|policy)|drop\s+(table|function|policy)|grant\s|revoke\s)\b/i)
assert.match(fingerprintSql, /pg_get_functiondef/)
assert.match(fingerprintSql, /pg_get_constraintdef/)
assert.match(fingerprintSql, /information_schema\.columns/)

assert.match(report, /recorded the 17 Phase 2 `EXACTLY_LIVE` migrations/)
assert.match(report, /public-schema fingerprints were identical/)
assert.match(report, /Supabase CLI timestamp-collision limitation/)
assert.match(report, /Genuine local-only partial migrations: 2/)
assert.match(report, /PHASE_3_COMPLETE_WITH_TIMESTAMP_COLLISION_EVIDENCE/)

console.log('outstanding migrations Phase 3 ledger-repair tests passed')
