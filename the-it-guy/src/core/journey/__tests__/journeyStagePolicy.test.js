import assert from 'node:assert/strict'
import {
  JOURNEY_ENTITY_TYPES,
  JOURNEY_STAGE_ACTIONS,
  JOURNEY_STAGE_POLICY_TYPES,
  getJourneyStageActions,
  getJourneyStagePolicy,
  isJourneyStageCatchUpAllowed,
  isJourneyStageHardGate,
  resolveJourneyCatchUpPlan,
  validateJourneyCatchUpAction,
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

test('allows buyer catch-up through low-risk stages and stops before signed OTP evidence', () => {
  assert.equal(isJourneyStageCatchUpAllowed(JOURNEY_ENTITY_TYPES.buyerLead, 'contacted'), true)
  assert.equal(isJourneyStageCatchUpAllowed(JOURNEY_ENTITY_TYPES.buyerLead, 'qualification'), true)
  assert.equal(isJourneyStageCatchUpAllowed(JOURNEY_ENTITY_TYPES.buyerLead, 'viewing'), true)

  const offerPolicy = getJourneyStagePolicy(JOURNEY_ENTITY_TYPES.buyerLead, 'offer')
  assert.equal(offerPolicy.type, JOURNEY_STAGE_POLICY_TYPES.evidenceRequired)
  assert.equal(offerPolicy.allowCatchUp, false)
  assert.equal(offerPolicy.hardGate, true)
  assert.deepEqual(offerPolicy.evidence, ['signed_otp'])

  const plan = resolveJourneyCatchUpPlan({
    entityType: JOURNEY_ENTITY_TYPES.buyerLead,
    targetStageKey: 'offer',
  })
  assert.equal(plan.canJump, true)
  assert.deepEqual(plan.catchUpStageKeys, ['contacted', 'qualification', 'viewing'])
  assert.equal(plan.targetPolicy.type, JOURNEY_STAGE_POLICY_TYPES.evidenceRequired)
})

test('rejects direct catch-up completion of signed OTP and transaction record stages', () => {
  const otpResult = validateJourneyCatchUpAction({
    entityType: JOURNEY_ENTITY_TYPES.buyerLead,
    stageKey: 'offer',
    actionType: JOURNEY_STAGE_ACTIONS.markComplete,
    reason: 'Signed offline',
  })
  assert.equal(otpResult.valid, false)
  assert.equal(otpResult.code, 'action_not_allowed')

  const transactionResult = validateJourneyCatchUpAction({
    entityType: JOURNEY_ENTITY_TYPES.buyerLead,
    stageKey: 'transaction',
    actionType: JOURNEY_STAGE_ACTIONS.markComplete,
    reason: 'Deal exists',
  })
  assert.equal(transactionResult.valid, false)
  assert.equal(transactionResult.code, 'action_not_allowed')
  assert.equal(isJourneyStageHardGate(JOURNEY_ENTITY_TYPES.buyerLead, 'transaction'), true)
})

test('requires a reason for allowed catch-up stages', () => {
  const missingReason = validateJourneyCatchUpAction({
    entityType: JOURNEY_ENTITY_TYPES.buyerLead,
    stageKey: 'viewing',
    actionType: JOURNEY_STAGE_ACTIONS.markComplete,
  })
  assert.equal(missingReason.valid, false)
  assert.equal(missingReason.code, 'reason_required')

  const withReason = validateJourneyCatchUpAction({
    entityType: JOURNEY_ENTITY_TYPES.buyerLead,
    stageKey: 'viewing',
    actionType: JOURNEY_STAGE_ACTIONS.markComplete,
    reason: 'Viewing happened in person before the appointment was captured.',
  })
  assert.equal(withReason.valid, true)
})

test('keeps seller mandate and seller pack as evidence-required hard gates', () => {
  assert.equal(isJourneyStageCatchUpAllowed(JOURNEY_ENTITY_TYPES.sellerLead, 'valuation_presented'), true)

  const mandate = getJourneyStagePolicy(JOURNEY_ENTITY_TYPES.sellerLead, 'mandate')
  assert.equal(mandate.type, JOURNEY_STAGE_POLICY_TYPES.evidenceRequired)
  assert.deepEqual(mandate.evidence, ['signed_mandate'])
  assert.equal(mandate.allowCatchUp, false)

  const sellerPack = getJourneyStagePolicy(JOURNEY_ENTITY_TYPES.sellerLead, 'seller_pack_signed')
  assert.equal(sellerPack.type, JOURNEY_STAGE_POLICY_TYPES.evidenceRequired)
  assert.deepEqual(sellerPack.evidence, ['signed_seller_pack'])
  assert.equal(sellerPack.hardGate, true)
})

test('models developer reservation deposit as payment review, not catch-up', () => {
  const reservation = getJourneyStagePolicy(JOURNEY_ENTITY_TYPES.developerLead, 'reservation')
  assert.equal(reservation.type, JOURNEY_STAGE_POLICY_TYPES.paymentReview)
  assert.equal(reservation.allowCatchUp, false)
  assert.equal(reservation.hardGate, true)
  assert.deepEqual(getJourneyStageActions(JOURNEY_ENTITY_TYPES.developerLead, 'reservation'), [
    JOURNEY_STAGE_ACTIONS.markPaid,
    JOURNEY_STAGE_ACTIONS.uploadEvidence,
    JOURNEY_STAGE_ACTIONS.reviewPayment,
    JOURNEY_STAGE_ACTIONS.openStage,
  ])

  const markComplete = validateJourneyCatchUpAction({
    entityType: JOURNEY_ENTITY_TYPES.developerLead,
    stageKey: 'reservation',
    actionType: JOURNEY_STAGE_ACTIONS.markComplete,
    reason: 'Buyer says it is paid',
  })
  assert.equal(markComplete.valid, false)
  assert.equal(markComplete.code, 'action_not_allowed')
})

test('does not allow developer lead jumps to silently pass onboarding or reservation gates', () => {
  const otpPlan = resolveJourneyCatchUpPlan({
    entityType: JOURNEY_ENTITY_TYPES.developerLead,
    targetStageKey: 'otp',
  })
  assert.equal(otpPlan.canJump, false)
  assert.deepEqual(otpPlan.catchUpStageKeys, ['contacted', 'qualified', 'viewing'])
  assert.equal(otpPlan.blockedStageKey, 'onboarding_sent')
  assert.equal(otpPlan.blockedPolicy.type, JOURNEY_STAGE_POLICY_TYPES.evidenceRequired)
})

test('keeps transaction lifecycle stages hard-gated after reservation deposit', () => {
  const reservationPlan = resolveJourneyCatchUpPlan({
    entityType: JOURNEY_ENTITY_TYPES.transaction,
    targetStageKey: 'otp',
  })
  assert.equal(reservationPlan.canJump, false)
  assert.deepEqual(reservationPlan.catchUpStageKeys, [])
  assert.equal(reservationPlan.blockedStageKey, 'reservation_deposit_paid')
  assert.equal(reservationPlan.blockedPolicy.type, JOURNEY_STAGE_POLICY_TYPES.paymentReview)

  assert.equal(isJourneyStageHardGate(JOURNEY_ENTITY_TYPES.transaction, 'finance'), true)
  assert.equal(isJourneyStageHardGate(JOURNEY_ENTITY_TYPES.transaction, 'registration'), true)
})
