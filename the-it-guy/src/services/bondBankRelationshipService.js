import {
  BOND_ORGANISATION_LEVELS,
  resolveBondOrganisationScope,
} from './bondOrganisationScopeResolver'
import { buildBankRelationshipInsights } from './bankRelationshipInsightsService'
import {
  getActiveOriginatorBanks,
  getSystemBanks,
  slugifyBank,
} from './bondOriginatorBankService'
import { getPartnerPortalOperationalRows } from './bondPartnerPortalService'

export const BOND_BANK_RELATIONSHIP_EVENTS = Object.freeze({
  bankContactAdded: 'BANK_CONTACT_ADDED',
  bankContactUpdated: 'BANK_CONTACT_UPDATED',
  bankEscalationCreated: 'BANK_ESCALATION_CREATED',
  bankFeedbackAdded: 'BANK_FEEDBACK_ADDED',
  bankHealthUpdated: 'BANK_HEALTH_UPDATED',
  bankRelationshipUpdated: 'BANK_RELATIONSHIP_UPDATED',
})

export const BANK_RELATIONSHIP_HEALTH_STATUSES = Object.freeze({
  excellent: 'Excellent',
  healthy: 'Healthy',
  atRisk: 'At Risk',
  critical: 'Critical',
})

export const BANK_COMMAND_HEALTH_STATUSES = Object.freeze({
  excellent: 'Excellent',
  good: 'Good',
  fair: 'Fair',
  poor: 'Poor',
  critical: 'Critical',
  notEnoughData: 'Not enough data',
})

export const DEFAULT_PLATFORM_REVENUE_PER_BOND = 500

const LOCAL_BANK_STORE = new Map()
const LOCAL_CONTACT_STORE = new Map()
const LOCAL_ESCALATION_STORE = new Map()
const LOCAL_FEEDBACK_STORE = new Map()
const LOCAL_HEALTH_SNAPSHOT_STORE = new Map()
const LOCAL_ACTIVITY_STORE = new Map()
let localSequence = 0

const APPROVAL_TERMS = ['approved', 'approval', 'grant', 'registered', 'accepted', 'quote approved']
const DECLINE_TERMS = ['declined', 'rejected', 'lost']
const SUBMITTED_TERMS = ['submitted', 'bank', 'feedback', 'quote', 'approved', 'declined', 'registered', 'instruction']
const INSTRUCTION_TERMS = ['instruction', 'instructed', 'attorney']
const REVIEW_TERMS = ['review', 'underwriting', 'credit', 'assessment']
const ACKNOWLEDGE_TERMS = ['acknowledged', 'acknowledge', 'received', 'feedback', 'bank']
const POSITIVE_FEEDBACK_TERMS = ['positive', 'improved', 'helpful', 'great', 'excellent', 'fast', 'good']
const NEGATIVE_FEEDBACK_TERMS = ['negative', 'delayed', 'slow', 'poor', 'issue', 'problem', 'bad', 'escalation']
const DECLINE_REASONS = ['Affordability', 'Credit Profile', 'Income Verification', 'Risk Policy', 'LTV', 'Documentation', 'Other']
const OPEN_ESCALATION_STATUSES = new Set(['open', 'in_progress', 'assigned', 'new'])
const PRE_APPROVAL_TERMS = ['pre-approved', 'pre approved', 'preapproval', 'pre approval']
const ACCEPTED_TERMS = ['accepted', 'buyer approved', 'buyer_approved', 'approved_by_buyer']
const DEFAULT_REGIONAL_SLA_ROWS = Object.freeze([
  'Gauteng',
  'Western Cape',
  'KZN',
  'Eastern Cape',
  'Free State',
  'Limpopo',
  'Mpumalanga',
  'North West',
  'Northern Cape',
])

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase()
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : []
}

function createId(prefix = 'bank-relationship') {
  localSequence += 1
  return `${prefix}-${Date.now().toString(36)}-${localSequence}`
}

function slugify(value = '') {
  return slugifyBank(value)
}

function bankNameForId(bankId = '', options = {}) {
  const safeId = slugify(bankId)
  const bank = getSystemBanks(options).find((row) => row.id === safeId)
  return bank?.shortName || bank?.name || normalizeText(bankId) || 'Other'
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
    id: event.id || createId('bank-activity'),
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
  const safe = values.map(Number).filter((value) => Number.isFinite(value) && value >= 0)
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
  return normalizeLower(`${row.status || ''} ${row.stage || ''} ${row.financeStatus || ''} ${row.finance_status || ''} ${row.financeStageKey || ''} ${row.finance_stage_key || ''} ${row.financeStageLabel || ''} ${row.registrationStatus || ''} ${row.nextAction || ''} ${row.next_action || ''} ${row.bankStatus || ''} ${row.bank_status || ''}`)
}

function signalIncludes(row = {}, terms = []) {
  const signal = getSignal(row)
  return terms.some((term) => signal.includes(term))
}

function isSubmittedApplication(row = {}) {
  return signalIncludes(row, SUBMITTED_TERMS)
}

function isApprovedApplication(row = {}) {
  return signalIncludes(row, APPROVAL_TERMS)
}

function isDeclinedApplication(row = {}) {
  return signalIncludes(row, DECLINE_TERMS)
}

function isInstructionApplication(row = {}) {
  return signalIncludes(row, INSTRUCTION_TERMS)
}

function isPreApprovedApplication(row = {}) {
  return signalIncludes(row, PRE_APPROVAL_TERMS)
}

function isAcceptedApplication(row = {}) {
  return signalIncludes(row, ACCEPTED_TERMS) || isInstructionApplication(row)
}

function isReviewedApplication(row = {}) {
  return signalIncludes(row, REVIEW_TERMS) || isApprovedApplication(row) || isDeclinedApplication(row)
}

