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

