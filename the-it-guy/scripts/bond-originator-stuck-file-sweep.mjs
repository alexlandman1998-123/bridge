import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const BOND_FINANCE_STAGES = [
  'intake',
  'documents',
  'submitted_to_banks',
  'bank_review',
  'quote_received',
  'quote_accepted',
  'bond_approved',
  'grant_received',
  'grant_signed',
  'grant_submitted',
  'instruction_sent',
  'complete',
]

const BOND_STAGE_ALIASES = Object.freeze({
  buyer_onboarding_started: 'intake',
  intake_started: 'intake',
  documents_requested: 'documents',
  documents_pending: 'documents',
  documents_received: 'documents',
  documents_reviewed: 'documents',
  documents_verified: 'documents',
  applications_submitted: 'submitted_to_banks',
  submitted: 'submitted_to_banks',
  bank_feedback: 'bank_review',
  bank_feedback_pending: 'bank_review',
  quotes_received: 'quote_received',
  quote_approved: 'quote_accepted',
  approved_by_buyer: 'quote_accepted',
  accepted: 'quote_accepted',
  approved: 'bond_approved',
  approval_granted: 'bond_approved',
  bond_grant_received: 'grant_received',
  bond_grant_signed: 'grant_signed',
  bond_grant_submitted: 'grant_submitted',
  instruction_issued: 'instruction_sent',
  bond_instruction_sent: 'instruction_sent',
  registered: 'complete',
  completed: 'complete',
})

const BOND_APPLICATION_STATUSES = new Set([
  'pending',
  'submitted',
  'in_review',
  'feedback_received',
  'quote_received',
  'additional_documents_required',
  'declined',
  'approved',
  'buyer_approved',
  'expired',
])

const BOND_QUOTE_STATUSES = new Set([
  'received',
  'accepted',
  'declined',
  'not_selected',
  'approved_by_buyer',
  'declined_by_buyer',
  'expired',
])

const ACTIVE_INTAKE_STATUSES = new Set([
  'awaiting_otp',
  'ready_to_start',
  'application_in_progress',
  'application_submitted',
  'ready_for_review',
])

const PICKED_UP_STATUSES = new Set([
  'accepted',
  'assigned',
  'consultant_assigned',
  'processor_assigned',
  'fully_assigned',
  'accepted_from_intake',
  'assigned_from_intake',
])

const PICKED_UP_EVENT_TYPES = new Set([
  'bond_application_accepted',
  'bond_application_assigned',
  'application_accepted',
  'application_assigned',
])

const ACTIVE_ASSIGNMENT_STATUSES = new Set(['', 'active', 'assigned', 'pending', 'ready_for_acceptance', 'new_instruction'])
const COMPLETE_STEP_STATUSES = new Set(['complete', 'completed', 'done', 'approved', 'verified', 'received', 'accepted'])

const DEFAULT_THRESHOLDS = Object.freeze({
  bankFeedbackDays: 7,
  additionalDocumentsDays: 5,
  attorneyHandoffDays: 2,
})

const FINDING_META = Object.freeze({
  orphaned_ready_for_review: {
    label: 'Orphaned Ready For Review',
    action: 'Assign a bond workspace or originator owner, then accept or decline the intake.',
  },
  accepted_file_still_in_intake: {
    label: 'Accepted File Still In Intake',
    action: 'Move the file out of intake or repair the intake/assignment status mismatch.',
  },
  invalid_bond_workflow_stage: {
    label: 'Invalid Bond Workflow Stage',
    action: 'Map the legacy stage to a canonical bond finance stage.',
  },
  invalid_bond_application_status: {
    label: 'Invalid Bond Application Status',
    action: 'Map the application status to the canonical bond application status list.',
  },
  invalid_bond_quote_status: {
    label: 'Invalid Bond Quote Status',
    action: 'Map the quote status to the canonical bond quote status list.',
  },
  missing_grant_document: {
    label: 'Missing Grant Document',
    action: 'Attach the formal bond grant before using this milestone.',
  },
  missing_signed_grant_document: {
    label: 'Missing Signed Grant',
    action: 'Attach the buyer-signed grant before marking signed/submitted.',
  },
  missing_grant_submission_evidence: {
    label: 'Missing Grant Submission Evidence',
    action: 'Record the signed grant submission timestamp/evidence.',
  },
  missing_instruction_evidence: {
    label: 'Missing Instruction Evidence',
    action: 'Attach the attorney instruction document and record instruction sent.',
  },
  instruction_sent_without_attorney_handoff: {
    label: 'Instruction Sent Without Attorney Handoff',
    action: 'Create or repair the bond attorney assignment/incoming matter evidence.',
  },
  stale_bank_feedback_wait: {
    label: 'Stale Bank Feedback Wait',
    action: 'Follow up with the bank, capture feedback, or set a dated next action.',
  },
  stale_additional_documents_wait: {
    label: 'Stale Additional Documents Wait',
    action: 'Request/re-request documents, record receipt, or escalate the file.',
  },
})

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeKey(value = '') {
  return normalizeText(value).toLowerCase().replace(/[\s-]+/g, '_')
}

