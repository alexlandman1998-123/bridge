import { AGENT_DATE_RANGE_OPTIONS, buildAgentPerformanceModel, resolveAgentDateRange } from './agentPerformanceUtils.js'

const ACTIVE_STATUS_VALUES = new Set(['active', 'accepted', 'onboarding_started'])
const INACTIVE_STATUS_SIGNALS = ['inactive', 'disabled', 'revoked', 'expired', 'deleted', 'archived']
const RESPONSE_TIME_THRESHOLD_HOURS = 24

export const PRINCIPAL_AGENT_RANKING_METRICS = [
  { value: 'pipelineValue', label: 'Pipeline value' },
  { value: 'commissionMtd', label: 'Registered commission' },
  { value: 'deals', label: 'Transactions' },
  { value: 'conversionRate', label: 'Conversion rate' },
]

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

function getAgentOrganisationId(agent = {}) {
  return normalizeKey(agent.organisationId || agent.organisation_id || agent.agencyId || agent.agency_id || agent.organisation?.id)
}

function getAgentBranchId(agent = {}) {
  return normalizeKey(agent.branchId || agent.branch_id || agent.office || agent.branchName || agent.branch?.id)
}

function getAgentStatus(agent = {}) {
  const status = normalizeKey(agent.status || agent.inviteStatus || agent.membershipStatus)
  if (INACTIVE_STATUS_SIGNALS.some((signal) => status.includes(signal))) return 'inactive'
  if (status.includes('pending') || status.includes('invite') || status.includes('invited')) return 'pending_invite'
  if (status.includes('leave')) return 'on_leave'
  if (!status || ACTIVE_STATUS_VALUES.has(status)) return 'active'
  return status
}

function isDeletedAgent(agent = {}) {
  const status = normalizeKey(agent.status || agent.inviteStatus || agent.membershipStatus)
  return Boolean(agent.deletedAt || agent.deleted_at || status.includes('deleted') || status.includes('archived'))
}

function getAgentName(agent = {}) {
  return normalizeText(agent.displayName || agent.name || agent.fullName || [agent.firstName, agent.lastName].filter(Boolean).join(' ') || agent.email || 'Agent')
}

function getAgentInitials(agent = {}) {
  const source = getAgentName(agent)
  const parts = source.includes('@') ? source.split('@')[0].split(/[._\s-]+/) : source.split(/\s+/)
  return parts.filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'A'
}

function getAgentAvatarUrl(agent = {}) {
  return normalizeText(
    agent.avatarUrl ||
      agent.avatar_url ||
      agent.profilePhotoUrl ||
      agent.profile_photo_url ||
      agent.photoUrl ||
      agent.photo_url ||
      agent.picture,
  )
}

function getBranchName(branches = [], branchId = '', fallback = '') {
  const normalized = normalizeKey(branchId)
  const match = branches.find((branch) => normalizeKey(branch.id || branch.branchId || branch.name || branch.branchName) === normalized)
  return normalizeText(match?.name || match?.branchName || fallback) || 'Current Office'
}

function isToday(value, now = new Date()) {
  const date = parseDate(value)
  if (!date) return false
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate()
}

function daysSince(value, now = new Date()) {
  const date = parseDate(value)
  if (!date) return Infinity
  return Math.max(0, (now.getTime() - date.getTime()) / 86400000)
}

function normalizeMetric(metric = '') {
  if (metric === 'commissionMtd' || metric === 'registeredCommission') return 'commissionMtd'
  if (metric === 'transactions' || metric === 'deals') return 'deals'
  if (metric === 'conversion' || metric === 'conversionRate') return 'conversionRate'
  return metric || 'pipelineValue'
}

function getMetricValue(agent = {}, metric = 'pipelineValue') {
  const performance = agent.performance || {}
  const normalized = normalizeMetric(metric)
  if (normalized === 'responseTime') return performance.responseTimeHours ?? Infinity
  return toNumber(performance[normalized])
}

function sortAgents(rows = [], sortBy = 'pipeline') {
  const sorted = [...rows]
  sorted.sort((left, right) => {
    const leftPerformance = left.performance || {}
    const rightPerformance = right.performance || {}
    if (sortBy === 'branch') return String(left.branchName || '').localeCompare(String(right.branchName || '')) || String(left.name || '').localeCompare(String(right.name || ''))
    if (sortBy === 'deals' || sortBy === 'active_deals') return toNumber(rightPerformance.deals) - toNumber(leftPerformance.deals)
    if (sortBy === 'listings') return toNumber(rightPerformance.listings) - toNumber(leftPerformance.listings)
    if (sortBy === 'conversion') return toNumber(rightPerformance.conversionRate) - toNumber(leftPerformance.conversionRate)
    if (sortBy === 'followUps') return toNumber(rightPerformance.overdueFollowUps) - toNumber(leftPerformance.overdueFollowUps)
    if (sortBy === 'recent' || sortBy === 'lastActivity') return (parseDate(rightPerformance.lastActivityAt)?.getTime() || 0) - (parseDate(leftPerformance.lastActivityAt)?.getTime() || 0)
    if (sortBy === 'status') return String(left.statusLabel || '').localeCompare(String(right.statusLabel || ''))
    if (sortBy === 'name') return String(left.name || '').localeCompare(String(right.name || ''))
    return toNumber(rightPerformance.pipelineValue) - toNumber(leftPerformance.pipelineValue)
  })
  return sorted
}

