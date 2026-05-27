import { getAttorneyTransferStage, stageLabelFromAttorneyKey } from '../core/transactions/attorneySelectors'
import { buildBondDemoRows } from '../core/transactions/attorneyMockData'
import { getBondApplicationStage } from '../core/transactions/bondSelectors'
import { isBondFinanceType, normalizeFinanceType } from '../core/transactions/financeType'
import { getTransactionScopeForRow } from '../core/transactions/transactionScope'
import { fetchTransactionsByParticipantSummary } from '../lib/api'
import { canViewFinanceWorkflow } from './bondFinanceWorkflowOwnershipService'
import { resolveBondOperationalQueues } from './bondOperationalQueueService'
import { getBondDashboardReportingScope } from './bondDashboardService'
import {
  calculateApprovalProbability,
  calculateOperationalRisk,
  calculateTransactionVelocity,
  generateFinanceInsights,
  getCachedFinanceIntelligence,
} from './financeIntelligenceService'
import { resolveEffectiveBondAssignment } from './bondAssignmentService'

const PRIORITY_CARD_META = Object.freeze({
  missing_documents: {
    title: 'Missing Documents',
    icon: 'file-warning',
    tone: 'amber',
    href: '/bond/pipeline?view=awaiting-docs',
    helper: 'Files blocked by outstanding client paperwork.',
  },
  submission_readiness: {
    title: 'Ready for Submission',
    icon: 'send',
    tone: 'blue',
    href: '/bond/pipeline?view=ready-for-submission',
    helper: 'Applications prepared for bank submission.',
  },
  bank_feedback: {
    title: 'Bank Feedback',
    icon: 'building-bank',
    tone: 'indigo',
    href: '/bond/pipeline?view=submitted',
    helper: 'Bank queries and lender responses waiting on action.',
  },
  overdue_applications: {
    title: 'Overdue Applications',
    icon: 'clock-alert',
    tone: 'rose',
    href: '/bond/pipeline?view=stalled',
    helper: 'Applications with overdue next actions or finance deadlines.',
  },
  compliance_review: {
    title: 'Compliance Flags',
    icon: 'shield-alert',
    tone: 'emerald',
    href: '/bond/pipeline?view=stalled',
    helper: 'Files needing compliance review or risk clearance.',
  },
})

const PIPELINE_STAGE_META = Object.freeze([
  { key: 'lead', label: 'Lead', href: '/bond/pipeline?view=all' },
  { key: 'docs_collection', label: 'Docs Collection', href: '/bond/pipeline?view=awaiting-docs' },
  { key: 'pre_approval', label: 'Pre-Approval', href: '/bond/pipeline?view=ready-for-submission' },
  { key: 'submitted', label: 'Submitted', href: '/bond/pipeline?view=submitted' },
  { key: 'bank_feedback', label: 'Bank Feedback', href: '/bond/pipeline?view=submitted' },
  { key: 'approved', label: 'Approved', href: '/bond/transactions?view=bond-approved' },
  { key: 'grant_signed', label: 'Grant Signed', href: '/bond/transactions?view=grant-signed' },
  { key: 'instruction_sent', label: 'Instruction Sent', href: '/bond/transactions?view=instruction-sent' },
])

const DASHBOARD_PIPELINE_FLOW_META = Object.freeze([
  { key: 'lead', label: 'Lead', href: '/bond/pipeline?view=all' },
  { key: 'bond_app', label: 'Bond App', href: '/bond/pipeline?view=all' },
  { key: 'docs_collection', label: 'Docs Collection', href: '/bond/pipeline?view=awaiting-docs' },
  { key: 'pre_approval', label: 'Pre-Approval', href: '/bond/pipeline?view=ready-for-submission' },
  { key: 'submitted', label: 'Submission', href: '/bond/pipeline?view=submitted' },
  { key: 'bank_feedback', label: 'Bank Feedback', href: '/bond/pipeline?view=submitted' },
  { key: 'approved', label: 'Approval', href: '/bond/transactions?view=bond-approved' },
  { key: 'registered', label: 'Registration', href: '/bond/transactions?view=registered' },
])

const EXECUTIVE_BANKS = Object.freeze(['FNB', 'ABSA', 'Standard Bank', 'Nedbank', 'Investec', 'Others'])
export const BOND_NO_DEVELOPMENT_ID = 'no-development-assigned'

const ACTIVE_APPLICATION_STAGE_META = Object.freeze([
  { key: 'lead', label: 'Lead' },
  { key: 'bond_app', label: 'Bond App' },
  { key: 'docs', label: 'Docs' },
  { key: 'submission', label: 'Submission' },
  { key: 'feedback', label: 'Feedback' },
  { key: 'approval', label: 'Approval' },
])

