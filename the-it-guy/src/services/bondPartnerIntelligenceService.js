import {
  ALL_BOND_ORGANISATION_SCOPE,
  BOND_ORGANISATION_LEVELS,
  resolveBondOrganisationScope,
} from './bondOrganisationScopeResolver'
import {
  BOND_PARTNER_REQUEST_STATUSES,
  BOND_PARTNER_REQUEST_TYPES,
  calculatePartnerSLA,
  getPartnerInbox,
  getPartnerRequests,
} from './bondPartnerCollaborationService'
import { getPartnerPortalOperationalRows } from './bondPartnerPortalService'

export const BOND_PARTNER_INTELLIGENCE_EVENTS = Object.freeze({
  partnerHealthUpdated: 'PARTNER_HEALTH_UPDATED',
  slaMetricRecorded: 'SLA_METRIC_RECORDED',
  partnerSatisfactionUpdated: 'PARTNER_SATISFACTION_UPDATED',
  partnerReportGenerated: 'PARTNER_REPORT_GENERATED',
  partnerFlaggedAtRisk: 'PARTNER_FLAGGED_AT_RISK',
})

export const PARTNER_HEALTH_STATUSES = Object.freeze({
  critical: 'Critical',
  atRisk: 'At Risk',
  healthy: 'Healthy',
  excellent: 'Excellent',
})

export const PARTNER_SATISFACTION_STATUSES = Object.freeze({
  verySatisfied: 'Very Satisfied',
  satisfied: 'Satisfied',
  neutral: 'Neutral',
  unhappy: 'Unhappy',
  atRisk: 'At Risk',
})

const LOCAL_ACTIVITY_STORE = new Map()
let localSequence = 0

const RESOLVED_STATUSES = new Set([BOND_PARTNER_REQUEST_STATUSES.resolved, BOND_PARTNER_REQUEST_STATUSES.closed])
const APPROVAL_TERMS = ['approved', 'approval', 'grant', 'registered', 'accepted']
const DECLINE_TERMS = ['declined', 'rejected', 'lost']
const SUBMITTED_TERMS = ['submitted', 'bank', 'feedback', 'quote', 'approved', 'declined', 'registered']
const PERIOD_DAYS = Object.freeze({
  '30d': 30,
  '90d': 90,
  '180d': 180,
  '12m': 365,
})

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase()
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : []
}

function createId(prefix = 'partner-intelligence') {
  localSequence += 1
  return `${prefix}-${Date.now().toString(36)}-${localSequence}`
}

function getWorkspaceKey(context = {}, options = {}) {
  return normalizeText(
    options.workspaceId ||
      context.workspaceId ||
      context.currentWorkspace?.id ||
      context.workspace?.id ||
      context.currentMembership?.workspaceId ||
      context.currentMembership?.organisation_id ||
      context.currentMembership?.organisationId ||
      'default',
  )
}

function getLocalRows(store, workspaceKey = '') {
  return [...(store.get(workspaceKey) || [])]
}

function setLocalRows(store, workspaceKey = '', rows = []) {
  store.set(workspaceKey, rows)
}

function getActorId(context = {}) {
  return normalizeText(context.userId || context.user?.id || context.profile?.id || context.currentMembership?.userId || context.currentMembership?.user_id)
}

function recordActivity(workspaceKey = '', event = {}) {
  const row = {
    id: event.id || createId('partner-intelligence-activity'),
    eventType: normalizeText(event.eventType),
    partnerId: normalizeText(event.partnerId),
    applicationId: normalizeText(event.applicationId),
    actorUserId: normalizeText(event.actorUserId),
    newValue: event.newValue || null,
    createdAt: event.createdAt || new Date().toISOString(),
  }
  setLocalRows(LOCAL_ACTIVITY_STORE, workspaceKey, [row, ...getLocalRows(LOCAL_ACTIVITY_STORE, workspaceKey)])
  return row
}

function percent(part = 0, total = 0) {
  return total ? Math.round((Number(part || 0) / Number(total || 0)) * 100) : 0
}

function clamp(value = 0, min = 0, max = 100) {
  return Math.min(max, Math.max(min, Math.round(Number(value || 0))))
}

function average(values = []) {
  const safe = values.map(Number).filter((value) => Number.isFinite(value))
  if (!safe.length) return 0
  return Math.round((safe.reduce((sum, value) => sum + value, 0) / safe.length) * 10) / 10
}

function hoursBetween(start = '', end = '') {
  const startDate = new Date(start || '')
  const endDate = new Date(end || '')
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return 0
  return Math.max(0, Math.round(((endDate.getTime() - startDate.getTime()) / (60 * 60 * 1000)) * 10) / 10)
}

function daysBetween(start = '', end = '') {
  const startDate = new Date(start || '')
  const endDate = new Date(end || '')
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return 0
  return Math.max(0, Math.round((endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000)))
}

function dateValue(row = {}) {
  return normalizeText(row.resolvedAt || row.resolved_at || row.updatedAt || row.updated_at || row.submittedAt || row.submitted_at || row.createdAt || row.created_at)
}

function isWithinDays(row = {}, days = 30, now = new Date()) {
  const value = new Date(dateValue(row))
  if (Number.isNaN(value.getTime())) return true
  return value.getTime() >= now.getTime() - Number(days || 0) * 24 * 60 * 60 * 1000
}

function getSignal(row = {}) {
  return normalizeLower(`${row.status || ''} ${row.stage || ''} ${row.financeStatus || ''} ${row.finance_status || ''} ${row.financeStageKey || ''} ${row.finance_stage_key || ''} ${row.financeStageLabel || ''} ${row.registrationStatus || ''}`)
}

function isApprovedApplication(row = {}) {
  const signal = getSignal(row)
  return APPROVAL_TERMS.some((term) => signal.includes(term))
}

function isDeclinedApplication(row = {}) {
  const signal = getSignal(row)
  return DECLINE_TERMS.some((term) => signal.includes(term))
}

