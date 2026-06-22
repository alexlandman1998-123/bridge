import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  BriefcaseBusiness,
  CheckCircle2,
  Clock3,
  Columns3,
  FileWarning,
  LayoutGrid,
  List,
  Search,
  ShieldAlert,
  UserRoundCheck,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import useAttorneyPermissions from '../hooks/useAttorneyPermissions'
import { getAttorneyOperationalWorkspaceData } from '../services/attorneyOperations'

const MATTER_VIEW_COPY = {
  active: {
    title: 'Transactions',
    description: 'Current working files across transfer, bond registration, and cancellation workflows.',
  },
  all: {
    title: 'Transactions',
    description: 'A unified operational queue for every transaction assigned to this attorney firm.',
  },
  transfer: {
    title: 'Transfer Transactions',
    description: 'Filtered view of transactions where transfer work is required or assigned to the firm.',
  },
  bond: {
    title: 'Bond Transactions',
    description: 'Filtered view of bond and hybrid-finance transactions requiring bond attorney workflow.',
  },
  cancellation: {
    title: 'Cancellation Transactions',
    description: 'Filtered view of transactions with existing seller bond cancellation requirements.',
  },
  shared: {
    title: 'Shared Transactions',
    description: 'Transactions where multiple legal roles or firms are involved in the same file.',
  },
  delayed: {
    title: 'Delayed Transactions',
    description: 'Transactions with blockers, overdue workflow signals, or SLA risk.',
  },
  registered: {
    title: 'Registered Transactions',
    description: 'Completed registrations retained for close-out, reporting, and historical search.',
  },
  archived: {
    title: 'Archived Transactions',
    description: 'Closed, cancelled, or dead transactions retained for firm records and audit.',
  },
  'full-service': {
    title: 'Full-Service Transactions',
    description: 'Transactions where transfer, bond, and cancellation work all apply to the same file.',
  },
}

const ALL_MATTER_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'delayed', label: 'Delayed' },
  { key: 'registered', label: 'Registered' },
  { key: 'shared', label: 'Shared' },
]

const TRANSACTION_WORKSPACE_TABS = [
  { key: 'active', label: 'Active' },
  { key: 'registered', label: 'Registered' },
  { key: 'archived', label: 'Archived' },
]

function normalize(value) {
  return String(value || '').trim().toLowerCase()
}

