import { resolvePermissionContext } from '../auth/permissions/permissionResolver'
import { BOND_SCOPE_LEVELS } from '../constants/workspaceUnits'
import {
  canViewFinanceWorkflow,
  resolveFinanceWorkflowOwners,
} from './bondFinanceWorkflowOwnershipService'
import {
  BOND_INTAKE_STATUS_LABELS,
  BOND_INTAKE_STATUSES,
  getBondApplicationProgress,
  getBondIntakeSummary,
} from '../core/transactions/bondIntakeSelectors'
import { financeTypeShortLabel } from '../core/transactions/financeType'
import { getFinanceReadinessSummary } from '../core/finance/financeReadinessSelectors'
import {
  calculateApprovalProbability,
  calculateOperationalRisk,
  calculateTransactionVelocity,
  generateFinanceInsights,
} from './financeIntelligenceService'

export const BOND_OPERATIONAL_QUEUE_KEYS = Object.freeze({
  NEW_APPLICATIONS: 'new_applications',
})

const NEW_APPLICATION_INTAKE_STATUSES = new Set([
  BOND_INTAKE_STATUSES.AWAITING_BUYER_APPLICATION,
  BOND_INTAKE_STATUSES.BUYER_IN_PROGRESS,
  BOND_INTAKE_STATUSES.AWAITING_DOCUMENTS,
  BOND_INTAKE_STATUSES.READY_FOR_REVIEW,
])

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeBool(value) {
  return Boolean(value)
}

function normalizeNumber(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function toIso(value) {
  const raw = normalizeText(value)
  if (!raw) return null
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString()
}

function getTimestamp(value) {
  const date = new Date(value || 0)
  return Number.isNaN(date.getTime()) ? 0 : date.getTime()
}

function getAgeLabel(value) {
  const timestamp = getTimestamp(value)
  if (!timestamp) return 'Date pending'
  const days = Math.max(0, Math.floor((Date.now() - timestamp) / (24 * 60 * 60 * 1000)))
  if (days === 0) return 'Today'
  if (days === 1) return '1 day ago'
  return `${days} days ago`
}

function isOverdueTransaction(transaction = {}) {
  const explicit = transaction.overdue
  if (explicit === true || explicit === false) return explicit
  const dueDate = toIso(
    transaction.due_at ||
      transaction.dueAt ||
      transaction.next_action_due_at ||
      transaction.nextActionDueAt ||
      transaction.finance_due_at ||
      transaction.financeDueAt,
  )
  if (!dueDate) return false
  return new Date(dueDate).getTime() < Date.now()
}

function normalizeQueueItem(transaction = {}, owners = {}, source = 'canonical') {
  return {
    transactionId: normalizeText(transaction.id || transaction.transaction_id),
    applicationReference:
      normalizeText(transaction.transaction_reference || transaction.application_reference || transaction.reference) || null,
    clientName:
      normalizeText(transaction.client_name || transaction.clientName || transaction.buyer_name || transaction.buyerName) || null,
    propertyName:
      normalizeText(
        transaction.property_name ||
          transaction.propertyName ||
          transaction.property_address_line_1 ||
          transaction.propertyAddressLine1,
      ) || null,
    stage: normalizeText(transaction.current_main_stage || transaction.main_stage || transaction.stage) || null,
    financeStatus:
      normalizeText(
        transaction.finance_status ||
          transaction.financeStatus ||
          transaction.bond_assignment_status ||
          transaction.current_sub_stage_summary,
      ) || null,
    bondWorkspaceId: owners.bondWorkspaceId || null,
    bondRegionId: owners.bondRegionId || null,
    bondWorkspaceUnitId: owners.bondWorkspaceUnitId || null,
    primaryConsultantUserId: owners.primaryConsultantUserId || null,
    processorUserId: owners.processorUserId || null,
    managerUserId: owners.managerUserId || null,
    complianceUserId: owners.complianceUserId || null,
    nextAction:
      normalizeText(transaction.next_action || transaction.nextAction) || null,
    blockerReason:
      normalizeText(transaction.blocker_reason || transaction.blockerReason || transaction.finance_blocker_reason || transaction.financeBlockerReason) || null,
    overdue: isOverdueTransaction(transaction),
    lastUpdatedAt:
      toIso(transaction.updated_at || transaction.updatedAt || transaction.last_updated_at || transaction.lastUpdatedAt),
    source,
  }
}

function getBuyerName(row = {}) {
  return (
    normalizeText(row?.buyer?.name) ||
    normalizeText(row?.transaction?.buyer_name || row?.transaction?.buyerName) ||
    normalizeText(row?.transaction?.client_name || row?.transaction?.clientName) ||
    'Buyer pending'
  )
}

function getDevelopmentName(row = {}) {
  return normalizeText(row?.development?.name || row?.transaction?.development_name || row?.transaction?.developmentName) || 'Development pending'
}

function getPropertyLabel(row = {}) {
  const unitNumber = normalizeText(row?.unit?.unit_number || row?.transaction?.unit_number || row?.transaction?.unitNumber)
  const developmentName = getDevelopmentName(row)
  const privateProperty = normalizeText(
    row?.transaction?.property_description ||
      row?.transaction?.property_address_line_1 ||
      [row?.transaction?.suburb, row?.transaction?.city].map(normalizeText).filter(Boolean).join(', '),
  )
  if (unitNumber) return `Unit ${unitNumber}`
  return privateProperty || developmentName || 'Property pending'
}

function getAgentName(row = {}) {
  return (
    normalizeText(row?.transaction?.assigned_agent || row?.transaction?.assignedAgent) ||
    normalizeText(row?.transaction?.assigned_agent_email || row?.transaction?.assignedAgentEmail) ||
    'Source agent pending'
  )
}

function looksLikeInternalIdentifier(value = '') {
  const normalized = normalizeText(value).toLowerCase()
  return (
    !normalized ||
    normalized.includes('@bridge.internal') ||
    /^organisation-[0-9a-f-]+/.test(normalized) ||
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)
  )
}

