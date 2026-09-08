import assert from 'node:assert/strict'

import { resolveTransactionRoutingProfile } from '../src/services/transactionRoutingProfileService.js'
import {
  MATTER_WORKFLOW_PLAN_VERSION,
  buildMatterWorkflowPlan,
  diffMatterWorkflowPlans,
  filterStepsForMatterWorkflowPlan,
  getMatterWorkflowPlanStepKeys,
  isMatterWorkflowPlanCurrent,
} from '../src/services/attorneyWorkflow/matterWorkflowPlanService.js'

function confirmedProfile(transaction) {
  return resolveTransactionRoutingProfile({
    transaction,
    matterProfile: {
      status: 'confirmed',
      confirmedAt: '2026-09-08T10:00:00.000Z',
      confirmedByRole: 'attorney',
      revision: 1,
    },
  })
}

{
  const profile = confirmedProfile({
    id: 'cash-freehold',
    finance_type: 'cash',
    transaction_type: 'resale',
    property_type: 'freehold house',
    purchaser_type: 'individual',
    seller_type: 'individual',
    seller_has_existing_bond: false,
    vat_treatment: 'transfer_duty',
  })
  const plan = buildMatterWorkflowPlan({ routingProfile: profile })
  const transferStepKeys = getMatterWorkflowPlanStepKeys(plan, 'transfer')

  assert.equal(plan.version, MATTER_WORKFLOW_PLAN_VERSION)
  assert.equal(plan.status, 'active')
  assert.deepEqual(plan.laneKeys, ['transfer'])
  assert.equal(transferStepKeys.includes('guarantees_requested'), false)
  assert.equal(transferStepKeys.includes('levy_clearance_requested'), false)
  assert.equal(transferStepKeys.includes('rates_clearance_received'), true)
  assert.equal(isMatterWorkflowPlanCurrent({ ...plan, status: 'active' }, { ...profile, workflowPlan: plan }), true)
}

{
  const profile = confirmedProfile({
    id: 'bond-sectional-cancellation',
    finance_type: 'bond',
    transaction_type: 'resale',
    property_type: 'sectional title apartment',
    purchaser_type: 'company',
    seller_type: 'trust',
    seller_has_existing_bond: true,
    vat_treatment: 'transfer_duty',
  })
  const plan = buildMatterWorkflowPlan({ routingProfile: profile })
  const transferStepKeys = getMatterWorkflowPlanStepKeys(plan, 'transfer')

  assert.deepEqual(plan.laneKeys, ['transfer', 'bond', 'cancellation'])
  assert.equal(transferStepKeys.includes('guarantees_requested'), true)
  assert.equal(transferStepKeys.includes('levy_clearance_requested'), true)
  assert.ok(getMatterWorkflowPlanStepKeys(plan, 'bond').length > 0)
  assert.ok(getMatterWorkflowPlanStepKeys(plan, 'cancellation').length > 0)
}

{
  const unconfirmedProfile = resolveTransactionRoutingProfile({
    transaction: { id: 'unconfirmed', finance_type: 'cash', property_type: 'house' },
  })
  const plan = buildMatterWorkflowPlan({ routingProfile: unconfirmedProfile })
  assert.equal(plan.status, 'awaiting_matter_profile_confirmation')
  assert.deepEqual(plan.lanes, [])
}

{
  const profile = confirmedProfile({
    id: 'history-retained',
    finance_type: 'cash',
    transaction_type: 'resale',
    property_type: 'freehold house',
    purchaser_type: 'individual',
    seller_type: 'individual',
    seller_has_existing_bond: false,
    vat_treatment: 'transfer_duty',
  })
  const plan = buildMatterWorkflowPlan({ routingProfile: profile })
  const filtered = filterStepsForMatterWorkflowPlan([
    { step_key: 'rates_clearance_received', status: 'not_started' },
    { step_key: 'levy_clearance_requested', status: 'not_started' },
    { step_key: 'levy_clearance_received', status: 'completed' },
  ], plan, 'transfer')

  assert.deepEqual(filtered.map((step) => step.step_key), ['rates_clearance_received'])
}

{
  const cashPlan = buildMatterWorkflowPlan({
    routingProfile: confirmedProfile({
      id: 'plan-impact-cash',
      finance_type: 'cash',
      transaction_type: 'resale',
      property_type: 'freehold house',
      purchaser_type: 'individual',
      seller_type: 'individual',
      seller_has_existing_bond: false,
      vat_treatment: 'transfer_duty',
    }),
  })
  const bondPlan = buildMatterWorkflowPlan({
    routingProfile: confirmedProfile({
      id: 'plan-impact-bond',
      finance_type: 'bond',
      transaction_type: 'resale',
      property_type: 'sectional title apartment',
      purchaser_type: 'company',
      seller_type: 'trust',
      seller_has_existing_bond: true,
      vat_treatment: 'transfer_duty',
    }),
  })
  const impact = diffMatterWorkflowPlans(cashPlan, bondPlan)

  assert.equal(impact.changed, true)
  assert.deepEqual(impact.addedLanes, ['bond', 'cancellation'])
  assert.equal(impact.addedSteps.some((step) => step.stepKey === 'guarantees_requested'), true)
  assert.equal(impact.addedSteps.some((step) => step.stepKey === 'levy_clearance_requested'), true)
  assert.equal(impact.nextTaskCount > impact.previousTaskCount, true)
  assert.deepEqual(diffMatterWorkflowPlans(bondPlan, bondPlan), {
    changed: false,
    addedLanes: [],
    removedLanes: [],
    addedSteps: [],
    removedSteps: [],
    previousTaskCount: impact.nextTaskCount,
    nextTaskCount: impact.nextTaskCount,
  })
}

console.log('matter-workflow-plan tests passed')
