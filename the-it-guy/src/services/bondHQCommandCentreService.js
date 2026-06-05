import {
  ALL_BOND_ORGANISATION_SCOPE,
  BOND_ORGANISATION_LEVELS,
  resolveBondOrganisationScope,
} from './bondOrganisationScopeResolver'
import {
  BOND_PARTNER_REQUEST_STATUSES,
  calculatePartnerSLA,
  getPartnerRequests,
} from './bondPartnerCollaborationService'
import {
  getBranchComparison as getRegionalBranchComparison,
  getRegionalForecast,
  calculateRegionalHealth,
} from './bondRegionalOperationsService'
import { CONSULTANT_CAPACITY_STATUSES, getConsultantPerformanceRows } from './bondConsultantPerformanceService'
import { getPartnerHealth } from './bondPartnerIntelligenceService'
import { getPartnerPortalOperationalRows } from './bondPartnerPortalService'
import { getActiveOriginatorBanks, slugifyBank } from './bondOriginatorBankService'

export const BOND_HQ_COMMAND_CENTRE_EVENTS = Object.freeze({
  hqHealthUpdated: 'HQ_HEALTH_UPDATED',
  hqForecastUpdated: 'HQ_FORECAST_UPDATED',
  executiveAlertCreated: 'EXECUTIVE_ALERT_CREATED',
  executiveAlertDismissed: 'EXECUTIVE_ALERT_DISMISSED',
  executiveReportGenerated: 'EXECUTIVE_REPORT_GENERATED',
})

export const NATIONAL_HEALTH_STATUSES = Object.freeze({
  excellent: 'Excellent',
  healthy: 'Healthy',
  atRisk: 'At Risk',
  critical: 'Critical',
})

const LOCAL_HEALTH_SNAPSHOT_STORE = new Map()
const LOCAL_FORECAST_STORE = new Map()
const LOCAL_ALERT_STORE = new Map()
const LOCAL_REPORT_STORE = new Map()
const LOCAL_ACTIVITY_STORE = new Map()
let localSequence = 0

const RESOLVED_STATUSES = new Set([BOND_PARTNER_REQUEST_STATUSES.resolved, BOND_PARTNER_REQUEST_STATUSES.closed])
const APPROVAL_TERMS = ['approved', 'approval', 'grant', 'registered', 'accepted']
const DECLINE_TERMS = ['declined', 'rejected', 'lost']
const SUBMITTED_TERMS = ['submitted', 'bank', 'feedback', 'quote', 'approved', 'declined', 'registered']
const ACTIVE_TERMS = ['active', 'new', 'intake', 'pre', 'document', 'review', 'submit', 'feedback', 'bank', 'quote', 'instruction', 'in_progress', 'prepared']
const EXECUTIVE_REPORT_SECTIONS = [
  'Executive Summary',
  'Application Volume',
  'Approval Performance',
  'Regional Comparison',
  'Branch Comparison',
  'Partner Health',
  'Consultant Capacity',
  'SLA Performance',
  'Escalations',
  'Forecast',
  'Commercial Snapshot',
]

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase()
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : []
}

