import assert from 'node:assert/strict'
import {
  buildSellerReadinessSummary,
  canActivateListing,
  canCreateListing,
  canSendMandate,
  getListingReadiness,
  getNextSellerAction,
  getSellerBlockers,
  getSellerReadiness,
} from '../src/services/sellerReadinessService.js'
import { buildSellerJourney } from '../src/services/sellerJourneyService.js'

const baseLead = {
  leadId: 'seller-1',
  leadCategory: 'seller',
  sellerPropertyAddress: '12 Oak Road',
  sellerPhone: '+27820000000',
  createdAt: '2026-06-01T08:00:00Z',
}

{
  const missingContact = { leadId: 'seller-missing', leadCategory: 'seller', sellerPropertyAddress: '1 Road' }
  const blockers = getSellerBlockers({ lead: missingContact })
  assert.equal(blockers.find((item) => item.id === 'missing_seller_contact').label, 'Missing Seller Contact')
}

{
  const readiness = getSellerReadiness({ lead: baseLead })
  assert.equal(readiness.readinessStatus, 'ready')
  assert.equal(readiness.nextAction.id, 'contact_seller')
  assert.equal(readiness.nextAction.label, 'Contact Seller')
  assert.equal(readiness.actions.find((item) => item.id === 'contact_seller').primary, true)
  assert.equal(readiness.actions.some((item) => item.id === 'schedule_valuation'), false)
}

{
  const journey = buildSellerJourney({
    lead: { ...baseLead, stage: 'Contacted', status: 'Active' },
    appointments: [{ appointmentType: 'seller_valuation', status: 'requested', dateTime: '2026-06-03T10:00:00Z' }],
  })
  const readiness = getSellerReadiness({ lead: { ...baseLead, stage: 'Contacted', status: 'Active' }, journey })
  assert.equal(readiness.nextAction.id, 'send_seller_onboarding')
  assert.equal(readiness.nextAction.label, 'Send Seller Onboarding')
  assert.equal(readiness.actions.some((item) => item.id === 'mark_valuation_complete'), false)
  assert.equal(readiness.actions.some((item) => item.id === 'open_appointment'), false)
}

{
  const phaseMapLead = { ...baseLead, stage: 'Contacted', status: 'Active' }
  const cases = [
    ['new_lead', { key: 'new_lead', label: 'New Lead', status: 'New' }, 'contact_seller', 'Contact Seller'],
    ['contacted', { key: 'contacted', label: 'Contacted', status: 'Active' }, 'send_seller_onboarding', 'Send Seller Onboarding'],
    ['seller_onboarding_sent', { key: 'seller_onboarding_sent', label: 'Onboarding Sent', status: 'Sent' }, 'open_seller_portal', 'Track Seller Onboarding'],
    ['seller_onboarding_submitted', { key: 'seller_onboarding_submitted', label: 'Onboarding Submitted', status: 'Submitted' }, 'generate_mandate', 'Generate Mandate'],
    ['mandate_sent', { key: 'mandate_sent', label: 'Mandate Sent', status: 'Sent' }, 'check_signature_status', 'Track Signature'],
    ['mandate_signed', { key: 'mandate_signed', label: 'Mandate Signed', status: 'Signed' }, 'create_listing', 'Create Listing'],
  ]
  for (const [stageKey, stage, expectedId, expectedLabel] of cases) {
    const journey = {
      isSeller: true,
      stage,
      stageKey,
      onboardingSent: ['seller_onboarding_sent', 'seller_onboarding_submitted', 'mandate_sent', 'mandate_signed'].includes(stageKey),
      onboardingSubmitted: ['seller_onboarding_submitted', 'mandate_sent', 'mandate_signed'].includes(stageKey),
      mandateStatus: stageKey === 'mandate_sent' ? 'sent' : stageKey === 'mandate_signed' ? 'signed' : 'not_started',
      listingCreated: false,
      listingLive: false,
    }
    const nextAction = getNextSellerAction({ lead: phaseMapLead, contact: { phone: phaseMapLead.sellerPhone }, journey })
    assert.equal(nextAction.id, expectedId, `${stageKey} should map to ${expectedId}`)
    assert.equal(nextAction.label, expectedLabel, `${stageKey} should label ${expectedLabel}`)
  }
}

