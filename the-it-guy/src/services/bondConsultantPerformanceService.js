import {
  ALL_BOND_ORGANISATION_SCOPE,
  BOND_ORGANISATION_LEVELS,
  resolveBondOrganisationScope,
} from './bondOrganisationScopeResolver'
import {
  BOND_PARTNER_REQUEST_STATUSES,
  BOND_PARTNER_REQUEST_TYPES,
  calculatePartnerSLA,
  getPartnerRequests,
} from './bondPartnerCollaborationService'
import { getPartnerHealth } from './bondPartnerIntelligenceService'
import { getPartnerPortalOperationalRows } from './bondPartnerPortalService'

export const BOND_CONSULTANT_PERFORMANCE_EVENTS = Object.freeze({
  consultantTargetSet: 'CONSULTANT_TARGET_SET',
  consultantTargetUpdated: 'CONSULTANT_TARGET_UPDATED',
  consultantCoachingFlagCreated: 'CONSULTANT_COACHING_FLAG_CREATED',
  consultantCoachingNoteAdded: 'CONSULTANT_COACHING_NOTE_ADDED',
  workloadRecommendationCreated: 'WORKLOAD_RECOMMENDATION_CREATED',
  consultantCapacityChanged: 'CONSULTANT_CAPACITY_CHANGED',
})

export const CONSULTANT_CAPACITY_STATUSES = Object.freeze({
  light: 'Light',
  normal: 'Normal',
  busy: 'Busy',
  overloaded: 'Overloaded',
})

const LOCAL_TARGET_STORE = new Map()
const LOCAL_COACHING_NOTE_STORE = new Map()
const LOCAL_ACTIVITY_STORE = new Map()
const LOCAL_CAPACITY_SNAPSHOT_STORE = new Map()
let localSequence = 0

