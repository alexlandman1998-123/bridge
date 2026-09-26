import assert from 'node:assert/strict'

import { presentSharedMatterJourney } from '../src/core/transactions/sharedMatterJourneyContract.js'
import { resolveTransactionRoutingProfile } from '../src/services/transactionRoutingProfileService.js'
import { buildPlannedSharedMatterJourney } from '../src/services/attorneyWorkflow/sharedMatterJourneyPlanAdapter.js'
import { buildTransferWorkspaceViewModel } from '../src/services/attorneyWorkflow/transferWorkspaceViewModel.js'
import { sharedJourneyHeaderPhases, sharedJourneyLaneTasks } from '../src/services/sharedMatterJourneyReader.js'
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
  const profile = {
    financeType: 'bond', sellerHasExistingBond: false,
    mvpProfile: { sellerExistingBond: 'unknown' },
    matterProfile: { status: 'confirmed', revision: 1, factFingerprint: 'seller-bond-unchecked' },
  }
  const plan = buildMatterWorkflowPlan({ routingProfile: profile })
  assert.equal(plan.provisional, true, 'an unanswered seller-bond question cannot support lodgement')
  assert.equal(isMatterWorkflowPlanCurrent(plan, { ...profile, workflowPlan: plan }), false)
  assert.deepEqual(plan.laneKeys, ['transfer', 'bond'], 'unknown must not invent a cancellation lane')
  const financeUnknown = buildMatterWorkflowPlan({ routingProfile: {
    ...profile, financeType: 'unknown', mvpProfile: { sellerExistingBond: false },
  } })
  assert.equal(financeUnknown.provisional, true, 'unknown buyer finance cannot support lodgement')
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

// Scenario matrix: applicability belongs to the saved plan, and progress is
// shown from the same professional journey in the header and Work tab.
const scenarioCases = [
  { name: 'cash/freehold/employed individual', profile: { financeType: 'cash', propertyTenure: 'freehold', buyerEntityType: 'individual', buyerEmploymentType: 'employed', transferTaxDecision: { route: 'transfer_duty' } },
    lanes: ['transfer'], present: ['cash_funding_source_review', 'transfer_duty_tdc01_submission'], absent: ['body_corporate_levy_clearance_review', 'ordinary_vat_basis_verified'] },
  { name: 'cash/freehold/self-employed individual', profile: { financeType: 'cash', propertyTenure: 'freehold', buyerEntityType: 'individual', buyerEmploymentType: 'self_employed', transferTaxDecision: { route: 'transfer_duty' } },
    lanes: ['transfer'], present: ['cash_funding_source_review'], absent: ['body_corporate_levy_clearance_review'] },
  { name: 'bond/sectional company buyer/trust seller with cancellation', profile: { financeType: 'bond', propertyTenure: 'sectional_title', buyerEntityType: 'company', sellerEntityType: 'trust', sellerHasExistingBond: true, transferTaxDecision: { route: 'transfer_duty' } },
    lanes: ['transfer', 'bond', 'cancellation'], present: ['body_corporate_levy_clearance_review'], absent: ['cash_funding_source_review'] },
  { name: 'hybrid/HOA multi-party signing', profile: { financeType: 'hybrid', propertyTenure: 'estate_hoa', scenarioProfile: { parties: [
    { id: 'buyer-1', role: 'buyer', entityType: 'company', representatives: [{ id: 'director-1', name: 'Director' }] },
    { id: 'buyer-2', role: 'buyer', entityType: 'individual' },
    { id: 'seller-1', role: 'seller', entityType: 'trust', representatives: [{ id: 'trustee-1', name: 'Trustee' }] },
  ] }, transferTaxDecision: { route: 'transfer_duty' } },
    lanes: ['transfer', 'bond'], present: ['cash_funding_source_review', 'hoa_clearance_review'], absent: ['body_corporate_levy_clearance_review'] },
  { name: 'developer sale/VAT', profile: { financeType: 'cash', transactionType: 'developer_sale', propertyTenure: 'sectional_title', transferTaxDecision: { route: 'vat' } },
    lanes: ['transfer'], present: ['ordinary_vat_basis_verified'], absent: ['transfer_duty_tdc01_submission'] },
  { name: 'exempt transfer', profile: { financeType: 'cash', propertyTenure: 'freehold', transferTaxDecision: { route: 'exempt' } },
    lanes: ['transfer'], present: ['transfer_duty_exemption_basis_verified'], absent: ['ordinary_vat_basis_verified'] },
  { name: 'non-resident seller', profile: { financeType: 'bond', propertyTenure: 'freehold', scenarioProfile: { parties: [{ id: 'seller-1', role: 'seller', entityType: 'individual', taxResidence: 'outside_south_africa' }] }, transferTaxDecision: { route: 'transfer_duty', sellerNonResidentReview: 'yes' } },
    lanes: ['transfer', 'bond'], present: ['non_resident_seller_applicability_review', 'non_resident_seller_withholding_payment_review'], absent: ['ordinary_vat_basis_verified'] },
  { name: 'unknown/stale facts', profile: { financeType: 'unknown', propertyTenure: 'unknown', transferTaxDecision: {} },
    lanes: ['transfer'], present: ['transfer_tax_route_confirmed', 'property_conditions_applicability_review'], absent: ['cash_funding_source_review', 'body_corporate_levy_clearance_review'] },
]