function isSubmittedApplication(row = {}) {
  const signal = getSignal(row)
  return SUBMITTED_TERMS.some((term) => signal.includes(term))
}

function getApplicationId(row = {}) {
  return normalizeText(row.id || row.applicationId || row.application_id || row.transactionId || row.transaction_id || row.key)
}

function getApplicationPartnerId(row = {}) {
  return normalizeText(row.partnerId || row.partner_id || row.bondPartnerId || row.bond_partner_id || row.agencyId || row.agency_id || row.developmentId || row.development_id || row.referralPartnerId || row.referral_partner_id)
}

function getApplicationPartnerName(row = {}) {
  return normalizeText(row.partnerName || row.partner_name || row.agencyName || row.agency_name || row.developmentName || row.development_name || row.referralPartnerName || row.referral_partner_name)
}

function getApplicationRegionId(row = {}) {
  return normalizeText(row.assignedRegionId || row.assigned_region_id || row.regionId || row.region_id || row.bond_region_id)
}

function getApplicationBranchId(row = {}) {
  return normalizeText(row.assignedBranchId || row.assigned_branch_id || row.branchId || row.branch_id || row.workspaceUnitId || row.workspace_unit_id || row.bond_workspace_unit_id)
}

function getApplicationConsultantId(row = {}) {
  return normalizeText(row.assignedConsultantId || row.assigned_consultant_id || row.assignedUserId || row.assigned_user_id || row.primaryBondConsultantUserId || row.primary_bond_consultant_user_id || row.ownerUserId || row.owner_user_id)
}

function getPartnerId(row = {}) {
  return normalizeText(row.id || row.partnerId || row.partner_id)
}

function getPartnerName(row = {}) {
  return normalizeText(row.name || row.partnerName || row.partner_name) || 'Partner'
}

function getBranchId(row = {}) {
  return normalizeText(row.id || row.branchId || row.branch_id || row.workspaceUnitId || row.workspace_unit_id)
}

function getBranchName(row = {}) {
  return normalizeText(row.name || row.branchName || row.branch_name || row.label || getBranchId(row)) || 'Branch'
}

function getBranchRegionId(row = {}) {
  return normalizeText(row.regionId || row.region_id)
}

function getRegionId(row = {}) {
  return normalizeText(row.id || row.regionId || row.region_id)
}

function getRegionName(row = {}) {
  return normalizeText(row.name || row.regionName || row.region_name || row.label || getRegionId(row)) || 'Region'
}

function getConsultantId(row = {}) {
  return normalizeText(row.id || row.userId || row.user_id || row.consultantId || row.consultant_id)
}

function getConsultantName(row = {}) {
  return normalizeText(row.name || row.fullName || row.full_name || [row.firstName || row.first_name, row.lastName || row.last_name].map(normalizeText).filter(Boolean).join(' ') || row.email || getConsultantId(row)) || 'Consultant'
}

function valueInScope(value = '', scopedIds) {
  if (scopedIds === ALL_BOND_ORGANISATION_SCOPE) return true
  return normalizeArray(scopedIds).includes(normalizeText(value))
}

function getRows(context = {}, options = {}) {
  const workspaceKey = getWorkspaceKey(context, options)
  const operationalRows = getPartnerPortalOperationalRows(context, { ...options, workspaceId: workspaceKey })
  const inbox = getPartnerInbox(context, { ...options, workspaceId: workspaceKey })
  const scope = inbox.scope || resolveBondOrganisationScope(context, {
    regions: operationalRows.regions || options.regions || [],
    branches: operationalRows.branches || operationalRows.units || options.branches || options.units || [],
    consultants: operationalRows.consultants || operationalRows.users || options.consultants || options.users || [],
    applications: operationalRows.applications || [],
  })
  const partners = operationalRows.partners || []
  const applications = normalizeArray(operationalRows.applications).filter((row) => isApplicationVisible(row, scope))
  return {
    workspaceKey,
    scope,
    partners,
    applications,
    requests: getPartnerRequests(context, { ...options, workspaceId: workspaceKey }),
    documents: normalizeArray(operationalRows.documents).filter((row) => isApplicationIdVisible(row.applicationId || row.application_id, applications)),
    documentRequests: normalizeArray(operationalRows.documentRequests).filter((row) => isApplicationIdVisible(row.applicationId || row.application_id, applications)),
    comments: normalizeArray(operationalRows.comments).filter((row) => isApplicationIdVisible(row.applicationId || row.application_id, applications)),
    supportTickets: normalizeArray(operationalRows.supportTickets).filter((row) => isApplicationIdVisible(row.applicationId || row.application_id, applications)),
    regions: normalizeArray(options.regions || operationalRows.regions).filter((row) => isRegionVisible(row, scope)),
    branches: normalizeArray(options.branches || options.units || operationalRows.branches || operationalRows.units).filter((row) => isBranchVisible(row, scope)),
    consultants: normalizeArray(options.consultants || options.users || operationalRows.consultants || operationalRows.users).filter((row) => isConsultantVisible(row, scope)),
  }
}

function isApplicationVisible(application = {}, scope = {}) {
  if (scope.scopeLevel === BOND_ORGANISATION_LEVELS.hq) return true
  if (scope.scopeLevel === BOND_ORGANISATION_LEVELS.region) return valueInScope(getApplicationRegionId(application), scope.regionIds)
  if (scope.scopeLevel === BOND_ORGANISATION_LEVELS.branch) return valueInScope(getApplicationBranchId(application), scope.branchIds)
  return normalizeText(getApplicationConsultantId(application)) === normalizeText(scope.userId) || valueInScope(getApplicationConsultantId(application), scope.consultantIds)
}

function isRegionVisible(region = {}, scope = {}) {
  if (scope.scopeLevel === BOND_ORGANISATION_LEVELS.hq) return true
  return valueInScope(getRegionId(region), scope.regionIds)
}

