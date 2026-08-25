import assert from 'node:assert/strict'
import {
  buildSellerDocuments,
  buildSellerJourney,
  getSellerJourneyMetrics,
  getSellerJourneyStage,
} from '../src/services/sellerJourneyService.js'
import { buildDirectListingIntakePayload } from '../src/lib/directListingIntakeModel.js'

const baseLead = {
  leadId: 'lead-1',
  leadCategory: 'seller',
  createdAt: '2026-06-01T08:00:00Z',
  sellerPropertyAddress: '12 Oak Road',
  estimatedValue: 2500000,
}

const expectedStepKeys = [
  'new_lead',
  'contacted',
  'seller_onboarding_sent',
  'seller_onboarding_submitted',
  'mandate_signed',
  'listing_created',
  'listing_live',
  'documents_submitted',
]

function assertJourneyStepStates(journey, currentKey, completedKeys = []) {
  assert.deepEqual(journey.steps.map((step) => step.key), expectedStepKeys)
  for (const key of expectedStepKeys) {
    const step = journey.steps.find((item) => item.key === key)
    assert.equal(Boolean(step), true, `expected journey step ${key}`)
    if (key === currentKey) {
      assert.equal(step.state, 'current', `${key} should be current`)
    } else if (completedKeys.includes(key)) {
      assert.equal(step.state, 'completed', `${key} should be completed`)
    } else {
      assert.equal(step.state, 'upcoming', `${key} should be upcoming`)
    }
  }
}

{
  const stage = getSellerJourneyStage({ lead: baseLead })
  assert.equal(stage.key, 'new_lead')
  assert.equal(stage.label, 'New Lead')
}

{
  const journey = buildSellerJourney({
    lead: {
      ...baseLead,
      stage: 'New Lead',
      status: 'New',
    },
  })
  assert.equal(journey.stage.key, 'new_lead')
  assert.equal(journey.stage.status, 'New')
  assertJourneyStepStates(journey, 'new_lead', [])
}

{
  const stage = getSellerJourneyStage({
    lead: baseLead,
    appointments: [{ appointmentType: 'seller_valuation', status: 'requested', dateTime: '2026-06-03T10:00:00Z' }],
  })
  assert.equal(stage.key, 'new_lead')
  assert.equal(stage.status, 'New')
}

{
  const stage = getSellerJourneyStage({
    lead: baseLead,
    appointments: [{ appointmentType: 'other', customTypeLabel: 'Seller Appointment', status: 'confirmed', dateTime: '2026-06-03T10:00:00Z' }],
  })
  assert.equal(stage.key, 'new_lead')
  assert.equal(stage.status, 'New')
}

{
  const journey = buildSellerJourney({
    lead: baseLead,
    appointments: [{ appointmentType: 'seller_consultation', status: 'completed', completedAt: '2026-06-03T12:00:00Z' }],
  })
  assert.equal(journey.stage.key, 'new_lead')
  assert.equal(journey.steps.some((step) => step.key === 'appointment_valuation'), false)
  assert.equal(Object.prototype.hasOwnProperty.call(journey, 'valuationAppointment'), false)
  assert.equal(Object.prototype.hasOwnProperty.call(journey, 'valuationStatus'), false)
}

{
  const stage = getSellerJourneyStage({
    lead: { ...baseLead, mandatePacketId: 'packet-1' },
    mandatePacketStatus: { packet: { id: 'packet-1', status: 'generated' } },
  })
  assert.equal(stage.key, 'seller_onboarding_submitted')
  assert.equal(stage.status, 'Submitted')
}

{
  const journey = buildSellerJourney({
    lead: {
      ...baseLead,
      stage: 'Seller Onboarding Submitted',
      status: 'Submitted',
      mandatePacketId: 'packet-generated',
      sellerOnboardingStatus: 'completed',
    },
    mandatePacketStatus: {
      state: 'pdf_generated',
      packet: {
        id: 'packet-generated',
        status: 'generated',
        sent_at: null,
        completed_at: null,
      },
      signingSummary: { signers: [] },
    },
  })
  assert.equal(journey.mandateStatus, 'draft')
  assert.equal(journey.stage.key, 'seller_onboarding_submitted')
  assert.equal(journey.stage.status, 'Submitted')
  assert.equal(journey.actions.some((item) => item.id === 'send_mandate'), false)
  assert.equal(journey.actions.find((item) => item.id === 'open_documents')?.label, 'Open Documents')
}

