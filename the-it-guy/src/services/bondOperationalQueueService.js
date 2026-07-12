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
import {
  getBondHybridFinanceStageLabel,
  normalizeBondHybridFinanceStage,
} from '../core/transactions/bondHybridFinanceWorkflow'
import {
  financeTypeShortLabel,
  isBondFinanceType,
  normalizeFinanceType,
} from '../core/transactions/financeType'
import {
  buildFinanceReadinessHandoffPacket,
  getFinanceReadinessSummary,
} from '../core/finance/financeReadinessSelectors'
import {
  calculateApprovalProbability,
  calculateOperationalRisk,
  calculateTransactionVelocity,
  generateFinanceInsights,
  getReadinessOutcomeCalibrationForRow,
} from './financeIntelligenceService'

export const BOND_OPERATIONAL_QUEUE_KEYS = Object.freeze({
  NEW_APPLICATIONS: 'new_applications',
  AWAITING_BANK_FEEDBACK: 'awaiting_bank_feedback',
  ADDITIONAL_DOCUMENTS_REQUIRED: 'additional_documents_required',
  AWAITING_BUYER_REUPLOAD: 'awaiting_buyer_reupload',
  AWAITING_GRANT: 'awaiting_grant',
  AWAITING_GRANT_DOCUMENT: 'awaiting_grant_document',
  GRANT_RECEIVED: 'grant_received',
  AWAITING_SIGNED_GRANT: 'awaiting_signed_grant',
  GRANT_SIGNED: 'grant_signed',
  READY_FOR_INSTRUCTION: 'ready_for_instruction',
  INSTRUCTION_SENT: 'instruction_sent',
  INSTRUCTION_SENT_AWAITING_ATTORNEY_ACCEPTANCE: 'instruction_sent_awaiting_attorney_acceptance',
  ACTIVE_REVIEW_REQUIRED: 'active_review_required',
})

export const BOND_OPERATIONAL_WAIT_STATES = Object.freeze({
  AWAITING_BANK_FEEDBACK: 'awaiting_bank_feedback',
  ADDITIONAL_DOCUMENTS_REQUIRED: 'additional_documents_required',
  AWAITING_BUYER_REUPLOAD: 'awaiting_buyer_reupload',
  AWAITING_GRANT_DOCUMENT: 'awaiting_grant_document',
  AWAITING_SIGNED_GRANT: 'awaiting_signed_grant',
  INSTRUCTION_SENT_AWAITING_ATTORNEY_ACCEPTANCE: 'instruction_sent_awaiting_attorney_acceptance',
  ACTIVE_REVIEW_REQUIRED: 'active_review_required',
  COMPLETE: 'complete',
  DECLINED: 'declined',
  ARCHIVED: 'archived',
})

const NEW_APPLICATION_INTAKE_STATUSES = new Set([
  BOND_INTAKE_STATUSES.AWAITING_OTP,
  BOND_INTAKE_STATUSES.READY_TO_START,
  BOND_INTAKE_STATUSES.APPLICATION_IN_PROGRESS,
  BOND_INTAKE_STATUSES.APPLICATION_SUBMITTED,
  BOND_INTAKE_STATUSES.READY_FOR_REVIEW,
])

const APPLICATION_INTAKE_STATUSES = new Set([
  BOND_INTAKE_STATUSES.ACCEPTED,
  BOND_INTAKE_STATUSES.APPLICATIONS_SUBMITTED_TO_BANKS,
  BOND_INTAKE_STATUSES.BANK_FEEDBACK_RECEIVED,
  BOND_INTAKE_STATUSES.QUOTE_ACCEPTED,
  BOND_INTAKE_STATUSES.INSTRUCTION_SENT,
])

const WAIT_STATE_QUEUE_KEYS = Object.freeze({
  [BOND_OPERATIONAL_WAIT_STATES.AWAITING_BANK_FEEDBACK]: BOND_OPERATIONAL_QUEUE_KEYS.AWAITING_BANK_FEEDBACK,
  [BOND_OPERATIONAL_WAIT_STATES.ADDITIONAL_DOCUMENTS_REQUIRED]: BOND_OPERATIONAL_QUEUE_KEYS.ADDITIONAL_DOCUMENTS_REQUIRED,
  [BOND_OPERATIONAL_WAIT_STATES.AWAITING_BUYER_REUPLOAD]: BOND_OPERATIONAL_QUEUE_KEYS.AWAITING_BUYER_REUPLOAD,
  [BOND_OPERATIONAL_WAIT_STATES.AWAITING_GRANT_DOCUMENT]: BOND_OPERATIONAL_QUEUE_KEYS.AWAITING_GRANT_DOCUMENT,
  [BOND_OPERATIONAL_WAIT_STATES.AWAITING_SIGNED_GRANT]: BOND_OPERATIONAL_QUEUE_KEYS.AWAITING_SIGNED_GRANT,
  [BOND_OPERATIONAL_WAIT_STATES.INSTRUCTION_SENT_AWAITING_ATTORNEY_ACCEPTANCE]: BOND_OPERATIONAL_QUEUE_KEYS.INSTRUCTION_SENT_AWAITING_ATTORNEY_ACCEPTANCE,
  [BOND_OPERATIONAL_WAIT_STATES.ACTIVE_REVIEW_REQUIRED]: BOND_OPERATIONAL_QUEUE_KEYS.ACTIVE_REVIEW_REQUIRED,
})

const EXTERNAL_WAIT_STATES = new Set([
  BOND_OPERATIONAL_WAIT_STATES.AWAITING_BANK_FEEDBACK,
  BOND_OPERATIONAL_WAIT_STATES.ADDITIONAL_DOCUMENTS_REQUIRED,
  BOND_OPERATIONAL_WAIT_STATES.AWAITING_BUYER_REUPLOAD,
  BOND_OPERATIONAL_WAIT_STATES.AWAITING_GRANT_DOCUMENT,
  BOND_OPERATIONAL_WAIT_STATES.AWAITING_SIGNED_GRANT,
  BOND_OPERATIONAL_WAIT_STATES.INSTRUCTION_SENT_AWAITING_ATTORNEY_ACCEPTANCE,
])

