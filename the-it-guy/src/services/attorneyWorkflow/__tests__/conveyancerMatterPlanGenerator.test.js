import assert from 'node:assert/strict'
import {
  CONVEYANCER_MATTER_PLAN_GENERATOR_VERSION,
  generateConveyancerMatterPlan,
} from '../conveyancerMatterPlanGenerator.js'
import {
  MATTER_PLAN_ACTION_STATES,
  MATTER_PLAN_EVIDENCE_STATUSES,
  MATTER_PLAN_OWNER_ROLES,
} from '../../../core/transactions/conveyancerMatterPlanContract.js'

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

const generatedAt = '2026-07-15T10:00:00.000Z'

function transaction(overrides = {}) {
  return {
    id: 'tx-a2-1',
    organisation_id: 'org-a2-1',
    finance_type: 'cash',
    transaction_type: 'private_sale',
    buyer_entity_type: 'individual',
    seller_entity_type: 'individual',
    seller_has_existing_bond: false,
    property_tenure: 'freehold',
    ...overrides,
  }
}

function generate(overrides = {}) {
  return generateConveyancerMatterPlan({ transaction: transaction(), generatedAt, ...overrides })
}

test('generates a valid deterministic cash-transfer plan', () => {
  const first = generate()
  const second = generate()
  assert.equal(first.valid, true)
  assert.equal(first.plan.generatorVersion, CONVEYANCER_MATTER_PLAN_GENERATOR_VERSION)
  assert.deepEqual(first.plan, second.plan)
  assert.equal(first.plan.actions.some((item) => item.key === 'coordinate_bond_attorney'), false)
  assert.equal(first.plan.actions.some((item) => item.key === 'coordinate_cancellation_attorney'), false)
  assert.equal(first.plan.actions.find((item) => item.key === 'open_matter').state, MATTER_PLAN_ACTION_STATES.doNow)
})

test('adds bank-appointed coordination for bond and cancellation lanes', () => {
  const result = generate({ transaction: transaction({ finance_type: 'bond', seller_has_existing_bond: true }) })
  assert.equal(result.valid, true)
  const bond = result.plan.actions.find((item) => item.key === 'coordinate_bond_attorney')
  const cancellation = result.plan.actions.find((item) => item.key === 'coordinate_cancellation_attorney')
  assert.equal(bond.owner.role, MATTER_PLAN_OWNER_ROLES.transferAttorney)
  assert.equal(cancellation.owner.role, MATTER_PLAN_OWNER_ROLES.transferAttorney)
  assert.match(bond.description, /does not choose the firm/i)
  assert.match(cancellation.description, /does not choose the firm/i)
  assert.ok(result.plan.actions.find((item) => item.key === 'confirm_lodgement_readiness').dependencies.some((item) => item.key === 'coordinate_cancellation_attorney'))
})

test('uses entity, tenure and VAT facts to vary the generated work', () => {
  const result = generate({
    transaction: transaction({
      transaction_type: 'commercial',
      buyer_entity_type: 'company',
      seller_entity_type: 'trust',
      property_tenure: 'sectional_title',
      vat_treatment: 'vat',
    }),
  })
  assert.equal(result.valid, true)
  assert.ok(result.plan.actions.some((item) => item.key === 'verify_authority'))
  assert.ok(result.plan.actions.find((item) => item.key === 'obtain_clearances').evidenceRequirements.some((item) => item.key === 'levy_clearance'))
  assert.ok(result.plan.actions.find((item) => item.key === 'obtain_clearances').evidenceRequirements.some((item) => item.key === 'body_corporate_levy_clearance'))
  assert.ok(result.plan.actions.find((item) => item.key === 'confirm_tax_position').evidenceRequirements.some((item) => item.key === 'vat_treatment_confirmed'))
  assert.ok(result.plan.actions.find((item) => item.key === 'draft_transfer_documents').evidenceRequirements.some((item) => item.key === 'commercial_beneficial_ownership'))
})

test('creates a blocking fact-resolution action when classification is incomplete', () => {
  const result = generate({ transaction: { id: 'tx-unknown', organisation_id: 'org-a2-1' } })
  assert.equal(result.valid, true)
  const factAction = result.plan.actions.find((item) => item.key === 'resolve_fact_gaps')
  assert.ok(factAction)
  assert.ok(factAction.evidenceRequirements.some((item) => item.key === 'confirmed_finance_type'))
  assert.ok(result.plan.actions.find((item) => item.key === 'verify_parties').dependencies.some((item) => item.key === 'resolve_fact_gaps'))
})

test('returns A1 validation errors when required plan identity is unavailable', () => {
  const result = generateConveyancerMatterPlan({ transaction: transaction({ organisation_id: '' }), generatedAt })
  assert.equal(result.valid, false)
  assert.ok(result.errors.includes('organisation_id_required'))
})

test('regeneration links versions and carries valid progress for unchanged actions', () => {
  const first = generate()
  const previousPlan = structuredClone(first.plan)
  const openMatter = previousPlan.actions.find((item) => item.key === 'open_matter')
  openMatter.state = MATTER_PLAN_ACTION_STATES.completed
  openMatter.completedAt = '2026-07-15T11:00:00.000Z'
  openMatter.evidence = [{
    requirementKey: 'signed_transfer_instruction',
    status: MATTER_PLAN_EVIDENCE_STATUSES.provided,
    referenceId: 'instruction-1',
    capturedAt: '2026-07-15T10:30:00.000Z',
  }]

  const result = generate({ previousPlan, changeReason: 'Confirmed facts refreshed' })
  assert.equal(result.valid, true)
  assert.equal(result.plan.version, 2)
  assert.equal(result.plan.previousPlanId, first.plan.planId)
  assert.equal(result.plan.actions.find((item) => item.key === 'open_matter').state, MATTER_PLAN_ACTION_STATES.completed)
  assert.ok(result.trace.decisions.some((item) => item.actionKey === 'open_matter' && item.outcome === 'progress_carried_forward'))
})

test('regeneration resets progress when an action definition changes', () => {
  const first = generate()
  const previousPlan = structuredClone(first.plan)
  const finance = previousPlan.actions.find((item) => item.key === 'confirm_financial_readiness')
  finance.state = MATTER_PLAN_ACTION_STATES.waiting
  finance.waitingOn = 'Proof of funds'

  const result = generate({
    transaction: transaction({ finance_type: 'bond' }),
    previousPlan,
    changeReason: 'Buyer changed from cash to bond finance',
  })
  assert.equal(result.valid, true)
  assert.equal(result.plan.actions.find((item) => item.key === 'confirm_financial_readiness').state, MATTER_PLAN_ACTION_STATES.upcoming)
  assert.ok(result.trace.decisions.some((item) => item.actionKey === 'confirm_financial_readiness' && item.outcome === 'progress_reset'))
})

test('generation trace explains selected and skipped rules', () => {
  const result = generate()
  assert.ok(result.trace.decisions.some((item) => item.ruleId === 'coordinate_bond_attorney' && item.outcome === 'skipped'))
  assert.ok(result.trace.decisions.some((item) => item.ruleId === 'open_matter' && item.outcome === 'selected'))
  assert.equal(result.trace.factsFingerprint.length, 8)
})

console.log('conveyancer matter-plan A2 generation tests passed')