function getRolePlayers(row = {}) {
  if (Array.isArray(row.rolePlayers)) return row.rolePlayers
  if (Array.isArray(row.transactionRolePlayers)) return row.transactionRolePlayers
  if (Array.isArray(row.transaction_role_players)) return row.transaction_role_players
  if (Array.isArray(row?.transaction?.rolePlayers)) return row.transaction.rolePlayers
  if (Array.isArray(row?.transaction?.transactionRolePlayers)) return row.transaction.transactionRolePlayers
  if (Array.isArray(row?.transaction?.transaction_role_players)) return row.transaction.transaction_role_players
  return []
}

function getPreferredOriginatorName(row = {}) {
  const transaction = row?.transaction || {}
  const rolePlayer = getRolePlayers(row).find((item) => {
    const role = normalizeText(item?.role_type || item?.roleType || item?.role || item?.participant_role || item?.participantRole).toLowerCase()
    return role === 'bond_originator' || role === 'bond originator'
  })
  const candidates = [
    rolePlayer?.display_name,
    rolePlayer?.displayName,
    rolePlayer?.name,
    rolePlayer?.full_name,
    rolePlayer?.fullName,
    rolePlayer?.partner_name,
    rolePlayer?.partnerName,
    rolePlayer?.contact_person,
    rolePlayer?.contactPerson,
    rolePlayer?.organisation_name,
    rolePlayer?.organisationName,
    transaction.preferred_bond_originator_name,
    transaction.preferredBondOriginatorName,
    transaction.bond_originator,
    transaction.bondOriginator,
  ]
  const displayName = candidates.map(normalizeText).find((value) => value && !looksLikeInternalIdentifier(value))
  return displayName || 'Unassigned originator'
}

