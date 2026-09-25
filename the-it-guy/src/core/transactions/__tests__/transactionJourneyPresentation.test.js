import assert from 'node:assert/strict'
import test from 'node:test'
import { buildBuyerJourneyPresentationModel } from '../../clientPortal/buyerJourneyPresentationModel.js'
import { buildTransactionJourneyPresentation } from '../transactionJourneyPresentation.js'

test('adapts a canonical snapshot without changing its milestone order or progress', () => {
  const model = buildTransactionJourneyPresentation({
    snapshot: {
      schemaVersion: 1,
      version: 'transaction-journey-v1:2026-08-28T10:00:00.000Z',
      transactionId: 'tx-1',
      audience: { role: 'buyer', visibility: 'external' },
      status: 'blocked',
      progressPercent: 34,
      currentMilestoneKey: 'finance',
      currentMilestone: { key: 'finance', label: 'Finance', status: 'blocked' },
      currentWorkflowItem: {
        key: 'feedback_received',
        label: 'Bank feedback',
        ownerLabel: 'Finance Team',
        summary: 'The finance team is waiting for feedback and quotes.',
      },
      milestones: [
        { key: 'otp_signed', label: 'OTP Signed', status: 'complete' },
        { key: 'finance', label: 'Finance', status: 'blocked' },
        { key: 'guarantees', label: 'Guarantees', status: 'upcoming' },
      ],
      derivedAt: '2026-08-28T10:00:00.000Z',
    },
  })

  assert.deepEqual(model.steps.map((step) => step.id), ['otp_signed', 'finance', 'guarantees'])
  assert.deepEqual(model.steps.map((step) => step.status), ['complete', 'current', 'upcoming'])
  assert.equal(model.steps[1].isBlocked, true)
  assert.equal(model.progressPercent, 34)
  assert.equal(model.currentWorkflowItem.ownerLabel, 'Finance Team')
  assert.equal(model.helperMessage, 'The finance team is waiting for feedback and quotes.')
  assert.equal(model.source, 'transaction-journey-snapshot')
})

test('preserves the supplied legacy model when no canonical snapshot is available', () => {
  const fallbackModel = buildBuyerJourneyPresentationModel({
    steps: [{ id: 'offer', label: 'Offer', status: 'current' }],
    source: 'buyer-legacy',
  })

  assert.equal(buildTransactionJourneyPresentation({ fallbackModel }), fallbackModel)
})

test('uses the live fallback when a canonical snapshot is unavailable', () => {
  const fallbackModel = buildBuyerJourneyPresentationModel({
    steps: [{ id: 'finance', label: 'Finance', status: 'current' }],
    source: 'buyer-legacy',
  })

  const model = buildTransactionJourneyPresentation({
    snapshot: { schemaVersion: 1, milestones: [], legalJourney: { status: 'unavailable' } },
    fallbackModel,
  })

  assert.equal(model.source, 'buyer-legacy')
  assert.equal(model.currentStageLabel, 'Finance')
  assert.equal(model.legalJourney.status, 'unavailable')
})

test('keeps the high-level milestone separate from the live workflow item', () => {
  const model = buildTransactionJourneyPresentation({
    snapshot: {
      transactionId: 'tx-transfer',
      highLevelJourney: {
        ruleVersion: 1,
        milestones: [
          { id: 'otp_signed', label: 'OTP', status: 'complete', isComplete: true },
          { id: 'finance', label: 'Finance', status: 'complete', isComplete: true },
          { id: 'transfer', label: 'Transfer', status: 'in_progress', isComplete: false },
          { id: 'lodgement', label: 'Lodged', status: 'pending', isComplete: false },
          { id: 'registration', label: 'Registered', status: 'pending', isComplete: false },
        ],
      },
      currentMilestoneKey: 'transfer',
      currentWorkflowItem: {
        key: 'rates_figures_requested',
        label: 'Rates figures requested',
        ownerLabel: 'Legal Team',
        summary: 'Municipal clearance figures have been requested and the transfer team is waiting for the municipality.',
      },
    },
  })

  assert.equal(model.currentStageLabel, 'Transfer')
  assert.equal(model.currentWorkflowItem.label, 'Rates figures requested')
  assert.equal(model.currentStep.status, 'current')
  assert.equal(model.nextStageLabel, 'Lodged')
  assert.equal(model.completionSummary, '2 of 5')
  assert.equal(model.progressPercent, null)
})
