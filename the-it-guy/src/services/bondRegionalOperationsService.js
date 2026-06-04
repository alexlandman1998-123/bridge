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
  calculateBranchHealth,
  getBranchForecast,
  getEscalations as getBranchEscalations,
  getPartnerOperations as getBranchPartnerOperations,
} from './bondBranchOperationsService'
import { CONSULTANT_CAPACITY_STATUSES, getConsultantPerformanceRows } from './bondConsultantPerformanceService'
import { getPartnerHealth } from './bondPartnerIntelligenceService'
import { getPartnerPortalOperationalRows } from './bondPartnerPortalService'

export const BOND_REGIONAL_OPERATIONS_EVENTS = Object.freeze({
  regionalHealthUpdated: 'REGIONAL_HEALTH_UPDATED',
  regionalTargetSet: 'REGIONAL_TARGET_SET',
  regionalTargetUpdated: 'REGIONAL_TARGET_UPDATED',
  regionalForecastUpdated: 'REGIONAL_FORECAST_UPDATED',
  regionalInterventionCreated: 'REGIONAL_INTERVENTION_CREATED',
  regionalCapacityAlert: 'REGIONAL_CAPACITY_ALERT',
})

export const REGIONAL_HEALTH_STATUSES = Object.freeze({
  excellent: 'Excellent',
  healthy: 'Healthy',
  atRisk: 'At Risk',
  critical: 'Critical',
})

const LOCAL_TARGET_STORE = new Map()
const LOCAL_ACTIVITY_STORE = new Map()
const LOCAL_HEALTH_SNAPSHOT_STORE = new Map()
const LOCAL_FORECAST_STORE = new Map()
let localSequence = 0

