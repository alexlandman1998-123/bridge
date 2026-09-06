import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./verify-attorney-demo-reconciliation-phase4.mjs', import.meta.url), 'utf8')
assert.match(source, /assertAttorneyStagingTarget/)
assert.match(source, /requireRecovery: verifyIdempotency/)
assert.match(source, /receiptFingerprint !== calculatedReceiptFingerprint/)
assert.match(source, /receipt\.beforeGlobal\?\.gapCount - receipt\.afterGlobal\?\.gapCount !== 14/)
assert.match(source, /At least one canonical fixture still has a propagation gap/)
assert.match(source, /visibility !== 'professional_shared'/)
assert.match(source, /signInWithPassword/)
assert.match(source, /p_transaction_id: transactionId/)
assert.match(source, /item\.repaired !== 0 \|\| item\.remainingGapCount !== 0/)
assert.match(source, /rawTransactionIdsIncluded: false/)
console.log('Attorney release Phase 4 demo reconciliation verification contract passed.')
