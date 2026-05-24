import { getAgencyPipelineSnapshot } from '../lib/agencyPipelineService'
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'
import { assertResolvedWorkspaceContext } from './workspaceResolutionService'

export const PIPELINE_STAGE_ORDER = [
  'new_lead',
  'contacted',
  'viewing',
  'offer',
  'under_offer',
  'otp_signed',
  'finance',
  'transfer',
  'registered',
]

export const PIPELINE_STAGE_LABELS = {
  new_lead: 'New Leads',
  contacted: 'Contacted',
  viewing: 'Viewings',
  offer: 'Offers',
  under_offer: 'Under Offer',
  otp_signed: 'OTP Signed',
  finance: 'Finance',
  transfer: 'Transfer',
  registered: 'Registered',
}

const ACTIVE_EXCLUDED_STATES = ['registered', 'closed', 'completed', 'cancelled', 'canceled', 'lost', 'archived', 'deleted']
const DOCUMENT_RISK_STATUSES = ['requested', 'pending', 'missing', 'rejected', 'overdue']
const OPEN_PACKET_STATUSES = ['draft', 'generated', 'ready', 'sent', 'viewed', 'partially_signed', 'pending']
const DONE_STATUSES = ['complete', 'completed', 'approved', 'uploaded', 'accepted', 'signed', 'registered', 'closed']

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

function daysBetween(start, end = new Date()) {
  const startDate = toDate(start)
  const endDate = toDate(end)
  if (!startDate || !endDate) return null
  return Math.max(0, Math.floor((endDate.getTime() - startDate.getTime()) / 86400000))
}

function addDays(date, days) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function startOfDay(date) {
  const next = new Date(date)
  next.setHours(0, 0, 0, 0)
  return next
}

function isBetween(value, start, end) {
  const date = toDate(value)
  return Boolean(date && date >= start && date < end)
}

function resolveDateRange(dateRange = 'this_month', now = new Date()) {
  const today = startOfDay(now)
  if (dateRange === 'last_30_days') {
    const start = addDays(today, -29)
    const end = addDays(today, 1)
    return { key: dateRange, start, end }
  }
  if (dateRange === 'this_week') {
    const start = addDays(today, -today.getDay() + 1)
    const end = addDays(start, 7)
    return { key: dateRange, start, end }
  }
  if (dateRange === 'next_30_days') {
    return { key: dateRange, start: today, end: addDays(today, 31) }
  }
  const start = new Date(today.getFullYear(), today.getMonth(), 1)
  const end = new Date(today.getFullYear(), today.getMonth() + 1, 1)
  return { key: 'this_month', start, end }
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
    message.includes('does_not_exist') ||
    message.includes('schema_cache') ||
    message.includes('could_not_find')
  )
}

function isUuidLike(value = '') {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalizeText(value))
}

async function safeSelect(table, selectVariants, { organisationId = '', organisationColumn = 'organisation_id', order = 'updated_at', ascending = false, limit = 1000 } = {}) {
  if (!isSupabaseConfigured || !supabase) return []
  const variants = Array.isArray(selectVariants) ? selectVariants : [selectVariants || '*']
  let lastError = null
  for (const fields of variants) {
    let query = supabase.from(table).select(fields)
    if (organisationId && organisationColumn) query = query.eq(organisationColumn, organisationId)
    if (order) query = query.order(order, { ascending })
    if (limit) query = query.limit(limit)
    const { data, error } = await query
    if (!error) return data || []
    lastError = error
    if (!isMissingSourceError(error)) throw error
  }
  console.debug('[PrincipalPipelineOverview] Source unavailable; using empty result.', { table, message: lastError?.message })
  return []
}

async function safeSelectByIds(table, selectVariants, ids = [], { idColumn = 'transaction_id', order = 'updated_at', ascending = false, limit = 1000 } = {}) {
  if (!isSupabaseConfigured || !supabase) return []
  const normalizedIds = Array.from(new Set((Array.isArray(ids) ? ids : []).map(normalizeText).filter(Boolean)))
  if (!normalizedIds.length) return []
  const variants = Array.isArray(selectVariants) ? selectVariants : [selectVariants || '*']
  let lastError = null
  for (const fields of variants) {
    let query = supabase.from(table).select(fields).in(idColumn, normalizedIds)
    if (order) query = query.order(order, { ascending })
    if (limit) query = query.limit(limit)
    const { data, error } = await query
    if (!error) return data || []
    lastError = error
    if (!isMissingSourceError(error)) throw error
  }
  console.debug('[PrincipalPipelineOverview] Scoped source unavailable; using empty result.', { table, message: lastError?.message })
  return []
}

