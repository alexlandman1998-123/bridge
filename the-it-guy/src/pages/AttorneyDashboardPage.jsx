import {
  AlertTriangle,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  FileCheck2,
  FileText,
  Landmark,
  Scale,
  ShieldAlert,
  Signature,
  Wallet,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { useWorkspace } from '../context/WorkspaceContext'
import useAttorneyPermissions from '../hooks/useAttorneyPermissions'
import { getAttorneyManagementDashboardData } from '../services/attorneyDashboard'

const ROLE_VIEW_OPTIONS = [
  { value: 'all', label: 'All Matters' },
  { value: 'transfer', label: 'Transfer Matters' },
  { value: 'bond', label: 'Bond Matters' },
  { value: 'cancellation', label: 'Cancellation Matters' },
  { value: 'shared', label: 'Shared Matters' },
  { value: 'full-service', label: 'Full-Service Matters' },
]

const EMPTY_DASHBOARD = {
  firm: null,
  currentUserRole: null,
  canViewFirmDashboard: false,
  departments: [],
  members: [],
  matterStats: {},
  criticalAlerts: [],
  matterPipeline: [],
  mattersByRole: {},
  departmentOverview: [],
  staffWorkload: [],
  mattersRequiringAttention: [],
  recentActivity: [],
  upcomingKeyDates: [],
  financialSnapshot: {},
}

const cardClass = 'min-w-0 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm'
const cardPadding = 'p-4'
const actionLinkClass = 'inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:text-blue-900'

function formatNumber(value) {
  return new Intl.NumberFormat('en-ZA').format(Number(value || 0))
}

function formatCurrency(value) {
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    maximumFractionDigits: 0,
  }).format(Number(value || 0))
}

