import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const stagingPlan = await readFile(
  new URL('../docs/migration-review/20260827-phase6-bond-originator-handoff-staging.md', import.meta.url),
  'utf8',
)
const evidence = await readFile(
  new URL('../docs/staging-evidence/20260827160000-bond_finance_runtime.json', import.meta.url),
  'utf8',
)
const migration = await readFile(
  new URL('../supabase/migrations/20260827160000_canonical_bond_originator_handoff_repair.sql', import.meta.url),
  'utf8',
)

assert.match(stagingPlan, /STAGING_READY_PENDING_EVIDENCE/)
assert.match(stagingPlan, /20260827160000_canonical_bond_originator_handoff_repair\.sql/)
assert.match(stagingPlan, /apply_original_after_dependency_check/)
assert.match(stagingPlan, /Verify `transaction_finance_workflows` receives the expected bond-hybrid workflow rows\./)

assert.doesNotThrow(() => JSON.parse(evidence))
assert.match(evidence, /"version": "20260827160000"/)
assert.match(evidence, /"sqlApplied": true/)
assert.match(evidence, /"stagingLedgerRecorded": false/)
assert.match(evidence, /--apply-sql --version 20260827160000/)

assert.match(migration, /canonical_bond_originator_handoff_repair/)
assert.match(migration, /Bond originator intake created from canonical handoff repair/)

console.log('Bond-originator handoff phase 6 staging artifacts passed.')
