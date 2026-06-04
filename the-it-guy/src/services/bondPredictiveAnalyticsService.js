import {
  BOND_ORGANISATION_LEVELS,
  resolveBondOrganisationScope,
} from './bondOrganisationScopeResolver'
import { getPartnerPortalOperationalRows } from './bondPartnerPortalService'

export const BOND_PREDICTIVE_EVENTS = Object.freeze({
  applicationRiskUpdated: 'APPLICATION_RISK_UPDATED',
  predictionGenerated: 'PREDICTION_GENERATED',
  predictionConfirmed: 'PREDICTION_CONFIRMED',
  predictionIncorrect: 'PREDICTION_INCORRECT',
  partnerChurnRiskUpdated: 'PARTNER_CHURN_RISK_UPDATED',
  capacityRiskUpdated: 'CAPACITY_RISK_UPDATED',
  revenueRiskUpdated: 'REVENUE_RISK_UPDATED',
})

const LOCAL_SNAPSHOT_STORE = new Map()
const LOCAL_RISK_SCORE_STORE = new Map()
const LOCAL_HISTORY_STORE = new Map()
const LOCAL_FEEDBACK_STORE = new Map()
let localSequence = 0

const HQ_ROLES = new Set(['owner', 'principal', 'director', 'partner', 'hq_manager', 'bond_hq_manager', 'national_manager', 'bond_national_manager', 'operations_manager', 'bond_operations_manager', 'admin', 'admin_staff'])
const REGIONAL_ROLES = new Set(['regional_manager', 'bond_regional_manager'])
const BRANCH_ROLES = new Set(['branch_manager', 'bond_branch_manager', 'team_lead', 'bond_team_lead'])
const CONSULTANT_ROLES = new Set(['consultant', 'bond_consultant', 'bond_originator', 'processor', 'bond_processor'])
const BANKS = ['ABSA', 'FNB', 'Nedbank', 'Standard Bank', 'Investec']

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase()
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : []
}

function createId(prefix = 'bond-prediction') {
  localSequence += 1
  return `${prefix}-${Date.now().toString(36)}-${localSequence}`
}

function clamp(value = 0, min = 0, max = 100) {
  const number = Number(value)
  if (!Number.isFinite(number)) return min
  return Math.max(min, Math.min(max, number))
}

function percent(part = 0, total = 0) {
  return total ? Math.round((Number(part || 0) / Number(total || 0)) * 100) : 0
}

function average(values = []) {
  const safe = values.map(Number).filter((value) => Number.isFinite(value))
  if (!safe.length) return 0
  return Math.round(safe.reduce((sum, value) => sum + value, 0) / safe.length)
}

function money(value = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0
}

function addDays(date = new Date(), days = 0) {
  const next = new Date(date)
  next.setDate(next.getDate() + Number(days || 0))
  return next.toISOString()
}

function daysBetween(value = '', now = new Date()) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 0
  return Math.max(0, Math.floor((now.getTime() - date.getTime()) / (24 * 60 * 60 * 1000)))
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

function getMembershipRole(context = {}) {
  return normalizeLower(context.currentMembership?.workspaceRole || context.currentMembership?.workspace_role || context.currentMembership?.organisationRole || context.currentMembership?.organisation_role || context.workspaceRole || context.organisationRole)
}

function hasExplicitHqScope(context = {}) {
  return normalizeLower(context.currentMembership?.scopeLevel || context.currentMembership?.scope_level || context.currentMembership?.scope || context.scopeLevel || context.scope_level) === 'workspace_hq'
}

function getLocalRows(store, workspaceKey = '') {
  return [...(store.get(workspaceKey) || [])]
}

function setLocalRows(store, workspaceKey = '', rows = []) {
  store.set(workspaceKey, rows)
}

function getRows(context = {}, options = {}) {
  const workspaceKey = getWorkspaceKey(context, options)
  const operationalRows = getPartnerPortalOperationalRows(context, { ...options, workspaceId: workspaceKey })
  const applications = normalizeArray(options.applications || operationalRows.applications)
  const branches = normalizeArray(options.branches || options.units || operationalRows.branches || operationalRows.units)
  const regions = normalizeArray(options.regions || operationalRows.regions)
  const consultants = normalizeArray(options.consultants || options.users || operationalRows.consultants || operationalRows.users)
  const partners = normalizeArray(options.partners || operationalRows.partners)
  const banks = normalizeArray(options.banks)
  const documents = normalizeArray(options.documents || operationalRows.documents)
  const requests = normalizeArray(options.requests || options.slaRequests || operationalRows.partnerRequests)
  const resolvedScope = resolveBondOrganisationScope(context, {
    regions,
    branches,
    consultants,
    applications,
  })
  const scope = hasExplicitHqScope(context)
    ? {
        ...resolvedScope,
        scopeLevel: BOND_ORGANISATION_LEVELS.hq,
        organisationLevel: BOND_ORGANISATION_LEVELS.hq,
        regionIds: 'ALL',
        branchIds: 'ALL',
        consultantIds: 'ALL',
      }
    : resolvedScope
  const rows = {
    workspaceKey,
    scope,
    applications,
    branches,
    regions,
    consultants,
    partners,
    banks,
    documents,
    requests,
    snapshots: [...normalizeArray(options.snapshots), ...getLocalRows(LOCAL_SNAPSHOT_STORE, workspaceKey)],
    riskScores: [...normalizeArray(options.riskScores), ...getLocalRows(LOCAL_RISK_SCORE_STORE, workspaceKey)],
    history: [...normalizeArray(options.history), ...getLocalRows(LOCAL_HISTORY_STORE, workspaceKey)],
    feedback: [...normalizeArray(options.feedback), ...getLocalRows(LOCAL_FEEDBACK_STORE, workspaceKey)],
  }
  return scopeRows(rows)
}

