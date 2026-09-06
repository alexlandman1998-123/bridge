import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./apply-attorney-propagation-batch-phase5.mjs', import.meta.url), 'utf8')
assert.match(source, /assertAttorneyStagingTarget/)
assert.match(source, /requireRecovery: apply/)
assert.match(source, /batchLimit < 1 \|\| batchLimit > 10/)
assert.match(source, /approvedBy \|\| !approvalReference/)
assert.match(source, /\.slice\(0, batchLimit\)/)
assert.match(source, /scripts\/reconcile-attorney-propagation-phase3\.mjs/)
assert.match(source, /repairedCount !== observedReduction/)
assert.match(source, /item\.afterGapCount !== 0/)
assert.match(source, /scripts\/classify-attorney-propagation-gaps-phase2\.mjs/)
assert.match(source, /mode: apply \? 'apply' : 'dry_run'/)
assert.doesNotMatch(source, /p_transaction_id: null/)
console.log('Attorney release Phase 5 controlled-batch contract passed.')