function isAcknowledgedApplication(row = {}) {
  return signalIncludes(row, ACKNOWLEDGE_TERMS) || isReviewedApplication(row)
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

function getApplicationConsultantName(row = {}) {
  return normalizeText(row.consultantName || row.consultant_name || row.consultant || row.assignedUserName || row.assigned_user_name || getApplicationConsultantId(row)) || 'Consultant'
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

function getBankValuesForApplication(row = {}) {
  const values = [
    row.bank,
    row.bankName,
    row.bank_name,
    row.lender,
    row.lenderName,
    row.lender_name,
    row.submittedBank,
    row.submitted_bank,
    ...normalizeArray(row.banksSubmittedTo || row.banks_submitted_to || row.submittedBanks || row.submitted_banks || row.selectedBanks || row.selected_banks),
  ].map(normalizeText).filter(Boolean)
  return values.length ? [...new Set(values.map(slugify))] : ['other']
}

function applicationHasBank(row = {}, bankId = '') {
  return getBankValuesForApplication(row).includes(slugify(bankId))
}

function getApplicationResponseHours(row = {}) {
  const start = normalizeText(row.submittedAt || row.submitted_at || row.bankSubmittedAt || row.bank_submitted_at || row.createdAt || row.created_at)
  const end = normalizeText(row.bankFeedbackAt || row.bank_feedback_at || row.feedbackAt || row.feedback_at || row.respondedAt || row.responded_at || row.updatedAt || row.updated_at)
  return hoursBetween(start, end)
}

function getApplicationApprovalHours(row = {}) {
  const start = normalizeText(row.submittedAt || row.submitted_at || row.bankSubmittedAt || row.bank_submitted_at || row.createdAt || row.created_at)
  const end = normalizeText(row.approvedAt || row.approved_at || row.quoteApprovedAt || row.quote_approved_at || row.bankFeedbackAt || row.bank_feedback_at || row.updatedAt || row.updated_at)
  return hoursBetween(start, end)
}

function getDeclineReason(row = {}) {
  const raw = normalizeLower(row.declineReason || row.decline_reason || row.bankDeclineReason || row.bank_decline_reason || row.reason)
  if (raw.includes('afford')) return 'Affordability'
  if (raw.includes('credit')) return 'Credit Profile'
  if (raw.includes('income')) return 'Income Verification'
  if (raw.includes('policy') || raw.includes('risk')) return 'Risk Policy'
  if (raw.includes('ltv') || raw.includes('loan to value')) return 'LTV'
  if (raw.includes('doc')) return 'Documentation'
  return raw ? 'Other' : 'Other'
}

function getHealthStatus(score = 0) {
  if (score <= 39) return BANK_RELATIONSHIP_HEALTH_STATUSES.critical
  if (score <= 59) return BANK_RELATIONSHIP_HEALTH_STATUSES.atRisk
  if (score <= 79) return BANK_RELATIONSHIP_HEALTH_STATUSES.healthy
  return BANK_RELATIONSHIP_HEALTH_STATUSES.excellent
}

function normalizeBank(row = {}, workspaceKey = '') {
  const id = slugify(row.id || row.bankId || row.bank_id || row.name || row.bankName || row.bank_name || 'other')
  return {
    id,
    bankId: id,
    organisationId: normalizeText(row.organisationId || row.organisation_id || workspaceKey),
    name: normalizeText(row.shortName || row.short_name || row.name || row.bankName || row.bank_name || bankNameForId(id)),
    legalName: normalizeText(row.name || row.legalName || row.legal_name),
    status: normalizeLower(row.status) || 'active',
    relationshipOwner: normalizeText(row.relationshipOwner || row.relationship_owner),
    contactName: normalizeText(row.contactName || row.contact_name),
    contactEmail: normalizeText(row.contactEmail || row.contact_email),
    contactPhone: normalizeText(row.contactPhone || row.contact_phone),
    nextReviewDate: normalizeText(row.nextReviewDate || row.next_review_date),
    relationshipNotes: normalizeText(row.relationshipNotes || row.relationship_notes),
    createdAt: normalizeText(row.createdAt || row.created_at) || new Date().toISOString(),
    updatedAt: normalizeText(row.updatedAt || row.updated_at) || new Date().toISOString(),
  }
}

function normalizeContact(row = {}, workspaceKey = '') {
  return {
    id: normalizeText(row.id) || createId('bank-contact'),
    organisationId: normalizeText(row.organisationId || row.organisation_id || workspaceKey),
    bankId: slugify(row.bankId || row.bank_id || row.bank || row.bankName),
    name: normalizeText(row.name),
    role: normalizeText(row.role),
    email: normalizeText(row.email),
    phone: normalizeText(row.phone),
    region: normalizeText(row.region || row.regionName || row.region_name),
    notes: normalizeText(row.notes),
    createdBy: normalizeText(row.createdBy || row.created_by),
    createdAt: normalizeText(row.createdAt || row.created_at) || new Date().toISOString(),
    updatedAt: normalizeText(row.updatedAt || row.updated_at) || new Date().toISOString(),
  }
}

function normalizeEscalation(row = {}, workspaceKey = '') {
  return {
    id: normalizeText(row.id) || createId('bank-escalation'),
    organisationId: normalizeText(row.organisationId || row.organisation_id || workspaceKey),
    bankId: slugify(row.bankId || row.bank_id || row.bank || row.bankName),
    applicationId: normalizeText(row.applicationId || row.application_id),
    consultantId: normalizeText(row.consultantId || row.consultant_id),
    consultantName: normalizeText(row.consultantName || row.consultant_name || row.consultant),
    branchId: normalizeText(row.branchId || row.branch_id),
    regionId: normalizeText(row.regionId || row.region_id),
    issue: normalizeText(row.issue || row.title || 'Bank escalation'),
    issueType: normalizeText(row.issueType || row.issue_type || 'Relationship Issue'),
    priority: normalizeText(row.priority || 'Medium'),
    status: normalizeLower(row.status || 'open'),
    createdBy: normalizeText(row.createdBy || row.created_by),
    createdAt: normalizeText(row.createdAt || row.created_at) || new Date().toISOString(),
    resolvedAt: normalizeText(row.resolvedAt || row.resolved_at),
  }
}

function normalizeFeedback(row = {}, workspaceKey = '') {
  const message = normalizeText(row.message || row.feedback || row.note || row.notes)
  const feedbackType = normalizeText(row.feedbackType || row.feedback_type || row.type || inferFeedbackType(message))
  return {
    id: normalizeText(row.id) || createId('bank-feedback'),
    organisationId: normalizeText(row.organisationId || row.organisation_id || workspaceKey),
    bankId: slugify(row.bankId || row.bank_id || row.bank || row.bankName),
    feedbackType,
    sentiment: normalizeText(row.sentiment || inferFeedbackSentiment(`${feedbackType} ${message}`)),
    message,
    consultantId: normalizeText(row.consultantId || row.consultant_id || row.createdBy || row.created_by),
    consultantName: normalizeText(row.consultantName || row.consultant_name || row.consultant),
    branchId: normalizeText(row.branchId || row.branch_id),
    regionId: normalizeText(row.regionId || row.region_id),
    createdBy: normalizeText(row.createdBy || row.created_by),
    createdAt: normalizeText(row.createdAt || row.created_at) || new Date().toISOString(),
  }
}

function inferFeedbackType(message = '') {
  const signal = normalizeLower(message)
  if (signal.includes('escalation')) return 'Escalation'
  if (POSITIVE_FEEDBACK_TERMS.some((term) => signal.includes(term))) return 'Positive Experience'
  if (NEGATIVE_FEEDBACK_TERMS.some((term) => signal.includes(term))) return 'Negative Experience'
  return 'Relationship Feedback'
}

function inferFeedbackSentiment(message = '') {
  const signal = normalizeLower(message)
  if (POSITIVE_FEEDBACK_TERMS.some((term) => signal.includes(term))) return 'positive'
  if (NEGATIVE_FEEDBACK_TERMS.some((term) => signal.includes(term))) return 'negative'
  return 'neutral'
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

function getRawRows(context = {}, options = {}) {
  const workspaceKey = getWorkspaceKey(context, options)
  const operationalRows = getPartnerPortalOperationalRows(context, { ...options, workspaceId: workspaceKey })
  const applications = normalizeArray(options.applications || operationalRows.applications)
  const branches = normalizeArray(options.branches || options.units || operationalRows.branches || operationalRows.units)
  const rawRegions = normalizeArray(options.regions || operationalRows.regions)
  const regions = rawRegions.length ? rawRegions : deriveRegionsFromBranches(branches, applications)
  const consultants = normalizeArray(options.consultants || options.users || operationalRows.consultants || operationalRows.users)
  const optionBanks = normalizeArray(options.banks)
  const configuredBanks = getActiveOriginatorBanks(workspaceKey, context, { ...options, workspaceId: workspaceKey })
  const localBanks = getLocalRows(LOCAL_BANK_STORE, workspaceKey)
  const panelBanks = configuredBanks.map((bank) => ({
    id: bank.bankId,
    bankId: bank.bankId,
    name: bank.bankName,
    shortName: bank.shortName,
    status: bank.status,
    relationshipOwner: bank.relationshipOwner || bank.slaOwner,
    contactName: bank.primaryContactName,
    contactEmail: bank.primaryContactEmail,
    contactPhone: bank.primaryContactPhone,
    nextReviewDate: bank.nextReviewDate || bank.agreementReviewDate,
    relationshipNotes: bank.notes,
    createdAt: bank.createdAt,
    updatedAt: bank.updatedAt,
  }))
  const bankMap = new Map()
  ;[...panelBanks, ...optionBanks, ...localBanks].forEach((bank) => {
    const normalized = normalizeBank(bank, workspaceKey)
    bankMap.set(normalized.id, normalized)
  })
  if (options.includeApplicationBanks === true) {
    applications.flatMap(getBankValuesForApplication).forEach((bankId) => {
      if (!bankMap.has(bankId)) bankMap.set(bankId, normalizeBank({ id: bankId, name: bankNameForId(bankId, options) }, workspaceKey))
    })
  }
  const scope = resolveBondOrganisationScope(context, {
    regions,
    branches,
    consultants,
    applications,
  })
  return {
    workspaceKey,
    scope,
    banks: [...bankMap.values()],
    applications,
    branches,
    regions,
    consultants,
    contacts: [...normalizeArray(options.contacts), ...getLocalRows(LOCAL_CONTACT_STORE, workspaceKey)].map((row) => normalizeContact(row, workspaceKey)),
    escalations: [...normalizeArray(options.escalations), ...getLocalRows(LOCAL_ESCALATION_STORE, workspaceKey)].map((row) => normalizeEscalation(row, workspaceKey)),
    feedback: [...normalizeArray(options.feedback), ...getLocalRows(LOCAL_FEEDBACK_STORE, workspaceKey)].map((row) => normalizeFeedback(row, workspaceKey)),
  }
}

function scopeMatchesApplication(scope = {}, row = {}) {
  if (scope.scopeLevel === BOND_ORGANISATION_LEVELS.hq) return true
  if (scope.scopeLevel === BOND_ORGANISATION_LEVELS.region) return normalizeArray(scope.regionIds).includes(getApplicationRegionId(row))
  if (scope.scopeLevel === BOND_ORGANISATION_LEVELS.branch) return normalizeArray(scope.branchIds).includes(getApplicationBranchId(row))
  return normalizeArray(scope.consultantIds).includes(getApplicationConsultantId(row))
}

function scopeMatchesBranch(scope = {}, row = {}) {
  if (scope.scopeLevel === BOND_ORGANISATION_LEVELS.hq) return true
  if (scope.scopeLevel === BOND_ORGANISATION_LEVELS.region) return normalizeArray(scope.regionIds).includes(getBranchRegionId(row))
  if (scope.scopeLevel === BOND_ORGANISATION_LEVELS.branch) return normalizeArray(scope.branchIds).includes(getBranchId(row))
  return false
}

function scopeMatchesEscalation(scope = {}, row = {}) {
  if (scope.scopeLevel === BOND_ORGANISATION_LEVELS.hq) return true
  if (scope.scopeLevel === BOND_ORGANISATION_LEVELS.region) return normalizeArray(scope.regionIds).includes(row.regionId)
  if (scope.scopeLevel === BOND_ORGANISATION_LEVELS.branch) return normalizeArray(scope.branchIds).includes(row.branchId)
  return normalizeArray(scope.consultantIds).includes(row.consultantId)
}

function scopeRows(rawRows = {}) {
  const applications = rawRows.applications.filter((row) => scopeMatchesApplication(rawRows.scope, row))
  const bankIds = new Set(applications.flatMap(getBankValuesForApplication))
  const escalations = rawRows.escalations.filter((row) => (!bankIds.size || bankIds.has(row.bankId)) && scopeMatchesEscalation(rawRows.scope, row))
  const feedback = rawRows.feedback.filter((row) => (!bankIds.size || bankIds.has(row.bankId)) && (
    rawRows.scope.scopeLevel === BOND_ORGANISATION_LEVELS.hq ||
    (rawRows.scope.scopeLevel === BOND_ORGANISATION_LEVELS.region && normalizeArray(rawRows.scope.regionIds).includes(row.regionId)) ||
    (rawRows.scope.scopeLevel === BOND_ORGANISATION_LEVELS.branch && normalizeArray(rawRows.scope.branchIds).includes(row.branchId)) ||
    normalizeArray(rawRows.scope.consultantIds).includes(row.consultantId)
  ))
  return {
    ...rawRows,
    applications,
    branches: rawRows.branches.filter((row) => scopeMatchesBranch(rawRows.scope, row)),
    banks: rawRows.banks,
    escalations,
    feedback,
  }
}

function getRows(context = {}, options = {}) {
  return scopeRows(getRawRows(context, options))
}

function assertBankDashboardAccess(rows = {}) {
  if (![BOND_ORGANISATION_LEVELS.hq, BOND_ORGANISATION_LEVELS.region, BOND_ORGANISATION_LEVELS.branch].includes(rows.scope.scopeLevel)) {
    const error = new Error('Bank Relationship Centre is available to HQ, regional managers, and branch managers.')
    error.code = 'permission_denied'
    throw error
  }
}

function assertHQAccess(rows = {}) {
  if (rows.scope.scopeLevel !== BOND_ORGANISATION_LEVELS.hq) {
    const error = new Error('Only HQ can manage bank relationship records and contacts.')
    error.code = 'permission_denied'
    throw error
  }
}

function assertCanCreateEscalation(rows = {}) {
  if (![BOND_ORGANISATION_LEVELS.hq, BOND_ORGANISATION_LEVELS.region, BOND_ORGANISATION_LEVELS.branch].includes(rows.scope.scopeLevel)) {
    const error = new Error('Only HQ, regional managers, and branch managers can create bank escalations.')
    error.code = 'permission_denied'
    throw error
  }
}

function findBank(rows = {}, bankId = '') {
  const safeId = slugify(bankId)
  return rows.banks.find((bank) => bank.id === safeId) || normalizeBank({ id: safeId, name: bankNameForId(safeId) }, rows.workspaceKey)
}

function applicationsForBank(rows = {}, bankId = '') {
  const safeId = slugify(bankId)
  return rows.applications.filter((row) => applicationHasBank(row, safeId))
}

function contactsForBank(rows = {}, bankId = '') {
  const safeId = slugify(bankId)
  return rows.contacts.filter((row) => row.bankId === safeId)
}

function escalationsForBank(rows = {}, bankId = '') {
  const safeId = slugify(bankId)
  return rows.escalations.filter((row) => row.bankId === safeId)
}

function feedbackForBank(rows = {}, bankId = '') {
  const safeId = slugify(bankId)
  return rows.feedback.filter((row) => row.bankId === safeId)
}

function feedbackScore(rows = []) {
  if (!rows.length) return 70
  const total = rows.reduce((sum, row) => {
    if (normalizeLower(row.sentiment) === 'positive') return sum + 100
    if (normalizeLower(row.sentiment) === 'negative') return sum + 20
    return sum + 65
  }, 0)
  return Math.round(total / rows.length)
}

function bankMetrics(rows = {}, bankId = '') {
  const applications = applicationsForBank(rows, bankId)
  const submitted = applications.filter(isSubmittedApplication)
  const approvals = applications.filter(isApprovedApplication)
  const declines = applications.filter(isDeclinedApplication)
  const instructions = applications.filter(isInstructionApplication)
  const escalations = escalationsForBank(rows, bankId)
  const openEscalations = escalations.filter((row) => OPEN_ESCALATION_STATUSES.has(row.status))
  const feedbackRows = feedbackForBank(rows, bankId)
  return {
    bankId: slugify(bankId),
    applications,
    submitted,
    approvals,
    declines,
    instructions,
    escalations,
    openEscalations,
    feedbackRows,
    applicationsSubmitted: submitted.length,
    approvalCount: approvals.length,
    declineCount: declines.length,
    approvalRate: percent(approvals.length, submitted.length || applications.length),
    declineRate: percent(declines.length, submitted.length || applications.length),
    instructionCount: instructions.length,
    instructionRate: percent(instructions.length, approvals.length || submitted.length || applications.length),
    quoteAcceptance: percent(instructions.length, approvals.length || submitted.length || applications.length),
    averageResponseTime: average(applications.map(getApplicationResponseHours)),
    averageApprovalTime: average(approvals.map(getApplicationApprovalHours)),
    averageTurnaround: average(applications.map((row) => daysBetween(row.createdAt || row.created_at, row.updatedAt || row.updated_at || row.bankFeedbackAt || row.bank_feedback_at || row.submittedAt || row.submitted_at))),
    escalationCount: escalations.length,
    openEscalationCount: openEscalations.length,
    consultantFeedbackScore: feedbackScore(feedbackRows.filter((row) => normalizeLower(row.feedbackType).includes('consultant') || row.consultantId)),
    partnerFeedbackScore: feedbackScore(feedbackRows.filter((row) => normalizeLower(row.feedbackType).includes('partner'))),
  }
}

function buildHealth(rows = {}, bankId = '') {
  const metrics = bankMetrics(rows, bankId)
  const responseScore = clamp(100 - Math.max(0, metrics.averageResponseTime - 24) * 0.9)
  const escalationScore = clamp(100 - metrics.openEscalationCount * 15 - metrics.escalationCount * 4)
  const score = clamp(
    metrics.approvalRate * 0.28 +
      responseScore * 0.2 +
      escalationScore * 0.18 +
      metrics.instructionRate * 0.18 +
      metrics.consultantFeedbackScore * 0.1 +
      metrics.partnerFeedbackScore * 0.06,
  )
  return {
    bankId: slugify(bankId),
    score,
    status: getHealthStatus(score),
    components: {
      approvalRate: metrics.approvalRate,
      responseTime: responseScore,
      escalationVolume: escalationScore,
      instructionRate: metrics.instructionRate,
      consultantFeedback: metrics.consultantFeedbackScore,
      partnerFeedback: metrics.partnerFeedbackScore,
    },
  }
}

function buildScorecard(rows = {}, bank = {}) {
  const metrics = bankMetrics(rows, bank.id)
  const health = buildHealth(rows, bank.id)
  return {
    id: bank.id,
    bankId: bank.id,
    bankName: bank.name,
    status: bank.status,
    relationshipOwner: bank.relationshipOwner,
    applicationsSubmitted: metrics.applicationsSubmitted,
    approvals: metrics.approvalCount,
    declines: metrics.declineCount,
    approvalRate: metrics.approvalRate,
    averageTurnaround: metrics.averageTurnaround,
    averageResponseTime: metrics.averageResponseTime,
    averageApprovalTime: metrics.averageApprovalTime,
    instructionConversion: metrics.instructionRate,
    instructionRate: metrics.instructionRate,
    quoteAcceptance: metrics.quoteAcceptance,
    instructionsIssued: metrics.instructionCount,
    escalations: metrics.escalationCount,
    relationshipHealth: health.status,
    healthScore: health.score,
  }
}

function resolveRevenuePerBond(options = {}) {
  const value = Number(options.platformRevenuePerBond || options.revenuePerBond || DEFAULT_PLATFORM_REVENUE_PER_BOND)
  return Number.isFinite(value) && value >= 0 ? value : DEFAULT_PLATFORM_REVENUE_PER_BOND
}

function commandHealthStatus(score = null) {
  if (score === null || score === undefined || Number.isNaN(Number(score))) return BANK_COMMAND_HEALTH_STATUSES.notEnoughData
  if (score >= 85) return BANK_COMMAND_HEALTH_STATUSES.excellent
  if (score >= 70) return BANK_COMMAND_HEALTH_STATUSES.good
  if (score >= 55) return BANK_COMMAND_HEALTH_STATUSES.fair
  if (score >= 40) return BANK_COMMAND_HEALTH_STATUSES.poor
  return BANK_COMMAND_HEALTH_STATUSES.critical
}

export function calculateBankRelationshipCommandHealthScore(metrics = {}, options = {}) {
  const applicationCount = Number(metrics.applications || metrics.applicationsSubmitted || 0)
  if (!applicationCount) return null
  const responseTargetHours = Number(options.bankResponseTargetHours || options.responseTargetHours || 72)
  const responseTime = Number(metrics.averageResponseTime || metrics.avgTurnaround || metrics.averageTurnaround || 0)
  const responseScore = responseTime > 0 ? clamp(100 - Math.max(0, responseTime - responseTargetHours) * 1.2) : 65
  const escalationPenalty = Math.min(38, Number(metrics.escalationCount || metrics.escalations || 0) * 4 + Number(metrics.openEscalationCount || 0) * 8)
  return clamp(
    clamp(metrics.approvalRate) * 0.42 +
      responseScore * 0.25 +
      clamp(metrics.instructionRate || metrics.instructionConversion) * 0.23 +
      Math.min(100, applicationCount * 2) * 0.1 -
      escalationPenalty,
  )
}

function getDateForRow(row = {}, fallback = new Date()) {
  const value = new Date(dateValue(row))
  return Number.isNaN(value.getTime()) ? fallback : value
}

function isBetweenDays(row = {}, minDays = 0, maxDays = 30, now = new Date()) {
  const value = getDateForRow(row, now)
  const age = (now.getTime() - value.getTime()) / (24 * 60 * 60 * 1000)
  return age >= minDays && age < maxDays
}

function periodChange(current = 0, previous = 0) {
  const safeCurrent = Number(current || 0)
  const safePrevious = Number(previous || 0)
  if (!safePrevious) return safeCurrent ? 100 : 0
  return Math.round(((safeCurrent - safePrevious) / safePrevious) * 1000) / 10
}

function monthKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function monthLabel(date = new Date()) {
  return date.toLocaleString('en-ZA', { month: 'short' })
}

function getMonthBuckets(now = new Date(), count = 12) {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (count - 1 - index), 1)
    return { key: monthKey(date), label: monthLabel(date), date }
  })
}

