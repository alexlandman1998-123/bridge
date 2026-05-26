import { resolvePermissionContext } from '../auth/permissions/permissionResolver'
import { BOND_SCOPE_LEVELS } from '../constants/workspaceUnits'
import {
  canViewFinanceWorkflow,
  resolveFinanceWorkflowOwners,
} from './bondFinanceWorkflowOwnershipService'

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
  return {
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
