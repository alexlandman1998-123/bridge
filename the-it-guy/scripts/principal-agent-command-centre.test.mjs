import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
  getPrincipalAgentCommandCentre,
  getPrincipalAgentDetailCommandCentre,
} from '../src/modules/agency/agents/principalAgentCommandCentreService.js'

const agentsPageSource = fs.readFileSync(new URL('../src/pages/Agents.jsx', import.meta.url), 'utf8')

assert.match(
  agentsPageSource,
  /const \[workspaceOrganisation, setWorkspaceOrganisation\] = useState\(null\)/,
  'Agents page should keep the live workspace organisation loaded from backend settings.',
)
assert.match(
  agentsPageSource,
  /resolveOrganisationOptions\(\{ directory: agentDirectory, invites: agentInvites, profile, organisation: workspaceOrganisation \}\)/,
  'Agents page organisation selector should include the live backend workspace.',
)
assert.match(
  agentsPageSource,
  /organisationId: organisationFilter === EMPTY_ORGANISATION\.id[\s\S]*workspaceOrganisation\?\.id \|\| agentDirectory\?\.agency\?\.id/,
  'Agents page should prefer the live workspace id before the legacy local agent directory id.',
)
assert.match(
  agentsPageSource,
  /function AgentQaSummaryPanel/,
  'Agents page should render the principal operational QA summary.',
)
assert.match(
  agentsPageSource,
  /function AgentQaReviewPanel/,
  'Agent workspace should render the agent-level QA review.',
)
assert.match(
  agentsPageSource,
  /function buildAgentQaReviewLogEntry/,
  'Agent workspace should support recording QA review notes.',
)
assert.match(
  agentsPageSource,
  /function buildQaGovernanceExportRows/,
  'Agents page should support exporting QA governance rows.',
)
assert.match(
  agentsPageSource,
  /function handleExportQaGovernance/,
  'Agents page should expose the principal QA governance export action.',
)

const today = new Date()
const yesterday = new Date(today)
yesterday.setDate(today.getDate() - 1)
const tomorrow = new Date(today)
tomorrow.setDate(today.getDate() + 1)
const oldDate = new Date(today)
oldDate.setDate(today.getDate() - 12)

const branches = [
  { id: 'benoni', name: 'Benoni' },
  { id: 'sandton', name: 'Sandton' },
]

const agents = [
  {
    id: 'agent-a',
    name: 'Agent A',
    email: 'agenta@test.com',
    avatarUrl: 'https://example.com/agent-a.jpg',
    role: 'agent',
    status: 'active',
    organisationId: 'agency-a',
    branchId: 'benoni',
  },
  {
    id: 'agent-b',
    name: 'Agent B',
    email: 'agentb@test.com',
    role: 'agent',
    status: 'active',
    organisationId: 'agency-a',
    branchId: 'sandton',
  },
  {
    id: 'inactive-agent',
    name: 'Inactive Agent',
    email: 'inactive@test.com',
    role: 'agent',
    status: 'inactive',
    organisationId: 'agency-a',
    branchId: 'benoni',
  },
  {
    id: 'outside-agent',
    name: 'Outside Agent',
    email: 'outside@test.com',
    role: 'agent',
    status: 'active',
    organisationId: 'agency-b',
    branchId: 'sandton',
  },
]

const transactions = [
  {
    id: 'tx-a',
    assigned_agent_id: 'agent-a',
    status: 'active',
    purchase_price: 2500000,
    updated_at: yesterday.toISOString(),
  },
  {
    id: 'tx-b',
    assigned_agent_id: 'agent-b',
    status: 'registered',
    purchase_price: 1200000,
    agent_commission_amount: 36000,
    registered_at: yesterday.toISOString(),
  },
  {
    id: 'tx-outside',
    assigned_agent_id: 'outside-agent',
    status: 'active',
    purchase_price: 9000000,
    updated_at: yesterday.toISOString(),
  },
]

const listings = [
  {
    id: 'listing-a',
    assignedAgentId: 'agent-a',
    status: 'active',
    price: 3000000,
    updatedAt: today.toISOString(),
  },
  {
    id: 'listing-b',
    assignedAgentId: 'agent-b',
    status: 'active',
    price: 1100000,
    updatedAt: oldDate.toISOString(),
  },
]