function asArray(value) {
  return Array.isArray(value) ? value : value ? [value] : []
}

function firstText(...values) {
  for (const value of values) {
    const normalized = normalizeText(value)
    if (normalized) return normalized
  }
  return ''
}

function parseDate(value) {
  const normalized = normalizeText(value)
  if (!normalized) return null
  const date = new Date(normalized)
  return Number.isNaN(date.getTime()) ? null : date
}

function ageInDays(value, now = new Date()) {
  const date = parseDate(value)
  if (!date) return null
  return Math.max(0, Math.floor((now.getTime() - date.getTime()) / 86400000))
}

function stageIndex(stage = '') {
  return BOND_FINANCE_STAGES.indexOf(stage)
}

function isAtOrAfter(stage = '', target = '') {
  const currentIndex = stageIndex(stage)
  const targetIndex = stageIndex(target)
  return currentIndex >= 0 && targetIndex >= 0 && currentIndex >= targetIndex
}

function normalizeBondStage(value = '') {
  const normalized = normalizeKey(value)
  if (!normalized) return ''
  if (BOND_STAGE_ALIASES[normalized]) return BOND_STAGE_ALIASES[normalized]
  return BOND_FINANCE_STAGES.includes(normalized) ? normalized : ''
}

function normalizeApplicationStatus(value = '') {
  const normalized = normalizeKey(value)
  if (normalized === 'under_review' || normalized === 'review') return 'in_review'
  if (normalized === 'buyer_accepted') return 'buyer_approved'
  return normalized
}

function normalizeQuoteStatus(value = '') {
  const normalized = normalizeKey(value)
  if (normalized === 'buyer_approved') return 'approved_by_buyer'
  return normalized
}

function getTransaction(record = {}) {
  return record?.transaction && typeof record.transaction === 'object' ? record.transaction : record
}

function getTransactionId(record = {}) {
  const transaction = getTransaction(record)
  return firstText(transaction.id, transaction.transaction_id, record.transaction_id, record.transactionId, record.id)
}

function byTransactionId(rows = []) {
  const map = new Map()
  for (const row of asArray(rows)) {
    const transactionId = firstText(row.transaction_id, row.transactionId, row.transaction?.id)
    if (!transactionId) continue
    if (!map.has(transactionId)) map.set(transactionId, [])
    map.get(transactionId).push(row)
  }
  return map
}

function mergeRelatedRows(record = {}, context = {}) {
  const transaction = getTransaction(record)
  const transactionId = getTransactionId(record)
  return {
    raw: record,
    transaction,
    transactionId,
    workflows: [
      ...asArray(record.transactionFinanceWorkflow),
      ...asArray(record.transaction_finance_workflow),
      ...asArray(record.transaction_finance_workflows),
      ...asArray(transaction.transaction_finance_workflows),
      ...asArray(context.workflowsByTransactionId.get(transactionId)),
    ].filter(Boolean),
    applications: [
      ...asArray(record.bondApplications),
      ...asArray(record.transaction_bond_applications),
      ...asArray(transaction.transaction_bond_applications),
      ...asArray(context.applicationsByTransactionId.get(transactionId)),
    ].filter(Boolean),
    quotes: [
      ...asArray(record.bondQuotes),
      ...asArray(record.transaction_bond_quotes),
      ...asArray(transaction.transaction_bond_quotes),
      ...asArray(context.quotesByTransactionId.get(transactionId)),
    ].filter(Boolean),
    instructions: [
      ...asArray(record.bondInstruction),
      ...asArray(record.transaction_bond_instructions),
      ...asArray(transaction.transaction_bond_instructions),
      ...asArray(context.instructionsByTransactionId.get(transactionId)),
    ].filter(Boolean),
    events: [
      ...asArray(record.events),
      ...asArray(record.transaction_events),
      ...asArray(transaction.transaction_events),
      ...asArray(context.eventsByTransactionId.get(transactionId)),
    ].filter(Boolean),
    rolePlayers: [
      ...asArray(record.transaction_role_players),
      ...asArray(transaction.transaction_role_players),
      ...asArray(context.rolePlayersByTransactionId.get(transactionId)),
    ].filter(Boolean),
    participants: [
      ...asArray(record.transaction_participants),
      ...asArray(transaction.transaction_participants),
      ...asArray(context.participantsByTransactionId.get(transactionId)),
    ].filter(Boolean),
    attorneyAssignments: [
      ...asArray(record.transaction_attorney_assignments),
      ...asArray(transaction.transaction_attorney_assignments),
      ...asArray(context.attorneyAssignmentsByTransactionId.get(transactionId)),
    ].filter(Boolean),
    workflowSteps: [
      ...asArray(record.transaction_workflow_steps),
      ...asArray(transaction.transaction_workflow_steps),
      ...asArray(context.workflowStepsByTransactionId.get(transactionId)),
    ].filter(Boolean),
  }
}

