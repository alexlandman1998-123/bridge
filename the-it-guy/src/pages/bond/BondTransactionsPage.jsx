/* eslint-disable react-refresh/only-export-components */
import { AlertTriangle, ArrowUpRight, Download, RefreshCw, Search } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import BondEmptyState from '../../components/bond/BondEmptyState'
import BondPageHeader from '../../components/bond/BondPageHeader'
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

const STATUS_FILTER_OPTIONS = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'needs-action', label: 'Needs Action' },
  { key: 'at-risk', label: 'At Risk' },
  { key: 'completed', label: 'Completed' },
]

export const HQ_APPLICATION_STATUS_TABS = [
  { key: 'all', label: 'All' },
  { key: 'unassigned', label: 'Unassigned' },
  { key: 'awaiting_otp', label: 'Awaiting OTP' },
  { key: 'ready_to_start', label: 'Ready To Start' },
  { key: 'application_in_progress', label: 'Application In Progress' },
  { key: 'ready_for_review', label: 'Ready For Review' },
  { key: 'submitted_to_banks', label: 'Submitted To Banks' },
  { key: 'bank_feedback', label: 'Bank Feedback' },
  { key: 'approved', label: 'Approved' },
]

const HQ_STATUS_LABELS = {
  intake_received: 'Intake Received',
  awaiting_otp: 'Awaiting OTP',
  otp_ready: 'OTP Ready',
  ready_to_start: 'Ready To Start',
  application_in_progress: 'Application In Progress',
  application_submitted: 'Application Submitted',
  ready_for_review: 'Ready For Review',
  submitted_to_banks: 'Submitted To Banks',
  bank_feedback: 'Bank Feedback',
  approved: 'Approved',
  registered: 'Registered',
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
  { key: 'high', label: 'Highest risk' },
  { key: 'medium', label: 'Needs attention' },
  { key: 'low', label: 'Healthy' },
]

const SORT_OPTIONS = [
  { key: 'newest', label: 'Newest first' },
  { key: 'oldest', label: 'Oldest first' },
  { key: 'highest_risk', label: 'Highest risk' },
  { key: 'status', label: 'Status' },
  { key: 'branch', label: 'Branch' },
  { key: 'consultant', label: 'Consultant' },
]

function normalizeKey(value) {
  return normalizeText(value).toLowerCase().replace(/[\s-]+/g, '_')
}

function parseDateTimestamp(value) {
  const date = new Date(value || 0)
  return Number.isNaN(date.getTime()) ? 0 : date.getTime()
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
  const label = normalizeText(row.regionName || row.region || row.regionLabel)
  return isMissingAssignmentLabel(label, 'region') ? 'No region' : label
}

function displayBranch(row = {}) {
  const label = normalizeText(row.branchName || row.branch || row.branchLabel)
  return isMissingAssignmentLabel(label, 'branch') ? 'Unassigned branch' : label
}

function displayConsultant(row = {}) {
  const label = normalizeText(row.consultantName || row.consultant)
  const hasAssignment = Boolean(normalizeText(row.assignedUserId || row.assignedUserEmail))
  return !hasAssignment || isMissingAssignmentLabel(label, 'consultant') ? 'Unassigned consultant' : label
}

function hasBranch(row = {}) {
  return Boolean(normalizeText(row.branchId || row.workspaceUnitId)) && displayBranch(row) !== 'Unassigned branch'
}