function getBondIntakeInput(row = {}) {
  return {
    transaction: row?.transaction || row || {},
    onboardingFormData:
      row?.onboardingFormData ||
      row?.onboarding_form_data ||
      row?.onboarding?.formData ||
      row?.onboarding?.form_data ||
      null,
    documentRequests: row?.documentRequests || row?.document_requests || [],
    documents: row?.documents || [],
    rolePlayers: getRolePlayers(row),
    currentOrganisationId: row?.transaction?.bond_workspace_id || row?.transaction?.organisation_id || null,
  }
}

function getIntakeHref(row = {}) {
  const transactionId = normalizeText(row?.transaction?.id)
  if (transactionId) return `/transactions/${transactionId}`
  const unitId = normalizeText(row?.unit?.id)
  if (unitId) return `/units/${unitId}`
  return '/bond/pipeline'
}

function normalizeToneForUi(tone = '') {
  if (tone === 'success') return 'emerald'
  if (tone === 'danger') return 'rose'
  if (tone === 'warning') return 'amber'
  if (tone === 'muted') return 'slate'
  return 'neutral'
}

export function buildBondNewApplicationViewModel(row = {}) {
  const intakeInput = getBondIntakeInput(row)
  const intakeSummary = getBondIntakeSummary(intakeInput)
  const applicationProgress = getBondApplicationProgress(intakeInput)
  const documentReadiness = intakeSummary.documentReadiness
  const transaction = row?.transaction || row || {}
  const financeReadiness = getFinanceReadinessSummary(row)
  const approvalConfidence = calculateApprovalProbability(row)
  const operationalRisk = calculateOperationalRisk(row)
  const velocity = calculateTransactionVelocity(row)
  const financeInsights = generateFinanceInsights(row)

  return {
    id: normalizeText(transaction.id || row?.unit?.id || row?.buyer?.id) || `${getBuyerName(row)}-${getPropertyLabel(row)}`,
    transactionId: normalizeText(transaction.id) || null,
    buyerName: getBuyerName(row),
    propertyLabel: getPropertyLabel(row),
    developmentName: getDevelopmentName(row),
    agentName: getAgentName(row),
    financeType: financeTypeShortLabel(transaction.finance_type || transaction.financeType),
    preferredOriginatorName: getPreferredOriginatorName(row),
    intakeStatus: intakeSummary.intakeStatus,
    intakeLabel: intakeSummary.readinessLabel,
    intakeTone: intakeSummary.readinessTone,
    intakeUiTone: normalizeToneForUi(intakeSummary.readinessTone),
    bondApplicationStatus: applicationProgress.status,
    bondApplicationSubmittedAt: applicationProgress.submittedAt,
    documentRequiredCount: documentReadiness.requiredCount,
    documentUploadedCount: documentReadiness.uploadedCount,
    documentMissingCount: documentReadiness.missingCount,
    missingDocumentLabels: documentReadiness.missingLabels,
    financeReadinessScore: financeReadiness.readinessScore?.score || 0,
    financeReadinessLabel: financeReadiness.readinessScore?.label || 'Incomplete',
    financeReadinessTone: financeReadiness.readinessScore?.tone || 'neutral',
    affordabilityEstimate: financeReadiness.affordabilityEstimate,
    repaymentEstimate: financeReadiness.repaymentEstimate,
    depositStrength: financeReadiness.depositStrength,
    financeRiskFlags: financeReadiness.riskFlags || [],
    financeMissingItems: financeReadiness.missingItems || [],
    financeNextRecommendedAction: financeReadiness.nextRecommendedAction,
    financeReadinessDisclaimer: financeReadiness.disclaimer,
    approvalConfidence,
    operationalRisk,
    velocity,
    financeInsights,
    transactionConfidence: Math.round((approvalConfidence.score * 0.55) + ((100 - operationalRisk.riskScore) * 0.25) + (velocity.velocityScore * 0.2)),
    canAccept: intakeSummary.canAccept,
    ageLabel: getAgeLabel(applicationProgress.submittedAt || applicationProgress.startedAt || transaction.created_at || transaction.updated_at),
    href: getIntakeHref(row),
    sourceRow: row,
  }
}