function isBranchVisible(branch = {}, scope = {}) {
  if (scope.scopeLevel === BOND_ORGANISATION_LEVELS.hq) return true
  if (scope.scopeLevel === BOND_ORGANISATION_LEVELS.region) return valueInScope(getBranchRegionId(branch), scope.regionIds) || valueInScope(getBranchId(branch), scope.branchIds)
  if (scope.scopeLevel === BOND_ORGANISATION_LEVELS.branch) return valueInScope(getBranchId(branch), scope.branchIds)
  return false
}

function isConsultantVisible(consultant = {}, scope = {}) {
  if (scope.scopeLevel === BOND_ORGANISATION_LEVELS.hq) return true
  if (scope.scopeLevel === BOND_ORGANISATION_LEVELS.region) return valueInScope(consultant.regionId || consultant.region_id, scope.regionIds) || valueInScope(consultant.branchId || consultant.branch_id || consultant.workspaceUnitId || consultant.workspace_unit_id, scope.branchIds) || valueInScope(getConsultantId(consultant), scope.consultantIds)
  if (scope.scopeLevel === BOND_ORGANISATION_LEVELS.branch) return valueInScope(consultant.branchId || consultant.branch_id || consultant.workspaceUnitId || consultant.workspace_unit_id, scope.branchIds) || valueInScope(getConsultantId(consultant), scope.consultantIds)
  return valueInScope(getConsultantId(consultant), scope.consultantIds)
}

function isApplicationIdVisible(applicationId = '', applications = []) {
  const safeId = normalizeText(applicationId)
  if (!safeId) return true
  return applications.some((row) => getApplicationId(row) === safeId)
}

function groupBy(rows = [], resolver = () => '') {
  const grouped = new Map()
  rows.forEach((row) => {
    const key = normalizeText(resolver(row)) || 'unassigned'
    grouped.set(key, [...(grouped.get(key) || []), row])
  })
  return grouped
}

function getResolvedAt(row = {}) {
  return normalizeText(row.resolvedAt || row.resolved_at)
}

function getFirstResponseAt(row = {}) {
  return normalizeText(row.firstResponseAt || row.first_response_at || row.repliedAt || row.replied_at || row.assignedAt || row.assigned_at)
}

function requestIsResolved(row = {}) {
  return RESOLVED_STATUSES.has(normalizeLower(row.status))
}

function requestIsBreached(row = {}, now = new Date()) {
  const sla = row.sla || calculatePartnerSLA(row, now)
  if (sla.breached || row.escalated || normalizeLower(row.priority) === 'urgent') return true
  const resolvedAt = getResolvedAt(row)
  const dueAt = normalizeText(row.dueAt || row.due_at)
  if (!resolvedAt || !dueAt) return false
  return new Date(resolvedAt).getTime() > new Date(dueAt).getTime()
}

function requestWasResolvedWithinSla(row = {}) {
  if (!requestIsResolved(row)) return false
  const resolvedAt = getResolvedAt(row)
  const dueAt = normalizeText(row.dueAt || row.due_at)
  if (!resolvedAt || !dueAt) return true
  return new Date(resolvedAt).getTime() <= new Date(dueAt).getTime()
}

function getTrend(current = 0, previous = 0, inverse = false) {
  const delta = Math.round((Number(current || 0) - Number(previous || 0)) * 10) / 10
  if (Math.abs(delta) < 1) return { direction: 'Stable', delta: 0 }
  const improving = inverse ? delta < 0 : delta > 0
  return { direction: improving ? 'Improving' : 'Declining', delta }
}

function getHealthStatus(score = 0) {
  if (score <= 39) return PARTNER_HEALTH_STATUSES.critical
  if (score <= 59) return PARTNER_HEALTH_STATUSES.atRisk
  if (score <= 79) return PARTNER_HEALTH_STATUSES.healthy
  return PARTNER_HEALTH_STATUSES.excellent
}

function getSatisfactionStatus(score = 0) {
  if (score >= 85) return PARTNER_SATISFACTION_STATUSES.verySatisfied
  if (score >= 70) return PARTNER_SATISFACTION_STATUSES.satisfied
  if (score >= 55) return PARTNER_SATISFACTION_STATUSES.neutral
  if (score >= 40) return PARTNER_SATISFACTION_STATUSES.unhappy
  return PARTNER_SATISFACTION_STATUSES.atRisk
}

function calculateDocumentCompletionRate({ requests = [], documents = [], documentRequests = [], applications = [] } = {}) {
  const reviewRequests = requests.filter((row) => row.requestType === BOND_PARTNER_REQUEST_TYPES.documentReview)
  if (reviewRequests.length) {
    return percent(reviewRequests.filter(requestIsResolved).length, reviewRequests.length)
  }
  const totalDocumentRequests = documentRequests.length + documents.length
  if (totalDocumentRequests) {
    const completedRequests = documentRequests.filter((row) => ['accepted', 'approved', 'complete', 'completed', 'uploaded', 'resolved'].some((term) => getSignal(row).includes(term))).length
    const completedDocuments = documents.filter((row) => !['rejected', 'replacement', 'missing'].some((term) => getSignal(row).includes(term))).length
    return percent(completedRequests + completedDocuments, totalDocumentRequests)
  }
  const missingDocuments = applications.reduce((sum, row) => sum + Number(row.missingDocumentsCount || row.missing_documents_count || 0), 0)
  return applications.length ? clamp(100 - missingDocuments * 15) : 100
}

function calculateApplicationConversionRate(applications = []) {
  const submitted = applications.filter((row) => isSubmittedApplication(row) || isApprovedApplication(row) || isDeclinedApplication(row))
  const approved = applications.filter(isApprovedApplication)
  return percent(approved.length, submitted.length || applications.length)
}