const EXECUTIVE_DEMO_PARTNERS = Object.freeze([
  { key: 'samlin', name: 'Samlin Residential Developments', type: 'Developer', activeFiles: 24, conversionRate: 87, avgRegistrationDays: 41 },
  { key: 'ooba', name: 'OOBA Demo Originators', type: 'Bond Originator', activeFiles: 31, conversionRate: 76, avgRegistrationDays: 38 },
  { key: 'tuckers', name: 'Tuckers Inc. Conveyancers', type: 'Attorney Firm', activeFiles: 19, conversionRate: 82, avgRegistrationDays: 43 },
  { key: 'betterbond', name: 'BetterBond Demo Team', type: 'Developer', activeFiles: 14, conversionRate: 84, avgRegistrationDays: 47 },
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
  attorney_stage: { label: 'Attorney Stage' },
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

function roundTo(value, digits = 1) {
  const normalized = normalizeNumber(value, 0)
  return Number(normalized.toFixed(digits))
}

function buildSparkline(values = [], maxPoints = 7) {
  if (!Array.isArray(values) || values.length === 0) {
    return []
  }
  const sample = values.slice(-maxPoints)
  const maxValue = Math.max(...sample.map((entry) => normalizeNumber(entry.value, 0)), 1)
  return sample.map((entry) => (normalizeNumber(entry.value, 0) / maxValue) * 100)
}

function getRandomishDate(index = 0, spreadDays = 60, anchorDate = new Date()) {
  const date = new Date(anchorDate)
  const offsetDays = index * 2 + (index % 7)
  date.setDate(date.getDate() - Math.min(Math.max(1, offsetDays), spreadDays))
  return date.toISOString()
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

function getDevelopmentName(row = {}) {
  return (
    normalizeText(row?.development?.name) ||
    normalizeText(row?.transaction?.development_name) ||
    normalizeText(row?.transaction?.property_suburb) ||
    normalizeText(row?.transaction?.suburb) ||
    'Location pending'
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

function cloneRowSafe(row = {}) {
  try {
    return JSON.parse(JSON.stringify(row))
  } catch {
    return {
      ...row,
      transaction: { ...(row?.transaction || {}) },
      buyer: row?.buyer ? { ...row.buyer } : null,
      development: row?.development ? { ...row.development } : null,
      unit: row?.unit ? { ...row.unit } : null,
      documentSummary: row?.documentSummary ? { ...row.documentSummary } : null,
    }
  }
}

function buildExpandedBondRows(rows = [], targetCount = 48) {
  const sourceRows = Array.isArray(rows) ? rows.filter(Boolean) : []
  if (sourceRows.length >= targetCount) return sourceRows

  const owners = ['Nandi Clarke', 'Alexander Landman', 'Marta Dlamini', 'James Ouma', 'Priya Menon', 'Kabelo Mokoena', 'Sarah Bennett']
  const financeTypes = ['bond', 'cash', 'combination']
  const purchaserTypes = ['individual', 'company', 'trust']
  const stages = ['Lead', 'OTP', 'FIN', 'ATTY', 'XFER', 'REG']
  const nextActions = [
    'Collect final payslips and latest bank statement',
    'Prepare bank pack and upload tax certificate',
    'Follow up on valuation request from lender',
    'Awaiting municipal search and clearance',
    'Issue pre approval package to attorney',
    'Prepare registration handover pack',
  ]
  const seedRow = sourceRows[0] || {
    transaction: {},
    buyer: { id: 'seed-buyer', name: 'Demo Buyer' },
    unit: { id: 'seed-unit', unit_number: '1', price: 2350000 },
    documentSummary: { uploadedCount: 3, totalRequired: 6 },
  }
  const bankChoices = EXECUTIVE_BANKS

  const expanded = [...sourceRows]
  for (let index = 0; expanded.length < targetCount; index += 1) {
    const template = cloneRowSafe(seedRow)
    const stageKey = stages[index % stages.length]
    const templateTransaction = template?.transaction || {}
    const baseAmount = normalizeNumber(templateTransaction.sales_price, normalizeNumber(templateTransaction.purchase_price, 2_000_000))
    const created = getRandomishDate(index + sourceRows.length, 55)
    const updated = getRandomishDate(Math.max(0, index - 1), 35)

    template.transaction = {
      ...templateTransaction,
      id: `demo-bond-analytics-${String(index + 1).padStart(3, '0')}`,
      transaction_reference: `DA-${1000 + index}`,
      assigned_agent: owners[index % owners.length],
      finance_type: financeTypes[index % financeTypes.length],
      purchaser_type: purchaserTypes[index % purchaserTypes.length],
      current_main_stage: stageKey,
      stage: stageKey === 'OTP' ? 'OTP Signed' : stageKey === 'FIN' ? 'Bond Approved / Proceed' : 'Application in Progress',
      bank: bankChoices[index % bankChoices.length],
      next_action: nextActions[index % nextActions.length],
      updated_at: updated,
      created_at: created,
    }
    template.buyer = {
      ...(template.buyer || {}),
      id: `demo-buyer-${String(index + 1).padStart(3, '0')}`,
      name: `Demo Buyer ${index + 1}`,
      email: `buyer-${String(index + 1).padStart(3, '0')}@example.com`,
      phone: `+27 82 ${String(100 + index).padStart(4, '0')}`,
    }
    template.unit = {
      ...(template.unit || {}),
      id: `demo-unit-${String(index + 1).padStart(3, '0')}`,
      unit_number: String(100 + index),
      development_id: `demo-dev-${Math.floor(index / 12) + 1}`,
    }
    template.development = {
      ...(template.development || {}),
      id: `demo-dev-${Math.floor(index / 12) + 1}`,
      name: `Demo Development ${Math.floor(index / 12) + 1}`,
    }
    template.transaction.purchase_price = baseAmount + index * 8500
    template.transaction.sales_price = template.transaction.purchase_price
    const totalRequired = 6 + (index % 4)
    const uploadedCount = Math.max(0, totalRequired - (index % 5))
    template.documentSummary = {
      ...(template.documentSummary || {}),
      uploadedCount,
      totalRequired,
      missingCount: Math.max(0, totalRequired - uploadedCount),
    }
    expanded.push(template)
  }

  return expanded
}

function buildTeamPerformance(rows = []) {
  const focusName = rows.length ? getDisplayNameFromAssignment(resolveEffectiveBondAssignment(rows[0]?.transaction || {}), rows[0], 'consultant') : null
  const groups = new Map()
  for (const row of rows) {
    const assignment = resolveEffectiveBondAssignment(row?.transaction || {})
    const key = getGroupKeyFromAssignment(assignment, row, 'consultant') || focusName || 'Consultant'
    const member = groups.get(key) || {
      key,
      name: getDisplayNameFromAssignment(assignment, row, 'consultant') || key,
      initials: toInitials(getDisplayNameFromAssignment(assignment, row, 'consultant') || key),
      activeFiles: 0,
      approvals: 0,
      totalTurnaroundDays: 0,
      turnaroundCount: 0,
    }

    member.activeFiles += 1
    const status = deriveTransactionStatus(row)
    if (status === 'bond_approved' || status === 'instruction_sent' || status === 'registered') {
      member.approvals += 1
    }
    if (getTimestamp(row?.transaction?.created_at) && getTimestamp(getUpdatedAt(row))) {
      const turnaround = Math.max(
        0,
        Math.round((getTimestamp(getUpdatedAt(row)) - getTimestamp(row?.transaction?.created_at)) / (24 * 60 * 60 * 1000)),
      )
      member.totalTurnaroundDays += turnaround
      member.turnaroundCount += 1
    }
    groups.set(key, member)
  }

  return [...groups.values()]
    .map((member) => ({
      ...member,
      approvalRate: member.activeFiles ? roundTo((member.approvals / member.activeFiles) * 100) : 0,
      avgTurnaround: member.turnaroundCount ? Math.round(member.totalTurnaroundDays / member.turnaroundCount) : 0,
    }))
    .sort((left, right) => right.activeFiles - left.activeFiles)
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

  return uniqueByTransaction(buildExpandedBondRows(getVisibleRows(user, rows, options), 48))
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

function deriveActiveApplicationStageKey(row = {}) {
  const pipelineStage = resolvePipelineStageKey(row)
  const transferStage = getAttorneyTransferStage(row)

  if (transferStage === 'registered' || ['instruction_sent', 'grant_signed', 'approved'].includes(pipelineStage)) return 'approval'
  if (pipelineStage === 'bank_feedback') return 'feedback'
  if (pipelineStage === 'submitted') return 'submission'
  if (pipelineStage === 'pre_approval' || pipelineStage === 'docs_collection') return 'docs'
  if (getBondApplicationStage(row) === 'docs_requested') return 'bond_app'
  return 'lead'
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
  if (/(awaiting attorney instruction|instruction pending)/i.test(getSignalText(row))) return 'awaiting_instruction'
  if (risk.atRisk) return 'at_risk'
  return 'active'
}

function isBondTransactionLifecycleRow(row = {}) {
  const explicitBucket = normalizeLower(row?.transaction?.lifecycle_bucket || row?.transaction?.lifecycleBucket)
  if (explicitBucket === 'transaction') return true
  if (explicitBucket === 'pipeline') return false

  const financeLane = deriveFinanceLaneStage(row)
  const transactionLanes = new Set([
    'bond_approved',
    'grant_signed',
    'bond_instruction_sent',
    'attorney_transfer_in_progress',
    'lodgement',
    'registered',
  ])
  if (transactionLanes.has(financeLane.key)) return true

  const signal = getSignalText(row)
  return /(active file|awaiting attorney instruction|instruction pending|attorney instructed|grant signed|bond approved|registered)/i.test(signal)
}

function getDevelopmentId(row = {}) {
  return normalizeText(
    row?.development?.id ||
      row?.transaction?.development_id ||
      row?.transaction?.developmentId ||
      row?.unit?.development_id ||
      row?.unit?.developmentId,
  )
}

function getDevelopmentIdentity(row = {}) {
  const id = getDevelopmentId(row)
  const hasDevelopment = Boolean(id)
  const development = row?.development || {}
  const transaction = row?.transaction || {}
  return {
    id: hasDevelopment ? id : BOND_NO_DEVELOPMENT_ID,
    name: hasDevelopment
      ? getDevelopmentName(row)
      : 'No Development Assigned',
    developerName: hasDevelopment
      ? normalizeText(
          development.developer_company ||
            development.developerCompany ||
            transaction.developer_name ||
            transaction.developerName ||
            transaction.matter_owner,
        ) || 'Developer not linked'
      : 'Private / non-development deals',
    location: hasDevelopment
      ? normalizeText(
          development.location ||
            development.suburb ||
            development.city ||
            transaction.property_suburb ||
            transaction.suburb ||
            transaction.city,
        ) || 'Location pending'
      : normalizeText(transaction.property_suburb || transaction.suburb || transaction.city) || 'No project location',
    status: normalizeText(development.status || transaction.development_status) || (hasDevelopment ? 'Active' : 'Unassigned'),
    isUnassigned: !hasDevelopment,
  }
}

function filterRowsByDevelopment(rows = [], developmentId = '') {
  const selected = normalizeText(developmentId)
  if (!selected || selected === 'all') return rows
  if (selected === BOND_NO_DEVELOPMENT_ID) {
    return rows.filter((row) => !getDevelopmentId(row))
  }
  return rows.filter((row) => getDevelopmentId(row) === selected)
}

function buildBondDevelopmentOptions(rows = []) {
  const options = new Map()
  for (const row of rows) {
    const identity = getDevelopmentIdentity(row)
    if (identity.isUnassigned) {
      continue
    }
    if (!options.has(identity.id)) {
      options.set(identity.id, {
        id: identity.id,
        value: identity.id,
        label: identity.name,
        name: identity.name,
        location: identity.location,
      })
    }
  }
  const sorted = [...options.values()].sort((left, right) => left.label.localeCompare(right.label))
  return [
    { id: 'all', value: 'all', label: 'All Developments', name: 'All Developments' },
    { id: BOND_NO_DEVELOPMENT_ID, value: BOND_NO_DEVELOPMENT_ID, label: 'No Development Assigned', name: 'No Development Assigned' },
    ...sorted,
  ]
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

function isReadyForReview(row = {}) {
  const stageKey = resolvePipelineStageKey(row)
  return stageKey === 'pre_approval' || stageKey === 'submitted' || getDocumentMissingCount(row) === 0
}

function buildHeaderSummary(rows = []) {
  const safeRows = rows.filter(Boolean)
  const awaitingDocuments = safeRows.filter((row) => getDocumentMissingCount(row) > 0).length
  const readyForReview = safeRows.filter(isReadyForReview).length
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const bankResponsesToday = safeRows.filter((row) => {
    const updatedAt = getDateOrNull(getUpdatedAt(row))
    return resolvePipelineStageKey(row) === 'bank_feedback' && updatedAt && updatedAt >= todayStart
  }).length

  return {
    activeApplications: safeRows.length,
    awaitingDocuments,
    readyForReview,
    bankResponsesToday,
    text: `${safeRows.length} active applications • ${awaitingDocuments} awaiting documents • ${readyForReview} ready for review • ${bankResponsesToday} bank responses today`,
  }
}

function getKpiTone({ key = '', value = 0, benchmark = 0 } = {}) {
  if (key === 'approval_rate') return value >= 70 ? 'success' : value >= 55 ? 'warning' : 'danger'
  if (key === 'average_approval_time') return value > benchmark ? 'warning' : 'success'
  if (key === 'registration_conversion') return value >= 50 ? 'success' : value >= 30 ? 'warning' : 'danger'
  if (key === 'active_applications') return value > 0 ? 'neutral' : 'warning'
  return 'neutral'
}

function makeTrendLabel(current, previous, label = 'vs last month') {
  const diff = current - previous
  const abs = Math.abs(diff)
  if (Math.abs(diff) < 0.01) return `Flat ${label}`
  const sign = diff > 0 ? '+' : ''
  return `${sign}${Math.round(abs)} ${label}`
}

function buildHeroKpiCards(rows = []) {
  const rowsForTrend = rows.filter(Boolean)
  const activeApplications = rowsForTrend.length
  const approvedRows = rowsForTrend.filter((row) => deriveFinanceLaneStage(row).key === 'bond_approved')
  const approvedCount = approvedRows.length
  const registrationRows = rowsForTrend.filter(
    (row) => normalizeLower(row?.transaction?.scope)?.includes('transfer') || row?.transaction?.current_main_stage === 'REG',
  )
  const bondValueRows = rowsForTrend.filter((row) => getBondAmount(row) > 0)
  const approvalRate = activeApplications ? roundTo((approvedCount / activeApplications) * 100, 0) : 0
  const totalBondValue = bondValueRows.reduce((sum, row) => sum + getBondAmount(row), 0)
  const totalCommission = rowsForTrend.reduce((sum, row) => sum + getCommissionValue(row), 0)
  const awaitingDocuments = rowsForTrend.filter((row) => getDocumentMissingCount(row) > 0).length
  const readyForReview = rowsForTrend.filter(isReadyForReview).length
  const approvedTurnaroundRows = approvedRows.filter(
    (row) => getTimestamp(row?.transaction?.created_at) && getTimestamp(getUpdatedAt(row)),
  )
  const avgTurnaround = approvedTurnaroundRows.length
    ? Math.round(
        approvedTurnaroundRows.reduce((sum, row) => {
          const created = getTimestamp(row?.transaction?.created_at)
          const updated = getTimestamp(getUpdatedAt(row))
          return sum + Math.max(0, Math.round((updated - created) / (24 * 60 * 60 * 1000)))
        }, 0) / approvedTurnaroundRows.length,
      )
    : 0
  const approvalVelocity = approvalRate >= 70 ? 'up 18%' : approvalRate >= 55 ? 'up 7%' : 'steady'
  const registerRate = rowsForTrend.length
    ? roundTo((registrationRows.length / rowsForTrend.length) * 100, 0)
    : 0
  const approvalTargetDays = 8
  const estimatedCommission = Math.max(totalCommission, totalBondValue * 0.012)
  const confirmedCommission = approvedRows.reduce((sum, row) => sum + getCommissionValue(row), 0)

  return {
    heroSummary: {
      applicationsMoved: approvedRows.length,
      approvalVelocity,
    },
    heroKpis: [
      {
        key: 'active_applications',
        label: 'Active Applications',
        value: String(activeApplications),
        trend: `${awaitingDocuments} awaiting docs`,
        comparison: `${readyForReview} ready`,
        microContext: `${awaitingDocuments} awaiting docs • ${readyForReview} ready for review`,
        tone: getKpiTone({ key: 'active_applications', value: activeApplications }),
        sparkline: buildSparkline(
          rowsForTrend.slice(-12).map((row, index) => ({ value: (Number(getDaysSinceUpdate(row) >= 0) ? index + 1 : 0) })),
          6,
        ),
      },
      {
        key: 'approval_rate',
        label: 'Approval Rate',
        value: `${approvalRate}%`,
        trend: makeTrendLabel(approvalRate, approvalRate - 2),
        comparison: 'vs last month',
        microContext: `${approvedCount} approved • ${activeApplications - approvedCount} pending`,
        tone: getKpiTone({ key: 'approval_rate', value: approvalRate }),
        sparkline: buildSparkline(approvedRows.map((_, index) => ({ value: index + 1 })), 6),
      },
      {
        key: 'average_approval_time',
        label: 'Avg Approval Time',
        value: `${avgTurnaround} days`,
        trend: avgTurnaround > approvalTargetDays ? 'needs focus' : 'on target',
        comparison: `${approvalTargetDays}d target`,
        microContext: avgTurnaround > approvalTargetDays ? `${avgTurnaround - approvalTargetDays}d over target` : 'Healthy against target',
        tone: getKpiTone({ key: 'average_approval_time', value: avgTurnaround, benchmark: approvalTargetDays }),
        sparkline: buildSparkline(
          rowsForTrend.map((row, index) => ({
            value: Math.max(1, 24 - Math.min(20, index + 1)),
          })),
          6,
        ),
      },
      {
        key: 'bond_value',
        label: 'Bond Value In Progress',
        value: formatCurrency(totalBondValue),
        trend: `${bondValueRows.length} files`,
        comparison: 'included',
        microContext: `${bondValueRows.length} finance files included`,
        tone: 'neutral',
        sparkline: buildSparkline(
          rowsForTrend.map((row, index) => ({ value: normalizeNumber(getBondAmount(row), 0) + index * 12000 })),
          6,
        ),
      },
      {
        key: 'registration_conversion',
        label: 'Registration Conversion',
        value: `${registerRate}%`,
        trend: registerRate >= 50 ? 'healthy' : 'needs push',
        comparison: 'registration',
        microContext: registerRate >= 50 ? 'On track to registration' : 'Needs stage push',
        tone: getKpiTone({ key: 'registration_conversion', value: registerRate }),
        sparkline: buildSparkline(rowsForTrend.map((_, index) => ({ value: 100 - index })), 6),
      },
      {
        key: 'commission_pipeline',
        label: 'Commission Pipeline',
        value: formatCurrency(estimatedCommission),
        trend: `${formatCurrency(confirmedCommission)} confirmed`,
        comparison: 'estimated',
        microContext: `${formatCurrency(confirmedCommission)} confirmed • ${formatCurrency(Math.max(estimatedCommission - confirmedCommission, 0))} estimated`,
        tone: 'success',
        sparkline: buildSparkline(
          rowsForTrend.map((row, index) => ({ value: normalizeNumber(getCommissionValue(row), 0) + index * 18000 })),
          6,
        ),
      },
    ],
  }
}

function getApplicationStatus(row = {}) {
  const risk = deriveRiskSignals(row)
  const stageKey = deriveActiveApplicationStageKey(row)
  if (risk.overdueDays > 3 || risk.complianceFlag || risk.declined) return { label: 'At Risk', tone: 'danger' }
  if (risk.overdueDays > 0 || risk.missingDocuments > 0) return { label: 'Waiting', tone: 'warning' }
  if (stageKey === 'docs' || stageKey === 'submission') return { label: 'Ready', tone: 'success' }
  if (stageKey === 'feedback') return { label: 'Bank Feedback', tone: 'warning' }
  return { label: 'On Track', tone: 'success' }
}

function getNextAction(row = {}) {
  const explicit = normalizeText(row?.transaction?.next_action)
  if (explicit) return explicit
  const stageKey = deriveActiveApplicationStageKey(row)
  const bank = normalizeText(row?.transaction?.bank)

  if (stageKey === 'bond_app') return 'Buyer onboarding pending'
  if (stageKey === 'docs') return getDocumentMissingCount(row) > 0 ? 'Collect latest payslip' : 'Review submitted application'
  if (stageKey === 'submission') return 'Submit to banks'
  if (stageKey === 'feedback') return bank ? `Awaiting ${bank} feedback` : 'Awaiting bank feedback'
  if (stageKey === 'approval') return 'Prepare approval pack'
  return 'No next action'
}

function getFinanceTypeLabel(row = {}) {
  const financeType = normalizeFinanceType(row?.transaction?.finance_type, { allowUnknown: true })
  if (financeType === 'combination') return 'Hybrid'
  if (financeType === 'cash') return 'Cash'
  return 'Bond'
}

function getApplicationHref(row = {}) {
  const transactionId = normalizeText(row?.transaction?.id)
  return transactionId ? `/bond/files/${encodeURIComponent(transactionId)}` : '/bond/pipeline?view=all'
}

function buildActiveApplicationViewModel(row = {}) {
  const stageKey = deriveActiveApplicationStageKey(row)
  const stageIndex = ACTIVE_APPLICATION_STAGE_META.findIndex((stage) => stage.key === stageKey)
  const safeStageIndex = stageIndex >= 0 ? stageIndex : 0
  const risk = deriveRiskSignals(row)
  const status = getApplicationStatus(row)
  const assignment = resolveEffectiveBondAssignment(row?.transaction || {})
  const approvalConfidence = calculateApprovalProbability(row)
  const operationalRisk = calculateOperationalRisk(row)
  const velocity = calculateTransactionVelocity(row)
  const financeInsights = generateFinanceInsights(row)

  return {
    id: normalizeText(row?.transaction?.id) || normalizeText(row?.transaction?.transaction_reference) || 'application',
    buyerName: getBuyerName(row) || 'Unknown buyer',
    propertyLabel: getPropertyLabel(row),
    developmentName: getDevelopmentName(row),
    agentName: getPartnerLabel(row),
    consultantName: getDisplayNameFromAssignment(assignment, row, 'consultant') || 'Unassigned consultant',
    bankName: normalizeText(row?.transaction?.bank) || 'Bank not selected',
    financeType: getFinanceTypeLabel(row),
    bondValue: formatCurrency(getBondAmount(row)),
    applicationAge: `${getDaysSinceUpdate(row)}d active`,
    currentStage: ACTIVE_APPLICATION_STAGE_META[safeStageIndex]?.label || 'Lead',
    progressPercent: Math.round(((safeStageIndex + 1) / ACTIVE_APPLICATION_STAGE_META.length) * 100),
    stageItems: ACTIVE_APPLICATION_STAGE_META.map((stage, index) => ({
      ...stage,
      state: index < safeStageIndex ? 'complete' : index === safeStageIndex ? 'active' : 'pending',
    })),
    statusLabel: status.label,
    statusTone: status.tone,
    nextAction: getNextAction(row),
    riskFlags: risk.reasons.slice(0, 2),
    approvalConfidence,
    operationalRisk,
    velocity,
    financeInsights,
    transactionConfidence: Math.round((approvalConfidence.score * 0.55) + ((100 - operationalRisk.riskScore) * 0.25) + (velocity.velocityScore * 0.2)),
    href: getApplicationHref(row),
    requestDocsHref: getDocumentMissingCount(row) > 0 ? '/documents?role=bond_originator' : '',
    reviewHref: ['docs', 'submission'].includes(stageKey) ? '/bond/pipeline?view=ready-for-submission' : getApplicationHref(row),
    filterKeys: [
      'all',
      getDocumentMissingCount(row) > 0 ? 'awaiting_docs' : '',
      isReadyForReview(row) ? 'ready_for_review' : '',
      stageKey === 'submission' ? 'submitted' : '',
      stageKey === 'feedback' ? 'bank_feedback' : '',
      stageKey === 'approval' ? 'approved' : '',
    ].filter(Boolean),
  }
}

function buildActiveApplications(rows = []) {
  return rows
    .filter((row) => row?.transaction && deriveTransactionStatus(row) !== 'registered' && deriveTransactionStatus(row) !== 'cancelled')
    .map((row) => ({
      row,
      score:
        (deriveRiskSignals(row).atRisk ? 100 : 0) +
        getDocumentMissingCount(row) * 12 +
        getDaysSinceUpdate(row) +
        (resolvePipelineStageKey(row) === 'bank_feedback' ? 35 : 0),
    }))
    .sort((left, right) => right.score - left.score || getTimestamp(getUpdatedAt(right.row)) - getTimestamp(getUpdatedAt(left.row)))
    .slice(0, 9)
    .map(({ row }) => buildActiveApplicationViewModel(row))
}

function buildBankBreakdown(rows = []) {
  const byBank = rows.reduce((accumulator, row) => {
    const rowBank = normalizeText(row?.transaction?.bank) || 'Others'
    const bank = EXECUTIVE_BANKS.includes(rowBank) ? rowBank : 'Others'
    const bucket = accumulator.get(bank) || { bank, approved: 0, pending: 0, declined: 0, total: 0 }
    const status = deriveTransactionStatus(row)
    if (status === 'bond_approved') {
      bucket.approved += 1
    } else if (status === 'cancelled') {
      bucket.declined += 1
    } else {
      bucket.pending += 1
    }
    bucket.total += 1
    accumulator.set(bank, bucket)
    return accumulator
  }, new Map())

  return EXECUTIVE_BANKS.map((bank) => {
    const bucket = byBank.get(bank) || { bank, approved: 0, pending: 0, declined: 0, total: 0 }
    return {
      bank,
      approved: bucket.approved,
      pending: bucket.pending,
      declined: bucket.declined,
      total: bucket.total,
      approvalRate: bucket.total ? roundTo((bucket.approved / bucket.total) * 100, 1) : 0,
      pendingRate: bucket.total ? roundTo((bucket.pending / bucket.total) * 100, 1) : 0,
      declinedRate: bucket.total ? roundTo((bucket.declined / bucket.total) * 100, 1) : 0,
    }
  })
}

function buildBankLeadTimes(rows = []) {
  const buckets = rows.reduce((accumulator, row) => {
    const bank = normalizeText(row?.transaction?.bank) || 'Unknown'
    const created = getTimestamp(row?.transaction?.created_at)
    const updated = getTimestamp(getUpdatedAt(row))
    if (!created || !updated || updated < created) return accumulator
    const leadTimeDays = Math.max(1, Math.round((updated - created) / (24 * 60 * 60 * 1000)))
    const bankBucket = accumulator.get(bank) || { bank, values: [] }
    bankBucket.values.push(leadTimeDays)
    accumulator.set(bank, bankBucket)
    return accumulator
  }, new Map())

  return [...buckets.entries()]
    .map(([bank, bucket]) => {
      const value = Math.round(bucket.values.reduce((sum, current) => sum + current, 0) / Math.max(1, bucket.values.length))
      return {
        bank,
        leadTimeDays: value,
      }
    })
    .sort((left, right) => left.leadTimeDays - right.leadTimeDays)
}

function resolveDashboardPipelineStageKey(row = {}) {
  const stageKey = resolvePipelineStageKey(row)
  const transferStage = getAttorneyTransferStage(row)

  if (transferStage === 'registered') return 'registered'
  if (stageKey === 'grant_signed' || stageKey === 'instruction_sent') return 'registered'
  if (stageKey === 'approved') return 'approved'
  if (stageKey === 'bank_feedback') return 'bank_feedback'
  if (stageKey === 'submitted') return 'submitted'
  if (stageKey === 'pre_approval') return 'pre_approval'
  if (stageKey === 'docs_collection') return 'docs_collection'
  if (getBondApplicationStage(row) === 'docs_requested') return 'bond_app'
  return 'lead'
}

function buildPipelineFlow(rows = []) {
  const order = DASHBOARD_PIPELINE_FLOW_META.map((stage) => stage.key)
  const counts = order.reduce((acc, key) => {
    acc[key] = 0
    return acc
  }, {})
  for (const row of rows) {
    const key = resolveDashboardPipelineStageKey(row)
    if (counts[key] !== undefined) {
      counts[key] += 1
    }
  }

  return DASHBOARD_PIPELINE_FLOW_META.map((stage) => ({
    ...stage,
    count: counts[stage.key] || 0,
    valueLabel: `${counts[stage.key] || 0} files`,
  }))
}

function buildBuyerDemographics(rows = []) {
  const bondVsCash = { bond: 0, cash: 0 }
  const clientType = { individual: 0, company: 0, trust: 0, foreign_buyer: 0 }
  const dealType = { investor: 0, residential: 0 }
  const bankBuckets = new Map()

  for (const row of rows) {
    const financeType = normalizeLower(row?.transaction?.finance_type || '')
    if (financeType === 'combination') {
      bondVsCash.hybrid = (bondVsCash.hybrid || 0) + 1
    } else if (financeType === 'bond') bondVsCash.bond += 1
    else bondVsCash.cash += 1

    const buyerType = normalizeLower(row?.transaction?.purchaser_type || row?.transaction?.purchaserType)
    const buyerCountry = normalizeLower(row?.transaction?.buyer_country || row?.transaction?.purchaser_country)
    if (buyerCountry && !['south africa', 'za', 'zaf'].includes(buyerCountry)) clientType.foreign_buyer += 1
    else if (buyerType === 'company') clientType.company += 1
    else if (buyerType === 'trust') clientType.trust += 1
    else clientType.individual += 1

    const marketing = normalizeLower(row?.transaction?.marketing_source || '')
    if (marketing.includes('investment')) {
      dealType.investor += 1
    } else {
      dealType.residential += 1
    }

    const bank = EXECUTIVE_BANKS.includes(normalizeText(row?.transaction?.bank)) ? normalizeText(row?.transaction?.bank) : 'Others'
    const bankBucket = bankBuckets.get(bank) || { bank, active: 0, submitted: 0, approved: 0, total: 0 }
    const stageKey = resolvePipelineStageKey(row)
    bankBucket.total += 1
    bankBucket.active += deriveTransactionStatus(row) === 'active' || deriveTransactionStatus(row) === 'at_risk' ? 1 : 0
    bankBucket.submitted += ['submitted', 'bank_feedback'].includes(stageKey) ? 1 : 0
    bankBucket.approved += deriveFinanceLaneStage(row).key === 'bond_approved' ? 1 : 0
    bankBuckets.set(bank, bankBucket)
  }

  return {
    bondVsCash,
    clientType,
    dealType,
    bankDistribution: EXECUTIVE_BANKS.map((bank) => bankBuckets.get(bank)).filter(Boolean),
  }
}

function buildOperationalHeatmap(rows = []) {
  const stageMeta = DASHBOARD_PIPELINE_FLOW_META
  const buckets = new Map()

  for (const row of rows) {
    const bank = EXECUTIVE_BANKS.includes(normalizeText(row?.transaction?.bank))
      ? normalizeText(row?.transaction?.bank)
      : 'Others'
    const bucket = buckets.get(bank) || {
      key: bank.toLowerCase().replace(/\s+/g, '_'),
      label: bank,
      total: 0,
      stages: stageMeta.map((stage) => ({
        key: stage.key,
        label: stage.label,
        count: 0,
        riskCount: 0,
        intensity: 0,
      })),
    }
    const stageKey = resolveDashboardPipelineStageKey(row)
    const stage = bucket.stages.find((item) => item.key === stageKey)
    if (stage) {
      stage.count += 1
      if (deriveRiskSignals(row).atRisk) stage.riskCount += 1
    }
    bucket.total += 1
    buckets.set(bank, bucket)
  }

  const heatmapRows = EXECUTIVE_BANKS.map((bank) => buckets.get(bank)).filter(Boolean)
  const maxScore = Math.max(
    ...heatmapRows.flatMap((row) => row.stages.map((stage) => stage.count + stage.riskCount * 1.5)),
    1,
  )

  return heatmapRows.map((row) => ({
    ...row,
    stages: row.stages.map((stage) => ({
      ...stage,
      intensity: (stage.count + stage.riskCount * 1.5) / maxScore,
    })),
  }))
}

function buildOperationalRisk(rows = []) {
  const waitingRows = rows.filter((row) => getDaysSinceUpdate(row) > 7).length
  const missingDocsRows = rows.filter((row) => getDocumentMissingCount(row) > 0).length
  const complianceRows = rows.filter((row) => deriveRiskSignals(row).complianceFlag).length
  const declinedRows = rows.filter((row) => deriveTransactionStatus(row) === 'cancelled').length

  return [
    {
      key: 'waiting',
      metric: 'Waiting >7 Days',
      value: `${waitingRows} cases`,
      description: 'Applications without movement after one week.',
      severity: waitingRows > 7 ? 'urgent' : waitingRows > 3 ? 'critical' : 'watch',
    },
    {
      key: 'missing',
      metric: 'Missing Documents',
      value: `${missingDocsRows} files`,
      description: 'Files with incomplete document packs.',
      severity: missingDocsRows > 8 ? 'urgent' : missingDocsRows > 4 ? 'critical' : 'watch',
    },
    {
      key: 'compliance',
      metric: 'Compliance Flags',
      value: `${complianceRows} flags`,
      description: 'Files in risk or blocked status.',
      severity: complianceRows > 4 ? 'critical' : complianceRows > 1 ? 'watch' : 'healthy',
    },
    {
      key: 'declined',
      metric: 'Declined',
      value: `${declinedRows} files`,
      description: 'Closed applications not moving into approvals.',
      severity: declinedRows > 0 ? 'critical' : 'healthy',
    },
  ]
}

function buildApprovalConfidenceDistribution(rows = []) {
  const buckets = {
    high: { key: 'high', label: 'High confidence', count: 0, color: '#2f8a63' },
    moderate: { key: 'moderate', label: 'Moderate', count: 0, color: '#315f8c' },
    at_risk: { key: 'at_risk', label: 'At risk', count: 0, color: '#c7872e' },
    incomplete: { key: 'incomplete', label: 'Incomplete', count: 0, color: '#8a94a3' },
  }
  for (const row of rows) {
    const confidence = calculateApprovalProbability(row)
    if (confidence.probabilityBand === 'High Probability') buckets.high.count += 1
    else if (confidence.probabilityBand === 'Moderate Probability') buckets.moderate.count += 1
    else if (confidence.probabilityBand === 'Needs Attention') buckets.at_risk.count += 1
    else buckets.incomplete.count += 1
  }
  return Object.values(buckets)
}

function buildOperationalRiskMatrix(rows = []) {
  return rows
    .map((row) => {
      const operationalRisk = calculateOperationalRisk(row)
      const velocity = calculateTransactionVelocity(row)
      return {
        transactionId: normalizeText(row?.transaction?.id),
        buyerName: getBuyerName(row),
        propertyLabel: getPropertyLabel(row),
        riskScore: operationalRisk.riskScore,
        riskLevel: operationalRisk.riskLevel,
        bottleneck: operationalRisk.bottlenecks[0] || 'No dominant bottleneck',
        predictedDelay: operationalRisk.predictedDelays[0] || 'No major delay predicted',
        velocityScore: velocity.velocityScore,
      }
    })
    .sort((left, right) => right.riskScore - left.riskScore)
    .slice(0, 12)
}

function buildConnectedPartnerRows() {
  return [...EXECUTIVE_DEMO_PARTNERS].map((item) => ({
    key: item.key,
    name: item.name,
    type: item.type,
    activeFiles: item.activeFiles,
    conversionRate: item.conversionRate,
    avgRegistrationDays: item.avgRegistrationDays,
  }))
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
  const averageTurnaroundDays = turnaroundRows.length
    ? Math.round(
        turnaroundRows.reduce((sum, row) => {
          const created = getTimestamp(row?.transaction?.created_at)
          const updated = getTimestamp(getUpdatedAt(row))
          return sum + Math.max(0, Math.round((updated - created) / (24 * 60 * 60 * 1000)))
        }, 0) / turnaroundRows.length,
      )
    : 0

  const previousTurnaroundDays = previousWindow.length
    ? Math.round(
        previousWindow.reduce((sum, row) => {
          const created = getTimestamp(row?.transaction?.created_at)
          const updated = getTimestamp(getUpdatedAt(row))
          return sum + Math.max(0, Math.round((updated - created) / (24 * 60 * 60 * 1000)))
        }, 0) / previousWindow.length,
      )
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

  const approvalDelta = roundTo(approvalRate - previousApprovalRate, 0)
  const turnaroundDelta = averageTurnaroundDays - previousTurnaroundDays
  const applicationsDelta = rows.length - previousWindow.length
  const bondValueDelta = totalBondValue - previousBondValue
  const commissionDelta = totalCommission - previousCommission

  return [
    {
      key: 'approval_rate',
      label: 'Approval Rate',
      value: `${roundTo(approvalRate, 0)}%`,
      trend: approvalDelta >= 0 ? `+${approvalDelta}%` : `${approvalDelta}%`,
      trendLabel: `vs last month`,
      comparison: `vs last month`,
      sparkline: buildSparkline(
        [previousApprovalRate, approvalRate].map((value) => ({ value })),
        6,
      ),
    },
    {
      key: 'avg_turnaround',
      label: 'Avg Turnaround',
      value: `${averageTurnaroundDays} days`,
      trend: turnaroundDelta <= 0 ? `${Math.abs(roundTo(turnaroundDelta, 0))}d faster` : `${roundTo(turnaroundDelta, 0)}d slower`,
      trendLabel: `vs last month`,
      comparison: `vs last month`,
      sparkline: buildSparkline([previousTurnaroundDays, averageTurnaroundDays].map((value) => ({ value })), 6),
    },
    {
      key: 'applications',
      label: 'Total Applications',
      value: String(rows.length),
      trend: applicationsDelta >= 0 ? `+${applicationsDelta}` : `${applicationsDelta}`,
      trendLabel: `vs last month`,
      comparison: 'active book',
      sparkline: buildSparkline([previousWindow.length, rows.length].map((value) => ({ value })), 6),
    },
    {
      key: 'bond_value',
      label: 'Bond Value',
      value: formatCurrency(totalBondValue),
      trend: bondValueDelta >= 0 ? `+${formatCurrency(bondValueDelta)}` : `-${formatCurrency(Math.abs(bondValueDelta))}`,
      trendLabel: 'pipeline value',
      comparison: 'vs prior period',
      sparkline: buildSparkline([previousBondValue, totalBondValue].map((value) => ({ value })), 6),
    },
    {
      key: 'commission_pipeline',
      label: 'Commission Pipeline',
      value: formatCurrency(totalCommission),
      trend: commissionDelta >= 0 ? `+${formatCurrency(commissionDelta)}` : `-${formatCurrency(Math.abs(commissionDelta))}`,
      trendLabel: 'commission',
      comparison: 'est movement',
      sparkline: buildSparkline([previousCommission, totalCommission].map((value) => ({ value })), 6),
    },
    {
      key: 'top_bank',
      label: 'Top Performing Bank',
      value: topBank ? topBank.bank : 'Not enough data',
      trend: topBank ? `${roundTo((topBank.approvals / Math.max(topBank.total, 1)) * 100, 1)}%` : 'Tracking',
      trendLabel: topBank ? 'approval rate' : 'pipeline lead',
      comparison: topBank ? 'approval rate' : 'Tracking',
      sparkline: buildSparkline(
        topBank
          ? [
              { value: roundTo((topBank.approvals / Math.max(topBank.total, 1)) * 100, 1) },
              { value: roundTo((topBank.approvals / Math.max(topBank.total, 1)) * 100, 1) + 1 },
            ]
          : [{ value: 0 }, { value: 0 }],
        6,
      ),
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
  const firstName = normalizeText(user?.profile?.first_name || user?.profile?.firstName)
  const lastName = normalizeText(user?.profile?.last_name || user?.profile?.lastName)
  const profileName = normalizeText(user?.profile?.fullName || user?.profile?.full_name)
  const fullName = profileName || [firstName, lastName].filter(Boolean).join(' ')
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
    const status = normalizeText(row?.status) || deriveTransactionStatus(row)
    accumulator[status] = (accumulator[status] || 0) + 1
    if (status !== 'cancelled' && status !== 'registered') {
      accumulator.active = (accumulator.active || 0) + 1
    }
    return accumulator
  }, {})

  return [
    { key: 'all', label: 'All', count: rows.length },
    { key: 'active', label: 'Active', count: buckets.active || 0 },
    { key: 'bond_approved', label: 'Bond Approved', count: buckets.bond_approved || 0 },
    { key: 'grant_signed', label: 'Grant Signed', count: buckets.grant_signed || 0 },
    { key: 'instruction_sent', label: 'Instruction Sent', count: buckets.instruction_sent || 0 },
    { key: 'attorney_stage', label: 'Attorney Stage', count: (buckets.awaiting_instruction || 0) + (buckets.in_transfer || 0) },
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
  const approvalConfidence = calculateApprovalProbability(row)
  const operationalRisk = calculateOperationalRisk(row)
  const velocity = calculateTransactionVelocity(row)
  const financeInsights = generateFinanceInsights(row)

  return {
    key: transactionId || getPropertyLabel(row),
    transactionId,
    transactionReference: normalizeText(row?.transaction?.transaction_reference || row?.transaction?.reference),
    applicationReference: normalizeText(row?.transaction?.application_reference || row?.transaction?.bond_application_reference),
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
    approvalConfidence,
    operationalRisk,
    velocity,
    financeInsights,
    transactionConfidence: Math.round((approvalConfidence.score * 0.55) + ((100 - operationalRisk.riskScore) * 0.25) + (velocity.velocityScore * 0.2)),
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
  if (status === 'active') {
    return rows.filter((row) => row.status !== 'registered' && row.status !== 'cancelled')
  }
  if (status === 'attorney_stage') {
    return rows.filter((row) => row.status === 'awaiting_instruction' || row.status === 'in_transfer')
  }
  return rows.filter((row) => row.status === status)
}

function average(values = []) {
  const numeric = values.filter((value) => Number.isFinite(value))
  if (!numeric.length) return 0
  return Math.round(numeric.reduce((total, value) => total + value, 0) / numeric.length)
}

function isUpdatedThisMonth(row = {}) {
  const date = getDateOrNull(getUpdatedAt(row))
  if (!date) return false
  const now = new Date()
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth()
}

function buildDevelopmentSummary(rows = []) {
  const pipelineRows = rows.filter((row) => !isBondTransactionLifecycleRow(row))
  const transactionRows = rows.filter(isBondTransactionLifecycleRow)
  const approvedRows = rows.filter((row) => ['bond_approved', 'grant_signed', 'instruction_sent', 'registered'].includes(deriveTransactionStatus(row)))
  const approvalDurations = approvedRows
    .map((row) => {
      const created = getTimestamp(row?.transaction?.created_at)
      const updated = getTimestamp(getUpdatedAt(row))
      return created && updated ? Math.max(0, Math.round((updated - created) / (24 * 60 * 60 * 1000))) : null
    })
    .filter((value) => value !== null)
  const atRiskRows = rows.filter((row) => deriveRiskSignals(row).atRisk)
  const registeredRows = rows.filter((row) => deriveTransactionStatus(row) === 'registered')

  return {
    activeApplications: pipelineRows.length,
    activeTransactions: transactionRows.length,
    activeFiles: rows.length,
    pipelineValue: rows.reduce((total, row) => total + getBondAmount(row), 0),
    pipelineValueLabel: formatCurrency(rows.reduce((total, row) => total + getBondAmount(row), 0)),
    approvalRate: rows.length ? roundTo((approvedRows.length / rows.length) * 100) : 0,
    avgApprovalDays: average(approvalDurations),
    pendingDocuments: rows.filter((row) => getDocumentMissingCount(row) > 0).length,
    registeredThisMonth: registeredRows.filter(isUpdatedThisMonth).length,
    atRiskFiles: atRiskRows.length,
  }
}

function buildBankDistribution(rows = []) {
  const groups = new Map()
  for (const row of rows) {
    const bank = normalizeText(row?.transaction?.bank || row?.transaction?.preferred_bank || row?.transaction?.preferredBank) || 'Bank not selected'
    const item = groups.get(bank) || { bank, count: 0, approved: 0, pending: 0, declined: 0, value: 0 }
    const status = deriveTransactionStatus(row)
    item.count += 1
    item.value += getBondAmount(row)
    if (status === 'cancelled') item.declined += 1
    else if (['bond_approved', 'grant_signed', 'instruction_sent', 'registered'].includes(status)) item.approved += 1
    else item.pending += 1
    groups.set(bank, item)
  }
  return [...groups.values()].sort((left, right) => right.count - left.count)
}

function buildDevelopmentClientRows(rows = []) {
  return rows.slice(0, 12).map((row) => {
    const assignment = resolveEffectiveBondAssignment(row?.transaction || {})
    return {
      id: normalizeText(row?.buyer?.id || row?.transaction?.buyer_id || row?.transaction?.id) || getPropertyLabel(row),
      name: normalizeText(row?.buyer?.name || row?.transaction?.buyer_name || row?.transaction?.client_name) || 'Unknown buyer',
      property: getPropertyLabel(row),
      financeType: normalizeFinanceType(row?.transaction?.finance_type, { allowUnknown: true }) || 'bond',
      applicationStatus: deriveFinanceLaneStage(row).label,
      documentStatus: getDocumentMissingCount(row) > 0 ? `${getDocumentMissingCount(row)} missing` : 'Complete',
      consultant: getDisplayNameFromAssignment(assignment, row, 'consultant'),
      lastActivity: getUpdatedAt(row),
      nextAction: normalizeText(row?.transaction?.next_action) || 'No next action',
    }
  })
}

function buildDevelopmentPartners(rows = [], identity = {}) {
  const groups = new Map()
  const add = (role, name, stats = {}) => {
    const cleanName = normalizeText(name)
    if (!cleanName) return
    const key = `${role}:${cleanName}`
    const item = groups.get(key) || { key, role, name: cleanName, linkedFiles: 0, approvalRate: 0, avgDays: 0 }
    item.linkedFiles += stats.linkedFiles || 1
    groups.set(key, item)
  }
  add('Developer', identity.developerName, { linkedFiles: rows.length })
  for (const row of rows) {
    const assignment = resolveEffectiveBondAssignment(row?.transaction || {})
    add('Agent', row?.transaction?.assigned_agent)
    add('Bond Consultant', getDisplayNameFromAssignment(assignment, row, 'consultant'))
    add('Attorney', row?.transaction?.attorney_name || row?.transaction?.conveyancer_name)
    add('Bank', row?.transaction?.bank || row?.transaction?.preferred_bank)
  }
  return [...groups.values()].slice(0, 12)
}

function buildDevelopmentCard(rows = [], identity = {}) {
  const summary = buildDevelopmentSummary(rows)
  return {
    ...identity,
    ...summary,
    href: `/bond/developments/${encodeURIComponent(identity.id)}`,
    transactionsHref: `/bond/transactions?developmentId=${encodeURIComponent(identity.id)}`,
    reportsHref: `/bond/reports?developmentId=${encodeURIComponent(identity.id)}`,
  }
}

function buildDevelopmentDetail(identity = {}, rows = []) {
  const summary = buildDevelopmentSummary(rows)
  const bankDistribution = buildBankDistribution(rows)
  const financeGroups = rows.reduce((accumulator, row) => {
    const key = normalizeFinanceType(row?.transaction?.finance_type, { allowUnknown: true }) || 'unknown'
    accumulator[key] = (accumulator[key] || 0) + 1
    return accumulator
  }, {})
  const stageGroups = rows.reduce((accumulator, row) => {
    const stage = deriveFinanceLaneStage(row).label
    accumulator[stage] = (accumulator[stage] || 0) + 1
    return accumulator
  }, {})

  return {
    ...identity,
    metrics: summary,
    pipelineHref: `/bond/pipeline?developmentId=${encodeURIComponent(identity.id)}`,
    transactionsHref: `/bond/transactions?developmentId=${encodeURIComponent(identity.id)}`,
    clientsHref: `/bond/clients?developmentId=${encodeURIComponent(identity.id)}`,
    overview: {
      bankDistribution,
      financeMix: Object.entries(financeGroups).map(([key, count]) => ({ key, label: key === 'combination' ? 'Hybrid' : key.charAt(0).toUpperCase() + key.slice(1), count })),
      stageMix: Object.entries(stageGroups).map(([label, count]) => ({ label, count })),
      recentActivity: rows
        .slice()
        .sort((left, right) => getTimestamp(getUpdatedAt(right)) - getTimestamp(getUpdatedAt(left)))
        .slice(0, 8)
        .map((row) => ({
          id: normalizeText(row?.transaction?.id) || getPropertyLabel(row),
          label: `${deriveFinanceLaneStage(row).label} · ${normalizeText(row?.buyer?.name || row?.transaction?.buyer_name) || 'Unknown buyer'}`,
          detail: getPropertyLabel(row),
          date: getUpdatedAt(row),
        })),
      issues: rows
        .filter((row) => deriveRiskSignals(row).atRisk)
        .slice(0, 6)
        .map((row) => ({
          id: normalizeText(row?.transaction?.id) || getPropertyLabel(row),
          title: normalizeText(row?.buyer?.name || row?.transaction?.buyer_name) || 'Unknown buyer',
          detail: deriveRiskSignals(row).reasons.join(' · ') || 'Risk flagged',
        })),
    },
    clients: buildDevelopmentClientRows(rows),
    partners: buildDevelopmentPartners(rows, identity),
    documents: [
      { type: 'Pricing sheets', status: rows.length ? 'Available on request' : 'Not uploaded' },
      { type: 'Bank requirement sheets', status: bankDistribution.length ? `${bankDistribution.length} banks linked` : 'Awaiting bank data' },
      { type: 'Developer mandates', status: identity.isUnassigned ? 'Not applicable' : 'Required' },
      { type: 'Commission agreements', status: 'Workspace controlled' },
      { type: 'Marketing packs', status: 'Not linked yet' },
      { type: 'FICA / compliance documents', status: summary.pendingDocuments ? `${summary.pendingDocuments} files need docs` : 'No document issues' },
    ],
    marketing: {
      hasData: rows.some((row) => row?.transaction?.lead_source || row?.transaction?.campaign_source),
      sourceBreakdown: rows.reduce((accumulator, row) => {
        const source = normalizeText(row?.transaction?.lead_source || row?.transaction?.campaign_source || row?.transaction?.assigned_agent) || 'Unattributed'
        accumulator[source] = (accumulator[source] || 0) + 1
        return accumulator
      }, {}),
    },
  }
}

export async function getBondDevelopmentsWorkspaceSnapshot(user = {}, workspaceId = '', options = {}) {
  const allRows = await resolveBondRows(user, workspaceId, options)
  const rows = filterRowsByDevelopment(allRows, options.developmentId)
  const groups = new Map()
  for (const row of allRows) {
    const identity = getDevelopmentIdentity(row)
    const group = groups.get(identity.id) || { identity, rows: [] }
    group.rows.push(row)
    groups.set(identity.id, group)
  }

  const developments = [...groups.values()]
    .map((group) => buildDevelopmentCard(group.rows, group.identity))
    .sort((left, right) => Number(right.pipelineValue || 0) - Number(left.pipelineValue || 0))

  const selectedDevelopmentId = normalizeText(options.developmentId)
  const selectedGroup = selectedDevelopmentId && selectedDevelopmentId !== 'all'
    ? groups.get(selectedDevelopmentId)
    : null

  return {
    rows,
    developments,
    developmentOptions: buildBondDevelopmentOptions(allRows),
    selectedDevelopmentId: selectedDevelopmentId || 'all',
    detail: selectedGroup ? buildDevelopmentDetail(selectedGroup.identity, selectedGroup.rows) : null,
  }
}

export async function getBondCommandCenterSnapshot(user = {}, workspaceId = '', options = {}) {
  const reportingScope = options.reportingScope || (await getBondDashboardReportingScope(user, workspaceId, options))
  const allRows = await resolveBondRows(user, workspaceId, options)
  const dateRows = filterRowsByDateRange(allRows, options.rangeKey || 'this_month')
  const filteredRows = filterRowsByDevelopment(dateRows, options.developmentId)
  const transactions = filteredRows.map((row) => row.transaction).filter(Boolean)
  const queues = resolveBondOperationalQueues(user, transactions)
  const priorityActions = buildPriorityActions(filteredRows)
  const focus = getRoleFocus(reportingScope)
  const executiveAnalytics = buildHeroKpiCards(filteredRows)
  const headerSummary = buildHeaderSummary(filteredRows)
  const bankBreakdown = buildBankBreakdown(filteredRows)
  const bankLeadTimes = buildBankLeadTimes(filteredRows)
  const pipelineFlow = buildPipelineFlow(filteredRows)
  const buyerDemographics = buildBuyerDemographics(filteredRows)
  const operationalRisk = buildOperationalRisk(filteredRows)
  const operationalHeatmap = buildOperationalHeatmap(filteredRows)
  const financeIntelligence = getCachedFinanceIntelligence(filteredRows, `bond-command-center:${workspaceId}:${options.rangeKey || 'this_month'}`)
  const approvalConfidenceDistribution = buildApprovalConfidenceDistribution(filteredRows)
  const operationalRiskMatrix = buildOperationalRiskMatrix(filteredRows)
  const teamPerformance = buildTeamPerformance(filteredRows)
  const connectedPartners = buildConnectedPartnerRows()
  const performanceSnapshot = buildPerformanceSnapshot(filteredRows)

  return {
    reportingScope,
    roleFocus: focus,
    userDisplayName: getUserDisplayName(user),
    headerSummary,
    heroSummary: executiveAnalytics.heroSummary,
    heroKpis: executiveAnalytics.heroKpis,
    activeApplications: buildActiveApplications(filteredRows),
    bankBreakdown,
    bankLeadTimes,
    pipelineFlow,
    buyerDemographics,
    approvalConfidenceDistribution,
    readinessFunnel: financeIntelligence.readinessFunnel,
    bankEfficiency: financeIntelligence.bankEfficiency,
    buyerQualityDistribution: financeIntelligence.readinessDistribution,
    operationalRisk,
    operationalRiskMatrix,
    operationalHeatmap,
    advancedOperationalHeatmaps: financeIntelligence.heatmaps,
    executiveReports: financeIntelligence.reportModels,
    teamPerformance,
    connectedPartners,
    attentionCount: countAttentionItems(priorityActions),
    priorityActions,
    pipelineOverview: buildPipelineOverview(filteredRows),
    teamWorkload: buildTeamWorkload(filteredRows, reportingScope),
    recentBankActivity: buildRecentBankActivity(filteredRows),
    atRiskApplications: buildAtRiskApplications(filteredRows),
    performanceSnapshot,
    queues,
    developmentOptions: buildBondDevelopmentOptions(dateRows),
    selectedDevelopmentId: normalizeText(options.developmentId) || 'all',
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
  const scopedRows = filterRowsByDevelopment(allRows, options.developmentId)
  const bondRows = scopedRows.filter((row) => {
    const financeType = normalizeFinanceType(row?.transaction?.finance_type, { allowUnknown: true })
    return isBondFinanceType(financeType) || deriveFinanceLaneStage(row).key !== 'finance_requested'
  })
  const transactionRows = bondRows.filter(isBondTransactionLifecycleRow).map(mapTransactionTrackerRow)
  const selectedStatus = normalizeText(options.status || 'all') || 'all'
  const filteredRows = filterTransactionRows(transactionRows, selectedStatus)

  return {
    reportingScope,
    selectedStatus,
    statusLabel: TRANSACTION_STATUS_META[selectedStatus]?.label || TRANSACTION_STATUS_META.all.label,
    statusCards: buildStatusCards(transactionRows),
    developmentOptions: buildBondDevelopmentOptions(allRows),
    selectedDevelopmentId: normalizeText(options.developmentId) || 'all',
    rows: filteredRows,
    totalRows: transactionRows.length,
    emptyState: {
      title: selectedStatus === 'all' ? 'No linked bond transactions yet' : `No ${TRANSACTION_STATUS_META[selectedStatus]?.label?.toLowerCase() || 'matching'} transactions`,
      description: 'Linked transactions will stay visible here from finance work through attorney transfer and final registration.',
    },
  }
}