{
  const journey = buildSellerJourney({
    lead: {
      ...baseLead,
      stage: 'Seller Onboarding Submitted',
      status: 'Submitted',
      mandatePacketId: 'packet-status-only-sent',
      sellerOnboardingStatus: 'completed',
    },
    mandatePacketStatus: {
      state: 'sent',
      packet: {
        id: 'packet-status-only-sent',
        status: 'sent',
        sent_at: null,
        completed_at: null,
      },
      signingSummary: {
        signers: [{ signer_role: 'seller', status: 'pending', signing_token: 'prepared-token' }],
      },
    },
  })
  assert.equal(journey.mandateStatus, 'draft')
  assert.equal(journey.stage.key, 'seller_onboarding_submitted')
  assert.equal(journey.actions.some((item) => item.id === 'send_mandate'), false)
  assert.equal(journey.actions.find((item) => item.id === 'open_documents')?.label, 'Open Documents')
}

{
  const journey = buildSellerJourney({
    lead: {
      ...baseLead,
      mandatePacketId: 'packet-sent-at',
      sellerOnboardingStatus: 'completed',
    },
    mandatePacketStatus: {
      state: 'sent',
      packet: {
        id: 'packet-sent-at',
        status: 'sent',
        sent_at: '2026-08-03T08:05:00Z',
        completed_at: null,
      },
      signingSummary: {
        signers: [{ signer_role: 'seller', status: 'pending', signing_token: 'prepared-token' }],
      },
    },
  })
  assert.equal(journey.mandateStatus, 'sent')
  assert.equal(journey.actions.some((item) => item.id === 'view_signing_status'), false)
  assert.equal(journey.actions.find((item) => item.id === 'open_documents')?.enabled, true)
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
  const directListingPayload = buildDirectListingIntakePayload({
    sellerType: 'individual',
    sellerName: 'Dina',
    sellerSurname: 'Direct',
    sellerEmail: 'dina@example.com',
    sellerPhone: '+27 82 222 3333',
    propertyAddress: '14 Direct Listing Road',
    propertyStructureType: 'full_title',
    hasSignedMandate: false,
    hasSignedPropertyConditionDisclosure: false,
    hasSignedFicaForm: false,
    sellerPortalInviteRequested: true,
  })
  const journey = buildSellerJourney({
    lead: {
      ...baseLead,
      listingId: 'listing-direct-created',
    },
    listing: {
      id: 'listing-direct-created',
      originatingCrmLeadId: 'lead-1',
      listingStatus: 'seller_lead',
      listingVisibility: 'internal',
      mandateStatus: 'not_started',
      directListingIntake: directListingPayload,
      sellerOnboarding: {
        status: 'not_started',
        formData: directListingPayload.sellerOnboardingFormData,
      },
    },
  })
  assert.equal(journey.stage.key, 'listing_created')
  assert.equal(journey.listingCreated, true)
  assert.equal(journey.listingLive, false)
  assert.equal(journey.mandateStatus, 'not_started')
  assert.equal(journey.kpis.find((item) => item.key === 'listing').value, 'Draft')
  assert.equal(journey.steps.find((step) => step.key === 'listing_created').state, 'current')
  assert.equal(journey.steps.find((step) => step.key === 'listing_created').completed, true)
  assert.equal(journey.steps.find((step) => step.key === 'listing_live').state, 'upcoming')
  assert.equal(journey.actions.find((item) => item.id === 'create_listing').enabled, false)
  assert.equal(journey.actions.find((item) => item.id === 'open_listing').enabled, true)
  assert.equal(journey.actions.find((item) => item.id === 'activate_listing').enabled, false)
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
  assert.equal(journey.steps.find((step) => step.key === 'seller_onboarding_sent').state, 'current')
  assert.equal(journey.steps.some((step) => step.key === 'mandate_sent'), false)
  assert.equal(journey.steps.find((step) => step.key === 'mandate_signed').state, 'upcoming')
  assert.equal(journey.steps.find((step) => step.key === 'listing_created').state, 'upcoming')
  assert.equal(journey.actions.some((item) => item.id === 'generate_mandate'), false)
}