const ACTIVE_ATTORNEY_ASSIGNMENT_STATUSES = new Set([
  '',
  'accepted',
  'active',
  'assigned',
  'confirmed',
  'in_progress',
  'instruction_accepted',
  'received',
])

const INACTIVE_ATTORNEY_ASSIGNMENT_STATUSES = new Set([
  'cancelled',
  'canceled',
  'declined',
  'inactive',
  'removed',
  'rejected',
])

const REVIEW_PICKED_UP_EVENT_TYPES = new Set([
  'BOND_APPLICATION_ACCEPTED',
  'BOND_APPLICATION_ASSIGNED',
  'BOND_APPLICATION_REVIEW_OPENED',
  'BOND_APPLICATION_REVIEW_STARTED',
])

const CURRENCY = new Intl.NumberFormat('en-ZA', {
  style: 'currency',
  currency: 'ZAR',
  maximumFractionDigits: 0,
})

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase()
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

function getQueueRecordTransaction(record = {}) {
  return record?.transaction && typeof record.transaction === 'object' ? record.transaction : record
}

function getFirstArrayItem(value) {
  return Array.isArray(value) ? value.find(Boolean) || null : value || null
}

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function compactRecords(candidates = []) {
  const records = []
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      records.push(...candidate.filter(isPlainObject))
    } else if (isPlainObject(candidate)) {
      records.push(candidate)
    }
  }
  return records
}

function readFirstText(sources = [], fields = []) {
  for (const source of sources) {
    for (const field of fields) {
      const value = normalizeText(source?.[field])
      if (value) return value
    }
  }
  return ''
}

function readFirstBool(sources = [], fields = []) {
  for (const source of sources) {
    for (const field of fields) {
      if (source?.[field] === true) return true
    }
  }
  return false
}

function getBondApplications(record = {}) {
  const transaction = getQueueRecordTransaction(record)
  const workflowData = getCanonicalBondFinanceWorkflow(record) || {}
  return compactRecords([
    record.bondApplications,
    record.bond_applications,
    record.transactionBondApplications,
    record.transaction_bond_applications,
    record.bondApplication,
    record.bond_application,
    transaction.bondApplications,
    transaction.bond_applications,
    transaction.transactionBondApplications,
    transaction.transaction_bond_applications,
    transaction.bondApplication,
    transaction.bond_application,
    workflowData.applications,
    workflowData.bondApplications,
    workflowData.bond_applications,
    workflowData.transactionBondApplications,
    workflowData.transaction_bond_applications,
  ])
}

function getBondQuotes(record = {}) {
  const transaction = getQueueRecordTransaction(record)
  const workflowData = getCanonicalBondFinanceWorkflow(record) || {}
  return compactRecords([
    record.bondQuotes,
    record.bond_quotes,
    record.transactionBondQuotes,
    record.transaction_bond_quotes,
    record.quote,
    transaction.bondQuotes,
    transaction.bond_quotes,
    transaction.transactionBondQuotes,
    transaction.transaction_bond_quotes,
    transaction.quote,
    workflowData.quotes,
    workflowData.bondQuotes,
    workflowData.bond_quotes,
    workflowData.transactionBondQuotes,
    workflowData.transaction_bond_quotes,
  ])
}

function getBondInstruction(record = {}) {
  const transaction = getQueueRecordTransaction(record)
  const workflowData = getCanonicalBondFinanceWorkflow(record) || {}
  return getFirstArrayItem([
    record.bondInstruction,
    record.bond_instruction,
    record.transactionBondInstruction,
    record.transaction_bond_instruction,
    getFirstArrayItem(record.transactionBondInstructions),
    getFirstArrayItem(record.transaction_bond_instructions),
    transaction.bondInstruction,
    transaction.bond_instruction,
    transaction.transactionBondInstruction,
    transaction.transaction_bond_instruction,
    getFirstArrayItem(transaction.transactionBondInstructions),
    getFirstArrayItem(transaction.transaction_bond_instructions),
    workflowData.instruction,
    workflowData.bondInstruction,
    workflowData.bond_instruction,
  ].filter(Boolean))
}

function getDocumentLikeRecords(record = {}) {
  const transaction = getQueueRecordTransaction(record)
  return compactRecords([
    record.documents,
    record.transactionDocuments,
    record.transaction_documents,
    record.documentRequests,
    record.document_requests,
    record.requiredDocuments,
    record.required_documents,
    record.transactionRequiredDocuments,
    record.transaction_required_documents,
    transaction.documents,
    transaction.transactionDocuments,
    transaction.transaction_documents,
    transaction.documentRequests,
    transaction.document_requests,
    transaction.requiredDocuments,
    transaction.required_documents,
    transaction.transactionRequiredDocuments,
    transaction.transaction_required_documents,
  ])
}

function getAttorneyAssignments(record = {}) {
  const transaction = getQueueRecordTransaction(record)
  return compactRecords([
    record.attorneyAssignments,
    record.attorney_assignments,
    record.transactionAttorneyAssignments,
    record.transaction_attorney_assignments,
    transaction.attorneyAssignments,
    transaction.attorney_assignments,
    transaction.transactionAttorneyAssignments,
    transaction.transaction_attorney_assignments,
  ])
}

function latestRecord(records = []) {
  return [...records].sort((left, right) => {
    const leftTimestamp = getTimestamp(left.updated_at || left.updatedAt || left.submitted_at || left.submittedAt || left.created_at || left.createdAt)
    const rightTimestamp = getTimestamp(right.updated_at || right.updatedAt || right.submitted_at || right.submittedAt || right.created_at || right.createdAt)
    return rightTimestamp - leftTimestamp
  })[0] || null
}

function normalizeBondApplicationStatus(value = '') {
  const normalized = normalizeLower(value).replace(/[\s-]+/g, '_')
  if (normalized === 'under_review' || normalized === 'reviewing') return 'in_review'
  if (normalized === 'documents_required' || normalized === 'additional_docs_required' || normalized === 'additional_document_required') {
    return 'additional_documents_required'
  }
  if (normalized === 'feedback' || normalized === 'bank_feedback_received') return 'feedback_received'
  if (normalized === 'approved_by_buyer') return 'buyer_approved'
  return normalized
}

