import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (relativePath) => readFileSync(new URL(relativePath, import.meta.url), 'utf8')
const page = read('../src/pages/AttorneyTransactionDetail.jsx')
const assurance = read('../src/core/transactions/attorneyThreeRoleOperationalAssurance.js')
const packageSource = read('../package.json')

assert.match(page, /buildAttorneyThreeRoleOperationalAssurance/)
assert.match(page, /operationalAssurance/)
assert.match(page, /Operational assurance/)
assert.match(assurance, /cross_lane_isolation/)
assert.match(assurance, /audit_evidence_available/)
assert.match(assurance, /serializeAttorneyThreeRoleAssuranceEvidence/)
assert.match(packageSource, /test:attorney-three-role-phase7/)

console.log('Attorney three-role Phase 7 operational assurance wiring checks passed.')