const tasks = [
  {
    id: 'task-a',
    assignedAgentId: 'agent-a',
    status: 'open',
    dueDate: oldDate.toISOString(),
    updatedAt: oldDate.toISOString(),
  },
]

function buildModel(overrides = {}) {
  return getPrincipalAgentCommandCentre({
    principalId: 'principal-a',
    organisationId: 'agency-a',
    branchId: 'all',
    agents,
    branches,
    transactions,
    listings,
    tasks,
    filters: {
      dateRange: 'last_30_days',
      rankingMetric: 'pipelineValue',
      sortBy: 'pipeline',
      ...overrides.filters,
    },
    ...overrides,
  })
}

{
  const model = buildModel()
  assert.equal(model.kpis.totalAgents, 2, 'principal scope excludes inactive and other agencies by default')
  assert.deepEqual(model.agentsTable.map((row) => row.id).sort(), ['agent-a', 'agent-b'])
  assert.equal(model.kpis.pipelineValue, 6600000, 'pipeline value comes only from visible scoped agents')
}

{
  const model = buildModel({ branchId: 'benoni', filters: { branchId: 'benoni', dateRange: 'last_30_days' } })
  assert.equal(model.kpis.totalAgents, 1, 'branch manager scope is branch-only')
  assert.equal(model.agentsTable[0].id, 'agent-a')
  assert.equal(model.branchPerformance.length, 1)
  assert.equal(model.branchPerformance[0].name, 'Benoni')
}

{
  const model = buildModel({ filters: { status: 'inactive', dateRange: 'last_30_days' } })
  assert.equal(model.kpis.totalAgents, 1, 'inactive agents are only returned when explicitly filtered')
  assert.equal(model.agentsTable[0].id, 'inactive-agent')
}

{
  const model = buildModel()
  assert.equal(model.topPerformers[0].id, 'agent-a', 'top performers rank by pipeline value by default')
  assert.equal(model.topPerformers[0].avatarUrl, 'https://example.com/agent-a.jpg', 'top performers preserve profile picture urls')
  assert.equal(model.agentsTable.find((row) => row.id === 'agent-a')?.avatarUrl, 'https://example.com/agent-a.jpg', 'agent table preserves profile picture urls')
  assert.ok(model.attentionAgents.some((row) => row.id === 'agent-a' && row.reasons.includes('Overdue follow-ups')), 'attention agents include overdue follow-up signals')
}

{
  const model = buildModel({
    leads: [
      {
        id: 'qa-stale-lead',
        assignedAgentId: 'agent-a',
        status: 'New',
        createdAt: oldDate.toISOString(),
      },
    ],
    appointments: [
      {
        id: 'qa-unlinked-appointment',
        agentId: 'agent-a',
        status: 'scheduled',
        title: 'Seller appointment',
        dateTime: tomorrow.toISOString(),
      },
    ],
    canvassingProspects: [
      {
        id: 'qa-prospect-gap',
        assignedAgentId: 'agent-a',
        firstName: 'Prospect',
        lastName: 'Gap',
        status: 'Contacted',
        updatedAt: oldDate.toISOString(),
      },
    ],
  })
  const agentQa = model.agentsTable.find((row) => row.id === 'agent-a')?.qaReview
  const issueKeys = new Set((agentQa?.issues || []).map((issue) => issue.key))
  assert.ok(Number.isFinite(model.kpis.operationalQaScore), 'principal model exposes an operational QA score')
  assert.ok(model.qaSummary.issueCount >= 4, 'principal QA summary counts open operational issues')
  assert.ok(model.qaSummary.actionQueue.length >= 4, 'principal QA summary exposes an action queue')
  assert.ok(model.kpis.qaActionItems >= 4, 'principal KPI model counts open QA action items')
  assert.ok(model.qaSummary.governance.severity.High >= 1, 'QA governance groups action items by severity')
  assert.ok(model.qaSummary.governance.dueBuckets.next7Days >= 1, 'QA governance groups action items by due bucket')
  assert.ok(model.qaSummary.governance.statusCounts.attention >= 1, 'QA governance groups agents by review status')
  assert.equal(agentQa?.status, 'attention', 'high-risk QA exceptions put the agent into review')
  assert.equal(agentQa?.actionPlan?.items?.[0]?.priority, 'Urgent', 'high-risk QA issues become urgent action-plan items')
  assert.ok(agentQa?.actionPlan?.nextReviewAt, 'QA review includes a next review date')
  assert.ok(issueKeys.has('overdue-follow-ups'), 'QA review detects overdue tasks')
  assert.ok(issueKeys.has('stale-leads'), 'QA review detects stale open leads')
  assert.ok(issueKeys.has('unworked-leads'), 'QA review detects leads without tracked next actions')
  assert.ok(issueKeys.has('unlinked-appointments'), 'QA review detects unlinked future appointments')
  assert.ok(issueKeys.has('prospects-without-next-step'), 'QA review detects canvassing prospects without next steps')
}

