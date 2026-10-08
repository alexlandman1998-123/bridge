import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({ logLevel: 'silent', optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true }, appType: 'custom' })
try {
  const { buildBranchDashboard: build } = await server.ssrLoadModule('/src/services/branchDashboardModel.js')
  const now = new Date('2026-10-08T12:00:00Z')
  const members = [
    { id: 'owner-member', user_id: 'owner-user', email: 'owner@example.test', role: 'owner' },
    { id: 'principal-member', user_id: 'principal-user', email: 'principal@example.test', role: 'principal' },
    { id: 'agent-member', user_id: 'agent-user', email: 'agent@example.test', role: 'agent' },
    { id: 'assistant-member', user_id: 'assistant-user', role: 'assistant' },
  ]
  const listing = (id, extra = {}) => ({ id, organisation_id: 'company-a', branch_id: 'branch-a', assigned_agent_id: 'owner-user', listing_status: 'active', created_at: '2026-02-01', ...extra })
  const deal = (id, extra = {}) => ({ id, organisation_id: 'company-a', assigned_branch_id: 'branch-a', assigned_user_id: 'owner-user', lifecycle_state: 'active', created_at: '2026-01-01', ...extra })
  const branch = {
    id: 'branch-a', organisationId: 'company-a', members,
    listings: [listing('sale'), listing('signed', { listing_status: 'mandate_signed' }), listing('rental', { listing_category: 'rental', listing_status: 'seller_lead' }), listing('principal', { assigned_agent_id: 'principal-member', listing_status: 'draft' }), listing('email-only', { assigned_agent_id: null, assigned_agent_email: 'AGENT@EXAMPLE.TEST' }), listing('creator', { assigned_agent_id: 'agent-user', created_by: 'owner-user' }), listing('stale-email', { assigned_agent_id: 'principal-user', assigned_agent_email: 'owner@example.test' }), listing('assistant', { assigned_agent_id: 'assistant-user' }), listing('sold', { listing_status: 'sold' }), listing('withdrawn', { listing_status: 'withdrawn' }), listing('archived', { listing_status: 'archived' }), listing('rented', { listing_category: 'rental', listing_status: 'rented' }), listing('hidden-archive', { listing_visibility: 'archived' }), listing('legacy-sold', { listing_status: 'listing_sold' }), listing('legacy-withdrawn', { listing_status: 'listing_withdrawn' }), listing('other-branch', { branch_id: 'branch-b' }), listing('other-company', { organisation_id: 'company-b' })],
    transactions: [deal('old-open'), deal('principal', { assigned_user_id: 'principal-user' }), deal('closed', { registered_at: '2026-10-03', lifecycle_state: 'registered', agent_commission_amount: 30000, gross_commission_amount: 50000 }), deal('cancelled', { lifecycle_state: 'cancelled' }), deal('archived', { lifecycle_state: 'archived' }), deal('foreign', { assigned_branch_id: null, branch_id: 'branch-b' }), deal('foreign-company', { organisation_id: 'company-b' })],
    leads: [], offers: [], appointments: [],
  }
  const result = build(branch, { now, period: '7_days' })
  assert.equal(result.staff.length, 4, 'all staff roles have allocation metrics')
  const byId = new Map(result.staff.map((row) => [row.id, row]))
  assert.equal(byId.get('owner-user').listings, 3, 'owners own sale, signed mandate and rental stock')
  assert.equal(byId.get('principal-user').listings, 2, 'both membership and user IDs identify a principal')
  assert.equal(byId.get('agent-user').listings, 2, 'an explicit assignee wins over its creator')
  assert.equal(byId.get('assistant-user').listings, 1)
  assert.equal(byId.get('owner-user').transactions, 1, 'old open deals count, closed and other branch deals do not')
  assert.equal(byId.get('principal-user').transactions, 1)
  assert.equal(byId.get('owner-user').commission, 30000, 'earned commission uses registration date and actual agent split')
  assert.equal(result.agents.length, 1, 'staff calculations do not alter leaderboard eligibility')
  const previous = build(branch, { now, period: 'last_month' })
  for (const member of members) {
    const old = previous.staff.find((row) => row.id === member.user_id)
    assert.equal(old.listings, byId.get(member.user_id).listings, 'current listings do not follow reporting dates')
    assert.equal(old.transactions, byId.get(member.user_id).transactions, 'current deals do not follow reporting dates')
  }
  assert.equal(previous.staff.find((row) => row.id === 'owner-user').commission, 0, 'commission follows its labelled reporting period')
  const missing = build({ ...branch, dataAvailability: { listings: false, transactions: false } }, { now })
  for (const row of missing.staff) assert.deepEqual([row.listings, row.transactions, row.commission], [null, null, null], 'unavailable reads remain unknown')
  const unknownSplit = build({ ...branch, transactions: [deal('unsplit', { lifecycle_state: 'registered', registered_at: '2026-10-03', gross_commission_amount: 50000 })] }, { now })
  assert.equal(unknownSplit.staff.find((row) => row.id === 'owner-user').commission, null, 'a missing split is not zero commission')
  const empty = build({ ...branch, listings: [], transactions: [] }, { now })
  assert.deepEqual([empty.staff[0].listings, empty.staff[0].transactions, empty.staff[0].commission], [0, 0, 0], 'verified absence remains a real zero')
  console.log('branch staff: all roles, assigned identities, current workload, period commission, scope and unavailable reads passed')
} finally {
  await server.close()
}
