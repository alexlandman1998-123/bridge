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
  // HOA applicability remains an explicit attorney fact for freehold.
  assert.equal(transferStepKeys.includes('payment_security_review'), true)
  assert.equal(transferStepKeys.includes('levy_hoa_clearance_review'), false)
  assert.equal(transferStepKeys.includes('property_conditions_applicability_review'), true)
  assert.equal(transferStepKeys.includes('municipal_rates_clearance_review'), true)
  assert.equal(isMatterWorkflowPlanCurrent({ ...plan, status: 'active' }, { ...profile, workflowPlan: plan }), true)
}

{
  const plan = buildMatterWorkflowPlan({
    routingProfile: {
      financeType: 'cash',
      // This represents a stale profile written before finance was confirmed.
      requiresBondAttorney: true,
    },
  })
  assert.deepEqual(plan.laneKeys, ['transfer'], 'Cash finance must suppress a stale bond-attorney flag')
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
  assert.equal(transferStepKeys.includes('payment_security_review'), true)
  assert.equal(transferStepKeys.includes('body_corporate_levy_clearance_review'), true)
  assert.ok(getMatterWorkflowPlanStepKeys(plan, 'bond').length > 0)
  assert.ok(getMatterWorkflowPlanStepKeys(plan, 'cancellation').length > 0)
}

{
  const unconfirmedProfile = resolveTransactionRoutingProfile({
    transaction: { id: 'unconfirmed', finance_type: 'cash', property_type: 'house' },
  })
  const plan = buildMatterWorkflowPlan({ routingProfile: unconfirmedProfile })
  assert.equal(plan.status, 'active')
  assert.equal(plan.provisional, true)
  assert.deepEqual(plan.laneKeys, ['transfer'])
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
    { step_key: 'municipal_rates_clearance_review', status: 'not_started' },
    { step_key: 'levy_hoa_clearance_review', status: 'completed' },
    { step_key: 'rates_clearance_received', status: 'completed' },
  ], plan, 'transfer')

  assert.deepEqual(filtered.map((step) => step.step_key), ['municipal_rates_clearance_review'])
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
  assert.equal(impact.addedSteps.some((step) => step.stepKey === 'payment_security_review'), false)
  assert.equal(impact.addedSteps.some((step) => step.stepKey === 'body_corporate_levy_clearance_review'), true)
  assert.equal(impact.nextTaskCount > impact.previousTaskCount, true)
  assert.deepEqual(diffMatterWorkflowPlans(bondPlan, bondPlan), {
    changed: false,
    partyRequirementsChanged: false,
    addedLanes: [],
    removedLanes: [],
    addedSteps: [],
    removedSteps: [],
    previousTaskCount: impact.nextTaskCount,
    nextTaskCount: impact.nextTaskCount,
  })
}

{
  const cashSellerBond = confirmedProfile({
    id: 'cash-seller-bond', finance_type: 'cash', transaction_type: 'resale',
    property_type: 'freehold house', purchaser_type: 'company', seller_type: 'individual',
    seller_has_existing_bond: true, vat_treatment: 'transfer_duty',
    routing_profile_json: { mvpProfile: { paymentSecurity: 'cleared_trust_funds', cancellationWorkflow: 'exclude' } },
  })
  const plan = buildMatterWorkflowPlan({ routingProfile: cashSellerBond })
  assert.deepEqual(plan.laneKeys, ['transfer', 'cancellation'], 'seller debt activates cancellation even when buyer pays cash')
  assert.ok(getMatterWorkflowPlanStepKeys(plan, 'transfer').includes('cash_funding_source_review'))
  assert.ok(getMatterWorkflowPlanStepKeys(plan, 'transfer').includes('payment_security_review'), 'cleared trust funds still need review')
  assert.ok(getMatterWorkflowPlanStepKeys(plan, 'cancellation').includes('cancellation_consent_confirmed'))
  assert.ok(getMatterWorkflowPlanStepKeys(plan, 'cancellation').includes('cancellation_guarantee_allocation_review'))

  const financeChanged = { ...cashSellerBond, financeType: 'bond' }
  const revised = buildMatterWorkflowPlan({ routingProfile: financeChanged })
  const changes = diffMatterWorkflowPlans(plan, revised)
  assert.deepEqual(revised.laneKeys, ['transfer', 'bond', 'cancellation'])
  assert.deepEqual(changes.addedLanes, ['bond'])
  assert.ok(changes.removedSteps.some(step => step.stepKey === 'cash_funding_source_review'))
  assert.ok(getMatterWorkflowPlanStepKeys(revised, 'bond').includes('bond_lodgement_instructions_confirmed'))
}

{
  const hybrid = buildMatterWorkflowPlan({ routingProfile: {
    financeType: 'hybrid', sellerHasExistingBond: false, requiresCancellationAttorney: false,
  } })
  assert.deepEqual(hybrid.laneKeys, ['transfer', 'bond'])
  assert.ok(getMatterWorkflowPlanStepKeys(hybrid, 'transfer').includes('cash_funding_source_review'))
}

console.log('matter-workflow-plan tests passed')
