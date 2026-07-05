import {
  BOND_HYBRID_FINANCE_STAGE_LABELS,
  BOND_HYBRID_FINANCE_STAGES,
  normalizeBondHybridFinanceStage,
} from '../core/transactions/bondHybridFinanceWorkflow'
import { resolveEffectiveBondAssignment } from './bondAssignmentService'

export const BOND_OPERATIONAL_DIAGNOSTIC_STAGES = Object.freeze([
  'application_arrived',
  ...BOND_HYBRID_FINANCE_STAGES,
])

const STAGE_LABELS = Object.freeze({
  application_arrived: 'Application Arrived',
  ...BOND_HYBRID_FINANCE_STAGE_LABELS,
})

const EXPECTED_QUEUE_BY_STAGE = Object.freeze({
  bond_approved: 'awaiting_grant',
  grant_received: 'grant_received',
  grant_signed: 'grant_signed',
  grant_submitted: 'ready_for_instruction',
})

const NEXT_ACTION_BY_STAGE = Object.freeze({
  application_arrived: 'Accept and assign the bond application.',
  intake: 'Open the intake and confirm buyer readiness.',
  documents: 'Collect and verify buyer finance documents.',
  submitted_to_banks: 'Monitor bank submissions and capture lender feedback.',
  bank_review: 'Resolve bank queries or capture quote feedback.',
  quote_received: 'Present quotes and capture the buyer decision.',
  quote_accepted: 'Confirm bond approval and request the formal grant.',
  bond_approved: 'Capture the lender grant when received.',
  grant_received: 'Get the buyer-signed grant uploaded.',
  grant_signed: 'Submit the signed grant for attorney instruction.',
  grant_submitted: 'Prepare and send the attorney instruction.',
  instruction_sent: 'Monitor attorney handoff and registration readiness.',
  complete: 'Archive finance workflow evidence.',
})

const QUEUE_HREF_BY_KEY = Object.freeze({
  awaiting_grant: '/bond/applications?view=bond-approved',
  grant_received: '/bond/applications?view=grant-received',
  grant_signed: '/bond/applications?view=grant-signed',
  ready_for_instruction: '/bond/applications?view=grant-submitted',
})

const ISSUE_REMEDIATION_META = Object.freeze({
  missing_transaction_id: {
    actionLabel: 'Repair transaction link',
    ownerRole: 'Operations',
    href: '/bond/applications?view=all&diagnostic=missing_transaction_id',
  },
  legacy_stage_only: {
    actionLabel: 'Backfill workflow',
    ownerRole: 'Operations',
    href: '/bond/applications?view=all&diagnostic=legacy_stage_only',
  },
  stale_legacy_finance_status: {
    actionLabel: 'Review legacy status',
    ownerRole: 'Operations',
    href: '/bond/applications?view=all&diagnostic=stale_legacy_finance_status',
  },
  missing_bond_workspace_assignment: {
    actionLabel: 'Assign workspace',
    ownerRole: 'Manager',
    href: '/bond/organisation?view=branches',
  },
  missing_primary_consultant: {
    actionLabel: 'Assign consultant',
    ownerRole: 'Manager',
    href: '/bond/organisation?view=consultants',
  },
  missing_processor_assignment: {
    actionLabel: 'Assign processor',
    ownerRole: 'Processor Lead',
    href: '/bond/organisation?view=processors',
  },
  missing_grant_document: {
    actionLabel: 'Attach grant document',
    ownerRole: 'Bond Originator',
    queueKey: 'grant_received',
    evidenceKey: 'grant_document',
    href: '/bond/applications?view=grant-received',
  },
  missing_signed_grant_document: {
    actionLabel: 'Attach signed grant',
    ownerRole: 'Bond Originator',
    queueKey: 'grant_signed',
    evidenceKey: 'signed_grant_document',
    href: '/bond/applications?view=grant-signed',
  },
  missing_grant_submission_evidence: {
    actionLabel: 'Record grant submission',
    ownerRole: 'Bond Originator',
    queueKey: 'ready_for_instruction',
    evidenceKey: 'grant_submission',
    href: '/bond/applications?view=grant-submitted',
  },
  missing_instruction_evidence: {
    actionLabel: 'Attach instruction evidence',
    ownerRole: 'Bond Originator',
    queueKey: 'ready_for_instruction',
    evidenceKey: 'attorney_instruction',
    href: '/bond/applications?view=instruction-sent',
  },
})

const STAGE_INDEX = BOND_HYBRID_FINANCE_STAGES.reduce((accumulator, stage, index) => {
  accumulator[stage] = index
  return accumulator
}, {})

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase()
}