export function isNewBondApplicationRow(row = {}) {
  const intakeSummary = getBondIntakeSummary(getBondIntakeInput(row))
  return NEW_APPLICATION_INTAKE_STATUSES.has(intakeSummary.intakeStatus)
}

export function getNewApplicationsQueue(rows = []) {
  return (Array.isArray(rows) ? rows : [])
    .filter(isNewBondApplicationRow)
    .map(buildBondNewApplicationViewModel)
}

function getQueueRowTransaction(row = {}) {
  return row?.transaction && typeof row.transaction === 'object' ? row.transaction : row
}

export function getVisibleNewApplicationsQueue(user = {}, rows = []) {
  return (Array.isArray(rows) ? rows : [])
    .filter((row) => canViewFinanceWorkflow(user, getQueueRowTransaction(row)))
    .filter(isNewBondApplicationRow)
    .map(buildBondNewApplicationViewModel)
}

function hasMissingDocuments(transaction = {}) {
  return (
    normalizeBool(transaction.documents_missing) ||
    normalizeBool(transaction.required_documents_missing) ||
    normalizeBool(transaction.finance_documents_missing) ||
    normalizeNumber(transaction.missing_documents_count || transaction.missingDocumentsCount, 0) > 0 ||
    normalizeText(transaction.finance_status).toLowerCase().includes('document')
  )
}

function hasBankFeedbackWork(transaction = {}) {
  const status = normalizeText(transaction.bank_feedback_status || transaction.bankFeedbackStatus).toLowerCase()
  return (
    normalizeBool(transaction.bank_feedback_pending) ||
    ['pending', 'received', 'action_required', 'needs_action'].includes(status)
  )
}

function isSubmissionReady(transaction = {}) {
  const docsComplete =
    normalizeBool(transaction.documents_complete) ||
    normalizeBool(transaction.finance_documents_complete) ||
    normalizeNumber(transaction.missing_documents_count || transaction.missingDocumentsCount, 0) === 0
  const prepared =
    normalizeBool(transaction.application_prepared) ||
    normalizeText(transaction.finance_status).toLowerCase().includes('prepared')
  const submitted =
    normalizeBool(transaction.submitted_to_banks) ||
    normalizeText(transaction.finance_status).toLowerCase().includes('submitted')
  return docsComplete && prepared && !submitted
}

function needsComplianceReview(transaction = {}, owners = {}) {
  const status = normalizeText(
    transaction.compliance_status ||
      transaction.complianceStatus ||
      transaction.finance_status,
  ).toLowerCase()
  if (normalizeBool(transaction.compliance_review_required)) return true
  if (['pending_review', 'review_required', 'needs_review'].includes(status)) return true
  return Boolean(owners.complianceUserId)
}

function needsManagerEscalation(transaction = {}) {
  return (
    normalizeBool(transaction.escalation_required) ||
    normalizeBool(transaction.blocked) ||
    isOverdueTransaction(transaction) ||
    ['blocked', 'stalled', 'escalated'].includes(normalizeText(transaction.finance_status).toLowerCase())
  )
}

function canSeeTeamProcessorQueue(userContext = {}, owners = {}, transaction = {}) {
  const scopeLevel = normalizeText(userContext.scopeLevelRaw || userContext.scopeLevel)
  if (scopeLevel !== BOND_SCOPE_LEVELS.team) return false
  const unitId = normalizeText(userContext.workspaceUnitId)
  if (!unitId) return false
  const transactionUnitId = normalizeText(
    owners.bondWorkspaceUnitId ||
      transaction.bond_workspace_unit_id ||
      transaction.workspace_unit_id ||
      transaction.branch_id ||
      transaction.team_id,
  )
  return Boolean(transactionUnitId && transactionUnitId === unitId)
}

function filterVisibleTransactions(user = {}, transactions = []) {
  return (Array.isArray(transactions) ? transactions : []).filter((transaction) =>
    canViewFinanceWorkflow(user, transaction),
  )
}