function buildMonthlySeries(applications = [], now = new Date(), count = 12, getter = (rows) => rows.length) {
  return getMonthBuckets(now, count).map((bucket) => {
    const rows = applications.filter((row) => monthKey(getDateForRow(row, now)) === bucket.key)
    return {
      id: bucket.key,
      label: bucket.label,
      value: getter(rows),
    }
  })
}

function buildBankSparkline(rows = {}, bankId = '', now = new Date()) {
  return buildMonthlySeries(applicationsForBank(rows, bankId), now, 8).map((point) => point.value)
}

function buildBankPeriodTrend(rows = {}, bankId = '', now = new Date()) {
  const applications = applicationsForBank(rows, bankId)
  const current = applications.filter((row) => isBetweenDays(row, 0, 30, now))
  const previous = applications.filter((row) => isBetweenDays(row, 30, 60, now))
  const currentApprovals = current.filter(isApprovedApplication)
  const previousApprovals = previous.filter(isApprovedApplication)
  const currentSubmitted = current.filter(isSubmittedApplication)
  const previousSubmitted = previous.filter(isSubmittedApplication)
  const currentResponse = average(current.map(getApplicationResponseHours))
  const previousResponse = average(previous.map(getApplicationResponseHours))
  return {
    applicationsChangePercent: periodChange(current.length, previous.length),
    approvalRateChange: percent(currentApprovals.length, currentSubmitted.length || current.length) - percent(previousApprovals.length, previousSubmitted.length || previous.length),
    responseTimeChange: previousResponse ? Math.round((previousResponse - currentResponse) * 10) / 10 : 0,
    direction: current.length >= previous.length ? 'up' : 'down',
  }
}

