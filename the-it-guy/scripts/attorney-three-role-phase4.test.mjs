import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (relativePath) => readFileSync(new URL(relativePath, import.meta.url), 'utf8')
const page = read('../src/pages/AttorneyTransactionDetail.jsx')
const cockpit = read('../src/core/transactions/attorneyBondWorldClassCockpit.js')
const packageSource = read('../package.json')

assert.match(page, /buildBondAttorneyCockpit/)
assert.match(page, /BondAttorneyCommandCentre/)
assert.match(page, /bondAttorneyCockpit/)
assert.match(page, /openLegalWorkflowDetail\('bond-registration'\)/)
assert.match(cockpit, /editable:\s*false/)
assert.match(cockpit, /Bank requirements & conditions/)
assert.match(cockpit, /Guarantees & transfer handoff/)
assert.match(packageSource, /test:attorney-three-role-phase4/)

console.log('Attorney three-role Phase 4 bond cockpit wiring checks passed.')

