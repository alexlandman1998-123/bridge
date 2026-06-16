import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Clock3,
  FileCheck2,
  FileWarning,
  Landmark,
  Plus,
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
  upcomingKeyDates: [],
  todayCalendar: [],
  matterLanes: {
    transfer: [],
    bond: [],
    cancellation: [],
  },
}

const surfaceClass = 'min-w-0 rounded-xl border border-slate-200/80 bg-white shadow-[0_8px_22px_rgba(15,23,42,0.035)]'
const softButtonClass = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50'
const primaryButtonClass = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-[#17324b] bg-[#17324b] px-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#224761]'

function formatNumber(value) {
  return new Intl.NumberFormat('en-ZA').format(Number(value || 0))
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

function getStatusMeta(matter = {}) {
  const label = String(matter.statusLabel || matter.currentStage || '').trim()
  const normalized = label.toLowerCase()
  if (matter.riskTone === 'high' || normalized.includes('delayed') || normalized.includes('blocked')) {
    return { label: 'Needs Action', className: 'border-red-200 bg-red-50 text-red-700' }
  }
  if (normalized.includes('guarantee')) return { label: 'Awaiting Guarantees', className: 'border-orange-200 bg-orange-50 text-orange-700' }
  if (normalized.includes('lodg')) return { label: 'Lodgement Prep', className: 'border-blue-200 bg-blue-50 text-blue-700' }
  if (normalized.includes('draft')) return { label: 'Drafting', className: 'border-slate-200 bg-slate-50 text-slate-700' }
  if (normalized.includes('sign') || normalized.includes('otp')) return { label: 'Signatures Pending', className: 'border-amber-200 bg-amber-50 text-amber-700' }
  if (matter.riskTone === 'attention') return { label: 'Watch', className: 'border-amber-200 bg-amber-50 text-amber-700' }
  return { label: 'On Track', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' }
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

function DashboardHeader() {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <Link to="/new-transaction" className={primaryButtonClass}>
        <Plus size={15} />
        Create Matter
      </Link>
      <Link to="/documents" className={softButtonClass}>
        <FileCheck2 size={15} />
        Request Document
      </Link>
      <Link to="/attorney/scheduling" className={softButtonClass}>
        <CalendarClock size={15} />
        Schedule Appointment
      </Link>
    </div>
  )
}

function SectionHeading({ title, actionHref, actionLabel }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-base font-semibold text-slate-950">{title}</h2>
      {actionHref ? (
        <Link to={actionHref} className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-slate-950">
          {actionLabel || 'View all'} <ArrowRight size={13} />
        </Link>
      ) : null}
    </div>
  )
}

function DailyStatusCards({ stats = {}, alerts = [] }) {
  const requiringAttention = Number(stats.delayedMatters || 0) + Number(alerts.find((item) => item.key === 'guarantees')?.count || 0)
  const cards = [
    { key: 'active', label: 'Active Matters', value: stats.activeMatters, helper: 'In progress', icon: UsersRound },
    { key: 'attention', label: 'Require Attention', value: requiringAttention, helper: 'Needs your action', icon: AlertTriangle },
    { key: 'lodgements', label: 'Lodgements Today', value: stats.lodgementsToday || stats.lodgementsPending || 0, helper: 'Scheduled or due', icon: CalendarClock },
    { key: 'registration', label: 'Registration Expected', value: stats.registeredThisMonth || 0, helper: 'This month', icon: CheckCircle2 },
    { key: 'documents', label: 'Awaiting Documents', value: Number(stats.awaitingFica || 0) + Number(stats.awaitingSignatures || 0), helper: 'Client or signing', icon: FileWarning },
  ]

  return (
    <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {cards.map((card) => {
        const Icon = card.icon
        return (
          <article key={card.key} className={`${surfaceClass} min-h-[126px] p-4`}>
            <div className="flex items-start justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">{card.label}</p>
              <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                <Icon size={15} />
              </span>
            </div>
            <strong className="mt-5 block text-3xl font-semibold leading-none tracking-[-0.03em] text-slate-950">{formatNumber(card.value)}</strong>
            <span className="mt-1 block text-xs text-slate-500">{card.helper}</span>
          </article>
        )
      })}
    </section>
  )
}

function NeedsAttentionPanel({ alerts = [], matters = [] }) {
  const normalizedAlerts = [
    { key: 'guarantees', label: 'Guarantees Pending', count: alerts.find((item) => item.key === 'guarantees')?.count || 0, icon: ShieldAlert },
    { key: 'invoices', label: 'Invoices Overdue', count: alerts.find((item) => item.key === 'invoices')?.count || 0, icon: FileWarning },
    { key: 'signatures', label: 'Signatures Pending', count: alerts.find((item) => item.key === 'documents')?.count || 0, icon: Signature },
    { key: 'clearances', label: 'Clearances Expiring', count: alerts.find((item) => item.key === 'clearances')?.count || 0, icon: Clock3 },
    { key: 'inactive', label: 'Inactive 14+ Days', count: matters.filter((item) => Number(item.daysInactive || 0) >= 14).length || alerts.find((item) => item.key === 'fica')?.count || 0, icon: AlertTriangle },
  ]

  return (
    <section className="grid gap-3">
      <SectionHeading title="Needs Attention" actionHref="/attorney/matters/delayed" actionLabel="Open queue" />
      <div className={`${surfaceClass} grid gap-0 divide-y divide-slate-100 overflow-hidden md:grid-cols-5 md:divide-x md:divide-y-0`}>
        {normalizedAlerts.map((alert) => {
          const Icon = alert.icon
          return (
            <Link key={alert.key} to="/attorney/matters/delayed" className="group flex min-h-[96px] items-center gap-3 p-4 transition hover:bg-slate-50">
              <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#eef4f8] text-[#315b74]">
                <Icon size={16} />
              </span>
              <span className="min-w-0">
                <strong className="block text-xl font-semibold leading-none text-slate-950">{formatNumber(alert.count)}</strong>
                <span className="mt-1 block truncate text-xs font-semibold text-slate-600">{alert.label}</span>
              </span>
            </Link>
          )
        })}
      </div>
    </section>
  )
}

function PipelinePanel({ title, icon, matters = [], href }) {
  const total = matters.length
  const topMatters = matters.slice(0, 5)
  const atRiskCount = matters.filter((matter) => matter.riskTone === 'high' || matter.riskTone === 'attention').length
  const healthLabel = atRiskCount ? `${formatNumber(atRiskCount)} need attention` : 'Healthy'
  const iconNode = icon ? createElement(icon, { size: 17 }) : null

  return (
    <section className={`${surfaceClass} flex h-full min-h-[350px] flex-col p-4`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
            {iconNode}
          </span>
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-slate-950">{title}</h3>
            <p className="text-xs text-slate-500">{formatNumber(total)} active matters</p>
          </div>
        </div>
        <Link to={href} className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-slate-950">View <ArrowRight size={13} /></Link>
      </div>

      <div className="mt-4 grid flex-1 content-start divide-y divide-slate-100">
        {topMatters.length ? topMatters.map((matter) => {
          const status = getStatusMeta(matter)
          return (
            <Link key={matter.id} to={matter.href || href} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-3 py-3 transition hover:bg-slate-50">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-950">{matter.reference}</p>
                <p className="mt-0.5 truncate text-xs text-slate-500">{matter.contextLine || matter.propertyAddress || 'Property and client pending'}</p>
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

      <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs">
        <span className="text-slate-500">Pipeline health</span>
        <strong className={atRiskCount ? 'text-amber-700' : 'text-emerald-700'}>{healthLabel}</strong>
      </div>
    </section>
  )
}

function MatterPipelines({ lanes = {} }) {
  return (
    <section className="grid gap-3">
      <SectionHeading title="Matter Pipelines" />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <PipelinePanel title="Transfer Matters" icon={Scale} matters={lanes.transfer || []} href="/attorney/matters/transfer" />
        <PipelinePanel title="Bond Matters" icon={Landmark} matters={lanes.bond || []} href="/attorney/matters/bond" />
        <PipelinePanel title="Cancellation Matters" icon={ShieldAlert} matters={lanes.cancellation || []} href="/attorney/matters/cancellation" />
      </div>
    </section>
  )
}

function TodayCalendar({ rows = [] }) {
  return (
    <section className="grid gap-3">
      <SectionHeading title="Today's Calendar" actionHref="/attorney/scheduling" actionLabel="Open calendar" />
      <div className={`${surfaceClass} divide-y divide-slate-100`}>
        {rows.length ? rows.map((item) => (
            <article key={item.id} className="grid grid-cols-[70px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3">
              <time className="text-xs font-semibold text-slate-500">{formatShortTime(item.dateTime) || 'TBC'}</time>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900">{item.type}</p>
                <p className="mt-0.5 truncate text-xs text-slate-500">{item.matterReference}</p>
              </div>
              <span className="text-xs font-medium text-slate-500">{item.duration || item.status || ''}</span>
            </article>
          )) : (
            <p className="p-4 text-sm text-slate-600">No signing appointments, lodgements, consultations, or registrations are visible for today.</p>
          )}
      </div>
    </section>
  )
}

function DocumentRequests({ stats = {} }) {
  const rows = [
    { label: 'Outstanding Requests', value: Number(stats.awaitingFica || 0), helper: 'Client documents' },
    { label: 'Awaiting Review', value: Number(stats.awaitingSignatures || 0), helper: 'Signing and OTP' },
    { label: 'Rejected Today', value: Number(stats.rejectedDocumentsToday || 0), helper: 'Needs correction' },
  ]
  return (
    <section className="grid gap-3">
      <SectionHeading title="Document Requests" actionHref="/documents" actionLabel="Open documents" />
      <div className={`${surfaceClass} grid gap-0 divide-y divide-slate-100 sm:grid-cols-3 sm:divide-x sm:divide-y-0`}>
        {rows.map((row) => (
          <Link key={row.label} to="/documents" className="p-4 transition hover:bg-slate-50">
            <strong className="block text-2xl font-semibold tracking-[-0.03em] text-slate-950">{formatNumber(row.value)}</strong>
            <span className="mt-1 block text-xs font-semibold text-slate-700">{row.label}</span>
            <span className="mt-0.5 block text-xs text-slate-500">{row.helper}</span>
          </Link>
        ))}
      </div>
    </section>
  )
}

function RecentActivity({ rows = [] }) {
  return (
    <section className="grid gap-3">
      <SectionHeading title="Recent Activity" actionHref="/reports" actionLabel="View history" />
      <div className={`${surfaceClass} divide-y divide-slate-100`}>
        {rows.length ? rows.slice(0, 5).map((row) => (
          <article key={row.id} className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3">
            <span className="size-2 rounded-full bg-slate-300" />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-800">{row.message}</p>
              <p className="text-xs text-slate-500">{row.type || 'Activity'} · {formatShortDate(row.occurredAt)}</p>
            </div>
            <time className="shrink-0 text-right text-xs font-medium text-slate-500">{formatShortTime(row.occurredAt)}</time>
          </article>
        )) : (
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

  return (
    <section className={shellClass}>
      {error ? <div className={`${surfaceClass} p-4`}><p className="text-sm text-red-700">{error}</p></div> : null}

      <DashboardHeader />
      <DailyStatusCards stats={dashboard.matterStats} alerts={dashboard.criticalAlerts} />
      <NeedsAttentionPanel alerts={dashboard.criticalAlerts} matters={dashboard.mattersRequiringAttention} />
      <MatterPipelines lanes={lanes} />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)]">
        <TodayCalendar rows={dashboard.todayCalendar || []} />
        <DocumentRequests stats={dashboard.matterStats} />
      </div>
      <RecentActivity rows={dashboard.recentActivity} />
    </section>
  )
}

export default AttorneyDashboardPage