function getDealValue(row = {}) {
  return toNumber(row.purchase_price || row.sales_price || row.sale_price || row.dealValue || row.deal_value || row.estimated_value || row.budget)
}

function getStatusText(row = {}) {
  return [
    row.lifecycle_state,
    row.current_main_stage,
    row.stage,
    row.rawStage,
    row.status,
    row.operational_state,
    row.attorney_stage,
    row.current_sub_stage_summary,
  ].map(normalizeKey).join(' ')
}

function isRegistered(row = {}) {
  const status = getStatusText(row)
  return Boolean(row.registered_at || row.registration_date || status.includes('registered') || status.includes('closed'))
}

function isActiveTransaction(row = {}) {
  const status = getStatusText(row)
  if (row.is_active === false) return false
  return !ACTIVE_EXCLUDED_STATES.some((state) => status.includes(state))
}

function isCancelledOpportunity(row = {}) {
  const status = getStatusText(row)
  if (row.is_active === false) return true
  return ['cancelled', 'canceled', 'lost', 'archived', 'deleted'].some((state) => status.includes(state))
}

export function normalizePipelineStage(row = {}) {
  const status = getStatusText(row)
  if (isRegistered(row)) return 'registered'
  if (status.includes('transfer') || status.includes('attorney') || status.includes('lodg') || status.includes('guarantee')) return 'transfer'
  if (status.includes('finance') || status.includes('bond') || status.includes('loan')) return 'finance'
  if (status.includes('otp_signed') || status.includes('otp') || status.includes('signed') || status.includes('reserved')) return 'otp_signed'
  if (status.includes('under_offer')) return 'under_offer'
  if (status.includes('offer') || status.includes('negotiat')) return 'offer'
  if (status.includes('viewing') || status.includes('appointment')) return 'viewing'
  if (status.includes('contact') || status.includes('qualif') || status.includes('follow_up')) return 'contacted'
  if (status.includes('lead') || status.includes('new') || status.includes('available')) return 'new_lead'
  return 'under_offer'
}

function normalizeLeadStage(lead = {}) {
  const stage = normalizeKey(`${lead.stage} ${lead.status}`)
  if (lead.converted_transaction_id || lead.convertedTransactionId || stage.includes('converted')) return 'under_offer'
  if (stage.includes('negotiat') || stage.includes('offer')) return 'offer'
  if (stage.includes('viewing') || stage.includes('appointment')) return 'viewing'
  if (stage.includes('contact') || stage.includes('follow')) return 'contacted'
  return 'new_lead'
}

function normalizeAgent(row = {}) {
  const name = [row.first_name, row.last_name].map(normalizeText).filter(Boolean).join(' ') ||
    normalizeText(row.full_name) ||
    normalizeText(row.email) ||
    'Agent'
  return {
    id: normalizeText(row.user_id || row.id || row.agentId),
    name,
    email: normalizeText(row.email).toLowerCase(),
    branchId: normalizeText(row.branch_id || row.branchId),
    role: normalizeText(row.role),
    status: normalizeText(row.status),
    lastActiveAt: row.last_active_at || row.lastActiveAt || row.updated_at || null,
  }
}

function buildUsersByKey(users = []) {
  const map = new Map()
  for (const raw of users) {
    const user = normalizeAgent(raw)
    for (const key of [user.id, user.email]) {
      const normalized = normalizeText(key).toLowerCase()
      if (normalized) map.set(normalized, user)
    }
  }
  return map
}

function resolveAgentFromRow(row = {}, usersByKey = new Map()) {
  const keys = [
    row.assigned_user_id,
    row.owner_user_id,
    row.assignedAgentId,
    row.assigned_agent_id,
    row.assigned_agent_email,
    row.assignedAgentEmail,
  ].map((value) => normalizeText(value).toLowerCase()).filter(Boolean)
  for (const key of keys) {
    const user = usersByKey.get(key)
    if (user) return user
  }
  return {
    id: normalizeText(row.assigned_user_id || row.owner_user_id || row.assignedAgentId || row.assigned_agent_id || row.assigned_agent_email || row.assignedAgentEmail || 'unassigned').toLowerCase(),
    name: normalizeText(row.assigned_agent || row.assignedAgentName || row.assignedAgentEmail || row.assigned_agent_email) || 'Unassigned',
    email: normalizeText(row.assigned_agent_email || row.assignedAgentEmail).toLowerCase(),
    branchId: normalizeText(row.assigned_branch_id || row.branchId),
  }
}

