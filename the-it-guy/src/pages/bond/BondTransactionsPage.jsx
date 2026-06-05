/* eslint-disable react-refresh/only-export-components */
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Banknote,
  CheckCircle2,
  Clock3,
  FileCheck2,
  FileText,
  MoreVertical,
  Search,
  Send,
  SlidersHorizontal,
  UserRound,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import BondEmptyState from '../../components/bond/BondEmptyState'
import BondPageShell from '../../components/bond/BondPageShell'
import BondTransactionTable, { APPLICATION_PROGRESS_STAGE_OPTIONS, resolveBondProgressStage } from '../../components/bond/BondTransactionTable'
import { BOND_TRANSACTION_VIEW_PARAM, bondViews, getBondTransactionView, getBondTransactionViewFromStatus } from '../../config/bondViews'
import { useWorkspace } from '../../context/WorkspaceContext'
import * as bondCommandCenterService from '../../services/bondCommandCenterService'

function normalizeText(value) {
  return String(value || '').trim()
}

function resolveWorkspaceId(workspaceContext = {}) {
  return normalizeText(
    workspaceContext.workspaceId ||
      workspaceContext.currentWorkspace?.id ||
      workspaceContext.workspace?.id ||
      workspaceContext.currentMembership?.workspaceId ||
      workspaceContext.currentMembership?.organisation_id ||
      workspaceContext.currentMembership?.organisationId,
  )
}

function normalizeStatusFilter(value) {
  const normalized = normalizeText(value).toLowerCase().replace(/_/g, '-')
  if (['all', 'active', 'needs-action', 'at-risk', 'completed'].includes(normalized)) {
    return normalized
  }
  return ''
}

function statusFilterFromLegacyStatus(status = 'all') {
  const normalized = normalizeText(status).toLowerCase()
  if (['at_risk', 'at-risk'].includes(normalized)) return 'at-risk'
  if (normalized === 'registered') return 'completed'
  if (normalized === 'declined') return 'completed'
  if (normalized === 'cancelled') return 'completed'
  if (normalized === 'all') return 'all'
  if (normalized === 'active') return 'active'
  return 'active'
}

function normalizeSortMode(value) {
  const normalized = normalizeText(value).toLowerCase().replace(/_/g, '-')
  if (normalized === 'last_activity' || normalized === 'last-activity') return 'last_activity'
  return 'last_activity'
}

function parseRowsForQuery(rows = []) {
  return Array.isArray(rows) ? rows : []
}

function parseActivityAt(row = {}) {
  const date = new Date(row?.lastActivityAt || 0)
  return Number.isNaN(date.getTime()) ? 0 : date.getTime()
}

function getDefaultSortRows(rows = []) {
  return [...parseRowsForQuery(rows)].sort((left, right) => parseActivityAt(right) - parseActivityAt(left))
}

function matchesSearch(row = {}, query = '') {
  const normalizedQuery = normalizeText(query).toLowerCase()
  if (!normalizedQuery) return true
  const haystack = [
    row.client,
    row.applicationReference,
    row.transactionReference,
    row.property,
    row.partner,
    row.attorney,
    row.consultant,
    row.processor,
    row.bank,
    row.financeStageLabel,
    row.transferStageLabel,
    row.nextAction,
    row.riskStatus,
  ]
    .map((value) => normalizeText(value).toLowerCase())
    .join(' ')
  return haystack.includes(normalizedQuery)
}

function matchesStatusFilter(row = {}, filter = 'all') {
  const status = normalizeText(row?.status).toLowerCase()
  const nextAction = normalizeText(row?.nextAction).toLowerCase()

  if (filter === 'active') {
    return !['registered', 'at_risk', 'cancelled'].includes(status)
  }
  if (filter === 'needs-action') {
    return !['registered', 'cancelled'].includes(status) && nextAction && nextAction !== 'no next action set'
  }
  if (filter === 'at-risk') {
    return status === 'at_risk'
  }
  if (filter === 'completed') {
    return status === 'registered'
  }
  return true
}

function matchesStageFilter(row = {}, filter = 'all') {
  if (filter === 'all') return true
  return resolveBondProgressStage(row) === filter
}

const HQ_STATUS_LABELS = {
  intake: 'Intake',
  docs: 'Documents',
  submitted_to_banks: 'Submitted to Banks',
  bank_feedback: 'Bank Feedback',
  approved: 'Approved',
  instruction_sent: 'Instruction Issued',
  registered: 'Registered',
  declined: 'Declined',
}

const HQ_FILTER_DEFAULTS = {
  tab: 'all',
  region: 'all',
  branch: 'all',
  consultant: 'all',
  status: 'all',
  risk: 'all',
  dateRange: 'all',
  sort: 'newest',
}

const DATE_RANGE_OPTIONS = [
  { key: 'all', label: 'All dates' },
  { key: '7d', label: 'Last 7 days', days: 7 },
  { key: '30d', label: 'Last 30 days', days: 30 },
  { key: '90d', label: 'Last 90 days', days: 90 },
]

const RISK_OPTIONS = [
  { key: 'all', label: 'All risk' },
  { key: 'low', label: 'Low' },
  { key: 'medium', label: 'Medium' },
  { key: 'high', label: 'High' },
  { key: 'critical', label: 'Critical' },
]

const SORT_OPTIONS = [
  { key: 'newest', label: 'Newest first' },
  { key: 'oldest', label: 'Oldest first' },
  { key: 'highest_risk', label: 'Highest risk' },
  { key: 'status', label: 'Status' },
  { key: 'branch', label: 'Branch' },
  { key: 'consultant', label: 'Consultant' },
]

const APPLICATION_PIPELINE_STAGES = [
  { key: 'intake', label: 'Intake' },
  { key: 'docs', label: 'Docs' },
  { key: 'submitted_to_banks', label: 'Submitted' },
  { key: 'bank_feedback', label: 'Bank Review' },
  { key: 'approved', label: 'Approved' },
  { key: 'instruction_sent', label: 'Instruction' },
  { key: 'registered', label: 'Complete' },
]

const CURRENCY_FORMATTER = new Intl.NumberFormat('en-ZA', {
  style: 'currency',
  currency: 'ZAR',
  maximumFractionDigits: 0,
})