{
  const journey = buildSellerJourney({
    lead: {
      ...baseLead,
      listingId: 'listing-onboarding-sent-active-shell',
      stage: 'Onboarding Sent',
      status: 'Sent',
      sellerOnboardingToken: 'seller-token-active-shell',
      sellerOnboardingStatus: 'sent',
    },
    listing: {
      id: 'listing-onboarding-sent-active-shell',
      originatingCrmLeadId: 'lead-1',
      listingStatus: 'seller_lead',
      status: 'active',
      listingVisibility: 'internal',
      isActive: true,
      source: 'pipeline_seller_lead',
      mandateStatus: 'not_started',
      sellerOnboardingStatus: 'sent',
      sellerOnboarding: { token: 'seller-token-active-shell', status: 'sent' },
    },
  })
  assert.equal(journey.stage.key, 'seller_onboarding_sent')
  assert.equal(journey.listingCreated, false)
  assert.equal(journey.listingLive, false)
  assert.equal(journey.kpis.find((item) => item.key === 'listing').value, 'Not created')
  assert.equal(journey.steps.find((step) => step.key === 'seller_onboarding_sent').state, 'current')
  assert.equal(journey.steps.find((step) => step.key === 'listing_created').state, 'upcoming')
  assert.equal(journey.steps.find((step) => step.key === 'listing_live').state, 'upcoming')
}

{
  const journey = buildSellerJourney({
    lead: {
      ...baseLead,
      listingId: 'listing-onboarding-sent-with-stale-submitted-stage',
      stage: 'Seller Onboarding Submitted',
      status: 'Submitted',
      sellerOnboardingToken: 'seller-token-stale-stage',
      sellerOnboardingStatus: 'sent',
    },
    listing: {
      id: 'listing-onboarding-sent-with-stale-submitted-stage',
      originatingCrmLeadId: 'lead-1',
      listingStatus: 'onboarding_sent',
      mandateStatus: 'not_started',
      sellerOnboarding: { token: 'seller-token-stale-stage', status: 'sent' },
    },
  })
  assert.equal(journey.onboardingSent, true)
  assert.equal(journey.onboardingSubmitted, true)
  assert.equal(journey.stage.key, 'seller_onboarding_sent')
  assert.equal(journey.steps.find((step) => step.key === 'seller_onboarding_sent').state, 'current')
  assert.equal(journey.steps.find((step) => step.key === 'seller_onboarding_submitted').state, 'completed')
  assert.equal(journey.actions.some((item) => item.id === 'generate_mandate'), false)
  assert.equal(journey.actions.find((item) => item.id === 'open_documents').enabled, true)
}

{
  const journey = buildSellerJourney({
    lead: {
      ...baseLead,
      stage: 'Seller Onboarding Sent',
      status: 'Sent',
    },
  })
  assert.equal(journey.onboardingSent, true)
  assert.equal(journey.onboardingSubmitted, false)
  assert.equal(journey.stage.key, 'seller_onboarding_sent')
}

{
  const journey = buildSellerJourney({
    lead: {
      ...baseLead,
      stage: 'Seller Onboarding Submitted',
      status: 'Submitted',
    },
  })
  assert.equal(journey.onboardingSent, true)
  assert.equal(journey.onboardingSubmitted, true)
  assert.equal(journey.stage.key, 'seller_onboarding_submitted')
}

