import assert from 'node:assert/strict'
import {
  buildSellerDocuments,
  buildSellerJourney,
  getSellerJourneyMetrics,
  getSellerJourneyStage,
} from '../src/services/sellerJourneyService.js'

const baseLead = {
  leadId: 'lead-1',
  leadCategory: 'seller',
  createdAt: '2026-06-01T08:00:00Z',
  sellerPropertyAddress: '12 Oak Road',
  estimatedValue: 2500000,
}

{
  const stage = getSellerJourneyStage({ lead: baseLead })
  assert.equal(stage.key, 'contacted')
  assert.equal(stage.label, 'Contacted')
}

{
  const stage = getSellerJourneyStage({
    lead: baseLead,
    appointments: [{ appointmentType: 'seller_valuation', status: 'requested', dateTime: '2026-06-03T10:00:00Z' }],
  })
  assert.equal(stage.key, 'appointment_valuation')
  assert.equal(stage.status, 'Scheduled')
}

{
  const journey = buildSellerJourney({
    lead: baseLead,
    appointments: [{ appointmentType: 'seller_consultation', status: 'completed', completedAt: '2026-06-03T12:00:00Z' }],
  })
  assert.equal(journey.stage.key, 'appointment_valuation')
  assert.equal(journey.steps.find((step) => step.key === 'appointment_valuation').status, 'Completed')
}

{
  const stage = getSellerJourneyStage({
    lead: { ...baseLead, mandatePacketId: 'packet-1' },
    mandatePacketStatus: { packet: { id: 'packet-1', status: 'generated' } },
  })
  assert.equal(stage.key, 'mandate_sent')
  assert.equal(stage.status, 'Draft')
}

{
  const stage = getSellerJourneyStage({
    lead: { ...baseLead, mandatePacketId: 'packet-1' },
    mandatePacketStatus: { packet: { id: 'packet-1', status: 'completed' }, signingSummary: { allSignersSigned: true } },
  })
  assert.equal(stage.key, 'mandate_signed')
  assert.equal(stage.status, 'Signed')
}

{
  const stage = getSellerJourneyStage({
    lead: { ...baseLead, listingId: 'listing-1' },
    listing: { id: 'listing-1', originatingCrmLeadId: 'lead-1', listingStatus: 'seller_lead', mandateStatus: 'signed' },
  })
  assert.equal(stage.key, 'listing_created')
  assert.equal(stage.status, 'Draft')
}

{
  const journey = buildSellerJourney({
    lead: {
      ...baseLead,
      listingId: 'listing-onboarding-sent',
      stage: 'Onboarding Sent',
      status: 'Onboarding Sent',
      sellerOnboardingToken: 'seller-token-1',
      sellerOnboardingStatus: 'sent',
    },
    listing: {
      id: 'listing-onboarding-sent',
      originatingCrmLeadId: 'lead-1',
      listingStatus: 'seller_lead',
      mandateStatus: 'not_started',
      sellerOnboarding: { token: 'seller-token-1', status: 'sent' },
    },
  })
  assert.equal(journey.stage.key, 'seller_onboarding_sent')
  assert.equal(journey.listingCreated, false)
  assert.equal(journey.mandateStatus, 'not_started')
  assert.equal(journey.kpis.find((item) => item.key === 'mandate').value, 'Not started')
  assert.equal(journey.kpis.find((item) => item.key === 'listing').value, 'Not created')
  assert.equal(journey.sellerPortalStatus, 'Sent')
  assert.equal(journey.steps.find((step) => step.key === 'appointment_valuation').state, 'upcoming')
  assert.equal(journey.steps.find((step) => step.key === 'appointment_valuation').status, 'Not scheduled')
  assert.equal(journey.steps.find((step) => step.key === 'seller_onboarding_sent').state, 'current')
  assert.equal(journey.steps.find((step) => step.key === 'mandate_sent').state, 'upcoming')
  assert.equal(journey.steps.find((step) => step.key === 'mandate_signed').state, 'upcoming')
  assert.equal(journey.steps.find((step) => step.key === 'listing_created').state, 'upcoming')
  assert.equal(journey.actions.find((item) => item.id === 'generate_mandate').enabled, false)
}

