import {
  ArrowRight,
  ArrowRightLeft,
  Banknote,
  Building2,
  CalendarDays,
  FileCheck2,
  LandPlot,
  PieChart,
  Search,
  TrendingUp,
  Users,
} from 'lucide-react'
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import LoadingSkeleton from '../components/LoadingSkeleton'
import SummaryCards from '../components/SummaryCards'
import ConveyancerDashboardPage from '../components/ConveyancerDashboardPage'
import { PillToggle } from '../components/ui/FilterBar'
import {
  STAGE_AGING_BUCKETS,
  selectActiveTransactions,
  selectFinanceMix,
  selectStageAging,
  selectStageDistribution,
} from '../core/transactions/developerSelectors'
import {
  selectAgentSummary,
} from '../core/transactions/agentSelectors'
import {
} from '../core/transactions/attorneySelectors'
import { buildAttorneyDemoRows, buildBondDemoRows } from '../core/transactions/attorneyMockData'
import {
  getBondApplicationStage,
  selectBondSummary,
} from '../core/transactions/bondSelectors'
import {
  MAIN_PROCESS_STAGES,
  MAIN_STAGE_LABELS,
  getMainStageFromDetailedStage,
} from '../core/transactions/stageConfig'
import { TRANSACTION_SCOPE_OPTIONS, filterRowsByTransactionScope, getTransactionScopeForRow } from '../core/transactions/transactionScope'
import { normalizeFinanceType } from '../core/transactions/financeType'
import { useWorkspace } from '../context/WorkspaceContext'
import { fetchDashboardOverview, fetchTransactionsByParticipantSummary, fetchTransactionsListSummary } from '../lib/api'
import { getAgentModuleSharedData } from '../lib/agentDataService'
import { getAgencyPipelineSnapshot, getAppointmentsDashboardSummaryAsync } from '../lib/agencyPipelineService'
import { canAccessPrincipalExperience } from '../lib/organisationAccess'
import { startRouteTransitionTrace } from '../lib/performanceTrace'
import { fetchOrganisationSettings } from '../lib/settingsApi'
import { isSupabaseConfigured } from '../lib/supabaseClient'
import {
  getListingSourceLabel,
  getPropertyCategoryLabel,
  getPropertyStructureTypeLabel,
  normalizeListingSource,
  normalizePropertyCategory,
  normalizePropertyStructureType,
} from '../lib/propertyTaxonomy'

const currency = new Intl.NumberFormat('en-ZA', {
  style: 'currency',
  currency: 'ZAR',
  maximumFractionDigits: 0,
})
const integer = new Intl.NumberFormat('en-ZA')
const compactCurrency = new Intl.NumberFormat('en-ZA', {
  style: 'currency',
  currency: 'ZAR',
  notation: 'compact',
  maximumFractionDigits: 1,
})

const FINANCE_MIX_COLORS = {
  cash: '#37576f',
  bond: '#22c55e',
  combination: '#2563eb',
  unknown: '#cbd5e1',
}

const SHARED_FINANCE_WORKFLOW_STEPS = [
  'Application Received',
  'Buyer Documents Collected',
  'Submitted to Banks',
  'Bank Feedback Received',
  'Bond Approved',
  'Grant Signed',
]

const SHARED_TRANSFER_WORKFLOW_STEPS = [
  'Instruction Received',
  'FICA Received',
  'Transfer Documents Prepared',
  'Buyer Signed Documents',
  'Seller Signed Documents',
  'Guarantees Received',
]

const DASHBOARD_PANEL_CLASS =
  'rounded-[22px] border border-[#dde4ee] bg-white p-6 shadow-[0_12px_28px_rgba(15,23,42,0.06)]'
const DASHBOARD_SUBPANEL_CLASS =
  'rounded-[22px] border border-[#dde4ee] bg-white p-7 shadow-[0_12px_28px_rgba(15,23,42,0.06)]'
const DASHBOARD_CHIP_CLASS =
  'inline-flex items-center gap-2 rounded-full border border-[#dde4ee] bg-[#f7f9fc] px-3 py-1 text-[0.78rem] font-semibold text-[#66758b]'
const DASHBOARD_ACTION_PRIMARY_CLASS =
  'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-[16px] border border-transparent bg-[#35546c] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(15,23,42,0.06)] transition duration-150 ease-out hover:bg-[#2e475c]'
const DASHBOARD_ACTION_SECONDARY_CLASS =
  'inline-flex min-h-[44px] items-center justify-center rounded-[16px] border border-[#dde4ee] bg-white px-4 py-2.5 text-sm font-semibold text-[#162334] shadow-[0_10px_24px_rgba(15,23,42,0.06)] transition duration-150 ease-out hover:border-[#ccd6e3] hover:bg-[#f8fafc]'
const DASHBOARD_FIELD_CLASS =
  'flex h-[44px] items-center gap-3 rounded-[16px] border border-[#dde4ee] bg-white px-4 shadow-[0_10px_24px_rgba(15,23,42,0.06)]'
const DASHBOARD_METRIC_CARD_CLASS =
  'rounded-[20px] border border-[#dde4ee] bg-white px-5 py-5 shadow-[0_4px_14px_rgba(15,23,42,0.05)]'
const CANVASSING_STORAGE_PREFIX = 'itg:agency-canvassing:v1'
const PRINCIPAL_TIME_FILTER_OPTIONS = [
  { key: 'this_week', label: 'This Week' },
  { key: 'last_7_days', label: 'Last 7 Days' },
  { key: 'this_month', label: 'This Month' },
]

function formatPercent(value) {
  if (!Number.isFinite(value)) {
    return '0%'
  }

  return `${Math.round(value)}%`
}

function formatKpiCount(value) {
  const numeric = Number(value || 0)
  if (!Number.isFinite(numeric)) return '0'
  return integer.format(Math.max(0, Math.round(numeric)))
}

function formatKpiCurrency(value) {
  const numeric = Number(value || 0)
  if (!Number.isFinite(numeric) || numeric <= 0) return currency.format(0)
  return compactCurrency.format(numeric)
}