function normalizeTransaction(row = {}, usersByKey = new Map(), source = 'supabase') {
  const id = normalizeText(row.id || row.transactionId)
  const agent = resolveAgentFromRow(row, usersByKey)
  const title = normalizeText(row.transaction_reference || row.title || row.property_address_line_1 || row.propertyAddress || row.listingTitle) || 'Transaction'
  const updatedAt = row.last_meaningful_activity_at || row.updated_at || row.updatedAt || row.created_at || row.createdAt
  const stageChangedAt = row.stage_date || row.stageDate || row.updated_at || row.updatedAt || row.created_at || row.createdAt
  const stage = normalizePipelineStage(row)
  const reasons = []
  const idleDays = daysBetween(updatedAt)
  const stageAgeDays = daysBetween(stageChangedAt)
  if (idleDays !== null && idleDays >= 14 && stage !== 'registered') reasons.push('No activity for 14+ days')
  if (stageAgeDays !== null && stageAgeDays >= 14 && stage !== 'registered') reasons.push('Stage unchanged for 14+ days')
  if (toDate(row.expected_transfer_date) && toDate(row.expected_transfer_date) < startOfDay(new Date()) && stage !== 'registered') reasons.push('Expected registration date passed')
  return {
    id,
    title,
    subtitle: [row.property_address_line_1 || row.propertyAddress, row.suburb, row.city].map(normalizeText).filter(Boolean).join(', '),
    branchId: normalizeText(row.assigned_branch_id || row.branchId),
    agentId: agent.id,
    agentName: agent.name,
    agentEmail: agent.email,
    stage,
    rawStage: normalizeText(row.stage || row.current_main_stage || row.status),
    value: getDealValue(row),
    createdAt: row.created_at || row.createdAt || null,
    updatedAt,
    stageChangedAt,
    expectedRegistrationAt: row.expected_transfer_date || row.registration_date || row.expectedRegistrationAt || null,
    registeredAt: row.registered_at || row.registration_date || row.completed_at || row.registeredAt || null,
    nextAction: normalizeText(row.next_action || row.nextAction),
    waitingOnRole: normalizeText(row.waiting_on_role || row.waitingOnRole),
    riskReasons: reasons,
    source,
  }
}

function normalizeLeadOpportunity(row = {}, usersByKey = new Map(), source = 'lead') {
  const agent = resolveAgentFromRow({
    assigned_user_id: row.assigned_agent_id || row.assignedAgentId,
    assigned_agent_email: row.assignedAgentEmail,
    assigned_agent: row.assignedAgentName,
  }, usersByKey)
  const title = normalizeText(row.property_interest || row.propertyInterest || row.seller_property_address || row.sellerPropertyAddress || row.listingTitle) ||
    `${normalizeText(row.lead_category || row.leadCategory) || 'Lead'} Opportunity`
  return {
    id: normalizeText(row.lead_id || row.leadId),
    title,
    subtitle: normalizeText(row.lead_source || row.leadSource) || 'Lead',
    branchId: normalizeText(row.branch_id || row.branchId),
    agentId: agent.id,
    agentName: agent.name,
    agentEmail: agent.email,
    stage: normalizeLeadStage(row),
    rawStage: normalizeText(row.stage || row.status),
    value: toNumber(row.estimated_value || row.estimatedValue || row.budget),
    createdAt: row.created_at || row.createdAt || null,
    updatedAt: row.updated_at || row.updatedAt || row.created_at || row.createdAt || null,
    stageChangedAt: row.updated_at || row.updatedAt || row.created_at || row.createdAt || null,
    expectedRegistrationAt: null,
    registeredAt: null,
    nextAction: '',
    waitingOnRole: '',
    riskReasons: [],
    source,
  }
}

function matchesAgent(row = {}, agentId = '') {
  const target = normalizeText(agentId).toLowerCase()
  if (!target) return true
  return [
    row.agentId,
    row.agentEmail,
    row.assigned_agent_id,
    row.assignedAgentId,
    row.assigned_user_id,
    row.owner_user_id,
    row.assigned_agent_email,
    row.assignedAgentEmail,
  ].map((value) => normalizeText(value).toLowerCase()).includes(target)
}

function matchesBranch(row = {}, branchId = '') {
  const target = normalizeText(branchId)
  if (!target) return true
  return normalizeText(row.branchId || row.assigned_branch_id) === target
}

function dedupeById(rows = []) {
  const map = new Map()
  for (const row of rows) {
    const key = normalizeText(row.id)
    if (!key) continue
    const existing = map.get(key)
    if (!existing || toDate(row.updatedAt) > toDate(existing.updatedAt)) map.set(key, row)
  }
  return [...map.values()]
}