const RESOLVED_STATUSES = new Set([BOND_PARTNER_REQUEST_STATUSES.resolved, BOND_PARTNER_REQUEST_STATUSES.closed])
const APPROVAL_TERMS = ['approved', 'approval', 'grant', 'registered', 'accepted']
const SUBMITTED_TERMS = ['submitted', 'bank', 'feedback', 'quote', 'approved', 'declined', 'registered']
const ACTIVE_TERMS = ['active', 'new', 'intake', 'pre', 'document', 'review', 'submit', 'feedback', 'bank', 'quote', 'instruction', 'in_progress', 'prepared']
const DEFAULT_REGIONAL_TARGETS = Object.freeze({
  applicationTarget: 120,
  approvalTarget: 70,
  slaTarget: 90,
  partnerHealthTarget: 75,
  growthTarget: 10,
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

function createId(prefix = 'regional-operations') {
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
    id: event.id || createId('regional-operations-activity'),
    eventType: normalizeText(event.eventType),
    regionId: normalizeText(event.regionId),
    branchId: normalizeText(event.branchId),
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
  return normalizeLower(`${row.status || ''} ${row.stage || ''} ${row.financeStatus || ''} ${row.finance_status || ''} ${row.financeStageKey || ''} ${row.finance_stage_key || ''} ${row.financeStageLabel || ''} ${row.registrationStatus || ''} ${row.nextAction || ''} ${row.next_action || ''} ${row.documentStatus || ''} ${row.document_status || ''}`)
}

function includesSignal(row = {}, terms = []) {
  const signal = getSignal(row)
  return terms.some((term) => signal.includes(term))
}

function isApprovedApplication(row = {}) {
  return includesSignal(row, APPROVAL_TERMS)
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

function isPendingDocuments(row = {}) {
  const signal = getSignal(row)
  return Boolean(row.documents_missing || row.documentsMissing || row.missingDocumentsCount || row.missing_documents_count) ||
    signal.includes('doc') ||
    signal.includes('payslip') ||
    signal.includes('statement') ||
    signal.includes('missing')
}

function isAwaitingBankFeedback(row = {}) {
  const signal = getSignal(row)
  return Boolean(row.bank_feedback_pending || row.bankFeedbackPending) || signal.includes('bank') || signal.includes('feedback')
}

function isAwaitingSubmission(row = {}) {
  const signal = getSignal(row)
  return signal.includes('awaiting submission') || signal.includes('ready to submit') || signal.includes('pre-submission') || signal.includes('intake')
}

function isAwaitingReview(row = {}) {
  const signal = getSignal(row)
  return signal.includes('review') || signal.includes('quality check') || signal.includes('qc')
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

function getBranchManagerName(row = {}) {
  return normalizeText(row.managerName || row.manager_name || row.branchManager || row.branch_manager || row.manager || 'Branch Manager')
}

function getRegionId(row = {}) {
  return normalizeText(row.id || row.regionId || row.region_id)
}

function getRegionName(row = {}) {
  return normalizeText(row.name || row.regionName || row.region_name || row.label || getRegionId(row)) || 'Region'
}

function getConsultantBranchId(row = {}) {
  return normalizeText(row.branchId || row.branch_id || row.workspaceUnitId || row.workspace_unit_id || row.primaryBranchId || row.primary_branch_id)
}

function valueInScope(value = '', scopedIds) {
  if (scopedIds === ALL_BOND_ORGANISATION_SCOPE) return true
  return normalizeArray(scopedIds).includes(normalizeText(value))
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

function getDocumentApplicationId(row = {}) {
  return normalizeText(row.applicationId || row.application_id || row.transactionId || row.transaction_id)
}

function assertRegionalAccess(rows = {}) {
  if (![BOND_ORGANISATION_LEVELS.hq, BOND_ORGANISATION_LEVELS.region].includes(rows.scope.scopeLevel)) {
    const error = new Error('Only HQ and regional managers can access regional operations.')
    error.code = 'permission_denied'
    throw error
  }
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

function isRegionVisible(region = {}, scope = {}) {
  if (scope.scopeLevel === BOND_ORGANISATION_LEVELS.hq) return true
  if (scope.scopeLevel === BOND_ORGANISATION_LEVELS.region) return valueInScope(getRegionId(region), scope.regionIds)
  return false
}

function getRows(context = {}, options = {}) {
  const workspaceKey = getWorkspaceKey(context, options)
  const operationalRows = getPartnerPortalOperationalRows(context, { ...options, workspaceId: workspaceKey })
  const rawApplications = normalizeArray(operationalRows.applications)
  const rawBranches = normalizeArray(options.branches || options.units || operationalRows.branches || operationalRows.units)
  const rawRegions = normalizeArray(options.regions || operationalRows.regions)
  const regionsSource = rawRegions.length ? rawRegions : deriveRegionsFromBranches(rawBranches, rawApplications)
  const consultants = normalizeArray(options.consultants || options.users || operationalRows.consultants || operationalRows.users)
  const scope = resolveBondOrganisationScope(context, {
    regions: regionsSource,
    branches: rawBranches,
    consultants,
    applications: rawApplications,
  })
  const regions = regionsSource.filter((row) => isRegionVisible(row, scope))
  const regionIds = new Set(regions.map(getRegionId))
  const branches = rawBranches.filter((row) => regionIds.has(getBranchRegionId(row)))
  const branchIds = new Set(branches.map(getBranchId))
  const applications = rawApplications.filter((row) => regionIds.has(getApplicationRegionId(row)) || branchIds.has(getApplicationBranchId(row)))
  const applicationIds = new Set(applications.map(getApplicationId))
  const requests = getPartnerRequests(context, { ...options, workspaceId: workspaceKey })
    .filter((row) => regionIds.has(normalizeText(row.regionId || row.region_id)) || branchIds.has(normalizeText(row.branchId || row.branch_id)) || applicationIds.has(normalizeText(row.applicationId || row.application_id)))
  const documents = normalizeArray(operationalRows.documents).filter((row) => applicationIds.has(getDocumentApplicationId(row)))
  const documentRequests = normalizeArray(operationalRows.documentRequests).filter((row) => applicationIds.has(getDocumentApplicationId(row)))
  return {
    workspaceKey,
    scope,
    regions,
    allRegions: regionsSource,
    branches,
    applications,
    requests,
    consultants,
    documents,
    documentRequests,
    partners: normalizeArray(operationalRows.partners || options.partners),
  }
}

function assertRegionAccess(regionId = '', rows = {}) {
  assertRegionalAccess(rows)
  const safeId = normalizeText(regionId) || getRegionId(rows.regions[0] || {})
  const region = rows.regions.find((row) => getRegionId(row) === safeId)
  if (!region) {
    const error = new Error('Region is not available in the current scope.')
    error.code = 'permission_denied'
    throw error
  }
  return region
}

function getRegionBundle(regionId = '', rows = {}) {
  const safeId = normalizeText(regionId)
  const branches = rows.branches.filter((row) => getBranchRegionId(row) === safeId)
  const branchIds = new Set(branches.map(getBranchId))
  const applications = rows.applications.filter((row) => getApplicationRegionId(row) === safeId || branchIds.has(getApplicationBranchId(row)))
  const applicationIds = new Set(applications.map(getApplicationId))
  const requests = rows.requests.filter((row) => normalizeText(row.regionId || row.region_id) === safeId || branchIds.has(normalizeText(row.branchId || row.branch_id)) || applicationIds.has(normalizeText(row.applicationId || row.application_id)))
  const consultants = rows.consultants.filter((row) => branchIds.has(getConsultantBranchId(row)) || normalizeText(row.regionId || row.region_id) === safeId)
  const documents = rows.documents.filter((row) => applicationIds.has(getDocumentApplicationId(row)))
  const documentRequests = rows.documentRequests.filter((row) => applicationIds.has(getDocumentApplicationId(row)))
  return { branches, applications, requests, consultants, documents, documentRequests }
}

function withRegionContext(context = {}, rows = {}, regionId = '') {
  return {
    ...context,
    resolvedPermissionContext: {
      ...(context.resolvedPermissionContext || {}),
      userId: getActorId(context),
      workspaceId: rows.workspaceKey,
      scopeLevel: 'region',
      scopeLevelRaw: 'region',
      workspaceRole: 'regional_manager',
      regionId,
    },
  }
}

function branchOptions(options = {}, branchId = '') {
  return { ...options, branchId }
}

function getStatusForScore(score = 0) {
  if (score <= 39) return REGIONAL_HEALTH_STATUSES.critical
  if (score <= 59) return REGIONAL_HEALTH_STATUSES.atRisk
  if (score <= 79) return REGIONAL_HEALTH_STATUSES.healthy
  return REGIONAL_HEALTH_STATUSES.excellent
}

function getRiskLevel(score = 0) {
  if (score >= 70) return 'High'
  if (score >= 40) return 'Medium'
  return 'Low'
}

function getRegionPartnerHealth(regionId = '', context = {}, options = {}) {
  const rows = getRows(context, options)
  const bundle = getRegionBundle(regionId, rows)
  const partnerIds = new Set(bundle.applications.map(getApplicationPartnerId).filter(Boolean))
  const partnerNames = new Set(bundle.applications.map(getApplicationPartnerName).filter(Boolean))
  return getPartnerHealth(context, options).rows.filter((row) => partnerIds.has(row.partnerId) || partnerNames.has(row.partnerName))
}

function buildRegionalMetrics(regionId = '', context = {}, options = {}) {
  const rows = getRows(context, options)
  const region = assertRegionAccess(regionId, rows)
  const safeRegionId = getRegionId(region)
  const bundle = getRegionBundle(safeRegionId, rows)
  const now = options.now ? new Date(options.now) : new Date()
  const submitted = bundle.applications.filter(isSubmittedApplication)
  const approved = bundle.applications.filter(isApprovedApplication)
  const openRequests = bundle.requests.filter((row) => !requestIsResolved(row))
  const breaches = bundle.requests.filter((row) => requestIsBreached(row, now))
  const consultantRows = getConsultantPerformanceRows(withRegionContext(context, rows, safeRegionId), options)
  const partnerHealthRows = getRegionPartnerHealth(safeRegionId, context, options)
  const branchHealthRows = bundle.branches.map((branch) => {
    try {
      return calculateBranchHealth(getBranchId(branch), withRegionContext(context, rows, safeRegionId), branchOptions(options, getBranchId(branch)))
    } catch {
      return null
    }
  }).filter(Boolean)
  const forecastRows = bundle.branches.flatMap((branch) => {
    try {
      return getBranchForecast(getBranchId(branch), withRegionContext(context, rows, safeRegionId), branchOptions(options, getBranchId(branch)))
    } catch {
      return []
    }
  })
  return {
    region,
    regionId: safeRegionId,
    regionName: getRegionName(region),
    branches: bundle.branches,
    branchHealthRows,
    consultantRows,
    partnerHealthRows,
    bundle,
    activeApplications: bundle.applications.filter(isActiveApplication).length,
    applicationsSubmittedThisMonth: submitted.filter((row) => isWithinDays(row, 30, now)).length,
    approvals: approved.length,
    approvalRate: percent(approved.length, submitted.length || bundle.applications.length),
    openPartnerRequests: openRequests.length,
    slaBreaches: breaches.length,
    slaCompliance: bundle.requests.length ? percent(bundle.requests.length - breaches.length, bundle.requests.length) : 100,
    escalations: bundle.requests.filter((row) => row.escalated || normalizeLower(row.priority) === 'urgent').length,
    partnerHealthAverage: average(partnerHealthRows.map((row) => row.healthScore)),
    overloadedConsultants: consultantRows.filter((row) => row.capacityStatus === CONSULTANT_CAPACITY_STATUSES.overloaded).length,
    capacityRisk: average(consultantRows.map((row) => row.capacityScore)),
    forecastRisk: forecastRows.filter((row) => row.riskLevel === 'High').length,
  }
}

export function calculateRegionalHealth(regionId = '', context = {}, options = {}) {
  const rows = getRows(context, options)
  const region = assertRegionAccess(regionId, rows)
  const metrics = buildRegionalMetrics(getRegionId(region), context, options)
  const branchHealthScore = average(metrics.branchHealthRows.map((row) => row.score)) || 70
  const capacityScore = clamp(100 - metrics.capacityRisk * 2)
  const escalationScore = clamp(100 - metrics.escalations * 8)
  const forecastScore = clamp(100 - metrics.forecastRisk * 15)
  const partnerHealthScore = metrics.partnerHealthAverage || 70
  const score = clamp(
    branchHealthScore * 0.22 +
      partnerHealthScore * 0.16 +
      metrics.slaCompliance * 0.18 +
      metrics.approvalRate * 0.16 +
      escalationScore * 0.1 +
      capacityScore * 0.1 +
      forecastScore * 0.08,
  )
  const result = {
    regionId: metrics.regionId,
    regionName: metrics.regionName,
    score,
    status: getStatusForScore(score),
    components: {
      branchHealth: branchHealthScore,
      partnerHealth: partnerHealthScore,
      slaCompliance: metrics.slaCompliance,
      approvalRate: metrics.approvalRate,
      escalations: escalationScore,
      capacityRisk: capacityScore,
      forecastRisk: forecastScore,
    },
  }
  const previous = getLocalRows(LOCAL_HEALTH_SNAPSHOT_STORE, rows.workspaceKey).find((row) => row.regionId === result.regionId)
  if (!previous || previous.score !== result.score || previous.status !== result.status) {
    recordActivity(rows.workspaceKey, {
      eventType: BOND_REGIONAL_OPERATIONS_EVENTS.regionalHealthUpdated,
      regionId: result.regionId,
      actorUserId: getActorId(context),
      previousValue: previous || null,
      newValue: result,
    })
    setLocalRows(LOCAL_HEALTH_SNAPSHOT_STORE, rows.workspaceKey, [
      { ...result, updatedAt: new Date().toISOString() },
      ...getLocalRows(LOCAL_HEALTH_SNAPSHOT_STORE, rows.workspaceKey).filter((row) => row.regionId !== result.regionId),
    ])
  }
  return result
}

export function getBranchComparison(regionId = '', context = {}, options = {}) {
  const rows = getRows(context, options)
  const region = assertRegionAccess(regionId, rows)
  const safeRegionId = getRegionId(region)
  return getRegionBundle(safeRegionId, rows).branches.map((branch) => {
    const branchId = getBranchId(branch)
    const branchContext = withRegionContext(context, rows, safeRegionId)
    const health = calculateBranchHealth(branchId, branchContext, branchOptions(options, branchId))
    const branchApplications = rows.applications.filter((row) => getApplicationBranchId(row) === branchId)
    const submitted = branchApplications.filter(isSubmittedApplication)
    const approved = branchApplications.filter(isApprovedApplication)
    const branchRequests = rows.requests.filter((row) => normalizeText(row.branchId || row.branch_id) === branchId || branchApplications.some((app) => getApplicationId(app) === normalizeText(row.applicationId || row.application_id)))
    const breaches = branchRequests.filter((row) => requestIsBreached(row, options.now ? new Date(options.now) : new Date()))
    const partnerOps = getBranchPartnerOperations(branchId, branchContext, branchOptions(options, branchId))
    const consultantRows = getConsultantPerformanceRows(branchContext, options).filter((row) => row.branchId === branchId)
    const overloadedCount = consultantRows.filter((row) => row.capacityStatus === CONSULTANT_CAPACITY_STATUSES.overloaded).length
    const busyCount = consultantRows.filter((row) => row.capacityStatus === CONSULTANT_CAPACITY_STATUSES.busy).length
    const branchActiveApplications = branchApplications.filter(isActiveApplication).length
    const capacityRisk = clamp(Math.max(
      average(consultantRows.map((row) => row.capacityScore)) + overloadedCount * 20 + busyCount * 10,
      branchActiveApplications >= 41 ? 75 : branchActiveApplications >= 26 ? 45 : 0,
    ))
    return {
      id: branchId,
      branchId,
      branchName: getBranchName(branch),
      managerName: getBranchManagerName(branch),
      healthScore: health.score,
      status: health.status,
      applications: branchActiveApplications,
      submittedApplications: submitted.length,
      approvalRate: percent(approved.length, submitted.length || branchApplications.length),
      slaCompliance: branchRequests.length ? percent(branchRequests.length - breaches.length, branchRequests.length) : 100,
      partnerHealth: partnerOps.metrics.partnerHealth || 70,
      escalations: branchRequests.filter((row) => row.escalated || normalizeLower(row.priority) === 'urgent').length,
      capacityRisk,
      capacityRiskLevel: getRiskLevel(capacityRisk),
      turnaround: average(branchApplications.map((row) => daysBetween(row.createdAt || row.created_at, row.updatedAt || row.updated_at || row.submittedAt || row.submitted_at))),
      growth: Number(branch.growth || branch.growthRate || branch.growth_rate || 0),
    }
  })
}

export function getBranchRankings(regionId = '', context = {}, options = {}) {
  const rows = getBranchComparison(regionId, context, options)
  return {
    top10: [...rows].sort((left, right) => right.healthScore - left.healthScore).slice(0, 10),
    bottom10: [...rows].sort((left, right) => left.healthScore - right.healthScore).slice(0, 10),
    topApprovalRate: [...rows].sort((left, right) => right.approvalRate - left.approvalRate).slice(0, 10),
    topTurnaround: [...rows].sort((left, right) => left.turnaround - right.turnaround).slice(0, 10),
    topSLACompliance: [...rows].sort((left, right) => right.slaCompliance - left.slaCompliance).slice(0, 10),
    topPartnerSatisfaction: [...rows].sort((left, right) => right.partnerHealth - left.partnerHealth).slice(0, 10),
    topSubmissionVolume: [...rows].sort((left, right) => right.submittedApplications - left.submittedApplications).slice(0, 10),
    topGrowth: [...rows].sort((left, right) => right.growth - left.growth).slice(0, 10),
    mostImproved: [...rows].sort((left, right) => (right.healthScore - Number(right.previousHealthScore || 0)) - (left.healthScore - Number(left.previousHealthScore || 0))).slice(0, 10),
    mostAtRisk: rows.filter((row) => row.status === REGIONAL_HEALTH_STATUSES.critical || row.status === REGIONAL_HEALTH_STATUSES.atRisk || row.capacityRiskLevel === 'High'),
  }
}

export function getRegionalCapacity(regionId = '', context = {}, options = {}) {
  const rows = getRows(context, options)
  const region = assertRegionAccess(regionId, rows)
  const comparison = getBranchComparison(getRegionId(region), context, options)
  const consultantRows = getConsultantPerformanceRows(withRegionContext(context, rows, getRegionId(region)), options)
  return {
    metrics: {
      light: consultantRows.filter((row) => row.capacityStatus === CONSULTANT_CAPACITY_STATUSES.light).length,
      normal: consultantRows.filter((row) => row.capacityStatus === CONSULTANT_CAPACITY_STATUSES.normal).length,
      busy: consultantRows.filter((row) => row.capacityStatus === CONSULTANT_CAPACITY_STATUSES.busy).length,
      overloaded: consultantRows.filter((row) => row.capacityStatus === CONSULTANT_CAPACITY_STATUSES.overloaded).length,
    },
    rows: comparison.map((branch) => ({
      branchId: branch.branchId,
      branchName: branch.branchName,
      consultants: consultantRows.filter((row) => row.branchId === branch.branchId).length,
      capacityStatus: branch.capacityRiskLevel === 'High' ? 'Overloaded' : branch.capacityRiskLevel === 'Medium' ? 'Busy' : 'Normal',
      riskLevel: branch.capacityRiskLevel,
    })),
  }
}

export function getRegionalHeatmap(regionId = '', context = {}, options = {}) {
  const rows = getRows(context, options)
  const region = assertRegionAccess(regionId, rows)
  return getBranchComparison(getRegionId(region), context, options).map((branch) => {
    const branchApplications = rows.applications.filter((row) => getApplicationBranchId(row) === branch.branchId)
    const appIds = new Set(branchApplications.map(getApplicationId))
    const branchRequests = rows.requests.filter((row) => normalizeText(row.branchId || row.branch_id) === branch.branchId || appIds.has(normalizeText(row.applicationId || row.application_id)))
    const branchDocuments = rows.documents.filter((row) => appIds.has(getDocumentApplicationId(row))).length + rows.documentRequests.filter((row) => appIds.has(getDocumentApplicationId(row))).length
    return {
      branchId: branch.branchId,
      branchName: branch.branchName,
      applications: branch.applications,
      partnerRequests: branchRequests.filter((row) => !requestIsResolved(row)).length,
      documents: branchDocuments,
      escalations: branch.escalations,
      riskScore: branch.capacityRisk + branch.escalations * 5 + branchDocuments,
      riskLevel: getRiskLevel(branch.capacityRisk + branch.escalations * 5 + branchDocuments),
    }
  })
}

function bottleneckCount(rows = [], predicate = () => false, now = new Date()) {
  const items = rows.filter(predicate)
  return {
    count: items.length,
    averageDays: average(items.map((row) => daysBetween(row.updatedAt || row.updated_at || row.createdAt || row.created_at, now.toISOString()))),
    riskLevel: getRiskLevel(items.length * 12),
  }
}

export function getRegionalBottlenecks(regionId = '', context = {}, options = {}) {
  const rows = getRows(context, options)
  const region = assertRegionAccess(regionId, rows)
  const now = options.now ? new Date(options.now) : new Date()
  return getRegionBundle(getRegionId(region), rows).branches.flatMap((branch) => {
    const applications = rows.applications.filter((row) => getApplicationBranchId(row) === getBranchId(branch))
    return [
      { branchId: getBranchId(branch), branchName: getBranchName(branch), type: 'Awaiting Documents', ...bottleneckCount(applications, isPendingDocuments, now) },
      { branchId: getBranchId(branch), branchName: getBranchName(branch), type: 'Awaiting Review', ...bottleneckCount(applications, isAwaitingReview, now) },
      { branchId: getBranchId(branch), branchName: getBranchName(branch), type: 'Awaiting Submission', ...bottleneckCount(applications, isAwaitingSubmission, now) },
      { branchId: getBranchId(branch), branchName: getBranchName(branch), type: 'Awaiting Feedback', ...bottleneckCount(applications, isAwaitingBankFeedback, now) },
      { branchId: getBranchId(branch), branchName: getBranchName(branch), type: 'Awaiting Approval', ...bottleneckCount(applications, (row) => getSignal(row).includes('approval') && !isApprovedApplication(row), now) },
      { branchId: getBranchId(branch), branchName: getBranchName(branch), type: 'Awaiting Instruction', ...bottleneckCount(applications, (row) => getSignal(row).includes('instruction'), now) },
    ]
  })
}

export function getRegionalPartnerIntelligence(regionId = '', context = {}, options = {}) {
  const rows = getRows(context, options)
  const region = assertRegionAccess(regionId, rows)
  const safeRegionId = getRegionId(region)
  const partnerHealthRows = getRegionPartnerHealth(safeRegionId, context, options)
  const bundle = getRegionBundle(safeRegionId, rows)
  const branchById = new Map(bundle.branches.map((branch) => [getBranchId(branch), branch]))
  const applicationByPartner = new Map()
  bundle.applications.forEach((application) => {
    const key = getApplicationPartnerId(application) || getApplicationPartnerName(application)
    if (!key) return
    applicationByPartner.set(key, [...(applicationByPartner.get(key) || []), application])
  })
  const supportVolume = bundle.requests.length
  const rowsOut = [...applicationByPartner.entries()].map(([key, applications]) => {
    const health = partnerHealthRows.find((row) => row.partnerId === key || row.partnerName === key) || {}
    const submitted = applications.filter(isSubmittedApplication)
    const approved = applications.filter(isApprovedApplication)
    const branch = branchById.get(getApplicationBranchId(applications[0])) || {}
    const partnerRequests = bundle.requests.filter((row) => normalizeText(row.partnerId || row.partner_id || row.partnerName || row.partner_name) === key)
    return {
      id: key,
      partnerId: key,
      partnerName: health.partnerName || getApplicationPartnerName(applications[0]) || key,
      branchId: getBranchId(branch),
      branchName: getBranchName(branch),
      healthScore: health.healthScore || 70,
      satisfactionScore: health.satisfactionScore || health.healthScore || 70,
      applications: applications.length,
      approvalRate: percent(approved.length, submitted.length || applications.length),
      escalations: partnerRequests.filter((row) => row.escalated || normalizeLower(row.priority) === 'urgent').length,
      openRequests: partnerRequests.filter((row) => !requestIsResolved(row)).length,
      supportVolume: partnerRequests.length,
      status: health.status || 'Healthy',
    }
  })
  return {
    metrics: {
      partnerHealth: average(rowsOut.map((row) => row.healthScore)),
      partnerSatisfaction: average(rowsOut.map((row) => row.satisfactionScore)),
      escalations: rowsOut.reduce((sum, row) => sum + row.escalations, 0),
      openRequests: rowsOut.reduce((sum, row) => sum + row.openRequests, 0),
      supportVolume,
    },
    rows: rowsOut,
  }
}

export function getRegionalEscalations(regionId = '', context = {}, options = {}) {
  const rows = getRows(context, options)
  const region = assertRegionAccess(regionId, rows)
  const safeRegionId = getRegionId(region)
  const branchContext = withRegionContext(context, rows, safeRegionId)
  return getRegionBundle(safeRegionId, rows).branches.flatMap((branch) => {
    try {
      return getBranchEscalations(getBranchId(branch), branchContext, branchOptions(options, getBranchId(branch))).map((row) => ({
        ...row,
        branchId: getBranchId(branch),
        branchName: getBranchName(branch),
      }))
    } catch {
      return []
    }
  })
}

export function getBranchManagerPerformance(regionId = '', context = {}, options = {}) {
  const comparison = getBranchComparison(regionId, context, options)
  return comparison.map((branch) => {
    const targetAchievement = clamp((branch.approvalRate + branch.slaCompliance + branch.partnerHealth) / 3)
    const capacityManagement = clamp(100 - branch.capacityRisk * 2)
    const score = clamp(branch.healthScore * 0.35 + targetAchievement * 0.2 + branch.slaCompliance * 0.15 + branch.partnerHealth * 0.15 + capacityManagement * 0.1 + clamp(100 - branch.escalations * 10) * 0.05)
    return {
      id: branch.branchId,
      branchManager: branch.managerName,
      branchId: branch.branchId,
      branchName: branch.branchName,
      score,
      trend: score >= 75 ? 'Improving' : score >= 55 ? 'Stable' : 'Declining',
      branchHealth: branch.healthScore,
      targetAchievement,
      slaCompliance: branch.slaCompliance,
      partnerHealth: branch.partnerHealth,
      capacityManagement,
      escalationVolume: branch.escalations,
    }
  })
}

function normalizeTarget(row = {}, workspaceKey = '') {
  const period = normalizeText(row.period) || new Date().toISOString().slice(0, 7)
  return {
    id: normalizeText(row.id) || createId('regional-target'),
    organisationId: normalizeText(row.organisationId || row.organisation_id || workspaceKey),
    regionId: normalizeText(row.regionId || row.region_id),
    period,
    applicationTarget: Number(row.applicationTarget ?? row.application_target ?? DEFAULT_REGIONAL_TARGETS.applicationTarget),
    approvalTarget: Number(row.approvalTarget ?? row.approval_target ?? DEFAULT_REGIONAL_TARGETS.approvalTarget),
    slaTarget: Number(row.slaTarget ?? row.sla_target ?? DEFAULT_REGIONAL_TARGETS.slaTarget),
    partnerHealthTarget: Number(row.partnerHealthTarget ?? row.partner_health_target ?? DEFAULT_REGIONAL_TARGETS.partnerHealthTarget),
    growthTarget: Number(row.growthTarget ?? row.growth_target ?? DEFAULT_REGIONAL_TARGETS.growthTarget),
    createdBy: normalizeText(row.createdBy || row.created_by),
    createdAt: normalizeText(row.createdAt || row.created_at) || new Date().toISOString(),
    updatedAt: normalizeText(row.updatedAt || row.updated_at) || new Date().toISOString(),
  }
}

function getTargetKey(regionId = '', period = '') {
  return `${normalizeText(regionId)}:${normalizeText(period)}`
}

export function getRegionalTargets(regionId = '', context = {}, options = {}) {
  const rows = getRows(context, options)
  const region = assertRegionAccess(regionId, rows)
  const period = normalizeText(options.period) || ''
  return getLocalRows(LOCAL_TARGET_STORE, rows.workspaceKey)
    .filter((row) => row.regionId === getRegionId(region) && (!period || row.period === period))
    .sort((left, right) => normalizeText(right.period).localeCompare(normalizeText(left.period)))
}

export function setRegionalTargets(regionId = '', payload = {}, context = {}, options = {}) {
  const rows = getRows(context, options)
  const region = assertRegionAccess(regionId, rows)
  const safeRegionId = getRegionId(region)
  const period = normalizeText(payload.period || options.period) || new Date().toISOString().slice(0, 7)
  const currentRows = getLocalRows(LOCAL_TARGET_STORE, rows.workspaceKey)
  const existing = currentRows.find((row) => getTargetKey(row.regionId, row.period) === getTargetKey(safeRegionId, period))
  const normalized = normalizeTarget({
    ...existing,
    ...payload,
    regionId: safeRegionId,
    period,
    createdBy: existing?.createdBy || getActorId(context),
    createdAt: existing?.createdAt,
    updatedAt: new Date().toISOString(),
  }, rows.workspaceKey)
  setLocalRows(LOCAL_TARGET_STORE, rows.workspaceKey, [
    normalized,
    ...currentRows.filter((row) => getTargetKey(row.regionId, row.period) !== getTargetKey(safeRegionId, period)),
  ])
  recordActivity(rows.workspaceKey, {
    eventType: existing ? BOND_REGIONAL_OPERATIONS_EVENTS.regionalTargetUpdated : BOND_REGIONAL_OPERATIONS_EVENTS.regionalTargetSet,
    regionId: safeRegionId,
    actorUserId: getActorId(context),
    previousValue: existing || null,
    newValue: normalized,
  })
  return normalized
}

function getDefaultTarget(regionId = '', context = {}, options = {}) {
  return getRegionalTargets(regionId, context, options)[0] || normalizeTarget({ regionId, period: options.period }, getWorkspaceKey(context, options))
}

function getTargetProgress(regionId = '', context = {}, options = {}) {
  const metrics = buildRegionalMetrics(regionId, context, options)
  const target = getDefaultTarget(metrics.regionId, context, options)
  return {
    target,
    rows: [
      { id: 'applications', target: 'Applications', actual: metrics.applicationsSubmittedThisMonth, targetValue: target.applicationTarget, variance: metrics.applicationsSubmittedThisMonth - target.applicationTarget, progress: percent(metrics.applicationsSubmittedThisMonth, target.applicationTarget) },
      { id: 'approval', target: 'Approval Rate', actual: metrics.approvalRate, targetValue: target.approvalTarget, variance: metrics.approvalRate - target.approvalTarget, progress: percent(metrics.approvalRate, target.approvalTarget) },
      { id: 'sla', target: 'SLA Compliance', actual: metrics.slaCompliance, targetValue: target.slaTarget, variance: metrics.slaCompliance - target.slaTarget, progress: percent(metrics.slaCompliance, target.slaTarget) },
      { id: 'partner-health', target: 'Partner Health', actual: metrics.partnerHealthAverage, targetValue: target.partnerHealthTarget, variance: metrics.partnerHealthAverage - target.partnerHealthTarget, progress: percent(metrics.partnerHealthAverage, target.partnerHealthTarget) },
      { id: 'growth', target: 'Growth', actual: metrics.applicationsSubmittedThisMonth, targetValue: target.growthTarget, variance: metrics.applicationsSubmittedThisMonth - target.growthTarget, progress: percent(metrics.applicationsSubmittedThisMonth, target.growthTarget) },
    ],
  }
}

export function getRegionalForecast(regionId = '', context = {}, options = {}) {
  const rows = getRows(context, options)
  const region = assertRegionAccess(regionId, rows)
  const metrics = buildRegionalMetrics(getRegionId(region), context, options)
  const recentApplications = metrics.bundle.applications.filter((row) => isWithinDays(row, 30, options.now ? new Date(options.now) : new Date())).length
  const resolvedApplications = metrics.bundle.applications.filter((row) => ['registered', 'completed', 'approved'].some((term) => getSignal(row).includes(term))).length
  const averageDailyNewApplications = Math.round((recentApplications / 30) * 10) / 10
  const averageResolutionRate = Math.round((resolvedApplications / 30) * 10) / 10
  const forecast = [7, 30, 90].map((days) => {
    const expectedApplicationVolume = Math.max(0, Math.round(metrics.activeApplications + averageDailyNewApplications * days - averageResolutionRate * days))
    const capacityDemand = Math.max(0, Math.round(metrics.capacityRisk * metrics.consultantRows.length + averageDailyNewApplications * days + metrics.openPartnerRequests * 0.4 + metrics.escalations * 3))
    const escalationRisk = clamp(metrics.escalations * 15 + metrics.slaBreaches * 8 + (metrics.forecastRisk * 12))
    const riskLevel = getRiskLevel(capacityDemand + escalationRisk)
    return {
      periodDays: days,
      applicationGrowth: Math.round(averageDailyNewApplications * days),
      capacityDemand,
      consultantDemand: Math.max(0, Math.ceil(Math.max(0, capacityDemand - metrics.consultantRows.length * 25) / 25)),
      partnerGrowth: Math.max(0, Math.round(metrics.partnerHealthRows.length * (days / 90))),
      escalationRisk,
      expectedCapacityRisk: riskLevel,
      recommendedHeadcount: Math.max(0, Math.ceil(Math.max(0, capacityDemand - metrics.consultantRows.length * 25) / 25)),
      expectedApplicationVolume,
    }
  })
  setLocalRows(LOCAL_FORECAST_STORE, rows.workspaceKey, [
    { regionId: metrics.regionId, forecast, updatedAt: new Date().toISOString() },
    ...getLocalRows(LOCAL_FORECAST_STORE, rows.workspaceKey).filter((row) => row.regionId !== metrics.regionId),
  ])
  recordActivity(rows.workspaceKey, {
    eventType: BOND_REGIONAL_OPERATIONS_EVENTS.regionalForecastUpdated,
    regionId: metrics.regionId,
    actorUserId: getActorId(context),
    newValue: forecast,
  })
  forecast.filter((row) => row.expectedCapacityRisk === 'High').forEach((row) => {
    recordActivity(rows.workspaceKey, {
      eventType: BOND_REGIONAL_OPERATIONS_EVENTS.regionalCapacityAlert,
      regionId: metrics.regionId,
      actorUserId: getActorId(context),
      newValue: row,
    })
  })
  return forecast
}

export function getRegionalRecommendations(regionId = '', context = {}, options = {}) {
  const rows = getRows(context, options)
  const region = assertRegionAccess(regionId, rows)
  const safeRegionId = getRegionId(region)
  const comparison = getBranchComparison(safeRegionId, context, options)
  const partnerIntel = getRegionalPartnerIntelligence(safeRegionId, context, options)
  const recommendations = [
    ...comparison
      .filter((branch) => branch.capacityRiskLevel === 'High')
      .map((branch) => ({
        id: createId('regional-intervention'),
        type: 'Capacity',
        branchId: branch.branchId,
        branchName: branch.branchName,
        recommendation: `Add ${Math.max(1, Math.ceil(branch.capacityRisk / 35))} consultant${branch.capacityRisk >= 70 ? 's' : ''} to ${branch.branchName}.`,
        reason: `${branch.branchName} has ${branch.capacityRiskLevel.toLowerCase()} capacity risk.`,
        priority: 'High',
      })),
    ...comparison
      .filter((branch) => branch.healthScore < 60 || branch.escalations >= 2)
      .map((branch) => ({
        id: createId('regional-intervention'),
        type: 'Branch Support',
        branchId: branch.branchId,
        branchName: branch.branchName,
        recommendation: `Intervene with ${branch.branchName} branch manager.`,
        reason: `${branch.branchName} has health score ${branch.healthScore} and ${branch.escalations} escalation${branch.escalations === 1 ? '' : 's'}.`,
        priority: branch.healthScore < 40 ? 'High' : 'Medium',
      })),
    ...partnerIntel.rows
      .filter((partner) => partner.healthScore < 60 || partner.escalations > 0)
      .map((partner) => ({
        id: createId('regional-intervention'),
        type: 'Partner Risk',
        branchId: partner.branchId,
        branchName: partner.branchName,
        recommendation: `Investigate partner dissatisfaction at ${partner.partnerName}.`,
        reason: `${partner.partnerName} has health score ${partner.healthScore} with ${partner.escalations} escalation${partner.escalations === 1 ? '' : 's'}.`,
        priority: partner.healthScore < 40 ? 'High' : 'Medium',
      })),
  ]
  recommendations.forEach((recommendation) => {
    recordActivity(rows.workspaceKey, {
      eventType: BOND_REGIONAL_OPERATIONS_EVENTS.regionalInterventionCreated,
      regionId: safeRegionId,
      branchId: recommendation.branchId,
      actorUserId: getActorId(context),
      newValue: recommendation,
    })
  })
  return recommendations
}

export function getRegionalActivity(regionId = '', context = {}, options = {}) {
  const rows = getRows(context, options)
  const region = assertRegionAccess(regionId, rows)
  const safeRegionId = getRegionId(region)
  const activityRows = getLocalRows(LOCAL_ACTIVITY_STORE, rows.workspaceKey).filter((row) => row.regionId === safeRegionId)
  const escalationRows = getRegionalEscalations(safeRegionId, context, options).slice(0, 10).map((row) => ({
    id: `escalation-${row.id}`,
    eventType: 'ESCALATION',
    label: `${row.issue} at ${row.branchName}`,
    regionId: safeRegionId,
    branchId: row.branchId,
    createdAt: row.createdAt || new Date().toISOString(),
  }))
  const feed = [
    ...activityRows.map((row) => ({ ...row, label: row.eventType.replaceAll('_', ' ') })),
    ...escalationRows,
  ].sort((left, right) => normalizeText(right.createdAt).localeCompare(normalizeText(left.createdAt)))
  const now = options.now ? new Date(options.now) : new Date()
  return {
    today: feed.filter((row) => isWithinDays(row, 1, now)),
    thisWeek: feed.filter((row) => isWithinDays(row, 7, now)),
    thisMonth: feed.filter((row) => isWithinDays(row, 30, now)),
  }
}

export function getRegionalOperationsDashboard(context = {}, options = {}) {
  const rows = getRows(context, options)
  assertRegionalAccess(rows)
  const regionId = normalizeText(options.regionId || options.region_id) || getRegionId(rows.regions[0] || {})
  const region = assertRegionAccess(regionId, rows)
  const safeRegionId = getRegionId(region)
  const metrics = buildRegionalMetrics(safeRegionId, context, options)
  const health = calculateRegionalHealth(safeRegionId, context, options)
  const branchComparison = getBranchComparison(safeRegionId, context, options)
  const partnerIntelligence = getRegionalPartnerIntelligence(safeRegionId, context, options)
  const forecast = getRegionalForecast(safeRegionId, context, options)
  const recommendations = getRegionalRecommendations(safeRegionId, context, options)
  return {
    scope: rows.scope,
    regions: rows.regions.map((row) => ({ id: getRegionId(row), name: getRegionName(row) })),
    region: { id: safeRegionId, name: getRegionName(region) },
    summary: {
      branches: metrics.branches.length,
      consultants: metrics.consultantRows.length,
      activeApplications: metrics.activeApplications,
      openPartnerRequests: metrics.openPartnerRequests,
      regionalSLACompliance: metrics.slaCompliance,
      averageApprovalRate: metrics.approvalRate,
      partnerHealthScore: metrics.partnerHealthAverage,
      regionalHealthScore: health.score,
      regionalHealthStatus: health.status,
    },
    executive: {
      applications: metrics.activeApplications,
      approvals: metrics.approvals,
      approvalRate: metrics.approvalRate,
      slaCompliance: metrics.slaCompliance,
      partnerSatisfaction: partnerIntelligence.metrics.partnerSatisfaction,
      capacityUtilisation: metrics.capacityRisk,
      escalations: metrics.escalations,
      forecastRisk: forecast.filter((row) => row.expectedCapacityRisk === 'High').length,
    },
    health,
    branchComparison,
    branchRankings: getBranchRankings(safeRegionId, context, options),
    capacity: getRegionalCapacity(safeRegionId, context, options),
    heatmap: getRegionalHeatmap(safeRegionId, context, options),
    bottlenecks: getRegionalBottlenecks(safeRegionId, context, options),
    partnerIntelligence,
    escalations: getRegionalEscalations(safeRegionId, context, options),
    branchManagerPerformance: getBranchManagerPerformance(safeRegionId, context, options),
    targetProgress: getTargetProgress(safeRegionId, context, options),
    forecast,
    recommendations,
    activityFeed: getRegionalActivity(safeRegionId, context, options),
  }
}

export const __bondRegionalOperationsServiceTestUtils = Object.freeze({
  clearStores() {
    LOCAL_TARGET_STORE.clear()
    LOCAL_ACTIVITY_STORE.clear()
    LOCAL_HEALTH_SNAPSHOT_STORE.clear()
    LOCAL_FORECAST_STORE.clear()
    localSequence = 0
  },
  seedTargets(workspaceId = '', rows = []) {
    setLocalRows(LOCAL_TARGET_STORE, normalizeText(workspaceId || 'default'), rows.map((row) => normalizeTarget(row, workspaceId)))
  },
  getTargets(workspaceId = '') {
    return getLocalRows(LOCAL_TARGET_STORE, normalizeText(workspaceId || 'default'))
  },
  getActivity(workspaceId = '') {
    return getLocalRows(LOCAL_ACTIVITY_STORE, normalizeText(workspaceId || 'default'))
  },
  getHealthSnapshots(workspaceId = '') {
    return getLocalRows(LOCAL_HEALTH_SNAPSHOT_STORE, normalizeText(workspaceId || 'default'))
  },
  getForecasts(workspaceId = '') {
    return getLocalRows(LOCAL_FORECAST_STORE, normalizeText(workspaceId || 'default'))
  },
})
