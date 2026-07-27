import assert from 'node:assert/strict'

import {
  BUYER_LEAD_LIFECYCLE_STATUSES,
  BUYER_LEAD_LIFECYCLE_STAGES,
  getBuyerLeadLifecycleStageDefinition,
  getBuyerLeadLifecycleStatusForStage,
  normalizeBuyerLeadLifecycleStage,
  resolveBuyerLeadLifecycle,
} from '../buyerLeadLifecycleContract.js'

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

test('canonical buyer lead stages use stable keys and ordered display metadata', () => {
  assert.equal(BUYER_LEAD_LIFECYCLE_STAGES.enquiryReceived, 'enquiry_received')
  assert.equal(BUYER_LEAD_LIFECYCLE_STAGES.transactionCreated, 'transaction_created')

  const viewing = getBuyerLeadLifecycleStageDefinition(BUYER_LEAD_LIFECYCLE_STAGES.viewingScheduled)
  assert.equal(viewing.label, 'Viewing Scheduled')
  assert.equal(viewing.lifecycleStatus, BUYER_LEAD_LIFECYCLE_STATUSES.open)
  assert.equal(viewing.funnelStage, 'Viewing Scheduled')
  assert.equal(viewing.columnId, 'viewing_contacted')
  assert.equal(viewing.order > getBuyerLeadLifecycleStageDefinition(BUYER_LEAD_LIFECYCLE_STAGES.qualified).order, true)
})

test('existing CRM lead stages map into the canonical buyer lifecycle', () => {
  assert.equal(normalizeBuyerLeadLifecycleStage('New Lead'), BUYER_LEAD_LIFECYCLE_STAGES.enquiryReceived)
  assert.equal(normalizeBuyerLeadLifecycleStage('Lead'), BUYER_LEAD_LIFECYCLE_STAGES.enquiryReceived)
  assert.equal(normalizeBuyerLeadLifecycleStage('Contacted'), BUYER_LEAD_LIFECYCLE_STAGES.firstContact)
  assert.equal(normalizeBuyerLeadLifecycleStage('Qualified'), BUYER_LEAD_LIFECYCLE_STAGES.qualified)
  assert.equal(normalizeBuyerLeadLifecycleStage('Appointment Scheduled'), BUYER_LEAD_LIFECYCLE_STAGES.viewingScheduled)
  assert.equal(normalizeBuyerLeadLifecycleStage('Appointment Completed'), BUYER_LEAD_LIFECYCLE_STAGES.viewingCompleted)
  assert.equal(normalizeBuyerLeadLifecycleStage('Offer Draft'), BUYER_LEAD_LIFECYCLE_STAGES.offerDraft)
  assert.equal(normalizeBuyerLeadLifecycleStage('Offer Submitted'), BUYER_LEAD_LIFECYCLE_STAGES.offerSubmitted)
  assert.equal(normalizeBuyerLeadLifecycleStage('Negotiating'), BUYER_LEAD_LIFECYCLE_STAGES.negotiating)
  assert.equal(normalizeBuyerLeadLifecycleStage('Offer Accepted'), BUYER_LEAD_LIFECYCLE_STAGES.offerAccepted)
  assert.equal(normalizeBuyerLeadLifecycleStage('Onboarding Sent'), BUYER_LEAD_LIFECYCLE_STAGES.onboarding)
  assert.equal(normalizeBuyerLeadLifecycleStage('Converted to Transaction'), BUYER_LEAD_LIFECYCLE_STAGES.transactionCreated)
  assert.equal(normalizeBuyerLeadLifecycleStage('Deal Created'), BUYER_LEAD_LIFECYCLE_STAGES.transactionCreated)
  assert.equal(normalizeBuyerLeadLifecycleStage('Registered / Closed'), BUYER_LEAD_LIFECYCLE_STAGES.registered)
  assert.equal(normalizeBuyerLeadLifecycleStage('Nurture / Follow-up Later'), BUYER_LEAD_LIFECYCLE_STAGES.nurture)
  assert.equal(normalizeBuyerLeadLifecycleStage('Lost'), BUYER_LEAD_LIFECYCLE_STAGES.lost)
})

test('buyer lifecycle events, offer statuses, and listing-interest statuses map to stages', () => {
  assert.equal(resolveBuyerLeadLifecycle({ eventType: 'viewing_created' }).stage, BUYER_LEAD_LIFECYCLE_STAGES.viewingScheduled)
  assert.equal(resolveBuyerLeadLifecycle({ eventType: 'offer_accepted' }).stage, BUYER_LEAD_LIFECYCLE_STAGES.offerAccepted)
  assert.equal(resolveBuyerLeadLifecycle({ offerStatus: 'sent_to_seller' }).stage, BUYER_LEAD_LIFECYCLE_STAGES.offerSubmitted)
  assert.equal(resolveBuyerLeadLifecycle({ offerStatus: 'countered' }).stage, BUYER_LEAD_LIFECYCLE_STAGES.negotiating)
  assert.equal(resolveBuyerLeadLifecycle({ offerStatus: 'converted_to_transaction' }).stage, BUYER_LEAD_LIFECYCLE_STAGES.transactionCreated)
  assert.equal(resolveBuyerLeadLifecycle({ listingInterestStatus: 'shortlisted' }).stage, BUYER_LEAD_LIFECYCLE_STAGES.matched)
  assert.equal(resolveBuyerLeadLifecycle({ listingInterestStatus: 'viewing_scheduled' }).stage, BUYER_LEAD_LIFECYCLE_STAGES.viewingScheduled)
})

test('derived fallback signals preserve operational meaning', () => {
  assert.equal(resolveBuyerLeadLifecycle({ converted_transaction_id: 'tx-1' }).stage, BUYER_LEAD_LIFECYCLE_STAGES.transactionCreated)
  assert.equal(resolveBuyerLeadLifecycle({ first_contacted_at: '2026-07-27T10:00:00.000Z' }).stage, BUYER_LEAD_LIFECYCLE_STAGES.firstContact)
  assert.equal(resolveBuyerLeadLifecycle({ assigned_agent_id: 'agent-1' }).stage, BUYER_LEAD_LIFECYCLE_STAGES.assigned)
  assert.equal(resolveBuyerLeadLifecycle({}).stage, BUYER_LEAD_LIFECYCLE_STAGES.enquiryReceived)
})

test('lifecycle status is distinct from the funnel stage', () => {
  assert.equal(getBuyerLeadLifecycleStatusForStage('Offer Accepted'), BUYER_LEAD_LIFECYCLE_STATUSES.open)
  assert.equal(getBuyerLeadLifecycleStatusForStage('Converted To Transaction'), BUYER_LEAD_LIFECYCLE_STATUSES.converted)
  assert.equal(getBuyerLeadLifecycleStatusForStage('Registered'), BUYER_LEAD_LIFECYCLE_STATUSES.closed)
  assert.equal(getBuyerLeadLifecycleStatusForStage('Lost'), BUYER_LEAD_LIFECYCLE_STATUSES.lost)
  assert.equal(resolveBuyerLeadLifecycle('Finance').funnelStage, 'Converted')
})

console.log('buyerLeadLifecycleContract tests passed')