{
  const args = {
    lead: { ...baseLead, mandatePacketId: 'packet-1' },
    mandatePacketStatus: { packet: { id: 'packet-1', status: 'generated' } },
  }
  assert.equal(getNextSellerAction(args).id, 'send_mandate')
}

{
  const args = {
    lead: { ...baseLead, mandatePacketId: 'packet-1' },
    appointments: [{ appointmentType: 'seller_valuation', status: 'completed', completedAt: '2026-06-03T10:00:00Z' }],
    mandatePacketStatus: { packet: { id: 'packet-1', status: 'generated' } },
  }
  assert.equal(canSendMandate(args), false)
  assert.equal(getNextSellerAction(args).id, 'send_mandate')
  assert.equal(getNextSellerAction(args).label, 'Send Mandate')
  assert.equal(getSellerReadiness(args).actions.some((item) => item.id === 'mark_valuation_complete'), false)
}

{
  const args = {
    lead: {
      ...baseLead,
      mandatePacketId: 'packet-1',
      sellerOnboardingToken: 'seller-token-1',
      sellerOnboardingStatus: 'completed',
    },
    appointments: [{ appointmentType: 'seller_valuation', status: 'completed', completedAt: '2026-06-03T10:00:00Z' }],
    mandatePacketStatus: { packet: { id: 'packet-1', status: 'generated' } },
  }
  assert.equal(canSendMandate(args), true)
  assert.equal(getNextSellerAction(args).id, 'send_mandate')
}

{
  const lead = {
    ...baseLead,
    stage: 'mandate_sent',
    status: 'Mandate Sent',
    sellerOnboardingToken: 'seller-token-stale',
    sellerOnboardingStatus: 'sent',
  }
  const journey = buildSellerJourney({ lead })
  const readiness = getSellerReadiness({ lead, journey })
  assert.equal(journey.stage.key, 'mandate_sent')
  assert.equal(readiness.blockers.some((item) => item.id === 'seller_onboarding_not_submitted'), false)
  assert.equal(readiness.nextAction.id, 'generate_mandate')
}

{
  const args = {
    lead: { ...baseLead, mandatePacketId: 'packet-1' },
    appointments: [{ appointmentType: 'seller_valuation', status: 'completed', completedAt: '2026-06-03T10:00:00Z' }],
    mandatePacketStatus: { packet: { id: 'packet-1', status: 'sent' } },
  }
  const readiness = getSellerReadiness(args)
  assert.equal(readiness.readinessStatus, 'action_required')
  assert.equal(readiness.nextAction.id, 'check_signature_status')
  assert.equal(readiness.blockers.find((item) => item.id === 'mandate_signature_outstanding').label, 'Mandate Signature Outstanding')
}

{
  const docs = [
    { documentType: 'id', status: 'approved', url: '/id.pdf' },
    { documentType: 'proof_of_address', status: 'approved', url: '/poa.pdf' },
    { documentType: 'title_deed', status: 'approved', url: '/title.pdf' },
    { documentType: 'rates_account', status: 'approved', url: '/rates.pdf' },
    { documentType: 'mandate', status: 'approved', url: '/mandate.pdf' },
    { documentType: 'seller_uploads', status: 'approved', url: '/upload.pdf' },
  ]
  const args = {
    lead: { ...baseLead, mandatePacketId: 'packet-1' },
    appointments: [{ appointmentType: 'seller_valuation', status: 'completed', completedAt: '2026-06-03T10:00:00Z' }],
    mandatePacketStatus: { packet: { id: 'packet-1', status: 'completed' }, signingSummary: { allSignersSigned: true } },
    documents: docs,
  }
  assert.equal(canCreateListing(args), true)
  assert.equal(getNextSellerAction(args).id, 'create_listing')
}

