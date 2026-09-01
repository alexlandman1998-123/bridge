import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const transactionSource = readFileSync(new URL('../src/pages/AttorneyTransactionDetail.jsx', import.meta.url), 'utf8')
const tabBlock = transactionSource.match(/const archlineWorkspaceTabs = useMemo\(\(\) => \[([\s\S]*?)\], \[\]\)/)?.[1] || ''
assert.ok(tabBlock, 'the attorney workspace tab contract should exist')
assert.equal((tabBlock.match(/\{ id:/g) || []).length, 4, 'the transaction workspace should expose exactly four information areas')
assert.match(tabBlock, /label: 'Work'/)
assert.match(tabBlock, /label: 'Documents'/)
assert.match(tabBlock, /label: 'History'/)
assert.match(tabBlock, /label: 'Parties'/)
assert.doesNotMatch(tabBlock, /Overview|Tasks|Attorney Finance|Cancellation/)
assert.match(transactionSource, /role="tablist" aria-label="Legal workflow lane"/)
assert.match(transactionSource, /Bond registration/)
assert.match(transactionSource, /requiresCancellationWorkflow/)

const mattersSource = readFileSync(new URL('../src/pages/AttorneyMattersPage.jsx', import.meta.url), 'utf8')
assert.match(mattersSource, /Daily priority/)
assert.match(mattersSource, /overflow-x-auto/)
assert.match(mattersSource, /viewKey !== 'needs_attention'/)

console.log('Legal workspace consolidation UX Phase 4 checks passed.')
