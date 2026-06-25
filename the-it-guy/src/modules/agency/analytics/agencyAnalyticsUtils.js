import {
  buildRoleHeadcount,
  getOperationalOwnerKeys,
  getReportingRole,
  getReportingRoleLabel,
  shouldIncludeInAgentLeaderboard,
} from '../../../lib/reportingRoleLogic'

export const DATE_RANGE_OPTIONS = [
  { key: 'last_7_days', label: 'Last 7 days' },
  { key: 'last_30_days', label: 'Last 30 days' },
  { key: 'month_to_date', label: 'Month to date' },
  { key: 'year_to_date', label: 'Year to date' },
]

export const COMPARISON_OPTIONS = [
  { key: 'previous_30_days', label: 'Previous 30 days' },
  { key: 'previous_period', label: 'Previous period' },
  { key: 'previous_year', label: 'Previous year' },
]

const ACTIVE_EXCLUDED_STATES = ['registered', 'closed', 'completed', 'cancelled', 'canceled', 'lost', 'archived', 'deleted']
const DONE_STATES = ['complete', 'completed', 'approved', 'uploaded', 'accepted', 'signed', 'registered', 'closed']
const DOCUMENT_WAIT_STATES = ['requested', 'pending', 'missing', 'rejected', 'overdue']

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase().replace(/[\s-]+/g, '_')
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

function addYears(date, years) {
  const next = new Date(date)
  next.setFullYear(next.getFullYear() + years)
  return next
}

function daysBetween(start, end = new Date()) {
  const startDate = toDate(start)
  const endDate = toDate(end)
  if (!startDate || !endDate) return null
  return Math.max(0, Math.round((endDate.getTime() - startDate.getTime()) / 86400000))
}

function isBetween(value, start, end) {
  const date = toDate(value)
  return Boolean(date && date >= start && date < end)
}

function percentage(part, total) {
  const denominator = toNumber(total)
  if (!denominator) return 0
  return Math.round((toNumber(part) / denominator) * 100)
}

function average(values = []) {
  const valid = values.map(toNumber).filter((value) => Number.isFinite(value) && value > 0)
  if (!valid.length) return 0
  return valid.reduce((sum, value) => sum + value, 0) / valid.length
}

function trend(current, previous) {
  const currentValue = toNumber(current)
  const previousValue = toNumber(previous)
  if (!previousValue && !currentValue) return null
  if (!previousValue) return null
  return Math.round(((currentValue - previousValue) / Math.abs(previousValue)) * 100)
}

export function resolveAnalyticsDateRange(key = 'last_30_days', comparisonKey = 'previous_30_days', now = new Date()) {
  const today = startOfDay(now)
  let start
  let end = addDays(today, 1)
  const normalizedKey = DATE_RANGE_OPTIONS.some((item) => item.key === key) ? key : 'last_30_days'

  if (normalizedKey === 'last_7_days') {
    start = addDays(today, -6)
  } else if (normalizedKey === 'month_to_date') {
    start = new Date(today.getFullYear(), today.getMonth(), 1)
  } else if (normalizedKey === 'year_to_date') {
    start = new Date(today.getFullYear(), 0, 1)
  } else {
    start = addDays(today, -29)
  }

  const spanDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000))
  let comparisonStart
  let comparisonEnd
  if (comparisonKey === 'previous_year') {
    comparisonStart = addYears(start, -1)
    comparisonEnd = addYears(end, -1)
  } else if (comparisonKey === 'previous_period') {
    comparisonEnd = start
    comparisonStart = addDays(start, -spanDays)
  } else {
    comparisonEnd = start
    comparisonStart = addDays(start, -30)
  }

  return {
    key: normalizedKey,
    label: DATE_RANGE_OPTIONS.find((item) => item.key === normalizedKey)?.label || 'Last 30 days',
    start,
    end,
    comparisonStart,
    comparisonEnd,
    comparisonLabel: COMPARISON_OPTIONS.find((item) => item.key === comparisonKey)?.label || 'Previous 30 days',
  }
}

function getRecordDate(row = {}) {
  return row.registered_at || row.registration_date || row.completed_at || row.updated_at || row.created_at
}

function getDealValue(row = {}) {
  return toNumber(row.purchase_price || row.sales_price || row.sale_price || row.estimated_value || row.budget || row.asking_price || row.price)
}

function getCommissionValue(row = {}) {
  const explicit = toNumber(row.agency_commission_amount || row.gross_commission_amount || row.commission_amount)
  if (explicit > 0) return explicit
  const percentageValue = toNumber(row.gross_commission_percentage || row.commission_percentage)
  return percentageValue > 0 ? getDealValue(row) * (percentageValue / 100) : 0
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
  return Boolean(row.registered_at || row.registration_date || row.completed_at || status.includes('registered') || status.includes('closed'))
}