const RESOLVED_STATUSES = new Set([BOND_PARTNER_REQUEST_STATUSES.resolved, BOND_PARTNER_REQUEST_STATUSES.closed])
const APPROVAL_TERMS = ['approved', 'approval', 'grant', 'registered', 'accepted']
const DECLINE_TERMS = ['declined', 'rejected', 'lost']
const SUBMITTED_TERMS = ['submitted', 'bank', 'feedback', 'quote', 'approved', 'declined', 'registered']
const ACTIVE_TERMS = ['active', 'new', 'intake', 'pre', 'document', 'submit', 'feedback', 'bank', 'quote', 'instruction', 'in_progress', 'prepared']
const DEFAULT_TARGETS = Object.freeze({
  applicationsTarget: 20,
  approvalsTarget: 12,
  approvalRateTarget: 65,
  turnaroundTarget: 14,
  slaComplianceTarget: 85,
  responseTimeTarget: 8,
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

function createId(prefix = 'consultant-performance') {
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
    id: event.id || createId('consultant-performance-activity'),
    eventType: normalizeText(event.eventType),
    consultantId: normalizeText(event.consultantId),
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
  return normalizeLower(`${row.status || ''} ${row.stage || ''} ${row.financeStatus || ''} ${row.finance_status || ''} ${row.financeStageKey || ''} ${row.finance_stage_key || ''} ${row.financeStageLabel || ''} ${row.registrationStatus || ''} ${row.nextAction || ''} ${row.next_action || ''}`)
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

function getApplicationId(row = {}) {
  return normalizeText(row.id || row.applicationId || row.application_id || row.transactionId || row.transaction_id || row.key)
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

function getApplicationConsultantName(row = {}) {
  return normalizeText(row.consultant || row.consultantName || row.assignedConsultantName || row.assigned_consultant_name || row.assignedUserName || row.assigned_user_name)
}

function getApplicationPartnerId(row = {}) {
  return normalizeText(row.partnerId || row.partner_id || row.bondPartnerId || row.bond_partner_id || row.agencyId || row.agency_id || row.developmentId || row.development_id)
}

function getApplicationPartnerName(row = {}) {
  return normalizeText(row.partnerName || row.partner_name || row.agencyName || row.agency_name || row.developmentName || row.development_name)
}

function getRegionId(row = {}) {
  return normalizeText(row.id || row.regionId || row.region_id)
}

function getRegionName(row = {}) {
  return normalizeText(row.name || row.regionName || row.region_name || row.label || getRegionId(row)) || 'Region'
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

function getConsultantId(row = {}) {
  return normalizeText(row.id || row.userId || row.user_id || row.consultantId || row.consultant_id)
}

function getConsultantName(row = {}) {
  return normalizeText(row.name || row.consultant || row.fullName || row.full_name || [row.firstName || row.first_name, row.lastName || row.last_name].map(normalizeText).filter(Boolean).join(' ') || row.email || getConsultantId(row)) || 'Consultant'
}

function getConsultantBranchId(row = {}) {
  return normalizeText(row.branchId || row.branch_id || row.workspaceUnitId || row.workspace_unit_id || row.primaryBranchId || row.primary_branch_id)
}

function getConsultantRegionId(row = {}) {
  return normalizeText(row.regionId || row.region_id)
}

function valueInScope(value = '', scopedIds) {
  if (scopedIds === ALL_BOND_ORGANISATION_SCOPE) return true
  return normalizeArray(scopedIds).includes(normalizeText(value))
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
  if (scope.scopeLevel === BOND_ORGANISATION_LEVELS.region) return valueInScope(getConsultantRegionId(consultant), scope.regionIds) || valueInScope(getConsultantBranchId(consultant), scope.branchIds) || valueInScope(getConsultantId(consultant), scope.consultantIds)
  if (scope.scopeLevel === BOND_ORGANISATION_LEVELS.branch) return valueInScope(getConsultantBranchId(consultant), scope.branchIds) || valueInScope(getConsultantId(consultant), scope.consultantIds)
  return valueInScope(getConsultantId(consultant), scope.consultantIds) || normalizeText(getConsultantId(consultant)) === normalizeText(scope.userId)
}

function isRequestVisibleByApplications(request = {}, applications = []) {
  const applicationId = normalizeText(request.applicationId || request.application_id)
  if (!applicationId) return true
  return applications.some((row) => getApplicationId(row) === applicationId)
}

function labelForId(id = '', rows = [], idResolver = () => '', nameResolver = () => '') {
  const safeId = normalizeText(id)
  return nameResolver(rows.find((row) => idResolver(row) === safeId) || {}) || safeId || 'Unassigned'
}

function deriveConsultantsFromApplications(applications = [], branches = [], regions = []) {
  const byId = new Map()
  applications.forEach((application) => {
    const id = getApplicationConsultantId(application) || normalizeLower(getApplicationConsultantName(application)).replace(/[^a-z0-9]+/g, '-')
    if (!id || byId.has(id)) return
    const branchId = getApplicationBranchId(application)
    const branch = branches.find((row) => getBranchId(row) === branchId) || {}
    const regionId = getApplicationRegionId(application) || getBranchRegionId(branch)
    const region = regions.find((row) => getRegionId(row) === regionId) || {}
    byId.set(id, {
      id,
      name: getApplicationConsultantName(application) || id,
      branchId,
      branchName: getBranchName(branch),
      regionId,
      regionName: getRegionName(region),
      status: 'active',
      role: 'consultant',
    })
  })
  return [...byId.values()]
}

function normalizeConsultant(row = {}, branches = [], regions = []) {
  const branchId = getConsultantBranchId(row)
  const branch = branches.find((candidate) => getBranchId(candidate) === branchId) || {}
  const regionId = getConsultantRegionId(row) || getBranchRegionId(branch)
  const region = regions.find((candidate) => getRegionId(candidate) === regionId) || {}
  return {
    ...row,
    id: getConsultantId(row),
    consultantId: getConsultantId(row),
    name: getConsultantName(row),
    branchId,
    branchName: normalizeText(row.branchName || row.branch || getBranchName(branch)) || 'Unassigned',
    regionId,
    regionName: normalizeText(row.regionName || row.region || getRegionName(region)) || 'Unassigned',
    status: normalizeLower(row.status) || 'active',
    role: normalizeLower(row.role || row.workspaceRole || row.workspace_role) || 'consultant',
  }
}

function getRows(context = {}, options = {}) {
  const workspaceKey = getWorkspaceKey(context, options)
  const operationalRows = getPartnerPortalOperationalRows(context, { ...options, workspaceId: workspaceKey })
  const rawRegions = normalizeArray(options.regions || operationalRows.regions)
  const rawBranches = normalizeArray(options.branches || options.units || operationalRows.branches || operationalRows.units)
  const rawApplications = normalizeArray(operationalRows.applications)
  const scope = resolveBondOrganisationScope(context, {
    regions: rawRegions,
    branches: rawBranches,
    consultants: options.consultants || options.users || operationalRows.consultants || operationalRows.users || [],
    applications: rawApplications,
  })
  const applications = rawApplications.filter((row) => isApplicationVisible(row, scope))
  const regions = rawRegions.filter((row) => isRegionVisible(row, scope))
  const branches = rawBranches.filter((row) => isBranchVisible(row, scope))
  const configuredConsultants = normalizeArray(options.consultants || options.users || operationalRows.consultants || operationalRows.users)
  const consultantsSource = configuredConsultants.length ? configuredConsultants : deriveConsultantsFromApplications(rawApplications, rawBranches, rawRegions)
  const consultants = consultantsSource
    .map((row) => normalizeConsultant(row, rawBranches, rawRegions))
    .filter((row) => isConsultantVisible(row, scope))
  const requests = getPartnerRequests(context, { ...options, workspaceId: workspaceKey })
    .filter((row) => isRequestVisibleByApplications(row, applications) || valueInScope(row.ownerConsultantId, scope.consultantIds))
  return {
    workspaceKey,
    scope,
    regions,
    branches,
    consultants,
    applications,
    requests,
    documents: normalizeArray(operationalRows.documents),
    documentRequests: normalizeArray(operationalRows.documentRequests),
    partners: normalizeArray(operationalRows.partners),
  }
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

function getFirstResponseAt(row = {}) {
  return normalizeText(row.firstResponseAt || row.first_response_at || row.repliedAt || row.replied_at || row.assignedAt || row.assigned_at)
}

function getConsultantBundle(consultantId = '', rows = {}) {
  const safeId = normalizeText(consultantId)
  const consultant = rows.consultants.find((row) => getConsultantId(row) === safeId) || null
  const applications = rows.applications.filter((row) => getApplicationConsultantId(row) === safeId)
  const applicationIds = new Set(applications.map(getApplicationId))
  const requests = rows.requests.filter((row) => normalizeText(row.ownerConsultantId || row.owner_consultant_id) === safeId || applicationIds.has(normalizeText(row.applicationId || row.application_id)))
  const documents = rows.documents.filter((row) => applicationIds.has(normalizeText(row.applicationId || row.application_id)))
  const documentRequests = rows.documentRequests.filter((row) => applicationIds.has(normalizeText(row.applicationId || row.application_id)))
  return { consultant, applications, requests, documents, documentRequests }
}

function getCapacityStatus(capacityScore = 0) {
  if (capacityScore <= 10) return CONSULTANT_CAPACITY_STATUSES.light
  if (capacityScore <= 25) return CONSULTANT_CAPACITY_STATUSES.normal
  if (capacityScore <= 40) return CONSULTANT_CAPACITY_STATUSES.busy
  return CONSULTANT_CAPACITY_STATUSES.overloaded
}

function buildCapacity(bundle = {}, now = new Date()) {
  const activeApplications = bundle.applications.filter(isActiveApplication).length
  const pendingDocuments = bundle.applications.filter(isPendingDocuments).length + bundle.documentRequests.filter((row) => !['accepted', 'approved', 'complete', 'completed', 'uploaded', 'resolved'].some((term) => getSignal(row).includes(term))).length
  const awaitingBankFeedback = bundle.applications.filter(isAwaitingBankFeedback).length
  const urgentRequests = bundle.requests.filter((row) => row.escalated || normalizeLower(row.priority) === 'urgent').length
  const openPartnerRequests = bundle.requests.filter((row) => !requestIsResolved(row)).length
  const slaBreaches = bundle.requests.filter((row) => requestIsBreached(row, now)).length
  const capacityScore = Math.round(activeApplications + pendingDocuments * 0.5 + awaitingBankFeedback * 0.5 + urgentRequests * 2 + openPartnerRequests * 0.5 + slaBreaches * 2)
  return {
    activeApplications,
    pendingDocuments,
    awaitingBankFeedback,
    urgentRequests,
    openPartnerRequests,
    slaBreaches,
    capacityScore,
    capacityStatus: getCapacityStatus(capacityScore),
  }
}

export function calculateConsultantCapacity(consultantId = '', context = {}, options = {}) {
  const rows = getRows(context, options)
  const bundle = getConsultantBundle(consultantId, rows)
  if (!bundle.consultant && normalizeText(consultantId)) {
    const error = new Error('Consultant is not available in the current scope.')
    error.code = 'permission_denied'
    throw error
  }
  const capacity = buildCapacity(bundle, options.now ? new Date(options.now) : new Date())
  const previous = getLocalRows(LOCAL_CAPACITY_SNAPSHOT_STORE, rows.workspaceKey).find((row) => row.consultantId === normalizeText(consultantId))
  if (previous?.capacityStatus && previous.capacityStatus !== capacity.capacityStatus) {
    recordActivity(rows.workspaceKey, {
      eventType: BOND_CONSULTANT_PERFORMANCE_EVENTS.consultantCapacityChanged,
      consultantId,
      actorUserId: getActorId(context),
      previousValue: previous,
      newValue: capacity,
    })
  }
  const nextSnapshots = [
    { consultantId: normalizeText(consultantId), ...capacity, updatedAt: new Date().toISOString() },
    ...getLocalRows(LOCAL_CAPACITY_SNAPSHOT_STORE, rows.workspaceKey).filter((row) => row.consultantId !== normalizeText(consultantId)),
  ]
  setLocalRows(LOCAL_CAPACITY_SNAPSHOT_STORE, rows.workspaceKey, nextSnapshots)
  return capacity
}

function buildPerformanceMetrics(bundle = {}, context = {}, options = {}) {
  const now = options.now ? new Date(options.now) : new Date()
  const submittedApplications = bundle.applications.filter(isSubmittedApplication)
  const approvedApplications = bundle.applications.filter(isApprovedApplication)
  const declinedApplications = bundle.applications.filter(isDeclinedApplication)
  const openRequests = bundle.requests.filter((row) => !requestIsResolved(row))
  const breaches = bundle.requests.filter((row) => requestIsBreached(row, now))
  const partnerHealth = getPartnerHealth(context, options)
  const consultantPartnerIds = new Set(bundle.applications.map((row) => getApplicationPartnerId(row) || getApplicationPartnerName(row)).filter(Boolean))
  const partnerHealthImpact = average(partnerHealth.rows.filter((row) => consultantPartnerIds.has(row.partnerId) || consultantPartnerIds.has(row.partnerName)).map((row) => row.healthScore))
  return {
    activeApplications: bundle.applications.filter(isActiveApplication).length,
    openApplications: bundle.applications.filter(isActiveApplication).length,
    applicationsSubmitted: submittedApplications.length,
    applicationsSubmittedThisMonth: submittedApplications.filter((row) => isWithinDays(row, 30, now)).length,
    approvals: approvedApplications.length,
    declines: declinedApplications.length,
    approvalRate: percent(approvedApplications.length, submittedApplications.length || bundle.applications.length),
    declineRate: percent(declinedApplications.length, submittedApplications.length || bundle.applications.length),
    averageTurnaround: average(bundle.applications.map((row) => daysBetween(row.createdAt || row.created_at, row.approvedAt || row.approved_at || row.registeredAt || row.registered_at || row.updatedAt || row.updated_at || row.submittedAt || row.submitted_at))),
    slaCompliance: bundle.requests.length ? percent(bundle.requests.length - breaches.length, bundle.requests.length) : 100,
    partnerResponseTime: average(bundle.requests.map((row) => hoursBetween(row.createdAt || row.created_at, getFirstResponseAt(row) || row.updatedAt || row.updated_at || row.createdAt || row.created_at))),
    openPartnerRequests: openRequests.length,
    slaBreaches: breaches.length,
    partnerComplaints: bundle.requests.filter((row) => normalizeLower(`${row.title} ${row.message} ${row.supportType}`).includes('complaint')).length,
    partnerHealthImpact,
    pendingDocuments: bundle.applications.filter(isPendingDocuments).length,
    awaitingBankFeedback: bundle.applications.filter(isAwaitingBankFeedback).length,
  }
}

function getSeverity(level = 1) {
  if (level >= 3) return 'High'
  if (level === 2) return 'Medium'
  return 'Low'
}

function buildFlag(type = '', reason = '', severity = 'Low', recommendedAction = '') {
  return {
    id: createId('consultant-coaching-flag'),
    type,
    reason,
    severity,
    recommendedAction,
  }
}

function buildCoachingFlags(row = {}, target = DEFAULT_TARGETS) {
  const flags = []
  if (row.capacityStatus === CONSULTANT_CAPACITY_STATUSES.overloaded) {
    flags.push(buildFlag('Overloaded', `${row.consultantName} has a capacity score of ${row.capacityScore}.`, 'High', 'Reassign active applications or partner requests to a normal-capacity consultant.'))
  }
  if (row.approvalRate < Number(target.approvalRateTarget || DEFAULT_TARGETS.approvalRateTarget)) {
    flags.push(buildFlag('Low Approval Rate', `Approval rate is ${row.approvalRate}% against ${target.approvalRateTarget || DEFAULT_TARGETS.approvalRateTarget}% target.`, getSeverity(row.approvalRate < 45 ? 3 : 2), 'Review application quality, bank fit, and pre-submission checks.'))
  }
  if (row.partnerResponseTime > Number(target.responseTimeTarget || DEFAULT_TARGETS.responseTimeTarget)) {
    flags.push(buildFlag('Slow Response Time', `Average first response is ${row.partnerResponseTime}h against ${target.responseTimeTarget || DEFAULT_TARGETS.responseTimeTarget}h target.`, getSeverity(row.partnerResponseTime > 16 ? 3 : 2), 'Review inbox workload or reassign partner requests.'))
  }
  if (row.slaBreaches >= 2 || row.slaCompliance < Number(target.slaComplianceTarget || DEFAULT_TARGETS.slaComplianceTarget)) {
    flags.push(buildFlag('High SLA Breaches', `${row.slaBreaches} SLA breaches and ${row.slaCompliance}% compliance.`, getSeverity(row.slaBreaches >= 4 ? 3 : 2), 'Prioritise breached requests and rebalance urgent work.'))
  }
  if (row.partnerComplaints >= 1) {
    flags.push(buildFlag('High Partner Complaints', `${row.partnerComplaints} partner complaint signal${row.partnerComplaints === 1 ? '' : 's'} detected.`, getSeverity(row.partnerComplaints >= 3 ? 3 : 2), 'Manager should review partner thread quality and communication cadence.'))
  }
  if (row.applicationsSubmitted < Math.max(1, Number(target.applicationsTarget || DEFAULT_TARGETS.applicationsTarget) * 0.4)) {
    flags.push(buildFlag('Low Submission Volume', `${row.applicationsSubmitted} submissions against ${target.applicationsTarget || DEFAULT_TARGETS.applicationsTarget} monthly target.`, 'Medium', 'Review lead allocation, consultant availability, and intake blockers.'))
  }
  if (row.pendingDocuments >= 5) {
    flags.push(buildFlag('Document Delay Bottleneck', `${row.pendingDocuments} applications have pending document signals.`, getSeverity(row.pendingDocuments >= 10 ? 3 : 2), 'Run a document follow-up block and move clean files forward.'))
  }
  if (row.reassignmentCount >= 3) {
    flags.push(buildFlag('Repeated Reassignments', `${row.reassignmentCount} reassignment signals detected.`, 'Medium', 'Review ownership stability and routing quality.'))
  }
  return flags
}

function getTargetKey(consultantId = '', period = '') {
  return `${normalizeText(consultantId)}:${normalizeText(period)}`
}

function normalizeTarget(row = {}, workspaceKey = '') {
  const period = normalizeText(row.period) || new Date().toISOString().slice(0, 7)
  return {
    id: normalizeText(row.id) || createId('consultant-target'),
    organisationId: normalizeText(row.organisationId || row.organisation_id || workspaceKey),
    consultantId: normalizeText(row.consultantId || row.consultant_id),
    period,
    applicationsTarget: Number(row.applicationsTarget ?? row.applications_target ?? DEFAULT_TARGETS.applicationsTarget),
    approvalsTarget: Number(row.approvalsTarget ?? row.approvals_target ?? DEFAULT_TARGETS.approvalsTarget),
    approvalRateTarget: Number(row.approvalRateTarget ?? row.approval_rate_target ?? DEFAULT_TARGETS.approvalRateTarget),
    turnaroundTarget: Number(row.turnaroundTarget ?? row.turnaround_target ?? DEFAULT_TARGETS.turnaroundTarget),
    slaComplianceTarget: Number(row.slaComplianceTarget ?? row.sla_compliance_target ?? DEFAULT_TARGETS.slaComplianceTarget),
    responseTimeTarget: Number(row.responseTimeTarget ?? row.response_time_target ?? DEFAULT_TARGETS.responseTimeTarget),
    createdBy: normalizeText(row.createdBy || row.created_by),
    createdAt: normalizeText(row.createdAt || row.created_at) || new Date().toISOString(),
    updatedAt: normalizeText(row.updatedAt || row.updated_at) || new Date().toISOString(),
  }
}

function assertConsultantAccess(consultantId = '', rows = {}) {
  const consultant = rows.consultants.find((row) => getConsultantId(row) === normalizeText(consultantId))
  if (!consultant) {
    const error = new Error('Consultant is not available in the current scope.')
    error.code = 'permission_denied'
    throw error
  }
  return consultant
}

function assertCanManageConsultant(consultantId = '', rows = {}) {
  const consultant = assertConsultantAccess(consultantId, rows)
  if (rows.scope.scopeLevel === BOND_ORGANISATION_LEVELS.consultant) {
    const error = new Error('Consultants can view their own performance but cannot manage targets.')
    error.code = 'permission_denied'
    throw error
  }
  return consultant
}

export function getConsultantTargets(consultantId = '', context = {}, options = {}) {
  const rows = getRows(context, options)
  assertConsultantAccess(consultantId, rows)
  const workspaceKey = rows.workspaceKey
  const period = normalizeText(options.period) || ''
  return getLocalRows(LOCAL_TARGET_STORE, workspaceKey)
    .filter((row) => row.consultantId === normalizeText(consultantId) && (!period || row.period === period))
    .sort((left, right) => normalizeText(right.period).localeCompare(normalizeText(left.period)))
}

export function setConsultantTarget(consultantId = '', payload = {}, context = {}, options = {}) {
  const rows = getRows(context, options)
  assertCanManageConsultant(consultantId, rows)
  const workspaceKey = rows.workspaceKey
  const period = normalizeText(payload.period || options.period) || new Date().toISOString().slice(0, 7)
  const currentRows = getLocalRows(LOCAL_TARGET_STORE, workspaceKey)
  const existing = currentRows.find((row) => getTargetKey(row.consultantId, row.period) === getTargetKey(consultantId, period))
  const normalized = normalizeTarget({
    ...existing,
    ...payload,
    consultantId,
    period,
    createdBy: existing?.createdBy || getActorId(context),
    createdAt: existing?.createdAt,
    updatedAt: new Date().toISOString(),
  }, workspaceKey)
  setLocalRows(LOCAL_TARGET_STORE, workspaceKey, [
    normalized,
    ...currentRows.filter((row) => getTargetKey(row.consultantId, row.period) !== getTargetKey(consultantId, period)),
  ])
  recordActivity(workspaceKey, {
    eventType: existing ? BOND_CONSULTANT_PERFORMANCE_EVENTS.consultantTargetUpdated : BOND_CONSULTANT_PERFORMANCE_EVENTS.consultantTargetSet,
    consultantId,
    actorUserId: getActorId(context),
    previousValue: existing || null,
    newValue: normalized,
  })
  return normalized
}

function getDefaultTargetForProgress(consultantId = '', context = {}, options = {}) {
  return getConsultantTargets(consultantId, context, options)[0] || normalizeTarget({ consultantId, period: options.period }, getWorkspaceKey(context, options))
}

export function getConsultantTargetProgress(consultantId = '', context = {}, options = {}) {
  const rows = getRows(context, options)
  assertConsultantAccess(consultantId, rows)
  const bundle = getConsultantBundle(consultantId, rows)
  const metrics = buildPerformanceMetrics(bundle, context, options)
  const target = getDefaultTargetForProgress(consultantId, context, options)
  return {
    consultantId: normalizeText(consultantId),
    period: target.period,
    target,
    progress: {
      applicationsSubmitted: { actual: metrics.applicationsSubmitted, target: target.applicationsTarget, percent: percent(metrics.applicationsSubmitted, target.applicationsTarget) },
      approvals: { actual: metrics.approvals, target: target.approvalsTarget, percent: percent(metrics.approvals, target.approvalsTarget) },
      approvalRate: { actual: metrics.approvalRate, target: target.approvalRateTarget, percent: percent(metrics.approvalRate, target.approvalRateTarget) },
      averageTurnaround: { actual: metrics.averageTurnaround, target: target.turnaroundTarget, percent: clamp(100 - Math.max(0, metrics.averageTurnaround - target.turnaroundTarget) * 10) },
      slaCompliance: { actual: metrics.slaCompliance, target: target.slaComplianceTarget, percent: percent(metrics.slaCompliance, target.slaComplianceTarget) },
      partnerResponseTime: { actual: metrics.partnerResponseTime, target: target.responseTimeTarget, percent: clamp(100 - Math.max(0, metrics.partnerResponseTime - target.responseTimeTarget) * 10) },
    },
  }
}

function buildPerformanceRow(consultant = {}, rows = {}, context = {}, options = {}) {
  const consultantId = getConsultantId(consultant)
  const bundle = getConsultantBundle(consultantId, rows)
  const capacity = buildCapacity(bundle, options.now ? new Date(options.now) : new Date())
  const metrics = buildPerformanceMetrics(bundle, context, options)
  const target = getDefaultTargetForProgress(consultantId, context, options)
  const reassignmentCount = bundle.applications.reduce((sum, row) => sum + Number(row.reassignmentCount || row.reassignment_count || 0), 0)
  const baseRow = {
    id: consultantId,
    consultantId,
    consultantName: getConsultantName(consultant),
    branchId: getConsultantBranchId(consultant),
    branchName: consultant.branchName || labelForId(getConsultantBranchId(consultant), rows.branches, getBranchId, getBranchName),
    regionId: getConsultantRegionId(consultant),
    regionName: consultant.regionName || labelForId(getConsultantRegionId(consultant), rows.regions, getRegionId, getRegionName),
    status: normalizeLower(consultant.status) || 'active',
    role: consultant.role || 'consultant',
    ...capacity,
    ...metrics,
    reassignmentCount,
  }
  const coachingFlags = buildCoachingFlags(baseRow, target)
  coachingFlags.forEach((flag) => {
    recordActivity(rows.workspaceKey, {
      eventType: BOND_CONSULTANT_PERFORMANCE_EVENTS.consultantCoachingFlagCreated,
      consultantId,
      actorUserId: getActorId(context),
      newValue: flag,
    })
  })
  return {
    ...baseRow,
    coachingFlags,
    coachingFlagCount: coachingFlags.length,
    topCoachingFlag: coachingFlags[0]?.type || 'None',
  }
}

export function getConsultantPerformanceRows(context = {}, options = {}) {
  const rows = getRows(context, options)
  return rows.consultants.map((consultant) => buildPerformanceRow(consultant, rows, context, options))
}

export function getConsultantPerformanceDashboard(context = {}, options = {}) {
  const rows = getRows(context, options)
  const performanceRows = getConsultantPerformanceRows(context, options)
  const activeRows = performanceRows.filter((row) => row.status !== 'inactive')
  const monthSubmitted = performanceRows.reduce((sum, row) => sum + row.applicationsSubmittedThisMonth, 0)
  return {
    scope: rows.scope,
    summary: {
      totalConsultants: performanceRows.length,
      activeConsultants: activeRows.length,
      overloadedConsultants: performanceRows.filter((row) => row.capacityStatus === CONSULTANT_CAPACITY_STATUSES.overloaded).length,
      averageApprovalRate: average(performanceRows.map((row) => row.approvalRate)),
      averageTurnaround: average(performanceRows.map((row) => row.averageTurnaround)),
      averageSLACompliance: average(performanceRows.map((row) => row.slaCompliance)),
      openApplications: performanceRows.reduce((sum, row) => sum + row.openApplications, 0),
      applicationsSubmittedThisMonth: monthSubmitted,
    },
    rows: performanceRows,
    branchComparison: buildBranchComparison(performanceRows),
    regionComparison: buildRegionComparison(performanceRows),
    recommendations: getWorkloadRecommendations(context, options),
    rankings: getPerformanceRankings(context, options),
  }
}

function buildBranchComparison(rows = []) {
  const grouped = new Map()
  rows.forEach((row) => grouped.set(row.branchId || row.branchName, [...(grouped.get(row.branchId || row.branchName) || []), row]))
  return [...grouped.entries()].map(([id, items]) => ({
    id,
    name: items[0]?.branchName || id,
    consultants: items.length,
    overloadedConsultants: items.filter((row) => row.capacityStatus === CONSULTANT_CAPACITY_STATUSES.overloaded).length,
    averageCapacityScore: average(items.map((row) => row.capacityScore)),
    averageSLACompliance: average(items.map((row) => row.slaCompliance)),
    averageApprovalRate: average(items.map((row) => row.approvalRate)),
    escalationHotspots: items.reduce((sum, row) => sum + row.slaBreaches + row.urgentRequests, 0),
  }))
}

function buildRegionComparison(rows = []) {
  const grouped = new Map()
  rows.forEach((row) => grouped.set(row.regionId || row.regionName, [...(grouped.get(row.regionId || row.regionName) || []), row]))
  return [...grouped.entries()].map(([id, items]) => ({
    id,
    name: items[0]?.regionName || id,
    consultants: items.length,
    branches: new Set(items.map((row) => row.branchId || row.branchName).filter(Boolean)).size,
    overloadedConsultants: items.filter((row) => row.capacityStatus === CONSULTANT_CAPACITY_STATUSES.overloaded).length,
    averageCapacityScore: average(items.map((row) => row.capacityScore)),
    averageSLACompliance: average(items.map((row) => row.slaCompliance)),
    averageApprovalRate: average(items.map((row) => row.approvalRate)),
  }))
}

export function getCoachingFlags(consultantId = '', context = {}, options = {}) {
  const rows = getRows(context, options)
  assertConsultantAccess(consultantId, rows)
  return buildPerformanceRow(assertConsultantAccess(consultantId, rows), rows, context, options).coachingFlags
}

export function addConsultantCoachingNote(consultantId = '', payload = {}, context = {}, options = {}) {
  const rows = getRows(context, options)
  assertCanManageConsultant(consultantId, rows)
  const note = {
    id: createId('consultant-coaching-note'),
    consultantId: normalizeText(consultantId),
    note: normalizeText(payload.note || payload.message),
    flagType: normalizeText(payload.flagType || payload.flag_type),
    severity: normalizeText(payload.severity) || 'Medium',
    createdBy: getActorId(context),
    createdAt: new Date().toISOString(),
  }
  if (!note.note) throw new Error('Coaching note is required.')
  setLocalRows(LOCAL_COACHING_NOTE_STORE, rows.workspaceKey, [note, ...getLocalRows(LOCAL_COACHING_NOTE_STORE, rows.workspaceKey)])
  recordActivity(rows.workspaceKey, {
    eventType: BOND_CONSULTANT_PERFORMANCE_EVENTS.consultantCoachingNoteAdded,
    consultantId,
    actorUserId: getActorId(context),
    newValue: note,
  })
  return note
}

function getDestinationCandidates(source = {}, rows = []) {
  return rows
    .filter((candidate) => candidate.consultantId !== source.consultantId && candidate.status !== 'inactive')
    .filter((candidate) => [CONSULTANT_CAPACITY_STATUSES.light, CONSULTANT_CAPACITY_STATUSES.normal].includes(candidate.capacityStatus))
    .sort((left, right) => {
      const sameBranchDelta = Number(right.branchId === source.branchId) - Number(left.branchId === source.branchId)
      if (sameBranchDelta) return sameBranchDelta
      const sameRegionDelta = Number(right.regionId === source.regionId) - Number(left.regionId === source.regionId)
      if (sameRegionDelta) return sameRegionDelta
      return left.capacityScore - right.capacityScore
    })
}

export function getWorkloadRecommendations(context = {}, options = {}) {
  const rows = getConsultantPerformanceRows(context, options)
  if (!rows.length) return []
  const recommendations = []
  rows
    .filter((row) => row.capacityStatus === CONSULTANT_CAPACITY_STATUSES.overloaded || row.slaBreaches >= 2)
    .forEach((source) => {
      const destination = getDestinationCandidates(source, rows)[0]
      if (!destination) return
      const moveCount = Math.max(1, Math.min(6, Math.round((source.capacityScore - destination.capacityScore) / 3)))
      const recommendation = {
        id: createId('workload-recommendation'),
        fromConsultantId: source.consultantId,
        fromConsultantName: source.consultantName,
        toConsultantId: destination.consultantId,
        toConsultantName: destination.consultantName,
        branchId: source.branchId,
        regionId: source.regionId,
        applicationCount: moveCount,
        reason: `${source.consultantName} is ${source.capacityStatus.toLowerCase()}; ${destination.consultantName} is ${destination.capacityStatus.toLowerCase()} capacity.`,
        recommendation: `Move ${moveCount} active application${moveCount === 1 ? '' : 's'} from ${source.consultantName} to ${destination.consultantName}.`,
      }
      recommendations.push(recommendation)
    })
  const workspaceKey = getWorkspaceKey(context, options)
  recommendations.forEach((recommendation) => {
    recordActivity(workspaceKey, {
      eventType: BOND_CONSULTANT_PERFORMANCE_EVENTS.workloadRecommendationCreated,
      consultantId: recommendation.fromConsultantId,
      actorUserId: getActorId(context),
      newValue: recommendation,
    })
  })
  return recommendations
}

function getForecastRisk(capacityStatus = '') {
  if (capacityStatus === CONSULTANT_CAPACITY_STATUSES.overloaded) return 'High'
  if (capacityStatus === CONSULTANT_CAPACITY_STATUSES.busy) return 'Medium'
  return 'Low'
}

function getForecastAction(riskLevel = '') {
  if (riskLevel === 'High') return 'Reassign workload and pause new routing until capacity improves.'
  if (riskLevel === 'Medium') return 'Route new applications carefully and resolve document blockers.'
  return 'Capacity can absorb normal routing.'
}

export function getConsultantForecast(consultantId = '', context = {}, options = {}) {
  const rows = getRows(context, options)
  assertConsultantAccess(consultantId, rows)
  const bundle = getConsultantBundle(consultantId, rows)
  const capacity = buildCapacity(bundle, options.now ? new Date(options.now) : new Date())
  const recentApplications = bundle.applications.filter((row) => isWithinDays(row, 30, options.now ? new Date(options.now) : new Date())).length
  const resolvedApplications = bundle.applications.filter((row) => ['registered', 'completed', 'approved'].some((term) => getSignal(row).includes(term))).length
  const averageDailyNewApplications = Math.round((recentApplications / 30) * 10) / 10
  const averageResolutionRate = Math.round((resolvedApplications / 30) * 10) / 10
  return [7, 14, 30].map((days) => {
    const expectedCapacity = Math.max(0, Math.round(capacity.capacityScore + averageDailyNewApplications * days - averageResolutionRate * days + capacity.openPartnerRequests * 0.3 + capacity.pendingDocuments * 0.2))
    const capacityStatus = getCapacityStatus(expectedCapacity)
    const riskLevel = getForecastRisk(capacityStatus)
    return {
      periodDays: days,
      expectedCapacity,
      capacityStatus,
      riskLevel,
      recommendedAction: getForecastAction(riskLevel),
      inputs: {
        currentActiveApplications: capacity.activeApplications,
        averageDailyNewApplications,
        averageResolutionRate,
        openPartnerRequests: capacity.openPartnerRequests,
        pendingDocumentVolume: capacity.pendingDocuments,
      },
    }
  })
}

function mostImproved(rows = []) {
  return [...rows].sort((left, right) => (right.approvalRate - Number(right.previousApprovalRate || 0)) - (left.approvalRate - Number(left.previousApprovalRate || 0)))
}

export function getPerformanceRankings(context = {}, options = {}) {
  const rowsEnvelope = getRows(context, options)
  if (rowsEnvelope.scope.scopeLevel === BOND_ORGANISATION_LEVELS.consultant) {
    return { scope: rowsEnvelope.scope, accessDenied: true }
  }
  const rows = getConsultantPerformanceRows(context, options)
  return {
    scope: rowsEnvelope.scope,
    topApprovalRate: [...rows].sort((left, right) => right.approvalRate - left.approvalRate).slice(0, 5),
    fastestTurnaround: [...rows].sort((left, right) => left.averageTurnaround - right.averageTurnaround).slice(0, 5),
    bestSLACompliance: [...rows].sort((left, right) => right.slaCompliance - left.slaCompliance).slice(0, 5),
    mostImproved: mostImproved(rows).slice(0, 5),
    highestVolume: [...rows].sort((left, right) => right.applicationsSubmitted - left.applicationsSubmitted).slice(0, 5),
    atRiskConsultants: rows.filter((row) => row.coachingFlags.some((flag) => flag.severity === 'High') || row.capacityStatus === CONSULTANT_CAPACITY_STATUSES.overloaded),
  }
}

export function getConsultantWorkspace(consultantId = '', context = {}, options = {}) {
  const rows = getRows(context, options)
  const consultant = assertConsultantAccess(consultantId, rows)
  const performance = buildPerformanceRow(consultant, rows, context, options)
  const progress = getConsultantTargetProgress(consultantId, context, options)
  return {
    scope: rows.scope,
    consultant,
    performance,
    capacity: buildCapacity(getConsultantBundle(consultantId, rows), options.now ? new Date(options.now) : new Date()),
    targets: getConsultantTargets(consultantId, context, options),
    targetProgress: progress,
    applications: getConsultantBundle(consultantId, rows).applications,
    coachingNotes: getLocalRows(LOCAL_COACHING_NOTE_STORE, rows.workspaceKey).filter((row) => row.consultantId === normalizeText(consultantId)),
    coachingFlags: performance.coachingFlags,
    activity: getLocalRows(LOCAL_ACTIVITY_STORE, rows.workspaceKey).filter((row) => row.consultantId === normalizeText(consultantId)),
    forecast: getConsultantForecast(consultantId, context, options),
  }
}

function getApplicationBuyerName(row = {}) {
  return normalizeText(row.buyerName || row.buyer_name || row.clientName || row.client_name || row.purchaserName || row.purchaser_name || row.buyer?.name) || 'Buyer pending'
}

function getApplicationReference(row = {}) {
  return normalizeText(row.applicationReference || row.application_reference || row.transactionReference || row.transaction_reference || row.reference || getApplicationId(row)) || 'Application'
}

function getApplicationBank(row = {}) {
  return normalizeText(row.bankName || row.bank_name || row.bank || row.lenderName || row.lender_name) || 'Unassigned'
}

function getApplicationStage(row = {}) {
  const signal = getSignal(row)
  if (signal.includes('instruction')) return 'Instruction Sent'
  if (signal.includes('approved') || signal.includes('quote accepted')) return 'Quote Approved'
  if (signal.includes('feedback') || signal.includes('bank')) return 'Feedback Received'
  if (signal.includes('submitted')) return 'Applications Submitted'
  if (signal.includes('doc')) return 'Documents Received'
  return normalizeText(row.applicationStage || row.application_stage || row.stage || row.financeStageLabel || row.finance_stage_label) || 'New Applications'
}

function getApplicationStatus(row = {}) {
  return normalizeText(row.applicationStatus || row.application_status || row.status || row.financeStatus || row.finance_status) || 'Active'
}

function getApplicationLastActivityAt(row = {}) {
  return normalizeText(row.lastActivityAt || row.last_activity_at || row.updatedAt || row.updated_at || row.submittedAt || row.submitted_at || row.createdAt || row.created_at)
}

function getApplicationAgeDays(row = {}, now = new Date()) {
  const createdAt = normalizeText(row.createdAt || row.created_at || row.submittedAt || row.submitted_at || getApplicationLastActivityAt(row))
  return daysBetween(createdAt, now.toISOString())
}

function getPendingDocumentCount(row = {}) {
  return Number(row.pendingDocumentCount ?? row.pending_document_count ?? row.missingDocumentsCount ?? row.missing_documents_count ?? row.documentsMissing ?? row.documents_missing ?? 0) || 0
}

function getMissingDocuments(row = {}) {
  const raw = row.missingDocuments || row.missing_documents || row.riskFlags || row.risk_flags || []
  if (Array.isArray(raw)) return raw.map(normalizeText).filter(Boolean)
  return normalizeText(raw).split(',').map(normalizeText).filter(Boolean)
}

function getApplicationEstimatedRevenue(row = {}) {
  const explicit = Number(row.estimatedRevenue ?? row.estimated_revenue ?? row.projectedCommission ?? row.projected_commission ?? row.revenue)
  if (Number.isFinite(explicit) && explicit > 0) return explicit
  const bondValue = Number(row.bondValue || row.bond_value || row.purchasePrice || row.purchase_price || row.salesPrice || row.sales_price || 0)
  return bondValue ? Math.round(bondValue * 0.012) : 0
}

function getApplicationBankResponseDays(row = {}) {
  const explicit = Number(row.bankResponseDays ?? row.bank_response_days ?? row.averageBankResponseDays ?? row.average_bank_response_days)
  if (Number.isFinite(explicit) && explicit > 0) return explicit
  if (row.bankFeedbackAt || row.bank_feedback_at || row.submittedAt || row.submitted_at) {
    return daysBetween(row.submittedAt || row.submitted_at || row.createdAt || row.created_at, row.bankFeedbackAt || row.bank_feedback_at || row.updatedAt || row.updated_at)
  }
  return 0
}

function normalizeConsultantApplication(row = {}, now = new Date()) {
  const ageDays = getApplicationAgeDays(row, now)
  const lastActivityAt = getApplicationLastActivityAt(row)
  const lastActivityDays = lastActivityAt ? daysBetween(lastActivityAt, now.toISOString()) : ageDays
  const missingDocumentCount = getPendingDocumentCount(row)
  const bankResponseDays = getApplicationBankResponseDays(row)
  const riskFlags = [
    ...getMissingDocuments(row),
    ...(ageDays > 30 ? ['Overdue > 30 days'] : []),
    ...(lastActivityDays > 7 ? ['No activity in 7 days'] : []),
    ...(bankResponseDays > 7 ? ['Bank feedback delayed'] : []),
  ]
  return {
    id: getApplicationId(row),
    buyerName: getApplicationBuyerName(row),
    reference: getApplicationReference(row),
    stage: getApplicationStage(row),
    bank: getApplicationBank(row),
    status: getApplicationStatus(row),
    ageDays,
    missingDocumentCount,
    missingDocuments: getMissingDocuments(row),
    lastActivityAt,
    lastActivityDays,
    nextAction: normalizeText(row.nextAction || row.next_action) || (missingDocumentCount ? 'Follow up missing documents' : bankResponseDays > 7 ? 'Escalate bank feedback' : 'Keep application moving'),
    href: `/bond/applications?transactionId=${encodeURIComponent(getApplicationId(row))}`,
    estimatedRevenue: getApplicationEstimatedRevenue(row),
    turnaroundDays: Number(row.turnaroundDays ?? row.turnaround_days) || daysBetween(row.createdAt || row.created_at, row.approvedAt || row.approved_at || row.updatedAt || row.updated_at),
    bankResponseDays,
    quoteAcceptanceStatus: normalizeText(row.quoteAcceptanceStatus || row.quote_acceptance_status || row.quoteStatus || row.quote_status),
    riskFlags: [...new Set(riskFlags.filter(Boolean))],
    raw: row,
  }
}

export function getConsultantById(consultantId = '', context = {}, options = {}) {
  const rows = getRows(context, options)
  const consultant = assertConsultantAccess(consultantId, rows)
  return normalizeConsultant(consultant, rows.branches, rows.regions)
}

export function getApplicationsByConsultant(consultantId = '', context = {}, options = {}) {
  const rows = getRows(context, options)
  assertConsultantAccess(consultantId, rows)
  const now = options.now ? new Date(options.now) : new Date()
  return getConsultantBundle(consultantId, rows).applications.map((row) => normalizeConsultantApplication(row, now))
}

export function getConsultantOverviewMetrics(consultantId = '', context = {}, options = {}) {
  const rows = getRows(context, options)
  const consultant = assertConsultantAccess(consultantId, rows)
  const performance = buildPerformanceRow(consultant, rows, context, options)
  const applications = getApplicationsByConsultant(consultantId, context, options)
  const revenueForecast = applications.reduce((sum, row) => sum + row.estimatedRevenue, 0)
  return {
    ...performance,
    revenueForecast,
    submittedApplications: performance.applicationsSubmitted,
    averageTurnaround: performance.averageTurnaround,
    pendingDocuments: performance.pendingDocuments,
    bankFeedbackDelays: applications.filter((row) => row.bankResponseDays > 7 || row.stage === 'Feedback Received').length,
  }
}

export function getConsultantWorkloadByStage(consultantId = '', context = {}, options = {}) {
  const stages = ['New Applications', 'Documents Received', 'Applications Submitted', 'Feedback Received', 'Quote Approved', 'Instruction Sent']
  const applications = getApplicationsByConsultant(consultantId, context, options)
  const total = Math.max(applications.length, 1)
  return stages.map((stage) => {
    const count = applications.filter((row) => row.stage === stage).length
    return { key: normalizeLower(stage).replace(/[^a-z0-9]+/g, '_'), stage, count, percentage: percent(count, total), href: `/bond/consultant-performance?consultantId=${encodeURIComponent(consultantId)}&tab=applications&stage=${encodeURIComponent(stage)}` }
  })
}

export function getConsultantAttentionItems(consultantId = '', context = {}, options = {}) {
  const applications = getApplicationsByConsultant(consultantId, context, options)
  const items = [
    { key: 'waiting_docs', label: 'Waiting on documents', count: applications.filter((row) => row.missingDocumentCount > 0 || row.riskFlags.some((flag) => normalizeLower(flag).includes('document'))).length, urgency: 'Warning' },
    { key: 'overdue', label: 'Overdue applications > 30 days', count: applications.filter((row) => row.ageDays > 30).length, urgency: 'High' },
    { key: 'conditions', label: 'Conditions outstanding', count: applications.filter((row) => normalizeLower(`${row.status} ${row.nextAction} ${row.quoteAcceptanceStatus}`).includes('condition')).length, urgency: 'Medium' },
    { key: 'stale', label: 'No activity in 7 days', count: applications.filter((row) => row.lastActivityDays > 7).length, urgency: 'Warning' },
    { key: 'bank_feedback', label: 'Bank feedback delayed', count: applications.filter((row) => row.bankResponseDays > 7 || normalizeLower(row.nextAction).includes('bank feedback')).length, urgency: 'High' },
  ]
  return items.map((item) => ({ ...item, href: `/bond/consultant-performance?consultantId=${encodeURIComponent(consultantId)}&tab=applications&attention=${item.key}` }))
}

export function getConsultantCapacityHealth(consultantId = '', context = {}, options = {}) {
  const dashboard = getConsultantPerformanceDashboard(context, options)
  const row = dashboard.rows.find((item) => item.consultantId === normalizeText(consultantId))
  assertConsultantAccess(consultantId, getRows(context, options))
  const branchRows = dashboard.rows.filter((item) => item.branchId === row?.branchId && item.consultantId !== row?.consultantId)
  const branchAverage = average((branchRows.length ? branchRows : dashboard.rows).map((item) => item.activeApplications))
  const activeApplications = row?.activeApplications || 0
  const variance = branchAverage ? Math.round(((activeApplications - branchAverage) / branchAverage) * 100) : 0
  const status = activeApplications >= 28 || row?.capacityStatus === CONSULTANT_CAPACITY_STATUSES.overloaded ? 'Over capacity' : activeApplications >= 22 || row?.capacityStatus === CONSULTANT_CAPACITY_STATUSES.busy ? 'High workload' : row?.slaBreaches >= 2 ? 'At risk' : 'Normal'
  return {
    status,
    activeApplications,
    branchAverage,
    variance,
    overdueCount: getApplicationsByConsultant(consultantId, context, options).filter((item) => item.ageDays > 30).length,
    pendingDocumentCount: row?.pendingDocuments || 0,
    recommendedAction: status === 'Over capacity' ? 'Reassign active applications and pause new routing.' : status === 'High workload' ? 'Resolve document blockers before assigning more work.' : status === 'At risk' ? 'Review overdue and SLA breach queues today.' : 'Capacity can absorb normal routing.',
  }
}

export function getConsultantBankMix(consultantId = '', context = {}, options = {}) {
  const applications = getApplicationsByConsultant(consultantId, context, options)
  const grouped = new Map()
  applications.forEach((row) => {
    const key = row.bank || 'Other'
    const current = grouped.get(key) || { bank: key, active: 0, submitted: 0, approved: 0, total: 0 }
    current.total += 1
    current.active += ['active', 'submitted', 'in_progress'].some((term) => normalizeLower(row.status).includes(term)) || isActiveApplication(row.raw) ? 1 : 0
    current.submitted += isSubmittedApplication(row.raw) ? 1 : 0
    current.approved += isApprovedApplication(row.raw) ? 1 : 0
    grouped.set(key, current)
  })
  return [...grouped.values()].map((row) => ({ ...row, approvalRate: percent(row.approved, row.submitted || row.total) })).sort((left, right) => right.total - left.total)
}

export function getConsultantPerformanceTrend(consultantId = '', context = {}, options = {}) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun']
  const metrics = getConsultantOverviewMetrics(consultantId, context, options)
  const baseApproval = Math.max(42, metrics.approvalRate || 62)
  const baseSubmitted = Math.max(3, metrics.applicationsSubmitted || 6)
  const baseTurnaround = Math.max(8, metrics.averageTurnaround || 26)
  return months.map((month, index) => ({
    month,
    approvalRate: clamp(baseApproval - (5 - index) * 3 + (index % 2 ? 1 : 0), 25, 95),
    submittedApplications: Math.max(1, Math.round(baseSubmitted - (5 - index) * 0.6 + (index % 3))),
    averageTurnaround: Math.max(4, Math.round((baseTurnaround + (5 - index) * 1.2) * 10) / 10),
  }))
}

export function getConsultantActivityTimeline(consultantId = '', context = {}, options = {}) {
  const workspace = getConsultantWorkspace(consultantId, context, options)
  const applications = getApplicationsByConsultant(consultantId, context, options)
  const synthetic = applications.flatMap((row, index) => [
    { id: `${row.id}-updated`, type: 'application_updated', action: 'Application updated', relatedApplication: row.buyerName, actor: workspace.consultant?.name || workspace.performance?.consultantName || 'Consultant', timestamp: row.lastActivityAt || new Date().toISOString(), sortIndex: index },
    ...(row.missingDocumentCount ? [{ id: `${row.id}-docs`, type: 'documents_requested', action: 'Documents requested', relatedApplication: row.buyerName, actor: workspace.consultant?.name || 'Consultant', timestamp: row.lastActivityAt || new Date().toISOString(), sortIndex: index + 0.1 }] : []),
    ...(row.stage === 'Feedback Received' ? [{ id: `${row.id}-feedback`, type: 'bank_feedback_received', action: 'Bank feedback received', relatedApplication: row.buyerName, actor: 'Bank partner', timestamp: row.lastActivityAt || new Date().toISOString(), sortIndex: index + 0.2 }] : []),
    ...(row.stage === 'Quote Approved' ? [{ id: `${row.id}-quote`, type: 'quote_accepted', action: 'Quote approved', relatedApplication: row.buyerName, actor: row.buyerName, timestamp: row.lastActivityAt || new Date().toISOString(), sortIndex: index + 0.3 }] : []),
  ])
  const local = workspace.activity.map((row) => ({ id: row.id, type: row.eventType, action: row.eventType.replace(/_/g, ' ').toLowerCase(), relatedApplication: workspace.performance?.consultantName || 'Consultant', actor: row.actorUserId || 'Manager', timestamp: row.createdAt }))
  return [...local, ...synthetic]
    .sort((left, right) => new Date(right.timestamp || 0).getTime() - new Date(left.timestamp || 0).getTime() || (left.sortIndex || 0) - (right.sortIndex || 0))
    .slice(0, 18)
}

export function getConsultantBenchmarks(consultantId = '', context = {}, options = {}) {
  const dashboard = getConsultantPerformanceDashboard(context, options)
  const row = dashboard.rows.find((item) => item.consultantId === normalizeText(consultantId))
  assertConsultantAccess(consultantId, getRows(context, options))
  const branchRows = dashboard.rows.filter((item) => item.branchId === row?.branchId)
  const regionRows = dashboard.rows.filter((item) => item.regionId === row?.regionId)
  const benchmarkFor = (rows, key) => average(rows.map((item) => item[key]))
  return {
    consultant: row,
    branch: {
      approvalRate: benchmarkFor(branchRows, 'approvalRate'),
      averageTurnaround: benchmarkFor(branchRows, 'averageTurnaround'),
      submittedApplications: benchmarkFor(branchRows, 'applicationsSubmitted'),
      partnerResponseTime: benchmarkFor(branchRows, 'partnerResponseTime'),
    },
    region: {
      approvalRate: benchmarkFor(regionRows, 'approvalRate'),
      averageTurnaround: benchmarkFor(regionRows, 'averageTurnaround'),
      submittedApplications: benchmarkFor(regionRows, 'applicationsSubmitted'),
      partnerResponseTime: benchmarkFor(regionRows, 'partnerResponseTime'),
    },
    national: {
      approvalRate: benchmarkFor(dashboard.rows, 'approvalRate'),
      averageTurnaround: benchmarkFor(dashboard.rows, 'averageTurnaround'),
      submittedApplications: benchmarkFor(dashboard.rows, 'applicationsSubmitted'),
      partnerResponseTime: benchmarkFor(dashboard.rows, 'partnerResponseTime'),
    },
  }
}

export const __bondConsultantPerformanceServiceTestUtils = Object.freeze({
  clearStores() {
    LOCAL_TARGET_STORE.clear()
    LOCAL_COACHING_NOTE_STORE.clear()
    LOCAL_ACTIVITY_STORE.clear()
    LOCAL_CAPACITY_SNAPSHOT_STORE.clear()
    localSequence = 0
  },
  seedTargets(workspaceId = '', rows = []) {
    setLocalRows(LOCAL_TARGET_STORE, normalizeText(workspaceId || 'default'), rows.map((row) => normalizeTarget(row, workspaceId)))
  },
  getTargets(workspaceId = '') {
    return getLocalRows(LOCAL_TARGET_STORE, normalizeText(workspaceId || 'default'))
  },
  getCoachingNotes(workspaceId = '') {
    return getLocalRows(LOCAL_COACHING_NOTE_STORE, normalizeText(workspaceId || 'default'))
  },
  getActivity(workspaceId = '') {
    return getLocalRows(LOCAL_ACTIVITY_STORE, normalizeText(workspaceId || 'default'))
  },
})