function normalizePayload(payload = {}) {
  const root = Array.isArray(payload) ? { transactions: payload } : payload || {}
  const transactions = asArray(root.transactions || root.rows || root.data)
  const context = {
    workflowsByTransactionId: byTransactionId(root.workflows || root.transaction_finance_workflows || root.transactionFinanceWorkflows),
    applicationsByTransactionId: byTransactionId(root.applications || root.transaction_bond_applications || root.bondApplications),
    quotesByTransactionId: byTransactionId(root.quotes || root.transaction_bond_quotes || root.bondQuotes),
    instructionsByTransactionId: byTransactionId(root.instructions || root.transaction_bond_instructions || root.bondInstructions),
    eventsByTransactionId: byTransactionId(root.events || root.transaction_events || root.transactionEvents),
    rolePlayersByTransactionId: byTransactionId(root.rolePlayers || root.transaction_role_players || root.transactionRolePlayers),
    participantsByTransactionId: byTransactionId(root.participants || root.transaction_participants || root.transactionParticipants),
    attorneyAssignmentsByTransactionId: byTransactionId(root.attorneyAssignments || root.transaction_attorney_assignments || root.transactionAttorneyAssignments),
    workflowStepsByTransactionId: byTransactionId(root.workflowSteps || root.transaction_workflow_steps || root.transactionWorkflowSteps),
  }
  return transactions.map((record) => mergeRelatedRows(record, context))
}

function getWorkflowStage(record = {}) {
  const workflow = record.workflows.find((item) => {
    const type = normalizeKey(item?.workflow_type || item?.workflowType || item?.type)
    return type === 'bond_hybrid' || firstText(item?.current_stage, item?.currentStage)
  }) || {}
  const rawStage = firstText(
    workflow.current_stage,
    workflow.currentStage,
    workflow.workflow?.current_stage,
    workflow.workflow?.currentStage,
    record.transaction.current_bond_stage,
    record.transaction.finance_workflow_stage,
    record.transaction.finance_status,
    record.transaction.current_sub_stage_summary,
    record.transaction.stage,
  )
  return {
    workflow,
    rawStage,
    stage: normalizeBondStage(rawStage),
  }
}

function isBondRelevant(record = {}) {
  const transaction = record.transaction
  const financeType = normalizeKey(transaction.finance_type || transaction.financeType)
  const managedBy = normalizeKey(transaction.finance_managed_by || transaction.financeManagedBy)
  return Boolean(
    financeType.includes('bond') ||
      financeType === 'hybrid' ||
      managedBy === 'bond_originator' ||
      transaction.bond_workspace_id ||
      transaction.assigned_bond_originator_email ||
      transaction.bond_originator ||
      record.workflows.some((workflow) => normalizeKey(workflow.workflow_type || workflow.workflowType) === 'bond_hybrid') ||
      record.applications.length ||
      record.quotes.length ||
      record.instructions.length,
  )
}

function isInactive(record = {}) {
  const transaction = record.transaction
  const state = normalizeKey(transaction.lifecycle_state || transaction.operational_state || transaction.status)
  return Boolean(
    transaction.deleted_at ||
      transaction.archived_at ||
      transaction.cancelled_at ||
      state === 'archived' ||
      state === 'deleted' ||
      state === 'cancelled' ||
      transaction.is_active === false,
  )
}

function getIntakeStatus(record = {}) {
  return normalizeKey(
    firstText(
      record.transaction.bond_originator_intake_status,
      record.transaction.bondOriginatorIntakeStatus,
      record.transaction.bond_intake_status,
      record.transaction.intake_status,
    ),
  )
}

