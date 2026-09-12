import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const service = readFileSync(new URL('../src/services/attorneyWorkflow/attorneyWorkflowLaneService.js', import.meta.url), 'utf8')
const page = readFileSync(new URL('../src/pages/AttorneyTransactionDetail.jsx', import.meta.url), 'utf8')

assert.match(service, /POST_COMMIT_OPERATIONS_READ_TIMEOUT_MS\s*=\s*3500/)
assert.match(service, /readOperationsWithinBudget\(/)
assert.match(service, /void dispatchCommittedProgressNotifications\(client, normalizedTransactionId\)\.catch\(\(\) => \{\}\)/)
assert.match(service, /const operations = await readOperationsWithinBudget\(/)

const submitStart = page.indexOf('async function submitWorkflowStepUpdate')
const submitEnd = page.indexOf('async function handleQuickWorkflowStepUpdate', submitStart)
const submit = page.slice(submitStart, submitEnd)
assert.match(submit, /void refreshWorkflowAfterChange\(next\)\.catch/)
assert.doesNotMatch(submit, /await refreshWorkflowAfterChange\(next\)/)
assert.match(submit, /Task saved\. The workspace could not refresh yet/)

console.log('Attorney post-commit action reliability contract passed')
