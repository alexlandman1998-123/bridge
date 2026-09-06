import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const classifier = readFileSync(new URL('./classify-attorney-propagation-gaps-phase2.mjs', import.meta.url), 'utf8')
assert.match(classifier, /assertAttorneyStagingTarget/)
assert.match(classifier, /bridge_transaction_progress_propagation_health_phase6/)
assert.match(classifier, /matchesRpcGapCount/)
assert.match(classifier, /demo_automatic_candidate/)
assert.match(classifier, /allowlisted_automatic_candidate/)
assert.match(classifier, /manual_review/)
assert.match(classifier, /rawTransactionIdsIncluded: false/)
assert.match(classifier, /createHash\('sha256'\)/)
assert.match(classifier, /Privacy check failed: a raw UUID/)
assert.doesNotMatch(classifier, /\.from\([^)]*\)\.(insert|update|upsert|delete)/)
assert.doesNotMatch(classifier, /console\.log\(serviceKey\)/)
console.log('Attorney propagation Phase 2 read-only classification contract passed.')