function getAssignmentStatus(record = {}) {
  return normalizeKey(
    firstText(
      record.transaction.bond_assignment_status,
      record.transaction.bondAssignmentStatus,
      record.transaction.assignment_status,
      record.transaction.assignmentStatus,
    ),
  )
}

function hasActionOwner(record = {}) {
  const transaction = record.transaction
  return Boolean(
    firstText(
      transaction.primary_bond_consultant_user_id,
      transaction.assigned_bond_processor_user_id,
      transaction.assigned_bond_manager_user_id,
      transaction.assigned_bond_originator_email,
      transaction.bond_workspace_id,
      transaction.bond_originator,
    ),
  )
}

function getOwnerLabel(record = {}) {
  const transaction = record.transaction
  return firstText(
    transaction.primary_bond_consultant_user_id && `consultant:${transaction.primary_bond_consultant_user_id}`,
    transaction.assigned_bond_originator_email,
    transaction.assigned_bond_processor_user_id && `processor:${transaction.assigned_bond_processor_user_id}`,
    transaction.bond_workspace_id && `workspace:${transaction.bond_workspace_id}`,
    transaction.bond_originator,
  )
}

function hasPickedUpEvidence(record = {}) {
  const intakeStatus = getIntakeStatus(record)
  const assignmentStatus = getAssignmentStatus(record)
  if (PICKED_UP_STATUSES.has(intakeStatus) || PICKED_UP_STATUSES.has(assignmentStatus)) return true
  return record.events.some((event) => {
    const type = normalizeKey(event.event_type || event.eventType || event.type)
    return PICKED_UP_EVENT_TYPES.has(type)
  })
}

function getInstruction(record = {}) {
  return record.instructions.find(Boolean) || {}
}

function hasGrantDocument(instruction = {}) {
  return Boolean(firstText(instruction.grant_document_id, instruction.grantDocumentId))
}

function hasSignedGrantDocument(instruction = {}) {
  return Boolean(firstText(instruction.signed_grant_document_id, instruction.signedGrantDocumentId))
}

function hasGrantSubmittedEvidence(instruction = {}) {
  return Boolean(
    instruction.grant_submitted ||
      instruction.grantSubmitted ||
      firstText(instruction.grant_submitted_at, instruction.grantSubmittedAt),
  )
}

function hasInstructionDocument(instruction = {}) {
  return Boolean(firstText(instruction.instruction_document_id, instruction.instructionDocumentId))
}

function hasInstructionSentEvidence(instruction = {}) {
  return Boolean(
    instruction.instruction_sent ||
      instruction.instructionSent ||
      firstText(instruction.instruction_sent_at, instruction.instructionSentAt),
  )
}

function hasBondAttorneyHandoffEvidence(record = {}) {
  const transaction = record.transaction
  if (
    firstText(
      transaction.bond_attorney,
      transaction.bond_attorney_assigned,
      transaction.bond_instruction_id,
      transaction.bond_instruction_received,
      transaction.bond_instruction_exists,
    )
  ) {
    return true
  }

  const hasRolePlayer = [...record.rolePlayers, ...record.participants].some((row) => {
    const role = normalizeKey(row.role_type || row.role || row.transaction_role || row.legal_role)
    const status = normalizeKey(row.status || row.assignment_status)
    return role === 'bond_attorney' && ACTIVE_ASSIGNMENT_STATUSES.has(status)
  })
  if (hasRolePlayer) return true

  const hasAssignment = record.attorneyAssignments.some((row) => {
    const type = normalizeKey(row.assignment_type || row.assignmentType)
    const role = normalizeKey(row.attorney_role || row.attorneyRole)
    const status = normalizeKey(row.assignment_status || row.status)
    return (type === 'bond' || role === 'bond_attorney') && ACTIVE_ASSIGNMENT_STATUSES.has(status)
  })
  if (hasAssignment) return true

  return record.workflowSteps.some((row) => {
    const key = normalizeKey(row.step_key || row.stepKey || row.key)
    const status = normalizeKey(row.status || row.state)
    return key === 'bond_instruction_received' && COMPLETE_STEP_STATUSES.has(status)
  })
}

function getLastActivity(record = {}, entity = {}) {
  return firstText(
    entity.feedback_received_at,
    entity.feedbackReceivedAt,
    entity.updated_at,
    entity.updatedAt,
    entity.submitted_at,
    entity.submittedAt,
    record.transaction.last_meaningful_activity_at,
    record.transaction.updated_at,
    record.transaction.created_at,
  )
}

