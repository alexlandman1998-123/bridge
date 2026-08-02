import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
  getPrincipalAgentCommandCentre,
  getPrincipalAgentDetailCommandCentre,
} from '../src/modules/agency/agents/principalAgentCommandCentreService.js'
import { buildAgentPerformanceModel } from '../src/modules/agency/agents/agentPerformanceUtils.js'

const agentsPageSource = fs.readFileSync(new URL('../src/pages/Agents.jsx', import.meta.url), 'utf8')
const organisationContextSource = fs.readFileSync(new URL('../src/context/OrganisationContext.jsx', import.meta.url), 'utf8')

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
  /principal_claim'[\s\S]*Principal Claim/,
  'Agents page should label principal claim invites without falling back to Agent.',
)
assert.match(
  agentsPageSource,
  /Pending Invitations/,
  'Agents page pending invite panel should not describe every invite as an agent invite.',
)
assert.match(
  agentsPageSource,
  /function getPrivateListingAssignmentKeys[\s\S]*assignedAgentId[\s\S]*assigned_agent_id[\s\S]*assignedUserId[\s\S]*assigned_user_id[\s\S]*assignedAgentEmail[\s\S]*assigned_agent_email/,
  'Agent workspaces should match private listings by live assignment IDs and legacy assignment email, not only commission agent id.',
)
assert.match(
  agentsPageSource,
  /computeAgentWorkspaceData\(\{[\s\S]*organisationUsers: performanceSources\.organisationUsers/,
  'Agent workspace data should include live organisation user identities before listing assignment bucketing.',
)
assert.match(
  agentsPageSource,
  /const \[canvassingActivities, setCanvassingActivities\] = useState\(\[\]\)/,
  'Agents page should keep loaded residential canvassing activity rows for principal performance pull-through.',
)
assert.match(
  agentsPageSource,
  /setCanvassingActivities\(performanceSources\.canvassingActivities\)/,
  'Agents page should store loaded residential canvassing activities after performance source hydration.',
)
assert.match(
  agentsPageSource,
  /getPrincipalAgentCommandCentre\(\{[\s\S]*activities: leadActivities,[\s\S]*canvassingActivities,/,
  'Main principal command centre should receive residential canvassing activities in addition to CRM lead activities.',
)
assert.match(
  agentsPageSource,
  /const agentId = resolveAgentAssignmentId\(identity, groupedByAgent, agentIdByEmail, agentIdByName, agentIdByAssignmentId\)[\s\S]*item\.deals\.push\(row\)/,
  'Agent workspaces should attach transaction rows through membership/auth/email aliases before rendering profile sales data.',
)
assert.match(
  agentsPageSource,
  /pipelineRows\.reduce\([\s\S]*resolveAgentAssignmentId\(identity, groupedByAgent, agentIdByEmail, agentIdByName, agentIdByAssignmentId\)/,
  'Agent workspaces should bucket pipeline rows through membership/auth/email aliases.',
)
assert.match(
  organisationContextSource,
  /branding\.logoLight \|\| branding\.logoLightUrl \|\| branding\.logo_light_url[\s\S]*branding\.logoUrl \|\| branding\.logo_url/,
  'Organisation branding should resolve legacy and canonical logo field names.',
)

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
    id: 'principal-claim-invite',
    name: 'Pending Principal',
    email: 'pending-principal@test.com',
    role: 'principal_claim',
    status: 'pending_invite',
    organisationId: 'agency-a',
    branchId: 'benoni',
    isPendingInvite: true,
    isPrincipalClaimInvite: true,
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
  const model = buildModel({ filters: { status: 'pending_invite', dateRange: 'last_30_days' } })
  assert.equal(model.kpis.totalAgents, 1, 'pending invites are only returned when explicitly filtered')
  assert.equal(model.agentsTable[0].id, 'principal-claim-invite')
  assert.equal(model.agentsTable[0].role, 'principal_claim')
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
  const model = getPrincipalAgentCommandCentre({
    principalId: 'principal-a',
    organisationId: 'agency-a',
    branchId: 'all',
    agents: [
      {
        id: 'membership-leroy',
        user_id: 'auth-leroy',
        organisation_user_id: 'membership-leroy',
        name: 'Leroy Slava',
        email: 'leroy@example.test',
        role: 'principal',
        status: 'active',
        organisationId: 'agency-a',
        branchId: 'benoni',
      },
    ],
    branches,
    listings: [
      {
        id: 'leroy-listing',
        assigned_agent_id: 'auth-leroy',
        status: 'active',
        asking_price: 1674800,
        updated_at: today.toISOString(),
      },
    ],
    filters: {
      dateRange: 'last_30_days',
      rankingMetric: 'pipelineValue',
      sortBy: 'pipeline',
    },
  })
  const leroy = model.agentsTable.find((row) => row.id === 'membership-leroy')
  assert.equal(leroy?.performance.activeListingCount, 1, 'agent performance should match private listings assigned to the auth user id alias')
  assert.equal(leroy?.performance.pipelineValue, 1674800, 'pipeline value should include private listing value matched by auth user id alias')
}

{
  const detailNow = new Date('2026-07-15T12:00:00.000Z')
  const leroyDetail = getPrincipalAgentDetailCommandCentre({
    agent: {
      id: 'membership-leroy',
      user_id: 'auth-leroy',
      organisation_user_id: 'membership-leroy',
      name: 'Leroy Slava',
      email: 'leroy@example.test',
      role: 'principal',
      status: 'active',
      organisationId: 'agency-a',
      branchId: 'benoni',
    },
    branches,
    now: detailNow,
    leads: [
      {
        id: 'leroy-lead',
        assignedAgentId: 'auth-leroy',
        status: 'Mandate signed',
        budget: 250000,
        createdAt: '2026-07-05T08:00:00.000Z',
      },
    ],
    transactions: [
      {
        id: 'leroy-tx',
        assigned_agent_id: 'auth-leroy',
        status: 'finance',
        purchase_price: 2000000,
        created_at: '2026-07-03T08:00:00.000Z',
        updated_at: '2026-07-10T08:00:00.000Z',
      },
    ],
    listings: [
      {
        id: 'leroy-listing-detail',
        assigned_agent_id: 'auth-leroy',
        status: 'active',
        asking_price: 1674800,
        created_at: '2026-07-06T08:00:00.000Z',
      },
    ],
  })
  assert.equal(leroyDetail?.pipelineHealth.activeDeals, 1, 'agent detail should match active transactions assigned to the auth user id alias')
  assert.equal(leroyDetail?.pipelineHealth.pipelineValue, 3924800, 'agent detail should include lead, transaction, and listing pipeline matched by alias')
  assert.equal(
    leroyDetail?.monthlyPerformance.metrics.find((metric) => metric.key === 'mandatesWon')?.value,
    1,
    'agent detail should count mandate wins matched by the auth user id alias',
  )
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
  const pullThroughNow = new Date('2026-08-02T13:00:00.000Z')
  const pullThroughAgent = {
    id: 'pull-through-agent',
    name: 'Pull Through Agent',
    email: 'pull-through@test.com',
    role: 'agent',
    status: 'active',
    organisationId: 'agency-a',
    branchId: 'benoni',
  }
  const duplicateCanvassingCall = {
    id: 'pull-through-call-1',
    assignedAgentId: 'pull-through-agent',
    agentId: 'pull-through-agent',
    activityType: 'Call',
    activityNote: 'Converted buyer call',
    outcome: 'Connected',
    activityDate: '2026-08-02T09:00:00.000Z',
  }
  const topLevelModel = getPrincipalAgentCommandCentre({
    principalId: 'principal-a',
    organisationId: 'agency-a',
    branchId: 'all',
    agents: [pullThroughAgent],
    branches,
    leads: [
      {
        leadId: 'converted-canvassing-lead',
        assignedAgentId: 'pull-through-agent',
        assignedUserId: 'pull-through-agent',
        leadSource: 'Canvassing',
        leadCategory: 'buyer',
        leadDirection: 'Outbound',
        status: 'Lead',
        stage: 'Lead',
        budget: 2100000,
        canvassingProspectId: 'converted-prospect-1',
        createdAt: '2026-08-02T08:00:00.000Z',
      },
    ],
    activities: [
      {
        id: 'pull-through-lead-created',
        leadId: 'converted-canvassing-lead',
        assignedAgentId: 'pull-through-agent',
        activityType: 'Lead Created',
        activityNote: 'canvassing_prospect_converted',
        outcome: 'Converted from canvassing prospect',
        activityDate: '2026-08-02T08:30:00.000Z',
      },
      duplicateCanvassingCall,
    ],
    canvassingActivities: [
      duplicateCanvassingCall,
      {
        id: 'pull-through-conversion-note',
        prospectId: 'converted-prospect-1',
        assignedAgentId: 'pull-through-agent',
        agentId: 'pull-through-agent',
        activityType: 'Note',
        activityNote: 'Prospect converted to Buyer lead',
        outcome: 'converted-canvassing-lead',
        activityDate: '2026-08-02T10:00:00.000Z',
      },
    ],
    filters: {
      dateRange: 'last_7_days',
      rankingMetric: 'activityVolume',
      sortBy: 'recent',
    },
    now: pullThroughNow,
  })
  const pullThroughRow = topLevelModel.agentsTable[0]
  assert.equal(topLevelModel.kpis.activeToday, 1, 'main command centre should count residential canvassing conversion work in active-today KPI')
  assert.equal(pullThroughRow?.performance.totalLeads, 1, 'converted canvassing lead should pull through to principal performance lead count')
  assert.equal(pullThroughRow?.performance.pipelineValue, 2100000, 'converted canvassing lead value should pull through to principal pipeline value')
  assert.equal(pullThroughRow?.performance.activityVolume, 3, 'lead and canvassing conversion activities should pull through without double-counting duplicate rows')
  assert.equal(topLevelModel.topPerformers[0]?.movement, 3, 'top performer movement should include residential canvassing activity')
  assert.equal(topLevelModel.analytics.activityHeatmap.find((row) => row.type === 'calls')?.days.find((day) => day.day === 'Sun')?.value, 1, 'main command centre heatmap should include residential canvassing calls once')
  assert.equal(topLevelModel.analytics.activityHeatmap.find((row) => row.type === 'notes')?.days.find((day) => day.day === 'Sun')?.value, 2, 'main command centre heatmap should include conversion notes and lead-created activity')
  assert.equal(pullThroughRow?.performance.lastActivityAt, '2026-08-02T10:00:00.000Z', 'latest canvassing conversion activity should set last activity at principal level')
}

{
  const detailNow = new Date('2026-08-02T10:00:00.000Z')
  const performanceAgent = {
    id: 'canvassing-performance-agent',
    name: 'Canvassing Performance Agent',
    email: 'canvassing-performance@test.com',
    role: 'agent',
    status: 'active',
    organisationId: 'agency-a',
    branchId: 'benoni',
  }
  const canvassingActivity = {
    id: 'canvassing-activity-1',
    assignedAgentId: 'canvassing-performance-agent',
    activityType: 'Call',
    outcome: 'Connected',
    activityDate: '2026-08-02T09:00:00.000Z',
  }
  const performanceModel = buildAgentPerformanceModel({
    agents: [performanceAgent],
    branches,
    activities: [canvassingActivity],
    filters: {
      branchId: 'all',
      office: 'all',
      role: 'all',
      status: 'all',
      search: '',
      dateRange: 'last_7_days',
    },
    now: detailNow,
  })
  const modelAgent = performanceModel.agents[0]
  assert.equal(modelAgent?.performance.activityVolume, 1, 'canvassing calls should contribute to agent performance activity volume')
  assert.equal(modelAgent?.performance.activeToday, true, 'canvassing calls logged today should mark the agent active today')
  assert.equal(modelAgent?.performance.lastActivityAt, '2026-08-02T09:00:00.000Z', 'canvassing calls should update agent performance last activity')
  assert.equal(modelAgent?.performance.sparkline.some(Boolean), true, 'canvassing calls should contribute to the performance sparkline')
  assert.equal(performanceModel.kpis.activeToday, 1, 'canvassing calls should contribute to active-today KPI')
  assert.equal(
    performanceModel.charts.activityHeatmap.find((row) => row.type === 'calls')?.days.find((day) => day.day === 'Sun')?.value,
    1,
    'canvassing calls should contribute to the calls heatmap',
  )
  assert.equal(performanceModel.intelligence.recentActivity[0]?.action, 'Call', 'canvassing calls should appear in recent performance activity')

  const detailModel = getPrincipalAgentDetailCommandCentre({
    agent: performanceAgent,
    branches,
    now: detailNow,
    canvassingProspects: [
      {
        id: 'canvassing-prospect-1',
        assignedAgentId: 'canvassing-performance-agent',
        createdAt: '2026-08-01T08:00:00.000Z',
      },
    ],
    canvassingActivities: [
      canvassingActivity,
    ],
  })
  const prospectingMetrics = new Map(detailModel.prospectingActivity.metrics.map((metric) => [metric.key, metric]))
  assert.equal(prospectingMetrics.get('prospectsAdded')?.value, 1, 'agent detail should count assigned canvassing prospects')
  assert.equal(prospectingMetrics.get('callsLogged')?.value, 1, 'agent detail should count assigned canvassing calls')
  assert.equal(detailModel.agentIdentity.lastActivityAt, '2026-08-02T09:00:00.000Z', 'canvassing calls should pull through to agent last activity')
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