function isActiveTransaction(row = {}) {
  const status = getTransactionStatusText(row)
  return !ACTIVE_EXCLUDED_STATES.some((state) => status.includes(state))
}

function getFinanceBucket(row = {}) {
  const value = normalizeKey(row.finance_type || row.financeType || row.bank)
  if (value.includes('bond') || value.includes('finance')) return 'bond'
  if (value.includes('cash')) return 'cash'
  if (value.includes('hybrid') || value.includes('combination')) return 'hybrid'
  return 'unknown'
}

function getLeadStageKey(row = {}) {
  const text = normalizeKey(`${row.stage} ${row.status} ${row.activity_type}`)
  if (text.includes('registered')) return 'registration'
  if (text.includes('otp')) return 'otp'
  if (text.includes('offer') || text.includes('under_offer')) return 'offer'
  if (text.includes('viewing') || text.includes('appointment')) return 'viewing'
  return 'lead'
}

function getAgentKey(row = {}) {
  return getOperationalOwnerKeys(row)[0] || normalizeText(row.assigned_agent || 'unassigned').toLowerCase()
}

function getAgentLabel(row = {}, usersByKey = new Map()) {
  const key = getAgentKey(row)
  const user = usersByKey.get(key) || usersByKey.get(normalizeText(row.assigned_agent_email).toLowerCase())
  return user?.name || normalizeText(row.assigned_agent || row.assigned_agent_name || row.assigned_agent_email) || 'Unassigned'
}

function normalizeUser(row = {}) {
  const name = [row.first_name, row.last_name].map(normalizeText).filter(Boolean).join(' ') ||
    normalizeText(row.full_name || row.name || row.email) ||
    'Agent'
  return {
    id: normalizeText(row.user_id || row.id),
    name,
    email: normalizeText(row.email).toLowerCase(),
    branchId: normalizeText(row.branch_id),
    role: getReportingRole(row),
    roleLabel: getReportingRoleLabel(getReportingRole(row)),
    status: normalizeKey(row.status),
  }
}

function buildUsersByKey(users = []) {
  const map = new Map()
  for (const row of users.map(normalizeUser)) {
    if (row.id) map.set(row.id.toLowerCase(), row)
    if (row.email) map.set(row.email, row)
  }
  return map
}

function getBranchScope(branchId = '', branches = [], users = []) {
  const selected = normalizeText(branchId)
  if (!selected || selected === 'all') return { selected, userIds: new Set(), emails: new Set(), branch: null }
  const branch = branches.find((row) => normalizeText(row.id) === selected) || null
  const members = users.map(normalizeUser).filter((row) => row.branchId === selected)
  return {
    selected,
    branch,
    userIds: new Set(members.map((row) => row.id).filter(Boolean)),
    emails: new Set(members.map((row) => row.email).filter(Boolean)),
  }
}

function belongsToBranch(row = {}, scope = {}) {
  if (!scope?.selected || scope.selected === 'all') return true
  const branchId = normalizeText(row.branch_id || row.assigned_branch_id || row.branchId)
  if (branchId && branchId === scope.selected) return true
  const userId = normalizeText(row.assigned_user_id || row.owner_user_id || row.assigned_agent_id || row.agent_id).toLowerCase()
  if (userId && scope.userIds?.has(userId)) return true
  const email = normalizeText(row.assigned_agent_email || row.agent_email || row.email).toLowerCase()
  if (email && scope.emails?.has(email)) return true
  return false
}

function filterByRange(rows = [], range, dateGetter = getRecordDate) {
  return rows.filter((row) => isBetween(dateGetter(row), range.start, range.end))
}

function filterByComparison(rows = [], range, dateGetter = getRecordDate) {
  return rows.filter((row) => isBetween(dateGetter(row), range.comparisonStart, range.comparisonEnd))
}

function makeKpi(label, value, previous, formatter = 'number') {
  return {
    label,
    value,
    previous,
    formatter,
    change: trend(value, previous),
    comparisonLabel: 'vs previous period',
  }
}

