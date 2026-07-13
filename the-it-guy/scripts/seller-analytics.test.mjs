import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { createServer } from 'vite'

const serviceSource = await fs.readFile(new URL('../src/services/leadAnalyticsService.js', import.meta.url), 'utf8')
for (const method of [
  'getSellerFunnelMetrics',
  'getSellerSourceMetrics',
  'getSellerAgentMetrics',
  'getSellerBranchMetrics',
  'getSellerAnalyticsMetrics',
]) {
  assert.match(serviceSource, new RegExp(`export function ${method}`), `lead analytics should export ${method}`)
}
assert.match(serviceSource, /buildSellerJourney/)
assert.match(serviceSource, /document_packets/)

const reportingPageSource = await fs.readFile(new URL('../src/pages/AgentReportingPage.jsx', import.meta.url), 'utf8')
for (const copy of ['Seller Journey Analytics', 'Seller Source Performance', 'Seller Agent Performance', 'Seller Branch Performance']) {
  assert.match(reportingPageSource, new RegExp(copy), `reporting page should render ${copy}`)
}

const server = await createServer({
  root: process.cwd(),
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const { __leadAnalyticsServiceTestUtils } = await server.ssrLoadModule('/src/services/leadAnalyticsService.js')
  const {
    buildLeadAnalyticsModel,
    buildLeadAnalyticsCsvExport,
    getSellerAnalyticsMetrics,
    getSellerFunnelMetrics,
  } = __leadAnalyticsServiceTestUtils

  const data = {
    leads: [
      {
        leadId: 'seller-1',
        leadCategory: 'seller',
        leadSource: 'Valuation Request',
        assignedAgentId: 'agent-1',
        assignedAgentName: 'Ava Agent',
        branchId: 'branch-1',
        branchName: 'North',
        sellerPropertyAddress: '1 Oak Road',
        listingId: 'listing-1',
        mandatePacketId: 'packet-1',
        createdAt: '2026-06-01T08:00:00Z',
      },
      {
        leadId: 'seller-2',
        leadCategory: 'seller',
        leadSource: 'Valuation Request',
        assignedAgentId: 'agent-1',
        assignedAgentName: 'Ava Agent',
        branchId: 'branch-1',
        branchName: 'North',
        sellerPropertyAddress: '2 Oak Road',
        listingId: 'listing-2',
        mandatePacketId: 'packet-2',
        createdAt: '2026-06-01T09:00:00Z',
      },
      {
        leadId: 'seller-3',
        leadCategory: 'seller',
        leadSource: 'Canvassing',
        assignedAgentId: 'agent-2',
        assignedAgentName: 'Ben Broker',
        branchId: 'branch-2',
        branchName: 'South',
        sellerPropertyAddress: '3 Oak Road',
        createdAt: '2026-06-01T10:00:00Z',
      },
      { leadId: 'buyer-1', leadCategory: 'buyer', leadSource: 'Property24' },
    ],
    appointments: [
      {
        leadId: 'seller-1',
        appointmentType: 'seller_valuation',
        status: 'completed',
        createdAt: '2026-06-02T08:00:00Z',
        completedAt: '2026-06-02T10:00:00Z',
      },
      {
        leadId: 'seller-2',
        appointmentType: 'seller_consultation',
        status: 'requested',
        createdAt: '2026-06-02T09:00:00Z',
      },
    ],
    documentPackets: [
      {
        id: 'packet-1',
        status: 'completed',
        updatedAt: '2026-06-04T12:00:00Z',
        sourceContextJson: {
          sellerLeadId: 'seller-1',
          mandateSentAt: '2026-06-03T08:00:00Z',
          mandateSignedAt: '2026-06-04T12:00:00Z',
        },
      },
      {
        id: 'packet-2',
        status: 'sent',
        createdAt: '2026-06-03T09:00:00Z',
        sourceContextJson: {
          sellerLeadId: 'seller-2',
          mandateSentAt: '2026-06-03T09:00:00Z',
        },
      },
    ],
    listings: [
      {
        id: 'listing-1',
        sellerLeadId: 'seller-1',
        listingStatus: 'active',
        listingVisibility: 'active_market',
        createdAt: '2026-06-05T08:00:00Z',
        activatedAt: '2026-06-06T08:00:00Z',
      },
      {
        id: 'listing-2',
        sellerLeadId: 'seller-2',
        listingStatus: 'draft',
        createdAt: '2026-06-05T09:00:00Z',
      },
    ],
  }

  const seller = getSellerAnalyticsMetrics(data)
  assert.equal(seller.overview.sellerLeads, 3)
  assert.equal(Object.prototype.hasOwnProperty.call(seller.overview, 'valuationsScheduled'), false)
  assert.equal(Object.prototype.hasOwnProperty.call(seller.overview, 'valuationsCompleted'), false)
  assert.equal(seller.overview.mandatesSent, 2)
  assert.equal(seller.overview.mandatesSigned, 1)
  assert.equal(seller.overview.listingsCreated, 1)
  assert.equal(seller.overview.listingsLive, 1)
  assert.equal(seller.overview.mandateConversionRate, 33.3)
  assert.equal(seller.overview.listingLiveConversionRate, 33.3)
  assert.equal(seller.overview.mandatesAwaitingSignature, 1)
  assert.equal(seller.overview.listingsAwaitingActivation, 0)
  assert.equal(seller.overview.blockedListings, 0)
  assert.equal(seller.overview.averageDaysToMandate, 3.2)
  assert.equal(seller.overview.averageDaysToListing, 4)
  assert.equal(seller.overview.averageDaysToListingLive, 5)
  assert.equal(seller.readiness.distribution.blocked > 0, true)
  assert.equal(seller.readiness.commonBlockers.some((row) => row.label === 'Missing Seller Contact'), true)

  const funnel = getSellerFunnelMetrics(data)
  assert.equal(funnel.find((stage) => stage.key === 'seller_leads').volume, 3)
  assert.equal(funnel.some((stage) => stage.key === 'valuations_scheduled'), false)
  assert.equal(funnel.some((stage) => stage.key === 'valuations_completed'), false)
  assert.equal(funnel.find((stage) => stage.key === 'mandates_sent').volume, 2)
  assert.equal(funnel.find((stage) => stage.key === 'mandates_signed').volume, 1)
  assert.equal(funnel.find((stage) => stage.key === 'listings_created').volume, 1)
  assert.equal(funnel.find((stage) => stage.key === 'listings_live').volume, 1)

  const valuationSource = seller.sources.find((row) => row.source === 'Valuation Request')
  assert.equal(valuationSource.sellerLeads, 2)
  assert.equal(valuationSource.listingsLive, 1)
  assert.equal(valuationSource.listingLiveConversionPercent, 50)

  const agent = seller.agents.find((row) => row.agentId === 'agent-1')
  assert.equal(agent.sellerLeads, 2)
  assert.equal(agent.mandatesSent, 2)
  assert.equal(agent.listingsLive, 1)

  const branch = seller.branches.find((row) => row.branchId === 'branch-1')
  assert.equal(branch.sellerLeads, 2)
  assert.equal(branch.listingsCreated, 1)

  const model = buildLeadAnalyticsModel(data)
  assert.equal(model.overview.sellerListingsLive, 1)
  assert.equal(model.seller.overview.sellerLeads, 3)
  assert.match(buildLeadAnalyticsCsvExport('seller_funnel', model), /Seller Leads/)
  assert.match(buildLeadAnalyticsCsvExport('seller_agents', model), /Ava Agent/)
} finally {
  await server.close()
}

console.log('seller analytics tests passed')
