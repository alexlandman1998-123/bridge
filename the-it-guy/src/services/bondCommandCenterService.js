import { getAttorneyTransferStage, stageLabelFromAttorneyKey } from '../core/transactions/attorneySelectors'
import { buildBondDemoRows } from '../core/transactions/attorneyMockData'
import { getBondApplicationStage } from '../core/transactions/bondSelectors'
import { isBondFinanceType, normalizeFinanceType } from '../core/transactions/financeType'
import { getTransactionScopeForRow } from '../core/transactions/transactionScope'
import { fetchTransactionsByParticipantSummary } from '../lib/api'
import { canViewFinanceWorkflow } from './bondFinanceWorkflowOwnershipService'
import { resolveBondOperationalQueues } from './bondOperationalQueueService'
import { getBondDashboardReportingScope } from './bondDashboardService'
import { resolveEffectiveBondAssignment } from './bondAssignmentService'

const PRIORITY_CARD_META = Object.freeze({
  missing_documents: {
    title: 'Missing Documents',
    icon: 'file-warning',
    tone: 'amber',
    href: '/applications?queue=missing_documents',
    helper: 'Files blocked by outstanding client paperwork.',
  },
  submission_readiness: {
    title: 'Ready for Submission',
    icon: 'send',
    tone: 'blue',
    href: '/applications?queue=submission_readiness',
    helper: 'Applications prepared for bank submission.',
  },
  bank_feedback: {
    title: 'Bank Feedback',
    icon: 'building-bank',
    tone: 'indigo',
    href: '/applications?queue=bank_feedback',
    helper: 'Bank queries and lender responses waiting on action.',
  },
  overdue_applications: {
    title: 'Overdue Applications',
    icon: 'clock-alert',
    tone: 'rose',
    href: '/applications?queue=overdue_applications',
    helper: 'Applications with overdue next actions or finance deadlines.',
  },
  compliance_review: {
    title: 'Compliance Flags',
    icon: 'shield-alert',
    tone: 'emerald',
    href: '/applications?queue=compliance_review',
    helper: 'Files needing compliance review or risk clearance.',
  },
})

const PIPELINE_STAGE_META = Object.freeze([
  { key: 'lead', label: 'Lead', href: '/applications?queue=my_applications' },
  { key: 'docs_collection', label: 'Docs Collection', href: '/applications?queue=missing_documents' },
  { key: 'pre_approval', label: 'Pre-Approval', href: '/applications?stage=docs_received' },
  { key: 'submitted', label: 'Submitted', href: '/applications?stage=application_submitted' },
  { key: 'bank_feedback', label: 'Bank Feedback', href: '/applications?queue=bank_feedback' },
  { key: 'approved', label: 'Approved', href: '/applications?stage=approval_granted' },
  { key: 'grant_signed', label: 'Grant Signed', href: '/transactions?status=grant_signed' },
  { key: 'instruction_sent', label: 'Instruction Sent', href: '/transactions?status=instruction_sent' },
])

const DATE_RANGE_FILTERS = Object.freeze({
  this_month: () => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  },
  last_30_days: () => new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
  quarter_to_date: () => {
    const now = new Date()
    const quarter = Math.floor(now.getMonth() / 3)
    return new Date(now.getFullYear(), quarter * 3, 1)
  },
  all_time: () => null,
})

const DASHBOARD_ROLE_FOCUS = Object.freeze({
  consultant: {
    attentionText: 'Personal finance files to move today.',
    workloadHeading: 'My Consultant Load',
    workloadMode: 'consultant',
    focusChips: ['My Applications', 'Follow-ups', 'Ready to Submit'],
  },
  processor: {
    attentionText: 'Processing files needing handoff or lender action.',
    workloadHeading: 'Processor Queue',
    workloadMode: 'processor',
    focusChips: ['Ready for Submission', 'Bank Feedback', 'Turnaround Time'],
  },
  compliance: {
    attentionText: 'Compliance items, document reviews, and risk flags.',
    workloadHeading: 'Compliance Reviewers',
    workloadMode: 'compliance',
    focusChips: ['Compliance Flags', 'Awaiting Review', 'Risk Items'],
  },
  branch_manager: {
    attentionText: 'Branch-level operations across consultant and processor queues.',
    workloadHeading: 'Branch Workload',
    workloadMode: 'consultant',
    focusChips: ['Team Load', 'Overdue Files', 'Approval Rate'],
  },
  regional_manager: {
    attentionText: 'Regional performance and escalation watchlist.',
    workloadHeading: 'Regional Workload',
    workloadMode: 'consultant',
    focusChips: ['Regional Performance', 'Escalations', 'Bank Activity'],
  },
  owner_director: {
    attentionText: 'Company-wide finance operations, performance, and risk.',
    workloadHeading: 'Company Workload',
    workloadMode: 'consultant',
    focusChips: ['Company View', 'Revenue', 'Bank Performance'],
  },
  hq_manager: {
    attentionText: 'Workspace-wide operational control across branches and teams.',
    workloadHeading: 'Workspace Workload',
    workloadMode: 'consultant',
    focusChips: ['Company View', 'Escalations', 'Performance'],
  },
  independent_originator: {
    attentionText: 'Your independent bond desk and active deal book.',
    workloadHeading: 'My Workload',
    workloadMode: 'consultant',
    focusChips: ['My Pipeline', 'At Risk', 'Approvals'],
  },
  admin_staff: {
    attentionText: 'Shared support view across finance queues and admin follow-ups.',
    workloadHeading: 'Support Load',
    workloadMode: 'consultant',
    focusChips: ['Support Queue', 'Docs Follow-up', 'Escalations'],
  },
})

