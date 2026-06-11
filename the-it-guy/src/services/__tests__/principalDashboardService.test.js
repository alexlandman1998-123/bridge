import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')

const server = await createServer({
  root: PROJECT_ROOT,
  logLevel: 'silent',
  server: { middlewareMode: true },
})

const { getDateRangeFromPreset, getResidentialDashboardMetrics } = await server.ssrLoadModule('/src/services/principalDashboardService.js')

const now = new Date('2026-06-10T10:00:00.000Z')
const range = {
  ...getDateRangeFromPreset('this_month', { now }),
  start: new Date('2026-06-01T00:00:00.000Z'),
  end: new Date('2026-07-01T00:00:00.000Z'),
  previousStart: new Date('2026-05-01T00:00:00.000Z'),
  previousEnd: new Date('2026-06-01T00:00:00.000Z'),
}

function tx(overrides = {}) {
  return {
    id: overrides.id || 'tx-1',
    organisation_id: overrides.organisation_id || 'org-a',
    assigned_branch_id: overrides.assigned_branch_id || 'branch-a',
    assigned_user_id: overrides.assigned_user_id || 'agent-a',
    assigned_agent: overrides.assigned_agent || 'Agent A',
    stage: overrides.stage || 'otp signed',
    current_main_stage: overrides.current_main_stage || '',
    lifecycle_state: overrides.lifecycle_state || 'active',
    sales_price: overrides.sales_price ?? 2_000_000,
    purchase_price: overrides.purchase_price,
    finance_type: overrides.finance_type || 'bond',
    expected_transfer_date: overrides.expected_transfer_date || '2026-06-24T00:00:00.000Z',
    created_at: overrides.created_at || '2026-06-03T00:00:00.000Z',
    updated_at: overrides.updated_at || '2026-06-08T00:00:00.000Z',
    completed_at: overrides.completed_at,
    registered_at: overrides.registered_at,
    registration_date: overrides.registration_date,
    waiting_on_role: overrides.waiting_on_role,
    next_action: overrides.next_action,
    risk_status: overrides.risk_status,
    is_active: overrides.is_active ?? true,
  }
}

function lead(overrides = {}) {
  return {
    lead_id: overrides.lead_id || 'lead-1',
    organisation_id: overrides.organisation_id || 'org-a',
    branch_id: overrides.branch_id || 'branch-a',
    assigned_user_id: overrides.assigned_user_id || 'agent-a',
    status: overrides.status || 'new lead',
    stage: overrides.stage || 'new',
    lead_source: overrides.lead_source || 'Website',
    budget: overrides.budget ?? 1_500_000,
    estimated_value: overrides.estimated_value,
    created_at: overrides.created_at || '2026-06-02T00:00:00.000Z',
    updated_at: overrides.updated_at || '2026-06-02T00:00:00.000Z',
    converted_transaction_id: overrides.converted_transaction_id,
    mandate_packet_id: overrides.mandate_packet_id,
    listing_id: overrides.listing_id,
    seller_onboarding_status: overrides.seller_onboarding_status,
  }
}

{
  const scopedMetrics = getResidentialDashboardMetrics({
    activeTransactions: [tx({ id: 'branch-a-tx' })],
    leads: [lead({ lead_id: 'branch-a-lead' })],
    selectedLeads: [lead({ lead_id: 'branch-a-lead' })],
    commissionByTransaction: new Map([['branch-a-tx', 60_000]]),
    agentPerformance: [{ agentId: 'agent-a', agentName: 'Agent A', pipelineValue: 2_000_000, activeDeals: 1 }],
    range,
    now,
  })
  assert.equal(scopedMetrics.overview.pipelineSnapshot.activeCount, 1, 'branch-scoped rows should not be widened')
  assert.equal(scopedMetrics.pipeline.funnel.find((row) => row.key === 'leads').count, 1, 'date-filtered leads should feed the funnel')
  assert.equal(scopedMetrics.revenue.forecast.likelyRevenue, 40_800, 'OTP weighted likely revenue should use configured weights')
  assert.equal(scopedMetrics.pipeline.buyerLeadInsights.find((row) => row.key === 'new_buyer_leads').value, 1, 'buyer lead insight should use scoped leads')
  assert.equal(scopedMetrics.pipeline.agentCoaching[0].buyerLeads, 1, 'agent coaching should include buyer lead ownership')
}

{
  const emptyMetrics = getResidentialDashboardMetrics({ range, now })
  assert.equal(emptyMetrics.revenue.hasRevenueData, false, 'empty data should not fake revenue')
  assert.equal(emptyMetrics.pipeline.funnel.every((row) => row.count === 0), true, 'empty funnel should produce premium empty-state data')
}