function toTitle(value = '') {
  return String(value || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function StatusBadge({ children, tone = 'green' }) {
  const tones = {
    green: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    red: 'border-red-200 bg-red-50 text-red-700',
    slate: 'border-slate-200 bg-slate-50 text-slate-600',
  }

  return (
    <span className={`inline-flex w-fit items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${tones[tone] || tones.slate}`}>
      {children}
    </span>
  )
}

function StatePanel({ children, tone = 'neutral' }) {
  const toneClass = tone === 'danger' ? 'text-red-700' : 'text-slate-600'
  return (
    <section className="mx-auto grid w-full max-w-none gap-4 px-4 py-5 sm:px-5 lg:px-6">
      <div className={`${cardClass} ${cardPadding}`}>
        <p className={`text-sm ${toneClass}`}>{children}</p>
      </div>
    </section>
  )
}

function FirmSummaryCard({ dashboard }) {
  const firmSummary = dashboard.firmSummary || {}
  const otherRoles = Array.isArray(firmSummary.otherRoles) && firmSummary.otherRoles.length
    ? firmSummary.otherRoles.map(toTitle).join(', ')
    : 'Bond Attorney, Cancellation Attorney'

  return (
    <article className={`${cardClass} ${cardPadding} grid gap-4 lg:col-span-2 xl:col-span-3`}>
      <div className="flex items-start gap-3">
        <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
          <Building2 size={21} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold text-slate-950">{firmSummary.name || dashboard.firm?.name || 'Attorney Firm'}</h2>
          <div className="mt-2"><StatusBadge>Operational</StatusBadge></div>
        </div>
      </div>
      <dl className="grid gap-3 text-sm">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-slate-500">Primary Role</dt>
          <dd className="truncate font-semibold text-slate-800">{toTitle(firmSummary.primaryRole || dashboard.currentUserRole || 'Transfer Attorney')}</dd>
        </div>
        <div className="flex items-start justify-between gap-3">
          <dt className="shrink-0 text-slate-500">Other Roles</dt>
          <dd className="min-w-0 text-right font-semibold text-slate-800">{otherRoles}</dd>
        </div>
      </dl>
    </article>
  )
}

function CriticalAlerts({ alerts = [] }) {
  const toneMap = {
    red: 'border-red-200 bg-red-50 text-red-700',
    orange: 'border-orange-200 bg-orange-50 text-orange-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-700',
    purple: 'border-violet-200 bg-violet-50 text-violet-700',
  }
  const iconMap = {
    guarantees: ShieldAlert,
    fica: FileCheck2,
    documents: Signature,
    lodgement: CalendarDays,
    bond: AlertTriangle,
  }

  return (
    <section className={`${cardClass} ${cardPadding} grid min-w-0 gap-3 lg:col-span-4 xl:col-span-9`}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-slate-950">Critical Alerts</h2>
        <Link to="/transactions" className={actionLinkClass}>View all alerts</Link>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {(alerts || []).map((alert) => {
          const Icon = iconMap[alert.key] || AlertTriangle
          return (
            <article key={alert.key} className={`grid min-h-[140px] content-center gap-2 rounded-2xl border p-3 ${toneMap[alert.tone] || toneMap.red}`}>
              <div className="flex items-center gap-3">
                <span className="inline-flex size-8 items-center justify-center rounded-full bg-white/70">
                  <Icon size={15} />
                </span>
                <strong className="text-2xl font-semibold leading-none">{formatNumber(alert.count)}</strong>
              </div>
              <p className="text-xs font-semibold leading-5 text-slate-800">{alert.label}</p>
              <Link to="/transactions" className="text-xs font-semibold">View matters</Link>
            </article>
          )
        })}
      </div>
    </section>
  )
}

function KpiStrip({ stats = {} }) {
  const items = [
    { key: 'activeMatters', label: 'Active Matters', value: stats.activeMatters, icon: BriefcaseBusiness, trend: '+0%' },
    { key: 'lodgementsPending', label: 'Lodgements Pending', value: stats.lodgementsPending, icon: Landmark, trend: '+0%' },
    { key: 'registeredThisMonth', label: 'Registered This Month', value: stats.registeredThisMonth, icon: FileCheck2, trend: '+0%' },
    { key: 'delayedMatters', label: 'Delayed Matters', value: stats.delayedMatters, icon: Clock3, trend: '+0%' },
    { key: 'averageTransferTimeDays', label: 'Avg. Transfer Time', value: `${formatNumber(stats.averageTransferTimeDays)}d`, icon: CalendarDays, trend: '—' },
    { key: 'bondMatters', label: 'Bond Matters', value: stats.bondMatters, icon: FileText, trend: '+0%' },
    { key: 'cancellationMatters', label: 'Cancellation Matters', value: stats.cancellationMatters, icon: AlertTriangle, trend: '+0%' },
  ]

  return (
    <section className={`${cardClass} p-3`}>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-7">
        {items.map((item) => {
          const Icon = item.icon
          return (
            <article key={item.key} className="min-h-[88px] min-w-0 rounded-xl border border-slate-100 bg-white px-3 py-3">
              <div className="flex items-center gap-3">
                <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                  <Icon size={16} />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">{item.label}</p>
                  <div className="mt-1 flex items-baseline gap-2">
                    <strong className="text-[clamp(1.25rem,2vw,1.65rem)] leading-none text-slate-950">{item.value}</strong>
                    <span className="text-xs font-semibold text-emerald-600">{item.trend}</span>
                  </div>
                </div>
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}

function MatterPipeline({ rows = [], roleLabel = 'All Matters' }) {
  const statusColors = {
    on_track: 'bg-emerald-500',
    attention: 'bg-amber-500',
    bottleneck: 'bg-red-500',
  }

  return (
    <section className={`${cardClass} ${cardPadding} grid gap-4 md:col-span-2 lg:col-span-6 xl:col-span-6`}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-slate-950">Matter Pipeline <span className="font-normal text-slate-500">({roleLabel})</span></h2>
        <Link to="/attorney/operations" className={actionLinkClass}>View full pipeline</Link>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-7">
        {(rows || []).map((stage, index) => (
          <article key={stage.key} className="relative min-h-[132px] min-w-0 rounded-2xl border border-slate-200 bg-slate-50 p-3">
            {index < rows.length - 1 ? <span className="absolute left-[calc(50%+1.25rem)] top-7 hidden h-px w-[calc(100%-2.5rem)] bg-slate-200 xl:block" /> : null}
            <span className="relative z-10 inline-flex size-9 items-center justify-center rounded-full border border-blue-200 bg-white text-blue-700">
              <ClipboardCheck size={15} />
            </span>
            <p className="mt-2 truncate text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">{stage.label}</p>
            <p className="mt-1 text-2xl font-semibold text-slate-950">{formatNumber(stage.count)}</p>
            <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
              <span className={`size-2 rounded-full ${statusColors[stage.status] || statusColors.on_track}`} />
              <span>{stage.status === 'bottleneck' ? 'Bottleneck' : stage.status === 'attention' ? 'Attention needed' : 'On track'}</span>
            </div>
          </article>
        ))}
      </div>
      <div className="flex flex-wrap gap-4 text-xs text-slate-500">
        <span className="inline-flex items-center gap-2"><span className="size-2 rounded-full bg-red-500" /> Bottleneck / High volume</span>
        <span className="inline-flex items-center gap-2"><span className="size-2 rounded-full bg-amber-500" /> Attention needed</span>
        <span className="inline-flex items-center gap-2"><span className="size-2 rounded-full bg-emerald-500" /> On track</span>
      </div>
    </section>
  )
}

function MattersByRole({ data = {} }) {
  const rows = [
    { label: 'Transfer Attorney Only', value: data.transferOnly || 0, color: 'bg-blue-600' },
    { label: 'Bond Attorney Only', value: data.bondOnly || 0, color: 'bg-sky-500' },
    { label: 'Cancellation Attorney Only', value: data.cancellationOnly || 0, color: 'bg-rose-400' },
    { label: 'Dual Role Matters', value: data.dualRole || 0, color: 'bg-amber-500' },
    { label: 'All 3 Roles', value: data.allThreeRoles || 0, color: 'bg-violet-600' },
  ]
  const total = rows.reduce((sum, row) => sum + row.value, 0)

  return (
    <section className={`${cardClass} ${cardPadding} grid gap-3 lg:col-span-3 xl:col-span-3`}>
      <h2 className="text-sm font-medium text-slate-950">Matters by Role</h2>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center xl:flex-col">
        <div className="relative mx-auto size-40 shrink-0 rounded-full bg-[conic-gradient(#2563eb_0_42%,#0ea5e9_42%_58%,#fb7185_58%_68%,#f59e0b_68%_84%,#7c3aed_84%_100%)]">
          <div className="absolute inset-8 grid place-items-center rounded-full bg-white text-center">
            <strong className="block text-2xl text-slate-950">{formatNumber(total)}</strong>
            <span className="text-xs text-slate-500">Matters</span>
          </div>
        </div>
        <div className="grid min-w-0 flex-1 gap-2">
          {rows.map((row) => (
            <div key={row.label} className="flex items-center justify-between gap-3 text-sm">
              <span className="inline-flex min-w-0 items-center gap-2 text-slate-600"><span className={`size-2 rounded-full ${row.color}`} /> <span className="truncate">{row.label}</span></span>
              <strong className="shrink-0 text-slate-900">{formatNumber(row.value)}</strong>
            </div>
          ))}
        </div>
      </div>
      <Link to="/transactions" className={actionLinkClass}>View all matters</Link>
    </section>
  )
}

function DepartmentOverview({ rows = [] }) {
  return (
    <section className={`${cardClass} ${cardPadding} grid gap-3 lg:col-span-3 xl:col-span-3`}>
      <h2 className="text-sm font-medium text-slate-950">Department Overview</h2>
      <div className="grid gap-2">
        {(rows || []).map((department) => {
          const delayed = Number(department.delayedMatters || 0)
          const barColor = delayed > 1 ? 'bg-red-500' : delayed > 0 ? 'bg-amber-500' : 'bg-emerald-500'
          return (
            <article key={department.departmentId} className="grid gap-2 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">{department.departmentName}</p>
                  <p className="text-xs text-slate-500">{toTitle(department.departmentType)}</p>
                </div>
                <div className="grid grid-cols-2 gap-3 text-right text-xs">
                  <div><strong className="block text-lg text-slate-950">{formatNumber(department.activeMatters)}</strong><span className="text-slate-500">Active</span></div>
                  <div><strong className={delayed ? 'block text-lg text-red-600' : 'block text-lg text-slate-950'}>{formatNumber(delayed)}</strong><span className="text-slate-500">Delayed</span></div>
                </div>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                <span className={`block h-full rounded-full ${barColor}`} style={{ width: `${Math.max(4, Number(department.capacity || 0))}%` }} />
              </div>
            </article>
          )
        })}
      </div>
      <Link to="/users" className={actionLinkClass}>View departments</Link>
    </section>
  )
}

function StaffWorkload({ rows = [] }) {
  return (
    <section className={`${cardClass} ${cardPadding} grid gap-3 md:col-span-2 lg:col-span-6 xl:col-span-6`}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-slate-950">Staff Workload</h2>
        <Link to="/users" className={actionLinkClass}>View full workload</Link>
      </div>
      <div className="hidden max-h-[270px] overflow-auto rounded-xl border border-slate-100 min-[900px]:block">
        <table className="w-full min-w-[760px] border-collapse">
          <thead className="sticky top-0 z-10 border-b border-slate-200 bg-white">
            <tr>
              {['Staff Member', 'Role', 'Active Matters', 'Delayed', 'Lodging This Week', 'Capacity'].map((header) => (
                <th key={header} className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{header}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(rows || []).map((row) => (
              <tr key={row.memberId}>
                <td className="px-3 py-2 text-sm font-semibold text-slate-950">{row.fullName}</td>
                <td className="px-3 py-2 text-sm text-slate-600">{toTitle(row.role)}</td>
                <td className="px-3 py-2 text-sm text-slate-700">{formatNumber(row.assignedMatters)}</td>
                <td className="px-3 py-2 text-sm text-red-600">{formatNumber(row.delayedMatters)}</td>
                <td className="px-3 py-2 text-sm text-slate-700">{formatNumber(row.lodgingThisWeek)}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="w-10 text-sm font-semibold text-slate-700">{formatNumber(row.capacity)}%</span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200">
                      <span className={`block h-full rounded-full ${row.capacity > 80 ? 'bg-red-500' : row.capacity > 60 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${Math.max(4, Number(row.capacity || 0))}%` }} />
                    </span>
                  </div>
                </td>
              </tr>
            ))}
            {!(rows || []).length ? (
              <tr>
                <td className="px-3 py-8 text-center text-sm text-slate-500" colSpan={6}>No staff workload data yet.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <div className="grid gap-3 min-[900px]:hidden">
        {(rows || []).map((row) => (
          <article key={row.memberId} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-950">{row.fullName}</p>
                <p className="text-xs text-slate-500">{toTitle(row.role)}</p>
              </div>
              <strong className="text-sm text-slate-900">{formatNumber(row.capacity)}%</strong>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-slate-600">
              <span>{formatNumber(row.assignedMatters)} active</span>
              <span>{formatNumber(row.delayedMatters)} delayed</span>
              <span>{formatNumber(row.lodgingThisWeek)} lodging</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

function AttentionList({ rows = [], alerts = [] }) {
  const fallbackRows = [
    { key: 'guarantees', label: 'Matters with overdue guarantees', count: alerts.find((item) => item.key === 'guarantees')?.count || 0 },
    { key: 'fica', label: 'FICA documents overdue', count: alerts.find((item) => item.key === 'fica')?.count || 0 },
    { key: 'documents', label: 'Unsigned OTPs', count: alerts.find((item) => item.key === 'documents')?.count || 0 },
    { key: 'stale', label: 'Matters with no activity (7+ days)', count: 0 },
    { key: 'missing', label: 'Missing documents', count: 0 },
    { key: 'lodgements', label: 'Lodgements due this week', count: alerts.find((item) => item.key === 'lodgement')?.count || 0 },
  ]
  const displayRows = rows.length
    ? rows.slice(0, 6).map((row) => ({ key: row.matterId, label: row.issue || row.matterReference, count: 1 }))
    : fallbackRows

  return (
    <section className={`${cardClass} ${cardPadding} grid gap-3 lg:col-span-3 xl:col-span-3`}>
      <h2 className="text-sm font-medium text-slate-950">Matters Requiring Attention</h2>
      <div className="grid gap-2">
        {displayRows.map((row) => (
          <Link key={row.key} to="/transactions" className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 transition hover:bg-slate-100">
            <span className="inline-flex min-w-0 items-center gap-2 text-sm font-medium text-slate-700"><AlertTriangle size={15} className="shrink-0 text-red-500" /><span className="truncate">{row.label}</span></span>
            <strong className="text-sm text-red-600">{formatNumber(row.count)}</strong>
          </Link>
        ))}
      </div>
      <Link to="/transactions" className={actionLinkClass}>View all</Link>
    </section>
  )
}

function RecentActivity({ rows = [] }) {
  return (
    <section className={`${cardClass} ${cardPadding} grid gap-3 lg:col-span-3 xl:col-span-3`}>
      <h2 className="text-sm font-medium text-slate-950">Recent Activity</h2>
      <div className="grid max-h-[270px] gap-2 overflow-y-auto pr-1">
        {(rows || []).length ? rows.map((row) => (
          <article key={row.id} className="flex items-start justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
            <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700"><CheckCircle2 size={15} /></span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-800">{row.message}</p>
              <p className="text-xs text-slate-500">{row.type || 'Activity'}</p>
            </div>
            <time className="shrink-0 text-right text-xs text-slate-500">{row.occurredAt ? new Date(row.occurredAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</time>
          </article>
        )) : (
          <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">Activity will appear here as your team works on matters.</p>
        )}
      </div>
      <Link to="/reports" className={actionLinkClass}>View all activity</Link>
    </section>
  )
}

function UpcomingDates({ rows = [] }) {
  const iconMap = { signings: Signature, lodgements: Landmark, registrations: FileCheck2, guarantees: ShieldAlert }
  return (
    <section className={`${cardClass} ${cardPadding} grid gap-3 md:col-span-2 lg:col-span-3 xl:col-span-6`}>
      <h2 className="text-sm font-medium text-slate-950">Upcoming Key Dates <span className="font-normal text-slate-500">(Next 7 Days)</span></h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(rows || []).map((row) => {
          const Icon = iconMap[row.key] || CalendarDays
          return (
            <article key={row.key} className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3">
              <span className="inline-flex size-10 items-center justify-center rounded-xl bg-white text-blue-700"><Icon size={17} /></span>
              <div><strong className="text-xl text-slate-950">{formatNumber(row.count)}</strong><p className="text-sm font-semibold text-slate-800">{row.label}</p><p className="text-xs text-slate-500">{row.helper}</p></div>
            </article>
          )
        })}
      </div>
    </section>
  )
}

function FinancialSnapshot({ data = {} }) {
  const items = [
    { label: 'Fees Billed', value: formatCurrency(data.feesBilled), icon: Wallet },
    { label: 'Fees Collected', value: formatCurrency(data.feesCollected), icon: CheckCircle2 },
    { label: 'Outstanding Fees', value: formatCurrency(data.outstandingFees), icon: Clock3 },
    { label: 'Trust Balance', value: formatCurrency(data.trustBalance), icon: Scale },
  ]
  return (
    <section className={`${cardClass} ${cardPadding} grid gap-3 md:col-span-2 lg:col-span-3 xl:col-span-6`}>
      <h2 className="text-sm font-medium text-slate-950">Financial Snapshot <span className="font-normal text-slate-500">(This Month)</span></h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((item) => {
          const Icon = item.icon
          return (
            <article key={item.label} className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3">
              <span className="inline-flex size-10 items-center justify-center rounded-xl bg-white text-blue-700"><Icon size={17} /></span>
              <div className="min-w-0"><strong className="block truncate text-lg text-slate-950">{item.value}</strong><p className="text-xs font-semibold text-slate-500">{item.label}</p></div>
            </article>
          )
        })}
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
  const shellClass = 'mx-auto grid w-full max-w-[1600px] gap-4 px-4 py-4 sm:px-6'
  const selectedRoleLabel = useMemo(
    () => ROLE_VIEW_OPTIONS.find((option) => option.value === roleView)?.label || 'All Matters',
    [roleView],
  )

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
        setError(loadError?.message || 'Unable to load attorney management dashboard.')
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
  if (loading) return <StatePanel>Loading attorney management dashboard...</StatePanel>

  if (!dashboard?.firm?.id) {
    const hasProfileFirmLink = Boolean(String(profile?.primaryAttorneyFirmId || '').trim())
    return (
      <section className={shellClass}>
        <div className={`${cardClass} ${cardPadding} grid gap-3`}>
          <h2 className="text-xl font-semibold text-slate-950">Firm Setup Pending</h2>
          <p className="text-sm text-slate-600">
            {hasProfileFirmLink
              ? 'Your profile points to an attorney firm, but we could not load an active firm workspace. Review or repair the firm setup to unlock full workflow access.'
              : 'Your onboarding is complete, but your attorney firm is not configured yet. Continue setup to unlock full workflow access.'}
          </p>
          <div className="flex flex-wrap gap-2">
            <Link to="/attorney/onboarding?repair=firm" className="inline-flex min-h-10 items-center rounded-xl bg-[#10273A] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1F3E57]">
              {hasProfileFirmLink ? 'Repair Firm Setup' : 'Continue Firm Setup'}
            </Link>
            <Link to="/setup" className="inline-flex min-h-10 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50">View Setup Status</Link>
          </div>
        </div>
      </section>
    )
  }

  if (!dashboard.canViewFirmDashboard) return <Navigate to="/attorney/operations" replace />

  return (
    <section className={shellClass}>
      {error ? <div className={`${cardClass} ${cardPadding}`}><p className="text-sm text-red-700">{error}</p></div> : null}
      <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-6 xl:grid-cols-12">
        <FirmSummaryCard dashboard={dashboard} />
        <CriticalAlerts alerts={dashboard.criticalAlerts} />
      </div>
      <KpiStrip stats={dashboard.matterStats} />
      <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-6 xl:grid-cols-12">
        <MatterPipeline rows={dashboard.matterPipeline} roleLabel={selectedRoleLabel} />
        <MattersByRole data={dashboard.mattersByRole} />
        <DepartmentOverview rows={dashboard.departmentOverview} />
        <StaffWorkload rows={dashboard.staffWorkload} />
        <AttentionList rows={dashboard.mattersRequiringAttention} alerts={dashboard.criticalAlerts} />
        <RecentActivity rows={dashboard.recentActivity} />
        <UpcomingDates rows={dashboard.upcomingKeyDates} />
        <FinancialSnapshot data={dashboard.financialSnapshot} />
      </div>
    </section>
  )
}

export default AttorneyDashboardPage