const TRANSACTION_STATUS_META = Object.freeze({
  all: { label: 'All Transactions' },
  active: { label: 'Active' },
  awaiting_instruction: { label: 'Awaiting Attorney Instruction' },
  bond_approved: { label: 'Bond Approved' },
  grant_signed: { label: 'Grant Signed' },
  instruction_sent: { label: 'Instruction Sent' },
  in_transfer: { label: 'In Transfer' },
  registered: { label: 'Registered' },
  at_risk: { label: 'At Risk' },
  cancelled: { label: 'Cancelled / Declined' },
})

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase()
}

function normalizeNumber(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function getDateOrNull(value) {
  const date = new Date(value || 0)
  return Number.isNaN(date.getTime()) ? null : date
}

function getTimestamp(value) {
  return getDateOrNull(value)?.getTime() || 0
}

function formatRelativeTime(value) {
  const date = getDateOrNull(value)
  if (!date) return 'No recent update'
  const deltaMs = Date.now() - date.getTime()
  const deltaMinutes = Math.max(0, Math.floor(deltaMs / 60000))
  if (deltaMinutes < 1) return 'Just now'
  if (deltaMinutes < 60) return `${deltaMinutes}m ago`
  if (deltaMinutes < 1440) return `${Math.floor(deltaMinutes / 60)}h ago`
  return `${Math.floor(deltaMinutes / 1440)}d ago`
}

function formatCurrency(value) {
  const amount = normalizeNumber(value, 0)
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    maximumFractionDigits: 0,
  }).format(amount)
}

function formatPercent(value, digits = 0) {
  const amount = normalizeNumber(value, 0)
  return `${amount.toFixed(digits)}%`
}

function getBuyerName(row = {}) {
  return (
    normalizeText(row?.buyer?.name) ||
    normalizeText(row?.transaction?.buyer_name) ||
    normalizeText(row?.transaction?.client_name) ||
    'Buyer pending'
  )
}

function getPropertyLabel(row = {}) {
  if (getTransactionScopeForRow(row) === 'private') {
    return (
      normalizeText(row?.transaction?.property_description) ||
      normalizeText(row?.transaction?.property_address_line_1) ||
      [row?.transaction?.suburb, row?.transaction?.city].map(normalizeText).filter(Boolean).join(', ') ||
      'Private property matter'
    )
  }

  const development = normalizeText(row?.development?.name)
  const unit = normalizeText(row?.unit?.unit_number)
  if (development && unit) return `${development} • Unit ${unit}`
  if (development) return development
  if (unit) return `Unit ${unit}`
  return 'Property pending'
}

function getPartnerLabel(row = {}) {
  return (
    normalizeText(row?.transaction?.assigned_agent) ||
    normalizeText(row?.transaction?.developer_name) ||
    normalizeText(row?.development?.name) ||
    'Partner not assigned'
  )
}

function getUpdatedAt(row = {}) {
  return (
    row?.transaction?.updated_at ||
    row?.transaction?.created_at ||
    row?.unit?.updated_at ||
    row?.unit?.created_at ||
    null
  )
}

function getBondAmount(row = {}) {
  const explicit = normalizeNumber(row?.transaction?.bond_amount, 0)
  if (explicit > 0) return explicit
  const purchase = normalizeNumber(
    row?.transaction?.purchase_price ?? row?.transaction?.sales_price ?? row?.unit?.price,
    0,
  )
  if (purchase <= 0) return 0
  const financeType = normalizeFinanceType(row?.transaction?.finance_type, { allowUnknown: true })
  if (financeType === 'combination') {
    return purchase * 0.65
  }
  return purchase
}

function getCommissionValue(row = {}) {
  const explicit = normalizeNumber(row?.transaction?.gross_commission_amount, 0)
  if (explicit > 0) return explicit
  return normalizeNumber(row?.transaction?.agent_commission_amount, 0) + normalizeNumber(row?.transaction?.agency_commission_amount, 0)
}

