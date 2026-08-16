import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const appCss = readFileSync(new URL('../src/App.css', import.meta.url), 'utf8')
const attorneyDetailSource = readFileSync(new URL('../src/pages/AttorneyTransactionDetail.jsx', import.meta.url), 'utf8')
const packageSource = readFileSync(new URL('../package.json', import.meta.url), 'utf8')

const start = attorneyDetailSource.indexOf('function ArchlineDocumentsWorkspace')
const end = attorneyDetailSource.indexOf('function ArchlineTasksWorkspace')
assert.ok(start > -1 && end > start, 'ArchlineDocumentsWorkspace source block should be found')
const documentsSource = attorneyDetailSource.slice(start, end)

assert.match(documentsSource, /archline-documents-workspace/)
assert.match(documentsSource, /min-w-0 justify-center whitespace-normal/)
assert.match(documentsSource, /block text-sm font-semibold leading-5 text-slate-950">\{category\.label\}/)
assert.match(documentsSource, /flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-start/)
assert.match(documentsSource, /inline-flex shrink-0 self-start rounded-lg border px-2 py-1 text-xs font-semibold/)
assert.match(documentsSource, /flex flex-col gap-3 sm:flex-row sm:items-start/)
assert.match(documentsSource, /mt-3 flex flex-wrap justify-start gap-2 sm:justify-end/)
assert.doesNotMatch(documentsSource, /whitespace-nowrap/)
assert.doesNotMatch(documentsSource, /block truncate text-sm font-semibold text-slate-950">\{category\.label\}/)
assert.doesNotMatch(documentsSource, /block truncate text-sm font-semibold text-slate-950">\{row\.displayName\}/)
assert.doesNotMatch(documentsSource, /block truncate text-xs text-slate-500/)
assert.match(appCss, /\.conveyancing-workspace-fit \.archline-documents-workspace/)
assert.match(appCss, /\.conveyancing-workspace-fit \.archline-documents-workspace :where\(\.truncate\)/)
assert.match(packageSource, /test:conveyancing-workspace-overflow-phase6/)

console.log('conveyancing workspace UI overflow phase 6 contract passed')