function hasConsultant(row = {}) {
  return Boolean(normalizeText(row.assignedUserId || row.assignedUserEmail)) && displayConsultant(row) !== 'Unassigned consultant'
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
  if (['bond_approved', 'grant_signed', 'instruction_sent', 'approved'].includes(status) || financeLabel.includes('approved')) return 'approved'
  if (financeKey === 'bank_feedback' || status === 'bank_feedback' || bankStatus.includes('feedback')) return 'bank_feedback'
  if (financeKey === 'submitted_to_banks' || financeLabel.includes('submitted') || bankStatus.includes('submitted')) return 'submitted_to_banks'
  if (financeKey === 'ready_for_review' || queueStatus === 'ready_for_review' || queueLabel === 'ready_for_review') return 'ready_for_review'
  if (queueStatus === 'ready_to_start' || financeKey === 'ready_to_start') return 'ready_to_start'
  if (financeKey === 'otp_ready' || queueStatus === 'otp_ready' || nextAction.includes('otp_ready')) return 'otp_ready'
  if (financeKey === 'awaiting_otp' || queueStatus === 'awaiting_otp' || nextAction.includes('awaiting_otp') || nextAction.includes('signed_otp')) return 'awaiting_otp'
  if (['bond_application_open', 'application_in_progress', 'docs_collection', 'pre_approval'].includes(financeKey)) return 'application_in_progress'
  if (financeKey === 'application_submitted') return 'application_submitted'
  return 'intake_received'
}

function getFriendlyNextAction(row = {}, statusKey = resolveHqApplicationStatus(row)) {
  if (isHqApplicationUnassigned(row)) {
    if (!hasBranch(row)) return 'Assign branch'
    return 'Assign consultant'
  }
  const explicit = normalizeText(row.nextAction)
  if (explicit && explicit.toLowerCase() !== 'no next action set') return explicit
  const nextActions = {
    intake_received: 'Buyer completing application',
    awaiting_otp: 'Awaiting signed OTP',
    otp_ready: 'Ready to start application',
    ready_to_start: 'Start application pack',
    application_in_progress: 'Request missing documents',
    application_submitted: 'Review application pack',
    ready_for_review: 'Review application pack',
    submitted_to_banks: 'Follow up with lender',
    bank_feedback: 'Follow up with lender',
    approved: 'Send approval quote to buyer',
    registered: 'Awaiting registration',
  }
  return nextActions[statusKey] || 'Open application'
}

function normalizeRiskKey(row = {}) {
  const riskLevel = normalizeKey(row.riskLevel || row.operationalRisk?.riskLevel)
  const riskTone = normalizeKey(row.riskTone)
  const riskStatus = normalizeKey(row.riskStatus)
  const riskScore = Number(row.riskScore ?? row.operationalRisk?.riskScore ?? 0)
  if (riskLevel.includes('high') || riskTone === 'risk' || riskScore >= 70) return 'high'
  if (riskLevel.includes('medium') || riskStatus.includes('attention') || riskScore >= 35) return 'medium'
  return 'low'
}

function riskLabelFromKey(key) {
  if (key === 'high') return 'High'
  if (key === 'medium') return 'Attention'
  return 'Healthy'
}

function getRiskSortScore(row = {}) {
  const key = normalizeRiskKey(row)
  if (key === 'high') return 3
  if (key === 'medium') return 2
  return 1
}