function createId(prefix = 'hq-command-centre') {
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

function getActorId(context = {}) {
  return normalizeText(context.userId || context.user?.id || context.profile?.id || context.currentMembership?.userId || context.currentMembership?.user_id)
}

function getLocalRows(store, workspaceKey = '') {
  return [...(store.get(workspaceKey) || [])]
}

function setLocalRows(store, workspaceKey = '', rows = []) {
  store.set(workspaceKey, rows)
}

function recordActivity(workspaceKey = '', event = {}) {
  const row = {
    id: event.id || createId('hq-command-centre-activity'),
    eventType: normalizeText(event.eventType),
    sourceType: normalizeText(event.sourceType),
    sourceId: normalizeText(event.sourceId),
    actorUserId: normalizeText(event.actorUserId),
    previousValue: event.previousValue || null,
    newValue: event.newValue || null,
    createdAt: event.createdAt || new Date().toISOString(),
  }
  setLocalRows(LOCAL_ACTIVITY_STORE, workspaceKey, [row, ...getLocalRows(LOCAL_ACTIVITY_STORE, workspaceKey)])
  return row
}

function percent(part = 0, total = 0) {
  return total ? Math.round((Number(part || 0) / Number(total || 0)) * 100) : 0
}

function average(values = []) {
  const safe = values.map(Number).filter((value) => Number.isFinite(value))
  if (!safe.length) return 0
  return Math.round((safe.reduce((sum, value) => sum + value, 0) / safe.length) * 10) / 10
}

function clamp(value = 0, min = 0, max = 100) {
  return Math.min(max, Math.max(min, Math.round(Number(value || 0))))
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
  return normalizeLower(`${row.status || ''} ${row.stage || ''} ${row.financeStatus || ''} ${row.finance_status || ''} ${row.financeStageKey || ''} ${row.finance_stage_key || ''} ${row.financeStageLabel || ''} ${row.registrationStatus || ''} ${row.nextAction || ''} ${row.next_action || ''} ${row.documentStatus || ''} ${row.document_status || ''} ${row.bankStatus || ''} ${row.bank_status || ''}`)
}

function includesSignal(row = {}, terms = []) {
  const signal = getSignal(row)
  return terms.some((term) => signal.includes(term))
}

function isApprovedApplication(row = {}) {
  return includesSignal(row, APPROVAL_TERMS)
}

function isDeclinedApplication(row = {}) {
  return includesSignal(row, DECLINE_TERMS)
}

function isSubmittedApplication(row = {}) {
  return includesSignal(row, SUBMITTED_TERMS)
}

function isActiveApplication(row = {}) {
  const signal = getSignal(row)
  if (row.active === false || row.is_active === false) return false
  if (['archived', 'cancelled', 'canceled', 'completed', 'registered', 'declined', 'lost'].some((term) => signal.includes(term))) return false
  if (!signal) return true
  return ACTIVE_TERMS.some((term) => signal.includes(term))
}

function getApplicationId(row = {}) {
  return normalizeText(row.id || row.applicationId || row.application_id || row.transactionId || row.transaction_id || row.key)
}

function getApplicationBranchId(row = {}) {
  return normalizeText(row.assignedBranchId || row.assigned_branch_id || row.branchId || row.branch_id || row.workspaceUnitId || row.workspace_unit_id || row.bond_workspace_unit_id)
}

function getApplicationRegionId(row = {}) {
  return normalizeText(row.assignedRegionId || row.assigned_region_id || row.regionId || row.region_id || row.bond_region_id)
}

function getApplicationPartnerId(row = {}) {
  return normalizeText(row.partnerId || row.partner_id || row.bondPartnerId || row.bond_partner_id || row.agencyId || row.agency_id || row.developmentId || row.development_id)
}

function getApplicationPartnerName(row = {}) {
  return normalizeText(row.partnerName || row.partner_name || row.agencyName || row.agency_name || row.developmentName || row.development_name)
}

function getBranchId(row = {}) {
  return normalizeText(row.id || row.branchId || row.branch_id || row.workspaceUnitId || row.workspace_unit_id)
}

function getBranchName(row = {}) {
  return normalizeText(row.name || row.branchName || row.branch_name || row.label || row.branch || getBranchId(row)) || 'Branch'
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

function getPartnerId(row = {}) {
  return normalizeText(row.id || row.partnerId || row.partner_id || row.bondPartnerId || row.bond_partner_id)
}

function getPartnerName(row = {}) {
  return normalizeText(row.name || row.partnerName || row.partner_name || row.companyName || row.company_name || getPartnerId(row)) || 'Partner'
}

function getDocumentApplicationId(row = {}) {
  return normalizeText(row.applicationId || row.application_id || row.transactionId || row.transaction_id)
}

function deriveRegionsFromBranches(branches = [], applications = []) {
  const byId = new Map()
  branches.forEach((branch) => {
    const id = getBranchRegionId(branch)
    if (!id || byId.has(id)) return
    byId.set(id, { id, name: normalizeText(branch.regionName || branch.region || id) })
  })
  applications.forEach((application) => {
    const id = getApplicationRegionId(application)
    if (!id || byId.has(id)) return
    byId.set(id, { id, name: normalizeText(application.regionName || application.region || id) })
  })
  return [...byId.values()]
}

function requestIsResolved(row = {}) {
  return RESOLVED_STATUSES.has(normalizeLower(row.status))
}

function requestIsBreached(row = {}, now = new Date()) {
  const sla = row.sla || calculatePartnerSLA(row, now)
  if (sla.breached || row.escalated || normalizeLower(row.priority) === 'urgent') return true
  const resolvedAt = normalizeText(row.resolvedAt || row.resolved_at)
  const dueAt = normalizeText(row.dueAt || row.due_at)
  if (!resolvedAt || !dueAt) return false
  return new Date(resolvedAt).getTime() > new Date(dueAt).getTime()
}

function getRiskLevel(score = 0) {
  if (score >= 70) return 'High'
  if (score >= 40) return 'Medium'
  return 'Low'
}

function getHealthStatus(score = 0) {
  if (score <= 39) return NATIONAL_HEALTH_STATUSES.critical
  if (score <= 59) return NATIONAL_HEALTH_STATUSES.atRisk
  if (score <= 79) return NATIONAL_HEALTH_STATUSES.healthy
  return NATIONAL_HEALTH_STATUSES.excellent
}

function getRows(context = {}, options = {}) {
  const workspaceKey = getWorkspaceKey(context, options)
  const operationalRows = getPartnerPortalOperationalRows(context, { ...options, workspaceId: workspaceKey })
  const applications = normalizeArray(operationalRows.applications)
  const branches = normalizeArray(options.branches || options.units || operationalRows.branches || operationalRows.units)
  const rawRegions = normalizeArray(options.regions || operationalRows.regions)
  const regions = rawRegions.length ? rawRegions : deriveRegionsFromBranches(branches, applications)
  const consultants = normalizeArray(options.consultants || options.users || operationalRows.consultants || operationalRows.users)
  const scope = resolveBondOrganisationScope(context, {
    regions,
    branches,
    consultants,
    applications,
  })
  const applicationIds = new Set(applications.map(getApplicationId))
  const requests = getPartnerRequests(context, { ...options, workspaceId: workspaceKey })
    .filter((row) => {
      const rowApplicationId = normalizeText(row.applicationId || row.application_id)
      return !rowApplicationId || applicationIds.has(rowApplicationId)
    })
  const documents = normalizeArray(operationalRows.documents)
  const documentRequests = normalizeArray(operationalRows.documentRequests)
  return {
    workspaceKey,
    scope,
    regions,
    branches,
    applications,
    requests,
    consultants,
    documents,
    documentRequests,
    partners: normalizeArray(operationalRows.partners || options.partners),
  }
}

function assertHQAccess(rows = {}) {
  if (rows.scope.scopeLevel !== BOND_ORGANISATION_LEVELS.hq) {
    const error = new Error('Only HQ, owners, directors, and national managers can access the HQ Command Centre.')
    error.code = 'permission_denied'
    throw error
  }
}

function labelForId(id = '', rows = [], idGetter = (row) => row.id, labelGetter = (row) => row.name) {
  const safeId = normalizeText(id)
  return labelGetter(rows.find((row) => idGetter(row) === safeId) || {}) || safeId || 'Unassigned'
}

function groupBy(rows = [], getter = () => '') {
  const grouped = new Map()
  rows.forEach((row) => {
    const key = normalizeText(getter(row)) || 'Unassigned'
    grouped.set(key, [...(grouped.get(key) || []), row])
  })
  return grouped
}

function requestsForApplications(requests = [], applications = []) {
  const applicationIds = new Set(applications.map(getApplicationId))
  const branchIds = new Set(applications.map(getApplicationBranchId).filter(Boolean))
  const regionIds = new Set(applications.map(getApplicationRegionId).filter(Boolean))
  return requests.filter((row) => (
    applicationIds.has(normalizeText(row.applicationId || row.application_id)) ||
    branchIds.has(normalizeText(row.branchId || row.branch_id)) ||
    regionIds.has(normalizeText(row.regionId || row.region_id))
  ))
}

function getBanksForApplication(row = {}) {
  const values = [
    row.bank,
    row.bankName,
    row.bank_name,
    row.lender,
    row.lenderName,
    row.lender_name,
    row.submittedBank,
    row.submitted_bank,
    ...normalizeArray(row.banksSubmittedTo || row.banks_submitted_to || row.submittedBanks || row.submitted_banks),
  ].map(normalizeText).filter(Boolean)
  if (!values.length) return []
  return [...new Set(values.map(slugifyBank))]
}

function getApplicationResponseHours(row = {}) {
  const start = normalizeText(row.submittedAt || row.submitted_at || row.bankSubmittedAt || row.bank_submitted_at || row.createdAt || row.created_at)
  const end = normalizeText(row.bankFeedbackAt || row.bank_feedback_at || row.feedbackAt || row.feedback_at || row.respondedAt || row.responded_at || row.updatedAt || row.updated_at)
  return hoursBetween(start, end)
}

function buildNationalMetrics(rows = {}, context = {}, options = {}) {
  const now = options.now ? new Date(options.now) : new Date()
  const submitted = rows.applications.filter(isSubmittedApplication)
  const approved = rows.applications.filter(isApprovedApplication)
  const declined = rows.applications.filter(isDeclinedApplication)
  const active = rows.applications.filter(isActiveApplication)
  const breachedRequests = rows.requests.filter((row) => requestIsBreached(row, now))
  const partnerHealthRows = getPartnerHealth(context, options).rows
  const consultantRows = getConsultantPerformanceRows(context, options)
  const regionComparison = getRegionComparison(context, options)
  const branchComparison = getBranchNetworkComparison(context, options).allRows
  const forecasts = getExecutiveForecast(context, options)
  return {
    now,
    submitted,
    approved,
    declined,
    active,
    breachedRequests,
    partnerHealthRows,
    consultantRows,
    regionComparison,
    branchComparison,
    forecasts,
    totalApplications: rows.applications.length,
    activeApplications: active.length,
    applicationsSubmittedThisMonth: submitted.filter((row) => isWithinDays(row, 30, now)).length,
    approvalRate: percent(approved.length, submitted.length || rows.applications.length),
    instructionSent: rows.applications.filter((row) => getSignal(row).includes('instruction')).length,
    averageTurnaround: average(rows.applications.map((row) => daysBetween(row.createdAt || row.created_at, row.approvedAt || row.approved_at || row.registeredAt || row.registered_at || row.updatedAt || row.updated_at || row.submittedAt || row.submitted_at))),
    slaCompliance: rows.requests.length ? percent(rows.requests.length - breachedRequests.length, rows.requests.length) : 100,
    partnerHealthScore: average(partnerHealthRows.map((row) => row.healthScore)) || 70,
    consultantCapacityRisk: average(consultantRows.map((row) => row.capacityScore)),
    forecastedVolume: forecasts.find((row) => row.periodDays === 30)?.expectedApplications || 0,
    escalations: rows.requests.filter((row) => row.escalated || normalizeLower(row.priority) === 'urgent').length,
    forecastRisk: forecasts.filter((row) => row.executiveForecastRisk === 'High').length,
    regionalHealth: average(regionComparison.map((row) => row.healthScore)) || 70,
    branchHealth: average(branchComparison.map((row) => row.healthScore)) || 70,
  }
}

export function calculateNationalHealth(context = {}, options = {}) {
  const rows = getRows(context, options)
  assertHQAccess(rows)
  const metrics = buildNationalMetrics(rows, context, options)
  const escalationScore = clamp(100 - metrics.escalations * 6)
  const capacityScore = clamp(100 - metrics.consultantCapacityRisk * 1.5)
  const forecastScore = clamp(100 - metrics.forecastRisk * 15)
  const score = clamp(
    metrics.regionalHealth * 0.2 +
      metrics.branchHealth * 0.18 +
      metrics.partnerHealthScore * 0.16 +
      metrics.slaCompliance * 0.16 +
      metrics.approvalRate * 0.12 +
      escalationScore * 0.08 +
      capacityScore * 0.06 +
      forecastScore * 0.04,
  )
  const result = {
    score,
    status: getHealthStatus(score),
    components: {
      regionalHealth: metrics.regionalHealth,
      branchHealth: metrics.branchHealth,
      partnerHealth: metrics.partnerHealthScore,
      slaCompliance: metrics.slaCompliance,
      approvalRate: metrics.approvalRate,
      escalations: escalationScore,
      capacityRisk: capacityScore,
      forecastRisk: forecastScore,
    },
  }
  const previous = getLocalRows(LOCAL_HEALTH_SNAPSHOT_STORE, rows.workspaceKey)[0]
  if (!previous || previous.score !== result.score || previous.status !== result.status) {
    recordActivity(rows.workspaceKey, {
      eventType: BOND_HQ_COMMAND_CENTRE_EVENTS.hqHealthUpdated,
      sourceType: 'hq',
      sourceId: rows.workspaceKey,
      actorUserId: getActorId(context),
      previousValue: previous || null,
      newValue: result,
    })
    setLocalRows(LOCAL_HEALTH_SNAPSHOT_STORE, rows.workspaceKey, [{ ...result, organisationId: rows.workspaceKey, updatedAt: new Date().toISOString() }])
  }
  return result
}

export function getRegionComparison(context = {}, options = {}) {
  const rows = getRows(context, options)
  assertHQAccess(rows)
  const consultantRows = getConsultantPerformanceRows(context, options)
  return rows.regions.map((region) => {
    const regionId = getRegionId(region)
    const regionApplications = rows.applications.filter((row) => getApplicationRegionId(row) === regionId)
    const branchIds = new Set(rows.branches.filter((branch) => getBranchRegionId(branch) === regionId).map(getBranchId))
    const submitted = regionApplications.filter(isSubmittedApplication)
    const approved = regionApplications.filter(isApprovedApplication)
    const health = calculateRegionalHealth(regionId, context, options)
    const regionalPartnerRows = getPartnerHealth(context, options).rows.filter((partner) => {
      const keys = new Set(regionApplications.map((row) => getApplicationPartnerId(row) || getApplicationPartnerName(row)).filter(Boolean))
      return keys.has(partner.partnerId) || keys.has(partner.partnerName)
    })
    const regionRequests = requestsForApplications(rows.requests, regionApplications)
    const breaches = regionRequests.filter((row) => requestIsBreached(row, options.now ? new Date(options.now) : new Date()))
    const forecast = getRegionalForecast(regionId, context, options)
    return {
      id: regionId,
      regionId,
      regionName: getRegionName(region),
      healthScore: health.score,
      status: health.status,
      branches: branchIds.size,
      consultants: consultantRows.filter((row) => row.regionId === regionId || branchIds.has(row.branchId)).length,
      applications: regionApplications.filter(isActiveApplication).length,
      approvalRate: percent(approved.length, submitted.length || regionApplications.length),
      slaCompliance: regionRequests.length ? percent(regionRequests.length - breaches.length, regionRequests.length) : 100,
      partnerHealth: average(regionalPartnerRows.map((row) => row.healthScore)) || 70,
      escalations: regionRequests.filter((row) => row.escalated || normalizeLower(row.priority) === 'urgent').length,
      forecastRisk: forecast.filter((row) => row.expectedCapacityRisk === 'High').length,
    }
  }).sort((left, right) => left.healthScore - right.healthScore)
}

export function getBranchNetworkComparison(context = {}, options = {}) {
  const rows = getRows(context, options)
  assertHQAccess(rows)
  const allRows = rows.regions.flatMap((region) => {
    const regionId = getRegionId(region)
    return getRegionalBranchComparison(regionId, context, options).map((branch) => ({
      ...branch,
      regionId,
      regionName: getRegionName(region),
    }))
  }).sort((left, right) => left.healthScore - right.healthScore)
  const filter = normalizeLower(options.branchFilter || options.filter || 'all')
  const regionFilter = normalizeText(options.regionFilter || options.regionId || '')
  const filteredRows = allRows.filter((row) => {
    if (regionFilter && row.regionId !== regionFilter) return false
    if (filter === 'at_risk' || filter === 'at risk') return row.status === NATIONAL_HEALTH_STATUSES.atRisk
    if (filter === 'critical') return row.status === NATIONAL_HEALTH_STATUSES.critical
    if (filter === 'overloaded') return row.capacityRiskLevel === 'High'
    if (filter === 'high_escalations' || filter === 'high escalations') return row.escalations >= 2
    return true
  })
  return {
    allRows,
    rows: filteredRows,
    filters: [
      { key: 'all', label: 'All Regions', count: allRows.length },
      { key: 'at_risk', label: 'At Risk', count: allRows.filter((row) => row.status === NATIONAL_HEALTH_STATUSES.atRisk).length },
      { key: 'critical', label: 'Critical', count: allRows.filter((row) => row.status === NATIONAL_HEALTH_STATUSES.critical).length },
      { key: 'overloaded', label: 'Overloaded', count: allRows.filter((row) => row.capacityRiskLevel === 'High').length },
      { key: 'high_escalations', label: 'High Escalations', count: allRows.filter((row) => row.escalations >= 2).length },
    ],
  }
}

export function getConsultantNetworkCapacity(context = {}, options = {}) {
  const rows = getRows(context, options)
  assertHQAccess(rows)
  const performanceRows = getConsultantPerformanceRows(context, options)
  const activeRows = performanceRows.filter((row) => normalizeLower(row.status) !== 'inactive')
  const sortedByWorkload = [...performanceRows].sort((left, right) => right.activeApplications - left.activeApplications)
  return {
    metrics: {
      light: performanceRows.filter((row) => row.capacityStatus === CONSULTANT_CAPACITY_STATUSES.light).length,
      normal: performanceRows.filter((row) => row.capacityStatus === CONSULTANT_CAPACITY_STATUSES.normal).length,
      busy: performanceRows.filter((row) => row.capacityStatus === CONSULTANT_CAPACITY_STATUSES.busy).length,
      overloaded: performanceRows.filter((row) => row.capacityStatus === CONSULTANT_CAPACITY_STATUSES.overloaded).length,
      inactive: performanceRows.filter((row) => normalizeLower(row.status) === 'inactive').length,
      totalConsultants: performanceRows.length,
      overloadedConsultants: performanceRows.filter((row) => row.capacityStatus === CONSULTANT_CAPACITY_STATUSES.overloaded).length,
      underutilisedConsultants: performanceRows.filter((row) => row.capacityStatus === CONSULTANT_CAPACITY_STATUSES.light).length,
      averageActiveApplications: average(activeRows.map((row) => row.activeApplications)),
      highestWorkloadConsultant: sortedByWorkload[0] || null,
      lowestWorkloadConsultant: [...sortedByWorkload].reverse()[0] || null,
    },
    rows: performanceRows,
  }
}

export function getPartnerNetworkHealth(context = {}, options = {}) {
  const rows = getRows(context, options)
  assertHQAccess(rows)
  const healthRows = getPartnerHealth(context, options).rows
  const applicationsByPartner = groupBy(rows.applications, (row) => getApplicationPartnerId(row) || getApplicationPartnerName(row))
  const branchById = new Map(rows.branches.map((branch) => [getBranchId(branch), branch]))
  const regionById = new Map(rows.regions.map((region) => [getRegionId(region), region]))
  const partnerById = new Map(rows.partners.map((partner) => [getPartnerId(partner) || getPartnerName(partner), partner]))
  const table = healthRows.map((health) => {
    const key = health.partnerId || health.partnerName
    const applications = applicationsByPartner.get(key) || []
    const firstApplication = applications[0] || {}
    const branch = branchById.get(getApplicationBranchId(firstApplication)) || {}
    const region = regionById.get(getApplicationRegionId(firstApplication) || getBranchRegionId(branch)) || {}
    const submitted = applications.filter(isSubmittedApplication)
    const approved = applications.filter(isApprovedApplication)
    const requests = rows.requests.filter((row) => normalizeText(row.partnerId || row.partner_id || row.partnerName || row.partner_name) === key)
    const partner = partnerById.get(key) || {}
    return {
      id: key,
      partnerId: key,
      partnerName: health.partnerName || getPartnerName(partner) || key,
      type: normalizeText(partner.type || health.type || 'Partner'),
      regionId: getRegionId(region),
      regionName: getRegionName(region),
      branchId: getBranchId(branch),
      branchName: getBranchName(branch),
      applications: applications.length,
      approvalRate: percent(approved.length, submitted.length || applications.length),
      healthScore: health.healthScore,
      escalations: requests.filter((row) => row.escalated || normalizeLower(row.priority) === 'urgent').length,
      status: health.status,
    }
  }).sort((left, right) => left.healthScore - right.healthScore)
  return {
    summary: {
      excellentPartners: table.filter((row) => row.status === NATIONAL_HEALTH_STATUSES.excellent).length,
      healthyPartners: table.filter((row) => row.status === NATIONAL_HEALTH_STATUSES.healthy).length,
      atRiskPartners: table.filter((row) => row.status === NATIONAL_HEALTH_STATUSES.atRisk).length,
      criticalPartners: table.filter((row) => row.status === NATIONAL_HEALTH_STATUSES.critical).length,
    },
    rows: table,
  }
}

function buildHotspotRow(key = '', items = [], label = key, type = '') {
  const now = new Date()
  const breaches = items.filter((row) => requestIsBreached(row, now)).length
  const escalations = items.filter((row) => row.escalated || normalizeLower(row.priority) === 'urgent').length
  const openRequests = items.filter((row) => !requestIsResolved(row)).length
  return {
    id: `${type}-${key}`,
    type,
    name: label,
    openRequests,
    slaBreaches: breaches,
    escalations,
    averageFirstResponse: average(items.map((row) => hoursBetween(row.createdAt || row.created_at, row.firstResponseAt || row.first_response_at || row.respondedAt || row.responded_at))),
    averageResolutionTime: average(items.filter((row) => row.resolvedAt || row.resolved_at).map((row) => hoursBetween(row.createdAt || row.created_at, row.resolvedAt || row.resolved_at))),
    riskScore: breaches * 10 + escalations * 15 + openRequests * 3,
    riskLevel: getRiskLevel(breaches * 10 + escalations * 15 + openRequests * 3),
  }
}

export function getSLAHotspots(context = {}, options = {}) {
  const rows = getRows(context, options)
  assertHQAccess(rows)
  const now = options.now ? new Date(options.now) : new Date()
  const openRows = rows.requests.filter((row) => !requestIsResolved(row))
  const breachedRows = rows.requests.filter((row) => requestIsBreached(row, now))
  const escalationRows = rows.requests.filter((row) => row.escalated || normalizeLower(row.priority) === 'urgent')
  const byRegion = [...groupBy(rows.requests, (row) => row.regionId || row.region_id).entries()].map(([key, items]) => buildHotspotRow(key, items, labelForId(key, rows.regions, getRegionId, getRegionName), 'Region'))
  const byBranch = [...groupBy(rows.requests, (row) => row.branchId || row.branch_id).entries()].map(([key, items]) => buildHotspotRow(key, items, labelForId(key, rows.branches, getBranchId, getBranchName), 'Branch'))
  const byConsultant = [...groupBy(rows.requests, (row) => row.ownerConsultantId || row.owner_consultant_id || row.ownerUserId || row.owner_user_id).entries()].map(([key, items]) => buildHotspotRow(key, items, normalizeText(items[0]?.ownerName || items[0]?.owner_name) || key, 'Consultant'))
  const byPartner = [...groupBy(rows.requests, (row) => row.partnerId || row.partner_id || row.partnerName || row.partner_name).entries()].map(([key, items]) => buildHotspotRow(key, items, normalizeText(items[0]?.partnerName || items[0]?.partner_name) || key, 'Partner'))
  const combined = [...byRegion, ...byBranch, ...byConsultant, ...byPartner].sort((left, right) => right.riskScore - left.riskScore)
  return {
    metrics: {
      totalOpenRequests: openRows.length,
      slaBreaches: breachedRows.length,
      escalations: escalationRows.length,
      averageFirstResponse: average(rows.requests.map((row) => hoursBetween(row.createdAt || row.created_at, row.firstResponseAt || row.first_response_at || row.respondedAt || row.responded_at))),
      averageResolutionTime: average(rows.requests.filter((row) => row.resolvedAt || row.resolved_at).map((row) => hoursBetween(row.createdAt || row.created_at, row.resolvedAt || row.resolved_at))),
    },
    byRegion,
    byBranch,
    byConsultant,
    byPartner,
    topSLARiskAreas: combined.filter((row) => row.slaBreaches > 0).slice(0, 5),
    topEscalationHotspots: combined.filter((row) => row.escalations > 0).sort((left, right) => right.escalations - left.escalations).slice(0, 5),
  }
}

function pipelineStage(id = '', label = '', applications = []) {
  const now = new Date()
  return {
    id,
    stage: label,
    count: applications.length,
    averageAge: average(applications.map((row) => daysBetween(row.updatedAt || row.updated_at || row.createdAt || row.created_at, now.toISOString()))),
    riskLevel: getRiskLevel(applications.length * 8),
  }
}

export function getApplicationPipelineOverview(context = {}, options = {}) {
  const rows = getRows(context, options)
  assertHQAccess(rows)
  const documentsRequestedApplications = rows.documentRequests.map((request) => rows.applications.find((application) => getApplicationId(application) === getDocumentApplicationId(request))).filter(Boolean)
  const documentsReceivedApplications = rows.documents.map((document) => rows.applications.find((application) => getApplicationId(application) === getDocumentApplicationId(document))).filter(Boolean)
  const documentsReviewedApplications = rows.documents
    .filter((document) => ['reviewed', 'approved', 'accepted'].includes(normalizeLower(document.status)))
    .map((document) => rows.applications.find((application) => getApplicationId(application) === getDocumentApplicationId(document)))
    .filter(Boolean)
  return [
    pipelineStage('documents-requested', 'Documents Requested', documentsRequestedApplications),
    pipelineStage('documents-received', 'Documents Received', documentsReceivedApplications),
    pipelineStage('documents-reviewed', 'Documents Reviewed', documentsReviewedApplications),
    pipelineStage('applications-submitted', 'Applications Submitted', rows.applications.filter(isSubmittedApplication)),
    pipelineStage('feedback-received', 'Feedback Received', rows.applications.filter((row) => getSignal(row).includes('feedback'))),
    pipelineStage('quote-approved', 'Quote Approved', rows.applications.filter((row) => getSignal(row).includes('quote') && isApprovedApplication(row))),
    pipelineStage('instruction-sent', 'Instruction Sent', rows.applications.filter((row) => getSignal(row).includes('instruction'))),
    pipelineStage('declined', 'Declined', rows.applications.filter(isDeclinedApplication)),
  ]
}

export function getBankPerformanceSnapshot(context = {}, options = {}) {
  const rows = getRows(context, options)
  assertHQAccess(rows)
  const banks = getActiveOriginatorBanks(rows.workspaceKey, context, options)
  return banks.map((bank) => {
    const applications = rows.applications.filter((row) => getBanksForApplication(row).includes(bank.bankId))
    const submitted = applications.filter(isSubmittedApplication)
    const approved = applications.filter(isApprovedApplication)
    const declined = applications.filter(isDeclinedApplication)
    return {
      id: bank.bankId,
      bankId: bank.bankId,
      bank: bank.bankName,
      applicationsSubmitted: submitted.length,
      approvals: approved.length,
      declines: declined.length,
      approvalRate: percent(approved.length, submitted.length || applications.length),
      averageResponseTime: average(applications.map(getApplicationResponseHours)),
      instructionCount: applications.filter((row) => getSignal(row).includes('instruction')).length,
    }
  })
}

export function getExecutiveForecast(context = {}, options = {}) {
  const rows = getRows(context, options)
  assertHQAccess(rows)
  const now = options.now ? new Date(options.now) : new Date()
  const recentApplications = rows.applications.filter((row) => isWithinDays(row, 30, now)).length
  const resolvedApplications = rows.applications.filter((row) => ['registered', 'completed', 'approved'].some((term) => getSignal(row).includes(term))).length
  const averageDailyNewApplications = Math.round((recentApplications / 30) * 10) / 10
  const averageResolutionRate = Math.round((resolvedApplications / 30) * 10) / 10
  const approvalRate = percent(rows.applications.filter(isApprovedApplication).length, rows.applications.filter(isSubmittedApplication).length || rows.applications.length)
  const consultantRows = getConsultantPerformanceRows(context, options)
  const capacityRisk = average(consultantRows.map((row) => row.capacityScore))
  const openRequests = rows.requests.filter((row) => !requestIsResolved(row)).length
  const slaBreaches = rows.requests.filter((row) => requestIsBreached(row, now)).length
  const forecast = [7, 30, 90].map((days) => {
    const expectedApplications = Math.max(0, Math.round(rows.applications.filter(isActiveApplication).length + averageDailyNewApplications * days - averageResolutionRate * days))
    const expectedApprovals = Math.round(expectedApplications * (approvalRate / 100))
    const expectedCapacityRiskScore = clamp(capacityRisk + averageDailyNewApplications * days * 0.5 + openRequests * 0.3)
    const expectedSLARiskScore = clamp(slaBreaches * 8 + openRequests * 1.5 + days / 2)
    const requiredConsultants = Math.max(0, Math.ceil(Math.max(0, expectedApplications - consultantRows.length * 25) / 25))
    return {
      id: `forecast-${days}`,
      periodDays: days,
      expectedApplications,
      expectedApprovals,
      expectedCapacityRisk: getRiskLevel(expectedCapacityRiskScore),
      requiredConsultants,
      expectedSLARisk: getRiskLevel(expectedSLARiskScore),
      executiveForecastRisk: getRiskLevel(expectedCapacityRiskScore + expectedSLARiskScore),
    }
  })
  setLocalRows(LOCAL_FORECAST_STORE, rows.workspaceKey, [{ organisationId: rows.workspaceKey, forecast, updatedAt: new Date().toISOString() }])
  recordActivity(rows.workspaceKey, {
    eventType: BOND_HQ_COMMAND_CENTRE_EVENTS.hqForecastUpdated,
    sourceType: 'hq',
    sourceId: rows.workspaceKey,
    actorUserId: getActorId(context),
    newValue: forecast,
  })
  return forecast
}

function normalizeAlert(row = {}, workspaceKey = '') {
  return {
    id: normalizeText(row.id) || createId('executive-alert'),
    organisationId: normalizeText(row.organisationId || row.organisation_id || workspaceKey),
    alertType: normalizeText(row.alertType || row.alert_type || 'Operational Risk'),
    severity: normalizeText(row.severity || 'Medium'),
    title: normalizeText(row.title),
    description: normalizeText(row.description),
    sourceType: normalizeText(row.sourceType || row.source_type),
    sourceId: normalizeText(row.sourceId || row.source_id),
    status: normalizeText(row.status || 'open'),
    assignedTo: normalizeText(row.assignedTo || row.assigned_to),
    createdAt: normalizeText(row.createdAt || row.created_at) || new Date().toISOString(),
    dismissedAt: normalizeText(row.dismissedAt || row.dismissed_at),
    actions: ['View', 'Assign Follow-Up', 'Dismiss'],
  }
}

function upsertAlerts(workspaceKey = '', alerts = [], actorUserId = '') {
  const currentRows = getLocalRows(LOCAL_ALERT_STORE, workspaceKey)
  const byKey = new Map(currentRows.map((row) => [`${row.alertType}:${row.sourceType}:${row.sourceId}:${row.title}`, row]))
  const nextRows = [...currentRows]
  alerts.forEach((alert) => {
    const normalized = normalizeAlert(alert, workspaceKey)
    const key = `${normalized.alertType}:${normalized.sourceType}:${normalized.sourceId}:${normalized.title}`
    const existing = byKey.get(key)
    if (existing) return
    nextRows.unshift(normalized)
    recordActivity(workspaceKey, {
      eventType: BOND_HQ_COMMAND_CENTRE_EVENTS.executiveAlertCreated,
      sourceType: normalized.sourceType,
      sourceId: normalized.sourceId,
      actorUserId,
      newValue: normalized,
    })
  })
  setLocalRows(LOCAL_ALERT_STORE, workspaceKey, nextRows)
}

export function getExecutiveAlerts(context = {}, options = {}) {
  const rows = getRows(context, options)
  assertHQAccess(rows)
  const regionComparison = getRegionComparison(context, options)
  const branchComparison = getBranchNetworkComparison(context, options).allRows
  const partnerNetwork = getPartnerNetworkHealth(context, options)
  const capacity = getConsultantNetworkCapacity(context, options)
  const slaHotspots = getSLAHotspots(context, options)
  const banks = getBankPerformanceSnapshot(context, options)
  const generated = [
    ...regionComparison
      .filter((region) => ['At Risk', 'Critical'].includes(region.status))
      .map((region) => ({
        alertType: 'Regional Health',
        severity: region.status === 'Critical' ? 'High' : 'Medium',
        title: `${region.regionName} Region health is ${region.status}`,
        description: `${region.regionName} has national health score ${region.healthScore}.`,
        sourceType: 'region',
        sourceId: region.regionId,
      })),
    ...branchComparison
      .filter((branch) => branch.escalations >= 2 || branch.capacityRiskLevel === 'High' || branch.status === 'Critical')
      .map((branch) => ({
        alertType: 'Branch Risk',
        severity: branch.status === 'Critical' || branch.capacityRiskLevel === 'High' ? 'High' : 'Medium',
        title: `${branch.branchName} requires executive attention`,
        description: `${branch.branchName} has ${branch.escalations} escalation${branch.escalations === 1 ? '' : 's'} and ${branch.capacityRiskLevel.toLowerCase()} capacity risk.`,
        sourceType: 'branch',
        sourceId: branch.branchId,
      })),
    ...partnerNetwork.rows
      .filter((partner) => ['At Risk', 'Critical'].includes(partner.status) || partner.escalations > 0)
      .map((partner) => ({
        alertType: 'Partner Health',
        severity: partner.status === 'Critical' ? 'High' : 'Medium',
        title: `${partner.partnerName} partner health is ${partner.status}`,
        description: `${partner.partnerName} has health score ${partner.healthScore} with ${partner.escalations} escalation${partner.escalations === 1 ? '' : 's'}.`,
        sourceType: 'partner',
        sourceId: partner.partnerId,
      })),
    ...(capacity.metrics.overloadedConsultants > 0 ? [{
      alertType: 'Consultant Capacity',
      severity: capacity.metrics.overloadedConsultants >= 5 ? 'High' : 'Medium',
      title: `${capacity.metrics.overloadedConsultants} consultant${capacity.metrics.overloadedConsultants === 1 ? '' : 's'} overloaded nationally`,
      description: `${capacity.metrics.overloadedConsultants} consultant${capacity.metrics.overloadedConsultants === 1 ? ' is' : 's are'} operating above capacity thresholds.`,
      sourceType: 'consultant_network',
      sourceId: rows.workspaceKey,
    }] : []),
    ...slaHotspots.topSLARiskAreas.map((area) => ({
      alertType: 'SLA Risk',
      severity: area.riskLevel === 'High' ? 'High' : 'Medium',
      title: `${area.name} has ${area.slaBreaches} SLA breach${area.slaBreaches === 1 ? '' : 'es'}`,
      description: `${area.type} hotspot ${area.name} has ${area.openRequests} open request${area.openRequests === 1 ? '' : 's'}.`,
      sourceType: normalizeLower(area.type),
      sourceId: area.id,
    })),
    ...banks
      .filter((bank) => bank.averageResponseTime >= 48)
      .map((bank) => ({
        alertType: 'Bank Response',
        severity: bank.averageResponseTime >= 72 ? 'High' : 'Medium',
        title: `${bank.bank} response time increased`,
        description: `${bank.bank} average response time is ${bank.averageResponseTime}h.`,
        sourceType: 'bank',
        sourceId: bank.bank,
      })),
  ]
  upsertAlerts(rows.workspaceKey, generated, getActorId(context))
  return getLocalRows(LOCAL_ALERT_STORE, rows.workspaceKey)
    .filter((row) => row.status !== 'dismissed')
    .sort((left, right) => normalizeText(right.createdAt).localeCompare(normalizeText(left.createdAt)))
}

export function dismissExecutiveAlert(alertId = '', context = {}, options = {}) {
  const rows = getRows(context, options)
  assertHQAccess(rows)
  const alerts = getLocalRows(LOCAL_ALERT_STORE, rows.workspaceKey)
  const safeId = normalizeText(alertId)
  const existing = alerts.find((row) => row.id === safeId)
  if (!existing) {
    const error = new Error('Executive alert not found.')
    error.code = 'not_found'
    throw error
  }
  const updated = { ...existing, status: 'dismissed', dismissedAt: new Date().toISOString() }
  setLocalRows(LOCAL_ALERT_STORE, rows.workspaceKey, alerts.map((row) => (row.id === safeId ? updated : row)))
  recordActivity(rows.workspaceKey, {
    eventType: BOND_HQ_COMMAND_CENTRE_EVENTS.executiveAlertDismissed,
    sourceType: updated.sourceType,
    sourceId: updated.sourceId,
    actorUserId: getActorId(context),
    previousValue: existing,
    newValue: updated,
  })
  return updated
}

export function assignExecutiveAlert(alertId = '', assignedTo = '', context = {}, options = {}) {
  const rows = getRows(context, options)
  assertHQAccess(rows)
  const alerts = getLocalRows(LOCAL_ALERT_STORE, rows.workspaceKey)
  const safeId = normalizeText(alertId)
  const existing = alerts.find((row) => row.id === safeId)
  if (!existing) {
    const error = new Error('Executive alert not found.')
    error.code = 'not_found'
    throw error
  }
  const updated = { ...existing, assignedTo: normalizeText(assignedTo) || getActorId(context) }
  setLocalRows(LOCAL_ALERT_STORE, rows.workspaceKey, alerts.map((row) => (row.id === safeId ? updated : row)))
  return updated
}

export function getCommercialSnapshot(context = {}, options = {}) {
  const rows = getRows(context, options)
  assertHQAccess(rows)
  const billedApplications = rows.applications.filter((row) => isSubmittedApplication(row) || isApprovedApplication(row))
  const revenuePerApplication = Number(options.revenuePerApplication || 2500)
  const estimateRows = billedApplications.map((row) => ({ ...row, estimatedRevenue: Number(row.estimatedRevenue || row.estimated_revenue || revenuePerApplication) }))
  const revenueBy = (items, getter, labelGetter) => [...groupBy(estimateRows, getter).entries()].map(([id, applications]) => ({
    id,
    name: labelGetter(id, applications),
    applications: applications.length,
    estimatedRevenue: applications.reduce((sum, row) => sum + Number(row.estimatedRevenue || revenuePerApplication), 0),
  })).sort((left, right) => right.estimatedRevenue - left.estimatedRevenue)
  return {
    estimatedRevenue: estimateRows.reduce((sum, row) => sum + Number(row.estimatedRevenue || revenuePerApplication), 0),
    applicationsBilled: billedApplications.length,
    revenueByRegion: revenueBy(estimateRows, getApplicationRegionId, (id) => labelForId(id, rows.regions, getRegionId, getRegionName)),
    revenueByPartner: revenueBy(estimateRows, (row) => getApplicationPartnerId(row) || getApplicationPartnerName(row), (id, applications) => getApplicationPartnerName(applications[0]) || id),
    revenueByBranch: revenueBy(estimateRows, getApplicationBranchId, (id) => labelForId(id, rows.branches, getBranchId, getBranchName)),
  }
}

export function generateExecutiveReport(format = 'PDF', context = {}, options = {}) {
  const rows = getRows(context, options)
  assertHQAccess(rows)
  const safeFormat = normalizeText(format || options.format || 'PDF').toUpperCase() === 'EXCEL' ? 'Excel' : 'PDF'
  const report = {
    id: createId('executive-report'),
    organisationId: rows.workspaceKey,
    period: normalizeText(options.period) || new Date().toISOString().slice(0, 7),
    format: safeFormat,
    generatedBy: getActorId(context),
    fileUrl: `/reports/bond/hq-command-centre/${rows.workspaceKey}/${Date.now()}.${safeFormat === 'Excel' ? 'xlsx' : 'pdf'}`,
    sections: EXECUTIVE_REPORT_SECTIONS,
    summary: {
      executiveSummary: buildNationalMetrics(rows, context, options),
      nationalHealth: calculateNationalHealth(context, options),
      regionComparison: getRegionComparison(context, options).slice(0, 10),
      branchComparison: getBranchNetworkComparison(context, options).allRows.slice(0, 10),
      partnerHealth: getPartnerNetworkHealth(context, options).summary,
      consultantCapacity: getConsultantNetworkCapacity(context, options).metrics,
      slaPerformance: getSLAHotspots(context, options).metrics,
      forecast: getExecutiveForecast(context, options),
      commercialSnapshot: getCommercialSnapshot(context, options),
    },
    createdAt: new Date().toISOString(),
  }
  setLocalRows(LOCAL_REPORT_STORE, rows.workspaceKey, [report, ...getLocalRows(LOCAL_REPORT_STORE, rows.workspaceKey)])
  recordActivity(rows.workspaceKey, {
    eventType: BOND_HQ_COMMAND_CENTRE_EVENTS.executiveReportGenerated,
    sourceType: 'report',
    sourceId: report.id,
    actorUserId: getActorId(context),
    newValue: report,
  })
  return report
}

export function getHQActivityFeed(context = {}, options = {}) {
  const rows = getRows(context, options)
  assertHQAccess(rows)
  const now = options.now ? new Date(options.now) : new Date()
  const localRows = getLocalRows(LOCAL_ACTIVITY_STORE, rows.workspaceKey).map((row) => ({ ...row, label: row.eventType.replaceAll('_', ' ') }))
  const alertRows = getLocalRows(LOCAL_ALERT_STORE, rows.workspaceKey).map((row) => ({
    id: `alert-${row.id}`,
    eventType: BOND_HQ_COMMAND_CENTRE_EVENTS.executiveAlertCreated,
    label: row.title,
    sourceType: row.sourceType,
    sourceId: row.sourceId,
    createdAt: row.createdAt,
  }))
  const feed = [...localRows, ...alertRows].sort((left, right) => normalizeText(right.createdAt).localeCompare(normalizeText(left.createdAt)))
  return {
    today: feed.filter((row) => isWithinDays(row, 1, now)),
    thisWeek: feed.filter((row) => isWithinDays(row, 7, now)),
    thisMonth: feed.filter((row) => isWithinDays(row, 30, now)),
  }
}

export function getHQCommandCentreDashboard(context = {}, options = {}) {
  const rows = getRows(context, options)
  assertHQAccess(rows)
  const summaryMetrics = buildNationalMetrics(rows, context, options)
  const health = calculateNationalHealth(context, options)
  const regionComparison = getRegionComparison(context, options)
  const branchNetwork = getBranchNetworkComparison(context, options)
  const consultantCapacity = getConsultantNetworkCapacity(context, options)
  const partnerNetwork = getPartnerNetworkHealth(context, options)
  const slaHotspots = getSLAHotspots(context, options)
  const pipeline = getApplicationPipelineOverview(context, options)
  const bankPerformance = getBankPerformanceSnapshot(context, options)
  const forecast = getExecutiveForecast(context, options)
  const alerts = getExecutiveAlerts(context, options)
  const commercialSnapshot = getCommercialSnapshot(context, options)
  return {
    scope: rows.scope,
    summary: {
      totalApplications: summaryMetrics.totalApplications,
      activeApplications: summaryMetrics.activeApplications,
      applicationsSubmittedThisMonth: summaryMetrics.applicationsSubmittedThisMonth,
      approvalRate: summaryMetrics.approvalRate,
      instructionSent: summaryMetrics.instructionSent,
      averageTurnaround: summaryMetrics.averageTurnaround,
      slaCompliance: summaryMetrics.slaCompliance,
      partnerHealthScore: summaryMetrics.partnerHealthScore,
      consultantCapacityRisk: summaryMetrics.consultantCapacityRisk,
      forecastedVolume: summaryMetrics.forecastedVolume,
    },
    health,
    executiveKPIs: {
      applications: summaryMetrics.totalApplications,
      approvals: summaryMetrics.approved.length,
      approvalRate: summaryMetrics.approvalRate,
      slaCompliance: summaryMetrics.slaCompliance,
      partnerHealth: summaryMetrics.partnerHealthScore,
      capacityRisk: summaryMetrics.consultantCapacityRisk,
      escalations: summaryMetrics.escalations,
      forecastRisk: summaryMetrics.forecastRisk,
    },
    regionComparison,
    branchNetwork,
    consultantCapacity,
    partnerNetwork,
    slaHotspots,
    pipeline,
    bankPerformance,
    forecast,
    alerts,
    commercialSnapshot,
    activityFeed: getHQActivityFeed(context, options),
  }
}

export const __bondHQCommandCentreServiceTestUtils = Object.freeze({
  clearStores() {
    LOCAL_HEALTH_SNAPSHOT_STORE.clear()
    LOCAL_FORECAST_STORE.clear()
    LOCAL_ALERT_STORE.clear()
    LOCAL_REPORT_STORE.clear()
    LOCAL_ACTIVITY_STORE.clear()
    localSequence = 0
  },
  seedAlerts(workspaceId = '', rows = []) {
    setLocalRows(LOCAL_ALERT_STORE, normalizeText(workspaceId || 'default'), rows.map((row) => normalizeAlert(row, workspaceId)))
  },
  getHealthSnapshots(workspaceId = '') {
    return getLocalRows(LOCAL_HEALTH_SNAPSHOT_STORE, normalizeText(workspaceId || 'default'))
  },
  getForecasts(workspaceId = '') {
    return getLocalRows(LOCAL_FORECAST_STORE, normalizeText(workspaceId || 'default'))
  },
  getAlerts(workspaceId = '') {
    return getLocalRows(LOCAL_ALERT_STORE, normalizeText(workspaceId || 'default'))
  },
  getReports(workspaceId = '') {
    return getLocalRows(LOCAL_REPORT_STORE, normalizeText(workspaceId || 'default'))
  },
  getActivity(workspaceId = '') {
    return getLocalRows(LOCAL_ACTIVITY_STORE, normalizeText(workspaceId || 'default'))
  },
})
