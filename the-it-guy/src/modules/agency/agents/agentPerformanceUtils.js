export const AGENT_DATE_RANGE_OPTIONS = [
  { value: 'last_7_days', label: 'Last 7 days' },
  { value: 'last_30_days', label: 'Last 30 days' },
  { value: 'month_to_date', label: 'Month to date' },
  { value: 'year_to_date', label: 'Year to date' },
]

export const AGENT_STATUS_TABS = [
  { value: 'all', label: 'All Agents' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'on_leave', label: 'On Leave' },
]

export const LEADERBOARD_METRICS = [
  { value: 'pipelineValue', label: 'Pipeline value' },
  { value: 'registrations', label: 'Registrations' },
  { value: 'conversionRate', label: 'Conversion rate' },
  { value: 'activityVolume', label: 'Activity volume' },
  { value: 'responseTime', label: 'Response time' },
]

const ACTIVE_TRANSACTION_BLOCKLIST = ['registered', 'cancelled', 'canceled', 'archived', 'deleted', 'lost']
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const ACTIVITY_TYPES = ['calls', 'viewings', 'followUps', 'emails', 'meetings', 'notes']

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase()
}

function toNumber(value) {
  const number = Number(value || 0)
  return Number.isFinite(number) ? number : 0
}

function parseDate(value) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

export function resolveAgentDateRange(rangeKey = 'last_30_days', now = new Date()) {
  const end = new Date(now)
  const start = new Date(now)
  if (rangeKey === 'last_7_days') {
    start.setDate(end.getDate() - 6)
  } else if (rangeKey === 'month_to_date') {
    start.setDate(1)
  } else if (rangeKey === 'year_to_date') {
    start.setMonth(0, 1)
  } else {
    start.setDate(end.getDate() - 29)
  }
  start.setHours(0, 0, 0, 0)
  end.setHours(23, 59, 59, 999)
  return { key: rangeKey, start, end }
}

function isWithinRange(value, range) {
  const date = parseDate(value)
  if (!date) return false
  return date >= range.start && date <= range.end
}

function getDayIndex(value) {
  const date = parseDate(value)
  if (!date) return -1
  return (date.getDay() + 6) % 7
}

function getAgentName(agent = {}) {
  return normalizeText(agent.name || agent.fullName || [agent.firstName, agent.lastName].filter(Boolean).join(' ') || agent.email || 'Agent')
}

function getAgentInitials(agent = {}) {
  const source = getAgentName(agent)
  const parts = source.includes('@') ? source.split('@')[0].split(/[._\s-]+/) : source.split(/\s+/)
  return parts.filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'A'
}

function getAgentKeys(agent = {}) {
  return [
    agent.id,
    agent.userId,
    agent.organisationUserId,
    agent.email,
    agent.name,
    agent.fullName,
  ].map(normalizeKey).filter(Boolean)
}

function buildAgentLookup(agents = []) {
  const map = new Map()
  for (const agent of agents) {
    for (const key of getAgentKeys(agent)) {
      if (!map.has(key)) map.set(key, agent)
    }
  }
  return map
}

function resolveRowAgent(row = {}, agentLookup = new Map()) {
  const transaction = row.transaction || row
  const candidates = [
    row.assignedAgentId,
    row.assignedAgentEmail,
    row.assignedAgentName,
    row.agentId,
    row.agentEmail,
    row.agentName,
    row.createdBy,
    row.assigned_agent_id,
    row.assigned_agent_email,
    row.assigned_agent,
    transaction.assigned_agent_id,
    transaction.assigned_agent_email,
    transaction.assigned_agent,
    row.commission?.agent_id,
  ].map(normalizeKey).filter(Boolean)
  for (const candidate of candidates) {
    if (agentLookup.has(candidate)) return agentLookup.get(candidate)
  }
  return null
}

function getBranchId(row = {}) {
  return normalizeKey(row.branchId || row.branch_id || row.branch?.id || row.organisationBranchId || row.office)
}

function getAgentBranchId(agent = {}) {
  return normalizeKey(agent.branchId || agent.branch_id || agent.office || agent.organisationName)
}

