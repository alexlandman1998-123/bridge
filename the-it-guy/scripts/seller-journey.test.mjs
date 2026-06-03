import assert from 'node:assert/strict'
import {
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