function normalizeKey(value) {
  return normalizeText(value).toLowerCase().replace(/[\s-]+/g, '_')
}

function parseDateTimestamp(value) {
  const date = new Date(value || 0)
  return Number.isNaN(date.getTime()) ? 0 : date.getTime()
}

function normalizeNumber(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function looksLikeTechnicalId(value = '') {
  const normalized = normalizeText(value)
  if (!normalized) return false
  return (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized) ||
    /^(region|branch|unit|development|property|workspace|user)-[0-9a-f-]{8,}$/i.test(normalized) ||
    /^[0-9a-f]{16,}$/i.test(normalized)
  )
}

function safeDisplayText(value = '', fallback = '') {
  const normalized = normalizeText(value)
  if (!normalized || looksLikeTechnicalId(normalized)) return fallback
  return normalized
}

function formatCurrency(value = 0) {
  return CURRENCY_FORMATTER.format(normalizeNumber(value, 0)).replace(/\u00a0/g, ' ')
}

function getBondValue(row = {}) {
  return normalizeNumber(row.bondAmount ?? row.requestedFinanceAmount ?? row.financeAmount ?? row.purchasePrice ?? row.salesPrice, 0)
}

function truthyFlag(value) {
  return ['true', '1', 'yes', 'on'].includes(normalizeText(value).toLowerCase())
}

export function isExplicitBondDemoModeEnabled(workspaceContext = {}) {
  const env = import.meta?.env || {}
  return Boolean(
    truthyFlag(env.VITE_ENABLE_MOCK_DATA) ||
      workspaceContext.enableMockData === true ||
      workspaceContext.demoMode === true ||
      workspaceContext.currentWorkspace?.demoMode === true ||
      workspaceContext.currentWorkspace?.demo_mode === true,
  )
}

export function isHqApplicationsScope(snapshot = {}, workspaceContext = {}) {
  const reportingScope = snapshot?.reportingScope || snapshot || {}
  const membership = workspaceContext.currentMembership || {}
  const dashboardModes = [
    reportingScope.dashboardMode,
    reportingScope.dashboard_mode,
    workspaceContext.dashboardMode,
    workspaceContext.dashboard_mode,
    membership.dashboardMode,
    membership.dashboard_mode,
  ].map(normalizeKey)
  const scopeLevels = [
    reportingScope.scopeLevel,
    reportingScope.scope_level,
    workspaceContext.scopeLevel,
    workspaceContext.scope_level,
    membership.scopeLevel,
    membership.scope_level,
  ].map(normalizeKey)
  const roles = [
    reportingScope.workspaceRole,
    reportingScope.workspace_role,
    workspaceContext.workspaceRole,
    workspaceContext.workspace_role,
    workspaceContext.role,
    membership.workspaceRole,
    membership.workspace_role,
    membership.role,
  ].map(normalizeKey)

  return (
    dashboardModes.some((mode) => ['owner_director', 'hq_manager'].includes(mode)) ||
    scopeLevels.includes('workspace_hq') ||
    roles.some((role) => ['owner_director', 'hq_manager'].includes(role))
  )
}

function isMissingAssignmentLabel(value, kind) {
  const normalized = normalizeKey(value)
  if (!normalized) return true
  if (kind === 'branch') return ['unassigned_branch', 'branch_pending', 'branch'].includes(normalized)
  if (kind === 'region') return ['unassigned_region', 'region_pending', 'region'].includes(normalized)
  if (kind === 'consultant') return ['consultant', 'unassigned_consultant', 'consultant_pending'].includes(normalized)
  return false
}

function displayRegion(row = {}) {
  const label = safeDisplayText(row.regionName || row.region || row.regionLabel)
  return isMissingAssignmentLabel(label, 'region') ? 'No region' : label
}

function displayBranch(row = {}) {
  const label = safeDisplayText(row.branchName || row.branch || row.branchLabel)
  return isMissingAssignmentLabel(label, 'branch') ? 'Unassigned branch' : label
}

function displayConsultant(row = {}) {
  const label = safeDisplayText(row.consultantName || row.consultant)
  const hasAssignment = Boolean(normalizeText(row.assignedUserId || row.assignedUserEmail))
  return !hasAssignment || isMissingAssignmentLabel(label, 'consultant') ? 'Unassigned consultant' : label
}

function hasBranch(row = {}) {
  return displayBranch(row) !== 'Unassigned branch'
}

function hasConsultant(row = {}) {
  return displayConsultant(row) !== 'Unassigned consultant'
}

export function isHqApplicationUnassigned(row = {}) {
  return !hasBranch(row) || !hasConsultant(row)
}

function getCreatedTimestamp(row = {}) {
  return parseDateTimestamp(
    row.createdAt ||
      row.intakeCreatedAt ||
      row.applicationCreatedAt ||
      row.transactionCreatedAt ||
      row.lastActivityAt,
  )
}

