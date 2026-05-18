import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'

const ACTIVE_EXCLUDED_STATES = ['registered', 'closed', 'completed', 'cancelled', 'canceled', 'lost', 'archived', 'deleted']
const COMPLETED_STATES = ['registered', 'closed', 'completed']
const RISK_DOCUMENT_STATUSES = ['requested', 'pending', 'missing', 'rejected', 'overdue']
const DONE_DOCUMENT_STATUSES = ['uploaded', 'approved', 'completed', 'accepted']
const OPEN_PACKET_STATUSES = ['draft', 'generated', 'ready', 'sent', 'viewed', 'partially_signed', 'pending']
const FINANCE_PROCESS_KEYS = ['finance', 'bond', 'bond_origination', 'bond_originator']
const ATTORNEY_PROCESS_KEYS = ['attorney', 'transfer', 'conveyancing']

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase()
}

function toNumber(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function toDate(value) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function startOfDay(date) {
  const next = new Date(date)
  next.setHours(0, 0, 0, 0)
  return next
}

function addDays(date, days) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function addMonths(date, months) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1)
}

function daysBetween(start, end = new Date()) {
  const startDate = toDate(start)
  const endDate = toDate(end)
  if (!startDate || !endDate) return null
  return Math.max(0, Math.round((endDate.getTime() - startDate.getTime()) / 86400000))
}

function isBetween(value, start, end) {
  const date = toDate(value)
  if (!date) return false
  return date >= start && date < end
}

function resolveDateRange(dateRange = 'this_month', now = new Date()) {
  const today = startOfDay(now)
  if (dateRange === 'last_30_days') {
    const start = addDays(today, -29)
    const end = addDays(today, 1)
    return { key: dateRange, start, end, previousStart: addDays(start, -30), previousEnd: start }
  }
  if (dateRange === 'last_month') {
    const end = startOfMonth(now)
    const start = addMonths(end, -1)
    return { key: dateRange, start, end, previousStart: addMonths(start, -1), previousEnd: start }
  }
  const start = startOfMonth(now)
  const end = addMonths(start, 1)
  return { key: 'this_month', start, end, previousStart: addMonths(start, -1), previousEnd: start }
}

function isMissingSourceError(error) {
  if (!error) return false
  const code = normalizeKey(error.code)
  const message = normalizeKey(error.message)
  const status = Number(error.status || error.statusCode || 0)
  return (
    status === 404 ||
    code === '42p01' ||
    code === '42703' ||
    code === 'pgrst116' ||
    code === 'pgrst204' ||
    code === 'pgrst205' ||
    message.includes('does not exist') ||
    message.includes('schema cache') ||
    message.includes('could not find')
  )
}

async function safeSelect(table, selectVariants, { agencyId = '', agencyColumn = 'organisation_id', order = 'updated_at', ascending = false, limit = 1000 } = {}) {
  if (!isSupabaseConfigured || !supabase) return []
  const variants = Array.isArray(selectVariants) ? selectVariants : [selectVariants || '*']
  let lastError = null
  for (const fields of variants) {
    let query = supabase.from(table).select(fields)
    if (agencyId && agencyColumn) query = query.eq(agencyColumn, agencyId)
    if (order) query = query.order(order, { ascending })
    if (limit) query = query.limit(limit)
    const { data, error } = await query
    if (!error) return data || []
    lastError = error
    if (!isMissingSourceError(error)) throw error
  }
  console.debug('[PrincipalDashboard] Source unavailable; using empty result.', { table, message: lastError?.message })
  return []
}

function getDealValue(row = {}) {
  return toNumber(row.purchase_price || row.sales_price || row.sale_price || row.estimated_value || row.budget)
}

function getTransactionStatusText(row = {}) {
  return [
    row.lifecycle_state,
    row.current_main_stage,
    row.stage,
    row.operational_state,
    row.attorney_stage,
  ].map(normalizeKey).join(' ')
}

function isRegisteredTransaction(row = {}) {
  const status = getTransactionStatusText(row)
  return Boolean(row.registered_at || row.registration_date || status.includes('registered') || status.includes('closed'))
}

function isExcludedTransaction(row = {}) {
  const status = getTransactionStatusText(row)
  if (row.is_active === false) return true
  return ACTIVE_EXCLUDED_STATES.some((state) => status.includes(state))
}