function getPrimaryBondApplicationStatus(record = {}) {
  const transaction = getQueueRecordTransaction(record)
  const application = latestRecord(getBondApplications(record))
  return normalizeBondApplicationStatus(
    application?.status ||
      application?.application_status ||
      application?.applicationStatus ||
      transaction.bond_application_status ||
      transaction.bondApplicationStatus ||
      transaction.application_status ||
      transaction.applicationStatus ||
      '',
  )
}

function getDocumentStatus(record = {}) {
  return normalizeLower(record.status || record.document_status || record.documentStatus || record.requirement_status || record.requirementStatus)
}

function getDocumentSearchText(record = {}) {
  return [
    record.document_key,
    record.documentKey,
    record.requirement_key,
    record.requirementKey,
    record.type,
    record.document_type,
    record.documentType,
    record.category,
    record.label,
    record.name,
    record.title,
    record.description,
  ].map(normalizeLower).filter(Boolean).join(' ')
}

function isRejectedDocument(record = {}) {
  const status = getDocumentStatus(record)
  return ['declined', 'failed', 'rejected', 'reupload_required', 'needs_reupload'].includes(status)
}

function hasDocumentEvidence(record = {}, matchers = []) {
  const normalizedMatchers = matchers.map(normalizeLower).filter(Boolean)
  if (!normalizedMatchers.length) return false
  return getDocumentLikeRecords(record).some((item) => {
    if (isRejectedDocument(item)) return false
    const text = getDocumentSearchText(item)
    return normalizedMatchers.some((matcher) => text.includes(matcher))
  })
}

function hasBuyerReuploadEvidence(record = {}) {
  const transaction = getQueueRecordTransaction(record)
  const explicit = readFirstBool([record, transaction], [
    'buyer_reupload_required',
    'buyerReuploadRequired',
    'documents_reupload_required',
    'documentsReuploadRequired',
  ])
  if (explicit) return true
  const signal = [
    transaction.next_action,
    transaction.nextAction,
    transaction.finance_status,
    transaction.financeStatus,
    transaction.blocker_reason,
    transaction.blockerReason,
  ].map(normalizeLower).join(' ')
  if (/(reupload|re-upload|upload again|rejected document|document rejected)/.test(signal)) return true
  return getDocumentLikeRecords(record).some((item) => {
    const status = getDocumentStatus(item)
    return ['rejected', 'reupload_required', 'needs_reupload', 'declined'].includes(status)
  })
}

function hasBankFeedbackEvidence(record = {}) {
  const transaction = getQueueRecordTransaction(record)
  const applicationStatus = getPrimaryBondApplicationStatus(record)
  const bankFeedbackStatus = normalizeLower(transaction.bank_feedback_status || transaction.bankFeedbackStatus)
  const quoteCount = getBondQuotes(record).filter((quote) => {
    const status = normalizeLower(quote.quoteStatus || quote.quote_status || quote.status)
    return !['', 'expired', 'not_selected'].includes(status)
  }).length
  return (
    quoteCount > 0 ||
    normalizeBool(transaction.bank_feedback_received) ||
    normalizeBool(transaction.bankFeedbackReceived) ||
    ['received', 'feedback_received', 'action_required', 'needs_action', 'query_received'].includes(bankFeedbackStatus) ||
    ['feedback_received', 'quote_received', 'approved', 'buyer_approved', 'declined'].includes(applicationStatus) ||
    hasCanonicalBondFinanceStage(record, ['quote_received', 'quote_accepted', 'bond_approved', 'grant_received', 'grant_signed', 'grant_submitted', 'instruction_sent', 'complete'])
  )
}

function hasGrantDocument(record = {}) {
  const transaction = getQueueRecordTransaction(record)
  const instruction = getBondInstruction(record) || {}
  return (
    readFirstBool([instruction, transaction], [
      'grantReceived',
      'grant_received',
      'grant_document_uploaded',
      'grantDocumentUploaded',
      'bond_grant_received',
      'bondGrantReceived',
    ]) ||
    Boolean(readFirstText([instruction, transaction], [
      'grantDocumentId',
      'grant_document_id',
      'grantLetterDocumentId',
      'grant_letter_document_id',
      'bondGrantDocumentId',
      'bond_grant_document_id',
      'bondApprovalDocumentId',
      'bond_approval_document_id',
      'approvalLetterDocumentId',
      'approval_letter_document_id',
    ])) ||
    hasDocumentEvidence(record, [
      'grant_letter',
      'grant document',
      'bond_grant',
      'bond approval letter',
      'bond_approval_letter',
      'approval_letter',
      'guarantee_issued',
      'guarantees_grant_issued',
    ])
  )
}

function hasSignedGrantDocument(record = {}) {
  const transaction = getQueueRecordTransaction(record)
  const instruction = getBondInstruction(record) || {}
  return (
    readFirstBool([instruction, transaction], [
      'grantSigned',
      'grant_signed',
      'signedGrantUploaded',
      'signed_grant_uploaded',
      'bond_grant_signed',
      'bondGrantSigned',
    ]) ||
    Boolean(readFirstText([instruction, transaction], [
      'signedGrantDocumentId',
      'signed_grant_document_id',
      'signedBondGrantDocumentId',
      'signed_bond_grant_document_id',
      'loanAcceptanceDocumentId',
      'loan_acceptance_document_id',
    ])) ||
    hasDocumentEvidence(record, [
      'signed_grant',
      'signed grant',
      'grant signed',
      'signed_bond_grant',
      'loan_acceptance',
      'loan acceptance',
    ])
  )
}

