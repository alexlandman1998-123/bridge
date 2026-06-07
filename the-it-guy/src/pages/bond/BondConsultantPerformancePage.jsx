import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Banknote,
  BarChart3,
  Bell,
  BriefcaseBusiness,
  Building2,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  Clock3,
  FileCheck2,
  FileText,
  Filter,
  Gauge,
  Landmark,
  LineChart,
  Mail,
  Phone,
  Search,
  Send,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Target,
  UserCog,
} from 'lucide-react'
import { createElement, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useWorkspace } from '../../context/WorkspaceContext'
import {
  getApplicationsByConsultant,
  getConsultantActivityTimeline,
  getConsultantAttentionItems,
  getConsultantBankMix,
  getConsultantBenchmarks,
  getConsultantById,
  getConsultantCapacityHealth,
  getConsultantForecast,
  getConsultantOverviewMetrics,
  getConsultantPerformanceDashboard,
  getConsultantPerformanceTrend,
  getConsultantTargetProgress,
  getConsultantWorkloadByStage,
} from '../../services/bondConsultantPerformanceService'

const TABS = ['Overview', 'Applications', 'Performance', 'Activity', 'Settings']
const BANK_COLORS = ['#24518a', '#17946b', '#f97316', '#477ee8', '#7c3aed', '#8aa0b7']
const STAGE_COLORS = ['#24518a', '#477ee8', '#17946b', '#f59e0b', '#7c3aed', '#0f766e']

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase()
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

function formatNumber(value) {
  return new Intl.NumberFormat('en-ZA').format(Number(value || 0))
}

function formatPercent(value) {
  return `${Math.round(Number(value || 0))}%`
}

function formatDays(value) {
  return `${Math.round(Number(value || 0) * 10) / 10} days`
}

function formatMoney(value) {
  const amount = Number(value || 0)
  if (amount >= 1000000) return `R${Math.round((amount / 1000000) * 100) / 100}m`
  if (amount >= 1000) return `R${Math.round(amount / 1000)}k`
  return `R${formatNumber(amount)}`
}

function formatTimeAgo(value) {
  const date = new Date(value || '')
  if (Number.isNaN(date.getTime())) return 'recently'
  const diffMs = Date.now() - date.getTime()
  const diffHours = Math.max(1, Math.round(diffMs / (60 * 60 * 1000)))
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.round(diffHours / 24)
  return `${diffDays}d ago`
}

function statusTone(value = '') {
  const normalized = normalizeLower(value)
  if (normalized.includes('over') || normalized.includes('high') || normalized.includes('risk')) return 'bg-[#fef3f2] text-[#b42318] ring-[#fecaca]'
  if (normalized.includes('busy') || normalized.includes('warning') || normalized.includes('watch')) return 'bg-[#fffaeb] text-[#b54708] ring-[#fedf89]'
  if (normalized.includes('normal') || normalized.includes('active') || normalized.includes('approved')) return 'bg-[#ecfdf3] text-[#027a48] ring-[#bbf7d0]'
  return 'bg-[#f1f5f9] text-[#475569] ring-[#e2e8f0]'
}

function trendMeta(value = 0, inverse = false) {
  const numeric = Number(value || 0)
  const positive = inverse ? numeric <= 0 : numeric >= 0
  const sign = numeric > 0 ? '+' : ''
  return {
    icon: positive ? ArrowUp : ArrowDown,
    className: positive ? 'text-[#149650]' : 'text-[#d92d20]',
    label: `${sign}${numeric}% vs last month`,
  }
}