function buildAttentionReasons(agent = {}, now = new Date()) {
  const performance = agent.performance || {}
  const reasons = []
  if (daysSince(performance.lastActivityAt, now) > 7) reasons.push('No activity in 7 days')
  if (toNumber(performance.activeTransactionCount || performance.activeTransactions) === 0 && toNumber(performance.pipelineValue) > 0) reasons.push('Pipeline without active transactions')
  if (toNumber(performance.overdueFollowUps) > 0) reasons.push('Overdue follow-ups')
  if (toNumber(performance.staleLeads) > 0) reasons.push('Stale leads')
  if (Number.isFinite(Number(performance.responseTimeHours)) && Number(performance.responseTimeHours) > RESPONSE_TIME_THRESHOLD_HOURS) reasons.push('Slow response time')

  const uniqueReasons = [...new Set([...(agent.attentionFlags || []), ...reasons])]
  const severity = uniqueReasons.length >= 2 || toNumber(performance.overdueFollowUps) > 3
    ? 'High'
    : uniqueReasons.length === 1
      ? 'Medium'
      : 'Low'

  return {
    reasons: uniqueReasons,
    severity,
    suggestedAction: severity === 'High' ? 'Book intervention' : severity === 'Medium' ? 'Schedule check-in' : 'Keep watching',
  }
}

function shouldIncludeAgent(agent = {}, { organisationId = '', branchId = 'all', status = 'all', includeInactive = false } = {}) {
  if (isDeletedAgent(agent)) return status === 'inactive' && includeInactive

  const agentOrganisationId = getAgentOrganisationId(agent)
  if (organisationId && organisationId !== 'all' && agentOrganisationId && agentOrganisationId !== normalizeKey(organisationId)) return false

  const selectedBranch = normalizeKey(branchId || 'all')
  if (selectedBranch && selectedBranch !== 'all' && getAgentBranchId(agent) !== selectedBranch) return false

  const agentStatus = getAgentStatus(agent)
  if (status === 'inactive') return agentStatus === 'inactive'
  if (status === 'on_leave') return agentStatus === 'on_leave'
  if (status === 'pending_invite') return agentStatus === 'pending_invite'
  if (agentStatus === 'pending_invite') return false
  if (status === 'active') return agentStatus === 'active'
  if (!includeInactive && agentStatus === 'inactive') return false
  return true
}