function PrincipalTrendBadge({ value, label = 'vs previous period', inverse = false }) {
  const numeric = Number(value || 0)
  const positive = numeric >= 0
  const good = inverse ? !positive : positive

  return (
    <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[0.74rem] font-semibold ${
      good
        ? 'border-[#c9e9d7] bg-[#eefbf3] text-[#26734f]'
        : 'border-[#f1d1d1] bg-[#fff4f3] text-[#a33c3c]'
    }`}>
      <span>{positive ? '↑' : '↓'} {formatPercent(Math.abs(numeric))}</span>
      <span className="hidden text-[#6f8298] sm:inline">{label}</span>
    </div>
  )
}

function PrincipalSparkline({ points = [], stroke = '#7ea6d9', className = '' }) {
  const values = points.map((item) => Number(item?.value || 0))
  const maxValue = Math.max(1, ...values)
  const polyline = points
    .map((item, index) => {
      const x = points.length > 1 ? (index / (points.length - 1)) * 100 : 0
      const y = 84 - ((Number(item?.value || 0) / maxValue) * 62)
      return `${x},${y}`
    })
    .join(' ')

  return (
    <svg viewBox="0 0 100 100" className={`h-24 w-full overflow-visible ${className}`} role="img" aria-label="Trend sparkline">
      <defs>
        <linearGradient id="principalSparklineFill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.26" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`M0 88 L${polyline.replaceAll(' ', ' L')} L100 92 L0 92 Z`} fill="url(#principalSparklineFill)" opacity="0.85" />
      <polyline fill="none" stroke={stroke} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" points={polyline} />
      {points.map((item, index) => {
        const x = points.length > 1 ? (index / (points.length - 1)) * 100 : 0
        const y = 84 - ((Number(item?.value || 0) / maxValue) * 62)
        return <circle key={`principal-spark-${item?.label || index}`} cx={x} cy={y} r="2.1" fill="#ffffff" stroke={stroke} strokeWidth="1.8" />
      })}
    </svg>
  )
}

function PrincipalMetricTile({ label, value, detail, tone = 'navy' }) {
  const toneClass = {
    navy: 'from-[#f8fbff] to-[#eef5fb] text-[#163247]',
    green: 'from-[#f7fdf9] to-[#eefbf3] text-[#20764e]',
    gold: 'from-[#fffaf0] to-[#fff3d8] text-[#8a641f]',
    blue: 'from-[#f7fbff] to-[#edf5ff] text-[#235d9d]',
  }[tone] || 'from-[#f8fbff] to-[#eef5fb] text-[#163247]'

  return (
    <article className={`rounded-[18px] border border-white/80 bg-gradient-to-br ${toneClass} px-4 py-3 shadow-[0_16px_32px_rgba(24,45,68,0.06)] transition duration-200 hover:-translate-y-0.5`}>
      <p className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-[#6d8096]">{label}</p>
      <p className="mt-2 text-[1.7rem] font-semibold leading-none tracking-[-0.04em] tabular-nums">{value}</p>
      {detail ? <p className="mt-1 text-[0.78rem] font-medium text-[#60758b]">{detail}</p> : null}
    </article>
  )
}

function PrincipalStageMix({ stages }) {
  const stageRows = [
    { key: 'new', label: 'New', color: '#74a6f2', count: stages?.new || 0 },
    { key: 'qualifying', label: 'Qualifying', color: '#9daec2', count: stages?.qualifying || 0 },
    { key: 'negotiation', label: 'Negotiating', color: '#ddb15e', count: stages?.negotiation || 0 },
    { key: 'under_offer', label: 'Under Offer', color: '#61bf84', count: stages?.under_offer || 0 },
    { key: 'closed', label: 'Closed', color: '#c9d4df', count: stages?.closed || 0 },
  ]
  const total = stageRows.reduce((sum, item) => sum + item.count, 0)

  return (
    <div className="rounded-[22px] border border-white/10 bg-white/[0.07] p-4">
      <div className="flex h-3 overflow-hidden rounded-full bg-white/12">
        {stageRows.map((item) => (
          <span
            key={item.key}
            className="h-full"
            style={{ width: `${total ? Math.max(7, (item.count / total) * 100) : 0}%`, background: item.color }}
          />
        ))}
      </div>
      <div className="mt-4 grid gap-2 text-[0.78rem] font-medium text-white/74 sm:grid-cols-2">
        {stageRows.map((item) => (
          <div key={`stage-${item.key}`} className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: item.color }} />
              {item.label}
            </span>
            <span className="font-semibold text-white">{item.count}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function PrincipalLeadSources({ sources = [] }) {
  const total = sources.reduce((sum, item) => sum + Number(item.count || 0), 0)

  return (
    <div className="space-y-3">
      {sources.map((source) => {
        const ratio = total ? Math.round((Number(source.count || 0) / total) * 100) : 0
        return (
          <div key={source.key} className="rounded-[16px] border border-[#e4edf6] bg-white px-3 py-3">
            <div className="flex items-center justify-between gap-3 text-[0.82rem]">
              <span className="inline-flex min-w-0 items-center gap-2 font-semibold text-[#253d55]">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: source.color }} />
                <span className="truncate">{source.label}</span>
              </span>
              <span className="font-semibold text-[#6a7f96]">{ratio}% · {source.count}</span>
            </div>
            <div className="mt-2 h-2 rounded-full bg-[#edf3f8]">
              <div className="h-full rounded-full" style={{ width: `${ratio}%`, background: source.color }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

function formatDateTime(value) {
  const date = new Date(value || 0)
  if (Number.isNaN(date.getTime())) {
    return 'No recent update'
  }

  return date.toLocaleString('en-ZA', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatRelativeTime(value) {
  const date = new Date(value || 0)
  if (Number.isNaN(date.getTime())) {
    return 'No recent update'
  }

  const diffMs = Date.now() - date.getTime()
  if (!Number.isFinite(diffMs) || diffMs < 0) {
    return 'Just now'
  }

  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour

  if (diffMs < minute) return 'Just now'
  if (diffMs < hour) return `${Math.floor(diffMs / minute)}m ago`
  if (diffMs < day) return `${Math.floor(diffMs / hour)}h ago`
  if (diffMs < day * 7) return `${Math.floor(diffMs / day)}d ago`

  return formatDateTime(value)
}

function formatAppointmentStatusLabel(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
}

function getTransactionDealValue(row) {
  const value = Number(
    row?.transaction?.purchase_price ||
      row?.transaction?.sales_price ||
      row?.unit?.price ||
      row?.unit?.list_price ||
      0,
  )
  return Number.isFinite(value) ? value : 0
}

function getLegacyCommissionFallbackEligibility(row) {
  const transactionId = String(row?.transaction?.id || '').trim().toLowerCase()
  if (!transactionId) return true
  return (
    transactionId.startsWith('mock-') ||
    transactionId.startsWith('demo-') ||
    transactionId.startsWith('local-') ||
    transactionId.startsWith('legacy-')
  )
}

function resolveAgentCommissionAmount(row) {
  const explicit = Number(
    row?.transaction?.agent_commission_amount ??
      row?.transaction?.agent_commission_earned ??
      row?.transaction?.agent_commission ??
      row?.transaction?.commission_earned ??
      0,
  )

  if (Number.isFinite(explicit) && explicit > 0) {
    return {
      amount: explicit,
      source: row?.transaction?.commission_snapshot_source === 'snapshot' ? 'snapshot' : 'legacy_explicit',
    }
  }

  if (!getLegacyCommissionFallbackEligibility(row)) {
    return { amount: 0, source: 'none' }
  }

  return {
    amount: Number((getTransactionDealValue(row) * 0.03).toFixed(2)),
    source: 'legacy_estimated',
  }
}

function resolveAgencyCommissionAmount(row) {
  const explicit = Number(
    row?.transaction?.agency_commission_amount ??
      row?.transaction?.commission_earned ??
      row?.transaction?.commission_amount ??
      0,
  )

  if (Number.isFinite(explicit) && explicit > 0) {
    return {
      amount: explicit,
      source: row?.transaction?.commission_snapshot_source === 'snapshot' ? 'snapshot' : 'legacy_explicit',
    }
  }

  if (!getLegacyCommissionFallbackEligibility(row)) {
    return { amount: 0, source: 'none' }
  }

  return {
    amount: Number((getTransactionDealValue(row) * 0.03).toFixed(2)),
    source: 'legacy_estimated',
  }
}

function getHeatLevel(value, max) {
  if (!value || !max) {
    return 0
  }

  const ratio = value / max
  if (ratio >= 0.76) return 4
  if (ratio >= 0.51) return 3
  if (ratio >= 0.26) return 2
  return 1
}

function getRowUpdatedAt(row) {
  return row?.transaction?.updated_at || row?.transaction?.created_at || row?.unit?.updated_at || row?.unit?.created_at || null
}

function getDaysSinceRowUpdate(row) {
  const value = getRowUpdatedAt(row)
  const date = new Date(value || 0)
  if (Number.isNaN(date.getTime())) {
    return 0
  }

  const diff = Date.now() - date.getTime()
  if (!Number.isFinite(diff) || diff <= 0) {
    return 0
  }

  return Math.floor(diff / (1000 * 60 * 60 * 24))
}

function getDaysBetweenTimestamps(startValue, endValue) {
  const start = new Date(startValue || 0)
  const end = new Date(endValue || 0)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return null
  }
  const diff = end.getTime() - start.getTime()
  if (!Number.isFinite(diff) || diff < 0) {
    return null
  }
  return diff / (1000 * 60 * 60 * 24)
}

function getRowMainStage(row) {
  return getMainStageFromDetailedStage(row?.stage || row?.transaction?.stage || row?.unit?.status || 'Available')
}

function extractInterestRate(row) {
  const signal = `${row?.transaction?.current_sub_stage_summary || ''} ${row?.transaction?.next_action || ''} ${row?.transaction?.comment || ''}`
  const match = signal.match(/(\d{1,2}(?:\.\d+)?)\s*%/i)
  if (!match) return null
  const value = Number(match[1])
  return Number.isFinite(value) ? value : null
}

function FORMAT_RATE_LABEL(value) {
  if (!Number.isFinite(value)) return 'Not logged'
  return `${value.toFixed(2)}%`
}

function IS_DATE_IN_CURRENT_MONTH(value) {
  const date = new Date(value || 0)
  if (Number.isNaN(date.getTime())) return false
  const now = new Date()
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth()
}

function toLookupText(value) {
  return String(value || '').trim().toLowerCase()
}

function getDateValue(input) {
  const candidate = new Date(input || 0)
  if (Number.isNaN(candidate.getTime())) return null
  return candidate
}

function startOfDay(value) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 0, 0, 0, 0)
}

function startOfWeek(value) {
  const date = startOfDay(value)
  const day = date.getDay()
  const diff = day === 0 ? -6 : 1 - day
  date.setDate(date.getDate() + diff)
  return date
}

function startOfMonth(value) {
  return new Date(value.getFullYear(), value.getMonth(), 1, 0, 0, 0, 0)
}

function getPrincipalRange(filterKey = 'this_week', now = new Date()) {
  const safeNow = getDateValue(now) || new Date()
  const end = safeNow
  if (filterKey === 'last_7_days') {
    const start = startOfDay(new Date(safeNow.getTime() - 6 * 24 * 60 * 60 * 1000))
    return { start, end }
  }
  if (filterKey === 'this_month') {
    return { start: startOfMonth(safeNow), end }
  }
  if (filterKey === 'last_30_days') {
    const start = startOfDay(new Date(safeNow.getTime() - 29 * 24 * 60 * 60 * 1000))
    return { start, end }
  }
  return { start: startOfWeek(safeNow), end }
}

function getPreviousRange(range) {
  const startTime = range?.start?.getTime?.() || Date.now()
  const endTime = range?.end?.getTime?.() || Date.now()
  const duration = Math.max(endTime - startTime, 24 * 60 * 60 * 1000)
  const previousEnd = new Date(startTime - 1)
  const previousStart = new Date(previousEnd.getTime() - duration)
  return { start: previousStart, end: previousEnd }
}

function isInRange(value, range) {
  const date = getDateValue(value)
  if (!date) return false
  const time = date.getTime()
  const start = range?.start?.getTime?.() || 0
  const end = range?.end?.getTime?.() || Date.now()
  return time >= start && time <= end
}

function getCanvassingStorageSnapshot(organisationId) {
  if (typeof window === 'undefined') return { prospects: [], activities: [] }
  const orgId = String(organisationId || '').trim()
  if (!orgId) return { prospects: [], activities: [] }
  try {
    const raw = window.localStorage.getItem(`${CANVASSING_STORAGE_PREFIX}:${orgId}`)
    if (!raw) return { prospects: [], activities: [] }
    const parsed = JSON.parse(raw)
    return {
      prospects: Array.isArray(parsed?.prospects) ? parsed.prospects : [],
      activities: Array.isArray(parsed?.activities) ? parsed.activities : [],
    }
  } catch {
    return { prospects: [], activities: [] }
  }
}

function getActivityAgentName(row = {}) {
  return String(
    row?.agentName ||
      row?.assignedAgentName ||
      row?.assignedAgentEmail ||
      row?.agentEmail ||
      row?.agentId ||
      'Unassigned',
  ).trim() || 'Unassigned'
}

function getAppointmentDateValue(appointment = {}) {
  const direct = getDateValue(appointment?.dateTime)
  if (direct) return direct
  if (appointment?.date) {
    const withTime = `${String(appointment.date).trim()}T${String(appointment.startTime || '00:00').trim() || '00:00'}`
    return getDateValue(withTime)
  }
  return null
}

function FORMAT_DELTA_LABEL(value) {
  const amount = Number(value || 0)
  const prefix = amount > 0 ? '+' : ''
  return `${prefix}${amount}`
}

function getProfileIdentitySet(profile) {
  const values = [
    profile?.id,
    profile?.email,
    profile?.name,
    profile?.fullName,
    profile?.displayName,
  ]
  return new Set(values.map((value) => toLookupText(value)).filter(Boolean))
}

function rowMatchesAgentIdentity(row, profileIdentitySet) {
  if (!(profileIdentitySet instanceof Set) || !profileIdentitySet.size) {
    return false
  }

  const candidates = [
    row?.transaction?.assigned_agent_id,
    row?.transaction?.agent_id,
    row?.transaction?.owner_id,
    row?.transaction?.created_by,
    row?.transaction?.assigned_agent_email,
    row?.transaction?.agent_email,
    row?.transaction?.assigned_agent,
    row?.transaction?.assigned_agent_name,
    row?.transaction?.agent_name,
  ].map((value) => toLookupText(value)).filter(Boolean)

  if (!candidates.length) {
    return false
  }

  return candidates.some((candidate) => profileIdentitySet.has(candidate))
}

function leadMatchesAgentIdentity(lead, profileIdentitySet) {
  if (!(profileIdentitySet instanceof Set) || !profileIdentitySet.size) {
    return false
  }

  const candidates = [
    lead?.assignedAgentId,
    lead?.assignedAgentEmail,
    lead?.agentId,
    lead?.agentEmail,
    lead?.assignedAgent,
    lead?.assignedAgentName,
    lead?.agentName,
  ].map((value) => toLookupText(value)).filter(Boolean)

  if (!candidates.length) {
    return false
  }

  return candidates.some((candidate) => profileIdentitySet.has(candidate))
}

function resolveLeadCategory(value) {
  const normalized = toLookupText(value)
  if (normalized.includes('seller') || normalized.includes('landlord')) return 'seller'
  if (normalized.includes('buyer') || normalized.includes('tenant') || normalized.includes('investor')) return 'buyer'
  return 'other'
}

function isViewingAppointment(appointment = {}) {
  return toLookupText(appointment?.appointmentType) === 'viewing'
}

function isSellerAppointment(appointment = {}) {
  const type = toLookupText(appointment?.appointmentType)
  if (type === 'mandate discussion' || type === 'seller valuation') {
    return true
  }

  if (type === 'general meeting' || type === 'follow-up meeting') {
    const participants = Array.isArray(appointment?.participants) ? appointment.participants : []
    return participants.some((participant) => toLookupText(participant?.participantRole) === 'seller')
  }

  return false
}

function resolvePropertyCategoryKey(value) {
  return normalizePropertyCategory(value, { fallback: 'residential' })
}

function resolveListingSourceKey(value) {
  return normalizeListingSource(value, { fallback: 'private_listing' })
}

function resolvePropertyStructureKey(value) {
  return normalizePropertyStructureType(value, { fallback: 'other' })
}

function resolveListingLifecycleStatus(listing = {}) {
  const direct = toLookupText(listing?.status || listing?.listingStatus || listing?.stage)
  if (direct) return direct
  return ''
}

function listingMatchesAgentIdentity(listing, profileIdentitySet) {
  if (!(profileIdentitySet instanceof Set) || !profileIdentitySet.size) {
    return false
  }

  const candidates = [
    listing?.agentId,
    listing?.assignedAgentEmail,
    listing?.assigned_agent_email,
    listing?.assignedAgent,
    listing?.assignedAgentName,
    listing?.agentName,
    listing?.commission?.agent_id,
  ].map((value) => toLookupText(value)).filter(Boolean)

  if (!candidates.length) {
    return false
  }

  return candidates.some((candidate) => profileIdentitySet.has(candidate))
}

function getAppointmentStatusMeta(status) {
  const normalized = toLookupText(status)
  if (normalized === 'needs reschedule') {
    return { label: 'Needs Reschedule', tone: 'border-[#f2debf] bg-[#fdf5e8] text-[#976427]' }
  }
  if (normalized === 'pending confirmation' || normalized === 'draft') {
    return { label: 'Pending', tone: 'border-[#f2debf] bg-[#fdf5e8] text-[#976427]' }
  }
  if (normalized === 'confirmed') {
    return { label: 'Confirmed', tone: 'border-[#d8e6f6] bg-[#f3f8fd] text-[#2c5a89]' }
  }
  if (normalized === 'cancelled') {
    return { label: 'Declined', tone: 'border-[#f1ced2] bg-[#fff2f4] text-[#a0383f]' }
  }
  return { label: formatAppointmentStatusLabel(status) || 'Pending', tone: 'border-[#dbe6f2] bg-white text-[#35546c]' }
}

function getBondStageProgress(stageKey) {
  switch (stageKey) {
    case 'docs_requested':
      return 18
    case 'docs_received':
      return 34
    case 'application_submitted':
      return 52
    case 'bank_reviewing':
      return 72
    case 'approval_granted':
      return 100
    case 'declined':
      return 100
    default:
      return 12
  }
}

function openBondApplication(navigate, item) {
  const unitId = item?.unitId || null
  const unitNumber = item?.unitNumber || '-'
  const transactionId = item?.transactionId || null

  if (unitId) {
    navigate(`/units/${unitId}`, {
      state: { headerTitle: `Unit ${unitNumber}` },
    })
    return
  }

  if (transactionId) {
    navigate(`/transactions/${transactionId}`, {
      state: { headerTitle: item?.reference || 'Application' },
    })
    return
  }

  navigate('/applications')
}

function toSignalText(row) {
  return `${row?.transaction?.next_action || ''} ${row?.transaction?.current_sub_stage_summary || ''} ${row?.transaction?.comment || ''} ${row?.stage || ''}`
    .toLowerCase()
    .trim()
}

function createWorkflowSteps(stepLabels, completedUntil, activeIndex) {
  return stepLabels.map((label, index) => {
    let status = 'pending'
    if (index <= completedUntil) {
      status = 'completed'
    } else if (index === activeIndex) {
      status = 'active'
    }

    return { label, status }
  })
}

function buildFinanceWorkflowSteps(mainStage, signalText) {
  let completedUntil = -1
  let activeIndex = 0

  if (['ATTY', 'XFER', 'REG'].includes(mainStage)) {
    completedUntil = SHARED_FINANCE_WORKFLOW_STEPS.length - 1
    activeIndex = -1
  } else if (mainStage === 'FIN') {
    completedUntil = 2
    activeIndex = 3
  } else if (mainStage === 'OTP') {
    completedUntil = 0
    activeIndex = 1
  }

  if (/(approved|grant signed|proof of funds|guarantees)/i.test(signalText)) {
    completedUntil = SHARED_FINANCE_WORKFLOW_STEPS.length - 1
    activeIndex = -1
  } else if (/(review|bank feedback|underwriting|valuation)/i.test(signalText)) {
    completedUntil = Math.max(completedUntil, 2)
    activeIndex = 3
  } else if (/(submitted|application lodged|sent to bank)/i.test(signalText)) {
    completedUntil = Math.max(completedUntil, 2)
    activeIndex = 3
  }

  return createWorkflowSteps(SHARED_FINANCE_WORKFLOW_STEPS, completedUntil, activeIndex)
}

function buildTransferWorkflowSteps(mainStage, signalText) {
  let completedUntil = -1
  let activeIndex = 0

  if (mainStage === 'REG') {
    completedUntil = SHARED_TRANSFER_WORKFLOW_STEPS.length - 1
    activeIndex = -1
  } else if (mainStage === 'XFER') {
    completedUntil = 4
    activeIndex = 5
  } else if (mainStage === 'ATTY') {
    completedUntil = 1
    activeIndex = 2
  } else if (mainStage === 'FIN') {
    completedUntil = 0
    activeIndex = 1
  }

  if (/(registered|deed registered)/i.test(signalText)) {
    completedUntil = SHARED_TRANSFER_WORKFLOW_STEPS.length - 1
    activeIndex = -1
  } else if (/(lodged|lodgement|deeds office)/i.test(signalText)) {
    completedUntil = 4
    activeIndex = 5
  } else if (/(guarantees|signed documents|transfer docs prepared|clearance received|preparing transfer)/i.test(signalText)) {
    completedUntil = Math.max(completedUntil, 2)
    activeIndex = 3
  }

  return createWorkflowSteps(SHARED_TRANSFER_WORKFLOW_STEPS, completedUntil, activeIndex)
}

function Dashboard() {
  const navigate = useNavigate()
  const location = useLocation()
  const { workspace, role, profile, personaOptions, setActivePersona, rolePreviewActive } = useWorkspace()
  const [overview, setOverview] = useState({
    metrics: {
      totalDevelopments: 0,
      totalUnits: 0,
      activeTransactions: 0,
      unitsInTransfer: 0,
      unitsRegistered: 0,
      totalRevenue: 0,
    },
    developmentSummaries: [],
    rows: [],
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeWorkflowTab, setActiveWorkflowTab] = useState('finance')
  const [transactionScope, setTransactionScope] = useState('all')
  const [propertyTypeView, setPropertyTypeView] = useState('volume')
  const [funnelAudience, setFunnelAudience] = useState('buyer')
  const [propertyMixScope, setPropertyMixScope] = useState('deals')
  const [appointmentSummary, setAppointmentSummary] = useState({
    rows: [],
    pending: [],
    reschedule: [],
    upcoming: [],
    today: [],
    thisWeek: [],
  })
  const [organisationMembershipRole, setOrganisationMembershipRole] = useState('viewer')
  const [organisationIdForAppointments, setOrganisationIdForAppointments] = useState('')
  const [agentViewOverride, setAgentViewOverride] = useState('auto')
  const [principalTimeFilter, setPrincipalTimeFilter] = useState('this_week')
  const [principalCrmSnapshot, setPrincipalCrmSnapshot] = useState({ leads: [], leadActivities: [] })
  const [principalCanvassingSnapshot, setPrincipalCanvassingSnapshot] = useState({ prospects: [], activities: [] })

  const navigateWithTrace = useCallback(
    (to, label = 'dashboard-navigation') => {
      startRouteTransitionTrace({
        from: location.pathname,
        to,
        label,
      })
      navigate(to)
    },
    [location.pathname, navigate],
  )

  const normalizedMembershipRole = String(organisationMembershipRole || '').trim().toLowerCase()
  const principalFromMembership = canAccessPrincipalExperience({
    appRole: role,
    membershipRole: normalizedMembershipRole,
  })
  // Keep principal/owner workspace preview available during beta even on agent memberships.
  const canPreviewPrincipalAgentView = role === 'agent'
  const resolvedAgentViewMode = role !== 'agent'
    ? 'agent'
    : agentViewOverride === 'auto'
      ? (principalFromMembership ? 'principal' : 'agent')
      : agentViewOverride === 'principal' && !canPreviewPrincipalAgentView
        ? 'agent'
        : agentViewOverride
  const isPrincipalAgentView = role === 'agent' && resolvedAgentViewMode === 'principal'
  const agentDataScope = isPrincipalAgentView ? 'principal' : 'agent'

  useEffect(() => {
    let active = true

    async function loadMembershipRole() {
      if (role !== 'agent') {
        if (active) {
          setOrganisationMembershipRole('viewer')
          setOrganisationIdForAppointments('')
        }
        return
      }

      try {
        const context = await fetchOrganisationSettings()
        if (!active) return
        setOrganisationMembershipRole(context?.membershipRole || 'viewer')
        setOrganisationIdForAppointments(String(context?.organisation?.id || '').trim())
      } catch {
        if (active) {
          setOrganisationMembershipRole('viewer')
          setOrganisationIdForAppointments('')
        }
      }
    }

    void loadMembershipRole()
    return () => {
      active = false
    }
  }, [role, profile?.id])

  const loadDashboard = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setLoading(false)
      return
    }

    try {
      setError('')
      setLoading(true)
      if (role === 'agent' || role === 'bond_originator' || role === 'attorney') {
        const roleType = role === 'bond_originator' ? 'bond_originator' : role === 'attorney' ? 'attorney' : 'agent'
        let participantRows = []
        if (role === 'agent' && isPrincipalAgentView) {
          participantRows = await fetchTransactionsListSummary({
            developmentId: workspace.id === 'all' ? null : workspace.id,
            activeTransactionsOnly: false,
          })
        } else if (profile?.id) {
          participantRows = await fetchTransactionsByParticipantSummary({
            userId: profile.id,
            roleType,
          })
        }
        const scopedRows =
          role === 'attorney'
            ? buildAttorneyDemoRows(participantRows || [])
            : role === 'agent'
              ? (participantRows || [])
              : role === 'bond_originator'
                ? buildBondDemoRows(participantRows || [])
                : participantRows

        const filteredRows = role === 'agent' && isPrincipalAgentView
          ? scopedRows
          : scopedRows.filter((row) =>
            workspace.id === 'all' ? true : (row?.development?.id || row?.unit?.development_id) === workspace.id,
          )

        setOverview({
          metrics: {
            totalDevelopments: new Set(
              filteredRows.map((row) => row?.development?.id || row?.unit?.development_id).filter(Boolean),
            ).size,
            totalUnits: filteredRows.length,
            activeTransactions: filteredRows.length,
            unitsInTransfer: filteredRows.filter((row) =>
              ['Proceed to Attorneys', 'Transfer in Progress', 'Transfer Lodged'].includes(row?.stage),
            ).length,
            unitsRegistered: filteredRows.filter((row) => row?.stage === 'Registered').length,
            totalRevenue: filteredRows.reduce((sum, row) => {
              const value = Number(row?.transaction?.sales_price ?? row?.unit?.price)
              return sum + (Number.isFinite(value) ? value : 0)
            }, 0),
          },
          developmentSummaries: [],
          rows: filteredRows,
        })
      } else {
        const data = await fetchDashboardOverview({
          developmentId: workspace.id === 'all' ? null : workspace.id,
        })
        setOverview(data)
      }
    } catch (loadError) {
      setError(loadError.message)
    } finally {
      setLoading(false)
    }
  }, [isPrincipalAgentView, profile?.id, role, workspace.id])

  useEffect(() => {
    void loadDashboard()
  }, [loadDashboard])

  useEffect(() => {
    function refreshDashboard() {
      void loadDashboard()
    }

    window.addEventListener('itg:transaction-created', refreshDashboard)
    window.addEventListener('itg:transaction-updated', refreshDashboard)
    return () => {
      window.removeEventListener('itg:transaction-created', refreshDashboard)
      window.removeEventListener('itg:transaction-updated', refreshDashboard)
    }
  }, [loadDashboard])

  useEffect(() => {
    if (role !== 'agent' || !organisationIdForAppointments) return undefined

    const resolvedAgentIdentity = String(profile?.id || profile?.email || '').trim()
    const refreshAppointments = async () => {
      try {
        const summary = await getAppointmentsDashboardSummaryAsync(organisationIdForAppointments, {
          includeAll: isPrincipalAgentView,
          agentId: isPrincipalAgentView ? '' : resolvedAgentIdentity,
        })
        setAppointmentSummary(summary)
      } catch {
        setAppointmentSummary({
          rows: [],
          pending: [],
          reschedule: [],
          upcoming: [],
          today: [],
          thisWeek: [],
          statusCounts: [],
          typeCounts: [],
        })
      }
    }

    void refreshAppointments()
    const handleRefreshAppointments = () => {
      void refreshAppointments()
    }
    window.addEventListener('itg:agency-crm-updated', handleRefreshAppointments)
    return () => window.removeEventListener('itg:agency-crm-updated', handleRefreshAppointments)
  }, [isPrincipalAgentView, organisationIdForAppointments, profile?.email, profile?.id, role])

  useEffect(() => {
    if (role !== 'agent' || !organisationIdForAppointments) return undefined
    const refreshSnapshots = () => {
      const crm = getAgencyPipelineSnapshot(organisationIdForAppointments)
      const canvassing = getCanvassingStorageSnapshot(organisationIdForAppointments)
      setPrincipalCrmSnapshot({
        leads: Array.isArray(crm?.leads) ? crm.leads : [],
        leadActivities: Array.isArray(crm?.leadActivities) ? crm.leadActivities : [],
      })
      setPrincipalCanvassingSnapshot({
        prospects: Array.isArray(canvassing?.prospects) ? canvassing.prospects : [],
        activities: Array.isArray(canvassing?.activities) ? canvassing.activities : [],
      })
    }
    refreshSnapshots()
    window.addEventListener('itg:agency-crm-updated', refreshSnapshots)
    return () => window.removeEventListener('itg:agency-crm-updated', refreshSnapshots)
  }, [organisationIdForAppointments, role])

  const rows = useMemo(() => overview.rows || [], [overview.rows])

  const dashboardHeaderMetrics = useMemo(() => {
    const fallbackDevelopments = new Set(
      rows.map((row) => row?.development?.id || row?.unit?.development_id).filter(Boolean),
    ).size
    let availableUnits = 0
    let registeredCount = 0
    let revenueSecured = 0
    let inProgressValue = 0

    for (const row of rows) {
      const stage = row?.stage || row?.transaction?.stage || row?.unit?.status || 'Available'
      const mainStage = getMainStageFromDetailedStage(stage)
      const rawValue = Number(
        row?.transaction?.sales_price ??
          row?.transaction?.purchase_price ??
          row?.unit?.current_price ??
          row?.unit?.list_price ??
          row?.unit?.price ??
          0,
      )
      const transactionValue = Number.isFinite(rawValue) ? rawValue : 0

      if (mainStage === 'REG') {
        registeredCount += 1
        revenueSecured += transactionValue
        continue
      }

      if (mainStage === 'AVAIL') {
        availableUnits += 1
        continue
      }

      inProgressValue += transactionValue
    }

    return {
      totalDevelopments: Number(overview?.metrics?.totalDevelopments || 0) || fallbackDevelopments,
      availableUnits,
      inProgressValue,
      revenueSecured,
      registeredCount,
    }
  }, [overview?.metrics?.totalDevelopments, rows])

  const summaryItems = useMemo(() => {
    return [
      { label: 'Total Developments', value: dashboardHeaderMetrics.totalDevelopments, icon: Building2 },
      { label: 'Available Units', value: dashboardHeaderMetrics.availableUnits, icon: LandPlot },
      { label: 'In Progress', value: currency.format(Number(dashboardHeaderMetrics.inProgressValue) || 0), icon: ArrowRightLeft },
      { label: 'Revenue Secured', value: currency.format(Number(dashboardHeaderMetrics.revenueSecured) || 0), icon: Banknote },
      { label: 'Registered', value: dashboardHeaderMetrics.registeredCount, icon: FileCheck2 },
    ]
  }, [dashboardHeaderMetrics])

  const funnelData = useMemo(() => selectStageDistribution(rows), [rows])

  const financeMix = useMemo(() => {
    const segments = selectFinanceMix(rows)
    const totalCount = segments.reduce((sum, item) => sum + item.count, 0)

    let cursor = 0
    const gradientParts = segments
      .filter((item) => item.count > 0)
      .map((item) => {
        const percent = totalCount ? (item.count / totalCount) * 100 : 0
        const start = cursor
        const end = cursor + percent
        cursor = end
        return `${FINANCE_MIX_COLORS[item.key]} ${start}% ${end}%`
      })

    return {
      segments,
      totalCount,
      gradient: gradientParts.length ? `conic-gradient(${gradientParts.join(', ')})` : 'conic-gradient(#e2e8f0 0% 100%)',
    }
  }, [rows])

  const financeLegendSegments = useMemo(() => {
    const visible = (financeMix.segments || []).filter((item) => item.count > 0 || item.value > 0)
    return visible.length ? visible : financeMix.segments
  }, [financeMix.segments])

  const financeMixSnapshot = useMemo(() => {
    const byKey = Object.fromEntries((financeMix.segments || []).map((item) => [item.key, item]))
    const totalCount = financeMix.totalCount || 0
    const totalValue = (financeMix.segments || []).reduce((sum, item) => sum + Number(item.value || 0), 0)
    const cashCount = Number(byKey.cash?.count || 0)
    const bondCount = Number(byKey.bond?.count || 0)
    const comboCount = Number(byKey.combination?.count || 0)

    return [
      {
        label: 'Cash Share',
        value: formatPercent(totalCount ? (cashCount / totalCount) * 100 : 0),
      },
      {
        label: 'Bond Share',
        value: formatPercent(totalCount ? (bondCount / totalCount) * 100 : 0),
      },
      {
        label: 'Hybrid Deals',
        value: comboCount,
      },
      {
        label: 'Avg Deal Value',
        value: currency.format(totalCount ? totalValue / totalCount : 0),
      },
    ]
  }, [financeMix.segments, financeMix.totalCount])

  const CAN_ACCESS_REPORTS = ['developer', 'attorney', 'bond_originator'].includes(role)
  const isAgentRole = role === 'agent'
  const isBondRole = role === 'bond_originator'
  const isAttorneyRole = role === 'attorney'
  const isViewerRole = role === 'viewer'
  const isRoleScopedDashboard = isAgentRole || isBondRole || isAttorneyRole
  const canViewOperationalWorkflows = role !== 'client'
  const roleScopedRows = useMemo(
    () => ((isAgentRole || isBondRole) ? filterRowsByTransactionScope(rows, transactionScope) : rows),
    [isAgentRole, isBondRole, rows, transactionScope],
  )
  const profileIdentitySet = useMemo(() => getProfileIdentitySet(profile), [profile])
  const agentScopedRows = useMemo(() => {
    if (!isAgentRole || isPrincipalAgentView) {
      return roleScopedRows
    }

    return roleScopedRows.filter((row) => rowMatchesAgentIdentity(row, profileIdentitySet))
  }, [isAgentRole, isPrincipalAgentView, profileIdentitySet, roleScopedRows])
  const agentSharedData = useMemo(
    () => (isAgentRole ? getAgentModuleSharedData({ liveRows: agentScopedRows, profile, scope: agentDataScope }) : null),
    [agentDataScope, agentScopedRows, isAgentRole, profile],
  )
  const sharedDashboardRows = useMemo(() => (isAgentRole ? roleScopedRows : rows), [isAgentRole, roleScopedRows, rows])
  const activeTransactionCards = useMemo(
    () => selectActiveTransactions(isAgentRole ? agentScopedRows : isBondRole ? roleScopedRows : rows),
    [agentScopedRows, isAgentRole, isBondRole, roleScopedRows, rows],
  )
  const stageAging = useMemo(() => selectStageAging(rows), [rows])
  const AGENT_SUMMARY = useMemo(() => selectAgentSummary(roleScopedRows), [roleScopedRows])
  const bondSummary = useMemo(() => selectBondSummary(roleScopedRows), [roleScopedRows])
  const bondApplicationCards = useMemo(
    () =>
      [...roleScopedRows]
        .filter((row) => row?.transaction)
        .sort((left, right) => new Date(getRowUpdatedAt(right) || 0) - new Date(getRowUpdatedAt(left) || 0))
        .map((row) => {
          const stageKey = getBondApplicationStage(row)
          return {
            id: row?.transaction?.id || row?.unit?.id,
            transactionId: row?.transaction?.id || null,
            unitId: row?.unit?.id || null,
            developmentName: row?.development?.name || 'Unknown Development',
            unitNumber: row?.unit?.unit_number || '-',
            buyerName: row?.buyer?.name || 'Buyer pending',
            reference: row?.transaction?.transaction_reference || row?.transaction?.id || 'Application',
            bank: row?.transaction?.bank || 'Bank not set',
            financeType: row?.transaction?.finance_type || row?.unit?.finance_type || 'bond',
            stageLabel: {
              docs_requested: 'Documents Requested',
              docs_received: 'Documents Received',
              application_submitted: 'Submitted to Banks',
              bank_reviewing: 'Bank Reviewing',
              approval_granted: 'Approval Granted',
              declined: 'Declined',
            }[stageKey] || 'Documents Requested',
            nextAction: row?.transaction?.next_action || row?.transaction?.current_sub_stage_summary || 'Awaiting next finance update',
            progressPercent: getBondStageProgress(stageKey),
            daysSinceUpdate: getDaysSinceRowUpdate(row),
            missingDocuments: Number(row?.documentSummary?.missingCount || 0),
          }
        }),
    [roleScopedRows],
  )
  const bondInsights = useMemo(() => {
    const applications = roleScopedRows.filter((row) => row?.transaction)
    const approvalRows = applications.filter((row) => getBondApplicationStage(row) === 'approval_granted')
    const averageGrantValue =
      approvalRows.reduce(
        (sum, row) => sum + Number(row?.transaction?.purchase_price || row?.transaction?.sales_price || row?.unit?.purchase_price || row?.unit?.sales_price || 0),
        0,
      ) / (approvalRows.length || 1)
    const averageDaysInFinance =
      applications.reduce((sum, row) => sum + getDaysSinceRowUpdate(row), 0) / (applications.length || 1)
    const approvalRate = applications.length ? (bondSummary.approvals / applications.length) * 100 : 0
    const bankMap = new Map()
    const capturedRates = []

    applications.forEach((row) => {
      const bank = String(row?.transaction?.bank || 'Unassigned').trim() || 'Unassigned'
      const grantValue = Number(row?.transaction?.purchase_price || row?.transaction?.sales_price || row?.unit?.purchase_price || row?.unit?.sales_price || 0)
      const rate = extractInterestRate(row)
      const current = bankMap.get(bank) || { bank, count: 0, grantedValue: 0, approvals: 0, rateTotal: 0, rateCount: 0 }
      current.count += 1
      current.grantedValue += grantValue
      if (getBondApplicationStage(row) === 'approval_granted') {
        current.approvals += 1
      }
      if (Number.isFinite(rate)) {
        current.rateTotal += rate
        current.rateCount += 1
        capturedRates.push(rate)
      }
      bankMap.set(bank, current)
    })

    const bankComparison = [...bankMap.values()]
      .sort((left, right) => right.count - left.count)
      .slice(0, 4)
      .map((item, index, array) => ({
        ...item,
        width: ((item.count || 0) / Math.max(array[0]?.count || 1, 1)) * 100,
        approvalRate: item.count ? (item.approvals / item.count) * 100 : 0,
        averageRate: item.rateCount ? item.rateTotal / item.rateCount : null,
      }))

    const averageQuotedRate =
      capturedRates.reduce((sum, value) => sum + value, 0) / (capturedRates.length || 1)
    const lowestQuotedRate = capturedRates.length ? Math.min(...capturedRates) : null

    return {
      averageGrantValue: approvalRows.length ? averageGrantValue : 0,
      averageDaysInFinance,
      approvalRate,
      bankComparison,
      averageQuotedRate: capturedRates.length ? averageQuotedRate : null,
      lowestQuotedRate,
      quotedRateCount: capturedRates.length,
    }
  }, [bondSummary.approvals, roleScopedRows])
  const bondPerformanceMetrics = useMemo(() => {
    const applications = roleScopedRows.filter((row) => row?.transaction)
    const stageCounts = {
      new: 0,
      awaitingDocs: 0,
      submitted: 0,
      approved: 0,
      declined: 0,
    }
    const bankMap = new Map()
    const agentMap = new Map()
    const agencyMap = new Map()

    for (const row of applications) {
      const stage = getBondApplicationStage(row)
      const daysSinceUpdate = getDaysSinceRowUpdate(row)
      const bankName = String(row?.transaction?.bank || 'Unassigned').trim() || 'Unassigned'
      const agentName = String(row?.transaction?.assigned_agent || row?.transaction?.assigned_agent_email || 'Unassigned').trim() || 'Unassigned'
      const agencyName = String(row?.transaction?.marketing_source || row?.transaction?.lead_source || 'Independent / Unmapped').trim() || 'Independent / Unmapped'

      if (stage === 'approval_granted') {
        stageCounts.approved += 1
      } else if (stage === 'declined') {
        stageCounts.declined += 1
      } else if (stage === 'application_submitted' || stage === 'bank_reviewing') {
        stageCounts.submitted += 1
      } else if (stage === 'docs_received') {
        stageCounts.new += 1
      } else if (stage === 'docs_requested') {
        if (daysSinceUpdate <= 2) {
          stageCounts.new += 1
        } else {
          stageCounts.awaitingDocs += 1
        }
      }

      bankMap.set(bankName, (bankMap.get(bankName) || 0) + 1)
      agentMap.set(agentName, (agentMap.get(agentName) || 0) + 1)
      agencyMap.set(agencyName, (agencyMap.get(agencyName) || 0) + 1)
    }

    const bankComparison = [...bankMap.entries()]
      .map(([bank, count]) => ({ bank, count }))
      .sort((left, right) => right.count - left.count)
      .slice(0, 7)
      .map((item, index, array) => ({
        ...item,
        width: ((item.count || 0) / Math.max(array[0]?.count || 1, 1)) * 100,
      }))

    const rankedAgents = [...agentMap.entries()]
      .map(([name, deals]) => ({ name, deals }))
      .sort((left, right) => right.deals - left.deals)
      .slice(0, 6)

    const rankedAgencies = [...agencyMap.entries()]
      .map(([name, deals]) => ({ name, deals }))
      .sort((left, right) => right.deals - left.deals)
      .slice(0, 6)

    const funnel = [
      { key: 'received', label: 'Deals Received', count: applications.length },
      {
        key: 'submitted',
        label: 'Applications Submitted',
        count: stageCounts.submitted + stageCounts.approved + stageCounts.declined,
      },
      { key: 'approvals', label: 'Approvals', count: stageCounts.approved },
    ]
    const funnelBase = Math.max(funnel[0]?.count || 0, 1)
    const conversionFunnel = funnel.map((item) => ({
      ...item,
      share: (item.count / funnelBase) * 100,
      width: (item.count / funnelBase) * 100,
    }))

    return {
      bankComparison,
      rankedAgents,
      rankedAgencies,
      statusBreakdown: [
        { key: 'new', label: 'New', count: stageCounts.new },
        { key: 'awaiting_docs', label: 'Awaiting Docs', count: stageCounts.awaitingDocs },
        { key: 'submitted', label: 'Submitted', count: stageCounts.submitted },
        { key: 'approved', label: 'Approved', count: stageCounts.approved },
        { key: 'declined', label: 'Declined', count: stageCounts.declined },
      ],
      conversionFunnel,
    }
  }, [roleScopedRows])
  const bondTopStats = useMemo(() => {
    const approvedRows = roleScopedRows.filter((row) => getBondApplicationStage(row) === 'approval_granted')
    const approvalLeadDays = approvedRows
      .map((row) => getDaysBetweenTimestamps(row?.transaction?.created_at, row?.transaction?.updated_at))
      .filter((value) => Number.isFinite(value))
    const avgApprovalTimeDays = approvalLeadDays.length
      ? approvalLeadDays.reduce((sum, value) => sum + value, 0) / approvalLeadDays.length
      : bondInsights.averageDaysInFinance

    return [
      { label: 'Active Applications', value: bondSummary.active, icon: ArrowRightLeft },
      { label: 'Approval Rate', value: formatPercent(bondInsights.approvalRate), icon: TrendingUp },
      { label: 'Avg Bond Grant', value: currency.format(bondInsights.averageGrantValue || 0), icon: Banknote },
      { label: 'Avg Approval Time', value: `${Math.max(0, Math.round(avgApprovalTimeDays || 0))}d`, icon: FileCheck2 },
    ]
  }, [bondInsights.approvalRate, bondInsights.averageDaysInFinance, bondInsights.averageGrantValue, bondSummary.active, roleScopedRows])
  const agentPerformanceMetrics = useMemo(() => {
    const scoped = agentScopedRows.filter((row) => row?.transaction)
    const listingRows = Array.isArray(agentSharedData?.listings) ? agentSharedData.listings : []
    const scopedListings = isPrincipalAgentView
      ? listingRows
      : listingRows.filter((listing) => listingMatchesAgentIdentity(listing, profileIdentitySet))
    const pipelineLeads = Array.isArray(agentSharedData?.pipelineLeads) ? agentSharedData.pipelineLeads : []
    const scopedPipelineLeads = isPrincipalAgentView
      ? pipelineLeads
      : pipelineLeads.filter((lead) => leadMatchesAgentIdentity(lead, profileIdentitySet))
    const sellerLeads = Array.isArray(agentSharedData?.sellerLeads) ? agentSharedData.sellerLeads : []
    const scopedSellerLeads = isPrincipalAgentView
      ? sellerLeads
      : sellerLeads.filter((lead) => leadMatchesAgentIdentity(lead, profileIdentitySet))

    const listingCount = new Set(scoped.map((row) => row?.unit?.id || row?.transaction?.id).filter(Boolean)).size
    const registeredRows = scoped.filter((row) => getRowMainStage(row) === 'REG')
    const dealValueOf = (row) => getTransactionDealValue(row)
    const askingValueOf = (row) => Number(row?.unit?.list_price || row?.unit?.price || 0) || 0
    const soldValue = scoped.reduce((sum, row) => sum + dealValueOf(row), 0)
    const commissionSignals = scoped.reduce(
      (accumulator, row) => {
        const resolved = resolveAgentCommissionAmount(row)
        accumulator.total += resolved.amount
        if (resolved.source === 'legacy_estimated') {
          accumulator.estimatedFallbackRows += 1
        }
        if (resolved.source === 'snapshot') {
          accumulator.snapshotRows += 1
        }
        return accumulator
      },
      { total: 0, estimatedFallbackRows: 0, snapshotRows: 0 },
    )
    const commissionEarned = commissionSignals.total

    const marketingSourceMap = new Map()
    const developmentPrivateMap = new Map([
      ['development', { key: 'development', label: 'Development', total: 0, registered: 0, totalValue: 0, totalDays: 0 }],
      ['private', { key: 'private', label: 'Private', total: 0, registered: 0, totalValue: 0, totalDays: 0 }],
    ])
    const financeTypeMap = new Map([
      ['cash', { key: 'cash', label: 'Cash', total: 0, registered: 0, totalDays: 0 }],
      ['bond', { key: 'bond', label: 'Bond', total: 0, registered: 0, totalDays: 0 }],
      ['hybrid', { key: 'hybrid', label: 'Hybrid', total: 0, registered: 0, totalDays: 0 }],
      ['unknown', { key: 'unknown', label: 'Unknown', total: 0, registered: 0, totalDays: 0 }],
    ])
    const propertyCategoryMap = new Map([
      ['residential', { key: 'residential', label: getPropertyCategoryLabel('residential'), count: 0, value: 0 }],
      ['commercial', { key: 'commercial', label: getPropertyCategoryLabel('commercial'), count: 0, value: 0 }],
      ['industrial', { key: 'industrial', label: getPropertyCategoryLabel('industrial'), count: 0, value: 0 }],
      ['retail', { key: 'retail', label: getPropertyCategoryLabel('retail'), count: 0, value: 0 }],
      ['agricultural', { key: 'agricultural', label: getPropertyCategoryLabel('agricultural'), count: 0, value: 0 }],
      ['mixed_use', { key: 'mixed_use', label: getPropertyCategoryLabel('mixed_use'), count: 0, value: 0 }],
      ['vacant_land', { key: 'vacant_land', label: getPropertyCategoryLabel('vacant_land'), count: 0, value: 0 }],
    ])
    const propertyCategoryDealsMap = new Map(
      [...propertyCategoryMap.entries()].map(([key, value]) => [key, { ...value }]),
    )
    const propertyCategoryListingsMap = new Map(
      [...propertyCategoryMap.entries()].map(([key, value]) => [key, { ...value }]),
    )
    const stockSourceMap = new Map([
      ['private_listing', { key: 'private_listing', label: getListingSourceLabel('private_listing'), count: 0 }],
      ['development', { key: 'development', label: getListingSourceLabel('development'), count: 0 }],
    ])
    const structureTypeMap = new Map([
      ['full_title', { key: 'full_title', label: getPropertyStructureTypeLabel('full_title'), count: 0 }],
      ['sectional_title', { key: 'sectional_title', label: getPropertyStructureTypeLabel('sectional_title'), count: 0 }],
      ['estate', { key: 'estate', label: getPropertyStructureTypeLabel('estate'), count: 0 }],
      ['share_block', { key: 'share_block', label: getPropertyStructureTypeLabel('share_block'), count: 0 }],
      ['freehold', { key: 'freehold', label: getPropertyStructureTypeLabel('freehold'), count: 0 }],
      ['agricultural_holding', { key: 'agricultural_holding', label: getPropertyStructureTypeLabel('agricultural_holding'), count: 0 }],
      ['other', { key: 'other', label: getPropertyStructureTypeLabel('other'), count: 0 }],
    ])
    const buyerAgeMap = new Map([
      ['18-24', 0],
      ['25-34', 0],
      ['35-44', 0],
      ['45-54', 0],
      ['55+', 0],
      ['Unknown', 0],
    ])
    const buyerGenderMap = new Map([
      ['Male', 0],
      ['Female', 0],
      ['Other', 0],
      ['Unknown', 0],
    ])
    const buyerTypeMap = new Map([
      ['Individual', 0],
      ['Company', 0],
      ['Trust', 0],
      ['Other', 0],
      ['Unknown', 0],
    ])
    const buyerFinanceTypeMap = new Map([
      ['Cash', 0],
      ['Bond', 0],
      ['Hybrid', 0],
      ['Unknown', 0],
    ])
    const agentMap = new Map()

    let REGISTERED = 0
    let openDeals = 0
    let totalAsking = 0
    let totalSelling = 0

    for (const row of scoped) {
      const main = getRowMainStage(row)
      const lifecycle = String(row?.transaction?.lifecycle_state || '').trim().toLowerCase()
      const isCancelled = lifecycle.includes('cancel')
      const dealValue = dealValueOf(row)
      const askingValue = askingValueOf(row)
      const daysInDeal = getDaysSinceRowUpdate(row)
      const isRegistered = main === 'REG'

      if (isRegistered) REGISTERED += 1
      if (!isRegistered && !isCancelled) openDeals += 1

      totalAsking += askingValue
      totalSelling += dealValue

      const marketingKey = String(row?.transaction?.marketing_source || row?.transaction?.lead_source || 'Unknown').trim() || 'Unknown'
      const currentSource = marketingSourceMap.get(marketingKey) || { source: marketingKey, deals: 0 }
      currentSource.deals += 1
      marketingSourceMap.set(marketingKey, currentSource)

      const scopeKey = getTransactionScopeForRow(row) === 'private' ? 'private' : 'development'
      const scopeEntry = developmentPrivateMap.get(scopeKey)
      scopeEntry.total += 1
      scopeEntry.totalValue += dealValue
      scopeEntry.totalDays += daysInDeal
      if (isRegistered) scopeEntry.registered += 1

      const financeType = normalizeFinanceType(row?.transaction?.finance_type, { allowUnknown: true })
      const financeKey =
        financeType === 'cash'
          ? 'cash'
          : financeType === 'bond'
            ? 'bond'
            : financeType === 'combination'
              ? 'hybrid'
              : 'unknown'
      const financeEntry = financeTypeMap.get(financeKey)
      financeEntry.total += 1
      financeEntry.totalDays += daysInDeal
      if (isRegistered) financeEntry.registered += 1

      const rawCategorySignal = String(
        row?.transaction?.property_category ||
          row?.unit?.property_category ||
          row?.transaction?.property_type ||
          row?.unit?.property_type ||
          row?.transaction?.property_description ||
          row?.transaction?.transaction_type ||
          '',
      ).trim().toLowerCase()
      const propertyCategoryKey = resolvePropertyCategoryKey(rawCategorySignal)
      const propertyCategoryEntry = propertyCategoryMap.get(propertyCategoryKey)
      if (propertyCategoryEntry) {
        propertyCategoryEntry.count += 1
        propertyCategoryEntry.value += dealValue
      }
      const propertyCategoryDealsEntry = propertyCategoryDealsMap.get(propertyCategoryKey)
      if (propertyCategoryDealsEntry) {
        propertyCategoryDealsEntry.count += 1
        propertyCategoryDealsEntry.value += dealValue
      }

      const rawListingSourceSignal = String(
        row?.transaction?.listing_source ||
          row?.unit?.listing_source ||
          row?.transaction?.stock_source ||
          row?.unit?.stock_source ||
          (scopeKey === 'private' ? 'private_listing' : 'development'),
      ).trim().toLowerCase()
      const listingSourceKey = resolveListingSourceKey(rawListingSourceSignal)
      const listingSourceEntry = stockSourceMap.get(listingSourceKey)
      if (listingSourceEntry) {
        listingSourceEntry.count += 1
      }

      const rawStructureSignal = String(
        row?.transaction?.property_structure_type ||
          row?.unit?.property_structure_type ||
          row?.transaction?.structure_type ||
          row?.unit?.structure_type ||
          row?.transaction?.ownership_type ||
          row?.transaction?.title_type ||
          row?.transaction?.property_type ||
          '',
      ).trim().toLowerCase()
      const structureKey = resolvePropertyStructureKey(rawStructureSignal)
      const structureEntry = structureTypeMap.get(structureKey)
      if (structureEntry) {
        structureEntry.count += 1
      }

      const ageSignal = String(row?.buyer?.age_group || row?.buyer?.age || row?.buyer?.date_of_birth || '').trim().toLowerCase()
      let ageKey = 'Unknown'
      const ageNum = Number(ageSignal)
      if (Number.isFinite(ageNum) && ageNum > 0) {
        ageKey = ageNum < 25 ? '18-24' : ageNum < 35 ? '25-34' : ageNum < 45 ? '35-44' : ageNum < 55 ? '45-54' : '55+'
      } else if (ageSignal.includes('18') || ageSignal.includes('24') || ageSignal.includes('18-24')) {
        ageKey = '18-24'
      } else if (ageSignal.includes('25') || ageSignal.includes('34') || ageSignal.includes('25-34')) {
        ageKey = '25-34'
      } else if (ageSignal.includes('35') || ageSignal.includes('44') || ageSignal.includes('35-44')) {
        ageKey = '35-44'
      } else if (ageSignal.includes('45') || ageSignal.includes('54') || ageSignal.includes('45-54')) {
        ageKey = '45-54'
      } else if (ageSignal.includes('55') || ageSignal.includes('60') || ageSignal.includes('50+')) {
        ageKey = '55+'
      }
      buyerAgeMap.set(ageKey, (buyerAgeMap.get(ageKey) || 0) + 1)

      const genderSignal = String(row?.buyer?.gender || '').trim().toLowerCase()
      const genderKey =
        genderSignal.startsWith('m')
          ? 'Male'
          : genderSignal.startsWith('f')
            ? 'Female'
            : genderSignal
              ? 'Other'
              : 'Unknown'
      buyerGenderMap.set(genderKey, (buyerGenderMap.get(genderKey) || 0) + 1)

      const buyerTypeSignal = String(row?.transaction?.purchaser_type || '').trim().toLowerCase()
      const buyerTypeKey =
        buyerTypeSignal.includes('company') || buyerTypeSignal.includes('pty')
          ? 'Company'
          : buyerTypeSignal.includes('trust')
            ? 'Trust'
            : buyerTypeSignal.includes('individual') || buyerTypeSignal.includes('person')
              ? 'Individual'
              : buyerTypeSignal
                ? 'Other'
                : 'Unknown'
      buyerTypeMap.set(buyerTypeKey, (buyerTypeMap.get(buyerTypeKey) || 0) + 1)

      const financeTypeLabel =
        financeType === 'cash'
          ? 'Cash'
          : financeType === 'bond'
            ? 'Bond'
            : financeType === 'combination'
              ? 'Hybrid'
              : 'Unknown'
      buyerFinanceTypeMap.set(financeTypeLabel, (buyerFinanceTypeMap.get(financeTypeLabel) || 0) + 1)

      const agentName = String(row?.transaction?.assigned_agent || 'Unassigned').trim() || 'Unassigned'
      const agentEntry = agentMap.get(agentName) || { agent: agentName, deals: 0, registered: 0, totalDays: 0 }
      agentEntry.deals += 1
      agentEntry.totalDays += daysInDeal
      if (isRegistered) agentEntry.registered += 1
      agentMap.set(agentName, agentEntry)
    }

    for (const listing of scopedListings) {
      const listingValue = Number(listing?.askingPrice || listing?.estimatedPrice || listing?.price || 0) || 0
      const propertyCategoryKey = resolvePropertyCategoryKey(
        listing?.propertyCategory ||
          listing?.property_category ||
          listing?.propertyType ||
          listing?.property_type ||
          listing?.listingCategory ||
          '',
      )
      const propertyCategoryListingsEntry = propertyCategoryListingsMap.get(propertyCategoryKey)
      if (propertyCategoryListingsEntry) {
        propertyCategoryListingsEntry.count += 1
        propertyCategoryListingsEntry.value += listingValue
      }

      const listingSourceKey = resolveListingSourceKey(
        listing?.listingSource || listing?.listing_source || listing?.stockSource || listing?.stock_source || listing?.listingCategory || 'private_listing',
      )
      const listingSourceEntry = stockSourceMap.get(listingSourceKey)
      if (listingSourceEntry) {
        listingSourceEntry.count += 1
      }

      const structureKey = resolvePropertyStructureKey(
        listing?.propertyStructureType ||
          listing?.property_structure_type ||
          listing?.ownershipType ||
          listing?.ownership_structure ||
          listing?.propertyType ||
          listing?.property_type ||
          '',
      )
      const structureEntry = structureTypeMap.get(structureKey)
      if (structureEntry) {
        structureEntry.count += 1
      }
    }

    const marketingSources = [...marketingSourceMap.values()]
      .sort((left, right) => right.deals - left.deals)
      .map((item) => ({
        ...item,
        share: scoped.length ? (item.deals / scoped.length) * 100 : 0,
      }))

    const buyerLeadCount = scopedPipelineLeads.filter((lead) => resolveLeadCategory(lead?.leadCategory) === 'buyer').length
    const sellerLeadCountFromPipeline = scopedPipelineLeads.filter((lead) => resolveLeadCategory(lead?.leadCategory) === 'seller').length
    const sellerLeadCount = Math.max(sellerLeadCountFromPipeline, scopedSellerLeads.length)
    const viewingCount = (appointmentSummary.rows || []).filter((appointment) => isViewingAppointment(appointment)).length
    const sellerAppointmentCount = (appointmentSummary.rows || []).filter((appointment) => isSellerAppointment(appointment)).length

    let buyerOfferCountFromListings = 0
    let buyerSignedFromListings = 0
    for (const listing of scopedListings) {
      const offers = Array.isArray(listing?.offers) ? listing.offers : []
      for (const offer of offers) {
        const status = toLookupText(offer?.status)
        if (!status || status === 'rejected' || status === 'expired') continue
        buyerOfferCountFromListings += 1
        if (status.includes('accept') || status.includes('converted') || status.includes('signed')) {
          buyerSignedFromListings += 1
        }
      }
    }

    const buyerOfferCountFallback = scoped.filter((row) => ['OTP', 'FIN', 'ATTY', 'XFER', 'REG'].includes(getRowMainStage(row))).length
    const buyerSignedFallback = scoped.filter((row) => {
      const stage = String(row?.stage || row?.transaction?.stage || '').toLowerCase()
      const main = getRowMainStage(row)
      return stage.includes('signed') || ['FIN', 'ATTY', 'XFER', 'REG'].includes(main)
    }).length
    const buyerOfferCount = buyerOfferCountFromListings > 0 ? buyerOfferCountFromListings : buyerOfferCountFallback
    const buyerSignedCount = buyerSignedFromListings > 0 ? buyerSignedFromListings : buyerSignedFallback

    let sellerMandateSignedCount = 0
    let sellerListingLiveCount = 0
    for (const listing of scopedListings) {
      const listingStatus = resolveListingLifecycleStatus(listing)
      if (listingStatus.includes('mandate_signed')) {
        sellerMandateSignedCount += 1
      }
      if (
        listingStatus.includes('listing_active') ||
        listingStatus === 'active' ||
        listingStatus.includes('published') ||
        listingStatus.includes('live')
      ) {
        sellerListingLiveCount += 1
      }
    }

    const buildFunnelStages = (stages) => {
      const funnelBaseCount = Math.max(stages[0]?.count || 0, 1)
      return stages.map((item, index, array) => {
        const previous = index > 0 ? array[index - 1] : null
        const fromPreviousShare = previous ? (previous.count ? (item.count / previous.count) * 100 : 0) : 100
        const next = index < array.length - 1 ? array[index + 1] : null
        const dropToNext = next ? (item.count ? Math.max(0, ((item.count - next.count) / item.count) * 100) : 0) : 0
        return {
          ...item,
          shareOfLeads: stages[0]?.count ? (item.count / stages[0].count) * 100 : 0,
          fromPreviousShare,
          previousKey: previous?.key || null,
          previousLabel: previous?.label || null,
          dropToNext,
          width: (item.count / funnelBaseCount) * 100,
        }
      })
    }

    const buyerFunnel = buildFunnelStages([
      { key: 'leads', label: 'Leads', count: buyerLeadCount },
      { key: 'viewings', label: 'Viewings', count: viewingCount },
      { key: 'offers', label: 'Offers', count: buyerOfferCount },
      { key: 'signed', label: 'Signed', count: buyerSignedCount },
    ])
    const sellerFunnel = buildFunnelStages([
      { key: 'leads', label: 'Leads', count: sellerLeadCount },
      { key: 'appointments', label: 'Appointments', count: sellerAppointmentCount },
      { key: 'mandate_signed', label: 'Mandate Signed', count: sellerMandateSignedCount },
      { key: 'listing_live', label: 'Listing Live', count: sellerListingLiveCount },
    ])

    const buildBiggestDrop = (funnel) => funnel.slice(0, -1).reduce((largest, item, index) => {
      const next = funnel[index + 1]
      if (!next) return largest
      if (!largest || item.dropToNext > largest.dropPercent) {
        return {
          from: item.label,
          to: next.label,
          fromKey: item.key,
          toKey: next.key,
          dropPercent: item.dropToNext,
        }
      }
      return largest
    }, null)

    const conversionFunnel = {
      buyer: buyerFunnel,
      seller: sellerFunnel,
    }
    const biggestFunnelDrop = {
      buyer: buildBiggestDrop(buyerFunnel),
      seller: buildBiggestDrop(sellerFunnel),
    }
    const hasFunnelData = {
      buyer: buyerFunnel.some((item) => item.count > 0),
      seller: sellerFunnel.some((item) => item.count > 0),
    }

    const cashVsBond = [...financeTypeMap.values()].map((item) => ({
      ...item,
      conversion: item.total ? (item.registered / item.total) * 100 : 0,
      avgDealTime: item.total ? item.totalDays / item.total : 0,
    }))

    const developmentVsPrivate = [...developmentPrivateMap.values()].map((item) => ({
      ...item,
      conversion: item.total ? (item.registered / item.total) * 100 : 0,
      avgDealValue: item.total ? item.totalValue / item.total : 0,
      avgDealTime: item.total ? item.totalDays / item.total : 0,
    }))

    const agentPerformance = [...agentMap.values()]
      .map((item) => ({
        ...item,
        conversion: item.deals ? (item.registered / item.deals) * 100 : 0,
        avgDealTime: item.deals ? item.totalDays / item.deals : 0,
      }))
      .sort((left, right) => right.deals - left.deals)
      .slice(0, 8)

    const activeDealValue = scoped
      .filter((row) => getRowMainStage(row) !== 'REG')
      .reduce((sum, row) => sum + dealValueOf(row), 0)
    const avgAskingPrice = scoped.length ? totalAsking / scoped.length : 0
    const avgSellingPrice = scoped.length ? totalSelling / scoped.length : 0
    const askingVsSellingDelta = avgAskingPrice ? ((avgSellingPrice - avgAskingPrice) / avgAskingPrice) * 100 : 0
    const propertyTypeByVolume = [...propertyCategoryMap.values()].map((item) => ({
      ...item,
      share: scoped.length ? (item.count / scoped.length) * 100 : 0,
    }))
    const totalPropertyValue = propertyTypeByVolume.reduce((sum, item) => sum + Number(item.value || 0), 0)
    const propertyTypeByValue = propertyTypeByVolume.map((item) => ({
      ...item,
      share: totalPropertyValue ? (Number(item.value || 0) / totalPropertyValue) * 100 : 0,
    }))
    const buyerInsights = {
      ageGroups: [...buyerAgeMap.entries()].map(([label, count]) => ({
        label,
        count,
        share: scoped.length ? (count / scoped.length) * 100 : 0,
      })),
      genders: [...buyerGenderMap.entries()].map(([label, count]) => ({
        label,
        count,
        share: scoped.length ? (count / scoped.length) * 100 : 0,
      })),
      buyerTypes: [...buyerTypeMap.entries()].map(([label, count]) => ({
        label,
        count,
        share: scoped.length ? (count / scoped.length) * 100 : 0,
      })),
      financeTypes: [...buyerFinanceTypeMap.entries()].map(([label, count]) => ({
        label,
        count,
        share: scoped.length ? (count / scoped.length) * 100 : 0,
      })),
    }
    const propertyTypeDealBreakdown = [...propertyCategoryDealsMap.values()]
      .filter((item) => item.count > 0)
      .sort((left, right) => right.count - left.count)
    const propertyTypeListingBreakdown = [...propertyCategoryListingsMap.values()]
      .filter((item) => item.count > 0)
      .sort((left, right) => right.count - left.count)
    const stockSourceBreakdown = [...stockSourceMap.values()]
      .filter((item) => item.count > 0)
      .sort((left, right) => right.count - left.count)
    const structureTypeBreakdown = [...structureTypeMap.values()]
      .filter((item) => item.count > 0)
      .sort((left, right) => right.count - left.count)
    const quality = {
      funnel: {
        buyerOfferSource: buyerOfferCountFromListings > 0 ? 'listing_offers' : 'transaction_stage_fallback',
        buyerSignedSource: buyerSignedFromListings > 0 ? 'listing_offers' : 'transaction_stage_fallback',
        sellerMandateSource: scopedListings.length ? 'listing_status' : 'missing',
        sellerListingLiveSource: scopedListings.length ? 'listing_status' : 'missing',
        buyerLeadSource: scopedPipelineLeads.length ? 'crm_pipeline_leads' : 'missing',
        sellerLeadSource: scopedSellerLeads.length || sellerLeadCountFromPipeline ? 'crm_seller_leads' : 'missing',
      },
      demographics: {
        buyerAgeRowsWithSignal: scoped.filter((row) => Boolean(String(row?.buyer?.age_group || row?.buyer?.age || row?.buyer?.date_of_birth || '').trim())).length,
      },
      propertyType: {
        dealsRowsWithSignal: scoped.filter((row) => Boolean(String(row?.transaction?.property_category || row?.unit?.property_category || row?.transaction?.property_type || row?.unit?.property_type || row?.transaction?.transaction_type || '').trim())).length,
        listingsRowsWithSignal: scopedListings.filter((listing) => Boolean(String(listing?.propertyCategory || listing?.property_category || listing?.propertyType || listing?.property_type || '').trim())).length,
      },
    }

    return {
      listingCount,
      soldValue,
      activeDealValue,
      commissionEarned,
      commissionEstimatedFallbackRows: commissionSignals.estimatedFallbackRows,
      commissionSnapshotRows: commissionSignals.snapshotRows,
      marketingSources,
      conversionFunnel,
      biggestFunnelDrop,
      hasFunnelData,
      cashVsBond,
      propertyTypeDealBreakdown,
      propertyTypeListingBreakdown,
      stockSourceBreakdown,
      structureTypeBreakdown,
      developmentVsPrivate,
      avgAskingPrice,
      avgSellingPrice,
      askingVsSellingDelta,
      agentPerformance,
      propertyTypeByVolume,
      propertyTypeByValue,
      buyerInsights,
      quality,
      totalDeals: scoped.length,
      registeredDeals: registeredRows.length,
      openDeals,
    }
  }, [agentScopedRows, agentSharedData?.listings, agentSharedData?.pipelineLeads, agentSharedData?.sellerLeads, appointmentSummary.rows, isPrincipalAgentView, profileIdentitySet])
  const topSummaryItems = useMemo(() => {
    if (isAgentRole) {
      const sharedDashboard = agentSharedData?.dashboard || {}
      return [
        { label: 'Listings', value: Number(sharedDashboard.listingCount ?? agentPerformanceMetrics.listingCount) || 0, icon: Building2 },
        { label: 'Transactions', value: Number(sharedDashboard.activeDealCount ?? agentPerformanceMetrics.openDeals) || 0, icon: ArrowRightLeft },
        { label: 'Registered', value: Number(sharedDashboard.registeredCount ?? agentPerformanceMetrics.registeredDeals) || 0, icon: FileCheck2 },
        { label: 'Pipeline Value', value: currency.format(Number(sharedDashboard.pipelineValue ?? agentPerformanceMetrics.activeDealValue) || 0), icon: Banknote },
        { label: 'Commission', value: currency.format(Number(sharedDashboard.commissionEarned ?? sharedDashboard.estimatedCommission ?? agentPerformanceMetrics.commissionEarned) || 0), icon: TrendingUp },
      ]
    }

    if (isBondRole) {
      return [
        { label: 'Active Applications', value: bondSummary.active, icon: ArrowRightLeft },
        { label: 'Documents Pending', value: bondSummary.docsPending, icon: FileCheck2 },
        { label: 'Submitted to Banks', value: bondSummary.submittedToBanks, icon: Banknote },
        { label: 'Approvals Received', value: bondSummary.approvals, icon: TrendingUp },
        { label: 'Applications Declined', value: bondSummary.declined, icon: Users },
      ]
    }

    return summaryItems
  }, [agentPerformanceMetrics.activeDealValue, agentPerformanceMetrics.commissionEarned, agentPerformanceMetrics.listingCount, agentPerformanceMetrics.openDeals, agentPerformanceMetrics.registeredDeals, agentSharedData, bondSummary.active, bondSummary.approvals, bondSummary.declined, bondSummary.docsPending, bondSummary.submittedToBanks, isAgentRole, isBondRole, summaryItems])
  const agentTopKpiItems = useMemo(() => {
    if (!isAgentRole) {
      return []
    }

    const sharedDashboard = agentSharedData?.dashboard || {}
    const listingCount = Number(sharedDashboard.listingCount ?? agentPerformanceMetrics.listingCount) || 0
    const activeDeals = Number(sharedDashboard.activeDealCount ?? agentPerformanceMetrics.openDeals) || 0
    const registeredCount = Number(sharedDashboard.registeredCount ?? agentPerformanceMetrics.registeredDeals) || 0
    const pipelineValue = Number(sharedDashboard.pipelineValue ?? agentPerformanceMetrics.activeDealValue) || 0
    const estimatedCommission = Number(sharedDashboard.commissionEarned ?? sharedDashboard.estimatedCommission ?? agentPerformanceMetrics.commissionEarned) || 0
    const commissionCoverage = sharedDashboard.commissionCoverage || null
    const hasLegacyCommissionFallback = Number(commissionCoverage?.estimatedFallbackRows || 0) > 0

    return [
      {
        key: 'listings',
        label: 'Listings',
        value: formatKpiCount(listingCount),
        context: 'Your active listing book',
        icon: Building2,
        valueClassName: 'text-[2.1rem] leading-none md:text-[2.35rem]',
      },
      {
        key: 'active_deals',
        label: 'Transactions',
        value: formatKpiCount(activeDeals),
        context: 'Your open transactions',
        icon: ArrowRightLeft,
        valueClassName: 'text-[2.1rem] leading-none md:text-[2.35rem]',
      },
      {
        key: 'registered',
        label: 'Registered',
        value: formatKpiCount(registeredCount),
        context: 'Your registered transactions',
        icon: FileCheck2,
        valueClassName: 'text-[2.1rem] leading-none md:text-[2.35rem]',
      },
      {
        key: 'pipeline_value',
        label: 'Pipeline Value',
        value: formatKpiCurrency(pipelineValue),
        context: 'Based on your listings',
        icon: Banknote,
        valueClassName: 'text-[1.85rem] leading-none md:text-[2.05rem]',
      },
      {
        key: 'commission',
        label: 'Commission',
        value: formatKpiCurrency(estimatedCommission),
        context: hasLegacyCommissionFallback ? 'Estimated from principal rules' : 'Based on commission rules',
        icon: TrendingUp,
        valueClassName: 'text-[1.85rem] leading-none md:text-[2.05rem]',
      },
    ]
  }, [agentPerformanceMetrics.activeDealValue, agentPerformanceMetrics.commissionEarned, agentPerformanceMetrics.listingCount, agentPerformanceMetrics.openDeals, agentPerformanceMetrics.registeredDeals, agentSharedData, isAgentRole])
  const agentPipelineValueLookup = useMemo(() => {
    if (!isAgentRole) {
      return new Map()
    }

    const values = new Map()
    for (const row of agentScopedRows) {
      const agentName = String(row?.transaction?.assigned_agent || 'Unassigned').trim() || 'Unassigned'
      const isRegistered = getRowMainStage(row) === 'REG'
      if (isRegistered) {
        continue
      }

      const value = Number(
        row?.transaction?.sales_price ||
        row?.transaction?.purchase_price ||
        row?.unit?.price ||
        0,
      )
      values.set(agentName, (values.get(agentName) || 0) + (Number.isFinite(value) ? value : 0))
    }

    return values
  }, [agentScopedRows, isAgentRole])
  const AGENT_TOP_PERFORMERS = useMemo(() => {
    if (!isAgentRole) {
      return []
    }

    const sharedTop = Array.isArray(agentSharedData?.dashboard?.topPerformingAgents)
      ? agentSharedData.dashboard.topPerformingAgents
      : []

    if (sharedTop.length) {
      return [...sharedTop]
    }

    return [...agentPerformanceMetrics.agentPerformance].map((item) => ({
      ...item,
      pipelineValue: agentPipelineValueLookup.get(item.agent) || 0,
    }))
  }, [agentPerformanceMetrics.agentPerformance, agentPipelineValueLookup, agentSharedData?.dashboard?.topPerformingAgents, isAgentRole])
  const principalExecutiveAnalytics = useMemo(() => {
    if (!isPrincipalAgentView) return null

    const safePercentChange = (current, previous) => {
      const safeCurrent = Number(current || 0)
      const safePrevious = Number(previous || 0)
      if (safePrevious <= 0) {
        if (safeCurrent <= 0) return 0
        return 100
      }
      return ((safeCurrent - safePrevious) / safePrevious) * 100
    }

    const classifyPipelineStage = (row) => {
      const mainStage = getRowMainStage(row)
      const stageText = toLookupText(row?.stage || row?.transaction?.stage || row?.transaction?.current_sub_stage_summary)
      if (mainStage === 'REG' || stageText.includes('registered') || stageText.includes('closed')) return 'closed'
      if (mainStage === 'XFER' || stageText.includes('transfer')) return 'under_offer'
      if (stageText.includes('offer') || stageText.includes('otp') || stageText.includes('negoti')) return 'negotiation'
      if (mainStage === 'ATTY' || mainStage === 'FIN') return 'qualifying'
      if (stageText.includes('qualif') || stageText.includes('viewing') || stageText.includes('valuation') || stageText.includes('mandate')) return 'qualifying'
      return 'new'
    }

    const now = new Date()
    const thisWeekRange = getPrincipalRange('this_week', now)
    const previousWeekRange = getPreviousRange(thisWeekRange)
    const thisMonthRange = getPrincipalRange('this_month', now)
    const previousMonthRange = getPreviousRange(thisMonthRange)
    const selectedRange = getPrincipalRange(principalTimeFilter, now)
    const previousSelectedRange = getPreviousRange(selectedRange)

    const transactionRows = roleScopedRows.filter((row) => row?.transaction)
    const activeRows = transactionRows.filter((row) => getRowMainStage(row) !== 'REG')
    const principalLeads = Array.isArray(principalCrmSnapshot?.leads) ? principalCrmSnapshot.leads : []
    const principalListings = Array.isArray(agentSharedData?.listings) ? agentSharedData.listings : []
    const appointments = Array.isArray(appointmentSummary?.rows) ? appointmentSummary.rows : []

    const stageCounts = { new: 0, qualifying: 0, negotiation: 0, under_offer: 0, closed: 0 }
    for (const row of transactionRows) {
      stageCounts[classifyPipelineStage(row)] += 1
    }

    const pipelineValue = activeRows.reduce((sum, row) => sum + getTransactionDealValue(row), 0)
    const opportunities = activeRows.length
    const negotiationCount = stageCounts.negotiation
    const underOfferCount = stageCounts.under_offer
    const averageDealValue = opportunities ? pipelineValue / opportunities : 0

    const activeTransactions = activeRows.length
    const awaitingDocs = activeRows.filter((row) => Number(row?.documentSummary?.missingCount || 0) > 0).length
    const inProgress = activeRows.filter((row) => {
      const main = getRowMainStage(row)
      return main === 'FIN' || main === 'ATTY'
    }).length
    const pendingTransfer = activeRows.filter((row) => getRowMainStage(row) === 'XFER').length
    const closedDeals = transactionRows.filter((row) => getRowMainStage(row) === 'REG').length

    const transferDays = transactionRows
      .filter((row) => getRowMainStage(row) === 'REG' || getRowMainStage(row) === 'XFER')
      .map((row) => {
        const start = new Date(row?.transaction?.created_at || row?.transaction?.updated_at || 0)
        const end = new Date(row?.transaction?.registered_at || row?.transaction?.completed_at || row?.transaction?.updated_at || 0)
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null
        const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)))
        return Number.isFinite(days) ? days : null
      })
      .filter((value) => Number.isFinite(value))
    const avgDaysToTransfer = transferDays.length
      ? Math.round(transferDays.reduce((sum, value) => sum + value, 0) / transferDays.length)
      : 0

    const leadsThisWeek = principalLeads.filter((lead) => isInRange(lead?.createdAt, thisWeekRange))
    const leadsPrevWeek = principalLeads.filter((lead) => isInRange(lead?.createdAt, previousWeekRange))
    const leadsCurrent = leadsThisWeek.length
    const newLeads = leadsThisWeek.length
    const contactedLeads = principalLeads.filter((lead) => {
      const stage = toLookupText(lead?.stage)
      const status = toLookupText(lead?.status)
      return stage.includes('contact') || status.includes('contact') || stage.includes('follow')
    }).length
    const qualifiedLeads = principalLeads.filter((lead) => {
      const stage = toLookupText(lead?.stage)
      return stage.includes('qualif') || stage.includes('viewing') || stage.includes('offer') || stage.includes('otp') || stage.includes('deal')
    }).length
    const scheduledViewings = appointments.filter((appointment) => {
      if (!isViewingAppointment(appointment)) return false
      const status = toLookupText(appointment?.status)
      return status !== 'cancelled' && status !== 'declined' && status !== 'failed'
    }).length
    const scheduledViewingsThisWeek = appointments.filter((appointment) => {
      if (!isViewingAppointment(appointment)) return false
      if (!isInRange(getAppointmentDateValue(appointment), thisWeekRange)) return false
      const status = toLookupText(appointment?.status)
      return status !== 'cancelled' && status !== 'declined' && status !== 'failed'
    }).length

    const sourceOrder = ['website', 'referral', 'property24', 'social']
    const sourceLabelMap = {
      website: 'Website',
      referral: 'Referrals',
      property24: 'Property24',
      social: 'Social Media',
      other: 'Other',
    }
    const sourceColorMap = {
      website: '#3b82f6',
      referral: '#22c55e',
      property24: '#f59e0b',
      social: '#8b5cf6',
      other: '#94a3b8',
    }
    const sourceCounts = new Map()
    for (const lead of principalLeads) {
      const source = toLookupText(lead?.leadSource || lead?.source)
      const key = source.includes('website')
        ? 'website'
        : source.includes('ref')
          ? 'referral'
          : source.includes('property24') || source.includes('property 24')
            ? 'property24'
            : source.includes('social') || source.includes('facebook') || source.includes('instagram')
              ? 'social'
              : 'other'
      sourceCounts.set(key, (sourceCounts.get(key) || 0) + 1)
    }
    const orderedSources = [...sourceOrder, 'other']
      .map((key) => ({
        key,
        label: sourceLabelMap[key],
        count: Number(sourceCounts.get(key) || 0),
        color: sourceColorMap[key],
      }))
      .filter((item) => item.count > 0)
    const leadSources = (orderedSources.length ? orderedSources : sourceOrder.map((key) => ({
      key,
      label: sourceLabelMap[key],
      count: 0,
      color: sourceColorMap[key],
    }))).slice(0, 4)
    const leadSourcesTotal = leadSources.reduce((sum, item) => sum + item.count, 0)
    const leadSourceGradient = (() => {
      if (!leadSourcesTotal) return 'conic-gradient(#e2e8f0 0% 100%)'
      let cursor = 0
      const stops = leadSources.map((item) => {
        const span = (item.count / leadSourcesTotal) * 100
        const start = cursor
        const end = cursor + span
        cursor = end
        return `${item.color} ${start}% ${end}%`
      })
      return `conic-gradient(${stops.join(', ')})`
    })()

    const newLeadsTrend = safePercentChange(leadsCurrent, leadsPrevWeek.length)
    const activeTransactionsTrend = safePercentChange(
      activeRows.filter((row) => isInRange(row?.transaction?.updated_at || row?.transaction?.created_at, thisMonthRange)).length,
      activeRows.filter((row) => isInRange(row?.transaction?.updated_at || row?.transaction?.created_at, previousMonthRange)).length,
    )
    const pipelineTrend = safePercentChange(
      activeRows
        .filter((row) => isInRange(row?.transaction?.updated_at || row?.transaction?.created_at, thisMonthRange))
        .reduce((sum, row) => sum + getTransactionDealValue(row), 0),
      activeRows
        .filter((row) => isInRange(row?.transaction?.updated_at || row?.transaction?.created_at, previousMonthRange))
        .reduce((sum, row) => sum + getTransactionDealValue(row), 0),
    )

    const leadToViewingConversion = leadsCurrent
      ? (scheduledViewingsThisWeek / leadsCurrent) * 100
      : 0

    const transactionSeries = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(now)
      date.setDate(now.getDate() - (6 - index))
      const dateKey = date.toISOString().slice(0, 10)
      const count = activeRows.filter((row) => {
        const value = new Date(row?.transaction?.updated_at || row?.transaction?.created_at || 0)
        if (Number.isNaN(value.getTime())) return false
        return value.toISOString().slice(0, 10) === dateKey
      }).length
      return { label: `${date.getDate()} ${date.toLocaleString('en-ZA', { month: 'short' })}`, value: count }
    })

    const metricInRange = (value, range) => isInRange(value, range)
    const currentNewListings = principalListings.filter((listing) => metricInRange(listing?.createdAt || listing?.updatedAt, selectedRange)).length
    const previousNewListings = principalListings.filter((listing) => metricInRange(listing?.createdAt || listing?.updatedAt, previousSelectedRange)).length
    const currentActiveBuyers = principalLeads.filter((lead) => resolveLeadCategory(lead?.leadCategory) === 'buyer').length
    const previousActiveBuyers = principalLeads.filter((lead) => resolveLeadCategory(lead?.leadCategory) === 'buyer' && metricInRange(lead?.createdAt, previousSelectedRange)).length
    const currentSiteVisits = appointments.filter((appointment) => metricInRange(getAppointmentDateValue(appointment), selectedRange) && isViewingAppointment(appointment)).length
    const previousSiteVisits = appointments.filter((appointment) => metricInRange(getAppointmentDateValue(appointment), previousSelectedRange) && isViewingAppointment(appointment)).length
    const currentOffers = transactionRows.filter((row) => {
      if (!metricInRange(row?.transaction?.updated_at || row?.transaction?.created_at, selectedRange)) return false
      const stage = toLookupText(row?.stage || row?.transaction?.stage)
      return stage.includes('offer') || stage.includes('otp')
    }).length
    const previousOffers = transactionRows.filter((row) => {
      if (!metricInRange(row?.transaction?.updated_at || row?.transaction?.created_at, previousSelectedRange)) return false
      const stage = toLookupText(row?.stage || row?.transaction?.stage)
      return stage.includes('offer') || stage.includes('otp')
    }).length

    const agentTransactionCounts = new Map()
    for (const row of transactionRows) {
      const agentName = String(
        row?.transaction?.assigned_agent ||
          row?.transaction?.assigned_agent_name ||
          row?.transaction?.assigned_agent_email ||
          'Unassigned',
      ).trim() || 'Unassigned'
      agentTransactionCounts.set(agentName, (agentTransactionCounts.get(agentName) || 0) + 1)
    }
    const topAgentRow = [...agentTransactionCounts.entries()]
      .sort((left, right) => right[1] - left[1])
      .map(([agent, transactionsCreated]) => ({ agent, transactionsCreated }))[0] || null
    const topSource = [...leadSources].sort((left, right) => right.count - left.count)[0] || null
    const bestStageKey = Object.entries(stageCounts).sort((left, right) => right[1] - left[1])[0]?.[0] || 'new'
    const stageLabelMap = {
      new: 'New',
      qualifying: 'Qualifying',
      negotiation: 'Negotiating',
      under_offer: 'Under Offer',
      closed: 'Closed',
    }
    const commissionSnapshot = transactionRows.reduce((sum, row) => sum + resolveAgencyCommissionAmount(row).amount, 0)
    const monthlyGoal = Math.max(250000, Math.round((pipelineValue * 0.03) / 25000) * 25000)
    const goalProgress = monthlyGoal ? Math.min(100, Math.round((commissionSnapshot / monthlyGoal) * 100)) : 0

    const recentActivity = [
      ...principalLeads.map((lead) => ({
        id: `lead-${lead?.id || lead?.leadId || Math.random()}`,
        type: 'lead',
        title: 'New lead captured',
        description: `${lead?.name || lead?.fullName || 'Prospect'} • ${lead?.leadSource || 'Source pending'}`,
        timestamp: lead?.createdAt || null,
      })),
      ...appointments.map((appointment) => ({
        id: `appointment-${appointment?.appointmentId || Math.random()}`,
        type: 'appointment',
        title: isViewingAppointment(appointment) ? 'Viewing scheduled' : 'Appointment booked',
        description: `${appointment?.title || appointment?.appointmentType || 'Client appointment'} • ${appointment?.assignedAgentName || appointment?.assignedAgentEmail || 'Agent pending'}`,
        timestamp: appointment?.dateTime || appointment?.createdAt || appointment?.updatedAt || null,
      })),
      ...transactionRows.map((row) => ({
        id: `transaction-${row?.transaction?.id || Math.random()}`,
        type: 'transaction',
        title: 'Transaction stage updated',
        description: `${row?.development?.name || 'Listing'} • ${MAIN_STAGE_LABELS[getRowMainStage(row)] || 'In progress'}`,
        timestamp: row?.transaction?.updated_at || row?.transaction?.created_at || null,
      })),
      ...principalListings.map((listing) => ({
        id: `listing-${listing?.id || listing?.listingId || Math.random()}`,
        type: 'listing',
        title: 'New opportunity added',
        description: `${listing?.title || listing?.propertyAddress || 'Listing'} • ${listing?.listingCategory || 'Private listing'}`,
        timestamp: listing?.createdAt || listing?.updatedAt || null,
      })),
    ]
      .filter((item) => item.timestamp)
      .sort((left, right) => new Date(right.timestamp || 0) - new Date(left.timestamp || 0))
      .slice(0, 6)

    return {
      pipeline: {
        value: pipelineValue,
        opportunities,
        negotiationCount,
        underOfferCount,
        trend: pipelineTrend,
        averageDealValue,
        stages: stageCounts,
      },
      transactions: {
        active: activeTransactions,
        awaitingDocs,
        inProgress,
        pendingTransfer,
        closed: closedDeals,
        trend: activeTransactionsTrend,
        avgDaysToTransfer,
        series: transactionSeries,
      },
      leads: {
        newThisWeek: newLeads,
        contacted: contactedLeads,
        scheduledViewings,
        qualified: qualifiedLeads,
        trend: newLeadsTrend,
        sources: leadSources,
        sourceGradient: leadSourceGradient,
        conversionRate: leadToViewingConversion,
        hasViewingData: appointments.length > 0,
      },
      performance: {
        metrics: [
          { key: 'new_listings', label: 'New Listings', value: currentNewListings, delta: currentNewListings - previousNewListings, tone: 'text-[#5b4fd8]' },
          { key: 'active_buyers', label: 'Active Buyers', value: currentActiveBuyers, delta: currentActiveBuyers - previousActiveBuyers, tone: 'text-[#1f6fd4]' },
          { key: 'site_visits', label: 'Site Visits', value: currentSiteVisits, delta: currentSiteVisits - previousSiteVisits, tone: 'text-[#d97706]' },
          { key: 'offers_received', label: 'Offers Received', value: currentOffers, delta: currentOffers - previousOffers, tone: 'text-[#1f9d63]' },
        ],
        topAgent: topAgentRow,
        topSource,
        bestStage: stageLabelMap[bestStageKey] || 'New',
        bestStageCount: stageCounts[bestStageKey] || 0,
        goalProgress,
        goalTarget: monthlyGoal,
      },
      recentActivity,
      hasData:
        transactionRows.length > 0 ||
        principalLeads.length > 0 ||
        principalListings.length > 0 ||
        appointments.length > 0,
    }
  }, [agentSharedData?.listings, appointmentSummary?.rows, isPrincipalAgentView, principalCrmSnapshot?.leads, principalTimeFilter, roleScopedRows])
  const principalActiveDeals = useMemo(() => {
    if (!isPrincipalAgentView) return []
    return roleScopedRows
      .filter((row) => row?.transaction && getRowMainStage(row) !== 'REG')
      .sort((left, right) => new Date(getRowUpdatedAt(right) || 0) - new Date(getRowUpdatedAt(left) || 0))
      .slice(0, 8)
      .map((row) => {
        const value = Number(row?.transaction?.purchase_price || row?.transaction?.sales_price || row?.unit?.price || 0)
        const missingDocs = Number(row?.documentSummary?.missingCount || 0)
        const staleDays = getDaysSinceRowUpdate(row)
        const blocker = missingDocs > 0 ? `${missingDocs} doc${missingDocs === 1 ? '' : 's'} missing` : staleDays >= 10 ? `${staleDays}d without update` : 'On track'
        return {
          id: row?.transaction?.id || row?.unit?.id,
          listing: `${row?.development?.name || 'Listing'} • Unit ${row?.unit?.unit_number || '-'}`,
          agent: String(
            row?.transaction?.assigned_agent ||
              row?.transaction?.assigned_agent_name ||
              row?.transaction?.agent_name ||
              'Unassigned',
          ).trim() || 'Unassigned',
          stage: MAIN_STAGE_LABELS[getRowMainStage(row)] || 'In progress',
          value: Number.isFinite(value) ? value : 0,
          nextAction: row?.transaction?.next_action || row?.transaction?.current_sub_stage_summary || 'Next action pending',
          blocker,
        }
      })
  }, [isPrincipalAgentView, roleScopedRows])
  const principalAppointmentsThisWeek = useMemo(() => {
    if (!isPrincipalAgentView) return []
    return (appointmentSummary.thisWeek || [])
      .slice(0, 8)
      .map((row) => {
        const rawStatus = String(row?.status || '').trim().toLowerCase()
        const statusLabel = formatAppointmentStatusLabel(row?.status)
        const dateLabel = [row?.date || '', row?.startTime || ''].join(' ').trim() || formatDateTime(row?.dateTime)
        const participants = Array.isArray(row?.participants) ? row.participants : []
        const clientParticipant = participants.find((participant) => {
          const roleKey = toLookupText(participant?.participantRole)
          return roleKey === 'buyer' || roleKey === 'seller' || roleKey === 'other contact'
        })
        return {
          id: row?.appointmentId || Math.random().toString(36),
          listing: row?.title || row?.appointmentType || 'Appointment',
          client: clientParticipant?.name || row?.contactId || 'Linked contact pending',
          agent: row?.assignedAgentName || row?.assignedAgentEmail || 'Unassigned',
          dateLabel,
          statusLabel,
          rawStatus,
        }
      })
  }, [appointmentSummary.thisWeek, isPrincipalAgentView])
  const agentAppointmentSummary = useMemo(() => {
    if (!isAgentRole || isPrincipalAgentView) {
      return appointmentSummary
    }
    return appointmentSummary
  }, [appointmentSummary, isAgentRole, isPrincipalAgentView])
  const principalStageAging = useMemo(
    () => (isPrincipalAgentView ? selectStageAging(roleScopedRows) : { stages: [], totalTracked: 0, maxCellCount: 0 }),
    [isPrincipalAgentView, roleScopedRows],
  )
  const _principalActivityInsights = useMemo(() => {
    if (!isPrincipalAgentView) return null

    const now = new Date()
    const selectedRange = getPrincipalRange(principalTimeFilter, now)
    const previousRange = getPreviousRange(selectedRange)
    const thisWeekRange = getPrincipalRange('this_week', now)
    const last7Range = getPrincipalRange('last_7_days', now)

    const leads = Array.isArray(principalCrmSnapshot?.leads) ? principalCrmSnapshot.leads : []
    const leadActivities = Array.isArray(principalCrmSnapshot?.leadActivities) ? principalCrmSnapshot.leadActivities : []
    const canvassingProspects = Array.isArray(principalCanvassingSnapshot?.prospects) ? principalCanvassingSnapshot.prospects : []
    const canvassingActivities = Array.isArray(principalCanvassingSnapshot?.activities) ? principalCanvassingSnapshot.activities : []
    const appointments = Array.isArray(appointmentSummary?.rows) ? appointmentSummary.rows : []
    const sellerLeads = Array.isArray(agentSharedData?.sellerLeads) ? agentSharedData.sellerLeads : []
    const listings = Array.isArray(agentSharedData?.listings) ? agentSharedData.listings : []
    const transactionRows = roleScopedRows.filter((row) => row?.transaction)

    const countActivity = (range, types = []) => {
      const normalizedTypes = new Set(types.map((value) => toLookupText(value)))
      let total = 0
      for (const row of leadActivities) {
        if (!isInRange(row?.activityDate || row?.createdAt, range)) continue
        if (normalizedTypes.has(toLookupText(row?.activityType))) total += 1
      }
      for (const row of canvassingActivities) {
        if (!isInRange(row?.activityDate || row?.createdAt, range)) continue
        if (normalizedTypes.has(toLookupText(row?.activityType))) total += 1
      }
      return total
    }

    const countLeadsCreated = (range) => leads.filter((row) => isInRange(row?.createdAt, range)).length
    const countAppointmentsBooked = (range) =>
      appointments.filter((row) => isInRange(getAppointmentDateValue(row), range)).length
    const countViewingsCompleted = (range) =>
      appointments.filter(
        (row) =>
          isInRange(getAppointmentDateValue(row), range) &&
          toLookupText(row?.appointmentType) === 'viewing' &&
          toLookupText(row?.status) === 'completed',
      ).length
    const countSellerValuations = (range) =>
      appointments.filter(
        (row) =>
          isInRange(getAppointmentDateValue(row), range) &&
          toLookupText(row?.appointmentType) === 'seller valuation',
      ).length
    const countMandateMeetings = (range) =>
      appointments.filter(
        (row) =>
          isInRange(getAppointmentDateValue(row), range) &&
          toLookupText(row?.appointmentType) === 'mandate discussion',
      ).length
    const countProspectsAdded = (range) =>
      canvassingProspects.filter((row) => isInRange(row?.createdAt, range)).length
    const countProspectsConverted = (range) =>
      canvassingProspects.filter((row) => {
        const converted =
          Boolean(String(row?.convertedLeadId || '').trim()) ||
          toLookupText(row?.status) === 'converted to lead'
        if (!converted) return false
        return isInRange(row?.updatedAt || row?.createdAt, range)
      }).length

    const compareMetric = (counter) => {
      const current = counter(selectedRange)
      const previous = counter(previousRange)
      const thisWeek = counter(thisWeekRange)
      const last7 = counter(last7Range)
      return {
        current,
        previous,
        delta: current - previous,
        thisWeek,
        last7,
        deltaVsLast7: thisWeek - last7,
      }
    }

    const metrics = {
      coldCalls: compareMetric((range) => countActivity(range, ['Call', 'Cold Call'])),
      doorKnocks: compareMetric((range) => countActivity(range, ['Door Knock'])),
      whatsApps: compareMetric((range) => countActivity(range, ['WhatsApp'])),
      emails: compareMetric((range) => countActivity(range, ['Email'])),
      followUpsCompleted: compareMetric((range) => countActivity(range, ['Follow-up'])),
      appointmentsBooked: compareMetric((range) => countAppointmentsBooked(range)),
      viewingsCompleted: compareMetric((range) => countViewingsCompleted(range)),
      sellerValuationsBooked: compareMetric((range) => countSellerValuations(range)),
      mandateMeetings: compareMetric((range) => countMandateMeetings(range)),
      leadsCreated: compareMetric((range) => countLeadsCreated(range)),
      canvassingProspectsAdded: compareMetric((range) => countProspectsAdded(range)),
      prospectsConvertedToLeads: compareMetric((range) => countProspectsConverted(range)),
    }

    const ensureAgentEntry = (map, name) => {
      const key = String(name || 'Unassigned').trim() || 'Unassigned'
      if (!map.has(key)) {
        map.set(key, {
          agent: key,
          coldCalls: 0,
          coldCallsLast7: 0,
          doorKnocks: 0,
          doorKnocksLast7: 0,
          leadsCreated: 0,
          leadsCreatedLast7: 0,
          appointmentsBooked: 0,
          appointmentsBookedLast7: 0,
          activityScore: 0,
          activityScoreLast7: 0,
          listingsCreated: 0,
          activeListings: 0,
          transactionsCreated: 0,
          registeredDeals: 0,
          commissionGenerated: 0,
        })
      }
      return map.get(key)
    }

    const agentMap = new Map()

    for (const row of leadActivities) {
      const agentEntry = ensureAgentEntry(agentMap, getActivityAgentName(row))
      const type = toLookupText(row?.activityType)
      const inCurrent = isInRange(row?.activityDate || row?.createdAt, selectedRange)
      const inLast7 = isInRange(row?.activityDate || row?.createdAt, last7Range)
      if (type === 'call' && inCurrent) agentEntry.coldCalls += 1
      if (type === 'call' && inLast7) agentEntry.coldCallsLast7 += 1
      if (type === 'door knock' && inCurrent) agentEntry.doorKnocks += 1
      if (type === 'door knock' && inLast7) agentEntry.doorKnocksLast7 += 1
      if (type === 'follow-up' && inCurrent) agentEntry.activityScore += 1
      if (type === 'follow-up' && inLast7) agentEntry.activityScoreLast7 += 1
      if (type === 'whatsapp' && inCurrent) agentEntry.activityScore += 1
      if (type === 'whatsapp' && inLast7) agentEntry.activityScoreLast7 += 1
      if (type === 'email' && inCurrent) agentEntry.activityScore += 1
      if (type === 'email' && inLast7) agentEntry.activityScoreLast7 += 1
    }

    for (const row of canvassingActivities) {
      const agentEntry = ensureAgentEntry(agentMap, getActivityAgentName(row))
      const type = toLookupText(row?.activityType)
      const inCurrent = isInRange(row?.activityDate || row?.createdAt, selectedRange)
      const inLast7 = isInRange(row?.activityDate || row?.createdAt, last7Range)
      if ((type === 'call' || type === 'cold call') && inCurrent) agentEntry.coldCalls += 1
      if ((type === 'call' || type === 'cold call') && inLast7) agentEntry.coldCallsLast7 += 1
      if (type === 'door knock' && inCurrent) agentEntry.doorKnocks += 1
      if (type === 'door knock' && inLast7) agentEntry.doorKnocksLast7 += 1
      if ((type === 'call' || type === 'cold call' || type === 'door knock' || type === 'follow-up' || type === 'whatsapp' || type === 'email') && inCurrent) {
        agentEntry.activityScore += 1
      }
      if ((type === 'call' || type === 'cold call' || type === 'door knock' || type === 'follow-up' || type === 'whatsapp' || type === 'email') && inLast7) {
        agentEntry.activityScoreLast7 += 1
      }
    }

    for (const row of leads) {
      const agentEntry = ensureAgentEntry(agentMap, row?.assignedAgentName || row?.assignedAgentEmail)
      const inCurrent = isInRange(row?.createdAt, selectedRange)
      const inLast7 = isInRange(row?.createdAt, last7Range)
      if (inCurrent) agentEntry.leadsCreated += 1
      if (inLast7) agentEntry.leadsCreatedLast7 += 1
    }

    for (const row of appointments) {
      const agentEntry = ensureAgentEntry(agentMap, row?.assignedAgentName || row?.assignedAgentEmail)
      const dateValue = getAppointmentDateValue(row)
      const inCurrent = isInRange(dateValue, selectedRange)
      const inLast7 = isInRange(dateValue, last7Range)
      if (inCurrent) agentEntry.appointmentsBooked += 1
      if (inLast7) agentEntry.appointmentsBookedLast7 += 1
      if (toLookupText(row?.appointmentType) === 'viewing' && toLookupText(row?.status) === 'completed') {
        if (inCurrent) agentEntry.activityScore += 1
        if (inLast7) agentEntry.activityScoreLast7 += 1
      }
    }

    for (const listing of listings) {
      const agentEntry = ensureAgentEntry(agentMap, listing?.assignedAgentName || listing?.agentName || listing?.agentEmail)
      const status = toLookupText(listing?.listingStatus || listing?.status)
      if (isInRange(listing?.createdAt || listing?.updatedAt, selectedRange)) {
        agentEntry.listingsCreated += 1
      }
      if (
        status.includes('active') ||
        status.includes('listing_active') ||
        status.includes('mandate_signed')
      ) {
        agentEntry.activeListings += 1
      }
    }

    for (const row of transactionRows) {
      const agentEntry = ensureAgentEntry(
        agentMap,
        row?.transaction?.assigned_agent || row?.transaction?.assigned_agent_name || row?.transaction?.assigned_agent_email,
      )
      if (isInRange(row?.transaction?.created_at || row?.transaction?.updated_at, selectedRange)) {
        agentEntry.transactionsCreated += 1
      }
      if (getRowMainStage(row) === 'REG') {
        agentEntry.registeredDeals += 1
      }
      agentEntry.commissionGenerated += resolveAgencyCommissionAmount(row).amount
    }

    const agentRows = [...agentMap.values()]
    const rankBy = (key, keyLast7) =>
      [...agentRows]
        .sort((left, right) => {
          if ((right[key] || 0) !== (left[key] || 0)) return (right[key] || 0) - (left[key] || 0)
          return String(left.agent || '').localeCompare(String(right.agent || ''))
        })
        .slice(0, 8)
        .map((row, index) => ({
          rank: index + 1,
          agent: row.agent,
          value: row[key] || 0,
          deltaVsLast7: (row[key] || 0) - (row[keyLast7] || 0),
        }))

    const conversion = {
      prospectsToLeads: {
        from: countProspectsAdded(selectedRange),
        to: countProspectsConverted(selectedRange),
      },
      sellerLeadsToMandates: {
        from: sellerLeads.length,
        to: sellerLeads.filter((lead) => {
          const stage = toLookupText(lead?.stage)
          const status = toLookupText(lead?.listingStatus)
          return stage.includes('mandate') || status.includes('mandate')
        }).length,
      },
      mandatesToListings: {
        from: sellerLeads.filter((lead) => {
          const stage = toLookupText(lead?.stage)
          const status = toLookupText(lead?.listingStatus)
          return stage.includes('mandate') || status.includes('mandate')
        }).length,
        to: listings.length,
      },
      buyerLeadsToViewings: {
        from: leads.filter((lead) => toLookupText(lead?.leadCategory) === 'buyer').length,
        to: appointments.filter((appointment) => toLookupText(appointment?.appointmentType) === 'viewing').length,
      },
      viewingsToOffers: {
        from: appointments.filter((appointment) => toLookupText(appointment?.appointmentType) === 'viewing').length,
        to: transactionRows.filter((row) => {
          const stage = toLookupText(row?.stage || row?.transaction?.stage)
          return stage.includes('otp') || stage.includes('offer') || stage.includes('fin') || stage.includes('atty') || stage.includes('xfer') || stage.includes('reg')
        }).length,
      },
      offersToTransactions: {
        from: transactionRows.filter((row) => {
          const stage = toLookupText(row?.stage || row?.transaction?.stage)
          return stage.includes('offer') || stage.includes('otp')
        }).length,
        to: transactionRows.length,
      },
      transactionsToRegistered: {
        from: transactionRows.length,
        to: transactionRows.filter((row) => getRowMainStage(row) === 'REG').length,
      },
    }

    return {
      selectedRange,
      previousRange,
      thisWeekRange,
      last7Range,
      metrics,
      rankings: {
        coldCalls: rankBy('coldCalls', 'coldCallsLast7'),
        doorKnocks: rankBy('doorKnocks', 'doorKnocksLast7'),
        leadsCreated: rankBy('leadsCreated', 'leadsCreatedLast7'),
        appointmentsBooked: rankBy('appointmentsBooked', 'appointmentsBookedLast7'),
      },
      agentComparison: [...agentRows]
        .sort((left, right) => {
          if ((right.activityScore || 0) !== (left.activityScore || 0)) return (right.activityScore || 0) - (left.activityScore || 0)
          if ((right.commissionGenerated || 0) !== (left.commissionGenerated || 0)) return (right.commissionGenerated || 0) - (left.commissionGenerated || 0)
          return String(left.agent || '').localeCompare(String(right.agent || ''))
        })
        .slice(0, 10),
      conversion,
      dataAvailability: {
        hasLeadActivities: leadActivities.length > 0,
        hasCanvassing: canvassingProspects.length > 0 || canvassingActivities.length > 0,
        hasAppointments: appointments.length > 0,
      },
    }
  }, [agentSharedData?.listings, agentSharedData?.sellerLeads, appointmentSummary?.rows, isPrincipalAgentView, principalCanvassingSnapshot?.activities, principalCanvassingSnapshot?.prospects, principalCrmSnapshot?.leadActivities, principalCrmSnapshot?.leads, principalTimeFilter, roleScopedRows])
  const AGENT_PIPELINE_ITEMS = useMemo(() => {
    if (!isAgentRole) return 0
    return agentScopedRows.filter((row) => getRowMainStage(row) !== 'REG').length
  }, [agentScopedRows, isAgentRole])
  const AGENT_FOLLOW_UPS_DUE = useMemo(() => {
    if (!isAgentRole) return 0
    return agentScopedRows.filter((row) => {
      if (getRowMainStage(row) === 'REG') return false
      const days = getDaysSinceRowUpdate(row)
      const hasNextAction = String(row?.transaction?.next_action || '').trim().length > 0
      return !hasNextAction || days >= 7
    }).length
  }, [agentScopedRows, isAgentRole])
  const sharedActivityViewPath = useMemo(() => {
    if (isAttorneyRole) return '/transactions'
    if (isBondRole) return '/applications'
    return '/units'
  }, [isAttorneyRole, isBondRole])

  const sharedDashboardData = useMemo(() => {
    const scopedRows = sharedDashboardRows.filter((row) => row?.transaction)
    const stageCounts = MAIN_PROCESS_STAGES.reduce((accumulator, stageKey) => {
      accumulator[stageKey] = 0
      return accumulator
    }, {})

    for (const row of scopedRows) {
      const stageKey = getRowMainStage(row)
      stageCounts[stageKey] = (stageCounts[stageKey] || 0) + 1
    }

    const latestRows = [...scopedRows].sort(
      (left, right) => new Date(getRowUpdatedAt(right) || 0) - new Date(getRowUpdatedAt(left) || 0),
    )

    const anchorRow = latestRows[0] || null
    const anchorMainStage = anchorRow ? getRowMainStage(anchorRow) : 'AVAIL'
    const anchorStageIndex = Math.max(MAIN_PROCESS_STAGES.indexOf(anchorMainStage), 0)
    const currentStageLabel = MAIN_STAGE_LABELS[anchorMainStage] || 'Available'
    const anchorSignal = toSignalText(anchorRow)
    const progressStages = MAIN_PROCESS_STAGES.map((stageKey, index) => ({
      key: stageKey,
      label: MAIN_STAGE_LABELS[stageKey] || stageKey,
      count: stageCounts[stageKey] || 0,
      status: index < anchorStageIndex ? 'completed' : index === anchorStageIndex ? 'active' : 'pending',
    }))

    const financeWorkflow = buildFinanceWorkflowSteps(anchorMainStage, anchorSignal)
    const transferWorkflow = buildTransferWorkflowSteps(anchorMainStage, anchorSignal)
    const blockedCount = scopedRows.filter((row) => {
      const missingDocuments = Number(row?.documentSummary?.missingCount || 0)
      const daysSinceUpdate = getDaysSinceRowUpdate(row)
      const mainStage = getRowMainStage(row)
      if (mainStage === 'REG') {
        return false
      }

      return missingDocuments > 0 || daysSinceUpdate >= 10
    }).length

    const activityItems = latestRows.slice(0, 4).map((row) => ({
      id: row?.transaction?.id || row?.unit?.id,
      unitId: row?.unit?.id || null,
      unitNumber: row?.unit?.unit_number || '-',
      title: `${row?.development?.name || 'Unknown Development'} • Unit ${row?.unit?.unit_number || '-'}`,
      stageLabel: MAIN_STAGE_LABELS[getRowMainStage(row)] || 'Unknown',
      message:
        row?.transaction?.next_action ||
        row?.transaction?.current_sub_stage_summary ||
        `Transaction is currently in ${MAIN_STAGE_LABELS[getRowMainStage(row)] || 'active'} stage.`,
      timestamp: getRowUpdatedAt(row),
    }))

    return {
      stageCounts,
      progressStages,
      anchorMainStage,
      anchorRow,
      currentStageLabel,
      blockedCount,
      financeWorkflow,
      transferWorkflow,
      activityItems,
      hasData: scopedRows.length > 0,
    }
  }, [sharedDashboardRows])

function renderActiveTransactionsBlock({
  title = 'Active Transactions',
  description = 'Live deal execution progress by unit and stage.',
  emptyText = 'No active transactions to display yet.',
  emptyActionLabel = '',
  onEmptyAction = null,
  limit,
  compact = false,
} = {}) {
  const cards = Number.isFinite(limit) ? activeTransactionCards.slice(0, limit) : activeTransactionCards
  const transactionsListPath = isBondRole ? '/applications' : '/units'
  const transactionsListQuery =
    (isAgentRole || isBondRole) && transactionScope !== 'all'
      ? `?transactionType=${encodeURIComponent(transactionScope)}`
      : ''
  const showAgentOperationalFields = isAgentRole && !isPrincipalAgentView

  const formatFinanceType = (value) => {
    const normalized = String(value || '').trim().toLowerCase()
    if (!normalized || normalized === 'unknown') return 'Unknown'
    if (normalized === 'combination') return 'Hybrid'
    return normalized.charAt(0).toUpperCase() + normalized.slice(1)
  }

  const getProgressTone = (percent) => {
    if (percent >= 80) return '#2f8a63'
    if (percent >= 60) return '#2f8696'
    if (percent >= 30) return '#3f78a8'
    return '#7e91a8'
  }

  if (isViewerRole && !loading && isSupabaseConfigured) {
    return (
      <section className="flex flex-col gap-4">
        {error ? <p className="rounded-[16px] border border-[#f3d2cc] bg-[#fef3f2] px-5 py-4 text-sm text-[#b42318]">{error}</p> : null}
        <article className="rounded-[22px] border border-[#dde4ee] bg-white px-6 py-6 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
          <h2 className="text-[1.08rem] font-semibold tracking-[-0.02em] text-[#142132]">Access Pending</h2>
          <p className="mt-2 text-sm leading-6 text-[#60758d]">
            Your organisation role is not fully resolved yet. A principal or super admin must activate your membership before operational modules are available.
          </p>
        </article>
      </section>
    )
  }

  if (isAgentRole && !loading && !organisationIdForAppointments) {
    return (
      <section className="flex flex-col gap-4">
        {error ? <p className="rounded-[16px] border border-[#f3d2cc] bg-[#fef3f2] px-5 py-4 text-sm text-[#b42318]">{error}</p> : null}
        <article className="rounded-[22px] border border-[#dde4ee] bg-white px-6 py-6 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
          <h2 className="text-[1.08rem] font-semibold tracking-[-0.02em] text-[#142132]">Organisation Setup Pending</h2>
          <p className="mt-2 text-sm leading-6 text-[#60758d]">
            You can use your dashboard shell now, but agency membership setup is still pending. Complete organisation
            setup to unlock listings, transaction assignment, and workflow visibility.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              className={DASHBOARD_ACTION_SECONDARY_CLASS}
              onClick={() => navigateWithTrace('/setup', 'dashboard-to-setup-guide')}
            >
              Open Setup Guide
            </button>
            <button
              type="button"
              className={DASHBOARD_ACTION_SECONDARY_CLASS}
              onClick={() => navigateWithTrace('/settings/organisation', 'dashboard-to-organisation-settings')}
            >
              Complete Organisation Setup
            </button>
          </div>
        </article>
      </section>
    )
  }

  return (
    <div className={`flex flex-col ${compact ? 'gap-5' : 'gap-6'}`}>
      <div className={`flex flex-col ${compact ? 'gap-3' : 'gap-4'} lg:flex-row lg:items-start lg:justify-between`}>
        <div className="min-w-0">
          <h3 className="text-[1.1rem] font-semibold tracking-[-0.025em] text-[#142132]">{title}</h3>
          <p className={`mt-2 text-[0.98rem] text-[#6b7d93] ${compact ? 'leading-6' : 'leading-7'}`}>{description}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center rounded-full border border-[#dde4ee] bg-[#f7f9fc] px-3 py-1 text-[0.78rem] font-semibold text-[#66758b]">
            {activeTransactionCards.length} active
          </span>
          <button
            type="button"
            className="inline-flex min-h-[40px] items-center justify-center rounded-[14px] border border-[#dde4ee] bg-white px-4 py-2 text-sm font-semibold text-[#162334] shadow-[0_10px_24px_rgba(15,23,42,0.06)] transition duration-150 ease-out hover:border-[#ccd6e3] hover:bg-[#f8fafc]"
            onClick={() =>
              navigateWithTrace(`${transactionsListPath}${transactionsListQuery}`, 'dashboard-to-transactions-list')
            }
          >
            View all
          </button>
        </div>
      </div>

      {cards.length ? (
        <div className="-mx-1 overflow-x-auto overflow-y-hidden px-1 pb-2">
          <div className={`flex min-w-full ${compact ? 'gap-5' : 'gap-6'}`}>
            {cards.map((item) => {
              const progressPercent = Math.max(0, Math.min(100, Number(item.progressPercent || 0)))
              const progressWidth = Math.max(progressPercent > 0 ? 6 : 0, progressPercent)
              const progressTone = getProgressTone(progressPercent)
              const statusLabel = item.stageLabel || 'Available'
              const normalizedStatusLabel = String(statusLabel || '').trim().toLowerCase()
              const displayStatusLabel =
                normalizedStatusLabel === 'available' || normalizedStatusLabel === 'unknown'
                  ? item.propertyIdentifier || `Unit ${item.unitNumber}`
                  : statusLabel
              const unitContext = [item.phaseLabel ? `Phase ${item.phaseLabel}` : null, item.blockLabel ? `Block ${item.blockLabel}` : null]
                .filter(Boolean)
                .join(' • ')
              const buyerLabel = String(item.buyerName || '').trim() || 'Buyer pending'
              const financeLabel = formatFinanceType(item.financeType)
              const updatedLabel = formatRelativeTime(item.updatedAt)
              const updatedDateTimeLabel = formatDateTime(item.updatedAt)
              const supportingSignal = !item.buyerId ? 'Buyer record pending' : `Updated ${updatedLabel}`
              const cardAction = () => {
                if (item.unitId) {
                  startRouteTransitionTrace({
                    from: location.pathname,
                    to: `/units/${item.unitId}`,
                    label: 'dashboard-to-transaction-workspace',
                  })
                  navigate(`/units/${item.unitId}`, { state: { headerTitle: `Unit ${item.unitNumber}` } })
                }
              }

              return (
                <article
                  key={item.id}
                  className="group ui-surface-card flex w-[320px] min-w-[320px] flex-col overflow-hidden transition duration-200 ease-out hover:-translate-y-px hover:border-borderStrong hover:shadow-floating"
                  onClick={cardAction}
                  onKeyDown={(event) => {
                    if ((event.key === 'Enter' || event.key === ' ') && item.unitId) {
                      event.preventDefault()
                      cardAction()
                    }
                  }}
                  role={item.unitId ? 'button' : undefined}
                  tabIndex={item.unitId ? 0 : -1}
                >
                  <header className="border-b border-[#dbe6f2] bg-[linear-gradient(135deg,#f1f6fb_0%,#ecf2f9_100%)] px-5 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <strong className="block overflow-hidden text-ellipsis whitespace-nowrap text-[0.86rem] font-medium tracking-[-0.005em] text-[#49647f]">
                          {item.developmentName}
                        </strong>
                        {unitContext ? <p className="mt-1 overflow-hidden text-ellipsis whitespace-nowrap text-[0.74rem] text-[#71869d]">{unitContext}</p> : null}
                      </div>
                      <span className="inline-flex shrink-0 items-center rounded-full border border-[#cddced] bg-white/92 px-2.5 py-1 text-[0.76rem] font-semibold text-[#2f4f6f]">
                        Unit {item.unitNumber}
                      </span>
                    </div>
                  </header>

                  <div className="flex flex-col gap-3.5 px-5 py-3.5">
                    <section className="min-w-0">
                      <div className="flex items-center gap-2.5">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: progressTone }}
                          aria-hidden
                        />
                        <strong
                          title={displayStatusLabel}
                          className="overflow-hidden text-ellipsis whitespace-nowrap text-[1.02rem] font-semibold tracking-[-0.02em] text-[#142132]"
                        >
                          {displayStatusLabel}
                        </strong>
                      </div>
                      <p className="mt-1 overflow-hidden text-ellipsis whitespace-nowrap text-[0.79rem] text-[#6c8096]">
                        {supportingSignal}
                      </p>
                    </section>

                    <section className="flex min-h-[56px] flex-col items-start justify-center gap-1.5">
                      <p
                        title={buyerLabel}
                        className="min-w-0 max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-[0.86rem] font-medium text-[#2f465e]"
                      >
                        {buyerLabel}
                      </p>
                      <span className="inline-flex shrink-0 items-center rounded-full border border-[#d6e1ee] bg-white px-2.5 py-1 text-[0.72rem] font-semibold uppercase tracking-[0.06em] text-[#5b7189]">
                        {financeLabel}
                      </span>
                    </section>

                    {showAgentOperationalFields ? (
                      <section className="grid gap-2 sm:grid-cols-2">
                        <div className="rounded-[11px] border border-[#e2eaf4] bg-white px-3 py-2.5 text-left">
                          <p className="text-[0.66rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Deal Value</p>
                          <p className="mt-1 truncate text-[0.82rem] font-semibold text-[#22374d]">{currency.format(Number(item.dealValue || 0))}</p>
                        </div>
                        <div className="rounded-[11px] border border-[#e2eaf4] bg-white px-3 py-2.5 text-left">
                          <p className="text-[0.66rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Last Updated</p>
                          <p className="mt-1 truncate text-[0.82rem] font-semibold text-[#22374d]" title={updatedDateTimeLabel}>{updatedLabel}</p>
                        </div>
                      </section>
                    ) : null}

                    {showAgentOperationalFields ? (
                      <section className="rounded-[11px] border border-[#e2eaf4] bg-white px-3 py-2.5 text-left">
                        <p className="text-[0.66rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Next Required Action</p>
                        <p className="mt-1 line-clamp-2 text-[0.82rem] leading-5 font-medium text-[#35546c]">{item.nextAction || 'No next action set'}</p>
                      </section>
                    ) : null}

                    <section className="rounded-surface-sm border border-[#e1e9f3] bg-[#fafcfe] px-4 py-2.5">
                      <div className="mb-1.5 flex items-center justify-between gap-3">
                        <span className="text-[0.76rem] font-semibold uppercase tracking-[0.08em] text-[#7b8fa6]">Progress</span>
                        <strong className="text-[0.95rem] font-semibold text-[#162334]">{Math.round(progressPercent)}%</strong>
                      </div>
                      <div className="h-1.5 rounded-full bg-[#dfe7f1]" aria-hidden>
                        <span
                          className="block h-full rounded-full transition-all duration-200 ease-out"
                          style={{ width: `${progressWidth}%`, backgroundColor: progressTone }}
                        />
                      </div>
                    </section>

                    <footer className="flex items-center justify-start pt-0.5">
                      <span className="inline-flex items-center gap-1 text-[0.88rem] font-semibold text-primary transition duration-150 ease-out group-hover:gap-1.5">
                        View Transaction <ArrowRight size={15} />
                      </span>
                    </footer>
                  </div>
                </article>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="rounded-[20px] border border-dashed border-[#d8e2ee] bg-white px-6 py-10 text-center">
          <h4 className="text-[1rem] font-semibold tracking-[-0.02em] text-[#1d3146]">No transactions assigned yet</h4>
          <p className="mt-2 text-sm leading-6 text-[#6b7d93]">{emptyText}</p>
          {emptyActionLabel && typeof onEmptyAction === 'function' ? (
            <button
              type="button"
              className="mt-4 inline-flex min-h-[40px] items-center justify-center rounded-[14px] border border-transparent bg-[#35546c] px-4 py-2 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(15,23,42,0.06)] transition duration-150 ease-out hover:bg-[#2e475c]"
              onClick={onEmptyAction}
            >
              {emptyActionLabel}
            </button>
          ) : null}
          <p className="mt-2 text-xs text-[#8a9bb0]">Once a transaction is opened or assigned, it will appear here automatically.</p>
        </div>
      )}
    </div>
  )
}

  function RENDER_SHARED_TRANSACTION_SECTION() {
    const selectedWorkflow = activeWorkflowTab === 'transfer' ? sharedDashboardData.transferWorkflow : sharedDashboardData.financeWorkflow
    const selectedWorkflowTitle = activeWorkflowTab === 'transfer' ? 'Transfer Workflow' : 'Finance Workflow'
    const selectedWorkflowDescription =
      activeWorkflowTab === 'transfer'
        ? 'Attorney transfer preparation, guarantees, and pre-lodgement progression.'
        : 'Bond/funding progression from intake to approval and grant readiness.'
    const selectedWorkflowCompleted = selectedWorkflow.filter((step) => step.status === 'completed').length

    return (
      <section className={`mt-10 ${DASHBOARD_PANEL_CLASS}`}>
        <div className="grid gap-8 xl:grid-cols-[minmax(0,1.18fr)_minmax(320px,0.82fr)]">
          <article className="rounded-[20px] border border-[#e3eaf3] bg-[#fbfcfe] p-6">
            <div className="flex flex-col gap-4">
              <div className="min-w-0">
                <h3 className="text-[1.1rem] font-semibold tracking-[-0.025em] text-[#142132]">Shared Transaction State</h3>
                <p className="mt-2 text-[0.98rem] leading-7 text-[#6b7d93]">Unified lifecycle state that stays consistent across all personas.</p>
              </div>

              <div className="flex flex-wrap gap-2">
                <span className={DASHBOARD_CHIP_CLASS}>Tracked {sharedDashboardRows.length}</span>
                <span className={DASHBOARD_CHIP_CLASS}>Current {sharedDashboardData.currentStageLabel}</span>
                <span className={DASHBOARD_CHIP_CLASS}>Blocked {sharedDashboardData.blockedCount}</span>
              </div>
            </div>

            {sharedDashboardData.hasData ? (
              <ol className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Shared transaction lifecycle">
                {sharedDashboardData.progressStages.map((item) => {
                  const toneClass =
                    item.status === 'completed'
                      ? 'border-[#d6ece0] bg-[#edfdf3] text-[#1c7d45]'
                      : item.status === 'active'
                        ? 'border-[#cfe1f7] bg-[#eff6ff] text-[#35546c]'
                        : 'border-[#dde4ee] bg-white text-[#6b7d93]'

                  return (
                    <li key={item.key} className={`rounded-[18px] border px-4 py-4 ${toneClass}`}>
                      <div className="mb-3 inline-flex h-7 w-7 items-center justify-center rounded-full border border-current/20 bg-white/70 text-[0.78rem] font-semibold" aria-hidden>
                        {item.status === 'completed' ? '✓' : item.status === 'active' ? '●' : '○'}
                      </div>
                      <strong className="block text-[0.95rem] font-semibold tracking-[-0.02em]">{item.label}</strong>
                      <small className="mt-2 block text-[0.82rem] font-medium opacity-80">{item.count} matters</small>
                    </li>
                  )
                })}
              </ol>
            ) : (
              <p className="mt-6 rounded-[18px] border border-dashed border-[#d8e2ee] bg-white px-5 py-6 text-sm text-[#6b7d93]">
                No transactions are active yet for this persona scope.
              </p>
            )}
          </article>

          <aside className="rounded-[20px] border border-[#e3eaf3] bg-[#fbfcfe] p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <h3 className="text-[1.1rem] font-semibold tracking-[-0.025em] text-[#142132]">Transaction Activity</h3>
                <p className="mt-2 text-[0.98rem] leading-7 text-[#6b7d93]">Live cross-workflow movement from the shared event stream.</p>
              </div>
              <button
                type="button"
                className="inline-flex min-h-[40px] items-center justify-center rounded-[14px] border border-[#dde4ee] bg-white px-4 py-2 text-sm font-semibold text-[#162334] shadow-[0_10px_24px_rgba(15,23,42,0.06)] transition duration-150 ease-out hover:border-[#ccd6e3] hover:bg-[#f8fafc]"
                onClick={() => navigateWithTrace(sharedActivityViewPath, 'dashboard-to-transactions-list')}
              >
                View all
              </button>
            </div>

            {sharedDashboardData.activityItems.length ? (
              <ul className="mt-6 flex flex-col gap-4">
                {sharedDashboardData.activityItems.map((item) => (
                  <li
                    key={item.id}
                    className="flex gap-4 rounded-[18px] border border-[#e3eaf3] bg-white px-4 py-4 transition duration-150 ease-out hover:border-[#d1dbe8] hover:bg-[#fbfdff]"
                    onClick={() => {
                      if (item.unitId) {
                        startRouteTransitionTrace({
                          from: location.pathname,
                          to: `/units/${item.unitId}`,
                          label: 'dashboard-to-transaction-workspace',
                        })
                        navigate(`/units/${item.unitId}`, { state: { headerTitle: `Unit ${item.unitNumber}` } })
                      }
                    }}
                    onKeyDown={(event) => {
                      if ((event.key === 'Enter' || event.key === ' ') && item.unitId) {
                        event.preventDefault()
                        startRouteTransitionTrace({
                          from: location.pathname,
                          to: `/units/${item.unitId}`,
                          label: 'dashboard-to-transaction-workspace',
                        })
                        navigate(`/units/${item.unitId}`, { state: { headerTitle: `Unit ${item.unitNumber}` } })
                      }
                    }}
                    role={item.unitId ? 'button' : undefined}
                    tabIndex={item.unitId ? 0 : -1}
                  >
                    <span className="mt-1 inline-flex h-2.5 w-2.5 flex-none rounded-full bg-[#7fa7cc]" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                        <strong className="text-[0.96rem] font-semibold tracking-[-0.02em] text-[#142132]">{item.title}</strong>
                        <span className={DASHBOARD_CHIP_CLASS}>{item.stageLabel}</span>
                      </div>
                      <p className="mt-2 text-[0.92rem] leading-6 text-[#51657b]">{item.message}</p>
                      <small className="mt-2 block text-[0.78rem] font-medium text-[#7b8ca2]">{formatRelativeTime(item.timestamp)}</small>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-6 rounded-[18px] border border-dashed border-[#d8e2ee] bg-white px-5 py-6 text-sm text-[#6b7d93]">
                No activity yet for this dashboard scope.
              </p>
            )}
          </aside>
        </div>

        {canViewOperationalWorkflows ? (
          <article className="mt-8 rounded-[20px] border border-[#e3eaf3] bg-[#fbfcfe] p-6">
            <div className="min-w-0">
              <h3 className="text-[1.1rem] font-semibold tracking-[-0.025em] text-[#142132]">Operational Workflows</h3>
              <p className="mt-2 text-[0.98rem] leading-7 text-[#6b7d93]">{selectedWorkflowDescription}</p>
            </div>

            <div className="mt-5 inline-flex items-center rounded-[14px] border border-[#dde4ee] bg-white p-1 shadow-[0_10px_24px_rgba(15,23,42,0.06)]" role="tablist" aria-label="Workflow tabs">
              <button
                type="button"
                role="tab"
                aria-selected={activeWorkflowTab === 'finance'}
                className={`inline-flex min-h-[34px] items-center rounded-[10px] px-3 text-sm font-semibold transition duration-150 ease-out ${
                  activeWorkflowTab === 'finance' ? 'bg-[#35546c] text-white' : 'text-[#5b7087] hover:bg-[#f8fafc]'
                }`}
                onClick={() => setActiveWorkflowTab('finance')}
              >
                Finance
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeWorkflowTab === 'transfer'}
                className={`inline-flex min-h-[34px] items-center rounded-[10px] px-3 text-sm font-semibold transition duration-150 ease-out ${
                  activeWorkflowTab === 'transfer' ? 'bg-[#35546c] text-white' : 'text-[#5b7087] hover:bg-[#f8fafc]'
                }`}
                onClick={() => setActiveWorkflowTab('transfer')}
              >
                Transfer
              </button>
            </div>

            <div className="mt-6 rounded-[18px] border border-[#e3eaf3] bg-white p-5">
              <header className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                <h4 className="text-[1rem] font-semibold tracking-[-0.02em] text-[#142132]">{selectedWorkflowTitle}</h4>
                <span className={DASHBOARD_CHIP_CLASS}>
                  {selectedWorkflowCompleted}/{selectedWorkflow.length} completed
                </span>
              </header>
              <ol className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {selectedWorkflow.map((step) => (
                  <li
                    key={`${activeWorkflowTab}-${step.label}`}
                    className={`flex items-center gap-3 rounded-[14px] border px-4 py-3 ${
                      step.status === 'completed'
                        ? 'border-[#d6ece0] bg-[#edfdf3] text-[#1c7d45]'
                        : step.status === 'active'
                          ? 'border-[#cfe1f7] bg-[#eff6ff] text-[#35546c]'
                          : 'border-[#dde4ee] bg-[#fbfcfe] text-[#66758b]'
                    }`}
                  >
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-current/20 bg-white/70 text-[0.78rem] font-semibold" aria-hidden>
                      {step.status === 'completed' ? '✓' : step.status === 'active' ? '●' : '○'}
                    </span>
                    <p className="text-[0.9rem] font-medium tracking-[-0.01em]">{step.label}</p>
                  </li>
                ))}
              </ol>
            </div>
          </article>
        ) : null}
      </section>
    )
  }

  return (
    <section className="flex flex-col">
      {!isSupabaseConfigured ? (
        <p className="rounded-[16px] border border-[#f3d2cc] bg-[#fef3f2] px-5 py-4 text-sm text-[#b42318]">
          Supabase is not configured. Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_KEY</code> in
          <code> .env</code>.
        </p>
      ) : null}

      {error ? <p className="rounded-[16px] border border-[#f3d2cc] bg-[#fef3f2] px-5 py-4 text-sm text-[#b42318]">{error}</p> : null}
      {loading ? <LoadingSkeleton lines={8} className="rounded-[22px] border border-[#dde4ee] bg-white shadow-[0_12px_28px_rgba(15,23,42,0.06)]" /> : null}

      {!loading && isSupabaseConfigured ? (
        <>
          {!isRoleScopedDashboard ? (
            <section className="rounded-[22px] border border-[#dde4ee] bg-white px-4 py-4 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
              <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    className={DASHBOARD_ACTION_PRIMARY_CLASS}
                    onClick={() => window.dispatchEvent(new Event('itg:open-new-development'))}
                  >
                    + New Development
                  </button>
                  <button
                    type="button"
                    className={DASHBOARD_ACTION_PRIMARY_CLASS}
                    onClick={() => window.dispatchEvent(new Event('itg:open-new-transaction'))}
                  >
                    + New Transaction
                  </button>
                </div>

                <div className="flex min-w-0 flex-col gap-2 xl:flex-1 xl:flex-row xl:items-center xl:justify-end">
                  <div className={`${DASHBOARD_FIELD_CLASS} min-w-[220px] max-w-[280px]`}>
                    <span className="text-[0.78rem] font-semibold uppercase tracking-[0.08em] text-[#6b7d93]">View</span>
                    <select
                      className="min-w-0 flex-1 appearance-none border-0 bg-transparent p-0 text-sm font-semibold text-[#162334] outline-none"
                      value={role}
                      onChange={(event) => {
                        setActivePersona(event.target.value)
                        navigate('/dashboard')
                      }}
                    >
                      {personaOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    {rolePreviewActive ? <em className="text-[0.74rem] font-semibold not-italic text-[#2563eb]">Preview</em> : null}
                  </div>

                  <div className={`${DASHBOARD_FIELD_CLASS} min-w-0 flex-1 xl:max-w-[500px]`}>
                    <Search size={16} className="shrink-0 text-slate-400" />
                    <input
                      className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm text-[#162334] outline-none"
                      type="search"
                      placeholder="Search unit, buyer, stage..."
                    />
                  </div>
                </div>
              </div>
            </section>
          ) : null}

          {!isAgentRole && !isAttorneyRole && !isBondRole && isRoleScopedDashboard ? (
            <section className={`mt-10 ${DASHBOARD_PANEL_CLASS}`}>
              <div>
                <SummaryCards items={topSummaryItems} />
              </div>
            </section>
          ) : null}

          {isBondRole ? (
            <section className={`mt-6 ${DASHBOARD_PANEL_CLASS}`}>
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <h3 className="text-[1.02rem] font-semibold tracking-[-0.02em] text-[#142132]">Transaction Scope</h3>
                  <p className="mt-1 text-[0.92rem] text-[#6b7d93]">Filter dashboard transactions between all, developments, and private matters.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2.5">
                  <PillToggle
                    items={TRANSACTION_SCOPE_OPTIONS.map((item) => ({ key: item.key, label: item.label }))}
                    value={transactionScope}
                    onChange={setTransactionScope}
                  />
                  <span className={DASHBOARD_CHIP_CLASS}>{roleScopedRows.length} records</span>
                </div>
              </div>
            </section>
          ) : null}

          {isAgentRole ? (
            <>
              <section className={`mt-6 ${DASHBOARD_PANEL_CLASS}`}>
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0">
                    <h3 className="text-[1.02rem] font-semibold tracking-[-0.02em] text-[#142132]">
                      {isPrincipalAgentView ? 'Principal Workspace' : 'Agent Workspace'}
                    </h3>
                    <p className="mt-1 text-[0.9rem] text-[#6b7d93]">
                      {isPrincipalAgentView
                        ? 'Organisation-wide visibility across branches, agents, and transaction performance.'
                        : 'Personal execution workspace focused on your assigned pipeline and transactions.'}
                    </p>
                  </div>
                  <span className={DASHBOARD_CHIP_CLASS}>
                    {isPrincipalAgentView ? 'Principal / Owner View' : 'Assigned Agent View'}
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <label className="text-[0.75rem] font-semibold uppercase tracking-[0.08em] text-[#6b7d93]">Agent View</label>
                  <select
                    className="min-h-[36px] min-w-[210px] rounded-[10px] border border-[#d8e3ef] bg-white px-3 py-1.5 text-sm font-semibold text-[#35546c]"
                    value={agentViewOverride}
                    onChange={(event) => setAgentViewOverride(event.target.value)}
                  >
                    <option value="auto">Auto ({principalFromMembership ? 'Principal' : 'Agent'})</option>
                    {canPreviewPrincipalAgentView ? <option value="principal">Principal / Owner</option> : null}
                    <option value="agent">Assigned Agent</option>
                  </select>
                </div>
              </section>

              <section className={`mt-6 ${DASHBOARD_PANEL_CLASS}`}>
                {isPrincipalAgentView ? (
                  principalExecutiveAnalytics ? (
                    <div className="grid gap-5 xl:grid-cols-12">
                      <article className="relative overflow-hidden rounded-[28px] bg-[#101d2c] p-5 text-white shadow-[0_28px_70px_rgba(16,29,44,0.24)] sm:p-6 xl:col-span-6">
                        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(118,160,205,0.26),transparent_34%),linear-gradient(145deg,rgba(255,255,255,0.08),transparent_44%)]" />
                        <div className="relative z-10 flex h-full flex-col">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="inline-flex h-11 w-11 items-center justify-center rounded-[16px] border border-white/10 bg-white/10 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]">
                              <PieChart size={20} />
                            </div>
                            <PrincipalTrendBadge value={principalExecutiveAnalytics.pipeline.trend} label="vs last month" />
                          </div>
                          <p className="mt-5 text-[0.76rem] font-semibold uppercase tracking-[0.16em] text-white/58">Business Health</p>
                          <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                            <div>
                              <p className="text-[3rem] font-semibold leading-none tracking-[-0.065em] text-white tabular-nums sm:text-[3.6rem]">
                                {formatKpiCurrency(principalExecutiveAnalytics.pipeline.value)}
                              </p>
                              <p className="mt-3 text-[0.96rem] font-medium text-white/66">Portfolio pipeline value across active opportunities</p>
                            </div>
                            <div className="rounded-full border border-white/10 bg-white/10 px-4 py-2 text-sm font-semibold text-white/82">
                              {principalExecutiveAnalytics.pipeline.opportunities} active opportunities
                            </div>
                          </div>
                          <div className="mt-6">
                            <PrincipalStageMix stages={principalExecutiveAnalytics.pipeline.stages} />
                          </div>
                          <div className="mt-5 grid gap-3 sm:grid-cols-3">
                            <div className="rounded-[18px] border border-white/10 bg-white/[0.07] px-4 py-3">
                              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-white/48">Negotiating</p>
                              <p className="mt-2 text-2xl font-semibold tabular-nums">{principalExecutiveAnalytics.pipeline.negotiationCount}</p>
                            </div>
                            <div className="rounded-[18px] border border-white/10 bg-white/[0.07] px-4 py-3">
                              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-white/48">Under Offer</p>
                              <p className="mt-2 text-2xl font-semibold tabular-nums">{principalExecutiveAnalytics.pipeline.underOfferCount}</p>
                            </div>
                            <div className="rounded-[18px] border border-white/10 bg-white/[0.07] px-4 py-3">
                              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-white/48">Avg Deal</p>
                              <p className="mt-2 text-2xl font-semibold tracking-[-0.04em] tabular-nums">{formatKpiCurrency(principalExecutiveAnalytics.pipeline.averageDealValue)}</p>
                            </div>
                          </div>
                        </div>
                      </article>

                      <article className="rounded-[28px] border border-[#dfe8f1] bg-[linear-gradient(145deg,#ffffff_0%,#f8fbfe_100%)] p-5 shadow-[0_22px_55px_rgba(24,45,68,0.09)] transition duration-200 hover:-translate-y-0.5 sm:p-6 xl:col-span-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="inline-flex h-11 w-11 items-center justify-center rounded-[16px] bg-[#edf5ff] text-[#275d98]">
                            <ArrowRightLeft size={19} />
                          </div>
                          <PrincipalTrendBadge value={principalExecutiveAnalytics.transactions.trend} label="vs last month" />
                        </div>
                        <p className="mt-5 text-[0.74rem] font-semibold uppercase tracking-[0.15em] text-[#74869a]">Transaction Activity</p>
                        <p className="mt-3 text-[3rem] font-semibold leading-none tracking-[-0.065em] text-[#132236] tabular-nums">
                          {principalExecutiveAnalytics.transactions.active}
                        </p>
                        <p className="mt-2 text-[0.92rem] font-medium text-[#60758b]">Active transactions in motion</p>
                        <div className="mt-5 rounded-[20px] border border-[#e4edf6] bg-white px-4 py-3">
                          <PrincipalSparkline points={principalExecutiveAnalytics.transactions.series} stroke="#2d6ea8" />
                        </div>
                        <div className="mt-4 grid grid-cols-2 gap-3">
                          <PrincipalMetricTile label="Docs" value={principalExecutiveAnalytics.transactions.awaitingDocs} tone="blue" />
                          <PrincipalMetricTile label="Signing" value={principalExecutiveAnalytics.transactions.inProgress} tone="navy" />
                          <PrincipalMetricTile label="Transfer" value={principalExecutiveAnalytics.transactions.pendingTransfer} tone="gold" />
                          <PrincipalMetricTile label="Closed" value={principalExecutiveAnalytics.transactions.closed} tone="green" />
                        </div>
                        <div className="mt-5 flex items-center justify-between rounded-[18px] border border-[#e4edf6] bg-white px-4 py-3">
                          <span className="text-[0.82rem] font-semibold text-[#6d8096]">Avg. days to transfer</span>
                          <span className="text-[1.2rem] font-semibold text-[#275d98] tabular-nums">{principalExecutiveAnalytics.transactions.avgDaysToTransfer} days</span>
                        </div>
                      </article>

                      <article className="rounded-[28px] border border-[#dfe8f1] bg-[linear-gradient(145deg,#ffffff_0%,#f8fbfe_100%)] p-5 shadow-[0_22px_55px_rgba(24,45,68,0.09)] transition duration-200 hover:-translate-y-0.5 sm:p-6 xl:col-span-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="inline-flex h-11 w-11 items-center justify-center rounded-[16px] bg-[#eefbf3] text-[#27784f]">
                            <Users size={19} />
                          </div>
                          <PrincipalTrendBadge value={principalExecutiveAnalytics.leads.trend} label="vs last week" />
                        </div>
                        <p className="mt-5 text-[0.74rem] font-semibold uppercase tracking-[0.15em] text-[#74869a]">Lead Intelligence</p>
                        <div className="mt-3 flex items-end justify-between gap-3">
                          <div>
                            <p className="text-[3rem] font-semibold leading-none tracking-[-0.065em] text-[#132236] tabular-nums">
                              {principalExecutiveAnalytics.leads.newThisWeek}
                            </p>
                            <p className="mt-2 text-[0.92rem] font-medium text-[#60758b]">New leads this week</p>
                          </div>
                          <div className="grid h-[96px] w-[96px] shrink-0 place-items-center rounded-full border border-[#dde8f3]" style={{ background: principalExecutiveAnalytics.leads.sourceGradient }}>
                            <div className="grid h-[62px] w-[62px] place-items-center rounded-full border border-[#dde8f3] bg-white text-[0.82rem] font-semibold text-[#27784f]">
                              {formatPercent(principalExecutiveAnalytics.leads.conversionRate)}
                            </div>
                          </div>
                        </div>
                        <div className="mt-5">
                          <PrincipalLeadSources sources={principalExecutiveAnalytics.leads.sources} />
                        </div>
                        <div className="mt-4 grid grid-cols-3 gap-3">
                          <PrincipalMetricTile label="Contacted" value={principalExecutiveAnalytics.leads.contacted} tone="blue" />
                          <PrincipalMetricTile label="Viewings" value={principalExecutiveAnalytics.leads.scheduledViewings} tone="gold" />
                          <PrincipalMetricTile label="Qualified" value={principalExecutiveAnalytics.leads.qualified} tone="green" />
                        </div>
                        {!principalExecutiveAnalytics.leads.hasViewingData ? (
                          <p className="mt-4 rounded-[16px] border border-[#e4edf6] bg-white px-4 py-3 text-[0.78rem] font-medium text-[#6d8096]">
                            Viewing conversion will populate once appointment data is captured.
                          </p>
                        ) : null}
                      </article>
                    </div>
                  ) : null
                ) : (
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                    {agentTopKpiItems.map((item) => {
                      const Icon = item.icon
                      return (
                        <article
                          key={item.key}
                          className="group relative flex min-h-[140px] flex-col overflow-hidden rounded-[18px] border border-[#dfe7ef] bg-[linear-gradient(165deg,#ffffff_0%,#fbfcfd_68%,#f7f9fb_100%)] px-5 py-4 shadow-[0_8px_22px_rgba(18,33,50,0.055)] transition duration-200 ease-out hover:-translate-y-[1px] hover:border-[#cbd8e4] hover:shadow-[0_16px_30px_rgba(18,33,50,0.1)]"
                        >
                          <span className="pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-[linear-gradient(90deg,#163247_0%,#2d6f64_54%,#35d394_100%)] opacity-90" />
                          <div className="flex items-start justify-between gap-3">
                            <p className="text-[0.76rem] font-semibold uppercase tracking-[0.08em] text-[#6e8298]">{item.label}</p>
                            {Icon ? (
                              <span className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] border border-[#dce5ed] bg-white text-[#24465d] shadow-[0_7px_16px_rgba(18,33,50,0.07)]">
                                <Icon size={15} />
                              </span>
                            ) : null}
                          </div>

                          <div className="mt-3 flex-1">
                            <p className={`font-semibold tracking-[-0.045em] text-[#102236] tabular-nums ${item.valueClassName || 'text-[2.1rem] leading-none md:text-[2.35rem]'}`}>
                              {item.value}
                            </p>
                            {item.valueDetail ? (
                              <p className="mt-1 text-[0.75rem] font-semibold uppercase tracking-[0.07em] text-[#6a8098]">
                                {item.valueDetail}
                              </p>
                            ) : null}
                          </div>

                          {item.context ? (
                            <p className="mt-2 text-[0.78rem] font-medium text-[#5b7087]">
                              {item.context}
                            </p>
                          ) : null}
                        </article>
                      )
                    })}
                  </div>
                )}
              </section>

              {isPrincipalAgentView ? (
                <section className={`mt-6 ${DASHBOARD_PANEL_CLASS}`}>
                  {principalExecutiveAnalytics ? (
                    <div className="grid items-stretch gap-4 xl:grid-cols-[1.7fr_1fr]">
                      <article className="flex h-full min-h-[430px] flex-col rounded-[18px] border border-[#dce6f2] bg-[#fbfdff] p-5">
                        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div className="min-w-0">
                            <h3 className="text-[1.06rem] font-semibold tracking-[-0.02em] text-[#142132]">Performance Overview</h3>
                            <p className="mt-1 text-[0.88rem] text-[#6b7d93]">Agency execution across listings, buyers, visits, and offers.</p>
                          </div>
                          <div className="flex min-w-0 max-w-full flex-nowrap items-center gap-1.5 overflow-x-auto pb-1 lg:shrink-0">
                            <PillToggle
                              items={PRINCIPAL_TIME_FILTER_OPTIONS.map((option) => ({ key: option.key, label: option.label }))}
                              value={principalTimeFilter}
                              onChange={setPrincipalTimeFilter}
                              className="!flex-nowrap !gap-1.5 [&_.ui-pill-button]:min-h-[34px] [&_.ui-pill-button]:whitespace-nowrap [&_.ui-pill-button]:px-3 [&_.ui-pill-button]:py-1.5 [&_.ui-pill-button]:text-[0.78rem]"
                            />
                            <button
                              type="button"
                              className="inline-flex min-h-[34px] shrink-0 items-center justify-center whitespace-nowrap rounded-full border border-[#d8e3ef] bg-white px-3 py-1.5 text-[0.78rem] font-semibold text-[#28455f] shadow-[0_6px_16px_rgba(18,33,50,0.05)] transition hover:border-[#c8d6e5]"
                              onClick={() => navigate('/agency/analytics')}
                            >
                              Open Analytics
                            </button>
                          </div>
                        </div>

                        <div className="grid flex-1 auto-rows-fr gap-3 sm:grid-cols-2 xl:grid-cols-4">
                          {principalExecutiveAnalytics.performance.metrics.map((metric) => (
                            <article key={metric.key} className="flex min-h-[128px] flex-col justify-between rounded-[14px] border border-[#e1eaf4] bg-white px-4 py-3">
                              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">{metric.label}</p>
                              <p className="mt-1 text-[1.62rem] font-semibold tracking-[-0.03em] text-[#142132] tabular-nums">{metric.value}</p>
                              <p className="mt-1 text-[0.78rem] font-medium text-[#6b7d93]">
                                <span className={`font-semibold ${metric.delta >= 0 ? 'text-[#2f8a63]' : 'text-[#b54645]'}`}>
                                  {metric.delta >= 0 ? '↑' : '↓'} {formatPercent(Math.abs(metric.delta))}
                                </span>
                                <span className="ml-1">vs previous period</span>
                              </p>
                            </article>
                          ))}
                        </div>

                        <div className="mt-4 grid auto-rows-fr gap-3 md:grid-cols-2 xl:grid-cols-4">
                          <div className="rounded-[14px] border border-[#e1eaf4] bg-white px-4 py-3">
                            <p className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Top Agent</p>
                            <p className="mt-1 truncate text-[0.95rem] font-semibold text-[#22374d]">
                              {principalExecutiveAnalytics.performance.topAgent?.agent || 'No activity yet'}
                            </p>
                            <p className="mt-1 text-[0.78rem] text-[#6b7d93]">
                              {(principalExecutiveAnalytics.performance.topAgent?.transactionsCreated || 0)} transactions
                            </p>
                          </div>
                          <div className="rounded-[14px] border border-[#e1eaf4] bg-white px-4 py-3">
                            <p className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Top Source</p>
                            <p className="mt-1 truncate text-[0.95rem] font-semibold text-[#22374d]">
                              {principalExecutiveAnalytics.performance.topSource?.label || 'No source data'}
                            </p>
                            <p className="mt-1 text-[0.78rem] text-[#6b7d93]">
                              {(principalExecutiveAnalytics.performance.topSource?.count || 0)} leads
                            </p>
                          </div>
                          <div className="rounded-[14px] border border-[#e1eaf4] bg-white px-4 py-3">
                            <p className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Best Performing Stage</p>
                            <p className="mt-1 text-[0.95rem] font-semibold text-[#22374d]">{principalExecutiveAnalytics.performance.bestStage}</p>
                            <p className="mt-1 text-[0.78rem] text-[#6b7d93]">
                              {principalExecutiveAnalytics.performance.bestStageCount} active items
                            </p>
                          </div>
                          <div className="rounded-[14px] border border-[#e1eaf4] bg-white px-4 py-3">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Goal Progress</p>
                                <p className="mt-1 text-[0.95rem] font-semibold text-[#22374d]">{principalExecutiveAnalytics.performance.goalProgress}%</p>
                                <p className="mt-1 text-[0.78rem] text-[#6b7d93]">
                                  Target {currency.format(principalExecutiveAnalytics.performance.goalTarget)}
                                </p>
                              </div>
                              <div
                                className="h-12 w-12 rounded-full border border-[#d8e4f2]"
                                style={{
                                  background: `conic-gradient(#3b82f6 ${principalExecutiveAnalytics.performance.goalProgress}%, #e2e8f0 ${principalExecutiveAnalytics.performance.goalProgress}% 100%)`,
                                }}
                              >
                                <div className="mx-auto mt-[6px] h-9 w-9 rounded-full bg-white" />
                              </div>
                            </div>
                          </div>
                        </div>
                      </article>

                      <article className="flex h-full min-h-[430px] flex-col overflow-hidden rounded-[18px] border border-[#dce6f2] bg-white p-5">
                        <div className="mb-3 flex shrink-0 items-center justify-between gap-2">
                          <h3 className="text-[1.04rem] font-semibold tracking-[-0.02em] text-[#142132]">Recent Activity</h3>
                          <button type="button" className="text-[0.82rem] font-semibold text-[#2f6fc2]" onClick={() => navigate('/pipeline')}>
                            View all
                          </button>
                        </div>
                        {principalExecutiveAnalytics.recentActivity.length ? (
                          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                            {principalExecutiveAnalytics.recentActivity.map((item) => {
                              const ActivityIcon =
                                item.type === 'lead'
                                  ? Users
                                  : item.type === 'appointment'
                                    ? CalendarDays
                                    : item.type === 'listing'
                                      ? Building2
                                      : ArrowRightLeft
                              return (
                                <article key={item.id} className="flex items-start gap-3 rounded-[12px] border border-[#e4ebf5] bg-[#fbfdff] px-3 py-2.5">
                                  <span className="mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#eef4fb] text-[#355f8a]">
                                    <ActivityIcon size={14} />
                                  </span>
                                  <div className="min-w-0 flex-1">
                                    <p className="truncate text-[0.86rem] font-semibold text-[#22374d]">{item.title}</p>
                                    <p className="mt-0.5 truncate text-[0.8rem] text-[#61758d]">{item.description}</p>
                                  </div>
                                  <span className="text-[0.73rem] font-medium text-[#7a8ea6]">{formatRelativeTime(item.timestamp)}</span>
                                </article>
                              )
                            })}
                          </div>
                        ) : (
                          <div className="rounded-[14px] border border-dashed border-[#d3ddea] bg-[#fbfdff] px-4 py-8 text-center">
                            <p className="text-[0.9rem] font-medium text-[#33475d]">No recent activity yet.</p>
                            <p className="mt-1 text-[0.78rem] text-[#6f8298]">
                              New opportunities, listings, appointments, and transaction updates will appear here.
                            </p>
                          </div>
                        )}
                      </article>
                    </div>
                  ) : (
                    <div className="rounded-[16px] border border-dashed border-[#d4e0ee] bg-[#f8fbff] px-5 py-8 text-center">
                      <p className="text-[0.96rem] font-medium text-[#33475d]">No organisation activity data yet.</p>
                      <p className="mt-1 text-[0.86rem] text-[#6f8298]">Capture leads, listings, and appointments to unlock executive analytics.</p>
                    </div>
                  )}
                </section>
              ) : null}

              {isPrincipalAgentView ? (
                <section className={`mt-6 ${DASHBOARD_PANEL_CLASS}`}>
                  <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div className="min-w-0">
                      <h3 className="text-[1.06rem] font-semibold tracking-[-0.02em] text-[#142132]">Active Transactions</h3>
                      <p className="mt-1 text-[0.9rem] text-[#6b7d93]">Organisation-wide active transactions with clear ownership, stage movement, value, and blockers.</p>
                    </div>
                    <span className={DASHBOARD_CHIP_CLASS}>{principalActiveDeals.length} active</span>
                  </div>
                  {principalActiveDeals.length ? (
                    <div className="grid gap-4 lg:grid-cols-2">
                      {principalActiveDeals.map((deal) => (
                        <article key={`principal-deal-${deal.id}`} className="rounded-[18px] border border-[#dce6f2] bg-[#fbfdff] p-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-[0.92rem] font-semibold text-[#22374d]">{deal.listing}</p>
                              <p className="mt-1 text-[0.8rem] text-[#607387]">Owner: {deal.agent}</p>
                            </div>
                            <span className="inline-flex rounded-full border border-[#dbe6f2] bg-white px-2.5 py-1 text-[0.72rem] font-semibold text-[#35546c]">{deal.stage}</span>
                          </div>
                          <div className="mt-3 grid gap-2 md:grid-cols-3">
                            <div className="rounded-[12px] border border-[#e2eaf4] bg-white px-3 py-2">
                              <p className="text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Deal Value</p>
                              <p className="mt-1 text-[0.95rem] font-semibold text-[#142132]">{currency.format(deal.value)}</p>
                            </div>
                            <div className="rounded-[12px] border border-[#e2eaf4] bg-white px-3 py-2 md:col-span-2">
                              <p className="text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Next Action</p>
                              <p className="mt-1 truncate text-[0.85rem] font-medium text-[#35546c]">{deal.nextAction}</p>
                            </div>
                          </div>
                          <div className="mt-3 rounded-[12px] border border-[#e2eaf4] bg-white px-3 py-2">
                            <p className="text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Current Blocker</p>
                            <p className="mt-1 text-[0.85rem] font-medium text-[#5f738a]">{deal.blocker}</p>
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-[16px] border border-dashed border-[#d4e0ee] bg-[#f8fbff] px-5 py-8 text-center">
                      <p className="text-[0.96rem] font-medium text-[#33475d]">No active transactions yet.</p>
                      <p className="mt-1 text-[0.86rem] text-[#6f8298]">Active organisation transactions will appear here once workflows move beyond intake.</p>
                    </div>
                  )}
                </section>
              ) : (
                <section className={`mt-6 ${DASHBOARD_PANEL_CLASS}`}>
                  {renderActiveTransactionsBlock({
                    title: 'Active Transactions',
                    description: 'Live execution across assigned transactions with clear stage and activity visibility.',
                    emptyText: 'Start by creating your first transaction, or convert a pipeline item to begin shared workflow tracking.',
                    emptyActionLabel: 'Create first transaction',
                    onEmptyAction: () => navigate('/new-transaction'),
                    variant: 'showcase',
                  })}
                </section>
              )}

              <section className={`mt-6 ${DASHBOARD_PANEL_CLASS}`}>
                <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0">
                    <h3 className="text-[1.06rem] font-semibold tracking-[-0.02em] text-[#142132]">
                      {isPrincipalAgentView ? 'Appointment Requests This Week' : 'Appointment Requests'}
                    </h3>
                    <p className="mt-1 text-[0.9rem] text-[#6b7d93]">
                      {isPrincipalAgentView
                        ? 'Weekly appointment activity across the agency with status and ownership visibility.'
                        : 'Pending confirmations, upcoming appointments, and reschedule requests across the agent pipeline.'}
                    </p>
                  </div>
                  <span className={DASHBOARD_CHIP_CLASS}>{isPrincipalAgentView ? principalAppointmentsThisWeek.length : agentAppointmentSummary.rows.length} appointments</span>
                </div>

                <div className="grid gap-4 lg:grid-cols-3">
                  {[
                    { label: 'Pending Confirmation', value: isPrincipalAgentView ? appointmentSummary.pending.length : agentAppointmentSummary.pending.length, tone: 'border-[#f2debf] bg-[#fdf5e8] text-[#976427]' },
                    { label: 'Upcoming', value: isPrincipalAgentView ? appointmentSummary.upcoming.length : agentAppointmentSummary.upcoming.length, tone: 'border-[#d8e6f6] bg-[#f3f8fd] text-[#2c5a89]' },
                    { label: 'Needs Reschedule', value: isPrincipalAgentView ? appointmentSummary.reschedule.length : agentAppointmentSummary.reschedule.length, tone: 'border-[#f1ced2] bg-[#fff2f4] text-[#a0383f]' },
                  ].map((item) => (
                    <article key={item.label} className="rounded-[18px] border border-[#dce6f2] bg-[#fbfdff] p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-[0.74rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">{item.label}</p>
                          <p className="mt-2 text-[1.3rem] font-semibold text-[#142132]">{item.value}</p>
                        </div>
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-[0.72rem] font-semibold ${item.tone}`}>Live</span>
                      </div>
                    </article>
                  ))}
                </div>

                <div className="mt-5">
                  {isPrincipalAgentView ? (
                    principalAppointmentsThisWeek.length ? (
                      <div className="grid gap-4 lg:grid-cols-2">
                        {principalAppointmentsThisWeek.map((appointment) => (
                          <article key={`principal-appointment-${appointment.id}`} className="rounded-[18px] border border-[#dce6f2] bg-[#fbfdff] p-4">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-[#22374d]">{appointment.listing}</p>
                                <p className="mt-1 text-sm text-[#607387]">Client: {appointment.client}</p>
                              </div>
                              <span className="inline-flex rounded-full border border-[#dbe6f2] bg-white px-2.5 py-1 text-[0.72rem] font-semibold text-[#35546c]">
                                {appointment.statusLabel}
                              </span>
                            </div>
                            <div className="mt-3 grid gap-2 md:grid-cols-2">
                              <div className="rounded-[12px] border border-[#e2eaf4] bg-white px-3 py-2">
                                <p className="text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Assigned Agent</p>
                                <p className="mt-1 text-[0.85rem] font-medium text-[#35546c]">{appointment.agent}</p>
                              </div>
                              <div className="rounded-[12px] border border-[#e2eaf4] bg-white px-3 py-2">
                                <p className="text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Proposed Date & Time</p>
                                <p className="mt-1 text-[0.85rem] font-medium text-[#35546c]">{appointment.dateLabel}</p>
                              </div>
                            </div>
                            <div className="mt-3 flex flex-wrap items-center gap-2">
                              <button type="button" className={DASHBOARD_ACTION_SECONDARY_CLASS} onClick={() => navigate('/listings')}>
                                Open Listing
                              </button>
                              <button type="button" className={DASHBOARD_ACTION_SECONDARY_CLASS} onClick={() => navigate('/agents')}>
                                View Agent
                              </button>
                            </div>
                          </article>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-[16px] border border-dashed border-[#d4e0ee] bg-[#f8fbff] px-5 py-8 text-center">
                        <p className="text-[0.96rem] font-medium text-[#33475d]">No appointment requests this week.</p>
                        <p className="mt-1 text-[0.86rem] text-[#6f8298]">New weekly appointment activity will appear here as requests come in.</p>
                      </div>
                    )
                  ) : agentAppointmentSummary.rows.slice(0, 4).length ? (
                    <div className="space-y-3">
                      {agentAppointmentSummary.rows.slice(0, 4).map((appointment) => {
                        const statusMeta = getAppointmentStatusMeta(appointment?.status)
                        const appointmentType = appointment?.appointmentType || 'Appointment'
                        return (
                        <article key={appointment.appointmentId} className="rounded-[18px] border border-[#dce6f2] bg-[#fbfdff] p-4">
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <CalendarDays size={15} className="text-[#5f738a]" />
                                <p className="truncate text-sm font-semibold text-[#22374d]">{appointment.title || appointmentType}</p>
                              </div>
                              <p className="mt-1 text-sm text-[#607387]">Agent: {appointment.assignedAgentName || appointment.assignedAgentEmail || 'Assigned agent'}</p>
                              <p className="mt-1 text-xs text-[#6b7d93]">{appointment.date || 'Date pending'} {appointment.startTime || ''}</p>
                            </div>
                            <span className={`inline-flex rounded-full border px-2.5 py-1 text-[0.72rem] font-semibold ${statusMeta.tone}`}>
                              {statusMeta.label}
                            </span>
                          </div>

                          <div className="mt-3 grid gap-2 md:grid-cols-2">
                            <div className="rounded-[12px] border border-[#e2eaf4] bg-white px-3 py-2">
                              <p className="text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Appointment Type</p>
                              <p className="mt-1 text-[0.85rem] font-medium text-[#35546c]">{appointmentType}</p>
                            </div>
                            <div className="rounded-[12px] border border-[#e2eaf4] bg-white px-3 py-2">
                              <p className="text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Status</p>
                              <p className="mt-1 text-[0.85rem] font-medium text-[#35546c]">{statusMeta.label}</p>
                            </div>
                          </div>

                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <button type="button" className={DASHBOARD_ACTION_SECONDARY_CLASS} onClick={() => navigate('/pipeline')}>
                              Open Calendar
                            </button>
                            <button type="button" className={DASHBOARD_ACTION_SECONDARY_CLASS} onClick={() => navigate('/pipeline')}>
                              Manage Appointment
                            </button>
                          </div>
                        </article>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="rounded-[16px] border border-dashed border-[#d4e0ee] bg-[#f8fbff] px-5 py-8 text-center">
                      <p className="text-[0.96rem] font-medium text-[#33475d]">No appointment requests yet.</p>
                      <p className="mt-1 text-[0.86rem] text-[#6f8298]">
                        Appointments will appear here once they are created in your CRM workspace.
                      </p>
                    </div>
                  )}
                </div>
              </section>

              {!isPrincipalAgentView ? (
              <section className={`mt-6 ${DASHBOARD_PANEL_CLASS}`}>
                <div className="mb-6">
                  <h3 className="text-[1.15rem] font-semibold tracking-[-0.03em] text-[#142132]">Performance Analytics</h3>
                  <p className="mt-2 text-[0.95rem] leading-7 text-[#6b7d93]">
                    {isPrincipalAgentView
                      ? 'Organisation-level conversion health and transaction performance trends.'
                      : 'Your personal conversion health and deal-performance trends.'}
                  </p>
                </div>

                <div className="grid gap-6">
                  <article className="rounded-[18px] border border-[#d9e5f3] bg-[#f7fbff] p-5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <h4 className="text-[1rem] font-semibold text-[#142132]">Conversion Funnel</h4>
                        <p className="mt-1 text-[0.86rem] text-[#6b7d93]">
                          {funnelAudience === 'buyer'
                            ? 'Buyer movement from lead capture to signed outcomes.'
                            : 'Seller movement from lead capture to live listing outcomes.'}
                        </p>
                      </div>
                      <div className="inline-flex items-center gap-1 self-start rounded-full border border-[#dbe6f2] bg-white p-1">
                        <button
                          type="button"
                          onClick={() => setFunnelAudience('buyer')}
                          className={`rounded-full px-3 py-1 text-[0.72rem] font-semibold transition ${
                            funnelAudience === 'buyer' ? 'bg-[#1f4f78] text-white' : 'text-[#35546c]'
                          }`}
                        >
                          Buyer
                        </button>
                        <button
                          type="button"
                          onClick={() => setFunnelAudience('seller')}
                          className={`rounded-full px-3 py-1 text-[0.72rem] font-semibold transition ${
                            funnelAudience === 'seller' ? 'bg-[#1f4f78] text-white' : 'text-[#35546c]'
                          }`}
                        >
                          Seller
                        </button>
                      </div>
                    </div>
                    {(() => {
                      const getTone = (value) => {
                        if (value >= 60) {
                          return {
                            text: 'text-[#1f7a4f]',
                            chip: 'border-[#cfe9da] bg-[#eef8f2] text-[#1f7a4f]',
                            bar: 'bg-[#2f8a63]',
                          }
                        }
                        if (value >= 35) {
                          return {
                            text: 'text-[#976427]',
                            chip: 'border-[#f2debf] bg-[#fdf5e8] text-[#976427]',
                            bar: 'bg-[#d39a49]',
                          }
                        }
                        return {
                          text: 'text-[#a0383f]',
                          chip: 'border-[#f1ced2] bg-[#fff2f4] text-[#a0383f]',
                          bar: 'bg-[#d35b68]',
                        }
                      }

                      const getFocusCopy = (largestDrop) => {
                        if (!largestDrop) {
                          return 'Focus: keep lead qualification and follow-up consistency high.'
                        }

                        if (largestDrop.fromKey === 'leads' && (largestDrop.toKey === 'viewings' || largestDrop.toKey === 'appointments')) {
                          return 'Focus: improve lead qualification and follow-up speed.'
                        }
                        if (largestDrop.fromKey === 'viewings' && largestDrop.toKey === 'offers') {
                          return 'Focus: convert more viewings into formal offers.'
                        }
                        if (largestDrop.fromKey === 'offers' && largestDrop.toKey === 'signed') {
                          return 'Focus: tighten offer negotiation and signature turnaround.'
                        }
                        if (largestDrop.fromKey === 'appointments' && largestDrop.toKey === 'mandate_signed') {
                          return 'Focus: improve seller meeting preparation and mandate close rates.'
                        }
                        if (largestDrop.fromKey === 'mandate_signed' && largestDrop.toKey === 'listing_live') {
                          return 'Focus: reduce mandate-to-live listing activation delays.'
                        }
                        return 'Focus: resolve stage handoff blockers across the conversion path.'
                      }

                      const funnel = funnelAudience === 'buyer'
                        ? agentPerformanceMetrics.conversionFunnel.buyer
                        : agentPerformanceMetrics.conversionFunnel.seller
                      const biggestDrop = funnelAudience === 'buyer'
                        ? agentPerformanceMetrics.biggestFunnelDrop.buyer
                        : agentPerformanceMetrics.biggestFunnelDrop.seller
                      const hasFunnelData = funnelAudience === 'buyer'
                        ? agentPerformanceMetrics.hasFunnelData.buyer
                        : agentPerformanceMetrics.hasFunnelData.seller

                      if (!hasFunnelData) {
                        return (
                          <div className="mt-4 rounded-[14px] border border-dashed border-[#cfdceb] bg-white px-4 py-5 text-sm text-[#667a91]">
                            {funnelAudience === 'buyer'
                              ? 'No buyer funnel data yet. Capture buyer leads and appointments to unlock this funnel.'
                              : 'No seller funnel data yet. Capture seller leads and mandate steps to unlock this funnel.'}
                          </div>
                        )
                      }

                      return (
                        <>
                          <div className="mt-4 hidden overflow-x-auto pb-2 lg:block">
                            <div className="flex min-w-[880px] items-stretch gap-2">
                              {funnel.map((item, index) => {
                                const tone = getTone(index === 0 ? 100 : item.fromPreviousShare)
                                const cardWidth = Math.max(17, Math.min(38, item.width || 0))
                                const connectorDrop = index < funnel.length - 1 ? item.dropToNext : 0
                                const connectorTone = getTone(100 - connectorDrop)
                                return (
                                  <Fragment key={item.key}>
                                    <article
                                      className="flex min-h-[138px] flex-col justify-between rounded-[14px] border border-[#dce6f2] bg-white px-3.5 py-3.5"
                                      style={{ width: `${cardWidth}%`, minWidth: '180px' }}
                                    >
                                      <div>
                                        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">{item.label}</p>
                                        <p className="mt-1 text-[1.28rem] font-semibold tracking-[-0.02em] text-[#142132]">{item.count}</p>
                                        <p className={`mt-1 text-[0.78rem] font-semibold ${tone.text}`}>
                                          {index === 0
                                            ? 'Base volume'
                                            : `${formatPercent(item.fromPreviousShare)} from ${String(item.previousLabel || '').toLowerCase()}`}
                                        </p>
                                      </div>
                                      <div className="mt-3">
                                        <div className="h-1.5 rounded-full bg-[#dfe9f4]">
                                          <span className={`block h-full rounded-full ${tone.bar}`} style={{ width: `${Math.max(item.count ? 8 : 0, Math.min(100, item.shareOfLeads || 0))}%` }} />
                                        </div>
                                      </div>
                                    </article>

                                    {index < funnel.length - 1 ? (
                                      <div className="flex min-w-[92px] flex-col items-center justify-center gap-1 px-0.5">
                                        <span className={`rounded-full border px-2 py-1 text-[0.66rem] font-semibold ${connectorTone.chip}`}>
                                          -{formatPercent(connectorDrop)} drop
                                        </span>
                                        <ArrowRight size={15} className="text-[#7a8ea6]" />
                                      </div>
                                    ) : null}
                                  </Fragment>
                                )
                              })}
                            </div>
                          </div>

                          <div className="mt-4 space-y-2 lg:hidden">
                            {funnel.map((item, index) => {
                              const tone = getTone(index === 0 ? 100 : item.fromPreviousShare)
                              return (
                                <Fragment key={`mobile-${item.key}`}>
                                  <article className="rounded-[14px] border border-[#dce6f2] bg-white px-3.5 py-3.5">
                                    <div className="flex items-start justify-between gap-3">
                                      <div>
                                        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">{item.label}</p>
                                        <p className="mt-1 text-[1.12rem] font-semibold tracking-[-0.02em] text-[#142132]">{item.count}</p>
                                      </div>
                                      <span className={`rounded-full border px-2 py-1 text-[0.68rem] font-semibold ${tone.chip}`}>
                                        {index === 0 ? 'Base' : `${formatPercent(item.fromPreviousShare)} from prev`}
                                      </span>
                                    </div>
                                    <div className="mt-3 h-1.5 rounded-full bg-[#dfe9f4]">
                                      <span className={`block h-full rounded-full ${tone.bar}`} style={{ width: `${Math.max(item.count ? 8 : 0, Math.min(100, item.shareOfLeads || 0))}%` }} />
                                    </div>
                                  </article>
                                  {index < funnel.length - 1 ? (
                                    <div className="flex items-center justify-center gap-2 py-1">
                                      <ArrowRight size={14} className="text-[#7a8ea6]" />
                                      <span className={`rounded-full border px-2 py-0.5 text-[0.66rem] font-semibold ${getTone(100 - item.dropToNext).chip}`}>
                                        -{formatPercent(item.dropToNext)} drop
                                      </span>
                                    </div>
                                  ) : null}
                                </Fragment>
                              )
                            })}
                          </div>

                          <div className="mt-4 rounded-[12px] border border-[#dce6f2] bg-white px-3.5 py-3">
                            <p className="text-[0.78rem] font-semibold uppercase tracking-[0.08em] text-[#6f8399]">Insight</p>
                            <p className="mt-1 text-[0.88rem] font-semibold text-[#22374d]">
                              Biggest drop-off: {biggestDrop ? `${biggestDrop.from} → ${biggestDrop.to} (-${formatPercent(biggestDrop.dropPercent)})` : 'No stage drop-off detected'}
                            </p>
                            <p className="mt-1 text-[0.82rem] text-[#5f738a]">{getFocusCopy(biggestDrop)}</p>
                            {funnelAudience === 'buyer' && agentPerformanceMetrics.quality.funnel.buyerOfferSource !== 'listing_offers' ? (
                              <p className="mt-2 text-[0.76rem] text-[#7b8ca2]">
                                Offer and signed steps are currently inferred from transaction stages because first-class offer records are limited.
                              </p>
                            ) : null}
                          </div>
                        </>
                      )
                    })()}
                  </article>

                  <div className="grid gap-6 xl:grid-cols-2">
                    {(() => {
                      const rows = propertyMixScope === 'deals'
                        ? agentPerformanceMetrics.propertyTypeDealBreakdown
                        : agentPerformanceMetrics.propertyTypeListingBreakdown
                      const total = rows.reduce((sum, item) => sum + Number(item.count || 0), 0)
                      const topRows = rows.slice(0, 6)

                      return (
                        <article className="rounded-[18px] border border-[#e3eaf3] bg-[#fbfcfe] p-5">
                          <div className="flex items-center justify-between gap-3">
                            <h4 className="text-[1rem] font-semibold text-[#142132]">Property Category Breakdown</h4>
                            <div className="inline-flex items-center gap-1 rounded-full border border-[#dbe6f2] bg-white p-1">
                              <button
                                type="button"
                                onClick={() => setPropertyMixScope('deals')}
                                className={`rounded-full px-2.5 py-1 text-[0.7rem] font-semibold transition ${
                                  propertyMixScope === 'deals' ? 'bg-[#1f4f78] text-white' : 'text-[#35546c]'
                                }`}
                              >
                                Deals
                              </button>
                              <button
                                type="button"
                                onClick={() => setPropertyMixScope('listings')}
                                className={`rounded-full px-2.5 py-1 text-[0.7rem] font-semibold transition ${
                                  propertyMixScope === 'listings' ? 'bg-[#1f4f78] text-white' : 'text-[#35546c]'
                                }`}
                              >
                                Listings
                              </button>
                            </div>
                          </div>
                          <p className="mt-1 text-[0.86rem] text-[#6b7d93]">
                            {propertyMixScope === 'deals'
                              ? 'Breakdown by property category across your deal flow.'
                              : 'Breakdown by property category across your assigned listings.'}
                          </p>
                          {topRows.length ? (
                            <div className="mt-4 space-y-3">
                              {topRows.map((item) => {
                                const share = total ? (Number(item.count || 0) / total) * 100 : 0
                                return (
                                  <div key={`${propertyMixScope}-${item.key}`} className="rounded-[14px] border border-[#dce6f2] bg-white px-3.5 py-3">
                                    <div className="flex items-center justify-between gap-2">
                                      <p className="text-[0.9rem] font-semibold text-[#22374d]">{item.label}</p>
                                      <p className="text-[0.85rem] font-semibold text-[#35546c]">{item.count} ({formatPercent(share)})</p>
                                    </div>
                                    <div className="mt-2 h-2 rounded-full bg-[#e2eaf4]">
                                      <span className="block h-full rounded-full bg-[#3f78a8]" style={{ width: `${Math.max(6, Math.min(100, share))}%` }} />
                                    </div>
                                  </div>
                                )
                              })}
                              {propertyMixScope === 'deals' && !agentPerformanceMetrics.quality.propertyType.dealsRowsWithSignal ? (
                                <p className="text-[0.76rem] text-[#7b8ca2]">Property category is missing on many deal rows. Capture it during listing/deal setup for better accuracy.</p>
                              ) : null}
                              {propertyMixScope === 'listings' && !agentPerformanceMetrics.quality.propertyType.listingsRowsWithSignal ? (
                                <p className="text-[0.76rem] text-[#7b8ca2]">Property category is not consistently captured on listing records yet.</p>
                              ) : null}
                            </div>
                          ) : (
                            <div className="mt-4 rounded-[14px] border border-dashed border-[#d3ddea] bg-white px-4 py-6 text-center">
                              <p className="text-[0.9rem] font-medium text-[#33475d]">No property category data yet.</p>
                              <p className="mt-1 text-[0.82rem] text-[#6f8298]">
                                Category analytics will appear once {propertyMixScope === 'deals' ? 'deals' : 'listings'} capture category values.
                              </p>
                            </div>
                          )}
                        </article>
                      )
                    })()}

                    {(() => {
                      const cash = agentPerformanceMetrics.cashVsBond.find((item) => item.key === 'cash') || { total: 0, conversion: 0, avgDealTime: 0, label: 'Cash' }
                      const bond = agentPerformanceMetrics.cashVsBond.find((item) => item.key === 'bond') || { total: 0, conversion: 0, avgDealTime: 0, label: 'Bond' }
                      const hybrid = agentPerformanceMetrics.cashVsBond.find((item) => item.key === 'hybrid') || { total: 0, conversion: 0, avgDealTime: 0, label: 'Hybrid' }
                      const totalDeals = Math.max(cash.total + bond.total + hybrid.total, 1)
                      const cashShare = (cash.total / totalDeals) * 100
                      const bondShare = (bond.total / totalDeals) * 100
                      const hybridShare = (hybrid.total / totalDeals) * 100
                      return (
                        <article className="rounded-[18px] border border-[#e3eaf3] bg-[#fbfcfe] p-5">
                          <h4 className="text-[1rem] font-semibold text-[#142132]">Cash vs Bond vs Hybrid</h4>
                          <p className="mt-1 text-[0.86rem] text-[#6b7d93]">Deal finance mix with conversion and average deal-time signals.</p>
                          <div className="mt-4 grid gap-4 lg:grid-cols-[190px_1fr] lg:items-center">
                            <div className="mx-auto h-[170px] w-[170px] rounded-full" style={{ background: `conic-gradient(#3f78a8 0 ${cashShare}%, #2f8a63 ${cashShare}% ${cashShare + bondShare}%, #2563eb ${cashShare + bondShare}% 100%)` }}>
                              <div className="mx-auto mt-[20px] flex h-[130px] w-[130px] items-center justify-center rounded-full bg-white">
                                <span className="text-[1.3rem] font-semibold text-[#142132]">{cash.total + bond.total + hybrid.total}</span>
                              </div>
                            </div>
                            <div className="space-y-3">
                              {[
                                { key: 'cash', label: 'Cash', item: cash, share: cashShare, tone: 'text-[#35546c]' },
                                { key: 'bond', label: 'Bond', item: bond, share: bondShare, tone: 'text-[#2f8a63]' },
                                { key: 'hybrid', label: 'Hybrid', item: hybrid, share: hybridShare, tone: 'text-[#2563eb]' },
                              ].map((entry) => (
                                <div key={entry.key} className="rounded-[14px] border border-[#dce6f2] bg-white px-3.5 py-3">
                                  <div className="flex items-center justify-between gap-2">
                                    <p className="text-[0.9rem] font-semibold text-[#22374d]">{entry.label}</p>
                                    <p className={`text-[0.85rem] font-semibold ${entry.tone}`}>{entry.item.total} ({formatPercent(entry.share)})</p>
                                  </div>
                                  <p className="mt-1 text-[0.8rem] text-[#5f738a]">Conversion {formatPercent(entry.item.conversion)} • Avg {Math.round(entry.item.avgDealTime || 0)}d</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        </article>
                      )
                    })()}
                  </div>

                  <article className="rounded-[18px] border border-[#dce6f2] bg-[#f9fcff] p-5">
                    <div className="mb-4">
                      <h4 className="text-[1rem] font-semibold text-[#142132]">Performance Metrics</h4>
                      <p className="mt-1 text-[0.86rem] text-[#6b7d93]">Category, stock source, ownership structure, and buyer profile intelligence across active and closed deals.</p>
                    </div>
                    {(() => {
                      const colors = ['#3f78a8', '#2f8a63', '#22a3ad', '#d39a49', '#7f8fa3', '#bf4ed8']

                      const buildDonutData = (rows) => {
                        const normalizedRows = rows.map((row, index) => ({
                          ...row,
                          value: Number(row.value || row.count || 0),
                          color: colors[index % colors.length],
                        }))
                        const total = normalizedRows.reduce((sum, row) => sum + row.value, 0)
                        return {
                          rows: normalizedRows.map((row) => ({
                            ...row,
                            share: total ? (row.value / total) * 100 : 0,
                          })),
                          total,
                        }
                      }

                      const toConicGradient = (rows, total) => {
                        if (!total) {
                          return 'conic-gradient(#dce6f2 0 100%)'
                        }
                        let cursor = 0
                        const segments = rows.map((row) => {
                          const start = cursor
                          cursor += row.share
                          return `${row.color} ${start}% ${cursor}%`
                        })
                        return `conic-gradient(${segments.join(', ')})`
                      }

                      const propertySource = propertyTypeView === 'volume'
                        ? agentPerformanceMetrics.propertyTypeByVolume.map((item) => ({ key: item.key, label: item.label, value: item.count }))
                        : agentPerformanceMetrics.propertyTypeByValue.map((item) => ({ key: item.key, label: item.label, value: item.value }))
                      const propertyDonut = buildDonutData(propertySource)
                      const stockSourceDonut = buildDonutData(
                        (agentPerformanceMetrics.stockSourceBreakdown || []).map((item) => ({ key: item.key, label: item.label, value: item.count })),
                      )
                      const structureDonut = buildDonutData(
                        (agentPerformanceMetrics.structureTypeBreakdown || []).map((item) => ({ key: item.key, label: item.label, value: item.count })),
                      )
                      const hasBuyerAgeSignal = agentPerformanceMetrics.quality.demographics.buyerAgeRowsWithSignal > 0
                      const ageDonut = buildDonutData(
                        hasBuyerAgeSignal
                          ? agentPerformanceMetrics.buyerInsights.ageGroups.map((item) => ({ key: item.label, label: item.label, value: item.count }))
                          : [],
                      )
                      const financeDonut = buildDonutData(agentPerformanceMetrics.buyerInsights.financeTypes.map((item) => ({ key: item.label, label: item.label, value: item.count })))

                      const donutCard = ({ title, subtitle, data, valueFormatter, headerAction = null, emptyMessage = '' }) => (
                        <article className="flex h-full min-h-[280px] flex-col justify-between rounded-[14px] border border-[#dce6f2] bg-white p-4">
                          <div className="flex items-center justify-between gap-2">
                            <h5 className="text-[0.93rem] font-semibold text-[#22374d]">{title}</h5>
                            {headerAction}
                          </div>
                          <div className="mt-3 flex flex-1 flex-col justify-between rounded-[12px] border border-[#e3ebf4] bg-[#fbfdff] p-3">
                            {data.total ? (
                              <div className="grid items-center gap-4 xl:grid-cols-[132px_1fr]">
                                <div className="mx-auto h-[132px] w-[132px] rounded-full" style={{ background: toConicGradient(data.rows, data.total) }}>
                                  <div className="mx-auto mt-[16px] flex h-[100px] w-[100px] items-center justify-center rounded-full bg-white">
                                    <span className="text-[1.08rem] font-semibold text-[#142132]">
                                      {valueFormatter ? valueFormatter(data.total) : data.total}
                                    </span>
                                  </div>
                                </div>
                                <div className="space-y-2">
                                  {data.rows.map((item) => (
                                    <div key={`${title}-${item.key}`} className="flex items-center justify-between gap-2 rounded-[10px] border border-[#e0e9f3] bg-white px-2.5 py-2">
                                      <div className="flex min-w-0 items-center gap-2">
                                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                                        <span className="truncate text-[0.8rem] font-medium text-[#22374d]">{item.label}</span>
                                      </div>
                                      <div className="text-right">
                                        <p className="text-[0.78rem] font-semibold text-[#142132]">{valueFormatter ? valueFormatter(item.value) : item.value}</p>
                                        <p className="text-[0.72rem] font-semibold text-[#6c8198]">{formatPercent(item.share)}</p>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ) : (
                              <div className="rounded-[12px] border border-dashed border-[#d3ddea] bg-white px-4 py-6 text-center">
                                <p className="text-[0.88rem] font-medium text-[#33475d]">{emptyMessage || 'No analytics data yet.'}</p>
                                <p className="mt-1 text-[0.78rem] text-[#6f8298]">
                                  This card updates once enough agent-scoped records are captured.
                                </p>
                              </div>
                            )}
                            <p className="mt-3 text-[0.75rem] text-[#7b8ca2]">{subtitle}</p>
                          </div>
                        </article>
                      )

                      return (
                        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                          {donutCard({
                            title: 'Property Category Breakdown',
                            subtitle: propertyTypeView === 'volume'
                              ? 'Count and share by property category'
                              : 'Secured value and share by property category',
                            data: propertyDonut,
                            valueFormatter: propertyTypeView === 'volume' ? null : (value) => currency.format(value || 0),
                            headerAction: (
                              <div className="inline-flex items-center gap-1 rounded-full border border-[#dbe6f2] bg-[#f7fbff] p-1">
                                <button
                                  type="button"
                                  onClick={() => setPropertyTypeView('volume')}
                                  className={`rounded-full px-2.5 py-1 text-[0.7rem] font-semibold transition ${
                                    propertyTypeView === 'volume'
                                      ? 'bg-[#1f4f78] text-white'
                                      : 'text-[#35546c]'
                                  }`}
                                >
                                  By Volume
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setPropertyTypeView('value')}
                                  className={`rounded-full px-2.5 py-1 text-[0.7rem] font-semibold transition ${
                                    propertyTypeView === 'value'
                                      ? 'bg-[#1f4f78] text-white'
                                      : 'text-[#35546c]'
                                  }`}
                                >
                                  By Value
                                </button>
                              </div>
                            ),
                          })}

                          {donutCard({
                            title: 'Stock Source Breakdown',
                            subtitle: 'Private listings vs development stock across scoped records.',
                            data: stockSourceDonut,
                            emptyMessage: 'No stock source data yet.',
                          })}

                          {donutCard({
                            title: 'Ownership / Structure Breakdown',
                            subtitle: 'Legal ownership structure view used for transfer/document logic.',
                            data: structureDonut,
                            emptyMessage: 'No ownership structure data yet.',
                          })}

                          {donutCard({
                            title: 'Buyer Age Group',
                            subtitle: hasBuyerAgeSignal
                              ? 'Age distribution across buyers in current deal flow.'
                              : 'Capture buyer DOB or age details to unlock this view.',
                            data: ageDonut,
                            emptyMessage: 'Not enough buyer age data yet.',
                          })}

                          {donutCard({
                            title: 'Finance Type',
                            subtitle: 'Funding profile mix across the active portfolio.',
                            data: financeDonut,
                          })}
                        </div>
                      )
                    })()}
                  </article>

                  <article className="rounded-[18px] border border-[#e3eaf3] bg-[#fbfcfe] p-5">
                    <h4 className="text-[1rem] font-semibold text-[#142132]">Asking vs Selling Price</h4>
                    <p className="mt-1 text-[0.86rem] text-[#6b7d93]">Compare pricing position and variance across live and completed deals.</p>
                    <div className="mt-4 grid gap-3 md:grid-cols-3">
                      <div className="rounded-[14px] border border-[#dce6f2] bg-white px-3.5 py-3">
                        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Avg Asking Price</p>
                        <p className="mt-1.5 text-[1.08rem] font-semibold text-[#142132]">{currency.format(agentPerformanceMetrics.avgAskingPrice || 0)}</p>
                      </div>
                      <div className="rounded-[14px] border border-[#dce6f2] bg-white px-3.5 py-3">
                        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Avg Selling Price</p>
                        <p className="mt-1.5 text-[1.08rem] font-semibold text-[#142132]">{currency.format(agentPerformanceMetrics.avgSellingPrice || 0)}</p>
                      </div>
                      <div className="rounded-[14px] border border-[#dce6f2] bg-white px-3.5 py-3">
                        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Variance</p>
                        <p className={`mt-1.5 text-[1.08rem] font-semibold ${agentPerformanceMetrics.askingVsSellingDelta >= 0 ? 'text-[#2f8a63]' : 'text-[#b54645]'}`}>
                          {agentPerformanceMetrics.askingVsSellingDelta >= 0 ? '+' : ''}
                          {agentPerformanceMetrics.askingVsSellingDelta.toFixed(1)}%
                        </p>
                        <div className="mt-2 h-2 rounded-full bg-[#e2eaf4]">
                          <span
                            className={`block h-full rounded-full ${agentPerformanceMetrics.askingVsSellingDelta >= 0 ? 'bg-[#2f8a63]' : 'bg-[#b54645]'}`}
                            style={{ width: `${Math.min(100, Math.max(8, Math.abs(agentPerformanceMetrics.askingVsSellingDelta) * 4))}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </article>

                  <article className="rounded-[18px] border border-[#e3eaf3] bg-[#fbfcfe] p-5">
                    <h4 className="text-[1rem] font-semibold text-[#142132]">Marketing Sources</h4>
                    <p className="mt-1 text-[0.86rem] text-[#6b7d93]">Deals per source and percentage contribution.</p>
                    {agentPerformanceMetrics.marketingSources.length ? (
                      <div className="mt-4 grid gap-3">
                        {agentPerformanceMetrics.marketingSources.slice(0, 6).map((item) => (
                          <div key={item.source} className="rounded-[14px] border border-[#dce6f2] bg-white px-3.5 py-3">
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-[0.92rem] font-medium text-[#22374d]">{item.source}</span>
                              <span className="text-[0.9rem] font-semibold text-[#142132]">{item.deals} • {formatPercent(item.share)}</span>
                            </div>
                            <div className="mt-2 h-2 rounded-full bg-[#e2eaf4]">
                              <span className="block h-full rounded-full bg-[#4f7da6]" style={{ width: `${Math.max(5, Math.min(100, item.share))}%` }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="mt-4 rounded-[14px] border border-dashed border-[#d3ddea] bg-white px-4 py-6 text-center">
                        <p className="text-[0.9rem] font-medium text-[#33475d]">No data yet.</p>
                        <p className="mt-1 text-[0.82rem] text-[#6f8298]">
                          This will update once listings, deals, and pipeline activity are captured.
                        </p>
                      </div>
                    )}
                  </article>
                </div>
              </section>
              ) : null}

              {isPrincipalAgentView ? (
                <section className={`mt-6 ${DASHBOARD_PANEL_CLASS}`}>
                  <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <h3 className="text-[1.1rem] font-semibold tracking-[-0.025em] text-[#142132]">Agency Activity Heatmap</h3>
                      <p className="mt-2 text-[0.98rem] leading-7 text-[#6b7d93]">Operational intensity by stage and aging bucket across the full agency pipeline.</p>
                    </div>
                    <span className={DASHBOARD_CHIP_CLASS}>
                      <TrendingUp size={12} />
                      {principalStageAging.totalTracked} tracked deals
                    </span>
                  </div>

                  <div className="grid grid-cols-[minmax(120px,160px)_repeat(4,minmax(0,1fr))] gap-3" role="table" aria-label="Principal stage aging heatmap">
                    <div className="px-3 py-2 text-[0.78rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]" role="columnheader">
                      Stage
                    </div>
                    {STAGE_AGING_BUCKETS.map((bucket) => (
                      <div key={bucket.key} className="px-3 py-2 text-center text-[0.78rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]" role="columnheader">
                        {bucket.label}
                      </div>
                    ))}

                    {principalStageAging.stages.map((stage) => (
                      <Fragment key={`principal-${stage.key}`}>
                        <div className="flex items-center px-3 py-3 text-[0.95rem] font-medium text-[#23384d]" role="rowheader">
                          {stage.label}
                        </div>
                        {stage.cells.map((cell) => {
                          const level = getHeatLevel(cell.count, principalStageAging.maxCellCount)
                          const toneClass =
                            level >= 4
                              ? 'bg-[#35546c] text-white'
                              : level === 3
                                ? 'bg-[#5f84a7] text-white'
                                : level === 2
                                  ? 'bg-[#dfe9f4] text-[#35546c]'
                                  : level === 1
                                    ? 'bg-[#eef4f9] text-[#6b7d93]'
                                    : 'bg-[#f8fafc] text-[#97a6b8]'

                          return (
                            <div
                              key={`principal-${stage.key}-${cell.key}`}
                              className={`flex min-h-[54px] items-center justify-center rounded-[14px] border border-[#e4ebf4] text-[0.95rem] font-semibold ${toneClass}`}
                              title={`${stage.label}: ${cell.count} deal${cell.count === 1 ? '' : 's'} in ${cell.label}`}
                              role="cell"
                            >
                              {cell.count}
                            </div>
                          )
                        })}
                      </Fragment>
                    ))}
                  </div>
                </section>
              ) : null}
            </>
          ) : isAttorneyRole ? (
            <ConveyancerDashboardPage rows={rows} profileEmail={profile?.email || ''} />
          ) : isBondRole ? (
            <>
              <section className={`mt-6 ${DASHBOARD_PANEL_CLASS}`}>
                <SummaryCards items={bondTopStats} className="xl:grid-cols-4" />
              </section>

              <section className={`mt-6 ${DASHBOARD_PANEL_CLASS}`}>
                <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                  <div className="min-w-0">
                    <h3 className="text-[1.1rem] font-semibold tracking-[-0.025em] text-[#142132]">Active Applications</h3>
                    <p className="mt-2 text-[0.98rem] leading-7 text-[#6b7d93]">Scrollable live applications so you can move through the queue without compressing the detail.</p>
                  </div>
                  <span className={DASHBOARD_CHIP_CLASS}>
                    <ArrowRightLeft size={12} />
                    {bondApplicationCards.length} in motion
                  </span>
                </div>

                <div className="-mx-2 overflow-x-auto overflow-y-hidden px-2 pb-1">
                  <div className="flex min-w-max gap-2.5 pr-2">
                    {bondApplicationCards.map((item) => (
                      <article
                        key={`bond-application-${item.id}`}
                        className="group grid min-h-[248px] w-[328px] shrink-0 grid-rows-[auto_auto_1fr_auto] rounded-[22px] border border-[#dde4ee] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.05)] transition duration-150 ease-out hover:-translate-y-0.5 hover:border-[#ccd6e3] hover:shadow-[0_18px_32px_rgba(15,23,42,0.08)]"
                        onClick={() => openBondApplication(navigate, item)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            openBondApplication(navigate, item)
                          }
                        }}
                        role="button"
                        tabIndex={0}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <span className="block text-[0.78rem] font-semibold uppercase tracking-[0.16em] text-[#8aa0b8]">{item.reference}</span>
                            <span className="mt-2 block text-[0.92rem] font-medium text-[#6e8298]">{item.daysSinceUpdate}d since update</span>
                          </div>
                          <span
                            title={item.stageLabel}
                            className="inline-flex max-w-[136px] shrink-0 items-center overflow-hidden text-ellipsis whitespace-nowrap rounded-full border border-[#d9e7fb] bg-[#f8fbff] px-3 py-1.5 text-[0.64rem] font-semibold uppercase tracking-[0.09em] text-[#617a94]"
                          >
                            {item.stageLabel}
                          </span>
                        </div>

                        <div className="grid gap-2.5 pt-4">
                          <div className="flex items-start justify-between gap-3">
                            <strong className="line-clamp-2 block min-h-[2.9rem] text-[1.08rem] font-semibold tracking-[-0.025em] text-[#142132]">{item.buyerName}</strong>
                            <span className="inline-flex shrink-0 items-center rounded-full border border-[#d9e7fb] bg-[#f8fbff] px-3 py-1 text-[0.72rem] font-semibold text-[#617a94]">
                              {item.financeType === 'combination' ? 'Hybrid' : 'Bond'}
                            </span>
                          </div>
                          <p className="line-clamp-1 min-h-[1.5rem] text-[0.92rem] leading-6 text-[#607387]">
                            {item.developmentName} • Unit {item.unitNumber}
                          </p>
                          <div className="flex flex-wrap gap-2">
                            <span className="inline-flex items-center rounded-full border border-[#dde7f1] bg-[#f8fbff] px-3 py-1 text-[0.78rem] font-semibold text-[#617a94]">
                              {item.bank}
                            </span>
                            <span className="inline-flex items-center rounded-full border border-[#dde7f1] bg-[#f8fbff] px-3 py-1 text-[0.78rem] font-semibold text-[#617a94]">
                              {item.missingDocuments} missing docs
                            </span>
                          </div>
                        </div>

                        <div className="mt-3 min-h-[72px] rounded-[18px] border border-[#edf2f7] bg-[#fbfdff] px-4 py-3">
                          <p className="line-clamp-3 text-sm leading-6 text-[#5f7287]">{item.nextAction}</p>
                        </div>

                        <div className="mt-3 border-t border-[#edf2f7] pt-4">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-[0.8rem] font-medium text-[#7b8ca2]">Application progress</span>
                            <span className="text-[0.82rem] font-semibold text-[#516579]">{item.progressPercent}%</span>
                          </div>
                          <div className="mt-3 h-2.5 rounded-full bg-[#e9f0f6]" aria-hidden>
                            <div className="h-full rounded-full bg-[linear-gradient(90deg,#35546c_0%,#6f90ab_100%)]" style={{ width: `${Math.max(item.progressPercent, 10)}%` }} />
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              </section>

              <section className={`mt-6 ${DASHBOARD_PANEL_CLASS}`}>
                <div className="mb-6">
                  <h3 className="text-[1.12rem] font-semibold tracking-[-0.025em] text-[#142132]">Performance & Insights</h3>
                  <p className="mt-2 text-[0.95rem] leading-7 text-[#6b7d93]">
                    Bank concentration, referral mix, application statuses, and conversion health across your assigned pipeline.
                  </p>
                </div>

                <div className="grid gap-5 xl:grid-cols-2">
                  <article className="rounded-[20px] border border-[#dde4ee] bg-[#fbfcfe] p-5">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <h4 className="text-[1rem] font-semibold text-[#142132]">Bank Comparison</h4>
                      <span className={DASHBOARD_CHIP_CLASS}>
                        <Building2 size={12} />
                        {bondPerformanceMetrics.bankComparison.length} banks
                      </span>
                    </div>
                    <div className="space-y-3.5">
                      {bondPerformanceMetrics.bankComparison.map((item) => (
                        <div key={item.bank} className="rounded-[14px] border border-[#dce6f2] bg-white px-3.5 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-[0.9rem] font-medium text-[#22374d]">{item.bank}</span>
                            <span className="text-[0.88rem] font-semibold text-[#142132]">{item.count}</span>
                          </div>
                          <div className="mt-2 h-2 rounded-full bg-[#e2eaf4]">
                            <span className="block h-full rounded-full bg-[#4f7da6]" style={{ width: `${Math.max(7, Math.min(100, item.width))}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </article>

                  <article className="rounded-[20px] border border-[#dde4ee] bg-[#fbfcfe] p-5">
                    <h4 className="text-[1rem] font-semibold text-[#142132]">Agent / Agency Comparison</h4>
                    <p className="mt-1 text-[0.86rem] text-[#6b7d93]">Ranked list by number of deals</p>
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <div className="rounded-[14px] border border-[#dce6f2] bg-white px-3.5 py-3">
                        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Top Agents</p>
                        <div className="mt-2 space-y-2.5">
                          {bondPerformanceMetrics.rankedAgents.map((item, index) => (
                            <div key={`agent-rank-${item.name}`} className="flex items-center justify-between gap-2 text-[0.88rem]">
                              <span className="truncate text-[#22374d]">{index + 1}. {item.name}</span>
                              <span className="font-semibold text-[#142132]">{item.deals}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="rounded-[14px] border border-[#dce6f2] bg-white px-3.5 py-3">
                        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Top Agencies</p>
                        <div className="mt-2 space-y-2.5">
                          {bondPerformanceMetrics.rankedAgencies.map((item, index) => (
                            <div key={`agency-rank-${item.name}`} className="flex items-center justify-between gap-2 text-[0.88rem]">
                              <span className="truncate text-[#22374d]">{index + 1}. {item.name}</span>
                              <span className="font-semibold text-[#142132]">{item.deals}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </article>

                  <article className="rounded-[20px] border border-[#dde4ee] bg-[#fbfcfe] p-5">
                    <h4 className="text-[1rem] font-semibold text-[#142132]">Application Status Breakdown</h4>
                    <p className="mt-1 text-[0.86rem] text-[#6b7d93]">New, awaiting docs, submitted, approved, declined</p>
                    <div className="mt-4 space-y-3">
                      {bondPerformanceMetrics.statusBreakdown.map((item) => {
                        const base = Math.max(bondPerformanceMetrics.conversionFunnel[0]?.count || 1, 1)
                        const width = ((item.count || 0) / base) * 100
                        return (
                          <div key={item.key} className="rounded-[14px] border border-[#dce6f2] bg-white px-3.5 py-3">
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-[0.9rem] font-medium text-[#22374d]">{item.label}</span>
                              <span className="text-[0.86rem] font-semibold text-[#142132]">{item.count}</span>
                            </div>
                            <div className="mt-2 h-2 rounded-full bg-[#e2eaf4]">
                              <span className="block h-full rounded-full bg-[#3c78a8]" style={{ width: `${Math.max(item.count ? 8 : 0, Math.min(100, width))}%` }} />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </article>

                  <article className="rounded-[20px] border border-[#dde4ee] bg-[#fbfcfe] p-5">
                    <h4 className="text-[1rem] font-semibold text-[#142132]">Conversion Funnel</h4>
                    <p className="mt-1 text-[0.86rem] text-[#6b7d93]">Deals received → applications submitted → approvals</p>
                    <div className="mt-4 space-y-3">
                      {bondPerformanceMetrics.conversionFunnel.map((item) => (
                        <div key={item.key} className="rounded-[14px] border border-[#dce6f2] bg-white px-3.5 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-[0.9rem] font-medium text-[#22374d]">{item.label}</span>
                            <span className="text-[0.86rem] font-semibold text-[#142132]">{item.count} ({formatPercent(item.share)})</span>
                          </div>
                          <div className="mt-2 h-2 rounded-full bg-[#e2eaf4]">
                            <span className="block h-full rounded-full bg-[#35546c]" style={{ width: `${Math.max(item.count ? 8 : 0, Math.min(100, item.width))}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </article>
                </div>
              </section>
            </>
          ) : (
            <></>
          )}

          {!isRoleScopedDashboard ? (
            <section className="mt-3 rounded-[22px] border border-[#dde4ee] bg-white px-4 py-3.5 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
              <div className="grid gap-2.5 lg:grid-cols-5">
                {summaryItems.map((item) => {
                  const Icon = item.icon
                  return (
                    <article
                      key={item.label}
                      className="rounded-[18px] border border-[#dde4ee] bg-white px-4 py-4 shadow-[0_4px_14px_rgba(15,23,42,0.05)]"
                    >
                      <div className="mb-2.5 flex items-start justify-between gap-3">
                        <span className="text-[0.95rem] font-medium tracking-[-0.01em] text-[#3b4f65]">{item.label}</span>
                        {Icon ? <Icon size={18} className="text-[#334155]" aria-hidden="true" /> : null}
                      </div>
                      <strong className="block text-[1.75rem] font-semibold leading-none tracking-[-0.035em] text-[#142132]">
                        {item.value}
                      </strong>
                    </article>
                  )
                })}
              </div>
            </section>
          ) : null}

          {!isRoleScopedDashboard ? (
          <section className="mt-3 rounded-[22px] border border-[#dde4ee] bg-white px-4 py-3.5 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
            {renderActiveTransactionsBlock({
              title: 'Active Transactions',
              description: 'Live deal execution across the portfolio, with the current stage and next action in one place.',
              limit: 6,
              compact: true,
              withDivider: false,
              variant: 'showcase',
            })}
          </section>
          ) : null}

          {!isRoleScopedDashboard ? (
            <section className="mt-4 grid gap-5">
              <section className="grid items-stretch gap-4 lg:grid-cols-2">
                <article className="flex h-full flex-col rounded-[22px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
                  <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <h3 className="text-[1.1rem] font-semibold tracking-[-0.025em] text-[#142132]">Transaction Funnel</h3>
                      <p className="mt-2 text-[0.96rem] leading-7 text-[#6b7d93]">High-level stage distribution and movement conversion.</p>
                    </div>
                    <span className="inline-flex items-center gap-2 rounded-full border border-[#dde4ee] bg-[#f7f9fc] px-3 py-1 text-[0.78rem] font-semibold text-[#66758b]">
                      <TrendingUp size={12} />
                      {rows.length} tracked units
                    </span>
                  </div>

                  <div className="flex flex-1 flex-col divide-y divide-[#edf2f7]">
                    {funnelData.map((item) => (
                      <div key={item.key} className="grid gap-3 py-4 md:grid-cols-[150px_220px_96px] md:items-center md:justify-between">
                        <div className="text-[0.98rem] font-medium tracking-[-0.02em] text-[#23384d]">{item.label}</div>
                        <div className="h-3 w-[220px] rounded-full bg-[#e7eef6]" aria-hidden>
                          <span
                            className="block h-full rounded-full bg-[#5c82a3]"
                            style={{ width: `${item.width}%` }}
                          />
                        </div>
                        <div className="flex flex-col items-end justify-center text-right">
                          <div className="flex items-baseline gap-2 leading-none">
                            <strong className="text-[0.98rem] font-semibold text-[#142132]">{item.count}</strong>
                            <em className="text-[0.78rem] not-italic font-medium text-[#6b7d93]">{formatPercent(item.share)}</em>
                          </div>
                          {item.conversion !== null ? (
                            <small className="mt-1 text-[0.74rem] leading-none text-[#8da0b5]">{formatPercent(item.conversion)} prev</small>
                          ) : (
                            <small className="mt-1 text-[0.74rem] leading-none text-[#8da0b5]">-</small>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </article>

                <article className="flex h-full flex-col rounded-[22px] border border-[#dde4ee] bg-white p-4 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
                  <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <h3 className="text-[1.1rem] font-semibold tracking-[-0.025em] text-[#142132]">Cash vs Bond Buyers</h3>
                      <p className="mt-1.5 text-[0.88rem] leading-5 text-[#6b7d93]">Buyer financing split by transaction count and value.</p>
                    </div>
                    <span className="inline-flex items-center gap-2 rounded-full border border-[#dde4ee] bg-[#f7f9fc] px-2.5 py-1 text-[0.72rem] font-semibold text-[#66758b]">
                      <PieChart size={12} />
                      {financeMix.totalCount} active
                    </span>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-[152px_minmax(0,1fr)] lg:items-center">
                    <div className="mx-auto h-[152px] w-[152px] rounded-full" style={{ background: financeMix.gradient }} aria-hidden="true">
                      <div className="mx-auto mt-[30px] h-[92px] w-[92px] rounded-full bg-white" />
                    </div>

                    <ul className="grid gap-2">
                      {financeLegendSegments.map((item) => (
                        <li key={item.key} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-[16px] border border-[#e3ebf4] bg-[#fbfcfe] px-3.5 py-2">
                          <span className="h-3 w-3 rounded-full" style={{ background: FINANCE_MIX_COLORS[item.key] }} />
                          <div className="min-w-0">
                            <strong className="block text-[0.9rem] font-semibold text-[#142132]">{item.label}</strong>
                            <small className="block text-[0.78rem] text-[#7c8ea4]">{currency.format(item.value || 0)}</small>
                          </div>
                          <em className="text-[0.94rem] not-italic font-semibold text-[#35546c]">{item.count}</em>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <section className="mt-4 rounded-[18px] border border-[#e3ebf4] bg-[#fbfcfe] p-3.5">
                    <div className="mb-2.5">
                      <strong className="block text-[0.92rem] font-semibold text-[#142132]">Finance Snapshot</strong>
                      <span className="text-[0.78rem] text-[#7c8ea4]">Current funding mix at a glance</span>
                    </div>
                    <div className="grid gap-2.5 sm:grid-cols-2">
                      {financeMixSnapshot.map((item) => (
                        <article key={item.label} className="rounded-[16px] border border-[#e3ebf4] bg-white px-3.5 py-3">
                          <span className="block text-[0.76rem] uppercase tracking-[0.08em] text-[#7b8ca2]">{item.label}</span>
                          <strong className="mt-1.5 block text-[1.08rem] font-semibold tracking-[-0.025em] text-[#142132]">{item.value}</strong>
                        </article>
                      ))}
                    </div>
                  </section>
                </article>
              </section>

              <section className="rounded-[22px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
                <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <h3 className="text-[1.1rem] font-semibold tracking-[-0.025em] text-[#142132]">Stage Aging Heatmap</h3>
                    <p className="mt-2 text-[0.98rem] leading-7 text-[#6b7d93]">How long transactions have been sitting at each master stage.</p>
                  </div>
                  <span className="inline-flex items-center gap-2 rounded-full border border-[#dde4ee] bg-[#f7f9fc] px-3 py-1 text-[0.78rem] font-semibold text-[#66758b]">
                    <TrendingUp size={12} />
                    {stageAging.totalTracked} tracked deals
                  </span>
                </div>

                <div className="grid grid-cols-[minmax(120px,160px)_repeat(4,minmax(0,1fr))] gap-3" role="table" aria-label="Stage aging heatmap by day buckets">
                  <div className="px-3 py-2 text-[0.78rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]" role="columnheader">
                    Stage
                  </div>
                  {STAGE_AGING_BUCKETS.map((bucket) => (
                    <div key={bucket.key} className="px-3 py-2 text-center text-[0.78rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]" role="columnheader">
                      {bucket.label}
                    </div>
                  ))}

                  {stageAging.stages.map((stage) => (
                    <Fragment key={stage.key}>
                      <div className="flex items-center px-3 py-3 text-[0.95rem] font-medium text-[#23384d]" role="rowheader">
                        {stage.label}
                      </div>
                      {stage.cells.map((cell) => {
                        const level = getHeatLevel(cell.count, stageAging.maxCellCount)
                        const toneClass =
                          level >= 4
                            ? 'bg-[#35546c] text-white'
                            : level === 3
                              ? 'bg-[#5f84a7] text-white'
                              : level === 2
                                ? 'bg-[#dfe9f4] text-[#35546c]'
                                : level === 1
                                  ? 'bg-[#eef4f9] text-[#6b7d93]'
                                  : 'bg-[#f8fafc] text-[#97a6b8]'

                        return (
                          <div
                            key={`${stage.key}-${cell.key}`}
                            className={`flex min-h-[54px] items-center justify-center rounded-[14px] border border-[#e4ebf4] text-[0.95rem] font-semibold ${toneClass}`}
                            title={`${stage.label}: ${cell.count} deal${cell.count === 1 ? '' : 's'} in ${cell.label}`}
                            role="cell"
                          >
                            {cell.count}
                          </div>
                        )
                      })}
                    </Fragment>
                  ))}
                </div>
              </section>

              {/* TODO(bridge): Reintroduce marketing/demographic analytics once buyer profile fields are intentionally modeled and consistently populated. */}
            </section>
          ) : null}

        </>
      ) : null}
    </section>
  )
}

export default Dashboard