function buildEmptyOverview() {
  return {
    filters: { branches: [], agents: [], dateRange: 'this_month' },
    kpis: {
      totalPipelineValue: 0,
      activeTransactions: 0,
      avgDaysToRegistration: null,
      conversionRate: 0,
      dealsAtRisk: 0,
    },
    stages: PIPELINE_STAGE_ORDER.map((key) => ({ key, label: PIPELINE_STAGE_LABELS[key], count: 0, value: 0, avgDaysInStage: null, atRiskCount: 0, movement: [0, 0, 0, 0] })),
    bottlenecks: [],
    activity: [],
    agentMomentum: [],
    valueFlow: { totalValue: 0, stages: [] },
    criticalEvents: [],
    opportunities: [],
    transactions: [],
    meta: { isEmpty: true, lastUpdatedAt: new Date().toISOString() },
  }
}

function addRiskReasons(transactions = [], { documentRequests = [], subprocesses = [], steps = [], packets = [], tasks = [] } = {}) {
  const requestsByTx = groupBy(documentRequests, (row) => normalizeText(row.transaction_id))
  const subprocessesByTx = groupBy(subprocesses, (row) => normalizeText(row.transaction_id))
  const stepsByProcess = groupBy(steps, (row) => normalizeText(row.subprocess_id))
  const packetsByTx = groupBy(packets, (row) => normalizeText(row.transaction_id))
  const tasksByTx = groupBy(tasks, (row) => normalizeText(row.transaction_id || row.transactionId))

  return transactions.map((transaction) => {
    const reasons = new Set(transaction.riskReasons || [])
    const txRequests = requestsByTx.get(transaction.id) || []
    if (txRequests.some((row) => DOCUMENT_RISK_STATUSES.includes(normalizeKey(row.status)))) {
      reasons.add('Required documents missing')
    }
    const txProcesses = subprocessesByTx.get(transaction.id) || []
    for (const process of txProcesses) {
      const processKey = normalizeKey(process.process_type)
      const processStatus = normalizeKey(process.status)
      const processSteps = stepsByProcess.get(normalizeText(process.id)) || []
      const blockedStep = processSteps.find((step) => ['blocked', 'overdue'].includes(normalizeKey(step.status)))
      if (processStatus === 'blocked' || blockedStep) {
        reasons.add(processKey.includes('finance') ? 'Finance delayed' : 'Workflow blocked')
      }
      if (processKey.includes('attorney') && processStatus !== 'completed' && daysBetween(process.updated_at) >= 14) {
        reasons.add('Attorney workflow delayed')
      }
    }
    const txPackets = packetsByTx.get(transaction.id) || []
    if (txPackets.some((packet) => OPEN_PACKET_STATUSES.includes(normalizeKey(packet.status)))) {
      reasons.add('OTP/mandate awaiting signature')
    }
    const txTasks = tasksByTx.get(transaction.id) || []
    if (txTasks.some((task) => toDate(task.due_date || task.dueDate) < startOfDay(new Date()) && !DONE_STATUSES.includes(normalizeKey(task.status)))) {
      reasons.add('Follow-up overdue')
    }
    return { ...transaction, riskReasons: [...reasons] }
  })
}

function groupBy(rows = [], keyFn) {
  const map = new Map()
  for (const row of rows) {
    const key = keyFn(row)
    if (!key) continue
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(row)
  }
  return map
}

function average(values = []) {
  const valid = values.map(toNumber).filter((value) => Number.isFinite(value) && value > 0)
  if (!valid.length) return null
  return Math.round(valid.reduce((sum, value) => sum + value, 0) / valid.length)
}

function percentage(part, total) {
  const denominator = toNumber(total)
  if (!denominator) return 0
  return Math.round((toNumber(part) / denominator) * 100)
}

function buildStageCards(opportunities = []) {
  const totalValue = opportunities.reduce((sum, row) => sum + row.value, 0)
  return PIPELINE_STAGE_ORDER.map((key) => {
    const rows = opportunities.filter((row) => row.stage === key)
    const value = rows.reduce((sum, row) => sum + row.value, 0)
    return {
      key,
      label: PIPELINE_STAGE_LABELS[key],
      count: rows.length,
      value,
      percentage: percentage(value, totalValue),
      avgDaysInStage: average(rows.map((row) => daysBetween(row.stageChangedAt))),
      atRiskCount: rows.filter((row) => row.riskReasons?.length).length,
      movement: [0, 1, 2, 3].map((offset) => rows.filter((row) => {
        const created = toDate(row.createdAt)
        if (!created) return false
        const end = addDays(startOfDay(new Date()), -offset * 7)
        const start = addDays(end, -7)
        return created >= start && created < end
      }).length).reverse(),
    }
  })
}

