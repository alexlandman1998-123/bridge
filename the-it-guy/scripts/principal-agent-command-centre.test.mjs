import assert from 'node:assert/strict'
import {
  getPrincipalAgentCommandCentre,
  getPrincipalAgentDetailCommandCentre,
} from '../src/modules/agency/agents/principalAgentCommandCentreService.js'

const today = new Date()
const yesterday = new Date(today)
yesterday.setDate(today.getDate() - 1)
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
        status: 'OTP signed',
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
  })
  const detailMetrics = new Map(detailModel.monthlyPerformance.metrics.map((metric) => [metric.key, metric]))
  assert.equal(detailModel.pipelineHealth.activeDeals, 1, 'detail workspace active deals come from scoped active transactions')
  assert.equal(detailModel.pipelineHealth.pipelineValue, 4500000, 'detail workspace pipeline value uses active transactions plus active listings')
  assert.equal(detailMetrics.get('conversionRate')?.value, 50, 'detail performance conversion rate comes from assigned leads')
  assert.equal(detailMetrics.get('commissionGenerated')?.value, 60000, 'detail performance commission uses registered transaction commission')
  assert.equal(detailMetrics.get('avgDaysToRegistration')?.value, 10, 'detail performance exposes real average days to registration')
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
