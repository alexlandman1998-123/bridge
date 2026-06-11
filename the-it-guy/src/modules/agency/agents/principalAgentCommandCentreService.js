import { AGENT_DATE_RANGE_OPTIONS, buildAgentPerformanceModel } from './agentPerformanceUtils.js'

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

function buildAttentionReasons(agent = {}, teamAverageConversion = 0, now = new Date()) {
  const performance = agent.performance || {}
  const reasons = []
  if (daysSince(performance.lastActivityAt, now) > 7) reasons.push('No activity in 7 days')
  if (toNumber(performance.overdueFollowUps) > 0) reasons.push('Overdue follow-ups')
  if (Number.isFinite(Number(performance.responseTimeHours)) && Number(performance.responseTimeHours) > RESPONSE_TIME_THRESHOLD_HOURS) reasons.push('Slow response time')
  if (toNumber(performance.activityVolume) <= 0 && toNumber(performance.pipelineValue) > 0) reasons.push('No pipeline movement')
  if (teamAverageConversion > 0 && toNumber(performance.conversionRate) < teamAverageConversion * 0.6) reasons.push('Low conversion')

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
  const transactionsCount = modelAgents.reduce((sum, agent) => sum + toNumber(agent.performance?.activeTransactions || agent.performance?.deals), 0)
  const conversionRate = totalAgents ? Math.round(modelAgents.reduce((sum, agent) => sum + toNumber(agent.performance?.conversionRate), 0) / totalAgents) : 0
  const commissionMtdValues = modelAgents
    .map((agent) => agent.performance?.commissionMtd)
    .filter((value) => value !== null && value !== undefined && Number.isFinite(Number(value)))
  const commissionMtd = commissionMtdValues.length ? commissionMtdValues.reduce((sum, value) => sum + toNumber(value), 0) : null

  const teamAverageConversion = totalAgents ? modelAgents.reduce((sum, agent) => sum + toNumber(agent.performance?.conversionRate), 0) / totalAgents : 0
  const attentionByAgent = new Map()
  modelAgents.forEach((agent) => attentionByAgent.set(agent.id || agent.email || agent.displayName, buildAttentionReasons(agent, teamAverageConversion, now)))

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
    branch.transactions += toNumber(agent.performance?.activeTransactions || agent.performance?.deals)
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
      const attention = attentionByAgent.get(agent.id || agent.email || agent.displayName) || buildAttentionReasons(agent, teamAverageConversion, now)
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