function buildCommandBankRow(rows = {}, bank = {}, options = {}) {
  const metrics = bankMetrics(rows, bank.id)
  const revenuePerBond = resolveRevenuePerBond(options)
  const revenueGeneratingApplications = Math.max(metrics.approvalCount, metrics.instructionCount)
  const healthScore = calculateBankRelationshipCommandHealthScore({
    applications: metrics.applications.length,
    approvalRate: metrics.approvalRate,
    averageResponseTime: metrics.averageResponseTime,
    averageTurnaround: metrics.averageTurnaround,
    instructionRate: metrics.instructionRate,
    escalationCount: metrics.escalationCount,
    openEscalationCount: metrics.openEscalationCount,
  }, options)
  return {
    id: bank.id,
    bankId: bank.id,
    bankName: bank.name,
    status: bank.status,
    relationshipOwner: bank.relationshipOwner || null,
    applications: metrics.applications.length,
    applicationsSubmitted: metrics.applicationsSubmitted,
    approvals: metrics.approvalCount,
    declines: metrics.declineCount,
    approvalRate: metrics.approvalRate,
    averageResponseTime: metrics.averageResponseTime,
    averageTurnaround: metrics.averageTurnaround,
    instructionRate: metrics.instructionRate,
    instructionsIssued: metrics.instructionCount,
    escalations: metrics.escalationCount,
    openEscalations: metrics.openEscalationCount,
    escalationRate: percent(metrics.escalationCount, metrics.submitted.length || metrics.applications.length),
    revenueGenerated: revenueGeneratingApplications * revenuePerBond,
    healthScore,
    healthStatus: commandHealthStatus(healthScore),
    trend: buildBankPeriodTrend(rows, bank.id, options.now ? new Date(options.now) : new Date()),
    sparkline: buildBankSparkline(rows, bank.id, options.now ? new Date(options.now) : new Date()),
  }
}

function calculateRelationshipRankScore(row = {}, maxRevenue = 0) {
  if (!Number(row.applications || 0)) return null
  const responseTargetHours = 72
  const responseScore = row.averageResponseTime > 0 ? clamp(100 - Math.max(0, Number(row.averageResponseTime) - responseTargetHours) * 1.15) : 55
  const revenueScore = maxRevenue ? clamp((Number(row.revenueGenerated || 0) / maxRevenue) * 100) : 0
  const escalationScore = clamp(100 - Number(row.escalationRate || 0) * 2 - Number(row.openEscalations || 0) * 10)
  return clamp(
    clamp(row.approvalRate) * 0.28 +
      responseScore * 0.2 +
      clamp(row.instructionRate) * 0.18 +
      revenueScore * 0.22 +
      escalationScore * 0.12,
  )
}