function buildHealthComponents({ requests = [], applications = [], documents = [], documentRequests = [] } = {}) {
  const totalRequests = requests.length
  const resolved = requests.filter(requestIsResolved).length
  const escalations = requests.filter((row) => row.escalated || normalizeLower(row.priority) === 'urgent' || row.requestType === BOND_PARTNER_REQUEST_TYPES.escalation).length
  const supportRequests = requests.filter((row) => row.requestType === BOND_PARTNER_REQUEST_TYPES.supportTicket).length
  const responsiveness = totalRequests ? percent(resolved, totalRequests) : 90
  const slaCompliance = totalRequests ? percent(requests.filter(requestWasResolvedWithinSla).length + requests.filter((row) => !requestIsResolved(row) && !requestIsBreached(row)).length, totalRequests) : 95
  const documentCompletionRate = calculateDocumentCompletionRate({ requests, applications, documents, documentRequests })
  const supportVolume = clamp(100 - Math.max(0, supportRequests - Math.max(1, applications.length)) * 12 - supportRequests * 4)
  const escalationRate = totalRequests ? clamp(100 - percent(escalations, totalRequests)) : 100
  const applicationConversionRate = calculateApplicationConversionRate(applications)
  return {
    responsiveness,
    slaCompliance,
    documentCompletionRate,
    supportVolume,
    escalationRate,
    applicationConversionRate,
  }
}

export function calculatePartnerHealth(input = {}) {
  const components = buildHealthComponents(input)
  const score = clamp(
    components.responsiveness * 0.18 +
      components.slaCompliance * 0.22 +
      components.documentCompletionRate * 0.18 +
      components.supportVolume * 0.12 +
      components.escalationRate * 0.15 +
      components.applicationConversionRate * 0.15,
  )
  const previousScore = Number(input.previousScore ?? input.previous_score ?? input.partner?.previousHealthScore ?? input.partner?.previous_health_score ?? score)
  return {
    components,
    score,
    healthScore: score,
    status: getHealthStatus(score),
    trend: getTrend(score, previousScore),
  }
}

function getPartnerRows(rows = {}) {
  const byPartner = new Map()
  rows.partners.forEach((partner) => {
    byPartner.set(getPartnerId(partner) || getPartnerName(partner), {
      id: getPartnerId(partner),
      name: getPartnerName(partner),
      partner,
    })
  })
  rows.applications.forEach((application) => {
    const id = getApplicationPartnerId(application) || getApplicationPartnerName(application)
    if (!id || byPartner.has(id)) return
    byPartner.set(id, {
      id,
      name: getApplicationPartnerName(application) || id,
      partner: {},
    })
  })
  rows.requests.forEach((request) => {
    const id = normalizeText(request.partnerId || request.partnerName)
    if (!id || byPartner.has(id)) return
    byPartner.set(id, {
      id: request.partnerId || id,
      name: request.partnerName || id,
      partner: {},
    })
  })
  return [...byPartner.values()]
}

function getPartnerBundle(partner = {}, rows = {}) {
  const partnerId = normalizeText(partner.id)
  const partnerName = normalizeLower(partner.name)
  const applications = rows.applications.filter((row) => {
    const appPartnerId = getApplicationPartnerId(row)
    const appPartnerName = normalizeLower(getApplicationPartnerName(row))
    return (partnerId && appPartnerId === partnerId) || (partnerName && appPartnerName === partnerName)
  })
  const applicationIds = new Set(applications.map(getApplicationId))
  const requests = rows.requests.filter((row) => (
    (partnerId && normalizeText(row.partnerId) === partnerId) ||
    (partnerName && normalizeLower(row.partnerName) === partnerName) ||
    applicationIds.has(normalizeText(row.applicationId))
  ))
  const documents = rows.documents.filter((row) => applicationIds.has(normalizeText(row.applicationId || row.application_id)))
  const documentRequests = rows.documentRequests.filter((row) => applicationIds.has(normalizeText(row.applicationId || row.application_id)))
  return { applications, requests, documents, documentRequests }
}

export function calculatePartnerSatisfaction(input = {}) {
  const requests = normalizeArray(input.requests)
  const documents = normalizeArray(input.documents)
  const supportTickets = requests.filter((row) => row.requestType === BOND_PARTNER_REQUEST_TYPES.supportTicket)
  const escalations = requests.filter((row) => row.escalated || normalizeLower(row.priority) === 'urgent' || row.requestType === BOND_PARTNER_REQUEST_TYPES.escalation)
  const repeatComplaints = requests.filter((row) => normalizeLower(`${row.title} ${row.message} ${row.supportType}`).includes('complaint')).length
  const responsePenalty = average(requests.map((row) => row.sla?.elapsedTime || hoursBetween(row.createdAt || row.created_at, getFirstResponseAt(row) || row.updatedAt || row.updated_at))) * 2
  const documentDelays = documents.filter((row) => ['missing', 'replacement', 'rejected', 'delayed'].some((term) => getSignal(row).includes(term))).length
  const portalUsageScore = input.portalUsageScore ?? (requests.length || documents.length ? 85 : 65)
  const satisfactionScore = clamp(
    100 -
      responsePenalty -
      supportTickets.length * 5 -
      escalations.length * 12 -
      repeatComplaints * 14 -
      documentDelays * 8 +
      (Number(portalUsageScore) - 75) * 0.2,
  )
  const previousScore = Number(input.previousScore ?? input.previous_score ?? satisfactionScore)
  return {
    satisfactionScore,
    satisfactionTrend: getTrend(satisfactionScore, previousScore),
    status: getSatisfactionStatus(satisfactionScore),
    signals: {
      responseTimes: average(requests.map((row) => row.sla?.elapsedTime || 0)),
      escalations: escalations.length,
      ticketVolume: supportTickets.length,
      repeatComplaints,
      documentDelays,
      portalUsage: portalUsageScore,
    },
  }
}

