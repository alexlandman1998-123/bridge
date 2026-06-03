import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { createServer } from 'vite'

const serviceSource = await fs.readFile(new URL('../src/services/leadAnalyticsService.js', import.meta.url), 'utf8')
for (const method of [
  'getLeadFunnelMetrics',
  'getLeadSourceMetrics',
  'getLeadConversionMetrics',
  'getAgentLeadMetrics',
  'getListingLeadMetrics',
  'getResponseTimeMetrics',
  'getRequirementGapMetrics',
  'getLeadPipelineMetrics',
]) {
  assert.match(serviceSource, new RegExp(`export function ${method}`), `analytics service should export ${method}`)
}
assert.match(serviceSource, /buildLeadAnalyticsCsvExport/)
assert.match(serviceSource, /lead_communication_events/)
assert.match(serviceSource, /lead_listing_interests/)
assert.match(serviceSource, /lead_requirements/)
assert.doesNotMatch(serviceSource, /forecast|machine learning|openai|AI scoring/i)

const reportingPageSource = await fs.readFile(new URL('../src/pages/AgentReportingPage.jsx', import.meta.url), 'utf8')
for (const copy of ['Lead Analytics', 'Enquiries to Registrations', 'Source Performance', 'Agent Performance', 'Listing Performance', 'Requirement Trends', 'Touchpoint Analytics', 'Pipeline Health']) {
  assert.match(reportingPageSource, new RegExp(copy), `reporting dashboard should render ${copy}`)
}
assert.match(reportingPageSource, /buildLeadAnalyticsCsvExport/)
assert.match(reportingPageSource, /Download/)
assert.doesNotMatch(reportingPageSource, /forecast|machine learning|automated optimisation/i)

const leadWorkspaceSource = await fs.readFile(new URL('../src/pages/AgentLeadsPage.jsx', import.meta.url), 'utf8')
assert.match(leadWorkspaceSource, /buildLeadWorkspaceAnalyticsSummary/)
for (const copy of ['Response Time', 'Touchpoints', 'Matches', 'Viewings', 'Offers']) {
  assert.match(leadWorkspaceSource, new RegExp(copy), `lead workspace should show ${copy}`)
}

const listingWorkspaceSource = await fs.readFile(new URL('../src/pages/AgentListingDetail.jsx', import.meta.url), 'utf8')
assert.match(listingWorkspaceSource, /buildListingWorkspaceAnalyticsSummary/)
for (const copy of ['Total Enquiries', 'Matched Leads', 'Transactions']) {
  assert.match(listingWorkspaceSource, new RegExp(copy), `listing workspace should show ${copy}`)
}

