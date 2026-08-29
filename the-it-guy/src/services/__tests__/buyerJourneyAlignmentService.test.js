import assert from 'node:assert/strict'
import { buildBuyerJourneyAlignmentModel } from '../buyerJourneyAlignmentService.js'

const freshLead = buildBuyerJourneyAlignmentModel({ evidence: { leadCaptured: true } })
assert.equal(freshLead.currentStageKey, 'contacted')
assert.equal(freshLead.nextAction.key, 'mark_contacted')

const viewing = buildBuyerJourneyAlignmentModel({
  persistedStage: 'viewing',
  evidence: { leadCaptured: true, contacted: true, qualified: true, viewingStarted: true },
})
assert.equal(viewing.currentStageKey, 'viewing')
assert.equal(viewing.nextAction.key, 'progress_from_viewing')

const standardOffer = buildBuyerJourneyAlignmentModel({
  evidence: { leadCaptured: true, contacted: true, qualified: true, viewingCompleted: true, transactionSetupComplete: true },
})
assert.deepEqual(standardOffer.stageOrder.slice(4, 6), ['transaction_setup', 'offer'])
assert.equal(standardOffer.currentStageKey, 'offer')
assert.equal(standardOffer.nextAction.key, 'upload_signed_otp')

const inPersonSetup = buildBuyerJourneyAlignmentModel({
  inPersonOtpFlow: true,
  evidence: { leadCaptured: true, contacted: true, qualified: true, viewingCompleted: true, offerComplete: true },
})
assert.deepEqual(inPersonSetup.stageOrder.slice(4, 6), ['offer', 'transaction_setup'])
assert.equal(inPersonSetup.currentStageKey, 'transaction_setup')
assert.equal(inPersonSetup.nextAction.key, 'complete_transaction_setup')

const staleLeadWithTransaction = buildBuyerJourneyAlignmentModel({
  persistedStage: 'viewing',
  evidence: { leadCaptured: true, transactionCreated: true },
})
assert.equal(staleLeadWithTransaction.currentStageKey, 'transaction')
assert.equal(staleLeadWithTransaction.nextAction.key, 'open_transaction')
assert.equal(staleLeadWithTransaction.stages.every((stage) => stage.done), true)

const persistedOffer = buildBuyerJourneyAlignmentModel({
  persistedStage: 'offer',
  evidence: { leadCaptured: true, offerStarted: true },
})
assert.equal(persistedOffer.stages.find((stage) => stage.key === 'transaction_setup')?.done, true)
assert.equal(persistedOffer.currentStageKey, 'offer')

console.log('buyer journey alignment service tests passed')