function getTransactionStage(row = {}) {
  const transaction = row.transaction || row
  return normalizeKey([
    row.stage,
    row.status,
    row.currentMainStage,
    row.current_main_stage,
    transaction.stage,
    transaction.status,
    transaction.current_main_stage,
    transaction.lifecycle_state,
  ].filter(Boolean).join(' '))
}

function isActiveTransaction(row = {}) {
  const stage = getTransactionStage(row)
  if (!stage) return true
  return !ACTIVE_TRANSACTION_BLOCKLIST.some((blocked) => stage.includes(blocked))
}

function isRegisteredTransaction(row = {}) {
  const transaction = row.transaction || row
  const stage = getTransactionStage(row)
  return Boolean(
    stage.includes('registered') ||
      transaction.registered_at ||
      transaction.registration_date ||
      transaction.completed_at ||
      row.registeredAt ||
      row.completedAt,
  )
}

function getTransactionValue(row = {}) {
  const transaction = row.transaction || row
  return toNumber(
    transaction.purchase_price ||
      transaction.sales_price ||
      transaction.cash_amount ||
      row.purchasePrice ||
      row.salesPrice ||
      row.unit?.price,
  )
}

function getListingValue(row = {}) {
  return toNumber(row.askingPrice || row.asking_price || row.price || row.estimatedValue || row.estimated_value)
}

function getOpportunityValue(row = {}) {
  return toNumber(row.estimatedValue || row.estimated_value || row.budget || row.opportunityValue || row.opportunity_value)
}

function getTransactionDate(row = {}) {
  const transaction = row.transaction || row
  return transaction.registered_at || transaction.registration_date || transaction.completed_at || transaction.updated_at || transaction.created_at || row.updatedAt || row.createdAt
}

function getLeadDate(row = {}) {
  return row.createdAt || row.created_at || row.updatedAt || row.updated_at
}

function getTaskDueDate(row = {}) {
  return row.dueDate || row.due_date || row.followUpDate || row.nextFollowUpDate
}

function isTaskCompleted(row = {}) {
  return normalizeKey(row.status).includes('complete')
}

function classifyActivity(row = {}) {
  const signal = normalizeKey([row.activityType, row.activity_type, row.title, row.description, row.activityNote, row.activity_note, row.outcome, row.source].filter(Boolean).join(' '))
  if (signal.includes('call') || signal.includes('phone')) return 'calls'
  if (signal.includes('viewing') || signal.includes('showing')) return 'viewings'
  if (signal.includes('follow') || signal.includes('task')) return 'followUps'
  if (signal.includes('email') || signal.includes('mail')) return 'emails'
  if (signal.includes('meeting') || signal.includes('appointment') || signal.includes('consult')) return 'meetings'
  return 'notes'
}

function getActivityTimestamp(row = {}) {
  return row.activityDate || row.activity_date || row.completedAt || row.completed_at || row.updatedAt || row.updated_at || row.dateTime || row.date_time || row.createdAt || row.created_at
}

function percentage(numerator, denominator) {
  const bottom = toNumber(denominator)
  if (!bottom) return 0
  return Math.round((toNumber(numerator) / bottom) * 100)
}

function average(values = []) {
  const filtered = values.map(Number).filter((value) => Number.isFinite(value) && value >= 0)
  if (!filtered.length) return null
  return filtered.reduce((sum, value) => sum + value, 0) / filtered.length
}

function formatHours(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return 'N/A'
  const hours = Number(value)
  if (hours < 1) return '<1h'
  if (hours < 24) return `${Math.round(hours)}h`
  return `${Math.round(hours / 24)}d`
}

function getBaseStatusKey(agent = {}) {
  const raw = normalizeKey(agent.status)
  if (raw.includes('pending') || raw.includes('invite') || raw.includes('invited')) return 'pending_invite'
  if (raw.includes('leave')) return 'on_leave'
  if (raw.includes('revoked') || raw.includes('inactive') || raw.includes('disabled') || raw.includes('expired')) return 'inactive'
  return 'active'
}

function getStatusKey(agent = {}, attentionFlags = []) {
  const baseStatus = getBaseStatusKey(agent)
  if (baseStatus !== 'active') return baseStatus
  if (attentionFlags.length) return 'needs_attention'
  return 'active'
}

