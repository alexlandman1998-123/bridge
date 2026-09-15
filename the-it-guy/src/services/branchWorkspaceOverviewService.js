import { getBranch } from './agencyBranchService'

const TERMINAL_TRANSACTIONS = new Set(['registered', 'cancelled', 'canceled', 'archived', 'completed'])
const INACTIVE_LISTINGS = new Set(['withdrawn', 'sold', 'archived', 'cancelled', 'canceled', 'completed', 'inactive'])

function text(value) { return String(value || '').trim() }
function lower(value) { return text(value).toLowerCase() }
function number(value) { const result = Number(value); return Number.isFinite(result) ? result : 0 }
function date(value) { const result = new Date(value || ''); return Number.isNaN(result.getTime()) ? null : result }
function recordDate(row = {}) { return date(row.created_at || row.createdAt || row.updated_at || row.updatedAt) }
function inRange(row, range) { const value = recordDate(row); return Boolean(value && value >= range.start && value <= range.end) }

function resolveRange(period = 'this_month', now = new Date(), from, to) {
  const customStart = date(from)
  const customEnd = date(to)
  if (customStart && customEnd && customStart <= customEnd) {
    customStart.setHours(0, 0, 0, 0)
    customEnd.setHours(23, 59, 59, 999)
    const span = customEnd.getTime() - customStart.getTime()
    return { key: 'custom', start: customStart, end: customEnd, previousStart: new Date(customStart.getTime() - span - 1), previousEnd: new Date(customStart.getTime() - 1) }
  }
  const end = new Date(now)
  let start = new Date(now.getFullYear(), now.getMonth(), 1)
  if (period === 'last_month') start = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  if (period === '90_days') start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 89)
  const previousEnd = new Date(start.getTime() - 1)
  const span = end.getTime() - start.getTime()
  return { key: period, start, end, previousStart: new Date(start.getTime() - span), previousEnd }
}

function activeTransaction(row = {}) { return !row.registered_at && !TERMINAL_TRANSACTIONS.has(lower(row.lifecycle_state || row.stage || row.status)) }
function activeListing(row = {}) { return !INACTIVE_LISTINGS.has(lower(row.listing_status || row.stage || row.status)) }
function transactionValue(row = {}) { return number(row.sales_price || row.purchase_price || row.sale_price) }
function commission(row = {}) {
  const stored = number(row.gross_commission_amount || row.projected_commission_amount || row.commission_amount)
  if (stored) return stored
  const rate = number(row.gross_commission_percentage || row.commission_percentage || row.commission_rate)
  return rate ? transactionValue(row) * rate / 100 : 0
}
function delta(current, previous) { return previous ? Math.round((current - previous) / previous * 100) : current ? 100 : null }

function memberKeys(member = {}) { return [member.id, member.user_id, member.email].map(lower).filter(Boolean) }
function isOwnedBy(row = {}, member = {}) {
  const keys = new Set(memberKeys(member))
  return [row.assigned_agent_id, row.assigned_agent, row.assigned_agent_email, row.agent_id, row.owner_id, row.user_id].map(lower).some((key) => keys.has(key))
}

function buildSeries(records, range, predicate = () => true) {
  const buckets = Array.from({ length: 8 }, () => 0)
  const span = Math.max(range.end.getTime() - range.start.getTime(), 1)
  records.filter(predicate).forEach((row) => {
    const value = recordDate(row)
    if (!value || value < range.start || value > range.end) return
    const index = Math.min(7, Math.floor((value.getTime() - range.start.getTime()) / span * 8))
    buckets[index] += 1
  })
  return buckets
}