{
  const model = buildModel()
  const agentA = model.agentsTable.find((row) => row.id === 'agent-a')
  assert.equal(agentA?.performance.activeTransactionCount, 1, 'card active transaction count comes from assigned active transactions')
  assert.equal(agentA?.performance.activeListingCount, 1, 'card active listing count comes from assigned listings')
  assert.equal(agentA?.performance.stageCounts.otp, 1, 'card transaction progress receives active stage counts')
  assert.equal(agentA?.performance.pipelineValue, 5500000, 'card pipeline value combines active transaction and listing value for the visible agent')
}

{
  const detailNow = new Date('2026-07-15T12:00:00.000Z')
  const detailAgent = {
    id: 'detail-agent',
    name: 'Detail Agent',
    email: 'detail@test.com',
    role: 'agent',
    status: 'active',
    organisationId: 'agency-a',
    branchId: 'benoni',
  }
  const detailModel = getPrincipalAgentDetailCommandCentre({
    agent: detailAgent,
    branches,
    now: detailNow,
    leads: [
      {
        id: 'detail-lead-open',
        assignedAgentId: 'detail-agent',
        status: 'new',
        createdAt: '2026-07-04T08:00:00.000Z',
      },
      {
        id: 'detail-lead-otp',
        assignedAgentId: 'detail-agent',
        status: 'OTP signed mandate signed',
        createdAt: '2026-07-05T08:00:00.000Z',
      },
    ],
    transactions: [
      {
        id: 'detail-active-transaction',
        assigned_agent_id: 'detail-agent',
        status: 'finance',
        purchase_price: 3000000,
        created_at: '2026-07-02T08:00:00.000Z',
        updated_at: '2026-07-10T08:00:00.000Z',
      },
      {
        id: 'detail-registered-transaction',
        assigned_agent_id: 'detail-agent',
        status: 'registered',
        purchase_price: 2000000,
        agent_commission_amount: 60000,
        created_at: '2026-07-01T08:00:00.000Z',
        registered_at: '2026-07-11T08:00:00.000Z',
      },
    ],
    listings: [
      {
        id: 'detail-listing',
        assignedAgentId: 'detail-agent',
        status: 'active',
        price: 1500000,
        createdAt: '2026-07-06T08:00:00.000Z',
      },
    ],
    appointments: [
      {
        id: 'detail-valuation',
        agent_id: 'detail-agent',
        appointment_type: 'valuation',
        status: 'confirmed',
        title: 'Valuation appointment',
        date_time: '2026-07-13T10:00:00.000Z',
      },
    ],
    tasks: [
      {
        id: 'detail-follow-up',
        assignedAgentId: 'detail-agent',
        status: 'Pending',
        title: 'Follow up seller',
        dueDate: '2026-07-16T09:00:00.000Z',
      },
    ],
    activities: [
      {
        id: 'detail-call',
        agentId: 'detail-agent',
        activityType: 'Call',
        activityNote: 'Called seller after valuation request',
        outcome: 'Connected',
        activityDate: '2026-07-12T09:00:00.000Z',
      },
    ],
    canvassingProspects: [
      {
        id: 'detail-prospect-follow-up',
        assignedAgentId: 'detail-agent',
        firstName: 'Follow',
        lastName: 'Prospect',
        area: 'Benoni',
        status: 'Contacted',
        nextFollowUpDate: '2026-07-17T09:00:00.000Z',
        updatedAt: '2026-07-12T09:00:00.000Z',
      },
      {
        id: 'detail-prospect-mandate',
        assignedAgentId: 'detail-agent',
        firstName: 'Mandate',
        lastName: 'Prospect',
        area: 'Benoni',
        status: 'Mandate Signed',
        updatedAt: '2026-07-12T10:00:00.000Z',
      },
    ],
  })
  const detailMetrics = new Map(detailModel.monthlyPerformance.metrics.map((metric) => [metric.key, metric]))
  const prospectingMetrics = new Map(detailModel.prospectingActivity.metrics.map((metric) => [metric.key, metric]))
  assert.equal(detailModel.pipelineHealth.activeDeals, 1, 'detail workspace active deals come from scoped active transactions')
  assert.equal(detailModel.pipelineHealth.pipelineValue, 4500000, 'detail workspace pipeline value uses active transactions plus active listings')
  assert.equal(detailMetrics.get('conversionRate')?.value, 50, 'detail performance conversion rate comes from assigned leads')
  assert.equal(detailMetrics.get('commissionGenerated')?.value, 60000, 'detail performance commission uses registered transaction commission')
  assert.equal(detailMetrics.get('avgDaysToRegistration')?.value, 10, 'detail performance exposes real average days to registration')
  assert.equal(prospectingMetrics.get('callsLogged')?.value, 1, 'detail prospecting counts scoped call activity')
  assert.equal(prospectingMetrics.get('followUpsDue')?.value, 2, 'detail prospecting counts scoped open follow-up tasks and prospect follow-ups')
  assert.equal(prospectingMetrics.get('valuationsBooked')?.value, 1, 'detail prospecting counts scoped valuation appointments')
  assert.equal(prospectingMetrics.get('mandatesWon')?.value, 2, 'detail prospecting counts scoped lead and prospect mandate signals')
  assert.equal(detailModel.prospectingActivity.drilldowns.calls.rows.length, 1, 'detail prospecting exposes call drill-down rows')
  assert.equal(detailModel.prospectingActivity.drilldowns.followUps.rows.length, 2, 'detail prospecting exposes task and prospect follow-up drill-down rows')
  assert.equal(detailModel.prospectingActivity.drilldowns.valuations.rows.length, 1, 'detail prospecting exposes valuation drill-down rows')
  assert.ok(detailModel.prospectingActivity.drilldowns.mandates.rows.length >= 1, 'detail prospecting exposes mandate drill-down rows')
  assert.ok(detailModel.recentActivity.items.length >= 4, 'detail workspace exposes a scoped recent activity timeline')
  assert.ok(detailModel.qaReview, 'detail workspace exposes the agent QA review')
  assert.equal(detailModel.qaReview.trackingCoverage.canvassingProspects, 2, 'QA review includes canvassing prospect coverage')
  assert.ok(detailModel.qaReview.actionPlan?.nextReviewAt, 'detail QA review includes the follow-up review cadence')
}

