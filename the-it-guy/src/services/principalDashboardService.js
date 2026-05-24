import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'
import { getReportingRole, getReportingRoleLabel } from '../lib/reportingRoleLogic'
import { assertResolvedWorkspaceContext } from './workspaceResolutionService'
import {
  getDashboardPipelineValue,
  getDashboardTransactionPrice,
  getScopedDashboardTransactions,
  logDashboardPipelineDiagnostics,
} from '../lib/dashboardTransactionIntegrity'

const COMPLETED_STATES = ['registered', 'closed', 'completed']
const RISK_DOCUMENT_STATUSES = ['requested', 'pending', 'missing', 'rejected', 'overdue']
const DONE_DOCUMENT_STATUSES = ['uploaded', 'approved', 'completed', 'accepted']
const OPEN_PACKET_STATUSES = ['draft', 'generated', 'ready', 'sent', 'viewed', 'partially_signed', 'pending']
const FINANCE_PROCESS_KEYS = ['finance', 'bond', 'bond_origination', 'bond_originator']
const ATTORNEY_PROCESS_KEYS = ['attorney', 'transfer', 'conveyancing']
const ALL_BRANCHES_ID = 'all'

export const PRINCIPAL_DASHBOARD_DATE_PRESETS = [
  { key: 'this_month', label: 'This Month' },
  { key: 'last_month', label: 'Last Month' },
  { key: 'last_30_days', label: 'Last 30 Days' },
  { key: 'this_year', label: 'This Year' },
]

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