function isActiveTransaction(row = {}) {
  return !isExcludedTransaction(row)
}

function getTransactionCompletedAt(row = {}) {
  return row.registered_at || row.registration_date || row.completed_at || null
}

function getStageBucket(row = {}) {
  const status = getTransactionStatusText(row)
  if (isRegisteredTransaction(row)) return 'closed'
  if (status.includes('under offer') || status.includes('offer') || status.includes('otp') || status.includes('signed')) return 'under_offer'
  if (status.includes('transfer') || status.includes('lodg') || status.includes('attorney') || status.includes('finance') || status.includes('pending')) return 'pending'
  if (status.includes('qual') || status.includes('fica') || status.includes('document') || status.includes('viewing')) return 'qualifying'
  return 'new'
}

function getFinanceBucket(row = {}) {
  const raw = normalizeKey(row.finance_type || row.financeType)
  const cash = toNumber(row.cash_amount)
  const bond = toNumber(row.bond_amount)
  if (raw.includes('cash')) return 'cash'
  if (raw.includes('bond')) return 'bond'
  if (raw.includes('combination') || raw.includes('hybrid')) return 'bond'
  if (cash > 0 && bond <= 0) return 'cash'
  if (bond > 0) return 'bond'
  return 'unknown'
}

function trend(current, previous) {
  const currentValue = toNumber(current)
  const previousValue = toNumber(previous)
  if (!previousValue && !currentValue) return null
  if (!previousValue) return null
  return Math.round(((currentValue - previousValue) / Math.abs(previousValue)) * 100)
}

function percentage(part, total) {
  const denominator = toNumber(total)
  if (!denominator) return 0
  return Math.round((toNumber(part) / denominator) * 100)
}

function average(values = []) {
  const valid = values.map(toNumber).filter((value) => Number.isFinite(value) && value > 0)
  if (!valid.length) return null
  return valid.reduce((sum, value) => sum + value, 0) / valid.length
}

function isConvertedLead(lead = {}) {
  const status = normalizeKey(`${lead.status} ${lead.stage}`)
  return Boolean(lead.converted_transaction_id || lead.converted_at || status.includes('converted') || status.includes('deal created'))
}

function getAgentKeyFromTransaction(row = {}) {
  return normalizeText(row.assigned_user_id || row.owner_user_id || row.assigned_agent_email || row.assigned_agent || 'unassigned').toLowerCase()
}

function getAgentKeyFromLead(row = {}) {
  return normalizeText(row.assigned_agent_id || row.assigned_agent_email || 'unassigned').toLowerCase()
}

function getAgentName(row = {}, usersByKey = new Map()) {
  const key = getAgentKeyFromTransaction(row)
  const user = usersByKey.get(key) || usersByKey.get(normalizeText(row.assigned_agent_email).toLowerCase())
  return user?.agentName || normalizeText(row.assigned_agent) || normalizeText(row.assigned_agent_email) || 'Unassigned'
}

function normalizeAgentUser(row = {}) {
  const name = [row.first_name, row.last_name].map(normalizeText).filter(Boolean).join(' ') ||
    normalizeText(row.full_name) ||
    normalizeText(row.email) ||
    'Agent'
  return {
    agentId: normalizeText(row.user_id || row.id),
    agentName: name,
    email: normalizeText(row.email).toLowerCase(),
    avatarUrl: normalizeText(row.avatar_url),
    role: normalizeText(row.role),
    status: normalizeText(row.status),
  }
}