export function getPrincipalAgentCommandCentre({
  principalId = '',
  organisationId = '',
  branchId = 'all',
  filters = {},
  agents = [],
  branches = [],
  leads = [],
  transactions = [],
  listings = [],
  appointments = [],
  tasks = [],
  activities = [],
  now = new Date(),
} = {}) {
  const status = normalizeKey(filters.status || 'all')
  const includeInactive = status === 'inactive' || Boolean(filters.includeInactive)
  const selectedBranchId = normalizeKey(filters.branchId || branchId || 'all')
  const selectedOrganisationId = normalizeKey(filters.organisationId || organisationId || 'all')
  const rankingMetric = normalizeMetric(filters.rankingMetric || filters.metric || 'pipelineValue')
  const sortBy = normalizeKey(filters.sortBy || 'pipeline')

  const visibleAgents = agents.filter((agent) =>
    shouldIncludeAgent(agent, {
      organisationId: selectedOrganisationId,
      branchId: selectedBranchId,
      status,
      includeInactive,
    }),
  )

  const model = buildAgentPerformanceModel({
    agents: visibleAgents,
    branches,
    leads,
    transactions,
    listings,
    appointments,
    tasks,
    activities,
    filters: {
      branchId: 'all',
      office: filters.office || 'all',
      role: filters.role || 'all',
      status: status === 'inactive' ? 'inactive' : status,
      search: filters.search || '',
      dateRange: filters.dateRange || 'last_30_days',
    },
    now,
  })

  const modelAgents = model.agents.map((agent) => {
    const branchKey = getAgentBranchId(agent)
    return {
      ...agent,
      branchId: branchKey || 'current-office',
      branchName: getBranchName(branches, branchKey, agent.office || agent.branchName || agent.organisationName),
    }
  })

  const totalAgents = modelAgents.length
  const activeToday = modelAgents.filter((agent) => agent.performance?.activeToday || isToday(agent.performance?.lastActivityAt, now)).length
  const pipelineValue = modelAgents.reduce((sum, agent) => sum + toNumber(agent.performance?.pipelineValue), 0)
  const transactionsCount = modelAgents.reduce((sum, agent) => sum + toNumber(agent.performance?.activeTransactionCount || agent.performance?.activeTransactions || agent.performance?.deals), 0)
  const conversionValues = modelAgents
    .map((agent) => agent.performance?.conversionRate)
    .filter((value) => value !== null && value !== undefined && Number.isFinite(Number(value)))
  const conversionRate = conversionValues.length ? Math.round(conversionValues.reduce((sum, value) => sum + toNumber(value), 0) / conversionValues.length) : null
  const registrationDayValues = modelAgents.flatMap((agent) => Array.isArray(agent.performance?.registrationDays) ? agent.performance.registrationDays : [])
    .filter((value) => Number.isFinite(Number(value)) && Number(value) >= 0)
  const avgDaysToRegistration = registrationDayValues.length
    ? Math.round(registrationDayValues.reduce((sum, value) => sum + Number(value), 0) / registrationDayValues.length)
    : model.kpis.avgDaysToRegistration ?? null
  const commissionMtdValues = modelAgents
    .map((agent) => agent.performance?.commissionMtd)
    .filter((value) => value !== null && value !== undefined && Number.isFinite(Number(value)))
  const commissionMtd = commissionMtdValues.length ? commissionMtdValues.reduce((sum, value) => sum + toNumber(value), 0) : null

  const attentionByAgent = new Map()
  modelAgents.forEach((agent) => attentionByAgent.set(agent.id || agent.email || agent.displayName, buildAttentionReasons(agent, now)))

  const branchMap = new Map()
  for (const agent of modelAgents) {
    const key = agent.branchId || 'current-office'
    if (!branchMap.has(key)) {
      branchMap.set(key, {
        id: key,
        name: agent.branchName || 'Current Office',
        activeAgents: 0,
        pipelineValue: 0,
        transactions: 0,
        conversionTotal: 0,
        conversionCount: 0,
        attentionCount: 0,
      })
    }
    const branch = branchMap.get(key)
    const attention = attentionByAgent.get(agent.id || agent.email || agent.displayName)
    branch.activeAgents += getAgentStatus(agent) === 'active' ? 1 : 0
    branch.pipelineValue += toNumber(agent.performance?.pipelineValue)
    branch.transactions += toNumber(agent.performance?.activeTransactionCount || agent.performance?.activeTransactions || agent.performance?.deals)
    branch.conversionTotal += toNumber(agent.performance?.conversionRate)
    branch.conversionCount += 1
    branch.attentionCount += attention?.reasons?.length ? 1 : 0
  }

  const branchPerformance = [...branchMap.values()]
    .map((branch) => ({
      ...branch,
      conversionRate: branch.conversionCount ? Math.round(branch.conversionTotal / branch.conversionCount) : 0,
    }))
    .sort((left, right) => right.pipelineValue - left.pipelineValue || right.activeAgents - left.activeAgents)

  if (!branchPerformance.length) {
    branchPerformance.push({
      id: 'current-office',
      name: 'Current Office',
      activeAgents: 0,
      pipelineValue: 0,
      transactions: 0,
      conversionRate: 0,
      attentionCount: 0,
    })
  }

  const maxMetric = Math.max(1, ...modelAgents.map((agent) => {
    const value = getMetricValue(agent, rankingMetric)
    return rankingMetric === 'responseTime' ? (value === Infinity ? 0 : value) : value
  }))

  const topPerformers = [...modelAgents]
    .sort((left, right) => {
      if (rankingMetric === 'responseTime') return getMetricValue(left, rankingMetric) - getMetricValue(right, rankingMetric)
      return getMetricValue(right, rankingMetric) - getMetricValue(left, rankingMetric)
    })
    .slice(0, 5)
    .map((agent, index) => {
      const metricValue = getMetricValue(agent, rankingMetric)
      const safeMetricValue = metricValue === Infinity ? 0 : metricValue
      return {
        rank: index + 1,
        id: agent.id || agent.email || agent.displayName,
        name: agent.displayName || getAgentName(agent),
        initials: agent.initials || getAgentInitials(agent),
        avatarUrl: getAgentAvatarUrl(agent),
        role: agent.role || 'agent',
        branchName: agent.branchName,
        metric: rankingMetric,
        metricValue: safeMetricValue,
        pipelineValue: toNumber(agent.performance?.pipelineValue),
        movement: toNumber(agent.performance?.activityVolume),
        progress: Math.round((safeMetricValue / maxMetric) * 100),
        agent,
      }
    })

  const attentionAgents = modelAgents
    .map((agent) => {
      if (getAgentStatus(agent) === 'pending_invite') return null
      const attention = attentionByAgent.get(agent.id || agent.email || agent.displayName) || buildAttentionReasons(agent, now)
      return {
        id: agent.id || agent.email || agent.displayName,
        name: agent.displayName || getAgentName(agent),
        initials: agent.initials || getAgentInitials(agent),
        avatarUrl: getAgentAvatarUrl(agent),
        role: agent.role || 'agent',
        branchName: agent.branchName,
        reasons: attention.reasons,
        primaryReason: attention.reasons[0] || 'Watch only',
        severity: attention.severity,
        suggestedAction: attention.suggestedAction,
        overdueFollowUps: toNumber(agent.performance?.overdueFollowUps),
        agent,
      }
    })
    .filter((row) => row?.reasons?.length)
    .sort((left, right) => {
      const severityRank = { High: 3, Medium: 2, Low: 1 }
      return (severityRank[right.severity] || 0) - (severityRank[left.severity] || 0) || right.overdueFollowUps - left.overdueFollowUps
    })
    .slice(0, 6)

  const agentsTable = sortAgents(
    modelAgents.map((agent) => ({
      id: agent.id || agent.email || agent.displayName,
      name: agent.displayName || getAgentName(agent),
      initials: agent.initials || getAgentInitials(agent),
      avatarUrl: getAgentAvatarUrl(agent),
      email: agent.email || '',
      phone: agent.phone || '',
      branchId: agent.branchId,
      branchName: agent.branchName,
      role: agent.role || 'agent',
      performance: agent.performance || {},
      needsAttention: (attentionByAgent.get(agent.id || agent.email || agent.displayName)?.reasons || []).length > 0,
      statusKey: agent.statusMeta?.key || getAgentStatus(agent),
      statusLabel: agent.statusMeta?.label || getAgentStatus(agent),
      statusClassName: agent.statusMeta?.className || '',
      agent,
    })),
    sortBy,
  )

  return {
    principalId,
    organisationId: selectedOrganisationId,
    kpis: {
      totalAgents,
      activeToday,
      pipelineValue,
      totalPipelineValue: pipelineValue,
      transactions: transactionsCount,
      activeTransactions: transactionsCount,
      conversionRate,
      averageConversionRate: conversionRate,
      avgDaysToRegistration,
      agentsNeedingAttention: attentionAgents.length,
      commissionMtd,
    },
    branchPerformance,
    topPerformers,
    attentionAgents,
    agentsTable,
    analytics: model.charts,
    filterOptions: {
      branches: model.filters.branchOptions,
      dateRanges: AGENT_DATE_RANGE_OPTIONS,
      leaderboardMetrics: PRINCIPAL_AGENT_RANKING_METRICS,
    },
  }
}