function getStatusLabel(statusKey = '') {
  if (statusKey === 'inactive') return 'Inactive'
  if (statusKey === 'on_leave') return 'On Leave'
  if (statusKey === 'pending_invite') return 'Pending Invite'
  if (statusKey === 'needs_attention') return 'Needs Attention'
  return 'Active'
}

function getStatusClass(statusKey = '') {
  if (statusKey === 'inactive') return 'border-[#e6d5d2] bg-[#fff6f5] text-[#9a4038]'
  if (statusKey === 'on_leave') return 'border-[#e7ddf7] bg-[#f7f1ff] text-[#5c3a9d]'
  if (statusKey === 'pending_invite') return 'border-[#e7ddf7] bg-[#f7f1ff] text-[#5c3a9d]'
  if (statusKey === 'needs_attention') return 'border-[#f0dfb8] bg-[#fff8eb] text-[#8a641d]'
  return 'border-[#d7e7dd] bg-[#edf9f1] text-[#1d7d45]'
}

function buildSparkline(agentEvents = [], range) {
  const buckets = Array.from({ length: 7 }, (_, index) => ({ index, value: 0 }))
  for (const event of agentEvents) {
    const timestamp = getActivityTimestamp(event)
    if (!isWithinRange(timestamp, range)) continue
    const date = parseDate(timestamp)
    const progress = Math.floor(((date.getTime() - range.start.getTime()) / Math.max(range.end.getTime() - range.start.getTime(), 1)) * buckets.length)
    const index = Math.max(0, Math.min(buckets.length - 1, progress))
    buckets[index].value += 1
  }
  return buckets.map((bucket) => bucket.value)
}

export function buildBranchOptions({ branches = [], agents = [] } = {}) {
  const map = new Map()
  map.set('all', { id: 'all', name: 'All Branches' })
  for (const branch of branches) {
    const id = normalizeKey(branch.id || branch.branchId || branch.name)
    if (!id) continue
    map.set(id, { id, name: normalizeText(branch.name || branch.branchName) || 'Untitled Branch' })
  }
  for (const agent of agents) {
    const id = getAgentBranchId(agent)
    if (!id || map.has(id)) continue
    map.set(id, { id, name: normalizeText(agent.office || agent.branchName || agent.organisationName) || 'Unassigned Branch' })
  }
  return [...map.values()]
}