{
  const journey = buildSellerJourney({
    lead: {
      ...baseLead,
      listingId: 'listing-onboarding-active',
      stage: 'Seller Onboarding Submitted',
      status: 'Submitted',
      sellerOnboardingToken: 'seller-token-active',
      sellerOnboardingStatus: 'submitted',
    },
    listing: {
      id: 'listing-onboarding-active',
      originatingCrmLeadId: 'lead-1',
      listingStatus: 'active',
      listingVisibility: 'active_market',
      mandateStatus: 'not_started',
      sellerOnboarding: { token: 'seller-token-active', status: 'submitted' },
    },
  })
  assert.equal(journey.stage.key, 'listing_live')
  assert.equal(journey.listingCreated, true)
  assert.equal(journey.listingLive, true)
  assert.equal(journey.mandateStatus, 'not_started')
  assert.equal(journey.kpis.find((item) => item.key === 'listing').value, 'Live')
  assert.equal(journey.steps.find((step) => step.key === 'seller_onboarding_submitted').state, 'completed')
  assert.equal(journey.steps.some((step) => step.key === 'mandate_sent'), false)
  assert.equal(journey.steps.find((step) => step.key === 'mandate_signed').state, 'upcoming')
  assert.equal(journey.steps.find((step) => step.key === 'listing_created').state, 'completed')
  assert.equal(journey.steps.find((step) => step.key === 'listing_live').state, 'current')
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
  assert.equal(journey.steps.some((step) => step.key === 'mandate_sent'), false)
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
  assert.equal(journey.documentsOutstanding, 6)
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
  const journeyCases = [
    {
      currentKey: 'new_lead',
      args: { lead: baseLead },
      completed: [],
    },
    {
      currentKey: 'seller_onboarding_sent',
      args: {
        lead: {
          ...baseLead,
          stage: 'Seller Onboarding Sent',
          status: 'Sent',
          sellerOnboardingToken: 'seller-token-matrix-sent',
          sellerOnboardingStatus: 'sent',
        },
      },
      completed: ['new_lead', 'contacted'],
    },
    {
      currentKey: 'seller_onboarding_submitted',
      args: {
        lead: {
          ...baseLead,
          stage: 'Seller Onboarding Submitted',
          status: 'Submitted',
          sellerOnboardingToken: 'seller-token-matrix-submitted',
          sellerOnboardingStatus: 'completed',
        },
      },
      completed: ['new_lead', 'contacted', 'seller_onboarding_sent'],
    },
    {
      currentKey: 'seller_onboarding_submitted',
      args: {
        lead: {
          ...baseLead,
          mandatePacketId: 'packet-matrix-sent',
          sellerOnboardingStatus: 'completed',
        },
        mandatePacketStatus: { packet: { id: 'packet-matrix-sent', status: 'sent' } },
      },
      completed: ['new_lead', 'contacted', 'seller_onboarding_sent', 'seller_onboarding_submitted'],
    },
    {
      currentKey: 'mandate_signed',
      args: {
        lead: {
          ...baseLead,
          mandatePacketId: 'packet-matrix-signed',
          sellerOnboardingStatus: 'completed',
        },
        mandatePacketStatus: { packet: { id: 'packet-matrix-signed', status: 'completed' }, signingSummary: { allSignersSigned: true } },
      },
      completed: ['new_lead', 'contacted', 'seller_onboarding_sent', 'seller_onboarding_submitted'],
    },
    {
      currentKey: 'listing_created',
      args: {
        lead: {
          ...baseLead,
          listingId: 'listing-matrix-created',
          sellerOnboardingStatus: 'completed',
        },
        listing: {
          id: 'listing-matrix-created',
          originatingCrmLeadId: 'lead-1',
          listingStatus: 'mandate_signed',
          mandateStatus: 'signed',
        },
      },
      completed: ['new_lead', 'contacted', 'seller_onboarding_sent', 'seller_onboarding_submitted', 'mandate_signed'],
    },
    {
      currentKey: 'listing_live',
      args: {
        lead: {
          ...baseLead,
          listingId: 'listing-matrix-live',
          sellerOnboardingStatus: 'completed',
        },
        listing: {
          id: 'listing-matrix-live',
          originatingCrmLeadId: 'lead-1',
          listingStatus: 'active',
          listingVisibility: 'active_market',
          mandateStatus: 'signed',
        },
      },
      completed: ['new_lead', 'contacted', 'seller_onboarding_sent', 'seller_onboarding_submitted', 'mandate_signed', 'listing_created'],
    },
    {
      currentKey: 'documents_submitted',
      args: {
        lead: {
          ...baseLead,
          listingId: 'listing-matrix-documents',
          sellerOnboardingStatus: 'completed',
        },
        listing: {
          id: 'listing-matrix-documents',
          originatingCrmLeadId: 'lead-1',
          listingStatus: 'active',
          listingVisibility: 'active_market',
          mandateStatus: 'signed',
          documentRequirements: [
            { id: 'req-id', requirement_key: 'seller_id_document', requirement_name: 'Seller ID Document', status: 'required', is_required: true },
            { id: 'req-rates', requirement_key: 'rates_account', requirement_name: 'Rates Account', status: 'required', is_required: true },
          ],
          documents: [
            { id: 'doc-id', requirement_id: 'req-id', document_type: 'seller_id_document', status: 'uploaded', storage_path: 'private-listings/listing-matrix-documents/id.pdf' },
            { id: 'doc-rates', requirement_id: 'req-rates', document_type: 'rates_account', status: 'approved', file_url: '/rates.pdf' },
          ],
        },
      },
      completed: ['new_lead', 'contacted', 'seller_onboarding_sent', 'seller_onboarding_submitted', 'mandate_signed', 'listing_created', 'listing_live'],
    },
  ]

  for (const item of journeyCases) {
    const journey = buildSellerJourney(item.args)
    assert.equal(journey.stage.key, item.currentKey)
    assertJourneyStepStates(journey, item.currentKey, item.completed)
  }
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
  assert.equal(Object.prototype.hasOwnProperty.call(metrics, 'valuationsScheduled'), false)
  assert.equal(Object.prototype.hasOwnProperty.call(metrics, 'valuationsCompleted'), false)
  assert.equal(metrics.listingsCreated, 1)
  assert.equal(metrics.listingsLive, 1)
}

console.log('seller journey tests passed')
