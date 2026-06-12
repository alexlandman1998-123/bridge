import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createServer } from 'vite'

const packageJson = await readFile(new URL('../package.json', import.meta.url), 'utf8')
const agentLeadsPageSource = await readFile(new URL('../src/pages/AgentLeadsPage.jsx', import.meta.url), 'utf8')
const buyerOfferSubmissionSource = await readFile(new URL('../src/pages/BuyerOfferSubmission.jsx', import.meta.url), 'utf8')
const postViewingOfferPortalSource = await readFile(new URL('../src/pages/PostViewingOfferPortal.jsx', import.meta.url), 'utf8')

assert.match(
  packageJson,
  /"test:offer-to-transaction-scenario-matrix": "node scripts\/offer-to-transaction-scenario-matrix\.test\.mjs"/,
  'package.json should expose the offer-to-transaction scenario matrix test.',
)

for (const signal of [
  'function LeadOfferEdgeCasesPanel',
  'Mark Accepted (Offline)',
  'Mark Deal Fell Through',
  'Buyer withdrew offer',
  'Offer expired',
  'Offer rejected',
  'Deal fell through',
  'Signed OTP outstanding',
]) {
  assert.ok(agentLeadsPageSource.includes(signal), `Agent lead workspace should include "${signal}".`)
}

for (const signal of [
  'Submit Revised Offer',
  'canonicalBanner',
  'This offer is already under review',
]) {
  assert.ok(buyerOfferSubmissionSource.includes(signal), `Buyer offer submission should include "${signal}".`)
}

for (const signal of [
  'Submit revised offer',
  'selectedPropertyBanner',
  'open offer records',
]) {
  assert.ok(postViewingOfferPortalSource.includes(signal), `Post-viewing offer portal should include "${signal}".`)
}