{
  const journey = buildSellerJourney({
    lead: {
      ...baseLead,
      listingId: 'listing-onboarding-sent-polluted',
      stage: 'Onboarding Sent',
      status: 'Onboarding Sent',
      sellerOnboardingToken: 'seller-token-2',
      sellerOnboardingStatus: 'sent',
    },
    listing: {
      id: 'listing-onboarding-sent-polluted',
      originatingCrmLeadId: 'lead-1',
      listingStatus: 'seller_lead',
      mandateStatus: 'signed',
      sellerOnboarding: { token: 'seller-token-2', status: 'sent' },
    },
  })
  assert.equal(journey.stage.key, 'seller_onboarding_sent')
  assert.equal(journey.listingCreated, false)
  assert.equal(journey.mandateStatus, 'not_started')
  assert.equal(journey.kpis.find((item) => item.key === 'mandate').value, 'Not started')
  assert.equal(journey.kpis.find((item) => item.key === 'listing').value, 'Not created')
  assert.equal(journey.steps.find((step) => step.key === 'mandate_sent').state, 'upcoming')
  assert.equal(journey.steps.find((step) => step.key === 'mandate_signed').state, 'upcoming')
  assert.equal(journey.steps.find((step) => step.key === 'listing_created').state, 'upcoming')
}

{
  const journey = buildSellerJourney({
    lead: { ...baseLead, listingId: 'listing-1' },
    listing: {
      id: 'listing-1',
      originatingCrmLeadId: 'lead-1',
      listingStatus: 'active',
      listingVisibility: 'active_market',
      mandateStatus: 'signed',
      documents: [{ id: 'doc-1', documentType: 'title_deed', status: 'uploaded' }],
    },
  })
  assert.equal(journey.stage.key, 'listing_live')
  assert.equal(journey.listingLive, true)
  assert.equal(journey.steps.find((step) => step.key === 'listing_live').state, 'current')
  assert.equal(journey.kpis.find((item) => item.key === 'mandate').value, 'Signed')
  assert.equal(journey.kpis.find((item) => item.key === 'listing').value, 'Live')
  assert.equal(journey.documents.find((item) => item.label === 'Title Deed').status, 'Uploaded')
  assert.equal(journey.workspaceKpis.find((item) => item.key === 'current_stage').value, 'Listing Live')
  assert.equal(journey.workspaceKpis.find((item) => item.key === 'seller_portal').value, 'Not opened')
  assert.equal(journey.documentsOutstanding, 5)
  assert.equal(journey.actions.find((item) => item.id === 'open_listing').enabled, true)
}

{
  const journey = buildSellerJourney({
    lead: { ...baseLead, listingId: 'listing-docs-1' },
    listing: {
      id: 'listing-docs-1',
      originatingCrmLeadId: 'lead-1',
      listingStatus: 'seller_lead',
      mandateStatus: 'signed',
      documentRequirements: [
        { id: 'req-id', requirement_key: 'seller_id_document', requirement_name: 'Seller ID Document', status: 'required', is_required: true },
        { id: 'req-rates', requirement_key: 'rates_account', requirement_name: 'Rates Account', status: 'required', is_required: true },
      ],
      documents: [
        { id: 'doc-id', requirement_id: 'req-id', document_type: 'seller_id_document', status: 'uploaded', storage_path: 'private-listings/listing-docs-1/id.pdf' },
        { id: 'doc-rates', canonical_requirement_instance_id: 'canonical-rates', document_type: 'rates_account', status: 'approved', file_url: '/rates.pdf' },
      ],
    },
    documents: [],
  })
  assert.equal(journey.documents.length, 2)
  assert.equal(journey.documentsOutstanding, 0)
  assert.equal(journey.documents.find((item) => item.label === 'Seller ID Document').status, 'Uploaded')
  assert.equal(journey.documents.find((item) => item.label === 'Rates Account').status, 'Approved')
}

{
  const journey = buildSellerJourney({
    lead: {
      ...baseLead,
      listingId: 'listing-docs-live',
      sellerOnboardingToken: 'seller-token-3',
      sellerOnboardingStatus: 'completed',
    },
    listing: {
      id: 'listing-docs-live',
      originatingCrmLeadId: 'lead-1',
      listingStatus: 'active',
      listingVisibility: 'active_market',
      mandateStatus: 'signed',
      documentRequirements: [
        { id: 'req-id', requirement_key: 'seller_id_document', requirement_name: 'Seller ID Document', status: 'required', is_required: true },
        { id: 'req-rates', requirement_key: 'rates_account', requirement_name: 'Rates Account', status: 'required', is_required: true },
      ],
      documents: [
        { id: 'doc-id', requirement_id: 'req-id', document_type: 'seller_id_document', status: 'uploaded', storage_path: 'private-listings/listing-docs-live/id.pdf' },
        { id: 'doc-rates', requirement_id: 'req-rates', document_type: 'rates_account', status: 'approved', file_url: '/rates.pdf' },
      ],
    },
  })
  assert.equal(journey.stage.key, 'documents_submitted')
  assert.equal(journey.documentsSubmitted, true)
  assert.equal(journey.steps.find((step) => step.key === 'documents_submitted').state, 'current')
}

