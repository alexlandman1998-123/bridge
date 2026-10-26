import assert from 'node:assert/strict'
import { buildBuyerNextBestActionButtons, checkBuyerNextActionEvidence as check, getBuyerNextActionCompletion } from '../buyerNextActionCompletionService.js'
import { buildBuyerJourneyAlignmentModel as journey } from '../buyerJourneyAlignmentService.js'

const commands = {
  mark_contacted: 'logContact', qualify: 'openQualification', schedule_viewing: 'scheduleViewing',
  progress_from_viewing: 'recordViewingOutcome', send_buyer_onboarding: 'sendOnboarding',
  complete_buyer_onboarding: 'captureOnboarding', upload_signed_otp: 'uploadSignedOtp',
  create_transaction: 'createTransaction', upload_buyer_documents: 'openDocuments',
  open_development: 'openDevelopment', complete_transaction_setup: 'openTransactionSetup', open_transaction: 'openTransaction',
}
for (const [actionKey, expectedCommand] of Object.entries(commands)) {
  const called = []
  const handlers = Object.fromEntries([...Object.values(commands), 'scheduleAnotherViewing'].map(command => [command, async () => { called.push(command); return 'done' }]))
  const actions = buildBuyerNextBestActionButtons(actionKey, handlers)
  assert.ok(actions[0]?.label, `${actionKey} must have a visible action`)
  assert.equal(await actions[0].onClick(), 'done')
  assert.deepEqual(called, [expectedCommand], `${actionKey} must only trigger its own workflow`)
  assert.notEqual(getBuyerNextActionCompletion(actionKey).mode, 'unavailable')
}
const viewing = buildBuyerNextBestActionButtons('progress_from_viewing', { recordViewingOutcome: () => 'outcome', scheduleAnotherViewing: () => 'another' })
assert.equal(viewing[0].onClick(), 'outcome', 'viewing completion must not dispatch an onboarding email')
assert.equal(viewing[1].onClick(), 'another')
assert.deepEqual(buildBuyerNextBestActionButtons('unknown', {}), [])
assert.equal(getBuyerNextActionCompletion('unknown').mode, 'unavailable')

const ready = { contacted: true, qualified: true, viewingCompleted: true }
assert.equal(check({ actionKey: 'send_buyer_onboarding', diagnostic: { onboarding: { token: 'prepared-only', status: 'In Progress' } } }), false)
assert.equal(check({ actionKey: 'send_buyer_onboarding', activities: [{ activityType: 'Buyer Onboarding Sent', outcome: 'Failed' }] }), false)
assert.equal(check({ actionKey: 'send_buyer_onboarding', activities: [{ activityType: 'Buyer Onboarding Sent', outcome: 'Sent' }] }), true)
assert.equal(check({ actionKey: 'complete_buyer_onboarding', diagnostic: { onboarding: { status: 'In Progress' } } }), false)
assert.equal(check({ actionKey: 'complete_buyer_onboarding', diagnostic: { onboarding: { status: 'Submitted', submitted_at: '2026-10-19' } } }), true)
assert.equal(check({ actionKey: 'upload_signed_otp', signedOtpUploaded: true }), false)
assert.equal(check({ actionKey: 'upload_signed_otp', signedOtpUploaded: true, lead: { buyerOtpSignedByAllPartiesConfirmed: true } }), true)
assert.equal(check({ actionKey: 'create_transaction', transactionId: 'tx', diagnostic: { transaction: { stage: 'Buyer Onboarding Pending' } } }), false)
assert.equal(check({ actionKey: 'create_transaction', transactionId: 'tx', rawPayload: { buyerTransactionSetup: { actions: { transaction: { status: 'finalized' } } } } }), true)
for (const rows of [[], [{ required: true, status: 'missing' }], [{ required: true, status: 'rejected', storagePath: 'qa/id.pdf' }]]) {
  assert.equal(check({ actionKey: 'upload_buyer_documents', documentRows: rows, documentsReady: true }), false)
}
const documentRows = [{ required: true, status: 'uploaded', storagePath: 'qa/id.pdf' }]
assert.equal(check({ actionKey: 'upload_buyer_documents', documentRows }), false, 'unrefreshed document evidence cannot complete the journey')
assert.equal(check({ actionKey: 'upload_buyer_documents', documentRows, documentsReady: true }), true)

// Simulate a persisted manual viewing completion, including reopening the lead.
const override = { id: 'manual-view', stage_key: 'viewing', action_type: 'mark_complete', reason: 'Viewing completed in person', effective_at: '2026-10-19T14:00:00Z' }
const reopened = journey({ evidence: { contacted: true, qualified: true }, overrides: JSON.parse(JSON.stringify([override])) })
assert.equal(reopened.nextAction.key, 'send_buyer_onboarding')
assert.equal(reopened.stages.find(stage => stage.key === 'viewing').done, true)
assert.equal(reopened.stages.find(stage => stage.key === 'buyer_onboarding_sent').done, false)
const sequence = [
  ['send_buyer_onboarding', {}],
  ['complete_buyer_onboarding', { buyerOnboardingSent: true }],
  ['upload_signed_otp', { buyerOnboardingSubmitted: true }],
  ['create_transaction', { buyerOnboardingSubmitted: true, offerComplete: true }],
  ['upload_buyer_documents', { buyerOnboardingSubmitted: true, offerComplete: true, transactionCreated: true }],
  ['open_transaction', { buyerOnboardingSubmitted: true, offerComplete: true, transactionCreated: true, buyerDocumentsUploaded: true }],
]
for (const [nextKey, evidence] of sequence) assert.equal(journey({ evidence: { ...ready, ...evidence } }).nextAction.key, nextKey)
console.log('buyer next best action: all command destinations, manual viewing persistence, evidence gates and complete stage sequence passed')

assert.equal(check({ actionKey: 'open_development', lead: { preferredUnitId: 'unit', reservationState: 'reserved' } }), true)
assert.equal(check({ actionKey: 'open_development', lead: { preferredUnitId: 'unit', reservationState: 'expired' } }), false)
assert.equal(check({ actionKey: 'open_development', lead: { reservationState: 'reserved' } }), false)