export function getPartnerHealth(context = {}, options = {}) {
  const rows = getRows(context, options)
  const partnerRows = getPartnerRows(rows)
  const healthRows = partnerRows.map((partner) => {
    const bundle = getPartnerBundle(partner, rows)
    const health = calculatePartnerHealth({
      partner: partner.partner,
      ...bundle,
      previousScore: partner.partner.previousHealthScore || partner.partner.previous_health_score,
    })
    const satisfaction = calculatePartnerSatisfaction({
      ...bundle,
      previousScore: partner.partner.previousSatisfactionScore || partner.partner.previous_satisfaction_score,
      portalUsageScore: partner.partner.portalUsageScore || partner.partner.portal_usage_score,
    })
    recordActivity(rows.workspaceKey, {
      eventType: BOND_PARTNER_INTELLIGENCE_EVENTS.partnerHealthUpdated,
      partnerId: partner.id,
      actorUserId: getActorId(context),
      newValue: { healthScore: health.score, status: health.status },
    })
    if ([PARTNER_HEALTH_STATUSES.critical, PARTNER_HEALTH_STATUSES.atRisk].includes(health.status)) {
      recordActivity(rows.workspaceKey, {
        eventType: BOND_PARTNER_INTELLIGENCE_EVENTS.partnerFlaggedAtRisk,
        partnerId: partner.id,
        actorUserId: getActorId(context),
        newValue: { healthScore: health.score, status: health.status },
      })
    }
    recordActivity(rows.workspaceKey, {
      eventType: BOND_PARTNER_INTELLIGENCE_EVENTS.partnerSatisfactionUpdated,
      partnerId: partner.id,
      actorUserId: getActorId(context),
      newValue: { satisfactionScore: satisfaction.satisfactionScore, status: satisfaction.status },
    })
    return {
      id: partner.id,
      partnerId: partner.id,
      partnerName: partner.name,
      healthScore: health.score,
      status: health.status,
      trend: health.trend.direction,
      trendDelta: health.trend.delta,
      components: health.components,
      satisfaction,
      applications: bundle.applications.length,
      approvals: bundle.applications.filter(isApprovedApplication).length,
      approvalRate: calculateApplicationConversionRate(bundle.applications),
      slaCompliance: health.components.slaCompliance,
      escalations: bundle.requests.filter((row) => row.escalated || normalizeLower(row.priority) === 'urgent').length,
      supportTickets: bundle.requests.filter((row) => row.requestType === BOND_PARTNER_REQUEST_TYPES.supportTicket).length,
    }
  }).sort((left, right) => left.healthScore - right.healthScore)

  return {
    scope: rows.scope,
    summary: {
      excellentPartners: healthRows.filter((row) => row.status === PARTNER_HEALTH_STATUSES.excellent).length,
      healthyPartners: healthRows.filter((row) => row.status === PARTNER_HEALTH_STATUSES.healthy).length,
      atRiskPartners: healthRows.filter((row) => row.status === PARTNER_HEALTH_STATUSES.atRisk).length,
      criticalPartners: healthRows.filter((row) => row.status === PARTNER_HEALTH_STATUSES.critical).length,
    },
    rows: healthRows,
  }
}

function buildSlaMetrics(requests = [], now = new Date()) {
  const totalRequests = requests.length
  const resolvedWithinSla = requests.filter(requestWasResolvedWithinSla).length
  const breachedSla = requests.filter((row) => requestIsBreached(row, now)).length
  return {
    totalRequests,
    resolvedWithinSLA: resolvedWithinSla,
    breachedSLA: breachedSla,
    averageResponseTime: average(requests.map((row) => hoursBetween(row.createdAt || row.created_at, getFirstResponseAt(row) || row.updatedAt || row.updated_at || row.createdAt || row.created_at))),
    averageResolutionTime: average(requests.filter(requestIsResolved).map((row) => hoursBetween(row.createdAt || row.created_at, getResolvedAt(row) || row.updatedAt || row.updated_at))),
    slaCompliance: percent(totalRequests - breachedSla, totalRequests),
  }
}

function labelForId(id = '', rows = [], getId = () => '', getName = () => '') {
  const safeId = normalizeText(id)
  return getName(rows.find((row) => getId(row) === safeId) || {}) || safeId || 'Unassigned'
}

function breakdownRequests(requests = [], key = '', catalog = [], idResolver = () => '', nameResolver = () => '') {
  return [...groupBy(requests, (row) => row[key]).entries()].map(([id, groupedRequests]) => ({
    id,
    name: labelForId(id, catalog, idResolver, nameResolver),
    ...buildSlaMetrics(groupedRequests),
    requests: groupedRequests.length,
    escalations: groupedRequests.filter((row) => row.escalated || normalizeLower(row.priority) === 'urgent').length,
  })).sort((left, right) => left.slaCompliance - right.slaCompliance)
}

export function getSLAPerformance(context = {}, options = {}) {
  const rows = getRows(context, options)
  const metrics = buildSlaMetrics(rows.requests, options.now ? new Date(options.now) : new Date())
  recordActivity(rows.workspaceKey, {
    eventType: BOND_PARTNER_INTELLIGENCE_EVENTS.slaMetricRecorded,
    actorUserId: getActorId(context),
    newValue: metrics,
  })
  return {
    scope: rows.scope,
    metrics,
    byRegion: breakdownRequests(rows.requests, 'regionId', rows.regions, getRegionId, getRegionName),
    byBranch: breakdownRequests(rows.requests, 'branchId', rows.branches, getBranchId, getBranchName),
    byConsultant: breakdownRequests(rows.requests, 'ownerConsultantId', rows.consultants, getConsultantId, getConsultantName),
    byPartner: breakdownRequests(rows.requests, 'partnerName'),
  }
}

function getStatusFromSla(slaCompliance = 0, escalations = 0) {
  if (slaCompliance >= 90 && escalations === 0) return 'Excellent'
  if (slaCompliance >= 75) return 'Healthy'
  if (slaCompliance >= 55) return 'At Risk'
  return 'Critical'
}

