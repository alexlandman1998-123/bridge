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
const RESIDENTIAL_FUNNEL_STAGES = [
  { key: 'leads', label: 'Leads' },
  { key: 'mandates', label: 'Mandates' },
  { key: 'viewings', label: 'Viewings' },
  { key: 'offers', label: 'Offers' },
  { key: 'acceptedOtps', label: 'Accepted OTPs' },
  { key: 'registrations', label: 'Registrations' },
]
const REVENUE_FORECAST_WEIGHTS = {
  lead: 0.08,
  mandate: 0.18,
  viewing: 0.28,
  offer: 0.45,
  otp: 0.68,
  finance: 0.78,
  transfer: 0.9,
  registration: 1,
}

export const PRINCIPAL_DASHBOARD_DATE_PRESETS = [
  { key: 'last_30_days', label: 'Last 30 Days' },
  { key: 'this_month', label: 'This Month' },
  { key: 'last_90_days', label: 'Last 90 Days' },
  { key: 'ytd', label: 'YTD' },
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
  } else if (key === 'last_90_days') {
    start = addDays(today, -89)
    end = addDays(today, 1)
    previousStart = addDays(start, -90)
    previousEnd = start
  } else if (key === 'last_month') {
    end = startOfMonth(baseDate)
    start = addMonths(end, -1)
    previousStart = addMonths(start, -1)
    previousEnd = start
  } else if (key === 'ytd' || key === 'this_year') {
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

async function fetchProfileAvatarsForOrganisationUsers(rows = []) {
  if (!isSupabaseConfigured || !supabase) return { byUserId: {}, byEmail: {} }
  const userIds = [...new Set(rows.map((row) => normalizeText(row?.user_id || row?.userId)).filter(Boolean))]
  const emails = [...new Set(rows.map((row) => normalizeKey(row?.email)).filter(Boolean))]
  if (!userIds.length && !emails.length) return { byUserId: {}, byEmail: {} }

  async function fetchProfilesBy(column, values) {
    if (!values.length) return []
    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, avatar_url')
      .in(column, values)
      .limit(1000)

    if (error) {
      if (isMissingSourceError(error) || getMissingColumnName(error) === 'avatar_url') return []
      throw error
    }

    return Array.isArray(data) ? data : []
  }

  const [profilesById, profilesByEmail] = await Promise.all([
    fetchProfilesBy('id', userIds),
    fetchProfilesBy('email', emails),
  ])

  return [...profilesById, ...profilesByEmail].reduce((accumulator, row) => {
    const avatarUrl = normalizeText(row?.avatar_url)
    if (!avatarUrl) return accumulator
    const id = normalizeText(row?.id)
    const email = normalizeKey(row?.email)
    if (id) accumulator.byUserId[id] = avatarUrl
    if (email) accumulator.byEmail[email] = avatarUrl
    return accumulator
  }, { byUserId: {}, byEmail: {} })
}

async function enrichOrganisationUsersWithProfileAvatars(rows = []) {
  const avatarLookup = await fetchProfileAvatarsForOrganisationUsers(rows)
  return rows.map((row) => ({
    ...row,
    avatar_url:
      normalizeText(row?.avatar_url) ||
      avatarLookup.byUserId[normalizeText(row?.user_id)] ||
      avatarLookup.byEmail[normalizeKey(row?.email)] ||
      '',
  }))
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
    row.risk_status,
    row.current_sub_stage_summary,
  ].map(normalizeKey).join(' ')
}

function isRegisteredTransaction(row = {}) {
  const status = getTransactionStatusText(row)
  return Boolean(row.registered_at || row.registration_date || status.includes('registered') || status.includes('closed'))
}

function getTransactionCompletedAt(row = {}) {
  return row.registered_at || row.registration_date || row.completed_at || null
}

