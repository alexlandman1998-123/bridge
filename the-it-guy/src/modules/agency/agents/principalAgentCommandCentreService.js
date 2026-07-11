import { AGENT_DATE_RANGE_OPTIONS, buildAgentPerformanceModel, resolveAgentDateRange } from './agentPerformanceUtils.js'

const ACTIVE_STATUS_VALUES = new Set(['active', 'accepted', 'onboarding_started'])
const INACTIVE_STATUS_SIGNALS = ['inactive', 'disabled', 'revoked', 'expired', 'deleted', 'archived']
const RESPONSE_TIME_THRESHOLD_HOURS = 24
const QA_SEVERITY_RANK = { High: 3, Medium: 2, Low: 1 }
const QA_SEVERITY_WEIGHT = { High: 18, Medium: 10, Low: 5 }

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
  canvassingProspects = [],
  canvassingActivities = [],
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
    activities: [...activities, ...canvassingActivities],
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
  const qaReviewByAgent = new Map()
  modelAgents.forEach((agent) => {
    qaReviewByAgent.set(agent.id || agent.email || agent.displayName, buildAgentQaReview({
      agent,
      leads,
      tasks,
      appointments,
      activities,
      canvassingProspects,
      canvassingActivities,
      now,
    }))
  })
  const qaReviewRows = modelAgents
    .map((agent) => {
      const id = agent.id || agent.email || agent.displayName
      const review = qaReviewByAgent.get(id)
      return {
        id,
        name: agent.displayName || getAgentName(agent),
        initials: agent.initials || getAgentInitials(agent),
        avatarUrl: getAgentAvatarUrl(agent),
        branchName: agent.branchName,
        review,
        agent,
      }
    })
    .filter((row) => row.review)
  const qaScoreValues = qaReviewRows
    .map((row) => row.review?.score)
    .filter((value) => value !== null && value !== undefined && Number.isFinite(Number(value)))
  const operationalQaScore = qaScoreValues.length
    ? Math.round(qaScoreValues.reduce((sum, value) => sum + Number(value), 0) / qaScoreValues.length)
    : null
  const qaIssueCount = qaReviewRows.reduce((sum, row) => sum + toNumber(row.review?.issueCount), 0)
  const highRiskQaItems = qaReviewRows.reduce((sum, row) => sum + toNumber(row.review?.highRiskCount), 0)
  const qaActionQueue = qaReviewRows
    .flatMap((row) => (row.review?.actionPlan?.items || []).map((item) => ({
      ...item,
      agentId: row.id,
      agentName: row.name,
      branchName: row.branchName,
      agent: row.agent,
    })))
    .sort((left, right) => {
      return (
        (QA_SEVERITY_RANK[right.severity] || 0) - (QA_SEVERITY_RANK[left.severity] || 0) ||
        (parseDate(left.dueAt)?.getTime() || 0) - (parseDate(right.dueAt)?.getTime() || 0) ||
        String(left.agentName || '').localeCompare(String(right.agentName || ''))
      )
    })
  const qaActionsDueSoon = qaActionQueue.filter((item) => {
    const dueAt = parseDate(item.dueAt)
    return dueAt && dueAt <= endOfDay(addDays(now, 2))
  }).length
  const qaActionDueBuckets = qaActionQueue.reduce((buckets, item) => {
    const dueAt = parseDate(item.dueAt)
    if (!dueAt) {
      buckets.unscheduled += 1
      return buckets
    }
    if (dueAt < startOfDay(now)) {
      buckets.overdue += 1
    } else if (dueAt <= endOfDay(now)) {
      buckets.today += 1
    } else if (dueAt <= endOfDay(addDays(now, 6))) {
      buckets.next7Days += 1
    } else {
      buckets.later += 1
    }
    return buckets
  }, { overdue: 0, today: 0, next7Days: 0, later: 0, unscheduled: 0 })
  const qaActionSeverity = qaActionQueue.reduce((counts, item) => {
    const severity = item.severity || 'Low'
    counts[severity] = toNumber(counts[severity]) + 1
    return counts
  }, { High: 0, Medium: 0, Low: 0 })
  const qaReviewStatusCounts = qaReviewRows.reduce((counts, row) => {
    const statusKey = row.review?.status || 'not_applicable'
    counts[statusKey] = toNumber(counts[statusKey]) + 1
    return counts
  }, { attention: 0, watch: 0, healthy: 0, not_applicable: 0 })

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
    const agentKey = agent.id || agent.email || agent.displayName
    const attention = attentionByAgent.get(agentKey)
    const qaReview = qaReviewByAgent.get(agentKey)
    branch.activeAgents += getAgentStatus(agent) === 'active' ? 1 : 0
    branch.pipelineValue += toNumber(agent.performance?.pipelineValue)
    branch.transactions += toNumber(agent.performance?.activeTransactionCount || agent.performance?.activeTransactions || agent.performance?.deals)
    branch.conversionTotal += toNumber(agent.performance?.conversionRate)
    branch.conversionCount += 1
    branch.attentionCount += (attention?.reasons?.length || qaReview?.status === 'attention') ? 1 : 0
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
      const agentKey = agent.id || agent.email || agent.displayName
      const attention = attentionByAgent.get(agentKey) || buildAttentionReasons(agent, now)
      const qaReview = qaReviewByAgent.get(agentKey)
      const qaReasons = qaReview?.status === 'attention' ? ['QA exceptions'] : []
      const reasons = [...new Set([...attention.reasons, ...qaReasons])]
      const severity = qaReview?.status === 'attention' && (QA_SEVERITY_RANK[attention.severity] || 0) < QA_SEVERITY_RANK.High
        ? 'High'
        : attention.severity
      return {
        id: agentKey,
        name: agent.displayName || getAgentName(agent),
        initials: agent.initials || getAgentInitials(agent),
        avatarUrl: getAgentAvatarUrl(agent),
        role: agent.role || 'agent',
        branchName: agent.branchName,
        reasons,
        primaryReason: reasons[0] || 'Watch only',
        severity,
        suggestedAction: qaReview?.status === 'attention' ? qaReview.recommendedAction : attention.suggestedAction,
        overdueFollowUps: toNumber(agent.performance?.overdueFollowUps),
        qaReview,
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
      needsAttention: (attentionByAgent.get(agent.id || agent.email || agent.displayName)?.reasons || []).length > 0 || qaReviewByAgent.get(agent.id || agent.email || agent.displayName)?.status === 'attention',
      qaReview: qaReviewByAgent.get(agent.id || agent.email || agent.displayName) || null,
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
      operationalQaScore,
      qaIssueCount,
      highRiskQaItems,
      qaActionItems: qaActionQueue.length,
      qaActionsDueSoon,
    },
    qaSummary: {
      score: operationalQaScore,
      issueCount: qaIssueCount,
      highRiskCount: highRiskQaItems,
      actionItemCount: qaActionQueue.length,
      actionsDueSoon: qaActionsDueSoon,
      actionQueue: qaActionQueue.slice(0, 8),
      governance: {
        dueBuckets: qaActionDueBuckets,
        severity: qaActionSeverity,
        statusCounts: qaReviewStatusCounts,
        reviewedAgentCount: qaReviewRows.filter((row) => row.review?.status && row.review.status !== 'not_applicable').length,
        lowestScore: qaScoreValues.length ? Math.min(...qaScoreValues.map(Number)) : null,
        highestScore: qaScoreValues.length ? Math.max(...qaScoreValues.map(Number)) : null,
      },
      rows: qaReviewRows
        .filter((row) => row.review?.issueCount || row.review?.status === 'attention' || row.review?.status === 'watch')
        .sort((left, right) => {
          const leftReview = left.review || {}
          const rightReview = right.review || {}
          return (
            (QA_SEVERITY_RANK[rightReview.highestSeverity] || 0) - (QA_SEVERITY_RANK[leftReview.highestSeverity] || 0) ||
            toNumber(rightReview.issueCount) - toNumber(leftReview.issueCount) ||
            toNumber(leftReview.score) - toNumber(rightReview.score)
          )
        })
        .slice(0, 6),
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

function getRecordId(row = {}, keys = []) {
  for (const key of keys) {
    const value = row?.[key]
    if (normalizeText(value)) return normalizeKey(value)
  }
  return ''
}

function getLeadRecordId(row = {}) {
  return getRecordId(row, ['leadId', 'lead_id', 'pipelineLeadId', 'pipeline_lead_id', 'id'])
}

function getAppointmentLeadId(row = {}) {
  return getRecordId(row, ['leadId', 'lead_id', 'pipelineLeadId', 'pipeline_lead_id', 'relatedLeadId', 'related_lead_id'])
}

function getTaskLeadId(row = {}) {
  return getRecordId(row, ['leadId', 'lead_id', 'pipelineLeadId', 'pipeline_lead_id', 'relatedLeadId', 'related_lead_id'])
}

function getActivityLeadId(row = {}) {
  return getRecordId(row, ['leadId', 'lead_id', 'pipelineLeadId', 'pipeline_lead_id', 'relatedLeadId', 'related_lead_id'])
}

function hasAppointmentOperationalLink(row = {}) {
  return Boolean(
    getAppointmentLeadId(row) ||
      getRecordId(row, [
        'transactionId',
        'transaction_id',
        'listingId',
        'listing_id',
        'prospectId',
        'prospect_id',
        'contactId',
        'contact_id',
        'relatedEntityId',
        'related_entity_id',
        'relatedId',
        'related_id',
      ]) ||
      normalizeText(row.relatedEntityType || row.related_entity_type),
  )
}

function isClosedProspect(row = {}) {
  const signal = normalizeKey([
    row.status,
    row.stage,
    row.lastContactOutcome,
    row.last_contact_outcome,
    row.followUpStatus,
    row.follow_up_status,
  ].filter(Boolean).join(' '))
  return ['converted', 'mandate', 'lost', 'archived', 'deleted', 'not interested', 'do not contact'].some((candidate) => signal.includes(candidate))
}

function getLatestTimestamp(rows = [], getter = (row) => row) {
  const timestamps = rows
    .map((row) => parseDate(getter(row))?.getTime())
    .filter((value) => Number.isFinite(value))
  if (!timestamps.length) return null
  return new Date(Math.max(...timestamps)).toISOString()
}

function summarizeQaRecord(row = {}, { title = () => 'Record', subtitle = () => '', timestamp = () => null, type = 'record' } = {}) {
  return {
    id: normalizeText(row.id || row.leadId || row.lead_id || row.taskId || row.task_id || row.prospectId || row.prospect_id || `${type}-${title(row)}`),
    title: normalizeText(title(row)) || 'Record',
    subtitle: normalizeText(subtitle(row)),
    timestamp: timestamp(row),
    type,
  }
}

function buildQaIssue({ key, title, description, severity = 'Medium', count = 1, action = '', records = [] } = {}) {
  return {
    key,
    title,
    description,
    severity,
    count,
    action,
    records: records.slice(0, 3),
  }
}

function getQaIssueDueDate(issue = {}, now = new Date()) {
  const dueDays = issue.severity === 'High' ? 1 : issue.severity === 'Medium' ? 3 : 7
  return endOfDay(addDays(startOfDay(now), dueDays)).toISOString()
}

function buildAgentQaActionPlan({ agent = {}, issues = [], status = 'healthy', now = new Date() } = {}) {
  const agentId = normalizeText(agent.id || agent.userId || agent.organisationUserId || agent.email || getAgentName(agent))
  const ownerName = getAgentName(agent)
  const sortedIssues = [...issues].sort((left, right) => {
    return (QA_SEVERITY_RANK[right.severity] || 0) - (QA_SEVERITY_RANK[left.severity] || 0) || String(left.title || '').localeCompare(String(right.title || ''))
  })
  const items = sortedIssues.map((issue) => ({
    id: `${agentId || ownerName}-${issue.key}`,
    issueKey: issue.key,
    title: issue.title,
    description: issue.description,
    action: issue.action,
    severity: issue.severity,
    priority: issue.severity === 'High' ? 'Urgent' : issue.severity === 'Medium' ? 'Standard' : 'Monitor',
    status: 'open',
    dueAt: getQaIssueDueDate(issue, now),
    ownerId: agentId,
    ownerName,
    sourceCount: issue.count,
    records: issue.records || [],
  }))
  const nextReviewAt = items[0]?.dueAt || endOfDay(addDays(startOfDay(now), 7)).toISOString()

  return {
    items,
    openCount: items.length,
    urgentCount: items.filter((item) => item.severity === 'High').length,
    nextReviewAt,
    cadence: status === 'attention' ? 'Daily until cleared' : status === 'watch' ? 'Twice weekly' : 'Weekly',
    completionTarget: status === 'attention' ? '24 hours' : status === 'watch' ? '3 days' : '7 days',
  }
}

function buildAgentQaReview({
  agent = {},
  leads = [],
  tasks = [],
  appointments = [],
  activities = [],
  canvassingProspects = [],
  canvassingActivities = [],
  now = new Date(),
} = {}) {
  const agentStatus = getAgentStatus(agent)
  if (agentStatus === 'pending_invite' || agentStatus === 'inactive') {
    return {
      score: null,
      status: 'not_applicable',
      statusLabel: 'Not active',
      issueCount: 0,
      highRiskCount: 0,
      highestSeverity: 'Low',
      issues: [],
      recommendedAction: 'Activate the agent before reviewing operational QA',
      actionPlan: buildAgentQaActionPlan({ agent, issues: [], status: 'not_applicable', now }),
      metrics: {},
      trackingCoverage: {},
    }
  }

  const todayStart = startOfDay(now)
  const agentLeads = leads.filter((row) => rowBelongsToAgent(agent, row))
  const agentTasks = tasks.filter((row) => rowBelongsToAgent(agent, row))
  const agentAppointments = appointments.filter((row) => rowBelongsToAgent(agent, row))
  const agentActivities = activities.filter((row) => rowBelongsToAgent(agent, row))
  const agentProspects = canvassingProspects.filter((row) => rowBelongsToAgent(agent, row))
  const agentCanvassingActivities = canvassingActivities.filter((row) => rowBelongsToAgent(agent, row))
  const allActivities = [...agentActivities, ...agentCanvassingActivities]
  const openLeadRows = agentLeads.filter(isOpenLead)
  const openTaskRows = agentTasks.filter((row) => !isTaskCompleted(row))
  const overdueTaskRows = openTaskRows.filter((row) => {
    const dueDate = parseDate(getTaskDueDate(row))
    return dueDate && dueDate < todayStart
  })
  const overdueProspectRows = agentProspects.filter((row) => {
    const dueDate = parseDate(getProspectFollowUpDate(row))
    return dueDate && dueDate < todayStart && !isClosedProspect(row)
  })
  const staleLeadRows = openLeadRows.filter((row) => daysSince(getLeadTimestamp(row), now) > 7)
  const activityLeadIds = new Set(agentActivities.map(getActivityLeadId).filter(Boolean))
  const taskLeadIds = new Set(agentTasks.map(getTaskLeadId).filter(Boolean))
  const appointmentLeadIds = new Set(agentAppointments.map(getAppointmentLeadId).filter(Boolean))
  const plannedLeadIds = new Set([...activityLeadIds, ...taskLeadIds, ...appointmentLeadIds])
  const unworkedLeadRows = openLeadRows.filter((row) => {
    const leadId = getLeadRecordId(row)
    return daysSince(getLeadTimestamp(row), now) >= 2 && (!leadId || !plannedLeadIds.has(leadId))
  })
  const upcomingAppointmentRows = agentAppointments.filter((row) => {
    const dateTime = parseDate(getAppointmentDateTime(row))
    return dateTime && dateTime >= todayStart && !isAppointmentCancelled(row)
  })
  const unlinkedAppointmentRows = upcomingAppointmentRows.filter((row) => !hasAppointmentOperationalLink(row))
  const prospectsWithoutNextStep = agentProspects.filter((row) =>
    !isClosedProspect(row) &&
      !parseDate(getProspectFollowUpDate(row)) &&
      daysSince(getProspectTimestamp(row), now) >= 2
  )
  const recentActivityAt = getLatestTimestamp([
    ...allActivities,
    ...agentTasks,
    ...agentAppointments,
    ...agentProspects,
    agent,
  ], (row) => {
    if (row === agent) return row.lastActiveAt || row.activatedAt || row.createdAt || row.created_at
    return getActivityDate(row) || getTaskTimestamp(row) || getAppointmentDateTime(row) || getProspectTimestamp(row)
  })
  const sourceRecordCount = agentLeads.length + agentTasks.length + agentAppointments.length + allActivities.length + agentProspects.length
  const issues = []

  if (overdueTaskRows.length + overdueProspectRows.length > 0) {
    issues.push(buildQaIssue({
      key: 'overdue-follow-ups',
      title: 'Overdue follow-ups',
      description: 'Open CRM tasks or canvassing follow-ups are past their due date.',
      severity: 'High',
      count: overdueTaskRows.length + overdueProspectRows.length,
      action: 'Clear overdue follow-ups or reschedule them with a current next step.',
      records: [
        ...overdueTaskRows.map((row) => summarizeQaRecord(row, {
          title: getTaskTitle,
          subtitle: getTaskSubtitle,
          timestamp: getTaskDueDate,
          type: 'task',
        })),
        ...overdueProspectRows.map((row) => summarizeQaRecord(row, {
          title: getProspectTitle,
          subtitle: getProspectSubtitle,
          timestamp: getProspectFollowUpDate,
          type: 'prospect',
        })),
      ],
    }))
  }

  if (staleLeadRows.length > 0) {
    issues.push(buildQaIssue({
      key: 'stale-leads',
      title: 'Stale open leads',
      description: 'Open leads have not moved or been updated in more than 7 days.',
      severity: staleLeadRows.length > 3 ? 'High' : 'Medium',
      count: staleLeadRows.length,
      action: 'Review stale leads and log a call, follow-up, appointment, or loss reason.',
      records: staleLeadRows.map((row) => summarizeQaRecord(row, {
        title: getLeadTitle,
        subtitle: getLeadSubtitle,
        timestamp: getLeadTimestamp,
        type: 'lead',
      })),
    }))
  }

  if (unworkedLeadRows.length > 0) {
    issues.push(buildQaIssue({
      key: 'unworked-leads',
      title: 'Leads without tracked action',
      description: 'Assigned open leads have no linked activity, follow-up task, or appointment.',
      severity: 'Medium',
      count: unworkedLeadRows.length,
      action: 'Add a tracked next action to each open lead.',
      records: unworkedLeadRows.map((row) => summarizeQaRecord(row, {
        title: getLeadTitle,
        subtitle: getLeadSubtitle,
        timestamp: getLeadTimestamp,
        type: 'lead',
      })),
    }))
  }

  if (prospectsWithoutNextStep.length > 0) {
    issues.push(buildQaIssue({
      key: 'prospects-without-next-step',
      title: 'Prospects without next step',
      description: 'Active canvassing prospects are missing a next follow-up date.',
      severity: 'Medium',
      count: prospectsWithoutNextStep.length,
      action: 'Set a follow-up date or close the prospect with an outcome.',
      records: prospectsWithoutNextStep.map((row) => summarizeQaRecord(row, {
        title: getProspectTitle,
        subtitle: getProspectSubtitle,
        timestamp: getProspectTimestamp,
        type: 'prospect',
      })),
    }))
  }

  if (unlinkedAppointmentRows.length > 0) {
    issues.push(buildQaIssue({
      key: 'unlinked-appointments',
      title: 'Appointments without linked target',
      description: 'Upcoming appointments are not linked to a lead, listing, transaction, contact, or canvassing prospect.',
      severity: 'Medium',
      count: unlinkedAppointmentRows.length,
      action: 'Link appointments to the relevant record so they count in the correct pipeline.',
      records: unlinkedAppointmentRows.map((row) => summarizeQaRecord(row, {
        title: getAppointmentTitle,
        subtitle: (appointment) => getAppointmentTypeText(appointment),
        timestamp: getAppointmentDateTime,
        type: 'appointment',
      })),
    }))
  }

  if (sourceRecordCount === 0) {
    issues.push(buildQaIssue({
      key: 'no-monitoring-inputs',
      title: 'No tracking inputs',
      description: 'No leads, appointments, follow-ups, activity, or canvassing prospects are currently assigned.',
      severity: 'Low',
      count: 1,
      action: 'Assign live work or confirm this agent is intentionally idle.',
    }))
  } else if (daysSince(recentActivityAt, now) > 7) {
    issues.push(buildQaIssue({
      key: 'no-recent-activity',
      title: 'No recent tracked activity',
      description: 'The agent has tracked work, but no recent operational activity in the last 7 days.',
      severity: 'High',
      count: 1,
      action: 'Book a check-in and capture the next action for active records.',
    }))
  }

  const penalty = issues.reduce((sum, issue) => {
    const countPenalty = Math.min(12, Math.max(0, toNumber(issue.count) - 1) * 2)
    return sum + (QA_SEVERITY_WEIGHT[issue.severity] || 8) + countPenalty
  }, 0)
  const score = Math.max(0, 100 - penalty)
  const highestSeverity = issues.reduce((current, issue) => {
    return (QA_SEVERITY_RANK[issue.severity] || 0) > (QA_SEVERITY_RANK[current] || 0) ? issue.severity : current
  }, 'Low')
  const highRiskCount = issues.filter((issue) => issue.severity === 'High').length
  const status = highRiskCount || score < 70 ? 'attention' : issues.length ? 'watch' : 'healthy'
  const actionPlan = buildAgentQaActionPlan({ agent, issues, status, now })

  return {
    score,
    status,
    statusLabel: status === 'attention' ? 'Needs QA review' : status === 'watch' ? 'Watch' : 'Healthy',
    issueCount: issues.length,
    highRiskCount,
    highestSeverity,
    issues,
    recommendedAction: issues.find((issue) => issue.severity === 'High')?.action || issues[0]?.action || 'Tracking is complete for current records',
    actionPlan,
    metrics: {
      openLeads: openLeadRows.length,
      staleLeads: staleLeadRows.length,
      unworkedLeads: unworkedLeadRows.length,
      overdueFollowUps: overdueTaskRows.length + overdueProspectRows.length,
      prospectsWithoutNextStep: prospectsWithoutNextStep.length,
      unlinkedAppointments: unlinkedAppointmentRows.length,
      recentActivityAt,
    },
    trackingCoverage: {
      leads: agentLeads.length,
      tasks: agentTasks.length,
      appointments: agentAppointments.length,
      crmActivities: agentActivities.length,
      canvassingProspects: agentProspects.length,
      canvassingActivities: agentCanvassingActivities.length,
    },
  }
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

function isMandateWonProspect(row = {}) {
  const signal = normalizeKey([
    row.status,
    row.lastContactOutcome,
    row.last_contact_outcome,
    row.followUpNote,
    row.follow_up_note,
    row.notes,
  ].filter(Boolean).join(' '))
  return ['mandate signed', 'mandate won', 'converted to listing', 'listing created', 'listing active'].some((candidate) => signal.includes(candidate))
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

function getActivityDate(row = {}) {
  return row.activityDate || row.activity_date || row.updatedAt || row.updated_at || row.createdAt || row.created_at
}

function isCallActivity(row = {}) {
  const signal = normalizeKey(`${row.activityType || row.activity_type || ''} ${row.outcome || ''} ${row.activityNote || row.activity_note || ''}`)
  return signal.includes('call') || signal.includes('phone')
}

function getActivityTitle(row = {}) {
  return normalizeText(row.activityType || row.activity_type || row.outcome) || 'Activity'
}

function getActivitySubtitle(row = {}) {
  return normalizeText(row.activityNote || row.activity_note || row.outcome || row.prospectName || row.prospect_name || row.leadName || row.lead_name) || 'Prospecting activity'
}

function getTaskTitle(row = {}) {
  return normalizeText(row.title || row.name || row.subject || row.description) || 'Follow-up'
}

function getTaskSubtitle(row = {}) {
  return normalizeText(row.leadName || row.lead_name || row.relatedLabel || row.entityLabel || row.description) || 'Linked lead or client'
}

function getTaskStatusLabel(row = {}, now = new Date()) {
  if (isTaskCompleted(row)) return 'Completed'
  const dueDate = parseDate(getTaskDueDate(row))
  if (!dueDate) return 'No due date'
  if (dueDate < startOfDay(now)) return 'Overdue'
  if (isSameDay(dueDate, now)) return 'Due today'
  return 'Upcoming'
}

function getLeadTitle(row = {}) {
  return normalizeText(row.name || row.fullName || row.full_name || row.clientName || row.client_name || row.buyerName || row.sellerName || row.email) || 'Lead'
}

function getLeadSubtitle(row = {}) {
  return normalizeText(row.propertyAddress || row.property_address || row.listingTitle || row.listing_title || row.propertyTitle || row.property_title || row.stage || row.status) || 'Lead record'
}

function getProspectTitle(row = {}) {
  return normalizeText(
    row.name ||
      row.fullName ||
      row.full_name ||
      [row.firstName || row.first_name, row.lastName || row.last_name].filter(Boolean).join(' ') ||
      row.email ||
      row.phone,
  ) || 'Canvassing prospect'
}

function getProspectSubtitle(row = {}) {
  return normalizeText(
    row.formattedAddress ||
      row.formatted_address ||
      row.streetAddress ||
      row.street_address ||
      row.areaSuburb ||
      row.area_suburb ||
      row.area ||
      row.prospectType ||
      row.prospect_type,
  ) || 'Canvassing prospect'
}

function getProspectFollowUpDate(row = {}) {
  return row.nextFollowUpDate || row.next_follow_up_date
}

function getProspectTimestamp(row = {}) {
  return row.updatedAt || row.updated_at || row.convertedAt || row.converted_at || row.createdAt || row.created_at
}

function getListingTitle(row = {}) {
  return normalizeText(row.title || row.listingTitle || row.listing_title || row.address || row.formattedAddress || row.formatted_address || row.suburb) || 'Listing'
}

function getListingSubtitle(row = {}) {
  return normalizeText(row.mandateStatus || row.mandate_status || row.mandateType || row.mandate_type || row.status) || 'Listing record'
}

function summarizeDetailRow({
  id,
  title,
  subtitle = '',
  status = '',
  timestamp = null,
  meta = '',
  type = 'activity',
} = {}) {
  return {
    id: normalizeText(id || `${type}-${title}-${timestamp}`),
    title: normalizeText(title) || 'Activity',
    subtitle: normalizeText(subtitle),
    status: normalizeText(status),
    timestamp,
    meta: normalizeText(meta),
    type,
  }
}

function sortDetailRows(rows = []) {
  return rows
    .filter((row) => row?.id)
    .sort((left, right) => (parseDate(right.timestamp)?.getTime() || 0) - (parseDate(left.timestamp)?.getTime() || 0))
}

function summarizeActivity(row = {}, type = 'activity') {
  return summarizeDetailRow({
    id: row.activityId || row.activity_id || row.id,
    title: getActivityTitle(row),
    subtitle: getActivitySubtitle(row),
    status: row.outcome || '',
    timestamp: getActivityDate(row),
    meta: row.prospectId || row.prospect_id ? 'Canvassing' : 'CRM',
    type,
  })
}

function summarizeTask(row = {}, now = new Date()) {
  return summarizeDetailRow({
    id: row.taskId || row.task_id || row.id,
    title: getTaskTitle(row),
    subtitle: getTaskSubtitle(row),
    status: getTaskStatusLabel(row, now),
    timestamp: getTaskDueDate(row) || getTaskTimestamp(row),
    meta: row.priority || row.taskPriority || row.task_priority || '',
    type: 'follow_up',
  })
}

function summarizeProspectFollowUp(row = {}, now = new Date()) {
  return summarizeDetailRow({
    id: `prospect-follow-up-${row.id || row.prospectId || row.prospect_id || getProspectTitle(row)}`,
    title: getProspectTitle(row),
    subtitle: getProspectSubtitle(row),
    status: getTaskStatusLabel({ dueDate: getProspectFollowUpDate(row), status: row.followUpStatus || row.follow_up_status || 'Pending' }, now),
    timestamp: getProspectFollowUpDate(row),
    meta: row.followUpPriority || row.follow_up_priority || 'Canvassing',
    type: 'follow_up',
  })
}

function summarizeLeadMandate(row = {}) {
  return summarizeDetailRow({
    id: `lead-${row.leadId || row.lead_id || row.id || getLeadTitle(row)}`,
    title: getLeadTitle(row),
    subtitle: getLeadSubtitle(row),
    status: row.stage || row.status || 'Mandate signal',
    timestamp: getLeadTimestamp(row),
    meta: 'Lead',
    type: 'mandate',
  })
}

function summarizeProspectMandate(row = {}) {
  return summarizeDetailRow({
    id: `prospect-${row.id || row.prospectId || row.prospect_id || getProspectTitle(row)}`,
    title: getProspectTitle(row),
    subtitle: getProspectSubtitle(row),
    status: row.status || row.lastContactOutcome || row.last_contact_outcome || 'Mandate signal',
    timestamp: getProspectTimestamp(row),
    meta: 'Canvassing',
    type: 'mandate',
  })
}

function summarizeListingMandate(row = {}) {
  return summarizeDetailRow({
    id: `listing-${row.id || row.listingId || row.listing_id || getListingTitle(row)}`,
    title: getListingTitle(row),
    subtitle: getListingSubtitle(row),
    status: row.status || row.listingStatus || row.listing_status || 'Listing created',
    timestamp: row.createdAt || row.created_at || row.updatedAt || row.updated_at,
    meta: 'Listing',
    type: 'mandate',
  })
}

function buildRecentActivityRows({
  calls = [],
  followUps = [],
  valuations = [],
  mandates = [],
  appointments = [],
  transactions = [],
  listings = [],
} = {}) {
  const transactionRows = transactions.map((row) => summarizeDetailRow({
    id: `transaction-${row?.transaction?.id || row.id || getTransactionTimestamp(row)}`,
    title: isClosedTransaction(row) ? 'Registered deal' : 'Updated transaction',
    subtitle: normalizeText(row?.development?.name || row?.buyer?.name || row?.seller?.name || 'Transaction workspace'),
    status: row?.transaction?.status || row.status || '',
    timestamp: getTransactionTimestamp(row),
    meta: 'Transaction',
    type: 'transaction',
  }))

  const listingRows = listings.map((row) => summarizeDetailRow({
    id: `listing-activity-${row.id || row.listingId || row.listing_id || getListingTitle(row)}`,
    title: 'Listing activity',
    subtitle: getListingTitle(row),
    status: row.status || row.listingStatus || row.listing_status || '',
    timestamp: row.updatedAt || row.updated_at || row.createdAt || row.created_at,
    meta: 'Listing',
    type: 'listing',
  }))

  const valuationIds = new Set(valuations.map((row) => row.id).filter(Boolean))
  const nonValuationAppointments = appointments.filter((row) => !valuationIds.has(row.id))

  return sortDetailRows([
    ...calls.map((row) => ({ ...row, title: row.title || 'Logged call' })),
    ...followUps.map((row) => ({ ...row, title: row.title || 'Follow-up' })),
    ...valuations.map((row) => ({ ...row, title: row.title || 'Valuation appointment' })),
    ...mandates.map((row) => ({ ...row, title: row.title || 'Mandate signal' })),
    ...nonValuationAppointments.map((row) => ({ ...row, title: row.title || 'Appointment' })),
    ...transactionRows,
    ...listingRows,
  ]).slice(0, 10)
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
  const agentActivities = activities.filter((row) => rowBelongsToAgent(agent, row))
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
  const qaReview = buildAgentQaReview({
    agent,
    leads,
    tasks,
    appointments,
    activities,
    canvassingProspects,
    canvassingActivities,
    now,
  })

  const prospectsAdded = agentProspects.filter((row) => isWithinWindow(row.createdAt || row.created_at, monthRange.start, monthRange.end)).length
  const callActivityRows = [...agentActivities, ...agentCanvassingActivities].filter(isCallActivity)
  const monthlyCallRows = sortDetailRows(callActivityRows
    .filter((row) => isWithinWindow(getActivityDate(row), monthRange.start, monthRange.end))
    .map((row) => summarizeActivity(row, 'call')))
  const callsLogged = monthlyCallRows.length
  const valuationAppointmentRows = agentAppointments.filter((row) => {
    return !isAppointmentCancelled(row) &&
      classifyAppointmentBucket(row) === 'valuations' &&
      isWithinWindow(getAppointmentDateTime(row), monthRange.start, monthRange.end)
  })
  const valuationRows = sortDetailRows(valuationAppointmentRows.map(summarizeAppointment).map((row) => summarizeDetailRow({
    id: row.id,
    title: row.title,
    subtitle: row.location || row.relatedLabel || row.type,
    status: row.statusLabel,
    timestamp: row.dateTime,
    meta: row.type,
    type: 'valuation',
  })))
  const valuationsBooked = valuationRows.length
  const valuationsCompleted = valuationAppointmentRows.filter((row) => {
    return normalizeKey(getAppointmentStatusText(row)).includes('completed') &&
      classifyAppointmentBucket(row) === 'valuations'
  }).length
  const mandateLeadRows = agentLeads.filter((row) => isMandateWonLead(row) && isWithinWindow(getLeadTimestamp(row), monthRange.start, monthRange.end))
  const mandateProspectRows = agentProspects.filter((row) => isMandateWonProspect(row) && isWithinWindow(getProspectTimestamp(row), monthRange.start, monthRange.end))
  const mandateListingRows = agentListings.filter((row) => isWithinWindow(row.createdAt || row.created_at || row.updatedAt || row.updated_at, monthRange.start, monthRange.end))
  const mandateRows = sortDetailRows([
    ...mandateLeadRows.map(summarizeLeadMandate),
    ...mandateProspectRows.map(summarizeProspectMandate),
    ...mandateListingRows.map(summarizeListingMandate),
  ])
  const mandatesWon = Math.max(
    mandateLeadRows.length + mandateProspectRows.length,
    mandateListingRows.length,
  )

  const prospectFollowUpRows = agentProspects.filter((row) => parseDate(getProspectFollowUpDate(row)))
  const dueProspectFollowUps = prospectFollowUpRows.filter((row) => parseDate(getProspectFollowUpDate(row)) >= todayStart).length
  const dueFollowUps = agentTasks.filter((row) => !isTaskCompleted(row) && parseDate(getTaskDueDate(row)) && parseDate(getTaskDueDate(row)) >= todayStart).length + dueProspectFollowUps
  const overdueTasks = agentTasks.filter((row) => !isTaskCompleted(row) && parseDate(getTaskDueDate(row)) && parseDate(getTaskDueDate(row)) < todayStart).length
  const dueToday = agentTasks.filter((row) => !isTaskCompleted(row) && isSameDay(getTaskDueDate(row), now)).length
  const taskWindowRows = agentTasks.filter((row) => isWithinWindow(getTaskTimestamp(row), monthRange.start, monthRange.end))
  const taskCompletionDenominator = taskWindowRows.length
  const completedTasks = taskWindowRows.filter((row) => isTaskCompleted(row)).length
  const tasksCompletedPercent = taskCompletionDenominator ? Math.round((completedTasks / taskCompletionDenominator) * 100) : null
  const followUpRows = sortDetailRows([
    ...agentTasks
      .filter((row) => !isTaskCompleted(row))
      .map((row) => summarizeTask(row, now)),
    ...prospectFollowUpRows.map((row) => summarizeProspectFollowUp(row, now)),
  ])

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
  const appointmentRows = sortDetailRows(upcomingAppointments.map((row) => summarizeDetailRow({
    id: row.id,
    title: row.title,
    subtitle: row.location || row.relatedLabel || row.type,
    status: row.statusLabel,
    timestamp: row.dateTime,
    meta: row.type,
    type: 'appointment',
  })))
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
      drilldowns: {
        calls: {
          label: 'Calls',
          rows: monthlyCallRows,
        },
        followUps: {
          label: 'Follow-ups',
          rows: followUpRows,
        },
        valuations: {
          label: 'Valuations',
          rows: valuationRows,
        },
        mandates: {
          label: 'Mandates',
          rows: mandateRows,
        },
        appointments: {
          label: 'Appointments',
          rows: appointmentRows,
        },
      },
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
    recentActivity: {
      items: buildRecentActivityRows({
        calls: monthlyCallRows,
        followUps: followUpRows,
        valuations: valuationRows,
        mandates: mandateRows,
        appointments: appointmentRows,
        transactions: agentTransactions,
        listings: agentListings,
      }),
    },
    qaReview,
  }
}