function buildLeadFunnel(leads = [], appointments = [], transactions = []) {
  const totalLeads = leads.length
  const viewingLeadIds = new Set(
    appointments
      .filter((row) => normalizeKey(`${row.appointment_type} ${row.title} ${row.status}`).includes('view'))
      .map((row) => normalizeText(row.lead_id))
      .filter(Boolean),
  )
  const leadStages = leads.map(getLeadStageKey)
  const viewings = Math.max(viewingLeadIds.size, leadStages.filter((stage) => stage === 'viewing').length)
  const offers = leadStages.filter((stage) => ['offer', 'otp', 'registration'].includes(stage)).length +
    transactions.filter((row) => normalizeKey(row.stage).includes('offer')).length
  const otps = leadStages.filter((stage) => ['otp', 'registration'].includes(stage)).length +
    transactions.filter((row) => normalizeKey(`${row.stage} ${row.current_main_stage}`).includes('otp')).length
  const registrations = transactions.filter(isRegisteredTransaction).length
  const rawStages = [
    { key: 'leads', label: 'Total Leads', count: totalLeads },
    { key: 'viewings', label: 'Viewings', count: viewings },
    { key: 'offers', label: 'Offers', count: offers },
    { key: 'otps', label: 'OTPs', count: otps },
    { key: 'registrations', label: 'Registrations', count: registrations },
  ]
  return rawStages.map((stage, index) => {
    const previous = index ? rawStages[index - 1].count : stage.count
    return {
      ...stage,
      conversion: index ? percentage(stage.count, rawStages[0].count) : 100,
      dropOff: index ? Math.max(0, 100 - percentage(stage.count, previous)) : 0,
    }
  })
}

function buildLeadSourceBreakdown(leads = []) {
  const labels = {
    property24: 'Property24',
    bridge_listings: 'Arch9 Listings',
    private_property: 'Private Property',
    referral: 'Referral',
    social_media: 'Social Media',
    walk_in: 'Walk-in',
    other: 'Other',
  }
  const map = new Map(Object.keys(labels).map((key) => [key, { key, label: labels[key], count: 0, converted: 0 }]))
  for (const row of leads) {
    const sourceText = normalizeKey(row.lead_source || row.source || row.origin)
    let key = 'other'
    if (sourceText.includes('property24')) key = 'property24'
    else if (sourceText.includes('bridge')) key = 'bridge_listings'
    else if (sourceText.includes('private')) key = 'private_property'
    else if (sourceText.includes('referral')) key = 'referral'
    else if (sourceText.includes('social') || sourceText.includes('facebook') || sourceText.includes('instagram')) key = 'social_media'
    else if (sourceText.includes('walk')) key = 'walk_in'
    const item = map.get(key)
    item.count += 1
    if (row.converted_transaction_id || row.converted_at || ['otp', 'registration'].includes(getLeadStageKey(row))) item.converted += 1
  }
  return [...map.values()].map((item) => ({ ...item, conversion: percentage(item.converted, item.count) }))
}

function buildDealTypeBreakdown(transactions = []) {
  const map = new Map([
    ['bond', { key: 'bond', label: 'Bond', count: 0, value: 0 }],
    ['cash', { key: 'cash', label: 'Cash', count: 0, value: 0 }],
    ['hybrid', { key: 'hybrid', label: 'Hybrid', count: 0, value: 0 }],
    ['unknown', { key: 'unknown', label: 'Unknown', count: 0, value: 0 }],
  ])
  for (const row of transactions) {
    const key = getFinanceBucket(row)
    const item = map.get(key) || map.get('unknown')
    item.count += 1
    item.value += getDealValue(row)
  }
  const total = [...map.values()].reduce((sum, item) => sum + item.count, 0)
  return [...map.values()].map((item) => ({ ...item, percentage: percentage(item.count, total) }))
}