export function getConsultantResponsiveness(context = {}, options = {}) {
  const rows = getRows(context, options)
  const grouped = groupBy(rows.requests, (row) => row.ownerConsultantId)
  const table = [...grouped.entries()].map(([id, requests]) => {
    const openRequests = requests.filter((row) => !requestIsResolved(row)).length
    const metrics = buildSlaMetrics(requests)
    const escalations = requests.filter((row) => row.escalated || normalizeLower(row.priority) === 'urgent').length
    const partnerSatisfaction = average(getPartnerRows({ ...rows, requests }).map((partner) => calculatePartnerSatisfaction(getPartnerBundle(partner, { ...rows, requests })).satisfactionScore))
    return {
      id,
      consultantId: id,
      consultantName: labelForId(id, rows.consultants, getConsultantId, getConsultantName),
      openRequests,
      averageFirstResponseTime: metrics.averageResponseTime,
      averageResolutionTime: metrics.averageResolutionTime,
      slaCompliance: metrics.slaCompliance,
      escalations,
      partnerSatisfaction,
      status: getStatusFromSla(metrics.slaCompliance, escalations),
    }
  }).sort((left, right) => left.slaCompliance - right.slaCompliance)
  return {
    scope: rows.scope,
    rows: table,
    metrics: {
      averageFirstResponseTime: average(table.map((row) => row.averageFirstResponseTime)),
      averageResolutionTime: average(table.map((row) => row.averageResolutionTime)),
      slaCompliance: average(table.map((row) => row.slaCompliance)),
      openRequests: table.reduce((sum, row) => sum + row.openRequests, 0),
      escalations: table.reduce((sum, row) => sum + row.escalations, 0),
      partnerSatisfaction: average(table.map((row) => row.partnerSatisfaction)),
    },
  }
}

function cannotView(scope = {}, minimum = BOND_ORGANISATION_LEVELS.branch) {
  if (scope.scopeLevel === BOND_ORGANISATION_LEVELS.hq) return false
  if (minimum === BOND_ORGANISATION_LEVELS.region) return scope.scopeLevel !== BOND_ORGANISATION_LEVELS.region
  if (minimum === BOND_ORGANISATION_LEVELS.branch) return ![BOND_ORGANISATION_LEVELS.region, BOND_ORGANISATION_LEVELS.branch].includes(scope.scopeLevel)
  return false
}

export function getBranchServiceQuality(context = {}, options = {}) {
  const rows = getRows(context, options)
  if (cannotView(rows.scope, BOND_ORGANISATION_LEVELS.branch)) {
    return { scope: rows.scope, accessDenied: true, rows: [], metrics: {} }
  }
  const groupedRequests = groupBy(rows.requests, (row) => row.branchId)
  const groupedApplications = groupBy(rows.applications, getApplicationBranchId)
  const partnerHealth = getPartnerHealth(context, options).rows
  const table = [...new Set([...groupedRequests.keys(), ...groupedApplications.keys()])].map((id) => {
    const requests = groupedRequests.get(id) || []
    const applications = groupedApplications.get(id) || []
    const metrics = buildSlaMetrics(requests)
    const branchPartnerIds = new Set(applications.map((row) => getApplicationPartnerId(row) || getApplicationPartnerName(row)))
    const partnerHealthAverage = average(partnerHealth.filter((row) => branchPartnerIds.has(row.partnerId) || branchPartnerIds.has(row.partnerName)).map((row) => row.healthScore))
    return {
      id,
      branchId: id,
      branchName: labelForId(id, rows.branches, getBranchId, getBranchName),
      applications: applications.length,
      openRequests: requests.filter((row) => !requestIsResolved(row)).length,
      slaCompliance: metrics.slaCompliance,
      partnerHealth: partnerHealthAverage,
      escalations: requests.filter((row) => row.escalated || normalizeLower(row.priority) === 'urgent').length,
      averageResponseTime: metrics.averageResponseTime,
      averageResolutionTime: metrics.averageResolutionTime,
      status: getStatusFromSla(metrics.slaCompliance, requests.filter((row) => row.escalated).length),
    }
  }).sort((left, right) => left.slaCompliance - right.slaCompliance)
  return {
    scope: rows.scope,
    rows: table,
    metrics: {
      openRequests: table.reduce((sum, row) => sum + row.openRequests, 0),
      slaCompliance: average(table.map((row) => row.slaCompliance)),
      escalations: table.reduce((sum, row) => sum + row.escalations, 0),
      partnerHealthAverage: average(table.map((row) => row.partnerHealth)),
      responseTimes: average(table.map((row) => row.averageResponseTime)),
      resolutionTimes: average(table.map((row) => row.averageResolutionTime)),
    },
  }
}

export function getRegionalServiceQuality(context = {}, options = {}) {
  const rows = getRows(context, options)
  if (cannotView(rows.scope, BOND_ORGANISATION_LEVELS.region)) {
    return { scope: rows.scope, accessDenied: true, rows: [], metrics: {} }
  }
  const groupedRequests = groupBy(rows.requests, (row) => row.regionId)
  const groupedApplications = groupBy(rows.applications, getApplicationRegionId)
  const groupedBranches = groupBy(rows.branches, getBranchRegionId)
  const partnerHealth = getPartnerHealth(context, options).rows
  const table = [...new Set([...groupedRequests.keys(), ...groupedApplications.keys(), ...groupedBranches.keys()])].map((id) => {
    const requests = groupedRequests.get(id) || []
    const applications = groupedApplications.get(id) || []
    const metrics = buildSlaMetrics(requests)
    const regionPartnerIds = new Set(applications.map((row) => getApplicationPartnerId(row) || getApplicationPartnerName(row)))
    return {
      id,
      regionId: id,
      regionName: labelForId(id, rows.regions, getRegionId, getRegionName),
      applications: applications.length,
      partners: new Set(applications.map((row) => getApplicationPartnerId(row) || getApplicationPartnerName(row)).filter(Boolean)).size,
      branches: (groupedBranches.get(id) || []).length || new Set(applications.map(getApplicationBranchId).filter(Boolean)).size,
      averageSLA: metrics.slaCompliance,
      partnerHealth: average(partnerHealth.filter((row) => regionPartnerIds.has(row.partnerId) || regionPartnerIds.has(row.partnerName)).map((row) => row.healthScore)),
      escalations: requests.filter((row) => row.escalated || normalizeLower(row.priority) === 'urgent').length,
      status: getStatusFromSla(metrics.slaCompliance, requests.filter((row) => row.escalated).length),
    }
  }).sort((left, right) => left.averageSLA - right.averageSLA)
  return {
    scope: rows.scope,
    rows: table,
    metrics: {
      applications: table.reduce((sum, row) => sum + row.applications, 0),
      partners: table.reduce((sum, row) => sum + row.partners, 0),
      branches: table.reduce((sum, row) => sum + row.branches, 0),
      averageSLA: average(table.map((row) => row.averageSLA)),
      partnerHealth: average(table.map((row) => row.partnerHealth)),
      escalations: table.reduce((sum, row) => sum + row.escalations, 0),
    },
  }
}