function buildEmptyDashboard() {
  return {
    kpis: {
      pipelineValue: 0,
      activeTransactions: 0,
      expectedCommission: null,
      closingThisMonth: 0,
      avgDealCycleDays: null,
      leadToDealConversion: 0,
      trends: {
        pipelineValue: null,
        activeTransactions: null,
        expectedCommission: null,
        closingThisMonth: null,
        avgDealCycleDays: null,
        leadToDealConversion: null,
      },
    },
    pipeline: {
      totalValue: 0,
      stages: [
        { key: 'new', label: 'New', count: 0, value: 0, percentage: 0 },
        { key: 'qualifying', label: 'Qualifying', count: 0, value: 0, percentage: 0 },
        { key: 'under_offer', label: 'Under Offer', count: 0, value: 0, percentage: 0 },
        { key: 'pending', label: 'Pending', count: 0, value: 0, percentage: 0 },
        { key: 'closed', label: 'Closed', count: 0, value: 0, percentage: 0 },
      ],
      financeTypes: [
        { key: 'cash', label: 'Cash', count: 0, value: 0, percentage: 0 },
        { key: 'bond', label: 'Bond', count: 0, value: 0, percentage: 0 },
        { key: 'unknown', label: 'Unknown', count: 0, value: 0, percentage: 0 },
      ],
      registeredThisMonth: 0,
      pendingRegistration: 0,
      avgDealValue: null,
      winRate: 0,
    },
    agentPerformance: [],
    attentionRequired: {
      stuckTransactions: 0,
      unsignedMandates: 0,
      missingDocuments: 0,
      otpAwaitingSignature: 0,
      financeApprovalsPending: 0,
      attorneyDelays: 0,
    },
    leadIntelligence: [],
    recentActivity: [],
    meta: {
      lastUpdatedAt: new Date().toISOString(),
      isEmpty: true,
      missingSources: [],
    },
  }
}

function buildActivityItem(item) {
  return {
    id: item.id,
    type: item.type,
    title: item.title,
    subtitle: item.subtitle,
    actorName: item.actorName || 'System',
    transactionId: item.transactionId || null,
    createdAt: item.createdAt,
  }
}

