import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const appCss = readFileSync(new URL('../src/App.css', import.meta.url), 'utf8')
const attorneyDetailSource = readFileSync(new URL('../src/pages/AttorneyTransactionDetail.jsx', import.meta.url), 'utf8')
const packageSource = readFileSync(new URL('../package.json', import.meta.url), 'utf8')

const start = attorneyDetailSource.indexOf('function ArchlineWorkflowWorkspace')
const end = attorneyDetailSource.indexOf('function ArchlineTransferWorkspace')
assert.ok(start > -1 && end > start, 'ArchlineWorkflowWorkspace source block should be found')
const workflowSource = attorneyDetailSource.slice(start, end)

assert.match(workflowSource, /archline-workflow-workspace/)
assert.match(workflowSource, /flex flex-wrap items-start justify-between gap-3 py-2 text-sm/)
assert.match(workflowSource, /min-w-0 lg:min-w-\[180px\]/)
assert.match(workflowSource, /flex flex-wrap items-start justify-between gap-3/)
assert.match(workflowSource, /min-h-10 min-w-0 flex-1/)
assert.match(workflowSource, /flex flex-col gap-3 py-3 sm:flex-row/)
assert.match(workflowSource, /mt-2 grid gap-2 sm:grid-cols-2/)
assert.match(workflowSource, /min-h-10 rounded-lg border px-3 py-2/)
assert.doesNotMatch(workflowSource, /className="h-10/)
assert.doesNotMatch(workflowSource, /block truncate text-sm font-semibold text-slate-950">\{doc\.displayName/)
assert.match(appCss, /\.conveyancing-workspace-fit \.archline-workflow-workspace/)
assert.match(appCss, /min-width: 720px/)
assert.match(packageSource, /test:conveyancing-workspace-overflow-phase5/)

console.log('conveyancing workspace UI overflow phase 5 contract passed')
