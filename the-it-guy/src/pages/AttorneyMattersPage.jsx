import {
  AlertTriangle,
  ArrowRight,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  Clock3,
  Flag,
  FileText,
  Mail,
  MoreHorizontal,
  Plus,
  Save,
  SlidersHorizontal,
  UserRound,
  UsersRound,
  XCircle,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import useAttorneyPermissions from '../hooks/useAttorneyPermissions'
import {
  ATTORNEY_MATTER_PAGE_SIZES,
  buildAttorneyMatterWorkspace,
  getAttorneyMatterWorkspace,
} from '../services/attorneyMatterWorkspace'
import {
  acceptAttorneyIncomingMatterInstruction,
  declineAttorneyIncomingMatterInstruction,
} from '../lib/api'

const DEFAULT_FILTERS = {
  status: 'all',
  matterType: 'all',
  attorney: 'all',
  assistant: 'all',
  branch: 'all',
  partner: 'all',
  development: 'all',
  municipality: 'all',
  bank: 'all',
  dateInstructed: 'all',
  expectedRegistration: 'all',
  expectedLodgement: 'all',
  priority: 'all',
  matterValue: 'all',
}

const KPI_ICONS = {
  active_matters: BriefcaseBusiness,
  awaiting_client: UsersRound,
  lodgement_today: CalendarDays,
  registration_this_week: Flag,
  delayed: AlertTriangle,
}

const KPI_TONES = {
  emerald: {
    icon: 'bg-emerald-50 text-emerald-700',
    line: '#0f8a6a',
    helper: 'text-emerald-700',
  },
  amber: {
    icon: 'bg-orange-50 text-orange-700',
    line: '#f97316',
    helper: 'text-orange-700',
  },
  blue: {
    icon: 'bg-blue-50 text-blue-700',
    line: '#477cff',
    helper: 'text-blue-700',
  },
  violet: {
    icon: 'bg-violet-50 text-violet-700',
    line: '#8b5cf6',
    helper: 'text-violet-700',
  },
  red: {
    icon: 'bg-red-50 text-red-700',
    line: '#ef4444',
    helper: 'text-red-700',
  },
}

const STATUS_STYLES = {
  Active: 'bg-emerald-50 text-emerald-700',
  Attention: 'bg-orange-50 text-orange-700',
  Delayed: 'bg-red-50 text-red-700',
  Registered: 'bg-blue-50 text-blue-700',
  Archived: 'bg-slate-100 text-slate-600',
  'Buyer Onboarding': 'bg-slate-100 text-slate-700',
  'Awaiting Signed OTP': 'bg-orange-50 text-orange-700',
  'Awaiting Documents': 'bg-blue-50 text-blue-700',
  'Ready For Acceptance': 'bg-violet-50 text-violet-700',
  'Awaiting Buyer': 'bg-amber-50 text-amber-700',
}

const WAITING_ON_STYLES = {
  Buyer: 'border-amber-200 bg-amber-50 text-amber-700',
  'Buyer onboarding': 'border-slate-200 bg-slate-50 text-slate-700',
  'Signed OTP': 'border-orange-200 bg-orange-50 text-orange-700',
  Documents: 'border-blue-200 bg-blue-50 text-blue-700',
  'Attorney acceptance': 'border-violet-200 bg-violet-50 text-violet-700',
  'Instruction review': 'border-emerald-200 bg-emerald-50 text-[#00614f]',
}

const QUICK_FILTER_ICONS = {
  today: CalendarDays,
  this_week: CalendarDays,
  needs_attention: AlertTriangle,
  my_matters: UserRound,
  unassigned: UsersRound,
  awaiting_client: UsersRound,
  awaiting_signed_otp: ClipboardCheck,
  awaiting_documents: FileText,
  ready_for_acceptance: CheckCircle2,
  awaiting_buyer: UsersRound,
  document_blockers: AlertTriangle,
  delayed: AlertTriangle,
  due_for_registration: Flag,
}

function classNames(...values) {
  return values.filter(Boolean).join(' ')
}

function formatNumber(value) {
  return new Intl.NumberFormat('en-ZA').format(Number(value || 0))
}

function normalize(value = '') {
  return String(value || '').trim().toLowerCase()
}

function formatDue(value) {
  const date = new Date(value || '')
  if (Number.isNaN(date.getTime())) return '-'

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const target = new Date(date)
  target.setHours(0, 0, 0, 0)

  if (target.getTime() === today.getTime()) return 'Today'
  if (target.getTime() === tomorrow.getTime()) return 'Tomorrow'
  return date.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatShortDate(value) {
  const date = new Date(value || '')
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatIncomingAge(value) {
  const days = Number(value || 0)
  if (!days) return 'Today'
  if (days === 1) return '1 day'
  return `${days} days`
}

function dueTone(value, status) {
  const date = new Date(value || '')
  if (status === 'Delayed') return 'text-red-600'
  if (Number.isNaN(date.getTime())) return 'text-slate-500'

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const target = new Date(date)
  target.setHours(0, 0, 0, 0)

  if (target < today) return 'text-red-600'
  if (target.getTime() <= tomorrow.getTime()) return 'text-orange-600'
  return 'text-slate-700'
}

function LoadingState({ copy = 'Loading attorney matters...' }) {
  return (
    <section className="w-full px-3 py-4">
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-sm font-medium text-slate-500">{copy}</p>
      </div>
    </section>
  )
}

function ErrorState({ children }) {
  return (
    <section className="w-full px-3 py-4">
      <div className="rounded-xl border border-red-200 bg-white p-5 text-sm font-medium text-red-700 shadow-sm">
        {children}
      </div>
    </section>
  )
}

function MiniSparkline({ values = [], color = '#0f8a6a' }) {
  const points = values.length ? values : [1, 2, 1, 3, 2, 4]
  const max = Math.max(...points, 1)
  const coordinates = points.map((value, index) => {
    const x = (index / Math.max(points.length - 1, 1)) * 54
    const y = 24 - (Number(value || 0) / max) * 20
    return `${x},${y}`
  }).join(' ')

  return (
    <svg viewBox="0 0 56 28" className="h-8 w-14" aria-hidden="true">
      <polyline fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" points={coordinates} />
    </svg>
  )
}

function KpiCard({ item }) {
  const Icon = KPI_ICONS[item.key] || BriefcaseBusiness
  const tone = KPI_TONES[item.tone] || KPI_TONES.emerald

  return (
    <article className="grid min-h-[116px] grid-cols-[1fr_auto] gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="min-w-0">
        <span className={classNames('inline-flex h-11 w-11 items-center justify-center rounded-[14px]', tone.icon)}>
          <Icon size={19} />
        </span>
        <p className="mt-3 truncate text-sm font-semibold text-slate-700">{item.label}</p>
        <p className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">{formatNumber(item.value)}</p>
        <p className={classNames('mt-1 truncate text-xs font-semibold', tone.helper)}>{item.helper}</p>
      </div>
      <div className="flex items-end">
        <MiniSparkline values={item.sparkline} color={tone.line} />
      </div>
    </article>
  )
}

function FilterButton({ active, children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={classNames(
        'inline-flex h-9 shrink-0 items-center justify-center rounded-lg border px-3 text-sm font-semibold transition',
        active
          ? 'border-[#00614f] bg-[#00614f] text-white shadow-sm'
          : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50',
      )}
    >
      {children}
    </button>
  )
}

function FilterGroup({ label, options = [], value, onChange }) {
  return (
    <div className="min-w-0">
      <p className="mb-2 text-xs font-semibold text-slate-600">{label}</p>
      <div className="flex max-w-full gap-2 overflow-x-auto pb-1">
        {options.map((option) => (
          <FilterButton key={option.key || option.value} active={value === (option.key || option.value)} onClick={() => onChange(option.key || option.value)}>
            {option.label}
          </FilterButton>
        ))}
      </div>
    </div>
  )
}

function SelectFilter({ label, value, options = [], onChange }) {
  return (
    <label className="grid min-w-[220px] gap-2">
      <span className="text-xs font-semibold text-slate-600">{label}</span>
      <span className="relative">
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-9 w-full appearance-none rounded-lg border border-slate-200 bg-white px-3 pr-8 text-sm font-semibold text-slate-700 outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-50"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
      </span>
    </label>
  )
}

function MatterWorkspaceHeader({ summary, view, onSaveView }) {
  const activeView = view || {
    title: 'All Matters',
    description: '',
    primaryMetric: 'activeMatters',
    primaryMetricLabel: 'Active Matters',
  }
  const primaryMetricKey = activeView.primaryMetric || 'activeMatters'
  const primaryMetricValue = summary[primaryMetricKey] ?? summary.activeMatters
  const legend = activeView.usesIncomingQueue
    ? [
        { label: 'Awaiting Buyer', value: summary.awaitingBuyer, dot: 'bg-amber-400' },
        { label: 'Awaiting Signed OTP', value: summary.awaitingSignedOtp, dot: 'bg-orange-400' },
        { label: 'Awaiting Documents', value: summary.awaitingDocuments, dot: 'bg-blue-500' },
        { label: 'Ready For Acceptance', value: summary.readyForAcceptance, dot: 'bg-violet-500' },
      ]
    : activeView.lockedMatterType
    ? [
        { label: 'Needs Attention', value: summary.attentionMatters, dot: 'bg-orange-400' },
        { label: 'Delayed', value: summary.delayedMatters, dot: 'bg-red-500' },
        { label: 'Registered', value: summary.registeredMatters, dot: 'bg-blue-500' },
      ]
    : [
        { label: 'Transfer', value: summary.transferCount, dot: 'bg-emerald-500' },
        { label: 'Bond', value: summary.bondCount, dot: 'bg-violet-500' },
        { label: 'Cancellation', value: summary.cancellationCount, dot: 'bg-orange-400' },
      ]

  if (!activeView.lockedMatterType && summary.developmentCount) {
    legend.push({ label: 'Development', value: summary.developmentCount, dot: 'bg-blue-500' })
  }

  return (
    <section className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div className="min-w-0">
        <h1 className="text-[clamp(1.7rem,2vw,2.35rem)] font-semibold tracking-tight text-slate-950">{activeView.title}</h1>
        <p className="mt-2 text-lg font-semibold text-slate-900">{formatNumber(primaryMetricValue)} {activeView.primaryMetricLabel}</p>
        {activeView.description ? <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">{activeView.description}</p> : null}
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-sm text-slate-700">
          {legend.map((item) => (
            <span key={item.label} className="inline-flex items-center gap-2">
              <span className={classNames('h-2.5 w-2.5 rounded-full', item.dot)} />
              {formatNumber(item.value)} {item.label}
            </span>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onSaveView}
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
        >
          <Save size={16} />
          Save View
        </button>
        <Link
          to="/new-transaction"
          className="inline-flex h-11 items-center gap-2 rounded-lg bg-[#00463d] px-4 text-sm font-semibold text-white shadow-[0_14px_28px_rgba(0,70,61,0.18)] transition hover:bg-[#00614f]"
        >
          <Plus size={17} />
          Create Matter
          <ChevronDown size={15} />
        </Link>
      </div>
    </section>
  )
}

function UnifiedFilterBar({ workspace, filters, onFilterChange, onOpenMoreFilters }) {
  const lockedMatterType = workspace.view?.lockedMatterType || (workspace.view?.usesIncomingQueue ? 'transfer' : '')
  const lockedMatterTypeOption = lockedMatterType
    ? workspace.filters.matterTypes.find((option) => (option.key || option.value) === lockedMatterType)
    : null

  return (
    <section className="grid gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1.35fr)_260px_auto] xl:items-end">
      <FilterGroup
        label="Status"
        options={workspace.filters.statuses}
        value={filters.status}
        onChange={(value) => onFilterChange('status', value)}
      />
      {lockedMatterType ? (
        <div className="min-w-0">
          <p className="mb-2 text-xs font-semibold text-slate-600">Matter Type</p>
          <span className="inline-flex h-9 max-w-full items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-sm font-semibold text-[#00614f]">
            <CheckCircle2 size={15} />
            <span className="truncate">{lockedMatterTypeOption?.label || workspace.view.title}</span>
          </span>
        </div>
      ) : (
        <FilterGroup
          label="Matter Type"
          options={workspace.filters.matterTypes}
          value={filters.matterType}
          onChange={(value) => onFilterChange('matterType', value)}
        />
      )}
      <SelectFilter
        label="Assignee"
        value={filters.attorney}
        options={workspace.filters.attorneys}
        onChange={(value) => onFilterChange('attorney', value)}
      />
      <button
        type="button"
        onClick={onOpenMoreFilters}
        className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
      >
        <SlidersHorizontal size={16} />
        More Filters
      </button>
    </section>
  )
}

function QuickFilters({ quickFilters = [], activeFilter, onChange, onSaveView }) {
  return (
    <section className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Quick Filters</p>
      <div className="flex max-w-full gap-2 overflow-x-auto pb-1">
        {quickFilters.map((filter) => {
          const Icon = QUICK_FILTER_ICONS[filter.key] || CalendarDays
          const active = activeFilter === filter.key
          return (
            <button
              key={filter.key}
              type="button"
              onClick={() => onChange(active ? '' : filter.key)}
              className={classNames(
                'inline-flex h-10 shrink-0 items-center gap-2 rounded-lg border px-4 text-sm font-semibold transition',
                active
                  ? 'border-[#00614f] bg-emerald-50 text-[#00614f]'
                  : filter.key === 'needs_attention' || filter.key === 'delayed'
                    ? 'border-slate-200 bg-white text-red-600 hover:bg-red-50'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50',
              )}
            >
              <Icon size={16} />
              {filter.label}
            </button>
          )
        })}
        <button
          type="button"
          onClick={onSaveView}
          className="ml-auto inline-flex h-10 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-[#00614f] transition hover:bg-emerald-50"
        >
          <Plus size={16} />
          Save View
        </button>
      </div>
    </section>
  )
}

function MoreFiltersDrawer({ open, workspace, filters, savedViews, onFilterChange, onApplySavedView, onClose }) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/20 backdrop-blur-[1px]" role="dialog" aria-modal="true">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Close filters" onClick={onClose} />
      <aside className="relative h-full w-full max-w-[420px] overflow-y-auto border-l border-slate-200 bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">More Filters</h2>
            <p className="mt-1 text-sm text-slate-500">Refine the operational queue without splitting the table.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">
            Close
          </button>
        </div>

        <div className="mt-5 grid gap-4">
          <SelectFilter label="Assigned attorney" value={filters.attorney} options={workspace.filters.attorneys} onChange={(value) => onFilterChange('attorney', value)} />
          <SelectFilter label="Assistant" value={filters.assistant} options={workspace.filters.assistants} onChange={(value) => onFilterChange('assistant', value)} />
          <SelectFilter label="Branch" value={filters.branch} options={workspace.filters.branches} onChange={(value) => onFilterChange('branch', value)} />
          <SelectFilter label="Partner" value={filters.partner} options={workspace.filters.partners} onChange={(value) => onFilterChange('partner', value)} />
          <SelectFilter label="Development" value={filters.development} options={workspace.filters.developments} onChange={(value) => onFilterChange('development', value)} />
          <SelectFilter label="Municipality" value={filters.municipality} options={workspace.filters.municipalities} onChange={(value) => onFilterChange('municipality', value)} />
          <SelectFilter label="Bank" value={filters.bank} options={workspace.filters.banks} onChange={(value) => onFilterChange('bank', value)} />
          <SelectFilter label="Date instructed" value={filters.dateInstructed} options={workspace.filters.dateRanges} onChange={(value) => onFilterChange('dateInstructed', value)} />
          <SelectFilter label="Expected registration" value={filters.expectedRegistration} options={workspace.filters.dateRanges} onChange={(value) => onFilterChange('expectedRegistration', value)} />
          <SelectFilter label="Expected lodgement" value={filters.expectedLodgement} options={workspace.filters.dateRanges} onChange={(value) => onFilterChange('expectedLodgement', value)} />
          <SelectFilter label="Priority" value={filters.priority} options={workspace.filters.priorities} onChange={(value) => onFilterChange('priority', value)} />
          <SelectFilter label="Matter value" value={filters.matterValue} options={workspace.filters.matterValues} onChange={(value) => onFilterChange('matterValue', value)} />
        </div>

        <section className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <h3 className="text-sm font-semibold text-slate-950">Saved Views</h3>
          <div className="mt-3 grid gap-2">
            {savedViews.map((view) => (
              <button
                key={view.id}
                type="button"
                onClick={() => onApplySavedView(view)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-sm font-semibold text-slate-700 transition hover:border-emerald-200 hover:text-[#00614f]"
              >
                {view.name}
              </button>
            ))}
          </div>
        </section>
      </aside>
    </div>
  )
}

function StageProgress({ stage }) {
  return (
    <div className="min-w-[150px]">
      <div className="flex items-center gap-1.5" aria-label={`Stage ${stage.label}`}>
        {stage.steps.map((step, index) => {
          const complete = index < stage.index
          const current = index === stage.index
          return (
            <span key={step} className="flex items-center gap-1.5">
              <span
                className={classNames(
                  'h-2.5 w-2.5 rounded-full border',
                  current
                    ? 'border-[#00614f] bg-white ring-2 ring-[#00614f]'
                    : complete
                      ? 'border-[#00614f] bg-[#00614f]'
                      : 'border-slate-300 bg-slate-200',
                )}
              />
              {index < stage.steps.length - 1 ? (
                <span className={classNames('h-px w-5', complete ? 'bg-[#00614f]' : 'bg-slate-200')} />
              ) : null}
            </span>
          )
        })}
      </div>
      <p className="mt-2 text-xs font-medium text-slate-500">{stage.label}</p>
    </div>
  )
}

function StatusPill({ status }) {
  return (
    <span className={classNames('inline-flex rounded-lg px-3 py-1 text-xs font-semibold', STATUS_STYLES[status] || STATUS_STYLES.Active)}>
      {status}
    </span>
  )
}

function Assignee({ person }) {
  return (
    <div className="flex min-w-[150px] items-center gap-2">
      <span className="inline-grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#00463d] text-xs font-semibold text-white">
        {person.initials}
      </span>
      <span className="truncate text-sm font-medium text-slate-700">{person.name}</span>
    </div>
  )
}

function getMatterPreview(row = {}) {
  return {
    matterId: row.matterId,
    matterReference: row.matterReference || row.reference,
    financeType: row.financeType || '',
    purchasePrice: row.purchasePrice || row.matterValue || 0,
    sellerName: row.sellerName || row.seller || '',
    sellerHasExistingBond: row.sellerHasExistingBond || false,
    currentBondBank: row.currentBondBank || row.bank || '',
    estimatedSettlementAmount: row.estimatedSettlementAmount || 0,
    propertyLabel: row.propertyLabel || row.property || '',
    lifecycleState: row.lifecycleState || 'active',
    currentStage: row.currentStage || row.stage?.label || '',
    registrationDate: row.registrationDate || null,
    lastUpdated: row.lastUpdated || row.lastActivity || row.createdAt || null,
    buyerName: row.buyerName || row.buyer || '',
    clientName: row.clientName || row.buyer || '',
    developmentName: row.developmentName || row.development || '',
  }
}

function RowActions({ row }) {
  const preview = getMatterPreview(row)
  return (
    <details className="relative" onClick={(event) => event.stopPropagation()}>
      <summary className="inline-flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900">
        <MoreHorizontal size={17} />
      </summary>
      <div className="absolute right-0 z-20 mt-2 w-52 rounded-xl border border-slate-200 bg-white p-2 text-sm font-semibold text-slate-700 shadow-xl">
        <Link className="block rounded-lg px-3 py-2 hover:bg-slate-50" to={row.actionHref} state={{ matterPreview: preview }}>Open Matter</Link>
        <button type="button" className="block w-full rounded-lg px-3 py-2 text-left hover:bg-slate-50">Assign</button>
        <button type="button" className="block w-full rounded-lg px-3 py-2 text-left hover:bg-slate-50">Reassign</button>
        <button type="button" className="block w-full rounded-lg px-3 py-2 text-left hover:bg-slate-50">Generate Document</button>
        <button type="button" className="block w-full rounded-lg px-3 py-2 text-left hover:bg-slate-50">Request Document</button>
        <button type="button" className="block w-full rounded-lg px-3 py-2 text-left hover:bg-slate-50">Schedule Appointment</button>
        <button type="button" className="block w-full rounded-lg px-3 py-2 text-left text-red-600 hover:bg-red-50">Archive</button>
      </div>
    </details>
  )
}

function canAcceptIncomingMatter(row = {}) {
  if (row.firmAcceptanceStatus === 'accepted' || row.allocationState === 'awaiting_staff_assignment' || row.allocationState === 'staff_assigned') {
    return false
  }
  return row.statusKey === 'ready_for_acceptance' || row.status === 'Ready For Acceptance'
}

function canDeclineIncomingMatter(row = {}) {
  if (row.isPreInstruction) return false
  return !['accepted', 'declined', 'removed', 'completed'].includes(normalize(row.statusKey || row.status))
}

function IncomingRowActions({ row, onAcceptMatter, onDeclineMatter, accepting = false, declining = false }) {
  const href = row.actionHref || '#'
  const preview = getMatterPreview(row)
  const readyForAcceptance = canAcceptIncomingMatter(row)
  const canDecline = canDeclineIncomingMatter(row)

  return (
    <details className="relative" onClick={(event) => event.stopPropagation()}>
      <summary className="inline-flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900">
        <MoreHorizontal size={17} />
      </summary>
      <div className="absolute right-0 z-20 mt-2 w-56 rounded-xl border border-slate-200 bg-white p-2 text-sm font-semibold text-slate-700 shadow-xl">
        {row.actionHref ? (
          <Link className="block rounded-lg px-3 py-2 hover:bg-slate-50" to={href} state={{ matterPreview: preview }}>
            {row.isPreInstruction ? 'Open Signed Mandate' : 'Open Transfer'}
          </Link>
        ) : null}
        {readyForAcceptance ? (
          <button
            type="button"
            disabled={accepting}
            onClick={() => onAcceptMatter?.(row)}
            className="block w-full rounded-lg px-3 py-2 text-left text-[#00614f] hover:bg-emerald-50 disabled:cursor-wait disabled:opacity-60"
          >
            {accepting ? 'Accepting Transfer' : 'Accept Transfer'}
          </button>
        ) : null}
        {canDecline ? (
          <button
            type="button"
            disabled={declining}
            onClick={() => onDeclineMatter?.(row)}
            className="block w-full rounded-lg px-3 py-2 text-left text-red-600 hover:bg-red-50 disabled:cursor-wait disabled:opacity-60"
          >
            {declining ? 'Declining Transfer' : 'Decline Transfer'}
          </button>
        ) : null}
        {row.isPreInstruction ? (
          <p className="px-3 py-2 text-xs font-medium leading-5 text-slate-500">Formal instruction actions unlock after an accepted OTP.</p>
        ) : (
          <>
            <button type="button" className="block w-full rounded-lg px-3 py-2 text-left hover:bg-slate-50">Follow Up OTP</button>
            <button type="button" className="block w-full rounded-lg px-3 py-2 text-left hover:bg-slate-50">Request Documents</button>
            <button type="button" className="block w-full rounded-lg px-3 py-2 text-left hover:bg-slate-50">Assign Attorney</button>
            <button type="button" className="block w-full rounded-lg px-3 py-2 text-left hover:bg-slate-50">Email Client</button>
          </>
        )}
      </div>
    </details>
  )
}

function WaitingOnChips({ labels = [] }) {
  const nextLabels = labels.length ? labels : ['Instruction review']

  return (
    <div className="flex min-w-[170px] flex-wrap gap-1.5">
      {nextLabels.map((label) => (
        <span
          key={label}
          className={classNames(
            'inline-flex items-center rounded-lg border px-2.5 py-1 text-xs font-semibold',
            WAITING_ON_STYLES[label] || WAITING_ON_STYLES['Instruction review'],
          )}
        >
          {label}
        </span>
      ))}
    </div>
  )
}

function DocumentSignal({ documents = {} }) {
  const openCount = Number(documents.openCount || 0)
  const reviewCount = Number(documents.reviewCount || 0)
  const rejectedCount = Number(documents.rejectedCount || 0)
  const totalBlockers = openCount + reviewCount + rejectedCount
  const parts = [
    openCount ? `${openCount} open` : '',
    reviewCount ? `${reviewCount} in review` : '',
    rejectedCount ? `${rejectedCount} rejected` : '',
  ].filter(Boolean)

  return (
    <div className="min-w-[150px]">
      <span
        className={classNames(
          'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold',
          totalBlockers ? 'bg-blue-50 text-blue-700' : 'bg-emerald-50 text-emerald-700',
        )}
      >
        <FileText size={14} />
        {totalBlockers ? `${totalBlockers} blocker${totalBlockers === 1 ? '' : 's'}` : 'Clear'}
      </span>
      {parts.length ? <p className="mt-1 text-xs font-medium text-slate-500">{parts.join(', ')}</p> : null}
    </div>
  )
}

function IncomingMattersTable({
  rows = [],
  selectedRows = [],
  onToggleRow,
  onToggleAll,
  onOpenMatter,
  onAcceptMatter,
  onDeclineMatter,
  acceptingMatterId = '',
  decliningMatterId = '',
}) {
  const allSelected = rows.length > 0 && rows.every((row) => selectedRows.includes(row.matterId))

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1180px] border-collapse text-left text-sm">
          <thead className="bg-white text-[0.68rem] uppercase tracking-[0.12em] text-slate-500">
            <tr>
              <th className="w-10 border-b border-slate-200 px-4 py-3">
                <input type="checkbox" checked={allSelected} onChange={(event) => onToggleAll(event.target.checked)} aria-label="Select all incoming matters" />
              </th>
              <th className="border-b border-slate-200 px-4 py-3 font-semibold">Incoming Transfer</th>
              <th className="border-b border-slate-200 px-4 py-3 font-semibold">Parties / Property</th>
              <th className="border-b border-slate-200 px-4 py-3 font-semibold">Waiting On</th>
              <th className="border-b border-slate-200 px-4 py-3 font-semibold">Documents</th>
              <th className="border-b border-slate-200 px-4 py-3 font-semibold">Incoming Since</th>
              <th className="border-b border-slate-200 px-4 py-3 font-semibold">Assigned To</th>
              <th className="border-b border-slate-200 px-4 py-3 font-semibold">Next Action</th>
              <th className="border-b border-slate-200 px-4 py-3 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => {
              const selected = selectedRows.includes(row.matterId)
              const href = row.actionHref || '#'
              const preview = getMatterPreview(row)
              const readyForAcceptance = canAcceptIncomingMatter(row)
              const accepting = acceptingMatterId === row.assignmentId
              const declining = decliningMatterId === row.assignmentId
              return (
                <tr
                  key={row.assignmentId || row.matterId}
                  className="group cursor-pointer align-middle transition hover:bg-slate-50/70 focus-within:bg-slate-50/70"
                  role="button"
                  tabIndex={0}
                  onClick={() => onOpenMatter?.(row)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      onOpenMatter?.(row)
                    }
                  }}
                >
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selected}
                      onClick={(event) => event.stopPropagation()}
                      onChange={() => onToggleRow(row.matterId)}
                      aria-label={`Select ${row.reference}`}
                    />
                  </td>
                  <td className="min-w-[190px] px-4 py-3">
                    <p className="font-semibold text-slate-950">{row.reference}</p>
                    <div className="mt-2"><StatusPill status={row.status} /></div>
                  </td>
                  <td className="max-w-[280px] px-4 py-3">
                    <p className="truncate font-medium text-slate-800">{row.buyer}</p>
                    <p className="mt-1 truncate text-xs text-slate-500">{row.seller}</p>
                    <p className="mt-2 truncate text-sm font-semibold text-slate-700">{row.property}</p>
                    {row.development || row.unit ? (
                      <p className="mt-1 truncate text-xs text-slate-500">
                        {[row.development, row.unit ? `Unit ${row.unit}` : ''].filter(Boolean).join(' / ')}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3"><WaitingOnChips labels={row.waitingOnLabels} /></td>
                  <td className="px-4 py-3"><DocumentSignal documents={row.documents} /></td>
                  <td className="min-w-[150px] px-4 py-3">
                    <p className="inline-flex items-center gap-1.5 font-semibold text-slate-800">
                      <Clock3 size={15} className="text-slate-400" />
                      {formatShortDate(row.createdAt || row.lastActivity)}
                    </p>
                    <p className="mt-1 text-xs font-medium text-slate-500">{formatIncomingAge(row.incomingAgeDays)} in queue</p>
                  </td>
                  <td className="px-4 py-3"><Assignee person={row.assignedAttorney} /></td>
                  <td className="min-w-[240px] px-4 py-3">
                    <p className="font-semibold leading-5 text-slate-800">{row.nextAction}</p>
                    <div className="mt-2 hidden flex-wrap gap-3 group-hover:flex">
                      {readyForAcceptance ? (
                        <button
                          type="button"
                          disabled={accepting}
                          onClick={(event) => {
                            event.stopPropagation()
                            onAcceptMatter?.(row)
                          }}
                          className="text-xs font-semibold text-[#00614f] disabled:cursor-wait disabled:opacity-60"
                        >
                          {accepting ? 'Accepting' : 'Accept Transfer'}
                        </button>
                      ) : null}
                      {row.actionHref ? (
                        <Link to={href} state={{ matterPreview: preview }} onClick={(event) => event.stopPropagation()} className="text-xs font-semibold text-[#00614f]">
                          {row.isPreInstruction ? 'Open Mandate' : 'Open Transfer'}
                        </Link>
                      ) : null}
                      {!row.isPreInstruction ? (
                        <>
                          <button type="button" onClick={(event) => event.stopPropagation()} className="text-xs font-semibold text-slate-500 hover:text-[#00614f]">Documents</button>
                          <button type="button" onClick={(event) => event.stopPropagation()} className="text-xs font-semibold text-slate-500 hover:text-[#00614f]">Email Client</button>
                        </>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {readyForAcceptance ? (
                        <button
                          type="button"
                          disabled={accepting}
                          onClick={(event) => {
                            event.stopPropagation()
                            onAcceptMatter?.(row)
                          }}
                          className="inline-flex h-9 min-w-[118px] items-center justify-center gap-1.5 rounded-lg bg-[#00463d] px-3 text-xs font-semibold text-white shadow-sm transition hover:bg-[#00614f] disabled:cursor-wait disabled:opacity-70"
                        >
                          <CheckCircle2 size={14} />
                          {accepting ? 'Accepting' : 'Accept Transfer'}
                        </button>
                      ) : row.actionHref ? (
                        <Link
                          to={href}
                          state={{ matterPreview: preview }}
                          onClick={(event) => event.stopPropagation()}
                          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#00463d] px-3 text-xs font-semibold text-white shadow-sm transition hover:bg-[#00614f]"
                        >
                          {row.isPreInstruction ? 'Open Mandate' : 'Open Transfer'}
                          <ArrowRight size={14} />
                        </Link>
                      ) : null}
                      {readyForAcceptance ? (
                        <Link
                          to={href}
                          state={{ matterPreview: preview }}
                          onClick={(event) => event.stopPropagation()}
                          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                        >
                          Open
                          <ArrowRight size={14} />
                        </Link>
                      ) : null}
                      <IncomingRowActions
                        row={row}
                        onAcceptMatter={onAcceptMatter}
                        onDeclineMatter={onDeclineMatter}
                        accepting={accepting}
                        declining={declining}
                      />
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function BulkActionBar({ selectedCount, onClear, incoming = false }) {
  if (!selectedCount) return null

  const actions = incoming
    ? [
        { label: 'Assign Attorney', Icon: UserRound },
        { label: 'Request Documents', Icon: FileText },
        { label: 'Follow Up OTP', Icon: Mail },
        { label: 'Mark Reviewed', Icon: ClipboardCheck },
        { label: 'Email Clients', Icon: Mail },
      ]
    : [
        { label: 'Assign Attorney' },
        { label: 'Assign Assistant' },
        { label: 'Generate Documents' },
        { label: 'Request Documents' },
        { label: 'Schedule Appointment' },
        { label: 'Archive' },
        { label: 'Export' },
        { label: 'Email Clients' },
      ]
  return (
    <section className="flex flex-wrap items-center gap-2 rounded-xl border border-[#00614f]/20 bg-emerald-50 p-3 text-sm shadow-sm">
      <strong className="mr-2 text-[#00463d]">{selectedCount} selected</strong>
      {actions.map(({ label, Icon }) => (
        <button key={label} type="button" className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 font-semibold text-slate-700 shadow-sm transition hover:text-[#00614f]">
          {Icon ? <Icon size={15} /> : null}
          {label}
        </button>
      ))}
      <button type="button" onClick={onClear} className="ml-auto rounded-lg px-3 py-2 font-semibold text-slate-500 hover:bg-white">
        Clear
      </button>
    </section>
  )
}

function MattersTable({ rows = [], selectedRows = [], onToggleRow, onToggleAll, onOpenMatter }) {
  const showDevelopmentColumns = rows.some((row) => row.matterTypeKeys.includes('development'))
  const allSelected = rows.length > 0 && rows.every((row) => selectedRows.includes(row.matterId))

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1260px] border-collapse text-left text-sm">
          <thead className="bg-white text-[0.68rem] uppercase tracking-[0.12em] text-slate-500">
            <tr>
              <th className="w-10 border-b border-slate-200 px-4 py-3">
                <input type="checkbox" checked={allSelected} onChange={(event) => onToggleAll(event.target.checked)} aria-label="Select all matters" />
              </th>
              <th className="border-b border-slate-200 px-4 py-3 font-semibold">Matter Reference</th>
              <th className="border-b border-slate-200 px-4 py-3 font-semibold">Property</th>
              {showDevelopmentColumns ? <th className="border-b border-slate-200 px-4 py-3 font-semibold">Development</th> : null}
              {showDevelopmentColumns ? <th className="border-b border-slate-200 px-4 py-3 font-semibold">Unit</th> : null}
              {showDevelopmentColumns ? <th className="border-b border-slate-200 px-4 py-3 font-semibold">Phase</th> : null}
              <th className="border-b border-slate-200 px-4 py-3 font-semibold">Buyer / Seller</th>
              <th className="border-b border-slate-200 px-4 py-3 font-semibold">Stage</th>
              <th className="border-b border-slate-200 px-4 py-3 font-semibold">Next Action</th>
              <th className="border-b border-slate-200 px-4 py-3 font-semibold">Due</th>
              <th className="border-b border-slate-200 px-4 py-3 font-semibold">Assigned To</th>
              <th className="border-b border-slate-200 px-4 py-3 font-semibold">Status</th>
              <th className="border-b border-slate-200 px-4 py-3 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => {
              const selected = selectedRows.includes(row.matterId)
              const preview = getMatterPreview(row)
              return (
                <tr
                  key={row.assignmentId || row.matterId}
                  className="group cursor-pointer align-middle transition hover:bg-slate-50/70 focus-within:bg-slate-50/70"
                  role="button"
                  tabIndex={0}
                  onClick={() => onOpenMatter?.(row)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      onOpenMatter?.(row)
                    }
                  }}
                >
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selected}
                      onClick={(event) => event.stopPropagation()}
                      onChange={() => onToggleRow(row.matterId)}
                      aria-label={`Select ${row.reference}`}
                    />
                  </td>
                  <td className="px-4 py-3 font-semibold text-slate-950">
                    <Link
                      to={row.actionHref}
                      state={{ matterPreview: preview }}
                      onClick={(event) => event.stopPropagation()}
                      className="inline-flex items-center gap-1 text-slate-950 hover:text-[#00614f]"
                    >
                      {row.reference}
                      <ArrowRight size={13} className="opacity-0 transition group-hover:opacity-100" />
                    </Link>
                  </td>
                  <td className="max-w-[250px] px-4 py-3">
                    <p className="truncate font-medium text-slate-800">{row.property}</p>
                    <p className="mt-1 truncate text-xs text-slate-500">{row.matterType}</p>
                  </td>
                  {showDevelopmentColumns ? <td className="max-w-[190px] px-4 py-3 text-slate-700"><span className="block truncate">{row.development || '-'}</span></td> : null}
                  {showDevelopmentColumns ? <td className="px-4 py-3 text-slate-700">{row.unit || '-'}</td> : null}
                  {showDevelopmentColumns ? <td className="px-4 py-3 text-slate-700">{row.phase || '-'}</td> : null}
                  <td className="max-w-[210px] px-4 py-3">
                    <p className="truncate font-medium text-slate-800">{row.buyer}</p>
                    <p className="mt-1 truncate text-xs text-slate-500">{row.seller}</p>
                  </td>
                  <td className="px-4 py-3"><StageProgress stage={row.stage} /></td>
                  <td className="min-w-[220px] px-4 py-3">
                    <p className={classNames('font-semibold', row.status === 'Delayed' ? 'text-red-600' : row.status === 'Attention' ? 'text-orange-600' : 'text-slate-800')}>
                      {row.nextAction}
                    </p>
                    <div className="mt-2 hidden flex-wrap gap-2 group-hover:flex">
                      <Link
                        to={row.actionHref}
                        state={{ matterPreview: preview }}
                        onClick={(event) => event.stopPropagation()}
                        className="text-xs font-semibold text-[#00614f]"
                      >
                        Open
                      </Link>
                      <button type="button" className="text-xs font-semibold text-slate-500 hover:text-[#00614f]">Timeline</button>
                      <button type="button" className="text-xs font-semibold text-slate-500 hover:text-[#00614f]">Documents</button>
                      <button type="button" className="text-xs font-semibold text-slate-500 hover:text-[#00614f]">Generate Letter</button>
                      <button type="button" className="text-xs font-semibold text-slate-500 hover:text-[#00614f]">Email Client</button>
                    </div>
                  </td>
                  <td className={classNames('px-4 py-3 font-semibold', dueTone(row.expectedDue, row.status))}>{formatDue(row.expectedDue)}</td>
                  <td className="px-4 py-3"><Assignee person={row.assignedAttorney} /></td>
                  <td className="px-4 py-3"><StatusPill status={row.status} /></td>
                  <td className="px-4 py-3"><RowActions row={row} /></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function EmptyState({ view }) {
  const itemLabel = view?.itemLabel || 'matters'

  return (
    <section className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center shadow-sm">
      <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-[#00614f]">
        <CheckCircle2 size={20} />
      </div>
      <h2 className="mt-4 text-base font-semibold text-slate-950">No {itemLabel} match this view</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">
        Adjust the filters or clear the quick view to return to this queue.
      </p>
    </section>
  )
}

function IncomingDeclineDialog({
  row,
  reason,
  onReasonChange,
  onCancel,
  onConfirm,
  pending = false,
}) {
  if (!row) return null
  const reasonText = String(reason || '')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/25 px-4 backdrop-blur-[1px]" role="dialog" aria-modal="true">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Close decline transfer dialog" onClick={pending ? undefined : onCancel} />
      <section className="relative w-full max-w-[460px] rounded-xl border border-slate-200 bg-white p-5 shadow-2xl">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-600">
            <XCircle size={20} />
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-slate-950">Decline Transfer</h2>
            <p className="mt-1 truncate text-sm font-medium text-slate-500">{row.reference}</p>
          </div>
        </div>

        <label className="mt-5 grid gap-2">
          <span className="text-xs font-semibold text-slate-600">Reason</span>
          <textarea
            value={reasonText}
            onChange={(event) => onReasonChange(event.target.value)}
            rows={4}
            disabled={pending}
            className="w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-red-200 focus:ring-4 focus:ring-red-50 disabled:cursor-wait disabled:opacity-70"
          />
        </label>

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={onCancel}
            className="inline-flex h-10 items-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={pending || !reasonText.trim()}
            onClick={onConfirm}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-red-600 px-4 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <XCircle size={16} />
            {pending ? 'Declining' : 'Decline Transfer'}
          </button>
        </div>
      </section>
    </div>
  )
}

function Pagination({ pagination, itemLabel = 'matters', onPageChange, pageSize, onPageSizeChange }) {
  const pages = Array.from({ length: Math.min(pagination.totalPages, 5) }, (_, index) => index + 1)
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm md:flex-row md:items-center md:justify-between">
      <p>
        Showing {formatNumber(pagination.showingFrom)} to {formatNumber(pagination.showingTo)} of {formatNumber(pagination.totalRows)} {itemLabel}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={pageSize}
          onChange={(event) => onPageSizeChange(Number(event.target.value))}
          className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm font-semibold text-slate-700"
        >
          {ATTORNEY_MATTER_PAGE_SIZES.map((size) => (
            <option key={size} value={size}>{size} rows</option>
          ))}
        </select>
        {pages.map((page) => (
          <button
            key={page}
            type="button"
            onClick={() => onPageChange(page)}
            className={classNames(
              'h-9 min-w-9 rounded-lg px-3 font-semibold transition',
              pagination.page === page ? 'bg-[#00614f] text-white' : 'text-slate-700 hover:bg-slate-50',
            )}
          >
            {page}
          </button>
        ))}
        {pagination.totalPages > 5 ? <span className="px-2 font-semibold">...</span> : null}
        <button
          type="button"
          disabled={pagination.page >= pagination.totalPages}
          onClick={() => onPageChange(pagination.page + 1)}
          className="h-9 rounded-lg px-3 font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </section>
  )
}

function SavedViewStrip({ savedViews = [], onApply }) {
  if (!savedViews.length) return null
  return (
    <section className="flex max-w-full gap-2 overflow-x-auto pb-1">
      {savedViews.slice(0, 7).map((view) => (
        <button
          key={view.id}
          type="button"
          onClick={() => onApply(view)}
          className="inline-flex h-8 shrink-0 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 transition hover:border-emerald-200 hover:text-[#00614f]"
        >
          {view.name}
        </button>
      ))}
    </section>
  )
}

function AttorneyMattersPage() {
  const { matterType = 'all' } = useParams()
  const navigate = useNavigate()
  const permissionsState = useAttorneyPermissions()
  const [source, setSource] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [filters, setFilters] = useState(DEFAULT_FILTERS)
  const [quickFilter, setQuickFilter] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [selectedRows, setSelectedRows] = useState([])
  const [localSavedViews, setLocalSavedViews] = useState([])
  const [incomingAction, setIncomingAction] = useState({ pendingId: '', error: '' })
  const [declineDialog, setDeclineDialog] = useState({ row: null, reason: '' })

  const viewKey = normalize(matterType || 'all')

  useEffect(() => {
    let active = true

    async function load() {
      setLoading(true)
      setError('')
      try {
        const workspace = await getAttorneyMatterWorkspace({ view: viewKey })
        if (!active) return
        setSource(workspace.source)
      } catch (loadError) {
        if (!active) return
        setError(loadError?.message || 'Unable to load attorney matters.')
      } finally {
        if (active) setLoading(false)
      }
    }

    void load()
    return () => {
      active = false
    }
  }, [viewKey])

  useEffect(() => {
    function handleHeaderSearch(event) {
      setSearchTerm(String(event.detail?.value || ''))
      setPage(1)
    }
    window.addEventListener('itg:attorney-matters-search', handleHeaderSearch)
    return () => window.removeEventListener('itg:attorney-matters-search', handleHeaderSearch)
  }, [])

  useEffect(() => {
    setPage(1)
    setSelectedRows([])
    setIncomingAction({ pendingId: '', error: '' })
    setDeclineDialog({ row: null, reason: '' })
  }, [filters, quickFilter, searchTerm, viewKey])

  useEffect(() => {
    setFilters((previous) => (
      previous.matterType === 'all'
        ? previous
        : { ...previous, matterType: 'all' }
    ))
  }, [viewKey])

  const workspace = useMemo(() => {
    if (!source) return null
    return buildAttorneyMatterWorkspace(source, {
      view: viewKey,
      search: searchTerm,
      filters,
      quickFilter,
      page,
      pageSize,
    })
  }, [filters, page, pageSize, quickFilter, searchTerm, source, viewKey])

  const savedViews = useMemo(() => [...(workspace?.savedViews || []), ...localSavedViews], [localSavedViews, workspace?.savedViews])
  const usesIncomingQueue = Boolean(workspace?.view?.usesIncomingQueue)

  function handleFilterChange(key, value) {
    setFilters((previous) => ({ ...previous, [key]: value }))
  }

  function handleSaveView() {
    const label = quickFilter
      ? workspace?.quickFilters?.find((filter) => filter.key === quickFilter)?.label
      : workspace?.view?.lockedMatterType
        ? workspace.view.title
      : filters.matterType !== 'all'
        ? workspace?.filters?.matterTypes?.find((filter) => filter.key === filters.matterType)?.label
        : 'Custom View'
    const nextView = {
      id: `local-${Date.now()}`,
      name: `${label || 'Custom View'} ${localSavedViews.length + 1}`,
      filters: { ...filters, quickFilter, searchTerm },
    }
    setLocalSavedViews((previous) => [...previous, nextView])
  }

  function handleApplySavedView(view) {
    setFilters({ ...DEFAULT_FILTERS, ...(view.filters || {}) })
    setQuickFilter(view.filters?.quickFilter || '')
    setSearchTerm(view.filters?.searchTerm || '')
    setPage(1)
    setDrawerOpen(false)
  }

  function handleToggleRow(matterId) {
    setSelectedRows((previous) =>
      previous.includes(matterId)
        ? previous.filter((id) => id !== matterId)
        : [...previous, matterId],
    )
  }

  function handleToggleAll(checked) {
    setSelectedRows(checked ? (workspace?.tableRows || []).map((row) => row.matterId) : [])
  }

  function handleOpenMatter(row = {}) {
    if (!row.actionHref) return
    navigate(row.actionHref, { state: { matterPreview: getMatterPreview(row) } })
  }

  async function refreshIncomingWorkspaceAfterDecision(row = {}) {
    const refreshedWorkspace = await getAttorneyMatterWorkspace({ view: viewKey })
    setSource(refreshedWorkspace.source)
    setSelectedRows((previous) => previous.filter((id) => id !== row.matterId))
  }

  async function handleAcceptIncomingMatter(row = {}) {
    const assignmentId = row.assignmentId || row.id
    const transactionId = row.matterId || row.transactionId
    if (!assignmentId && !transactionId) return

    setIncomingAction({ pendingId: assignmentId || transactionId, kind: 'accept', error: '' })
    try {
      const result = await acceptAttorneyIncomingMatterInstruction({
        assignmentId,
        transactionId,
      })
      await refreshIncomingWorkspaceAfterDecision(row)
      setIncomingAction({ pendingId: '', error: '' })
      if (result?.actionHref) {
        navigate(result.actionHref, {
          state: { instructionAccepted: true },
        })
      }
    } catch (actionError) {
      setIncomingAction({
        pendingId: '',
        error: actionError?.message || 'Unable to accept this incoming matter.',
      })
    }
  }

  function handleRequestDeclineIncomingMatter(row = {}) {
    setIncomingAction({ pendingId: '', error: '' })
    setDeclineDialog({ row, reason: '' })
  }

  async function handleDeclineIncomingMatter() {
    const row = declineDialog.row || {}
    const reason = String(declineDialog.reason || '').trim()
    if (!reason) return

    const assignmentId = row.assignmentId || row.id
    const transactionId = row.matterId || row.transactionId
    if (!assignmentId && !transactionId) return

    setIncomingAction({ pendingId: assignmentId || transactionId, kind: 'decline', error: '' })
    try {
      await declineAttorneyIncomingMatterInstruction({
        assignmentId,
        transactionId,
        reason,
      })
      await refreshIncomingWorkspaceAfterDecision(row)
      setDeclineDialog({ row: null, reason: '' })
      setIncomingAction({ pendingId: '', error: '' })
    } catch (actionError) {
      setIncomingAction({
        pendingId: '',
        error: actionError?.message || 'Unable to decline this incoming matter.',
      })
    }
  }

  if (permissionsState.loading) return <LoadingState copy="Loading attorney permissions..." />
  if (loading) return <LoadingState />

  if (error || permissionsState.error) {
    return <ErrorState>{error || permissionsState.error}</ErrorState>
  }

  if (!workspace?.firm?.id) {
    return (
      <section className="w-full px-3 py-4">
        <div className="rounded-xl border border-amber-200 bg-white p-5 shadow-sm">
          <h1 className="text-lg font-semibold text-slate-950">Firm workspace unavailable</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            We could not load an active firm matter queue just now. Please refresh or open Firm Settings to repair the attorney firm context.
          </p>
        </div>
      </section>
    )
  }

  return (
    <main className="w-full max-w-none bg-[#f7f9fb] px-0 py-3">
      <div className="w-full max-w-none space-y-4 px-2 md:px-3 xl:px-4">
        <MatterWorkspaceHeader summary={workspace.summary} view={workspace.view} onSaveView={handleSaveView} />
        <SavedViewStrip savedViews={savedViews} onApply={handleApplySavedView} />
        <UnifiedFilterBar
          workspace={workspace}
          filters={filters}
          onFilterChange={handleFilterChange}
          onOpenMoreFilters={() => setDrawerOpen(true)}
        />

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {workspace.kpis.map((item) => <KpiCard key={item.key} item={item} />)}
        </section>

        <QuickFilters
          quickFilters={workspace.quickFilters}
          activeFilter={quickFilter}
          onChange={setQuickFilter}
          onSaveView={handleSaveView}
        />

        {incomingAction.error ? (
          <section className="flex items-start gap-2 rounded-xl border border-red-200 bg-white px-4 py-3 text-sm font-semibold text-red-700 shadow-sm">
            <AlertTriangle size={17} className="mt-0.5 shrink-0" />
            <span>{incomingAction.error}</span>
          </section>
        ) : null}

        <BulkActionBar selectedCount={selectedRows.length} onClear={() => setSelectedRows([])} incoming={usesIncomingQueue} />

        {workspace.tableRows.length ? (
          usesIncomingQueue ? (
            <IncomingMattersTable
              rows={workspace.tableRows}
              selectedRows={selectedRows}
              onToggleRow={handleToggleRow}
              onToggleAll={handleToggleAll}
              onOpenMatter={handleOpenMatter}
              onAcceptMatter={handleAcceptIncomingMatter}
              onDeclineMatter={handleRequestDeclineIncomingMatter}
              acceptingMatterId={incomingAction.kind === 'accept' ? incomingAction.pendingId : ''}
              decliningMatterId={incomingAction.kind === 'decline' ? incomingAction.pendingId : ''}
            />
          ) : (
            <MattersTable
              rows={workspace.tableRows}
              selectedRows={selectedRows}
              onToggleRow={handleToggleRow}
              onToggleAll={handleToggleAll}
              onOpenMatter={handleOpenMatter}
            />
          )
        ) : (
          <EmptyState view={workspace.view} />
        )}

        <Pagination
          pagination={workspace.pagination}
          itemLabel={workspace.view?.itemLabel || 'matters'}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={(nextSize) => {
            setPageSize(nextSize)
            setPage(1)
          }}
        />
      </div>

      <MoreFiltersDrawer
        open={drawerOpen}
        workspace={workspace}
        filters={filters}
        savedViews={savedViews}
        onFilterChange={handleFilterChange}
        onApplySavedView={handleApplySavedView}
        onClose={() => setDrawerOpen(false)}
      />
      <IncomingDeclineDialog
        row={declineDialog.row}
        reason={declineDialog.reason}
        pending={incomingAction.kind === 'decline' && Boolean(incomingAction.pendingId)}
        onReasonChange={(reason) => setDeclineDialog((previous) => ({ ...previous, reason }))}
        onCancel={() => setDeclineDialog({ row: null, reason: '' })}
        onConfirm={handleDeclineIncomingMatter}
      />
    </main>
  )
}

export default AttorneyMattersPage