function titleCase(value = '') {
  return String(value || '')
    .split(/[_\s+-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function formatDate(value) {
  const date = new Date(value || '')
  if (Number.isNaN(date.getTime())) return 'No activity yet'
  return date.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatCurrency(value) {
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    maximumFractionDigits: 0,
  }).format(Number(value || 0))
}

function daysSince(value) {
  const timestamp = new Date(value || '').getTime()
  if (!Number.isFinite(timestamp)) return 0
  return Math.max(0, Math.floor((Date.now() - timestamp) / 86400000))
}

function getWorkflowLanes(matter = {}) {
  const matterType = normalize(matter.matterType)
  const financeType = normalize(matter.financeType)
  const lanes = []

  if (!matterType || matterType.includes('transfer')) lanes.push('Transfer')
  if (matterType.includes('bond') || financeType.includes('bond') || financeType.includes('hybrid')) lanes.push('Bond')
  if (matterType.includes('cancellation') || matter.sellerHasExistingBond) lanes.push('Cancellation')

  return [...new Set(lanes)]
}

function matterMatchesView(matter = {}, view = 'all') {
  const type = normalize(view || 'all')
  const lanes = getWorkflowLanes(matter).map(normalize)
  const stage = normalize(matter.currentStage)
  const status = normalize(matter.status)
  const lifecycle = normalize(matter.lifecycleState)
  const isRegistered = lifecycle.includes('registered') || stage.includes('registered') || Boolean(matter.registrationDate)
  const isArchived = lifecycle.includes('archived') || lifecycle.includes('closed') || status.includes('cancel') || status.includes('dead')

  if (type === 'all') return true
  if (type === 'active') return !isRegistered && !isArchived
  if (type === 'transfer') return lanes.includes('transfer')
  if (type === 'bond') return lanes.includes('bond')
  if (type === 'cancellation') return lanes.includes('cancellation')
  if (type === 'shared') return lanes.length > 1
  if (type === 'full-service') {
    return ['transfer', 'bond', 'cancellation'].every((lane) => lanes.includes(lane))
  }
  if (type === 'delayed') return Boolean(matter.flags?.delayed) || status.includes('attention') || status.includes('blocked')
  if (type === 'registered') return isRegistered
  if (type === 'archived') return isArchived
  return true
}

function matterMatchesContextFilter(matter = {}, filter = 'all') {
  const type = normalize(filter || 'all')
  const lanes = getWorkflowLanes(matter).map(normalize)
  const stage = normalize(matter.currentStage)
  const status = normalize(matter.status)
  const lifecycle = normalize(matter.lifecycleState)
  const isDelayed = Boolean(matter.flags?.delayed) || status.includes('attention') || status.includes('blocked')
  const isRegistered = lifecycle.includes('registered') || stage.includes('registered') || Boolean(matter.registrationDate)

  if (type === 'all') return true
  if (type === 'active') return !isDelayed && !isRegistered
  if (type === 'delayed') return isDelayed
  if (type === 'registered') return isRegistered
  if (type === 'shared') return lanes.length > 1
  return true
}

function matchesSearch(matter = {}, searchTerm = '') {
  const query = normalize(searchTerm)
  if (!query) return true
  return [
    matter.matterReference,
    matter.propertyLabel,
    matter.buyerName || matter.clientName,
    matter.sellerName,
    matter.developmentName,
    matter.financeType,
    matter.currentStage,
    matter.status,
    matter.assignedAttorneyName,
    matter.assignedSecretaryName,
  ].some((value) => normalize(value).includes(query))
}

function getRiskTone(matter = {}) {
  if (matter.flags?.delayed || normalize(matter.status).includes('attention')) return 'danger'
  if (matter.flags?.awaitingFica || matter.flags?.awaitingSignatures || matter.flags?.guaranteesOutstanding) return 'warning'
  return 'success'
}

function StatusPill({ children, tone = 'neutral' }) {
  const tones = {
    success: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    warning: 'border-amber-200 bg-amber-50 text-amber-700',
    danger: 'border-red-200 bg-red-50 text-red-700',
    neutral: 'border-slate-200 bg-slate-50 text-slate-600',
    blue: 'border-blue-200 bg-blue-50 text-blue-700',
  }
  return (
    <span className={`inline-flex max-w-full items-center rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.08em] ${tones[tone] || tones.neutral}`}>
      {children}
    </span>
  )
}

function LoadingState({ copy = 'Loading attorney transactions…' }) {
  return (
    <section className="w-full px-3 py-4 sm:px-4 lg:px-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-sm font-medium text-slate-500">{copy}</p>
      </div>
    </section>
  )
}

function EmptyState({ view, filter = 'all' }) {
  const filterLabel = filter === 'all' ? '' : `${titleCase(filter)} `
  return (
    <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center shadow-sm">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
        <BriefcaseBusiness size={20} />
      </div>
      <h2 className="mt-4 text-base font-semibold text-slate-950">No {filterLabel}{MATTER_VIEW_COPY[view]?.title?.toLowerCase() || 'transactions'} visible</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">
        Transactions appear here when they are assigned to this firm and match the current operational filter.
      </p>
      <Link
        to="/new-transaction"
        className="mt-5 inline-flex items-center justify-center rounded-xl border border-[#12314f] bg-[#12314f] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1b4264]"
      >
        Create Transaction
      </Link>
    </section>
  )
}

function SummaryStrip({ matters = [] }) {
  const transfer = matters.filter((matter) => getWorkflowLanes(matter).includes('Transfer')).length
  const bond = matters.filter((matter) => getWorkflowLanes(matter).includes('Bond')).length
  const cancellation = matters.filter((matter) => getWorkflowLanes(matter).includes('Cancellation')).length
  const delayed = matters.filter((matter) => getRiskTone(matter) === 'danger').length
  const items = [
    { label: 'Visible Transactions', value: matters.length, icon: BriefcaseBusiness, tone: 'bg-blue-50 text-blue-700' },
    { label: 'Transfer Lanes', value: transfer, icon: Columns3, tone: 'bg-sky-50 text-sky-700' },
    { label: 'Bond Lanes', value: bond, icon: Banknote, tone: 'bg-violet-50 text-violet-700' },
    { label: 'Cancellation Lanes', value: cancellation, icon: ShieldAlert, tone: 'bg-amber-50 text-amber-700' },
    { label: 'Delayed / Blocked', value: delayed, icon: FileWarning, tone: 'bg-red-50 text-red-700' },
  ]

  return (
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {items.map((item) => {
        const Icon = item.icon
        return (
          <article key={item.label} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${item.tone}`}>
                <Icon size={18} />
              </span>
              <div className="min-w-0">
                <p className="truncate text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-slate-500">{item.label}</p>
                <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">{item.value}</p>
              </div>
            </div>
          </article>
        )
      })}
    </section>
  )
}

function MatterCard({ matter }) {
  const lanes = getWorkflowLanes(matter)
  const riskTone = getRiskTone(matter)
  const matterHref = matter.actionHref || `/transactions/${matter.matterId}`
  const matterNavigationState = { matterPreview: matter }
  return (
    <article className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-slate-500">{matter.matterReference}</p>
          <h3 className="mt-1 truncate text-base font-semibold text-slate-950">{matter.propertyLabel || 'Property pending'}</h3>
          <p className="mt-1 truncate text-sm text-slate-500">{matter.developmentName || 'Standalone transaction'}</p>
        </div>
        <StatusPill tone={riskTone}>{matter.status || 'On track'}</StatusPill>
      </div>

      <div className="mt-4 grid gap-3 rounded-2xl border border-slate-100 bg-slate-50/70 p-3 text-sm">
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="min-w-0">
            <span className="text-xs font-medium text-slate-500">Buyer</span>
            <p className="truncate font-semibold text-slate-900">{matter.buyerName || matter.clientName || 'Buyer pending'}</p>
          </div>
          <div className="min-w-0">
            <span className="text-xs font-medium text-slate-500">Seller</span>
            <p className="truncate font-semibold text-slate-900">{matter.sellerName || 'Seller pending'}</p>
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <span className="text-xs font-medium text-slate-500">Finance</span>
            <p className="font-semibold text-slate-900">{titleCase(matter.financeType || 'cash')}</p>
          </div>
          <div>
            <span className="text-xs font-medium text-slate-500">Days Active</span>
            <p className="font-semibold text-slate-900">{daysSince(matter.lastUpdated)} days</p>
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {lanes.map((lane) => (
          <StatusPill key={lane} tone={lane === 'Transfer' ? 'blue' : lane === 'Bond' ? 'neutral' : 'warning'}>
            {lane}
          </StatusPill>
        ))}
      </div>

      <div className="mt-4 grid gap-2 text-sm">
        <div className="flex items-center justify-between gap-3">
          <span className="text-slate-500">Current stage</span>
          <strong className="truncate text-right text-slate-900">{matter.currentStage || 'Instruction'}</strong>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-slate-500">Assigned team</span>
          <strong className="truncate text-right text-slate-900">{matter.assignedAttorneyName || matter.assignedSecretaryName || 'Unassigned'}</strong>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-slate-500">Last activity</span>
          <strong className="truncate text-right text-slate-900">{formatDate(matter.lastUpdated)}</strong>
        </div>
      </div>

      <Link
        to={matterHref}
        state={matterNavigationState}
        className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#12314f] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#0d253d]"
      >
        Open Transaction
        <ArrowRight size={15} />
      </Link>
    </article>
  )
}

function MattersTable({ matters = [] }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-[1180px] w-full border-collapse text-left text-sm">
          <thead className="bg-slate-50 text-[0.68rem] uppercase tracking-[0.12em] text-slate-500">
            <tr>
              {[
                'Reference',
                'Property',
                'Buyer',
                'Seller',
                'Finance',
                'Workflow',
                'Stage',
                'Blocked',
                'SLA',
                'Assigned Team',
                'Last Activity',
                'Actions',
              ].map((header) => (
                <th key={header} className="border-b border-slate-200 px-4 py-3 font-semibold">{header}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {matters.map((matter) => {
              const lanes = getWorkflowLanes(matter)
              const riskTone = getRiskTone(matter)
              const matterHref = matter.actionHref || `/transactions/${matter.matterId}`
              const matterNavigationState = { matterPreview: matter }
              return (
                <tr key={matter.assignmentId || matter.matterId} className="align-top hover:bg-slate-50/60">
                  <td className="px-4 py-4 font-semibold text-slate-950">{matter.matterReference}</td>
                  <td className="max-w-[240px] px-4 py-4">
                    <p className="truncate font-medium text-slate-900">{matter.propertyLabel || 'Property pending'}</p>
                    <p className="mt-1 truncate text-xs text-slate-500">{matter.developmentName || 'Standalone transaction'}</p>
                  </td>
                  <td className="max-w-[180px] px-4 py-4 text-slate-700"><span className="block truncate">{matter.buyerName || matter.clientName || 'Buyer pending'}</span></td>
                  <td className="max-w-[180px] px-4 py-4 text-slate-700"><span className="block truncate">{matter.sellerName || 'Seller pending'}</span></td>
                  <td className="px-4 py-4 text-slate-700">{titleCase(matter.financeType || 'cash')}</td>
                  <td className="px-4 py-4">
                    <div className="flex flex-wrap gap-1.5">
                      {lanes.map((lane) => <StatusPill key={lane} tone="blue">{lane}</StatusPill>)}
                    </div>
                  </td>
                  <td className="max-w-[220px] px-4 py-4 text-slate-700"><span className="block truncate">{matter.currentStage || 'Instruction'}</span></td>
                  <td className="px-4 py-4"><StatusPill tone={riskTone}>{matter.status || 'On track'}</StatusPill></td>
                  <td className="px-4 py-4 text-slate-700">{daysSince(matter.lastUpdated)} days</td>
                  <td className="max-w-[180px] px-4 py-4 text-slate-700">
                    <span className="block truncate">{matter.assignedAttorneyName || matter.assignedSecretaryName || 'Unassigned'}</span>
                  </td>
                  <td className="px-4 py-4 text-slate-700">{formatDate(matter.lastUpdated)}</td>
                  <td className="px-4 py-4">
                    <Link to={matterHref} state={matterNavigationState} className="inline-flex items-center gap-1 font-semibold text-blue-700 hover:text-blue-900">
                      Open <ArrowRight size={14} />
                    </Link>
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

function AttorneyMattersPage() {
  const { matterType = 'active' } = useParams()
  const permissionsState = useAttorneyPermissions()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [data, setData] = useState(null)
  const [viewMode, setViewMode] = useState('list')
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [allMatterFilter, setAllMatterFilter] = useState('all')

  const viewKey = MATTER_VIEW_COPY[matterType] ? matterType : 'all'
  const viewCopy = MATTER_VIEW_COPY[viewKey] || MATTER_VIEW_COPY.active

  useEffect(() => {
    let active = true

    async function load() {
      setLoading(true)
      setError('')
      try {
        const next = await getAttorneyOperationalWorkspaceData()
        if (!active) return
        setData(next)
      } catch (loadError) {
        if (!active) return
        setError(loadError?.message || 'Unable to load attorney transactions.')
      } finally {
        if (active) setLoading(false)
      }
    }

    void load()
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (viewKey !== 'all') {
      setAllMatterFilter('all')
    }
  }, [viewKey])

  const visibleMatters = useMemo(() => {
    let rows = (data?.matterQueue || []).filter((matter) => matterMatchesView(matter, viewKey))
    if (viewKey === 'all') rows = rows.filter((matter) => matterMatchesContextFilter(matter, allMatterFilter))
    if (statusFilter !== 'all') rows = rows.filter((matter) => normalize(matter.status) === normalize(statusFilter))
    return rows.filter((matter) => matchesSearch(matter, searchTerm))
  }, [allMatterFilter, data?.matterQueue, searchTerm, statusFilter, viewKey])

  const statuses = useMemo(
    () => [...new Set((data?.matterQueue || []).map((matter) => matter.status).filter(Boolean))],
    [data?.matterQueue],
  )

  if (permissionsState.loading) return <LoadingState copy="Loading attorney permissions…" />
  if (loading) return <LoadingState />

  if (error || permissionsState.error) {
    return (
      <section className="w-full px-3 py-4 sm:px-4 lg:px-5">
        <div className="rounded-2xl border border-red-200 bg-white p-5 text-sm font-medium text-red-700 shadow-sm">
          {error || permissionsState.error}
        </div>
      </section>
    )
  }

  if (!data?.firm?.id) {
    return (
      <section className="w-full px-3 py-4 sm:px-4 lg:px-5">
        <div className="rounded-2xl border border-amber-200 bg-white p-5 shadow-sm">
          <h1 className="text-lg font-semibold text-slate-950">Firm workspace unavailable</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            We could not load an active firm transaction queue just now. Please refresh or open Firm Settings to repair the attorney firm context.
          </p>
        </div>
      </section>
    )
  }

  return (
    <main className="w-full max-w-none px-0 py-4">
      <div className="mx-auto w-full max-w-[1800px] space-y-5">
        <section className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Attorney Transaction OS</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-slate-950">{viewCopy.title}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">{viewCopy.description}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition ${viewMode === 'list' ? 'border-[#12314f] bg-[#12314f] text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
            >
              <List size={16} />
              List
            </button>
            <button
              type="button"
              onClick={() => setViewMode('cards')}
              className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition ${viewMode === 'cards' ? 'border-[#12314f] bg-[#12314f] text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
            >
              <LayoutGrid size={16} />
              Cards
            </button>
          </div>
        </section>

        <section className="flex max-w-full gap-2 overflow-x-auto pb-1">
          {TRANSACTION_WORKSPACE_TABS.map((tab) => {
            const active = viewKey === tab.key
            return (
              <Link
                key={tab.key}
                to={`/attorney/transactions/${tab.key}`}
                className={`inline-flex h-10 shrink-0 items-center rounded-xl border px-4 text-sm font-semibold transition ${
                  active
                    ? 'border-[#12314f] bg-[#12314f] text-white shadow-sm'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                {tab.label}
              </Link>
            )
          })}
        </section>

        {viewKey === 'all' ? (
          <section className="flex max-w-full gap-2 overflow-x-auto pb-1">
            {ALL_MATTER_FILTERS.map((filter) => {
              const active = allMatterFilter === filter.key
              return (
                <button
                  key={filter.key}
                  type="button"
                  onClick={() => setAllMatterFilter(filter.key)}
                  className={`inline-flex shrink-0 items-center rounded-full border px-3.5 py-2 text-sm font-semibold transition ${
                    active
                      ? 'border-[#12314f] bg-[#12314f] text-white shadow-sm'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  {filter.label}
                </button>
              )
            })}
          </section>
        ) : null}

        <section className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm lg:grid-cols-[minmax(0,1fr)_220px]">
          <label className="relative block min-w-0">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search by reference, buyer, seller, property, stage..."
              className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-sm outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-50"
            />
          </label>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-50"
          >
            <option value="all">All Statuses</option>
            {statuses.map((status) => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>
        </section>

        <SummaryStrip matters={visibleMatters} />

        {visibleMatters.length ? (
          viewMode === 'list' ? (
            <MattersTable matters={visibleMatters} />
          ) : (
            <section className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
              {visibleMatters.map((matter) => (
                <MatterCard key={matter.assignmentId || matter.matterId} matter={matter} />
              ))}
            </section>
          )
        ) : (
          <EmptyState view={viewKey} filter={viewKey === 'all' ? allMatterFilter : 'all'} />
        )}

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid gap-3 md:grid-cols-3">
            {[
              { label: 'Permissions', value: data?.permissions?.can_view_all_firm_matters ? 'Firm-wide visibility' : 'Assigned transactions only', icon: UserRoundCheck },
              { label: 'Document Operations', value: data?.documentQueue?.length || 0, icon: FileWarning },
              { label: 'Priority Queue', value: data?.priorityQueue?.length || 0, icon: AlertTriangle },
              { label: 'Last Sync', value: formatDate(new Date().toISOString()), icon: CheckCircle2 },
              { label: 'Outstanding Fees', value: formatCurrency(0), icon: Banknote },
              { label: 'SLA Watch', value: `${visibleMatters.filter((matter) => getRiskTone(matter) !== 'success').length} transaction(s)`, icon: Clock3 },
            ].map((item) => {
              const Icon = item.icon
              return (
                <article key={item.label} className="flex min-w-0 items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50/80 p-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-slate-600 shadow-sm">
                    <Icon size={16} />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-slate-500">{item.label}</p>
                    <p className="truncate text-sm font-semibold text-slate-950">{item.value}</p>
                  </div>
                </article>
              )
            })}
          </div>
        </section>
      </div>
    </main>
  )
}

export default AttorneyMattersPage
