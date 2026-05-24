import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({
  root: process.cwd(),
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const {
    buildAgencyAnalyticsModel,
  } = await server.ssrLoadModule('/src/modules/agency/analytics/agencyAnalyticsUtils.js')
  const {
    buildRoleHeadcount,
    shouldIncludeInAgentLeaderboard,
  } = await server.ssrLoadModule('/src/lib/reportingRoleLogic.js')

  const branch = { id: 'branch-1', name: 'Main Branch' }
  const principal = {
    id: 'member-principal',
    user_id: 'principal-user',
    email: 'principal@example.test',
    branch_id: branch.id,
    role: 'principal',
    workspace_role: 'principal',
    status: 'active',
    first_name: 'Priya',
    last_name: 'Principal',
  }
  const agent = {
    id: 'member-agent',
    user_id: 'agent-user',
    email: 'agent@example.test',
    branch_id: branch.id,
    role: 'agent',
    workspace_role: 'agent',
    status: 'active',
    first_name: 'Alex',
    last_name: 'Agent',
  }
  const users = [principal, agent]
  const now = new Date('2026-05-24T12:00:00.000Z')

  const model = buildAgencyAnalyticsModel({
    branches: [branch],
    users,
    branchId: 'all',
    dateRangeKey: 'last_30_days',
    now,
    transactions: [
      {
        id: 'tx-principal',
        assigned_branch_id: branch.id,
        assigned_user_id: principal.user_id,
        purchase_price: 2000000,
        stage: 'offer accepted',
        created_at: '2026-05-20T10:00:00.000Z',
        updated_at: '2026-05-21T10:00:00.000Z',
      },
      {
        id: 'tx-agent',
        assigned_branch_id: branch.id,
        assigned_user_id: agent.user_id,
        purchase_price: 1000000,
        stage: 'offer accepted',
        created_at: '2026-05-20T10:00:00.000Z',
        updated_at: '2026-05-21T10:00:00.000Z',
      },
    ],
    listings: [
      {
        id: 'listing-principal',
        branch_id: branch.id,
        created_by: principal.user_id,
        asking_price: 2500000,
        listing_status: 'active',
        created_at: '2026-05-19T10:00:00.000Z',
      },
    ],
    leads: [
      {
        lead_id: 'lead-principal',
        branch_id: branch.id,
        assigned_user_id: principal.user_id,
        status: 'new',
        created_at: '2026-05-18T10:00:00.000Z',
      },
    ],
    appointments: [
      {
        appointment_id: 'appointment-principal',
        branch_id: branch.id,
        agent_id: principal.user_id,
        appointment_type: 'Viewing',
        date_time: '2026-05-22T10:00:00.000Z',
        created_at: '2026-05-22T10:00:00.000Z',
      },
    ],
  })

  assert.equal(model.branchPerformance[0].activeAgents, 1)
  assert.equal(model.branchPerformance[0].activePrincipals, 1)
  assert.equal(model.branchPerformance[0].activeOperationalUsers, 2)
  assert.equal(model.branchPerformance[0].listings, 1)
  assert.equal(model.branchPerformance[0].transactions, 2)
  assert.equal(model.agentPerformance.some((row) => row.agentId === principal.user_id), false)
  assert.equal(model.agentPerformance.some((row) => row.agentId === agent.user_id), true)

  const leadershipModel = buildAgencyAnalyticsModel({
    ...model.meta,
    branches: [branch],
    users,
    branchId: 'all',
    dateRangeKey: 'last_30_days',
    now,
    includeLeadershipInLeaderboard: true,
    transactions: [
      {
        id: 'tx-principal',
        assigned_branch_id: branch.id,
        assigned_user_id: principal.user_id,
        purchase_price: 2000000,
        stage: 'offer accepted',
        created_at: '2026-05-20T10:00:00.000Z',
        updated_at: '2026-05-21T10:00:00.000Z',
      },
    ],
    listings: [
      {
        id: 'listing-principal',
        branch_id: branch.id,
        created_by: principal.user_id,
        listing_status: 'active',
        created_at: '2026-05-19T10:00:00.000Z',
      },
    ],
  })

  const principalRow = leadershipModel.agentPerformance.find((row) => row.agentId === principal.user_id)
  assert.equal(principalRow?.roleLabel, 'Principal')
  assert.equal(principalRow?.listings, 1)
  assert.equal(shouldIncludeInAgentLeaderboard(principal), false)
  assert.equal(shouldIncludeInAgentLeaderboard(principal, { includeLeadership: true }), true)
  assert.deepEqual(buildRoleHeadcount(users), {
    activeAgents: 1,
    activePrincipals: 1,
    activeManagers: 0,
    activeSupportUsers: 0,
    activeOperationalUsers: 2,
  })

  console.log('reporting-role-logic tests passed')
} finally {
  await server.close()
}