function hasGrantSubmittedEvidence(record = {}) {
  const transaction = getQueueRecordTransaction(record)
  const instruction = getBondInstruction(record) || {}
  return (
    readFirstBool([instruction, transaction], [
      'grantSubmitted',
      'grant_submitted',
      'signedGrantSubmitted',
      'signed_grant_submitted',
    ]) ||
    Boolean(readFirstText([instruction, transaction], [
      'grantSubmittedAt',
      'grant_submitted_at',
      'signedGrantSubmittedAt',
      'signed_grant_submitted_at',
    ])) ||
    hasCanonicalBondFinanceStage(record, ['grant_submitted', 'instruction_sent', 'complete'])
  )
}

function hasInstructionSentEvidence(record = {}) {
  const transaction = getQueueRecordTransaction(record)
  const instruction = getBondInstruction(record) || {}
  return (
    readFirstBool([instruction, transaction], [
      'instructionSent',
      'instruction_sent',
      'bondInstructionSent',
      'bond_instruction_sent',
      'attorneyInstructionSent',
      'attorney_instruction_sent',
    ]) ||
    Boolean(readFirstText([instruction, transaction], [
      'instructionDocumentId',
      'instruction_document_id',
      'instructionPackDocumentId',
      'instruction_pack_document_id',
      'instructionSentAt',
      'instruction_sent_at',
      'bondInstructionSentAt',
      'bond_instruction_sent_at',
      'attorneyInstructionSentAt',
      'attorney_instruction_sent_at',
    ])) ||
    hasDocumentEvidence(record, [
      'instruction_pack',
      'bond_instruction',
      'attorney_instruction',
      'instruction document',
    ]) ||
    hasCanonicalBondFinanceStage(record, ['instruction_sent', 'complete'])
  )
}

function hasBondAttorneyHandoffEvidence(record = {}) {
  const transaction = getQueueRecordTransaction(record)
  const instruction = getBondInstruction(record) || {}
  if (
    readFirstBool([instruction, transaction], [
      'attorneyInstructionAccepted',
      'attorney_instruction_accepted',
      'bondAttorneyAccepted',
      'bond_attorney_accepted',
      'bondAttorneyInstructionAccepted',
      'bond_attorney_instruction_accepted',
    ]) ||
    Boolean(readFirstText([instruction, transaction], [
      'attorneyInstructionAcceptedAt',
      'attorney_instruction_accepted_at',
      'bondAttorneyAssignedAt',
      'bond_attorney_assigned_at',
      'bondAttorneyId',
      'bond_attorney_id',
      'bondAttorneyFirmId',
      'bond_attorney_firm_id',
      'attorneyBondFirmId',
      'attorney_bond_firm_id',
      'assignedBondAttorneyEmail',
      'assigned_bond_attorney_email',
    ]))
  ) {
    return true
  }

  const assignmentEvidence = getAttorneyAssignments(record).some((assignment) => {
    const role = normalizeLower(
      assignment.attorney_role ||
        assignment.attorneyRole ||
        assignment.assignment_type ||
        assignment.assignmentType ||
        assignment.role ||
        assignment.role_type,
    )
    const status = normalizeLower(assignment.assignment_status || assignment.assignmentStatus || assignment.status)
    const isBondAttorney = role.includes('bond')
    if (!isBondAttorney) return false
    if (INACTIVE_ATTORNEY_ASSIGNMENT_STATUSES.has(status)) return false
    return ACTIVE_ATTORNEY_ASSIGNMENT_STATUSES.has(status) || Boolean(normalizeText(assignment.attorney_user_id || assignment.attorneyUserId || assignment.firm_id || assignment.firmId))
  })
  if (assignmentEvidence) return true

  const rolePlayerEvidence = getRolePlayers(record).some((item) => {
    const role = normalizeLower(item.role_type || item.roleType || item.role || item.participant_role || item.participantRole)
    const status = normalizeLower(item.status || item.assignment_status || item.assignmentStatus)
    return role.includes('bond') && role.includes('attorney') && !INACTIVE_ATTORNEY_ASSIGNMENT_STATUSES.has(status)
  })
  if (rolePlayerEvidence) return true

  return getRowEvents(record).some((event) => {
    const type = normalizeLower(event.event_type || event.eventType || event.type)
    return [
      'attorney_instruction_accepted',
      'bond_attorney_assigned',
      'bond_instruction_accepted',
      'attorney_primary_assigned',
    ].includes(type)
  })
}

function getCanonicalBondFinanceWorkflow(record = {}) {
  const transaction = getQueueRecordTransaction(record)
  const workflowData =
    record?.transactionFinanceWorkflow ||
    record?.transaction_finance_workflow ||
    record?.financeWorkflow ||
    record?.bondFinanceWorkflow ||
    transaction.transactionFinanceWorkflow ||
    transaction.transaction_finance_workflow ||
    transaction.financeWorkflow ||
    transaction.bondFinanceWorkflow ||
    null
  if (workflowData) return workflowData

  const workflow = getFirstArrayItem(record?.transaction_finance_workflows || transaction.transaction_finance_workflows)
  if (!workflow) return null

  return {
    workflow,
    instruction: getFirstArrayItem(record?.transaction_bond_instructions || transaction.transaction_bond_instructions),
  }
}

function getCanonicalBondFinanceStage(record = {}) {
  const workflowData = getCanonicalBondFinanceWorkflow(record)
  const workflow = workflowData?.workflow || workflowData || null
  const stage = normalizeText(
    workflow?.currentStage ||
      workflow?.current_stage ||
      workflowData?.summary?.currentStage ||
      workflowData?.summary?.current_stage ||
      workflowData?.currentStage ||
      workflowData?.current_stage,
  )
  return stage ? normalizeBondHybridFinanceStage(stage, '') : ''
}