const server = await createServer({
  root: process.cwd(),
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const buyerLifecycle = await server.ssrLoadModule('/src/lib/buyerLifecycleService.js')
  const leadWorkspace = await server.ssrLoadModule('/src/services/agentLeadWorkspaceService.js')

  const { getOfferLifecycleSummary } = buyerLifecycle
  const { buildAgentLeadRows } = leadWorkspace

  const scenarioOffers = {
    acceptedExistingTransaction: {
      id: 'offer-happy',
      buyer_lead_id: 'lead-happy',
      buyer_contact_id: 'contact-happy',
      listing_id: 'listing-happy',
      viewing_appointment_id: 'appt-happy',
      transaction_id: 'tx-happy',
      status: 'converted_to_transaction',
      offer_amount: 3250000,
      accepted_at: '2026-06-01T12:00:00.000Z',
      updated_at: '2026-06-01T12:05:00.000Z',
    },
    sellerCountered: {
      id: 'offer-counter',
      buyer_lead_id: 'lead-counter',
      buyer_contact_id: 'contact-counter',
      listing_id: 'listing-counter-a',
      viewing_appointment_id: 'appt-counter-a',
      status: 'countered',
      offer_amount: 2800000,
      updated_at: '2026-06-02T12:00:00.000Z',
      conditionsJson: {
        sellerCounterTerms: {
          offerAmount: 2850000,
          depositAmount: 250000,
          specialConditions: 'Seller wants a 7 day acceptance window.',
        },
      },
    },
    secondOpenOfferSameListing: {
      id: 'offer-counter-duplicate',
      buyer_lead_id: 'lead-counter',
      buyer_contact_id: 'contact-counter',
      listing_id: 'listing-counter-a',
      viewing_appointment_id: 'appt-counter-a',
      status: 'submitted',
      offer_amount: 2790000,
      submitted_at: '2026-06-02T11:00:00.000Z',
      updated_at: '2026-06-02T11:00:00.000Z',
    },
    multiViewingSinglePropertyOffer: {
      id: 'offer-multi',
      buyer_lead_id: 'lead-multi',
      buyer_contact_id: 'contact-multi',
      listing_id: 'listing-multi-b',
      viewing_appointment_id: 'appt-multi-b',
      status: 'submitted',
      offer_amount: 1985000,
      submitted_at: '2026-06-03T12:00:00.000Z',
      updated_at: '2026-06-03T12:00:00.000Z',
    },
    expiredBeforeSubmit: {
      id: 'offer-expired',
      buyer_lead_id: 'lead-expired',
      buyer_contact_id: 'contact-expired',
      listing_id: 'listing-expired',
      viewing_appointment_id: 'appt-expired',
      status: 'sent_to_buyer',
      offer_amount: 2300000,
      expiry_date: '2026-05-30',
      conditionsJson: { expiryTime: '12:00' },
      updated_at: '2026-05-30T11:00:00.000Z',
    },
    rejectedBySeller: {
      id: 'offer-rejected',
      buyer_lead_id: 'lead-rejected',
      buyer_contact_id: 'contact-rejected',
      listing_id: 'listing-rejected',
      viewing_appointment_id: 'appt-rejected',
      status: 'rejected',
      offer_amount: 2550000,
      rejected_at: '2026-06-04T12:00:00.000Z',
      updated_at: '2026-06-04T12:00:00.000Z',
    },
    onboardingFailedButAccepted: {
      id: 'offer-onboarding-failed',
      buyer_lead_id: 'lead-onboarding-failed',
      buyer_contact_id: 'contact-onboarding-failed',
      listing_id: 'listing-onboarding-failed',
      viewing_appointment_id: 'appt-onboarding-failed',
      transaction_id: 'tx-onboarding-failed',
      status: 'converted_to_transaction',
      offer_amount: 4100000,
      accepted_at: '2026-06-05T12:00:00.000Z',
      updated_at: '2026-06-05T12:10:00.000Z',
    },
    acceptedOtpOutstanding: {
      id: 'offer-otp',
      buyer_lead_id: 'lead-otp',
      buyer_contact_id: 'contact-otp',
      listing_id: 'listing-otp',
      viewing_appointment_id: 'appt-otp',
      transaction_id: 'tx-otp',
      status: 'converted_to_transaction',
      offer_amount: 3600000,
      accepted_at: '2026-06-06T12:00:00.000Z',
      updated_at: '2026-06-06T12:10:00.000Z',
    },
    dealFellThrough: {
      id: 'offer-fallthrough',
      buyer_lead_id: 'lead-fallthrough',
      buyer_contact_id: 'contact-fallthrough',
      listing_id: 'listing-fallthrough',
      viewing_appointment_id: 'appt-fallthrough',
      transaction_id: 'tx-fallthrough',
      status: 'converted_to_transaction',
      offer_amount: 2990000,
      accepted_at: '2026-06-07T12:00:00.000Z',
      updated_at: '2026-06-07T12:10:00.000Z',
    },
  }

  const acceptedSummary = getOfferLifecycleSummary(scenarioOffers.acceptedExistingTransaction)
  assert.equal(acceptedSummary.acceptedOrConverted, true, 'accepted offers linked to transactions should still resolve as converted workflow records')
  assert.equal(acceptedSummary.effectiveStatus, 'converted_to_transaction')

  const counterSummary = getOfferLifecycleSummary(scenarioOffers.sellerCountered)
  assert.equal(counterSummary.effectiveStatus, 'countered')
  assert.equal(counterSummary.buyerCanResubmit, true, 'countered offers should allow a buyer resubmission path')
  assert.equal(counterSummary.counterTerms.offerAmount, 2850000, 'seller counter terms should survive into the lifecycle summary')

  const expiredSummary = getOfferLifecycleSummary(scenarioOffers.expiredBeforeSubmit)
  assert.equal(expiredSummary.effectiveStatus, 'expired', 'past-expiry offer links should self-resolve as expired')
  assert.equal(expiredSummary.terminal, true)
  assert.match(expiredSummary.blockedReason, /expired/i)

  const rejectedSummary = getOfferLifecycleSummary(scenarioOffers.rejectedBySeller)
  assert.equal(rejectedSummary.effectiveStatus, 'rejected')
  assert.equal(rejectedSummary.terminal, true)
  assert.match(rejectedSummary.blockedReason, /rejected/i)

  const contacts = [
    { contactId: 'contact-happy', firstName: 'Happy', lastName: 'Buyer', phone: '+27820000001', email: 'happy@example.test' },
    { contactId: 'contact-counter', firstName: 'Counter', lastName: 'Buyer', phone: '+27820000002', email: 'counter@example.test' },
    { contactId: 'contact-multi', firstName: 'Multi', lastName: 'Buyer', phone: '+27820000003', email: 'multi@example.test' },
    { contactId: 'contact-expired', firstName: 'Expired', lastName: 'Buyer', phone: '+27820000004', email: 'expired@example.test' },
    { contactId: 'contact-rejected', firstName: 'Rejected', lastName: 'Buyer', phone: '+27820000005', email: 'rejected@example.test' },
    { contactId: 'contact-onboarding-failed', firstName: 'Offline', lastName: 'Buyer', phone: '+27820000006', email: 'offline@example.test' },
    { contactId: 'contact-otp', firstName: 'Otp', lastName: 'Buyer', phone: '+27820000007', email: 'otp@example.test' },
    { contactId: 'contact-fallthrough', firstName: 'Restart', lastName: 'Buyer', phone: '+27820000008', email: 'restart@example.test' },
  ]

  const leads = [
    { leadId: 'lead-happy', contactId: 'contact-happy', stage: 'Converted to Transaction', status: 'Converted to Transaction', convertedTransactionId: 'tx-happy', createdAt: '2026-06-01T08:00:00.000Z' },
    { leadId: 'lead-counter', contactId: 'contact-counter', stage: 'Negotiating', status: 'Negotiating', createdAt: '2026-06-02T08:00:00.000Z' },
    { leadId: 'lead-multi', contactId: 'contact-multi', stage: 'Offer Submitted', status: 'Offer Submitted', createdAt: '2026-06-03T08:00:00.000Z' },
    { leadId: 'lead-expired', contactId: 'contact-expired', stage: 'Offer Sent', status: 'Offer Sent', createdAt: '2026-06-04T08:00:00.000Z' },
    { leadId: 'lead-rejected', contactId: 'contact-rejected', stage: 'Nurture', status: 'Nurture', createdAt: '2026-06-05T08:00:00.000Z' },
    { leadId: 'lead-onboarding-failed', contactId: 'contact-onboarding-failed', stage: 'Onboarding', status: 'Onboarding', convertedTransactionId: 'tx-onboarding-failed', createdAt: '2026-06-06T08:00:00.000Z' },
    { leadId: 'lead-otp', contactId: 'contact-otp', stage: 'Onboarding', status: 'Onboarding', convertedTransactionId: 'tx-otp', createdAt: '2026-06-07T08:00:00.000Z' },
    { leadId: 'lead-fallthrough', contactId: 'contact-fallthrough', stage: 'Onboarding', status: 'Onboarding', convertedTransactionId: 'tx-fallthrough', createdAt: '2026-06-08T08:00:00.000Z' },
  ]

  const appointments = [
    { appointmentId: 'appt-happy', leadId: 'lead-happy', contactId: 'contact-happy', listingId: 'listing-happy', title: 'Viewing', status: 'completed', completedAt: '2026-06-01T09:30:00.000Z' },
    { appointmentId: 'appt-counter-a', leadId: 'lead-counter', contactId: 'contact-counter', listingId: 'listing-counter-a', title: 'Viewing', status: 'completed', completedAt: '2026-06-02T09:00:00.000Z' },
    { appointmentId: 'appt-counter-b', leadId: 'lead-counter', contactId: 'contact-counter', listingId: 'listing-counter-b', title: 'Viewing', status: 'completed', completedAt: '2026-06-02T10:00:00.000Z' },
    { appointmentId: 'appt-multi-a', leadId: 'lead-multi', contactId: 'contact-multi', listingId: 'listing-multi-a', title: 'Viewing', status: 'completed', completedAt: '2026-06-03T09:00:00.000Z' },
    { appointmentId: 'appt-multi-b', leadId: 'lead-multi', contactId: 'contact-multi', listingId: 'listing-multi-b', title: 'Viewing', status: 'completed', completedAt: '2026-06-03T10:00:00.000Z' },
    { appointmentId: 'appt-expired', leadId: 'lead-expired', contactId: 'contact-expired', listingId: 'listing-expired', title: 'Viewing', status: 'completed', completedAt: '2026-05-30T09:00:00.000Z' },
    { appointmentId: 'appt-rejected', leadId: 'lead-rejected', contactId: 'contact-rejected', listingId: 'listing-rejected', title: 'Viewing', status: 'completed', completedAt: '2026-06-04T09:00:00.000Z' },
    { appointmentId: 'appt-onboarding-failed', leadId: 'lead-onboarding-failed', contactId: 'contact-onboarding-failed', listingId: 'listing-onboarding-failed', title: 'Viewing', status: 'completed', completedAt: '2026-06-05T09:00:00.000Z' },
    { appointmentId: 'appt-otp', leadId: 'lead-otp', contactId: 'contact-otp', listingId: 'listing-otp', title: 'Viewing', status: 'completed', completedAt: '2026-06-06T09:00:00.000Z' },
    { appointmentId: 'appt-fallthrough', leadId: 'lead-fallthrough', contactId: 'contact-fallthrough', listingId: 'listing-fallthrough', title: 'Viewing', status: 'completed', completedAt: '2026-06-07T09:00:00.000Z' },
  ]

  const offers = Object.values(scenarioOffers)

  const transactions = [
    { id: 'tx-happy', originating_buyer_lead_id: 'lead-happy', buyer_contact_id: 'contact-happy', listing_id: 'listing-happy', current_main_stage: 'OTP', onboarding_status: 'buyer_onboarding_pending', status: 'Transaction' },
    { id: 'tx-onboarding-failed', originating_buyer_lead_id: 'lead-onboarding-failed', buyer_contact_id: 'contact-onboarding-failed', listing_id: 'listing-onboarding-failed', current_main_stage: 'OTP', onboarding_status: 'buyer_onboarding_pending', status: 'Transaction' },
    { id: 'tx-otp', originating_buyer_lead_id: 'lead-otp', buyer_contact_id: 'contact-otp', listing_id: 'listing-otp', current_main_stage: 'OTP', onboarding_status: 'awaiting_signed_otp', status: 'Transaction' },
    { id: 'tx-fallthrough', originating_buyer_lead_id: 'lead-fallthrough', buyer_contact_id: 'contact-fallthrough', listing_id: 'listing-fallthrough', current_main_stage: 'OTP', onboarding_status: 'awaiting_signed_otp', lifecycle_state: 'cancelled', cancelled_at: '2026-06-09T15:00:00.000Z', status: 'Transaction' },
  ]

  const listings = [
    { id: 'listing-happy', listing_status: 'under_offer', suburb: 'Claremont' },
    { id: 'listing-counter-a', listing_status: 'active', suburb: 'Sea Point' },
    { id: 'listing-counter-b', listing_status: 'active', suburb: 'Sea Point' },
    { id: 'listing-multi-a', listing_status: 'active', suburb: 'Sandton' },
    { id: 'listing-multi-b', listing_status: 'active', suburb: 'Sandton' },
    { id: 'listing-expired', listing_status: 'active', suburb: 'Bryanston' },
    { id: 'listing-rejected', listing_status: 'active', suburb: 'Bryanston' },
    { id: 'listing-onboarding-failed', listing_status: 'under_offer', suburb: 'Umhlanga' },
    { id: 'listing-otp', listing_status: 'under_offer', suburb: 'Constantia' },
    { id: 'listing-fallthrough', listing_status: 'under_offer', suburb: 'Constantia' },
  ]

  const communicationDeliveries = [
    {
      id: 'delivery-onboarding-failed',
      lead_id: 'lead-onboarding-failed',
      transaction_id: 'tx-onboarding-failed',
      communication_type: 'client_onboarding',
      channel: 'email',
      recipient: 'offline@example.test',
      status: 'failed',
      error_message: 'Mailbox unavailable',
      failed_at: '2026-06-05T13:00:00.000Z',
    },
  ]

  const rows = buildAgentLeadRows({
    leads,
    contacts,
    appointments,
    offers,
    transactions,
    listings,
    communicationDeliveries,
  })

  const rowsById = new Map(rows.map((row) => [row.leadId, row]))

  const happyRow = rowsById.get('lead-happy')
  assert.equal(happyRow.transactionCount, 1, 'accepted offers with an existing transaction should not duplicate the transaction count')
  assert.equal(happyRow.offers[0].transactionId, 'tx-happy', 'accepted offers should stay linked to the existing transaction workspace')

  const counterRow = rowsById.get('lead-counter')
  assert.equal(counterRow.offerCount, 2, 'counter workflows should keep both live offer records visible to the agent')
  assert.equal(counterRow.appointmentCount, 2, 'counter scenarios should preserve multiple viewed properties for context')
  assert.ok(counterRow.offers.every((offer) => offer.listingId === 'listing-counter-a'), 'duplicate active offers should remain traceable to the same listing')

  const multiRow = rowsById.get('lead-multi')
  assert.equal(multiRow.appointmentCount, 2, 'buyers can view multiple properties before offering on one')
  assert.equal(multiRow.offerCount, 1)
  assert.equal(multiRow.offers[0].listingId, 'listing-multi-b', 'the offer should stay anchored to the specific property the buyer chose')

  const onboardingFailedRow = rowsById.get('lead-onboarding-failed')
  assert.equal(onboardingFailedRow.transactionCount, 1)
  assert.equal(onboardingFailedRow.communicationDeliveries[0].status, 'failed', 'failed onboarding delivery should remain visible in the workspace data')
  assert.equal(onboardingFailedRow.communicationDeliveries[0].communication_type || onboardingFailedRow.communicationDeliveries[0].communicationType, 'client_onboarding')

  const otpRow = rowsById.get('lead-otp')
  assert.equal(otpRow.transactions[0].onboardingStatus, 'awaiting_signed_otp', 'accepted offers should stop at OTP until a signed OTP is received')

  const fallthroughRow = rowsById.get('lead-fallthrough')
  assert.equal(fallthroughRow.transactions[0].lifecycleState, 'cancelled', 'deals that fall through should preserve a cancelled transaction state')
  assert.equal(fallthroughRow.transactions[0].cancelledAt, '2026-06-09T15:00:00.000Z')
} finally {
  await server.close()
}

console.log('offer-to-transaction scenario matrix tests passed')
