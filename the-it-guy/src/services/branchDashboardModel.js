import { calculateCommissionAmounts, isCancelledTransaction, isRegisteredTransaction } from './commissionService'
import { normalizeTransactionLifecycleStage } from '../core/transactions/transactionLifecycle'
import { getPrivateListingLifecycleState, getPrivateListingStatusLabel } from '../lib/privateListingLifecycle'
import { getOperationalOwnerKeys, shouldIncludeInAgentLeaderboard } from '../lib/reportingRoleLogic'

const DAY = 86400000
const ZONE = 'Africa/Johannesburg'
export const BRANCH_REPORTING_PERIODS = [
  ['7_days', 'Last 7 days'], ['30_days', 'Last 30 days'], ['this_month', 'This month'],
  ['last_month', 'Last month'], ['90_days', 'Last 90 days'], ['this_year', 'This year'],
].map(([value, label]) => ({ value, label }))
const text = (value) => String(value ?? '').trim()
const key = (value) => text(value).toLowerCase().replace(/[\s-]+/g, '_')
const date = (value) => { if (!value) return null; const result = new Date(value); return Number.isNaN(result.getTime()) ? null : result }
const numeric = (value) => value === null || value === undefined || value === '' || !Number.isFinite(Number(value)) ? null : Number(value)
const sum = (rows, read) => rows.reduce((total, row) => total + (read(row) ?? 0), 0)
const completeSum = (rows, read) => rows.every((row) => read(row) !== null) ? sum(rows, read) : null
const dayKey = (value) => new Intl.DateTimeFormat('en-CA', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(value)
const dayStart = (value) => new Date(`${dayKey(value)}T00:00:00+02:00`)
const inside = (value, range) => { const timestamp = date(value); return Boolean(timestamp && timestamp >= range.start && timestamp <= range.end) }
const previousRange = (range) => ({ start: range.previousStart, end: range.previousEnd })
const unique = (rows, read) => new Set(rows.map(read).filter(Boolean))
const change = (current, previous) => current === null || previous === null || previous <= 0 ? null : Math.round((current - previous) / previous * 1000) / 10

export function resolveBranchReportingRange(period = '30_days', now = new Date()) {
  const today = dayStart(now)
  const [year, month] = dayKey(now).split('-').map(Number)
  const monthStart = new Date(`${year}-${String(month).padStart(2, '0')}-01T00:00:00+02:00`)
  let start = new Date(today.getTime() - 29 * DAY), end = new Date(now)
  if (period === '7_days') start = new Date(today.getTime() - 6 * DAY)
  if (period === '90_days') start = new Date(today.getTime() - 89 * DAY)
  if (period === 'this_month') start = monthStart
  if (period === 'this_year') start = new Date(`${year}-01-01T00:00:00+02:00`)
  if (period === 'last_month') {
    end = new Date(monthStart.getTime() - 1)
    start = dayStart(new Date(Date.UTC(year, month - 2, 1)))
  }
  const duration = end.getTime() - start.getTime() + 1
  let previousStart = new Date(start.getTime() - duration)
  let previousEnd = new Date(start.getTime() - 1)
  if (period === 'this_month') {
    previousStart = dayStart(new Date(Date.UTC(year, month - 2, 1)))
    previousEnd = new Date(Math.min(previousStart.getTime() + duration - 1, monthStart.getTime() - 1))
  }
  const label = BRANCH_REPORTING_PERIODS.find((item) => item.value === period)?.label || 'Last 30 days'
  return { period, label, start, end, previousStart, previousEnd }
}

export function isOpenBranchTransaction(row = {}, now = new Date()) {
  const status = [row.lifecycle_state, row.status, row.stage, row.current_main_stage].map(key)
  if (isCancelledTransaction(row) || status.some((value) => ['archived', 'deleted', 'rejected', 'lost', 'cancelled', 'canceled'].includes(value))) return false
  const completed = date(row.registered_at || row.completed_at || row.registration_date)
  return !(completed && completed <= now) && !(isRegisteredTransaction(row) && !completed)
}
export function branchRegistrationDate(row = {}, now = new Date()) {
  if (isCancelledTransaction(row) || [row.lifecycle_state, row.status, row.stage, row.current_main_stage].map(key).some((value) => ['archived', 'deleted', 'rejected', 'lost', 'cancelled', 'canceled'].includes(value)) || !isRegisteredTransaction(row)) return null
  const completed = date(row.registered_at || row.completed_at || row.registration_date)
  return completed && completed <= now ? completed : null
}
export function branchTransactionValue(row = {}) {
  return numeric(row.sales_price ?? row.purchase_price ?? row.sale_price)
}
function owned(row, member) {
  const keys = new Set([member.user_id, member.id, member.email].map(key).filter(Boolean))
  return getOperationalOwnerKeys(row).map(key).some((value) => keys.has(value))
}
function qualifiedDate(lead, activities) {
  const explicit = date(lead.qualified_at || lead.qualification_completed_at)
  if (explicit) return explicit
  return activities.filter((event) => text(event.lead_id) === text(lead.lead_id) && (
    ['qualified', 'lead_qualified', 'qualification_completed'].includes(key(event.activity_type)) ||
    ['stage_changed', 'stage_updated', 'status_changed'].includes(key(event.activity_type)) && key(event.to_stage || event.outcome) === 'qualified'
  )).map((event) => date(event.activity_date || event.created_at)).filter(Boolean).sort((a, b) => a - b)[0] || null
}

// A cohort requires durable qualification evidence and direct lead → transaction IDs.
// Current stage alone cannot recover historical qualification or prior progression.
export function calculateBranchLeadConversion(leads, transactions, activities, range, now = new Date()) {
  const cohort = leads.filter((lead) => inside(qualifiedDate(lead, activities), range))
  if (!cohort.length) return { value: null, qualified: 0, registered: 0 }
  // Registrations without durable lead attribution make this cohort rate unreliable.
  const registrations = transactions.filter((row) => inside(branchRegistrationDate(row, now), range))
  if (registrations.some((row) => !row.originating_buyer_lead_id && !leads.some((lead) => text(lead.converted_transaction_id) === text(row.id)))) return { value: null, qualified: cohort.length, registered: null }
  // Deduplicate both relationship directions; multiple transactions do not inflate the rate.
  const converted = new Set(transactions.filter((row) => inside(branchRegistrationDate(row, now), range) && cohort.some((lead) => text(lead.lead_id) === text(row.originating_buyer_lead_id) || text(lead.converted_transaction_id) === text(row.id))).flatMap((row) => cohort.filter((lead) => text(lead.lead_id) === text(row.originating_buyer_lead_id) || text(lead.converted_transaction_id) === text(row.id)).map((lead) => text(lead.lead_id))))
  return { value: Math.round(converted.size / cohort.length * 1000) / 10, qualified: cohort.length, registered: converted.size }
}

function buildBuckets(range) {
  const days = Math.ceil((range.end - range.start + 1) / DAY)
  const granularity = days > 120 ? 'month' : days > 35 ? 'week' : 'day'
  const buckets = []
  let cursor = dayStart(range.start)
  while (cursor <= range.end) {
    const next = granularity === 'month'
      ? dayStart(new Date(Date.UTC(Number(dayKey(cursor).slice(0, 4)), Number(dayKey(cursor).slice(5, 7)), 1)))
      : new Date(cursor.getTime() + (granularity === 'week' ? 7 : 1) * DAY)
    const end = new Date(Math.min(next.getTime() - 1, range.end.getTime()))
    buckets.push({ start: cursor, end, label: new Intl.DateTimeFormat('en-ZA', { timeZone: ZONE, day: granularity === 'month' ? undefined : 'numeric', month: 'short' }).format(cursor) })
    cursor = next
  }
  return { granularity, buckets }
}

export function buildBranchDashboard(branch = {}, { period = '30_days', now = new Date(), financialMonths = 12 } = {}) {
  const range = resolveBranchReportingRange(period, now)
  const scoped = (rows, branchField) => (rows || []).filter((row) => !branch.id || !row[branchField] || text(row[branchField]) === text(branch.id))
  const listings = scoped(branch.listings, 'branch_id'), leads = scoped(branch.leads, 'branch_id'), transactions = scoped(branch.transactions, 'assigned_branch_id')
  const members = branch.members || [], activities = branch.leadActivities || []
  const available = (source) => branch.dataAvailability?.[source] ?? Array.isArray(branch[source])
  const transactionIds = unique(transactions, (row) => text(row.id)), leadIds = unique(leads, (row) => text(row.lead_id)), listingIds = unique(listings, (row) => text(row.id))
  const linked = (row) => leadIds.has(text(row.lead_id || row.buyer_lead_id)) || listingIds.has(text(row.listing_id)) || transactionIds.has(text(row.transaction_id))
  const appointments = (branch.appointments || []).filter(linked).filter((row) => key(row.appointment_type) === 'viewing' && !['cancelled', 'canceled', 'declined', 'no_show', 'expired'].includes(key(row.status)) && !row.cancelled_at)
  const offers = (branch.offers || []).filter(linked).filter((row) => key(row.status) !== 'draft' && Boolean(row.submitted_at || row.accepted_at || ['submitted', 'under_review', 'countered', 'accepted', 'converted_to_transaction'].includes(key(row.status))))
  const snapshots = new Map()
  ;[...(branch.commissionSnapshots || [])].sort((a, b) => new Date(a.updated_at || a.created_at) - new Date(b.updated_at || b.created_at)).forEach((row) => snapshots.set(text(row.transaction_id), row))
  const amounts = (row) => {
    const snapshot = snapshots.get(text(row.id)) || {}
    const listing = listings.find((item) => text(item.id) === text(row.listing_id)) || {}
    const storedGross = numeric(snapshot.gross_commission_amount ?? row.gross_commission_amount ?? row.commission_amount ?? row.projected_commission_amount)
    const percent = numeric(snapshot.gross_commission_percentage ?? row.gross_commission_percentage ?? row.commission_percentage ?? listing.gross_commission_percentage ?? listing.commission_percentage)
    const storedAgent = numeric(snapshot.agent_commission_amount ?? row.agent_commission_amount)
    const storedAgency = numeric(snapshot.agency_commission_amount ?? row.agency_commission_amount)
    const gross = storedGross ?? (storedAgent !== null && storedAgency !== null ? storedAgent + storedAgency : percent !== null && branchTransactionValue(row) !== null ? branchTransactionValue(row) * percent / 100 : null)
    const split = numeric(snapshot.agent_split_percentage_snapshot ?? row.agent_split_percentage_snapshot)
    const agencySplit = numeric(snapshot.agency_split_percentage_snapshot ?? row.agency_split_percentage_snapshot)
    const calculated = calculateCommissionAmounts({ transaction: { ...row, gross_commission_amount: gross }, commissionRow: snapshot })
    return {
      gross,
      agent: storedAgent ?? (gross !== null && split !== null ? calculated.agentCommission : gross !== null && agencySplit !== null ? gross * (100 - agencySplit) / 100 : null),
      agency: storedAgency ?? (gross !== null && agencySplit !== null ? gross * agencySplit / 100 : gross !== null && split !== null ? calculated.agencyCommission : null),
    }
  }
  const open = transactions.filter((row) => isOpenBranchTransaction(row, now))
  const registeredRows = transactions.filter((row) => branchRegistrationDate(row, now))
  const registrationCount = (reportRange) => available('transactions') ? registeredRows.filter((row) => inside(branchRegistrationDate(row, now), reportRange)).length : null
  const conversion = calculateBranchLeadConversion(leads, transactions, activities, range, now)
  const previousConversion = calculateBranchLeadConversion(leads, transactions, activities, previousRange(range), now)
  const kpis = [
    { key: 'pipeline', label: 'Pipeline Value', value: available('transactions') ? completeSum(open, branchTransactionValue) : null, currency: true, context: 'Current open deals', change: null },
    { key: 'transactions', label: 'Active Deals', value: available('transactions') ? open.length : null, context: 'Current open deals', change: null },
    { key: 'commission', label: 'Projected Commission', value: available('transactions') ? completeSum(open, (row) => amounts(row).gross) : null, currency: true, context: 'Expected gross commission', change: null },
    { key: 'registered', label: 'Registered', value: registrationCount(range), context: range.label, change: change(registrationCount(range), registrationCount(previousRange(range))) },
    { key: 'conversion', label: 'Conversion Rate', value: available('leads') && available('transactions') ? conversion.value : null, percent: true, context: 'Qualified lead cohort', change: conversion.value !== null && previousConversion.value !== null ? Math.round((conversion.value - previousConversion.value) * 10) / 10 : null, changeUnit: 'pp' },
  ]
  const { buckets, granularity } = buildBuckets(range)
  const definitions = [
    ['leads', 'New Leads', leads, (row) => row.created_at, 'leads'],
    ['viewings', 'Viewings', appointments, (row) => row.completed_at || row.created_at, 'appointments'],
    ['offers', 'Offers', offers, (row) => row.submitted_at || row.created_at, 'offers'],
    ['transactions', 'Transactions', transactions.filter((row) => !isCancelledTransaction(row)), (row) => row.created_at, 'transactions'],
    ['registrations', 'Registrations', registeredRows, (row) => branchRegistrationDate(row, now), 'transactions'],
  ]
  const movement = definitions.map(([id, label, records, eventDate, source]) => {
    const count = (reportRange) => available(source) ? records.filter((row) => inside(eventDate(row), reportRange)).length : null
    return { key: id, label, value: count(range), change: change(count(range), count(previousRange(range))), values: buckets.map((bucket) => count(bucket)) }
  })
  const cohort = leads.filter((row) => inside(row.created_at, range))
  const cohortIds = unique(cohort, (row) => text(row.lead_id))
  const transactionLead = (row) => text(row.originating_buyer_lead_id) || text(leads.find((lead) => text(lead.converted_transaction_id) === text(row.id))?.lead_id)
  const milestoneSets = [
    new Set(cohortIds),
    unique(cohort.filter((lead) => { const at = qualifiedDate(lead, activities); return at && at <= range.end }), (row) => text(row.lead_id)),
    unique(appointments.filter((row) => date(row.completed_at || row.created_at) <= range.end && cohortIds.has(text(row.lead_id))), (row) => text(row.lead_id)),
    unique(offers.filter((row) => date(row.submitted_at || row.created_at) <= range.end && cohortIds.has(text(row.buyer_lead_id))), (row) => text(row.buyer_lead_id)),
    unique(transactions.filter((row) => !isCancelledTransaction(row) && cohortIds.has(transactionLead(row)) && (
      row.transfer_started_at && date(row.transfer_started_at) <= range.end ||
      normalizeTransactionLifecycleStage(row.current_main_stage || row.stage, '') === 'transfer' && date(row.updated_at) <= range.end ||
      (branch.transactionHistory || []).some((event) => text(event.transaction_id) === text(row.id) && normalizeTransactionLifecycleStage(event.to_stage, '') === 'transfer' && inside(event.created_at, { start: range.start, end: range.end }))
    )), transactionLead),
    unique(registeredRows.filter((row) => cohortIds.has(transactionLead(row)) && branchRegistrationDate(row, now) <= range.end), transactionLead),
  ]
  const qualifiedKnown = cohort.every((lead) => Boolean(qualifiedDate(lead, activities))) || milestoneSets[1].size > 0
  const stageAvailability = [available('leads'), available('leads') && qualifiedKnown, available('appointments'), available('offers'), available('transactions'), available('transactions')]
  const labels = ['Leads', 'Qualified', 'Viewings', 'Offers', 'Transfer', 'Registered']
  const stageKeys = ['leads', 'qualified', 'viewings', 'offers', 'transfer', 'registered']
  const stages = milestoneSets.map((ids, index) => {
    const previousIds = milestoneSets[index - 1]
    const progressed = previousIds ? [...ids].filter((id) => previousIds.has(id)).length : 0
    return { key: stageKeys[index], label: labels[index], count: stageAvailability[index] ? ids.size : null, rate: index && stageAvailability[index] && stageAvailability[index - 1] && previousIds.size ? Math.round(progressed / previousIds.size * 100) : null }
  })
  const [year, month] = dayKey(now).split('-').map(Number)
  const financeBuckets = Array.from({ length: financialMonths }, (_, index) => {
    const start = dayStart(new Date(Date.UTC(year, month - financialMonths + index, 1)))
    const end = new Date(Math.min(dayStart(new Date(Date.UTC(year, month - financialMonths + index + 1, 1))).getTime() - 1, now.getTime()))
    const rows = registeredRows.filter((row) => inside(branchRegistrationDate(row, now), { start, end }))
    return { label: new Intl.DateTimeFormat('en-ZA', { timeZone: ZONE, month: 'short', year: '2-digit' }).format(start), sales: available('transactions') ? completeSum(rows, branchTransactionValue) : null, gross: available('transactions') ? completeSum(rows, (row) => amounts(row).gross) : null, agency: available('transactions') ? completeSum(rows, (row) => amounts(row).agency) : null, agent: available('transactions') ? completeSum(rows, (row) => amounts(row).agent) : null }
  })
  const periodRegisteredRows = registeredRows.filter((row) => inside(branchRegistrationDate(row, now), range))
  const periodFinancials = { gross: available('transactions') ? completeSum(periodRegisteredRows, (row) => amounts(row).gross) : null }
  const financials = Object.fromEntries(['sales', 'gross', 'agency', 'agent'].map((metric) => [metric, financeBuckets.every((bucket) => bucket[metric] !== null) ? sum(financeBuckets, (bucket) => bucket[metric]) : null]))
  const activeListings = listings.filter((row) => ['active', 'under_offer', 'transaction_created'].includes(getPrivateListingLifecycleState(row)))
  const listingDate = (row) => date(row.published_at || row.listed_at || row.created_at)
  const ages = activeListings.map((row) => listingDate(row) ? Math.max(0, Math.floor((now - listingDate(row)) / DAY)) : null)
  const portfolioStatuses = [...new Set(listings.map((row) => getPrivateListingLifecycleState(row)))].map((state) => ({ key: state, label: getPrivateListingStatusLabel(state), count: listings.filter((row) => getPrivateListingLifecycleState(row) === state).length }))
  const agents = members.filter((member) => shouldIncludeInAgentLeaderboard(member)).map((member) => {
    const registered = registeredRows.filter((row) => owned(row, member) && inside(branchRegistrationDate(row, now), range))
    return { id: member.user_id || member.id, name: [member.first_name, member.last_name].filter(Boolean).join(' ') || member.name || member.email || 'Agent', email: member.email, avatarUrl: member.avatar_url || member.profile_photo_url || '', listings: available('listings') ? activeListings.filter((row) => owned(row, member)).length : null, leads: available('leads') ? leads.filter((row) => owned(row, member) && inside(row.created_at, range)).length : null, deals: available('transactions') ? registered.length : null, salesValue: available('transactions') ? completeSum(registered, branchTransactionValue) : null, grossCommission: available('transactions') ? completeSum(registered, (row) => amounts(row).gross) : null, commission: available('transactions') ? completeSum(registered, (row) => amounts(row).agent) : null }
  }).sort((a, b) => (b.salesValue ?? -1) - (a.salesValue ?? -1) || (b.deals ?? -1) - (a.deals ?? -1) || (b.grossCommission ?? -1) - (a.grossCommission ?? -1))
  const staff = agents.map((agent) => { const member = members.find((row) => text(row.user_id || row.id) === text(agent.id)); const rows = transactions.filter((row) => owned(row, member) && inside(row.created_at, range)); return { ...agent, transactions: rows.length, commission: completeSum(rows, (row) => amounts(row).gross) } })
  return { range, kpis, periodFinancials, movement, buckets, granularity, stages, financials: { ...financials, buckets: financeBuckets, months: financialMonths }, portfolio: { active: available('listings') ? activeListings.length : null, total: available('listings') ? listings.length : null, averageAge: available('listings') && ages.length && ages.every((age) => age !== null) ? Math.round(sum(ages, (age) => age) / ages.length) : null, newListings: available('listings') ? listings.filter((row) => inside(listingDate(row), range)).length : null, olderThan90: available('listings') && ages.every((age) => age !== null) ? ages.filter((age) => age > 90).length : null, statuses: portfolioStatuses }, agents, staff, series: { listings: buckets.map((bucket) => listings.filter((row) => inside(row.created_at, bucket)).length), transactions: movement.find((item) => item.key === 'transactions').values, registrations: movement.find((item) => item.key === 'registrations').values }, period, activeAgents: members.filter((member) => shouldIncludeInAgentLeaderboard(member)).length }
}