export async function getPrincipalDashboardData({ agencyId = '', workspaceId = '', dateRange = 'this_month' } = {}) {
  if (!isSupabaseConfigured || !supabase) return buildEmptyDashboard()

  const resolvedAgencyId = normalizeText(agencyId)
  const range = resolveDateRange(dateRange)
  const transactionFields = [
    'id, organisation_id, assigned_user_id, owner_user_id, assigned_agent, assigned_agent_email, transaction_reference, stage, current_main_stage, lifecycle_state, is_active, sales_price, purchase_price, finance_type, cash_amount, bond_amount, expected_transfer_date, registration_date, registered_at, completed_at, cancelled_at, archived_at, last_meaningful_activity_at, updated_at, created_at, assigned_attorney_email, attorney_stage, operational_state, waiting_on_role, next_action, property_address_line_1, suburb, city, gross_commission_percentage, gross_commission_amount, agent_commission_amount, agency_commission_amount',
    'id, organisation_id, assigned_user_id, owner_user_id, assigned_agent, assigned_agent_email, transaction_reference, stage, current_main_stage, lifecycle_state, is_active, sales_price, purchase_price, finance_type, cash_amount, bond_amount, expected_transfer_date, registration_date, registered_at, completed_at, cancelled_at, archived_at, last_meaningful_activity_at, updated_at, created_at, assigned_attorney_email, attorney_stage, operational_state, waiting_on_role, next_action, property_address_line_1, suburb, city',
  ]

  const [
    transactions,
    leads,
    documentRequests,
    documentPackets,
    packetEvents,
    documents,
    subprocesses,
    organisationUsers,
    transactionCommissions,
  ] = await Promise.all([
    safeSelect('transactions', transactionFields, { agencyId: resolvedAgencyId, order: 'updated_at', limit: 1200 }),
    safeSelect('leads', 'lead_id, organisation_id, assigned_agent_id, lead_source, status, stage, converted_transaction_id, converted_at, budget, estimated_value, created_at, updated_at, seller_onboarding_status, mandate_packet_id, listing_id', { agencyId: resolvedAgencyId, order: 'created_at', limit: 1500 }),
    safeSelect('document_requests', 'id, transaction_id, status, assigned_to_role, document_type, title, created_at, updated_at, completed_at', { agencyId: '', agencyColumn: '', order: 'updated_at', limit: 1500 }),
    safeSelect('document_packets', 'id, organisation_id, transaction_id, lead_id, packet_type, title, status, sent_at, completed_at, created_at, updated_at', { agencyId: resolvedAgencyId, order: 'updated_at', limit: 1000 }),
    safeSelect('document_packet_events', 'id, packet_id, organisation_id, event_type, event_payload_json, created_by, created_at', { agencyId: resolvedAgencyId, order: 'created_at', limit: 300 }),
    safeSelect('documents', 'id, transaction_id, name, category, uploaded_by_email, uploaded_by_role, created_at', { agencyId: '', agencyColumn: '', order: 'created_at', limit: 300 }),
    safeSelect('transaction_subprocesses', 'id, transaction_id, process_type, owner_type, status, created_at, updated_at', { agencyId: '', agencyColumn: '', order: 'updated_at', limit: 1200 }),
    safeSelect('organisation_users', 'id, organisation_id, user_id, first_name, last_name, email, role, status, last_active_at, created_at, updated_at', { agencyId: resolvedAgencyId, order: 'updated_at', limit: 500 }),
    safeSelect('transaction_commissions', 'id, organisation_id, transaction_id, assigned_agent_id, assigned_agent_email, gross_commission_amount, agency_commission_amount, agent_commission_amount, status, created_at, updated_at', { agencyId: resolvedAgencyId, order: 'updated_at', limit: 1200 }),
  ])

  const transactionIds = new Set(transactions.map((row) => normalizeText(row.id)).filter(Boolean))
  const scopedDocumentRequests = documentRequests.filter((row) => transactionIds.has(normalizeText(row.transaction_id)))
  const scopedDocuments = documents.filter((row) => transactionIds.has(normalizeText(row.transaction_id)))
  const scopedSubprocesses = subprocesses.filter((row) => transactionIds.has(normalizeText(row.transaction_id)))
  const activeTransactions = transactions.filter(isActiveTransaction)
  const completedTransactions = transactions.filter((row) => {
    const status = getTransactionStatusText(row)
    return COMPLETED_STATES.some((state) => status.includes(state)) || Boolean(getTransactionCompletedAt(row))
  })
  const cancelledTransactions = transactions.filter((row) => {
    const status = getTransactionStatusText(row)
    return ['cancel', 'lost', 'archive'].some((state) => status.includes(state))
  })

  const pipelineValue = activeTransactions.reduce((sum, row) => sum + getDealValue(row), 0)
  const currentActiveTransactions = activeTransactions.filter((row) => isBetween(row.created_at, range.start, range.end)).length
  const previousActiveTransactions = activeTransactions.filter((row) => isBetween(row.created_at, range.previousStart, range.previousEnd)).length
  const currentPipelineValue = activeTransactions.filter((row) => isBetween(row.created_at, range.start, range.end)).reduce((sum, row) => sum + getDealValue(row), 0)
  const previousPipelineValue = activeTransactions.filter((row) => isBetween(row.created_at, range.previousStart, range.previousEnd)).reduce((sum, row) => sum + getDealValue(row), 0)

  const commissionByTransaction = new Map()
  for (const row of transactionCommissions) {
    const amount = toNumber(row.agency_commission_amount || row.gross_commission_amount)
    if (amount > 0) commissionByTransaction.set(normalizeText(row.transaction_id), amount)
  }
  const commissionValues = activeTransactions
    .map((row) => toNumber(row.agency_commission_amount || row.gross_commission_amount) || commissionByTransaction.get(normalizeText(row.id)) || 0)
    .filter((value) => value > 0)
  const expectedCommission = commissionValues.length ? commissionValues.reduce((sum, value) => sum + value, 0) : null
  const currentCommission = activeTransactions
    .filter((row) => isBetween(row.created_at, range.start, range.end))
    .reduce((sum, row) => sum + (toNumber(row.agency_commission_amount || row.gross_commission_amount) || commissionByTransaction.get(normalizeText(row.id)) || 0), 0)
  const previousCommission = activeTransactions
    .filter((row) => isBetween(row.created_at, range.previousStart, range.previousEnd))
    .reduce((sum, row) => sum + (toNumber(row.agency_commission_amount || row.gross_commission_amount) || commissionByTransaction.get(normalizeText(row.id)) || 0), 0)

  const closingThisMonth = activeTransactions.filter((row) => isBetween(row.expected_transfer_date || row.registration_date, startOfMonth(new Date()), addMonths(startOfMonth(new Date()), 1))).length
  const previousClosingThisMonth = activeTransactions.filter((row) => isBetween(row.expected_transfer_date || row.registration_date, addMonths(startOfMonth(new Date()), -1), startOfMonth(new Date()))).length
  const dealCycles = completedTransactions
    .map((row) => daysBetween(row.created_at, getTransactionCompletedAt(row)))
    .filter((value) => Number.isFinite(value))
  const avgDealCycleDays = average(dealCycles)

  const selectedLeads = leads.filter((lead) => isBetween(lead.created_at, range.start, range.end))
  const previousLeads = leads.filter((lead) => isBetween(lead.created_at, range.previousStart, range.previousEnd))
  const convertedLeads = selectedLeads.filter(isConvertedLead).length
  const previousConvertedLeads = previousLeads.filter(isConvertedLead).length
  const leadToDealConversion = percentage(convertedLeads, selectedLeads.length)
  const previousLeadConversion = percentage(previousConvertedLeads, previousLeads.length)

  const stageDefinitions = [
    { key: 'new', label: 'New' },
    { key: 'qualifying', label: 'Qualifying' },
    { key: 'under_offer', label: 'Under Offer' },
    { key: 'pending', label: 'Pending' },
    { key: 'closed', label: 'Closed' },
  ]
  const stageTotals = new Map(stageDefinitions.map((stage) => [stage.key, { ...stage, count: 0, value: 0 }]))
  for (const row of [...activeTransactions, ...completedTransactions.filter((item) => isBetween(getTransactionCompletedAt(item), range.start, range.end))]) {
    const key = getStageBucket(row)
    const item = stageTotals.get(key) || stageTotals.get('new')
    item.count += 1
    item.value += getDealValue(row)
  }
  const stageValueTotal = [...stageTotals.values()].reduce((sum, item) => sum + item.value, 0)
  const stages = [...stageTotals.values()].map((item) => ({ ...item, percentage: percentage(item.value, stageValueTotal) }))

  const financeTotals = new Map([
    ['cash', { key: 'cash', label: 'Cash', count: 0, value: 0 }],
    ['bond', { key: 'bond', label: 'Bond', count: 0, value: 0 }],
    ['unknown', { key: 'unknown', label: 'Unknown', count: 0, value: 0 }],
  ])
  for (const row of activeTransactions) {
    const key = getFinanceBucket(row)
    const item = financeTotals.get(key) || financeTotals.get('unknown')
    item.count += 1
    item.value += getDealValue(row)
  }
  const financeValueTotal = [...financeTotals.values()].reduce((sum, item) => sum + item.value, 0)
  const financeTypes = [...financeTotals.values()].map((item) => ({ ...item, percentage: percentage(item.value, financeValueTotal) }))

  const registeredThisMonth = completedTransactions.filter((row) => isBetween(getTransactionCompletedAt(row), startOfMonth(new Date()), addMonths(startOfMonth(new Date()), 1))).length
  const pendingRegistration = activeTransactions.filter((row) => {
    const status = getTransactionStatusText(row)
    return status.includes('transfer') || status.includes('lodg') || status.includes('registration') || status.includes('pending')
  }).length
  const avgDealValue = average(transactions.map(getDealValue))
  const resolvedOutcomes = completedTransactions.length + cancelledTransactions.length
  const winRate = percentage(completedTransactions.length, resolvedOutcomes)

  const usersByKey = new Map()
  for (const row of organisationUsers.map(normalizeAgentUser)) {
    if (row.agentId) usersByKey.set(row.agentId.toLowerCase(), row)
    if (row.email) usersByKey.set(row.email, row)
  }
  const agentMap = new Map()
  for (const row of activeTransactions) {
    const key = getAgentKeyFromTransaction(row)
    const existing = agentMap.get(key) || {
      agentId: usersByKey.get(key)?.agentId || normalizeText(row.assigned_user_id || row.owner_user_id),
      agentName: getAgentName(row, usersByKey),
      avatarUrl: usersByKey.get(key)?.avatarUrl || '',
      pipelineValue: 0,
      activeDeals: 0,
      registeredCount: 0,
      leads: 0,
      converted: 0,
      responseRate: null,
    }
    existing.pipelineValue += getDealValue(row)
    existing.activeDeals += 1
    agentMap.set(key, existing)
  }
  for (const row of completedTransactions) {
    const key = getAgentKeyFromTransaction(row)
    const existing = agentMap.get(key) || {
      agentId: usersByKey.get(key)?.agentId || normalizeText(row.assigned_user_id || row.owner_user_id),
      agentName: getAgentName(row, usersByKey),
      avatarUrl: usersByKey.get(key)?.avatarUrl || '',
      pipelineValue: 0,
      activeDeals: 0,
      registeredCount: 0,
      leads: 0,
      converted: 0,
      responseRate: null,
    }
    existing.registeredCount += 1
    agentMap.set(key, existing)
  }
  for (const lead of leads) {
    const key = getAgentKeyFromLead(lead)
    const existing = agentMap.get(key) || {
      agentId: usersByKey.get(key)?.agentId || normalizeText(lead.assigned_agent_id),
      agentName: usersByKey.get(key)?.agentName || 'Unassigned',
      avatarUrl: usersByKey.get(key)?.avatarUrl || '',
      pipelineValue: 0,
      activeDeals: 0,
      registeredCount: 0,
      leads: 0,
      converted: 0,
      responseRate: null,
    }
    existing.leads += 1
    if (isConvertedLead(lead)) existing.converted += 1
    agentMap.set(key, existing)
  }
  const agentPerformance = [...agentMap.values()]
    .map((agent) => ({
      agentId: agent.agentId,
      agentName: agent.agentName,
      avatarUrl: agent.avatarUrl,
      pipelineValue: agent.pipelineValue,
      activeDeals: agent.activeDeals,
      conversionRate: percentage(agent.converted, agent.leads),
      registeredCount: agent.registeredCount,
      responseRate: agent.responseRate,
    }))
    .sort((left, right) => right.pipelineValue - left.pipelineValue || right.activeDeals - left.activeDeals)
    .slice(0, 6)

  const now = new Date()
  const stuckTransactions = activeTransactions.filter((row) => daysBetween(row.last_meaningful_activity_at || row.updated_at || row.created_at, now) > 14).length
  const unsignedMandates =
    documentPackets.filter((packet) => normalizeKey(packet.packet_type) === 'mandate' && OPEN_PACKET_STATUSES.includes(normalizeKey(packet.status))).length +
    leads.filter((lead) => ['sent', 'in_progress', 'viewed'].includes(normalizeKey(lead.seller_onboarding_status))).length
  const missingDocuments = scopedDocumentRequests.filter((request) => {
    const status = normalizeKey(request.status)
    return RISK_DOCUMENT_STATUSES.includes(status) && !DONE_DOCUMENT_STATUSES.includes(status)
  }).length
  const otpAwaitingSignature = documentPackets.filter((packet) => normalizeKey(packet.packet_type) === 'otp' && OPEN_PACKET_STATUSES.includes(normalizeKey(packet.status))).length
  const financeApprovalsPending = scopedSubprocesses.filter((row) => FINANCE_PROCESS_KEYS.some((key) => normalizeKey(row.process_type).includes(key)) && !COMPLETED_STATES.includes(normalizeKey(row.status))).length
  const attorneyDelays = scopedSubprocesses.filter((row) => ATTORNEY_PROCESS_KEYS.some((key) => normalizeKey(row.process_type).includes(key)) && !COMPLETED_STATES.includes(normalizeKey(row.status)) && daysBetween(row.updated_at, now) > 7).length

  const transactionsById = new Map(transactions.map((row) => [normalizeText(row.id), row]))
  const sourceMap = new Map()
  for (const lead of leads) {
    const source = normalizeText(lead.lead_source) || 'Other'
    const existing = sourceMap.get(source) || { source, leads: 0, converted: 0, dealValue: 0, dealCount: 0, cpl: null }
    existing.leads += 1
    if (isConvertedLead(lead)) {
      existing.converted += 1
      const tx = transactionsById.get(normalizeText(lead.converted_transaction_id))
      const value = tx ? getDealValue(tx) : toNumber(lead.estimated_value || lead.budget)
      if (value > 0) {
        existing.dealValue += value
        existing.dealCount += 1
      }
    }
    sourceMap.set(source, existing)
  }
  const leadIntelligence = [...sourceMap.values()]
    .map((item) => ({
      source: item.source,
      leads: item.leads,
      converted: item.converted,
      conversionRate: percentage(item.converted, item.leads),
      cpl: item.cpl,
      avgDealValue: item.dealCount ? item.dealValue / item.dealCount : null,
    }))
    .sort((left, right) => right.leads - left.leads)
    .slice(0, 8)

  const recentActivity = [
    ...completedTransactions
      .filter((row) => getTransactionCompletedAt(row))
      .map((row) => buildActivityItem({
        id: `registered-${row.id}`,
        type: 'registration_confirmed',
        title: 'Registration confirmed',
        subtitle: normalizeText(row.property_address_line_1 || row.transaction_reference || row.id),
        actorName: getAgentName(row, usersByKey),
        transactionId: row.id,
        createdAt: getTransactionCompletedAt(row),
      })),
    ...documentPackets
      .filter((packet) => normalizeKey(packet.status).includes('signed') || normalizeKey(packet.status).includes('completed'))
      .map((packet) => buildActivityItem({
        id: `packet-${packet.id}`,
        type: normalizeKey(packet.packet_type) === 'otp' ? 'otp_signed' : 'new_mandate',
        title: normalizeKey(packet.packet_type) === 'otp' ? 'OTP signed' : 'Mandate completed',
        subtitle: normalizeText(packet.title || packet.packet_type),
        actorName: 'Signing workflow',
        transactionId: packet.transaction_id,
        createdAt: packet.completed_at || packet.updated_at || packet.created_at,
      })),
    ...packetEvents.map((event) => buildActivityItem({
      id: `packet-event-${event.id}`,
      type: normalizeKey(event.event_type),
      title: normalizeText(event.event_payload_json?.title) || normalizeText(event.event_type).replaceAll('_', ' '),
      subtitle: normalizeText(event.event_payload_json?.subtitle || event.event_payload_json?.documentTitle || event.packet_id),
      actorName: normalizeText(event.event_payload_json?.actorName) || 'Document workflow',
      transactionId: event.event_payload_json?.transactionId || null,
      createdAt: event.created_at,
    })),
    ...scopedDocuments.map((document) => buildActivityItem({
      id: `document-${document.id}`,
      type: 'document_uploaded',
      title: 'Document uploaded',
      subtitle: normalizeText(document.name || document.category),
      actorName: normalizeText(document.uploaded_by_email || document.uploaded_by_role) || 'Document workflow',
      transactionId: document.transaction_id,
      createdAt: document.created_at,
    })),
    ...transactions
      .filter((row) => isBetween(row.created_at, range.start, range.end))
      .map((row) => buildActivityItem({
        id: `transaction-created-${row.id}`,
        type: 'offer_accepted',
        title: 'New transaction opened',
        subtitle: normalizeText(row.property_address_line_1 || row.transaction_reference || row.id),
        actorName: getAgentName(row, usersByKey),
        transactionId: row.id,
        createdAt: row.created_at,
      })),
  ]
    .filter((item) => item.createdAt)
    .sort((left, right) => new Date(right.createdAt || 0) - new Date(left.createdAt || 0))
    .slice(0, 8)

  return {
    kpis: {
      pipelineValue,
      activeTransactions: activeTransactions.length,
      expectedCommission,
      closingThisMonth,
      avgDealCycleDays,
      leadToDealConversion,
      trends: {
        pipelineValue: trend(currentPipelineValue, previousPipelineValue),
        activeTransactions: trend(currentActiveTransactions, previousActiveTransactions),
        expectedCommission: expectedCommission === null ? null : trend(currentCommission, previousCommission),
        closingThisMonth: trend(closingThisMonth, previousClosingThisMonth),
        avgDealCycleDays: null,
        leadToDealConversion: previousLeadConversion ? leadToDealConversion - previousLeadConversion : null,
      },
    },
    pipeline: {
      totalValue: pipelineValue,
      stages,
      financeTypes,
      registeredThisMonth,
      pendingRegistration,
      avgDealValue,
      winRate,
    },
    agentPerformance,
    attentionRequired: {
      stuckTransactions,
      unsignedMandates,
      missingDocuments,
      otpAwaitingSignature,
      financeApprovalsPending,
      attorneyDelays,
    },
    leadIntelligence,
    recentActivity,
    meta: {
      lastUpdatedAt: new Date().toISOString(),
      isEmpty: transactions.length === 0 && leads.length === 0 && recentActivity.length === 0,
      agencyId: resolvedAgencyId,
      workspaceId,
    },
  }
}