function getAgentIdentityKeys(agent = {}) {
  return [
    agent.id,
    agent.userId,
    agent.organisationUserId,
    agent.email,
    agent.name,
    agent.fullName,
    agent.displayName,
    [agent.firstName || agent.first_name, agent.lastName || agent.last_name].filter(Boolean).join(' '),
    agent?.profile?.full_name,
    agent?.userMetadata?.full_name,
    agent?.user_metadata?.full_name,
  ].map(normalizeKey).filter(Boolean)
}

function rowBelongsToAgent(agent = {}, row = {}) {
  const keys = getAgentIdentityKeys(agent)
  if (!keys.length) return false
  const candidates = [
    row.id,
    row.userId,
    row.user_id,
    row.agentId,
    row.agent_id,
    row.assignedAgentId,
    row.assigned_agent_id,
    row.assignedUserId,
    row.assigned_user_id,
    row.createdBy,
    row.created_by,
    row.email,
    row.agentEmail,
    row.agent_email,
    row.assignedAgentEmail,
    row.assigned_agent_email,
    row.name,
    row.agentName,
    row.agent_name,
    row.assignedAgentName,
    row.assigned_agent_name,
    row.assignedAgent,
    row.assigned_agent,
    row?.commission?.agent_id,
    row?.transaction?.assigned_agent_id,
    row?.transaction?.assigned_agent_email,
    row?.transaction?.assigned_agent,
  ].map(normalizeKey).filter(Boolean)
  return candidates.some((candidate) => keys.includes(candidate))
}

function startOfDay(value = new Date()) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 0, 0, 0, 0)
}

function endOfDay(value = new Date()) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 23, 59, 59, 999)
}

function addDays(value = new Date(), days = 0) {
  const next = new Date(value)
  next.setDate(next.getDate() + days)
  return next
}

function isWithinWindow(value, start, end) {
  const date = parseDate(value)
  if (!date || !start || !end) return false
  return date >= start && date <= end
}

function isSameDay(value, target = new Date()) {
  const date = parseDate(value)
  if (!date) return false
  return (
    date.getFullYear() === target.getFullYear() &&
    date.getMonth() === target.getMonth() &&
    date.getDate() === target.getDate()
  )
}