export function buildBranchWorkspaceOverview(branch = {}, { period = 'this_month', from, to, now = new Date() } = {}) {
  const range = resolveRange(period, now, from, to)
  const listings = Array.isArray(branch.listings) ? branch.listings : []
  const leads = Array.isArray(branch.leads) ? branch.leads : []
  const transactions = Array.isArray(branch.transactions) ? branch.transactions : []
  const members = Array.isArray(branch.members) ? branch.members : []
  const current = (rows, predicate = () => true) => rows.filter(predicate).filter((row) => inRange(row, range)).length
  const previous = (rows, predicate = () => true) => rows.filter(predicate).filter((row) => { const value = recordDate(row); return Boolean(value && value >= range.previousStart && value <= range.previousEnd) }).length
  const activeAgents = members.filter((row) => lower(row.status) === 'active' && lower(row.role || row.workspace_role).includes('agent'))
  const activeListings = listings.filter(activeListing)
  const activeLeads = leads.filter((row) => !['archived', 'closed', 'lost'].includes(lower(row.status || row.stage)))
  const activeTransactions = transactions.filter(activeTransaction)
  const pipeline = activeTransactions.reduce((sum, row) => sum + transactionValue(row), 0)
  const previousPipeline = transactions.filter(activeTransaction).filter((row) => { const value = recordDate(row); return Boolean(value && value >= range.previousStart && value <= range.previousEnd) }).reduce((sum, row) => sum + transactionValue(row), 0)
  const projectedCommission = activeTransactions.reduce((sum, row) => sum + commission(row), 0)
  const previousCommission = transactions.filter(activeTransaction).filter((row) => { const value = recordDate(row); return Boolean(value && value >= range.previousStart && value <= range.previousEnd) }).reduce((sum, row) => sum + commission(row), 0)
  const stages = [
    ['new', 'New leads', leads.filter((row) => inRange(row, range) && ['new', 'unqualified'].includes(lower(row.stage || row.status)))],
    ['qualified', 'Qualified', leads.filter((row) => inRange(row, range) && lower(row.stage || row.status).includes('qualif'))],
    ['viewings', 'Viewings', leads.filter((row) => inRange(row, range) && lower(row.stage || row.status).includes('view'))],
    ['offers', 'Offers', transactions.filter((row) => inRange(row, range) && lower(row.stage || row.lifecycle_state).includes('offer'))],
    ['transfer', 'Transfer', transactions.filter((row) => inRange(row, range) && ['transfer', 'lodged'].some((key) => lower(row.stage || row.lifecycle_state).includes(key)))],
    ['registered', 'Registered', transactions.filter((row) => inRange(row, range) && (Boolean(row.registered_at) || lower(row.lifecycle_state) === 'registered'))],
  ].map(([key, label, rows]) => ({ key, label, count: rows.length }))
  const attention = [
    { key: 'unassigned_leads', title: 'Leads without an assigned agent', count: activeLeads.filter((row) => !text(row.assigned_agent_id)).length, detail: 'Assign ownership so every open lead has a next contact.', tab: 'leads' },
    { key: 'stale_transactions', title: 'Transactions without recent activity', count: activeTransactions.filter((row) => { const value = date(row.updated_at || row.created_at); return !value || now - value > 14 * 86400000 }).length, detail: 'Review transactions with no activity in the last 14 days.', tab: 'transactions' },
    { key: 'unassigned_listings', title: 'Listings without an assigned agent', count: activeListings.filter((row) => !text(row.assigned_agent_id)).length, detail: 'Assign an agent to keep listing ownership clear.', tab: 'listings' },
  ].filter((item) => item.count > 0)
  const activity = [...listings.map((row) => ({ id: `listing-${row.id}`, type: 'Listing updated', detail: text(row.title) || 'Listing activity', at: row.updated_at || row.created_at, tab: 'listings' })), ...leads.map((row) => ({ id: `lead-${row.lead_id}`, type: 'Lead updated', detail: text(row.stage || row.status) || 'Lead activity', at: row.updated_at || row.created_at, tab: 'leads' })), ...transactions.map((row) => ({ id: `transaction-${row.id}`, type: 'Transaction updated', detail: text(row.stage || row.lifecycle_state) || 'Transaction activity', at: row.updated_at || row.created_at, tab: 'transactions' }))].filter((item) => inRange({ updated_at: item.at }, range)).sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0)).slice(0, 5)
  const staff = activeAgents.slice(0, 5).map((member) => ({
    id: member.id || member.user_id || member.email,
    name: text([member.first_name, member.last_name].filter(Boolean).join(' ')) || text(member.name) || text(member.email) || 'Agent',
    listings: listings.filter((row) => inRange(row, range) && isOwnedBy(row, member)).length,
    transactions: transactions.filter((row) => inRange(row, range) && isOwnedBy(row, member)).length,
    commission: transactions.filter((row) => inRange(row, range) && isOwnedBy(row, member)).reduce((sum, row) => sum + commission(row), 0),
  })).sort((left, right) => right.commission - left.commission || right.transactions - left.transactions || right.listings - left.listings)
  return { period: range.key, kpis: [
    { key: 'staff', label: 'Active agents', value: activeAgents.length, change: delta(current(activeAgents), previous(activeAgents)), tab: 'staff' },
    { key: 'listings', label: 'Active listings', value: activeListings.length, change: delta(current(listings, activeListing), previous(listings, activeListing)), tab: 'listings' },
    { key: 'leads', label: 'Active leads', value: activeLeads.length, change: delta(current(leads), previous(leads)), tab: 'leads' },
    { key: 'transactions', label: 'Active transactions', value: activeTransactions.length, change: delta(current(transactions, activeTransaction), previous(transactions, activeTransaction)), tab: 'transactions' },
    { key: 'pipeline', label: 'Transaction pipeline', value: pipeline, change: delta(pipeline, previousPipeline), tab: 'transactions', currency: true },
    { key: 'commission', label: 'Projected commission', value: projectedCommission, change: delta(projectedCommission, previousCommission), tab: 'performance', currency: true },
  ], series: { listings: buildSeries(listings, range, activeListing), transactions: buildSeries(transactions, range, activeTransaction), registrations: buildSeries(transactions, range, (row) => Boolean(row.registered_at)) }, stages, attention, staff, activity }
}

export async function getBranchWorkspaceOverview(branchId, options = {}) {
  const branch = await getBranch(branchId)
  if (!branch) throw new Error('Branch not found or no longer accessible.')
  return buildBranchWorkspaceOverview(branch, options)
}