function buildCommandKpis(rows = {}, bankRows = [], options = {}) {
  const submitted = rows.applications.filter(isSubmittedApplication)
  const approvals = rows.applications.filter(isApprovedApplication)
  const instructions = rows.applications.filter(isInstructionApplication)
  const activeRows = bankRows.filter((row) => row.applications > 0)
  const fastest = [...activeRows].filter((row) => row.averageResponseTime > 0).sort((left, right) => left.averageResponseTime - right.averageResponseTime)[0] || null
  const mostUsed = [...activeRows].sort((left, right) => right.applications - left.applications)[0] || null
  return {
    totalApplications: submitted.length || rows.applications.length,
    approvalRate: percent(approvals.length, submitted.length || rows.applications.length),
    fastestBank: fastest ? { bankId: fastest.bankId, bankName: fastest.bankName, responseTime: fastest.averageResponseTime } : null,
    mostUsedBank: mostUsed ? { bankId: mostUsed.bankId, bankName: mostUsed.bankName, applications: mostUsed.applications } : null,
    averageResponseTime: average(rows.applications.map(getApplicationResponseHours)),
    revenueGenerated: Math.max(approvals.length, instructions.length) * resolveRevenuePerBond(options),
  }
}

function buildBankDistribution(bankRows = []) {
  const activeRows = bankRows.filter((row) => row.applications > 0)
  const total = activeRows.reduce((sum, row) => sum + row.applications, 0)
  return activeRows
    .map((row) => ({
      id: row.bankId,
      bankId: row.bankId,
      bankName: row.bankName,
      applications: row.applications,
      percentage: percent(row.applications, total),
    }))
    .sort((left, right) => right.applications - left.applications)
}

function buildApprovalFunnel(rows = {}) {
  const applications = rows.applications
  const submitted = applications.filter(isSubmittedApplication)
  const preApproved = applications.filter(isPreApprovedApplication)
  const approved = applications.filter(isApprovedApplication)
  const accepted = applications.filter(isAcceptedApplication)
  const instructed = applications.filter(isInstructionApplication)
  const base = submitted.length || applications.length
  return [
    { id: 'submitted', stage: 'Applications Submitted', count: submitted.length },
    { id: 'pre-approved', stage: 'Pre Approved', count: preApproved.length, optional: true },
    { id: 'approved', stage: 'Approved', count: approved.length },
    { id: 'accepted', stage: 'Accepted', count: accepted.length, optional: true },
    { id: 'instruction-issued', stage: 'Instruction Issued', count: instructed.length },
  ]
    .filter((stage) => !stage.optional || stage.count > 0)
    .map((stage, index, stages) => {
      const previous = stages[index - 1]
      return {
        ...stage,
        conversionRate: index === 0 ? (base ? 100 : 0) : percent(stage.count, previous?.count || base),
        totalConversionRate: percent(stage.count, base),
      }
    })
}

function buildRegionalSlaHeatmap(regionalPerformance = [], bankRows = []) {
  const discoveredRegionNames = regionalPerformance.map((row) => row.regionName).filter(Boolean)
  const regionNames = [...new Set([...DEFAULT_REGIONAL_SLA_ROWS, ...discoveredRegionNames])]
  const banks = (bankRows.length ? bankRows : regionalPerformance)
    .reduce((items, row) => {
      const bankId = slugify(row.bankId || row.id)
      if (!bankId || items.some((item) => item.bankId === bankId)) return items
      return [...items, { bankId, bankName: normalizeText(row.bankName || row.name || bankNameForId(bankId)) }]
    }, [])
  return {
    banks,
    rows: regionNames.map((regionName) => ({
      id: slugify(regionName),
      regionName,
      cells: banks.map((bank) => {
        const match = regionalPerformance.find((row) => row.regionName === regionName && row.bankId === bank.bankId)
        const responseTime = match ? Number(match.responseTime || 0) : null
        return {
          id: `${slugify(regionName)}-${bank.bankId}`,
          bankId: bank.bankId,
          bankName: bank.bankName,
          applications: match?.applications || 0,
          responseTime,
          status: responseTime === null ? 'empty' : responseTime <= 48 ? 'excellent' : responseTime <= 72 ? 'average' : responseTime <= 120 ? 'slow' : 'problem',
        }
      }),
    })),
  }
}

function buildBankOpportunityMatrix(bankRows = []) {
  const activeRows = bankRows.filter((row) => Number(row.applications || 0) > 0)
  if (!activeRows.length) {
    return {
      quadrants: [
        { id: 'preferred', title: 'Preferred Banks', approval: 'High Approval', revenue: 'High Revenue', description: 'Send more high-fit applications here.', banks: [] },
        { id: 'growth', title: 'Growth Opportunity', approval: 'High Approval', revenue: 'Low Revenue', description: 'Underutilised relationships with room to grow.', banks: [] },
        { id: 'review', title: 'Needs Review', approval: 'Low Approval', revenue: 'High Revenue', description: 'Commercially meaningful relationships needing intervention.', banks: [] },
        { id: 'low-priority', title: 'Low Priority', approval: 'Low Approval', revenue: 'Low Revenue', description: 'Lower immediate routing priority.', banks: [] },
      ],
      hasData: false,
    }
  }
  const approvalThreshold = average(activeRows.map((row) => row.approvalRate))
  const revenueThreshold = average(activeRows.map((row) => row.revenueGenerated))
  const quadrants = [
    { id: 'preferred', title: 'Preferred Banks', approval: 'High Approval', revenue: 'High Revenue', description: 'Send more high-fit applications here.', banks: [] },
    { id: 'growth', title: 'Growth Opportunity', approval: 'High Approval', revenue: 'Low Revenue', description: 'Underutilised relationships with room to grow.', banks: [] },
    { id: 'review', title: 'Needs Review', approval: 'Low Approval', revenue: 'High Revenue', description: 'Commercially meaningful relationships needing intervention.', banks: [] },
    { id: 'low-priority', title: 'Low Priority', approval: 'Low Approval', revenue: 'Low Revenue', description: 'Lower immediate routing priority.', banks: [] },
  ]
  activeRows.forEach((row) => {
    const highApproval = Number(row.approvalRate || 0) >= approvalThreshold
    const highRevenue = Number(row.revenueGenerated || 0) >= revenueThreshold
    const quadrantId = highApproval && highRevenue ? 'preferred' : highApproval ? 'growth' : highRevenue ? 'review' : 'low-priority'
    quadrants.find((quadrant) => quadrant.id === quadrantId)?.banks.push(row)
  })
  quadrants.forEach((quadrant) => {
    quadrant.banks.sort((left, right) => (right.relationshipRankScore || 0) - (left.relationshipRankScore || 0) || left.bankName.localeCompare(right.bankName))
  })
  return {
    approvalThreshold,
    revenueThreshold,
    quadrants,
    hasData: true,
  }
}

function buildTrendWidgets(rows = {}, options = {}) {
  const now = options.now ? new Date(options.now) : new Date()
  const applications = rows.applications
  return [
    {
      id: 'applications',
      title: 'Applications Submitted',
      tone: 'blue',
      series: buildMonthlySeries(applications, now, 12, (items) => items.filter(isSubmittedApplication).length || items.length),
    },
    {
      id: 'approval-rate',
      title: 'Approval Rate',
      tone: 'green',
      series: buildMonthlySeries(applications, now, 12, (items) => percent(items.filter(isApprovedApplication).length, items.filter(isSubmittedApplication).length || items.length)),
    },
    {
      id: 'turnaround',
      title: 'Average Response Time',
      tone: 'purple',
      series: buildMonthlySeries(applications, now, 12, (items) => Math.round((average(items.map(getApplicationResponseHours)) / 24) * 10) / 10),
    },
    {
      id: 'revenue',
      title: 'Revenue Generated',
      tone: 'orange',
      series: buildMonthlySeries(applications, now, 12, (items) => items.filter(isApprovedApplication).length * resolveRevenuePerBond(options)),
    },
  ].map((widget) => {
    const first = widget.series[0]?.value || 0
    const last = widget.series[widget.series.length - 1]?.value || 0
    return {
      ...widget,
      changePercent: periodChange(last, first),
    }
  })
}