export function buildHqApplicationRegisterRows(rows = [], now = Date.now()) {
  return parseRowsForQuery(rows).map((row) => {
    const statusKey = resolveHqApplicationStatus(row)
    const riskKey = normalizeRiskKey(row)
    return {
      ...row,
      createdTimestamp: getCreatedTimestamp(row),
      createdDateLabel: formatDate(row.createdAt || row.intakeCreatedAt || row.applicationCreatedAt || row.transactionCreatedAt || row.lastActivityAt),
      ageLabel: getAgeLabel(row, now),
      regionDisplay: displayRegion(row),
      branchDisplay: displayBranch(row),
      consultantDisplay: displayConsultant(row),
      isUnassigned: isHqApplicationUnassigned(row),
      statusKey,
      statusLabel: HQ_STATUS_LABELS[statusKey] || 'Intake Received',
      riskKey,
      riskLabel: riskLabelFromKey(riskKey),
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
  const weekAgo = now - (7 * 24 * 60 * 60 * 1000)
  return [
    { key: 'total', label: 'Total Applications', value: normalizedRows.length },
    { key: 'new_this_week', label: 'New This Week', value: normalizedRows.filter((row) => (row.createdTimestamp || 0) >= weekAgo).length },
    { key: 'unassigned', label: 'Unassigned', value: normalizedRows.filter((row) => row.isUnassigned).length },
    { key: 'ready_for_review', label: 'Ready For Review', value: normalizedRows.filter((row) => row.statusKey === 'ready_for_review').length },
    { key: 'awaiting_otp', label: 'Awaiting OTP', value: normalizedRows.filter((row) => row.statusKey === 'awaiting_otp').length },
    { key: 'sla_breaches', label: 'SLA Breaches', value: normalizedRows.filter((row) => row.riskKey === 'high').length },
  ]
}

function csvEscape(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`
}

function HqFilterSelect({ label, value, onChange, options = [] }) {
  return (
    <label className="min-w-0">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-[#72869b]">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full rounded-[14px] border border-[#dbe5f0] bg-[#f9fbff] px-3 text-sm font-medium text-[#17324d] outline-none transition focus:border-[#bbcbdd]"
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
  if (row.riskKey === 'high') return 'risk'
  if (row.riskKey === 'medium') return 'warning'
  return 'success'
}

function statusTone(row = {}) {
  if (['approved', 'registered'].includes(row.statusKey)) return 'success'
  if (['ready_for_review', 'submitted_to_banks'].includes(row.statusKey)) return 'info'
  if (['awaiting_otp', 'bank_feedback'].includes(row.statusKey)) return 'warning'
  return 'neutral'
}

function HqApplicationsEmptyState({ filtered = false }) {
  return (
    <section className="rounded-[18px] border border-[#dbe5f0] bg-white px-5 py-8 text-center shadow-[0_14px_34px_rgba(15,23,42,0.045)]">
      <p className="text-base font-semibold text-[#142132]">
        {filtered ? 'No applications match these filters.' : 'No bond applications yet.'}
      </p>
      {!filtered ? (
        <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[#60758d]">
          Applications will appear here once buyers complete onboarding or bond intake is created.
        </p>
      ) : null}
    </section>
  )
}

function HqApplicationsTable({ rows = [], onOpen }) {
  if (!rows.length) return null
  return (
    <section className="overflow-hidden rounded-[20px] border border-[#dbe5f0] bg-white shadow-[0_14px_34px_rgba(15,23,42,0.05)]">
      <div className="hidden overflow-x-auto md:block">
        <table className="min-w-[1180px] border-collapse">
          <thead>
            <tr className="bg-[#f8fbff]">
              {['Buyer / Transaction', 'Property / Development', 'Region', 'Branch', 'Consultant', 'Status', 'Age', 'Risk', 'Next Action', 'Open'].map((label) => (
                <th key={label} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-[#7d90a5]">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key || row.transactionId || row.bondApplicationId} className="border-t border-[#eef3f8] align-top hover:bg-[#fbfdff]">
                <td className="px-4 py-4">
                  <div className="flex min-w-[190px] flex-col gap-1">
                    <span className="font-semibold text-[#142132]">{row.client || 'Buyer pending'}</span>
                    <span className="text-xs text-[#7890a8]">{row.transactionReference || row.applicationReference || row.transactionId || 'No reference'}</span>
                    {row.isUnassigned ? (
                      <span className="inline-flex w-fit items-center gap-1 rounded-full border border-[#f6d7a8] bg-[#fff8eb] px-2 py-1 text-[11px] font-semibold text-[#8a5b12]">
                        <AlertTriangle size={12} />
                        Unassigned
                      </span>
                    ) : null}
                  </div>
                </td>
                <td className="px-4 py-4 text-sm text-[#425a72]">
                  <div className="max-w-[220px]">{row.property || 'Property pending'}</div>
                </td>
                <td className="px-4 py-4 text-sm font-medium text-[#425a72]">{row.regionDisplay}</td>
                <td className="px-4 py-4 text-sm font-medium text-[#425a72]">{row.branchDisplay}</td>
                <td className="px-4 py-4 text-sm font-medium text-[#425a72]">{row.consultantDisplay}</td>
                <td className="px-4 py-4"><HqBadge tone={statusTone(row)}>{row.statusLabel}</HqBadge></td>
                <td className="px-4 py-4 text-sm text-[#425a72]">
                  <span className="font-semibold">{row.ageLabel}</span>
                  <span className="block text-xs text-[#7890a8]">{row.createdDateLabel}</span>
                </td>
                <td className="px-4 py-4"><HqBadge tone={riskTone(row)}>{row.riskLabel}</HqBadge></td>
                <td className="px-4 py-4 text-sm font-medium text-[#425a72]">{row.nextActionLabel}</td>
                <td className="px-4 py-4 text-right">
                  <button
                    type="button"
                    onClick={() => onOpen(row)}
                    className="inline-flex h-9 items-center justify-center gap-1.5 rounded-[12px] border border-[#dce6f2] bg-white px-3 text-sm font-semibold text-[#17324b] transition hover:border-[#b9c9dc] hover:bg-[#f8fbff]"
                  >
                    Open
                    <ArrowUpRight size={15} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="divide-y divide-[#eef3f8] md:hidden">
        {rows.map((row) => (
          <article key={row.key || row.transactionId || row.bondApplicationId} className="px-4 py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-[#142132]">{row.client || 'Buyer pending'}</p>
                <p className="mt-1 text-sm text-[#60758d]">{row.property || 'Property pending'}</p>
              </div>
              {row.isUnassigned ? <HqBadge tone="warning">Unassigned</HqBadge> : null}
            </div>
            <div className="mt-3 grid grid-cols-1 gap-2 text-sm text-[#425a72]">
              <span>Region: <strong>{row.regionDisplay}</strong></span>
              <span>Branch: <strong>{row.branchDisplay}</strong></span>
              <span>Consultant: <strong>{row.consultantDisplay}</strong></span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <HqBadge tone={statusTone(row)}>{row.statusLabel}</HqBadge>
              <HqBadge tone={riskTone(row)}>{row.riskLabel}</HqBadge>
              <HqBadge>{row.ageLabel}</HqBadge>
            </div>
            <p className="mt-3 text-sm font-medium text-[#425a72]">{row.nextActionLabel}</p>
            <button
              type="button"
              onClick={() => onOpen(row)}
              className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-[12px] bg-[#102448] px-3 text-sm font-semibold text-white"
            >
              Open
              <ArrowUpRight size={15} />
            </button>
          </article>
        ))}
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
  const hqKpis = useMemo(() => getHqApplicationKpis(hqRegisterRows), [hqRegisterRows])

  const handleHqFilterChange = useCallback((key, value) => {
    setHqFilters((previous) => ({ ...previous, [key]: value }))
  }, [])

  const handleOpenHqApplication = useCallback(
    (row) => {
      navigate(row.openHref || '/bond/pipeline?view=all')
    },
    [navigate],
  )

  const handleExportHqApplications = useCallback(() => {
    const headers = ['Buyer', 'Transaction', 'Property', 'Region', 'Branch', 'Consultant', 'Status', 'Age', 'Risk', 'Next Action']
    const lines = hqFilteredRows.map((row) => [
      row.client,
      row.transactionReference || row.applicationReference || row.transactionId,
      row.property,
      row.regionDisplay,
      row.branchDisplay,
      row.consultantDisplay,
      row.statusLabel,
      row.ageLabel,
      row.riskLabel,
      row.nextActionLabel,
    ].map(csvEscape).join(','))
    const csv = [headers.map(csvEscape).join(','), ...lines].join('\n')
    if (typeof document === 'undefined') return
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'bond-applications.csv'
    anchor.click()
    URL.revokeObjectURL(url)
  }, [hqFilteredRows])

  const handleStatusFilterChange = useCallback(
    (nextFilter) => {
      const params = new URLSearchParams(location.search)
      if (nextFilter === 'all') params.delete('filter')
      else params.set('filter', nextFilter)
      if (selectedDevelopmentId && selectedDevelopmentId !== 'all') {
        params.set('developmentId', selectedDevelopmentId)
      } else {
        params.delete('developmentId')
      }
      if (selectedSortMode && selectedSortMode !== 'last_activity') {
        params.set('sort', selectedSortMode)
      } else {
        params.delete('sort')
      }
      if (selectedStageFilter !== 'all') {
        params.set('stage', selectedStageFilter)
      } else {
        params.delete('stage')
      }
      navigate(`${bondViews.transactions.basePath}?${params.toString()}`)
    },
    [location.search, navigate, selectedDevelopmentId, selectedSortMode, selectedStageFilter],
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
    const tabCounts = HQ_APPLICATION_STATUS_TABS.reduce((counts, tab) => {
      if (tab.key === 'all') counts[tab.key] = hqRegisterRows.length
      else if (tab.key === 'unassigned') counts[tab.key] = hqRegisterRows.filter((row) => row.isUnassigned).length
      else counts[tab.key] = hqRegisterRows.filter((row) => row.statusKey === tab.key).length
      return counts
    }, {})
    const showFilteredEmpty = !state.loading && hqRegisterRows.length > 0 && hqFilteredRows.length === 0

    return (
      <BondPageShell>
        <BondPageHeader
          title="Bond Applications"
          description="National register of all bond applications across branches, consultants, and regions."
          primaryLabel="Refresh"
          secondaryLabel="Export"
          onPrimary={loadTransactions}
          onSecondary={handleExportHqApplications}
          primaryIcon={RefreshCw}
          secondaryIcon={Download}
        />

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-6">
          {hqKpis.map((item) => (
            <div key={item.key} className="rounded-[16px] border border-[#dbe5f0] bg-white px-4 py-3 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7890a8]">{item.label}</p>
              <p className="mt-2 text-2xl font-semibold text-[#142132]">{item.value}</p>
            </div>
          ))}
        </section>

        <section className="rounded-[18px] border border-[#dce6f2] bg-white px-4 py-4 shadow-[0_12px_28px_rgba(15,23,42,0.045)]">
          <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
            {HQ_APPLICATION_STATUS_TABS.map((tab) => {
              const active = hqFilters.tab === tab.key
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => handleHqFilterChange('tab', tab.key)}
                  className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-full px-3 text-sm font-semibold transition ${
                    active
                      ? 'bg-[#102448] text-white shadow-[0_10px_20px_rgba(16,36,72,0.16)]'
                      : 'text-[#536d87] hover:bg-[#f2f7fd] hover:text-[#17324b]'
                  }`}
                >
                  {tab.label}
                  <span className={`rounded-full px-2 py-0.5 text-xs ${active ? 'bg-white/15 text-white' : 'bg-[#edf4fb] text-[#647b92]'}`}>
                    {tabCounts[tab.key] || 0}
                  </span>
                </button>
              )
            })}
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7">
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
        {!state.loading && hqFilteredRows.length > 0 ? <HqApplicationsTable rows={hqFilteredRows} onOpen={handleOpenHqApplication} /> : null}
      </BondPageShell>
    )
  }

  return (
    <BondPageShell>
      <BondPageHeader
        title={bondViews.transactions.title}
        description={bondViews.transactions.description}
        primaryLabel={bondViews.transactions.primaryActionLabel}
        secondaryLabel={bondViews.transactions.secondaryActionLabel}
        onPrimary={() => navigate('/bond/pipeline?view=new')}
      />

      <div className="rounded-[18px] border border-[#dce6f2] bg-white px-4 py-4 shadow-[0_12px_28px_rgba(15,23,42,0.045)]">
        <div className="mb-3 flex flex-wrap gap-2">
          {STATUS_FILTER_OPTIONS.map((option) => {
            const active = option.key === selectedStatusFilter
            return (
              <button
                key={option.key}
                type="button"
                onClick={() => handleStatusFilterChange(option.key)}
                className={`inline-flex h-10 items-center rounded-full px-3 text-sm font-semibold transition ${
                  active
                    ? 'bg-[#102448] text-white shadow-[0_10px_20px_rgba(16,36,72,0.16)]'
                    : 'text-[#536d87] hover:bg-[#f2f7fd] hover:text-[#17324b]'
                }`}
              >
                {option.label}
              </button>
            )
          })}
        </div>

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