function getNextAction(record = {}) {
  return firstText(record.transaction.next_action, record.transaction.nextAction, record.transaction.comment)
}

function severityForExternalWait(record = {}) {
  return hasActionOwner(record) && getNextAction(record) ? 'warning' : 'critical'
}

function buildFinding({ record, code, severity = 'critical', stage = '', entityId = '', status = '', ageDays = null, message = '' }) {
  const meta = FINDING_META[code] || {}
  const transaction = record.transaction
  return {
    severity,
    code,
    label: meta.label || code,
    transactionId: record.transactionId || null,
    transactionReference: firstText(transaction.transaction_reference, transaction.reference),
    buyerName: firstText(transaction.buyer_name, transaction.client_name, transaction.clientName),
    property: firstText(transaction.property_address_line_1, transaction.property_name, transaction.property),
    stage: stage || null,
    entityId: entityId || null,
    status: status || null,
    ageDays,
    owner: getOwnerLabel(record) || null,
    nextAction: getNextAction(record) || null,
    message,
    recommendedAction: meta.action || 'Review and repair the bond workflow data.',
  }
}

function pushUnique(findings, finding) {
  const key = [
    finding.code,
    finding.transactionId,
    finding.entityId,
    finding.status,
    finding.stage,
  ].join('|')
  if (findings.some((item) => [item.code, item.transactionId, item.entityId, item.status, item.stage].join('|') === key)) return
  findings.push(finding)
}

function analyzeRecord(record = {}, options = {}) {
  const now = options.now || new Date()
  const thresholds = { ...DEFAULT_THRESHOLDS, ...(options.thresholds || {}) }
  const findings = []
  const { rawStage, stage } = getWorkflowStage(record)
  const intakeStatus = getIntakeStatus(record)

  if (rawStage && !stage) {
    pushUnique(findings, buildFinding({
      record,
      code: 'invalid_bond_workflow_stage',
      status: normalizeKey(rawStage),
      message: `Workflow stage "${rawStage}" is not mapped to a canonical bond finance stage.`,
    }))
  }

  if (intakeStatus === 'ready_for_review') {
    if (hasPickedUpEvidence(record)) {
      pushUnique(findings, buildFinding({
        record,
        code: 'accepted_file_still_in_intake',
        stage: intakeStatus,
        status: getAssignmentStatus(record),
        message: 'The intake is still marked ready for review even though assignment/acceptance evidence exists.',
      }))
    }
    if (!hasActionOwner(record)) {
      pushUnique(findings, buildFinding({
        record,
        code: 'orphaned_ready_for_review',
        stage: intakeStatus,
        message: 'The intake is ready for review but has no bond workspace, originator, or consultant owner.',
      }))
    }
  } else if (ACTIVE_INTAKE_STATUSES.has(intakeStatus) && hasPickedUpEvidence(record)) {
    pushUnique(findings, buildFinding({
      record,
      code: 'accepted_file_still_in_intake',
      stage: intakeStatus,
      status: getAssignmentStatus(record),
      message: 'The file has pickup evidence but still sits in an intake queue.',
    }))
  }

  for (const application of record.applications) {
    const status = normalizeApplicationStatus(application.status || application.application_status || application.applicationStatus)
    if (status && !BOND_APPLICATION_STATUSES.has(status)) {
      pushUnique(findings, buildFinding({
        record,
        code: 'invalid_bond_application_status',
        entityId: firstText(application.id, application.application_id),
        status,
        message: `Bond application status "${application.status || application.application_status}" is not canonical.`,
      }))
    }
  }

  for (const quote of record.quotes) {
    const status = normalizeQuoteStatus(quote.quote_status || quote.quoteStatus || quote.status)
    if (status && !BOND_QUOTE_STATUSES.has(status)) {
      pushUnique(findings, buildFinding({
        record,
        code: 'invalid_bond_quote_status',
        entityId: firstText(quote.id, quote.quote_id),
        status,
        message: `Bond quote status "${quote.quote_status || quote.quoteStatus || quote.status}" is not canonical.`,
      }))
    }
  }

  const instruction = getInstruction(record)
  if (stage && isAtOrAfter(stage, 'grant_received') && !hasGrantDocument(instruction)) {
    pushUnique(findings, buildFinding({
      record,
      code: 'missing_grant_document',
      stage,
      message: 'The bond workflow is at or beyond Grant Received but no grant document is attached.',
    }))
  }
  if (stage && isAtOrAfter(stage, 'grant_signed') && !hasSignedGrantDocument(instruction)) {
    pushUnique(findings, buildFinding({
      record,
      code: 'missing_signed_grant_document',
      stage,
      message: 'The bond workflow is at or beyond Grant Signed but no signed grant is attached.',
    }))
  }
  if (stage && isAtOrAfter(stage, 'grant_submitted') && !hasGrantSubmittedEvidence(instruction)) {
    pushUnique(findings, buildFinding({
      record,
      code: 'missing_grant_submission_evidence',
      stage,
      message: 'The bond workflow is at or beyond Grant Submitted but submission evidence is missing.',
    }))
  }
  if (stage && isAtOrAfter(stage, 'instruction_sent') && (!hasInstructionDocument(instruction) || !hasInstructionSentEvidence(instruction))) {
    pushUnique(findings, buildFinding({
      record,
      code: 'missing_instruction_evidence',
      stage,
      message: 'The bond workflow is at or beyond Instruction Sent but instruction document/sent evidence is incomplete.',
    }))
  }
  if (stage === 'instruction_sent' && !hasBondAttorneyHandoffEvidence(record)) {
    const instructionAge = ageInDays(firstText(instruction.instruction_sent_at, instruction.instructionSentAt, record.transaction.updated_at), now)
    pushUnique(findings, buildFinding({
      record,
      code: 'instruction_sent_without_attorney_handoff',
      severity: instructionAge !== null && instructionAge < thresholds.attorneyHandoffDays ? 'warning' : 'critical',
      stage,
      ageDays: instructionAge,
      message: 'Instruction has been sent, but no bond attorney assignment or bond instruction received evidence was found.',
    }))
  }

  for (const application of record.applications) {
    const status = normalizeApplicationStatus(application.status || application.application_status || application.applicationStatus)
    const lastActivity = getLastActivity(record, application)
    const staleDays = ageInDays(lastActivity, now)
    if (['submitted', 'in_review'].includes(status) && staleDays !== null && staleDays >= thresholds.bankFeedbackDays) {
      const hasFeedback = Boolean(
        firstText(application.feedback_received_at, application.feedbackReceivedAt) ||
          record.quotes.length ||
          ['feedback_received', 'quote_received', 'approved', 'buyer_approved', 'declined'].includes(status),
      )
      if (!hasFeedback) {
        pushUnique(findings, buildFinding({
          record,
          code: 'stale_bank_feedback_wait',
          severity: severityForExternalWait(record),
          entityId: firstText(application.id, application.application_id),
          status,
          ageDays: staleDays,
          message: `Bank application has waited ${staleDays} days without feedback or captured quote evidence.`,
        }))
      }
    }
    if (status === 'additional_documents_required' && staleDays !== null && staleDays >= thresholds.additionalDocumentsDays) {
      pushUnique(findings, buildFinding({
        record,
        code: 'stale_additional_documents_wait',
        severity: severityForExternalWait(record),
        entityId: firstText(application.id, application.application_id),
        status,
        ageDays: staleDays,
        message: `Additional documents have been outstanding for ${staleDays} days.`,
      }))
    }
  }

  return findings
}