function buildBottlenecks(transactions = [], { documentRequests = [], subprocesses = [], packets = [], tasks = [] } = {}) {
  const stuck = transactions.filter((row) => row.riskReasons?.some((reason) => reason.includes('14+'))).length
  const awaitingPackets = packets.filter((row) => OPEN_PACKET_STATUSES.includes(normalizeKey(row.status))).length
  const financeDelays = subprocesses.filter((row) => normalizeKey(row.process_type).includes('finance') && ['blocked', 'in_progress'].includes(normalizeKey(row.status)) && daysBetween(row.updated_at) >= 7).length
  const missingFica = documentRequests.filter((row) => {
    const text = normalizeKey(`${row.category} ${row.document_type} ${row.title}`)
    return DOCUMENT_RISK_STATUSES.includes(normalizeKey(row.status)) && (text.includes('fica') || text.includes('identity') || text.includes('proof'))
  }).length
  const attorneyAwaitingDocs = documentRequests.filter((row) => {
    const role = normalizeKey(row.assigned_to_role || row.created_by_role)
    return DOCUMENT_RISK_STATUSES.includes(normalizeKey(row.status)) && (role.includes('attorney') || role.includes('convey'))
  }).length
  const overdueTasks = tasks.filter((task) => toDate(task.due_date || task.dueDate) < startOfDay(new Date()) && !DONE_STATUSES.includes(normalizeKey(task.status))).length
  const expiringMandates = packets.filter((row) => {
    const type = normalizeKey(row.packet_type || row.title)
    return type.includes('mandate') && OPEN_PACKET_STATUSES.includes(normalizeKey(row.status)) && daysBetween(row.sent_at || row.created_at) >= 5
  }).length

  return [
    { key: 'stuck', label: 'Transactions stuck > 14 days', count: stuck, tone: 'red' },
    { key: 'otp', label: 'Awaiting OTP signatures', count: awaitingPackets, tone: 'amber' },
    { key: 'finance', label: 'Finance delays', count: financeDelays, tone: 'blue' },
    { key: 'fica', label: 'Missing FICA documents', count: missingFica, tone: 'amber' },
    { key: 'attorney_docs', label: 'Attorney awaiting documents', count: attorneyAwaitingDocs, tone: 'slate' },
    { key: 'buyers', label: 'Unresponsive buyers', count: overdueTasks, tone: 'red' },
    { key: 'mandates', label: 'Expiring mandates', count: expiringMandates, tone: 'amber' },
  ]
}

function buildActivity({ transactions = [], leadActivities = [], documents = [], packets = [], appointments = [], usersByKey = new Map() } = {}) {
  const items = [
    ...transactions.map((row) => ({
      id: `tx-${row.id}`,
      type: 'stage',
      title: `${row.title} moved to ${PIPELINE_STAGE_LABELS[row.stage] || row.rawStage || 'pipeline'}`,
      subtitle: row.subtitle,
      transactionId: row.id,
      actorName: row.agentName,
      createdAt: row.updatedAt,
    })),
    ...leadActivities.map((row) => {
      const user = usersByKey.get(normalizeText(row.agent_id).toLowerCase())
      return {
        id: normalizeText(row.activity_id || row.id) || `activity-${row.created_at}`,
        type: 'lead',
        title: normalizeText(row.activity_note) || normalizeText(row.activity_type) || 'Lead activity recorded',
        subtitle: normalizeText(row.outcome),
        transactionId: normalizeText(row.lead_id),
        actorName: user?.name || 'Agency team',
        createdAt: row.activity_date || row.created_at,
      }
    }),
    ...documents.map((row) => ({
      id: `doc-${row.id}`,
      type: 'document',
      title: `${normalizeText(row.name) || 'Document'} uploaded`,
      subtitle: normalizeText(row.category || row.document_type),
      transactionId: normalizeText(row.transaction_id),
      actorName: normalizeText(row.uploaded_by_email) || 'Document uploader',
      createdAt: row.created_at,
    })),
    ...packets.map((row) => ({
      id: `packet-${row.id}`,
      type: 'signing',
      title: `${normalizeText(row.title || row.packet_type) || 'Signing packet'} ${normalizeText(row.status) || 'updated'}`,
      subtitle: normalizeText(row.packet_type),
      transactionId: normalizeText(row.transaction_id),
      actorName: 'Signing workflow',
      createdAt: row.completed_at || row.updated_at || row.created_at,
    })),
    ...appointments.map((row) => ({
      id: `appt-${row.appointment_id || row.id}`,
      type: 'appointment',
      title: `${normalizeText(row.appointment_type) || 'Appointment'} ${normalizeText(row.status) || 'updated'}`,
      subtitle: normalizeText(row.title || row.location),
      transactionId: normalizeText(row.transaction_id || row.lead_id),
      actorName: 'Calendar',
      createdAt: row.completed_at || row.updated_at || row.date_time || row.created_at,
    })),
  ]
  return items
    .filter((item) => item.createdAt)
    .sort((a, b) => toDate(b.createdAt) - toDate(a.createdAt))
    .slice(0, 10)
}