{
  const multiAgentMetrics = getResidentialDashboardMetrics({
    activeTransactions: [tx({ id: 'a', assigned_user_id: 'agent-a', sales_price: 2_000_000 }), tx({ id: 'b', assigned_user_id: 'agent-b', assigned_agent: 'Agent B', sales_price: 3_000_000 })],
    commissionByTransaction: new Map([['a', 60_000], ['b', 90_000]]),
    agentPerformance: [
      { agentId: 'agent-b', agentName: 'Agent B', pipelineValue: 3_000_000, activeDeals: 1, pipelineTrend: 20 },
      { agentId: 'agent-a', agentName: 'Agent A', pipelineValue: 2_000_000, activeDeals: 1, pipelineTrend: -5 },
    ],
    range,
    now,
  })
  assert.equal(multiAgentMetrics.pipeline.topAgents[0].agentName, 'Agent B', 'top agents should support multi-agent data')
  assert.equal(multiAgentMetrics.pipeline.agentCoaching[0].agentName, 'Agent B', 'agent coaching should follow principal pipeline ranking')
}

{
  const noRevenueMetrics = getResidentialDashboardMetrics({
    activeTransactions: [tx({ id: 'no-commission' })],
    commissionByTransaction: new Map(),
    range,
    now,
  })
  assert.equal(noRevenueMetrics.revenue.forecast.expectedCommission, 0, 'missing commission rows should not invent expected commission')
  assert.equal(noRevenueMetrics.revenue.hasRevenueData, false, 'no revenue data should be explicit')
}

{
  const mixedFinanceMetrics = getResidentialDashboardMetrics({
    activeTransactions: [
      tx({ id: 'cash-tx', finance_type: 'cash', stage: 'transfer', sales_price: 1_000_000 }),
      tx({ id: 'bond-tx', finance_type: 'bond', stage: 'finance', sales_price: 2_000_000 }),
    ],
    registeredTransactionsInRange: [tx({ id: 'bond-registered', finance_type: 'bond', stage: 'registered', registered_at: '2026-06-05T00:00:00.000Z', completed_at: '2026-06-05T00:00:00.000Z' })],
    commissionByTransaction: new Map([['cash-tx', 30_000], ['bond-tx', 60_000], ['bond-registered', 60_000]]),
    range,
    now,
  })
  assert.equal(mixedFinanceMetrics.transactions.commandCentre.find((row) => row.key === 'finance').count, 1, 'bond finance transactions should count in finance')
  assert.equal(mixedFinanceMetrics.revenue.sources.some((row) => row.key === 'bond_revenue'), true, 'bond revenue source should appear when bond data exists')
}

{
  const completedMetrics = getResidentialDashboardMetrics({
    activeTransactions: [tx({ id: 'active-transaction', stage: 'transfer' })],
    completedTransactions: [tx({ id: 'completed-transaction', stage: 'registered', registered_at: '2026-06-04T00:00:00.000Z', completed_at: '2026-06-04T00:00:00.000Z' })],
    registeredTransactionsInRange: [tx({ id: 'completed-transaction', stage: 'registered', registered_at: '2026-06-04T00:00:00.000Z', completed_at: '2026-06-04T00:00:00.000Z' })],
    commissionByTransaction: new Map([['active-transaction', 60_000], ['completed-transaction', 60_000]]),
    range,
    now,
  })
  assert.equal(completedMetrics.overview.pipelineSnapshot.activeCount, 1, 'completed rows should not inflate active transaction count')
  assert.equal(completedMetrics.pipeline.funnel.find((row) => row.key === 'registrations').count, 1, 'completed rows should count as registrations')
}

{
  const scopedOnlyMetrics = getResidentialDashboardMetrics({
    activeTransactions: [tx({ id: 'visible-rls-row', organisation_id: 'org-a' })],
    leads: [lead({ lead_id: 'visible-lead', organisation_id: 'org-a' })],
    selectedLeads: [lead({ lead_id: 'visible-lead', organisation_id: 'org-a' })],
    range,
    now,
  })
  assert.equal(scopedOnlyMetrics.overview.pipelineSnapshot.activeCount, 1, 'RLS-safe callers should receive metrics only for already scoped rows')
  assert.equal(scopedOnlyMetrics.pipeline.funnel.find((row) => row.key === 'leads').count, 1, 'scoped lead inputs should stay scoped')
}

console.log('principal dashboard metric tests passed')
await server.close()
