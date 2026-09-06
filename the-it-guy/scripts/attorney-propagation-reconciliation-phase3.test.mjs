import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./reconcile-attorney-propagation-phase3.mjs', import.meta.url), 'utf8')
assert.match(source, /assertAttorneyStagingTarget/)
assert.match(source, /requireRecovery: apply/)
assert.match(source, /process\.argv\.includes\('--apply'\)/)
assert.match(source, /batchLimit < 1 \|\| batchLimit > 10/)
assert.match(source, /manifestFingerprint.*calculatedFingerprint/)
assert.match(source, /approvedRecordKeys/)
assert.match(source, /p_transaction_id: target\.transaction\.id/)
assert.doesNotMatch(source, /bridge_reconcile_transaction_progress_phase6'[\s\S]{0,250}p_transaction_id: null/)
assert.match(source, /clientVisibleMutationAllowed: false/)
assert.match(source, /rawTransactionIdsIncluded: false/)
assert.match(source, /Propagation health changed after classification/)
assert.match(source, /mode: apply \? 'apply' : 'dry_run'/)
assert.match(source, /A raw UUID reached the reconciliation receipt/)
console.log('Attorney propagation Phase 3 guarded reconciliation contract passed.')
