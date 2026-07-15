import assert from 'node:assert/strict'
import {
  MATTER_PLAN_ACTION_STATES,
  MATTER_PLAN_EVIDENCE_STATUSES,
  MATTER_PLAN_OWNER_ROLES,
  MATTER_PLAN_STATUSES,
} from '../../../core/transactions/conveyancerMatterPlanContract.js'
import { generateConveyancerMatterPlan } from '../conveyancerMatterPlanGenerator.js'
import {
  CONVEYANCER_MATTER_PLAN_REROUTING_PREVIEW_VERSION,
  previewConveyancerMatterPlanRerouting,
} from '../conveyancerMatterPlanReroutingPreview.js'

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

const generatedAt = '2026-07-15T12:00:00.000Z'

function transaction(overrides = {}) {
  return {
    id: 'tx-a3-1',
    organisation_id: 'org-a3-1',
    finance_type: 'cash',
    transaction_type: 'private_sale',
    buyer_entity_type: 'individual',
    seller_entity_type: 'individual',
    seller_has_existing_bond: false,
    property_tenure: 'freehold',
    ...overrides,
  }
}

function activePlan(sourceTransaction = transaction()) {
  const generated = generateConveyancerMatterPlan({ transaction: sourceTransaction, generatedAt })
  assert.equal(generated.valid, true)
  return {
    ...structuredClone(generated.plan),
    status: MATTER_PLAN_STATUSES.active,
    activatedAt: '2026-07-15T12:05:00.000Z',
  }
}

function preview(currentPlan, proposedTransaction, overrides = {}) {
  return previewConveyancerMatterPlanRerouting({
    currentPlan,
    proposedTransaction,
    actorRole: MATTER_PLAN_OWNER_ROLES.firmManager,
    changeReason: 'Matter facts changed',
    generatedAt: '2026-07-15T13:00:00.000Z',
    ...overrides,
  })
}

test('returns a no-change preview without allowing supersession', () => {
  const result = preview(activePlan(), transaction())
  assert.equal(result.version, CONVEYANCER_MATTER_PLAN_REROUTING_PREVIEW_VERSION)
  assert.equal(result.status, 'no_changes')
  assert.equal(result.canApply, false)
  assert.ok(result.blockers.includes('no_material_rerouting_changes'))
})

test('previews activation of the bank-appointed bond lane', () => {
  const result = preview(activePlan(), transaction({ finance_type: 'bond' }))
  assert.equal(result.status, 'ready')
  assert.equal(result.canApply, true)
  assert.equal(result.impactLevel, 'high')
  assert.ok(result.impacts.actionKeys.added.includes('coordinate_bond_attorney'))
  const lane = result.impacts.legalLanes.find((item) => item.lane === 'bond')
  assert.equal(lane.direction, 'activated')
  assert.match(lane.message, /bank.*appoint/i)
})

test('requires acknowledgement before removing a progressed legal lane', () => {
  const current = activePlan(transaction({ finance_type: 'bond' }))
  const coordination = current.actions.find((item) => item.key === 'coordinate_bond_attorney')
  coordination.state = MATTER_PLAN_ACTION_STATES.waiting
  coordination.waitingOn = 'Bank instruction'

  const first = preview(current, transaction({ finance_type: 'cash' }))
  assert.equal(first.status, 'needs_acknowledgement')
  assert.equal(first.impactLevel, 'critical')
  assert.ok(first.acknowledgements.pending.some((item) => item.key === 'remove_action:coordinate_bond_attorney'))
  assert.ok(first.acknowledgements.pending.some((item) => item.key === 'deactivate_legal_lane:bond'))
  assert.match(first.impacts.legalLanes[0].message, /does not cancel/i)

  const second = preview(current, transaction({ finance_type: 'cash' }), {
    acknowledgedImpactKeys: first.acknowledgements.required.map((item) => item.key),
  })
  assert.equal(second.status, 'ready')
  assert.equal(second.canApply, true)
})

test('shows action definition changes and progress resets', () => {
  const current = activePlan()
  const finance = current.actions.find((item) => item.key === 'confirm_financial_readiness')
  finance.state = MATTER_PLAN_ACTION_STATES.waiting
  finance.waitingOn = 'Proof of funds'

  const result = preview(current, transaction({ finance_type: 'bond' }))
  const change = result.impacts.actions.find((item) => item.actionKey === 'confirm_financial_readiness')
  assert.equal(change.changeType, 'changed')
  assert.equal(change.progressDisposition, 'reset')
  assert.ok(change.fieldChanges.some((item) => item.field === 'dependencies'))
  assert.ok(change.fieldChanges.some((item) => item.field === 'evidence_requirements'))
})

test('requires acknowledgement before a completed action is reset', () => {
  const current = activePlan()
  const finance = current.actions.find((item) => item.key === 'confirm_financial_readiness')
  finance.state = MATTER_PLAN_ACTION_STATES.completed
  finance.completedAt = '2026-07-15T12:30:00.000Z'
  finance.evidence = [{
    requirementKey: 'purchase_funds_confirmed',
    status: MATTER_PLAN_EVIDENCE_STATUSES.approved,
    referenceId: 'funds-1',
    capturedAt: '2026-07-15T12:20:00.000Z',
  }]

  const result = preview(current, transaction({ finance_type: 'bond' }))
  assert.equal(result.status, 'needs_acknowledgement')
  assert.ok(result.acknowledgements.pending.some((item) => item.key === 'reset_completed_action:confirm_financial_readiness'))
})

test('allows conveyancers to inspect but not authorise the reroute', () => {
  const result = preview(activePlan(), transaction({ finance_type: 'bond' }), {
    actorRole: MATTER_PLAN_OWNER_ROLES.transferAttorney,
  })
  assert.equal(result.status, 'unauthorised')
  assert.equal(result.canApply, false)
  assert.ok(result.blockers.includes('plan_supersession_not_authorised'))
})

test('requires an active valid source plan', () => {
  const draft = generateConveyancerMatterPlan({ transaction: transaction(), generatedAt }).plan
  const result = preview(draft, transaction({ finance_type: 'bond' }))
  assert.equal(result.status, 'invalid')
  assert.ok(result.blockers.includes('current_plan_must_be_active'))
})

test('requires a recorded rerouting reason', () => {
  const result = preview(activePlan(), transaction({ finance_type: 'bond' }), { changeReason: '' })
  assert.equal(result.status, 'invalid')
  assert.ok(result.blockers.includes('candidate_plan_invalid'))
  assert.ok(result.blockers.includes('plan_change_reason_required'))
})

test('reports fact changes and affected notification roles without sending anything', () => {
  const result = preview(activePlan(), transaction({ seller_has_existing_bond: true }))
  assert.ok(result.impacts.facts.some((item) => item.field === 'requiresCancellationAttorney' && item.after === true))
  assert.ok(result.impacts.notifications.some((item) => item.role === MATTER_PLAN_OWNER_ROLES.cancellationAttorney))
  assert.ok(result.impacts.notifications.some((item) => item.role === MATTER_PLAN_OWNER_ROLES.transferAttorney))
})

console.log('conveyancer matter-plan A3 rerouting preview tests passed')