function buildAgentMomentum(transactions = [], users = []) {
  const grouped = groupBy(transactions, (row) => row.agentId || row.agentEmail || 'unassigned')
  const userMap = new Map(users.map((user) => [user.id || user.email, user]))
  return [...grouped.entries()]
    .map(([key, rows]) => {
      const agent = userMap.get(key) || rows[0] || {}
      const lastActivity = rows.map((row) => toDate(row.updatedAt)).filter(Boolean).sort((a, b) => b - a)[0] || null
      return {
        agentId: key,
        agentName: agent.name || rows[0]?.agentName || 'Unassigned',
        dealsMoving: rows.filter((row) => !row.riskReasons?.length && row.stage !== 'registered').length,
        stalledDeals: rows.filter((row) => row.riskReasons?.length).length,
        avgResponseHours: null,
        activeValue: rows.reduce((sum, row) => sum + row.value, 0),
        lastActivity: lastActivity ? lastActivity.toISOString() : null,
      }
    })
    .sort((a, b) => b.activeValue - a.activeValue)
    .slice(0, 8)
}

function buildCriticalEvents({ transactions = [], appointments = [], tasks = [], subprocesses = [] } = {}) {
  const today = startOfDay(new Date())
  const weekEnd = addDays(today, 7)
  const expiringOtps = transactions.filter((row) => {
    const text = normalizeKey(`${row.rawStage} ${row.stage}`)
    return text.includes('otp') && daysBetween(row.updatedAt) >= 5
  }).length
  const registrations = transactions.filter((row) => isBetween(row.expectedRegistrationAt, today, weekEnd)).length
  const signings = appointments.filter((row) => {
    const text = normalizeKey(`${row.appointment_type} ${row.title}`)
    return text.includes('sign') && isBetween(row.date_time || row.appointment_date, today, weekEnd)
  }).length
  const overdue = tasks.filter((row) => toDate(row.due_date || row.dueDate) < today && !DONE_STATUSES.includes(normalizeKey(row.status))).length
  const bondGrants = subprocesses.filter((row) => normalizeKey(row.process_type).includes('finance') && ['blocked', 'in_progress'].includes(normalizeKey(row.status))).length
  return [
    { key: 'otp_expiring', label: 'OTPs expiring this week', count: expiringOtps },
    { key: 'registrations', label: 'Registrations expected this week', count: registrations },
    { key: 'signings', label: 'Buyer signings scheduled', count: signings },
    { key: 'followups', label: 'Follow-ups overdue', count: overdue },
    { key: 'bond_grants', label: 'Bond grants awaiting signatures', count: bondGrants },
  ]
}

