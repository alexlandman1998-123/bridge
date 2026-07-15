import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (relativePath) => readFileSync(new URL(relativePath, import.meta.url), 'utf8')
const page = read('../src/pages/AttorneyTransactionDetail.jsx')
const room = read('../src/core/transactions/attorneyThreeRoleRegistrationRoom.js')
const packageSource = read('../package.json')

assert.match(page, /buildAttorneyThreeRoleRegistrationRoom/)
assert.match(page, /AttorneyThreeRoleRegistrationRoom/)
assert.match(page, /threeRoleRegistrationRoom/)
assert.match(room, /crossLaneWriteAllowed:\s*false/)
assert.match(room, /Joint lodgement ready/)
assert.match(room, /Linked registration complete/)
assert.match(packageSource, /test:attorney-three-role-phase6/)

console.log('Attorney three-role Phase 6 registration room wiring checks passed.')