{
  const documents = buildSellerDocuments({
    listing: {
      id: 'listing-company-docs',
      listingStatus: 'onboarding_sent',
      sellerOnboardingStatus: 'completed',
      sellerOnboarding: {
        status: 'completed',
        formData: {
          ownershipType: 'company',
          companyName: 'Testing Seller Pty Ltd',
          companyDirectorName: 'Alex Director',
        },
      },
      documents: [
        {
          id: 'doc-company-resolution',
          document_type: 'company_resolution',
          document_name: 'Company resolution.pdf',
          status: 'uploaded',
          storage_path: 'seller-portal/listing-company-docs/company-resolution.pdf',
        },
      ],
    },
  })
  assert.equal(documents.some((item) => item.label === 'Company Registration Documents'), true)
  assert.equal(documents.find((item) => item.label === 'Company Resolution').status, 'Uploaded')
  assert.equal(documents.some((item) => item.label === 'Trust Deed'), false)
}

{
  const documents = buildSellerDocuments({
    listing: {
      id: 'listing-multiple-owner-docs',
      listingStatus: 'onboarding_completed',
      sellerOnboardingStatus: 'completed',
      sellerOnboarding: {
        status: 'completed',
        formData: {
          ownershipType: 'multiple_individuals',
          multipleOwners: [
            { id: 'owner-a', name: 'Alex', surname: 'Owner', maritalRegime: 'single' },
            { id: 'owner-b', name: 'Taylor', surname: 'Owner', maritalRegime: 'married_in_community' },
          ],
        },
      },
    },
  })
  assert.equal(documents.some((item) => item.label === 'Owner 1 ID Document / Passport'), true)
  assert.equal(documents.some((item) => item.label === 'Owner 2 Proof Of Address'), true)
  assert.equal(documents.some((item) => item.label === 'Owner 2 Marriage Certificate'), true)
}

{
  const journey = buildSellerJourney({
    lead: { ...baseLead, listingId: 'listing-docs-2' },
    listing: {
      id: 'listing-docs-2',
      originatingCrmLeadId: 'lead-1',
      listingStatus: 'seller_lead',
      documentRequirements: [
        { id: 'req-title', requirement_key: 'title_deed', requirement_name: 'Title Deed', status: 'required', is_required: true },
        { id: 'req-poa', requirement_key: 'proof_of_address', requirement_name: 'Proof Of Address', status: 'required', is_required: true },
      ],
      documents: [
        { id: 'doc-title', document_type: 'title_deed', status: 'uploaded', file_url: '/title.pdf' },
      ],
    },
  })
  assert.equal(journey.documents.length, 2)
  assert.equal(journey.documentsOutstanding, 1)
  assert.equal(journey.documents.find((item) => item.label === 'Title Deed').status, 'Uploaded')
  assert.equal(journey.documents.find((item) => item.label === 'Proof Of Address').status, 'Outstanding')
}

{
  const metrics = getSellerJourneyMetrics({
    leads: [
      baseLead,
      { ...baseLead, leadId: 'lead-2', listingId: 'listing-2' },
      { leadId: 'buyer-1', leadCategory: 'buyer' },
    ],
    appointments: [
      { leadId: 'lead-1', appointmentType: 'seller_valuation', status: 'completed' },
      { leadId: 'lead-2', appointmentType: 'seller_consultation', status: 'requested' },
    ],
    listings: [
      { id: 'listing-2', originatingCrmLeadId: 'lead-2', listingStatus: 'active', listingVisibility: 'active_market', mandateStatus: 'signed' },
    ],
  })
  assert.equal(metrics.sellerLeads, 2)
  assert.equal(metrics.valuationsScheduled, 2)
  assert.equal(metrics.valuationsCompleted, 1)
  assert.equal(metrics.listingsCreated, 1)
  assert.equal(metrics.listingsLive, 1)
}

console.log('seller journey tests passed')
