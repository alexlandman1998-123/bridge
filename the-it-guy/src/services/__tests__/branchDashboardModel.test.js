import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({ logLevel: 'silent', optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true }, appType: 'custom' })
try {
  const { buildBranchDashboard: build, resolveBranchReportingRange: range } = await server.ssrLoadModule('/src/services/branchDashboardModel.js')
  const now = new Date('2026-10-01T10:00:00Z')
  const lead = (id, extra = {}) => ({ lead_id: id, branch_id: 'branch-a', created_at: '2026-09-10', qualified_at: '2026-09-11', ...extra })
  const transaction = (id, extra = {}) => ({ id, assigned_branch_id: 'branch-a', sales_price: 1000000, lifecycle_state: 'active', created_at: '2026-08-01', gross_commission_amount: 50000, agent_commission_amount: 30000, agency_commission_amount: 20000, ...extra })
  const branch = {
    id: 'branch-a', members: Array.from({ length: 6 }, (_, index) => ({ id: `member-${index}`, user_id: `user-${index}`, role: 'agent', status: 'active', first_name: `Agent ${index}` })),
    leads: [lead('lead-1'), lead('lead-2'), lead('foreign', { branch_id: 'branch-b' })],
    listings: [{ id: 'listing-1', branch_id: 'branch-a', listing_status: 'active', assigned_agent_id: 'user-5', created_at: '2026-05-01' }, { id: 'draft', branch_id: 'branch-a', listing_status: 'draft', created_at: '2026-09-20' }, { id: 'foreign', branch_id: 'branch-b', listing_status: 'active', created_at: '2026-09-20' }],
    transactions: [transaction('open'), transaction('registered', { registered_at: '2026-09-20', lifecycle_state: 'registered', assigned_user_id: 'user-5', originating_buyer_lead_id: 'lead-1' }), transaction('another-sale', { registered_at: '2026-09-22', assigned_user_id: 'user-5', originating_buyer_lead_id: 'lead-1' }), transaction('cancelled', { cancelled_at: '2026-09-20', registered_at: '2026-09-19' }), transaction('lost', { lifecycle_state: 'lost' }), transaction('rejected', { status: 'rejected' }), transaction('deleted', { deleted_at: '2026-09-02' }), transaction('foreign', { assigned_branch_id: 'branch-b' })],
    appointments: [{ appointment_id: 'viewing-1', lead_id: 'lead-1', appointment_type: 'viewing', status: 'Completed', created_at: '2026-09-12', completed_at: '2026-09-13' }, { appointment_id: 'cancelled', lead_id: 'lead-1', appointment_type: 'viewing', status: 'Cancelled', created_at: '2026-09-12' }, { appointment_id: 'meeting', lead_id: 'lead-1', appointment_type: 'meeting', created_at: '2026-09-12' }, { appointment_id: 'foreign', lead_id: 'foreign', appointment_type: 'viewing', created_at: '2026-09-12' }],
    offers: [{ id: 'offer-1', buyer_lead_id: 'lead-1', submitted_at: '2026-09-14', status: 'accepted' }, { id: 'draft', buyer_lead_id: 'lead-1', status: 'draft', created_at: '2026-09-14' }],
    leadActivities: [], commissionSnapshots: [{ transaction_id: 'registered', gross_commission_amount: 60000, agent_commission_amount: 36000, agency_commission_amount: 24000 }], transactionHistory: [],
  }
  const result = build(branch, { now })
  const kpi = (key) => result.kpis.find((item) => item.key === key)
  assert.equal(kpi('pipeline').value, 1000000, 'pipeline contains only current open deals')
  assert.equal(kpi('transactions').value, 1)
  assert.equal(kpi('commission').value, 50000)
  assert.equal(kpi('pipeline').change, null, 'no fabricated historical snapshot comparison')
  assert.equal(kpi('registered').value, 2, 'registration uses completion date rather than creation date')
  assert.equal(kpi('conversion').value, 50, 'multiple sales from one lead do not inflate conversion')
  assert.equal(result.movement.find((item) => item.key === 'viewings').value, 1)
  assert.equal(result.movement.find((item) => item.key === 'offers').value, 1)
  assert.equal(result.movement.find((item) => item.key === 'registrations').values.reduce((sum, value) => sum + value, 0), 2)
  assert.equal(result.portfolio.active, 1, 'drafts and other branches are not active listings')
  assert.equal(result.portfolio.total, 2)
  assert.equal(result.portfolio.olderThan90, 1)
  assert.equal(result.agents[0].id, 'user-5', 'ranking includes agents beyond first five members')
  assert.equal(result.agents[0].salesValue, 2000000)
  assert.equal(result.agents[0].commission, 66000, 'agent commission uses actual split snapshots')
  assert.equal(result.financials.gross, 110000)
  assert.equal(result.financials.agent + result.financials.agency, result.financials.gross)
  assert.equal(result.financials.buckets.find((item) => item.label.includes('Sep')).sales, 2000000)
  assert.equal(build(branch, { now, period: '7_days' }).kpis[0].value, result.kpis[0].value, 'period does not alter snapshot metrics')
  assert.equal(build(branch, { now, period: '7_days' }).kpis.find((item) => item.key === 'registered').value, 0)
  assert.equal(result.buckets.length, 30)
  assert.equal(build(branch, { now, period: '90_days' }).granularity, 'week')
  assert.equal(build(branch, { now, period: 'this_year' }).granularity, 'month')
  assert.equal(range('last_month', now).end.toISOString(), '2026-09-30T21:59:59.999Z')
  assert.equal(range('this_month', now).previousEnd.toISOString(), '2026-09-01T10:00:00.000Z', 'elapsed previous month comparison')
  assert.equal(range('7_days', new Date('2026-09-30T22:30:00Z')).start.toISOString(), '2026-09-24T22:00:00.000Z', 'South African calendar boundary')
  const missing = build({ ...branch, transactions: [transaction('missing', { gross_commission_amount: null, agent_commission_amount: null, agency_commission_amount: null })], leads: branch.leads.map((row) => ({ ...row, qualified_at: null, stage: 'Offer' })) }, { now })
  assert.equal(missing.kpis.find((item) => item.key === 'commission').value, null, 'unknown commission is not an arbitrary percentage')
  assert.equal(missing.kpis.find((item) => item.key === 'conversion').value, null, 'advanced current stage is not qualification history')
  const zero = build({ ...branch, transactions: [transaction('zero', { gross_commission_amount: 0, gross_commission_percentage: 6 })] }, { now })
  assert.equal(zero.kpis.find((item) => item.key === 'commission').value, 0, 'recorded zero wins over calculation')
  const noSplits = build({ ...branch, transactions: [transaction('unsplit', { registered_at: '2026-09-21', agent_commission_amount: null, agency_commission_amount: null })], commissionSnapshots: [] }, { now })
  assert.equal(noSplits.financials.gross, 50000)
  assert.equal(noSplits.financials.agent, null, 'no default agent split inferred')
  const unavailable = build({ ...branch, dataAvailability: { transactions: false, listings: false, appointments: false } }, { now })
  assert.equal(unavailable.kpis[0].value, null)
  assert.equal(unavailable.portfolio.total, null)
  assert.equal(unavailable.movement.find((item) => item.key === 'viewings').value, null)
  assert.equal(unavailable.financials.gross, null)
  const empty = build({ id: 'branch-a', members: [], leads: [], listings: [], transactions: [], offers: [], appointments: [] }, { now })
  assert.equal(empty.kpis[0].value, 0)
  assert.equal(empty.kpis.find((item) => item.key === 'registered').change, null, 'divide by zero does not become fake growth')
  assert.equal(empty.portfolio.averageAge, null)
  const unlinkedRegistration = build({ ...branch, transactions: [transaction('missing-lineage', { registered_at: '2026-09-20' })] }, { now })
  assert.equal(unlinkedRegistration.kpis.find((item) => item.key === 'conversion').value, null, 'unattributed registrations must not fabricate a zero conversion rate')
  console.log('branch executive dashboard: calculations, dates, scope, missing data and ranking passed')
} finally {
  await server.close()
}