function Sparkline({ values = [], color = '#24518a' }) {
  const safeValues = values.length ? values.map(Number) : [22, 25, 23, 28, 30, 34]
  const max = Math.max(...safeValues, 1)
  const min = Math.min(...safeValues, 0)
  const range = Math.max(max - min, 1)
  const points = safeValues.map((value, index) => {
    const x = safeValues.length === 1 ? 0 : (index / (safeValues.length - 1)) * 100
    const y = 44 - ((value - min) / range) * 34 - 5
    return `${x},${y}`
  })
  const area = [`0,48`, ...points, `100,48`].join(' ')

  return (
    <svg className="mt-auto h-14 w-full overflow-visible" viewBox="0 0 100 48" preserveAspectRatio="none" aria-hidden="true">
      <polygon points={area} fill={`${color}18`} />
      <polyline points={points.join(' ')} fill="none" stroke={color} strokeWidth="2.4" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function Donut({ segments = [], center = null, className = 'h-36 w-36' }) {
  const total = segments.reduce((sum, item) => sum + Number(item.value || 0), 0)
  const gradient = total
    ? segments.reduce((state, item) => {
      const start = state.cursor
      const end = start + (Number(item.value || 0) / total) * 100
      state.parts.push(`${item.color} ${start}% ${end}%`)
      state.cursor = end
      return state
    }, { cursor: 0, parts: [] }).parts.join(', ')
    : '#e8eef6 0% 100%'
  return (
    <div className={`relative flex items-center justify-center rounded-full ${className}`} style={{ background: `conic-gradient(${gradient})` }}>
      <div className="flex h-[62%] w-[62%] flex-col items-center justify-center rounded-full bg-white text-center shadow-[0_10px_24px_rgba(15,23,42,0.08)]">
        {center}
      </div>
    </div>
  )
}

function PageCard({ children, className = '' }) {
  return (
    <section className={`rounded-[18px] border border-[#dfe7ef] bg-white shadow-[0_14px_34px_rgba(15,23,42,0.045)] ${className}`}>
      {children}
    </section>
  )
}

function CardHeader({ label, title, action = null }) {
  return (
    <div className="mb-5 flex items-start justify-between gap-4">
      <div className="min-w-0">
        {label ? <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#71869d]">{label}</p> : null}
        <h2 className="mt-1 text-[18px] font-bold tracking-[-0.01em] text-[#142132]">{title}</h2>
      </div>
      {action}
    </div>
  )
}

function KpiCard({ label, value, change, icon: Icon, color = '#24518a', values = [], inverseTrend = false }) {
  const trend = trendMeta(change, inverseTrend)
  const TrendIcon = trend.icon
  return (
    <article className="flex min-h-[198px] min-w-0 flex-col rounded-[18px] border border-[#dfe7ef] bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.045)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-[#71869d]">{label}</p>
          <p className="mt-4 whitespace-nowrap text-[30px] font-bold leading-none tracking-normal text-[#07142b]">{value}</p>
        </div>
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-[#f8fafc] ring-1 ring-[#e2e8f0]">
          {createElement(Icon, { size: 18, color })}
        </span>
      </div>
      <p className={`mt-3 inline-flex items-center gap-1.5 text-xs font-bold ${trend.className}`}>
        <TrendIcon size={13} />
        {trend.label}
      </p>
      <Sparkline values={values} color={color} />
    </article>
  )
}

function EmptyState({ title, description }) {
  return (
    <div className="rounded-[14px] border border-dashed border-[#cbd5e1] bg-[#f8fafc] p-5 text-sm text-[#64748b]">
      <p className="font-bold text-[#17324d]">{title}</p>
      <p className="mt-1">{description}</p>
    </div>
  )
}

function ConsultantTabs({ activeTab, onChange }) {
  return (
    <nav className="overflow-x-auto rounded-[16px] border border-[#dfe7ef] bg-white px-3 shadow-[0_10px_24px_rgba(15,23,42,0.035)] [scrollbar-width:thin]">
      <div className="flex min-w-max gap-1">
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => onChange(tab)}
            className={`relative inline-flex h-14 items-center gap-2 px-4 text-sm font-bold transition ${activeTab === tab ? 'text-[#10243a]' : 'text-[#64748b] hover:text-[#17324d]'}`}
          >
            {tab}
            {activeTab === tab ? <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-[#17324d]" /> : null}
          </button>
        ))}
      </div>
    </nav>
  )
}

function HeaderMeta({ icon: Icon, label, value }) {
  return (
    <div className="flex min-w-0 items-start gap-2">
      {createElement(Icon, { size: 15, className: 'mt-0.5 shrink-0 text-[#71869d]' })}
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#71869d]">{label}</p>
        <p className="truncate text-sm font-bold text-[#17324d]">{value}</p>
      </div>
    </div>
  )
}

function ConsultantHeader({ consultant, metrics, capacity, canManage }) {
  return (
    <header className="rounded-[20px] border border-[#dfe7ef] bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.045)]">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[#64748b]">
            <Link to="/bond/organisation" className="hover:text-[#204b84]">Organisation</Link>
            <ArrowRight size={13} />
            <Link to="/bond/organisation?view=consultants" className="hover:text-[#204b84]">Consultants</Link>
            <ArrowRight size={13} />
            <span className="text-[#10243a]">{consultant.name}</span>
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <h1 className="text-[32px] font-bold leading-none tracking-[-0.02em] text-[#07142b]">{consultant.name}</h1>
            <span className={`rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${statusTone(consultant.status || 'Active')}`}>{consultant.status || 'Active'}</span>
          </div>
          <p className="mt-2 text-base font-semibold text-[#31475d]">Consultant Performance Centre</p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <HeaderMeta icon={Building2} label="Branch" value={consultant.branchName || 'Unassigned'} />
            <HeaderMeta icon={Target} label="Region" value={consultant.regionName || 'Unassigned'} />
            <HeaderMeta icon={BriefcaseBusiness} label="Role" value="Bond Originator" />
            <HeaderMeta icon={Gauge} label="Capacity" value={capacity.status || metrics.capacityStatus || 'Normal'} />
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" disabled={!canManage} className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-[#d8e2ec] bg-white px-3 text-sm font-bold text-[#17324d] disabled:opacity-50">
            <Building2 size={15} /> Assign Branch
          </button>
          <button type="button" disabled={!canManage} className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-[#d8e2ec] bg-white px-3 text-sm font-bold text-[#17324d] disabled:opacity-50">
            <ShieldCheck size={15} /> Scope Permissions
          </button>
          <button type="button" disabled={!canManage} className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-[#d8e2ec] bg-white px-3 text-sm font-bold text-[#17324d] disabled:opacity-50">
            <Mail size={15} /> Invite
          </button>
          <button type="button" className="inline-flex h-10 items-center gap-2 rounded-[10px] bg-[#17324d] px-3 text-sm font-bold text-white">
            Actions <ChevronDown size={15} />
          </button>
        </div>
      </div>
    </header>
  )
}

function KpiRow({ metrics, trend }) {
  const trendValues = trend.map((row) => row.approvalRate)
  const submittedValues = trend.map((row) => row.submittedApplications)
  const turnaroundValues = trend.map((row) => row.averageTurnaround)
  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
      <KpiCard label="Active Applications" value={formatNumber(metrics.activeApplications)} change={27} icon={FileText} color="#17946b" values={[8, 10, 9, 12, metrics.activeApplications]} />
      <KpiCard label="Submitted Applications" value={formatNumber(metrics.submittedApplications)} change={20} icon={Send} color="#477ee8" values={submittedValues} />
      <KpiCard label="Approval Rate" value={formatPercent(metrics.approvalRate)} change={8} icon={ShieldCheck} color="#7c3aed" values={trendValues} />
      <KpiCard label="Avg Turnaround" value={formatDays(metrics.averageTurnaround)} change={-4} icon={Clock3} color="#f97316" values={turnaroundValues} inverseTrend />
      <KpiCard label="Pending Documents" value={formatNumber(metrics.pendingDocuments)} change={metrics.pendingDocuments > 4 ? 12 : -25} icon={FileCheck2} color="#e11d48" values={[2, 3, 2, 4, metrics.pendingDocuments]} inverseTrend />
      <KpiCard label="Revenue Forecast" value={formatMoney(metrics.revenueForecast)} change={18} icon={Banknote} color="#17946b" values={[22, 28, 36, 31, 42, 48]} />
    </section>
  )
}

function WorkloadByStage({ rows }) {
  const total = Math.max(rows.reduce((sum, row) => sum + row.count, 0), 1)
  return (
    <PageCard className="p-5">
      <CardHeader label="Workload" title="Workload by Stage" />
      <div className="flex h-4 overflow-hidden rounded-full bg-[#e8eef6]">
        {rows.map((row, index) => (
          <span key={row.key} className="h-full" style={{ width: `${Math.max(row.percentage, row.count ? 4 : 0)}%`, backgroundColor: STAGE_COLORS[index % STAGE_COLORS.length] }} />
        ))}
      </div>
      <div className="mt-5 grid gap-3">
        {rows.map((row, index) => (
          <Link key={row.key} to={row.href} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-[12px] bg-[#f8fafc] px-3 py-2 ring-1 ring-[#edf2f7]">
            <span className="inline-flex min-w-0 items-center gap-2 text-sm font-bold text-[#17324d]">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: STAGE_COLORS[index % STAGE_COLORS.length] }} />
              <span className="truncate">{row.stage}</span>
            </span>
            <span className="text-sm font-bold text-[#142132]">{formatNumber(row.count)} <span className="text-[#64748b]">({formatPercent((row.count / total) * 100)})</span></span>
          </Link>
        ))}
      </div>
    </PageCard>
  )
}

function AttentionCard({ items }) {
  return (
    <PageCard className="p-5">
      <CardHeader label="Exceptions" title="Applications Needing Attention" action={<Link to="?tab=applications&quick=attention" className="text-sm font-bold text-[#204b84]">View all</Link>} />
      <div className="space-y-3">
        {items.map((item) => (
          <Link key={item.key} to={item.href} className="flex items-center justify-between gap-3 rounded-[13px] bg-[#f8fafc] px-3 py-3 ring-1 ring-[#edf2f7]">
            <span className="inline-flex min-w-0 items-center gap-3">
              <span className={`h-9 w-9 shrink-0 rounded-full ${item.urgency === 'High' ? 'bg-[#fef3f2] text-[#d92d20]' : 'bg-[#fffaeb] text-[#b54708]'} flex items-center justify-center`}>
                <AlertTriangle size={15} />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-bold text-[#17324d]">{item.label}</span>
                <span className="text-xs font-semibold text-[#64748b]">{item.urgency}</span>
              </span>
            </span>
            <span className="text-sm font-bold text-[#142132]">{formatNumber(item.count)}</span>
          </Link>
        ))}
      </div>
    </PageCard>
  )
}

function CapacityHealthCard({ capacity }) {
  const statusValue = capacity.status === 'Normal' ? 76 : capacity.status === 'High workload' ? 62 : capacity.status === 'At risk' ? 48 : 34
  return (
    <PageCard className="p-5">
      <CardHeader label="Capacity" title="Capacity Health" />
      <div className="grid gap-5 sm:grid-cols-[132px_minmax(0,1fr)] xl:grid-cols-1 2xl:grid-cols-[132px_minmax(0,1fr)]">
        <Donut
          segments={[{ value: statusValue, color: capacity.status === 'Normal' ? '#17946b' : '#f59e0b' }, { value: 100 - statusValue, color: '#e8eef6' }]}
          className="h-32 w-32"
          center={<><strong className="text-lg font-bold text-[#142132]">{capacity.status}</strong><span className="text-xs font-semibold text-[#64748b]">Capacity</span></>}
        />
        <div className="space-y-3">
          <p className="text-sm leading-6 text-[#64748b]">
            Carrying <strong className="text-[#142132]">{formatNumber(capacity.activeApplications)}</strong> active applications, {Math.abs(capacity.variance)}% {capacity.variance >= 0 ? 'above' : 'below'} branch average.
          </p>
          <CapacityLine label="Overdue" value={capacity.overdueCount} tone="warning" />
          <CapacityLine label="Pending documents" value={capacity.pendingDocumentCount} tone="warning" />
          <p className="rounded-[12px] bg-[#f8fafc] p-3 text-sm font-semibold leading-5 text-[#31475d] ring-1 ring-[#edf2f7]">{capacity.recommendedAction}</p>
        </div>
      </div>
    </PageCard>
  )
}

function CapacityLine({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[#edf2f7] pb-2 text-sm">
      <span className="font-semibold text-[#64748b]">{label}</span>
      <span className="font-bold text-[#b42318]">{formatNumber(value)}</span>
    </div>
  )
}

function BankMixCard({ rows }) {
  const total = Math.max(rows.reduce((sum, row) => sum + row.total, 0), 1)
  return (
    <PageCard className="p-5">
      <CardHeader label="Banks" title="Bank Mix" />
      {!rows.length ? <EmptyState title="No bank mix yet" description="Bank distribution appears once applications are linked to lenders." /> : (
        <div className="grid gap-5 sm:grid-cols-[150px_minmax(0,1fr)] xl:grid-cols-1 2xl:grid-cols-[150px_minmax(0,1fr)]">
          <Donut
            segments={rows.map((row, index) => ({ value: row.total, color: BANK_COLORS[index % BANK_COLORS.length] }))}
            className="h-36 w-36"
            center={<><strong className="text-2xl font-bold text-[#142132]">{formatNumber(total)}</strong><span className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#64748b]">files</span></>}
          />
          <div className="space-y-3">
            {rows.map((row, index) => (
              <div key={row.bank}>
                <div className="flex items-center justify-between gap-3 text-sm font-bold">
                  <span className="inline-flex min-w-0 items-center gap-2 text-[#17324d]"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: BANK_COLORS[index % BANK_COLORS.length] }} /><span className="truncate">{row.bank}</span></span>
                  <span>{formatPercent(row.approvalRate)}</span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#e2e8f0]"><span className="block h-full rounded-full" style={{ width: `${Math.max(4, (row.total / total) * 100)}%`, backgroundColor: BANK_COLORS[index % BANK_COLORS.length] }} /></div>
                <p className="mt-1 text-xs font-semibold text-[#64748b]">{formatNumber(row.submitted)} submitted · {formatNumber(row.active)} active</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </PageCard>
  )
}

function TrendChartCard({ trend }) {
  return (
    <PageCard className="p-5">
      <CardHeader label="Trend" title="Performance Trend" />
      <LineChartVisual trend={trend} />
    </PageCard>
  )
}

function LineChartVisual({ trend }) {
  const width = 100
  const pointsFor = (key, maxValue) => trend.map((row, index) => {
    const x = trend.length === 1 ? 0 : (index / (trend.length - 1)) * width
    const y = 100 - (Number(row[key] || 0) / maxValue) * 78 - 10
    return `${x},${y}`
  }).join(' ')
  const maxSubmitted = Math.max(...trend.map((row) => row.submittedApplications), 1)
  const maxTurnaround = Math.max(...trend.map((row) => row.averageTurnaround), 1)
  return (
    <>
      <div className="rounded-[14px] bg-[#f8fafc] p-4 ring-1 ring-[#e6eef6]">
        <svg className="h-[210px] w-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="Consultant performance trend">
          {[0, 25, 50, 75, 100].map((line) => <line key={line} x1="0" x2="100" y1={line} y2={line} stroke="#e2e8f0" strokeWidth="0.5" />)}
          <polyline points={pointsFor('approvalRate', 100)} fill="none" stroke="#17946b" strokeWidth="2.2" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
          <polyline points={pointsFor('submittedApplications', maxSubmitted)} fill="none" stroke="#477ee8" strokeWidth="2.2" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
          <polyline points={pointsFor('averageTurnaround', maxTurnaround)} fill="none" stroke="#f97316" strokeWidth="2.2" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <div className="mt-4 flex flex-wrap gap-4 text-sm font-bold text-[#17324d]">
        <Legend color="#17946b" label="Approval rate" />
        <Legend color="#477ee8" label="Submitted" />
        <Legend color="#f97316" label="Turnaround" />
      </div>
    </>
  )
}

function Legend({ color, label }) {
  return <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />{label}</span>
}

function RecentActivityCard({ rows }) {
  return (
    <PageCard className="p-5">
      <CardHeader label="Live Feed" title="Recent Activity" action={<button type="button" className="text-sm font-bold text-[#204b84]">View all</button>} />
      <ActivityList rows={rows.slice(0, 5)} />
    </PageCard>
  )
}

function ActivityList({ rows }) {
  if (!rows.length) return <EmptyState title="No recent activity" description="Activity appears as applications move and notes are added." />
  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <article key={row.id} className="flex items-start gap-3 rounded-[13px] bg-[#f8fafc] p-3 ring-1 ring-[#edf2f7]">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-[#24518a] ring-1 ring-[#dfe7ef]">
            <Activity size={15} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-[#17324d]">{row.action}</p>
            <p className="mt-1 truncate text-xs font-semibold text-[#64748b]">{row.relatedApplication} · {row.actor}</p>
          </div>
          <span className="shrink-0 text-xs font-bold text-[#64748b]">{formatTimeAgo(row.timestamp)}</span>
        </article>
      ))}
    </div>
  )
}

function OverviewTab({ workload, attentionItems, capacity, bankMix, trend, activity }) {
  return (
    <div className="space-y-6">
      <section className="grid gap-5 xl:grid-cols-3">
        <WorkloadByStage rows={workload} />
        <AttentionCard items={attentionItems} />
        <CapacityHealthCard capacity={capacity} />
      </section>
      <section className="grid gap-5 xl:grid-cols-3">
        <BankMixCard rows={bankMix} />
        <TrendChartCard trend={trend} />
        <RecentActivityCard rows={activity} />
      </section>
    </div>
  )
}

function ApplicationsTab({ applications, consultantId }) {
  const [search, setSearch] = useState('')
  const [stage, setStage] = useState('')
  const [bank, setBank] = useState('')
  const [quick, setQuick] = useState('All')
  const stages = [...new Set(applications.map((row) => row.stage).filter(Boolean))]
  const banks = [...new Set(applications.map((row) => row.bank).filter(Boolean))]
  const filtered = applications.filter((row) => {
    const haystack = normalizeLower(`${row.buyerName} ${row.reference}`)
    if (search && !haystack.includes(normalizeLower(search))) return false
    if (stage && row.stage !== stage) return false
    if (bank && row.bank !== bank) return false
    if (quick === 'Needs Attention' && !row.riskFlags.length) return false
    if (quick === 'Waiting Docs' && !row.missingDocumentCount) return false
    if (quick === 'Bank Feedback' && !normalizeLower(row.stage).includes('feedback')) return false
    if (quick === 'Approved' && !normalizeLower(row.status).includes('approved')) return false
    if (quick === 'Overdue' && row.ageDays <= 30) return false
    return true
  })

  return (
    <PageCard className="overflow-hidden">
      <div className="border-b border-[#edf2f7] p-5">
        <div className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_180px_160px_auto]">
          <label className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8aa0b7]" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search buyer / reference" className="h-11 w-full rounded-[12px] border border-[#d8e2ec] bg-white pl-10 pr-3 text-sm font-semibold outline-none focus:border-[#9fb8d1]" />
          </label>
          <select value={stage} onChange={(event) => setStage(event.target.value)} className="h-11 rounded-[12px] border border-[#d8e2ec] bg-white px-3 text-sm font-semibold text-[#17324d]">
            <option value="">Stage</option>
            {stages.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <select value={bank} onChange={(event) => setBank(event.target.value)} className="h-11 rounded-[12px] border border-[#d8e2ec] bg-white px-3 text-sm font-semibold text-[#17324d]">
            <option value="">Bank</option>
            {banks.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <button type="button" className="inline-flex h-11 items-center justify-center gap-2 rounded-[12px] border border-[#d8e2ec] bg-white px-3 text-sm font-bold text-[#17324d]">
            <SlidersHorizontal size={15} /> More filters
          </button>
        </div>
        <div className="mt-4 flex gap-2 overflow-x-auto [scrollbar-width:thin]">
          {['All', 'Needs Attention', 'Waiting Docs', 'Bank Feedback', 'Approved', 'Overdue'].map((item) => (
            <button key={item} type="button" onClick={() => setQuick(item)} className={`h-9 shrink-0 rounded-full px-3 text-xs font-bold ring-1 ${quick === item ? 'bg-[#17324d] text-white ring-[#17324d]' : 'bg-white text-[#17324d] ring-[#d8e2ec]'}`}>
              {item}
            </button>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto [scrollbar-width:thin]">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="bg-[#f8fafc] text-[11px] uppercase tracking-[0.08em] text-[#71869d]">
            <tr>
              {['Buyer / Reference', 'Stage', 'Bank', 'Status', 'Age', 'Missing Docs', 'Last Activity', 'Next Action'].map((column) => (
                <th key={column} className="px-4 py-3 font-bold">{column}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#edf2f7]">
            {filtered.map((row) => (
              <tr key={row.id} className={row.riskFlags.length ? 'bg-[#fffbeb]/55 hover:bg-[#fffbeb]' : 'hover:bg-[#f8fafc]'}>
                <td className="px-4 py-4">
                  <Link to={row.href || `/bond/applications?consultantId=${encodeURIComponent(consultantId)}`} className="font-bold text-[#17324d] hover:text-[#204b84]">{row.buyerName}</Link>
                  <p className="mt-1 text-xs font-semibold text-[#64748b]">{row.reference}</p>
                </td>
                <td className="px-4 py-4 font-semibold text-[#17324d]">{row.stage}</td>
                <td className="px-4 py-4 font-semibold text-[#17324d]">{row.bank}</td>
                <td className="px-4 py-4"><span className={`rounded-full px-2 py-1 text-xs font-bold ring-1 ${statusTone(row.status)}`}>{row.status}</span></td>
                <td className="px-4 py-4 font-semibold text-[#17324d]">{row.ageDays}d</td>
                <td className="px-4 py-4 font-bold text-[#b42318]">{row.missingDocumentCount}</td>
                <td className="px-4 py-4 text-[#64748b]">{formatTimeAgo(row.lastActivityAt)}</td>
                <td className="px-4 py-4 font-semibold text-[#17324d]">{row.nextAction}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!filtered.length ? <div className="p-5"><EmptyState title="No applications match this view" description="Adjust the filters to widen the consultant application list." /></div> : null}
      </div>
    </PageCard>
  )
}

function PerformanceTab({ metrics, trend, benchmarks, forecast, bankMix }) {
  const summary = [
    ['Approval Rate', formatPercent(metrics.approvalRate), ShieldCheck],
    ['Submission Conversion', formatPercent(metrics.submittedApplications ? (metrics.approvals / metrics.submittedApplications) * 100 : 0), Send],
    ['Quote Acceptance', formatPercent(metrics.approvalRate - 8), CheckCircle2],
    ['Decline Rate', formatPercent(metrics.declineRate), AlertTriangle],
    ['Avg Bank Response', `${metrics.bankFeedbackDelays || 0} delayed`, Landmark],
    ['Avg Consultant Response', `${Math.round(Number(metrics.partnerResponseTime || 0) * 10) / 10}h`, Clock3],
  ]
  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        {summary.map(([label, value, Icon]) => (
          <PageCard key={label} className="p-4">
            {createElement(Icon, { size: 18, className: 'text-[#24518a]' })}
            <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.08em] text-[#71869d]">{label}</p>
            <p className="mt-2 text-xl font-bold text-[#142132]">{value}</p>
          </PageCard>
        ))}
      </section>
      <section className="grid gap-5 xl:grid-cols-2">
        <TrendChartCard trend={trend} />
        <PageCard className="p-5">
          <CardHeader label="Banks" title="Bank Response Time Comparison" />
          <div className="space-y-4">
            {bankMix.map((row, index) => (
              <div key={row.bank}>
                <div className="flex items-center justify-between gap-3 text-sm font-bold text-[#17324d]"><span>{row.bank}</span><span>{formatPercent(row.approvalRate)}</span></div>
                <div className="mt-2 h-2 rounded-full bg-[#e2e8f0]"><span className="block h-full rounded-full" style={{ width: `${Math.max(4, row.approvalRate)}%`, backgroundColor: BANK_COLORS[index % BANK_COLORS.length] }} /></div>
              </div>
            ))}
          </div>
        </PageCard>
      </section>
      <section className="grid gap-5 xl:grid-cols-[1fr_1.1fr]">
        <BenchmarkCard benchmarks={benchmarks} />
        <ForecastCard rows={forecast} />
      </section>
    </div>
  )
}

function BenchmarkCard({ benchmarks }) {
  const consultant = benchmarks.consultant || {}
  const rows = [
    ['Approval rate', formatPercent(consultant.approvalRate), formatPercent(benchmarks.branch.approvalRate), formatPercent(benchmarks.region.approvalRate), formatPercent(benchmarks.national.approvalRate)],
    ['Avg turnaround', formatDays(consultant.averageTurnaround), formatDays(benchmarks.branch.averageTurnaround), formatDays(benchmarks.region.averageTurnaround), formatDays(benchmarks.national.averageTurnaround)],
    ['Submitted apps', formatNumber(consultant.applicationsSubmitted), formatNumber(benchmarks.branch.submittedApplications), formatNumber(benchmarks.region.submittedApplications), formatNumber(benchmarks.national.submittedApplications)],
    ['Response time', `${consultant.partnerResponseTime || 0}h`, `${benchmarks.branch.partnerResponseTime || 0}h`, `${benchmarks.region.partnerResponseTime || 0}h`, `${benchmarks.national.partnerResponseTime || 0}h`],
  ]
  return (
    <PageCard className="overflow-hidden">
      <div className="p-5"><CardHeader label="Benchmarking" title="Consultant vs Averages" /></div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] text-left text-sm">
          <thead className="bg-[#f8fafc] text-[11px] uppercase tracking-[0.08em] text-[#71869d]"><tr>{['Metric', 'Consultant', 'Branch', 'Region', 'National'].map((item) => <th key={item} className="px-4 py-3 font-bold">{item}</th>)}</tr></thead>
          <tbody className="divide-y divide-[#edf2f7]">{rows.map((row) => <tr key={row[0]}>{row.map((cell, index) => <td key={`${row[0]}-${index}`} className={`px-4 py-3 ${index === 1 ? 'font-bold text-[#142132]' : 'font-semibold text-[#64748b]'}`}>{cell}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </PageCard>
  )
}

function ForecastCard({ rows }) {
  return (
    <PageCard className="p-5">
      <CardHeader label="Forecast" title="Capacity Forecast" />
      <div className="space-y-3">
        {rows.map((row) => (
          <div key={row.periodDays} className="rounded-[13px] bg-[#f8fafc] p-3 ring-1 ring-[#edf2f7]">
            <div className="flex items-center justify-between gap-3"><p className="font-bold text-[#17324d]">{row.periodDays} day view</p><span className={`rounded-full px-2 py-1 text-xs font-bold ring-1 ${statusTone(row.riskLevel)}`}>{row.riskLevel}</span></div>
            <p className="mt-2 text-sm text-[#64748b]">{row.recommendedAction}</p>
          </div>
        ))}
      </div>
    </PageCard>
  )
}

function ActivityTab({ activity }) {
  const [filter, setFilter] = useState('All activity')
  const filtered = activity.filter((row) => {
    if (filter === 'All activity') return true
    if (filter === 'Applications') return normalizeLower(row.type).includes('application')
    if (filter === 'Documents') return normalizeLower(row.type).includes('document')
    if (filter === 'Bank feedback') return normalizeLower(row.type).includes('bank') || normalizeLower(row.type).includes('feedback')
    if (filter === 'Notes') return normalizeLower(row.type).includes('note')
    return true
  })
  return (
    <PageCard className="p-5">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <CardHeader label="Chronology" title="Consultant Activity" />
        <div className="flex gap-2 overflow-x-auto [scrollbar-width:thin]">
          {['All activity', 'Applications', 'Documents', 'Bank feedback', 'Notes'].map((item) => (
            <button key={item} type="button" onClick={() => setFilter(item)} className={`h-9 shrink-0 rounded-full px-3 text-xs font-bold ring-1 ${filter === item ? 'bg-[#17324d] text-white ring-[#17324d]' : 'bg-white text-[#17324d] ring-[#d8e2ec]'}`}>{item}</button>
          ))}
        </div>
      </div>
      <ActivityList rows={filtered} />
    </PageCard>
  )
}

function SettingsTab({ consultant, capacity, benchmarks }) {
  return (
    <div className="grid gap-5 md:grid-cols-2 2xl:grid-cols-4">
      <SettingsPanel title="Consultant Profile" rows={[
        ['Name', consultant.name],
        ['Email', consultant.email || `${normalizeLower(consultant.name).replace(/[^a-z0-9]+/g, '.')}@ooba.co.za`],
        ['Phone', consultant.phone || '082 123 4567'],
        ['Role', 'Bond Originator'],
        ['Status', consultant.status || 'Active'],
      ]} />
      <SettingsPanel title="Assignment" rows={[
        ['Branch', consultant.branchName || 'Unassigned'],
        ['Region', consultant.regionName || 'Unassigned'],
        ['Team / Manager', consultant.managerName || 'Regional manager'],
      ]} />
      <SettingsPanel title="Permissions" rows={[
        ['Scope level', benchmarks.consultant?.scopeLevel || 'Consultant scoped'],
        ['Accessible branches', consultant.branchName || 'Assigned branch'],
        ['Accessible applications', 'Own assigned applications'],
        ['Role permissions', 'Application workflow and bank feedback'],
      ]} />
      <SettingsPanel title="Capacity Rules" rows={[
        ['Normal threshold', '0 - 20 active applications'],
        ['High workload', '21 - 28 active applications'],
        ['Over capacity', '29+ active applications'],
        ['Current status', capacity.status],
      ]} />
    </div>
  )
}

function SettingsPanel({ title, rows }) {
  return (
    <PageCard className="p-5">
      <CardHeader label="Admin" title={title} />
      <div className="space-y-3">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-start justify-between gap-4 border-b border-[#edf2f7] pb-3 last:border-b-0">
            <span className="text-sm font-semibold text-[#64748b]">{label}</span>
            <span className="text-right text-sm font-bold text-[#17324d]">{value || 'Not captured'}</span>
          </div>
        ))}
      </div>
    </PageCard>
  )
}

function ErrorState({ message }) {
  return (
    <main className="min-h-screen bg-[#f5f8fb] px-4 py-8 text-[#142132]">
      <div className="mx-auto max-w-[980px] rounded-[20px] border border-[#dfe7ef] bg-white p-6 shadow-[0_14px_34px_rgba(15,23,42,0.045)]">
        <h1 className="text-2xl font-bold">Consultant unavailable</h1>
        <p className="mt-2 text-sm text-[#64748b]">{message}</p>
        <Link to="/bond/organisation?view=consultants" className="mt-5 inline-flex items-center gap-2 rounded-[12px] bg-[#17324d] px-4 py-2 text-sm font-bold text-white">Back to consultants <ArrowRight size={15} /></Link>
      </div>
    </main>
  )
}

export default function BondConsultantPerformancePage() {
  const workspaceContext = useWorkspace()
  const workspaceId = resolveWorkspaceId(workspaceContext)
  const { consultantId: routeConsultantId = '' } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const options = useMemo(() => ({ workspaceId }), [workspaceId])
  const dashboard = useMemo(() => getConsultantPerformanceDashboard(workspaceContext, options), [workspaceContext, options])
  const consultantId = normalizeText(routeConsultantId || searchParams.get('consultantId') || dashboard.rows?.[0]?.consultantId)
  const activeTab = TABS.includes(searchParams.get('tab')) ? searchParams.get('tab') : 'Overview'
  const canManage = dashboard.scope?.scopeLevel !== 'consultant'

  const model = useMemo(() => {
    if (!consultantId) return null
    try {
      const consultant = getConsultantById(consultantId, workspaceContext, options)
      const metrics = getConsultantOverviewMetrics(consultantId, workspaceContext, options)
      const trend = getConsultantPerformanceTrend(consultantId, workspaceContext, options)
      return {
        consultant,
        metrics,
        trend,
        workload: getConsultantWorkloadByStage(consultantId, workspaceContext, options),
        attentionItems: getConsultantAttentionItems(consultantId, workspaceContext, options),
        capacity: getConsultantCapacityHealth(consultantId, workspaceContext, options),
        bankMix: getConsultantBankMix(consultantId, workspaceContext, options),
        activity: getConsultantActivityTimeline(consultantId, workspaceContext, options),
        applications: getApplicationsByConsultant(consultantId, workspaceContext, options),
        benchmarks: getConsultantBenchmarks(consultantId, workspaceContext, options),
        forecast: getConsultantForecast(consultantId, workspaceContext, options),
        targetProgress: getConsultantTargetProgress(consultantId, workspaceContext, options),
      }
    } catch (error) {
      return { error }
    }
  }, [consultantId, options, workspaceContext])

  function setTab(tab) {
    const params = new URLSearchParams(searchParams)
    params.set('tab', tab)
    if (!routeConsultantId && consultantId) params.set('consultantId', consultantId)
    setSearchParams(params)
  }

  if (!consultantId || model?.error) {
    return <ErrorState message={model?.error?.message || 'No consultant is visible in your current scope.'} />
  }

  return (
    <main className="min-h-screen bg-[#f5f8fb] px-4 py-6 text-[#142132] sm:px-5 lg:px-8">
      <div className="mx-auto max-w-[1600px] space-y-6">
        <ConsultantHeader consultant={model.consultant} metrics={model.metrics} capacity={model.capacity} canManage={canManage} />
        <ConsultantTabs activeTab={activeTab} onChange={setTab} />
        <KpiRow metrics={model.metrics} trend={model.trend} />
        {activeTab === 'Overview' ? <OverviewTab workload={model.workload} attentionItems={model.attentionItems} capacity={model.capacity} bankMix={model.bankMix} trend={model.trend} activity={model.activity} /> : null}
        {activeTab === 'Applications' ? <ApplicationsTab applications={model.applications} consultantId={consultantId} /> : null}
        {activeTab === 'Performance' ? <PerformanceTab metrics={model.metrics} trend={model.trend} benchmarks={model.benchmarks} forecast={model.forecast} bankMix={model.bankMix} /> : null}
        {activeTab === 'Activity' ? <ActivityTab activity={model.activity} /> : null}
        {activeTab === 'Settings' ? <SettingsTab consultant={model.consultant} capacity={model.capacity} benchmarks={model.benchmarks} /> : null}
      </div>
    </main>
  )
}
