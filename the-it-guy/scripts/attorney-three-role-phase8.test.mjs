import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (relativePath) => readFileSync(new URL(relativePath, import.meta.url), 'utf8')
const operationsPage = read('../src/pages/AttorneyOperationsPage.jsx')
const operationsService = read('../src/services/attorneyOperations.js')
const rollout = read('../src/core/transactions/attorneyThreeRolePortfolioRollout.js')
const packageSource = read('../package.json')

assert.match(operationsPage, /buildAttorneyThreeRolePortfolioRollout/)
assert.match(operationsPage, /ThreeRoleRolloutIntelligence/)
assert.match(operationsPage, /portfolioRollout/)
assert.match(operationsService, /attorneyRole:\s*assignment\.attorneyRole/)
assert.match(rollout, /coverageGapCount/)
assert.match(rollout, /holdAtRiskRate/)
assert.match(packageSource, /test:attorney-three-role-phase8/)

console.log('Attorney three-role Phase 8 portfolio rollout wiring checks passed.')