{
  const detailNow = new Date('2026-07-15T12:00:00.000Z')
  const detailModel = getPrincipalAgentDetailCommandCentre({
    agent: {
      id: 'fallback-commission-agent',
      name: 'Fallback Commission Agent',
      email: 'fallback@test.com',
      role: 'agent',
      status: 'active',
      organisationId: 'agency-a',
      branchId: 'benoni',
    },
    branches,
    now: detailNow,
    transactions: [
      {
        id: 'fallback-registered-transaction',
        assigned_agent_id: 'fallback-commission-agent',
        status: 'registered',
        purchase_price: 2000000,
        created_at: '2026-07-01T08:00:00.000Z',
        registered_at: '2026-07-11T08:00:00.000Z',
      },
    ],
  })
  const detailMetrics = new Map(detailModel.monthlyPerformance.metrics.map((metric) => [metric.key, metric]))
  assert.equal(detailMetrics.get('commissionGenerated')?.value, 60000, 'detail performance estimates commission from registered value when no explicit commission exists')
}

{
  const model = buildModel({
    agents: [{
      id: 'solo-agent',
      name: 'Solo Agent',
      email: 'solo@test.com',
      status: 'active',
      organisationId: 'agency-a',
    }],
    branches: [],
    transactions: [],
    listings: [],
    tasks: [],
  })
  assert.equal(model.branchPerformance[0].name, 'Current Office', 'fallback branch card renders when no branch data exists')
}

console.log('Principal agent command centre selector tests passed')
