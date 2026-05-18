import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Bell,
  BriefcaseBusiness,
  CalendarClock,
  ChevronRight,
  Clock3,
  FileWarning,
  Filter,
  MoreHorizontal,
  RefreshCw,
  Save,
  ShieldAlert,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import LoadingSkeleton from '../components/LoadingSkeleton'
import { useWorkspace } from '../context/WorkspaceContext'
import { canManageAgentOrganisations } from '../lib/roles'
import { fetchOrganisationSettings } from '../lib/settingsApi'
import { getPrincipalPipelineOverview, PIPELINE_STAGE_LABELS } from '../services/principalPipelineOverviewService'

const cardClass = 'rounded-2xl border border-slate-200 bg-white shadow-sm'
const currencyFormatter = new Intl.NumberFormat('en-ZA', {
  style: 'currency',
  currency: 'ZAR',
  maximumFractionDigits: 0,
})

function formatCurrency(value) {
  const amount = Number(value || 0)
  if (Math.abs(amount) >= 1000000) return `R${(amount / 1000000).toFixed(amount >= 10000000 ? 0 : 1)}M`
  return currencyFormatter.format(amount)
}

function formatDate(value) {
  if (!value) return 'No activity'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'No activity'
  return date.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' })
}

function timeAgo(value) {
  if (!value) return 'Just now'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Just now'
  const diff = Date.now() - date.getTime()
  const minutes = Math.max(1, Math.floor(diff / 60000))
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function PipelineOverviewSkeleton() {
  return (
    <div className="space-y-5">
      <LoadingSkeleton lines={3} className="rounded-2xl border border-slate-200 bg-white" />
      <div className="grid gap-4 md:grid-cols-5">
        {[0, 1, 2, 3, 4].map((item) => <LoadingSkeleton key={item} lines={3} className="rounded-2xl border border-slate-200 bg-white" />)}
      </div>
      <LoadingSkeleton lines={10} className="rounded-2xl border border-slate-200 bg-white" />
    </div>
  )
}

function KpiCard({ icon: Icon, label, value, helper, tone = 'blue' }) {
  const toneClass = {
    blue: 'bg-blue-50 text-blue-700',
    green: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
    red: 'bg-rose-50 text-rose-700',
    slate: 'bg-slate-100 text-slate-700',
  }[tone] || 'bg-blue-50 text-blue-700'

  return (
    <article className={`${cardClass} flex min-h-[126px] flex-col justify-between p-4`}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[0.78rem] font-semibold text-slate-600">{label}</p>
        <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${toneClass}`}>
          <Icon size={17} />
        </span>
      </div>
      <div>
        <strong className="block text-[1.65rem] font-semibold tracking-[-0.04em] text-slate-950">{value}</strong>
        <span className="mt-1 block text-xs font-medium text-slate-500">{helper || 'Live agency data'}</span>
      </div>
    </article>
  )
}

function PipelineFlowBoard({ stages = [], selectedStage, onSelectStage }) {
  return (
    <section className={`${cardClass} p-5`}>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-[-0.03em] text-slate-950">Main Pipeline Flow</h2>
          <p className="text-sm text-slate-500">Stage movement across leads, offers, finance, transfer, and registration.</p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
          <RefreshCw size={13} />
          Live stages
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-9">
        {stages.map((stage) => {
          const maxMovement = Math.max(1, ...stage.movement)
          const isActive = selectedStage === stage.key
          return (
            <button
              key={stage.key}
              type="button"
              onClick={() => onSelectStage(isActive ? '' : stage.key)}
              className={`min-h-[176px] rounded-2xl border p-3 text-left transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-sm ${
                isActive ? 'border-blue-300 bg-blue-50/70 shadow-sm' : 'border-slate-200 bg-slate-50/70'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm font-semibold text-slate-900">{stage.label}</span>
                <ChevronRight size={15} className="text-slate-400" />
              </div>
              <strong className="mt-4 block text-2xl font-semibold tracking-[-0.04em] text-slate-950">{stage.count}</strong>
              <p className="mt-1 text-xs font-semibold text-slate-500">{formatCurrency(stage.value)}</p>
              <dl className="mt-4 space-y-1.5 text-xs text-slate-500">
                <div className="flex justify-between gap-2"><dt>Avg. days</dt><dd className="font-semibold text-slate-700">{stage.avgDaysInStage ?? '—'}</dd></div>
                <div className="flex justify-between gap-2"><dt>At risk</dt><dd className={stage.atRiskCount ? 'font-semibold text-rose-600' : 'font-semibold text-emerald-700'}>{stage.atRiskCount}</dd></div>
              </dl>
              <div className="mt-4 flex h-8 items-end gap-1" aria-label="Movement trend">
                {stage.movement.map((value, index) => (
                  <span
                    key={`${stage.key}-${index}`}
                    className="w-full rounded-t bg-blue-400/70"
                    style={{ height: `${Math.max(12, (value / maxMovement) * 32)}px` }}
                  />
                ))}
              </div>
            </button>
          )
        })}
      </div>
    </section>
  )
}