function buildBankProfiles(rows = {}, bankRows = []) {
  return bankRows.map((bankRow) => {
    const bank = findBank(rows, bankRow.bankId)
    const contacts = contactsForBank(rows, bankRow.bankId)
    const primaryContact = contacts[0] || null
    const escalations = escalationsForBank(rows, bankRow.bankId)
    const lastEscalation = [...escalations].sort((left, right) => normalizeText(right.createdAt).localeCompare(normalizeText(left.createdAt)))[0] || null
    const regionalCoverage = [...new Set(applicationsForBank(rows, bankRow.bankId).map((row) => labelForRegion(rows, getApplicationRegionId(row))).filter(Boolean))]
    return {
      id: bankRow.bankId,
      bankId: bankRow.bankId,
      bankName: bankRow.bankName,
      relationshipHealth: bankRow.healthStatus,
      healthScore: bankRow.healthScore,
      applications: bankRow.applications,
      approvalRate: bankRow.approvalRate,
      averageResponseTime: bankRow.averageResponseTime,
      revenueGenerated: bankRow.revenueGenerated,
      escalations: bankRow.escalations,
      lastEscalationAt: lastEscalation?.createdAt || null,
      primaryContact: primaryContact ? {
        name: primaryContact.name,
        email: primaryContact.email,
        phone: primaryContact.phone,
        role: primaryContact.role,
      } : {
        name: bank.contactName || null,
        email: bank.contactEmail || null,
        phone: bank.contactPhone || null,
        role: null,
      },
      relationshipOwner: bank.relationshipOwner || null,
      regionalCoverage,
      nextReviewDate: bank.nextReviewDate || null,
      relationshipNotes: bank.relationshipNotes || null,
    }
  })
}

function buildPerformance(rows = {}, bankId = '', now = new Date()) {
  const metrics = bankMetrics(rows, bankId)
  const trend = [30, 90, 365].map((days) => {
    const applications = metrics.applications.filter((row) => isWithinDays(row, days, now))
    const submitted = applications.filter(isSubmittedApplication)
    const approvals = applications.filter(isApprovedApplication)
    const declines = applications.filter(isDeclinedApplication)
    const instructions = applications.filter(isInstructionApplication)
    return {
      id: `${slugify(bankId)}-${days}`,
      periodDays: days,
      applications: applications.length,
      approvals: approvals.length,
      declines: declines.length,
      approvalRate: percent(approvals.length, submitted.length || applications.length),
      instructionRate: percent(instructions.length, approvals.length || submitted.length || applications.length),
      averageResponseTime: average(applications.map(getApplicationResponseHours)),
      averageApprovalTime: average(approvals.map(getApplicationApprovalHours)),
    }
  })
  return {
    bankId: slugify(bankId),
    metrics: {
      applications: metrics.applications.length,
      approvals: metrics.approvalCount,
      declines: metrics.declineCount,
      approvalRate: metrics.approvalRate,
      instructionRate: metrics.instructionRate,
      quoteAcceptance: metrics.quoteAcceptance,
      averageResponseTime: metrics.averageResponseTime,
      averageApprovalTime: metrics.averageApprovalTime,
    },
    trend,
  }
}

function buildSubmissionAnalytics(rows = {}, bankId = '') {
  const applications = applicationsForBank(rows, bankId)
  const submitted = applications.filter(isSubmittedApplication)
  const acknowledged = applications.filter(isAcknowledgedApplication)
  const reviewed = applications.filter(isReviewedApplication)
  const approved = applications.filter(isApprovedApplication)
  const declined = applications.filter(isDeclinedApplication)
  const instructed = applications.filter(isInstructionApplication)
  const stages = [
    { key: 'submitted', label: 'Submitted', applications: submitted },
    { key: 'acknowledged', label: 'Acknowledged', applications: acknowledged },
    { key: 'reviewed', label: 'Reviewed', applications: reviewed },
    { key: 'approved', label: 'Approved', applications: approved },
    { key: 'declined', label: 'Declined', applications: declined },
    { key: 'instructed', label: 'Instructed', applications: instructed },
  ]
  return stages.map((stage, index) => {
    const previous = stages[index - 1]
    return {
      id: `${slugify(bankId)}-${stage.key}`,
      stage: stage.label,
      count: stage.applications.length,
      conversionRate: index === 0 ? 100 : percent(stage.applications.length, previous?.applications.length || submitted.length || applications.length),
      dropOff: index === 0 ? 0 : Math.max(0, (previous?.applications.length || 0) - stage.applications.length),
      averageDelay: average(stage.applications.map((row) => daysBetween(row.submittedAt || row.submitted_at || row.createdAt || row.created_at, row.updatedAt || row.updated_at || row.bankFeedbackAt || row.bank_feedback_at))),
    }
  })
}

function labelForBranch(rows = {}, branchId = '') {
  return getBranchName(rows.branches.find((branch) => getBranchId(branch) === branchId) || {}) || branchId || 'Branch'
}

function labelForRegion(rows = {}, regionId = '') {
  return getRegionName(rows.regions.find((region) => getRegionId(region) === regionId) || {}) || regionId || 'Region'
}

export function calculateBankRelationshipHealth(bankId = '', context = {}, options = {}) {
  const rows = getRows(context, options)
  assertBankDashboardAccess(rows)
  const health = buildHealth(rows, bankId)
  const previous = getLocalRows(LOCAL_HEALTH_SNAPSHOT_STORE, rows.workspaceKey).find((row) => row.bankId === health.bankId)
  if (!previous || previous.score !== health.score || previous.status !== health.status) {
    recordActivity(rows.workspaceKey, {
      eventType: BOND_BANK_RELATIONSHIP_EVENTS.bankHealthUpdated,
      sourceType: 'bank',
      sourceId: health.bankId,
      actorUserId: getActorId(context),
      previousValue: previous || null,
      newValue: health,
    })
    setLocalRows(LOCAL_HEALTH_SNAPSHOT_STORE, rows.workspaceKey, [
      { ...health, organisationId: rows.workspaceKey, updatedAt: new Date().toISOString() },
      ...getLocalRows(LOCAL_HEALTH_SNAPSHOT_STORE, rows.workspaceKey).filter((row) => row.bankId !== health.bankId),
    ])
  }
  return health
}

export function getBankScorecards(context = {}, options = {}) {
  const rows = getRows(context, options)
  assertBankDashboardAccess(rows)
  return rows.banks.map((bank) => buildScorecard(rows, bank)).sort((left, right) => right.healthScore - left.healthScore)
}

export function getBankDashboard(context = {}, options = {}) {
  const rows = getRows(context, options)
  assertBankDashboardAccess(rows)
  const scorecards = getBankScorecards(context, options)
  const submitted = rows.applications.filter(isSubmittedApplication)
  const approvals = rows.applications.filter(isApprovedApplication)
  const declines = rows.applications.filter(isDeclinedApplication)
  const instructions = rows.applications.filter(isInstructionApplication)
  const escalations = rows.escalations
  return {
    scope: rows.scope,
    summary: {
      applicationsSubmitted: submitted.length,
      approvals: approvals.length,
      declines: declines.length,
      approvalRate: percent(approvals.length, submitted.length || rows.applications.length),
      averageResponseTime: average(rows.applications.map(getApplicationResponseHours)),
      instructionsIssued: instructions.length,
      escalations: escalations.length,
      activeBanks: scorecards.filter((row) => row.applicationsSubmitted > 0 || row.status === 'active').length,
    },
    scorecards,
    rankings: getBankRankings(context, options),
    comparison: getBankComparison(context, options),
    declineAnalysis: getDeclineAnalysis(context, options),
    regionalPerformance: getRegionalBankPerformance(context, options),
  }
}

