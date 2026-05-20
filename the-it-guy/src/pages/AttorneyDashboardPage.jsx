import {
  AlertTriangle,
  ArrowRight,
  BadgeDollarSign,
  Banknote,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  FileCheck2,
  FileWarning,
  Landmark,
  LineChart,
  PieChart,
  Scale,
  ShieldAlert,
  Signature,
  UsersRound,
} from 'lucide-react'
import { createElement, useEffect, useMemo, useState } from 'react'
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
  canViewFirmDashboard: false,
  matterStats: {},
  criticalAlerts: [],
  mattersRequiringAttention: [],
  recentActivity: [],
  financialSnapshot: {},
  businessIntelligence: {},
  matterLanes: {
    transfer: [],
    bond: [],
    cancellation: [],
  },
}

const cardClass = 'min-w-0 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm'
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

function formatShortDate(value) {
  const parsed = new Date(value || '')
  if (Number.isNaN(parsed.getTime())) return 'Now'
  return parsed.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short' })
}

function formatShortTime(value) {
  const parsed = new Date(value || '')
  if (Number.isNaN(parsed.getTime())) return ''
  return parsed.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })
}

function StatePanel({ children, tone = 'neutral' }) {
  const toneClass = tone === 'danger' ? 'text-red-700' : 'text-slate-600'
  return (
    <section className="grid w-full max-w-none gap-4 px-3 py-4 sm:px-4 lg:px-5">
      <div className={`${cardClass} p-4`}>
        <p className={`text-sm ${toneClass}`}>{children}</p>
      </div>
    </section>
  )
}

function PageHeader({ firmName }) {
  return (
    <section className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{firmName || 'Attorney Workspace'}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-normal text-slate-950 sm:text-3xl">Attorney Dashboard</h1>
        <p className="mt-1 text-sm text-slate-600">Overview of your operational performance and matters.</p>
      </div>
      <div className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 shadow-sm">
        <CalendarClock size={15} className="text-blue-700" />
        {new Date().toLocaleDateString('en-ZA', { day: '2-digit', month: 'long', year: 'numeric' })}
      </div>
    </section>
  )
}

function SectionHeading({ title, actionHref, actionLabel }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-base font-semibold text-slate-950">{title}</h2>
      {actionHref ? (
        <Link to={actionHref} className={actionLinkClass}>
          {actionLabel || 'View all'} <ArrowRight size={13} />
        </Link>
      ) : null}
    </div>
  )
}