for (const { name, profile, lanes, present, absent } of scenarioCases) {
  const plan = buildMatterWorkflowPlan({ routingProfile: profile })
  assert.deepEqual(plan.laneKeys, lanes, `${name}: required legal lanes`)
  const transferKeys = getMatterWorkflowPlanStepKeys(plan, 'transfer')
  for (const key of present) assert.ok(transferKeys.includes(key), `${name}: ${key} should be applicable`)
  for (const key of absent) assert.ok(!transferKeys.includes(key), `${name}: ${key} should be absent`)

  const sampleStatuses = ['completed', 'completed_externally', 'not_applicable', 'blocked', 'waiting']
  const laneSnapshots = Object.fromEntries(plan.lanes.map(lane => [lane.laneKey, {
    steps: lane.stepKeys.slice(0, sampleStatuses.length).map((stepKey, index) => ({ stepKey, status: sampleStatuses[index] })),
  }]))
  const journey = buildPlannedSharedMatterJourney({
    transactionId: `scenario-${name}`, revision: 1, planRevision: 1,
    routingProfile: { ...profile, workflowPlan: plan }, laneSnapshots,
  }).journey
  const result = { status: 'ready', snapshot: presentSharedMatterJourney(journey, 'attorney') }
  for (const lane of plan.lanes) {
    const snapshotTasks = sharedJourneyLaneTasks(result, lane.laneKey)
    // Deliberately omit the plan from Work: a ready saved snapshot must still
    // prevent the broad fallback catalogue from inflating the denominator.
    const work = buildTransferWorkspaceViewModel({ workflowKey: lane.laneKey,
      workflow: { lane: { laneKey: lane.laneKey, steps: snapshotTasks.map(task => ({ stepKey: task.key, status: 'not_started' })) }, facts: profile },
      sharedJourneyTasks: snapshotTasks })
    assert.deepEqual(work.tasks.map(task => task.key), lane.stepKeys, `${name}/${lane.laneKey}: task list`)
    assert.deepEqual(Object.fromEntries(work.tasks.map(task => [task.key, task.status])),
      Object.fromEntries(snapshotTasks.map(task => [task.key, task.status])),
      `${name}/${lane.laneKey}: saved statuses supersede stale lane rows`)
    assert.deepEqual(work.phases.map(phase => [phase.key, phase.completed, phase.total]),
      sharedJourneyHeaderPhases(result, lane.laneKey).map(phase => [phase.key, phase.completed, phase.total]),
      `${name}/${lane.laneKey}: header and Work progress`)
  }
}
assert.deepEqual(getMatterWorkflowPlanStepKeys(buildMatterWorkflowPlan({ routingProfile: scenarioCases[0].profile }), 'transfer'),
  getMatterWorkflowPlanStepKeys(buildMatterWorkflowPlan({ routingProfile: scenarioCases[1].profile }), 'transfer'),
  'employment type changes supporting finance documents, not the legal-stage denominator')
assert.equal(sharedJourneyLaneTasks({ status: 'unavailable' }, 'transfer'), null)

console.log('matter-workflow-plan tests passed')