function startOfYear(date) {
  return new Date(date.getFullYear(), 0, 1)
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

export function getDateRangeFromPreset(preset = 'this_month', { now = new Date(), startDate = null, endDate = null } = {}) {
  const baseDate = toDate(now) || new Date()
  const customStart = toDate(startDate)
  const customEnd = toDate(endDate)
  if (customStart && customEnd && customStart < customEnd) {
    return {
      key: 'custom',
      startDate: customStart.toISOString(),
      endDate: customEnd.toISOString(),
      label: 'Custom Range',
    }
  }

  const key = PRINCIPAL_DASHBOARD_DATE_PRESETS.some((item) => item.key === preset) ? preset : 'this_month'
  const today = startOfDay(baseDate)
  let start
  let end
  let previousStart
  let previousEnd

  if (key === 'last_30_days') {
    start = addDays(today, -29)
    end = addDays(today, 1)
    previousStart = addDays(start, -30)
    previousEnd = start
  } else if (key === 'last_month') {
    end = startOfMonth(baseDate)
    start = addMonths(end, -1)
    previousStart = addMonths(start, -1)
    previousEnd = start
  } else if (key === 'this_year') {
    start = startOfYear(baseDate)
    end = new Date(baseDate.getFullYear() + 1, 0, 1)
    previousStart = new Date(baseDate.getFullYear() - 1, 0, 1)
    previousEnd = start
  } else {
    start = startOfMonth(baseDate)
    end = addMonths(start, 1)
    previousStart = addMonths(start, -1)
    previousEnd = start
  }

  return {
    key,
    startDate: start.toISOString(),
    endDate: end.toISOString(),
    previousStartDate: previousStart.toISOString(),
    previousEndDate: previousEnd.toISOString(),
    label: PRINCIPAL_DASHBOARD_DATE_PRESETS.find((item) => item.key === key)?.label || 'This Month',
  }
}

function resolveDateRange(dateRange = 'this_month', now = new Date(), customRange = {}) {
  const resolved = getDateRangeFromPreset(dateRange, { now, ...customRange })
  const start = toDate(resolved.startDate) || startOfMonth(now)
  const end = toDate(resolved.endDate) || addMonths(start, 1)
  const previousStart = toDate(resolved.previousStartDate) || addMonths(start, -1)
  const previousEnd = toDate(resolved.previousEndDate) || start
  return { ...resolved, start, end, previousStart, previousEnd }
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

function getMissingColumnName(error) {
  const message = normalizeText(error?.message)
  if (!message) return ''
  return (
    message.match(/column\s+\S+\.([a-zA-Z0-9_]+)\s+does not exist/i)?.[1] ||
    message.match(/could not find the ['"]?([a-zA-Z0-9_]+)['"]?\s+column/i)?.[1] ||
    ''
  )
}

function removeColumnFromSelect(fields, columnName) {
  if (!fields || fields === '*' || !columnName) return fields
  const normalizedColumn = normalizeKey(columnName)
  const parts = String(fields).split(',').map((part) => part.trim()).filter(Boolean)
  const nextParts = parts.filter((part) => normalizeKey(part.split(/\s+as\s+/i)[0]) !== normalizedColumn)
  return nextParts.length === parts.length ? fields : nextParts.join(', ')
}

async function safeSelect(table, selectVariants, { agencyId = '', agencyColumn = 'organisation_id', order = 'updated_at', ascending = false, limit = 1000 } = {}) {
  if (!isSupabaseConfigured || !supabase) return []
  const variants = Array.isArray(selectVariants) ? selectVariants : [selectVariants || '*']
  let lastError = null
  for (const selectFields of variants) {
    let fields = selectFields
    const removedColumns = new Set()
    for (let attempt = 0; attempt < 24; attempt += 1) {
      let query = supabase.from(table).select(fields)
      if (agencyId && agencyColumn) query = query.eq(agencyColumn, agencyId)
      if (order) query = query.order(order, { ascending })
      if (limit) query = query.limit(limit)
      const { data, error } = await query
      if (!error) return data || []
      lastError = error
      const missingColumn = getMissingColumnName(error)
      const nextFields = removeColumnFromSelect(fields, missingColumn)
      if (missingColumn && nextFields !== fields && !removedColumns.has(missingColumn)) {
        removedColumns.add(missingColumn)
        fields = nextFields
        continue
      }
      if (!isMissingSourceError(error)) throw error
      break
    }
  }
  console.debug('[PrincipalDashboard] Source unavailable; using empty result.', { table, message: lastError?.message })
  return []
}

async function safeSelectByIds(table, selectVariants, ids = [], { idColumn = 'transaction_id', order = 'updated_at', ascending = false, limit = 1000 } = {}) {
  if (!isSupabaseConfigured || !supabase) return []
  const normalizedIds = Array.from(new Set((Array.isArray(ids) ? ids : []).map(normalizeText).filter(Boolean)))
  if (!normalizedIds.length) return []
  const variants = Array.isArray(selectVariants) ? selectVariants : [selectVariants || '*']
  let lastError = null
  for (const selectFields of variants) {
    let fields = selectFields
    const removedColumns = new Set()
    for (let attempt = 0; attempt < 24; attempt += 1) {
      let query = supabase.from(table).select(fields).in(idColumn, normalizedIds)
      if (order) query = query.order(order, { ascending })
      if (limit) query = query.limit(limit)
      const { data, error } = await query
      if (!error) return data || []
      lastError = error
      const missingColumn = getMissingColumnName(error)
      const nextFields = removeColumnFromSelect(fields, missingColumn)
      if (missingColumn && nextFields !== fields && !removedColumns.has(missingColumn)) {
        removedColumns.add(missingColumn)
        fields = nextFields
        continue
      }
      if (!isMissingSourceError(error)) throw error
      break
    }
  }
  console.debug('[PrincipalDashboard] Scoped source unavailable; using empty result.', { table, message: lastError?.message })
  return []
}

function getDealValue(row = {}) {
  return getDashboardTransactionPrice(row)
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

function getActiveTransactionStageProgress(row = {}) {
  const status = getTransactionStatusText(row)
  if (status.includes('registered') || status.includes('complete')) return 100
  if (status.includes('lodg')) return 82
  if (status.includes('transfer') || status.includes('attorney')) return 64
  if (status.includes('finance') || status.includes('bond')) return 42
  if (status.includes('offer') || status.includes('otp') || status.includes('signed')) return 24
  return 12
}

function classifyActiveTransactionCategory(row = {}) {
  const haystack = [
    row.transaction_type,
    row.transactionType,
    row.listing_source,
    row.development_id,
    row.development_name,
    row.property_type,
    row.source_context,
  ].map(normalizeKey).join(' ')
  if (haystack.includes('commercial')) return 'commercial'
  if (haystack.includes('development') || normalizeText(row.development_id)) return 'development'
  if (haystack.includes('resale') || haystack.includes('second') || haystack.includes('private_property')) return 'second_hand'
  return 'second_hand'
}

function getTransactionHealth(row = {}) {
  const status = getTransactionStatusText(row)
  const staleDays = daysBetween(row.last_meaningful_activity_at || row.updated_at || row.created_at)
  if (status.includes('blocked') || status.includes('delayed') || status.includes('cancel')) return { key: 'blocked', label: 'Blocked / Delayed' }
  if (staleDays !== null && staleDays > 14) return { key: 'attention', label: 'Needs Attention' }
  if (status.includes('waiting') || status.includes('pending')) return { key: 'waiting', label: 'Waiting' }
  return { key: 'on_track', label: 'On Track' }
}

function buildActiveTransactionCard(row = {}, usersByKey = new Map()) {
  const progressPercent = getActiveTransactionStageProgress(row)
  const stage = normalizeText(row.current_main_stage || row.stage || row.lifecycle_state || row.operational_state) || 'Transaction opened'
  const propertyName = normalizeText(row.unit_number || row.property_title || row.listing_title || row.property_address_line_1 || row.transaction_reference || row.id)
  const developmentName = normalizeText(row.development_name || row.suburb || row.city || row.transaction_type) || 'Listing'
  const financeKey = getFinanceBucket(row)
  const nextAction = normalizeText(row.next_action || row.waiting_on_role || row.operational_state || row.attorney_stage || stage)
  const stepIndex = progressPercent >= 95 ? 4 : progressPercent >= 75 ? 3 : progressPercent >= 55 ? 2 : progressPercent >= 32 ? 1 : 0
  return {
    id: normalizeText(row.id),
    reference: normalizeText(row.transaction_reference || row.id),
    propertyName,
    developmentName,
    buyerName: normalizeText(row.buyer_name || row.purchaser_name || row.client_name) || 'Buyer pending',
    assignedAgent: getAgentName(row, usersByKey),
    stage,
    financeType: financeKey === 'bond' ? 'Bond' : financeKey === 'cash' ? 'Cash' : 'Finance TBC',
    daysActive: daysBetween(row.created_at),
    progressPercent,
    category: classifyActiveTransactionCategory(row),
    health: getTransactionHealth(row),
    nextAction,
    workflowSteps: ['OTP', 'Finance', 'Transfer', 'Lodgement', 'Registration'].map((label, index) => ({
      label,
      state: index < stepIndex ? 'complete' : index === stepIndex ? 'current' : 'upcoming',
    })),
    updatedAt: row.updated_at || row.created_at,
  }
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
  return normalizeText(row.assigned_user_id || row.assigned_agent_id || row.owner_user_id || row.created_by || row.assigned_agent_email || row.assigned_agent || 'unassigned').toLowerCase()
}

function getAgentKeyFromLead(row = {}) {
  return normalizeText(row.assigned_user_id || row.assigned_agent_id || row.created_by || row.assigned_agent_email || 'unassigned').toLowerCase()
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
    role: getReportingRole(row),
    roleLabel: getReportingRoleLabel(getReportingRole(row)),
    status: normalizeText(row.status),
  }
}

function buildAvailableWorkspaces(branches = []) {
  return [
    { id: ALL_BRANCHES_ID, label: 'All Branches', name: 'All Branches', type: 'all' },
    ...branches
      .filter((branch) => branch?.is_active !== false)
      .map((branch) => ({
        id: normalizeText(branch.id),
        label: normalizeText(branch.name) || 'Untitled Branch',
        name: normalizeText(branch.name) || 'Untitled Branch',
        type: branch.is_head_office ? 'head_office' : 'branch',
        location: normalizeText(branch.location || branch.city),
      }))
      .filter((item) => item.id),
  ]
}

function getSelectedBranchId(workspaceId, availableBranches = []) {
  const requested = normalizeText(workspaceId)
  if (!requested || requested === ALL_BRANCHES_ID) return ALL_BRANCHES_ID
  return availableBranches.some((item) => item.id === requested) ? requested : ALL_BRANCHES_ID
}

function isScopedToBranch(row = {}, selectedBranchId = ALL_BRANCHES_ID, branchColumn = 'branch_id') {
  if (!selectedBranchId || selectedBranchId === ALL_BRANCHES_ID) return true
  return normalizeText(row?.[branchColumn] || row?.branchId) === selectedBranchId
}

function dedupeRowsById(rows = []) {
  const seen = new Set()
  const deduped = []
  for (const row of rows || []) {
    const id = normalizeText(row?.id)
    if (!id) {
      deduped.push(row)
      continue
    }
    if (seen.has(id)) continue
    seen.add(id)
    deduped.push(row)
  }
  return deduped
}

function isTransactionInAgencyScope(row = {}, agencyId = '') {
  const resolvedAgencyId = normalizeText(agencyId)
  if (!resolvedAgencyId) return true

  const organisationId = normalizeText(row.organisation_id)
  return Boolean(organisationId && organisationId === resolvedAgencyId)
}

function scopeTransactionsToAgency(rows = [], agencyId = '') {
  const resolvedAgencyId = normalizeText(agencyId)
  const allRows = dedupeRowsById(rows)
  if (!resolvedAgencyId) return allRows

  return allRows.filter((row) => isTransactionInAgencyScope(row, resolvedAgencyId))
}

function getCommissionAmount(row = {}, commissionByTransaction = new Map()) {
  return toNumber(row.agency_commission_amount || row.gross_commission_amount) || commissionByTransaction.get(normalizeText(row.id)) || 0
}

function buildMonthlyRevenueBuckets(transactions = [], range, commissionByTransaction = new Map()) {
  const buckets = new Map()
  const cursor = new Date(range.start.getFullYear(), range.start.getMonth(), 1)
  const inclusiveEnd = addDays(range.end, -1)
  const finalMonth = new Date(inclusiveEnd.getFullYear(), inclusiveEnd.getMonth(), 1)
  while (cursor <= finalMonth && buckets.size < 13) {
    const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`
    buckets.set(key, {
      key,
      label: cursor.toLocaleDateString('en-ZA', { month: 'short' }),
      salesValue: 0,
      commission: 0,
      count: 0,
    })
    cursor.setMonth(cursor.getMonth() + 1)
  }

  for (const row of transactions) {
    const completedAt = toDate(getTransactionCompletedAt(row))
    if (!completedAt) continue
    const key = `${completedAt.getFullYear()}-${String(completedAt.getMonth() + 1).padStart(2, '0')}`
    if (!buckets.has(key)) continue
    const bucket = buckets.get(key)
    bucket.salesValue += getDealValue(row)
    bucket.commission += getCommissionAmount(row, commissionByTransaction)
    bucket.count += 1
  }

  return [...buckets.values()]
}

function buildAgentRevenueRows(transactions = [], usersByKey = new Map(), commissionByTransaction = new Map()) {
  const agentMap = new Map()
  for (const row of transactions) {
    const key = getAgentKeyFromTransaction(row)
    const existing = agentMap.get(key) || {
      agentId: usersByKey.get(key)?.agentId || normalizeText(row.assigned_user_id || row.owner_user_id),
      agentName: getAgentName(row, usersByKey),
      salesValue: 0,
      commission: 0,
      count: 0,
    }
    existing.salesValue += getDealValue(row)
    existing.commission += getCommissionAmount(row, commissionByTransaction)
    existing.count += 1
    agentMap.set(key, existing)
  }

  return [...agentMap.values()]
    .sort((left, right) => right.commission - left.commission || right.salesValue - left.salesValue)
    .slice(0, 6)
}

function buildEmptyDashboard() {
  return {
    filters: {
      availableBranches: [{ id: ALL_BRANCHES_ID, label: 'All Branches', name: 'All Branches', type: 'all' }],
      selectedBranchId: ALL_BRANCHES_ID,
      dateRange: getDateRangeFromPreset('this_month'),
    },
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
    transactions: {
      totalActive: 0,
      registeredInRange: 0,
      pendingRegistration: 0,
      cancelledInRange: 0,
      movement: null,
      stages: [],
    },
    activeTransactions: [],
    revenue: {
      registeredValue: 0,
      earnedCommission: 0,
      expectedCommission: null,
      monthly: [],
      byAgent: [],
    },
    overview: {
      pipeline: {},
      transactions: {},
      revenue: {},
    },
    pipelineByType: {},
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

export async function getPrincipalDashboardData({
  agencyId = '',
  organisationId = '',
  workspaceId = ALL_BRANCHES_ID,
  dateRange = 'this_month',
  dateRangePreset = '',
  startDate = null,
  endDate = null,
  overviewMode = 'pipeline',
  canViewAllTransactions = true,
  actorId = '',
  actorEmail = '',
} = {}) {
  if (!isSupabaseConfigured || !supabase) return buildEmptyDashboard()

  const resolvedAgencyId = normalizeText(organisationId || agencyId)
  assertResolvedWorkspaceContext({ organisationId: resolvedAgencyId, appRole: 'agent' }, { service: 'principalDashboardService.getPrincipalDashboardData' })
  const range = resolveDateRange(dateRangePreset || dateRange, new Date(), { startDate, endDate })
  const transactionFields = [
    'id, organisation_id, assigned_branch_id, assigned_user_id, assigned_agent_id, owner_user_id, created_by, lifecycle_state, transaction_reference, transaction_type, property_type, development_id, unit_id, buyer_id, property_address_line_1, suburb, city, sales_price, purchase_price, finance_type, stage, current_main_stage, current_sub_stage_summary, assigned_agent, assigned_agent_email, assigned_attorney_email, assigned_bond_originator_email, bank, next_action, gross_commission_percentage, gross_commission_amount, agent_commission_amount, agency_commission_amount, registered_at, completed_at, archived_at, cancelled_at, deleted_at, updated_at, created_at, is_active',
    'id, organisation_id, development_id, unit_id, buyer_id, assigned_user_id, assigned_agent_id, owner_user_id, created_by, finance_type, stage, current_main_stage, assigned_agent, assigned_agent_email, next_action, registered_at, completed_at, archived_at, cancelled_at, updated_at, created_at, is_active',
  ]

  const [
    rawTransactions,
    allLeads,
    allDocumentPackets,
    allPacketEvents,
    allOrganisationUsers,
    allTransactionCommissions,
    organisationBranches,
  ] = await Promise.all([
    safeSelect('transactions', transactionFields, { agencyId: resolvedAgencyId, order: 'updated_at', limit: 1200 }),
    safeSelect('leads', [
      'lead_id, organisation_id, branch_id, assigned_user_id, assigned_agent_id, created_by, assigned_agent_email, lead_source, status, stage, converted_transaction_id, converted_at, budget, estimated_value, created_at, updated_at, seller_onboarding_status, mandate_packet_id, listing_id',
      'lead_id, organisation_id, assigned_user_id, assigned_agent_id, created_by, assigned_agent_email, lead_source, status, stage, converted_transaction_id, converted_at, budget, estimated_value, created_at, updated_at, seller_onboarding_status, mandate_packet_id, listing_id',
    ], { agencyId: resolvedAgencyId, order: 'created_at', limit: 1500 }),
    safeSelect('document_packets', 'id, organisation_id, transaction_id, lead_id, packet_type, title, status, sent_at, completed_at, created_at, updated_at', { agencyId: resolvedAgencyId, order: 'updated_at', limit: 1000 }),
    safeSelect('document_packet_events', 'id, packet_id, organisation_id, event_type, event_payload_json, created_by, created_at', { agencyId: resolvedAgencyId, order: 'created_at', limit: 300 }),
    safeSelect('organisation_users', [
      'id, organisation_id, user_id, branch_id, first_name, last_name, email, role, workspace_role, organisation_role, status, last_active_at, created_at, updated_at',
      'id, organisation_id, user_id, first_name, last_name, email, role, status, last_active_at, created_at, updated_at',
    ], { agencyId: resolvedAgencyId, order: 'updated_at', limit: 500 }),
    safeSelect('transaction_commissions', 'id, organisation_id, transaction_id, assigned_agent_id, assigned_agent_email, gross_commission_amount, agency_commission_amount, agent_commission_amount, status, created_at, updated_at', { agencyId: resolvedAgencyId, order: 'updated_at', limit: 1200 }),
    safeSelect('organisation_branches', 'id, organisation_id, name, location, city, is_head_office, is_active, updated_at, created_at', { agencyId: resolvedAgencyId, order: 'name', ascending: true, limit: 200 }),
  ])

  const availableBranches = buildAvailableWorkspaces(organisationBranches)
  const selectedBranchId = getSelectedBranchId(workspaceId, availableBranches)
  const allTransactions = scopeTransactionsToAgency(rawTransactions, resolvedAgencyId)
  const scopedActorId = normalizeText(actorId).toLowerCase()
  const scopedActorEmail = normalizeText(actorEmail).toLowerCase()
  const scopedAllTransactions = canViewAllTransactions
    ? allTransactions
    : allTransactions.filter((row) => {
        const assignedUserId = normalizeText(row.assigned_user_id || row.owner_user_id).toLowerCase()
        const assignedEmail = normalizeText(row.assigned_agent_email).toLowerCase()
        return Boolean(
          (scopedActorId && assignedUserId === scopedActorId) ||
          (scopedActorEmail && assignedEmail === scopedActorEmail),
        )
      })
  const transactions = scopedAllTransactions.filter((row) => isScopedToBranch(row, selectedBranchId, 'assigned_branch_id'))
  const leads = allLeads.filter((row) => isScopedToBranch(row, selectedBranchId, 'branch_id'))
  const organisationUsers = allOrganisationUsers.filter((row) => isScopedToBranch(row, selectedBranchId, 'branch_id'))
  const transactionIds = new Set(transactions.map((row) => normalizeText(row.id)).filter(Boolean))
  const leadIds = new Set(leads.map((row) => normalizeText(row.lead_id)).filter(Boolean))
  const documentPackets = allDocumentPackets.filter((packet) => {
    if (selectedBranchId === ALL_BRANCHES_ID) return true
    return transactionIds.has(normalizeText(packet.transaction_id)) || leadIds.has(normalizeText(packet.lead_id))
  })
  const packetIds = new Set(documentPackets.map((packet) => normalizeText(packet.id)).filter(Boolean))
  const packetEvents = allPacketEvents.filter((event) => selectedBranchId === ALL_BRANCHES_ID || packetIds.has(normalizeText(event.packet_id)))
  const [
    documentRequests,
    documents,
    subprocesses,
    linkedDocumentPackets,
    linkedTransactionCommissions,
  ] = await Promise.all([
    safeSelectByIds('document_requests', 'id, transaction_id, status, assigned_to_role, document_type, title, created_at, updated_at, completed_at', [...transactionIds], { order: 'updated_at', limit: 1500 }),
    safeSelectByIds('documents', 'id, transaction_id, name, category, uploaded_by_email, uploaded_by_role, created_at', [...transactionIds], { order: 'created_at', limit: 300 }),
    safeSelectByIds('transaction_subprocesses', 'id, transaction_id, process_type, owner_type, status, created_at, updated_at', [...transactionIds], { order: 'updated_at', limit: 1200 }),
    safeSelectByIds('document_packets', 'id, organisation_id, transaction_id, lead_id, packet_type, title, status, sent_at, completed_at, created_at, updated_at', [...transactionIds], { order: 'updated_at', limit: 1000 }),
    safeSelectByIds('transaction_commissions', 'id, organisation_id, transaction_id, assigned_agent_id, assigned_agent_email, gross_commission_amount, agency_commission_amount, agent_commission_amount, status, created_at, updated_at', [...transactionIds], { order: 'updated_at', limit: 1200 }),
  ])
  const effectiveDocumentPackets = dedupeRowsById([...documentPackets, ...linkedDocumentPackets])
  const effectivePacketIds = new Set(effectiveDocumentPackets.map((packet) => normalizeText(packet.id)).filter(Boolean))
  const linkedPacketEvents = await safeSelectByIds('document_packet_events', 'id, packet_id, organisation_id, event_type, event_payload_json, created_by, created_at', [...effectivePacketIds], { idColumn: 'packet_id', order: 'created_at', limit: 300 })
  const effectivePacketEvents = dedupeRowsById([...packetEvents, ...linkedPacketEvents])
    .filter((event) => selectedBranchId === ALL_BRANCHES_ID || effectivePacketIds.has(normalizeText(event.packet_id)))
  const transactionCommissions = dedupeRowsById([...allTransactionCommissions, ...linkedTransactionCommissions])
    .filter((row) => selectedBranchId === ALL_BRANCHES_ID || transactionIds.has(normalizeText(row.transaction_id)))
  const scopedDocumentRequests = documentRequests.filter((row) => transactionIds.has(normalizeText(row.transaction_id)))
  const scopedDocuments = documents.filter((row) => transactionIds.has(normalizeText(row.transaction_id)))
  const scopedSubprocesses = subprocesses.filter((row) => transactionIds.has(normalizeText(row.transaction_id)))
  const activeTransactions = getScopedDashboardTransactions(transactions, { organisationId: resolvedAgencyId })
  const completedTransactions = transactions.filter((row) => {
    const status = getTransactionStatusText(row)
    return COMPLETED_STATES.some((state) => status.includes(state)) || Boolean(getTransactionCompletedAt(row))
  })
  const cancelledTransactions = transactions.filter((row) => {
    const status = getTransactionStatusText(row)
    return ['cancel', 'lost', 'archive'].some((state) => status.includes(state))
  })

  const pipelineValue = getDashboardPipelineValue(activeTransactions)
  logDashboardPipelineDiagnostics({
    currentOrganisationId: resolvedAgencyId,
    transactions: activeTransactions,
    pipelineValue,
    source: 'supabase',
  })
  const currentActiveTransactions = activeTransactions.filter((row) => isBetween(row.created_at, range.start, range.end)).length
  const previousActiveTransactions = activeTransactions.filter((row) => isBetween(row.created_at, range.previousStart, range.previousEnd)).length
  const currentPipelineValue = getDashboardPipelineValue(activeTransactions.filter((row) => isBetween(row.created_at, range.start, range.end)))
  const previousPipelineValue = getDashboardPipelineValue(activeTransactions.filter((row) => isBetween(row.created_at, range.previousStart, range.previousEnd)))

  const commissionByTransaction = new Map()
  for (const row of transactionCommissions) {
    const amount = toNumber(row.agency_commission_amount || row.gross_commission_amount)
    if (amount > 0) commissionByTransaction.set(normalizeText(row.transaction_id), amount)
  }
  const expectedCommissionTransactions = activeTransactions.filter((row) => {
    const expectedDate = row.expected_transfer_date || row.registration_date
    return expectedDate ? isBetween(expectedDate, range.start, range.end) : true
  })
  const commissionValues = expectedCommissionTransactions
    .map((row) => getCommissionAmount(row, commissionByTransaction))
    .filter((value) => value > 0)
  const expectedCommission = commissionValues.length ? commissionValues.reduce((sum, value) => sum + value, 0) : null
  const currentCommission = activeTransactions
    .filter((row) => isBetween(row.expected_transfer_date || row.registration_date || row.created_at, range.start, range.end))
    .reduce((sum, row) => sum + getCommissionAmount(row, commissionByTransaction), 0)
  const previousCommission = activeTransactions
    .filter((row) => isBetween(row.expected_transfer_date || row.registration_date || row.created_at, range.previousStart, range.previousEnd))
    .reduce((sum, row) => sum + getCommissionAmount(row, commissionByTransaction), 0)

  const closingThisMonth = activeTransactions.filter((row) => isBetween(row.expected_transfer_date || row.registration_date, range.start, range.end)).length
  const previousClosingThisMonth = activeTransactions.filter((row) => isBetween(row.expected_transfer_date || row.registration_date, range.previousStart, range.previousEnd)).length
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

  const registeredTransactionsInRange = completedTransactions.filter((row) => isBetween(getTransactionCompletedAt(row), range.start, range.end))
  const previousRegisteredTransactions = completedTransactions.filter((row) => isBetween(getTransactionCompletedAt(row), range.previousStart, range.previousEnd))
  const registeredThisMonth = registeredTransactionsInRange.length
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
  const activeTransactionCards = activeTransactions
    .slice()
    .sort((left, right) => new Date(right.updated_at || right.created_at || 0) - new Date(left.updated_at || left.created_at || 0))
    .slice(0, 60)
    .map((row) => buildActiveTransactionCard(row, usersByKey))

  const agentMap = new Map()
  const createPerformanceRow = (key, row = {}) => {
    const user = usersByKey.get(key)
    return {
      agentId: user?.agentId || normalizeText(row.assigned_user_id || row.assigned_agent_id || row.owner_user_id || row.created_by),
      agentName: getAgentName(row, usersByKey),
      avatarUrl: user?.avatarUrl || '',
      role: user?.role || '',
      roleLabel: user?.roleLabel || getReportingRoleLabel(user?.role),
      pipelineValue: 0,
      activeDeals: 0,
      registeredCount: 0,
      leads: 0,
      converted: 0,
      responseRate: null,
    }
  }
  for (const row of activeTransactions) {
    const key = getAgentKeyFromTransaction(row)
    const existing = agentMap.get(key) || createPerformanceRow(key, row)
    existing.pipelineValue += getDealValue(row)
    existing.activeDeals += 1
    agentMap.set(key, existing)
  }
  for (const row of registeredTransactionsInRange) {
    const key = getAgentKeyFromTransaction(row)
    const existing = agentMap.get(key) || createPerformanceRow(key, row)
    existing.registeredCount += 1
    agentMap.set(key, existing)
  }
  for (const lead of selectedLeads) {
    const key = getAgentKeyFromLead(lead)
    const existing = agentMap.get(key) || createPerformanceRow(key, lead)
    existing.leads += 1
    if (isConvertedLead(lead)) existing.converted += 1
    agentMap.set(key, existing)
  }
  const agentPerformance = [...agentMap.values()]
    .map((agent) => ({
      agentId: agent.agentId,
      agentName: agent.agentName,
      avatarUrl: agent.avatarUrl,
      role: agent.role,
      roleLabel: agent.roleLabel,
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
    effectiveDocumentPackets.filter((packet) => normalizeKey(packet.packet_type) === 'mandate' && OPEN_PACKET_STATUSES.includes(normalizeKey(packet.status))).length +
    leads.filter((lead) => ['sent', 'in_progress', 'viewed'].includes(normalizeKey(lead.seller_onboarding_status))).length
  const missingDocuments = scopedDocumentRequests.filter((request) => {
    const status = normalizeKey(request.status)
    return RISK_DOCUMENT_STATUSES.includes(status) && !DONE_DOCUMENT_STATUSES.includes(status)
  }).length
  const otpAwaitingSignature = effectiveDocumentPackets.filter((packet) => normalizeKey(packet.packet_type) === 'otp' && OPEN_PACKET_STATUSES.includes(normalizeKey(packet.status))).length
  const financeApprovalsPending = scopedSubprocesses.filter((row) => FINANCE_PROCESS_KEYS.some((key) => normalizeKey(row.process_type).includes(key)) && !COMPLETED_STATES.includes(normalizeKey(row.status))).length
  const attorneyDelays = scopedSubprocesses.filter((row) => ATTORNEY_PROCESS_KEYS.some((key) => normalizeKey(row.process_type).includes(key)) && !COMPLETED_STATES.includes(normalizeKey(row.status)) && daysBetween(row.updated_at, now) > 7).length

  const transactionsByStage = stageDefinitions.map((stage) => {
    const matching = activeTransactions.filter((row) => getStageBucket(row) === stage.key)
    return {
      ...stage,
      count: matching.length,
      value: matching.reduce((sum, row) => sum + getDealValue(row), 0),
      percentage: percentage(matching.length, activeTransactions.length),
    }
  })
  const cancelledInRange = cancelledTransactions.filter((row) => isBetween(row.cancelled_at || row.archived_at || row.updated_at, range.start, range.end)).length
  const transactionsOverview = {
    totalActive: activeTransactions.length,
    registeredInRange: registeredTransactionsInRange.length,
    pendingRegistration,
    cancelledInRange,
    movement: trend(registeredTransactionsInRange.length, previousRegisteredTransactions.length),
    stages: transactionsByStage,
  }

  const monthlyRevenue = buildMonthlyRevenueBuckets(registeredTransactionsInRange, range, commissionByTransaction)
  const registeredValue = registeredTransactionsInRange.reduce((sum, row) => sum + getDealValue(row), 0)
  const earnedCommission = registeredTransactionsInRange.reduce((sum, row) => sum + getCommissionAmount(row, commissionByTransaction), 0)
  const revenueOverview = {
    registeredValue,
    earnedCommission,
    expectedCommission,
    monthly: monthlyRevenue,
    byAgent: buildAgentRevenueRows(registeredTransactionsInRange, usersByKey, commissionByTransaction),
  }

  const transactionsById = new Map(transactions.map((row) => [normalizeText(row.id), row]))
  const sourceMap = new Map()
  for (const lead of selectedLeads) {
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
    ...effectiveDocumentPackets
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
    ...effectivePacketEvents.map((event) => buildActivityItem({
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
    .filter((item) => item.createdAt && isBetween(item.createdAt, range.start, range.end))
    .sort((left, right) => new Date(right.createdAt || 0) - new Date(left.createdAt || 0))
    .slice(0, 8)

  return {
    filters: {
      availableBranches,
      selectedBranchId,
      availableWorkspaces: availableBranches,
      selectedWorkspaceId: selectedBranchId,
      dateRange: {
        key: range.key,
        startDate: range.startDate,
        endDate: range.endDate,
        label: range.label,
      },
      overviewMode,
    },
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
    transactions: transactionsOverview,
    activeTransactions: activeTransactionCards,
    revenue: revenueOverview,
    overview: {
      pipeline: {
        totalValue: pipelineValue,
        stages,
        financeTypes,
        registeredThisMonth,
        pendingRegistration,
        avgDealValue,
        winRate,
      },
      transactions: transactionsOverview,
      revenue: revenueOverview,
    },
    pipelineByType: financeTypes,
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
      hasAnyRecords: allTransactions.length > 0 || allLeads.length > 0 || allDocumentPackets.length > 0,
      agencyId: resolvedAgencyId,
      workspaceId: selectedBranchId,
      selectedBranchId,
      requestedBranchId: normalizeText(workspaceId),
      requestedWorkspaceId: normalizeText(workspaceId),
      dateRange: range.key,
    },
  }
}