function canViewPredictive(context = {}, scope = {}) {
  const role = getMembershipRole(context) || normalizeLower(scope.role)
  if (scope.scopeLevel === BOND_ORGANISATION_LEVELS.hq && HQ_ROLES.has(role)) return true
  if (scope.scopeLevel === BOND_ORGANISATION_LEVELS.region && REGIONAL_ROLES.has(role)) return true
  if (scope.scopeLevel === BOND_ORGANISATION_LEVELS.branch && BRANCH_ROLES.has(role)) return true
  if (scope.scopeLevel === BOND_ORGANISATION_LEVELS.consultant && CONSULTANT_ROLES.has(role)) return true
  if (hasExplicitHqScope(context) && HQ_ROLES.has(role)) return true
  return false
}

function assertPredictiveAccess(rows = {}, context = {}) {
  if (canViewPredictive(context, rows.scope)) return
  const error = new Error('Predictive Intelligence access is not permitted for this user.')
  error.code = 'permission_denied'
  throw error
}

function getApplicationId(row = {}) {
  return normalizeText(row.id || row.applicationId || row.application_id || row.transactionId || row.transaction_id || row.key)
}

function getApplicationConsultantId(row = {}) {
  return normalizeText(row.assignedConsultantId || row.assigned_consultant_id || row.assignedUserId || row.assigned_user_id || row.primaryBondConsultantUserId || row.primary_bond_consultant_user_id || row.ownerUserId || row.owner_user_id)
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

function getApplicationBank(row = {}) {
  const value = normalizeLower(row.bank || row.bankName || row.bank_name || row.lender || row.lenderName || row.lender_name || row.submittedBank || row.submitted_bank)
  if (value.includes('absa')) return 'ABSA'
  if (value.includes('fnb') || value.includes('first national')) return 'FNB'
  if (value.includes('nedbank')) return 'Nedbank'
  if (value.includes('standard')) return 'Standard Bank'
  if (value.includes('investec')) return 'Investec'
  return 'Other'
}

function scopeRows(rows = {}) {
  const scope = rows.scope || {}
  const applications = rows.applications.filter((row) => scopeMatchesApplication(scope, row))
  const branchIds = new Set(applications.map(getApplicationBranchId).filter(Boolean))
  const regionIds = new Set(applications.map(getApplicationRegionId).filter(Boolean))
  const consultantIds = new Set(applications.map(getApplicationConsultantId).filter(Boolean))
  const partnerIds = new Set(applications.map(getApplicationPartnerId).filter(Boolean))
  return {
    ...rows,
    applications,
    branches: rows.branches.filter((row) => scope.scopeLevel === BOND_ORGANISATION_LEVELS.hq || branchIds.has(getBranchId(row)) || (scope.scopeLevel === BOND_ORGANISATION_LEVELS.region && normalizeArray(scope.regionIds).includes(getBranchRegionId(row)))),
    regions: rows.regions.filter((row) => scope.scopeLevel === BOND_ORGANISATION_LEVELS.hq || regionIds.has(getRegionId(row)) || normalizeArray(scope.regionIds).includes(getRegionId(row))),
    consultants: rows.consultants.filter((row) => scope.scopeLevel === BOND_ORGANISATION_LEVELS.hq || consultantIds.has(getConsultantId(row))),
    partners: rows.partners.filter((row) => scope.scopeLevel === BOND_ORGANISATION_LEVELS.hq || partnerIds.has(getPartnerId(row))),
    documents: rows.documents.filter((row) => !row.applicationId || applications.some((application) => getApplicationId(application) === normalizeText(row.applicationId || row.application_id))),
    requests: rows.requests.filter((row) => !row.applicationId || applications.some((application) => getApplicationId(application) === normalizeText(row.applicationId || row.application_id))),
  }
}

function scopeMatchesApplication(scope = {}, row = {}) {
  if (scope.scopeLevel === BOND_ORGANISATION_LEVELS.hq) return true
  if (scope.scopeLevel === BOND_ORGANISATION_LEVELS.region) return normalizeArray(scope.regionIds).includes(getApplicationRegionId(row))
  if (scope.scopeLevel === BOND_ORGANISATION_LEVELS.branch) return normalizeArray(scope.branchIds).includes(getApplicationBranchId(row))
  return normalizeArray(scope.consultantIds).includes(getApplicationConsultantId(row))
}

function getBranchId(row = {}) {
  return normalizeText(row.id || row.branchId || row.branch_id || row.workspaceUnitId || row.workspace_unit_id)
}

function getBranchRegionId(row = {}) {
  return normalizeText(row.regionId || row.region_id)
}

function getBranchName(row = {}) {
  return normalizeText(row.name || row.branchName || row.branch_name || row.label || getBranchId(row)) || 'Branch'
}

function getRegionId(row = {}) {
  return normalizeText(row.id || row.regionId || row.region_id)
}

function getConsultantId(row = {}) {
  return normalizeText(row.id || row.userId || row.user_id || row.consultantId || row.consultant_id)
}

function getConsultantName(row = {}) {
  return normalizeText(row.name || row.fullName || row.full_name || row.consultantName || row.consultant_name || getConsultantId(row)) || 'Consultant'
}

function getPartnerId(row = {}) {
  return normalizeText(row.id || row.partnerId || row.partner_id)
}

function getPartnerName(row = {}) {
  return normalizeText(row.name || row.partnerName || row.partner_name || getPartnerId(row)) || 'Partner'
}

function statusSignal(row = {}) {
  return normalizeLower(`${row.status || ''} ${row.stage || ''} ${row.financeStatus || ''} ${row.finance_status || ''} ${row.financeStageLabel || ''} ${row.finance_stage_label || ''} ${row.riskStatus || ''} ${row.risk_status || ''} ${row.nextAction || ''} ${row.next_action || ''} ${row.revenueStatus || ''} ${row.revenue_status || ''}`)
}

function isApproved(row = {}) {
  const signal = statusSignal(row)
  return signal.includes('approved') || signal.includes('grant') || signal.includes('instruction') || signal.includes('registered')
}

function isDeclined(row = {}) {
  const signal = statusSignal(row)
  return signal.includes('declined') || signal.includes('rejected') || signal.includes('cancelled')
}

function isActive(row = {}) {
  return !isApproved(row) && !isDeclined(row)
}

function missingDocumentCount(row = {}, documents = []) {
  const explicit = Number(row.missingDocuments || row.missing_documents || row.documentsMissing || row.documents_missing || row.requiredDocumentsMissing || row.required_documents_missing || row.financeDocumentsMissing || row.finance_documents_missing || row.missingDocumentsCount || row.missing_documents_count)
  if (Number.isFinite(explicit) && explicit > 0) return explicit
  return documents.filter((doc) => normalizeText(doc.applicationId || doc.application_id) === getApplicationId(row) && !doc.uploadedAt && !doc.uploaded_at && !normalizeLower(doc.status).includes('uploaded')).length
}

function stageAgeDays(row = {}, now = new Date()) {
  return daysBetween(row.stageEnteredAt || row.stage_entered_at || row.updatedAt || row.updated_at || row.submittedAt || row.submitted_at || row.createdAt || row.created_at, now)
}

function bankDelayDays(row = {}, now = new Date()) {
  const signal = statusSignal(row)
  if (!(signal.includes('bank') || signal.includes('feedback') || row.bankFeedbackPending || row.bank_feedback_pending)) return 0
  return daysBetween(row.submittedAt || row.submitted_at || row.updatedAt || row.updated_at || row.createdAt || row.created_at, now)
}

function partnerDelayDays(row = {}, requests = [], now = new Date()) {
  const related = requests.filter((request) => normalizeText(request.applicationId || request.application_id) === getApplicationId(row))
  return Math.max(0, ...related.map((request) => daysBetween(request.createdAt || request.created_at || request.requestedAt || request.requested_at, now)))
}

function consultantWorkload(consultantId = '', applications = []) {
  return applications.filter((row) => getApplicationConsultantId(row) === consultantId && isActive(row)).length
}

function riskLevel(score = 0) {
  const safe = clamp(score)
  if (safe >= 76) return 'Critical Risk'
  if (safe >= 51) return 'High Risk'
  if (safe >= 26) return 'Medium Risk'
  return 'Low Risk'
}

function compactRiskLevel(score = 0) {
  return riskLevel(score).replace(' Risk', '')
}

function capacityStatus(score = 0) {
  const safe = clamp(score)
  if (safe >= 80) return 'Critical'
  if (safe >= 60) return 'At Risk'
  if (safe >= 35) return 'Watchlist'
  return 'Normal'
}

function confidenceLabel(score = 0) {
  const safe = clamp(score)
  if (safe >= 76) return 'High Confidence'
  if (safe >= 45) return 'Medium Confidence'
  return 'Low Confidence'
}

function predictionConfidence({ dataVolume = 0, similarity = 60, stability = 60 } = {}) {
  const volumeScore = Math.min(100, Number(dataVolume || 0) * 8)
  return confidenceLabel(Math.round((volumeScore * 0.4) + (Number(similarity || 0) * 0.35) + (Number(stability || 0) * 0.25)))
}

function recommendationForApplication(score = 0, reasons = []) {
  if (score >= 76) return `Escalate today: ${reasons[0] || 'critical application risk detected'}.`
  if (score >= 51) return `Follow up within 24h: ${reasons[0] || 'application risk is increasing'}.`
  if (score >= 26) return `Monitor closely: ${reasons[0] || 'medium risk signals detected'}.`
  return 'Keep application moving through the standard workflow.'
}

function recordPrediction(rows = {}, prediction = {}) {
  const row = {
    id: prediction.id || createId('prediction'),
    organisationId: rows.workspaceKey,
    predictionType: normalizeText(prediction.predictionType),
    entityType: normalizeText(prediction.entityType),
    entityId: normalizeText(prediction.entityId),
    score: clamp(prediction.score),
    confidence: normalizeText(prediction.confidence),
    recommendation: normalizeText(prediction.recommendation),
    predictedAt: prediction.predictedAt || new Date().toISOString(),
    details: prediction.details || {},
  }
  setLocalRows(LOCAL_SNAPSHOT_STORE, rows.workspaceKey, [row, ...getLocalRows(LOCAL_SNAPSHOT_STORE, rows.workspaceKey)])
  setLocalRows(LOCAL_HISTORY_STORE, rows.workspaceKey, [{
    id: createId('prediction-history'),
    eventType: BOND_PREDICTIVE_EVENTS.predictionGenerated,
    predictionId: row.id,
    predictionType: row.predictionType,
    entityType: row.entityType,
    entityId: row.entityId,
    createdAt: row.predictedAt,
    details: row,
  }, ...getLocalRows(LOCAL_HISTORY_STORE, rows.workspaceKey)])
  return row
}

export function calculateApplicationRisk(application = {}, context = {}, options = {}) {
  const rows = getRows(context, options)
  assertPredictiveAccess(rows, context)
  const now = options.now ? new Date(options.now) : new Date()
  const docsMissing = missingDocumentCount(application, rows.documents)
  const age = stageAgeDays(application, now)
  const bankDelay = bankDelayDays(application, now)
  const partnerDelay = partnerDelayDays(application, rows.requests, now)
  const workload = consultantWorkload(getApplicationConsultantId(application), rows.applications)
  const historicalDeclines = rows.applications.filter((row) => getApplicationBank(row) === getApplicationBank(application) && isDeclined(row)).length
  const historicalBankRows = rows.applications.filter((row) => getApplicationBank(row) === getApplicationBank(application)).length
  const declinePenalty = historicalBankRows ? percent(historicalDeclines, historicalBankRows) * 0.25 : 0
  const score = clamp(
    docsMissing * 12 +
      Math.min(24, age * 2) +
      Math.min(22, bankDelay * 3) +
      Math.min(16, partnerDelay * 2) +
      Math.min(20, Math.max(0, workload - 25) * 1.2) +
      declinePenalty,
  )
  const reasons = []
  if (docsMissing) reasons.push(`${docsMissing} missing document${docsMissing === 1 ? '' : 's'}`)
  if (age >= 7) reasons.push(`${age} days in current stage`)
  if (bankDelay >= 5) reasons.push(`${bankDelay} days waiting on bank feedback`)
  if (partnerDelay >= 3) reasons.push(`${partnerDelay} days waiting on partner action`)
  if (workload > 25) reasons.push(`consultant workload at ${workload} active applications`)
  if (declinePenalty >= 10) reasons.push('historical bank outcomes are weaker for this profile')
  const result = {
    applicationId: getApplicationId(application),
    applicationReference: normalizeText(application.applicationReference || application.application_reference || getApplicationId(application)),
    consultantId: getApplicationConsultantId(application),
    branchId: getApplicationBranchId(application),
    regionId: getApplicationRegionId(application),
    partnerId: getApplicationPartnerId(application),
    bank: getApplicationBank(application),
    riskScore: Math.round(score),
    riskLevel: riskLevel(score),
    confidence: predictionConfidence({ dataVolume: rows.applications.length, similarity: historicalBankRows ? 74 : 48, stability: reasons.length <= 2 ? 72 : 58 }),
    reasons: reasons.length ? reasons : ['No major operational risk signal detected'],
    recommendedAction: recommendationForApplication(score, reasons),
  }
  setLocalRows(LOCAL_RISK_SCORE_STORE, rows.workspaceKey, [{
    id: createId('risk-score'),
    organisationId: rows.workspaceKey,
    entityType: 'application',
    entityId: result.applicationId,
    score: result.riskScore,
    level: result.riskLevel,
    reasons: result.reasons,
    updatedAt: new Date().toISOString(),
  }, ...getLocalRows(LOCAL_RISK_SCORE_STORE, rows.workspaceKey)])
  setLocalRows(LOCAL_HISTORY_STORE, rows.workspaceKey, [{
    id: createId('prediction-history'),
    eventType: BOND_PREDICTIVE_EVENTS.applicationRiskUpdated,
    entityType: 'application',
    entityId: result.applicationId,
    createdAt: new Date().toISOString(),
    details: result,
  }, ...getLocalRows(LOCAL_HISTORY_STORE, rows.workspaceKey)])
  return result
}

export function predictApprovalProbability(application = {}, context = {}, options = {}) {
  const rows = getRows(context, options)
  assertPredictiveAccess(rows, context)
  const income = Number(application.income || application.monthlyIncome || application.monthly_income || 0)
  const loan = Number(application.loanAmount || application.bondAmount || application.bond_amount || application.purchasePrice || application.purchase_price || 0)
  const value = Number(application.propertyValue || application.purchasePrice || application.purchase_price || loan || 1)
  const ltv = value ? (loan / value) * 100 : 90
  const creditScore = Number(application.creditScore || application.credit_score || 680)
  const employment = normalizeLower(application.employmentType || application.employment_type)
  const profileScore = clamp(55 + (income > 60000 ? 8 : income > 35000 ? 4 : 0) + (ltv < 80 ? 8 : ltv > 95 ? -10 : 0) + (creditScore > 720 ? 10 : creditScore < 620 ? -12 : 0) + (employment.includes('self') ? -4 : 3))
  const probabilities = BANKS.map((bank) => {
    const bankRows = rows.applications.filter((row) => getApplicationBank(row) === bank)
    const bankApprovalRate = bankRows.length ? percent(bankRows.filter(isApproved).length, bankRows.length) : bank === 'Investec' ? 72 : bank === 'ABSA' ? 68 : 65
    const suburbRows = rows.applications.filter((row) => normalizeLower(row.suburb || row.propertySuburb || row.property_suburb) === normalizeLower(application.suburb || application.propertySuburb || application.property_suburb))
    const suburbBoost = suburbRows.length ? percent(suburbRows.filter(isApproved).length, suburbRows.length) - 60 : 0
    const score = clamp((profileScore * 0.5) + (bankApprovalRate * 0.4) + (suburbBoost * 0.1))
    return {
      bank,
      probability: Math.round(score),
      confidence: predictionConfidence({ dataVolume: bankRows.length + suburbRows.length, similarity: profileScore, stability: bankRows.length ? 76 : 48 }),
    }
  }).sort((left, right) => right.probability - left.probability)
  return {
    applicationId: getApplicationId(application),
    probabilities,
    bestBank: probabilities[0]?.bank || 'FNB',
    bestProbability: probabilities[0]?.probability || 0,
  }
}

export function predictSLABreach(entity = {}, context = {}, options = {}) {
  const rows = getRows(context, options)
  assertPredictiveAccess(rows, context)
  const consumed = Number(entity.slaConsumedPercent || entity.sla_consumed_percent || entity.slaPercent || entity.sla_percent || 0)
  const age = daysBetween(entity.createdAt || entity.created_at || entity.requestedAt || entity.requested_at || entity.updatedAt || entity.updated_at, options.now ? new Date(options.now) : new Date())
  const probability = clamp(consumed + Math.min(30, age * 4) + (normalizeLower(entity.priority).includes('high') ? 10 : 0))
  return {
    entityId: normalizeText(entity.id || entity.requestId || entity.request_id || getApplicationId(entity)),
    entityType: normalizeText(entity.entityType || entity.type || 'sla_request'),
    probability: Math.round(probability),
    riskLevel: compactRiskLevel(probability),
    confidence: predictionConfidence({ dataVolume: rows.requests.length + rows.applications.length, similarity: consumed, stability: age < 10 ? 70 : 55 }),
    recommendedAction: probability >= 76 ? 'Escalate before SLA breach.' : probability >= 51 ? 'Notify owner and manager.' : 'Monitor SLA consumption.',
  }
}

export function predictConsultantCapacityRisk(consultantId = '', context = {}, options = {}) {
  const rows = getRows(context, options)
  assertPredictiveAccess(rows, context)
  const safeId = normalizeText(consultantId)
  const consultant = rows.consultants.find((row) => getConsultantId(row) === safeId) || {}
  const active = rows.applications.filter((row) => getApplicationConsultantId(row) === safeId && isActive(row)).length || Number(consultant.activeApplications || consultant.active_applications || 0)
  const requests = rows.requests.filter((row) => normalizeText(row.assignedConsultantId || row.assigned_consultant_id || row.ownerUserId || row.owner_user_id) === safeId).length
  const documents = rows.documents.filter((row) => normalizeText(row.consultantId || row.consultant_id || row.assignedConsultantId || row.assigned_consultant_id) === safeId && !row.reviewedAt && !row.reviewed_at).length
  const incomingDaily = Number(options.averageDailyNewApplications || consultant.averageDailyNewApplications || consultant.average_daily_new_applications || 1.2)
  const resolutionDaily = Number(options.averageDailyResolutionRate || consultant.averageDailyResolutionRate || consultant.average_daily_resolution_rate || 0.8)
  const baseRisk = active * 1.5 + requests * 4 + documents * 3
  const forecast = [7, 14, 30].map((days) => {
    const expectedCapacity = Math.max(0, Math.round(active + (incomingDaily - resolutionDaily) * days + requests * 0.2 + documents * 0.15))
    const riskScore = clamp(baseRisk + Math.max(0, expectedCapacity - 25) * 3)
    return {
      periodDays: days,
      expectedCapacity,
      riskScore: Math.round(riskScore),
      riskLevel: capacityStatus(riskScore),
      recommendedAction: riskScore >= 80 ? 'Reassign workload immediately.' : riskScore >= 60 ? 'Plan reassignment and manager review.' : 'Capacity is manageable.',
    }
  })
  return {
    consultantId: safeId,
    consultantName: getConsultantName(consultant),
    currentWorkload: active,
    status: forecast[0]?.riskLevel || 'Normal',
    confidence: predictionConfidence({ dataVolume: rows.applications.length, similarity: 70, stability: 68 }),
    forecast,
  }
}

export function predictBranchCapacityRisk(branchId = '', context = {}, options = {}) {
  const rows = getRows(context, options)
  assertPredictiveAccess(rows, context)
  const safeId = normalizeText(branchId)
  const branch = rows.branches.find((row) => getBranchId(row) === safeId) || {}
  const branchApplications = rows.applications.filter((row) => getApplicationBranchId(row) === safeId && isActive(row))
  const branchConsultants = rows.consultants.filter((row) => normalizeText(row.branchId || row.branch_id || row.workspaceUnitId || row.workspace_unit_id) === safeId)
  const active = branchApplications.length
  const headcount = Math.max(1, branchConsultants.length || Number(branch.consultants || branch.consultantCount || 1))
  const capacityPerConsultant = Number(options.capacityPerConsultant || 25)
  const forecast = [7, 14, 30].map((days) => {
    const expectedApplications = Math.round(active + (Number(options.branchIncomingDaily || 2) * days) - (Number(options.branchResolutionDaily || 1.2) * days))
    const requiredHeadcount = Math.max(0, Math.ceil(expectedApplications / capacityPerConsultant) - headcount)
    const riskScore = clamp((expectedApplications / (headcount * capacityPerConsultant)) * 100)
    return {
      periodDays: days,
      expectedApplications,
      expectedCapacity: capacityStatus(riskScore),
      requiredHeadcount,
      riskScore: Math.round(riskScore),
      recommendedAction: requiredHeadcount > 0 ? `Add ${requiredHeadcount} consultant${requiredHeadcount === 1 ? '' : 's'}.` : 'Current capacity should hold.',
    }
  })
  return {
    branchId: safeId,
    branchName: getBranchName(branch),
    current: active > headcount * capacityPerConsultant ? 'Overloaded' : 'Normal',
    confidence: predictionConfidence({ dataVolume: branchApplications.length, similarity: 70, stability: 66 }),
    forecast,
  }
}

export function predictPartnerChurn(partnerId = '', context = {}, options = {}) {
  const rows = getRows(context, options)
  assertPredictiveAccess(rows, context)
  const safeId = normalizeText(partnerId)
  const partner = rows.partners.find((row) => getPartnerId(row) === safeId) || {}
  const applications = rows.applications.filter((row) => getApplicationPartnerId(row) === safeId)
  const requests = rows.requests.filter((row) => normalizeText(row.partnerId || row.partner_id) === safeId)
  const escalations = requests.filter((row) => normalizeLower(row.status).includes('escalat') || normalizeLower(row.type || row.requestType || row.request_type).includes('complaint')).length
  const health = Number(partner.healthScore || partner.health_score || partner.partnerHealth || partner.partner_health || 70)
  const portalUsage = Number(partner.portalUsageScore || partner.portal_usage_score || partner.portalUsage || partner.portal_usage || 60)
  const volumeTrend = Number(partner.applicationVolumeTrend || partner.application_volume_trend || (applications.length < 2 ? -20 : 0))
  const responsePenalty = average(requests.map((row) => Number(row.responseHours || row.response_hours || row.ageHours || row.age_hours || 0))) / 2
  const score = clamp((100 - health) * 0.45 + (100 - portalUsage) * 0.2 + escalations * 12 + Math.max(0, -volumeTrend) * 0.35 + responsePenalty)
  const risk = score >= 65 ? 'High Risk' : score >= 35 ? 'Medium Risk' : 'Low Risk'
  const reasons = []
  if (health < 50) reasons.push('Partner health is below 50')
  if (portalUsage < 45) reasons.push('Portal usage is declining')
  if (escalations) reasons.push(`${escalations} escalation${escalations === 1 ? '' : 's'} or complaint signal${escalations === 1 ? '' : 's'}`)
  if (volumeTrend < 0) reasons.push('Application volume is trending down')
  return {
    partnerId: safeId,
    partnerName: getPartnerName(partner),
    churnRiskScore: Math.round(score),
    churnRisk: risk,
    confidence: predictionConfidence({ dataVolume: applications.length + requests.length, similarity: health, stability: portalUsage }),
    reason: reasons[0] || 'Partner relationship is stable.',
    recommendedAction: risk === 'High Risk' ? `Follow up with ${getPartnerName(partner)} within 48h.` : 'Monitor partner sentiment and service quality.',
  }
}

export function predictRevenueRisk(context = {}, options = {}) {
  const rows = getRows(context, options)
  assertPredictiveAccess(rows, context)
  const target = Number(options.revenueTarget || 100000)
  const activeRows = rows.applications.filter(isActive)
  const expectedRevenue = money(activeRows.reduce((sum, row) => sum + Number(row.applicationRevenue || row.application_revenue || row.estimatedRevenue || row.estimated_revenue || 7500), 0) * 0.72)
  const shortfall = Math.max(0, target - expectedRevenue)
  const commissionRisk = rows.applications.filter((row) => statusSignal(row).includes('instruction') && !normalizeLower(row.revenueStatus || row.revenue_status).includes('pay')).length
  const referralFeeRisk = rows.applications.filter((row) => getApplicationPartnerId(row) && isApproved(row)).length
  const riskScore = clamp(percent(shortfall, target) + commissionRisk * 5 + referralFeeRisk * 2)
  return {
    expectedRevenue,
    targetRevenue: target,
    shortfall,
    commissionRisk,
    referralFeeRisk,
    riskLevel: compactRiskLevel(riskScore),
    confidence: predictionConfidence({ dataVolume: rows.applications.length, similarity: 68, stability: 62 }),
    recommendation: riskScore >= 51 ? 'Review target gap, commission readiness, and referral fee exposure.' : 'Revenue forecast is within tolerance.',
  }
}

export function predictBankPerformance(bankId = '', context = {}, options = {}) {
  const rows = getRows(context, options)
  assertPredictiveAccess(rows, context)
  const bank = normalizeText(bankId || 'FNB')
  const items = rows.applications.filter((row) => getApplicationBank(row) === bank)
  const approvals = items.filter(isApproved).length
  const declines = items.filter(isDeclined).length
  const approvalRate = percent(approvals, items.length)
  const responseTimes = rows.banks.filter((row) => normalizeLower(row.name || row.bank || row.id) === normalizeLower(bank)).map((row) => Number(row.averageResponseTime || row.average_response_time || row.responseTime || row.response_time || 0))
  const avgResponse = average(responseTimes) || average(items.map((row) => bankDelayDays(row, options.now ? new Date(options.now) : new Date())))
  const responseChange = clamp(avgResponse * 2 + declines * 4, -30, 45)
  const escalationRisk = clamp((100 - approvalRate) * 0.35 + responseChange)
  return {
    bank,
    approvalRate,
    approvalRateChange: Math.round(approvalRate - 65),
    responseTimeChange: Math.round(responseChange),
    escalationRisk: Math.round(escalationRisk),
    riskLevel: compactRiskLevel(escalationRisk),
    confidence: predictionConfidence({ dataVolume: items.length, similarity: approvalRate, stability: 64 }),
    recommendation: escalationRisk >= 51 ? `Escalate ${bank} relationship issue.` : `${bank} performance is within expected range.`,
  }
}

export function generateRecommendations(context = {}, options = {}) {
  const dashboard = getPredictiveDashboard(context, options)
  const recommendations = []
  dashboard.applicationRisks.filter((row) => row.riskScore >= 51).slice(0, 5).forEach((row) => {
    recommendations.push({
      id: `recommend-application-${row.applicationId}`,
      type: 'application',
      priority: row.riskScore >= 76 ? 'Critical' : 'High',
      recommendation: row.recommendedAction,
      entityId: row.applicationId,
    })
  })
  dashboard.consultantCapacity.filter((row) => row.forecast.some((item) => ['At Risk', 'Critical'].includes(item.riskLevel))).slice(0, 5).forEach((row) => {
    recommendations.push({
      id: `recommend-consultant-${row.consultantId}`,
      type: 'capacity',
      priority: row.status === 'Critical' ? 'Critical' : 'High',
      recommendation: `Reassign workload from ${row.consultantName}.`,
      entityId: row.consultantId,
    })
  })
  dashboard.partnerChurn.filter((row) => row.churnRisk === 'High Risk').slice(0, 5).forEach((row) => {
    recommendations.push({
      id: `recommend-partner-${row.partnerId}`,
      type: 'partner',
      priority: 'High',
      recommendation: row.recommendedAction,
      entityId: row.partnerId,
    })
  })
  dashboard.bankPerformance.filter((row) => row.escalationRisk >= 51).slice(0, 5).forEach((row) => {
    recommendations.push({
      id: `recommend-bank-${row.bank}`,
      type: 'bank',
      priority: 'High',
      recommendation: row.recommendation,
      entityId: row.bank,
    })
  })
  if (dashboard.revenueRisk.riskLevel === 'High' || dashboard.revenueRisk.riskLevel === 'Critical') {
    recommendations.push({
      id: 'recommend-revenue-risk',
      type: 'revenue',
      priority: dashboard.revenueRisk.riskLevel,
      recommendation: dashboard.revenueRisk.recommendation,
      entityId: 'revenue',
    })
  }
  return recommendations
}

function predictiveTimelineForApplication(application = {}, approval = {}, risk = {}, now = new Date()) {
  const best = approval.probabilities?.[0] || {}
  const approvalDays = risk.riskScore >= 76 ? 10 : risk.riskScore >= 51 ? 7 : 4
  return [
    {
      id: `${getApplicationId(application)}-approval`,
      predictedEvent: 'Approval Expected',
      confidence: best.confidence || risk.confidence,
      expectedDate: addDays(now, approvalDays),
      probability: best.probability || 0,
    },
    {
      id: `${getApplicationId(application)}-sla`,
      predictedEvent: risk.riskScore >= 51 ? 'SLA Intervention Required' : 'SLA On Track',
      confidence: risk.confidence,
      expectedDate: addDays(now, risk.riskScore >= 51 ? 1 : 5),
      probability: risk.riskScore,
    },
  ]
}

export function getPredictiveDashboard(context = {}, options = {}) {
  const rows = getRows(context, options)
  assertPredictiveAccess(rows, context)
  const now = options.now ? new Date(options.now) : new Date()
  const applicationRisks = rows.applications.map((row) => calculateApplicationRisk(row, context, options)).sort((left, right) => right.riskScore - left.riskScore)
  const approvalProbabilities = rows.applications.map((row) => predictApprovalProbability(row, context, options))
  const slaPredictions = [
    ...rows.applications.map((row) => predictSLABreach({ ...row, entityType: 'application', slaConsumedPercent: calculateApplicationRisk(row, context, options).riskScore }, context, options)),
    ...rows.requests.map((row) => predictSLABreach({ ...row, entityType: 'partner_request' }, context, options)),
    ...rows.documents.map((row) => predictSLABreach({ ...row, entityType: 'document_review' }, context, options)),
  ].sort((left, right) => right.probability - left.probability)
  const consultantCapacity = rows.consultants.map((row) => predictConsultantCapacityRisk(getConsultantId(row), context, options))
  const branchCapacity = rows.branches.map((row) => predictBranchCapacityRisk(getBranchId(row), context, options))
  const partnerChurn = rows.partners.map((row) => predictPartnerChurn(getPartnerId(row), context, options)).sort((left, right) => right.churnRiskScore - left.churnRiskScore)
  const bankPerformance = [...new Set([...BANKS, ...rows.applications.map(getApplicationBank)])].map((bank) => predictBankPerformance(bank, context, options)).sort((left, right) => right.escalationRisk - left.escalationRisk)
  const revenueRisk = predictRevenueRisk(context, options)
  const timelines = rows.applications.slice(0, 8).map((row) => {
    const risk = applicationRisks.find((item) => item.applicationId === getApplicationId(row))
    const approval = approvalProbabilities.find((item) => item.applicationId === getApplicationId(row))
    return {
      applicationId: getApplicationId(row),
      applicationReference: normalizeText(row.applicationReference || row.application_reference || getApplicationId(row)),
      events: predictiveTimelineForApplication(row, approval, risk, now),
    }
  })
  const confidenceScore = average([
    ...applicationRisks.map((row) => row.confidence),
    revenueRisk.confidence,
  ].map((label) => label.startsWith('High') ? 90 : label.startsWith('Medium') ? 62 : 35))
  const dashboard = {
    scope: rows.scope,
    summary: {
      highRiskApplications: applicationRisks.filter((row) => row.riskScore >= 51).length,
      predictedSLABreaches: slaPredictions.filter((row) => row.probability >= 76).length,
      predictedCapacityIssues: consultantCapacity.filter((row) => row.forecast.some((item) => ['At Risk', 'Critical'].includes(item.riskLevel))).length + branchCapacity.filter((row) => row.forecast.some((item) => item.requiredHeadcount > 0)).length,
      partnerChurnRisk: partnerChurn.filter((row) => row.churnRisk === 'High Risk').length,
      revenueRisk: revenueRisk.riskLevel,
      forecastConfidence: confidenceLabel(confidenceScore),
    },
    applicationRisks,
    approvalProbabilities,
    slaPredictions,
    consultantCapacity,
    branchCapacity,
    partnerChurn,
    revenueRisk,
    bankPerformance,
    predictiveTimeline: timelines,
    history: rows.history,
    feedback: rows.feedback,
  }
  return {
    ...dashboard,
    recommendations: generateRecommendationsFromDashboard(dashboard),
  }
}

function generateRecommendationsFromDashboard(dashboard = {}) {
  const recommendations = []
  dashboard.applicationRisks?.filter((row) => row.riskScore >= 51).slice(0, 5).forEach((row) => {
    recommendations.push({ id: `recommend-application-${row.applicationId}`, type: 'application', priority: row.riskScore >= 76 ? 'Critical' : 'High', recommendation: row.recommendedAction, entityId: row.applicationId })
  })
  dashboard.consultantCapacity?.filter((row) => row.forecast.some((item) => ['At Risk', 'Critical'].includes(item.riskLevel))).slice(0, 5).forEach((row) => {
    recommendations.push({ id: `recommend-consultant-${row.consultantId}`, type: 'capacity', priority: 'High', recommendation: `Reassign workload from ${row.consultantName}.`, entityId: row.consultantId })
  })
  dashboard.partnerChurn?.filter((row) => row.churnRisk === 'High Risk').slice(0, 5).forEach((row) => {
    recommendations.push({ id: `recommend-partner-${row.partnerId}`, type: 'partner', priority: 'High', recommendation: row.recommendedAction, entityId: row.partnerId })
  })
  dashboard.bankPerformance?.filter((row) => row.escalationRisk >= 51).slice(0, 5).forEach((row) => {
    recommendations.push({ id: `recommend-bank-${row.bank}`, type: 'bank', priority: 'High', recommendation: row.recommendation, entityId: row.bank })
  })
  if (['High', 'Critical'].includes(dashboard.revenueRisk?.riskLevel)) {
    recommendations.push({ id: 'recommend-revenue-risk', type: 'revenue', priority: dashboard.revenueRisk.riskLevel, recommendation: dashboard.revenueRisk.recommendation, entityId: 'revenue' })
  }
  return recommendations
}

export function getExecutiveRiskDashboard(context = {}, options = {}) {
  const dashboard = getPredictiveDashboard(context, options)
  if (dashboard.scope.scopeLevel !== BOND_ORGANISATION_LEVELS.hq) {
    const error = new Error('Executive risk dashboard requires HQ scope.')
    error.code = 'permission_denied'
    throw error
  }
  return {
    highestRiskApplications: dashboard.applicationRisks.slice(0, 10),
    highestRiskBranches: dashboard.branchCapacity.slice().sort((left, right) => (right.forecast[1]?.riskScore || 0) - (left.forecast[1]?.riskScore || 0)).slice(0, 10),
    highestRiskRegions: rollupRegionRisks(dashboard, context, options).slice(0, 10),
    highestRiskPartners: dashboard.partnerChurn.slice(0, 10),
    highestRiskBanks: dashboard.bankPerformance.slice(0, 10),
    revenueRisks: dashboard.revenueRisk,
    recommendations: dashboard.recommendations,
  }
}

function rollupRegionRisks(dashboard = {}, context = {}, options = {}) {
  const rows = getRows(context, options)
  const byRegion = new Map()
  dashboard.branchCapacity.forEach((branchRisk) => {
    const branch = rows.branches.find((row) => getBranchId(row) === branchRisk.branchId) || {}
    const regionId = getBranchRegionId(branch) || 'Unassigned'
    const region = rows.regions.find((row) => getRegionId(row) === regionId) || {}
    const current = byRegion.get(regionId) || {
      id: regionId,
      regionId,
      regionName: normalizeText(region.name || region.regionName || region.region_name || regionId) || 'Region',
      branches: 0,
      riskScore: 0,
      riskLevel: 'Low',
    }
    current.branches += 1
    current.riskScore += branchRisk.forecast[1]?.riskScore || branchRisk.forecast[0]?.riskScore || 0
    byRegion.set(regionId, current)
  })
  return [...byRegion.values()].map((row) => ({
    ...row,
    riskScore: Math.round(row.riskScore / Math.max(1, row.branches)),
    riskLevel: compactRiskLevel(Math.round(row.riskScore / Math.max(1, row.branches))),
  })).sort((left, right) => right.riskScore - left.riskScore)
}

export function getBranchRiskDashboard(branchId = '', context = {}, options = {}) {
  const dashboard = getPredictiveDashboard(context, options)
  const safeId = normalizeText(branchId)
  return {
    branchId: safeId,
    capacityRisk: dashboard.branchCapacity.find((row) => row.branchId === safeId) || null,
    slaRisk: dashboard.slaPredictions.filter((row) => row.entityId && dashboard.applicationRisks.some((risk) => risk.branchId === safeId && risk.applicationId === row.entityId)),
    partnerRisk: dashboard.partnerChurn,
    applicationRisk: dashboard.applicationRisks.filter((row) => row.branchId === safeId),
    recommendations: dashboard.recommendations.filter((row) => row.type !== 'regional'),
  }
}

export function getRegionalRiskDashboard(regionId = '', context = {}, options = {}) {
  const dashboard = getPredictiveDashboard(context, options)
  const safeId = normalizeText(regionId)
  return {
    regionId: safeId,
    branchRisks: dashboard.branchCapacity.filter((row) => {
      const branch = getRows(context, options).branches.find((item) => getBranchId(item) === row.branchId)
      return !safeId || getBranchRegionId(branch) === safeId
    }),
    forecastRisks: dashboard.slaPredictions,
    partnerRisks: dashboard.partnerChurn,
    capacityRisks: dashboard.consultantCapacity,
    recommendations: dashboard.recommendations,
  }
}

export function getApplicationPrediction(applicationId = '', context = {}, options = {}) {
  const rows = getRows(context, options)
  assertPredictiveAccess(rows, context)
  const application = rows.applications.find((row) => getApplicationId(row) === normalizeText(applicationId))
  if (!application) throwNotFound('Application not found.')
  const risk = calculateApplicationRisk(application, context, options)
  const approval = predictApprovalProbability(application, context, options)
  return {
    applicationId: getApplicationId(application),
    risk,
    approvalProbability: approval,
    recommendedAction: risk.recommendedAction,
    timeline: predictiveTimelineForApplication(application, approval, risk, options.now ? new Date(options.now) : new Date()),
  }
}

export function recordPredictionFeedback(predictionId = '', payload = {}, context = {}, options = {}) {
  const rows = getRows(context, options)
  assertPredictiveAccess(rows, context)
  const correct = Boolean(payload.correct)
  const row = {
    id: createId('prediction-feedback'),
    organisationId: rows.workspaceKey,
    predictionId: normalizeText(predictionId),
    expectedOutcome: normalizeText(payload.expectedOutcome),
    actualOutcome: normalizeText(payload.actualOutcome),
    accuracy: correct ? 100 : 0,
    correct,
    createdBy: getActorId(context),
    createdAt: new Date().toISOString(),
  }
  setLocalRows(LOCAL_FEEDBACK_STORE, rows.workspaceKey, [row, ...getLocalRows(LOCAL_FEEDBACK_STORE, rows.workspaceKey)])
  setLocalRows(LOCAL_HISTORY_STORE, rows.workspaceKey, [{
    id: createId('prediction-history'),
    eventType: correct ? BOND_PREDICTIVE_EVENTS.predictionConfirmed : BOND_PREDICTIVE_EVENTS.predictionIncorrect,
    predictionId,
    entityType: 'prediction_feedback',
    entityId: row.id,
    createdAt: row.createdAt,
    details: row,
  }, ...getLocalRows(LOCAL_HISTORY_STORE, rows.workspaceKey)])
  return row
}

function throwNotFound(message = 'Record not found.') {
  const error = new Error(message)
  error.code = 'not_found'
  throw error
}

export const __bondPredictiveAnalyticsServiceTestUtils = Object.freeze({
  clearStores() {
    LOCAL_SNAPSHOT_STORE.clear()
    LOCAL_RISK_SCORE_STORE.clear()
    LOCAL_HISTORY_STORE.clear()
    LOCAL_FEEDBACK_STORE.clear()
    localSequence = 0
  },
  getSnapshots(workspaceKey = '') {
    return getLocalRows(LOCAL_SNAPSHOT_STORE, workspaceKey)
  },
  getRiskScores(workspaceKey = '') {
    return getLocalRows(LOCAL_RISK_SCORE_STORE, workspaceKey)
  },
  getHistory(workspaceKey = '') {
    return getLocalRows(LOCAL_HISTORY_STORE, workspaceKey)
  },
  getFeedback(workspaceKey = '') {
    return getLocalRows(LOCAL_FEEDBACK_STORE, workspaceKey)
  },
  recordPrediction,
})