function createQueueItems(user = {}, transactions = [], predicate = () => false, sourceLabel = 'canonical') {
  const visible = filterVisibleTransactions(user, transactions)
  return visible
    .map((transaction) => {
      const owners = resolveFinanceWorkflowOwners(transaction)
      return { transaction, owners, item: normalizeQueueItem(transaction, owners, sourceLabel) }
    })
    .filter(({ transaction, owners, item }) => predicate({ transaction, owners, item }))
    .map(({ item }) => item)
}

export function getMyApplicationsQueue(user = {}, transactions = []) {
  const resolved = resolvePermissionContext(user || {})
  const userId = normalizeText(resolved.userId)
  return createQueueItems(
    user,
    transactions,
    ({ owners }) => normalizeText(owners.primaryConsultantUserId) === userId,
    'my_applications',
  )
}

export function getProcessingQueue(user = {}, transactions = []) {
  const resolved = resolvePermissionContext(user || {})
  const userId = normalizeText(resolved.userId)
  return createQueueItems(
    user,
    transactions,
    ({ transaction, owners }) =>
      normalizeText(owners.processorUserId) === userId ||
      canSeeTeamProcessorQueue(resolved, owners, transaction),
    'processing_queue',
  )
}

export function getMissingDocumentsQueue(user = {}, transactions = []) {
  return createQueueItems(
    user,
    transactions,
    ({ transaction }) => hasMissingDocuments(transaction),
    'missing_documents',
  )
}

export function getBankFeedbackQueue(user = {}, transactions = []) {
  return createQueueItems(
    user,
    transactions,
    ({ transaction }) => hasBankFeedbackWork(transaction),
    'bank_feedback',
  )
}

export function getSubmissionReadinessQueue(user = {}, transactions = []) {
  return createQueueItems(
    user,
    transactions,
    ({ transaction }) => isSubmissionReady(transaction),
    'submission_readiness',
  )
}

export function getOverdueApplicationsQueue(user = {}, transactions = []) {
  return createQueueItems(
    user,
    transactions,
    ({ item }) => item.overdue,
    'overdue_applications',
  )
}

export function getComplianceReviewQueue(user = {}, transactions = []) {
  const resolved = resolvePermissionContext(user || {})
  const userId = normalizeText(resolved.userId)
  const isHqComplianceScope =
    normalizeText(resolved.scopeLevel) === BOND_SCOPE_LEVELS.workspaceHq &&
    normalizeText(resolved.workspaceRole) === 'compliance'
  return createQueueItems(
    user,
    transactions,
    ({ transaction, owners }) =>
      needsComplianceReview(transaction, owners) &&
      (isHqComplianceScope || normalizeText(owners.complianceUserId) === userId),
    'compliance_review',
  )
}

export function getManagerEscalationsQueue(user = {}, transactions = []) {
  return createQueueItems(
    user,
    transactions,
    ({ transaction }) => needsManagerEscalation(transaction),
    'manager_escalations',
  )
}

export function resolveBondOperationalQueues(user = {}, transactions = []) {
  const transactionRows = (Array.isArray(transactions) ? transactions : []).map((transaction) => ({ transaction }))
  return {
    [BOND_OPERATIONAL_QUEUE_KEYS.NEW_APPLICATIONS]: getVisibleNewApplicationsQueue(user, transactionRows),
    my_applications: getMyApplicationsQueue(user, transactions),
    processing_queue: getProcessingQueue(user, transactions),
    missing_documents: getMissingDocumentsQueue(user, transactions),
    bank_feedback: getBankFeedbackQueue(user, transactions),
    submission_readiness: getSubmissionReadinessQueue(user, transactions),
    overdue_applications: getOverdueApplicationsQueue(user, transactions),
    compliance_review: getComplianceReviewQueue(user, transactions),
    manager_escalations: getManagerEscalationsQueue(user, transactions),
  }
}