function getDaysSinceUpdate(row = {}) {
  const updatedAt = getTimestamp(getUpdatedAt(row))
  if (!updatedAt) return 0
  return Math.max(0, Math.floor((Date.now() - updatedAt) / (24 * 60 * 60 * 1000)))
}

function getDocumentMissingCount(row = {}) {
  const explicit = Number(row?.documentSummary?.missingCount)
  if (Number.isFinite(explicit)) return explicit
  const totalRequired = normalizeNumber(row?.documentSummary?.totalRequired, 0)
  const uploadedCount = normalizeNumber(row?.documentSummary?.uploadedCount, 0)
  if (totalRequired <= 0) return 0
  return Math.max(totalRequired - uploadedCount, 0)
}

function getSignalText(row = {}) {
  return [
    row?.transaction?.next_action,
    row?.transaction?.comment,
    row?.transaction?.finance_status,
    row?.transaction?.current_sub_stage_summary,
    row?.transaction?.stage,
  ]
    .map(normalizeText)
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

function getRoleFocus(reportingScope = {}) {
  return DASHBOARD_ROLE_FOCUS[reportingScope.dashboardMode] || DASHBOARD_ROLE_FOCUS.consultant
}

function getVisibleRows(user = {}, rows = [], { filterVisible = true } = {}) {
  const safeRows = Array.isArray(rows) ? rows : []
  if (filterVisible === false) return safeRows
  return safeRows.filter((row) => row?.transaction && canViewFinanceWorkflow(user, row.transaction))
}

function convertTransactionToRow(transaction = {}) {
  const buyerName = normalizeText(
    transaction.buyer_name ||
      transaction.client_name ||
      transaction.buyerName ||
      transaction.clientName,
  )
  const propertyLabel = normalizeText(
    transaction.property_name ||
      transaction.property_description ||
      transaction.property_address_line_1 ||
      transaction.propertyName,
  )
  const developmentName = normalizeText(transaction.development_name || transaction.developmentName)
  const unitNumber = normalizeText(transaction.unit_number || transaction.unitNumber)

  return {
    unit: unitNumber
      ? {
          id: normalizeText(transaction.unit_id || transaction.unitId) || null,
          unit_number: unitNumber,
          price: normalizeNumber(transaction.sales_price ?? transaction.purchase_price, 0),
        }
      : null,
    development: developmentName
      ? {
          id: normalizeText(transaction.development_id || transaction.developmentId) || null,
          name: developmentName || propertyLabel || 'Development',
        }
      : null,
    transaction,
    buyer: buyerName
      ? {
          id: normalizeText(transaction.buyer_id || transaction.buyerId) || null,
          name: buyerName,
          email: normalizeText(transaction.buyer_email || transaction.client_email) || null,
          phone: normalizeText(transaction.buyer_phone || transaction.client_phone) || null,
        }
      : null,
    stage: normalizeText(transaction.stage),
    mainStage: normalizeText(transaction.current_main_stage || transaction.mainStage),
    documentSummary: {
      uploadedCount: normalizeNumber(transaction.uploaded_documents_count, 0),
      totalRequired: normalizeNumber(transaction.total_required_documents, 0),
      missingCount: normalizeNumber(transaction.missing_documents_count, transaction.documents_missing ? 1 : 0),
    },
  }
}

function uniqueByTransaction(rows = []) {
  const byId = new Map()
  for (const row of rows) {
    const id = normalizeText(row?.transaction?.id)
    if (!id) continue
    const existing = byId.get(id)
    if (!existing || getTimestamp(getUpdatedAt(row)) >= getTimestamp(getUpdatedAt(existing))) {
      byId.set(id, row)
    }
  }
  return [...byId.values()]
}

function filterRowsByDateRange(rows = [], rangeKey = 'this_month') {
  const thresholdResolver = DATE_RANGE_FILTERS[rangeKey] || DATE_RANGE_FILTERS.this_month
  const threshold = thresholdResolver()
  if (!threshold) return rows
  return rows.filter((row) => {
    const updatedAt = getDateOrNull(getUpdatedAt(row))
    return updatedAt ? updatedAt >= threshold : false
  })
}

async function resolveBondRows(user = {}, workspaceId = '', options = {}) {
  const includeDemoRows = options.includeDemoRows !== false
  let rows = []

  if (Array.isArray(options.rows)) {
    rows = options.rows
  } else if (Array.isArray(options.transactions)) {
    rows = options.transactions.map(convertTransactionToRow)
  } else if (typeof options.fetchRows === 'function') {
    rows = await options.fetchRows({ user, workspaceId })
  } else {
    const userId = normalizeText(
      options.userId ||
        user?.profile?.id ||
        user?.currentMembership?.user_id ||
        user?.currentMembership?.userId ||
        user?.userId ||
        user?.id,
    )
    if (!userId) {
      return []
    }
    const fetchedRows = await fetchTransactionsByParticipantSummary({
      userId,
      roleType: 'bond_originator',
      organisationId: workspaceId,
    })
    rows = includeDemoRows ? buildBondDemoRows(fetchedRows || []) : fetchedRows || []
  }

  return uniqueByTransaction(getVisibleRows(user, rows, options))
}

function getPriorityRowsByKey(rows = [], key = '') {
  if (key === 'missing_documents') {
    return rows.filter((row) => getDocumentMissingCount(row) > 0)
  }
  if (key === 'submission_readiness') {
    return rows.filter((row) => resolvePipelineStageKey(row) === 'submitted' || resolvePipelineStageKey(row) === 'pre_approval')
  }
  if (key === 'bank_feedback') {
    return rows.filter((row) => resolvePipelineStageKey(row) === 'bank_feedback')
  }
  if (key === 'overdue_applications') {
    return rows.filter((row) => deriveRiskSignals(row).overdueDays > 0)
  }
  if (key === 'compliance_review') {
    return rows.filter((row) => deriveRiskSignals(row).complianceFlag)
  }
  return []
}

function getTrendLabel(rows = [], count = 0) {
  if (count <= 0) return 'All clear'
  const recentCount = rows.filter((row) => getDaysSinceUpdate(row) <= 7).length
  if (recentCount <= 0) return 'No recent movement'
  return `${recentCount} updated this week`
}

function resolvePipelineStageKey(row = {}) {
  const bondStage = getBondApplicationStage(row)
  const transferStage = getAttorneyTransferStage(row)
  const signal = getSignalText(row)

  if (transferStage === 'registered') return 'instruction_sent'
  if (/(instruction sent|attorney instructed|proceed to attorneys|guarantees issued|handoff to attorney)/i.test(signal)) {
    return 'instruction_sent'
  }
  if (/(grant signed|grant accepted|accept grant|loan acceptance signed)/i.test(signal)) {
    return 'grant_signed'
  }
  if (bondStage === 'approval_granted') return 'approved'
  if (bondStage === 'bank_reviewing') return 'bank_feedback'
  if (bondStage === 'application_submitted') return 'submitted'
  if (/(pre-approval|pre approval|decision in principle|dip)/i.test(signal)) return 'pre_approval'
  if (bondStage === 'docs_received') return 'pre_approval'
  if (bondStage === 'docs_requested') return 'docs_collection'
  return 'lead'
}

function deriveRiskSignals(row = {}) {
  const signal = getSignalText(row)
  const overdueDays = Math.max(getDaysSinceUpdate(row) - 7, 0)
  const missingDocuments = getDocumentMissingCount(row)
  const missingDocsStale = missingDocuments > 0 && getDaysSinceUpdate(row) >= 6
  const bankFeedback = resolvePipelineStageKey(row) === 'bank_feedback'
  const declined = getBondApplicationStage(row) === 'declined'
  const complianceFlag =
    /(compliance|fica expired|expired fica|pep|sanction|risk review|review required)/i.test(signal) ||
    normalizeLower(row?.transaction?.compliance_status).includes('review') ||
    normalizeLower(row?.transaction?.finance_status).includes('blocked')
  const transferStage = getAttorneyTransferStage(row)
  const attorneyBlocked =
    transferStage !== 'registered' &&
    /(awaiting attorney instruction|handoff blocked|guarantees outstanding|instruction pending)/i.test(signal)

  const reasons = []
  if (missingDocsStale) reasons.push(`${missingDocuments} document${missingDocuments === 1 ? '' : 's'} outstanding`)
  if (bankFeedback) reasons.push('Bank feedback needs action')
  if (complianceFlag) reasons.push('Compliance review required')
  if (attorneyBlocked) reasons.push('Attorney handoff not complete')
  if (overdueDays > 0) reasons.push(`${overdueDays} days overdue`)
  if (declined) reasons.push('Declined / blocked application')

  return {
    missingDocuments,
    bankFeedback,
    complianceFlag,
    overdueDays,
    attorneyBlocked,
    declined,
    atRisk: reasons.length > 0,
    reasons,
  }
}

function deriveFinanceLaneStage(row = {}) {
  const pipelineStage = resolvePipelineStageKey(row)
  const transferStage = getAttorneyTransferStage(row)
  const signal = getSignalText(row)

  if (transferStage === 'registered') return { key: 'registered', label: 'Registered' }
  if (transferStage === 'lodged_at_deeds_office') return { key: 'lodgement', label: 'Lodgement' }
  if (transferStage === 'preparation_in_progress' || transferStage === 'ready_for_lodgement') {
    return { key: 'attorney_transfer_in_progress', label: 'Attorney Transfer In Progress' }
  }
  if (pipelineStage === 'instruction_sent') return { key: 'bond_instruction_sent', label: 'Bond Instruction Sent' }
  if (pipelineStage === 'grant_signed') return { key: 'grant_signed', label: 'Grant Signed' }
  if (pipelineStage === 'approved') return { key: 'bond_approved', label: 'Bond Approved' }
  if (pipelineStage === 'bank_feedback') return { key: 'bank_feedback', label: 'Bank Feedback' }
  if (pipelineStage === 'submitted') return { key: 'submitted_to_banks', label: 'Submitted to Banks' }
  if (pipelineStage === 'pre_approval') return { key: 'pre_approval', label: 'Pre-Approval' }
  if (pipelineStage === 'docs_collection' || /application open|collect docs|finance pack/i.test(signal)) {
    return { key: 'bond_application_open', label: 'Bond Application Open' }
  }
  return { key: 'finance_requested', label: 'Finance Requested' }
}

function deriveTransactionStatus(row = {}) {
  const financeLane = deriveFinanceLaneStage(row)
  const risk = deriveRiskSignals(row)
  if (risk.declined) return 'cancelled'
  if (financeLane.key === 'registered') return 'registered'
  if (financeLane.key === 'bond_instruction_sent') return 'instruction_sent'
  if (financeLane.key === 'grant_signed') return 'grant_signed'
  if (financeLane.key === 'bond_approved') return 'bond_approved'
  if (financeLane.key === 'attorney_transfer_in_progress' || financeLane.key === 'lodgement') return 'in_transfer'
  if (risk.atRisk) return 'at_risk'
  if (/(awaiting attorney instruction|instruction pending)/i.test(getSignalText(row))) return 'awaiting_instruction'
  return 'active'
}

function getDisplayNameFromAssignment(assignment = {}, row = {}, mode = 'consultant') {
  const transaction = row?.transaction || {}
  if (mode === 'processor') {
    return (
      normalizeText(transaction.processor_name) ||
      normalizeText(transaction.assigned_bond_processor_name) ||
      normalizeText(assignment.processorName) ||
      normalizeText(assignment.processorEmail).split('@')[0] ||
      normalizeText(assignment.processorUserId) ||
      'Processor'
    )
  }
  if (mode === 'compliance') {
    return (
      normalizeText(transaction.compliance_name) ||
      normalizeText(assignment.complianceName) ||
      normalizeText(assignment.complianceEmail).split('@')[0] ||
      normalizeText(assignment.complianceUserId) ||
      'Compliance'
    )
  }
  return (
    normalizeText(transaction.bond_originator) ||
    normalizeText(assignment.primaryConsultantName) ||
    normalizeText(assignment.primaryConsultantEmail).split('@')[0] ||
    normalizeText(assignment.primaryConsultantUserId) ||
    'Consultant'
  )
}

function getGroupKeyFromAssignment(assignment = {}, row = {}, mode = 'consultant') {
  if (mode === 'processor') {
    return normalizeText(
      assignment.processorUserId ||
        assignment.processorEmail ||
        row?.transaction?.assigned_bond_processor_name,
    )
  }
  if (mode === 'compliance') {
    return normalizeText(
      assignment.complianceUserId ||
        assignment.complianceEmail ||
        row?.transaction?.compliance_name,
    )
  }
  return normalizeText(
    assignment.primaryConsultantUserId ||
      assignment.primaryConsultantEmail ||
      row?.transaction?.bond_originator,
  )
}

function toInitials(name = '') {
  const parts = normalizeText(name)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
  if (!parts.length) return 'BO'
  return parts.map((part) => part[0]?.toUpperCase() || '').join('')
}

function buildTeamWorkload(rows = [], reportingScope = {}) {
  const focus = getRoleFocus(reportingScope)
  const groups = new Map()

  for (const row of rows) {
    const assignment = resolveEffectiveBondAssignment(row?.transaction || {})
    const groupKey = getGroupKeyFromAssignment(assignment, row, focus.workloadMode)
    if (!groupKey) continue

    const current = groups.get(groupKey) || {
      key: groupKey,
      name: getDisplayNameFromAssignment(assignment, row, focus.workloadMode),
      initials: toInitials(getDisplayNameFromAssignment(assignment, row, focus.workloadMode)),
      activeApplications: 0,
      awaitingDocs: 0,
      submitted: 0,
      overdue: 0,
    }

    const stageKey = resolvePipelineStageKey(row)
    const risk = deriveRiskSignals(row)

    current.activeApplications += 1
    if (getDocumentMissingCount(row) > 0) current.awaitingDocs += 1
    if (['submitted', 'bank_feedback', 'approved', 'grant_signed', 'instruction_sent'].includes(stageKey)) {
      current.submitted += 1
    }
    if (risk.overdueDays > 0) current.overdue += 1

    groups.set(groupKey, current)
  }

  return [...groups.values()]
    .sort((left, right) => {
      if (right.activeApplications !== left.activeApplications) {
        return right.activeApplications - left.activeApplications
      }
      if (right.overdue !== left.overdue) {
        return right.overdue - left.overdue
      }
      return left.name.localeCompare(right.name)
    })
    .slice(0, 6)
}

function buildRecentBankActivity(rows = []) {
  return [...rows]
    .filter((row) => normalizeText(row?.transaction?.bank))
    .sort((left, right) => getTimestamp(getUpdatedAt(right)) - getTimestamp(getUpdatedAt(left)))
    .slice(0, 6)
    .map((row) => {
      const financeLane = deriveFinanceLaneStage(row)
      return {
        transactionId: normalizeText(row?.transaction?.id) || null,
        bank: normalizeText(row?.transaction?.bank) || 'Bank pending',
        client: getBuyerName(row),
        property: getPropertyLabel(row),
        action: normalizeText(row?.transaction?.next_action) || financeLane.label,
        statusLabel: financeLane.label,
        timeLabel: formatRelativeTime(getUpdatedAt(row)),
        statusTone:
          financeLane.key === 'bond_approved'
            ? 'success'
            : financeLane.key === 'bank_feedback'
              ? 'warning'
              : 'info',
      }
    })
}

function buildAtRiskApplications(rows = []) {
  return rows
    .map((row) => {
      const risk = deriveRiskSignals(row)
      if (!risk.atRisk) return null
      return {
        transactionId: normalizeText(row?.transaction?.id) || null,
        client: getBuyerName(row),
        property: getPropertyLabel(row),
        bank: normalizeText(row?.transaction?.bank) || 'Bank pending',
        bondValue: formatCurrency(getBondAmount(row)),
        reason: risk.reasons[0] || 'Needs attention',
        daysOverdue: risk.overdueDays,
        financeStage: deriveFinanceLaneStage(row).label,
      }
    })
    .filter(Boolean)
    .sort((left, right) => right.daysOverdue - left.daysOverdue || left.client.localeCompare(right.client))
    .slice(0, 6)
}

function buildPerformanceSnapshot(rows = []) {
  const currentWindow = rows.filter((row) => getDaysSinceUpdate(row) <= 30)
  const previousWindow = rows.filter((row) => {
    const days = getDaysSinceUpdate(row)
    return days > 30 && days <= 60
  })

  const currentApproved = currentWindow.filter((row) => deriveFinanceLaneStage(row).key === 'bond_approved').length
  const previousApproved = previousWindow.filter((row) => deriveFinanceLaneStage(row).key === 'bond_approved').length
  const currentTotal = currentWindow.length || rows.length || 1
  const previousTotal = previousWindow.length || 1
  const approvalRate = (currentApproved / currentTotal) * 100
  const previousApprovalRate = (previousApproved / previousTotal) * 100

  const turnaroundRows = rows.filter((row) => getTimestamp(row?.transaction?.created_at) && getTimestamp(getUpdatedAt(row)))
  const averageTurnaroundDays =
    turnaroundRows.length > 0
      ? turnaroundRows.reduce((sum, row) => {
          const created = getTimestamp(row?.transaction?.created_at)
          const updated = getTimestamp(getUpdatedAt(row))
          return sum + Math.max(0, Math.round((updated - created) / (24 * 60 * 60 * 1000)))
        }, 0) / turnaroundRows.length
      : 0

  const previousTurnaroundDays =
    previousWindow.length > 0
      ? previousWindow.reduce((sum, row) => {
          const created = getTimestamp(row?.transaction?.created_at)
          const updated = getTimestamp(getUpdatedAt(row))
          return sum + Math.max(0, Math.round((updated - created) / (24 * 60 * 60 * 1000)))
        }, 0) / previousWindow.length
      : averageTurnaroundDays

  const totalBondValue = rows.reduce((sum, row) => sum + getBondAmount(row), 0)
  const previousBondValue = previousWindow.reduce((sum, row) => sum + getBondAmount(row), 0)
  const totalCommission = rows.reduce((sum, row) => sum + getCommissionValue(row), 0)
  const previousCommission = previousWindow.reduce((sum, row) => sum + getCommissionValue(row), 0)
  const bankBuckets = rows.reduce((accumulator, row) => {
    const bank = normalizeText(row?.transaction?.bank)
    if (!bank) return accumulator
    const bucket = accumulator.get(bank) || { bank, approvals: 0, total: 0 }
    bucket.total += 1
    if (deriveFinanceLaneStage(row).key === 'bond_approved') bucket.approvals += 1
    accumulator.set(bank, bucket)
    return accumulator
  }, new Map())
  const topBank = [...bankBuckets.values()].sort((left, right) => {
    const leftRate = left.total ? left.approvals / left.total : 0
    const rightRate = right.total ? right.approvals / right.total : 0
    if (rightRate !== leftRate) return rightRate - leftRate
    return right.total - left.total
  })[0]

  const makeComparison = (current, previous, suffix = '') => {
    const delta = current - previous
    if (Math.abs(delta) < 0.01) return `Flat${suffix}`
    if (delta > 0) return `+${delta.toFixed(suffix ? 1 : 0)}${suffix} vs last month`
    return `${delta.toFixed(suffix ? 1 : 0)}${suffix} vs last month`
  }

  return [
    {
      key: 'approval_rate',
      label: 'Approval Rate',
      value: formatPercent(approvalRate, 0),
      comparison: makeComparison(approvalRate, previousApprovalRate, '%'),
    },
    {
      key: 'turnaround',
      label: 'Avg Turnaround',
      value: `${Math.round(averageTurnaroundDays || 0)} days`,
      comparison: makeComparison(previousTurnaroundDays - averageTurnaroundDays, 0, 'd'),
    },
    {
      key: 'applications',
      label: 'Total Applications',
      value: String(rows.length),
      comparison: makeComparison(rows.length, previousWindow.length),
    },
    {
      key: 'bond_value',
      label: 'Total Bond Value',
      value: formatCurrency(totalBondValue),
      comparison: makeComparison(totalBondValue - previousBondValue, 0),
    },
    {
      key: 'commission',
      label: 'Total Commission',
      value: formatCurrency(totalCommission),
      comparison: makeComparison(totalCommission - previousCommission, 0),
    },
    {
      key: 'top_bank',
      label: 'Top Performing Bank',
      value: topBank ? topBank.bank : 'Not enough data',
      comparison: topBank ? `${formatPercent((topBank.approvals / Math.max(topBank.total, 1)) * 100)} approval rate` : 'Waiting on bank outcomes',
    },
  ]
}

function buildPipelineOverview(rows = []) {
  const byStage = PIPELINE_STAGE_META.reduce((accumulator, stage) => {
    accumulator[stage.key] = {
      ...stage,
      count: 0,
      totalBondValue: 0,
      atRiskCount: 0,
    }
    return accumulator
  }, {})

  for (const row of rows) {
    const stageKey = resolvePipelineStageKey(row)
    const bucket = byStage[stageKey] || byStage.lead
    bucket.count += 1
    bucket.totalBondValue += getBondAmount(row)
    if (deriveRiskSignals(row).atRisk) {
      bucket.atRiskCount += 1
    }
  }

  return PIPELINE_STAGE_META.map((stage) => ({
    ...byStage[stage.key],
    totalBondValueLabel: formatCurrency(byStage[stage.key].totalBondValue),
  }))
}

function buildPriorityActions(rows = []) {
  return Object.entries(PRIORITY_CARD_META).map(([key, meta]) => {
    const matchingRows = getPriorityRowsByKey(rows, key)
    return {
      key,
      ...meta,
      count: matchingRows.length,
      trendLabel: getTrendLabel(matchingRows, matchingRows.length),
    }
  })
}

function countAttentionItems(priorityActions = []) {
  return priorityActions.reduce((sum, item) => sum + normalizeNumber(item.count, 0), 0)
}

function getUserDisplayName(user = {}) {
  const fullName = normalizeText(
    user?.profile?.fullName ||
      user?.profile?.full_name ||
      user?.profile?.first_name && user?.profile?.last_name
        ? `${user.profile.first_name} ${user.profile.last_name}`
        : '',
  )
  if (fullName) return fullName.split(/\s+/)[0]
  const email = normalizeText(user?.profile?.email || user?.email || '')
  if (email) return email.split('@')[0]
  return 'there'
}

function buildCompactEmptyState(reportingScope = {}) {
  const focus = getRoleFocus(reportingScope)
  return {
    title: 'No applications require attention right now',
    description: focus.attentionText,
  }
}

function buildStatusCards(rows = []) {
  const buckets = rows.reduce((accumulator, row) => {
    const status = deriveTransactionStatus(row)
    accumulator[status] = (accumulator[status] || 0) + 1
    if (status !== 'cancelled' && status !== 'registered') {
      accumulator.active = (accumulator.active || 0) + 1
    }
    return accumulator
  }, {})

  return [
    { key: 'active', label: 'Active', count: buckets.active || 0 },
    { key: 'awaiting_instruction', label: 'Awaiting Attorney Instruction', count: buckets.awaiting_instruction || 0 },
    { key: 'bond_approved', label: 'Bond Approved', count: buckets.bond_approved || 0 },
    { key: 'in_transfer', label: 'In Transfer', count: buckets.in_transfer || 0 },
    { key: 'registered', label: 'Registered', count: buckets.registered || 0 },
    { key: 'at_risk', label: 'At Risk', count: buckets.at_risk || 0 },
  ]
}

function mapTransactionTrackerRow(row = {}) {
  const assignment = resolveEffectiveBondAssignment(row?.transaction || {})
  const financeLane = deriveFinanceLaneStage(row)
  const transferStage = getAttorneyTransferStage(row)
  const risk = deriveRiskSignals(row)
  const bondAmount = getBondAmount(row)
  const transactionId = normalizeText(row?.transaction?.id) || null
  const status = deriveTransactionStatus(row)

  return {
    key: transactionId || getPropertyLabel(row),
    transactionId,
    linkedApplicationId: transactionId,
    client: getBuyerName(row),
    property: getPropertyLabel(row),
    partner: getPartnerLabel(row),
    attorney: normalizeText(row?.transaction?.attorney) || 'Awaiting attorney',
    consultant: getDisplayNameFromAssignment(assignment, row, 'consultant'),
    processor: getDisplayNameFromAssignment(assignment, row, 'processor'),
    bank: normalizeText(row?.transaction?.bank) || 'Bank pending',
    bondAmount,
    bondAmountLabel: formatCurrency(bondAmount),
    financeStageKey: financeLane.key,
    financeStageLabel: financeLane.label,
    transferStageKey: transferStage,
    transferStageLabel: stageLabelFromAttorneyKey(transferStage),
    lastActivityAt: getUpdatedAt(row),
    lastActivityLabel: formatRelativeTime(getUpdatedAt(row)),
    nextAction: normalizeText(row?.transaction?.next_action) || 'No next action set',
    riskStatus: risk.atRisk ? (risk.reasons[0] || 'Needs attention') : 'Healthy',
    riskTone: risk.atRisk ? 'risk' : 'healthy',
    registrationStatus:
      transferStage === 'registered'
        ? 'Registered'
        : financeLane.key === 'bond_instruction_sent'
          ? 'Awaiting registration'
          : 'In progress',
    status,
    transactionScope: getTransactionScopeForRow(row),
  }
}

function filterTransactionRows(rows = [], status = 'all') {
  if (!status || status === 'all') return rows
  return rows.filter((row) => row.status === status)
}

export async function getBondCommandCenterSnapshot(user = {}, workspaceId = '', options = {}) {
  const reportingScope = options.reportingScope || (await getBondDashboardReportingScope(user, workspaceId, options))
  const allRows = await resolveBondRows(user, workspaceId, options)
  const filteredRows = filterRowsByDateRange(allRows, options.rangeKey || 'this_month')
  const transactions = filteredRows.map((row) => row.transaction).filter(Boolean)
  const queues = resolveBondOperationalQueues(user, transactions)
  const priorityActions = buildPriorityActions(filteredRows)
  const focus = getRoleFocus(reportingScope)

  return {
    reportingScope,
    roleFocus: focus,
    userDisplayName: getUserDisplayName(user),
    attentionCount: countAttentionItems(priorityActions),
    priorityActions,
    pipelineOverview: buildPipelineOverview(filteredRows),
    teamWorkload: buildTeamWorkload(filteredRows, reportingScope),
    recentBankActivity: buildRecentBankActivity(filteredRows),
    atRiskApplications: buildAtRiskApplications(filteredRows),
    performanceSnapshot: buildPerformanceSnapshot(filteredRows),
    queues,
    totalApplications: filteredRows.length,
    emptyState: buildCompactEmptyState(reportingScope),
    availableRanges: [
      { key: 'this_month', label: 'This Month' },
      { key: 'last_30_days', label: 'Last 30 Days' },
      { key: 'quarter_to_date', label: 'Quarter to Date' },
      { key: 'all_time', label: 'All Time' },
    ],
  }
}

export async function getBondTransactionTrackerSnapshot(user = {}, workspaceId = '', options = {}) {
  const reportingScope = options.reportingScope || (await getBondDashboardReportingScope(user, workspaceId, options))
  const allRows = await resolveBondRows(user, workspaceId, options)
  const bondRows = allRows.filter((row) => {
    const financeType = normalizeFinanceType(row?.transaction?.finance_type, { allowUnknown: true })
    return isBondFinanceType(financeType) || deriveFinanceLaneStage(row).key !== 'finance_requested'
  })
  const transactionRows = bondRows.map(mapTransactionTrackerRow)
  const selectedStatus = normalizeText(options.status || 'all') || 'all'
  const filteredRows = filterTransactionRows(transactionRows, selectedStatus)

  return {
    reportingScope,
    selectedStatus,
    statusLabel: TRANSACTION_STATUS_META[selectedStatus]?.label || TRANSACTION_STATUS_META.all.label,
    statusCards: buildStatusCards(transactionRows),
    rows: filteredRows,
    totalRows: transactionRows.length,
    emptyState: {
      title: selectedStatus === 'all' ? 'No linked bond transactions yet' : `No ${TRANSACTION_STATUS_META[selectedStatus]?.label?.toLowerCase() || 'matching'} transactions`,
      description: 'Linked transactions will stay visible here from finance work through attorney transfer and final registration.',
    },
  }
}