{
  const args = {
    lead: { ...baseLead, mandatePacketId: 'packet-1' },
    appointments: [{ appointmentType: 'seller_valuation', status: 'completed', completedAt: '2026-06-03T10:00:00Z' }],
    mandatePacketStatus: { packet: { id: 'packet-1', status: 'completed' }, signingSummary: { allSignersSigned: true } },
  }
  const nextAction = getNextSellerAction(args)
  assert.equal(nextAction.id, 'create_listing')
  assert.equal(nextAction.label, 'Create Listing')
  assert.equal(nextAction.reason, 'Required Documents Missing')
}

{
  const listing = {
    id: 'listing-onboarding-shell',
    sellerLeadId: 'seller-1',
    listingStatus: 'onboarding_sent',
    mandateStatus: 'not_started',
    askingPrice: 2500000,
  }
  const journey = buildSellerJourney({
    lead: { ...baseLead, listingId: 'listing-onboarding-shell', sellerOnboardingStatus: 'sent' },
    listing,
  })
  const listingReadiness = getListingReadiness({ lead: { ...baseLead, listingId: 'listing-onboarding-shell' }, listing, journey })
  assert.equal(journey.listingCreated, false)
  assert.equal(listingReadiness.hasListing, false)
  assert.equal(listingReadiness.incompleteItems[0].blocker, 'Listing Not Created')
  assert.equal(canCreateListing({ lead: { ...baseLead, listingId: 'listing-onboarding-shell' }, listing, journey }), false)
}

{
  const listing = {
    id: 'listing-1',
    sellerLeadId: 'seller-1',
    listingStatus: 'draft',
    askingPrice: 2500000,
    description: 'A complete listing description.',
    galleryImages: [{ id: 'photo-1', url: '/photo.jpg' }],
    externalLinks: [{ url: 'https://example.com/listing' }],
    documents: [{ documentType: 'electrical_compliance_certificate', status: 'approved', url: '/coc.pdf' }],
  }
  const journey = buildSellerJourney({
    lead: { ...baseLead, listingId: 'listing-1' },
    listing,
    mandatePacketStatus: { packet: { id: 'packet-1', status: 'completed' }, signingSummary: { allSignersSigned: true } },
  })
  const listingReadiness = getListingReadiness({ lead: baseLead, listing, journey })
  assert.equal(listingReadiness.complete, true)
  assert.equal(canActivateListing({ lead: { ...baseLead, listingId: 'listing-1' }, listing, journey }), true)
  assert.equal(getNextSellerAction({ lead: { ...baseLead, listingId: 'listing-1' }, listing, journey }).id, 'activate_listing')
}

{
  const listing = { id: 'listing-2', sellerLeadId: 'seller-1', listingStatus: 'draft', askingPrice: 0 }
  const journey = buildSellerJourney({
    lead: { ...baseLead, listingId: 'listing-2' },
    listing,
    mandatePacketStatus: { packet: { id: 'packet-1', status: 'completed' }, signingSummary: { allSignersSigned: true } },
  })
  const readiness = getSellerReadiness({ lead: { ...baseLead, listingId: 'listing-2' }, listing, journey })
  assert.equal(readiness.readinessStatus, 'blocked')
  assert.equal(readiness.blockers.some((item) => item.label === 'Missing Photos'), true)
  assert.equal(readiness.blockers.some((item) => item.label === 'Missing Pricing'), true)
}

{
  const summary = buildSellerReadinessSummary({ lead: baseLead })
  assert.equal(summary.kpis.find((item) => item.key === 'readiness').value, 'Ready To Contact Seller')
  assert.equal(summary.kpis.find((item) => item.key === 'next_action').value, 'Contact Seller')
}

console.log('seller readiness tests passed')
