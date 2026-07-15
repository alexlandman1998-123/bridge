import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (relativePath) => readFileSync(new URL(relativePath, import.meta.url), 'utf8')
const page = read('../src/pages/AttorneyTransactionDetail.jsx')
const cockpit = read('../src/core/transactions/attorneyTransferWorldClassCockpit.js')
const packageSource = read('../package.json')

assert.match(page, /buildTransferAttorneyCockpit/)
assert.match(page, /TransferAttorneyCommandCentre/)
assert.match(page, /transferAttorneyCockpit/)
assert.match(page, /onExecuteCoordination/)
assert.match(cockpit, /editable:\s*false/)
assert.match(cockpit, /FICA & entity authority/)
assert.match(cockpit, /Lodgement, registration & close/)
assert.match(packageSource, /test:attorney-three-role-phase3/)

console.log('Attorney three-role Phase 3 transfer cockpit wiring checks passed.')