function classifyIssue(row = {}) {
  const signal = normalizeLower(`${row.requestType || ''} ${row.category || ''} ${row.title || ''} ${row.message || ''} ${row.supportType || ''}`)
  if (signal.includes('document') || signal.includes('payslip') || signal.includes('statement') || signal.includes('missing')) return 'Missing Documents'
  if (signal.includes('bank') || signal.includes('lender') || signal.includes('approval')) return 'Bank Delays'
  if (signal.includes('consultant') || signal.includes('response') || signal.includes('delay')) return 'Consultant Delays'
  if (signal.includes('complaint') || signal.includes('escalation') || normalizeLower(row.priority) === 'urgent') return 'Partner Complaints'
  return 'Support Requests'
}

export function getRecurringIssues(context = {}, options = {}) {
  const rows = getRows(context, options)
  const now = options.now ? new Date(options.now) : new Date()
  const grouped = groupBy(rows.requests, classifyIssue)
  return {
    scope: rows.scope,
    rows: [...grouped.entries()].map(([issueType, requests]) => {
      const currentCount = requests.filter((row) => isWithinDays(row, 30, now)).length
      const previousCount = requests.filter((row) => {
        const date = new Date(dateValue(row))
        if (Number.isNaN(date.getTime())) return false
        const ageDays = (now.getTime() - date.getTime()) / (24 * 60 * 60 * 1000)
        return ageDays > 30 && ageDays <= 60
      }).length
      return {
        issueType,
        count: requests.length,
        trend: getTrend(currentCount, previousCount, true).direction,
        affectedPartners: new Set(requests.map((row) => row.partnerId || row.partnerName).filter(Boolean)).size,
        partners: [...new Set(requests.map((row) => row.partnerName).filter(Boolean))],
      }
    }).sort((left, right) => right.count - left.count),
  }
}

function escalationRows(rows = [], key = '', catalog = [], idResolver = () => '', nameResolver = () => '') {
  return [...groupBy(rows, (row) => row[key]).entries()].map(([id, requests]) => ({
    id,
    name: labelForId(id, catalog, idResolver, nameResolver),
    volume: requests.length,
    frequency: requests.length ? Math.round((requests.length / Math.max(1, new Set(requests.map((row) => normalizeText(row.applicationId))).size)) * 10) / 10 : 0,
    trend: getTrend(requests.filter((row) => isWithinDays(row, 30)).length, requests.filter((row) => isWithinDays(row, 60) && !isWithinDays(row, 30)).length, true).direction,
  })).sort((left, right) => right.volume - left.volume)
}

export function getEscalationAnalysis(context = {}, options = {}) {
  const rows = getRows(context, options)
  const escalations = rows.requests.filter((row) => row.escalated || normalizeLower(row.priority) === 'urgent' || row.requestType === BOND_PARTNER_REQUEST_TYPES.escalation)
  const byConsultant = escalationRows(escalations, 'ownerConsultantId', rows.consultants, getConsultantId, getConsultantName)
  const byBranch = escalationRows(escalations, 'branchId', rows.branches, getBranchId, getBranchName)
  const byRegion = escalationRows(escalations, 'regionId', rows.regions, getRegionId, getRegionName)
  const byPartner = escalationRows(escalations, 'partnerName')
  return {
    scope: rows.scope,
    metrics: {
      volume: escalations.length,
      frequency: Math.round((escalations.length / Math.max(1, rows.requests.length)) * 100),
      trend: getTrend(escalations.filter((row) => isWithinDays(row, 30)).length, escalations.filter((row) => isWithinDays(row, 60) && !isWithinDays(row, 30)).length, true).direction,
    },
    byConsultant,
    byBranch,
    byRegion,
    byPartner,
    highlights: {
      mostEscalatedConsultant: byConsultant[0] || null,
      mostEscalatedBranch: byBranch[0] || null,
      mostEscalatedPartner: byPartner[0] || null,
    },
  }
}

export function getPartnerRelationshipTimeline(partnerId = '', context = {}, options = {}) {
  const rows = getRows(context, options)
  const partner = getPartnerRows(rows).find((row) => normalizeText(row.id) === normalizeText(partnerId) || normalizeLower(row.name) === normalizeLower(partnerId)) || getPartnerRows(rows)[0]
  if (!partner) return { scope: rows.scope, partner: null, rows: [] }
  const bundle = getPartnerBundle(partner, rows)
  const events = [
    ...bundle.applications.map((row) => ({ type: 'Application', title: normalizeText(row.applicationReference || row.application_reference || getApplicationId(row)), date: dateValue(row), source: row })),
    ...bundle.requests.map((row) => ({ type: row.escalated ? 'Escalation' : row.requestType === BOND_PARTNER_REQUEST_TYPES.supportTicket ? 'Support Ticket' : 'Partner Activity', title: row.title, date: dateValue(row), source: row })),
    ...bundle.documents.map((row) => ({ type: 'Document', title: normalizeText(row.name || row.documentName || row.document_name || 'Document'), date: dateValue(row), source: row })),
  ]
  const monthly = groupBy(events, (event) => {
    const date = new Date(event.date || Date.now())
    return Number.isNaN(date.getTime()) ? 'Unknown' : date.toLocaleString('en-ZA', { month: 'long', year: 'numeric' })
  })
  return {
    scope: rows.scope,
    partner: { id: partner.id, name: partner.name },
    rows: [...monthly.entries()].map(([period, periodEvents]) => {
      const health = calculatePartnerHealth({
        ...bundle,
        requests: bundle.requests.filter((row) => periodEvents.some((event) => event.source === row)),
      })
      return {
        period,
        healthScore: health.score,
        status: health.status,
        events: periodEvents.sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime()),
      }
    }),
  }
}