function hasCanonicalBondFinanceStage(record = {}, stages = []) {
  const stage = getCanonicalBondFinanceStage(record)
  return Boolean(stage && stages.includes(stage))
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

function normalizeQueueItem(record = {}, owners = {}, source = 'canonical') {
  const transaction = getQueueRecordTransaction(record)
  const canonicalFinanceStage = getCanonicalBondFinanceStage(record)

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
    canonicalFinanceStage: canonicalFinanceStage || null,
    canonicalFinanceStageLabel: canonicalFinanceStage ? getBondHybridFinanceStageLabel(canonicalFinanceStage) : null,
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

function getOfferAmount(row = {}) {
  return normalizeNumber(
    row?.transaction?.offer_amount ??
      row?.transaction?.offerAmount ??
      row?.transaction?.purchase_price ??
      row?.transaction?.purchasePrice ??
      row?.transaction?.sales_price ??
      row?.transaction?.salesPrice ??
      row?.unit?.price,
    0,
  )
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

function getRowEvents(row = {}) {
  if (Array.isArray(row.transactionEvents)) return row.transactionEvents
  if (Array.isArray(row.transaction_events)) return row.transaction_events
  if (Array.isArray(row.events)) return row.events
  if (Array.isArray(row?.transaction?.events)) return row.transaction.events
  if (Array.isArray(row?.transaction?.transaction_events)) return row.transaction.transaction_events
  return []
}

function hasReviewBeenPickedUp(row = {}) {
  const transaction = row?.transaction || row || {}
  const intakeStatus = normalizeText(transaction.bond_originator_intake_status || transaction.bondOriginatorIntakeStatus).toLowerCase()
  const assignmentStatus = normalizeText(transaction.bond_assignment_status || transaction.bondAssignmentStatus).toLowerCase()
  if (['accepted', 'assigned', 'consultant_assigned', 'accepted_from_intake', 'assigned_from_intake'].includes(intakeStatus)) return true
  if (['consultant_assigned', 'accepted', 'assigned', 'accepted_from_intake', 'assigned_from_intake'].includes(assignmentStatus)) return true
  return getRowEvents(row).some((event) => {
    const type = normalizeText(event?.event_type || event?.eventType || event?.type).toUpperCase()
    return REVIEW_PICKED_UP_EVENT_TYPES.has(type)
  })
}

export function getBondOriginatorQueueState(row = {}) {
  const intakeSummary = getBondIntakeSummary(getBondIntakeInput(row))
  const status = intakeSummary.intakeStatus
  const bucket = APPLICATION_INTAKE_STATUSES.has(status) ? 'applications' : NEW_APPLICATION_INTAKE_STATUSES.has(status) ? 'pipeline' : 'hidden'
  const isNew = status === BOND_INTAKE_STATUSES.READY_FOR_REVIEW && !hasReviewBeenPickedUp(row)

  return {
    status,
    bucket,
    label: BOND_INTAKE_STATUS_LABELS[status] || 'Not applicable',
    isNew,
    actionRequired: status === BOND_INTAKE_STATUSES.READY_FOR_REVIEW || status === BOND_INTAKE_STATUSES.READY_TO_START,
  }
}

function getBondOperationalTerminalState(record = {}) {
  const transaction = getQueueRecordTransaction(record)
  const intakeStatus = getBondOriginatorQueueState(record).status
  const canonicalStage = getCanonicalBondFinanceStage(record)
  const terminalStatus = normalizeLower(
    transaction.lifecycle_state ||
      transaction.lifecycleState ||
      transaction.transaction_status ||
      transaction.transactionStatus ||
      transaction.status ||
      transaction.finance_status ||
      transaction.financeStatus ||
      transaction.bond_assignment_status ||
      transaction.bondAssignmentStatus,
  )
  const archiveMarker = normalizeText(transaction.archived_at || transaction.archivedAt || transaction.deleted_at || transaction.deletedAt)
  const completedMarker = normalizeText(transaction.completed_at || transaction.completedAt || transaction.registered_at || transaction.registeredAt)
  const cancelledMarker = normalizeText(transaction.cancelled_at || transaction.cancelledAt || transaction.declined_at || transaction.declinedAt)

  if (archiveMarker || terminalStatus === 'archived' || terminalStatus === 'deleted') {
    return BOND_OPERATIONAL_WAIT_STATES.ARCHIVED
  }
  if (intakeStatus === BOND_INTAKE_STATUSES.DECLINED || cancelledMarker || ['declined', 'rejected', 'cancelled', 'canceled'].includes(terminalStatus)) {
    return BOND_OPERATIONAL_WAIT_STATES.DECLINED
  }
  if (
    canonicalStage === 'complete' ||
    completedMarker ||
    ['complete', 'completed', 'registered'].includes(terminalStatus) ||
    normalizeLower(transaction.registration_status || transaction.registrationStatus) === 'registered'
  ) {
    return BOND_OPERATIONAL_WAIT_STATES.COMPLETE
  }
  return ''
}

function hasBondWorkflowEvidence(record = {}) {
  const transaction = getQueueRecordTransaction(record)
  const financeType = normalizeFinanceType(transaction.finance_type || transaction.financeType, { allowUnknown: true })
  return (
    isBondFinanceType(financeType) ||
    Boolean(
      normalizeText(
        transaction.bond_workspace_id ||
          transaction.bondWorkspaceId ||
          transaction.assigned_bond_originator_email ||
          transaction.assignedBondOriginatorEmail ||
          transaction.primary_bond_consultant_user_id ||
          transaction.primaryBondConsultantUserId,
      ),
    ) ||
    Boolean(getCanonicalBondFinanceStage(record)) ||
    getBondApplications(record).length > 0 ||
    getBondQuotes(record).length > 0 ||
    Boolean(getBondInstruction(record))
  )
}

function isBondOperationallyRelevant(record = {}) {
  const terminalState = getBondOperationalTerminalState(record)
  if (terminalState) return true
  const queueState = getBondOriginatorQueueState(record)
  const hasWorkflowEvidence = hasBondWorkflowEvidence(record)
  if (queueState.status === BOND_INTAKE_STATUSES.NOT_BOND_RELEVANT && !hasWorkflowEvidence) return false
  if (queueState.bucket === 'pipeline' || queueState.bucket === 'applications') return true
  return hasWorkflowEvidence
}

function resolveActiveBondWaitState(record = {}) {
  const queueState = getBondOriginatorQueueState(record)
  const canonicalStage = getCanonicalBondFinanceStage(record)
  const applicationStatus = getPrimaryBondApplicationStatus(record)

  if (queueState.bucket === 'pipeline') return ''

  if (applicationStatus === 'additional_documents_required') {
    return hasBuyerReuploadEvidence(record)
      ? BOND_OPERATIONAL_WAIT_STATES.AWAITING_BUYER_REUPLOAD
      : BOND_OPERATIONAL_WAIT_STATES.ADDITIONAL_DOCUMENTS_REQUIRED
  }

  if (
    ['submitted', 'in_review'].includes(applicationStatus) ||
    ['submitted_to_banks', 'bank_review'].includes(canonicalStage)
  ) {
    if (!hasBankFeedbackEvidence(record)) {
      return BOND_OPERATIONAL_WAIT_STATES.AWAITING_BANK_FEEDBACK
    }
  }

  if (['quote_accepted', 'bond_approved'].includes(canonicalStage)) {
    if (!hasGrantDocument(record)) {
      return BOND_OPERATIONAL_WAIT_STATES.AWAITING_GRANT_DOCUMENT
    }
  }

  if (canonicalStage === 'grant_received' && !hasGrantDocument(record)) {
    return BOND_OPERATIONAL_WAIT_STATES.AWAITING_GRANT_DOCUMENT
  }

  if (canonicalStage === 'grant_received' || (hasGrantDocument(record) && !hasGrantSubmittedEvidence(record))) {
    if (!hasSignedGrantDocument(record)) {
      return BOND_OPERATIONAL_WAIT_STATES.AWAITING_SIGNED_GRANT
    }
  }

  if (canonicalStage === 'instruction_sent' || hasInstructionSentEvidence(record)) {
    if (!hasBondAttorneyHandoffEvidence(record)) {
      return BOND_OPERATIONAL_WAIT_STATES.INSTRUCTION_SENT_AWAITING_ATTORNEY_ACCEPTANCE
    }
  }

  return BOND_OPERATIONAL_WAIT_STATES.ACTIVE_REVIEW_REQUIRED
}

export function deriveBondOperationalWaitState(record = {}) {
  const terminalState = getBondOperationalTerminalState(record)
  if (terminalState) return terminalState
  if (!isBondOperationallyRelevant(record)) return ''
  const waitState = resolveActiveBondWaitState(record)
  if (waitState === BOND_OPERATIONAL_WAIT_STATES.ACTIVE_REVIEW_REQUIRED && getCanonicalStageQueueKey(record)) return ''
  return waitState
}

function getCanonicalStageQueueKey(record = {}) {
  const canonicalStage = getCanonicalBondFinanceStage(record)
  if (canonicalStage === 'bank_review' || canonicalStage === 'quote_received') return 'bank_feedback'
  if (canonicalStage === 'quote_accepted' || canonicalStage === 'bond_approved') return BOND_OPERATIONAL_QUEUE_KEYS.AWAITING_GRANT
  if (canonicalStage === 'grant_received') return BOND_OPERATIONAL_QUEUE_KEYS.GRANT_RECEIVED
  if (canonicalStage === 'grant_signed') return BOND_OPERATIONAL_QUEUE_KEYS.GRANT_SIGNED
  if (canonicalStage === 'grant_submitted') return BOND_OPERATIONAL_QUEUE_KEYS.READY_FOR_INSTRUCTION
  if (canonicalStage === 'instruction_sent') return BOND_OPERATIONAL_QUEUE_KEYS.INSTRUCTION_SENT
  return ''
}

export function getBondOperationalQueueContract(record = {}) {
  const transaction = getQueueRecordTransaction(record)
  const intakeState = getBondOriginatorQueueState(record)
  const terminalState = getBondOperationalTerminalState(record)
  const relevant = isBondOperationallyRelevant(record)
  const resolvedWaitState = terminalState || (relevant ? resolveActiveBondWaitState(record) : '')
  const stageQueueKey =
    !terminalState &&
    relevant &&
    intakeState.bucket !== 'pipeline' &&
    resolvedWaitState === BOND_OPERATIONAL_WAIT_STATES.ACTIVE_REVIEW_REQUIRED
      ? getCanonicalStageQueueKey(record)
      : ''
  const waitState =
    resolvedWaitState === BOND_OPERATIONAL_WAIT_STATES.ACTIVE_REVIEW_REQUIRED && stageQueueKey
      ? ''
      : resolvedWaitState
  const waitStateQueueKey =
    waitState === BOND_OPERATIONAL_WAIT_STATES.ACTIVE_REVIEW_REQUIRED && stageQueueKey
      ? stageQueueKey
      : WAIT_STATE_QUEUE_KEYS[waitState]
  const queueKey =
    terminalState || !relevant
      ? null
      : intakeState.bucket === 'pipeline'
        ? BOND_OPERATIONAL_QUEUE_KEYS.NEW_APPLICATIONS
        : waitStateQueueKey || stageQueueKey || BOND_OPERATIONAL_QUEUE_KEYS.ACTIVE_REVIEW_REQUIRED
  const hiddenAllowed = Boolean(terminalState || !relevant)
  const externalWait = EXTERNAL_WAIT_STATES.has(waitState)
  const reason =
    terminalState
      ? `terminal_${terminalState}`
      : !relevant
        ? 'not_bond_relevant'
        : intakeState.bucket === 'pipeline'
          ? `intake_${normalizeLower(intakeState.status)}`
          : externalWait
            ? `external_wait_${waitState}`
            : stageQueueKey
              ? `stage_${stageQueueKey}`
              : 'active_review_required'

  return {
    transactionId: normalizeText(transaction.id || transaction.transaction_id) || null,
    intakeStatus: intakeState.status,
    intakeBucket: intakeState.bucket,
    canonicalFinanceStage: getCanonicalBondFinanceStage(record) || null,
    bondApplicationStatus: getPrimaryBondApplicationStatus(record) || null,
    waitState: waitState || null,
    queueKey,
    hiddenAllowed,
    visible: !hiddenAllowed,
    externalWait,
    reason,
  }
}

export function isBondOperationallyVisibleRow(record = {}) {
  const contract = getBondOperationalQueueContract(record)
  return Boolean(contract.visible && contract.queueKey)
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
  const financeHandoff = buildFinanceReadinessHandoffPacket(row)
  const approvalConfidence = calculateApprovalProbability(row)
  const operationalRisk = calculateOperationalRisk(row)
  const velocity = calculateTransactionVelocity(row)
  const financeInsights = generateFinanceInsights(row)
  const readinessOutcomeCalibration = getReadinessOutcomeCalibrationForRow(row)
  const offerAmount = getOfferAmount(row)

  return {
    id: normalizeText(transaction.id || row?.unit?.id || row?.buyer?.id) || `${getBuyerName(row)}-${getPropertyLabel(row)}`,
    transactionId: normalizeText(transaction.id) || null,
    buyerName: getBuyerName(row),
    propertyLabel: getPropertyLabel(row),
    developmentName: getDevelopmentName(row),
    agentName: getAgentName(row),
    offerAmount,
    offerAmountLabel: offerAmount > 0 ? CURRENCY.format(offerAmount) : 'Offer pending',
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
    financeHandoff,
    approvalConfidence,
    operationalRisk,
    velocity,
    financeInsights,
    readinessOutcomeCalibration,
    transactionConfidence: Math.round((approvalConfidence.score * 0.55) + ((100 - operationalRisk.riskScore) * 0.25) + (velocity.velocityScore * 0.2)),
    canAccept: intakeSummary.canAccept,
    ageLabel: getAgeLabel(applicationProgress.submittedAt || applicationProgress.startedAt || transaction.created_at || transaction.updated_at),
    href: getIntakeHref(row),
    sourceRow: row,
  }
}

export function isNewBondApplicationRow(row = {}) {
  return getBondOriginatorQueueState(row).bucket === 'pipeline'
}

export function isBondApplicationTrackerRow(row = {}) {
  return getBondOriginatorQueueState(row).bucket === 'applications'
}

export function isNewBondApplicationReadyForReview(row = {}) {
  const state = getBondOriginatorQueueState(row)
  return state.bucket === 'pipeline' && state.isNew
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

function hasMissingDocuments(record = {}) {
  const transaction = getQueueRecordTransaction(record)
  return (
    normalizeBool(transaction.documents_missing) ||
    normalizeBool(transaction.required_documents_missing) ||
    normalizeBool(transaction.finance_documents_missing) ||
    normalizeNumber(transaction.missing_documents_count || transaction.missingDocumentsCount, 0) > 0 ||
    normalizeText(transaction.finance_status).toLowerCase().includes('document')
  )
}

function hasBankFeedbackWork(record = {}) {
  const transaction = getQueueRecordTransaction(record)
  const status = normalizeText(transaction.bank_feedback_status || transaction.bankFeedbackStatus).toLowerCase()
  return (
    hasCanonicalBondFinanceStage(record, ['bank_review', 'quote_received']) ||
    normalizeBool(transaction.bank_feedback_pending) ||
    ['pending', 'received', 'action_required', 'needs_action'].includes(status)
  )
}

function isSubmissionReady(record = {}) {
  const transaction = getQueueRecordTransaction(record)
  const canonicalStage = getCanonicalBondFinanceStage(record)
  const docsComplete =
    normalizeBool(transaction.documents_complete) ||
    normalizeBool(transaction.finance_documents_complete) ||
    normalizeNumber(transaction.missing_documents_count || transaction.missingDocumentsCount, 0) === 0
  const prepared =
    normalizeBool(transaction.application_prepared) ||
    normalizeText(transaction.finance_status).toLowerCase().includes('prepared')
  const submitted =
    ['submitted_to_banks', 'bank_review', 'quote_received', 'quote_accepted', 'bond_approved', 'grant_received', 'grant_signed', 'grant_submitted', 'instruction_sent', 'complete'].includes(canonicalStage) ||
    normalizeBool(transaction.submitted_to_banks) ||
    normalizeText(transaction.finance_status).toLowerCase().includes('submitted')
  return docsComplete && prepared && !submitted
}

function isAwaitingGrant(record = {}) {
  return hasCanonicalBondFinanceStage(record, ['quote_accepted', 'bond_approved'])
}

function isGrantReceived(record = {}) {
  return hasCanonicalBondFinanceStage(record, ['grant_received'])
}

function isGrantSigned(record = {}) {
  return hasCanonicalBondFinanceStage(record, ['grant_signed'])
}

function isReadyForInstruction(record = {}) {
  return hasCanonicalBondFinanceStage(record, ['grant_submitted'])
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
  return (Array.isArray(transactions) ? transactions : []).filter((record) =>
    canViewFinanceWorkflow(user, getQueueRecordTransaction(record)),
  )
}

function createQueueItems(user = {}, transactions = [], predicate = () => false, sourceLabel = 'canonical') {
  const visible = filterVisibleTransactions(user, transactions)
  return visible
    .map((record) => {
      const transaction = getQueueRecordTransaction(record)
      const owners = resolveFinanceWorkflowOwners(transaction)
      return { record, transaction, owners, item: normalizeQueueItem(record, owners, sourceLabel) }
    })
    .filter(({ record, transaction, owners, item }) => predicate({ record, transaction, owners, item }))
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
    ({ record }) => {
      const waitState = deriveBondOperationalWaitState(record)
      return (
        hasMissingDocuments(record) ||
        waitState === BOND_OPERATIONAL_WAIT_STATES.ADDITIONAL_DOCUMENTS_REQUIRED ||
        waitState === BOND_OPERATIONAL_WAIT_STATES.AWAITING_BUYER_REUPLOAD
      )
    },
    'missing_documents',
  )
}

export function getBankFeedbackQueue(user = {}, transactions = []) {
  return createQueueItems(
    user,
    transactions,
    ({ record }) => hasBankFeedbackWork(record) || deriveBondOperationalWaitState(record) === BOND_OPERATIONAL_WAIT_STATES.AWAITING_BANK_FEEDBACK,
    'bank_feedback',
  )
}

export function getSubmissionReadinessQueue(user = {}, transactions = []) {
  return createQueueItems(
    user,
    transactions,
    ({ record }) => isSubmissionReady(record),
    'submission_readiness',
  )
}

function getOperationalContractQueue(user = {}, transactions = [], queueKey = '', sourceLabel = queueKey) {
  return createQueueItems(
    user,
    transactions,
    ({ record }) => {
      const contract = getBondOperationalQueueContract(record)
      return !contract.hiddenAllowed && contract.queueKey === queueKey
    },
    sourceLabel,
  )
}

export function getAwaitingBankFeedbackQueue(user = {}, transactions = []) {
  return getOperationalContractQueue(
    user,
    transactions,
    BOND_OPERATIONAL_QUEUE_KEYS.AWAITING_BANK_FEEDBACK,
  )
}

export function getAdditionalDocumentsRequiredQueue(user = {}, transactions = []) {
  return getOperationalContractQueue(
    user,
    transactions,
    BOND_OPERATIONAL_QUEUE_KEYS.ADDITIONAL_DOCUMENTS_REQUIRED,
  )
}

export function getAwaitingBuyerReuploadQueue(user = {}, transactions = []) {
  return getOperationalContractQueue(
    user,
    transactions,
    BOND_OPERATIONAL_QUEUE_KEYS.AWAITING_BUYER_REUPLOAD,
  )
}

export function getAwaitingGrantQueue(user = {}, transactions = []) {
  return createQueueItems(
    user,
    transactions,
    ({ record }) => isAwaitingGrant(record),
    BOND_OPERATIONAL_QUEUE_KEYS.AWAITING_GRANT,
  )
}

export function getAwaitingGrantDocumentQueue(user = {}, transactions = []) {
  return getOperationalContractQueue(
    user,
    transactions,
    BOND_OPERATIONAL_QUEUE_KEYS.AWAITING_GRANT_DOCUMENT,
  )
}

export function getGrantReceivedQueue(user = {}, transactions = []) {
  return createQueueItems(
    user,
    transactions,
    ({ record }) => isGrantReceived(record),
    BOND_OPERATIONAL_QUEUE_KEYS.GRANT_RECEIVED,
  )
}

export function getAwaitingSignedGrantQueue(user = {}, transactions = []) {
  return getOperationalContractQueue(
    user,
    transactions,
    BOND_OPERATIONAL_QUEUE_KEYS.AWAITING_SIGNED_GRANT,
  )
}

export function getGrantSignedQueue(user = {}, transactions = []) {
  return createQueueItems(
    user,
    transactions,
    ({ record }) => isGrantSigned(record),
    BOND_OPERATIONAL_QUEUE_KEYS.GRANT_SIGNED,
  )
}

export function getReadyForInstructionQueue(user = {}, transactions = []) {
  return createQueueItems(
    user,
    transactions,
    ({ record }) => isReadyForInstruction(record),
    BOND_OPERATIONAL_QUEUE_KEYS.READY_FOR_INSTRUCTION,
  )
}

export function getInstructionSentQueue(user = {}, transactions = []) {
  return getOperationalContractQueue(
    user,
    transactions,
    BOND_OPERATIONAL_QUEUE_KEYS.INSTRUCTION_SENT,
  )
}

export function getInstructionSentAwaitingAttorneyAcceptanceQueue(user = {}, transactions = []) {
  return getOperationalContractQueue(
    user,
    transactions,
    BOND_OPERATIONAL_QUEUE_KEYS.INSTRUCTION_SENT_AWAITING_ATTORNEY_ACCEPTANCE,
  )
}

export function getActiveReviewRequiredQueue(user = {}, transactions = []) {
  return getOperationalContractQueue(
    user,
    transactions,
    BOND_OPERATIONAL_QUEUE_KEYS.ACTIVE_REVIEW_REQUIRED,
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
  const records = Array.isArray(transactions) ? transactions : []
  const transactionRows = records.map((record) => (record?.transaction ? record : { transaction: record }))
  return {
    [BOND_OPERATIONAL_QUEUE_KEYS.NEW_APPLICATIONS]: getVisibleNewApplicationsQueue(user, transactionRows),
    my_applications: getMyApplicationsQueue(user, records),
    processing_queue: getProcessingQueue(user, records),
    missing_documents: getMissingDocumentsQueue(user, records),
    bank_feedback: getBankFeedbackQueue(user, records),
    submission_readiness: getSubmissionReadinessQueue(user, records),
    [BOND_OPERATIONAL_QUEUE_KEYS.AWAITING_BANK_FEEDBACK]: getAwaitingBankFeedbackQueue(user, records),
    [BOND_OPERATIONAL_QUEUE_KEYS.ADDITIONAL_DOCUMENTS_REQUIRED]: getAdditionalDocumentsRequiredQueue(user, records),
    [BOND_OPERATIONAL_QUEUE_KEYS.AWAITING_BUYER_REUPLOAD]: getAwaitingBuyerReuploadQueue(user, records),
    awaiting_grant: getAwaitingGrantQueue(user, records),
    [BOND_OPERATIONAL_QUEUE_KEYS.AWAITING_GRANT_DOCUMENT]: getAwaitingGrantDocumentQueue(user, records),
    grant_received: getGrantReceivedQueue(user, records),
    [BOND_OPERATIONAL_QUEUE_KEYS.AWAITING_SIGNED_GRANT]: getAwaitingSignedGrantQueue(user, records),
    grant_signed: getGrantSignedQueue(user, records),
    ready_for_instruction: getReadyForInstructionQueue(user, records),
    [BOND_OPERATIONAL_QUEUE_KEYS.INSTRUCTION_SENT]: getInstructionSentQueue(user, records),
    [BOND_OPERATIONAL_QUEUE_KEYS.INSTRUCTION_SENT_AWAITING_ATTORNEY_ACCEPTANCE]: getInstructionSentAwaitingAttorneyAcceptanceQueue(user, records),
    [BOND_OPERATIONAL_QUEUE_KEYS.ACTIVE_REVIEW_REQUIRED]: getActiveReviewRequiredQueue(user, records),
    overdue_applications: getOverdueApplicationsQueue(user, records),
    compliance_review: getComplianceReviewQueue(user, records),
    manager_escalations: getManagerEscalationsQueue(user, records),
  }
}