function BottlenecksAlertsCard({ items = [], onSelect }) {
  return (
    <section className={`${cardClass} h-full p-5`}>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-950">Bottlenecks & Alerts</h2>
        <AlertTriangle size={17} className="text-amber-600" />
      </div>
      <div className="divide-y divide-slate-100">
        {items.length ? items.map((item) => (
          <button key={item.key} type="button" onClick={() => onSelect(item.key)} className="flex min-h-[54px] w-full items-center justify-between gap-4 py-3 text-left">
            <span className="flex min-w-0 items-center gap-3">
              <span className={`h-2.5 w-2.5 rounded-full ${item.count ? 'bg-amber-500' : 'bg-emerald-500'}`} />
              <span className="truncate text-sm font-medium text-slate-700">{item.label}</span>
            </span>
            <span className="inline-flex items-center gap-2 text-sm font-semibold text-slate-950">
              {item.count}
              <ChevronRight size={14} className="text-slate-400" />
            </span>
          </button>
        )) : (
          <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">No bottlenecks detected.</p>
        )}
      </div>
    </section>
  )
}

function LiveActivityFeed({ items = [] }) {
  return (
    <section className={`${cardClass} h-full p-5`}>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-950">Live Activity Feed</h2>
        <Bell size={17} className="text-blue-600" />
      </div>
      <div className="max-h-[430px] space-y-3 overflow-y-auto pr-1">
        {items.length ? items.map((item) => (
          <article key={item.id} className="flex gap-3 rounded-xl border border-slate-100 bg-slate-50/80 p-3">
            <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-500" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-900">{item.title}</p>
              <p className="mt-1 truncate text-xs text-slate-500">{item.actorName || 'System'} · {item.subtitle || 'Pipeline update'}</p>
            </div>
            <span className="shrink-0 text-xs font-medium text-slate-400">{timeAgo(item.createdAt)}</span>
          </article>
        )) : (
          <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">No recent activity yet.</p>
        )}
      </div>
    </section>
  )
}

