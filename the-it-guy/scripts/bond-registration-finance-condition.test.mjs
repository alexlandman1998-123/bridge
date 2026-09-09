import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildMatterWorkflowPlan } from '../src/services/attorneyWorkflow/matterWorkflowPlanService.js'

const expectedBondLane = new Map([
  ['cash', false],
  ['unknown', false],
  ['developer', false],
  ['bond', true],
  ['hybrid', true],
  ['combination', true],
])

for (const [financeType, includesBond] of expectedBondLane) {
  const plan = buildMatterWorkflowPlan({
    routingProfile: {
      financeType,
      // This intentionally adversarial legacy value must not create a lane on
      // a non-bond route.
      requiresBondAttorney: true,
    },
  })
  assert.equal(
    plan.laneKeys.includes('bond'),
    includesBond,
    `${financeType} must ${includesBond ? '' : 'not '}include Bond Registration`,
  )
}

const detailPage = readFileSync(new URL('../src/pages/AttorneyTransactionDetail.jsx', import.meta.url), 'utf8')
assert.match(
  detailPage,
  /requiresBondRegistrationWorkflow = isBondOrHybridFinance/,
  'Attorney navigation must start from the canonical finance condition',
)
assert.match(
  detailPage,
  /activeLegalWorkflowDetailKey !== 'bond-registration' \|\| requiresBondRegistrationWorkflow/,
  'A stale direct Bond Registration route must close for cash matters',
)

const migration = readFileSync(
  new URL('../../supabase/migrations/20260909090000_enforce_bond_lane_finance_condition.sql', import.meta.url),
  'utf8',
)
for (const marker of [
  "candidate.finance_type not in ('bond', 'hybrid', 'combination')",
  "where lane_key <> 'bond'",
  "where lane ->> 'laneKey' <> 'bond'",
  'requires_bond_lane',
  'transaction_refresh_signals',
]) {
  assert.ok(migration.includes(marker), `Migration must enforce ${marker}`)
}

console.log('bond-registration-finance-condition: passed')