export function getBankRelationshipCommandCentre(context = {}, options = {}) {
  const rows = getRows(context, options)
  assertBankDashboardAccess(rows)
  const rawBankRows = rows.banks
    .map((bank) => buildCommandBankRow(rows, bank, options))
    .sort((left, right) => right.applications - left.applications || (right.healthScore || 0) - (left.healthScore || 0))
  const maxRevenue = Math.max(...rawBankRows.map((row) => Number(row.revenueGenerated || 0)), 0)
  const totalRevenue = rawBankRows.reduce((sum, row) => sum + Number(row.revenueGenerated || 0), 0)
  const bankRows = rawBankRows.map((row) => ({
    ...row,
    revenueShare: percent(row.revenueGenerated, totalRevenue),
    relationshipRankScore: calculateRelationshipRankScore(row, maxRevenue),
  }))
  const rankedRows = [...bankRows]
    .filter((row) => row.applications > 0)
    .sort((left, right) => (right.relationshipRankScore || 0) - (left.relationshipRankScore || 0) || (right.healthScore || 0) - (left.healthScore || 0))
  const regionalPerformance = getRegionalBankPerformance(context, options)
  const performanceMatrix = [...bankRows].sort((left, right) => right.applications - left.applications || left.bankName.localeCompare(right.bankName))
  const model = {
    scope: rows.scope,
    revenuePerBond: resolveRevenuePerBond(options),
    kpis: buildCommandKpis(rows, bankRows, options),
    leaderboard: {
      topBanks: rankedRows.slice(0, 3),
      otherBanks: rankedRows.slice(3, 8),
    },
    distribution: buildBankDistribution(bankRows),
    approvalFunnel: buildApprovalFunnel(rows),
    performanceMatrix,
    opportunityMatrix: buildBankOpportunityMatrix(performanceMatrix),
    regionalPerformance,
    regionalSlaHeatmap: buildRegionalSlaHeatmap(regionalPerformance, performanceMatrix),
    trends: buildTrendWidgets(rows, options),
    profiles: buildBankProfiles(rows, performanceMatrix).filter((profile) => profile.bankName !== 'Other'),
  }
  return {
    ...model,
    insights: buildBankRelationshipInsights(model),
  }
}

export function getBankWorkspace(bankId = '', context = {}, options = {}) {
  const rows = getRows(context, options)
  assertBankDashboardAccess(rows)
  const bank = findBank(rows, bankId)
  const applications = applicationsForBank(rows, bank.id)
  return {
    bank,
    scorecard: buildScorecard(rows, bank),
    health: calculateBankRelationshipHealth(bank.id, context, options),
    performance: getBankPerformance(bank.id, context, options),
    applications: applications.map((row) => ({
      id: getApplicationId(row),
      applicationId: getApplicationId(row),
      applicationReference: normalizeText(row.applicationReference || row.application_reference || getApplicationId(row)),
      consultantId: getApplicationConsultantId(row),
      consultantName: getApplicationConsultantName(row),
      branchId: getApplicationBranchId(row),
      branchName: normalizeText(row.branchName || row.branch_name || labelForBranch(rows, getApplicationBranchId(row))),
      regionId: getApplicationRegionId(row),
      status: normalizeText(row.status || row.financeStatus || row.finance_status || 'Active'),
      submittedAt: normalizeText(row.submittedAt || row.submitted_at),
      responseTime: getApplicationResponseHours(row),
      declineReason: isDeclinedApplication(row) ? getDeclineReason(row) : '',
    })),
    escalations: getBankEscalations(bank.id, context, options),
    contacts: getBankContacts(bank.id, context, options),
    feedback: getConsultantFeedback(bank.id, context, options),
    activity: getLocalRows(LOCAL_ACTIVITY_STORE, rows.workspaceKey).filter((row) => row.sourceId === bank.id || row.sourceType === 'bank'),
    tabs: ['Overview', 'Applications', 'Performance', 'Escalations', 'Contacts', 'Activity'],
  }
}

export function getBankPerformance(bankId = '', context = {}, options = {}) {
  const rows = getRows(context, options)
  assertBankDashboardAccess(rows)
  return buildPerformance(rows, bankId, options.now ? new Date(options.now) : new Date())
}

export function getBankRankings(context = {}, options = {}) {
  const rows = getRows(context, options)
  assertBankDashboardAccess(rows)
  const scorecards = rows.banks.map((bank) => buildScorecard(rows, bank))
  const by = (getter, direction = 'desc') => [...scorecards].sort((left, right) => direction === 'desc' ? getter(right) - getter(left) : getter(left) - getter(right))
  return {
    bestOverall: by((row) => row.healthScore).slice(0, 5),
    fastest: by((row) => row.averageResponseTime || 9999, 'asc').slice(0, 5),
    highestApproval: by((row) => row.approvalRate).slice(0, 5),
    mostImproved: by((row) => improvementScore(rows, row.bankId)).slice(0, 5),
    mostAtRisk: by((row) => row.healthScore, 'asc').slice(0, 5),
  }
}

function improvementScore(rows = {}, bankId = '') {
  const applications = applicationsForBank(rows, bankId)
  const now = new Date()
  const recent = applications.filter((row) => isWithinDays(row, 30, now))
  const older = applications.filter((row) => !isWithinDays(row, 30, now) && isWithinDays(row, 90, now))
  const recentRate = percent(recent.filter(isApprovedApplication).length, recent.filter(isSubmittedApplication).length || recent.length)
  const olderRate = percent(older.filter(isApprovedApplication).length, older.filter(isSubmittedApplication).length || older.length)
  return recentRate - olderRate
}

export function getBankComparison(context = {}, options = {}) {
  const rows = getRows(context, options)
  assertBankDashboardAccess(rows)
  return rows.banks.map((bank) => {
    const scorecard = buildScorecard(rows, bank)
    return {
      id: bank.id,
      bankId: bank.id,
      bankName: bank.name,
      applications: applicationsForBank(rows, bank.id).length,
      approvals: scorecard.approvals,
      approvalRate: scorecard.approvalRate,
      averageResponseTime: scorecard.averageResponseTime,
      instructionRate: scorecard.instructionRate,
      escalations: scorecard.escalations,
      healthScore: scorecard.healthScore,
      status: scorecard.relationshipHealth,
    }
  }).sort((left, right) => right.applications - left.applications)
}

export function getBankEscalations(bankId = '', context = {}, options = {}) {
  const rows = getRows(context, options)
  assertBankDashboardAccess(rows)
  const bank = findBank(rows, bankId)
  return escalationsForBank(rows, bank.id).map((row) => {
    const application = rows.applications.find((item) => getApplicationId(item) === row.applicationId) || {}
    return {
      ...row,
      application: normalizeText(application.applicationReference || application.application_reference || row.applicationId),
      consultantName: row.consultantName || getApplicationConsultantName(application),
      branchName: labelForBranch(rows, row.branchId || getApplicationBranchId(application)),
      age: daysBetween(row.createdAt, row.resolvedAt || new Date().toISOString()),
    }
  }).sort((left, right) => right.age - left.age)
}

export function createBankEscalation(payload = {}, context = {}, options = {}) {
  const rows = getRows(context, options)
  assertCanCreateEscalation(rows)
  const escalation = normalizeEscalation({ ...payload, createdBy: getActorId(context) }, rows.workspaceKey)
  setLocalRows(LOCAL_ESCALATION_STORE, rows.workspaceKey, [escalation, ...getLocalRows(LOCAL_ESCALATION_STORE, rows.workspaceKey)])
  recordActivity(rows.workspaceKey, {
    eventType: BOND_BANK_RELATIONSHIP_EVENTS.bankEscalationCreated,
    sourceType: 'bank',
    sourceId: escalation.bankId,
    actorUserId: getActorId(context),
    newValue: escalation,
  })
  return escalation
}

export function getBankContacts(bankId = '', context = {}, options = {}) {
  const rows = getRows(context, options)
  assertBankDashboardAccess(rows)
  return contactsForBank(rows, bankId).sort((left, right) => left.role.localeCompare(right.role))
}

export function createBankContact(payload = {}, context = {}, options = {}) {
  const rows = getRows(context, options)
  assertHQAccess(rows)
  const contact = normalizeContact({ ...payload, createdBy: getActorId(context) }, rows.workspaceKey)
  setLocalRows(LOCAL_CONTACT_STORE, rows.workspaceKey, [contact, ...getLocalRows(LOCAL_CONTACT_STORE, rows.workspaceKey)])
  recordActivity(rows.workspaceKey, {
    eventType: BOND_BANK_RELATIONSHIP_EVENTS.bankContactAdded,
    sourceType: 'bank',
    sourceId: contact.bankId,
    actorUserId: getActorId(context),
    newValue: contact,
  })
  return contact
}