function encodePathSegment(value = '') {
  return encodeURIComponent(normalizeText(value))
}

function getFirstArrayItem(value) {
  return Array.isArray(value) ? value.find(Boolean) || null : value || null
}

function getRecordTransaction(record = {}) {
  return record?.transaction && typeof record.transaction === 'object' ? record.transaction : record
}

function getCanonicalBondFinanceWorkflow(record = {}) {
  const transaction = getRecordTransaction(record)
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

function getInstructionEvidence(record = {}) {
  const workflowData = getCanonicalBondFinanceWorkflow(record) || {}
  const transaction = getRecordTransaction(record)
  return (
    workflowData.instruction ||
    getFirstArrayItem(record?.transaction_bond_instructions || transaction.transaction_bond_instructions) ||
    transaction.bondInstruction ||
    transaction.bond_instruction ||
    {}
  )
}

function hasGrantDocument(instruction = {}) {
  return Boolean(instruction?.grantDocumentId || instruction?.grant_document_id)
}

function hasSignedGrantDocument(instruction = {}) {
  return Boolean(instruction?.signedGrantDocumentId || instruction?.signed_grant_document_id)
}

function hasGrantSubmittedEvidence(instruction = {}) {
  return Boolean(
    instruction?.grantSubmitted ||
      instruction?.grant_submitted ||
      instruction?.grantSubmittedAt ||
      instruction?.grant_submitted_at,
  )
}

function hasInstructionDocument(instruction = {}) {
  return Boolean(instruction?.instructionDocumentId || instruction?.instruction_document_id)
}

function hasInstructionSentEvidence(instruction = {}) {
  return Boolean(
    instruction?.instructionSent ||
      instruction?.instruction_sent ||
      instruction?.instructionSentAt ||
      instruction?.instruction_sent_at,
  )
}

function resolveLegacyStage(record = {}) {
  const transaction = getRecordTransaction(record)
  const signal = [
    transaction.finance_status,
    transaction.financeStatus,
    transaction.current_sub_stage_summary,
    transaction.stage,
    transaction.next_action,
    transaction.comment,
  ]
    .map(normalizeLower)
    .filter(Boolean)
    .join(' ')

  if (!signal) return ''
  if (/(instruction sent|attorney instructed|handoff to attorney|instruction issued)/i.test(signal)) return 'instruction_sent'
  if (/(grant submitted|signed grant submitted|ready for instruction)/i.test(signal)) return 'grant_submitted'
  if (/(grant signed|loan acceptance signed)/i.test(signal)) return 'grant_signed'
  if (/(grant received|formal grant|bond grant received)/i.test(signal)) return 'grant_received'
  if (/(bond approved|approval granted|\bapproved\b)/i.test(signal)) return 'bond_approved'
  if (/(quote accepted|offer accepted|approved by buyer|buyer approved)/i.test(signal)) return 'quote_accepted'
  if (/(quote received|offer received)/i.test(signal)) return 'quote_received'
  if (/(bank feedback|bank review|lender query|valuation query)/i.test(signal)) return 'bank_review'
  if (/(submitted to bank|submitted_to_banks|application submitted|submitted)/i.test(signal)) return 'submitted_to_banks'
  if (/(document|docs|fica|payslip|bank statement)/i.test(signal)) return 'documents'
  if (/(intake|application open|application in progress|ready for review)/i.test(signal)) return 'intake'
  return ''
}

function isFinanceStage(stage = '') {
  return Object.prototype.hasOwnProperty.call(STAGE_INDEX, stage)
}

function isAtOrAfter(stage = '', target = '') {
  if (!isFinanceStage(stage) || !isFinanceStage(target)) return false
  return STAGE_INDEX[stage] >= STAGE_INDEX[target]
}

function getTransactionHref(transactionId = '', diagnosticCode = '') {
  const id = normalizeText(transactionId)
  if (!id) return ''
  const suffix = diagnosticCode ? `?diagnostic=${encodePathSegment(diagnosticCode)}` : ''
  return `/bond/files/${encodePathSegment(id)}${suffix}`
}

function getIssueRemediation({ code = '', transactionId = null } = {}) {
  const meta = ISSUE_REMEDIATION_META[code] || {}
  const transactionHref = getTransactionHref(transactionId, code)
  const queueHref = meta.queueKey ? QUEUE_HREF_BY_KEY[meta.queueKey] || meta.href || '/bond/applications' : meta.href || '/bond/applications'
  return {
    actionLabel: meta.actionLabel || 'Review issue',
    actionHref: transactionHref || queueHref,
    queueHref,
    queueKey: meta.queueKey || null,
    evidenceKey: meta.evidenceKey || null,
    ownerRole: meta.ownerRole || 'Operations',
  }
}

function buildIssue({ code, severity = 'warning', transactionId = null, stage = '', message, recommendation = '' } = {}) {
  return {
    code,
    severity,
    transactionId,
    stage,
    message,
    recommendation,
    ...getIssueRemediation({ code, transactionId }),
  }
}

function getTransactionId(record = {}) {
  const transaction = getRecordTransaction(record)
  return normalizeText(transaction.id || transaction.transaction_id || record?.transactionId || record?.id) || null
}

function hasLegacyBondAssignee(transaction = {}, assignment = {}) {
  return Boolean(
    assignment.legacyBondOriginatorEmail ||
      assignment.legacyBondOriginator ||
      transaction.assigned_bond_originator_email ||
      transaction.bond_originator,
  )
}

function getAssignmentWorkspaceId(transaction = {}, assignment = {}) {
  return (
    assignment.workspaceId ||
    assignment.bondWorkspaceId ||
    normalizeText(transaction.assigned_organisation_id || transaction.assignedOrganisationId) ||
    normalizeText(transaction.bond_workspace_id || transaction.bondWorkspaceId) ||
    normalizeText(transaction.organisation_id || transaction.organisationId || transaction.workspace_id || transaction.workspaceId) ||
    null
  )
}

function getAssignmentPrimaryConsultantId(transaction = {}, assignment = {}) {
  return (
    assignment.primaryConsultantUserId ||
    normalizeText(transaction.primary_bond_consultant_user_id || transaction.primaryBondConsultantUserId) ||
    normalizeText(transaction.assigned_user_id || transaction.assignedUserId) ||
    null
  )
}

function getAssignmentProcessorId(transaction = {}, assignment = {}) {
  return (
    assignment.processorUserId ||
    normalizeText(transaction.assigned_bond_processor_user_id || transaction.assignedBondProcessorUserId || transaction.processor_user_id || transaction.processorUserId) ||
    null
  )
}

function getLegacyStageDrift(canonicalStage = '', legacyStage = '') {
  if (!canonicalStage || !legacyStage || canonicalStage === legacyStage) return 0
  if (!isFinanceStage(canonicalStage) || !isFinanceStage(legacyStage)) return 0
  return STAGE_INDEX[canonicalStage] - STAGE_INDEX[legacyStage]
}

function diagnoseRecord(record = {}) {
  const transaction = getRecordTransaction(record)
  const transactionId = getTransactionId(record)
  const workflowData = getCanonicalBondFinanceWorkflow(record)
  const canonicalStage = getCanonicalBondFinanceStage(record)
  const legacyStage = resolveLegacyStage(record)
  const stage = canonicalStage || legacyStage || 'application_arrived'
  const assignment = resolveEffectiveBondAssignment(transaction)
  const assignmentWorkspaceId = getAssignmentWorkspaceId(transaction, assignment)
  const primaryConsultantUserId = getAssignmentPrimaryConsultantId(transaction, assignment)
  const processorUserId = getAssignmentProcessorId(transaction, assignment)
  const instruction = getInstructionEvidence(record)
  const issues = []

  if (!transactionId) {
    issues.push(buildIssue({
      code: 'missing_transaction_id',
      severity: 'critical',
      stage,
      message: 'A bond operational row is missing a transaction id.',
      recommendation: 'Ensure every bond application row is linked to a transaction before it reaches the dashboard.',
    }))
  }

  if (!canonicalStage && legacyStage && legacyStage !== 'intake') {
    issues.push(buildIssue({
      code: 'legacy_stage_only',
      severity: 'warning',
      transactionId,
      stage,
      message: 'This row is relying on legacy finance status text instead of the canonical finance workflow.',
      recommendation: 'Create or backfill the bond/hybrid finance workflow row for this transaction.',
    }))
  }

  if (workflowData && canonicalStage && legacyStage && getLegacyStageDrift(canonicalStage, legacyStage) >= 2) {
    issues.push(buildIssue({
      code: 'stale_legacy_finance_status',
      severity: 'info',
      transactionId,
      stage,
      message: 'Legacy finance status is behind the canonical workflow stage.',
      recommendation: 'Prefer the canonical workflow in dashboards and consider backfilling stale finance_status text.',
    }))
  }

  if (!assignmentWorkspaceId) {
    issues.push(buildIssue({
      code: 'missing_bond_workspace_assignment',
      severity: stage === 'application_arrived' ? 'warning' : 'critical',
      transactionId,
      stage,
      message: 'The application is not linked to a bond originator workspace.',
      recommendation: 'Repair routing or assign the application to the correct bond originator workspace.',
    }))
  }

  if (isAtOrAfter(stage, 'documents') && !primaryConsultantUserId && !hasLegacyBondAssignee(transaction, assignment)) {
    issues.push(buildIssue({
      code: 'missing_primary_consultant',
      severity: 'warning',
      transactionId,
      stage,
      message: 'The application has progressed without a primary bond consultant.',
      recommendation: 'Assign a consultant so ownership, queues, and SLA follow-up remain visible.',
    }))
  }

  if (isAtOrAfter(stage, 'submitted_to_banks') && !processorUserId) {
    issues.push(buildIssue({
      code: 'missing_processor_assignment',
      severity: 'warning',
      transactionId,
      stage,
      message: 'The application has reached bank submission without a processor assignment.',
      recommendation: 'Assign a processor before bank feedback and grant handling starts.',
    }))
  }

  if (isAtOrAfter(stage, 'grant_received') && !hasGrantDocument(instruction)) {
    issues.push(buildIssue({
      code: 'missing_grant_document',
      severity: 'critical',
      transactionId,
      stage,
      message: 'The workflow is at or beyond Grant Received but no grant document is attached.',
      recommendation: 'Attach the lender grant document before progressing the grant workflow.',
    }))
  }

  if (isAtOrAfter(stage, 'grant_signed') && !hasSignedGrantDocument(instruction)) {
    issues.push(buildIssue({
      code: 'missing_signed_grant_document',
      severity: 'critical',
      transactionId,
      stage,
      message: 'The workflow is at or beyond Grant Signed but no signed grant document is attached.',
      recommendation: 'Attach the buyer-signed grant document before marking the grant signed or submitted.',
    }))
  }

  if (isAtOrAfter(stage, 'grant_submitted') && !hasGrantSubmittedEvidence(instruction)) {
    issues.push(buildIssue({
      code: 'missing_grant_submission_evidence',
      severity: 'critical',
      transactionId,
      stage,
      message: 'The workflow is at or beyond Grant Submitted but submission evidence is missing.',
      recommendation: 'Record the grant submission timestamp before attorney instruction handoff.',
    }))
  }

  if (isAtOrAfter(stage, 'instruction_sent') && (!hasInstructionDocument(instruction) || !hasInstructionSentEvidence(instruction))) {
    issues.push(buildIssue({
      code: 'missing_instruction_evidence',
      severity: 'critical',
      transactionId,
      stage,
      message: 'The workflow is at or beyond Instruction Sent but attorney instruction evidence is incomplete.',
      recommendation: 'Attach the instruction document and record the instruction-sent milestone.',
    }))
  }

  const criticalCount = issues.filter((issue) => issue.severity === 'critical').length
  const warningCount = issues.filter((issue) => issue.severity === 'warning').length
  const primaryIssue = issues.find((issue) => issue.severity === 'critical') || issues.find((issue) => issue.severity === 'warning') || null
  const rowAction = primaryIssue || getIssueRemediation({ code: '', transactionId })

  return {
    transactionId,
    stage,
    stageLabel: STAGE_LABELS[stage] || stage,
    canonicalStage: canonicalStage || null,
    legacyStage: legacyStage || null,
    expectedQueueKey: EXPECTED_QUEUE_BY_STAGE[stage] || null,
    nextAction: NEXT_ACTION_BY_STAGE[stage] || 'Review bond operational status.',
    assignment: {
      source: assignment.source || 'none',
      workspaceId: assignmentWorkspaceId,
      primaryConsultantUserId,
      processorUserId,
      managerUserId: assignment.managerUserId || null,
    },
    evidence: {
      hasGrantDocument: hasGrantDocument(instruction),
      hasSignedGrantDocument: hasSignedGrantDocument(instruction),
      hasGrantSubmittedEvidence: hasGrantSubmittedEvidence(instruction),
      hasInstructionDocument: hasInstructionDocument(instruction),
      hasInstructionSentEvidence: hasInstructionSentEvidence(instruction),
    },
    actionLabel: primaryIssue?.actionLabel || NEXT_ACTION_BY_STAGE[stage] || 'Review bond operational status.',
    actionHref: primaryIssue?.actionHref || rowAction.actionHref || getTransactionHref(transactionId) || (EXPECTED_QUEUE_BY_STAGE[stage] ? QUEUE_HREF_BY_KEY[EXPECTED_QUEUE_BY_STAGE[stage]] : '/bond/applications'),
    status: criticalCount ? 'critical' : warningCount ? 'warning' : 'healthy',
    issues,
  }
}

function buildStageCoverage(rows = []) {
  const counts = BOND_OPERATIONAL_DIAGNOSTIC_STAGES.reduce((accumulator, stage) => {
    accumulator[stage] = 0
    return accumulator
  }, {})

  for (const row of rows) {
    counts[row.stage] = (counts[row.stage] || 0) + 1
  }

  return BOND_OPERATIONAL_DIAGNOSTIC_STAGES.map((stage) => ({
    key: stage,
    label: STAGE_LABELS[stage] || stage,
    count: counts[stage] || 0,
  }))
}

function summarizeIssues(issues = []) {
  return issues.reduce((accumulator, issue) => {
    accumulator.bySeverity[issue.severity] = (accumulator.bySeverity[issue.severity] || 0) + 1
    accumulator.byCode[issue.code] = (accumulator.byCode[issue.code] || 0) + 1
    return accumulator
  }, {
    bySeverity: { critical: 0, warning: 0, info: 0 },
    byCode: {},
  })
}

function buildRemediationPlan(issues = []) {
  const severityRank = { critical: 3, warning: 2, info: 1 }
  const groups = new Map()

  for (const issue of issues) {
    const code = issue?.code || 'unknown_issue'
    const existing = groups.get(code) || {
      code,
      severity: issue?.severity || 'warning',
      count: 0,
      transactionIds: [],
      stages: [],
      actionLabel: issue?.actionLabel || 'Review issue',
      actionHref: issue?.queueHref || issue?.actionHref || '/bond/applications',
      queueHref: issue?.queueHref || null,
      queueKey: issue?.queueKey || null,
      evidenceKey: issue?.evidenceKey || null,
      ownerRole: issue?.ownerRole || 'Operations',
      recommendation: issue?.recommendation || '',
    }

    existing.count += 1
    if (issue?.transactionId && !existing.transactionIds.includes(issue.transactionId)) existing.transactionIds.push(issue.transactionId)
    if (issue?.stage && !existing.stages.includes(issue.stage)) existing.stages.push(issue.stage)
    if ((severityRank[issue?.severity] || 0) > (severityRank[existing.severity] || 0)) existing.severity = issue.severity
    if (!existing.recommendation && issue?.recommendation) existing.recommendation = issue.recommendation
    if (!existing.queueKey && issue?.queueKey) existing.queueKey = issue.queueKey
    if (!existing.queueHref && issue?.queueHref) existing.queueHref = issue.queueHref
    groups.set(code, existing)
  }

  return [...groups.values()]
    .sort((left, right) => (severityRank[right.severity] || 0) - (severityRank[left.severity] || 0) || right.count - left.count)
}

export function buildBondOperationalDiagnostics(records = [], options = {}) {
  const rows = (Array.isArray(records) ? records : []).filter(Boolean).map(diagnoseRecord)
  const issues = rows.flatMap((row) => row.issues)
  const issueSummary = summarizeIssues(issues)
  const remediationPlan = buildRemediationPlan(issues)
  const criticalCount = issueSummary.bySeverity.critical || 0
  const warningCount = issueSummary.bySeverity.warning || 0
  const status = criticalCount ? 'critical' : warningCount ? 'warning' : 'healthy'

  return {
    status,
    generatedAt: options.generatedAt || new Date().toISOString(),
    totals: {
      rows: rows.length,
      healthyRows: rows.filter((row) => row.status === 'healthy').length,
      warningRows: rows.filter((row) => row.status === 'warning').length,
      criticalRows: rows.filter((row) => row.status === 'critical').length,
      issues: issues.length,
      criticalIssues: criticalCount,
      warningIssues: warningCount,
      infoIssues: issueSummary.bySeverity.info || 0,
    },
    issueSummary,
    remediationPlan,
    stageCoverage: buildStageCoverage(rows),
    actionQueues: Object.entries(EXPECTED_QUEUE_BY_STAGE).map(([stage, queueKey]) => ({
      stage,
      queueKey,
      count: rows.filter((row) => row.stage === stage).length,
      label: STAGE_LABELS[stage] || stage,
      href: QUEUE_HREF_BY_KEY[queueKey] || '/bond/applications',
      actionLabel: NEXT_ACTION_BY_STAGE[stage] || 'Review queue',
    })),
    rows,
    issues,
  }
}

export default buildBondOperationalDiagnostics
