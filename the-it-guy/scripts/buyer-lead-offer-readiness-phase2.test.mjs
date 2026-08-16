import assert from 'node:assert/strict'
import {
  BUYER_LEAD_OFFER_BLOCKERS,
  BUYER_LEAD_OFFER_STATES,
  assessBuyerLeadOfferReadiness,
  formatBuyerLeadOfferReadinessBlocker,
} from '../src/core/leads/buyerLeadOfferReadiness.js'

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

const buyerLead = {
  leadId: 'buyer-lead-1',
  organisationId: 'org-1',
  assignedAgentId: 'agent-1',
  phone: '+27123456789',
  budget: 2_000_000,
  financeType: 'bond',
}

test('buyer lead without listing stays a search opportunity', () => {
  const readiness = assessBuyerLeadOfferReadiness({
    lead: buyerLead,
    qualificationEvidence: { answeredCount: 3, minimumCount: 2, complete: true },
  })

  assert.equal(readiness.state, BUYER_LEAD_OFFER_STATES.searchOpportunity)
  assert.equal(readiness.readyForOffer, false)
  assert.equal(readiness.readyForTransactionOnboarding, false)
  assert.ok(readiness.blockers.includes(BUYER_LEAD_OFFER_BLOCKERS.listingRequiredForOffer))
  assert.equal(
    formatBuyerLeadOfferReadinessBlocker(readiness),
    'Select a listing before sending an offer link. Buyer leads without a listing remain search opportunities.',
  )
})

test('listing interest is not offer-ready until buyer intent is captured', () => {
  const readiness = assessBuyerLeadOfferReadiness({
    lead: { ...buyerLead, listingId: 'listing-1', budget: 0, financeType: '' },
    contact: { phone: '+27123456789' },
    qualificationEvidence: { answeredCount: 1, minimumCount: 2, complete: false },
  })

  assert.equal(readiness.state, BUYER_LEAD_OFFER_STATES.listingInterest)
  assert.equal(readiness.readyForOffer, false)
  assert.ok(readiness.blockers.includes(BUYER_LEAD_OFFER_BLOCKERS.qualificationRequiredForOffer))
})

test('listing, contact, and intent make a buyer lead offer-ready but not transaction-ready', () => {
  const readiness = assessBuyerLeadOfferReadiness({
    lead: { ...buyerLead, listingId: 'listing-1' },
    contact: { email: 'buyer@example.test' },
    qualificationEvidence: { answeredCount: 2, minimumCount: 2, complete: true },
  })

  assert.equal(readiness.state, BUYER_LEAD_OFFER_STATES.offerReady)
  assert.equal(readiness.readyForOffer, true)
  assert.equal(readiness.readyForTransactionOnboarding, false)
})

test('accepted offer or existing transaction unlocks transaction onboarding', () => {
  const accepted = assessBuyerLeadOfferReadiness({
    lead: { ...buyerLead, listingId: 'listing-1' },
    contact: { email: 'buyer@example.test' },
    offers: [{ id: 'offer-1', status: 'accepted' }],
  })
  assert.equal(accepted.state, BUYER_LEAD_OFFER_STATES.acceptedOfferReady)
  assert.equal(accepted.readyForTransactionOnboarding, true)

  const transaction = assessBuyerLeadOfferReadiness({
    lead: { ...buyerLead, listingId: 'listing-1' },
    transactionId: 'transaction-1',
  })
  assert.equal(transaction.state, BUYER_LEAD_OFFER_STATES.transactionReady)
  assert.equal(transaction.readyForTransactionOnboarding, true)
})

console.log('buyer-lead-offer-readiness-phase2: passed')