function formatDate(value) {
  const timestamp = parseDateTimestamp(value)
  if (!timestamp) return 'No date'
  return new Intl.DateTimeFormat('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(timestamp))
}

function getAgeLabel(row = {}, now = Date.now()) {
  const timestamp = getCreatedTimestamp(row)
  if (!timestamp) return 'No date'
  const days = Math.max(0, Math.floor((now - timestamp) / (24 * 60 * 60 * 1000)))
  if (days === 0) return 'Today'
  if (days === 1) return '1 day'
  return `${days} days`
}

function resolveHqApplicationStatus(row = {}) {
  const status = normalizeKey(row.status)
  const financeKey = normalizeKey(row.financeStageKey)
  const financeLabel = normalizeKey(row.financeStageLabel)
  const queueStatus = normalizeKey(row.originatorQueueStatus)
  const queueLabel = normalizeKey(row.originatorQueueLabel)
  const transferKey = normalizeKey(row.transferStageKey)
  const registrationStatus = normalizeKey(row.registrationStatus)
  const bankStatus = normalizeKey(row.bankSubmissionStatus)
  const nextAction = normalizeKey(row.nextAction)

  if (registrationStatus === 'registered' || transferKey === 'registered' || status === 'registered') return 'registered'
  if (['bond_instruction_sent', 'instruction_sent', 'grant_signed'].includes(financeKey) || ['instruction_sent', 'grant_signed'].includes(status)) return 'instruction_sent'
  if (['bond_approved', 'approved'].includes(status) || financeKey === 'bond_approved' || financeLabel.includes('approved')) return 'approved'
  if (financeKey === 'bank_feedback' || status === 'bank_feedback' || bankStatus.includes('feedback')) return 'bank_feedback'
  if (financeKey === 'submitted_to_banks' || financeLabel.includes('submitted') || bankStatus.includes('submitted')) return 'submitted_to_banks'
  if (financeKey === 'ready_for_review' || queueStatus === 'ready_for_review' || queueLabel === 'ready_for_review') return 'docs'
  if (['bond_application_open', 'application_in_progress', 'docs_collection', 'pre_approval', 'application_submitted'].includes(financeKey)) return 'docs'
  if (queueStatus === 'application_in_progress' || queueStatus === 'application_submitted' || nextAction.includes('documents')) return 'docs'
  if (getBondValue(row) > 0 || queueStatus === 'ready_to_start') return 'intake'
  return 'intake'
}

function getFriendlyNextAction(row = {}, statusKey = resolveHqApplicationStatus(row)) {
  if (isHqApplicationUnassigned(row)) {
    if (!hasBranch(row)) return 'Assign branch'
    return 'Assign consultant'
  }
  const explicit = normalizeText(row.nextAction)
  if (explicit && explicit.toLowerCase() !== 'no next action set') return explicit
  const nextActions = {
    intake: 'Complete application and documents',
    docs: 'Upload outstanding documents',
    submitted_to_banks: `Await lender response${row.bank && row.bank !== 'Bank pending' ? ` from ${row.bank}` : ''}`,
    bank_feedback: `Respond to ${row.bank && row.bank !== 'Bank pending' ? row.bank : 'bank'} query and refresh docs`,
    approved: 'Prepare for instruction',
    instruction_sent: 'Monitor attorney instruction',
    registered: 'Application complete',
    declined: 'Review declined application',
  }
  return nextActions[statusKey] || 'Open application'
}

function normalizeRiskKey(row = {}, now = Date.now()) {
  const riskLevel = normalizeKey(row.riskLevel || row.operationalRisk?.riskLevel)
  const riskTone = normalizeKey(row.riskTone)
  const riskStatus = normalizeKey(row.riskStatus)
  const riskScore = Number(row.riskScore ?? row.operationalRisk?.riskScore ?? 0)
  if (riskLevel.includes('critical')) return 'critical'
  if (riskLevel.includes('high')) return 'high'
  if (riskLevel.includes('medium')) return 'medium'
  if (riskLevel.includes('low')) return 'low'

  const ageDays = Math.max(0, Math.floor((now - (getCreatedTimestamp(row) || now)) / (24 * 60 * 60 * 1000)))
  const missingDocuments = normalizeNumber(row.missingDocuments ?? row.documentSummary?.missingCount, 0)
  const statusKey = resolveHqApplicationStatus(row)
  const lastActivityAge = Math.max(0, Math.floor((now - parseDateTimestamp(row.lastActivityAt)) / (24 * 60 * 60 * 1000)))
  const staleBankFeedback = statusKey === 'bank_feedback' && lastActivityAge >= 5
  const hasSlaRisk = normalizeKey(row.riskStatus).includes('overdue') || normalizeKey(row.nextAction).includes('overdue')

  if (riskScore >= 90 || (hasSlaRisk && ageDays >= 21)) return 'critical'
  if (riskTone === 'risk' || riskScore >= 70 || missingDocuments >= 3 || staleBankFeedback || ageDays >= 30) return 'high'
  if (riskStatus.includes('attention') || riskScore >= 35) return 'medium'
  if (missingDocuments > 0 || ageDays >= 14) return 'medium'
  return 'low'
}

function riskLabelFromKey(key) {
  if (key === 'critical') return 'Critical'
  if (key === 'high') return 'High'
  if (key === 'medium') return 'Medium'
  return 'Low'
}

function getRiskSortScore(row = {}) {
  const key = normalizeRiskKey(row)
  if (key === 'critical') return 4
  if (key === 'high') return 3
  if (key === 'medium') return 2
  return 1
}

export function buildHqApplicationRegisterRows(rows = [], now = Date.now()) {
  return parseRowsForQuery(rows).map((row) => {
    const statusKey = resolveHqApplicationStatus(row)
    const riskKey = normalizeRiskKey(row, now)
    const stageIndex = Math.max(0, APPLICATION_PIPELINE_STAGES.findIndex((stage) => stage.key === statusKey))
    const resolvedStageIndex = stageIndex >= 0 ? stageIndex : 0
    const progressPercent = Math.round(((resolvedStageIndex + 1) / APPLICATION_PIPELINE_STAGES.length) * 100)
    const bondValue = getBondValue(row)
    const applicationReference = safeDisplayText(row.applicationReference || row.transactionReference || row.bondApplicationId, '')
    const readableReference = applicationReference || (row.transactionId ? `BND-${normalizeText(row.transactionId).slice(-4).toUpperCase()}` : 'Reference pending')
    const propertyDisplay = safeDisplayText(
      row.property ||
        [row.developmentName, row.unitLabel].map((item) => safeDisplayText(item)).filter(Boolean).join(' • '),
      'Property pending',
    )
    return {
      ...row,
      createdTimestamp: getCreatedTimestamp(row),
      createdDateLabel: formatDate(row.createdAt || row.intakeCreatedAt || row.applicationCreatedAt || row.transactionCreatedAt || row.lastActivityAt),
      ageLabel: getAgeLabel(row, now),
      regionDisplay: displayRegion(row),
      branchDisplay: displayBranch(row),
      consultantDisplay: displayConsultant(row),
      consultantRoleLabel: displayBranch(row) === 'Unassigned branch' ? 'Internal Consultant' : displayBranch(row),
      isUnassigned: isHqApplicationUnassigned(row),
      statusKey,
      statusLabel: HQ_STATUS_LABELS[statusKey] || 'Intake Received',
      progressStageIndex: resolvedStageIndex,
      progressPercent,
      riskKey,
      riskLabel: riskLabelFromKey(riskKey),
      bondValue,
      bondValueLabel: row.bondAmountLabel || formatCurrency(bondValue),
      applicationReferenceDisplay: readableReference,
      propertyDisplay,
      nextActionLabel: getFriendlyNextAction(row, statusKey),
      openHref: row.transactionId ? `/bond/files/${encodeURIComponent(row.transactionId)}` : '/bond/pipeline?view=all',
    }
  })
}

function uniqueOptions(rows = [], field, allLabel) {
  const options = new Map()
  for (const row of rows) {
    const label = normalizeText(row[field])
    if (!label) continue
    options.set(label, { key: label, label })
  }
  return [{ key: 'all', label: allLabel }, ...[...options.values()].sort((left, right) => left.label.localeCompare(right.label))]
}

export function getHqApplicationFilterOptions(rows = []) {
  return {
    regions: uniqueOptions(rows, 'regionDisplay', 'All regions'),
    branches: uniqueOptions(rows, 'branchDisplay', 'All branches'),
    consultants: uniqueOptions(rows, 'consultantDisplay', 'All consultants'),
    statuses: [
      { key: 'all', label: 'All statuses' },
      ...Object.entries(HQ_STATUS_LABELS).map(([key, label]) => ({ key, label })),
    ],
  }
}

function matchesHqDateRange(row = {}, rangeKey = 'all', now = Date.now()) {
  const option = DATE_RANGE_OPTIONS.find((item) => item.key === rangeKey)
  if (!option?.days) return true
  const timestamp = row.createdTimestamp || getCreatedTimestamp(row)
  if (!timestamp) return false
  return timestamp >= now - (option.days * 24 * 60 * 60 * 1000)
}

export function sortHqApplicationRegisterRows(rows = [], sort = 'newest') {
  const sortedRows = [...parseRowsForQuery(rows)]
  const compareText = (left, right, field) => normalizeText(left[field]).localeCompare(normalizeText(right[field]))
  if (sort === 'oldest') return sortedRows.sort((left, right) => (left.createdTimestamp || 0) - (right.createdTimestamp || 0))
  if (sort === 'highest_risk') return sortedRows.sort((left, right) => getRiskSortScore(right) - getRiskSortScore(left) || (right.createdTimestamp || 0) - (left.createdTimestamp || 0))
  if (sort === 'status') return sortedRows.sort((left, right) => compareText(left, right, 'statusLabel') || (right.createdTimestamp || 0) - (left.createdTimestamp || 0))
  if (sort === 'branch') return sortedRows.sort((left, right) => compareText(left, right, 'branchDisplay') || (right.createdTimestamp || 0) - (left.createdTimestamp || 0))
  if (sort === 'consultant') return sortedRows.sort((left, right) => compareText(left, right, 'consultantDisplay') || (right.createdTimestamp || 0) - (left.createdTimestamp || 0))
  return sortedRows.sort((left, right) => (right.createdTimestamp || 0) - (left.createdTimestamp || 0))
}

export function filterHqApplicationRegisterRows(rows = [], filters = HQ_FILTER_DEFAULTS, now = Date.now()) {
  const safeFilters = { ...HQ_FILTER_DEFAULTS, ...(filters || {}) }
  const filteredRows = parseRowsForQuery(rows).filter((row) => {
    if (safeFilters.tab === 'unassigned' && !row.isUnassigned) return false
    if (!['all', 'unassigned'].includes(safeFilters.tab) && row.statusKey !== safeFilters.tab) return false
    if (safeFilters.region !== 'all' && row.regionDisplay !== safeFilters.region) return false
    if (safeFilters.branch !== 'all' && row.branchDisplay !== safeFilters.branch) return false
    if (safeFilters.consultant !== 'all' && row.consultantDisplay !== safeFilters.consultant) return false
    if (safeFilters.status !== 'all' && row.statusKey !== safeFilters.status) return false
    if (safeFilters.risk !== 'all' && row.riskKey !== safeFilters.risk) return false
    return matchesHqDateRange(row, safeFilters.dateRange, now)
  })
  return sortHqApplicationRegisterRows(filteredRows, safeFilters.sort)
}

export function getHqApplicationKpis(rows = [], now = Date.now()) {
  const normalizedRows = parseRowsForQuery(rows)
  const currentStart = now - (30 * 24 * 60 * 60 * 1000)
  const previousStart = now - (60 * 24 * 60 * 60 * 1000)
  const inCurrentPeriod = (row) => (row.createdTimestamp || 0) >= currentStart
  const inPreviousPeriod = (row) => (row.createdTimestamp || 0) >= previousStart && (row.createdTimestamp || 0) < currentStart
  const calculateTrend = (currentValue, previousValue) => {
    if (!previousValue && !currentValue) return '0% vs last 30 days'
    if (!previousValue) return '+100% vs last 30 days'
    const delta = Math.round(((currentValue - previousValue) / Math.max(previousValue, 1)) * 100)
    return `${delta >= 0 ? '+' : ''}${delta}% vs last 30 days`
  }
  const countTrend = (predicate = () => true) => {
    const currentValue = normalizedRows.filter((row) => predicate(row) && inCurrentPeriod(row)).length
    const previousValue = normalizedRows.filter((row) => predicate(row) && inPreviousPeriod(row)).length
    return calculateTrend(currentValue, previousValue)
  }
  const valueForRows = (sourceRows = []) => sourceRows.reduce((sum, row) => sum + normalizeNumber(row.bondValue ?? getBondValue(row), 0), 0)
  const currentValue = valueForRows(normalizedRows.filter(inCurrentPeriod))
  const previousValue = valueForRows(normalizedRows.filter(inPreviousPeriod))

  return [
    { key: 'total', label: 'Total Applications', value: normalizedRows.length, trend: countTrend(), icon: FileText },
    { key: 'pipeline_value', label: 'Active Pipeline Value', value: formatCurrency(valueForRows(normalizedRows.filter((row) => !['registered', 'declined'].includes(row.statusKey)))), trend: calculateTrend(currentValue, previousValue), icon: Banknote },
    { key: 'submitted_to_banks', label: 'Submitted to Banks', value: normalizedRows.filter((row) => row.statusKey === 'submitted_to_banks').length, trend: countTrend((row) => row.statusKey === 'submitted_to_banks'), icon: Send },
    { key: 'awaiting_feedback', label: 'Awaiting Feedback', value: normalizedRows.filter((row) => row.statusKey === 'bank_feedback').length, trend: countTrend((row) => row.statusKey === 'bank_feedback'), icon: Clock3 },
    { key: 'approved', label: 'Approved', value: normalizedRows.filter((row) => row.statusKey === 'approved').length, trend: countTrend((row) => row.statusKey === 'approved'), icon: CheckCircle2 },
    { key: 'instructions_issued', label: 'Instructions Issued', value: normalizedRows.filter((row) => ['instruction_sent', 'registered'].includes(row.statusKey)).length, trend: countTrend((row) => ['instruction_sent', 'registered'].includes(row.statusKey)), icon: FileCheck2 },
  ]
}

function HqFilterSelect({ label, value, onChange, options = [] }) {
  return (
    <label className="min-w-[160px] flex-1">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-[#72869b]">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-12 w-full rounded-[14px] border border-[#dbe5f0] bg-[#f9fbff] px-3 text-sm font-medium text-[#17324d] outline-none transition focus:border-[#9fb8d2]"
      >
        {options.map((option) => (
          <option key={option.key} value={option.key}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}

function HqBadge({ tone = 'neutral', children }) {
  const classes = {
    neutral: 'border-[#dbe5f0] bg-[#f8fbff] text-[#52677f]',
    warning: 'border-[#f6d7a8] bg-[#fff8eb] text-[#8a5b12]',
    risk: 'border-[#f4bfc0] bg-[#fff4f4] text-[#9a3030]',
    critical: 'border-[#f0a9b7] bg-[#fff1f3] text-[#8b1e36]',
    success: 'border-[#bfe5cd] bg-[#f1fbf4] text-[#267347]',
    info: 'border-[#c8d9f5] bg-[#f4f8ff] text-[#2a5d9f]',
  }
  return (
    <span className={`inline-flex min-h-7 items-center rounded-full border px-2.5 text-xs font-semibold ${classes[tone] || classes.neutral}`}>
      {children}
    </span>
  )
}

function riskTone(row = {}) {
  if (row.riskKey === 'critical') return 'critical'
  if (row.riskKey === 'high') return 'risk'
  if (row.riskKey === 'medium') return 'warning'
  return 'success'
}

function HqApplicationsEmptyState({ filtered = false }) {
  return (
    <section className="rounded-[18px] border border-[#dbe5f0] bg-white px-5 py-8 text-center shadow-[0_14px_34px_rgba(15,23,42,0.045)]">
      <p className="text-base font-semibold text-[#142132]">
        {filtered ? 'No applications match these filters.' : 'No applications found.'}
      </p>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[#60758d]">
        {filtered
          ? 'Clear filters to view all applications.'
          : 'Applications will appear here once buyers are assigned to this originator or submitted into the bond workflow.'}
      </p>
    </section>
  )
}

function getInitials(value = '') {
  const words = normalizeText(value).split(/\s+/).filter(Boolean)
  if (!words.length) return 'UA'
  return words.slice(0, 2).map((word) => word[0]?.toUpperCase()).join('')
}

function getRiskAccent(row = {}) {
  if (row.riskKey === 'critical') return '#e33452'
  if (row.riskKey === 'high') return '#ff6b6b'
  if (row.riskKey === 'medium') return '#f59e0b'
  if (row.statusKey === 'approved' || row.statusKey === 'registered') return '#17b26a'
  if (row.statusKey === 'submitted_to_banks' || row.statusKey === 'bank_feedback') return '#2563eb'
  return '#9fb8d2'
}

function StageProgress({ row = {} }) {
  const activeIndex = row.progressStageIndex || 0
  const accent = getRiskAccent(row)
  return (
    <div className="min-w-0">
      <div className="flex items-center justify-between gap-3">
        <p className="truncate text-sm font-semibold text-[#102448]">{row.statusLabel}</p>
        <span className="shrink-0 text-xs font-semibold text-[#60758d]">{row.progressPercent}% Complete</span>
      </div>
      <div className="mt-3 flex items-center gap-1.5">
        {APPLICATION_PIPELINE_STAGES.map((stage, index) => {
          const completed = index <= activeIndex
          return (
            <div key={stage.key} className="flex min-w-0 flex-1 items-center gap-1.5">
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[9px] font-bold ${
                  completed ? 'border-transparent text-white' : 'border-[#cfd9e6] bg-white text-[#8a9aab]'
                }`}
                style={completed ? { backgroundColor: accent } : undefined}
                aria-label={stage.label}
              >
                {index + 1}
              </span>
              {index < APPLICATION_PIPELINE_STAGES.length - 1 ? (
                <span className={`h-px min-w-2 flex-1 ${completed ? '' : 'bg-[#dfe7f1]'}`} style={completed ? { backgroundColor: accent } : undefined} />
              ) : null}
            </div>
          )
        })}
      </div>
      <div className="mt-2 grid grid-cols-7 gap-1 text-[10px] font-medium text-[#6f8398]">
        {APPLICATION_PIPELINE_STAGES.map((stage) => (
          <span key={stage.key} className="truncate">{stage.label}</span>
        ))}
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#e8eef5]">
        <span className="block h-full rounded-full" style={{ width: `${row.progressPercent}%`, backgroundColor: accent }} />
      </div>
    </div>
  )
}

function OverflowMenuButton() {
  return (
    <button
      type="button"
      className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[#6b7f95] transition hover:bg-[#eef4fb] hover:text-[#17324d]"
      title="More actions: view details, assign consultant, change status, add note"
      aria-label="More application actions"
    >
      <MoreVertical size={18} />
    </button>
  )
}

export function HqApplicationsTable({ rows = [], onOpen }) {
  if (!rows.length) return null
  return (
    <section className="space-y-3">
      <div className="hidden grid-cols-[minmax(230px,1.15fr)_minmax(170px,0.75fr)_minmax(330px,1.45fr)_90px_92px_120px_minmax(180px,0.9fr)] gap-6 px-6 text-xs font-semibold uppercase tracking-[0.12em] text-[#75889e] xl:grid">
        <span>Application</span>
        <span>Consultant</span>
        <span>Stage & Progress</span>
        <span>Risk</span>
        <span>Age</span>
        <span className="text-right">Value</span>
        <span>Next Action</span>
      </div>

      <div className="space-y-3">
        {rows.map((row) => (
          <article
            key={row.key || row.transactionId || row.bondApplicationId}
            className="relative overflow-hidden rounded-[16px] border border-[#dbe5f0] bg-white px-5 py-5 shadow-[0_12px_28px_rgba(15,23,42,0.04)] transition hover:-translate-y-0.5 hover:border-[#bfd0e0] hover:shadow-[0_18px_36px_rgba(15,23,42,0.07)] sm:px-6"
          >
            <span className="absolute inset-y-0 left-0 w-1.5" style={{ backgroundColor: getRiskAccent(row) }} />
            <div className="grid gap-5 xl:grid-cols-[minmax(230px,1.15fr)_minmax(170px,0.75fr)_minmax(330px,1.45fr)_90px_92px_120px_minmax(180px,0.9fr)] xl:items-center xl:gap-6">
              <div className="flex min-w-0 items-start gap-3">
                <span className="mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#dce8f2] bg-[#f4f8fd] text-[#23518a]">
                  <UserRound size={18} />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold text-[#102448]">{row.client || 'Buyer pending'}</p>
                  <p className="mt-1 truncate text-sm font-medium text-[#536b83]">{row.propertyDisplay}</p>
                  <span className="mt-2 inline-flex rounded-full bg-[#edf3f8] px-2 py-1 text-[11px] font-semibold text-[#526b85]">
                    {row.applicationReferenceDisplay}
                  </span>
                  {row.isUnassigned ? (
                    <span className="ml-2 inline-flex items-center gap-1 rounded-full border border-[#f6d7a8] bg-[#fff8eb] px-2 py-1 text-[11px] font-semibold text-[#8a5b12]">
                      <AlertTriangle size={12} />
                      Unassigned
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#102448] text-xs font-semibold text-white">
                  {getInitials(row.consultantDisplay)}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[#102448]">{row.consultantDisplay}</p>
                  <p className="mt-1 truncate text-xs font-medium text-[#64788f]">{row.consultantRoleLabel || 'Internal Consultant'}</p>
                </div>
              </div>

              <StageProgress row={row} />

              <div><HqBadge tone={riskTone(row)}>{row.riskLabel}</HqBadge></div>

              <div className="text-sm text-[#425a72]">
                <p className="text-lg font-semibold leading-none text-[#102448]">{row.ageLabel.replace(' days', '')}</p>
                <p className="mt-1 text-xs font-medium text-[#64788f]">{row.ageLabel.includes('day') ? 'days' : ''}</p>
                <p className="mt-1 text-xs text-[#64788f]">{row.createdDateLabel}</p>
              </div>

              <div className="text-left xl:text-right">
                <p className="text-base font-semibold text-[#102448]">{row.bondValueLabel}</p>
              </div>

              <div className="flex min-w-0 flex-col gap-3">
                <p className="text-sm font-medium leading-5 text-[#213a56]">{row.nextActionLabel}</p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onOpen(row)}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-[10px] bg-[#07183f] px-4 text-sm font-semibold text-white shadow-[0_10px_22px_rgba(7,24,63,0.18)] transition hover:bg-[#102a63]"
                  >
                    Open Application
                    <ArrowRight size={15} />
                  </button>
                  <OverflowMenuButton />
                </div>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

function HqApplicationsPagination({
  totalRows = 0,
  page = 1,
  rowsPerPage = 10,
  onPageChange,
  onRowsPerPageChange,
}) {
  if (!totalRows) return null
  const totalPages = Math.max(1, Math.ceil(totalRows / rowsPerPage))
  const firstRow = ((page - 1) * rowsPerPage) + 1
  const lastRow = Math.min(totalRows, page * rowsPerPage)
  const pageNumbers = Array.from({ length: Math.min(totalPages, 5) }, (_, index) => {
    if (totalPages <= 5) return index + 1
    if (page <= 3) return index + 1
    if (page >= totalPages - 2) return totalPages - 4 + index
    return page - 2 + index
  })

  return (
    <section className="flex flex-col gap-4 px-1 py-2 text-sm text-[#536b83] md:flex-row md:items-center md:justify-between">
      <p>
        Showing <span className="font-semibold text-[#102448]">{firstRow}</span> to <span className="font-semibold text-[#102448]">{lastRow}</span> of <span className="font-semibold text-[#102448]">{totalRows}</span> applications
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2">
          <span className="font-medium">Rows per page</span>
          <select
            value={rowsPerPage}
            onChange={(event) => onRowsPerPageChange(Number(event.target.value))}
            className="h-10 rounded-[12px] border border-[#dbe5f0] bg-white px-3 text-sm font-semibold text-[#102448] outline-none"
          >
            {[10, 25, 50].map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => onPageChange(Math.max(1, page - 1))}
            className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] border border-[#dbe5f0] text-[#48617a] disabled:cursor-not-allowed disabled:opacity-45"
            aria-label="Previous page"
          >
            <ArrowLeft size={15} />
          </button>
          {pageNumbers.map((pageNumber) => (
            <button
              key={pageNumber}
              type="button"
              onClick={() => onPageChange(pageNumber)}
              className={`inline-flex h-9 w-9 items-center justify-center rounded-[10px] border text-sm font-semibold ${
                pageNumber === page
                  ? 'border-[#07183f] bg-[#07183f] text-white'
                  : 'border-[#dbe5f0] bg-white text-[#48617a]'
              }`}
            >
              {pageNumber}
            </button>
          ))}
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => onPageChange(Math.min(totalPages, page + 1))}
            className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] border border-[#dbe5f0] text-[#48617a] disabled:cursor-not-allowed disabled:opacity-45"
            aria-label="Next page"
          >
            <ArrowRight size={15} />
          </button>
        </div>
      </div>
    </section>
  )
}

export default function BondTransactionsPage({
  service = bondCommandCenterService,
  initialState = null,
}) {
  const workspaceContext = useWorkspace()
  const workspaceId = resolveWorkspaceId(workspaceContext)
  const location = useLocation()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [hqFilters, setHqFilters] = useState(HQ_FILTER_DEFAULTS)
  const [hqPage, setHqPage] = useState(1)
  const [hqRowsPerPage, setHqRowsPerPage] = useState(10)
  const [state, setState] = useState(
    initialState || {
      loading: true,
      error: '',
      snapshot: null,
    },
  )
  const hqRequestScope = useMemo(() => isHqApplicationsScope(null, workspaceContext), [workspaceContext])

  const selectedView = useMemo(() => {
    const params = new URLSearchParams(location.search)
    const view = normalizeText(params.get(BOND_TRANSACTION_VIEW_PARAM))
    if (view) return getBondTransactionView(view)
    const legacyStatus = normalizeText(params.get('status') || 'all') || 'all'
    return getBondTransactionViewFromStatus(legacyStatus)
  }, [location.search])
  const selectedStatus = selectedView.status || 'all'
  const selectedDevelopmentId = useMemo(() => {
    const params = new URLSearchParams(location.search)
    return normalizeText(params.get('developmentId')) || 'all'
  }, [location.search])
  const selectedStatusFilter = useMemo(() => {
    const params = new URLSearchParams(location.search)
    const explicit = normalizeStatusFilter(params.get('filter'))
    if (explicit) return explicit
    return statusFilterFromLegacyStatus(selectedView.status)
  }, [location.search, selectedView.status])
  const selectedStageFilter = useMemo(() => {
    const params = new URLSearchParams(location.search)
    const stage = normalizeText(params.get('stage') || 'all')
    return APPLICATION_PROGRESS_STAGE_OPTIONS.some((option) => option.key === stage) ? stage : 'all'
  }, [location.search])
  const selectedSortMode = useMemo(() => {
    const params = new URLSearchParams(location.search)
    return normalizeSortMode(params.get('sort'))
  }, [location.search])

  const loadTransactions = useCallback(async () => {
    if (!workspaceId) {
      setState({
        loading: false,
        error: 'missing_workspace_context',
        snapshot: null,
      })
      return
    }

    setState((previous) => ({ ...previous, loading: true, error: '' }))

    try {
      const snapshot = await service.getBondTransactionTrackerSnapshot(workspaceContext, workspaceId, {
        status: hqRequestScope ? 'all' : selectedStatus,
        developmentId: selectedDevelopmentId,
        includeDemoRows: hqRequestScope ? isExplicitBondDemoModeEnabled(workspaceContext) : undefined,
      })
      setState({
        loading: false,
        error: '',
        snapshot,
      })
    } catch (error) {
      setState({
        loading: false,
        error: String(error?.message || 'application_tracker_load_failed'),
        snapshot: null,
      })
    }
  }, [hqRequestScope, selectedDevelopmentId, selectedStatus, service, workspaceContext, workspaceId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadTransactions()
  }, [loadTransactions])

  const snapshot = state.snapshot
  const isHqRegister = isHqApplicationsScope(snapshot, workspaceContext)

  const filteredRows = useMemo(() => {
    const baselineRows = getDefaultSortRows(state.snapshot?.rows).filter((row) => matchesSearch(row, search))
    const statusFilteredRows = baselineRows.filter((row) => matchesStatusFilter(row, selectedStatusFilter))
    return statusFilteredRows.filter((row) => matchesStageFilter(row, selectedStageFilter))
  }, [search, selectedStageFilter, selectedStatusFilter, state.snapshot?.rows])

  const hqRegisterRows = useMemo(() => buildHqApplicationRegisterRows(snapshot?.rows), [snapshot?.rows])
  const hqFilterOptions = useMemo(() => getHqApplicationFilterOptions(hqRegisterRows), [hqRegisterRows])
  const hqFilteredRows = useMemo(() => filterHqApplicationRegisterRows(hqRegisterRows, hqFilters), [hqFilters, hqRegisterRows])
  const hqTotalPages = Math.max(1, Math.ceil(hqFilteredRows.length / hqRowsPerPage))
  const hqCurrentPage = Math.min(hqPage, hqTotalPages)
  const hqPagedRows = useMemo(
    () => hqFilteredRows.slice((hqCurrentPage - 1) * hqRowsPerPage, hqCurrentPage * hqRowsPerPage),
    [hqCurrentPage, hqFilteredRows, hqRowsPerPage],
  )
  const hqKpis = useMemo(() => getHqApplicationKpis(hqRegisterRows), [hqRegisterRows])
  const hasActiveHqFilters = useMemo(
    () => Object.entries(HQ_FILTER_DEFAULTS).some(([key, value]) => hqFilters[key] !== value),
    [hqFilters],
  )

  const handleHqFilterChange = useCallback((key, value) => {
    setHqFilters((previous) => ({ ...previous, [key]: value }))
    setHqPage(1)
  }, [])

  const handleClearHqFilters = useCallback(() => {
    setHqFilters(HQ_FILTER_DEFAULTS)
    setHqPage(1)
  }, [])

  const handleRowsPerPageChange = useCallback((value) => {
    setHqRowsPerPage(value)
    setHqPage(1)
  }, [])

  const handleOpenHqApplication = useCallback(
    (row) => {
      navigate(row.openHref || '/bond/pipeline?view=all')
    },
    [navigate],
  )

  const handleDevelopmentChange = useCallback(
    (event) => {
      const nextDevelopmentId = event.target.value
      const params = new URLSearchParams(location.search)
      if (nextDevelopmentId === 'all') params.delete('developmentId')
      else params.set('developmentId', nextDevelopmentId)
      navigate(`${bondViews.transactions.basePath}?${params.toString()}`)
    },
    [location.search, navigate],
  )

  const handleStageFilterChange = useCallback(
    (event) => {
      const nextStage = event.target.value
      const params = new URLSearchParams(location.search)
      if (nextStage === 'all') params.delete('stage')
      else params.set('stage', nextStage)
      navigate(`${bondViews.transactions.basePath}?${params.toString()}`)
    },
    [location.search, navigate],
  )

  if (!workspaceId) {
    return (
      <section className="rounded-[18px] border border-[#f1d0d0] bg-[#fff5f5] px-4 py-4">
        <p className="text-sm font-semibold text-[#8f2f2f]">We could not load your Bond workspace context.</p>
        <p className="mt-1 text-sm text-[#9d4d4d]">Please switch workspace or try again.</p>
      </section>
    )
  }

  if (!state.loading && state.error) {
    return (
      <section className="rounded-[18px] border border-[#f1d0d0] bg-[#fff5f5] px-4 py-4">
        <p className="text-sm font-semibold text-[#8f2f2f]">We could not load the applications tracker.</p>
        <p className="mt-1 text-sm text-[#9d4d4d]">Please refresh or try another workspace.</p>
      </section>
    )
  }

  if (isHqRegister) {
    const showFilteredEmpty = !state.loading && hqRegisterRows.length > 0 && hqFilteredRows.length === 0

    return (
      <BondPageShell className="space-y-5">
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {hqKpis.map((item) => (
            <div key={item.key} className="flex min-h-[118px] items-center gap-4 rounded-[18px] border border-[#dbe5f0] bg-white px-5 py-4 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#eef5ff] text-[#24518a]">
                <item.icon size={21} />
              </span>
              <div className="min-w-0">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-[#7890a8]">{item.label}</p>
                <p className="mt-1 truncate text-2xl font-semibold text-[#142132]">{item.value}</p>
                <p className="mt-1 text-xs font-semibold text-[#14884d]">{item.trend}</p>
              </div>
            </div>
          ))}
        </section>

        <section className="rounded-[18px] border border-[#dce6f2] bg-white px-4 py-4 shadow-[0_12px_28px_rgba(15,23,42,0.045)]">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-[#17324d]">
              <SlidersHorizontal size={16} />
              Filters
            </div>
            <button
              type="button"
              disabled={!hasActiveHqFilters}
              onClick={handleClearHqFilters}
              className="inline-flex h-9 items-center gap-2 rounded-[10px] px-3 text-sm font-semibold text-[#24518a] transition hover:bg-[#eef5ff] disabled:cursor-not-allowed disabled:opacity-45"
            >
              <X size={14} />
              Clear filters
            </button>
          </div>
          <div className="flex flex-wrap gap-4">
            <HqFilterSelect label="Region" value={hqFilters.region} onChange={(value) => handleHqFilterChange('region', value)} options={hqFilterOptions.regions} />
            <HqFilterSelect label="Branch" value={hqFilters.branch} onChange={(value) => handleHqFilterChange('branch', value)} options={hqFilterOptions.branches} />
            <HqFilterSelect label="Consultant" value={hqFilters.consultant} onChange={(value) => handleHqFilterChange('consultant', value)} options={hqFilterOptions.consultants} />
            <HqFilterSelect label="Status" value={hqFilters.status} onChange={(value) => handleHqFilterChange('status', value)} options={hqFilterOptions.statuses} />
            <HqFilterSelect label="Risk" value={hqFilters.risk} onChange={(value) => handleHqFilterChange('risk', value)} options={RISK_OPTIONS} />
            <HqFilterSelect label="Date Range" value={hqFilters.dateRange} onChange={(value) => handleHqFilterChange('dateRange', value)} options={DATE_RANGE_OPTIONS} />
            <HqFilterSelect label="Sort" value={hqFilters.sort} onChange={(value) => handleHqFilterChange('sort', value)} options={SORT_OPTIONS} />
          </div>
        </section>

        {state.loading ? (
          <BondEmptyState title="Loading national applications..." description="We are assembling visible applications across regions, branches, and consultants." />
        ) : null}

        {!state.loading && hqRegisterRows.length === 0 ? <HqApplicationsEmptyState /> : null}
        {showFilteredEmpty ? <HqApplicationsEmptyState filtered /> : null}
        {!state.loading && hqFilteredRows.length > 0 ? (
          <>
            <HqApplicationsTable rows={hqPagedRows} onOpen={handleOpenHqApplication} />
            <HqApplicationsPagination
              totalRows={hqFilteredRows.length}
              page={hqCurrentPage}
              rowsPerPage={hqRowsPerPage}
              onPageChange={setHqPage}
              onRowsPerPageChange={handleRowsPerPageChange}
            />
          </>
        ) : null}
      </BondPageShell>
    )
  }

  return (
    <BondPageShell>
      <div className="rounded-[18px] border border-[#dce6f2] bg-white px-4 py-4 shadow-[0_12px_28px_rgba(15,23,42,0.045)]">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
          <label className="relative">
            <Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#89a0b5]" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search applications..."
              className="h-11 w-full rounded-[14px] border border-[#dbe5f0] bg-[#f9fbff] pl-11 pr-4 text-sm text-[#17324d] outline-none transition focus:border-[#bbcbdd]"
            />
          </label>

          <select
            value={selectedDevelopmentId}
            onChange={handleDevelopmentChange}
            className="h-11 rounded-[14px] border border-[#dbe5f0] bg-[#f9fbff] px-4 text-sm font-medium text-[#17324d] outline-none transition focus:border-[#bbcbdd]"
          >
            {(snapshot?.developmentOptions || [{ id: 'all', label: 'All Developments' }]).map((option) => (
              <option key={option.id || option.value} value={option.value || option.id}>
                {option.label || option.name}
              </option>
            ))}
          </select>

          <select
            value={selectedStageFilter}
            onChange={handleStageFilterChange}
            className="h-11 rounded-[14px] border border-[#dbe5f0] bg-[#f9fbff] px-4 text-sm font-medium text-[#17324d] outline-none transition focus:border-[#bbcbdd]"
          >
            {APPLICATION_PROGRESS_STAGE_OPTIONS.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-[#72869b]">Sort</label>
            <select
              value={selectedSortMode}
              disabled
              className="h-11 w-full rounded-[14px] border border-[#dbe5f0] bg-[#f9fbff] px-4 text-sm font-medium text-[#17324d] outline-none"
            >
              <option value="last_activity">Last activity</option>
            </select>
          </div>
        </div>
      </div>

      {snapshot ? <BondTransactionTable rows={filteredRows} /> : null}

      {state.loading ? (
        <BondEmptyState title="Loading linked bond applications..." description="We are assembling the finance and transfer view now." />
      ) : null}
    </BondPageShell>
  )
}
