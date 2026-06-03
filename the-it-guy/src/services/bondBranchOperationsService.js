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
  CONSULTANT_CAPACITY_STATUSES,
  getCoachingFlags,
  getConsultantPerformanceRows,
  getWorkloadRecommendations as getConsultantWorkloadRecommendations,
} from './bondConsultantPerformanceService'
import { getPartnerHealth } from './bondPartnerIntelligenceService'
import { getPartnerPortalOperationalRows } from './bondPartnerPortalService'

export const BOND_BRANCH_OPERATIONS_EVENTS = Object.freeze({
  branchHealthUpdated: 'BRANCH_HEALTH_UPDATED',
  branchTargetSet: 'BRANCH_TARGET_SET',
  branchTargetUpdated: 'BRANCH_TARGET_UPDATED',
  branchForecastUpdated: 'BRANCH_FORECAST_UPDATED',
  branchPriorityCreated: 'BRANCH_PRIORITY_CREATED',
  branchEscalationCreated: 'BRANCH_ESCALATION_CREATED',
})

export const BRANCH_HEALTH_STATUSES = Object.freeze({
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
const DECLINE_TERMS = ['declined', 'rejected', 'lost']
const SUBMITTED_TERMS = ['submitted', 'bank', 'feedback', 'quote', 'approved', 'declined', 'registered']
const ACTIVE_TERMS = ['active', 'new', 'intake', 'pre', 'document', 'review', 'submit', 'feedback', 'bank', 'quote', 'instruction', 'in_progress', 'prepared']
const COMPLETE_DOCUMENT_TERMS = ['accepted', 'approved', 'complete', 'completed', 'uploaded', 'resolved']
const DEFAULT_BRANCH_TARGETS = Object.freeze({
  approvalTarget: 70,
  submissionTarget: 30,
  turnaroundTarget: 12,
  slaTarget: 90,
  satisfactionTarget: 75,
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

function createId(prefix = 'branch-operations') {
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
    id: event.id || createId('branch-operations-activity'),
    eventType: normalizeText(event.eventType),
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

function getApplicationConsultantId(row = {}) {
  return normalizeText(row.assignedConsultantId || row.assigned_consultant_id || row.assignedUserId || row.assigned_user_id || row.primaryBondConsultantUserId || row.primary_bond_consultant_user_id || row.ownerUserId || row.owner_user_id)
}

function getApplicationPartnerId(row = {}) {
  return normalizeText(row.partnerId || row.partner_id || row.bondPartnerId || row.bond_partner_id || row.agencyId || row.agency_id || row.developmentId || row.development_id)
}

function getApplicationPartnerName(row = {}) {
  return normalizeText(row.partnerName || row.partner_name || row.agencyName || row.agency_name || row.developmentName || row.development_name)
}

function getApplicationReference(row = {}) {
  return normalizeText(row.applicationReference || row.application_reference || row.reference || row.caseNumber || row.case_number || getApplicationId(row))
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

function getConsultantId(row = {}) {
  return normalizeText(row.id || row.userId || row.user_id || row.consultantId || row.consultant_id)
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

function getDocumentStatus(row = {}) {
  return normalizeLower(row.status || row.reviewStatus || row.review_status || row.documentStatus || row.document_status)
}

function isDocumentClosed(row = {}) {
  const signal = getSignal(row)
  return COMPLETE_DOCUMENT_TERMS.some((term) => signal.includes(term)) || COMPLETE_DOCUMENT_TERMS.includes(getDocumentStatus(row))
}

function isDocumentRejected(row = {}) {
  const signal = getSignal(row)
  return signal.includes('reject') || signal.includes('replacement') || getDocumentStatus(row) === 'rejected'
}

function isDocumentUploaded(row = {}) {
  const signal = getSignal(row)
  return signal.includes('uploaded') || Boolean(row.uploadedAt || row.uploaded_at)
}

function assertManagerScope(rows = {}) {
  if (rows.scope.scopeLevel === BOND_ORGANISATION_LEVELS.consultant) {
    const error = new Error('Consultants cannot access branch operations.')
    error.code = 'permission_denied'
    throw error
  }
}

function isBranchVisible(branch = {}, scope = {}) {
  if (scope.scopeLevel === BOND_ORGANISATION_LEVELS.hq) return true
  if (scope.scopeLevel === BOND_ORGANISATION_LEVELS.region) return valueInScope(getBranchRegionId(branch), scope.regionIds) || valueInScope(getBranchId(branch), scope.branchIds)
  if (scope.scopeLevel === BOND_ORGANISATION_LEVELS.branch) return valueInScope(getBranchId(branch), scope.branchIds)
  return false
}

function deriveBranchesFromApplications(applications = []) {
  const byId = new Map()
  applications.forEach((application) => {
    const branchId = getApplicationBranchId(application)
    if (!branchId || byId.has(branchId)) return
    byId.set(branchId, {
      id: branchId,
      name: normalizeText(application.branchName || application.branch || branchId),
      regionId: getApplicationRegionId(application),
    })
  })
  return [...byId.values()]
}

function getRows(context = {}, options = {}) {
  const workspaceKey = getWorkspaceKey(context, options)
  const operationalRows = getPartnerPortalOperationalRows(context, { ...options, workspaceId: workspaceKey })
  const rawRegions = normalizeArray(options.regions || operationalRows.regions)
  const rawApplications = normalizeArray(operationalRows.applications)
  const rawBranches = normalizeArray(options.branches || options.units || operationalRows.branches || operationalRows.units)
  const branchesSource = rawBranches.length ? rawBranches : deriveBranchesFromApplications(rawApplications)
  const consultants = normalizeArray(options.consultants || options.users || operationalRows.consultants || operationalRows.users)
  const scope = resolveBondOrganisationScope(context, {
    regions: rawRegions,
    branches: branchesSource,
    consultants,
    applications: rawApplications,
  })
  const visibleBranches = branchesSource.filter((row) => isBranchVisible(row, scope))
  const visibleBranchIds = new Set(visibleBranches.map(getBranchId))
  const applications = rawApplications.filter((row) => visibleBranchIds.has(getApplicationBranchId(row)))
  const applicationIds = new Set(applications.map(getApplicationId))
  const requests = getPartnerRequests(context, { ...options, workspaceId: workspaceKey })
    .filter((row) => visibleBranchIds.has(normalizeText(row.branchId || row.branch_id)) || applicationIds.has(normalizeText(row.applicationId || row.application_id)))
  const documents = normalizeArray(operationalRows.documents)
    .filter((row) => applicationIds.has(getDocumentApplicationId(row)))
  const documentRequests = normalizeArray(operationalRows.documentRequests)
    .filter((row) => applicationIds.has(getDocumentApplicationId(row)))
  const partners = normalizeArray(operationalRows.partners || options.partners)
  return {
    workspaceKey,
    scope,
    regions: rawRegions,
    branches: visibleBranches,
    allBranches: branchesSource,
    consultants,
    applications,
    requests,
    documents,
    documentRequests,
    partners,
  }
}

function assertBranchAccess(branchId = '', rows = {}) {
  assertManagerScope(rows)
  const safeId = normalizeText(branchId) || getBranchId(rows.branches[0] || {})
  const branch = rows.branches.find((row) => getBranchId(row) === safeId)
  if (!branch) {
    const error = new Error('Branch is not available in the current scope.')
    error.code = 'permission_denied'
    throw error
  }
  return branch
}

function getBranchBundle(branchId = '', rows = {}) {
  const safeId = normalizeText(branchId)
  const branch = rows.branches.find((row) => getBranchId(row) === safeId) || null
  const applications = rows.applications.filter((row) => getApplicationBranchId(row) === safeId)
  const applicationIds = new Set(applications.map(getApplicationId))
  const consultantIds = new Set(applications.map(getApplicationConsultantId).filter(Boolean))
  const consultants = rows.consultants
    .filter((row) => getConsultantBranchId(row) === safeId || consultantIds.has(getConsultantId(row)))
  const requests = rows.requests.filter((row) => normalizeText(row.branchId || row.branch_id) === safeId || applicationIds.has(normalizeText(row.applicationId || row.application_id)))
  const documents = rows.documents.filter((row) => applicationIds.has(getDocumentApplicationId(row)))
  const documentRequests = rows.documentRequests.filter((row) => applicationIds.has(getDocumentApplicationId(row)))
  const partnerIds = new Set(applications.map(getApplicationPartnerId).filter(Boolean))
  const partnerNames = new Set(applications.map(getApplicationPartnerName).filter(Boolean))
  const partners = rows.partners.filter((row) => partnerIds.has(normalizeText(row.id || row.partnerId || row.partner_id)) || partnerNames.has(normalizeText(row.name || row.partnerName || row.partner_name)))
  return { branch, applications, consultants, requests, documents, documentRequests, partners }
}

function getStatusForScore(score = 0) {
  if (score <= 39) return BRANCH_HEALTH_STATUSES.critical
  if (score <= 59) return BRANCH_HEALTH_STATUSES.atRisk
  if (score <= 79) return BRANCH_HEALTH_STATUSES.healthy
  return BRANCH_HEALTH_STATUSES.excellent
}

function getRiskLevel(score = 0) {
  if (score >= 70) return 'High'
  if (score >= 40) return 'Medium'
  return 'Low'
}

function getBranchConsultantRows(branchId = '', context = {}, options = {}) {
  return getConsultantPerformanceRows(context, options).filter((row) => row.branchId === normalizeText(branchId))
}

function getBranchPartnerHealth(branchId = '', context = {}, options = {}) {
  const rows = getRows(context, options)
  const bundle = getBranchBundle(branchId, rows)
  const partnerIds = new Set(bundle.applications.map(getApplicationPartnerId).filter(Boolean))
  const partnerNames = new Set(bundle.applications.map(getApplicationPartnerName).filter(Boolean))
  return getPartnerHealth(context, options).rows.filter((row) => partnerIds.has(row.partnerId) || partnerNames.has(row.partnerName))
}

function buildBranchMetrics(branchId = '', context = {}, options = {}) {
  const rows = getRows(context, options)
  const branch = assertBranchAccess(branchId, rows)
  const bundle = getBranchBundle(getBranchId(branch), rows)
  const now = options.now ? new Date(options.now) : new Date()
  const consultantRows = getBranchConsultantRows(getBranchId(branch), context, options)
  const openRequests = bundle.requests.filter((row) => !requestIsResolved(row))
  const breaches = bundle.requests.filter((row) => requestIsBreached(row, now))
  const submitted = bundle.applications.filter(isSubmittedApplication)
  const approved = bundle.applications.filter(isApprovedApplication)
  const declined = bundle.applications.filter(isDeclinedApplication)
  const pendingDocuments = bundle.applications.filter(isPendingDocuments).length + bundle.documentRequests.filter((row) => !isDocumentClosed(row)).length
  const partnerHealthRows = getBranchPartnerHealth(getBranchId(branch), context, options)
  return {
    branch,
    branchId: getBranchId(branch),
    branchName: getBranchName(branch),
    activeApplications: bundle.applications.filter(isActiveApplication).length,
    applicationsSubmittedThisMonth: submitted.filter((row) => isWithinDays(row, 30, now)).length,
    openPartnerRequests: openRequests.length,
    slaBreaches: breaches.length,
    escalations: bundle.requests.filter((row) => row.escalated || normalizeLower(row.priority) === 'urgent').length,
    overloadedConsultants: consultantRows.filter((row) => row.capacityStatus === CONSULTANT_CAPACITY_STATUSES.overloaded).length,
    pendingDocuments,
    approvalRate: percent(approved.length, submitted.length || bundle.applications.length),
    declineRate: percent(declined.length, submitted.length || bundle.applications.length),
    slaCompliance: bundle.requests.length ? percent(bundle.requests.length - breaches.length, bundle.requests.length) : 100,
    partnerHealthAverage: average(partnerHealthRows.map((row) => row.healthScore)),
    consultantCapacityAverage: average(consultantRows.map((row) => row.capacityScore)),
    consultantRows,
    bundle,
  }
}

export function calculateBranchHealth(branchId = '', context = {}, options = {}) {
  const rows = getRows(context, options)
  const branch = assertBranchAccess(branchId, rows)
  const metrics = buildBranchMetrics(getBranchId(branch), context, options)
  const capacityScore = clamp(100 - metrics.consultantCapacityAverage * 2)
  const escalationScore = clamp(100 - metrics.escalations * 12)
  const openRequestScore = clamp(100 - metrics.openPartnerRequests * 4)
  const partnerHealthScore = metrics.partnerHealthAverage || 70
  const score = clamp(
    metrics.slaCompliance * 0.25 +
      capacityScore * 0.2 +
      metrics.approvalRate * 0.2 +
      partnerHealthScore * 0.15 +
      escalationScore * 0.1 +
      openRequestScore * 0.1,
  )
  const result = {
    branchId: getBranchId(branch),
    branchName: getBranchName(branch),
    score,
    status: getStatusForScore(score),
    components: {
      slaCompliance: metrics.slaCompliance,
      consultantCapacity: capacityScore,
      approvalRate: metrics.approvalRate,
      partnerHealth: partnerHealthScore,
      escalations: escalationScore,
      openRequests: openRequestScore,
    },
  }
  const previous = getLocalRows(LOCAL_HEALTH_SNAPSHOT_STORE, rows.workspaceKey).find((row) => row.branchId === result.branchId)
  if (!previous || previous.score !== result.score || previous.status !== result.status) {
    recordActivity(rows.workspaceKey, {
      eventType: BOND_BRANCH_OPERATIONS_EVENTS.branchHealthUpdated,
      branchId: result.branchId,
      actorUserId: getActorId(context),
      previousValue: previous || null,
      newValue: result,
    })
    setLocalRows(LOCAL_HEALTH_SNAPSHOT_STORE, rows.workspaceKey, [
      { ...result, updatedAt: new Date().toISOString() },
      ...getLocalRows(LOCAL_HEALTH_SNAPSHOT_STORE, rows.workspaceKey).filter((row) => row.branchId !== result.branchId),
    ])
  }
  return result
}

function buildPriority(type = '', count = 0, label = '', priority = 'Medium', action = 'View') {
  return {
    id: createId('branch-priority'),
    type,
    count,
    label,
    priority,
    action,
  }
}

export function getBranchPriorities(branchId = '', context = {}, options = {}) {
  const metrics = buildBranchMetrics(branchId, context, options)
  const priorities = [
    metrics.slaBreaches ? buildPriority('SLA Breaches', metrics.slaBreaches, `${metrics.slaBreaches} SLA breach${metrics.slaBreaches === 1 ? '' : 'es'}`, 'High', 'Resolve') : null,
    metrics.overloadedConsultants ? buildPriority('Overloaded Consultants', metrics.overloadedConsultants, `${metrics.overloadedConsultants} consultant${metrics.overloadedConsultants === 1 ? '' : 's'} overloaded`, 'High', 'Assign') : null,
    metrics.pendingDocuments ? buildPriority('Outstanding Documents', metrics.pendingDocuments, `${metrics.pendingDocuments} outstanding document request${metrics.pendingDocuments === 1 ? '' : 's'}`, metrics.pendingDocuments >= 10 ? 'High' : 'Medium', 'View') : null,
    metrics.bundle.applications.filter(isAwaitingSubmission).length ? buildPriority('Awaiting Submission', metrics.bundle.applications.filter(isAwaitingSubmission).length, `${metrics.bundle.applications.filter(isAwaitingSubmission).length} application${metrics.bundle.applications.filter(isAwaitingSubmission).length === 1 ? '' : 's'} awaiting submission`, 'Medium', 'Assign') : null,
    metrics.escalations ? buildPriority('Partner Escalations', metrics.escalations, `${metrics.escalations} partner escalation${metrics.escalations === 1 ? '' : 's'}`, 'High', 'Resolve') : null,
  ].filter(Boolean)
  const rows = getRows(context, options)
  priorities.forEach((priority) => {
    recordActivity(rows.workspaceKey, {
      eventType: BOND_BRANCH_OPERATIONS_EVENTS.branchPriorityCreated,
      branchId: metrics.branchId,
      actorUserId: getActorId(context),
      newValue: priority,
    })
  })
  return priorities.sort((left, right) => {
    const weight = { High: 3, Medium: 2, Low: 1 }
    return (weight[right.priority] || 0) - (weight[left.priority] || 0) || right.count - left.count
  })
}

export function getConsultantCapacity(branchId = '', context = {}, options = {}) {
  const rows = getRows(context, options)
  const branch = assertBranchAccess(branchId, rows)
  return getBranchConsultantRows(getBranchId(branch), context, options).map((row) => ({
    consultantId: row.consultantId,
    consultantName: row.consultantName,
    applications: row.activeApplications,
    capacity: row.capacityScore,
    capacityStatus: row.capacityStatus,
    slaCompliance: row.slaCompliance,
    approvalRate: row.approvalRate,
    status: row.capacityStatus,
  }))
}

export function getBranchHeatmap(branchId = '', context = {}, options = {}) {
  const rows = getRows(context, options)
  const branch = assertBranchAccess(branchId, rows)
  return getBranchConsultantRows(getBranchId(branch), context, options).map((row) => ({
    consultantId: row.consultantId,
    consultantName: row.consultantName,
    applications: row.activeApplications,
    partnerRequests: row.openPartnerRequests,
    documents: row.pendingDocuments,
    slaRisk: row.slaBreaches,
    riskScore: row.capacityScore + row.slaBreaches * 3 + row.pendingDocuments,
    riskLevel: getRiskLevel(row.capacityScore + row.slaBreaches * 3 + row.pendingDocuments),
  }))
}

function bottleneckCount(rows = [], predicate = () => false) {
  const items = rows.filter(predicate)
  return {
    count: items.length,
    averageDays: average(items.map((row) => daysBetween(row.updatedAt || row.updated_at || row.createdAt || row.created_at, new Date().toISOString()))),
    riskLevel: getRiskLevel(items.length * 12),
  }
}

export function getApplicationBottlenecks(branchId = '', context = {}, options = {}) {
  const metrics = buildBranchMetrics(branchId, context, options)
  const applications = metrics.bundle.applications
  return [
    { id: 'awaiting-documents', type: 'Awaiting Documents', ...bottleneckCount(applications, isPendingDocuments) },
    { id: 'awaiting-review', type: 'Awaiting Review', ...bottleneckCount(applications, isAwaitingReview) },
    { id: 'awaiting-submission', type: 'Awaiting Submission', ...bottleneckCount(applications, isAwaitingSubmission) },
    { id: 'awaiting-bank-feedback', type: 'Awaiting Bank Feedback', ...bottleneckCount(applications, isAwaitingBankFeedback) },
    { id: 'awaiting-approval', type: 'Awaiting Approval', ...bottleneckCount(applications, (row) => getSignal(row).includes('approval') && !isApprovedApplication(row)) },
    { id: 'awaiting-instruction', type: 'Awaiting Instruction', ...bottleneckCount(applications, (row) => getSignal(row).includes('instruction')) },
  ]
}

export function getPartnerOperations(branchId = '', context = {}, options = {}) {
  const metrics = buildBranchMetrics(branchId, context, options)
  const partnerHealthRows = getBranchPartnerHealth(metrics.branchId, context, options)
  const byPartner = new Map()
  metrics.bundle.requests.forEach((request) => {
    const id = normalizeText(request.partnerId || request.partner_id || request.partnerName || request.partner_name || 'partner')
    byPartner.set(id, [...(byPartner.get(id) || []), request])
  })
  const rows = [...byPartner.entries()].map(([id, requests]) => {
    const health = partnerHealthRows.find((row) => row.partnerId === id || row.partnerName === requests[0]?.partnerName) || {}
    const openRequests = requests.filter((row) => !requestIsResolved(row))
    return {
      id,
      partnerId: id,
      partnerName: normalizeText(requests[0]?.partnerName || requests[0]?.partner_name || health.partnerName || id),
      openRequests: openRequests.length,
      pendingResponses: openRequests.filter((row) => normalizeLower(row.status).includes('waiting')).length,
      slaRisk: requests.filter((row) => requestIsBreached(row, options.now ? new Date(options.now) : new Date())).length,
      escalations: requests.filter((row) => row.escalated || normalizeLower(row.priority) === 'urgent').length,
      healthScore: health.healthScore || 70,
      lastActivity: requests.map(dateValue).sort().at(-1) || '',
    }
  })
  return {
    metrics: {
      openRequests: metrics.openPartnerRequests,
      pendingResponses: rows.reduce((sum, row) => sum + row.pendingResponses, 0),
      slaRisk: rows.reduce((sum, row) => sum + row.slaRisk, 0),
      escalations: rows.reduce((sum, row) => sum + row.escalations, 0),
      partnerHealth: metrics.partnerHealthAverage,
    },
    rows,
  }
}

export function getDocumentOperations(branchId = '', context = {}, options = {}) {
  const metrics = buildBranchMetrics(branchId, context, options)
  const documents = [...metrics.bundle.documents, ...metrics.bundle.documentRequests]
  const rows = documents.map((document) => {
    const application = metrics.bundle.applications.find((row) => getApplicationId(row) === getDocumentApplicationId(document)) || {}
    return {
      id: normalizeText(document.id || document.documentId || document.document_id || createId('document-operation')),
      applicationId: getApplicationId(application),
      applicationReference: getApplicationReference(application),
      documentType: normalizeText(document.documentType || document.document_type || document.type || document.title) || 'Document',
      uploadedBy: normalizeText(document.uploadedBy || document.uploaded_by || document.actorName || document.actor_name || 'Partner'),
      age: daysBetween(document.uploadedAt || document.uploaded_at || document.createdAt || document.created_at, options.now || new Date().toISOString()),
      status: normalizeText(document.status || document.reviewStatus || document.review_status || 'awaiting_review'),
    }
  })
  return {
    metrics: {
      documentsUploaded: documents.filter(isDocumentUploaded).length,
      documentsAwaitingReview: documents.filter((row) => !isDocumentClosed(row) && !isDocumentRejected(row)).length,
      documentsRejected: documents.filter(isDocumentRejected).length,
      replacementRequests: documents.filter((row) => getSignal(row).includes('replacement')).length,
    },
    rows,
  }
}

function normalizeTarget(row = {}, workspaceKey = '') {
  const period = normalizeText(row.period) || new Date().toISOString().slice(0, 7)
  return {
    id: normalizeText(row.id) || createId('branch-target'),
    organisationId: normalizeText(row.organisationId || row.organisation_id || workspaceKey),
    branchId: normalizeText(row.branchId || row.branch_id),
    period,
    approvalTarget: Number(row.approvalTarget ?? row.approval_target ?? DEFAULT_BRANCH_TARGETS.approvalTarget),
    submissionTarget: Number(row.submissionTarget ?? row.submission_target ?? DEFAULT_BRANCH_TARGETS.submissionTarget),
    turnaroundTarget: Number(row.turnaroundTarget ?? row.turnaround_target ?? DEFAULT_BRANCH_TARGETS.turnaroundTarget),
    slaTarget: Number(row.slaTarget ?? row.sla_target ?? DEFAULT_BRANCH_TARGETS.slaTarget),
    satisfactionTarget: Number(row.satisfactionTarget ?? row.satisfaction_target ?? DEFAULT_BRANCH_TARGETS.satisfactionTarget),
    createdBy: normalizeText(row.createdBy || row.created_by),
    createdAt: normalizeText(row.createdAt || row.created_at) || new Date().toISOString(),
    updatedAt: normalizeText(row.updatedAt || row.updated_at) || new Date().toISOString(),
  }
}

function getTargetKey(branchId = '', period = '') {
  return `${normalizeText(branchId)}:${normalizeText(period)}`
}

export function getBranchTargets(branchId = '', context = {}, options = {}) {
  const rows = getRows(context, options)
  const branch = assertBranchAccess(branchId, rows)
  const period = normalizeText(options.period) || ''
  return getLocalRows(LOCAL_TARGET_STORE, rows.workspaceKey)
    .filter((row) => row.branchId === getBranchId(branch) && (!period || row.period === period))
    .sort((left, right) => normalizeText(right.period).localeCompare(normalizeText(left.period)))
}

export function setBranchTargets(branchId = '', payload = {}, context = {}, options = {}) {
  const rows = getRows(context, options)
  const branch = assertBranchAccess(branchId, rows)
  const safeBranchId = getBranchId(branch)
  const period = normalizeText(payload.period || options.period) || new Date().toISOString().slice(0, 7)
  const currentRows = getLocalRows(LOCAL_TARGET_STORE, rows.workspaceKey)
  const existing = currentRows.find((row) => getTargetKey(row.branchId, row.period) === getTargetKey(safeBranchId, period))
  const normalized = normalizeTarget({
    ...existing,
    ...payload,
    branchId: safeBranchId,
    period,
    createdBy: existing?.createdBy || getActorId(context),
    createdAt: existing?.createdAt,
    updatedAt: new Date().toISOString(),
  }, rows.workspaceKey)
  setLocalRows(LOCAL_TARGET_STORE, rows.workspaceKey, [
    normalized,
    ...currentRows.filter((row) => getTargetKey(row.branchId, row.period) !== getTargetKey(safeBranchId, period)),
  ])
  recordActivity(rows.workspaceKey, {
    eventType: existing ? BOND_BRANCH_OPERATIONS_EVENTS.branchTargetUpdated : BOND_BRANCH_OPERATIONS_EVENTS.branchTargetSet,
    branchId: safeBranchId,
    actorUserId: getActorId(context),
    previousValue: existing || null,
    newValue: normalized,
  })
  return normalized
}

function getDefaultTarget(branchId = '', context = {}, options = {}) {
  return getBranchTargets(branchId, context, options)[0] || normalizeTarget({ branchId, period: options.period }, getWorkspaceKey(context, options))
}

function buildTargetProgress(branchId = '', context = {}, options = {}) {
  const metrics = buildBranchMetrics(branchId, context, options)
  const target = getDefaultTarget(metrics.branchId, context, options)
  const averageTurnaround = average(metrics.bundle.applications.map((row) => daysBetween(row.createdAt || row.created_at, row.updatedAt || row.updated_at || row.submittedAt || row.submitted_at)))
  return {
    target,
    rows: [
      { id: 'submissions', target: 'Submissions', actual: metrics.applicationsSubmittedThisMonth, targetValue: target.submissionTarget, variance: metrics.applicationsSubmittedThisMonth - target.submissionTarget, progress: percent(metrics.applicationsSubmittedThisMonth, target.submissionTarget) },
      { id: 'approval', target: 'Approval Rate', actual: metrics.approvalRate, targetValue: target.approvalTarget, variance: metrics.approvalRate - target.approvalTarget, progress: percent(metrics.approvalRate, target.approvalTarget) },
      { id: 'turnaround', target: 'Turnaround', actual: averageTurnaround, targetValue: target.turnaroundTarget, variance: target.turnaroundTarget - averageTurnaround, progress: clamp(100 - Math.max(0, averageTurnaround - target.turnaroundTarget) * 10) },
      { id: 'sla', target: 'SLA Compliance', actual: metrics.slaCompliance, targetValue: target.slaTarget, variance: metrics.slaCompliance - target.slaTarget, progress: percent(metrics.slaCompliance, target.slaTarget) },
      { id: 'satisfaction', target: 'Partner Satisfaction', actual: metrics.partnerHealthAverage, targetValue: target.satisfactionTarget, variance: metrics.partnerHealthAverage - target.satisfactionTarget, progress: percent(metrics.partnerHealthAverage, target.satisfactionTarget) },
    ],
  }
}

export function getWorkloadRecommendations(branchId = '', context = {}, options = {}) {
  const rows = getRows(context, options)
  const branch = assertBranchAccess(branchId, rows)
  return getConsultantWorkloadRecommendations(context, options)
    .filter((row) => row.branchId === getBranchId(branch))
    .map((row) => ({
      ...row,
      status: 'Recommended',
      actions: ['Approve', 'Ignore'],
    }))
}

export function getEscalations(branchId = '', context = {}, options = {}) {
  const metrics = buildBranchMetrics(branchId, context, options)
  const now = options.now ? new Date(options.now) : new Date()
  const rows = [
    ...metrics.bundle.requests
      .filter((row) => requestIsBreached(row, now) || row.escalated || normalizeLower(`${row.title} ${row.message}`).includes('complaint'))
      .map((request) => ({
        id: request.id,
        issue: request.escalated ? 'Partner Escalation' : requestIsBreached(request, now) ? 'SLA Breach' : 'Partner Complaint',
        owner: normalizeText(request.ownerName || request.ownerConsultantId || request.owner_consultant_id || 'Unassigned'),
        priority: normalizeText(request.priority) || 'normal',
        age: daysBetween(request.createdAt || request.created_at, options.now || new Date().toISOString()),
        status: normalizeText(request.status),
        action: requestIsBreached(request, now) ? 'Resolve SLA' : 'Review',
      })),
    ...metrics.bundle.applications
      .filter((row) => isPendingDocuments(row) || isAwaitingBankFeedback(row))
      .slice(0, 8)
      .map((application) => ({
        id: `application-${getApplicationId(application)}`,
        issue: isPendingDocuments(application) ? 'Document Delay' : 'Critical Application',
        owner: normalizeText(application.consultant || application.consultantName || getApplicationConsultantId(application) || 'Unassigned'),
        priority: isPendingDocuments(application) ? 'high' : 'normal',
        age: daysBetween(application.updatedAt || application.updated_at || application.createdAt || application.created_at, options.now || new Date().toISOString()),
        status: normalizeText(application.status || application.financeStatus || 'active'),
        action: 'View',
      })),
  ]
  const sourceRows = getRows(context, options)
  rows.filter((row) => ['high', 'urgent'].includes(normalizeLower(row.priority)) || row.issue.includes('SLA')).forEach((row) => {
    recordActivity(sourceRows.workspaceKey, {
      eventType: BOND_BRANCH_OPERATIONS_EVENTS.branchEscalationCreated,
      branchId: metrics.branchId,
      actorUserId: getActorId(context),
      newValue: row,
    })
  })
  return rows.sort((left, right) => right.age - left.age)
}

export function getCoachingCentre(branchId = '', context = {}, options = {}) {
  const capacityRows = getConsultantCapacity(branchId, context, options)
  return capacityRows.flatMap((row) => {
    try {
      return getCoachingFlags(row.consultantId, context, options).map((flag) => ({
        ...flag,
        consultantId: row.consultantId,
        consultantName: row.consultantName,
        actions: ['Add Coaching Note', 'Schedule Review', 'Mark Resolved'],
      }))
    } catch {
      return []
    }
  })
}

export function getBranchForecast(branchId = '', context = {}, options = {}) {
  const metrics = buildBranchMetrics(branchId, context, options)
  const recentApplications = metrics.bundle.applications.filter((row) => isWithinDays(row, 30, options.now ? new Date(options.now) : new Date())).length
  const resolvedApplications = metrics.bundle.applications.filter((row) => ['registered', 'completed', 'approved'].some((term) => getSignal(row).includes(term))).length
  const averageDailyNewApplications = Math.round((recentApplications / 30) * 10) / 10
  const averageResolutionRate = Math.round((resolvedApplications / 30) * 10) / 10
  const baseCapacity = metrics.consultantRows.reduce((sum, row) => sum + row.capacityScore, 0)
  const forecast = [7, 14, 30].map((days) => {
    const expectedApplications = Math.max(0, Math.round(metrics.activeApplications + averageDailyNewApplications * days - averageResolutionRate * days))
    const expectedCapacity = Math.max(0, Math.round(baseCapacity + averageDailyNewApplications * days - averageResolutionRate * days + metrics.openPartnerRequests * 0.4 + metrics.pendingDocuments * 0.3))
    const riskLevel = getRiskLevel(expectedCapacity)
    return {
      periodDays: days,
      expectedApplications,
      expectedCapacity,
      riskLevel,
      requiredHeadcount: Math.max(0, Math.ceil(Math.max(0, expectedCapacity - metrics.consultantRows.length * 25) / 25)),
      recommendedAction: riskLevel === 'High' ? 'Rebalance workload and reduce new routing.' : riskLevel === 'Medium' ? 'Watch documents and partner requests daily.' : 'Capacity is sufficient for normal flow.',
    }
  })
  const rows = getRows(context, options)
  setLocalRows(LOCAL_FORECAST_STORE, rows.workspaceKey, [
    { branchId: metrics.branchId, forecast, updatedAt: new Date().toISOString() },
    ...getLocalRows(LOCAL_FORECAST_STORE, rows.workspaceKey).filter((row) => row.branchId !== metrics.branchId),
  ])
  recordActivity(rows.workspaceKey, {
    eventType: BOND_BRANCH_OPERATIONS_EVENTS.branchForecastUpdated,
    branchId: metrics.branchId,
    actorUserId: getActorId(context),
    newValue: forecast,
  })
  return forecast
}

export function getBranchRankings(context = {}, options = {}) {
  const rows = getRows(context, options)
  assertManagerScope(rows)
  const allContext = {
    ...context,
    resolvedPermissionContext: {
      ...(context.resolvedPermissionContext || {}),
      userId: getActorId(context),
      workspaceId: rows.workspaceKey,
      scopeLevel: 'workspace_hq',
      scopeLevelRaw: 'workspace_hq',
      workspaceRole: 'hq_manager',
    },
  }
  const networkRows = getRows(allContext, options)
  const branchRows = networkRows.allBranches.map((branch) => {
    try {
      const metrics = buildBranchMetrics(getBranchId(branch), allContext, options)
      return {
        branchId: getBranchId(branch),
        branchName: getBranchName(branch),
        approvalRate: metrics.approvalRate,
        slaCompliance: metrics.slaCompliance,
        partnerSatisfaction: metrics.partnerHealthAverage,
        responseTimes: average(metrics.consultantRows.map((row) => row.partnerResponseTime)),
        turnaround: average(metrics.bundle.applications.map((row) => daysBetween(row.createdAt || row.created_at, row.updatedAt || row.updated_at || row.submittedAt || row.submitted_at))),
      }
    } catch {
      return null
    }
  }).filter(Boolean)
  return rows.branches.map((branch) => {
    const branchId = getBranchId(branch)
    const rankBySla = [...branchRows].sort((left, right) => right.slaCompliance - left.slaCompliance).findIndex((row) => row.branchId === branchId) + 1
    return {
      branchId,
      branchName: getBranchName(branch),
      rank: rankBySla || branchRows.length,
      totalBranches: branchRows.length,
      metrics: branchRows.find((row) => row.branchId === branchId) || {},
    }
  })
}

function buildActivityFeed(branchId = '', context = {}, options = {}) {
  const metrics = buildBranchMetrics(branchId, context, options)
  const activityRows = getLocalRows(LOCAL_ACTIVITY_STORE, getWorkspaceKey(context, options)).filter((row) => row.branchId === metrics.branchId)
  const synthetic = [
    ...metrics.bundle.applications.filter(isSubmittedApplication).slice(0, 5).map((row) => ({
      id: `submitted-${getApplicationId(row)}`,
      eventType: 'APPLICATION_SUBMITTED',
      label: `${getApplicationReference(row)} submitted`,
      createdAt: row.submittedAt || row.submitted_at || row.updatedAt || row.updated_at || row.createdAt || row.created_at,
    })),
    ...metrics.bundle.requests.filter((row) => requestIsBreached(row, options.now ? new Date(options.now) : new Date())).slice(0, 5).map((row) => ({
      id: `sla-${row.id}`,
      eventType: 'SLA_BREACH',
      label: normalizeText(row.title) || 'SLA breach',
      createdAt: row.createdAt || row.created_at,
    })),
  ]
  const feed = [
    ...activityRows.map((row) => ({ ...row, label: row.eventType.replaceAll('_', ' ') })),
    ...synthetic,
  ].sort((left, right) => normalizeText(right.createdAt).localeCompare(normalizeText(left.createdAt)))
  return {
    today: feed.filter((row) => isWithinDays(row, 1, options.now ? new Date(options.now) : new Date())),
    thisWeek: feed.filter((row) => isWithinDays(row, 7, options.now ? new Date(options.now) : new Date())),
    thisMonth: feed.filter((row) => isWithinDays(row, 30, options.now ? new Date(options.now) : new Date())),
  }
}

export function getBranchOperationsDashboard(context = {}, options = {}) {
  const rows = getRows(context, options)
  assertManagerScope(rows)
  const branchId = normalizeText(options.branchId || options.branch_id) || getBranchId(rows.branches[0] || {})
  const branch = assertBranchAccess(branchId, rows)
  const safeBranchId = getBranchId(branch)
  const metrics = buildBranchMetrics(safeBranchId, context, options)
  const health = calculateBranchHealth(safeBranchId, context, options)
  const targetProgress = buildTargetProgress(safeBranchId, context, options)
  return {
    scope: rows.scope,
    branches: rows.branches.map((row) => ({ id: getBranchId(row), name: getBranchName(row), regionId: getBranchRegionId(row) })),
    branch: { id: safeBranchId, name: getBranchName(branch), regionId: getBranchRegionId(branch) },
    summary: {
      activeApplications: metrics.activeApplications,
      applicationsSubmittedThisMonth: metrics.applicationsSubmittedThisMonth,
      openPartnerRequests: metrics.openPartnerRequests,
      slaBreaches: metrics.slaBreaches,
      overloadedConsultants: metrics.overloadedConsultants,
      pendingDocuments: metrics.pendingDocuments,
      approvalRate: metrics.approvalRate,
      branchHealthScore: health.score,
      branchHealthStatus: health.status,
    },
    health,
    priorities: getBranchPriorities(safeBranchId, context, options),
    consultantCapacity: getConsultantCapacity(safeBranchId, context, options),
    heatmap: getBranchHeatmap(safeBranchId, context, options),
    bottlenecks: getApplicationBottlenecks(safeBranchId, context, options),
    partnerOperations: getPartnerOperations(safeBranchId, context, options),
    documentOperations: getDocumentOperations(safeBranchId, context, options),
    targetProgress,
    workloadRecommendations: getWorkloadRecommendations(safeBranchId, context, options),
    escalations: getEscalations(safeBranchId, context, options),
    coachingCentre: getCoachingCentre(safeBranchId, context, options),
    forecast: getBranchForecast(safeBranchId, context, options),
    rankings: getBranchRankings(context, options),
    activityFeed: buildActivityFeed(safeBranchId, context, options),
  }
}

export const __bondBranchOperationsServiceTestUtils = Object.freeze({
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