function getTaskDueDate(row = {}) {
  return row.dueDate || row.due_date || row.followUpDate || row.nextFollowUpDate || row.follow_up_date || row.next_follow_up_date
}

function isTaskCompleted(row = {}) {
  return normalizeKey(row.status).includes('complete')
}

function getTaskTimestamp(row = {}) {
  return row.completedAt || row.completed_at || row.updatedAt || row.updated_at || row.createdAt || row.created_at || getTaskDueDate(row)
}

function getAppointmentDateTime(row = {}) {
  return row.dateTime || row.date_time || row.appointmentDate || row.appointment_date || row.updatedAt || row.updated_at || row.createdAt || row.created_at
}

function getAppointmentTypeText(row = {}) {
  return normalizeText(row.appointmentType || row.appointment_type || row.customTypeLabel || row.custom_type_label || row.title || 'Appointment')
}

function getAppointmentStatusText(row = {}) {
  return normalizeText(row.status || 'scheduled')
}

function getAppointmentStatusLabel(row = {}) {
  return getAppointmentStatusText(row)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function isAppointmentCancelled(row = {}) {
  const status = normalizeKey(getAppointmentStatusText(row))
  return ['cancelled', 'declined', 'no_show', 'canceled'].some((signal) => status.includes(signal))
}

function classifyAppointmentBucket(row = {}) {
  const signal = normalizeKey([getAppointmentTypeText(row), row.title, row.notes, row.location].filter(Boolean).join(' '))
  if (signal.includes('valuation')) return 'valuations'
  if (signal.includes('presentation') || signal.includes('mandate')) return 'listingPresentations'
  if (signal.includes('follow') || signal.includes('call')) return 'followUpCalls'
  if (signal.includes('viewing') || signal.includes('showing')) return 'viewings'
  return 'other'
}

function getAppointmentTitle(row = {}) {
  const title = normalizeText(row.title)
  if (title) return title
  const typeLabel = getAppointmentTypeText(row)
  return typeLabel || 'Appointment'
}

function getAppointmentRelatedLabel(row = {}) {
  if (normalizeText(row.leadId || row.lead_id)) return 'Lead linked'
  if (normalizeText(row.transactionId || row.transaction_id)) return 'Transaction linked'
  if (normalizeText(row.listingId || row.listing_id)) return 'Listing linked'
  if (normalizeText(row.relatedEntityType || row.related_entity_type)) {
    return `${normalizeText(row.relatedEntityType || row.related_entity_type)} linked`
  }
  return ''
}

function summarizeAppointment(row = {}) {
  return {
    id: normalizeText(row.appointmentId || row.id),
    title: getAppointmentTitle(row),
    type: getAppointmentTypeText(row),
    bucket: classifyAppointmentBucket(row),
    status: normalizeKey(getAppointmentStatusText(row)),
    statusLabel: getAppointmentStatusLabel(row),
    dateTime: getAppointmentDateTime(row),
    location: normalizeText(row.location || row.location_address || row.locationAddress),
    meetingUrl: normalizeText(row.meetingUrl || row.meeting_url),
    relatedLabel: getAppointmentRelatedLabel(row),
  }
}

function getTransactionStageSignal(row = {}) {
  return normalizeKey([
    row.stage,
    row.status,
    row.currentMainStage,
    row.current_main_stage,
    row?.transaction?.stage,
    row?.transaction?.status,
    row?.transaction?.current_main_stage,
    row?.transaction?.current_sub_stage,
    row?.transaction?.lifecycle_state,
  ].filter(Boolean).join(' '))
}

function getTransactionTimestamp(row = {}) {
  return row?.transaction?.registered_at ||
    row?.transaction?.registration_date ||
    row?.transaction?.completed_at ||
    row?.transaction?.updated_at ||
    row?.transaction?.created_at ||
    row?.updatedAt ||
    row?.updated_at ||
    row?.createdAt ||
    row?.created_at
}

function isClosedTransaction(row = {}) {
  const stage = getTransactionStageSignal(row)
  return Boolean(
    stage.includes('registered') ||
      stage.includes('closed') ||
      row?.transaction?.registered_at ||
      row?.transaction?.registration_date ||
      row?.transaction?.completed_at,
  )
}

function isCancelledTransaction(row = {}) {
  const stage = getTransactionStageSignal(row)
  return ['cancel', 'lost', 'archived', 'deleted'].some((signal) => stage.includes(signal))
}

function isActiveTransaction(row = {}) {
  return !isClosedTransaction(row) && !isCancelledTransaction(row)
}

function isOpenLead(row = {}) {
  const signal = normalizeKey(`${row.stage || ''} ${row.status || ''}`)
  return !['converted', 'registered', 'closed', 'lost', 'cancelled', 'canceled', 'archived', 'deleted'].some((blocked) => signal.includes(blocked))
}

function getLeadTimestamp(row = {}) {
  return row.createdAt || row.created_at || row.updatedAt || row.updated_at
}

function getLeadStageSignal(row = {}) {
  return normalizeKey(`${row.stage || ''} ${row.status || ''} ${row.outcome || ''} ${row.nextAction || ''} ${row.next_action || ''}`)
}

function isMandateWonLead(row = {}) {
  const signal = getLeadStageSignal(row)
  return ['mandate signed', 'converted to listing', 'listing created', 'listing active'].some((candidate) => signal.includes(candidate))
}

function getRegisteredTransactionValue(row = {}) {
  return toNumber(
    row?.transaction?.purchase_price ||
      row?.transaction?.sales_price ||
      row?.transaction?.cash_amount ||
      row?.purchase_price ||
      row?.sales_price ||
      row?.cash_amount ||
      row?.purchasePrice ||
      row?.salesPrice ||
      row?.unit?.price,
  )
}

function buildListingStatusSummary(listings = []) {
  const rows = [
    { label: 'Active', tone: 'bg-[#16894f]' },
    { label: 'Under Offer', tone: 'bg-[#1769d1]' },
    { label: 'Sold', tone: 'bg-[#f2b72f]' },
    { label: 'Withdrawn', tone: 'bg-[#aeb9c6]' },
  ]
  return rows.map((row) => {
    const count = listings.filter((listing) => {
      const status = normalizeKey(listing?.status || listing?.listingStatus || listing?.listing_status)
      if (row.label === 'Active') return !status || status === 'active' || status === 'listed'
      if (row.label === 'Under Offer') return status.includes('offer')
      if (row.label === 'Sold') return status.includes('sold') || status.includes('registered')
      return status.includes('withdraw') || status.includes('inactive')
    }).length
    return { ...row, count }
  })
}

function buildDealStageSummary(agent = {}, activeDeals = [], completedDeals = []) {
  const sourceDeals = Array.isArray(agent?.deals) ? agent.deals : []
  return [
    { label: 'Lead', count: Array.isArray(agent?.pipelineRows) ? agent.pipelineRows.length : 0 },
    {
      label: 'OTP',
      count: sourceDeals.filter((row) => {
        const signal = getTransactionStageSignal(row)
        return signal.includes('otp') || signal.includes('offer') || signal.includes('agreement')
      }).length,
    },
    {
      label: 'Finance',
      count: activeDeals.filter((row) => {
        const signal = getTransactionStageSignal(row)
        return signal.includes('finance') || signal.includes('bond')
      }).length,
    },
    {
      label: 'Transfer',
      count: activeDeals.filter((row) => {
        const signal = getTransactionStageSignal(row)
        return signal.includes('transfer') || signal.includes('convey') || signal.includes('lodg')
      }).length,
    },
    { label: 'Registration', count: completedDeals.length },
  ]
}

export function getPrincipalAgentDetailCommandCentre({
  agent = null,
  branches = [],
  leads = [],
  transactions = [],
  listings = [],
  appointments = [],
  tasks = [],
  activities = [],
  canvassingProspects = [],
  canvassingActivities = [],
  now = new Date(),
} = {}) {
  if (!agent) {
    return null
  }

  const performanceModel = buildAgentPerformanceModel({
    agents: [agent],
    branches,
    leads,
    transactions,
    listings,
    appointments,
    tasks,
    activities: [...activities, ...canvassingActivities],
    filters: {
      branchId: 'all',
      office: 'all',
      role: 'all',
      status: 'all',
      search: '',
      dateRange: 'month_to_date',
    },
    now,
  })
  const performanceAgent = performanceModel.agents[0] || { ...agent, performance: {} }
  const performance = performanceAgent.performance || {}
  const monthRange = resolveAgentDateRange('month_to_date', now)
  const todayStart = startOfDay(now)
  const todayEnd = endOfDay(now)
  const nextWeekEnd = endOfDay(addDays(now, 6))
  const joinedAt = agent.activatedAt || agent.acceptedAt || agent.invitedAt || agent.createdAt || agent.created_at || null
  const branchName = getBranchName(branches, agent.branchId, agent.office || agent.branchName || agent.organisationName)

  const agentProspects = canvassingProspects.filter((row) => rowBelongsToAgent(agent, row))
  const agentCanvassingActivities = canvassingActivities.filter((row) => rowBelongsToAgent(agent, row))
  const agentAppointments = appointments
    .filter((row) => rowBelongsToAgent(agent, row))
    .sort((left, right) => (parseDate(getAppointmentDateTime(left))?.getTime() || 0) - (parseDate(getAppointmentDateTime(right))?.getTime() || 0))
  const agentTasks = tasks.filter((row) => rowBelongsToAgent(agent, row))
  const agentLeads = leads.filter((row) => rowBelongsToAgent(agent, row))
  const agentListings = listings.filter((row) => rowBelongsToAgent(agent, row))
  const agentTransactions = transactions.filter((row) => rowBelongsToAgent(agent, row))
  const activeDeals = agentTransactions.filter((row) => isActiveTransaction(row))
  const completedDeals = agentTransactions.filter((row) => isClosedTransaction(row))

  const prospectsAdded = agentProspects.filter((row) => isWithinWindow(row.createdAt || row.created_at, monthRange.start, monthRange.end)).length
  const callsLogged = agentCanvassingActivities.filter((row) => {
    const signal = normalizeKey(`${row.activityType || ''} ${row.outcome || ''} ${row.activityNote || ''}`)
    return isWithinWindow(row.activityDate || row.activity_date || row.createdAt || row.created_at, monthRange.start, monthRange.end) &&
      (signal.includes('call') || signal.includes('phone'))
  }).length
  const valuationsBooked = agentAppointments.filter((row) => {
    return !isAppointmentCancelled(row) &&
      classifyAppointmentBucket(row) === 'valuations' &&
      isWithinWindow(getAppointmentDateTime(row), monthRange.start, monthRange.end)
  }).length
  const valuationsCompleted = agentAppointments.filter((row) => {
    return normalizeKey(getAppointmentStatusText(row)).includes('completed') &&
      classifyAppointmentBucket(row) === 'valuations' &&
      isWithinWindow(getAppointmentDateTime(row), monthRange.start, monthRange.end)
  }).length
  const mandatesWon = Math.max(
    agentLeads.filter((row) => isMandateWonLead(row) && isWithinWindow(getLeadTimestamp(row), monthRange.start, monthRange.end)).length,
    agentListings.filter((row) => isWithinWindow(row.createdAt || row.created_at || row.updatedAt || row.updated_at, monthRange.start, monthRange.end)).length,
  )

  const dueFollowUps = agentTasks.filter((row) => !isTaskCompleted(row) && parseDate(getTaskDueDate(row)) && parseDate(getTaskDueDate(row)) >= todayStart).length
  const overdueTasks = agentTasks.filter((row) => !isTaskCompleted(row) && parseDate(getTaskDueDate(row)) && parseDate(getTaskDueDate(row)) < todayStart).length
  const dueToday = agentTasks.filter((row) => !isTaskCompleted(row) && isSameDay(getTaskDueDate(row), now)).length
  const taskWindowRows = agentTasks.filter((row) => isWithinWindow(getTaskTimestamp(row), monthRange.start, monthRange.end))
  const taskCompletionDenominator = taskWindowRows.length
  const completedTasks = taskWindowRows.filter((row) => isTaskCompleted(row)).length
  const tasksCompletedPercent = taskCompletionDenominator ? Math.round((completedTasks / taskCompletionDenominator) * 100) : null

  const activeTransactionCount = activeDeals.length || toNumber(performance.activeTransactionCount || performance.activeTransactions)
  const atRiskDeals = activeDeals.filter((row) => {
    const updatedAt = parseDate(getTransactionTimestamp(row))
    if (!updatedAt) return false
    return ((now.getTime() - updatedAt.getTime()) / 86400000) > 14
  }).length

  const todaySchedule = agentAppointments
    .filter((row) => !isAppointmentCancelled(row) && isWithinWindow(getAppointmentDateTime(row), todayStart, todayEnd))
    .map(summarizeAppointment)
  const upcomingWindow = agentAppointments
    .filter((row) => !isAppointmentCancelled(row) && isWithinWindow(getAppointmentDateTime(row), todayStart, nextWeekEnd))
    .map(summarizeAppointment)
  const upcomingAppointments = agentAppointments
    .filter((row) => !isAppointmentCancelled(row) && parseDate(getAppointmentDateTime(row)) && parseDate(getAppointmentDateTime(row)) >= todayStart)
    .map(summarizeAppointment)
  const pastAppointments = agentAppointments
    .filter((row) => parseDate(getAppointmentDateTime(row)) && parseDate(getAppointmentDateTime(row)) < todayStart)
    .map(summarizeAppointment)
    .sort((left, right) => (parseDate(right.dateTime)?.getTime() || 0) - (parseDate(left.dateTime)?.getTime() || 0))

  const nextSevenDayCounts = ['viewings', 'valuations', 'listingPresentations', 'followUpCalls'].map((key) => ({
    key,
    label: key === 'viewings'
      ? 'Viewings'
      : key === 'valuations'
        ? 'Valuations'
        : key === 'listingPresentations'
          ? 'Listing Presentations'
          : 'Follow-up Calls',
    count: upcomingWindow.filter((row) => row.bucket === key).length,
  }))

  const registeredThisMonthRows = agentTransactions.filter((row) => isClosedTransaction(row) && isWithinWindow(getTransactionTimestamp(row), monthRange.start, monthRange.end))
  const registeredThisMonthValue = registeredThisMonthRows.reduce((sum, row) => sum + getRegisteredTransactionValue(row), 0)
  const commissionGenerated = performance.commissionMtd !== null && performance.commissionMtd !== undefined
    ? toNumber(performance.commissionMtd)
    : registeredThisMonthValue * 0.03
  const registrationDayValues = Array.isArray(performance.registrationDays)
    ? performance.registrationDays.filter((value) => Number.isFinite(Number(value)) && Number(value) >= 0)
    : []
  const avgDaysToRegistration = registrationDayValues.length
    ? Math.round(registrationDayValues.reduce((sum, value) => sum + Number(value), 0) / registrationDayValues.length)
    : null

  return {
    agentIdentity: {
      branchName,
      joinedAt,
      lastActivityAt: performance.lastActivityAt || agent.lastActiveAt || null,
    },
    headerActionsPermissions: {
      canMessage: Boolean(normalizeText(agent.email)),
      canViewCalendar: true,
      canAssignDeal: true,
      canAssignListing: true,
    },
    prospectingActivity: {
      metrics: [
        { key: 'prospectsAdded', label: 'Prospects Added', value: prospectsAdded },
        { key: 'callsLogged', label: 'Calls Logged', value: callsLogged },
        { key: 'followUpsDue', label: 'Follow Ups Due', value: dueFollowUps },
        { key: 'valuationsBooked', label: 'Valuations Booked', value: valuationsBooked },
        { key: 'mandatesWon', label: 'Mandates Won', value: mandatesWon },
      ],
      hasActivity: prospectsAdded + callsLogged + dueFollowUps + valuationsBooked + mandatesWon > 0,
      funnel: null,
    },
    pipelineHealth: {
      stages: [
        { key: 'lead', label: 'Lead', count: agentLeads.filter((row) => isOpenLead(row)).length },
        { key: 'otp', label: 'OTP', count: toNumber(performance.stageCounts?.otp) },
        { key: 'finance', label: 'Finance', count: toNumber(performance.stageCounts?.finance) },
        { key: 'transfer', label: 'Transfer', count: toNumber(performance.stageCounts?.transfer) },
        { key: 'registration', label: 'Registration', count: toNumber(performance.stageCounts?.registration) },
        { key: 'closed', label: 'Closed', count: completedDeals.length },
      ],
      pipelineValue: toNumber(performance.pipelineValue),
      activeDeals: activeTransactionCount,
      atRiskDeals,
      avgDaysToRegistration,
      hasPipeline: toNumber(performance.pipelineValue) > 0 || activeTransactionCount > 0 || agentLeads.length > 0,
    },
    calendarSummary: {
      todayItems: todaySchedule,
      nextSevenDaysItems: upcomingWindow,
      upcomingItems: upcomingAppointments,
      pastItems: pastAppointments,
      nextSevenDayCounts,
      hasAppointments: upcomingAppointments.length > 0 || pastAppointments.length > 0,
    },
    followUpCompliance: {
      tasksCompletedPercent,
      overdueTasks,
      averageResponseTimeLabel: performance.responseTimeLabel || 'N/A',
      dueToday,
      hasSignals: tasksCompletedPercent !== null || overdueTasks > 0 || dueToday > 0,
    },
    monthlyPerformance: {
      metrics: [
        { key: 'dealsRegistered', label: 'Deals Registered', value: registeredThisMonthRows.length },
        { key: 'dealsClosed', label: 'Deals Closed', value: registeredThisMonthRows.length },
        { key: 'mandatesWon', label: 'Mandates Won', value: mandatesWon },
        { key: 'valuationsCompleted', label: 'Valuations Completed', value: valuationsCompleted },
        { key: 'salesValue', label: 'Sales Value', value: registeredThisMonthValue, format: 'currency' },
        { key: 'commissionGenerated', label: 'Commission Generated', value: commissionGenerated, format: 'currency' },
        { key: 'pipelineValue', label: 'Pipeline Value', value: toNumber(performance.pipelineValue), format: 'currency' },
        { key: 'conversionRate', label: 'Conversion Rate', value: toNumber(performance.conversionRate), format: 'percent' },
        { key: 'avgDaysToRegistration', label: 'Avg. Days to Register', value: avgDaysToRegistration, format: 'days' },
      ],
    },
    existingCharts: {
      dealStages: buildDealStageSummary(agent, activeDeals, completedDeals),
      listingStatuses: buildListingStatusSummary(agentListings),
      financialRows: [
        ['Sales Value', registeredThisMonthValue],
        ['Commission Generated', commissionGenerated],
        ['Projected Commission', toNumber(performance.pipelineValue) ? toNumber(performance.pipelineValue) * 0.03 : 0],
        ['Average Response Time', performance.responseTimeLabel || 'N/A'],
      ],
    },
  }
}