function AgentMomentumTable({ rows = [] }) {
  return (
    <section className={`${cardClass} p-5`}>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-950">Agent Momentum</h2>
          <p className="text-sm text-slate-500">Movement versus stalled deal pressure by agent.</p>
        </div>
        <Users size={17} className="text-slate-500" />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="text-xs uppercase tracking-[0.08em] text-slate-400">
            <tr className="border-b border-slate-100">
              <th className="py-3 font-semibold">Agent</th>
              <th className="py-3 font-semibold">Deals Moving</th>
              <th className="py-3 font-semibold">Stalled Deals</th>
              <th className="py-3 font-semibold">Avg. Response</th>
              <th className="py-3 font-semibold">Active Value</th>
              <th className="py-3 font-semibold">Last Activity</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length ? rows.map((row) => (
              <tr key={row.agentId}>
                <td className="py-3 font-semibold text-slate-900">{row.agentName}</td>
                <td className="py-3 text-slate-700">{row.dealsMoving}</td>
                <td className={`py-3 font-semibold ${row.stalledDeals ? 'text-rose-600' : 'text-emerald-700'}`}>{row.stalledDeals}</td>
                <td className="py-3 text-slate-500">{row.avgResponseHours ? `${row.avgResponseHours}h` : '—'}</td>
                <td className="py-3 font-semibold text-slate-900">{formatCurrency(row.activeValue)}</td>
                <td className="py-3 text-slate-500">{formatDate(row.lastActivity)}</td>
              </tr>
            )) : (
              <tr><td colSpan={6} className="py-8 text-center text-slate-500">No agent momentum data yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function PipelineValueFlow({ valueFlow }) {
  const stages = valueFlow?.stages || []
  return (
    <section className={`${cardClass} p-5`}>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-950">Pipeline Value Flow</h2>
          <p className="text-sm text-slate-500">{formatCurrency(valueFlow?.totalValue)} total active value</p>
        </div>
        <BarChart3 size={17} className="text-blue-600" />
      </div>
      {stages.some((stage) => stage.value > 0) ? (
        <div className="space-y-3">
          <div className="flex h-4 overflow-hidden rounded-full bg-slate-100">
            {stages.filter((stage) => stage.value > 0).map((stage, index) => (
              <span
                key={stage.key}
                className={['bg-blue-500', 'bg-violet-500', 'bg-amber-500', 'bg-emerald-500', 'bg-slate-400'][index % 5]}
                style={{ width: `${Math.max(4, stage.percentage)}%` }}
              />
            ))}
          </div>
          {stages.map((stage) => (
            <div key={stage.key} className="flex items-center justify-between gap-4 text-sm">
              <span className="truncate text-slate-600">{stage.label}</span>
              <span className="shrink-0 font-semibold text-slate-950">{formatCurrency(stage.value)} <span className="text-xs text-slate-400">({stage.percentage}%)</span></span>
            </div>
          ))}
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">No active transaction value yet.</p>
      )}
    </section>
  )
}

function UpcomingCriticalEvents({ items = [], onSelect }) {
  return (
    <section className={`${cardClass} p-5`}>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-950">Upcoming Critical Events</h2>
          <p className="text-sm text-slate-500">Time-sensitive items for the next seven days.</p>
        </div>
        <CalendarClock size={17} className="text-slate-500" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {items.map((item) => (
          <button key={item.key} type="button" onClick={() => onSelect(item.key)} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left transition hover:border-blue-200 hover:bg-blue-50/60">
            <strong className="block text-2xl font-semibold tracking-[-0.04em] text-slate-950">{item.count}</strong>
            <span className="mt-1 block text-sm font-medium text-slate-600">{item.label}</span>
            <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-blue-700">View <ArrowRight size={13} /></span>
          </button>
        ))}
      </div>
    </section>
  )
}

function TransactionList({ rows = [], selectedLabel = '', onClear }) {
  return (
    <section className={`${cardClass} p-5`}>
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-slate-950">Pipeline Records</h2>
          <p className="text-sm text-slate-500">{selectedLabel || 'Showing all visible pipeline records'}</p>
        </div>
        {selectedLabel ? (
          <button type="button" onClick={onClear} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">Clear filter</button>
        ) : null}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[840px] text-left text-sm">
          <thead className="text-xs uppercase tracking-[0.08em] text-slate-400">
            <tr className="border-b border-slate-100">
              <th className="py-3 font-semibold">Record</th>
              <th className="py-3 font-semibold">Stage</th>
              <th className="py-3 font-semibold">Agent</th>
              <th className="py-3 font-semibold">Value</th>
              <th className="py-3 font-semibold">Risk</th>
              <th className="py-3 font-semibold">Updated</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length ? rows.map((row) => (
              <tr key={`${row.source}-${row.id}`}>
                <td className="max-w-[280px] py-3">
                  <p className="truncate font-semibold text-slate-900">{row.title}</p>
                  <p className="truncate text-xs text-slate-500">{row.subtitle || row.nextAction || 'Pipeline record'}</p>
                </td>
                <td className="py-3 text-slate-700">{PIPELINE_STAGE_LABELS[row.stage] || row.rawStage || 'Pipeline'}</td>
                <td className="py-3 text-slate-700">{row.agentName || 'Unassigned'}</td>
                <td className="py-3 font-semibold text-slate-900">{formatCurrency(row.value)}</td>
                <td className="py-3">
                  {row.riskReasons?.length ? (
                    <span className="rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700">{row.riskReasons[0]}</span>
                  ) : (
                    <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">On track</span>
                  )}
                </td>
                <td className="py-3 text-slate-500">{formatDate(row.updatedAt)}</td>
              </tr>
            )) : (
              <tr><td colSpan={6} className="py-8 text-center text-slate-500">No records match this view.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export default function PipelineOverviewPage() {
  const { role, baseRole, profile } = useWorkspace()
  const [context, setContext] = useState({ organisationId: '', membershipRole: 'viewer' })
  const [filters, setFilters] = useState({ branchId: '', agentId: '', dateRange: 'this_month' })
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedStage, setSelectedStage] = useState('')
  const [selectedAlert, setSelectedAlert] = useState('')

  const canViewAll = canManageAgentOrganisations({ role, baseRole, profile, membershipRole: context.membershipRole })
  const currentAgentId = profile?.id || profile?.user_id || ''
  const currentAgentEmail = profile?.email || ''

  const loadOverview = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const settings = await fetchOrganisationSettings().catch((settingsError) => {
        console.warn('[PipelineOverview] organisation settings unavailable, falling back to local scope.', settingsError)
        return null
      })
      const organisationId = settings?.organisation?.id || context.organisationId || ''
      const membershipRole = settings?.membershipRole || context.membershipRole || 'viewer'
      setContext({ organisationId, membershipRole })
      const result = await getPrincipalPipelineOverview({
        organisationId,
        branchId: filters.branchId,
        agentId: canViewAll ? filters.agentId : currentAgentId,
        agentEmail: currentAgentEmail,
        dateRange: filters.dateRange,
        canViewAll,
      })
      setData(result)
    } catch (loadError) {
      console.error('[PipelineOverview] load failed', loadError)
      setError(loadError?.message || 'We could not load the pipeline overview.')
    } finally {
      setLoading(false)
    }
  }, [canViewAll, context.membershipRole, context.organisationId, currentAgentEmail, currentAgentId, filters.agentId, filters.branchId, filters.dateRange])

  useEffect(() => {
    void loadOverview()
  }, [loadOverview])

  const filteredRecords = useMemo(() => {
    const rows = data?.opportunities || []
    if (selectedStage) return rows.filter((row) => row.stage === selectedStage)
    if (selectedAlert) {
      if (selectedAlert === 'stuck') return rows.filter((row) => row.riskReasons?.some((reason) => reason.includes('14+')))
      if (selectedAlert === 'finance') return rows.filter((row) => row.riskReasons?.some((reason) => reason.toLowerCase().includes('finance')))
      if (selectedAlert === 'otp' || selectedAlert === 'mandates') return rows.filter((row) => row.riskReasons?.some((reason) => reason.toLowerCase().includes('signature') || reason.toLowerCase().includes('mandate')))
      return rows.filter((row) => row.riskReasons?.length)
    }
    return rows
  }, [data?.opportunities, selectedAlert, selectedStage])

  const selectedLabel = selectedStage
    ? `Filtered by ${PIPELINE_STAGE_LABELS[selectedStage]}`
    : selectedAlert
      ? 'Filtered by selected alert'
      : ''

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <div className="mx-auto w-full max-w-[1680px] px-4 py-6 lg:px-5 xl:px-6">
        <header className={`${cardClass} mb-5 p-5`}>
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Pipeline</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-[-0.045em] text-slate-950">Agency Pipeline Overview</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                Track active deals, identify bottlenecks, monitor agent movement, and manage transaction momentum across the agency.
              </p>
            </div>
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <select value={filters.branchId} onChange={(event) => setFilters((prev) => ({ ...prev, branchId: event.target.value }))} className="min-h-[42px] rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm">
                <option value="">All branches</option>
                {(data?.filters?.branches || []).map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
              </select>
              <select value={filters.agentId} disabled={!canViewAll} onChange={(event) => setFilters((prev) => ({ ...prev, agentId: event.target.value }))} className="min-h-[42px] rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm disabled:opacity-60">
                <option value="">{canViewAll ? 'All agents' : 'My deals only'}</option>
                {(data?.filters?.agents || []).map((agent) => <option key={agent.id || agent.email} value={agent.id || agent.email}>{agent.name}</option>)}
              </select>
              <select value={filters.dateRange} onChange={(event) => setFilters((prev) => ({ ...prev, dateRange: event.target.value }))} className="min-h-[42px] rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm">
                <option value="this_month">This month</option>
                <option value="this_week">This week</option>
                <option value="last_30_days">Last 30 days</option>
                <option value="next_30_days">Next 30 days</option>
              </select>
              <button type="button" className="inline-flex min-h-[42px] items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm">
                <Save size={15} />
                Save View
              </button>
              <button type="button" className="inline-flex h-[42px] w-[42px] items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm">
                <MoreHorizontal size={17} />
              </button>
            </div>
          </div>
        </header>

        {error ? (
          <section className="mb-5 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            We couldn’t load the principal pipeline overview data.
            <button type="button" onClick={loadOverview} className="ml-3 font-semibold underline">Retry</button>
          </section>
        ) : null}

        {loading ? <PipelineOverviewSkeleton /> : null}

        {!loading && data ? (
          <div className="space-y-5">
            <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
              <KpiCard icon={Wallet} label="Total Pipeline Value" value={formatCurrency(data.kpis.totalPipelineValue)} helper="Active transaction value" />
              <KpiCard icon={BriefcaseBusiness} label="Active Transactions" value={data.kpis.activeTransactions} helper="In-flight agency deals" tone="green" />
              <KpiCard icon={Clock3} label="Avg. Days to Registration" value={data.kpis.avgDaysToRegistration ?? '—'} helper="Completed deal cycle" tone="slate" />
              <KpiCard icon={TrendingUp} label="Conversion Rate" value={`${data.kpis.conversionRate}%`} helper="Registered vs pipeline" tone="blue" />
              <KpiCard icon={ShieldAlert} label="Deals at Risk" value={data.kpis.dealsAtRisk} helper="Needs principal attention" tone={data.kpis.dealsAtRisk ? 'red' : 'green'} />
            </section>

            {data.meta.isEmpty ? (
              <section className={`${cardClass} p-8 text-center`}>
                <Filter className="mx-auto text-slate-400" size={28} />
                <h2 className="mt-3 text-lg font-semibold text-slate-950">No active transactions yet.</h2>
                <p className="mt-2 text-sm text-slate-500">Your agency pipeline overview will appear here once leads, transactions, and activity are added.</p>
              </section>
            ) : null}

            <PipelineFlowBoard stages={data.stages} selectedStage={selectedStage} onSelectStage={(stage) => { setSelectedStage(stage); setSelectedAlert('') }} />

            <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
              <AgentMomentumTable rows={data.agentMomentum} />
              <BottlenecksAlertsCard items={data.bottlenecks} onSelect={(key) => { setSelectedAlert(key); setSelectedStage('') }} />
            </section>

            <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
              <PipelineValueFlow valueFlow={data.valueFlow} />
              <LiveActivityFeed items={data.activity} />
            </section>

            <UpcomingCriticalEvents items={data.criticalEvents} onSelect={(key) => { setSelectedAlert(key); setSelectedStage('') }} />

            <TransactionList rows={filteredRecords} selectedLabel={selectedLabel} onClear={() => { setSelectedStage(''); setSelectedAlert('') }} />

            <p className="text-center text-xs font-medium text-slate-400">
              Data last updated: {timeAgo(data.meta.lastUpdatedAt)}
            </p>
          </div>
        ) : null}
      </div>
    </main>
  )
}
