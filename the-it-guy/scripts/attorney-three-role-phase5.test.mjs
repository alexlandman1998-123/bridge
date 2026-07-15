import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (relativePath) => readFileSync(new URL(relativePath, import.meta.url), 'utf8')
const page = read('../src/pages/AttorneyTransactionDetail.jsx')
const cockpit = read('../src/core/transactions/attorneyCancellationWorldClassCockpit.js')
const packageSource = read('../package.json')

assert.match(page, /buildCancellationAttorneyCockpit/)
assert.match(page, /CancellationAttorneyCommandCentre/)
assert.match(page, /cancellationAttorneyCockpit/)
assert.match(page, /openLegalWorkflowDetail\('bond-cancellation'\)/)
assert.match(cockpit, /editable:\s*false/)
assert.match(cockpit, /Cancellation figures & expiry risk/)
assert.match(cockpit, /Settlement proof & close-out/)
assert.match(packageSource, /test:attorney-three-role-phase5/)

console.log('Attorney three-role Phase 5 cancellation cockpit wiring checks passed.')

