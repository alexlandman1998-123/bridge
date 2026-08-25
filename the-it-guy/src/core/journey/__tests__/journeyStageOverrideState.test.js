import assert from 'node:assert/strict'
import {
  applyJourneyStageOverrides,
  buildJourneyStageOverrideActionModel,
  getActiveJourneyStageOverrides,
} from '../journeyStageOverrideState.js'
import {
  JOURNEY_ENTITY_TYPES,
  JOURNEY_STAGE_ACTIONS,
} from '../journeyStagePolicy.js'

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

const VIEWING_OVERRIDE = {
  id: 'override-1',
  entity_type: JOURNEY_ENTITY_TYPES.buyerLead,
  entity_id: '22222222-2222-4222-8222-222222222222',
  stage_key: 'viewing',
  action_type: JOURNEY_STAGE_ACTIONS.markComplete,
  reason: 'Viewing happened offline.',
  notification_mode: 'internal_only',
  created_at: '2026-08-20T10:00:00.000Z',
}

test('picks the latest active override and honours clear override rows', () => {
  const active = getActiveJourneyStageOverrides([
    VIEWING_OVERRIDE,
    {
      ...VIEWING_OVERRIDE,
      id: 'override-2',
      action_type: JOURNEY_STAGE_ACTIONS.clearOverride,
      created_at: '2026-08-20T11:00:00.000Z',
    },
  ])

  assert.equal(active.has('viewing'), false)
})

test('applies catch-up overrides to allowed rail stages', () => {
  const stages = applyJourneyStageOverrides({
    entityType: JOURNEY_ENTITY_TYPES.buyerLead,
    stages: [
      { key: 'captured', label: 'Captured', done: true, current: true, state: 'current' },
      { key: 'contacted', label: 'Contacted', done: true },
      { key: 'qualification', label: 'Qualification', done: true },
      { key: 'viewing', label: 'Viewing', done: false, detail: 'Not booked' },
      { key: 'offer', label: 'Offer', done: false },
    ],
    overrides: [VIEWING_OVERRIDE],
  })

  const viewing = stages.find((stage) => stage.key === 'viewing')
  const offer = stages.find((stage) => stage.key === 'offer')
  assert.equal(viewing.state, 'completed')
  assert.equal(viewing.done, true)
  assert.equal(viewing.overridden, true)
  assert.equal(viewing.detail, 'Completed by override')
  assert.equal(offer.state, 'current')
})

test('preserves explicitly current stages even when they also have completion evidence', () => {
  const stages = applyJourneyStageOverrides({
    entityType: JOURNEY_ENTITY_TYPES.sellerLead,
    stages: [
      { key: 'new_lead', label: 'New Lead', completed: true, current: true, state: 'current' },
      { key: 'contacted', label: 'Contacted', completed: false, current: false, state: 'upcoming' },
      { key: 'seller_onboarding_sent', label: 'Onboarding Sent', completed: false, current: false, state: 'upcoming' },
    ],
    overrides: [],
  })

  assert.equal(stages.find((stage) => stage.key === 'new_lead').state, 'current')
  assert.equal(stages.find((stage) => stage.key === 'contacted').state, 'upcoming')
  assert.equal(stages.filter((stage) => stage.state === 'current').length, 1)
})

test('does not let mark-complete override finish hard evidence gates', () => {
  const stages = applyJourneyStageOverrides({
    entityType: JOURNEY_ENTITY_TYPES.buyerLead,
    stages: [
      { key: 'captured', label: 'Captured', done: true },
      { key: 'offer', label: 'Offer', done: false },
    ],
    overrides: [{
      ...VIEWING_OVERRIDE,
      stage_key: 'offer',
      action_type: JOURNEY_STAGE_ACTIONS.markComplete,
    }],
  })

  const offer = stages.find((stage) => stage.key === 'offer')
  assert.equal(offer.done, false)
  assert.equal(offer.state, 'current')
  assert.equal(offer.overridden, undefined)
})

test('keeps mark-paid payment review stages current instead of complete', () => {
  const stages = applyJourneyStageOverrides({
    entityType: JOURNEY_ENTITY_TYPES.transaction,
    stages: [
      { key: 'confirmed', label: 'Confirmed', done: true },
      { key: 'reservation_deposit_paid', label: 'Reservation Deposit Paid', done: false },
      { key: 'otp', label: 'OTP', done: false },
    ],
    overrides: [{
      id: 'override-paid',
      entity_type: JOURNEY_ENTITY_TYPES.transaction,
      entity_id: '22222222-2222-4222-8222-222222222222',
      stage_key: 'reservation_deposit_paid',
      action_type: JOURNEY_STAGE_ACTIONS.markPaid,
      reason: 'Buyer paid offline.',
      created_at: '2026-08-20T10:00:00.000Z',
    }],
  })

  const reservation = stages.find((stage) => stage.key === 'reservation_deposit_paid')
  const otp = stages.find((stage) => stage.key === 'otp')
  assert.equal(reservation.state, 'current')
  assert.equal(reservation.done, false)
  assert.equal(reservation.paymentReviewPending, true)
  assert.equal(reservation.detail, 'Marked paid - review required')
  assert.equal(otp.state, 'upcoming')
})

test('builds action models only for non-complete allowed stages', () => {
  const actionModel = buildJourneyStageOverrideActionModel({
    entityType: JOURNEY_ENTITY_TYPES.buyerLead,
    stage: { key: 'viewing', state: 'current' },
  })
  assert.equal(actionModel.actions[0].key, JOURNEY_STAGE_ACTIONS.markComplete)

  const hardGateActionModel = buildJourneyStageOverrideActionModel({
    entityType: JOURNEY_ENTITY_TYPES.buyerLead,
    stage: { key: 'offer', state: 'current' },
  })
  assert.equal(hardGateActionModel.actions.some((action) => action.key === JOURNEY_STAGE_ACTIONS.markComplete), false)
})