function buildMonthlyPipelineTrend(transactions = [], range) {
  const buckets = new Map()
  const cursor = new Date(range.start.getFullYear(), range.start.getMonth(), 1)
  const end = new Date(range.end.getFullYear(), range.end.getMonth(), 1)
  while (cursor <= end && buckets.size < 13) {
    const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`
    buckets.set(key, {
      key,
      label: cursor.toLocaleDateString('en-ZA', { month: 'short' }),
      pipelineValue: 0,
      registeredValue: 0,
    })
    cursor.setMonth(cursor.getMonth() + 1)
  }
  for (const row of transactions) {
    const date = toDate(getRecordDate(row))
    if (!date) continue
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    const bucket = buckets.get(key)
    if (!bucket) continue
    const value = getDealValue(row)
    if (isRegisteredTransaction(row)) bucket.registeredValue += value
    else bucket.pipelineValue += value
  }
  return [...buckets.values()]
}

function buildAreaRows(transactions = [], listings = [], leads = []) {
  const map = new Map()
  const ensure = (area) => {
    const key = normalizeText(area) || 'Area pending'
    if (!map.has(key)) {
      map.set(key, { area: key, pipelineValue: 0, listings: 0, transactions: 0, leads: 0, registrations: 0 })
    }
    return map.get(key)
  }
  for (const row of transactions) {
    const area = normalizeText(row.suburb || row.city || row.area || row.property_area)
    const item = ensure(area)
    item.transactions += 1
    item.pipelineValue += isActiveTransaction(row) ? getDealValue(row) : 0
    if (isRegisteredTransaction(row)) item.registrations += 1
  }
  for (const row of listings) {
    const area = normalizeText(row.suburb || row.city || row.area || row.location)
    ensure(area).listings += 1
  }
  for (const row of leads) {
    const area = normalizeText(row.suburb || row.city || row.property_interest || row.seller_property_address)
    ensure(area).leads += 1
  }
  return [...map.values()]
    .map((item) => ({ ...item, conversion: percentage(item.registrations, item.leads || item.transactions) }))
    .sort((left, right) => right.pipelineValue - left.pipelineValue || right.transactions - left.transactions)
    .slice(0, 5)
}

function countBy(items = [], getter, labels = {}) {
  const map = new Map()
  for (const row of items) {
    const key = normalizeKey(getter(row)) || 'unknown'
    const label = labels[key] || (key === 'unknown' ? 'Unknown' : key.replaceAll('_', ' '))
    const item = map.get(key) || { key, label, count: 0 }
    item.count += 1
    map.set(key, item)
  }
  const total = items.length
  return [...map.values()]
    .map((item) => ({ ...item, percentage: percentage(item.count, total) }))
    .sort((left, right) => right.count - left.count)
}

function getBuyerAgeRange(row = {}) {
  const age = toNumber(row.age)
  if (!age && row.date_of_birth) {
    const birth = toDate(row.date_of_birth)
    if (birth) {
      const calculated = Math.floor((Date.now() - birth.getTime()) / 31557600000)
      if (calculated > 0) return getBuyerAgeRange({ age: calculated })
    }
  }
  if (!age) return 'unknown'
  if (age < 25) return 'under_25'
  if (age < 35) return '25_34'
  if (age < 45) return '35_44'
  if (age < 55) return '45_54'
  return '55_plus'
}

function buildBuyerDemographics(buyers = [], transactions = []) {
  const linkedBuyerIds = new Set(transactions.map((row) => normalizeText(row.buyer_id)).filter(Boolean))
  const scopedBuyers = linkedBuyerIds.size
    ? buyers.filter((row) => linkedBuyerIds.has(normalizeText(row.id || row.buyer_id)))
    : buyers
  const ageLabels = {
    under_25: 'Under 25',
    '25_34': '25-34',
    '35_44': '35-44',
    '45_54': '45-54',
    '55_plus': '55+',
    unknown: 'Unknown',
  }
  return {
    total: scopedBuyers.length,
    ageRanges: countBy(scopedBuyers, getBuyerAgeRange, ageLabels),
    gender: countBy(scopedBuyers, (row) => row.gender || row.sex),
    buyerTypes: countBy(scopedBuyers, (row) => row.buyer_type || row.purchaser_type || row.entity_type, {
      individual: 'Individual',
      company: 'Company',
      trust: 'Trust',
    }),
    maritalRegime: countBy(scopedBuyers, (row) => row.marital_regime || row.marital_status, {
      single: 'Single',
      married_cop: 'Married COP',
      married_anc: 'Married ANC',
    }),
    nationality: countBy(scopedBuyers, (row) => {
      const text = normalizeKey(row.nationality || row.citizenship || row.country)
      if (!text) return 'unknown'
      return text.includes('south') || text === 'sa' || text.includes('za') ? 'sa_citizen' : 'foreign'
    }, {
      sa_citizen: 'SA Citizen',
      foreign: 'Foreign',
    }),
    incomeBracket: countBy(scopedBuyers, (row) => row.income_bracket || row.monthly_income_bracket || row.income_range),
  }
}

function buildBankRows(transactions = [], subprocesses = []) {
  const map = new Map()
  for (const row of transactions.filter((item) => getFinanceBucket(item) === 'bond')) {
    const bank = normalizeText(row.bank || row.lender || row.finance_bank || row.bond_bank) || 'Bank pending'
    const item = map.get(bank) || { bank, approvals: 0, rejections: 0, amountTotal: 0, approvalDays: [] }
    const status = getTransactionStatusText(row)
    const linkedProcesses = subprocesses.filter((process) => normalizeText(process.transaction_id) === normalizeText(row.id))
    const processText = linkedProcesses.map((process) => normalizeKey(`${process.process_type} ${process.status}`)).join(' ')
    const approved = status.includes('registered') || processText.includes('approved') || processText.includes('grant')
    const rejected = processText.includes('reject') || processText.includes('declined')
    if (approved) item.approvals += 1
    if (rejected) item.rejections += 1
    item.amountTotal += toNumber(row.bond_amount || row.purchase_price || row.sales_price)
    const days = daysBetween(row.created_at, row.updated_at)
    if (approved && days !== null) item.approvalDays.push(days)
    map.set(bank, item)
  }
  return [...map.values()]
    .map((item) => {
      const decisions = item.approvals + item.rejections
      return {
        bank: item.bank,
        approvalRate: percentage(item.approvals, decisions),
        averageApprovalTime: Math.round(average(item.approvalDays)),
        averageBondAmount: item.approvals ? item.amountTotal / Math.max(1, item.approvals) : 0,
        approvals: item.approvals,
        rejectionRate: percentage(item.rejections, decisions),
      }
    })
    .sort((left, right) => right.approvals - left.approvals || right.approvalRate - left.approvalRate)
}

function buildPipelineHealth(transactions = [], documentRequests = [], subprocesses = []) {
  const now = new Date()
  const stuckTransactions = transactions.filter((row) => isActiveTransaction(row) && daysBetween(row.last_meaningful_activity_at || row.updated_at || row.created_at, now) > 14).length
  const waitingDocuments = documentRequests.filter((row) => DOCUMENT_WAIT_STATES.includes(normalizeKey(row.status))).length
  const waitingGuarantees = subprocesses.filter((row) => normalizeKey(`${row.process_type} ${row.status}`).includes('guarantee') && !DONE_STATES.includes(normalizeKey(row.status))).length
  const waitingGrant = subprocesses.filter((row) => normalizeKey(`${row.process_type} ${row.status}`).includes('grant') && !DONE_STATES.includes(normalizeKey(row.status))).length
  const waitingSignatures = documentRequests.filter((row) => normalizeKey(`${row.title} ${row.document_type} ${row.status}`).includes('sign') && !DONE_STATES.includes(normalizeKey(row.status))).length
  const awaitingFica = documentRequests.filter((row) => normalizeKey(`${row.title} ${row.document_type}`).includes('fica') && !DONE_STATES.includes(normalizeKey(row.status))).length
  const delayReasons = [
    { key: 'documents', label: 'Buyer documents', count: waitingDocuments },
    { key: 'guarantees', label: 'Guarantees', count: waitingGuarantees },
    { key: 'grant', label: 'Bond grant', count: waitingGrant },
    { key: 'signatures', label: 'Signatures', count: waitingSignatures },
    { key: 'stuck', label: 'No recent activity', count: stuckTransactions },
  ].sort((left, right) => right.count - left.count)

  return {
    chips: [
      { label: 'Awaiting FICA', count: awaitingFica },
      { label: 'Awaiting Documents', count: waitingDocuments },
      { label: 'Awaiting Guarantees', count: waitingGuarantees },
      { label: 'Awaiting Grant', count: waitingGrant },
      { label: 'Awaiting Signatures', count: waitingSignatures },
    ],
    stuckTransactions,
    mostCommonDelayReason: delayReasons.find((item) => item.count > 0)?.label || 'No dominant delay',
    milestoneTimes: [
      { label: 'Lead to Viewing', days: Math.round(average(transactions.map((row) => daysBetween(row.created_at, row.stage_date || row.updated_at)))) },
      { label: 'Viewing to Offer', days: Math.round(average(transactions.map((row) => daysBetween(row.stage_date || row.created_at, row.updated_at)))) },
      { label: 'Offer to OTP', days: Math.round(average(transactions.filter((row) => normalizeKey(row.current_main_stage).includes('otp')).map((row) => daysBetween(row.created_at, row.updated_at)))) },
      { label: 'OTP to Registration', days: Math.round(average(transactions.filter(isRegisteredTransaction).map((row) => daysBetween(row.created_at, row.registered_at || row.registration_date || row.completed_at)))) },
    ],
  }
}

function buildOperationalUserRows({ transactions = [], listings = [], leads = [], appointments = [], users = [], usersByKey = buildUsersByKey(users), includeLeadership = false } = {}) {
  const map = new Map()
  const ensure = (row = {}) => {
    const key = getAgentKey(row)
    const user = usersByKey.get(key)
    if (!user && key === 'unassigned') return null
    if (user && !shouldIncludeInAgentLeaderboard(user, { includeLeadership })) return null
    const item = map.get(key) || {
      agentId: key,
      agent: user?.name || getAgentLabel(row, usersByKey),
      role: user?.role || '',
      roleLabel: user?.roleLabel || getReportingRoleLabel(user?.role),
      pipelineValue: 0,
      registrations: 0,
      totalDeals: 0,
      listings: 0,
      leads: 0,
      appointments: 0,
      registrationDays: [],
    }
    map.set(key, item)
    return item
  }

  for (const row of transactions) {
    const item = ensure(row)
    if (!item) continue
    item.totalDeals += 1
    if (isActiveTransaction(row)) item.pipelineValue += getDealValue(row)
    if (isRegisteredTransaction(row)) {
      item.registrations += 1
      const days = daysBetween(row.created_at, row.registered_at || row.registration_date || row.completed_at)
      if (days !== null) item.registrationDays.push(days)
    }
  }
  for (const row of listings) {
    const item = ensure(row)
    if (item) item.listings += 1
  }
  for (const row of leads) {
    const item = ensure(row)
    if (item) item.leads += 1
  }
  for (const row of appointments) {
    const item = ensure(row)
    if (item) item.appointments += 1
  }
  return [...map.values()]
    .map((item) => ({
      ...item,
      conversionRate: percentage(item.registrations, item.totalDeals),
      averageDaysToRegistration: Math.round(average(item.registrationDays)),
    }))
    .sort((left, right) => right.pipelineValue - left.pipelineValue || right.registrations - left.registrations || right.listings - left.listings)
}

function buildBranchRows(branches = [], transactions = [], listings = [], users = []) {
  return branches.map((branch) => {
    const scope = getBranchScope(branch.id, branches, users)
    const branchTransactions = transactions.filter((row) => belongsToBranch(row, scope))
    const branchListings = listings.filter((row) => belongsToBranch(row, scope))
    const branchUsers = users.map(normalizeUser).filter((row) => row.branchId === normalizeText(branch.id))
    const headcount = buildRoleHeadcount(branchUsers)
    const activeTransactions = branchTransactions.filter(isActiveTransaction)
    const registeredTransactions = branchTransactions.filter(isRegisteredTransaction)
    return {
      branchId: normalizeText(branch.id),
      branch: normalizeText(branch.name) || 'Untitled Branch',
      pipelineValue: activeTransactions.reduce((sum, row) => sum + getDealValue(row), 0),
      registeredValue: registeredTransactions.reduce((sum, row) => sum + getDealValue(row), 0),
      conversionRate: percentage(registeredTransactions.length, branchTransactions.length),
      listings: branchListings.length || toNumber(branch?.kpis?.activeListings),
      transactions: branchTransactions.length || toNumber(branch?.kpis?.activeTransactions),
      activeAgents: headcount.activeAgents || toNumber(branch?.kpis?.activeAgents),
      activePrincipals: headcount.activePrincipals || toNumber(branch?.kpis?.activePrincipals),
      activeManagers: headcount.activeManagers || toNumber(branch?.kpis?.activeManagers),
      activeOperationalUsers: headcount.activeOperationalUsers || toNumber(branch?.kpis?.activeOperationalUsers),
    }
  }).sort((left, right) => right.pipelineValue - left.pipelineValue)
}

function buildDevelopmentRows(developments = [], transactions = [], listings = []) {
  const map = new Map()
  for (const development of developments) {
    const id = normalizeText(development.id)
    if (!id) continue
    map.set(id, {
      developmentId: id,
      development: normalizeText(development.name) || 'Untitled Development',
      pipelineValue: 0,
      unitsSold: 0,
      totalValue: 0,
      totalTransactions: 0,
      activeListings: 0,
    })
  }
  const ensure = (id, label = 'Development pending') => {
    const key = normalizeText(id) || label
    if (!map.has(key)) {
      map.set(key, { developmentId: key, development: normalizeText(label) || 'Development pending', pipelineValue: 0, unitsSold: 0, totalValue: 0, totalTransactions: 0, activeListings: 0 })
    }
    return map.get(key)
  }
  for (const row of transactions) {
    const item = ensure(row.development_id, row.development_name || row.development || row.listing_title)
    const value = getDealValue(row)
    item.totalTransactions += 1
    item.totalValue += value
    if (isActiveTransaction(row)) item.pipelineValue += value
    if (isRegisteredTransaction(row)) item.unitsSold += 1
  }
  for (const row of listings) {
    const item = ensure(row.development_id, row.development_name || row.development || row.listing_title)
    item.activeListings += 1
  }
  return [...map.values()]
    .filter((item) => item.totalTransactions || item.activeListings)
    .map((item) => ({
      ...item,
      averagePrice: item.totalTransactions ? item.totalValue / item.totalTransactions : 0,
      conversionRate: percentage(item.unitsSold, item.totalTransactions),
    }))
    .sort((left, right) => right.pipelineValue - left.pipelineValue || right.unitsSold - left.unitsSold)
    .slice(0, 8)
}

function buildInsights(model = {}) {
  const topArea = model.areas?.[0]
  const topAgent = model.agentPerformance?.[0]
  const weakFunnelStage = [...(model.leadFunnel || [])].slice(1).sort((left, right) => right.dropOff - left.dropOff)[0]
  const bestBank = model.bankIntelligence?.[0]
  const documentChip = model.pipelineHealth?.chips?.find((item) => item.label === 'Awaiting Documents')
  return [
    {
      label: 'Pipeline Growth',
      title: model.executiveKpis?.[0]?.change !== null && model.executiveKpis?.[0]?.change >= 0 ? 'Pipeline is expanding' : 'Pipeline needs attention',
      copy: `${Math.abs(model.executiveKpis?.[0]?.change || 0)}% change against the comparison period.`,
      tone: model.executiveKpis?.[0]?.change >= 0 ? 'green' : 'amber',
    },
    {
      label: 'Top Performing Area',
      title: topArea?.area || 'Area signal pending',
      copy: topArea ? `${topArea.transactions} transactions with pipeline value in this area.` : 'Capture area data on listings and deals to unlock this insight.',
      tone: 'blue',
    },
    {
      label: 'Conversion Opportunity',
      title: weakFunnelStage ? `${weakFunnelStage.label} drop-off` : 'Funnel signal pending',
      copy: weakFunnelStage ? `${weakFunnelStage.dropOff}% drop-off from the previous stage.` : 'Lead stage data will power conversion recommendations.',
      tone: 'amber',
    },
    {
      label: 'Bank Performance',
      title: bestBank?.bank || 'Bank signal pending',
      copy: bestBank ? `${bestBank.approvalRate}% approval rate across captured bond decisions.` : 'Finance workflow data is not yet rich enough for bank ranking.',
      tone: 'green',
    },
    {
      label: 'Watch Out',
      title: `${documentChip?.count || 0} waiting on buyer documents`,
      copy: topAgent ? `${topAgent.agent} has the largest active pipeline in the current scope.` : 'No agent concentration risk detected yet.',
      tone: 'red',
    },
  ]
}

export function buildAgencyAnalyticsModel({
  branches = [],
  users = [],
  transactions = [],
  leads = [],
  listings = [],
  appointments = [],
  subprocesses = [],
  documentRequests = [],
  buyers = [],
  developments = [],
  branchId = 'all',
  dateRangeKey = 'last_30_days',
  comparisonKey = 'previous_30_days',
  includeLeadershipInLeaderboard = false,
  now = new Date(),
} = {}) {
  const range = resolveAnalyticsDateRange(dateRangeKey, comparisonKey, now)
  const scope = getBranchScope(branchId, branches, users)
  const scopedTransactions = transactions.filter((row) => belongsToBranch(row, scope))
  const scopedLeads = leads.filter((row) => belongsToBranch(row, scope))
  const scopedListings = listings.filter((row) => belongsToBranch(row, scope))
  const scopedAppointments = appointments.filter((row) => belongsToBranch(row, scope))
  const scopedDocumentRequests = documentRequests.filter((row) => {
    if (!scope.selected || scope.selected === 'all') return true
    const tx = scopedTransactions.find((item) => normalizeText(item.id) === normalizeText(row.transaction_id))
    return Boolean(tx)
  })
  const scopedSubprocesses = subprocesses.filter((row) => {
    if (!scope.selected || scope.selected === 'all') return true
    const tx = scopedTransactions.find((item) => normalizeText(item.id) === normalizeText(row.transaction_id))
    return Boolean(tx)
  })

  const currentTransactions = filterByRange(scopedTransactions, range)
  const comparisonTransactions = filterByComparison(scopedTransactions, range)
  const currentLeads = filterByRange(scopedLeads, range, (row) => row.created_at || row.updated_at)
  const comparisonLeads = filterByComparison(scopedLeads, range, (row) => row.created_at || row.updated_at)
  const currentListings = filterByRange(scopedListings, range, (row) => row.created_at || row.updated_at)
  const currentAppointments = filterByRange(scopedAppointments, range, (row) => row.date_time || row.appointment_date || row.created_at)
  const activeTransactions = currentTransactions.filter(isActiveTransaction)
  const comparisonActiveTransactions = comparisonTransactions.filter(isActiveTransaction)
  const registeredTransactions = currentTransactions.filter(isRegisteredTransaction)
  const comparisonRegisteredTransactions = comparisonTransactions.filter(isRegisteredTransaction)
  const totalPipelineValue = activeTransactions.reduce((sum, row) => sum + getDealValue(row), 0)
  const previousPipelineValue = comparisonActiveTransactions.reduce((sum, row) => sum + getDealValue(row), 0)
  const registeredValue = registeredTransactions.reduce((sum, row) => sum + getDealValue(row), 0)
  const previousRegisteredValue = comparisonRegisteredTransactions.reduce((sum, row) => sum + getDealValue(row), 0)
  const commissionPipeline = activeTransactions.reduce((sum, row) => sum + getCommissionValue(row), 0)
  const previousCommissionPipeline = comparisonActiveTransactions.reduce((sum, row) => sum + getCommissionValue(row), 0)
  const conversionRate = percentage(registeredTransactions.length, currentLeads.length || currentTransactions.length)
  const previousConversionRate = percentage(comparisonRegisteredTransactions.length, comparisonLeads.length || comparisonTransactions.length)
  const avgDaysToRegistration = Math.round(average(registeredTransactions.map((row) => daysBetween(row.created_at, row.registered_at || row.registration_date || row.completed_at))))
  const previousAvgDaysToRegistration = Math.round(average(comparisonRegisteredTransactions.map((row) => daysBetween(row.created_at, row.registered_at || row.registration_date || row.completed_at))))
  const leadFunnel = buildLeadFunnel(currentLeads, currentAppointments, currentTransactions)
  const offerStage = leadFunnel.find((item) => item.key === 'offers')
  const viewingStage = leadFunnel.find((item) => item.key === 'viewings')
  const otpStage = leadFunnel.find((item) => item.key === 'otps')
  const registrationStage = leadFunnel.find((item) => item.key === 'registrations')

  const model = {
    filters: {
      selectedBranchId: scope.selected || 'all',
      selectedBranchName: scope.branch?.name || 'All Branches',
      range,
      branchOptions: [
        { id: 'all', name: 'All Branches' },
        ...branches.map((branch) => ({ id: normalizeText(branch.id), name: normalizeText(branch.name) || 'Untitled Branch' })),
      ],
    },
    executiveKpis: [
      makeKpi('Total Pipeline Value', totalPipelineValue, previousPipelineValue, 'currency'),
      makeKpi('Registered Value', registeredValue, previousRegisteredValue, 'currency'),
      makeKpi('Average Deal Size', average(currentTransactions.map(getDealValue)), average(comparisonTransactions.map(getDealValue)), 'currency'),
      makeKpi('Commission Pipeline', commissionPipeline, previousCommissionPipeline, 'currency'),
      makeKpi('Conversion Rate', conversionRate, previousConversionRate, 'percent'),
      makeKpi('Average Days to Registration', avgDaysToRegistration, previousAvgDaysToRegistration, 'days'),
    ],
    operationalKpis: [
      makeKpi('Active Buyers', new Set(currentTransactions.map((row) => normalizeText(row.buyer_id || row.client_name || row.purchaser_name)).filter(Boolean)).size, new Set(comparisonTransactions.map((row) => normalizeText(row.buyer_id || row.client_name || row.purchaser_name)).filter(Boolean)).size),
      makeKpi('Active Sellers', currentLeads.filter((row) => normalizeKey(row.lead_category || row.lead_type).includes('seller')).length + currentListings.length, comparisonLeads.filter((row) => normalizeKey(row.lead_category || row.lead_type).includes('seller')).length),
      makeKpi('Bond Applications', currentTransactions.filter((row) => getFinanceBucket(row) === 'bond').length, comparisonTransactions.filter((row) => getFinanceBucket(row) === 'bond').length),
      makeKpi('Cash Deals', currentTransactions.filter((row) => getFinanceBucket(row) === 'cash').length, comparisonTransactions.filter((row) => getFinanceBucket(row) === 'cash').length),
      makeKpi('Viewing-to-Offer %', percentage(offerStage?.count || 0, viewingStage?.count || 0), 0, 'percent'),
      makeKpi('Offer-to-OTP %', percentage(otpStage?.count || 0, offerStage?.count || 0), 0, 'percent'),
      makeKpi('OTP-to-Registration %', percentage(registrationStage?.count || 0, otpStage?.count || 0), 0, 'percent'),
    ],
    pipelineOverview: {
      totalPipelineValue,
      registeredValue,
      monthlyTrend: buildMonthlyPipelineTrend(currentTransactions, range),
    },
    dealTypeBreakdown: buildDealTypeBreakdown(currentTransactions),
    areas: buildAreaRows(currentTransactions, currentListings, currentLeads),
    buyerDemographics: buildBuyerDemographics(buyers, currentTransactions),
    leadSources: buildLeadSourceBreakdown(currentLeads),
    leadFunnel,
    bankIntelligence: buildBankRows(currentTransactions, scopedSubprocesses),
    pipelineHealth: buildPipelineHealth(currentTransactions, scopedDocumentRequests, scopedSubprocesses),
    agentPerformance: buildOperationalUserRows({
      transactions: currentTransactions,
      listings: currentListings,
      leads: currentLeads,
      appointments: currentAppointments,
      users,
      includeLeadership: includeLeadershipInLeaderboard,
    }).slice(0, 5),
    branchPerformance: buildBranchRows(branches, scopedTransactions, scopedListings, users),
    developmentPerformance: buildDevelopmentRows(developments, currentTransactions, currentListings),
    meta: {
      isEmpty: !currentTransactions.length && !currentLeads.length && !currentListings.length,
      scopedCounts: {
        transactions: scopedTransactions.length,
        leads: scopedLeads.length,
        listings: scopedListings.length,
      },
      currentCounts: {
        transactions: currentTransactions.length,
        leads: currentLeads.length,
        listings: currentListings.length,
      },
    },
  }
  return {
    ...model,
    insights: buildInsights(model),
  }
}