export function getTrendReporting(context = {}, options = {}) {
  const rows = getRows(context, options)
  const now = options.now ? new Date(options.now) : new Date()
  return {
    scope: rows.scope,
    rows: Object.entries(PERIOD_DAYS).map(([period, days]) => {
      const periodApplications = rows.applications.filter((row) => isWithinDays(row, days, now))
      const periodRequests = rows.requests.filter((row) => isWithinDays(row, days, now))
      const previousApplications = rows.applications.filter((row) => {
        const age = daysBetween(dateValue(row), now.toISOString())
        return age > days && age <= days * 2
      })
      const previousRequests = rows.requests.filter((row) => {
        const age = daysBetween(dateValue(row), now.toISOString())
        return age > days && age <= days * 2
      })
      const currentHealth = calculatePartnerHealth({ applications: periodApplications, requests: periodRequests }).score
      const previousHealth = calculatePartnerHealth({ applications: previousApplications, requests: previousRequests }).score
      const currentSla = buildSlaMetrics(periodRequests).slaCompliance
      const previousSla = buildSlaMetrics(previousRequests).slaCompliance
      return {
        period,
        applications: periodApplications.length,
        approvalRate: calculateApplicationConversionRate(periodApplications),
        partnerHealth: currentHealth,
        slaCompliance: currentSla,
        escalations: periodRequests.filter((row) => row.escalated || normalizeLower(row.priority) === 'urgent').length,
        supportVolume: periodRequests.filter((row) => row.requestType === BOND_PARTNER_REQUEST_TYPES.supportTicket).length,
        trend: getTrend((currentHealth + currentSla) / 2, (previousHealth + previousSla) / 2).direction,
      }
    }),
  }
}

export function generatePartnerReport(partnerId = '', context = {}, options = {}) {
  const rows = getRows(context, options)
  if (rows.scope.scopeLevel !== BOND_ORGANISATION_LEVELS.hq) {
    const error = new Error('Only HQ users can generate partner performance reports.')
    error.code = 'permission_denied'
    throw error
  }
  const health = getPartnerHealth(context, options)
  const partner = health.rows.find((row) => normalizeText(row.partnerId) === normalizeText(partnerId) || normalizeLower(row.partnerName) === normalizeLower(partnerId)) || health.rows[0]
  if (!partner) {
    const error = new Error('Partner report could not be generated because no partner data is available.')
    error.code = 'not_found'
    throw error
  }
  const sourcePartner = { id: partner.partnerId, name: partner.partnerName }
  const bundle = getPartnerBundle(sourcePartner, rows)
  const sla = buildSlaMetrics(bundle.requests)
  const recurringIssues = getRecurringIssues(context, options).rows.filter((issue) => issue.partners.includes(partner.partnerName))
  const report = {
    id: createId('monthly-partner-report'),
    partnerId: partner.partnerId,
    partnerName: partner.partnerName,
    period: options.period || new Date().toISOString().slice(0, 7),
    sections: {
      applicationsSubmitted: bundle.applications.filter(isSubmittedApplication).length,
      approvals: bundle.applications.filter(isApprovedApplication).length,
      approvalRate: partner.approvalRate,
      averageTurnaround: average(bundle.applications.map((row) => daysBetween(row.createdAt || row.created_at, row.updatedAt || row.updated_at || row.submittedAt || row.submitted_at))),
      slaPerformance: sla,
      partnerHealthScore: partner.healthScore,
      topIssues: recurringIssues.slice(0, 5),
    },
    formats: {
      pdf: {
        filename: `${partner.partnerName.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${options.period || 'monthly'}-partner-report.pdf`,
        mimeType: 'application/pdf',
      },
      excel: {
        filename: `${partner.partnerName.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${options.period || 'monthly'}-partner-report.xlsx`,
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      },
    },
  }
  recordActivity(rows.workspaceKey, {
    eventType: BOND_PARTNER_INTELLIGENCE_EVENTS.partnerReportGenerated,
    partnerId: partner.partnerId,
    actorUserId: getActorId(context),
    newValue: report,
  })
  return report
}

export function getExecutiveReporting(context = {}, options = {}) {
  const rows = getRows(context, options)
  if (rows.scope.scopeLevel !== BOND_ORGANISATION_LEVELS.hq) {
    return { scope: rows.scope, accessDenied: true, widgets: {} }
  }
  const partnerHealth = getPartnerHealth(context, options)
  const sla = getSLAPerformance(context, options)
  const escalations = getEscalationAnalysis(context, options)
  return {
    scope: rows.scope,
    widgets: {
      networkPartnerHealth: average(partnerHealth.rows.map((row) => row.healthScore)),
      networkSLAPerformance: sla.metrics.slaCompliance,
      topPerformingPartners: [...partnerHealth.rows].sort((left, right) => right.healthScore - left.healthScore).slice(0, 5),
      atRiskPartners: partnerHealth.rows.filter((row) => [PARTNER_HEALTH_STATUSES.atRisk, PARTNER_HEALTH_STATUSES.critical].includes(row.status)),
      escalationHotspots: {
        consultant: escalations.highlights.mostEscalatedConsultant,
        branch: escalations.highlights.mostEscalatedBranch,
        partner: escalations.highlights.mostEscalatedPartner,
      },
    },
  }
}

export const __bondPartnerIntelligenceServiceTestUtils = Object.freeze({
  clearStores() {
    LOCAL_ACTIVITY_STORE.clear()
    localSequence = 0
  },
  getActivity(workspaceId = '') {
    return getLocalRows(LOCAL_ACTIVITY_STORE, normalizeText(workspaceId || 'default'))
  },
})