export function updateBankContact(contactId = '', payload = {}, context = {}, options = {}) {
  const rows = getRows(context, options)
  assertHQAccess(rows)
  const current = getLocalRows(LOCAL_CONTACT_STORE, rows.workspaceKey)
  const existing = current.find((row) => row.id === contactId)
  if (!existing) {
    const error = new Error('Bank contact not found.')
    error.code = 'not_found'
    throw error
  }
  const updated = normalizeContact({ ...existing, ...payload, id: existing.id, updatedAt: new Date().toISOString() }, rows.workspaceKey)
  setLocalRows(LOCAL_CONTACT_STORE, rows.workspaceKey, current.map((row) => (row.id === contactId ? updated : row)))
  recordActivity(rows.workspaceKey, {
    eventType: BOND_BANK_RELATIONSHIP_EVENTS.bankContactUpdated,
    sourceType: 'bank',
    sourceId: updated.bankId,
    actorUserId: getActorId(context),
    previousValue: existing,
    newValue: updated,
  })
  return updated
}

export function getDeclineAnalysis(context = {}, options = {}) {
  const rows = getRows(context, options)
  assertBankDashboardAccess(rows)
  const declined = rows.applications.filter(isDeclinedApplication)
  return DECLINE_REASONS.map((reason) => {
    const applications = declined.filter((row) => getDeclineReason(row) === reason)
    const byBank = new Map()
    applications.forEach((application) => {
      getBankValuesForApplication(application).forEach((bankId) => {
        byBank.set(bankId, (byBank.get(bankId) || 0) + 1)
      })
    })
    const topBank = [...byBank.entries()].sort((left, right) => right[1] - left[1])[0]
    return {
      id: slugify(reason),
      reason,
      count: applications.length,
      trend: applications.filter((row) => isWithinDays(row, 30, options.now ? new Date(options.now) : new Date())).length > 0 ? 'Increasing' : 'Stable',
      affectedBank: topBank ? bankNameForId(topBank[0]) : 'None',
    }
  }).filter((row) => row.count > 0 || row.reason === 'Other')
}

export function getConsultantFeedback(bankId = '', context = {}, options = {}) {
  const rows = getRows(context, options)
  const safeId = slugify(bankId)
  if (rows.scope.scopeLevel === BOND_ORGANISATION_LEVELS.consultant && !applicationsForBank(rows, safeId).length) {
    const error = new Error('Consultants can only view or submit feedback for banks on their own applications.')
    error.code = 'permission_denied'
    throw error
  }
  return feedbackForBank(rows, safeId).sort((left, right) => normalizeText(right.createdAt).localeCompare(normalizeText(left.createdAt)))
}

export function createConsultantFeedback(bankId = '', payload = {}, context = {}, options = {}) {
  const rows = getRows(context, options)
  const safeId = slugify(bankId || payload.bankId || payload.bank_id)
  if (rows.scope.scopeLevel === BOND_ORGANISATION_LEVELS.consultant && !applicationsForBank(rows, safeId).length) {
    const error = new Error('Consultants can only submit feedback for banks on their own applications.')
    error.code = 'permission_denied'
    throw error
  }
  const feedback = normalizeFeedback({
    ...payload,
    bankId: safeId,
    consultantId: payload.consultantId || getActorId(context),
    createdBy: getActorId(context),
  }, rows.workspaceKey)
  setLocalRows(LOCAL_FEEDBACK_STORE, rows.workspaceKey, [feedback, ...getLocalRows(LOCAL_FEEDBACK_STORE, rows.workspaceKey)])
  recordActivity(rows.workspaceKey, {
    eventType: BOND_BANK_RELATIONSHIP_EVENTS.bankFeedbackAdded,
    sourceType: 'bank',
    sourceId: feedback.bankId,
    actorUserId: getActorId(context),
    newValue: feedback,
  })
  return feedback
}

export function getRegionalBankPerformance(context = {}, options = {}) {
  const rows = getRows(context, options)
  assertBankDashboardAccess(rows)
  const regionIds = rows.scope.scopeLevel === BOND_ORGANISATION_LEVELS.region ? normalizeArray(rows.scope.regionIds) : rows.regions.map(getRegionId)
  return regionIds.flatMap((regionId) => {
    const regionApplications = rows.applications.filter((row) => getApplicationRegionId(row) === regionId)
    const regionRows = { ...rows, applications: regionApplications, escalations: rows.escalations.filter((row) => row.regionId === regionId), feedback: rows.feedback.filter((row) => row.regionId === regionId) }
    return rows.banks.map((bank) => {
      const metrics = bankMetrics(regionRows, bank.id)
      return {
        id: `${regionId}-${bank.id}`,
        regionId,
        regionName: labelForRegion(rows, regionId),
        bankId: bank.id,
        bankName: bank.name,
        applications: applicationsForBank(regionRows, bank.id).length,
        approvals: metrics.approvalCount,
        approvalRate: metrics.approvalRate,
        responseTime: metrics.averageResponseTime,
        healthScore: buildHealth(regionRows, bank.id).score,
        relationshipRisk: buildHealth(regionRows, bank.id).status,
      }
    })
  }).filter((row) => row.applications > 0)
}

export function getBranchBankPerformance(context = {}, options = {}) {
  const rows = getRows(context, options)
  assertBankDashboardAccess(rows)
  return rows.branches.flatMap((branch) => {
    const branchId = getBranchId(branch)
    const branchRows = {
      ...rows,
      applications: rows.applications.filter((row) => getApplicationBranchId(row) === branchId),
      escalations: rows.escalations.filter((row) => row.branchId === branchId),
      feedback: rows.feedback.filter((row) => row.branchId === branchId),
    }
    return rows.banks.map((bank) => {
      const metrics = bankMetrics(branchRows, bank.id)
      return {
        id: `${branchId}-${bank.id}`,
        branchId,
        branchName: getBranchName(branch),
        bankId: bank.id,
        bankName: bank.name,
        applications: applicationsForBank(branchRows, bank.id).length,
        approvals: metrics.approvalCount,
        approvalRate: metrics.approvalRate,
        responseTime: metrics.averageResponseTime,
      }
    })
  }).filter((row) => row.applications > 0)
}

export function getBankSubmissionAnalytics(bankId = '', context = {}, options = {}) {
  const rows = getRows(context, options)
  assertBankDashboardAccess(rows)
  return buildSubmissionAnalytics(rows, bankId)
}

export const __bondBankRelationshipServiceTestUtils = Object.freeze({
  clearStores() {
    LOCAL_BANK_STORE.clear()
    LOCAL_CONTACT_STORE.clear()
    LOCAL_ESCALATION_STORE.clear()
    LOCAL_FEEDBACK_STORE.clear()
    LOCAL_HEALTH_SNAPSHOT_STORE.clear()
    LOCAL_ACTIVITY_STORE.clear()
    localSequence = 0
  },
  seedBanks(workspaceId = '', rows = []) {
    setLocalRows(LOCAL_BANK_STORE, normalizeText(workspaceId || 'default'), rows.map((row) => normalizeBank(row, workspaceId)))
  },
  seedContacts(workspaceId = '', rows = []) {
    setLocalRows(LOCAL_CONTACT_STORE, normalizeText(workspaceId || 'default'), rows.map((row) => normalizeContact(row, workspaceId)))
  },
  seedEscalations(workspaceId = '', rows = []) {
    setLocalRows(LOCAL_ESCALATION_STORE, normalizeText(workspaceId || 'default'), rows.map((row) => normalizeEscalation(row, workspaceId)))
  },
  seedFeedback(workspaceId = '', rows = []) {
    setLocalRows(LOCAL_FEEDBACK_STORE, normalizeText(workspaceId || 'default'), rows.map((row) => normalizeFeedback(row, workspaceId)))
  },
  getActivity(workspaceId = '') {
    return getLocalRows(LOCAL_ACTIVITY_STORE, normalizeText(workspaceId || 'default'))
  },
  getHealthSnapshots(workspaceId = '') {
    return getLocalRows(LOCAL_HEALTH_SNAPSHOT_STORE, normalizeText(workspaceId || 'default'))
  },
})
