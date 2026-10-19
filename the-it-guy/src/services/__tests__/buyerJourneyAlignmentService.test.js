import assert from 'node:assert/strict'
import {
  buildBuyerJourneyAlignmentModel as build,
  hasBuyerOnboardingSentEvidence,
  hasBuyerOnboardingSubmittedEvidence,
  hasBuyerSignedOtpEvidence,
  hasBuyerTransactionCreatedEvidence,
  summarizeBuyerJourneyDocuments,
  summarizeBuyerJourneyReadiness,
} from '../buyerJourneyAlignmentService.js'
import { getBuyerProcessDefinition } from '../buyerProcessDefinitionService.js'
import { getJourneyStagePolicy } from '../../core/journey/journeyStagePolicy.js'

const order = ['captured', 'contacted', 'qualified', 'viewing', 'buyer_onboarding_sent', 'buyer_onboarding_submitted', 'offer', 'transaction', 'buyer_documents_uploaded']
const ready = { contacted: true, qualified: true, viewingCompleted: true }
assert.equal(build().currentStageKey, 'contacted')
for (const profile of ['default_residential', 'kingstons_residential']) {
  assert.deepEqual(getBuyerProcessDefinition({ buyerProcessProfile: profile }).activeStageKeys, order)
  assert.deepEqual(build({ inPersonOtpFlow: profile === 'kingstons_residential' }).stageOrder, order)
}
const milestoneEvidence = ['leadCaptured', 'contacted', 'qualified', 'viewingCompleted', 'buyerOnboardingSent', 'buyerOnboardingSubmitted', 'offerComplete', 'transactionCreated', 'buyerDocumentsUploaded']
const evidence = { leadCaptured: true }
for (let index = 1; index < order.length; index++) {
  const model = build({ evidence })
  assert.equal(model.currentStageKey, order[index])
  assert.equal(model.stages[index].done, false)
  evidence[milestoneEvidence[index]] = true
}
const complete = build({ evidence })
assert.equal(complete.stages.every(stage => stage.done), true)
assert.equal(complete.nextAction.key, 'open_transaction')
assert.equal(build({ evidence: ready }).nextAction.key, 'send_buyer_onboarding')
assert.equal(build({ evidence: { ...ready, buyerOnboardingSent: true } }).nextAction.key, 'complete_buyer_onboarding')
assert.equal(build({ evidence: { ...ready, buyerOnboardingSubmitted: true } }).nextAction.key, 'upload_signed_otp')
assert.equal(build({ evidence: { ...ready, buyerOnboardingSubmitted: true, offerComplete: true } }).nextAction.key, 'create_transaction')
assert.equal(build({ evidence: { ...ready, buyerOnboardingSubmitted: true, offerComplete: true, transactionCreated: true } }).nextAction.key, 'upload_buyer_documents')

// Neither a board drag nor a transaction may fabricate the missing onboarding/document evidence.
for (const persistedStage of ['Offer', 'Transaction', 'Buyer documents uploaded', 'Transaction Setup']) {
  const model = build({ persistedStage, evidence: { ...ready, transactionCreated: true } })
  assert.equal(model.currentStageKey, 'buyer_onboarding_sent')
  for (const key of ['buyer_onboarding_sent', 'buyer_onboarding_submitted', 'offer', 'buyer_documents_uploaded']) {
    assert.equal(model.stages.find(stage => stage.key === key).done, false)
    assert.equal(getJourneyStagePolicy('buyer_lead', key).allowCatchUp, false)
  }
}
assert.equal(build({ persistedStage: 'viewing', evidence: { viewingScheduled: true } }).nextAction.key, 'progress_from_viewing')
assert.equal(build({ persistedStage: 'viewing' }).nextAction.key, 'schedule_viewing')
assert.equal(build({ evidence: { ...ready, buyerDocumentsUploaded: true } }).currentStageKey, 'buyer_onboarding_sent')

