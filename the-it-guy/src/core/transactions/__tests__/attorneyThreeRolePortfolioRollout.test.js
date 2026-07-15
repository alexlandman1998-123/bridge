import assert from 'node:assert/strict'
import { buildAttorneyThreeRolePortfolioRollout } from '../attorneyThreeRolePortfolioRollout.js'

const now = '2026-07-15T12:00:00.000Z'
const healthy = buildAttorneyThreeRolePortfolioRollout({
  now,
  matterRows: [
    { matterId: 'cash', matterReference: 'MAT-1', financeType: 'cash', attorneyRole: 'transfer_attorney', status: 'On Track', lastMeaningfulActivityAt: '2026-07-14T12:00:00.000Z' },
    { matterId: 'bond', matterReference: 'MAT-2', financeType: 'bond', attorneyRole: 'transfer_attorney', status: 'On Track', lastMeaningfulActivityAt: '2026-07-14T12:00:00.000Z' },
    { matterId: 'bond', matterReference: 'MAT-2', financeType: 'bond', attorneyRole: 'bond_attorney', status: 'On Track', lastMeaningfulActivityAt: '2026-07-14T12:00:00.000Z' },
  ],
})
assert.equal(healthy.version, 'attorney_three_role_portfolio_rollout_phase8_v1')
assert.equal(healthy.matterCount, 2)
assert.equal(healthy.decision, 'go')
assert.equal(healthy.metrics.coverageGapCount, 0)
assert.equal(healthy.roleCoverage.find((item) => item.roleKey === 'bond_attorney').coveragePercent, 100)

const hold = buildAttorneyThreeRolePortfolioRollout({
  now,
  matterRows: [
    { matterId: 'full', matterReference: 'MAT-3', financeType: 'bond', sellerHasExistingBond: true, attorneyRole: 'transfer_attorney', status: 'Needs Attention', lastMeaningfulActivityAt: '2026-07-01T12:00:00.000Z', nextActionDueAt: '2026-07-10T12:00:00.000Z', actionHref: '/transactions/full' },
  ],
})
assert.equal(hold.decision, 'hold')
assert.equal(hold.metrics.coverageGapCount, 2)
assert.equal(hold.metrics.stalePercent, 100)
assert.deepEqual(hold.interventions[0].missingRoles, ['bond_attorney', 'cancellation_attorney'])
assert.equal(hold.interventions[0].severity, 'critical')

const observe = buildAttorneyThreeRolePortfolioRollout({
  now,
  thresholds: { holdAtRiskRate: 1 },
  matterRows: [
    { matterId: 'one', financeType: 'cash', attorneyRole: 'transfer_attorney', status: 'Needs Attention', lastMeaningfulActivityAt: '2026-07-14T12:00:00.000Z' },
    { matterId: 'two', financeType: 'cash', attorneyRole: 'transfer_attorney', status: 'On Track', lastMeaningfulActivityAt: '2026-07-14T12:00:00.000Z' },
    { matterId: 'three', financeType: 'cash', attorneyRole: 'transfer_attorney', status: 'On Track', lastMeaningfulActivityAt: '2026-07-14T12:00:00.000Z' },
  ],
})
assert.equal(observe.decision, 'observe')
assert.ok(observe.thresholdBreaches.includes('at_risk_rate'))

assert.equal(buildAttorneyThreeRolePortfolioRollout().decision, 'insufficient_data')

console.log('Attorney three-role Phase 8 portfolio rollout tests passed.')