function ExecutiveSnapshot({ stats = {}, alerts = [] }) {
  const atRisk = Number(stats.delayedMatters || 0)
  const guaranteesPending = alerts.find((item) => item.key === 'guarantees')?.count || 0
  const activeMatters = Number(stats.activeMatters || 0)
  const slaCompliance = activeMatters ? Math.max(0, Math.round(((activeMatters - atRisk) / activeMatters) * 100)) : 0
  const cards = [
    { key: 'active', label: 'Active Matters', value: activeMatters, helper: 'Firm-scoped active matters', icon: UsersRound, tone: 'blue' },
    { key: 'registered', label: 'Registrations This Month', value: stats.registeredThisMonth, helper: 'Confirmed this month', icon: FileCheck2, tone: 'emerald' },
    { key: 'risk', label: 'Matters At Risk', value: atRisk, helper: atRisk ? 'Needs management review' : 'No delayed matters', icon: AlertTriangle, tone: 'red' },
    { key: 'guarantees', label: 'Guarantees Pending', value: guaranteesPending, helper: 'Awaiting guarantee movement', icon: ShieldAlert, tone: 'amber' },
    { key: 'sla', label: 'SLA Compliance', value: `${slaCompliance}%`, helper: activeMatters ? 'Based on delayed matter ratio' : 'No active sample yet', icon: CheckCircle2, tone: 'violet' },
  ]
  const toneMap = {
    blue: 'bg-blue-50 text-blue-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    red: 'bg-red-50 text-red-700',
    amber: 'bg-amber-50 text-amber-700',
    violet: 'bg-violet-50 text-violet-700',
  }

  return (
    <section className="grid gap-3">
      <SectionHeading title="Executive Snapshot" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
        {cards.map((card) => {
          const Icon = card.icon
          return (
            <article key={card.key} className={`${cardClass} flex min-h-[116px] flex-col justify-between p-4`}>
              <div className="flex items-center gap-3">
                <span className={`inline-flex size-9 shrink-0 items-center justify-center rounded-xl ${toneMap[card.tone]}`}>
                  <Icon size={16} />
                </span>
                <p className="min-w-0 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">{card.label}</p>
              </div>
              <div>
                <strong className="block text-2xl font-semibold leading-none text-slate-950">{typeof card.value === 'number' ? formatNumber(card.value) : card.value}</strong>
                <span className="mt-1 block text-xs text-slate-500">{card.helper}</span>
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}

function getStatusMeta(matter = {}) {
  const label = String(matter.statusLabel || '').trim()
  const normalized = label.toLowerCase()
  if (matter.riskTone === 'high' || normalized.includes('delayed')) return { label: 'Delayed', className: 'border-red-200 bg-red-50 text-red-700' }
  if (normalized.includes('guarantee')) return { label: 'Awaiting Guarantees', className: 'border-orange-200 bg-orange-50 text-orange-700' }
  if (normalized.includes('fica') || normalized.includes('signature')) return { label: 'Awaiting Client', className: 'border-amber-200 bg-amber-50 text-amber-700' }
  if (normalized.includes('bond') || normalized.includes('bank')) return { label: 'Awaiting Bank', className: 'border-blue-200 bg-blue-50 text-blue-700' }
  if (matter.riskTone === 'attention') return { label: 'At Risk', className: 'border-amber-200 bg-amber-50 text-amber-700' }
  return { label: 'On Track', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' }
}

function PipelinePanel({ title, icon, matters = [], href, tone = 'blue' }) {
  const toneMap = {
    blue: 'bg-blue-50 text-blue-700',
    violet: 'bg-violet-50 text-violet-700',
    rose: 'bg-rose-50 text-rose-700',
  }
  const total = matters.length
  const topMatters = matters.slice(0, 5)
  const atRiskCount = matters.filter((matter) => matter.riskTone === 'high' || matter.riskTone === 'attention').length
  const progress = total ? Math.max(8, Math.round(((total - atRiskCount) / total) * 100)) : 0
  const iconNode = icon ? createElement(icon, { size: 18 }) : null

  return (
    <section className={`${cardClass} flex h-full min-h-[344px] flex-col p-4`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className={`inline-flex size-10 shrink-0 items-center justify-center rounded-xl ${toneMap[tone]}`}>
            {iconNode}
          </span>
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-slate-950">{title}</h3>
            <p className="text-xs text-slate-500">{formatNumber(total)} active matters</p>
          </div>
        </div>
        <Link to={href} className={actionLinkClass}>View all <ArrowRight size={13} /></Link>
      </div>

      <div className="mt-4 grid flex-1 content-start divide-y divide-slate-100">
        {topMatters.length ? topMatters.map((matter) => {
          const status = getStatusMeta(matter)
          return (
            <Link key={matter.id} to={matter.href || href} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-3 py-2.5 transition hover:bg-slate-50">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900">{matter.reference}</p>
                <p className="mt-0.5 truncate text-xs text-slate-500">{matter.currentStage || 'Instruction'}</p>
              </div>
              <div className="grid justify-items-end gap-1">
                <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${status.className}`}>{status.label}</span>
                <span className="text-[11px] font-medium text-slate-500">{formatNumber(matter.daysInStage)}d</span>
              </div>
            </Link>
          )
        }) : (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
            No active {title.toLowerCase()} currently visible.
          </div>
        )}
      </div>

      <div className="mt-4 border-t border-slate-100 pt-3">
        <div className="mb-2 flex items-center justify-between text-xs">
          <span className="font-medium text-slate-500">Pipeline health</span>
          <strong className="text-slate-700">{formatNumber(total)} total</strong>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
          <span className="block h-full rounded-full bg-blue-600" style={{ width: `${progress}%` }} />
        </div>
      </div>
    </section>
  )
}

function OperationalPipelines({ lanes = {} }) {
  return (
    <section className="grid gap-3">
      <SectionHeading title="Operational Pipelines" />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <PipelinePanel title="Transfer Matters" icon={Scale} matters={lanes.transfer || []} href="/attorney/matters/transfer" tone="blue" />
        <PipelinePanel title="Bond Matters" icon={Landmark} matters={lanes.bond || []} href="/attorney/matters/bond" tone="violet" />
        <PipelinePanel title="Cancellation Matters" icon={ShieldAlert} matters={lanes.cancellation || []} href="/attorney/matters/cancellation" tone="rose" />
      </div>
    </section>
  )
}

function CriticalAlerts({ alerts = [] }) {
  const normalizedAlerts = [
    { key: 'guarantees', label: 'Guarantees overdue', count: alerts.find((item) => item.key === 'guarantees')?.count || 0, tone: 'red', icon: ShieldAlert },
    { key: 'lodgement', label: 'Lodgements tomorrow', count: alerts.find((item) => item.key === 'lodgement')?.count || 0, tone: 'blue', icon: CalendarClock },
    { key: 'documents', label: 'Unsigned OTPs', count: alerts.find((item) => item.key === 'documents')?.count || 0, tone: 'amber', icon: Signature },
    { key: 'missing', label: 'Missing documents', count: 0, tone: 'orange', icon: FileWarning },
    { key: 'fica', label: 'FICA responses overdue', count: alerts.find((item) => item.key === 'fica')?.count || 0, tone: 'orange', icon: AlertTriangle },
  ]
  const toneMap = {
    red: 'border-red-200 bg-red-50 text-red-700',
    orange: 'border-orange-200 bg-orange-50 text-orange-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-700',
    blue: 'border-blue-200 bg-blue-50 text-blue-700',
  }

  return (
    <section className="grid gap-3">
      <SectionHeading title="Critical Alerts" actionHref="/transactions" actionLabel="View all alerts" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
        {normalizedAlerts.map((alert) => {
          const Icon = alert.icon
          return (
            <Link key={alert.key} to="/transactions" className={`${cardClass} min-h-[98px] p-3 transition hover:-translate-y-0.5 hover:shadow-md`}>
              <div className="flex items-start justify-between gap-3">
                <span className={`inline-flex size-8 items-center justify-center rounded-xl border ${toneMap[alert.tone]}`}>
                  <Icon size={15} />
                </span>
                <strong className="text-xl font-semibold leading-none text-slate-950">{formatNumber(alert.count)}</strong>
              </div>
              <p className="mt-3 text-xs font-semibold leading-5 text-slate-800">{alert.label}</p>
              <span className="mt-1 inline-flex text-xs font-semibold text-blue-700">View matters</span>
            </Link>
          )
        })}
      </div>
    </section>
  )
}

function EmptyChartState({ children = 'No scoped data yet.' }) {
  return <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">{children}</p>
}

function BarList({ rows = [], valueKey = 'count', currency = false }) {
  const max = Math.max(...rows.map((row) => Number(row[valueKey] || 0)), 1)
  if (!rows.length) return <EmptyChartState>No source data captured yet.</EmptyChartState>
  return (
    <div className="grid gap-3">
      {rows.map((row) => {
        const value = Number(row[valueKey] || 0)
        return (
          <div key={row.label} className="grid gap-1.5">
            <div className="flex min-w-0 items-center justify-between gap-3 text-xs">
              <span className="truncate font-semibold text-slate-700">{row.label}</span>
              <strong className="shrink-0 text-slate-900">{currency ? formatCurrency(value) : formatNumber(value)}</strong>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <span className="block h-full rounded-full bg-blue-600" style={{ width: `${Math.max(5, Math.round((value / max) * 100))}%` }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

function SegmentedChart({ rows = [], tone = 'blue' }) {
  const colors = tone === 'finance'
    ? ['#2563eb', '#16a34a', '#7c3aed', '#64748b']
    : ['#2563eb', '#7c3aed', '#16a34a', '#64748b']
  const total = rows.reduce((sum, row) => sum + Number(row.count || 0), 0)
  if (!total) return <EmptyChartState>No breakdown data yet.</EmptyChartState>
  return (
    <div className="grid gap-3">
      <div className="flex h-3 overflow-hidden rounded-full bg-slate-100">
        {rows.map((row, index) => (
          <span
            key={row.label}
            style={{ width: `${Math.max(3, Math.round((Number(row.count || 0) / total) * 100))}%`, background: colors[index % colors.length] }}
          />
        ))}
      </div>
      <div className="grid gap-2">
        {rows.map((row, index) => (
          <div key={row.label} className="flex items-center justify-between gap-3 text-xs">
            <span className="inline-flex min-w-0 items-center gap-2 text-slate-600">
              <i className="size-2 shrink-0 rounded-full" style={{ background: colors[index % colors.length] }} />
              <span className="truncate">{row.label}</span>
            </span>
            <strong className="shrink-0 text-slate-900">{formatNumber(row.count)} · {row.percentage || Math.round((Number(row.count || 0) / total) * 100)}%</strong>
          </div>
        ))}
      </div>
    </div>
  )
}

function IntelligenceCard({ title, icon, action = 'This month', children }) {
  const iconNode = icon ? createElement(icon, { size: 16 }) : null
  return (
    <section className={`${cardClass} flex min-h-[244px] flex-col p-4`}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
            {iconNode}
          </span>
          <h3 className="truncate text-sm font-semibold text-slate-950">{title}</h3>
        </div>
        <span className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-500">{action}</span>
      </div>
      <div className="flex-1">{children}</div>
    </section>
  )
}

function BusinessIntelligence({ data = {}, financialSnapshot = {} }) {
  const avgDays = Number(data.averageRegistrationDays || 0)
  return (
    <section className="grid gap-3">
      <SectionHeading title="Business Intelligence" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        <IntelligenceCard title="Top Referring Agents by Volume" icon={UsersRound}>
          <BarList rows={data.topAgentsByVolume || []} />
        </IntelligenceCard>
        <IntelligenceCard title="Top Referring Agents by Value" icon={BadgeDollarSign}>
          <BarList rows={data.topAgentsByValue || []} valueKey="value" currency />
        </IntelligenceCard>
        <IntelligenceCard title="Business Breakdown" icon={PieChart}>
          <SegmentedChart rows={data.businessBreakdown || []} />
        </IntelligenceCard>
        <IntelligenceCard title="Bank Breakdown" icon={Banknote}>
          <BarList rows={data.bankBreakdown || []} />
        </IntelligenceCard>
        <IntelligenceCard title="Cash vs Bond" icon={CircleDollarSign}>
          <SegmentedChart rows={data.financeBreakdown || []} tone="finance" />
        </IntelligenceCard>
        <IntelligenceCard title="Average Registration Time" icon={LineChart}>
          <div className="flex h-full flex-col justify-between gap-4">
            <div>
              <strong className="text-3xl font-semibold leading-none text-slate-950">{formatNumber(avgDays)}d</strong>
              <p className="mt-2 text-sm text-slate-500">
                {data.registrationSampleSize ? `${formatNumber(data.registrationSampleSize)} registered matters sampled` : 'Registration date sample not available yet'}
              </p>
            </div>
            <div className="grid gap-2 rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs text-slate-600">
              <span className="flex justify-between gap-3"><span>Fees billed</span><strong className="text-slate-900">{formatCurrency(financialSnapshot.feesBilled)}</strong></span>
              <span className="flex justify-between gap-3"><span>Outstanding</span><strong className="text-slate-900">{formatCurrency(financialSnapshot.outstandingFees)}</strong></span>
            </div>
          </div>
        </IntelligenceCard>
      </div>
    </section>
  )
}

function RecentActivity({ rows = [] }) {
  const iconMap = {
    firm: CheckCircle2,
    department: BarChart3,
    member: UsersRound,
    invite: CalendarClock,
    assignment: FileCheck2,
  }
  return (
    <section className="grid gap-3">
      <SectionHeading title="Recent Activity" actionHref="/reports" actionLabel="View all activity" />
      <div className={`${cardClass} divide-y divide-slate-100`}>
        {rows.length ? rows.map((row) => {
          const Icon = iconMap[row.type] || CheckCircle2
          return (
            <article key={row.id} className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3">
              <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                <Icon size={15} />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-800">{row.message}</p>
                <p className="text-xs text-slate-500">{row.type || 'Activity'} · {formatShortDate(row.occurredAt)}</p>
              </div>
              <time className="shrink-0 text-right text-xs font-medium text-slate-500">{formatShortTime(row.occurredAt)}</time>
            </article>
          )
        }) : (
          <p className="p-4 text-sm text-slate-600">Activity will appear here as your team works on matters.</p>
        )}
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
  const shellClass = 'grid w-full max-w-none gap-5 px-3 py-4 sm:px-4 lg:px-4 xl:px-4'

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
        <div className={`${cardClass} grid gap-3 p-4`}>
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

  const lanes = dashboard.matterLanes || EMPTY_DASHBOARD.matterLanes

  return (
    <section className={shellClass}>
      {error ? <div className={`${cardClass} p-4`}><p className="text-sm text-red-700">{error}</p></div> : null}

      <PageHeader firmName={dashboard.firm?.name} />
      <ExecutiveSnapshot stats={dashboard.matterStats} alerts={dashboard.criticalAlerts} />
      <OperationalPipelines lanes={lanes} />
      <CriticalAlerts alerts={dashboard.criticalAlerts} />
      <BusinessIntelligence data={dashboard.businessIntelligence} financialSnapshot={dashboard.financialSnapshot} />
      <RecentActivity rows={dashboard.recentActivity} />
    </section>
  )
}

export default AttorneyDashboardPage