for (const status of ['submitted', 'completed', 'client_onboarding_complete', 'awaiting_signed_otp']) assert.equal(hasBuyerOnboardingSubmittedEvidence({ status }), true)
for (const status of ['incomplete', 'prepared', 'failed', 'signed_otp_received']) assert.equal(hasBuyerOnboardingSubmittedEvidence({ status }), false)
assert.equal(hasBuyerOnboardingSubmittedEvidence({ onboarding: { submitted_at: '2026-10-19' } }), true)
const activity = outcome => ({ activityType: 'Buyer Onboarding Sent', outcome })
assert.equal(hasBuyerOnboardingSentEvidence({ activities: [activity('Sent')] }), true)
for (const outcome of ['Prepared', 'Failed', 'Queued']) assert.equal(hasBuyerOnboardingSentEvidence({ activities: [activity(outcome)] }), false)
assert.equal(hasBuyerOnboardingSentEvidence({ onboarding: { token: 'a-link' } }), false)
assert.equal(hasBuyerOnboardingSentEvidence({ onboarding: { status: 'sent' } }), true)
assert.equal(hasBuyerOnboardingSentEvidence({ onboarding: { sent_at: '2026-10-19' } }), true)
assert.equal(hasBuyerOnboardingSentEvidence({ submitted: true }), true)
assert.equal(hasBuyerSignedOtpEvidence({ documentUploaded: true }), false)
assert.equal(hasBuyerSignedOtpEvidence({ documentUploaded: true, acceptedOffer: { status: 'accepted' } }), false)
assert.equal(hasBuyerSignedOtpEvidence({ documentUploaded: true, rawPayload: { buyerOtpDocument: { metadata: { signedByAllPartiesConfirmed: true } } } }), true)
assert.equal(hasBuyerSignedOtpEvidence({ documentUploaded: false, lead: { buyerOtpSignedByAllPartiesConfirmed: true } }), false)
for (const stage of ['Buyer Onboarding Pending', 'Transaction Setup', 'Onboarding']) {
  assert.equal(hasBuyerTransactionCreatedEvidence({ transactionId: 'tx', transaction: { stage } }), false)
}
assert.equal(hasBuyerTransactionCreatedEvidence({ transactionId: 'tx', transaction: { stage: 'Finance' } }), true)
assert.equal(hasBuyerTransactionCreatedEvidence({ transactionId: 'tx', rawPayload: { buyerTransactionSetup: { actions: { transaction: { status: 'finalized' } } } } }), true)
assert.equal(hasBuyerTransactionCreatedEvidence({ lead: { stage: 'Transaction' } }), false)

const upload = { required: true, status: 'under_review', storagePath: 'buyer/id.pdf' }
assert.equal(summarizeBuyerJourneyDocuments([upload]).complete, true)
assert.equal(summarizeBuyerJourneyDocuments([upload], { ready: false }).complete, false)
assert.equal(summarizeBuyerJourneyDocuments([]).complete, false)
assert.equal(summarizeBuyerJourneyDocuments([upload, { required: true, status: 'missing' }]).complete, false)
for (const status of ['rejected', 'expired', 'uploaded_unmatched', 'handoff_pending']) assert.equal(summarizeBuyerJourneyDocuments([{ ...upload, status }]).complete, false)
for (const row of [{ required: false }, { applicable: false }, { status: 'waived' }, { applicability_override: 'removed' }]) {
  assert.equal(summarizeBuyerJourneyDocuments([upload, row]).complete, true)
}
assert.equal(summarizeBuyerJourneyDocuments([{ required: true, status: 'approved' }]).complete, false)
console.log('buyer journey alignment service tests passed')

assert.deepEqual(summarizeBuyerJourneyReadiness([]), { completed: 0, total: 0, percent: 0 })
// Every milestone, including onboarding and documents, changes the header score.
const readinessEvidence = { leadCaptured: true }
for (let index = 0; index < milestoneEvidence.length; index++) {
  readinessEvidence[milestoneEvidence[index]] = true
  const summary = summarizeBuyerJourneyReadiness(build({ evidence: readinessEvidence }).stages)
  assert.deepEqual(summary, { completed: index + 1, total: 9, percent: Math.round((index + 1) / 9 * 100) })
}
// Out-of-order evidence counts once; merely starting a step does not complete it.
assert.equal(summarizeBuyerJourneyReadiness(build({ evidence: { viewingScheduled: true, buyerDocumentsUploaded: true } }).stages).completed, 2)
assert.equal(summarizeBuyerJourneyReadiness(complete.stages).percent, 100)
console.log('buyer journey readiness tests passed')

// Successful onboarding delivery catches up the early CRM steps, then awaits a
// real submission. Preparing a manual form does not supply delivery evidence.
const sentJourney = build({ evidence: { buyerOnboardingSent: true } })
assert.equal(sentJourney.currentStageKey, 'buyer_onboarding_submitted')
assert.equal(sentJourney.stages.slice(0, 5).every(stage => stage.done), true)
assert.equal(sentJourney.stages.slice(5).some(stage => stage.done), false)
assert.equal(build({ evidence: { transactionSetupStarted: true } }).currentStageKey, 'contacted')
