import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (relativePath) => readFileSync(new URL(relativePath, import.meta.url), 'utf8')
const page = read('../src/pages/AttorneyOperationsPage.jsx')
const engine = read('../src/core/transactions/attorneyThreeRoleInterventionEngine.js')
const packageSource = read('../package.json')

assert.match(page, /buildAttorneyThreeRoleInterventionQueue/)
assert.match(page, /interventionQueue/)
assert.match(page, /Expansion guard/)
assert.match(engine, /assign_required_role/)
assert.match(engine, /recover_overdue_action/)
assert.match(engine, /reactivate_stale_matter/)
assert.match(engine, /matter_risk_review/)
assert.match(packageSource, /test:attorney-three-role-phase9/)

console.log('Attorney three-role Phase 9 intervention engine wiring checks passed.')