export function analyzeBondOriginatorRows(payload = {}, options = {}) {
  const records = normalizePayload(payload)
  const findings = []
  let bondTransactions = 0
  let skippedInactive = 0

  for (const record of records) {
    if (!record.transactionId) continue
    if (!isBondRelevant(record)) continue
    bondTransactions += 1
    if (isInactive(record)) {
      skippedInactive += 1
      continue
    }
    findings.push(...analyzeRecord(record, options))
  }

  const criticalCount = findings.filter((finding) => finding.severity === 'critical').length
  const warningCount = findings.filter((finding) => finding.severity === 'warning').length
  const categories = Object.values(findings.reduce((accumulator, finding) => {
    if (!accumulator[finding.code]) {
      accumulator[finding.code] = {
        code: finding.code,
        label: finding.label,
        severity: finding.severity,
        count: 0,
      }
    }
    accumulator[finding.code].count += 1
    if (finding.severity === 'critical') accumulator[finding.code].severity = 'critical'
    return accumulator
  }, {})).sort((left, right) => {
    if (left.severity !== right.severity) return left.severity === 'critical' ? -1 : 1
    return right.count - left.count
  })

  const failOnWarning = Boolean(options.failOnWarning)
  const exitCode = criticalCount > 0 || (failOnWarning && warningCount > 0) ? 1 : 0

  return {
    generatedAt: (options.now || new Date()).toISOString(),
    mode: options.mode || 'fixture',
    readOnly: true,
    thresholds: { ...DEFAULT_THRESHOLDS, ...(options.thresholds || {}) },
    totals: {
      transactionsScanned: records.length,
      bondTransactions,
      skippedInactive,
      findings: findings.length,
      critical: criticalCount,
      warning: warningCount,
    },
    categories,
    findings: findings.sort((left, right) => {
      if (left.severity !== right.severity) return left.severity === 'critical' ? -1 : 1
      return String(left.transactionId || '').localeCompare(String(right.transactionId || ''))
    }),
    gate: {
      status: exitCode === 0 ? 'pass' : 'fail',
      exitCode,
      failOnWarning,
    },
  }
}

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {}
  const output = {}
  for (const rawLine of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
    if (!match) continue
    const [, key, rawValue] = match
    output[key] = rawValue.trim().replace(/^['"]|['"]$/g, '')
  }
  return output
}

function loadEnv() {
  return {
    ...parseEnvFile(path.join(APP_ROOT, '.env')),
    ...parseEnvFile(path.join(APP_ROOT, '.env.local')),
    ...parseEnvFile(path.join(APP_ROOT, '.env.staging.local')),
    ...process.env,
  }
}

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    input: normalizeText(process.env.BOND_ORIGINATOR_STUCK_FILE_SWEEP_INPUT),
    live: false,
    confirmStaging: false,
    failOnWarning: normalizeKey(process.env.BOND_SWEEP_FAIL_ON_WARNING) === 'true',
    limit: Number(process.env.BOND_SWEEP_LIMIT || 1000),
    thresholds: { ...DEFAULT_THRESHOLDS },
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--input') options.input = normalizeText(argv[++index])
    else if (arg === '--live') options.live = true
    else if (arg === '--confirm-staging') options.confirmStaging = true
    else if (arg === '--fail-on-warning') options.failOnWarning = true
    else if (arg === '--limit') options.limit = Number(argv[++index] || options.limit)
    else if (arg === '--bank-feedback-days') options.thresholds.bankFeedbackDays = Number(argv[++index] || DEFAULT_THRESHOLDS.bankFeedbackDays)
    else if (arg === '--additional-documents-days') options.thresholds.additionalDocumentsDays = Number(argv[++index] || DEFAULT_THRESHOLDS.additionalDocumentsDays)
    else if (arg === '--attorney-handoff-days') options.thresholds.attorneyHandoffDays = Number(argv[++index] || DEFAULT_THRESHOLDS.attorneyHandoffDays)
  }
  if (!Number.isFinite(options.limit) || options.limit <= 0) options.limit = 1000
  for (const key of Object.keys(options.thresholds)) {
    if (!Number.isFinite(options.thresholds[key]) || options.thresholds[key] < 0) {
      options.thresholds[key] = DEFAULT_THRESHOLDS[key]
    }
  }
  return options
}

