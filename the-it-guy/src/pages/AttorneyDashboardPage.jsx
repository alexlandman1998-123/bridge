import {
  AlertTriangle,
  ArrowRight,
  BadgeDollarSign,
  Banknote,
  BriefcaseBusiness,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  FileCheck2,
  FileWarning,
  Landmark,
  Scale,
  ShieldAlert,
  Signature,
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
  canViewFirmDashboard: false,
  matterStats: {},
  criticalAlerts: [],
  mattersRequiringAttention: [],
  recentActivity: [],
  financialSnapshot: {},
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

function KpiStrip({ stats = {}, financialSnapshot = {} }) {
  const items = [
    { key: 'transfer', label: 'Active Transfer Matters', value: stats.transferMatters, icon: Scale, tone: 'blue' },
    { key: 'bond', label: 'Active Bond Matters', value: stats.bondMatters, icon: Landmark, tone: 'sky' },
    { key: 'lodgements', label: 'Lodgements Pending', value: stats.lodgementsPending, icon: FileCheck2, tone: 'violet' },
    { key: 'registrations', label: 'Registrations This Month', value: stats.registeredThisMonth, icon: CheckCircle2, tone: 'emerald' },
    { key: 'delayed', label: 'Delayed Matters', value: stats.delayedMatters, icon: Clock3, tone: 'red' },
    { key: 'fees', label: 'Fees Outstanding', value: formatCurrency(financialSnapshot.outstandingFees), icon: BadgeDollarSign, tone: 'amber' },
  ]
  const toneMap = {
    blue: 'bg-blue-50 text-blue-700',
    sky: 'bg-sky-50 text-sky-700',
    violet: 'bg-violet-50 text-violet-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    red: 'bg-red-50 text-red-700',
    amber: 'bg-amber-50 text-amber-700',
  }

  return (
    <section className={`${cardClass} p-3`}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        {items.map((item) => {
          const Icon = item.icon
          return (
            <article key={item.key} className="min-h-[92px] min-w-0 rounded-xl border border-slate-100 bg-white p-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className={`inline-flex size-9 shrink-0 items-center justify-center rounded-xl ${toneMap[item.tone]}`}>
                  <Icon size={16} />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">{item.label}</p>
                  <strong className="mt-1 block truncate text-2xl font-semibold leading-none text-slate-950">{item.value}</strong>
                </div>
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}

function CriticalAlerts({ alerts = [] }) {
  const normalizedAlerts = [
    { key: 'guarantees', label: 'Guarantees overdue', count: alerts.find((item) => item.key === 'guarantees')?.count || 0, tone: 'red', icon: ShieldAlert },
    { key: 'lodgement', label: 'Lodgements tomorrow', count: alerts.find((item) => item.key === 'lodgement')?.count || 0, tone: 'violet', icon: CalendarClock },
    { key: 'documents', label: 'Unsigned OTPs', count: alerts.find((item) => item.key === 'documents')?.count || 0, tone: 'amber', icon: Signature },
    { key: 'stale', label: 'No activity > 14 days', count: 0, tone: 'slate', icon: Clock3 },
    { key: 'missing', label: 'Missing documents', count: 0, tone: 'orange', icon: FileWarning },
    { key: 'fica', label: 'FICA responses overdue', count: alerts.find((item) => item.key === 'fica')?.count || 0, tone: 'orange', icon: AlertTriangle },
  ]
  const toneMap = {
    red: 'border-red-200 bg-red-50 text-red-700',
    orange: 'border-orange-200 bg-orange-50 text-orange-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-700',
    violet: 'border-violet-200 bg-violet-50 text-violet-700',
    slate: 'border-slate-200 bg-slate-50 text-slate-700',
  }

  return (
    <section className={`${cardClass} grid gap-4 p-4`}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-slate-950">Critical Alerts</h2>
        <Link to="/transactions" className={actionLinkClass}>View all alerts <ArrowRight size={13} /></Link>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        {normalizedAlerts.map((alert) => {
          const Icon = alert.icon
          return (
            <Link key={alert.key} to="/transactions" className={`min-h-[112px] rounded-2xl border p-3 transition hover:-translate-y-0.5 hover:shadow-sm ${toneMap[alert.tone]}`}>
              <div className="flex items-center gap-3">
                <span className="inline-flex size-8 items-center justify-center rounded-full bg-white/70">
                  <Icon size={15} />
                </span>
                <strong className="text-2xl font-semibold leading-none">{formatNumber(alert.count)}</strong>
              </div>
              <p className="mt-3 text-xs font-semibold leading-5 text-slate-800">{alert.label}</p>
              <span className="mt-2 inline-flex text-xs font-semibold">View matters</span>
            </Link>
          )
        })}
      </div>
    </section>
  )
}

function RiskBadge({ tone = 'normal', label = 'On track' }) {
  const toneClass = tone === 'high'
    ? 'border-red-200 bg-red-50 text-red-700'
    : tone === 'attention'
      ? 'border-amber-200 bg-amber-50 text-amber-700'
      : 'border-emerald-200 bg-emerald-50 text-emerald-700'
  return <span className={`inline-flex rounded-full border px-2 py-1 text-[11px] font-semibold ${toneClass}`}>{label}</span>
}

function MatterCard({ matter, type }) {
  const isTransfer = type === 'transfer'
  const isBond = type === 'bond'
  return (
    <Link to={matter.href || '/transactions'} className="block w-[300px] shrink-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md 2xl:w-[316px]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-950">{matter.reference}</p>
          <p className="mt-1 truncate text-xs text-slate-500">
            {isTransfer ? matter.propertyAddress : isBond ? matter.propertyAddress || matter.linkedReference : matter.linkedReference}
          </p>
        </div>
        <RiskBadge tone={matter.riskTone} label={matter.statusLabel} />
      </div>

      <div className="mt-4 grid gap-2 text-xs text-slate-600">
        {isTransfer ? (
          <>
            <div className="flex justify-between gap-3"><span>Buyer</span><strong className="min-w-0 truncate text-slate-800">{matter.buyerName}</strong></div>
            <div className="flex justify-between gap-3"><span>Seller</span><strong className="min-w-0 truncate text-slate-800">{matter.sellerName}</strong></div>
          </>
        ) : (
          <>
            <div className="flex justify-between gap-3"><span>Bank</span><strong className="min-w-0 truncate text-slate-800">{matter.bank}</strong></div>
            <div className="flex justify-between gap-3"><span>{isBond ? 'Bond Stage' : 'Cancellation Stage'}</span><strong className="min-w-0 truncate text-slate-800">{matter.currentStage}</strong></div>
          </>
        )}
        {isTransfer ? (
          <div className="flex justify-between gap-3"><span>Stage</span><strong className="min-w-0 truncate text-slate-800">{matter.currentStage}</strong></div>
        ) : null}
        <div className="flex justify-between gap-3"><span>Assigned</span><strong className="min-w-0 truncate text-slate-800">{matter.assignedStaff}</strong></div>
      </div>

      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between text-xs">
          <span className="text-slate-500">Progress</span>
          <strong className="text-slate-700">{formatNumber(matter.daysInStage)} days in stage</strong>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
          <span className="block h-full rounded-full bg-blue-600" style={{ width: `${Math.min(100, Math.max(8, Number(matter.progress || 0)))}%` }} />
        </div>
      </div>
    </Link>
  )
}

function MatterLane({ title, icon: Icon, count, href, matters = [], type, tone = 'blue' }) {
  const toneMap = {
    blue: 'bg-blue-50 text-blue-700',
    sky: 'bg-sky-50 text-sky-700',
    rose: 'bg-rose-50 text-rose-700',
  }
  return (
    <section className={`${cardClass} bg-slate-50/70 p-5`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className={`inline-flex size-10 shrink-0 items-center justify-center rounded-2xl ${toneMap[tone]}`}>
            <Icon size={18} />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-slate-950">{title}</h2>
            <p className="text-xs font-medium text-slate-500">{formatNumber(count)} active matters</p>
          </div>
        </div>
        <Link to={href} className={actionLinkClass}>View all <ArrowRight size={13} /></Link>
      </div>

      <div className="mt-4 flex gap-4 overflow-x-auto pb-2">
        {matters.length ? matters.map((matter) => (
          <MatterCard key={`${type}-${matter.id}`} matter={matter} type={type} />
        )) : (
          <div className="w-full rounded-2xl border border-dashed border-slate-200 bg-white p-6 text-sm text-slate-500">
            No active {title.toLowerCase()} currently visible for this filter.
          </div>
        )}
      </div>
    </section>
  )
}

function AttentionList({ rows = [], alerts = [] }) {
  const fallbackRows = [
    { key: 'guarantees', label: 'Matters with overdue guarantees', count: alerts.find((item) => item.key === 'guarantees')?.count || 0 },
    { key: 'fica', label: 'FICA documents overdue', count: alerts.find((item) => item.key === 'fica')?.count || 0 },
    { key: 'documents', label: 'Unsigned OTPs', count: alerts.find((item) => item.key === 'documents')?.count || 0 },
    { key: 'stale', label: 'Matters with no activity (14+ days)', count: 0 },
    { key: 'missing', label: 'Missing documents', count: 0 },
  ]
  const displayRows = rows.length
    ? rows.slice(0, 5).map((row) => ({ key: row.matterId, label: row.issue || row.matterReference, count: 1 }))
    : fallbackRows

  return (
    <section className={`${cardClass} grid gap-3 p-4`}>
      <h2 className="text-sm font-semibold text-slate-950">Matters Requiring Attention</h2>
      <div className="grid gap-2">
        {displayRows.map((row) => (
          <Link key={row.key} to="/transactions" className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 transition hover:bg-slate-100">
            <span className="inline-flex min-w-0 items-center gap-2 text-sm font-medium text-slate-700">
              <AlertTriangle size={15} className="shrink-0 text-red-500" />
              <span className="truncate">{row.label}</span>
            </span>
            <strong className="text-sm text-red-600">{formatNumber(row.count)}</strong>
          </Link>
        ))}
      </div>
      <Link to="/transactions" className={actionLinkClass}>View all <ArrowRight size={13} /></Link>
    </section>
  )
}

function RecentActivity({ rows = [] }) {
  return (
    <section className={`${cardClass} grid gap-3 p-4`}>
      <h2 className="text-sm font-semibold text-slate-950">Recent Activity</h2>
      <div className="grid max-h-[270px] gap-2 overflow-y-auto pr-1">
        {rows.length ? rows.map((row) => (
          <article key={row.id} className="flex items-start justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
            <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
              <CheckCircle2 size={15} />
            </span>
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
      <Link to="/reports" className={actionLinkClass}>View all activity <ArrowRight size={13} /></Link>
    </section>
  )
}

function FinancialSnapshot({ data = {} }) {
  const items = [
    { label: 'Fees Billed', value: formatCurrency(data.feesBilled), icon: Banknote },
    { label: 'Collected', value: formatCurrency(data.feesCollected), icon: CheckCircle2 },
    { label: 'Outstanding', value: formatCurrency(data.outstandingFees), icon: CircleDollarSign },
    { label: 'Trust Balance', value: formatCurrency(data.trustBalance), icon: BriefcaseBusiness },
  ]
  return (
    <section className={`${cardClass} grid gap-3 p-4`}>
      <h2 className="text-sm font-semibold text-slate-950">Financial Snapshot</h2>
      <div className="grid gap-2">
        {items.map((item) => {
          const Icon = item.icon
          return (
            <article key={item.label} className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3">
              <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-white text-blue-700">
                <Icon size={16} />
              </span>
              <div className="min-w-0">
                <strong className="block truncate text-sm font-semibold text-slate-950">{item.value}</strong>
                <p className="text-xs font-medium text-slate-500">{item.label}</p>
              </div>
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

      <KpiStrip stats={dashboard.matterStats} financialSnapshot={dashboard.financialSnapshot} />

      <div className="grid min-w-0 grid-cols-1 gap-5 xl:grid-cols-[minmax(0,4fr)_minmax(280px,1fr)] 2xl:grid-cols-[minmax(0,4.4fr)_minmax(300px,1fr)]">
        <div className="grid min-w-0 gap-6">
          <MatterLane
            title="Transfer Matters"
            icon={Scale}
            count={lanes.transfer?.length || 0}
            href="/attorney/matters/transfer"
            matters={lanes.transfer || []}
            type="transfer"
            tone="blue"
          />
          <MatterLane
            title="Bond Matters"
            icon={Landmark}
            count={lanes.bond?.length || 0}
            href="/attorney/matters/bond"
            matters={lanes.bond || []}
            type="bond"
            tone="sky"
          />
          <MatterLane
            title="Cancellation Matters"
            icon={ShieldAlert}
            count={lanes.cancellation?.length || 0}
            href="/attorney/matters/cancellation"
            matters={lanes.cancellation || []}
            type="cancellation"
            tone="rose"
          />
        </div>

        <aside className="grid min-w-0 content-start gap-4">
          <AttentionList rows={dashboard.mattersRequiringAttention} alerts={dashboard.criticalAlerts} />
          <RecentActivity rows={dashboard.recentActivity} />
          <FinancialSnapshot data={dashboard.financialSnapshot} />
        </aside>
      </div>

      <CriticalAlerts alerts={dashboard.criticalAlerts} />
    </section>
  )
}

export default AttorneyDashboardPage