function getExpectedRegistrationAt(row = {}) {
  return row.expected_transfer_date || row.target_registration_date || row.registration_date || row.expected_registration_date || null
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

function getResidentialPipelineStageKey(row = {}) {
  const status = getTransactionStatusText(row)
  if (status.includes('registered') || status.includes('pending reg') || status.includes('lodg')) return 'settled_pending_registration'
  if (status.includes('transfer') || status.includes('attorney') || status.includes('guarantee') || status.includes('unconditional')) return 'unconditional'
  if (status.includes('finance') || status.includes('bond') || status.includes('conditional') || status.includes('condition')) return 'conditional'
  if (status.includes('under offer') || status.includes('offer') || status.includes('otp') || status.includes('signed')) return 'under_offer'
  return 'new_listing'
}

function getResidentialClientDetails(row = {}) {
  const sellerName =
    normalizeText(row.seller_name || row.seller_names || row.owner_name || row.owner_names || row.landlord_name)
  const buyerName = normalizeText(row.buyer_name || row.purchaser_name || row.client_name || row.tenant_name)
  if (sellerName) return { clientLabel: 'Seller', clientName: sellerName }
  if (buyerName) return { clientLabel: 'Buyer', clientName: buyerName }
  return { clientLabel: 'Buyer', clientName: 'Buyer pending' }
}

function getResidentialPipelineImage(row = {}) {
  return normalizeText(
    row.property_image_url ||
    row.listing_image_url ||
    row.primary_image_url ||
    row.cover_image_url ||
    row.image_url ||
    row.photo_url,
  )
}

function buildActiveTransactionCard(row = {}, usersByKey = new Map()) {
  const progressPercent = getActiveTransactionStageProgress(row)
  const stage = normalizeText(row.current_main_stage || row.stage || row.lifecycle_state || row.operational_state) || 'Transaction opened'
  const propertyName = normalizeText(row.unit_number || row.property_title || row.listing_title || row.property_address_line_1 || row.transaction_reference || row.id)
  const developmentName = normalizeText(row.development_name || row.suburb || row.city || row.transaction_type) || 'Listing'
  const financeKey = getFinanceBucket(row)
  const nextAction = normalizeText(row.next_action || row.waiting_on_role || row.operational_state || row.attorney_stage || stage)
  const clientDetails = getResidentialClientDetails(row)
  const stageStartedAt =
    row.current_stage_entered_at ||
    row.stage_entered_at ||
    row.entered_stage_at ||
    row.stage_changed_at ||
    row.last_stage_changed_at ||
    row.updated_at ||
    row.created_at ||
    null
  const stepIndex = progressPercent >= 95 ? 4 : progressPercent >= 75 ? 3 : progressPercent >= 55 ? 2 : progressPercent >= 32 ? 1 : 0
  return {
    id: normalizeText(row.id),
    reference: normalizeText(row.transaction_reference || row.id),
    propertyName,
    developmentName,
    buyerName: normalizeText(row.buyer_name || row.purchaser_name || row.client_name) || 'Buyer pending',
    assignedAgent: getAgentName(row, usersByKey),
    stage,
    stageKey: getResidentialPipelineStageKey(row),
    financeType: financeKey === 'bond' ? 'Bond' : financeKey === 'cash' ? 'Cash' : 'Finance TBC',
    dealValue: getDealValue(row),
    imageUrl: getResidentialPipelineImage(row),
    clientLabel: clientDetails.clientLabel,
    clientName: clientDetails.clientName,
    daysActive: daysBetween(row.created_at),
    daysInStage: daysBetween(stageStartedAt),
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

function getAgentKeyFromTask(row = {}) {
  return normalizeText(row.assigned_user_id || row.assigned_agent_id || row.owner_user_id || row.created_by || row.assigned_agent_email || 'unassigned').toLowerCase()
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

function getPipelineStageWeight(row = {}) {
  const status = getTransactionStatusText(row)
  if (isRegisteredTransaction(row)) return REVENUE_FORECAST_WEIGHTS.registration
  if (status.includes('transfer') || status.includes('lodg') || status.includes('registration')) return REVENUE_FORECAST_WEIGHTS.transfer
  if (status.includes('finance') || status.includes('bond')) return REVENUE_FORECAST_WEIGHTS.finance
  if (status.includes('otp') || status.includes('signed') || status.includes('accepted')) return REVENUE_FORECAST_WEIGHTS.otp
  if (status.includes('offer') || status.includes('negotiat')) return REVENUE_FORECAST_WEIGHTS.offer
  if (status.includes('viewing') || status.includes('appointment')) return REVENUE_FORECAST_WEIGHTS.viewing
  if (status.includes('mandate')) return REVENUE_FORECAST_WEIGHTS.mandate
  return REVENUE_FORECAST_WEIGHTS.lead
}

function isDelayed(row = {}, now = new Date()) {
  const status = getTransactionStatusText(row)
  const expected = toDate(getExpectedRegistrationAt(row))
  return Boolean(
    status.includes('delay') ||
    status.includes('blocked') ||
    (expected && expected < startOfDay(now) && !isRegisteredTransaction(row)),
  )
}

function getCommandStage(row = {}) {
  const status = getTransactionStatusText(row)
  if (isRegisteredTransaction(row)) return 'complete'
  if (status.includes('registration') || status.includes('lodg')) return 'registration'
  if (status.includes('transfer') || status.includes('attorney') || status.includes('convey')) return 'transfer'
  if (status.includes('finance') || status.includes('bond') || status.includes('bank')) return 'finance'
  return 'otp'
}

const RESIDENTIAL_DASHBOARD_FLOW_STAGES = [
  {
    key: 'buyer_onboarding',
    label: 'Buyer Onboarding',
    description: 'Transactions where onboarding is in progress and OTP has not yet been finalised.',
  },
  {
    key: 'otp_signed',
    label: 'OTP Signed',
    description: 'Transactions where the Offer to Purchase has been fully executed.',
  },
  {
    key: 'finance',
    label: 'Finance',
    description: 'Transactions currently within finance approval workflows.',
  },
  {
    key: 'transfer',
    label: 'Transfer',
    description: 'Transactions currently progressing through attorney transfer workflows.',
  },
  {
    key: 'ready_for_registration',
    label: 'Ready For Registration',
    description: 'Transactions awaiting final registration.',
  },
]

function getResidentialDashboardFlowStage(row = {}) {
  const status = getTransactionStatusText(row)
  const financeType = getFinanceBucket(row)

  if (
    isRegisteredTransaction(row) ||
    status.includes('cancel') ||
    status.includes('lost') ||
    status.includes('archived')
  ) {
    return null
  }

  if (
    status.includes('ready to register') ||
    status.includes('ready for registration') ||
    status.includes('awaiting registration') ||
    status.includes('lodg')
  ) {
    return 'ready_for_registration'
  }

  if (
    status.includes('transfer in progress') ||
    status.includes('bond registration') ||
    status.includes('bond cancellation') ||
    status.includes('transfer') ||
    status.includes('attorney') ||
    status.includes('convey')
  ) {
    return 'transfer'
  }

  if (
    financeType !== 'cash' &&
    (
      status.includes('bond application') ||
      status.includes('bond processing') ||
      status.includes('bond approval') ||
      status.includes('finance') ||
      status.includes('bond') ||
      status.includes('bank')
    )
  ) {
    return 'finance'
  }

  if (
    status.includes('otp signed') ||
    status.includes('offer to purchase') ||
    status.includes('fully executed') ||
    status.includes('accepted otp') ||
    status.includes('otp') ||
    status.includes('signed')
  ) {
    return 'otp_signed'
  }

  return 'buyer_onboarding'
}

function buildResidentialDashboardFlow(activeTransactions = []) {
  const totalValue = sumBy(activeTransactions, getDealValue)
  return RESIDENTIAL_DASHBOARD_FLOW_STAGES.map((stage) => {
    const rows = activeTransactions.filter((row) => getResidentialDashboardFlowStage(row) === stage.key)
    const value = sumBy(rows, getDealValue)
    return {
      key: stage.key,
      label: stage.label,
      description: stage.description,
      count: rows.length,
      value,
      percentage: totalValue ? Math.round((value / totalValue) * 100) : 0,
    }
  })
}

function getStageEnteredAt(row = {}) {
  return (
    row.entered_stage_at ||
    row.stage_entered_at ||
    row.current_stage_entered_at ||
    row.stage_changed_at ||
    row.last_stage_changed_at ||
    row.last_meaningful_activity_at ||
    row.updated_at ||
    row.created_at ||
    null
  )
}

function countByPredicate(rows = [], predicate) {
  return rows.filter(predicate).length
}

function sumBy(rows = [], mapper) {
  return rows.reduce((sum, row) => sum + toNumber(mapper(row)), 0)
}

function buildFunnelRow({ key, label, rows = [], value = 0 }, nextCount = 0) {
  const count = rows.length
  return {
    key,
    label,
    count,
    value,
    conversionToNext: count ? Math.round((nextCount / count) * 100) : null,
  }
}

function isOpenTask(row = {}) {
  const status = normalizeKey(row.status)
  return !DONE_DOCUMENT_STATUSES.includes(status) && !['done', 'closed', 'cancelled', 'canceled'].includes(status)
}

function isBuyerLead(row = {}) {
  const text = normalizeKey(`${row.lead_type} ${row.lead_category} ${row.category} ${row.status} ${row.stage} ${row.seller_onboarding_status}`)
  if (text.includes('seller') || text.includes('mandate') || text.includes('seller_onboarding')) return false
  return true
}

function getBuyerLeadStage(row = {}) {
  return normalizeKey(`${row.status} ${row.stage}`)
}

function buildForecastBuckets(transactions = [], commissionByTransaction = new Map(), now = new Date()) {
  const buckets = Array.from({ length: 3 }).map((_, index) => {
    const date = addMonths(startOfMonth(now), index)
    return {
      key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
      label: date.toLocaleDateString('en-ZA', { month: 'short' }),
      expectedCommission: 0,
      transactionCount: 0,
      confidence: 'Estimated',
    }
  })
  const fallbackDates = new Set()
  for (const row of transactions) {
    let expectedDate = toDate(getExpectedRegistrationAt(row))
    if (!expectedDate) {
      const stageWeight = getPipelineStageWeight(row)
      const monthsOut = stageWeight >= REVENUE_FORECAST_WEIGHTS.transfer ? 1 : stageWeight >= REVENUE_FORECAST_WEIGHTS.finance ? 2 : 3
      expectedDate = addMonths(startOfMonth(now), monthsOut - 1)
      fallbackDates.add(normalizeText(row.id))
    }
    const key = `${expectedDate.getFullYear()}-${String(expectedDate.getMonth() + 1).padStart(2, '0')}`
    const bucket = buckets.find((item) => item.key === key)
    if (!bucket) continue
    bucket.expectedCommission += getCommissionAmount(row, commissionByTransaction) * getPipelineStageWeight(row)
    bucket.transactionCount += 1
  }
  return buckets.map((bucket) => ({
    ...bucket,
    expectedCommission: Math.round(bucket.expectedCommission),
    confidence: fallbackDates.size ? 'Estimated' : 'Dated',
  }))
}

function buildUpcomingRegistrationBuckets(transactions = [], commissionByTransaction = new Map(), now = new Date()) {
  const today = startOfDay(now)
  const end = addDays(today, 7)
  const days = Array.from({ length: 7 }).map((_, index) => {
    const date = addDays(today, index)
    const key = date.toISOString().slice(0, 10)
    return {
      key,
      date: date.toISOString(),
      label: index === 0 ? 'Today' : date.toLocaleDateString('en-ZA', { weekday: 'short' }),
      shortLabel: date.toLocaleDateString('en-ZA', { weekday: 'short' }).slice(0, 2),
      count: 0,
      commission: 0,
    }
  })
  const dayMap = new Map(days.map((day) => [day.key, day]))

  for (const row of transactions) {
    if (isRegisteredTransaction(row)) continue
    const expectedDate = toDate(getExpectedRegistrationAt(row))
    if (!expectedDate || expectedDate < today || expectedDate >= end) continue
    const key = expectedDate.toISOString().slice(0, 10)
    const day = dayMap.get(key)
    if (!day) continue
    day.count += 1
    day.commission += getCommissionAmount(row, commissionByTransaction)
  }

  const expectedCommission = days.reduce((sum, day) => sum + toNumber(day.commission), 0)
  const count = days.reduce((sum, day) => sum + toNumber(day.count), 0)

  return {
    count,
    expectedCommission,
    dailyBreakdown: days.map((day) => ({
      ...day,
      commission: Math.round(day.commission),
    })),
  }
}

function buildSalesFunnelInsight(stages = []) {
  const drops = stages.slice(0, -1).map((stage, index) => {
    const next = stages[index + 1] || {}
    return {
      key: `${stage.key}_to_${next.key}`,
      fromLabel: stage.label,
      toLabel: next.label,
      drop: Math.max(0, toNumber(stage.count) - toNumber(next.count)),
      conversion: stage.count ? percentage(next.count, stage.count) : 0,
    }
  })
  const largestDrop = drops.slice().sort((left, right) => right.drop - left.drop || left.conversion - right.conversion)[0] || null

  if (!largestDrop || largestDrop.drop <= 0) {
    return {
      key: 'healthy_momentum',
      message: 'Funnel movement is holding steady. Keep agent follow-up cadence consistent across every stage.',
    }
  }

  const specificMessage = {
    mandates_to_viewings: 'Focus on generating more viewings from active mandates.',
    viewings_to_offers: 'Viewings are not converting into offers. Review pricing and buyer qualification.',
    offers_to_otp: 'Offer acceptance rate is below average. Coach agents on offer quality and closing objections.',
  }[largestDrop.key]

  return {
    ...largestDrop,
    message: specificMessage || `Focus on converting ${largestDrop.fromLabel.toLowerCase()} into ${largestDrop.toLabel.toLowerCase()}.`,
    detail: `${formatCountForSentence(largestDrop.drop)} ${largestDrop.drop === 1 ? 'deal was' : 'deals were'} lost between ${largestDrop.fromLabel} and ${largestDrop.toLabel}.`,
  }
}

function formatCountForSentence(value) {
  return String(Math.max(0, Math.round(toNumber(value))))
}

function buildAverageDaysToOtp(acceptedOtpRows = [], leadRows = [], now = new Date()) {
  const leadsByTransactionId = new Map()
  for (const lead of leadRows) {
    const transactionId = normalizeText(lead.converted_transaction_id)
    if (transactionId && !leadsByTransactionId.has(transactionId)) leadsByTransactionId.set(transactionId, lead)
  }

  const durations = acceptedOtpRows
    .map((row) => {
      const linkedLead = leadsByTransactionId.get(normalizeText(row.id))
      const start = linkedLead?.created_at || row.created_at
      const end = getStageEnteredAt(row) || row.updated_at || now
      return daysBetween(start, end)
    })
    .filter((value) => Number.isFinite(value))

  const result = average(durations)
  return result === null ? null : Math.round(result)
}

function buildSalesFunnelMetrics(funnel = [], {
  previousFunnel = [],
  currentAcceptedOtpRows = [],
  previousAcceptedOtpRows = [],
  currentLeadRows = [],
  previousLeadRows = [],
  commissionByTransaction = new Map(),
  now = new Date(),
} = {}) {
  const rows = funnel
    .filter((stage) => ['leads', 'mandates', 'viewings', 'offers', 'acceptedOtps'].includes(stage.key))
    .map((stage) => ({
      key: stage.key === 'acceptedOtps' ? 'otp' : stage.key,
      label: stage.key === 'acceptedOtps' ? 'OTP' : stage.label,
      count: stage.count,
      value: stage.value,
    }))
  const previousRows = previousFunnel
    .filter((stage) => ['leads', 'mandates', 'viewings', 'offers', 'acceptedOtps'].includes(stage.key))
    .map((stage) => ({
      key: stage.key === 'acceptedOtps' ? 'otp' : stage.key,
      label: stage.key === 'acceptedOtps' ? 'OTP' : stage.label,
      count: stage.count,
      value: stage.value,
    }))
  const leadCount = rows.find((row) => row.key === 'leads')?.count || 0
  const otpCount = rows.find((row) => row.key === 'otp')?.count || 0
  const previousLeadCount = previousRows.find((row) => row.key === 'leads')?.count || 0
  const previousOtpCount = previousRows.find((row) => row.key === 'otp')?.count || 0
  const leadToOtpConversion = leadCount ? Math.round((otpCount / leadCount) * 100) : 0
  const previousLeadToOtpConversion = previousLeadCount ? Math.round((previousOtpCount / previousLeadCount) * 100) : 0
  const lostDeals = Math.max(0, leadCount - otpCount)
  const previousLostDeals = Math.max(0, previousLeadCount - previousOtpCount)
  const averageDaysToOtp = buildAverageDaysToOtp(currentAcceptedOtpRows, currentLeadRows, now)
  const previousAverageDaysToOtp = buildAverageDaysToOtp(previousAcceptedOtpRows, previousLeadRows, now)
  const pipelineValue = sumBy(currentAcceptedOtpRows, (row) => getCommissionAmount(row, commissionByTransaction))
  const previousPipelineValue = sumBy(previousAcceptedOtpRows, (row) => getCommissionAmount(row, commissionByTransaction))
  const stages = rows.map((row, index) => {
    const next = rows[index + 1] || null
    return {
      ...row,
      conversionRate: leadCount ? Math.round((toNumber(row.count) / leadCount) * 100) : row.key === 'leads' ? 100 : 0,
      conversionToNext: next ? percentage(next.count, row.count) : null,
    }
  })

  return {
    stages,
    leadToOtpConversion,
    leadToOtpConversionTrend: previousLeadCount ? leadToOtpConversion - previousLeadToOtpConversion : null,
    lostDeals,
    lostDealsTrend: previousLeadCount ? lostDeals - previousLostDeals : null,
    averageDaysToOtp,
    averageDaysToOtpTrend: averageDaysToOtp !== null && previousAverageDaysToOtp ? averageDaysToOtp - previousAverageDaysToOtp : null,
    pipelineValue,
    pipelineValueTrend: trend(pipelineValue, previousPipelineValue),
    insight: buildSalesFunnelInsight(stages),
  }
}

function buildTransactionHealthMetrics(transactionFlow = [], activeTransactions = [], now = new Date()) {
  const healthStages = ['otp', 'finance', 'transfer', 'registration', 'complete']
  const activeStageRows = activeTransactions.reduce((state, row) => {
    const key = getCommandStage(row)
    if (!state.has(key)) state.set(key, [])
    state.get(key).push(row)
    return state
  }, new Map())
  const maxCount = Math.max(0, ...transactionFlow.map((row) => toNumber(row.count)))
  const flow = healthStages.map((key) => {
    const source = transactionFlow.find((row) => row.key === key) || { key, label: key === 'otp' ? 'OTP' : key[0].toUpperCase() + key.slice(1), count: 0, percentage: 0 }
    return {
      ...source,
      isHighestVolume: maxCount > 0 && toNumber(source.count) === maxCount,
    }
  })
  const activeDistribution = flow
    .filter((row) => row.key !== 'complete')
    .map((row) => ({
      key: row.key,
      label: row.label,
      count: row.count,
      percentage: row.percentage,
    }))

  const velocity = healthStages
    .filter((key) => key !== 'complete')
    .map((key) => {
      const rows = activeStageRows.get(key) || []
      const averageDays = average(rows.map((row) => daysBetween(getStageEnteredAt(row), now))) || 0
      const flowRow = flow.find((row) => row.key === key)
      return {
        key,
        label: flowRow?.label || (key === 'otp' ? 'OTP' : key[0].toUpperCase() + key.slice(1)),
        count: flowRow?.count || 0,
        averageDays: Math.round(averageDays * 10) / 10,
      }
    })
  const maxAverageDays = Math.max(0, ...velocity.map((row) => row.averageDays))
  const highestVolume = flow
    .filter((row) => row.key !== 'complete')
    .slice()
    .sort((left, right) => toNumber(right.count) - toNumber(left.count))[0] || null
  const slowestStage = velocity
    .slice()
    .sort((left, right) => toNumber(right.averageDays) - toNumber(left.averageDays))[0] || null
  const hasActiveOperationalWork = activeTransactions.length > 0 || velocity.some((row) => row.averageDays > 0)
  const bottleneck = !hasActiveOperationalWork
    ? null
    : slowestStage?.averageDays > 0
    ? slowestStage
    : highestVolume
      ? {
          key: highestVolume.key,
          label: highestVolume.label,
          count: highestVolume.count,
          averageDays: velocity.find((row) => row.key === highestVolume.key)?.averageDays || 0,
        }
      : null

  return {
    flow,
    activeDistribution,
    velocity: velocity.map((row) => ({
      ...row,
      percentage: maxAverageDays ? Math.round((row.averageDays / maxAverageDays) * 100) : 0,
    })),
    bottleneck,
  }
}

export function getResidentialDashboardMetrics({
  activeTransactions = [],
  completedTransactions = [],
  registeredTransactionsInRange = [],
  leads = [],
  selectedLeads = [],
  documentRequests = [],
  subprocesses = [],
  documentPackets = [],
  documents = [],
  tasks = [],
  agentPerformance = [],
  usersByKey = new Map(),
  commissionByTransaction = new Map(),
  range = resolveDateRange('this_month'),
  now = new Date(),
} = {}) {
  const allPipelineTransactions = [...activeTransactions, ...registeredTransactionsInRange]
  const openDocumentRequests = documentRequests.filter((request) => {
    const status = normalizeKey(request.status)
    return RISK_DOCUMENT_STATUSES.includes(status) && !DONE_DOCUMENT_STATUSES.includes(status)
  })
  const financeSubprocesses = subprocesses.filter((row) => FINANCE_PROCESS_KEYS.some((key) => normalizeKey(row.process_type).includes(key)))
  const transferSubprocesses = subprocesses.filter((row) => ATTORNEY_PROCESS_KEYS.some((key) => normalizeKey(row.process_type).includes(key)))
  const otpPackets = documentPackets.filter((packet) => normalizeKey(`${packet.packet_type} ${packet.title}`).includes('otp'))
  const mandatePackets = documentPackets.filter((packet) => normalizeKey(`${packet.packet_type} ${packet.title}`).includes('mandate'))

  const leadRows = selectedLeads.length ? selectedLeads : leads.filter((lead) => isBetween(lead.created_at, range.start, range.end))
  const previousLeadRows = leads.filter((lead) => isBetween(lead.created_at, range.previousStart, range.previousEnd))
  const mandateLeadRows = leadRows.filter((lead) => {
    const status = normalizeKey(`${lead.status} ${lead.stage} ${lead.seller_onboarding_status}`)
    return Boolean(lead.mandate_packet_id || lead.listing_id || status.includes('mandate') || status.includes('seller_onboarding'))
  })
  const previousMandateLeadRows = previousLeadRows.filter((lead) => {
    const status = normalizeKey(`${lead.status} ${lead.stage} ${lead.seller_onboarding_status}`)
    return Boolean(lead.mandate_packet_id || lead.listing_id || status.includes('mandate') || status.includes('seller_onboarding'))
  })
  const buyerLeadRows = leadRows.filter(isBuyerLead)
  const viewingLeadRows = leadRows.filter((lead) => normalizeKey(`${lead.status} ${lead.stage}`).includes('viewing') || normalizeKey(`${lead.status} ${lead.stage}`).includes('appointment'))
  const previousViewingLeadRows = previousLeadRows.filter((lead) => normalizeKey(`${lead.status} ${lead.stage}`).includes('viewing') || normalizeKey(`${lead.status} ${lead.stage}`).includes('appointment'))
  const offerRows = allPipelineTransactions.filter((row) => {
    const status = getTransactionStatusText(row)
    return status.includes('offer') || status.includes('negotiat')
  })
  const previousOfferRows = allPipelineTransactions.filter((row) => {
    const status = getTransactionStatusText(row)
    return (status.includes('offer') || status.includes('negotiat')) && isBetween(row.created_at, range.previousStart, range.previousEnd)
  })
  const acceptedOtpRows = allPipelineTransactions.filter((row) => {
    const status = getTransactionStatusText(row)
    return status.includes('otp') || status.includes('signed') || status.includes('accepted')
  })
  const previousAcceptedOtpRows = allPipelineTransactions.filter((row) => {
    const status = getTransactionStatusText(row)
    return (status.includes('otp') || status.includes('signed') || status.includes('accepted')) && isBetween(row.created_at, range.previousStart, range.previousEnd)
  })
  const registrationRows = registeredTransactionsInRange.length
    ? registeredTransactionsInRange
    : completedTransactions.filter((row) => isBetween(getTransactionCompletedAt(row), range.start, range.end))

  const funnelSeeds = [
    { key: 'leads', label: 'Leads', rows: leadRows, value: sumBy(leadRows, (lead) => lead.estimated_value || lead.budget) },
    { key: 'mandates', label: 'Mandates', rows: [...mandateLeadRows, ...mandatePackets], value: sumBy(mandateLeadRows, (lead) => lead.estimated_value || lead.budget) },
    { key: 'viewings', label: 'Viewings', rows: viewingLeadRows, value: sumBy(viewingLeadRows, (lead) => lead.estimated_value || lead.budget) },
    { key: 'offers', label: 'Offers', rows: offerRows, value: sumBy(offerRows, getDealValue) },
    { key: 'acceptedOtps', label: 'Accepted OTPs', rows: acceptedOtpRows.length ? acceptedOtpRows : otpPackets, value: sumBy(acceptedOtpRows, getDealValue) },
    { key: 'registrations', label: 'Registrations', rows: registrationRows, value: sumBy(registrationRows, getDealValue) },
  ]
  const funnel = funnelSeeds.map((stage, index) => buildFunnelRow(stage, funnelSeeds[index + 1]?.rows?.length || 0))
  const previousFunnelSeeds = [
    { key: 'leads', label: 'Leads', rows: previousLeadRows, value: sumBy(previousLeadRows, (lead) => lead.estimated_value || lead.budget) },
    { key: 'mandates', label: 'Mandates', rows: previousMandateLeadRows, value: sumBy(previousMandateLeadRows, (lead) => lead.estimated_value || lead.budget) },
    { key: 'viewings', label: 'Viewings', rows: previousViewingLeadRows, value: sumBy(previousViewingLeadRows, (lead) => lead.estimated_value || lead.budget) },
    { key: 'offers', label: 'Offers', rows: previousOfferRows, value: sumBy(previousOfferRows, getDealValue) },
    { key: 'acceptedOtps', label: 'Accepted OTPs', rows: previousAcceptedOtpRows, value: sumBy(previousAcceptedOtpRows, getDealValue) },
    { key: 'registrations', label: 'Registrations', rows: [], value: 0 },
  ]
  const previousFunnel = previousFunnelSeeds.map((stage, index) => buildFunnelRow(stage, previousFunnelSeeds[index + 1]?.rows?.length || 0))

  const noActivityRows = activeTransactions.filter((row) => daysBetween(row.last_meaningful_activity_at || row.updated_at || row.created_at, now) >= 14)
  const expiringOtpRows = activeTransactions.filter((row) => {
    const status = getTransactionStatusText(row)
    const expected = toDate(getExpectedRegistrationAt(row))
    return (status.includes('otp') || status.includes('signed')) && expected && expected >= startOfDay(now) && expected < addDays(startOfDay(now), 14)
  })
  const waitingBuyerRows = activeTransactions.filter((row) => {
    const text = normalizeKey(`${row.waiting_on_role} ${row.next_action} ${row.current_sub_stage_summary}`)
    return text.includes('buyer') || text.includes('purchaser')
  })
  const atRiskRows = activeTransactions.filter((row) => isDelayed(row, now) || getTransactionHealth(row).key !== 'on_track')
  const noActivityRowsByAgent = new Map()
  const atRiskRowsByAgent = new Map()
  for (const row of noActivityRows) {
    const key = getAgentKeyFromTransaction(row)
    noActivityRowsByAgent.set(key, (noActivityRowsByAgent.get(key) || 0) + 1)
  }
  for (const row of atRiskRows) {
    const key = getAgentKeyFromTransaction(row)
    atRiskRowsByAgent.set(key, (atRiskRowsByAgent.get(key) || 0) + 1)
  }
  const overdueTasksByAgent = new Map()
  for (const task of tasks) {
    const dueDate = toDate(task.due_date || task.dueDate)
    if (!dueDate || dueDate >= startOfDay(now) || !isOpenTask(task)) continue
    const key = getAgentKeyFromTask(task)
    overdueTasksByAgent.set(key, (overdueTasksByAgent.get(key) || 0) + 1)
  }
  const buyerLeadsByAgent = new Map()
  const mandatesByAgent = new Map()
  const convertedLeadsByAgent = new Map()
  const totalLeadsByAgent = new Map()
  for (const lead of leadRows) {
    const key = getAgentKeyFromLead(lead)
    totalLeadsByAgent.set(key, (totalLeadsByAgent.get(key) || 0) + 1)
    if (isBuyerLead(lead)) buyerLeadsByAgent.set(key, (buyerLeadsByAgent.get(key) || 0) + 1)
    if (mandateLeadRows.includes(lead)) mandatesByAgent.set(key, (mandatesByAgent.get(key) || 0) + 1)
    if (isConvertedLead(lead)) convertedLeadsByAgent.set(key, (convertedLeadsByAgent.get(key) || 0) + 1)
  }

  const pipelineHealth = [
    { key: 'at_risk', label: 'At Risk Deals', count: atRiskRows.length, href: '/transactions?risk=at-risk' },
    { key: 'no_activity', label: 'No Activity 14+ Days', count: noActivityRows.length, href: '/transactions?filter=no-activity' },
    { key: 'otp_expiring', label: 'OTP Expiring < 14 Days', count: expiringOtpRows.length, href: '/transactions?stage=otp' },
    { key: 'waiting_on_buyer', label: 'Waiting on Buyer', count: waitingBuyerRows.length, href: '/transactions?waiting=buyer' },
    { key: 'waiting_documents', label: 'Waiting on Documents', count: openDocumentRequests.length, href: '/transactions?filter=documents' },
  ]

  const commandStages = ['otp', 'finance', 'transfer', 'registration', 'complete']
  const completeInRange = registeredTransactionsInRange
  const transactionFlowRows = [...activeTransactions, ...completeInRange]
  const transactionFlow = commandStages.map((key) => {
    const rows = transactionFlowRows.filter((row) => getCommandStage(row) === key)
    return {
      key,
      label: key === 'otp' ? 'OTP' : key[0].toUpperCase() + key.slice(1),
      count: rows.length,
      percentage: percentage(rows.length, Math.max(1, activeTransactions.length)),
    }
  })
  const residentialDashboardFlow = buildResidentialDashboardFlow(activeTransactions)
  const salesFunnel = buildSalesFunnelMetrics(funnel, {
    previousFunnel,
    currentAcceptedOtpRows: acceptedOtpRows,
    previousAcceptedOtpRows,
    currentLeadRows: leadRows,
    previousLeadRows,
    commissionByTransaction,
    now,
  })
  const transactionHealth = buildTransactionHealthMetrics(transactionFlow, activeTransactions, now)
  const commandCentre = [
    { key: 'otp', label: 'OTP', count: transactionFlow.find((row) => row.key === 'otp')?.count || 0 },
    { key: 'finance', label: 'Finance', count: transactionFlow.find((row) => row.key === 'finance')?.count || 0 },
    { key: 'transfer', label: 'Transfer', count: transactionFlow.find((row) => row.key === 'transfer')?.count || 0 },
    { key: 'registration', label: 'Registration', count: transactionFlow.find((row) => row.key === 'registration')?.count || 0 },
    { key: 'delayed', label: 'Delayed', count: countByPredicate(activeTransactions, (row) => isDelayed(row, now)) },
    { key: 'at_risk', label: 'At Risk', count: atRiskRows.length },
  ]

  const transactionAlerts = [
    { key: 'buyer_docs', label: 'Buyer Docs Outstanding', count: openDocumentRequests.filter((row) => normalizeKey(`${row.assigned_to_role} ${row.document_type} ${row.title}`).includes('buyer')).length },
    { key: 'bond_approval', label: 'Awaiting Bond Approval', count: financeSubprocesses.filter((row) => !COMPLETED_STATES.includes(normalizeKey(row.status))).length },
    { key: 'transfer_duty', label: 'Awaiting Transfer Duty', count: openDocumentRequests.filter((row) => normalizeKey(`${row.document_type} ${row.title}`).includes('transfer_duty')).length },
    { key: 'attorney_followup', label: 'Attorney Follow-Up', count: transferSubprocesses.filter((row) => !COMPLETED_STATES.includes(normalizeKey(row.status)) && daysBetween(row.updated_at, now) >= 7).length + tasks.filter((task) => normalizeKey(`${task.title} ${task.status}`).includes('attorney') && !DONE_DOCUMENT_STATUSES.includes(normalizeKey(task.status))).length },
  ]

  const expectedCommission = sumBy(activeTransactions, (row) => getCommissionAmount(row, commissionByTransaction))
  const likelyRevenue = Math.round(sumBy(activeTransactions, (row) => getCommissionAmount(row, commissionByTransaction) * getPipelineStageWeight(row)))
  const committedRevenue = Math.round(sumBy(activeTransactions.filter((row) => getPipelineStageWeight(row) >= REVENUE_FORECAST_WEIGHTS.otp), (row) => getCommissionAmount(row, commissionByTransaction)))
  const revenueThisMonth = sumBy(registeredTransactionsInRange, (row) => getCommissionAmount(row, commissionByTransaction))
  const salesValueThisMonth = sumBy(registeredTransactionsInRange, getDealValue)
  const previousMonthCommission = sumBy(completedTransactions.filter((row) => isBetween(getTransactionCompletedAt(row), range.previousStart, range.previousEnd)), (row) => getCommissionAmount(row, commissionByTransaction))
  const revenueTarget = null
  const salesCommissionSource = revenueThisMonth > 0 ? revenueThisMonth : expectedCommission
  const transferRevenueSource = sumBy(registeredTransactionsInRange.filter((row) => getCommandStage(row) === 'complete'), (row) => getCommissionAmount(row, commissionByTransaction))
  const bondRevenueSource = sumBy(registeredTransactionsInRange.filter((row) => getFinanceBucket(row) === 'bond'), (row) => getCommissionAmount(row, commissionByTransaction))
  const revenueSources = [
    { key: 'sales_commission', label: 'Sales Commission', value: salesCommissionSource, enabled: salesCommissionSource > 0 },
    { key: 'transfer_revenue', label: 'Transfer Revenue', value: transferRevenueSource, enabled: transferRevenueSource > 0 },
    { key: 'bond_revenue', label: 'Bond Revenue', value: bondRevenueSource, enabled: bondRevenueSource > 0 },
    { key: 'rental_revenue', label: 'Rental Revenue', value: 0, enabled: false },
    { key: 'commercial_revenue', label: 'Commercial Revenue', value: 0, enabled: false },
  ].filter((source) => source.enabled)

  return {
    kpis: {
      forecastRevenue: likelyRevenue,
      forecastRevenueTrend: trend(likelyRevenue, previousMonthCommission),
    },
    pipeline: {
      funnel,
      salesFunnel,
      health: pipelineHealth,
      topAgents: agentPerformance.slice(0, 5).map((agent) => ({
        agentId: agent.agentId,
        agentName: agent.agentName,
        pipelineValue: agent.pipelineValue,
        dealCount: agent.activeDeals,
        trend: agent.pipelineTrend ?? null,
      })),
      agentCoaching: agentPerformance.slice(0, 6).map((agent) => {
        const key = normalizeText(agent.agentKey || agent.agentId || agent.email || agent.agentName).toLowerCase()
        const issueCount = (atRiskRowsByAgent.get(key) || 0) + (noActivityRowsByAgent.get(key) || 0) + (overdueTasksByAgent.get(key) || 0)
        return {
          agentId: agent.agentId,
          agentName: agent.agentName,
          pipelineValue: agent.pipelineValue,
          activeDeals: agent.activeDeals,
          buyerLeads: agent.buyerLeads || buyerLeadsByAgent.get(key) || agent.leads || 0,
          mandates: agent.mandates || mandatesByAgent.get(key) || 0,
          conversionRate: agent.conversionRate ?? percentage(convertedLeadsByAgent.get(key) || 0, totalLeadsByAgent.get(key) || 0),
          atRiskCount: atRiskRowsByAgent.get(key) || 0,
          noActivityCount: noActivityRowsByAgent.get(key) || 0,
          overdueTasks: overdueTasksByAgent.get(key) || 0,
          nextAction: issueCount
            ? issueCount === (overdueTasksByAgent.get(key) || 0) ? 'Follow-up overdue' : 'Review stalled deals'
            : agent.activeDeals ? 'Keep momentum' : 'Needs new pipeline',
        }
      }),
      buyerLeadInsights: [
        { key: 'new_buyer_leads', label: 'Buyer Leads', value: buyerLeadRows.length, detail: 'Captured in range', tone: 'blue' },
        { key: 'matched_buyers', label: 'Matched Buyers', value: buyerLeadRows.filter((lead) => normalizeText(lead.listing_id) || isConvertedLead(lead)).length, detail: 'Linked to listing or deal', tone: 'green' },
        { key: 'unmatched_buyers', label: 'Unmatched Buyers', value: buyerLeadRows.filter((lead) => !normalizeText(lead.listing_id) && !isConvertedLead(lead)).length, detail: 'Need stock match', tone: 'amber' },
        { key: 'ready_to_view', label: 'Ready to View', value: buyerLeadRows.filter((lead) => {
          const stage = getBuyerLeadStage(lead)
          return stage.includes('qualified') || stage.includes('viewing') || stage.includes('appointment')
        }).length, detail: 'Qualified or viewing stage', tone: 'green' },
        { key: 'no_follow_up', label: 'No Follow-Up 7+ Days', value: buyerLeadRows.filter((lead) => daysBetween(lead.updated_at || lead.created_at, now) >= 7 && !isConvertedLead(lead)).length, detail: 'Open buyer leads', tone: 'red' },
      ],
      mandateInsights: [
        { key: 'active_mandates', label: 'Active Mandates', value: mandateLeadRows.length + mandatePackets.length, detail: 'Leads and packets', tone: 'blue' },
        { key: 'unsigned_mandates', label: 'Unsigned Mandates', value: mandatePackets.filter((packet) => OPEN_PACKET_STATUSES.includes(normalizeKey(packet.status))).length + mandateLeadRows.filter((lead) => ['sent', 'in_progress', 'viewed'].includes(normalizeKey(lead.seller_onboarding_status))).length, detail: 'Seller action needed', tone: 'amber' },
        { key: 'mandates_no_buyer_activity', label: 'No Buyer Activity', value: mandateLeadRows.filter((lead) => daysBetween(lead.updated_at || lead.created_at, now) >= 14 && !getBuyerLeadStage(lead).includes('viewing') && !getBuyerLeadStage(lead).includes('offer')).length, detail: 'Mandates stale 14+ days', tone: 'red' },
        { key: 'hot_matches', label: 'Hot Buyer Matches', value: viewingLeadRows.length + offerRows.length, detail: 'Viewings or offers in motion', tone: 'green' },
      ],
      mappingNotes: 'Pipeline funnel maps leads from lead status/stage, mandates from mandate packets/listing links/seller onboarding, viewings from viewing or appointment status, offers from transaction offer statuses, accepted OTPs from OTP/signed/accepted statuses or OTP packets, and registrations from registered/completed transactions.',
    },
    transactions: {
      commandCentre,
      flow: transactionFlow,
      dashboardFlow: residentialDashboardFlow,
      health: transactionHealth,
      alerts: transactionAlerts,
    },
    revenue: {
      hero: {
        revenueThisMonth,
        salesValueThisMonth,
        target: revenueTarget,
        achieved: revenueTarget ? revenueThisMonth : null,
        targetPercent: revenueTarget ? percentage(revenueThisMonth, revenueTarget) : null,
        trendVsLastMonth: trend(revenueThisMonth, previousMonthCommission),
      },
      sources: revenueSources,
      forecast: {
        expectedCommission,
        likelyRevenue,
        committedRevenue,
        weights: REVENUE_FORECAST_WEIGHTS,
      },
      forecastChart: buildForecastBuckets(activeTransactions, commissionByTransaction, now),
      topAgents: buildAgentRevenueRows([...registeredTransactionsInRange, ...activeTransactions], usersByKey, commissionByTransaction).map((agent, index) => ({
        ...agent,
        rank: index + 1,
      })),
      hasRevenueData: revenueThisMonth > 0 || expectedCommission > 0 || likelyRevenue > 0,
    },
    overview: {
      pipelineSnapshot: {
        value: sumBy(activeTransactions, getDealValue),
        activeCount: activeTransactions.length,
        topStage: funnel.slice().sort((left, right) => right.value - left.value || right.count - left.count)[0] || null,
      },
      transactionHealthSnapshot: {
        activeCount: activeTransactions.length,
        atRiskCount: atRiskRows.length,
        delayedCount: countByPredicate(activeTransactions, (row) => isDelayed(row, now)),
      },
      revenueSnapshot: {
        expectedCommission,
        likelyRevenue,
        committedRevenue,
      },
      urgentAlerts: [...pipelineHealth, ...transactionAlerts].filter((item) => Number(item.count || 0) > 0).slice(0, 6),
      recentActivityCount: documents.length + documentPackets.length,
    },
  }
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
      newLeads: 0,
      expectedCommission: null,
      forecastRevenue: 0,
      likelyRevenue: 0,
      closingThisMonth: 0,
      avgDealCycleDays: null,
      leadToDealConversion: 0,
      trends: {
        pipelineValue: null,
        activeTransactions: null,
        newLeads: null,
        expectedCommission: null,
        forecastRevenue: null,
        likelyRevenue: null,
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
      funnel: RESIDENTIAL_FUNNEL_STAGES.map((stage) => ({ ...stage, count: 0, value: 0, conversionToNext: null })),
      salesFunnel: {
        stages: RESIDENTIAL_FUNNEL_STAGES
          .filter((stage) => stage.key !== 'registrations')
          .map((stage) => ({ key: stage.key === 'acceptedOtps' ? 'otp' : stage.key, label: stage.key === 'acceptedOtps' ? 'OTP' : stage.label, count: 0, value: 0, conversionRate: stage.key === 'leads' ? 100 : 0, conversionToNext: null })),
        leadToOtpConversion: 0,
        leadToOtpConversionTrend: null,
        lostDeals: 0,
        lostDealsTrend: null,
        averageDaysToOtp: null,
        averageDaysToOtpTrend: null,
        pipelineValue: 0,
        pipelineValueTrend: null,
        insight: {
          key: 'healthy_momentum',
          message: 'Funnel movement is holding steady. Keep agent follow-up cadence consistent across every stage.',
        },
      },
      health: [],
      topAgents: [],
      agentCoaching: [],
      buyerLeadInsights: [],
      mandateInsights: [],
    },
    transactions: {
      totalActive: 0,
      registeredInRange: 0,
      pendingRegistration: 0,
      cancelledInRange: 0,
      movement: null,
      stages: [],
      commandCentre: [],
      flow: [],
      health: {
        flow: ['otp', 'finance', 'transfer', 'registration', 'complete'].map((key) => ({ key, label: key === 'otp' ? 'OTP' : key[0].toUpperCase() + key.slice(1), count: 0, percentage: 0, isHighestVolume: false })),
        activeDistribution: ['otp', 'finance', 'transfer', 'registration'].map((key) => ({ key, label: key === 'otp' ? 'OTP' : key[0].toUpperCase() + key.slice(1), count: 0, percentage: 0 })),
        velocity: ['otp', 'finance', 'transfer', 'registration'].map((key) => ({ key, label: key === 'otp' ? 'OTP' : key[0].toUpperCase() + key.slice(1), count: 0, averageDays: 0, percentage: 0 })),
        bottleneck: null,
      },
      alerts: [],
    },
    activeTransactions: [],
    revenue: {
      registeredValue: 0,
      earnedCommission: 0,
      expectedCommission: null,
      monthly: [],
      byAgent: [],
      hero: {
        revenueThisMonth: 0,
        salesValueThisMonth: 0,
        target: null,
        achieved: null,
        targetPercent: null,
        trendVsLastMonth: null,
      },
      sources: [],
      forecast: {
        expectedCommission: 0,
        likelyRevenue: 0,
        committedRevenue: 0,
        weights: REVENUE_FORECAST_WEIGHTS,
      },
      forecastChart: [],
      topAgents: [],
      hasRevenueData: false,
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
    upcomingRegistrations: {
      count: 0,
      expectedCommission: 0,
      dailyBreakdown: [],
    },
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
    'id, organisation_id, assigned_branch_id, assigned_user_id, assigned_agent_id, owner_user_id, created_by, lifecycle_state, operational_state, risk_status, transaction_reference, transaction_type, property_type, development_id, unit_id, buyer_id, property_address_line_1, suburb, city, sales_price, purchase_price, finance_type, stage, current_main_stage, current_sub_stage_summary, assigned_agent, assigned_agent_email, assigned_attorney_email, assigned_bond_originator_email, bank, next_action, waiting_on_role, seller_name, seller_names, owner_name, owner_names, tenant_name, landlord_name, property_image_url, listing_image_url, primary_image_url, cover_image_url, image_url, photo_url, gross_commission_percentage, gross_commission_amount, agent_commission_amount, agency_commission_amount, expected_transfer_date, target_registration_date, registration_date, registered_at, completed_at, archived_at, cancelled_at, deleted_at, entered_stage_at, stage_entered_at, current_stage_entered_at, stage_changed_at, last_stage_changed_at, last_meaningful_activity_at, updated_at, created_at, is_active',
    'id, organisation_id, development_id, unit_id, buyer_id, assigned_user_id, assigned_agent_id, owner_user_id, created_by, finance_type, stage, current_main_stage, assigned_agent, assigned_agent_email, next_action, seller_name, seller_names, owner_name, owner_names, tenant_name, landlord_name, property_image_url, listing_image_url, primary_image_url, cover_image_url, image_url, photo_url, expected_transfer_date, registration_date, registered_at, completed_at, archived_at, cancelled_at, updated_at, created_at, is_active',
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
      'id, organisation_id, user_id, branch_id, first_name, last_name, email, avatar_url, role, workspace_role, organisation_role, status, last_active_at, created_at, updated_at',
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
  const enrichedOrganisationUsers = await enrichOrganisationUsersWithProfileAvatars(allOrganisationUsers)
  const transactions = scopedAllTransactions.filter((row) => isScopedToBranch(row, selectedBranchId, 'assigned_branch_id'))
  const leads = allLeads.filter((row) => isScopedToBranch(row, selectedBranchId, 'branch_id'))
  const organisationUsers = enrichedOrganisationUsers.filter((row) => isScopedToBranch(row, selectedBranchId, 'branch_id'))
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
    tasks,
    linkedDocumentPackets,
    linkedTransactionCommissions,
  ] = await Promise.all([
    safeSelectByIds('document_requests', 'id, transaction_id, status, assigned_to_role, document_type, title, created_at, updated_at, completed_at', [...transactionIds], { order: 'updated_at', limit: 1500 }),
    safeSelectByIds('documents', 'id, transaction_id, name, category, uploaded_by_email, uploaded_by_role, created_at', [...transactionIds], { order: 'created_at', limit: 300 }),
    safeSelectByIds('transaction_subprocesses', 'id, transaction_id, process_type, owner_type, status, created_at, updated_at', [...transactionIds], { order: 'updated_at', limit: 1200 }),
    safeSelectByIds('tasks', 'task_id, id, transaction_id, lead_id, title, due_date, status, priority, created_at, updated_at', [...transactionIds], { order: 'updated_at', limit: 1000 }),
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
  const agentAcceptedOtpRows = [...activeTransactions, ...registeredTransactionsInRange].filter((row) => {
    const status = getTransactionStatusText(row)
    return status.includes('otp') || status.includes('signed') || status.includes('accepted')
  })
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
      agentKey: key || 'unassigned',
      agentId: user?.agentId || normalizeText(row.assigned_user_id || row.assigned_agent_id || row.owner_user_id || row.created_by),
      agentName: user?.agentName || normalizeText(row.assigned_agent) || normalizeText(row.assigned_agent_email) || normalizeText(row.assigned_agent_name) || 'Unassigned',
      avatarUrl: user?.avatarUrl || '',
      role: user?.role || '',
      roleLabel: user?.roleLabel || getReportingRoleLabel(user?.role),
      pipelineValue: 0,
      activeDeals: 0,
      registeredCount: 0,
      otpCount: 0,
      leads: 0,
      buyerLeads: 0,
      mandates: 0,
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
  for (const row of agentAcceptedOtpRows) {
    const key = getAgentKeyFromTransaction(row)
    const existing = agentMap.get(key) || createPerformanceRow(key, row)
    existing.otpCount += 1
    agentMap.set(key, existing)
  }
  for (const lead of selectedLeads) {
    const key = getAgentKeyFromLead(lead)
    const existing = agentMap.get(key) || createPerformanceRow(key, lead)
    existing.leads += 1
    if (isBuyerLead(lead)) existing.buyerLeads += 1
    if (normalizeText(lead.mandate_packet_id) || normalizeText(lead.listing_id) || normalizeKey(`${lead.status} ${lead.stage} ${lead.seller_onboarding_status}`).includes('mandate')) {
      existing.mandates += 1
    }
    if (isConvertedLead(lead)) existing.converted += 1
    agentMap.set(key, existing)
  }
  const agentPerformance = [...agentMap.values()]
    .map((agent) => ({
      agentKey: agent.agentKey,
      agentId: agent.agentId,
      agentName: agent.agentName,
      avatarUrl: agent.avatarUrl,
      role: agent.role,
      roleLabel: agent.roleLabel,
      pipelineValue: agent.pipelineValue,
      activeDeals: agent.activeDeals,
      pipelineTrend: trend(
        activeTransactions
          .filter((row) => getAgentKeyFromTransaction(row) === agent.agentKey && isBetween(row.created_at, range.start, range.end))
          .reduce((sum, row) => sum + getDealValue(row), 0),
        activeTransactions
          .filter((row) => getAgentKeyFromTransaction(row) === agent.agentKey && isBetween(row.created_at, range.previousStart, range.previousEnd))
          .reduce((sum, row) => sum + getDealValue(row), 0),
      ),
      conversionRate: percentage(agent.converted, agent.leads),
      otpCount: agent.otpCount,
      leads: agent.leads,
      buyerLeads: agent.buyerLeads,
      mandates: agent.mandates,
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
  const residentialMetrics = getResidentialDashboardMetrics({
    activeTransactions,
    completedTransactions,
    registeredTransactionsInRange,
    leads,
    selectedLeads,
    documentRequests: scopedDocumentRequests,
    subprocesses: scopedSubprocesses,
    documentPackets: effectiveDocumentPackets,
    documents: scopedDocuments,
    tasks,
    agentPerformance,
    usersByKey,
    commissionByTransaction,
    range,
  })

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
  const upcomingRegistrations = buildUpcomingRegistrationBuckets(activeTransactions, commissionByTransaction, now)

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
      newLeads: selectedLeads.length,
      expectedCommission,
      forecastRevenue: residentialMetrics.kpis.forecastRevenue,
      likelyRevenue: residentialMetrics.revenue.forecast.likelyRevenue,
      closingThisMonth,
      avgDealCycleDays,
      leadToDealConversion,
      trends: {
        pipelineValue: trend(currentPipelineValue, previousPipelineValue),
        activeTransactions: trend(currentActiveTransactions, previousActiveTransactions),
        newLeads: trend(selectedLeads.length, previousLeads.length),
        expectedCommission: expectedCommission === null ? null : trend(currentCommission, previousCommission),
        forecastRevenue: residentialMetrics.kpis.forecastRevenueTrend,
        likelyRevenue: residentialMetrics.kpis.forecastRevenueTrend,
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
      ...residentialMetrics.pipeline,
    },
    transactions: {
      ...transactionsOverview,
      ...residentialMetrics.transactions,
    },
    activeTransactions: activeTransactionCards,
    revenue: {
      ...revenueOverview,
      ...residentialMetrics.revenue,
    },
    overview: {
      pipeline: {
        totalValue: pipelineValue,
        stages,
        financeTypes,
        registeredThisMonth,
        pendingRegistration,
        avgDealValue,
        winRate,
        ...residentialMetrics.pipeline,
      },
      transactions: {
        ...transactionsOverview,
        ...residentialMetrics.transactions,
      },
      revenue: {
        ...revenueOverview,
        ...residentialMetrics.revenue,
      },
      ...residentialMetrics.overview,
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
    upcomingRegistrations,
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