function isMissingTableOrColumn(error = {}) {
  const code = normalizeText(error.code).toUpperCase()
  const message = normalizeText(error.message).toLowerCase()
  return code === '42P01' || code === '42703' || message.includes('does not exist') || message.includes('could not find')
}

async function selectMaybe(client, table, buildQuery, warnings) {
  const query = await buildQuery(client.from(table))
  if (query.error) {
    if (isMissingTableOrColumn(query.error)) {
      warnings.push({ table, message: query.error.message || String(query.error) })
      return []
    }
    throw query.error
  }
  return query.data || []
}

async function loadLivePayload(options = {}) {
  if (!options.confirmStaging) {
    throw new Error('Live read-only sweep requires --confirm-staging.')
  }
  const env = loadEnv()
  const supabaseUrl = normalizeText(env.SUPABASE_URL || env.VITE_SUPABASE_URL)
  const serviceRoleKey = normalizeText(env.SUPABASE_SERVICE_ROLE_KEY)
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for live sweep.')
  }

  const { createClient } = await import('@supabase/supabase-js')
  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const warnings = []
  let transactions = await selectMaybe(
    client,
    'transactions',
    (table) => table
      .select('*')
      .or('finance_type.ilike.%bond%,finance_type.eq.hybrid,finance_managed_by.eq.bond_originator,bond_workspace_id.not.is.null,assigned_bond_originator_email.not.is.null,bond_originator.not.is.null')
      .limit(options.limit),
    warnings,
  )

  if (!transactions.length && warnings.length) {
    transactions = await selectMaybe(
      client,
      'transactions',
      (table) => table.select('*').limit(options.limit),
      warnings,
    )
  }

  const ids = transactions.map((row) => normalizeText(row.id)).filter(Boolean)
  const byIds = (table) => table.select('*').in('transaction_id', ids)

  const [
    workflows,
    applications,
    quotes,
    instructions,
    events,
    rolePlayers,
    participants,
    attorneyAssignments,
    workflowSteps,
  ] = ids.length
    ? await Promise.all([
        selectMaybe(client, 'transaction_finance_workflows', byIds, warnings),
        selectMaybe(client, 'transaction_bond_applications', byIds, warnings),
        selectMaybe(client, 'transaction_bond_quotes', byIds, warnings),
        selectMaybe(client, 'transaction_bond_instructions', byIds, warnings),
        selectMaybe(client, 'transaction_events', byIds, warnings),
        selectMaybe(client, 'transaction_role_players', byIds, warnings),
        selectMaybe(client, 'transaction_participants', byIds, warnings),
        selectMaybe(client, 'transaction_attorney_assignments', byIds, warnings),
        selectMaybe(client, 'transaction_workflow_steps', byIds, warnings),
      ])
    : [[], [], [], [], [], [], [], [], []]

  return {
    payload: {
      transactions,
      workflows,
      applications,
      quotes,
      instructions,
      events,
      rolePlayers,
      participants,
      attorneyAssignments,
      workflowSteps,
    },
    warnings,
  }
}