const server = await createServer({
  root: process.cwd(),
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const { __leadAnalyticsServiceTestUtils } = await server.ssrLoadModule('/src/services/leadAnalyticsService.js')
  const {
    buildLeadAnalyticsCsvExport,
    buildLeadAnalyticsModel,
    buildLeadWorkspaceAnalyticsSummary,
    buildListingWorkspaceAnalyticsSummary,
    getAgentLeadMetrics,
    getCommunicationMetrics,
    getLeadFunnelMetrics,
    getLeadPipelineMetrics,
    getLeadSourceMetrics,
    getListingLeadMetrics,
    getRequirementGapMetrics,
    getRecommendationMetrics,
    getResponseTimeMetrics,
    getSuggestionMetrics,
    rowsToCsv,
  } = __leadAnalyticsServiceTestUtils

  const data = {
    ingestionLogs: [
      { source: 'Property24', lead_id: 'lead-1', created_at: '2026-06-01T07:00:00.000Z' },
      { source: 'Website', lead_id: 'lead-2', created_at: '2026-06-01T08:00:00.000Z' },
      { source: 'Property24', lead_id: 'lead-3', created_at: '2026-06-02T08:00:00.000Z' },
    ],
    leads: [
      {
        lead_id: 'lead-1',
        lead_source: 'Property24',
        status: 'contacted',
        assigned_agent_id: 'agent-1',
        assigned_agent_name: 'John Smith',
        assigned_at: '2026-06-01T08:00:00.000Z',
        first_contacted_at: '2026-06-01T09:30:00.000Z',
        created_at: '2026-06-01T07:30:00.000Z',
      },
      {
        lead_id: 'lead-2',
        lead_source: 'Website',
        status: 'new',
        assigned_queue_id: 'unassigned',
        sla_due_at: '2026-06-01T10:00:00.000Z',
        created_at: '2026-06-01T08:30:00.000Z',
      },
      {
        lead_id: 'lead-3',
        lead_source: 'Property24',
        status: 'converted',
        assigned_agent_id: 'agent-1',
        assigned_agent_name: 'John Smith',
        assigned_at: '2026-06-02T08:00:00.000Z',
        first_contacted_at: '2026-06-02T08:30:00.000Z',
        created_at: '2026-06-02T08:00:00.000Z',
      },
    ],
    requirements: [
      {
        requirement_id: 'req-1',
        lead_id: 'lead-1',
        status: 'active',
        suburbs: ['Bartlett'],
        areas: ['Boksburg'],
        property_types: ['Townhouse'],
        must_haves: ['Solar'],
        bedrooms_min: 3,
        budget_max: 2200000,
      },
      {
        requirement_id: 'req-3',
        lead_id: 'lead-3',
        status: 'active',
        suburbs: ['Beyers Park'],
        areas: ['Boksburg'],
        property_types: ['House'],
        must_haves: ['Garden'],
        bedrooms_min: 4,
        budget_max: 3500000,
      },
    ],
    interests: [
      {
        interest_id: 'interest-1',
        lead_id: 'lead-1',
        listing_id: 'listing-1',
        source: 'manual_match',
        status: 'viewing_scheduled',
        is_original_enquiry: true,
        created_at: '2026-06-01T10:00:00.000Z',
      },
      {
        interest_id: 'interest-2',
        lead_id: 'lead-3',
        listing_id: 'listing-1',
        source: 'manual_match',
        status: 'viewed',
        is_original_enquiry: false,
        created_at: '2026-06-02T09:00:00.000Z',
      },
      {
        interest_id: 'interest-3',
        lead_id: 'lead-2',
        listing_id: 'listing-2',
        source: 'manual_match',
        status: 'dismissed',
        is_original_enquiry: false,
        created_at: '2026-06-02T10:00:00.000Z',
      },
      {
        interest_id: 'interest-4',
        lead_id: 'lead-3',
        listing_id: 'listing-1',
        source: 'automated_suggestion',
        status: 'offer_submitted',
        created_at: '2026-06-02T11:00:00.000Z',
      },
    ],
    suggestions: [
      {
        suggestion_id: 'suggestion-1',
        lead_id: 'lead-3',
        requirement_id: 'req-3',
        listing_id: 'listing-1',
        score: 91,
        status: 'accepted',
        generated_at: '2026-06-02T08:45:00.000Z',
      },
      {
        suggestion_id: 'suggestion-2',
        lead_id: 'lead-1',
        requirement_id: 'req-1',
        listing_id: 'listing-2',
        score: 68,
        status: 'rejected',
        generated_at: '2026-06-02T09:45:00.000Z',
      },
      {
        suggestion_id: 'suggestion-3',
        lead_id: 'lead-2',
        requirement_id: 'req-2',
        listing_id: 'listing-2',
        score: 55,
        status: 'pending',
        generated_at: '2026-06-02T10:45:00.000Z',
      },
    ],
    recommendations: [
      {
        recommendation_id: 'recommendation-1',
        lead_id: 'lead-1',
        recommendation_type: 'contact_lead',
        priority: 'urgent',
        status: 'pending',
        due_date: '2026-06-01T09:00:00.000Z',
        created_at: '2026-06-01T07:30:00.000Z',
      },
      {
        recommendation_id: 'recommendation-2',
        lead_id: 'lead-3',
        recommendation_type: 'send_property',
        priority: 'high',
        status: 'accepted',
        task_id: 'task-1',
        created_at: '2026-06-02T09:30:00.000Z',
      },
      {
        recommendation_id: 'recommendation-3',
        lead_id: 'lead-3',
        recommendation_type: 'transaction_handover',
        priority: 'urgent',
        status: 'completed',
        created_at: '2026-06-02T10:00:00.000Z',
        completed_at: '2026-06-03T10:00:00.000Z',
      },
      {
        recommendation_id: 'recommendation-4',
        lead_id: 'lead-2',
        recommendation_type: 'general_follow_up',
        priority: 'medium',
        status: 'dismissed',
        created_at: '2026-06-02T10:00:00.000Z',
        dismissed_at: '2026-06-02T11:00:00.000Z',
      },
    ],
    appointments: [
      { appointment_id: 'appt-1', lead_id: 'lead-1', listing_id: 'listing-1', status: 'scheduled', start_time: '2026-06-03T10:00:00.000Z' },
      { appointment_id: 'appt-2', lead_id: 'lead-3', listing_id: 'listing-1', status: 'completed', start_time: '2026-06-04T10:00:00.000Z' },
    ],
    offers: [
      { id: 'offer-1', lead_id: 'lead-3', listing_id: 'listing-1', status: 'accepted', submitted_at: '2026-06-05T10:00:00.000Z' },
    ],
    transactions: [
      { id: 'tx-1', originating_buyer_lead_id: 'lead-3', listing_id: 'listing-1', status: 'registered', created_at: '2026-06-06T10:00:00.000Z' },
    ],
    listings: [
      { id: 'listing-1', title: '123 Main Road' },
      { id: 'listing-2', title: '45 Side Street' },
    ],
    communications: [
      { communication_id: 'comm-1', lead_id: 'lead-1', agent_id: 'agent-1', communication_type: 'call', direction: 'outbound', occurred_at: '2026-06-01T09:30:00.000Z' },
      { communication_id: 'comm-2', lead_id: 'lead-1', agent_id: 'agent-1', communication_type: 'whatsapp', direction: 'outbound', occurred_at: '2026-06-01T11:00:00.000Z' },
      { communication_id: 'comm-3', lead_id: 'lead-3', agent_id: 'agent-1', communication_type: 'email', direction: 'inbound', occurred_at: '2026-06-02T08:30:00.000Z' },
      { communication_id: 'comm-4', lead_id: 'lead-3', agent_id: 'agent-1', communication_type: 'meeting', direction: 'outbound', occurred_at: '2026-06-03T08:30:00.000Z' },
    ],
    leadActivities: [
      { activity_id: 'act-1', lead_id: 'lead-1', activity_type: 'Property24 enquiry received', activity_date: '2026-06-01T07:00:00.000Z' },
    ],
  }

  const funnel = getLeadFunnelMetrics(data)
  assert.equal(funnel.find((stage) => stage.key === 'enquiries').volume, 3)
  assert.equal(funnel.find((stage) => stage.key === 'leads').volume, 3)
  assert.equal(funnel.find((stage) => stage.key === 'qualified').volume, 2)
  assert.equal(funnel.find((stage) => stage.key === 'matched').volume, 3)
  assert.equal(funnel.find((stage) => stage.key === 'offer_accepted').volume, 1)
  assert.equal(funnel.find((stage) => stage.key === 'registered').volume, 1)

  const sources = getLeadSourceMetrics(data)
  const property24 = sources.find((row) => row.source === 'Property24')
  assert.equal(property24.enquiries, 2)
  assert.equal(property24.leads, 2)
  assert.equal(property24.transactions, 1)
  assert.equal(property24.registrations, 1)

  const agents = getAgentLeadMetrics(data)
  assert.equal(agents[0].agentId, 'agent-1')
  assert.equal(agents[0].leadsAssigned, 2)
  assert.equal(agents[0].leadsContacted, 2)
  assert.equal(agents[0].transactionsCreated, 1)
  assert.equal(agents[0].averageResponseHours, 1)

  const listings = getListingLeadMetrics(data)
  const mainRoad = listings.find((row) => row.listingId === 'listing-1')
  assert.equal(mainRoad.enquiries, 1)
  assert.equal(mainRoad.matches, 3)
  assert.equal(mainRoad.viewings, 2)
  assert.equal(mainRoad.offers, 1)
  assert.equal(mainRoad.transactions, 1)

  const response = getResponseTimeMetrics(data)
  assert.equal(response.averageResponseHours, 1)
  assert.equal(response.medianResponseHours, 1)
  assert.equal(response.respondedLeads, 2)
  assert.equal(response.uncontactedLeads, 1)

  const requirements = getRequirementGapMetrics(data)
  assert.equal(requirements.totalRequirements, 2)
  assert.equal(requirements.leadsWithoutRequirements, 1)
  assert.equal(requirements.topAreas[0].label, 'Boksburg')
  assert.equal(requirements.topPropertyTypes.length, 2)

  const communication = getCommunicationMetrics(data)
  assert.equal(communication.call, 1)
  assert.equal(communication.whatsapp, 1)
  assert.equal(communication.email, 1)
  assert.equal(communication.meeting, 1)
  assert.equal(communication.matchesCreated, 4)
  assert.equal(communication.matchesDismissed, 1)

  const suggestions = getSuggestionMetrics(data)
  assert.equal(suggestions.generated, 3)
  assert.equal(suggestions.accepted, 1)
  assert.equal(suggestions.rejected, 1)
  assert.equal(suggestions.pending, 1)
  assert.equal(suggestions.suggestionToViewingRate, 33.3)
  assert.equal(suggestions.suggestionToOfferRate, 33.3)
  assert.equal(suggestions.suggestionToTransactionRate, 33.3)

  const recommendations = getRecommendationMetrics(data.recommendations, new Date('2026-06-03T08:00:00.000Z'))
  assert.equal(recommendations.created, 4)
  assert.equal(recommendations.pending, 1)
  assert.equal(recommendations.accepted, 1)
  assert.equal(recommendations.completed, 1)
  assert.equal(recommendations.dismissed, 1)
  assert.equal(recommendations.urgent, 2)
  assert.equal(recommendations.overdue, 1)
  assert.equal(recommendations.taskConversionRate, 25)

  const pipeline = getLeadPipelineMetrics(data)
  assert.equal(pipeline.assignedLeads, 2)
  assert.equal(pipeline.unassignedLeads, 1)
  assert.equal(pipeline.hotLeads, 2)

  const model = buildLeadAnalyticsModel(data)
  assert.equal(model.overview.totalLeads, 3)
  assert.equal(model.overview.totalSuggestions, 3)
  assert.equal(model.overview.totalRecommendations, 4)
  assert.equal(model.conversion.transactions, 1)
  assert.equal(model.funnel.length, 10)
  assert.equal(model.sources.length > 0, true)
  assert.equal(model.suggestions.generated, 3)
  assert.equal(model.recommendations.created, 4)

  const leadSummary = buildLeadWorkspaceAnalyticsSummary({
    responseTimeHours: 1.5,
    communications: data.communications.filter((event) => event.lead_id === 'lead-1'),
    listingInterests: data.interests.filter((interest) => interest.lead_id === 'lead-1'),
    appointments: data.appointments.filter((appointment) => appointment.lead_id === 'lead-1'),
    offers: [],
  })
  assert.equal(leadSummary.responseTimeLabel, '1.5h')
  assert.equal(leadSummary.touchpoints, 2)
  assert.equal(leadSummary.matches, 1)
  assert.equal(leadSummary.viewings, 1)

  const listingSummary = buildListingWorkspaceAnalyticsSummary({
    interests: data.interests.filter((interest) => interest.listing_id === 'listing-1'),
    viewings: data.appointments.filter((appointment) => appointment.listing_id === 'listing-1'),
    offers: data.offers,
    transactions: data.transactions,
  })
  assert.equal(listingSummary.totalEnquiries, 1)
  assert.equal(listingSummary.matchedLeads, 3)
  assert.equal(listingSummary.viewings, 2)
  assert.equal(listingSummary.offers, 1)
  assert.equal(listingSummary.transactions, 1)

  const csv = buildLeadAnalyticsCsvExport('sources', model)
  assert.match(csv, /source,enquiries,leads/)
  assert.match(csv, /Property24/)
  assert.equal(rowsToCsv([{ name: 'A, B', value: 1 }]).split('\n')[1], '"A, B",1')
} finally {
  await server.close()
}

console.log('lead analytics tests passed')
