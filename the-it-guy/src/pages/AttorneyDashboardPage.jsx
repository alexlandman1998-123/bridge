import {
  AlertTriangle,
  ArrowRight,
  Bell,
  BriefcaseBusiness,
  CheckCircle2,
  CircleDollarSign,
  FileCheck2,
  FileText,
  Flag,
  Landmark,
  Search,
  ShieldAlert,
  Signature,
  Upload,
  UsersRound,
  WalletCards,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { useWorkspace } from '../context/WorkspaceContext'
import useAttorneyPermissions from '../hooks/useAttorneyPermissions'
import { getAttorneyManagementDashboardData } from '../services/attorneyDashboard'

const ROLE_VIEW_OPTIONS = [
  { value: 'active', label: 'Incoming Matters' },
  { value: 'all', label: 'All Matters' },
  { value: 'registered', label: 'Registered Matters' },
  { value: 'archived', label: 'Archived Matters' },
  { value: 'transfer', label: 'Transfer Matters' },
  { value: 'bond', label: 'Bond Matters' },
  { value: 'cancellation', label: 'Cancellation Matters' },
  { value: 'shared', label: 'Shared Matters' },
  { value: 'full-service', label: 'Full-Service Matters' },
]

const EMPTY_DASHBOARD = {
  firm: null,
  canViewFirmDashboard: false,
  matterStats: {},
  criticalAlerts: [],
  mattersRequiringAttention: [],
  matterLanes: {
    transfer: [],
    bond: [],
    cancellation: [],
  },
  attentionMetrics: [],
  partnerAnalytics: {
    status: 'empty',
    rows: [],
  },
  conveyancingPerformance: {
    averageDaysToRegistration: 0,
    registrationSuccessRate: 0,
    averageDocumentTurnaroundDays: 0,
    registrationForecast: {
      thisWeek: 0,
      nextWeek: 0,
      thisMonth: 0,
    },
    matterDistribution: [],
  },
  matterHealth: {
    total: 0,
    onTrack: { count: 0, percentage: 0 },
    attention: { count: 0, percentage: 0 },
    critical: { count: 0, percentage: 0 },
  },
}

const surfaceClass = 'min-w-0 rounded-xl border border-slate-200/80 bg-white shadow-[0_8px_22px_rgba(15,23,42,0.035)]'
const softButtonClass = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50'
const primaryButtonClass = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-[#17324b] bg-[#17324b] px-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#224761]'

function formatNumber(value) {
  return new Intl.NumberFormat('en-ZA').format(Number(value || 0))
}

function formatCurrency(value) {
  const amount = Number(value || 0)
  if (amount >= 1000000) {
    return `R${(amount / 1000000).toFixed(amount >= 10000000 ? 0 : 1)}m`
  }
  if (amount >= 1000) {
    return `R${Math.round(amount / 1000)}k`
  }
  return `R${formatNumber(amount)}`
}

function formatShortDate(value) {
  const parsed = new Date(value || '')
  if (Number.isNaN(parsed.getTime())) return 'TBC'
  return parsed.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' })
}

function getFirstName(profile = {}) {
  const explicit = String(profile.firstName || profile.first_name || '').trim()
  if (explicit) return explicit
  const fullName = String(profile.fullName || profile.full_name || profile.name || '').trim()
  return fullName ? fullName.split(/\s+/)[0] : 'there'
}

function clampPercentage(value) {
  return Math.max(0, Math.min(100, Number(value || 0)))
}

function StatePanel({ children, tone = 'neutral' }) {
  const toneClass = tone === 'danger' ? 'text-red-700' : 'text-slate-600'
  return (
    <section className="grid w-full max-w-none gap-4 px-3 py-4 sm:px-4 lg:px-5">
      <div className={`${surfaceClass} p-4`}>
        <p className={`text-sm ${toneClass}`}>{children}</p>
      </div>
    </section>
  )
}

function SectionHeading({ title, actionHref, actionLabel }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-base font-semibold tracking-[-0.01em] text-slate-950">{title}</h2>
      {actionHref ? (
        <Link to={actionHref} className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-slate-950">
          {actionLabel || 'View all'} <ArrowRight size={13} />
        </Link>
      ) : null}
    </div>
  )
}

function DashboardIntro({ profile = {}, stats = {} }) {
  const firstName = getFirstName(profile)
  const attentionToday = Number(stats.delayedMatters || 0) + Number(stats.awaitingSignatures || 0)
  const registrationsThisWeek = Number(stats.registrationsThisWeek || 0)

  return (
    <header className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,440px)] lg:items-start">
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#1c6b55]">Conveyancing Matter Control Centre</p>
        <div className="mt-2 flex flex-wrap items-end gap-x-4 gap-y-2">
          <h1 className="text-2xl font-semibold tracking-[-0.02em] text-slate-950 sm:text-3xl">Good morning, {firstName}</h1>
          <span className="pb-1 text-sm font-medium text-slate-500">You have {formatNumber(stats.activeMatters)} active matters</span>
        </div>
        <div className="mt-4 flex flex-wrap gap-3 text-sm text-slate-600">
          <span className="inline-flex items-center gap-2">
            <Bell size={15} className="text-slate-500" />
            <strong className="font-semibold text-slate-800">{formatNumber(attentionToday)}</strong> require attention today
          </span>
          <span className="hidden h-5 w-px bg-slate-200 sm:inline-block" />
          <span className="inline-flex items-center gap-2">
            <CheckCircle2 size={15} className="text-slate-500" />
            <strong className="font-semibold text-slate-800">{formatNumber(registrationsThisWeek)}</strong> registrations expected this week
          </span>
        </div>
      </div>
      <label className="relative block min-w-0">
        <Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          className="h-12 w-full rounded-xl border border-slate-200 bg-white pl-11 pr-4 text-sm font-medium text-slate-800 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-[#8ab9aa] focus:ring-4 focus:ring-[#dff0ea]"
          placeholder="Search matters, clients, documents..."
        />
      </label>
    </header>
  )
}