export async function getPrincipalPipelineOverview({
  organisationId = '',
  branchId = '',
  agentId = '',
  agentEmail = '',
  dateRange = 'this_month',
  canViewAll = false,
} = {}) {
  const resolvedOrganisationId = normalizeText(organisationId)
  assertResolvedWorkspaceContext({ organisationId: resolvedOrganisationId, appRole: 'agent' }, { service: 'principalPipelineOverviewService.getPrincipalPipelineOverview' })
  const remoteOrganisationId = isUuidLike(resolvedOrganisationId) ? resolvedOrganisationId : ''
  const range = resolveDateRange(dateRange)
  const localSnapshot = remoteOrganisationId ? getAgencyPipelineSnapshot(resolvedOrganisationId) : { transactions: [], deals: [], leads: [] }

  const transactionFields = [
    'id, organisation_id, assigned_branch_id, assigned_user_id, owner_user_id, assigned_agent, assigned_agent_email, transaction_reference, title, stage, current_main_stage, current_sub_stage_summary, lifecycle_state, is_active, sales_price, purchase_price, finance_type, expected_transfer_date, registration_date, registered_at, completed_at, cancelled_at, archived_at, last_meaningful_activity_at, updated_at, created_at, stage_date, next_action, waiting_on_role, property_address_line_1, suburb, city',
    'id, organisation_id, assigned_user_id, owner_user_id, assigned_agent, assigned_agent_email, transaction_reference, stage, current_main_stage, lifecycle_state, is_active, sales_price, purchase_price, finance_type, expected_transfer_date, registration_date, registered_at, completed_at, cancelled_at, archived_at, last_meaningful_activity_at, updated_at, created_at, next_action, waiting_on_role, property_address_line_1, suburb, city',
  ]

  const [
    remoteTransactions,
    remoteLeads,
    remoteUsers,
    branches,
    leadActivities,
    packets,
  ] = await Promise.all([
    remoteOrganisationId ? safeSelect('transactions', transactionFields, { organisationId: remoteOrganisationId, order: 'updated_at', limit: 1600 }) : [],
    remoteOrganisationId ? safeSelect('leads', 'lead_id, organisation_id, assigned_agent_id, lead_category, lead_source, stage, status, budget, estimated_value, converted_transaction_id, converted_at, property_interest, seller_property_address, created_at, updated_at', { organisationId: remoteOrganisationId, order: 'updated_at', limit: 1600 }) : [],
    remoteOrganisationId ? safeSelect('organisation_users', 'id, organisation_id, user_id, branch_id, first_name, last_name, email, role, status, last_active_at, created_at, updated_at', { organisationId: remoteOrganisationId, order: 'updated_at', limit: 500 }) : [],
    remoteOrganisationId ? safeSelect('organisation_branches', 'id, organisation_id, name, location, city, is_head_office, is_active, updated_at, created_at', { organisationId: remoteOrganisationId, order: 'name', ascending: true, limit: 200 }) : [],
    remoteOrganisationId ? safeSelect('lead_activities', 'activity_id, organisation_id, lead_id, agent_id, activity_type, activity_note, activity_date, outcome, created_at', { organisationId: remoteOrganisationId, order: 'activity_date', limit: 500 }) : [],
    remoteOrganisationId ? safeSelect('document_packets', 'id, organisation_id, transaction_id, lead_id, packet_type, title, status, sent_at, completed_at, created_at, updated_at', { organisationId: remoteOrganisationId, order: 'updated_at', limit: 1000 }) : [],
  ])

  const users = (remoteUsers.length ? remoteUsers : []).map(normalizeAgent)
  const usersByKey = buildUsersByKey(users)
  const localTransactions = [
    ...(Array.isArray(localSnapshot.transactions) ? localSnapshot.transactions : []),
    ...(Array.isArray(localSnapshot.deals) ? localSnapshot.deals : []),
  ].map((row) => normalizeTransaction(row, usersByKey, 'local'))
  const localLeads = (Array.isArray(localSnapshot.leads) ? localSnapshot.leads : []).map((row) => normalizeLeadOpportunity(row, usersByKey, 'local_lead'))
  const remoteTxRows = remoteTransactions.map((row) => normalizeTransaction(row, usersByKey, 'supabase'))
  const remoteLeadRows = remoteLeads.map((row) => normalizeLeadOpportunity(row, usersByKey, 'lead'))
  let transactions = dedupeById([...remoteTxRows, ...localTransactions]).filter((row) => {
    if (!row.id || isCancelledOpportunity(row)) return false
    if (!matchesBranch(row, branchId)) return false
    if (!canViewAll && !matchesAgent(row, agentId || agentEmail)) return false
    if (canViewAll && agentId && !matchesAgent(row, agentId)) return false
    return true
  })
  let leadOpportunities = dedupeById([...remoteLeadRows, ...localLeads]).filter((row) => {
    if (!row.id) return false
    if (!matchesBranch(row, branchId)) return false
    if (!canViewAll && !matchesAgent(row, agentId || agentEmail)) return false
    if (canViewAll && agentId && !matchesAgent(row, agentId)) return false
    return true
  })

  const transactionIds = transactions.map((row) => row.id).filter(Boolean)
  const remoteTransactionIds = transactions
    .filter((row) => row.source === 'supabase' && isUuidLike(row.id))
    .map((row) => row.id)
  const [documentRequests, documents, subprocesses, appointments, tasks] = await Promise.all([
    remoteTransactionIds.length ? safeSelectByIds('document_requests', 'id, transaction_id, category, document_type, title, due_date, assigned_to_role, status, completed_at, created_at, updated_at', remoteTransactionIds, { order: 'updated_at', limit: 1600 }) : [],
    remoteTransactionIds.length ? safeSelectByIds('documents', 'id, transaction_id, name, category, document_type, uploaded_by_email, uploaded_by_role, created_at', remoteTransactionIds, { order: 'created_at', limit: 500 }) : [],
    remoteTransactionIds.length ? safeSelectByIds('transaction_subprocesses', 'id, transaction_id, process_type, owner_type, status, created_at, updated_at', remoteTransactionIds, { order: 'updated_at', limit: 1600 }) : [],
    remoteOrganisationId ? safeSelect('appointments', 'appointment_id, organisation_id, transaction_id, lead_id, agent_id, appointment_type, title, date_time, appointment_date, status, completed_at, follow_up_date, created_at, updated_at', { organisationId: remoteOrganisationId, order: 'date_time', limit: 600 }) : [],
    remoteOrganisationId ? safeSelect('tasks', 'task_id, organisation_id, transaction_id, lead_id, assigned_agent_id, title, due_date, status, priority, created_at, updated_at', { organisationId: remoteOrganisationId, order: 'due_date', limit: 600 }) : [],
  ])
  const steps = subprocesses.length
    ? await safeSelectByIds('transaction_subprocess_steps', 'id, subprocess_id, step_key, step_label, status, completed_at, owner_type, created_at, updated_at', subprocesses.map((row) => row.id).filter(isUuidLike), { idColumn: 'subprocess_id', order: 'updated_at', limit: 2000 })
    : []

  const scopedPackets = packets.filter((row) => !row.transaction_id || transactionIds.includes(normalizeText(row.transaction_id)))
  const localAppointments = Array.isArray(localSnapshot.appointments) ? localSnapshot.appointments : []
  const localTasks = Array.isArray(localSnapshot.tasks) ? localSnapshot.tasks : []
  const allAppointments = [...appointments, ...localAppointments].filter((row) => {
    if (agentId && !canViewAll) return matchesAgent({ agentId: row.agent_id || row.assignedAgentId }, agentId || agentEmail)
    return true
  })
  const allTasks = [...tasks, ...localTasks]
  transactions = addRiskReasons(transactions, { documentRequests, subprocesses, steps, packets: scopedPackets, tasks: allTasks })

  const opportunities = [...leadOpportunities.filter((row) => !['under_offer', 'otp_signed', 'finance', 'transfer', 'registered'].includes(row.stage)), ...transactions]
  const stages = buildStageCards(opportunities)
  const activeTransactions = transactions.filter((row) => row.stage !== 'registered')
  const registeredTransactions = transactions.filter((row) => row.stage === 'registered' || row.registeredAt)
  const totalPipelineValue = activeTransactions.reduce((sum, row) => sum + row.value, 0)
  const avgDaysToRegistration = average(registeredTransactions.map((row) => daysBetween(row.createdAt, row.registeredAt)))
  const conversionRate = percentage(registeredTransactions.length, registeredTransactions.length + activeTransactions.length + leadOpportunities.length)
  const dealsAtRisk = transactions.filter((row) => row.riskReasons?.length).length
  const valueStages = stages.map((stage) => ({ ...stage, percentage: percentage(stage.value, totalPipelineValue) }))

  return {
    filters: {
      branches: branches.map((row) => ({ id: normalizeText(row.id), name: normalizeText(row.name), isHeadOffice: Boolean(row.is_head_office) })),
      agents: users.map((row) => ({ id: row.id, name: row.name, email: row.email, branchId: row.branchId })),
      dateRange: range.key,
    },
    kpis: {
      totalPipelineValue,
      activeTransactions: activeTransactions.length,
      avgDaysToRegistration,
      conversionRate,
      dealsAtRisk,
    },
    stages,
    bottlenecks: buildBottlenecks(transactions, { documentRequests, subprocesses, packets: scopedPackets, tasks: allTasks }),
    activity: buildActivity({ transactions, leadActivities, documents, packets: scopedPackets, appointments: allAppointments, usersByKey }),
    agentMomentum: buildAgentMomentum(transactions, users),
    valueFlow: { totalValue: totalPipelineValue, stages: valueStages },
    criticalEvents: buildCriticalEvents({ transactions, appointments: allAppointments, tasks: allTasks, subprocesses }),
    opportunities,
    transactions,
    meta: {
      isEmpty: transactions.length === 0 && leadOpportunities.length === 0,
      lastUpdatedAt: new Date().toISOString(),
      source: isSupabaseConfigured ? 'supabase' : 'local',
    },
  }
}

export default getPrincipalPipelineOverview