function loadInputPayload(inputPath = '') {
  if (!inputPath) throw new Error('Provide --input <json> or run with --live --confirm-staging.')
  const resolved = path.resolve(process.cwd(), inputPath)
  if (!fs.existsSync(resolved)) throw new Error(`Input file not found: ${resolved}`)
  return JSON.parse(fs.readFileSync(resolved, 'utf8'))
}

function printReport(report = {}, liveWarnings = []) {
  console.log('Bond Originator Stuck File Sweep (read-only)')
  console.log(`Gate: ${report.gate.status.toUpperCase()} | scanned=${report.totals.transactionsScanned} bond=${report.totals.bondTransactions} findings=${report.totals.findings} critical=${report.totals.critical} warning=${report.totals.warning}`)
  if (liveWarnings.length) {
    console.log('\nLive read warnings:')
    console.table(liveWarnings)
  }
  console.log('\nFinding summary:')
  console.table(report.categories.length ? report.categories : [{ code: 'none', label: 'No findings', severity: 'pass', count: 0 }])
  console.log('\nFindings:')
  console.table(
    report.findings.length
      ? report.findings.map((finding) => ({
          severity: finding.severity,
          code: finding.code,
          transactionId: finding.transactionId,
          stage: finding.stage || '',
          status: finding.status || '',
          ageDays: finding.ageDays ?? '',
          owner: finding.owner || '',
          nextAction: finding.nextAction || '',
        }))
      : [{ severity: 'pass', code: 'none', transactionId: '', stage: '', status: '', ageDays: '', owner: '', nextAction: '' }],
  )
  console.log(JSON.stringify(report, null, 2))
}

async function main() {
  const options = parseArgs()
  try {
    const { payload, warnings } = options.live
      ? await loadLivePayload(options)
      : { payload: loadInputPayload(options.input), warnings: [] }
    const report = analyzeBondOriginatorRows(payload, {
      mode: options.live ? 'staging-read-only' : 'fixture',
      thresholds: options.thresholds,
      failOnWarning: options.failOnWarning,
    })
    if (warnings.length) report.liveReadWarnings = warnings
    printReport(report, warnings)
    process.exitCode = report.gate.exitCode
  } catch (error) {
    const report = {
      generatedAt: new Date().toISOString(),
      mode: options.live ? 'staging-read-only' : 'fixture',
      readOnly: true,
      totals: { transactionsScanned: 0, bondTransactions: 0, skippedInactive: 0, findings: 0, critical: 1, warning: 0 },
      categories: [{ code: 'sweep_blocked', label: 'Sweep Blocked', severity: 'critical', count: 1 }],
      findings: [{
        severity: 'critical',
        code: 'sweep_blocked',
        label: 'Sweep Blocked',
        transactionId: null,
        message: error?.message || String(error),
        recommendedAction: 'Fix the sweep prerequisites and rerun.',
      }],
      gate: { status: 'blocked', exitCode: 1, failOnWarning: options.failOnWarning },
    }
    printReport(report)
    process.exitCode = 1
  }
}

const currentFile = fileURLToPath(import.meta.url)
const invokedFile = process.argv[1] ? path.resolve(process.argv[1]) : ''
if (invokedFile && currentFile === invokedFile) {
  await main()
}