function MiniTrend({ tone = 'green' }) {
  const stroke = tone === 'amber' ? '#f59e0b' : '#1b8065'
  return (
    <svg viewBox="0 0 88 30" aria-hidden="true" className="h-8 w-20">
      <polyline
        points="2,22 14,19 25,23 37,14 49,17 61,9 74,12 86,5"
        fill="none"
        stroke={stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.5"
      />
    </svg>
  )
}

function KpiCards({ stats = {}, performance = {} }) {
  const cards = [
    {
      key: 'active',
      label: 'Active Matters',
      value: formatNumber(stats.activeMatters),
      helper: `+${formatNumber(stats.newThisWeek)} this week`,
      icon: BriefcaseBusiness,
      tone: 'green',
    },
    {
      key: 'client',
      label: 'Awaiting Client',
      value: formatNumber(Number(stats.awaitingFica || 0) + Number(stats.awaitingSignatures || 0)),
      helper: 'Client action needed',
      icon: UsersRound,
      tone: 'amber',
    },
    {
      key: 'registration',
      label: 'Registrations',
      value: formatNumber(performance?.registrationForecast?.thisWeek || stats.registrationsThisWeek || 0),
      helper: 'This week',
      icon: Flag,
      tone: 'green',
    },
    {
      key: 'lodgement',
      label: 'Lodgements',
      value: formatNumber(stats.lodgementsToday || stats.lodgementsPending || 0),
      helper: stats.lodgementsToday ? 'Today' : 'Pending',
      icon: Upload,
      tone: 'green',
    },
    {
      key: 'documents',
      label: 'Document Requests',
      value: formatNumber(stats.documentRequestsOutstanding),
      helper: 'Outstanding',
      icon: FileText,
      tone: 'amber',
    },
    {
      key: 'revenue',
      label: 'Revenue Pipeline',
      value: formatCurrency(stats.revenuePipelineValue),
      helper: 'Transfer value',
      icon: WalletCards,
      tone: 'green',
    },
  ]

  return (
    <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
      {cards.map((card) => {
        const Icon = card.icon
        return (
          <article key={card.key} className={`${surfaceClass} min-h-[146px] p-4`}>
            <div className="flex items-start justify-between gap-3">
              <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-[#e5f1ed] text-[#1c6b55]">
                <Icon size={18} />
              </span>
              <MiniTrend tone={card.tone} />
            </div>
            <p className="mt-4 text-sm font-semibold text-slate-800">{card.label}</p>
            <strong className="mt-2 block text-3xl font-semibold leading-none tracking-[-0.03em] text-slate-950">{card.value}</strong>
            <span className={card.tone === 'amber' ? 'mt-3 block text-xs font-semibold text-amber-700' : 'mt-3 block text-xs font-semibold text-[#1c6b55]'}>
              {card.helper}
            </span>
          </article>
        )
      })}
    </section>
  )
}

function NeedsAttentionSection({ metrics = [] }) {
  const iconMap = {
    signatures: Signature,
    guarantees: ShieldAlert,
    clearance: FileCheck2,
    'client-documents': UsersRound,
    invoices: CircleDollarSign,
    stalled: AlertTriangle,
  }

  const rows = metrics.length ? metrics : EMPTY_DASHBOARD.attentionMetrics

  return (
    <section className="grid gap-3">
      <SectionHeading title="Needs Attention" actionHref="/attorney/matters/delayed" actionLabel="View all" />
      <div className={`${surfaceClass} grid overflow-hidden sm:grid-cols-2 xl:grid-cols-6`}>
        {rows.map((item) => {
          const Icon = iconMap[item.key] || AlertTriangle
          return (
            <Link
              key={item.key}
              to="/attorney/matters/delayed"
              className="group grid min-h-[112px] grid-cols-[auto_minmax(0,1fr)] items-center gap-3 border-b border-slate-100 p-4 transition hover:bg-slate-50 sm:border-r xl:border-b-0"
            >
              <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600">
                <Icon size={17} />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-xs font-semibold text-slate-600">{item.label}</span>
                <strong className="mt-2 block text-2xl font-semibold leading-none text-slate-950">{formatNumber(item.count)}</strong>
                <span className="mt-2 block truncate text-xs font-medium text-slate-500">{item.helper}</span>
              </span>
            </Link>
          )
        })}
      </div>
    </section>
  )
}

function MatterTableCard({ title, count, rows = [], href, emptyLabel, icon: Icon }) {
  return (
    <article className={`${surfaceClass} flex min-h-[304px] flex-col p-4`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-[#e5f1ed] text-[#1c6b55]">
            <Icon size={15} />
          </span>
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-slate-950">{title}</h3>
            <p className="text-xs font-medium text-[#1c6b55]">{formatNumber(count)} active</p>
          </div>
        </div>
        <Link to={href} className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-slate-950">
          View <ArrowRight size={13} />
        </Link>
      </div>

      <div className="mt-4 min-w-0 flex-1 overflow-x-auto">
        {rows.length ? (
          <table className="w-full min-w-[520px] table-fixed text-left">
            <thead>
              <tr className="border-b border-slate-100 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                <th className="w-[25%] py-2 pr-3">Matter Reference</th>
                <th className="w-[31%] py-2 pr-3">Property</th>
                <th className="w-[27%] py-2 pr-3">Buyer / Seller</th>
                <th className="w-[17%] py-2">Instructed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.slice(0, 5).map((matter) => (
                <tr key={matter.id} className="text-xs text-slate-700">
                  <td className="py-2.5 pr-3">
                    <Link to={matter.href || href} className="block truncate font-semibold text-slate-900 hover:text-[#1c6b55]">
                      {matter.reference}
                    </Link>
                  </td>
                  <td className="py-2.5 pr-3">
                    <span className="block truncate">{matter.propertyAddress || 'Property pending'}</span>
                  </td>
                  <td className="py-2.5 pr-3">
                    <span className="block truncate">{matter.buyerSellerName || matter.buyerName || 'Client pending'}</span>
                  </td>
                  <td className="py-2.5">
                    <span className="block truncate font-medium text-slate-600">{formatShortDate(matter.instructedAt)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="flex min-h-[190px] items-center rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-5">
            <p className="text-sm font-medium text-slate-500">{emptyLabel}</p>
          </div>
        )}
      </div>

      <Link to={href} className="mt-4 inline-flex items-center justify-center gap-2 border-t border-slate-100 pt-3 text-xs font-semibold text-[#1c6b55] hover:text-[#14513f]">
        View all {title.toLowerCase()} <ArrowRight size={13} />
      </Link>
    </article>
  )
}

function ActiveMattersByType({ lanes = {} }) {
  return (
    <section className="grid gap-3">
      <SectionHeading title="Active Matters by Type" actionHref="/attorney/matters" actionLabel="View all matters" />
      <div className="grid grid-cols-1 gap-4 2xl:grid-cols-3">
        <MatterTableCard
          title="Transfer Matters"
          count={(lanes.transfer || []).length}
          rows={lanes.transfer || []}
          href="/attorney/matters/transfer"
          emptyLabel="No active transfer matters yet."
          icon={FileCheck2}
        />
        <MatterTableCard
          title="Bond Matters"
          count={(lanes.bond || []).length}
          rows={lanes.bond || []}
          href="/attorney/matters/bond"
          emptyLabel="No active bond matters yet."
          icon={Landmark}
        />
        <MatterTableCard
          title="Cancellation Matters"
          count={(lanes.cancellation || []).length}
          rows={lanes.cancellation || []}
          href="/attorney/matters/cancellation"
          emptyLabel="No active cancellation matters yet."
          icon={ShieldAlert}
        />
      </div>
    </section>
  )
}

function PartnerAnalytics({ analytics = EMPTY_DASHBOARD.partnerAnalytics }) {
  const rows = analytics.rows || []

  return (
    <section className={`${surfaceClass} min-h-[286px] p-4`}>
      <SectionHeading title="Partner Analytics" actionHref="/partners" actionLabel="View all" />
      {rows.length ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[500px] table-fixed text-left">
            <thead>
              <tr className="border-b border-slate-100 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                <th className="w-[36%] py-2 pr-3">Partner</th>
                <th className="w-[18%] py-2 pr-3">Active Matters</th>
                <th className="w-[18%] py-2 pr-3">New This Month</th>
                <th className="w-[28%] py-2">Revenue Pipeline</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => (
                <tr key={row.partner} className="text-xs text-slate-700">
                  <td className="py-2.5 pr-3 font-semibold text-slate-900">{row.partner}</td>
                  <td className="py-2.5 pr-3">{formatNumber(row.activeMatters)}</td>
                  <td className="py-2.5 pr-3">{formatNumber(row.newThisMonth)}</td>
                  <td className="py-2.5">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="w-16 shrink-0 font-semibold text-slate-900">{formatCurrency(row.revenuePipeline)}</span>
                      <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-100">
                        <span className="block h-full rounded-full bg-[#5ab08d]" style={{ width: `${clampPercentage(row.revenueShare)}%` }} />
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="mt-4 flex min-h-[202px] items-center rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-5">
          <p className="text-sm font-medium text-slate-500">Partner analytics appears once matters are linked to referring partners.</p>
        </div>
      )}
    </section>
  )
}

function ConveyancingPerformance({ performance = EMPTY_DASHBOARD.conveyancingPerformance }) {
  const distribution = performance.matterDistribution || []
  const forecast = performance.registrationForecast || EMPTY_DASHBOARD.conveyancingPerformance.registrationForecast
  const metricItems = [
    { label: 'Avg. Days to Registration', value: formatNumber(performance.averageDaysToRegistration), suffix: 'days' },
    { label: 'Registration Success Rate', value: `${Number(performance.registrationSuccessRate || 0).toFixed(1)}%`, suffix: '' },
    { label: 'Avg. Doc Turnaround', value: formatNumber(performance.averageDocumentTurnaroundDays), suffix: 'days' },
  ]

  return (
    <section className={`${surfaceClass} min-h-[286px] p-4`}>
      <SectionHeading title="Conveyancing Performance" actionHref="/attorney/matters/registered" actionLabel="View report" />
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {metricItems.map((item) => (
          <div key={item.label} className="rounded-lg border border-slate-200 bg-white p-3">
            <p className="text-xs font-semibold text-slate-500">{item.label}</p>
            <strong className="mt-3 block text-2xl font-semibold tracking-[-0.03em] text-slate-950">
              {item.value} {item.suffix ? <span className="text-sm font-medium text-slate-500">{item.suffix}</span> : null}
            </strong>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-lg border border-slate-200 p-3">
          <p className="text-xs font-semibold text-slate-500">Registration Forecast</p>
          <div className="mt-4 grid grid-cols-3 divide-x divide-slate-100 text-center">
            <span>
              <strong className="block text-2xl font-semibold text-slate-950">{formatNumber(forecast.thisWeek)}</strong>
              <span className="text-[11px] font-medium text-slate-500">This Week</span>
            </span>
            <span>
              <strong className="block text-2xl font-semibold text-slate-950">{formatNumber(forecast.nextWeek)}</strong>
              <span className="text-[11px] font-medium text-slate-500">Next Week</span>
            </span>
            <span>
              <strong className="block text-2xl font-semibold text-slate-950">{formatNumber(forecast.thisMonth)}</strong>
              <span className="text-[11px] font-medium text-slate-500">This Month</span>
            </span>
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 p-3">
          <p className="text-xs font-semibold text-slate-500">Matter Distribution</p>
          {distribution.length ? (
            <div className="mt-3 grid gap-2">
              {distribution.map((item) => (
                <div key={item.label} className="grid grid-cols-[96px_minmax(0,1fr)_42px] items-center gap-2 text-xs">
                  <span className="font-medium text-slate-600">{item.label}</span>
                  <span className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <span className="block h-full rounded-full bg-[#1c6b55]" style={{ width: `${clampPercentage(item.percentage)}%` }} />
                  </span>
                  <strong className="text-right text-slate-900">{formatNumber(item.percentage)}%</strong>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-5 text-sm font-medium text-slate-500">Performance appears once completed registered matters are available.</p>
          )}
        </div>
      </div>
    </section>
  )
}

function MatterHealth({ health = EMPTY_DASHBOARD.matterHealth }) {
  const onTrack = clampPercentage(health.onTrack?.percentage)
  const attention = clampPercentage(health.attention?.percentage)
  const critical = clampPercentage(health.critical?.percentage)
  const donutStyle = {
    background: `conic-gradient(#4fb282 0 ${onTrack}%, #f5ad42 ${onTrack}% ${onTrack + attention}%, #ef4444 ${onTrack + attention}% ${onTrack + attention + critical}%, #e5e7eb ${onTrack + attention + critical}% 100%)`,
  }
  const legend = [
    { label: 'On Track', value: health.onTrack, color: 'bg-[#4fb282]' },
    { label: 'Attention', value: health.attention, color: 'bg-[#f5ad42]' },
    { label: 'Critical', value: health.critical, color: 'bg-red-500' },
  ]

  return (
    <section className={`${surfaceClass} min-h-[286px] p-4`}>
      <SectionHeading title="Matter Health" actionHref="/attorney/matters/delayed" actionLabel="View report" />
      <div className="mt-5 grid gap-5 sm:grid-cols-[180px_minmax(0,1fr)] sm:items-center">
        <div className="relative mx-auto size-40 rounded-full p-4" style={donutStyle}>
          <div className="grid size-full place-items-center rounded-full bg-white text-center shadow-inner">
            <span>
              <strong className="block text-3xl font-semibold leading-none text-slate-950">{formatNumber(health.total)}</strong>
              <span className="mt-1 block text-xs font-semibold text-slate-500">Total Matters</span>
            </span>
          </div>
        </div>
        <div className="grid gap-3">
          {legend.map((item) => (
            <div key={item.label} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 text-sm">
              <span className={`size-2.5 rounded-full ${item.color}`} />
              <span className="font-semibold text-slate-800">{item.label}</span>
              <span className="text-right">
                <strong className="block text-sm text-slate-950">{formatNumber(item.value?.percentage)}%</strong>
                <span className="text-xs text-slate-500">({formatNumber(item.value?.count)} matters)</span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function AttorneyDashboardPage() {
  const { role, profile } = useWorkspace()
  const permissionsState = useAttorneyPermissions()
  const location = useLocation()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [dashboard, setDashboard] = useState(EMPTY_DASHBOARD)

  const roleView = useMemo(() => {
    const value = new URLSearchParams(location.search).get('roleView') || 'all'
    return ROLE_VIEW_OPTIONS.some((option) => option.value === value) ? value : 'all'
  }, [location.search])
  const shellClass = 'grid w-full max-w-none gap-5 bg-[#f7f9fb] px-3 py-5 sm:px-4 lg:px-5'

  useEffect(() => {
    let active = true

    async function loadDashboard() {
      setLoading(true)
      setError('')
      try {
        const nextData = await getAttorneyManagementDashboardData(null, { roleView })
        if (!active) return
        setDashboard(nextData || EMPTY_DASHBOARD)
      } catch (loadError) {
        if (!active) return
        setError(loadError?.message || 'Unable to load attorney dashboard.')
        setDashboard(EMPTY_DASHBOARD)
      } finally {
        if (active) setLoading(false)
      }
    }

    void loadDashboard()

    return () => {
      active = false
    }
  }, [roleView])

  if (role !== 'attorney') return <Navigate to="/dashboard" replace />
  if (permissionsState.loading) return <StatePanel>Loading attorney permissions...</StatePanel>
  if (permissionsState.error) return <StatePanel tone="danger">{permissionsState.error}</StatePanel>
  if (permissionsState.membership && !permissionsState.membership.isActive) {
    return (
      <StatePanel>
        {permissionsState.membership.status === 'suspended'
          ? 'Your access to this firm has been suspended. Please contact your firm administrator.'
          : 'You are not an active member of this attorney firm.'}
      </StatePanel>
    )
  }
  if (loading) return <StatePanel>Loading attorney dashboard...</StatePanel>

  if (!dashboard?.firm?.id) {
    const hasProfileFirmLink = Boolean(String(profile?.primaryAttorneyFirmId || '').trim())
    return (
      <section className={shellClass}>
        <div className={`${surfaceClass} grid gap-3 p-4`}>
          <h2 className="text-xl font-semibold text-slate-950">Firm Setup Pending</h2>
          <p className="text-sm text-slate-600">
            {hasProfileFirmLink
              ? 'Your profile points to an attorney firm, but we could not load an active firm workspace. Review or repair the firm setup to unlock full workflow access.'
              : 'Your onboarding is complete, but your attorney firm is not configured yet. Continue setup to unlock full workflow access.'}
          </p>
          <div className="flex flex-wrap gap-2">
            <Link to="/attorney/onboarding?repair=firm" className={primaryButtonClass}>
              {hasProfileFirmLink ? 'Repair Firm Setup' : 'Continue Firm Setup'}
            </Link>
            <Link to="/setup" className={softButtonClass}>View Setup Status</Link>
          </div>
        </div>
      </section>
    )
  }

  if (!dashboard.canViewFirmDashboard) return <Navigate to="/attorney/operations" replace />

  const lanes = dashboard.matterLanes || EMPTY_DASHBOARD.matterLanes
  const stats = dashboard.matterStats || EMPTY_DASHBOARD.matterStats
  const performance = dashboard.conveyancingPerformance || EMPTY_DASHBOARD.conveyancingPerformance

  return (
    <section className={shellClass}>
      {error ? <div className={`${surfaceClass} p-4`}><p className="text-sm text-red-700">{error}</p></div> : null}

      <DashboardIntro profile={profile} stats={stats} />
      <KpiCards stats={stats} performance={performance} />
      <NeedsAttentionSection metrics={dashboard.attentionMetrics || []} />
      <ActiveMattersByType lanes={lanes} />
      <div className="grid gap-5 2xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)_minmax(340px,0.82fr)]">
        <PartnerAnalytics analytics={dashboard.partnerAnalytics || EMPTY_DASHBOARD.partnerAnalytics} />
        <ConveyancingPerformance performance={performance} />
        <MatterHealth health={dashboard.matterHealth || EMPTY_DASHBOARD.matterHealth} />
      </div>
    </section>
  )
}

export default AttorneyDashboardPage