export function buildAgentPerformanceModel({
  agents = [],
  branches = [],
  leads = [],
  transactions = [],
  listings = [],
  appointments = [],
  tasks = [],
  activities = [],
  filters = {},
  commissionRate = null,
} = {}) {
  const range = resolveAgentDateRange(filters.dateRange)
  const agentLookup = buildAgentLookup(agents)
  const todayStart = startOfDay(new Date())
  const now = new Date()
  const branchOptions = buildBranchOptions({ branches, agents })
  const selectedBranch = normalizeKey(filters.branchId || 'all')
  const query = normalizeKey(filters.search)
  const statusFilter = normalizeKey(filters.status || 'all')
  const roleFilter = normalizeKey(filters.role || 'all')
  const officeFilter = normalizeKey(filters.office || 'all')

  const rowsByAgent = new Map()
  for (const agent of agents) {
    const key = getAgentKeys(agent)[0] || normalizeKey(getAgentName(agent))
    if (!key) continue
    rowsByAgent.set(key, {
      ...agent,
      displayName: getAgentName(agent),
      initials: getAgentInitials(agent),
      performance: {
        pipelineValue: 0,
        deals: 0,
        listings: 0,
        conversionRate: 0,
        registrations: 0,
        totalOpportunities: 0,
        nextFollowUps: 0,
        overdueFollowUps: 0,
        responseTimeHours: null,
        responseTimeLabel: 'N/A',
        activityVolume: 0,
        commissionMtd: null,
        activeTransactions: 0,
        activeToday: false,
        lastActivityAt: null,
        sparkline: [],
      },
      attentionFlags: [],
      recentEvents: [],
      baseStatusKey: getBaseStatusKey(agent),
      statusMeta: { key: 'active', label: 'Active', className: getStatusClass('active') },
    })
  }

  const findBucket = (row) => {
    const agent = resolveRowAgent(row, agentLookup)
    if (!agent) return null
    const key = getAgentKeys(agent)[0]
    return rowsByAgent.get(key) || null
  }

  const agentEvents = new Map()
  const responseSamples = new Map()
  const convertedLeadCount = new Map()
  const leadCount = new Map()

  const registerEvent = (bucket, event) => {
    if (!bucket) return
    const key = getAgentKeys(bucket)[0] || normalizeKey(bucket.displayName)
    if (!agentEvents.has(key)) agentEvents.set(key, [])
    agentEvents.get(key).push(event)
    const timestamp = getActivityTimestamp(event)
    const date = parseDate(timestamp)
    if (date) {
      bucket.performance.lastActivityAt = bucket.performance.lastActivityAt
        ? new Date(Math.max(parseDate(bucket.performance.lastActivityAt)?.getTime() || 0, date.getTime())).toISOString()
        : date.toISOString()
      if (date >= todayStart && date <= now) bucket.performance.activeToday = true
    }
    if (isWithinRange(timestamp, range)) {
      bucket.performance.activityVolume += 1
      bucket.recentEvents.push(event)
    }
  }

  for (const lead of leads) {
    const bucket = findBucket(lead)
    if (!bucket) continue
    const key = getAgentKeys(bucket)[0]
    leadCount.set(key, (leadCount.get(key) || 0) + 1)
    const signal = normalizeKey(`${lead.stage || ''} ${lead.status || ''}`)
    if (signal.includes('converted') || signal.includes('deal') || signal.includes('registered')) {
      convertedLeadCount.set(key, (convertedLeadCount.get(key) || 0) + 1)
    }
    if (isWithinRange(getLeadDate(lead), range)) {
      bucket.performance.totalOpportunities += 1
      bucket.performance.pipelineValue += getOpportunityValue(lead)
    }
  }

  for (const transaction of transactions) {
    const bucket = findBucket(transaction)
    if (!bucket) continue
    const inRange = isWithinRange(getTransactionDate(transaction), range)
    const active = isActiveTransaction(transaction)
    const registered = isRegisteredTransaction(transaction)
    const value = getTransactionValue(transaction)
    if (active) {
      bucket.performance.pipelineValue += value
      bucket.performance.activeTransactions += 1
    }
    if (inRange) {
      bucket.performance.deals += 1
      bucket.performance.totalOpportunities += 1
      if (registered) bucket.performance.registrations += 1
    }
    if (registered && isWithinRange(getTransactionDate(transaction), resolveAgentDateRange('month_to_date'))) {
      const explicitCommission = toNumber((transaction.transaction || transaction).agent_commission_amount || transaction.agentCommissionAmount)
      bucket.performance.commissionMtd = toNumber(bucket.performance.commissionMtd) + (explicitCommission || (commissionRate ? value * commissionRate : 0))
    }
    registerEvent(bucket, {
      type: registered ? 'registration' : 'transaction',
      title: registered ? 'registered a sale' : 'updated transaction stage',
      timestamp: getTransactionDate(transaction),
      original: transaction,
    })
  }

  for (const listing of listings) {
    const bucket = findBucket(listing)
    if (!bucket) continue
    const status = normalizeKey(listing.status || listing.listingStatus || listing.listing_status)
    if (!['deleted', 'archived', 'withdrawn', 'sold'].some((blocked) => status.includes(blocked))) {
      bucket.performance.listings += 1
      bucket.performance.pipelineValue += getListingValue(listing)
    }
    registerEvent(bucket, {
      type: 'listing',
      title: 'added a listing',
      timestamp: listing.updatedAt || listing.updated_at || listing.createdAt || listing.created_at,
      original: listing,
    })
  }

  for (const task of tasks) {
    const bucket = findBucket(task)
    if (!bucket) continue
    const dueDate = parseDate(getTaskDueDate(task))
    if (!isTaskCompleted(task) && dueDate) {
      if (dueDate >= now) bucket.performance.nextFollowUps += 1
      if (dueDate < todayStart) bucket.performance.overdueFollowUps += 1
    }
    registerEvent(bucket, {
      type: 'followUps',
      title: isTaskCompleted(task) ? 'completed follow-up' : 'created follow-up',
      timestamp: task.updatedAt || task.updated_at || task.createdAt || task.created_at || getTaskDueDate(task),
      original: task,
    })
  }

  for (const appointment of appointments) {
    const bucket = findBucket(appointment)
    if (!bucket) continue
    registerEvent(bucket, {
      type: 'viewings',
      title: normalizeKey(appointment.appointmentType || appointment.appointment_type || appointment.title).includes('viewing')
        ? 'booked a viewing'
        : 'booked a meeting',
      timestamp: appointment.updatedAt || appointment.updated_at || appointment.dateTime || appointment.date_time || appointment.createdAt || appointment.created_at,
      original: appointment,
    })
  }

  for (const activity of activities) {
    const bucket = findBucket(activity)
    if (!bucket) continue
    registerEvent(bucket, {
      type: classifyActivity(activity),
      title: normalizeText(activity.activityType || activity.activity_type || activity.outcome) || 'updated lead activity',
      timestamp: getActivityTimestamp(activity),
      original: activity,
    })
  }

  for (const lead of leads) {
    const bucket = findBucket(lead)
    if (!bucket) continue
    const key = getAgentKeys(bucket)[0]
    const created = parseDate(lead.createdAt || lead.created_at)
    if (!created) continue
    const firstEvent = (agentEvents.get(key) || [])
      .map((event) => parseDate(getActivityTimestamp(event)))
      .filter((date) => date && date >= created)
      .sort((left, right) => left.getTime() - right.getTime())[0]
    if (!firstEvent) continue
    if (!responseSamples.has(key)) responseSamples.set(key, [])
    responseSamples.get(key).push((firstEvent.getTime() - created.getTime()) / 3600000)
  }

  const allEvents = []
  for (const [key, bucket] of rowsByAgent.entries()) {
    const opportunities = bucket.performance.totalOpportunities || leadCount.get(key) || bucket.performance.deals
    const registrations = bucket.performance.registrations || convertedLeadCount.get(key) || 0
    bucket.performance.conversionRate = percentage(registrations, opportunities)
    bucket.performance.responseTimeHours = average(responseSamples.get(key) || [])
    bucket.performance.responseTimeLabel = formatHours(bucket.performance.responseTimeHours)
    bucket.performance.sparkline = buildSparkline(agentEvents.get(key) || [], range)
    if (bucket.performance.commissionMtd !== null && !Number.isFinite(Number(bucket.performance.commissionMtd))) {
      bucket.performance.commissionMtd = null
    }

    const lastActivity = parseDate(bucket.performance.lastActivityAt)
    const inactiveForDays = lastActivity ? (now.getTime() - lastActivity.getTime()) / 86400000 : Infinity
    if (inactiveForDays > 7) bucket.attentionFlags.push('No activity in 7 days')
    if (bucket.performance.listings <= 0) bucket.attentionFlags.push('No active listings')
    if (bucket.performance.overdueFollowUps > 0) bucket.attentionFlags.push(`${bucket.performance.overdueFollowUps} overdue follow-up${bucket.performance.overdueFollowUps === 1 ? '' : 's'}`)
    if (bucket.performance.conversionRate < 10 && opportunities > 0) bucket.attentionFlags.push('Low conversion rate')
    if (bucket.performance.pipelineValue <= 0) bucket.attentionFlags.push('No pipeline')

    const statusKey = getStatusKey(bucket, bucket.attentionFlags)
    bucket.statusMeta = {
      key: statusKey,
      label: getStatusLabel(statusKey),
      className: getStatusClass(statusKey),
    }
    bucket.baseStatusKey = getBaseStatusKey(bucket)

    for (const event of bucket.recentEvents) {
      allEvents.push({
        agentName: bucket.displayName,
        agentInitials: bucket.initials,
        action: event.title,
        timestamp: getActivityTimestamp(event),
        type: event.type,
      })
    }
  }

  let modelAgents = [...rowsByAgent.values()]
  modelAgents = modelAgents.filter((agent) => {
    const branchMatch = selectedBranch === 'all' || getAgentBranchId(agent) === selectedBranch
    const officeMatch = officeFilter === 'all' || normalizeKey(agent.office) === officeFilter
    const roleMatch = roleFilter === 'all' || normalizeKey(agent.role) === roleFilter
    const tabMatch = statusFilter === 'all' || agent.baseStatusKey === statusFilter || agent.statusMeta.key === statusFilter || normalizeKey(agent.status) === statusFilter
    const searchMatch = !query || [agent.displayName, agent.email, agent.phone, agent.office, agent.organisationName].map(normalizeKey).join(' ').includes(query)
    return branchMatch && officeMatch && roleMatch && tabMatch && searchMatch
  })

  const totalAgents = modelAgents.length
  const activeToday = modelAgents.filter((agent) => agent.performance.activeToday).length
  const totalPipelineValue = modelAgents.reduce((sum, agent) => sum + agent.performance.pipelineValue, 0)
  const activeTransactions = modelAgents.reduce((sum, agent) => sum + agent.performance.activeTransactions, 0)
  const averageConversionRate = totalAgents ? Math.round(modelAgents.reduce((sum, agent) => sum + agent.performance.conversionRate, 0) / totalAgents) : 0
  const responseValues = modelAgents
    .map((agent) => agent.performance.responseTimeHours)
    .filter((value) => value !== null && value !== undefined && Number.isFinite(Number(value)))
  const averageResponseTime = average(responseValues)
  const commissionValues = modelAgents
    .map((agent) => agent.performance.commissionMtd)
    .filter((value) => value !== null && value !== undefined && Number.isFinite(Number(value)))

  const maxPipeline = Math.max(1, ...modelAgents.map((agent) => agent.performance.pipelineValue))
  const maxListingsRegistrations = Math.max(1, ...modelAgents.flatMap((agent) => [agent.performance.listings, agent.performance.registrations]))
  const heatmap = ACTIVITY_TYPES.map((type) => ({
    type,
    label: type === 'followUps' ? 'Follow-ups' : type.charAt(0).toUpperCase() + type.slice(1),
    days: DAY_LABELS.map((day, dayIndex) => {
      const value = allEvents.filter((event) => event.type === type && getDayIndex(event.timestamp) === dayIndex).length
      return { day, value }
    }),
  }))

  return {
    filters: {
      range,
      branchOptions,
    },
    agents: modelAgents,
    kpis: {
      totalAgents,
      activeToday,
      totalPipelineValue,
      activeTransactions,
      averageConversionRate,
      averageResponseTimeLabel: formatHours(averageResponseTime),
      commissionMtd: commissionValues.length ? commissionValues.reduce((sum, value) => sum + value, 0) : null,
    },
    charts: {
      pipelineByAgent: [...modelAgents]
        .sort((left, right) => right.performance.pipelineValue - left.performance.pipelineValue)
        .slice(0, 10)
        .map((agent) => ({
          agent: agent.displayName,
          initials: agent.initials,
          value: agent.performance.pipelineValue,
          percent: Math.round((agent.performance.pipelineValue / maxPipeline) * 100),
        })),
      conversionByAgent: [...modelAgents]
        .sort((left, right) => right.performance.conversionRate - left.performance.conversionRate)
        .slice(0, 10)
        .map((agent) => ({ agent: agent.displayName, value: agent.performance.conversionRate })),
      listingsVsRegistrations: [...modelAgents]
        .sort((left, right) => (right.performance.listings + right.performance.registrations) - (left.performance.listings + left.performance.registrations))
        .slice(0, 10)
        .map((agent) => ({
          agent: agent.displayName,
          listings: agent.performance.listings,
          registrations: agent.performance.registrations,
          max: maxListingsRegistrations,
        })),
      activityHeatmap: heatmap,
    },
    intelligence: {
      topPerformers: [...modelAgents].sort((left, right) => right.performance.pipelineValue - left.performance.pipelineValue).slice(0, 5),
      attentionAgents: modelAgents.filter((agent) => agent.attentionFlags.length).slice(0, 5),
      recentActivity: allEvents
        .filter((event) => isWithinRange(event.timestamp, range))
        .sort((left, right) => (parseDate(right.timestamp)?.getTime() || 0) - (parseDate(left.timestamp)?.getTime() || 0))
        .slice(0, 8),
    },
    leaderboard: {
      metrics: LEADERBOARD_METRICS,
      rows: [...modelAgents],
    },
  }
}
