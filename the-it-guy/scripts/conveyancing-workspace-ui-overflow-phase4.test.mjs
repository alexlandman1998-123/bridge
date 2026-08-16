import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const appCss = readFileSync(new URL('../src/App.css', import.meta.url), 'utf8')
const attorneyDetailSource = readFileSync(new URL('../src/pages/AttorneyTransactionDetail.jsx', import.meta.url), 'utf8')
const packageSource = readFileSync(new URL('../package.json', import.meta.url), 'utf8')

const start = attorneyDetailSource.indexOf('function ArchlineTransferWorkspace')
const end = attorneyDetailSource.indexOf('const ATTORNEY_DOCUMENT_DASHBOARD_CATEGORY_DEFINITIONS')
assert.ok(start > -1 && end > start, 'ArchlineTransferWorkspace source block should be found')
const transferSource = attorneyDetailSource.slice(start, end)

assert.match(transferSource, /archline-transfer-workspace/)
assert.match(transferSource, /flex flex-wrap items-start justify-between/)
assert.match(transferSource, /min-h-10 pl-9 text-sm/)
assert.match(transferSource, /flex w-full flex-col items-start gap-3/)
assert.match(transferSource, /w-full shrink-0 text-left sm:w-16/)
assert.match(transferSource, /flex flex-wrap items-start justify-between gap-2/)
assert.match(transferSource, /grid min-w-0 gap-2 sm:grid-cols-3/)
assert.match(transferSource, /flex flex-col gap-3 px-4 py-3 sm:flex-row/)
assert.match(transferSource, /className="min-w-0"/)
assert.match(transferSource, /min-h-10 rounded-lg border/)
assert.doesNotMatch(transferSource, /block truncate text-sm font-semibold text-slate-950">\{item\.label\}/)
assert.doesNotMatch(transferSource, /className="h-10/)
assert.match(appCss, /\.conveyancing-workspace-fit \.archline-transfer-workspace/)
assert.match(appCss, /max-height: none/)
assert.match(packageSource, /test:conveyancing-workspace-overflow-phase4/)

console.log('conveyancing workspace UI overflow phase 4 contract passed')
